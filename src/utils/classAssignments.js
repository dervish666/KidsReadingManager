/**
 * Sync class assignments for a user from wonde_employee_classes.
 *
 * Deletes existing class_assignments for the user, then re-creates
 * them by joining wonde_employee_classes with classes to resolve
 * wonde_class_id -> tally class_id.
 *
 * @param {Object} db - D1 database binding
 * @param {string} userId - Tally user ID
 * @param {string|null} wondeEmployeeId - Wonde employee ID (null = no-op)
 * @param {string} orgId - Organization ID
 * @returns {Promise<number>} Number of classes assigned
 */
export async function syncUserClassAssignments(db, userId, wondeEmployeeId, orgId) {
  if (!wondeEmployeeId) return 0;

  // 1. Delete existing assignments for this user
  await db.prepare('DELETE FROM class_assignments WHERE user_id = ?').bind(userId).run();

  // 2. Find matching tally classes from wonde employee-class data
  const { results } = await db
    .prepare(
      `SELECT c.id AS class_id
     FROM wonde_employee_classes wec
     JOIN classes c ON c.wonde_class_id = wec.wonde_class_id AND c.organization_id = wec.organization_id
     WHERE wec.organization_id = ? AND wec.wonde_employee_id = ?`
    )
    .bind(orgId, wondeEmployeeId)
    .all();

  if (!results || results.length === 0) return 0;

  // 3. Insert new assignments (batched)
  const statements = results.map((row) =>
    db
      .prepare(
        'INSERT OR IGNORE INTO class_assignments (id, class_id, user_id, created_at) VALUES (?, ?, ?, datetime("now"))'
      )
      .bind(crypto.randomUUID(), row.class_id, userId)
  );
  for (let i = 0; i < statements.length; i += 100) {
    await db.batch(statements.slice(i, i + 100));
  }

  return results.length;
}
