/**
 * Demo Environment Reset Service
 *
 * Deletes all org-scoped data for the demo org and re-inserts from the snapshot.
 * Runs hourly via cron. All operations are scoped by organization_id.
 */

import * as Sentry from '@sentry/cloudflare';
import { DEMO_ORG_ID, SNAPSHOT } from '../data/demoSnapshot.js';
import { processBadgesForOrg } from '../utils/badgeEngine.js';

const BATCH_LIMIT = 100;

// Retries for a failing batch before giving up on it. The failure mode this
// exists for is a transient D1 wobble, which is exactly when the old code was
// at its worst: one failed batch dropped the WHOLE table into row-by-row mode,
// turning 25 round-trips into 2,411 sequential primary writes at the precise
// moment D1 was least able to serve them.
const CHUNK_RETRIES = 2;

// Give up entirely after this many individual row failures. A handful of bad
// rows is worth working around; hundreds means the database is unhealthy or the
// snapshot no longer matches the schema, and hammering it row by row helps
// nobody.
const MAX_ROW_FALLBACK_FAILURES = 25;

// KV keys for the change-detection fingerprint.
const FINGERPRINT_KEY = 'demo:reset:fingerprint';
const LAST_RESET_KEY = 'demo:reset:last-at';

// Force a reset if one hasn't happened in this long, regardless of the
// fingerprint. Belt-and-braces for anything the fingerprint can't see, so the
// demo always self-heals within a few hours even if the detection is wrong.
const MAX_RESET_AGE_MS = 6 * 60 * 60 * 1000;

// Tables to delete in FK-safe order (children before parents)
const DELETE_TABLES = [
  {
    table: 'support_ticket_notes',
    where: `ticket_id IN (SELECT id FROM support_tickets WHERE organization_id = '${DEMO_ORG_ID}')`,
  },
  { table: 'support_tickets', where: `organization_id = '${DEMO_ORG_ID}'` },
  {
    table: 'student_badges',
    where: `organization_id = '${DEMO_ORG_ID}'`,
  },
  {
    table: 'student_reading_stats',
    where: `organization_id = '${DEMO_ORG_ID}'`,
  },
  {
    table: 'reading_sessions',
    where: `student_id IN (SELECT id FROM students WHERE organization_id = '${DEMO_ORG_ID}')`,
  },
  {
    table: 'student_preferences',
    where: `student_id IN (SELECT id FROM students WHERE organization_id = '${DEMO_ORG_ID}')`,
  },
  {
    table: 'parent_access_tokens',
    where: `organization_id = '${DEMO_ORG_ID}'`,
  },
  {
    table: 'class_assignments',
    where: `class_id IN (SELECT id FROM classes WHERE organization_id = '${DEMO_ORG_ID}')`,
  },
  {
    table: 'class_goals',
    where: `class_id IN (SELECT id FROM classes WHERE organization_id = '${DEMO_ORG_ID}')`,
  },
  { table: 'students', where: `organization_id = '${DEMO_ORG_ID}'` },
  { table: 'classes', where: `organization_id = '${DEMO_ORG_ID}'` },
  { table: 'org_book_selections', where: `organization_id = '${DEMO_ORG_ID}'` },
  { table: 'org_settings', where: `organization_id = '${DEMO_ORG_ID}'` },
  { table: 'term_dates', where: `organization_id = '${DEMO_ORG_ID}'` },
  {
    table: 'refresh_tokens',
    where: `user_id IN (SELECT id FROM users WHERE organization_id = '${DEMO_ORG_ID}' AND auth_provider = 'demo')`,
  },
  {
    table: 'password_reset_tokens',
    where: `user_id IN (SELECT id FROM users WHERE organization_id = '${DEMO_ORG_ID}' AND auth_provider = 'demo')`,
  },
  {
    table: 'user_tour_completions',
    where: `user_id IN (SELECT id FROM users WHERE organization_id = '${DEMO_ORG_ID}')`,
  },
  {
    table: 'users',
    where: `organization_id = '${DEMO_ORG_ID}' AND auth_provider = 'demo'`,
  },
  { table: 'audit_log', where: `organization_id = '${DEMO_ORG_ID}'` },
  {
    table: 'rate_limits',
    where: `key IN (SELECT id FROM users WHERE organization_id = '${DEMO_ORG_ID}')`,
  },
  {
    table: 'login_attempts',
    where: `email IN (SELECT email FROM users WHERE organization_id = '${DEMO_ORG_ID}')`,
  },
];

// Tables to insert in FK-safe order (parents before children)
const INSERT_ORDER = [
  'users',
  'classes',
  'students',
  'class_assignments',
  'reading_sessions',
  'student_preferences',
  'org_book_selections',
  'org_settings',
  'term_dates',
  'user_tour_completions',
  'support_tickets',
  'support_ticket_notes',
];

/**
 * Build an INSERT statement for a single row.
 */
function buildInsert(db, table, row) {
  const keys = Object.keys(row);
  const placeholders = keys.map(() => '?').join(', ');
  const sql = `INSERT OR IGNORE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
  return db.prepare(sql).bind(...keys.map((k) => row[k]));
}

/**
 * Execute statements in batches of BATCH_LIMIT.
 */
async function batchExec(db, statements, label) {
  let rowFallbackFailures = 0;

  for (let i = 0; i < statements.length; i += BATCH_LIMIT) {
    const chunk = statements.slice(i, i + BATCH_LIMIT);

    let succeeded = false;
    let lastError;
    for (let attempt = 0; attempt <= CHUNK_RETRIES; attempt++) {
      try {
        await db.batch(chunk);
        succeeded = true;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < CHUNK_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
        }
      }
    }
    if (succeeded) continue;

    // Retries exhausted. Fall back row-by-row for THIS CHUNK ONLY — never the
    // whole table. Surfaced to Sentry rather than console alone: the previous
    // version logged this and nothing else, so when it mattered there was no
    // record either way of whether the amplifier had fired.
    console.error(
      `[DemoReset] batch ${label} [${i}..${i + chunk.length}] failed after ${CHUNK_RETRIES + 1} attempts:`,
      lastError?.message
    );
    Sentry.captureMessage(`Demo reset batch fell back to row-by-row: ${label}`, {
      level: 'warning',
      tags: { cron: 'demo-environment-reset', demoResetFallback: label },
      extra: { offset: i, chunkSize: chunk.length, error: lastError?.message },
    });

    for (const statement of chunk) {
      try {
        await statement.run();
      } catch (rowErr) {
        rowFallbackFailures++;
        if (rowFallbackFailures === 1) {
          console.error(`[DemoReset] ${label} row error: ${rowErr.message}`);
        }
        if (rowFallbackFailures > MAX_ROW_FALLBACK_FAILURES) {
          throw new Error(
            `[DemoReset] ${label}: abandoned after ${rowFallbackFailures} row failures (last: ${rowErr.message})`
          );
        }
      }
    }
  }
}

/**
 * One round-trip summary of everything a demo visitor can change.
 *
 * Deliberately NOT a plain row count: a teacher can set
 * org_book_selections.reading_level_override (src/routes/books.js) without
 * changing any count at all, which would freeze the demo library permanently
 * behind a COUNT(*) guard. The MAX(updated_at) terms catch in-place edits.
 *
 * students.updated_at is included even though the 02:00 streak cron churns it —
 * that just guarantees one reset a day, which is a fine price for catching
 * every student-level edit.
 */
async function computeFingerprint(db) {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM students WHERE organization_id = ?1) AS students,
         (SELECT COALESCE(MAX(updated_at), '') FROM students WHERE organization_id = ?1) AS students_upd,
         (SELECT COUNT(*) FROM classes WHERE organization_id = ?1) AS classes,
         (SELECT COUNT(*) FROM reading_sessions WHERE student_id IN
            (SELECT id FROM students WHERE organization_id = ?1)) AS sessions,
         (SELECT COUNT(*) FROM student_preferences WHERE student_id IN
            (SELECT id FROM students WHERE organization_id = ?1)) AS prefs,
         (SELECT COUNT(*) FROM org_book_selections WHERE organization_id = ?1) AS obs,
         (SELECT COALESCE(MAX(updated_at), '') FROM org_book_selections WHERE organization_id = ?1) AS obs_upd,
         (SELECT COUNT(*) FROM org_settings WHERE organization_id = ?1) AS settings,
         (SELECT COUNT(*) FROM audit_log WHERE organization_id = ?1) AS audits,
         (SELECT COUNT(*) FROM support_tickets WHERE organization_id = ?1) AS tickets,
         (SELECT COUNT(*) FROM parent_access_tokens WHERE organization_id = ?1) AS parent_tokens,
         (SELECT COUNT(*) FROM user_tour_completions WHERE user_id IN
            (SELECT id FROM users WHERE organization_id = ?1)) AS tours`
    )
    .bind(DEMO_ORG_ID)
    .first();

  return JSON.stringify(row || {});
}

/**
 * Reset all demo org data: delete everything, re-insert from snapshot.
 *
 * @param {object} db  D1 binding
 * @param {object} [kv]  KV binding. When supplied, the reset is skipped on
 *   hours where nothing about the demo org changed. Omit it (as the tests do)
 *   and every call resets unconditionally, which is the old behaviour.
 */
export async function resetDemoData(db, kv = null) {
  // Change detection. This job used to delete and re-insert all 2,791 snapshot
  // rows every hour forever — ~67k row-writes a day, on data byte-identical to
  // what was already there, for an org nobody may have opened. That was the
  // single largest recurring writer in the system, on the same D1 primary the
  // real schools use.
  if (kv) {
    try {
      const [fingerprint, previous, lastResetAt] = await Promise.all([
        computeFingerprint(db),
        kv.get(FINGERPRINT_KEY),
        kv.get(LAST_RESET_KEY),
      ]);
      const age = lastResetAt ? Date.now() - Number(lastResetAt) : Infinity;

      if (previous && fingerprint === previous && age < MAX_RESET_AGE_MS) {
        console.log(
          `[DemoReset] Skipped — demo org unchanged, last reset ${Math.round(age / 60000)}m ago`
        );
        return { skipped: true };
      }
      console.log(
        previous && fingerprint === previous
          ? '[DemoReset] Forcing reset — max age reached'
          : '[DemoReset] Demo org changed since last reset'
      );
    } catch (error) {
      // Detection is an optimisation; failing it must never mean the demo stops
      // being restored. Fall through to a full reset, but say so — a silent
      // fallback here would look identical to the feature working.
      console.warn(`[DemoReset] Change detection failed, resetting anyway: ${error.message}`);
    }
  }

  console.log('[DemoReset] Starting reset...');

  // Phase 1: Delete all demo org data in FK-safe batched groups.
  // Each group contains tables that are independent of each other
  // but must complete before the next group's tables can be deleted.
  const DELETE_GROUPS = [
    ['support_ticket_notes'],
    ['support_tickets', 'student_badges', 'student_reading_stats'],
    [
      'reading_sessions',
      'student_preferences',
      'parent_access_tokens',
      'class_assignments',
      'class_goals',
      'org_book_selections',
      'org_settings',
      'term_dates',
      'audit_log',
    ],
    ['students', 'classes'],
    [
      'refresh_tokens',
      'password_reset_tokens',
      'user_tour_completions',
      'rate_limits',
      'login_attempts',
    ],
    ['users'],
  ];
  const deleteByTable = Object.fromEntries(DELETE_TABLES.map((d) => [d.table, d.where]));

  for (const group of DELETE_GROUPS) {
    const stmts = group
      .filter((t) => deleteByTable[t])
      .map((t) => db.prepare(`DELETE FROM ${t} WHERE ${deleteByTable[t]}`));
    if (stmts.length === 0) continue;
    try {
      await db.batch(stmts);
    } catch (groupError) {
      // Fallback: run individually so a missing table doesn't block others.
      // The group error itself is logged, not discarded — a bare `catch {}`
      // here meant a D1 outage and a genuinely broken DELETE looked identical.
      console.warn(
        `[DemoReset] delete group [${group.join(', ')}] batch failed, retrying individually:`,
        groupError?.message
      );
      for (const t of group) {
        if (!deleteByTable[t]) continue;
        try {
          await db.prepare(`DELETE FROM ${t} WHERE ${deleteByTable[t]}`).run();
        } catch (error) {
          console.warn(`[DemoReset] delete ${t} skipped: ${error.message}`);
        }
      }
    }
  }
  console.log('[DemoReset] Deletes complete');

  // Phase 2: Insert snapshot data in FK-safe order, batched per table
  for (const table of INSERT_ORDER) {
    const rows = SNAPSHOT[table] || [];
    if (rows.length === 0) continue;

    const statements = rows.map((row) => buildInsert(db, table, row));
    // No whole-table fallback here any more: batchExec retries the failing
    // chunk, then falls back row-by-row for that chunk alone and gives up after
    // MAX_ROW_FALLBACK_FAILURES. Anything it throws is a real failure and must
    // propagate so the Sentry monitor goes red — grinding 2,411 sequential
    // writes at a struggling primary is what made this worse, not better.
    await batchExec(db, statements, table);
    console.log(`[DemoReset] ${table}: ${rows.length} rows inserted`);
  }

  // Phase 3: Evaluate badges for all demo students with reading sessions.
  // processBadgesForOrg is the same batched path the nightly cron uses —
  // genre map hoisted once, per-student reads batched (the previous loop ran
  // three legacy per-student functions = ~360 sequential queries per hour).
  //
  // The 5th argument (watermark) is deliberately NOT passed. Snapshot sessions
  // carry fixed 2026-03/04 created_at values, so any watermark at all makes the
  // "students with sessions since last run" filter match zero students and the
  // demo school shows no badges whatsoever.
  try {
    const res = await processBadgesForOrg(db, DEMO_ORG_ID, null, Date.now() + 25000);
    console.log(
      `[DemoReset] Badges: ${res.newBadgeCount} awarded across ${res.processedCount} students`
    );
  } catch (error) {
    console.warn(`[DemoReset] Badge evaluation skipped: ${error.message}`);
  }

  // Record the post-reset state so the next hour can tell "nobody touched it"
  // from "someone did". Written last and only on success — a half-finished
  // reset must not be remembered as the clean baseline, or the next run would
  // skip and leave the demo broken.
  if (kv) {
    try {
      const fingerprint = await computeFingerprint(db);
      await Promise.all([
        kv.put(FINGERPRINT_KEY, fingerprint),
        kv.put(LAST_RESET_KEY, String(Date.now())),
      ]);
    } catch (error) {
      // Not fatal: the worst case is resetting again next hour, i.e. exactly
      // the old behaviour.
      console.warn(`[DemoReset] Could not store fingerprint: ${error.message}`);
    }
  }

  console.log('[DemoReset] Reset complete');
  return { skipped: false };
}
