/**
 * Organization AI configuration.
 *
 * GET/POST /api/settings/ai plus the model-listing endpoints under
 * /api/settings/ai/models. `upsertAiConfig` is exported (and re-exported by
 * the settings entry router) because PUT /api/organization/ai-config shares
 * the same upsert logic.
 */

import { Hono } from 'hono';

// Import utilities
import { badRequestError } from '../../middleware/errorHandler';
import { auditLog, requireAdmin } from '../../middleware/tenant';
import {
  encryptSensitiveData,
  decryptSensitiveData,
  getEncryptionSecret,
} from '../../utils/crypto';

import { getDB, isMultiTenantMode } from '../../utils/routeHelpers';

import { fetchProviderModels } from './_shared.js';

const aiSettingsRouter = new Hono();

/**
 * GET /api/settings/ai
 * Get AI configuration (without exposing API key)
 */
aiSettingsRouter.get('/ai', async (c) => {
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

    // Check platform-level keys (owner-managed fallback)
    const platformKeyRow = await db
      .prepare('SELECT provider, is_active FROM platform_ai_keys WHERE is_active = 1')
      .first();
    const hasPlatformKey = Boolean(platformKeyRow);
    const platformProvider = platformKeyRow?.provider || null;

    const hasOrgKey = Boolean(config?.api_key_encrypted);
    // Use org provider if configured, otherwise fall back to platform provider
    const activeProvider = config?.provider || platformProvider || 'anthropic';

    return c.json({
      provider: activeProvider,
      modelPreference: config?.model_preference || null,
      isEnabled: Boolean(config?.is_enabled) || (hasPlatformKey && aiAddonActive),
      hasApiKey: hasOrgKey,
      // Show which providers have keys configured (org-level, platform-level, or env-level)
      availableProviders: {
        anthropic:
          (hasOrgKey && activeProvider === 'anthropic') ||
          (hasPlatformKey && platformProvider === 'anthropic') ||
          envKeys.anthropic,
        openai:
          (hasOrgKey && activeProvider === 'openai') ||
          (hasPlatformKey && platformProvider === 'openai') ||
          envKeys.openai,
        google:
          (hasOrgKey && activeProvider === 'google') ||
          (hasPlatformKey && platformProvider === 'google') ||
          envKeys.google,
      },
      // Indicate the source of the active key
      keySource: hasOrgKey
        ? 'organization'
        : hasPlatformKey
          ? 'platform'
          : envKeys[activeProvider]
            ? 'environment'
            : 'none',
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

  // Check platform-level keys (owner-managed fallback)
  const platformKeyRow = await db
    .prepare('SELECT provider, is_active FROM platform_ai_keys WHERE is_active = 1')
    .first();
  const hasPlatformKey = Boolean(platformKeyRow);
  const platformProvider = platformKeyRow?.provider || null;

  const hasOrgKey = Boolean(config?.api_key_encrypted);
  const activeProvider = config?.provider || platformProvider || 'anthropic';

  const org = await db
    .prepare('SELECT ai_addon_active FROM organizations WHERE id = ?')
    .bind(organizationId)
    .first();
  const aiAddonActive = Boolean(org?.ai_addon_active);

  return c.json({
    provider: activeProvider,
    modelPreference: config?.model_preference || null,
    isEnabled: Boolean(config?.is_enabled) || (hasPlatformKey && aiAddonActive),
    hasApiKey: hasOrgKey,
    availableProviders: {
      anthropic:
        (hasOrgKey && activeProvider === 'anthropic') ||
        (hasPlatformKey && platformProvider === 'anthropic') ||
        envKeys.anthropic,
      openai:
        (hasOrgKey && activeProvider === 'openai') ||
        (hasPlatformKey && platformProvider === 'openai') ||
        envKeys.openai,
      google:
        (hasOrgKey && activeProvider === 'google') ||
        (hasPlatformKey && platformProvider === 'google') ||
        envKeys.google,
    },
    keySource: hasOrgKey
      ? 'organization'
      : hasPlatformKey
        ? 'platform'
        : envKeys[activeProvider]
          ? 'environment'
          : 'none',
    aiAddonActive,
  });
}

aiSettingsRouter.post('/ai', requireAdmin(), auditLog('update', 'ai_settings'), async (c) => {
  return upsertAiConfig(c);
});

/**
 * GET /api/settings/ai/models
 * Fetch available models using the organization's stored API key.
 */
aiSettingsRouter.get('/ai/models', requireAdmin(), async (c) => {
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
aiSettingsRouter.post('/ai/models', requireAdmin(), async (c) => {
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

export { aiSettingsRouter };
