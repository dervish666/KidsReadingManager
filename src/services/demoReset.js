/**
 * Demo Environment Reset Service
 *
 * Deletes all org-scoped data for the demo org and re-inserts from the snapshot.
 * Runs hourly via cron. All operations are scoped by organization_id.
 */

import { DEMO_ORG_ID, SNAPSHOT } from '../data/demoSnapshot.js';

const BATCH_LIMIT = 100;

// Tables to delete in FK-safe order (children before parents)
const DELETE_TABLES = [
  {
    table: 'support_ticket_notes',
    where: `ticket_id IN (SELECT id FROM support_tickets WHERE organization_id = '${DEMO_ORG_ID}')`,
  },
  { table: 'support_tickets', where: `organization_id = '${DEMO_ORG_ID}'` },
  {
    table: 'reading_sessions',
    where: `student_id IN (SELECT id FROM students WHERE organization_id = '${DEMO_ORG_ID}')`,
  },
  {
    table: 'student_preferences',
    where: `student_id IN (SELECT id FROM students WHERE organization_id = '${DEMO_ORG_ID}')`,
  },
  {
    table: 'class_assignments',
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
  'students',
  'classes',
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
      console.error(`[DemoReset] batch ${label} [${i}..${i + chunk.length}] failed:`, error.message);
      throw error;
    }
  }
}

/**
 * Reset all demo org data: delete everything, re-insert from snapshot.
 */
export async function resetDemoData(db) {
  console.log('[DemoReset] Starting reset...');

  // Phase 1: Delete all demo org data — run each delete individually
  // so a missing table doesn't abort the entire process
  for (const { table, where } of DELETE_TABLES) {
    try {
      await db.prepare(`DELETE FROM ${table} WHERE ${where}`).run();
    } catch (error) {
      console.warn(`[DemoReset] delete ${table} skipped: ${error.message}`);
    }
  }
  console.log('[DemoReset] Deletes complete');

  // Phase 2: Insert snapshot data in FK-safe order, batched
  for (const table of INSERT_ORDER) {
    const rows = SNAPSHOT[table] || [];
    if (rows.length === 0) continue;

    const statements = rows.map((row) => buildInsert(db, table, row));
    try {
      await batchExec(db, statements, table);
      console.log(`[DemoReset] Inserted ${rows.length} rows into ${table}`);
    } catch (error) {
      console.error(`[DemoReset] Insert into ${table} failed: ${error.message}`);
      // Continue with other tables rather than aborting entirely
    }
  }

  console.log('[DemoReset] Reset complete');
}
