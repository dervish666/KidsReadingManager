/**
 * Organization Settings & AI Config sub-router
 *
 * Handles GET/PUT for org_settings and org_ai_config.
 * Mounted at `/api/organization` by the entry router.
 */

import { Hono } from 'hono';
import { requireAdmin, requireReadonly, auditLog } from '../../middleware/tenant.js';
import { requireDB as getDB } from '../../utils/routeHelpers.js';
import { badRequestError } from '../../middleware/errorHandler.js';

export const settingsRouter = new Hono();

/**
 * GET /api/organization/settings
 * Get all organization settings
 */
settingsRouter.get('/settings', requireReadonly(), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const result = await db
      .prepare(
        `
      SELECT setting_key, setting_value FROM org_settings WHERE organization_id = ?
    `
      )
      .bind(organizationId)
      .all();

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
        needsAttentionDays: 7,
      },
      timezone: 'UTC',
      academicYear: new Date().getFullYear().toString(),
    };

    return c.json({
      settings: { ...defaults, ...settings },
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
settingsRouter.put('/settings', requireAdmin(), auditLog('update', 'settings'), async (c) => {
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
      'schoolName',
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
      throw badRequestError('No valid settings to update');
    }

    // Upsert settings
    const statements = updates.map(({ key, value }) => {
      return db
        .prepare(
          `
        INSERT INTO org_settings (id, organization_id, setting_key, setting_value, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, setting_key)
        DO UPDATE SET setting_value = ?, updated_by = ?, updated_at = datetime("now")
      `
        )
        .bind(crypto.randomUUID(), organizationId, key, value, userId, value, userId);
    });

    await db.batch(statements);

    return c.json({ message: 'Settings updated successfully' });
  } catch (error) {
    if (error.status) throw error;
    console.error('Update organization settings error:', error);
    return c.json({ error: 'Failed to update organization settings' }, 500);
  }
});

/**
 * GET /api/organization/ai-config
 * Get AI configuration (without exposing API key)
 */
settingsRouter.get('/ai-config', requireReadonly(), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const config = await db
      .prepare(
        `
      SELECT provider, model_preference, is_enabled, (api_key_encrypted IS NOT NULL) as has_key
      FROM org_ai_config WHERE organization_id = ?
    `
      )
      .bind(organizationId)
      .first();

    return c.json({
      aiConfig: config
        ? {
            provider: config.provider,
            modelPreference: config.model_preference,
            isEnabled: Boolean(config.is_enabled),
            hasApiKey: Boolean(config.has_key),
          }
        : {
            provider: 'anthropic',
            modelPreference: null,
            isEnabled: false,
            hasApiKey: false,
          },
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
settingsRouter.put('/ai-config', requireAdmin(), auditLog('update', 'ai-config'), async (c) => {
  // Delegate to the shared implementation in settings.js
  // This endpoint is kept for backward compatibility but uses the same logic
  const { upsertAiConfig } = await import('../settings.js');
  return upsertAiConfig(c);
});
