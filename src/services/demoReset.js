/**
 * Demo Environment Reset Service
 *
 * Deletes all org-scoped data for the demo org and re-inserts from the snapshot.
 * Runs hourly via cron. All operations are scoped by organization_id.
 */

import { DEMO_ORG_ID, SNAPSHOT } from '../data/demoSnapshot.js';
import { processBadgesForOrg } from '../utils/badgeEngine.js';

const BATCH_LIMIT = 100;

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
  for (let i = 0; i < statements.length; i += BATCH_LIMIT) {
    const chunk = statements.slice(i, i + BATCH_LIMIT);
    try {
      await db.batch(chunk);
    } catch (error) {
      console.error(
        `[DemoReset] batch ${label} [${i}..${i + chunk.length}] failed:`,
        error.message
      );
      throw error;
    }
  }
}

/**
 * Reset all demo org data: delete everything, re-insert from snapshot.
 */
export async function resetDemoData(db) {
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
    } catch {
      // Fallback: run individually so a missing table doesn't block others
      for (const t of group) {
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
    try {
      await batchExec(db, statements, table);
      console.log(`[DemoReset] ${table}: ${rows.length} rows inserted`);
    } catch (error) {
      // Batch failed — try row-by-row to identify the problem
      console.error(`[DemoReset] ${table} batch failed: ${error.message}`);
      let inserted = 0;
      for (const row of rows) {
        try {
          await buildInsert(db, table, row).run();
          inserted++;
        } catch (rowErr) {
          if (inserted === 0) {
            console.error(`[DemoReset] ${table} row error: ${rowErr.message}`);
          }
        }
      }
      console.log(`[DemoReset] ${table}: ${inserted}/${rows.length} rows via fallback`);
    }
  }

  // Phase 3: Evaluate badges for all demo students with reading sessions.
  // processBadgesForOrg is the same batched path the nightly cron uses —
  // genre map hoisted once, per-student reads batched (the previous loop ran
  // three legacy per-student functions = ~360 sequential queries per hour).
  try {
    const res = await processBadgesForOrg(db, DEMO_ORG_ID, null, Date.now() + 25000);
    console.log(
      `[DemoReset] Badges: ${res.newBadgeCount} awarded across ${res.processedCount} students`
    );
  } catch (error) {
    console.warn(`[DemoReset] Badge evaluation skipped: ${error.message}`);
  }

  console.log('[DemoReset] Reset complete');
}
