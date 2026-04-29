/**
 * Organization Compliance sub-router
 *
 * Handles audit log, DPA consent, and GDPR purge (Article 17).
 * Mounted at `/api/organization` by the entry router.
 */

import { Hono } from 'hono';
import { requireOwner, requireAdmin, auditLog } from '../../middleware/tenant.js';
import { requireDB as getDB } from '../../utils/routeHelpers.js';
import { notFoundError, badRequestError } from '../../middleware/errorHandler.js';
import { hardDeleteOrganization } from '../../services/orgPurge.js';

export const complianceRouter = new Hono();

/**
 * GET /api/organization/audit-log
 * Get audit log entries
 * Requires: admin role
 */
complianceRouter.get('/audit-log', requireAdmin(), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const page = Math.max(parseInt(c.req.query('page')) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(c.req.query('pageSize')) || 50, 1), 200);
    const offset = (page - 1) * pageSize;

    // Get total count
    const countResult = await db
      .prepare(
        `
      SELECT COUNT(*) as count FROM audit_log WHERE organization_id = ?
    `
      )
      .bind(organizationId)
      .first();

    // Get audit entries
    const result = await db
      .prepare(
        `
      SELECT al.*, u.name as user_name, u.email as user_email
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.organization_id = ?
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .bind(organizationId, pageSize, offset)
      .all();

    const entries = (result.results || []).map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: (() => {
        try {
          return row.details ? JSON.parse(row.details) : null;
        } catch {
          return row.details;
        }
      })(),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      user: row.user_id
        ? {
            id: row.user_id,
            name: row.user_name,
            email: row.user_email,
          }
        : null,
    }));

    return c.json({
      entries,
      pagination: {
        page,
        pageSize,
        total: countResult?.count || 0,
        totalPages: Math.ceil((countResult?.count || 0) / pageSize),
      },
    });
  } catch (error) {
    console.error('Get audit log error:', error);
    return c.json({ error: 'Failed to get audit log' }, 500);
  }
});

/**
 * GET /api/organization/dpa-consent
 * Get DPA consent status for the current organization
 */
complianceRouter.get('/dpa-consent', async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const org = await db
      .prepare(
        `
      SELECT consent_given_at, consent_version, consent_given_by
      FROM organizations WHERE id = ?
    `
      )
      .bind(organizationId)
      .first();

    if (!org) {
      throw notFoundError('Organization not found');
    }

    let consentGivenByName = null;
    if (org.consent_given_by) {
      const user = await db
        .prepare('SELECT name FROM users WHERE id = ?')
        .bind(org.consent_given_by)
        .first();
      consentGivenByName = user?.name || null;
    }

    return c.json({
      consent: {
        given: Boolean(org.consent_given_at),
        givenAt: org.consent_given_at || null,
        version: org.consent_version || null,
        givenBy: consentGivenByName,
      },
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('Get DPA consent error:', error);
    return c.json({ error: 'Failed to get DPA consent status' }, 500);
  }
});

/**
 * POST /api/organization/dpa-consent
 * Record DPA consent for the current organization
 * Requires: admin role
 *
 * Body: {
 *   version: string (e.g. "1.0")
 * }
 */
complianceRouter.post(
  '/dpa-consent',
  requireAdmin(),
  auditLog('consent', 'organization'),
  async (c) => {
    try {
      const db = getDB(c.env);
      const organizationId = c.get('organizationId');
      const userId = c.get('userId');
      const body = await c.req.json();

      const { version } = body;
      if (!version) {
        throw badRequestError('DPA version is required');
      }

      await db
        .prepare(
          `
      UPDATE organizations
      SET consent_given_at = datetime('now'),
          consent_version = ?,
          consent_given_by = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `
        )
        .bind(version, userId, organizationId)
        .run();

      return c.json({
        message: 'DPA consent recorded successfully',
        consent: {
          given: true,
          version,
          givenAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      if (error.status) throw error;
      console.error('Record DPA consent error:', error);
      return c.json({ error: 'Failed to record DPA consent' }, 500);
    }
  }
);

/**
 * DELETE /api/organization/:id/purge
 * Permanently delete all org data (Article 17 erasure)
 * Requires: owner role, body { confirm: "<org name>" }
 */
complianceRouter.delete(
  '/:id/purge',
  requireOwner(),
  auditLog('purge', 'organization'),
  async (c) => {
    const db = getDB(c.env);
    const orgId = c.req.param('id');

    // Load org to check name confirmation
    const org = await db
      .prepare('SELECT id, name, legal_hold, purged_at FROM organizations WHERE id = ?')
      .bind(orgId)
      .first();

    if (!org) {
      throw notFoundError('Organization not found');
    }

    const body = await c.req.json();
    const confirmName = (body.confirm || '').trim().toLowerCase();
    const orgName = (org.name || '').trim().toLowerCase();

    if (confirmName !== orgName) {
      throw badRequestError('Confirmation name does not match the organization name');
    }

    // hardDeleteOrganization handles legal_hold and purged_at checks (throws 409)
    const result = await hardDeleteOrganization(db, orgId, c.env);
    return c.json(result);
  }
);
