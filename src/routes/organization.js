/**
 * Organization Management Routes
 * Handles organization settings and management
 */

import { Hono } from 'hono';
import { requireOwner, requireAdmin, auditLog } from '../middleware/tenant.js';

export const organizationRouter = new Hono();

/**
 * Helper to get D1 database
 */
const getDB = (env) => {
  if (!env || !env.READING_MANAGER_DB) {
    throw new Error('Database not available');
  }
  return env.READING_MANAGER_DB;
};

/**
 * Convert database row to organization object (snake_case to camelCase)
 */
const rowToOrganization = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    subscriptionTier: row.subscription_tier,
    maxStudents: row.max_students,
    maxTeachers: row.max_teachers,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/**
 * GET /api/organization
 * Get current organization details
 */
organizationRouter.get('/', async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const org = await db.prepare(`
      SELECT * FROM organizations WHERE id = ?
    `).bind(organizationId).first();

    if (!org) {
      return c.json({ error: 'Organization not found' }, 404);
    }

    return c.json({ organization: rowToOrganization(org) });

  } catch (error) {
    console.error('Get organization error:', error);
    return c.json({ error: 'Failed to get organization' }, 500);
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
      return c.json({ error: 'No valid fields to update' }, 400);
    }

    await db.prepare(`
      UPDATE organizations SET name = ?, updated_at = datetime("now") WHERE id = ?
    `).bind(name, organizationId).run();

    const updatedOrg = await db.prepare(`
      SELECT * FROM organizations WHERE id = ?
    `).bind(organizationId).first();

    return c.json({ 
      message: 'Organization updated successfully',
      organization: rowToOrganization(updatedOrg)
    });

  } catch (error) {
    console.error('Update organization error:', error);
    return c.json({ error: 'Failed to update organization' }, 500);
  }
});

/**
 * GET /api/organization/stats
 * Get organization usage statistics
 */
organizationRouter.get('/stats', async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    // Get organization limits
    const org = await db.prepare(`
      SELECT max_students, max_teachers FROM organizations WHERE id = ?
    `).bind(organizationId).first();

    // Count users
    const userCount = await db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND is_active = 1
    `).bind(organizationId).first();

    // Count students
    const studentCount = await db.prepare(`
      SELECT COUNT(*) as count FROM students WHERE organization_id = ? AND is_active = 1
    `).bind(organizationId).first();

    // Count classes
    const classCount = await db.prepare(`
      SELECT COUNT(*) as count FROM classes WHERE organization_id = ? AND is_active = 1
    `).bind(organizationId).first();

    // Count reading sessions (this month)
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const sessionCount = await db.prepare(`
      SELECT COUNT(*) as count FROM reading_sessions rs
      INNER JOIN students s ON rs.student_id = s.id
      WHERE s.organization_id = ? AND rs.session_date >= ?
    `).bind(organizationId, firstOfMonth).first();

    // Count selected books
    const bookCount = await db.prepare(`
      SELECT COUNT(*) as count FROM org_book_selections WHERE organization_id = ? AND is_available = 1
    `).bind(organizationId).first();

    return c.json({
      stats: {
        users: {
          current: userCount?.count || 0,
          limit: org?.max_teachers || 0
        },
        students: {
          current: studentCount?.count || 0,
          limit: org?.max_students || 0
        },
        classes: classCount?.count || 0,
        sessionsThisMonth: sessionCount?.count || 0,
        selectedBooks: bookCount?.count || 0
      }
    });

  } catch (error) {
    console.error('Get organization stats error:', error);
    return c.json({ error: 'Failed to get organization stats' }, 500);
  }
});

/**
 * GET /api/organization/settings
 * Get all organization settings
 */
organizationRouter.get('/settings', async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const result = await db.prepare(`
      SELECT setting_key, setting_value FROM org_settings WHERE organization_id = ?
    `).bind(organizationId).all();

    // Convert to object
    const settings = {};
    for (const row of result.results || []) {
      try {
        settings[row.setting_key] = JSON.parse(row.setting_value);
      } catch {
        settings[row.setting_key] = row.setting_value;
      }
    }

    // Add defaults for missing settings
    const defaults = {
      readingStatusSettings: {
        recentlyReadDays: 3,
        needsAttentionDays: 7
      },
      timezone: 'UTC',
      academicYear: new Date().getFullYear().toString()
    };

    return c.json({ 
      settings: { ...defaults, ...settings }
    });

  } catch (error) {
    console.error('Get organization settings error:', error);
    return c.json({ error: 'Failed to get organization settings' }, 500);
  }
});

/**
 * PUT /api/organization/settings
 * Update organization settings
 * Requires: admin role
 * 
 * Body: {
 *   [key: string]: any
 * }
 */
organizationRouter.put('/settings', requireAdmin(), auditLog('update', 'settings'), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');
    const body = await c.req.json();

    // Validate settings keys
    const allowedKeys = [
      'readingStatusSettings',
      'timezone',
      'academicYear',
      'defaultReadingLevel',
      'schoolName'
    ];

    const updates = [];
    for (const [key, value] of Object.entries(body)) {
      if (!allowedKeys.includes(key)) {
        continue;
      }

      const settingValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      updates.push({ key, value: settingValue });
    }

    if (updates.length === 0) {
      return c.json({ error: 'No valid settings to update' }, 400);
    }

    // Upsert settings
    const statements = updates.map(({ key, value }) => {
      return db.prepare(`
        INSERT INTO org_settings (id, organization_id, setting_key, setting_value, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, setting_key) 
        DO UPDATE SET setting_value = ?, updated_by = ?, updated_at = datetime("now")
      `).bind(
        crypto.randomUUID(),
        organizationId,
        key,
        value,
        userId,
        value,
        userId
      );
    });

    await db.batch(statements);

    return c.json({ message: 'Settings updated successfully' });

  } catch (error) {
    console.error('Update organization settings error:', error);
    return c.json({ error: 'Failed to update organization settings' }, 500);
  }
});

/**
 * GET /api/organization/ai-config
 * Get AI configuration (without exposing API key)
 */
organizationRouter.get('/ai-config', async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const config = await db.prepare(`
      SELECT provider, model_preference, is_enabled FROM org_ai_config WHERE organization_id = ?
    `).bind(organizationId).first();

    return c.json({
      aiConfig: config ? {
        provider: config.provider,
        modelPreference: config.model_preference,
        isEnabled: Boolean(config.is_enabled),
        hasApiKey: Boolean(config.api_key_encrypted)
      } : {
        provider: 'anthropic',
        modelPreference: null,
        isEnabled: false,
        hasApiKey: false
      }
    });

  } catch (error) {
    console.error('Get AI config error:', error);
    return c.json({ error: 'Failed to get AI configuration' }, 500);
  }
});

/**
 * PUT /api/organization/ai-config
 * Update AI configuration
 * Requires: admin role
 * 
 * Body: {
 *   provider?: 'anthropic' | 'openai' | 'google',
 *   apiKey?: string,
 *   modelPreference?: string,
 *   isEnabled?: boolean
 * }
 */
organizationRouter.put('/ai-config', requireAdmin(), auditLog('update', 'ai-config'), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');
    const body = await c.req.json();

    const { provider, apiKey, modelPreference, isEnabled } = body;

    // Validate provider
    const validProviders = ['anthropic', 'openai', 'google'];
    if (provider && !validProviders.includes(provider)) {
      return c.json({ error: 'Invalid AI provider' }, 400);
    }

    // Check if config exists
    const existing = await db.prepare(`
      SELECT id FROM org_ai_config WHERE organization_id = ?
    `).bind(organizationId).first();

    if (existing) {
      // Update existing config
      const updates = [];
      const params = [];

      if (provider !== undefined) {
        updates.push('provider = ?');
        params.push(provider);
      }

      if (apiKey !== undefined) {
        // In production, this should be encrypted
        updates.push('api_key_encrypted = ?');
        params.push(apiKey);
      }

      if (modelPreference !== undefined) {
        updates.push('model_preference = ?');
        params.push(modelPreference);
      }

      if (isEnabled !== undefined) {
        updates.push('is_enabled = ?');
        params.push(isEnabled ? 1 : 0);
      }

      if (updates.length > 0) {
        updates.push('updated_by = ?');
        params.push(userId);
        updates.push('updated_at = datetime("now")');
        params.push(organizationId);

        await db.prepare(`
          UPDATE org_ai_config SET ${updates.join(', ')} WHERE organization_id = ?
        `).bind(...params).run();
      }
    } else {
      // Create new config
      await db.prepare(`
        INSERT INTO org_ai_config (id, organization_id, provider, api_key_encrypted, model_preference, is_enabled, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        organizationId,
        provider || 'anthropic',
        apiKey || null,
        modelPreference || null,
        isEnabled ? 1 : 0,
        userId
      ).run();
    }

    return c.json({ message: 'AI configuration updated successfully' });

  } catch (error) {
    console.error('Update AI config error:', error);
    return c.json({ error: 'Failed to update AI configuration' }, 500);
  }
});

/**
 * GET /api/organization/audit-log
 * Get audit log entries
 * Requires: admin role
 */
organizationRouter.get('/audit-log', requireAdmin(), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const page = parseInt(c.req.query('page') || '1');
    const pageSize = parseInt(c.req.query('pageSize') || '50');
    const offset = (page - 1) * pageSize;

    // Get total count
    const countResult = await db.prepare(`
      SELECT COUNT(*) as count FROM audit_log WHERE organization_id = ?
    `).bind(organizationId).first();

    // Get audit entries
    const result = await db.prepare(`
      SELECT al.*, u.name as user_name, u.email as user_email
      FROM audit_log al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.organization_id = ?
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(organizationId, pageSize, offset).all();

    const entries = (result.results || []).map(row => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: row.details ? JSON.parse(row.details) : null,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      user: row.user_id ? {
        id: row.user_id,
        name: row.user_name,
        email: row.user_email
      } : null
    }));

    return c.json({
      entries,
      pagination: {
        page,
        pageSize,
        total: countResult?.count || 0,
        totalPages: Math.ceil((countResult?.count || 0) / pageSize)
      }
    });

  } catch (error) {
    console.error('Get audit log error:', error);
    return c.json({ error: 'Failed to get audit log' }, 500);
  }
});
