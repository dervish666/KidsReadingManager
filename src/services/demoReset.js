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
  // Written by GET /api/books/ai-suggestions, which a demo visitor can reach —
  // the demo org has ai_addon_active = 1. The FK to students has no ON DELETE
  // CASCADE (migrations/0068), so without this the students DELETE below fails
  // the moment anybody asks the demo for a recommendation, and every later
  // reset silently leaves the previous visitor's demo in place.
  { table: 'student_recommendations', where: `organization_id = '${DEMO_ORG_ID}'` },
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
 * Snapshot columns pointing at GLOBAL tables the demo org does not own.
 *
 * `books` and `genres` are shared across every school. An owner deleting a
 * book, an import dedup merging two, or a genre being retired all remove rows
 * the snapshot still names, and the FK then fails on EVERY reset from then on —
 * seven org_book_selections rows and ten student_preferences rows had been
 * failing that way since the April export, unnoticed until the reset started
 * reporting its fallbacks.
 *
 * Hand-pruning the generated snapshot fixes the rows that are missing today and
 * nothing else. Instead the reset reads the current id set for each referenced
 * table and skips snapshot rows whose target has gone. A row whose book is
 * restored to the catalogue comes back on the next reset, with no snapshot edit.
 */
const EXTERNAL_REFS = {
  reading_sessions: [{ column: 'book_id', table: 'books' }],
  student_preferences: [{ column: 'genre_id', table: 'genres' }],
  org_book_selections: [{ column: 'book_id', table: 'books' }],
};

/**
 * Read the id set of every globally-owned table the snapshot references.
 *
 * Deliberately fail-open: a table we could not read is left OUT of the map, and
 * the filter below then keeps every row referencing it. Failing closed would
 * turn one unreadable query into a demo with an empty library — far worse than
 * the FK errors this exists to prevent.
 */
async function loadReferencedIds(db, tables) {
  const byTable = new Map();
  for (const table of tables) {
    try {
      const rows = await db.prepare(`SELECT id FROM ${table}`).all();
      byTable.set(table, new Set((rows.results || []).map((r) => r.id)));
    } catch (error) {
      console.warn(
        `[DemoReset] Could not read ${table} ids, inserting snapshot rows unfiltered: ${error.message}`
      );
    }
  }
  return byTable;
}

/**
 * Drop snapshot rows whose global FK target no longer exists.
 *
 * @returns {{rows: Array, skipped: number}}
 */
function filterLiveRefs(table, rows, idsByTable) {
  const refs = EXTERNAL_REFS[table];
  if (!refs) return { rows, skipped: 0 };

  let skipped = 0;
  const kept = rows.filter((row) =>
    refs.every((ref) => {
      const value = row[ref.column];
      // A nullable FK holding NULL references nothing, and a table we failed to
      // read is not evidence the row is dead — keep both.
      if (value == null) return true;
      const live = idsByTable.get(ref.table);
      if (!live) return true;
      if (live.has(value)) return true;
      skipped++;
      return false;
    })
  );

  return { rows: kept, skipped };
}

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
 * A constraint violation is the database telling us the statement is wrong, not
 * that it was busy. D1 surfaces it in the message rather than a typed code.
 */
function isConstraintError(error) {
  return /SQLITE_CONSTRAINT|constraint failed/i.test(error?.message || '');
}

/**
 * Execute statements in batches of BATCH_LIMIT.
 *
 * @returns {Promise<number>} rows that failed even individually. The caller
 *   reports the real inserted count from it — logging the intended count is how
 *   `org_book_selections: 2411 rows inserted` came to be printed on a reset that
 *   actually landed 2,404.
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
        // Retries are for transient D1 failures. A constraint violation is
        // deterministic: the same statement will fail identically in 250ms, in
        // 500ms and in 1s. Retrying one cost ~1.75s of the cron's budget per
        // failing chunk and produced six identical failures a reset.
        if (isConstraintError(error)) break;
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

  return rowFallbackFailures;
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
      'student_recommendations',
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

  // Anything that went wrong badly enough that the resulting state is NOT a
  // clean demo. Distinct from `skippedRows` below, which is expected drift.
  let failures = 0;

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
          // Counted, not just logged: rows that survive a failed DELETE are not
          // overwritten by Phase 2 (buildInsert is INSERT OR IGNORE), so a
          // visitor's edit persists. That state must not be fingerprinted as
          // clean — see the fingerprint gate at the end of this function.
          failures++;
          console.warn(`[DemoReset] delete ${t} skipped: ${error.message}`);
        }
      }
    }
  }
  console.log('[DemoReset] Deletes complete');

  // Phase 2: Insert snapshot data in FK-safe order, batched per table.
  //
  // Read the referenced global id sets once for the whole reset rather than per
  // table: `books` is named by both reading_sessions and org_book_selections.
  const referencedTables = [
    ...new Set(Object.values(EXTERNAL_REFS).flatMap((refs) => refs.map((r) => r.table))),
  ];
  const referencedIds = await loadReferencedIds(db, referencedTables);

  let skippedRows = 0;
  for (const table of INSERT_ORDER) {
    const snapshotRows = SNAPSHOT[table] || [];
    if (snapshotRows.length === 0) continue;

    const { rows, skipped } = filterLiveRefs(table, snapshotRows, referencedIds);
    if (skipped > 0) {
      skippedRows += skipped;
      const targets = EXTERNAL_REFS[table].map((r) => r.table).join('/');
      console.warn(
        `[DemoReset] ${table}: skipped ${skipped} of ${snapshotRows.length} snapshot rows — their ${targets} row is no longer in the catalogue`
      );
    }
    if (rows.length === 0) continue;

    const statements = rows.map((row) => buildInsert(db, table, row));
    // No whole-table fallback here any more: batchExec retries the failing
    // chunk, then falls back row-by-row for that chunk alone and gives up after
    // MAX_ROW_FALLBACK_FAILURES. Anything it throws is a real failure and must
    // propagate so the Sentry monitor goes red — grinding 2,411 sequential
    // writes at a struggling primary is what made this worse, not better.
    const rowFailures = await batchExec(db, statements, table);
    failures += rowFailures;
    console.log(
      `[DemoReset] ${table}: ${rows.length - rowFailures} of ${snapshotRows.length} snapshot rows inserted` +
        (skipped > 0 ? ` (${skipped} skipped)` : '') +
        (rowFailures > 0 ? ` (${rowFailures} FAILED)` : '')
    );
  }
  if (skippedRows > 0) {
    console.warn(
      `[DemoReset] ${skippedRows} snapshot rows reference catalogue entries that no longer exist. Re-export the snapshot to tidy it up: node scripts/export-demo-snapshot.js`
    );
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
    // student_badges and student_reading_stats were deleted in Phase 1 and are
    // not in SNAPSHOT, so a failure here leaves the demo with no badges at all.
    failures++;
    console.warn(`[DemoReset] Badge evaluation skipped: ${error.message}`);
  }

  // Record the post-reset state so the next hour can tell "nobody touched it"
  // from "someone did". Written last and ONLY when the reset actually produced
  // a clean demo: the delete fallback, the row-by-row insert fallback and the
  // badge pass all swallow their errors to keep going, and every one of them
  // leaves a state computeFingerprint cannot see (it reads neither
  // student_badges nor class_goals, and reads students/org_book_selections from
  // whatever survived). Fingerprinting that state made it the new baseline, so
  // the next hour skipped and the damage persisted to the 6-hour floor —
  // whereas before the fingerprint existed at all, the next hourly reset healed
  // it. Leaving the key untouched means the next run resets again, which is
  // exactly the old self-healing behaviour.
  //
  // `skippedRows` deliberately does NOT block this. A snapshot row whose book
  // has left the catalogue is stable, expected drift: it will be skipped
  // identically next hour, so the demo IS clean and blocking here would just
  // restore the hourly rebuild it took this whole change to remove.
  if (failures > 0) {
    console.warn(
      `[DemoReset] ${failures} step(s) failed — not fingerprinting this state; the next run will reset again`
    );
    Sentry.captureMessage('Demo reset completed with failures — state not fingerprinted', {
      level: 'warning',
      tags: { cron: 'demo-environment-reset' },
      extra: { failures, skippedRows },
    });
  }

  if (kv && failures === 0) {
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

  console.log(
    `[DemoReset] Reset complete (${failures} failure(s), ${skippedRows} row(s) skipped as stale)`
  );
  return { skipped: false, failures, skippedRows };
}
