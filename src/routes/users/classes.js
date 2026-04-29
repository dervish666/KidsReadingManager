/**
 * User class assignment routes.
 *
 *   GET  /:id/classes   — Get assigned + available classes for a user
 *   PUT  /:id/classes   — Replace class assignments atomically
 *
 * For Wonde-synced users, assignments are overwritten on the next delta sync
 * based on MIS data. For manual schools, these assignments persist until
 * an admin changes them.
 */

import { Hono } from 'hono';
import { generateId } from '../../utils/helpers.js';
import { ROLES } from '../../utils/crypto.js';
import { requireAdmin, auditLog } from '../../middleware/tenant.js';
import { requireDB as getDB } from '../../utils/routeHelpers.js';
import { notFoundError, badRequestError } from '../../middleware/errorHandler.js';

export const classesRouter = new Hono();

/**
 * GET /api/users/:id/classes
 * Get class assignments for a user (from class_assignments table) plus
 * the list of available classes in the user's organization for editing.
 * Requires: admin role
 */
classesRouter.get('/:id/classes', requireAdmin(), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userRole = c.get('userRole');
    const targetUserId = c.req.param('id');

    // Fetch user - owners can see any user, admins only their org
    let user;
    if (userRole === ROLES.OWNER) {
      user = await db
        .prepare(
          'SELECT id, organization_id, wonde_employee_id FROM users WHERE id = ? AND is_active = 1'
        )
        .bind(targetUserId)
        .first();
    } else {
      user = await db
        .prepare(
          'SELECT id, organization_id, wonde_employee_id FROM users WHERE id = ? AND organization_id = ? AND is_active = 1'
        )
        .bind(targetUserId, organizationId)
        .first();
    }

    if (!user) {
      throw notFoundError('User not found');
    }

    // Assigned classes from class_assignments (the source of truth used at login)
    const assigned = await db
      .prepare(
        `
      SELECT c.id as class_id, c.name as class_name
      FROM class_assignments ca
      JOIN classes c ON c.id = ca.class_id
      WHERE ca.user_id = ? AND c.organization_id = ? AND c.is_active = 1
      ORDER BY c.name
    `
      )
      .bind(targetUserId, user.organization_id)
      .all();

    // All active classes in the user's organization (for picker)
    const available = await db
      .prepare(
        `
      SELECT id as class_id, name as class_name
      FROM classes
      WHERE organization_id = ? AND is_active = 1
      ORDER BY name
    `
      )
      .bind(user.organization_id)
      .all();

    const classes = (assigned.results || []).map((row) => ({
      classId: row.class_id,
      className: row.class_name,
      source: user.wonde_employee_id ? 'wonde' : 'manual',
    }));

    const availableClasses = (available.results || []).map((row) => ({
      classId: row.class_id,
      className: row.class_name,
    }));

    return c.json({
      classes,
      availableClasses,
      isWondeUser: Boolean(user.wonde_employee_id),
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('Get user classes error:', error);
    return c.json({ error: 'Failed to get user classes' }, 500);
  }
});

/**
 * PUT /api/users/:id/classes
 * Replace the user's class assignments.
 * Body: { classIds: string[] }
 *
 * Note: For Wonde-synced users, the next Wonde sync will overwrite these
 * assignments based on the MIS data. For manual schools, these persist.
 *
 * Requires: admin role
 */
classesRouter.put('/:id/classes', requireAdmin(), auditLog('update', 'user'), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userRole = c.get('userRole');
    const targetUserId = c.req.param('id');

    const body = await c.req.json().catch(() => ({}));
    const classIds = Array.isArray(body.classIds) ? body.classIds : null;

    if (classIds === null) {
      throw badRequestError('classIds (array) is required');
    }

    // Fetch user - owners can see any user, admins only their org
    let user;
    if (userRole === ROLES.OWNER) {
      user = await db
        .prepare('SELECT id, organization_id FROM users WHERE id = ? AND is_active = 1')
        .bind(targetUserId)
        .first();
    } else {
      user = await db
        .prepare(
          'SELECT id, organization_id FROM users WHERE id = ? AND organization_id = ? AND is_active = 1'
        )
        .bind(targetUserId, organizationId)
        .first();
    }

    if (!user) {
      throw notFoundError('User not found');
    }

    // Validate all classIds belong to the user's org and are active
    if (classIds.length > 0) {
      const placeholders = classIds.map(() => '?').join(',');
      const validClasses = await db
        .prepare(
          `SELECT id FROM classes
           WHERE organization_id = ? AND is_active = 1 AND id IN (${placeholders})`
        )
        .bind(user.organization_id, ...classIds)
        .all();

      const validIds = new Set((validClasses.results || []).map((r) => r.id));
      const invalid = classIds.filter((id) => !validIds.has(id));
      if (invalid.length > 0) {
        throw badRequestError(
          `Invalid class IDs (not in user's organization or inactive): ${invalid.join(', ')}`
        );
      }
    }

    // Replace assignments atomically
    const statements = [
      db.prepare('DELETE FROM class_assignments WHERE user_id = ?').bind(targetUserId),
    ];
    for (const classId of classIds) {
      statements.push(
        db
          .prepare(
            'INSERT OR IGNORE INTO class_assignments (id, class_id, user_id, created_at) VALUES (?, ?, ?, datetime("now"))'
          )
          .bind(generateId(), classId, targetUserId)
      );
    }

    // Chunk batches to stay under D1's 100-statement limit
    for (let i = 0; i < statements.length; i += 100) {
      await db.batch(statements.slice(i, i + 100));
    }

    return c.json({
      message: 'Class assignments updated successfully',
      assignedCount: classIds.length,
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('Update user classes error:', error);
    return c.json({ error: 'Failed to update class assignments' }, 500);
  }
});
