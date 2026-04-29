/**
 * GDPR-related user routes.
 *
 *   DELETE /:id/erase    — Article 17 hard delete (admin, requires confirm)
 *   GET    /:id/export   — Article 15 Subject Access Request (JSON or CSV)
 *
 * The erase path is FK-safe (tokens → password resets → user) and logs
 * the erasure in `data_rights_log` before deleting. Audit log entries
 * referencing the user are anonymised rather than deleted.
 */

import { Hono } from 'hono';
import { generateId, csvRow } from '../../utils/helpers.js';
import { ROLES } from '../../utils/crypto.js';
import { requireAdmin, requireOwner, auditLog } from '../../middleware/tenant.js';
import { requireDB as getDB } from '../../utils/routeHelpers.js';
import { notFoundError, badRequestError } from '../../middleware/errorHandler.js';

export const gdprRouter = new Hono();

/**
 * DELETE /api/users/:id/erase
 * GDPR Article 17 — Hard delete a user and all associated data
 * Requires: admin role, { confirm: true } in request body
 */
gdprRouter.delete('/:id/erase', requireAdmin(), auditLog('erase', 'user'), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const currentUserId = c.get('userId');
    const currentUserRole = c.get('userRole');
    const targetUserId = c.req.param('id');

    const body = await c.req.json().catch(() => ({}));
    if (!body.confirm) {
      throw badRequestError('Erasure requires { "confirm": true } in request body');
    }

    // Owners can erase users from any organization; others only within their own
    let existingUser;
    if (currentUserRole === ROLES.OWNER) {
      existingUser = await db
        .prepare('SELECT id, role, organization_id FROM users WHERE id = ?')
        .bind(targetUserId)
        .first();
    } else {
      existingUser = await db
        .prepare('SELECT id, role, organization_id FROM users WHERE id = ? AND organization_id = ?')
        .bind(targetUserId, organizationId)
        .first();
    }

    if (!existingUser) {
      throw notFoundError('User not found');
    }

    // Cannot erase yourself
    if (targetUserId === currentUserId) {
      throw badRequestError('Cannot erase your own account');
    }

    // Non-owners can't erase owner-role users
    if (existingUser.role === 'owner' && currentUserRole !== ROLES.OWNER) {
      throw badRequestError('Cannot erase the organization owner');
    }

    // Count records for response summary
    const tokenCount = await db
      .prepare('SELECT COUNT(*) as count FROM refresh_tokens WHERE user_id = ?')
      .bind(targetUserId)
      .first();

    // Log the erasure request BEFORE deleting
    // Use the target user's org for log entries (matters for cross-org owner deletions)
    const targetOrgId = existingUser.organization_id;
    const rightsLogId = generateId();

    await db.batch([
      db
        .prepare(
          `
        INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, requested_by, status, completed_at)
        VALUES (?, ?, 'erasure', 'user', ?, ?, 'completed', datetime('now'))
      `
        )
        .bind(rightsLogId, targetOrgId, targetUserId, currentUserId),

      // Delete in FK order: tokens → password resets → user
      db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').bind(targetUserId),
      db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(targetUserId),
      db.prepare('DELETE FROM users WHERE id = ?').bind(targetUserId),

      // Anonymise audit log entries that reference this user
      db
        .prepare(
          `
        UPDATE audit_log SET entity_id = 'erased', details = NULL
        WHERE entity_type = 'user' AND entity_id = ? AND organization_id = ?
      `
        )
        .bind(targetUserId, targetOrgId),
    ]);

    return c.json({
      message: 'User data erased successfully',
      erased: {
        refreshTokens: tokenCount.count,
        userRecord: 1,
        auditEntriesAnonymised: true,
      },
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('Erase user error:', error);
    return c.json({ error: 'Failed to erase user' }, 500);
  }
});

/**
 * GET /api/users/:id/export
 * GDPR Article 15 — Subject Access Request export for staff/users
 * Returns all personal data held on a user in JSON or CSV format
 * Requires: owner role
 */
gdprRouter.get('/:id/export', requireOwner(), async (c) => {
  try {
    const db = getDB(c.env);
    const targetUserId = c.req.param('id');
    const currentUserId = c.get('userId');
    const format = (c.req.query('format') || 'json').toLowerCase();

    if (!['json', 'csv'].includes(format)) {
      throw badRequestError('Unsupported format. Use ?format=json or ?format=csv');
    }

    // Fetch user with organization name
    const user = await db
      .prepare(
        `
      SELECT u.*, o.name as organization_name
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.id = ?
    `
      )
      .bind(targetUserId)
      .first();

    if (!user) {
      throw notFoundError('User not found');
    }

    // Fetch audit log entries referencing this user (scoped to their organization)
    const auditEntries = await db
      .prepare(
        `
      SELECT action, entity_type, entity_id, details, created_at
      FROM audit_log
      WHERE (user_id = ? OR (entity_type = 'user' AND entity_id = ?))
        AND organization_id = ?
      ORDER BY created_at DESC
    `
      )
      .bind(targetUserId, targetUserId, user.organization_id)
      .all();

    // Log the SAR in data_rights_log
    await db
      .prepare(
        `
      INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, requested_by, status, completed_at)
      VALUES (?, ?, 'access', 'user', ?, ?, 'completed', datetime('now'))
    `
      )
      .bind(generateId(), user.organization_id, targetUserId, currentUserId)
      .run();

    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        exportFormat: 'GDPR Article 15 Subject Access Request',
        organization: user.organization_name || user.organization_id,
        dataController: 'Scratch IT LTD',
      },
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        organization: user.organization_name,
        authProvider: user.auth_provider || 'local',
        isActive: Boolean(user.is_active),
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      auditTrail: (auditEntries.results || []).map((a) => ({
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        details: a.details || null,
        timestamp: a.created_at,
      })),
    };

    if (format === 'csv') {
      const lines = [];
      lines.push(`# GDPR Article 15 Subject Access Request`);
      lines.push(`# Export Date: ${exportData.metadata.exportDate}`);
      lines.push(`# Organization: ${exportData.metadata.organization}`);
      lines.push(`# Data Controller: ${exportData.metadata.dataController}`);
      lines.push('');

      lines.push('## User Profile');
      lines.push('Name,Email,Role,Organization,Auth Provider,Active,Last Login,Created,Updated');
      const u = exportData.user;
      lines.push(
        csvRow([
          u.name,
          u.email,
          u.role,
          u.organization,
          u.authProvider,
          u.isActive,
          u.lastLoginAt,
          u.createdAt,
          u.updatedAt,
        ])
      );
      lines.push('');

      if (exportData.auditTrail.length > 0) {
        lines.push('## Audit Trail');
        lines.push('Action,Entity Type,Entity ID,Details,Timestamp');
        for (const a of exportData.auditTrail) {
          lines.push(csvRow([a.action, a.entityType, a.entityId, a.details, a.timestamp]));
        }
      }

      const csv = lines.join('\n');
      const filename = `user-export-${user.name.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.csv`;

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // JSON format (default)
    const filename = `user-export-${user.name.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.json`;
    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('Export user error:', error);
    return c.json({ error: 'Failed to export user data' }, 500);
  }
});
