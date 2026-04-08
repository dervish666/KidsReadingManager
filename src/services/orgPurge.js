/**
 * Organization Hard Delete (Data Retention Purge)
 *
 * Cascade-deletes all org-scoped data across 26 tables in FK-safe order,
 * then anonymises the organizations row as a tombstone.
 *
 * Used by: nightly cron (automated, 90 days after deactivation)
 *          DELETE /api/organization/:id/purge (manual Article 17 requests)
 */

import { createError } from '../middleware/errorHandler.js';

// FK-safe delete order: children before parents.
const DELETE_ORDER = [
  {
    table: 'support_ticket_notes',
    where: `ticket_id IN (SELECT id FROM support_tickets WHERE organization_id = ?)`,
  },
  { table: 'support_tickets', where: `organization_id = ?` },
  { table: 'student_badges', where: `organization_id = ?` },
  { table: 'student_reading_stats', where: `organization_id = ?` },
  {
    table: 'reading_sessions',
    where: `student_id IN (SELECT id FROM students WHERE organization_id = ?)`,
  },
  {
    table: 'student_preferences',
    where: `student_id IN (SELECT id FROM students WHERE organization_id = ?)`,
  },
  {
    table: 'class_assignments',
    where: `class_id IN (SELECT id FROM classes WHERE organization_id = ?)`,
  },
  {
    table: 'class_goals',
    where: `class_id IN (SELECT id FROM classes WHERE organization_id = ?)`,
  },
  { table: 'students', where: `organization_id = ?` },
  { table: 'classes', where: `organization_id = ?` },
  { table: 'org_book_selections', where: `organization_id = ?` },
  { table: 'org_settings', where: `organization_id = ?` },
  { table: 'org_ai_config', where: `organization_id = ?` },
  { table: 'term_dates', where: `organization_id = ?` },
  { table: 'billing_events', where: `organization_id = ?` },
  { table: 'metadata_jobs', where: `organization_id = ?` },
  { table: 'wonde_sync_log', where: `organization_id = ?` },
  { table: 'wonde_employee_classes', where: `organization_id = ?` },
  { table: 'wonde_erased_students', where: `organization_id = ?` },
  // data_rights_log handled separately (excludes purge log entry)
  { table: 'refresh_tokens', where: `user_id IN (SELECT id FROM users WHERE organization_id = ?)` },
  {
    table: 'password_reset_tokens',
    where: `user_id IN (SELECT id FROM users WHERE organization_id = ?)`,
  },
  {
    table: 'user_tour_completions',
    where: `user_id IN (SELECT id FROM users WHERE organization_id = ?)`,
  },
  {
    table: 'login_attempts',
    where: `email IN (SELECT email FROM users WHERE organization_id = ?)`,
  },
  { table: 'rate_limits', where: `key IN (SELECT id FROM users WHERE organization_id = ?)` },
  { table: 'audit_log', where: `organization_id = ?` },
  { table: 'users', where: `organization_id = ?` },
];

export async function hardDeleteOrganization(db, orgId) {
  // 1. Load and validate
  const org = await db
    .prepare('SELECT id, name, legal_hold, purged_at FROM organizations WHERE id = ?')
    .bind(orgId)
    .first();

  if (!org) throw createError('Organization not found', 404);
  if (org.legal_hold)
    throw createError('Organisation is under legal hold and cannot be purged', 409);
  if (org.purged_at) throw createError('Organisation has already been purged', 409);

  // 2. Log purge action before deletes
  const purgeLogId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, status, completed_at, notes)
       VALUES (?, ?, 'erasure', 'organization', ?, 'completed', datetime('now'), 'Full organization data purge')`
    )
    .bind(purgeLogId, orgId, orgId)
    .run();

  // 3. Delete all org-scoped data in FK-safe order
  const errors = [];
  let tablesProcessed = 0;

  for (const { table, where } of DELETE_ORDER) {
    try {
      await db.prepare(`DELETE FROM ${table} WHERE ${where}`).bind(orgId).run();
      tablesProcessed++;
    } catch (error) {
      console.error(`[OrgPurge] ${table} failed: ${error.message}`);
      errors.push(`${table}: ${error.message}`);
    }
  }

  // 4. Delete old data_rights_log entries, excluding purge entry
  try {
    await db
      .prepare('DELETE FROM data_rights_log WHERE organization_id = ? AND id != ?')
      .bind(orgId, purgeLogId)
      .run();
    tablesProcessed++;
  } catch (error) {
    console.error(`[OrgPurge] data_rights_log failed: ${error.message}`);
    errors.push(`data_rights_log: ${error.message}`);
  }

  // 5. Anonymise org row (tombstone)
  await db
    .prepare(
      `UPDATE organizations SET
        name = 'Deleted Organisation',
        contact_email = NULL,
        billing_email = NULL,
        phone = NULL,
        address_line_1 = NULL,
        address_line_2 = NULL,
        town = NULL,
        postcode = NULL,
        wonde_school_id = NULL,
        wonde_school_token = NULL,
        mylogin_org_id = NULL,
        stripe_customer_id = NULL,
        stripe_subscription_id = NULL,
        consent_given_by = NULL,
        purged_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?`
    )
    .bind(orgId)
    .run();

  console.log(`[OrgPurge] Purged org ${orgId}: ${tablesProcessed} tables, ${errors.length} errors`);
  return { orgId, tablesProcessed, errors };
}
