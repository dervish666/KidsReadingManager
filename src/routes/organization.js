/**
 * Organization entry router.
 *
 * The organization surface area is split across files in
 * `src/routes/organization/` for readability — settings/AI config and
 * compliance (audit log, DPA consent, purge) each get their own module.
 * This file owns the core CRUD (list, get, create, update, soft-delete)
 * plus stats, and composes the sub-routers in.
 *
 * Order of mounting matters: the sub-routers carry literal paths
 * (`/settings`, `/ai-config`, `/audit-log`, `/dpa-consent`) that must
 * match before this file's `/:id` handlers. Hono's trie prefers static
 * routes over params, but mounting sub-routers first keeps the precedence
 * explicit and trivially auditable.
 */

import { Hono } from 'hono';
import { requireOwner, requireAdmin, requireReadonly, auditLog } from '../middleware/tenant.js';
import { generateUniqueSlug } from '../utils/helpers.js';
import { requireDB as getDB } from '../utils/routeHelpers.js';
import { rowToOrganization } from '../utils/rowMappers.js';
import { notFoundError, badRequestError } from '../middleware/errorHandler.js';
import { invalidateOrgStatus } from '../utils/orgStatusCache.js';

import { settingsRouter } from './organization/settings.js';
import { complianceRouter } from './organization/compliance.js';

export const organizationRouter = new Hono();

// Mount sub-routers first so their literal paths take precedence over the
// `/:id` core handlers below. The trie router would resolve this either way,
// but explicit ordering means a future maintainer doesn't have to reason
// about routing precedence.
organizationRouter.route('/', settingsRouter);
organizationRouter.route('/', complianceRouter);

/**
 * GET /api/organization
 * Get current organization details
 */
organizationRouter.get('/', requireReadonly(), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const org = await db
      .prepare(
        `
      SELECT * FROM organizations WHERE id = ? AND is_active = 1
    `
      )
      .bind(organizationId)
      .first();

    if (!org) {
      throw notFoundError('Organization not found');
    }

    return c.json({ organization: rowToOrganization(org) });
  } catch (error) {
    if (error.status) throw error;
    console.error('Get organization error:', error);
    return c.json({ error: 'Failed to get organization' }, 500);
  }
});

/**
 * GET /api/organization/all
 * List organizations
 * - Owners can see all organizations
 * - Admins can only see their own organization
 * Requires: admin role
 */
organizationRouter.get('/all', requireAdmin(), async (c) => {
  try {
    const db = getDB(c.env);
    const userRole = c.get('userRole');
    const organizationId = c.get('organizationId');

    // Admin: return just their own org, wrapped in pagination format
    if (userRole !== 'owner') {
      const result = await db
        .prepare('SELECT * FROM organizations WHERE id = ? AND is_active = 1')
        .bind(organizationId)
        .all();
      const organizations = (result.results || []).map(rowToOrganization);
      return c.json({
        organizations,
        pagination: { page: 1, pageSize: 50, total: organizations.length, totalPages: 1 },
      });
    }

    // Owner: full pagination, search, filters, sorting
    const page = Math.max(parseInt(c.req.query('page')) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(c.req.query('pageSize')) || 50, 1), 100);
    const search = c.req.query('search') || '';
    const source = c.req.query('source') || '';
    const billing = c.req.query('billing') || '';
    const syncStatus = c.req.query('syncStatus') || '';
    const hasErrors = c.req.query('hasErrors') === 'true';

    const sortField = c.req.query('sort') || 'name';
    const sortOrder = c.req.query('order') === 'desc' ? 'DESC' : 'ASC';

    const sortMap = {
      name: 'o.name',
      billing: 'o.subscription_status',
      lastSync: 'o.wonde_last_sync_at',
      town: 'o.town',
    };
    const orderByCol = sortMap[sortField] || 'o.name';

    // Build WHERE clauses
    const conditions = ['o.is_active = 1'];
    const params = [];

    if (search && search.length < 2) {
      return c.json({ error: 'Search term must be at least 2 characters' }, 400);
    }

    if (search) {
      conditions.push('(o.name LIKE ? OR o.town LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (source === 'wonde') {
      conditions.push('o.wonde_school_id IS NOT NULL');
    } else if (source === 'manual') {
      conditions.push('o.wonde_school_id IS NULL');
    }

    if (billing === 'none') {
      conditions.push("(o.subscription_status IS NULL OR o.subscription_status = 'none')");
    } else if (['active', 'trialing', 'past_due', 'cancelled'].includes(billing)) {
      conditions.push('o.subscription_status = ?');
      params.push(billing);
    }

    if (syncStatus === 'recent') {
      conditions.push(
        "(o.wonde_school_id IS NOT NULL AND o.wonde_last_sync_at > datetime('now', '-7 days'))"
      );
    } else if (syncStatus === 'stale') {
      conditions.push(
        "(o.wonde_school_id IS NOT NULL AND o.wonde_last_sync_at <= datetime('now', '-7 days'))"
      );
    } else if (syncStatus === 'never') {
      conditions.push('(o.wonde_school_id IS NOT NULL AND o.wonde_last_sync_at IS NULL)');
    }

    if (hasErrors) {
      conditions.push(`(
        o.subscription_status = 'past_due'
        OR (o.wonde_school_id IS NOT NULL AND o.wonde_last_sync_at <= datetime('now', '-7 days'))
        OR (o.wonde_school_id IS NOT NULL AND o.wonde_school_token IS NULL)
        OR EXISTS (
          SELECT 1 FROM wonde_sync_log wsl
          WHERE wsl.organization_id = o.id AND wsl.status = 'error'
          AND wsl.started_at = (
            SELECT MAX(wsl2.started_at) FROM wonde_sync_log wsl2
            WHERE wsl2.organization_id = o.id
          )
        )
      )`);
    }

    const whereClause = conditions.join(' AND ');

    // Count query
    const countResult = await db
      .prepare(`SELECT COUNT(*) as count FROM organizations o WHERE ${whereClause}`)
      .bind(...params)
      .first();
    const total = countResult?.count || 0;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    // Data query with subqueries for counts and last sync error
    const dataQuery = `
      SELECT o.*,
        (SELECT COUNT(*) FROM students s WHERE s.organization_id = o.id AND s.is_active = 1) as student_count,
        (SELECT COUNT(*) FROM classes c WHERE c.organization_id = o.id AND c.is_active = 1) as class_count,
        (SELECT wsl.error_message FROM wonde_sync_log wsl
         WHERE wsl.organization_id = o.id
         ORDER BY wsl.started_at DESC LIMIT 1) as last_sync_error,
        (SELECT COUNT(*) FROM org_ai_config WHERE organization_id = o.id AND api_key_encrypted IS NOT NULL) as has_ai_key
      FROM organizations o
      WHERE ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const result = await db
      .prepare(dataQuery)
      .bind(...params, pageSize, offset)
      .all();

    const organizations = (result.results || []).map(rowToOrganization);

    return c.json({
      organizations,
      pagination: { page, pageSize, total, totalPages },
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('List organizations error:', error);
    return c.json({ error: 'Failed to list organizations' }, 500);
  }
});

/**
 * GET /api/organization/stats
 * Get organization usage statistics
 */
organizationRouter.get('/stats', requireReadonly(), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    // Use org timezone for accurate month boundary
    const tzResult = await db
      .prepare(
        `SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'timezone'`
      )
      .bind(organizationId)
      .first();
    let timezone = 'UTC';
    if (tzResult?.setting_value) {
      try {
        timezone = JSON.parse(tzResult.setting_value);
      } catch {
        timezone = tzResult.setting_value;
      }
    }
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone });
    const firstOfMonth = todayStr.slice(0, 8) + '01';

    // Execute all stats queries in a single batch round-trip
    const [userCount, studentCount, classCount, sessionCount, bookCount] = await db.batch([
      db
        .prepare(`SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND is_active = 1`)
        .bind(organizationId),
      db
        .prepare(
          `SELECT COUNT(*) as count FROM students WHERE organization_id = ? AND is_active = 1`
        )
        .bind(organizationId),
      db
        .prepare(
          `SELECT COUNT(*) as count FROM classes WHERE organization_id = ? AND is_active = 1`
        )
        .bind(organizationId),
      db
        .prepare(
          `SELECT COUNT(*) as count FROM reading_sessions rs INNER JOIN students s ON rs.student_id = s.id WHERE s.organization_id = ? AND rs.session_date >= ?`
        )
        .bind(organizationId, firstOfMonth),
      db
        .prepare(
          `SELECT COUNT(*) as count FROM org_book_selections WHERE organization_id = ? AND is_available = 1`
        )
        .bind(organizationId),
    ]);

    return c.json({
      stats: {
        users: userCount.results?.[0]?.count || 0,
        students: studentCount.results?.[0]?.count || 0,
        classes: classCount.results?.[0]?.count || 0,
        sessionsThisMonth: sessionCount.results?.[0]?.count || 0,
        selectedBooks: bookCount.results?.[0]?.count || 0,
      },
    });
  } catch (error) {
    console.error('Get organization stats error:', error);
    return c.json({ error: 'Failed to get organization stats' }, 500);
  }
});

/**
 * GET /api/organization/:id
 * Get a specific organization by ID
 * Requires: owner role
 */
organizationRouter.get('/:id', requireOwner(), async (c) => {
  try {
    const db = getDB(c.env);
    const orgId = c.req.param('id');

    const org = await db
      .prepare(
        `
      SELECT * FROM organizations WHERE id = ? AND is_active = 1
    `
      )
      .bind(orgId)
      .first();

    if (!org) {
      throw notFoundError('Organization not found');
    }

    return c.json({ organization: rowToOrganization(org) });
  } catch (error) {
    if (error.status) throw error;
    console.error('Get organization error:', error);
    return c.json({ error: 'Failed to get organization' }, 500);
  }
});

/**
 * POST /api/organization/create
 * Create a new organization
 * Requires: owner role
 *
 * Body: {
 *   name: string,
 *   slug?: string (auto-generated from name if not provided),
 *   subscriptionTier?: string (default: 'free')
 * }
 */
organizationRouter.post(
  '/create',
  requireOwner(),
  auditLog('create', 'organization'),
  async (c) => {
    try {
      const db = getDB(c.env);
      const body = await c.req.json();
      const { generateId } = await import('../utils/helpers.js');

      const { name, slug } = body;

      if (!name) {
        throw badRequestError('Organization name is required');
      }

      // Generate slug from name if not provided, auto-incrementing on collision
      const orgSlug = await generateUniqueSlug(db, slug || name);

      const orgId = generateId();
      await db
        .prepare(
          `
      INSERT INTO organizations (id, name, slug, is_active)
      VALUES (?, ?, ?, 1)
    `
        )
        .bind(orgId, name, orgSlug)
        .run();

      const newOrg = await db
        .prepare(
          `
      SELECT * FROM organizations WHERE id = ?
    `
        )
        .bind(orgId)
        .first();

      return c.json(
        {
          message: 'Organization created successfully',
          organization: rowToOrganization(newOrg),
        },
        201
      );
    } catch (error) {
      if (error.status) throw error;
      console.error('Create organization error:', error);
      return c.json({ error: 'Failed to create organization' }, 500);
    }
  }
);

/**
 * PUT /api/organization/:id
 * Update a specific organization
 * Requires: owner role
 *
 * Body: {
 *   name?: string,
 *   contactEmail?: string,
 *   billingEmail?: string,
 *   phone?: string,
 *   addressLine1?: string,
 *   addressLine2?: string,
 *   town?: string,
 *   postcode?: string,
 * }
 */
organizationRouter.put('/:id', requireOwner(), auditLog('update', 'organization'), async (c) => {
  try {
    const db = getDB(c.env);
    const orgId = c.req.param('id');
    const body = await c.req.json();

    const {
      name,
      contactEmail,
      billingEmail,
      phone,
      addressLine1,
      addressLine2,
      town,
      postcode,
      aiAddonActive,
      clearAiKey,
    } = body;

    // Check if organization exists (and is active)
    const existing = await db
      .prepare('SELECT id FROM organizations WHERE id = ? AND is_active = 1')
      .bind(orgId)
      .first();

    if (!existing) {
      throw notFoundError('Organization not found');
    }

    // Build update query
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }

    const stringFields = {
      contact_email: contactEmail,
      billing_email: billingEmail,
      phone,
      address_line_1: addressLine1,
      address_line_2: addressLine2,
      town,
      postcode,
    };
    for (const [col, val] of Object.entries(stringFields)) {
      if (val !== undefined) {
        updates.push(`${col} = ?`);
        params.push(typeof val === 'string' ? val.trim() : val);
      }
    }

    if (aiAddonActive !== undefined) {
      updates.push('ai_addon_active = ?');
      params.push(aiAddonActive ? 1 : 0);
    }

    // clearAiKey counts as a valid action even without other field updates
    if (updates.length === 0 && !clearAiKey) {
      throw badRequestError('No valid fields to update');
    }

    if (updates.length > 0) {
      updates.push('updated_at = datetime("now")');
      params.push(orgId);

      await db
        .prepare(
          `
        UPDATE organizations SET ${updates.join(', ')} WHERE id = ?
      `
        )
        .bind(...params)
        .run();
    }

    // Clear the org's own AI key so it falls back to platform key
    if (clearAiKey) {
      await db.prepare('DELETE FROM org_ai_config WHERE organization_id = ?').bind(orgId).run();
    }

    const updatedOrg = await db
      .prepare(
        `
      SELECT * FROM organizations WHERE id = ?
    `
      )
      .bind(orgId)
      .first();

    return c.json({
      message: 'Organization updated successfully',
      organization: rowToOrganization(updatedOrg),
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('Update organization error:', error);
    return c.json({ error: 'Failed to update organization' }, 500);
  }
});

/**
 * DELETE /api/organization/:id
 * Deactivate an organization (soft delete)
 * Requires: owner role
 */
organizationRouter.delete('/:id', requireOwner(), auditLog('delete', 'organization'), async (c) => {
  try {
    const db = getDB(c.env);
    const orgId = c.req.param('id');

    // Check if organization exists (and is active)
    const existing = await db
      .prepare('SELECT id FROM organizations WHERE id = ? AND is_active = 1')
      .bind(orgId)
      .first();

    if (!existing) {
      throw notFoundError('Organization not found');
    }

    // Soft delete (deactivate) organization and clean up user access
    await db.batch([
      // Deactivate the organization
      db
        .prepare(
          `
        UPDATE organizations SET is_active = 0, updated_at = datetime("now") WHERE id = ?
      `
        )
        .bind(orgId),
      // Deactivate all users in the organization
      db
        .prepare(
          `
        UPDATE users SET is_active = 0, updated_at = datetime("now")
        WHERE organization_id = ? AND role != 'owner'
      `
        )
        .bind(orgId),
      // Revoke all refresh tokens for users in the organization
      db
        .prepare(
          `
        UPDATE refresh_tokens SET revoked_at = datetime("now")
        WHERE user_id IN (SELECT id FROM users WHERE organization_id = ?)
        AND revoked_at IS NULL
      `
        )
        .bind(orgId),
    ]);

    await invalidateOrgStatus(c.env, orgId);

    return c.json({ message: 'Organization deactivated successfully' });
  } catch (error) {
    if (error.status) throw error;
    console.error('Delete organization error:', error);
    return c.json({ error: 'Failed to delete organization' }, 500);
  }
});

/**
 * PUT /api/organization
 * Update organization details
 * Requires: owner role
 *
 * Body: {
 *   name?: string
 * }
 */
organizationRouter.put('/', requireOwner(), auditLog('update', 'organization'), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const body = await c.req.json();

    const { name } = body;

    if (!name) {
      throw badRequestError('No valid fields to update');
    }

    await db
      .prepare(
        `
      UPDATE organizations SET name = ?, updated_at = datetime("now") WHERE id = ?
    `
      )
      .bind(name, organizationId)
      .run();

    const updatedOrg = await db
      .prepare(
        `
      SELECT * FROM organizations WHERE id = ?
    `
      )
      .bind(organizationId)
      .first();

    return c.json({
      message: 'Organization updated successfully',
      organization: rowToOrganization(updatedOrg),
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('Update organization error:', error);
    return c.json({ error: 'Failed to update organization' }, 500);
  }
});
