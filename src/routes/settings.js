import { Hono } from 'hono';

// Import services (legacy KV mode)
import {
  getSettings as getSettingsKV,
  updateSettings as updateSettingsKV,
} from '../services/kvService';

// Import utilities
import { validateSettings } from '../utils/validation';
import { badRequestError } from '../middleware/errorHandler';
import { auditLog, requireReadonly, requireAdmin } from '../middleware/tenant';
import {
  permissions,
  encryptSensitiveData,
  decryptSensitiveData,
  getEncryptionSecret,
} from '../utils/crypto';

import { getDB, isMultiTenantMode } from '../utils/routeHelpers';

// Create router
const settingsRouter = new Hono();

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
settingsRouter.get('/', requireReadonly(), async (c) => {
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
settingsRouter.post('/', requireAdmin(), auditLog('update', 'settings'), async (c) => {
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

    return c.json(settings);
  }

  // Legacy mode: use KV
  const updatedSettings = await updateSettingsKV(c.env, body);
  return c.json(updatedSettings);
});

/**
 * GET /api/settings/ai
 * Get AI configuration (without exposing API key)
 */
settingsRouter.get('/ai', async (c) => {
  // Check environment-level API keys (available as fallback)
  const envKeys = {
    anthropic: Boolean(c.env.ANTHROPIC_API_KEY),
    openai: Boolean(c.env.OPENAI_API_KEY),
    google: Boolean(c.env.GOOGLE_API_KEY),
  };

  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const config = await db
      .prepare(
        `
      SELECT provider, model_preference, is_enabled, api_key_encrypted FROM org_ai_config WHERE organization_id = ?
    `
      )
      .bind(organizationId)
      .first();

    const org = await db
      .prepare('SELECT ai_addon_active FROM organizations WHERE id = ?')
      .bind(organizationId)
      .first();
    const aiAddonActive = Boolean(org?.ai_addon_active);

    const activeProvider = config?.provider || 'anthropic';
    const hasOrgKey = Boolean(config?.api_key_encrypted);

    return c.json({
      provider: activeProvider,
      modelPreference: config?.model_preference || null,
      isEnabled: Boolean(config?.is_enabled),
      hasApiKey: hasOrgKey,
      // Show which providers have keys configured (org-level or env-level)
      availableProviders: {
        anthropic: hasOrgKey && activeProvider === 'anthropic' ? true : envKeys.anthropic,
        openai: hasOrgKey && activeProvider === 'openai' ? true : envKeys.openai,
        google: hasOrgKey && activeProvider === 'google' ? true : envKeys.google,
      },
      // Indicate the source of the active key
      keySource: hasOrgKey ? 'organization' : envKeys[activeProvider] ? 'environment' : 'none',
      aiAddonActive,
    });
  }

  // Legacy mode: check environment variables
  const hasAnyKey = envKeys.anthropic || envKeys.openai || envKeys.google;
  const activeProvider = envKeys.anthropic
    ? 'anthropic'
    : envKeys.openai
      ? 'openai'
      : envKeys.google
        ? 'google'
        : 'anthropic';

  return c.json({
    provider: activeProvider,
    modelPreference: null,
    isEnabled: hasAnyKey,
    hasApiKey: envKeys[activeProvider],
    availableProviders: envKeys,
    keySource: hasAnyKey ? 'environment' : 'none',
    aiAddonActive: true,
  });
});

/**
 * POST /api/settings/ai
 * Update AI configuration
 */
/**
 * Shared AI config upsert logic — used by both POST /settings/ai and PUT /organization/ai-config
 */
export async function upsertAiConfig(c) {
  const body = await c.req.json();

  if (!isMultiTenantMode(c)) {
    return c.json(
      {
        error: 'AI configuration is managed via environment variables in legacy mode',
        message: 'Set ANTHROPIC_API_KEY in your environment',
      },
      400
    );
  }

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const userId = c.get('userId');

  const { provider, apiKey, modelPreference, isEnabled } = body;

  // Validate provider
  const validProviders = ['anthropic', 'openai', 'google'];
  if (provider && !validProviders.includes(provider)) {
    throw badRequestError('Invalid AI provider');
  }

  // Check if config exists
  const existing = await db
    .prepare(
      `
    SELECT id, provider FROM org_ai_config WHERE organization_id = ?
  `
    )
    .bind(organizationId)
    .first();

  if (existing) {
    const updates = [];
    const params = [];

    const providerChanging = provider !== undefined && provider !== existing.provider;

    if (provider !== undefined) {
      updates.push('provider = ?');
      params.push(provider);
    }

    // If the provider is changing and no new key was supplied, clear the old key
    // so the stale key from a different provider is never sent to the wrong API.
    if (providerChanging && apiKey === undefined) {
      updates.push('api_key_encrypted = NULL');
      updates.push('is_enabled = 0');
    }

    if (apiKey !== undefined) {
      const encSecret = getEncryptionSecret(c.env);
      if (!encSecret) {
        return c.json({ error: 'Server configuration error - encryption not available' }, 500);
      }
      const encryptedApiKey = await encryptSensitiveData(apiKey, encSecret);
      updates.push('api_key_encrypted = ?');
      params.push(encryptedApiKey);
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

      await db
        .prepare(
          `
        UPDATE org_ai_config SET ${updates.join(', ')} WHERE organization_id = ?
      `
        )
        .bind(...params)
        .run();
    }
  } else {
    let encryptedApiKey = null;
    if (apiKey) {
      const encSecret = getEncryptionSecret(c.env);
      if (!encSecret) {
        return c.json({ error: 'Server configuration error - encryption not available' }, 500);
      }
      encryptedApiKey = await encryptSensitiveData(apiKey, encSecret);
    }

    await db
      .prepare(
        `
      INSERT INTO org_ai_config (id, organization_id, provider, api_key_encrypted, model_preference, is_enabled, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
      )
      .bind(
        crypto.randomUUID(),
        organizationId,
        provider || 'anthropic',
        encryptedApiKey,
        modelPreference || null,
        isEnabled ? 1 : 0,
        userId
      )
      .run();
  }

  // Fetch updated config
  const config = await db
    .prepare(
      `
    SELECT provider, model_preference, is_enabled, api_key_encrypted FROM org_ai_config WHERE organization_id = ?
  `
    )
    .bind(organizationId)
    .first();

  const envKeys = {
    anthropic: Boolean(c.env.ANTHROPIC_API_KEY),
    openai: Boolean(c.env.OPENAI_API_KEY),
    google: Boolean(c.env.GOOGLE_API_KEY),
  };

  const activeProvider = config?.provider || 'anthropic';
  const hasOrgKey = Boolean(config?.api_key_encrypted);

  return c.json({
    provider: activeProvider,
    modelPreference: config?.model_preference || null,
    isEnabled: Boolean(config?.is_enabled),
    hasApiKey: hasOrgKey,
    availableProviders: {
      anthropic: hasOrgKey && activeProvider === 'anthropic' ? true : envKeys.anthropic,
      openai: hasOrgKey && activeProvider === 'openai' ? true : envKeys.openai,
      google: hasOrgKey && activeProvider === 'google' ? true : envKeys.google,
    },
    keySource: hasOrgKey ? 'organization' : envKeys[activeProvider] ? 'environment' : 'none',
  });
}

settingsRouter.post('/ai', requireAdmin(), auditLog('update', 'ai_settings'), async (c) => {
  return upsertAiConfig(c);
});

/**
 * Shared helper: call provider models API and return [{id, name}] list.
 */
async function fetchProviderModels(provider, apiKey) {
  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.data || [])
      .filter((m) => /^(gpt-|o1|o3|o4)/.test(m.id))
      .sort((a, b) => b.created - a.created)
      .map((m) => ({ id: m.id, name: m.id }));
  }

  if (provider === 'google') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.models || [])
      .filter(
        (m) =>
          m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent')
      )
      .map((m) => ({
        id: m.name.replace('models/', ''),
        name: m.displayName || m.name.replace('models/', ''),
      }));
  }

  return null;
}

/**
 * GET /api/settings/ai/models
 * Fetch available models using the organization's stored API key.
 */
settingsRouter.get('/ai/models', requireAdmin(), async (c) => {
  if (!isMultiTenantMode(c)) {
    return c.json({ models: [] });
  }

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');

  const config = await db
    .prepare('SELECT provider, api_key_encrypted FROM org_ai_config WHERE organization_id = ?')
    .bind(organizationId)
    .first();

  if (!config?.api_key_encrypted) {
    return c.json({ models: [] });
  }

  const encSecret = getEncryptionSecret(c.env);
  if (!encSecret) {
    return c.json({ models: [] });
  }

  let apiKey;
  try {
    apiKey = await decryptSensitiveData(config.api_key_encrypted, encSecret);
  } catch {
    return c.json({ models: [] });
  }

  try {
    const models = await fetchProviderModels(config.provider || 'anthropic', apiKey);
    return c.json({ models: models || [] });
  } catch {
    return c.json({ models: [] });
  }
});

/**
 * POST /api/settings/ai/models
 * Fetch available models for a provider using the supplied API key.
 * Acts as a backend proxy to avoid CORS issues and keep keys server-side.
 */
settingsRouter.post('/ai/models', requireAdmin(), async (c) => {
  const { provider, apiKey } = await c.req.json();

  if (!provider || !apiKey) {
    throw badRequestError('provider and apiKey are required');
  }

  const validProviders = ['anthropic', 'openai', 'google'];
  if (!validProviders.includes(provider)) {
    throw badRequestError('Invalid provider');
  }

  try {
    const models = await fetchProviderModels(provider, apiKey);
    if (models === null) {
      return c.json({ error: 'Invalid API key' }, 400);
    }
    return c.json({ models });
  } catch {
    return c.json({ error: 'Failed to reach provider API' }, 502);
  }
});

export { settingsRouter };
