/**
 * Organization settings CRUD.
 *
 * GET/POST /api/settings — read and upsert org-scoped settings (reading
 * status thresholds, timezone, academic year, bands, observations). The KV
 * cache invalidation for streak/band settings lives here with the only
 * handler that writes those keys.
 */

import { Hono } from 'hono';

// Import services (legacy KV mode)
import {
  getSettings as getSettingsKV,
  updateSettings as updateSettingsKV,
} from '../../services/kvService';

// Import utilities
import { validateSettings } from '../../utils/validation';
import { badRequestError } from '../../middleware/errorHandler';
import { auditLog, requireReadonly, requireAdmin } from '../../middleware/tenant';
import { permissions } from '../../utils/crypto';

import { getDB, isMultiTenantMode } from '../../utils/routeHelpers';
import { resolveBands } from '../../utils/readingBandDefinitions';

const orgSettingsRouter = new Hono();

/**
 * Default settings
 */
const defaultSettings = {
  readingStatusSettings: {
    recentlyReadDays: 3,
    needsAttentionDays: 7,
  },
  timezone: 'UTC',
  academicYear: new Date().getFullYear().toString(),
};

/**
 * GET /api/settings
 * Get application settings
 */
orgSettingsRouter.get('/', requireReadonly(), async (c) => {
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
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
    const settings = { ...defaultSettings };
    for (const row of result.results || []) {
      try {
        settings[row.setting_key] = JSON.parse(row.setting_value);
      } catch {
        settings[row.setting_key] = row.setting_value;
      }
    }

    // Always hand the client a canonical band list ({ name, color }) — resolving
    // the new `bands` setting, the legacy colour-only `bandColors`, or defaults —
    // so the UI never has to know which form an org stored.
    settings.bands = resolveBands(settings.bands || settings.bandColors);

    return c.json(settings);
  }

  // Legacy mode: use KV
  const settings = await getSettingsKV(c.env);
  return c.json(settings);
});

/**
 * POST /api/settings
 * Update application settings
 */
orgSettingsRouter.post('/', requireAdmin(), auditLog('update', 'settings'), async (c) => {
  const body = await c.req.json();

  // Validate settings
  const validation = validateSettings(body);
  if (!validation.isValid) {
    throw badRequestError(validation.errors.join(', '));
  }

  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');

    // Check permission
    const userRole = c.get('userRole');
    if (!permissions.canManageSettings(userRole)) {
      return c.json({ error: 'Permission denied' }, 403);
    }

    // Validate settings keys
    const allowedKeys = [
      'readingStatusSettings',
      'timezone',
      'academicYear',
      'defaultReadingLevel',
      'schoolName',
      'streakGracePeriodDays',
      'readsPerBand',
      'bandColors',
      'bands',
      'readingObservations',
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

    if (body.streakGracePeriodDays !== undefined && c.env.READING_MANAGER_KV) {
      await c.env.READING_MANAGER_KV.delete(`org-streak-settings:${organizationId}`);
    }

    if (
      body.readsPerBand !== undefined ||
      body.bandColors !== undefined ||
      body.bands !== undefined
    ) {
      try {
        await c.env.READING_MANAGER_KV?.delete(`org-band-settings-v2:${organizationId}`);
      } catch (err) {
        // Self-heals on the 1h TTL, but warn — a failed delete means admins
        // see stale band settings for up to an hour after saving.
        console.warn('[band-settings] KV cache invalidation failed:', err?.message);
      }
    }

    // Fetch updated settings
    const result = await db
      .prepare(
        `
      SELECT setting_key, setting_value FROM org_settings WHERE organization_id = ?
    `
      )
      .bind(organizationId)
      .all();

    const settings = { ...defaultSettings };
    for (const row of result.results || []) {
      try {
        settings[row.setting_key] = JSON.parse(row.setting_value);
      } catch {
        settings[row.setting_key] = row.setting_value;
      }
    }

    settings.bands = resolveBands(settings.bands || settings.bandColors);

    return c.json(settings);
  }

  // Legacy mode: use KV
  const updatedSettings = await updateSettingsKV(c.env, body);
  return c.json(updatedSettings);
});

export { orgSettingsRouter };
