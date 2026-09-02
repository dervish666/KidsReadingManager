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
import { badRequestError, serverError, createError } from '../../middleware/errorHandler';
import { auditLog, requireAdmin } from '../../middleware/tenant';
import {
  encryptSensitiveData,
  decryptSensitiveData,
  getEncryptionSecret,
} from '../../utils/crypto';

import { getDB } from '../../utils/routeHelpers';

import { fetchProviderModels, envKeyFor } from './_shared.js';

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

  // Check platform-level keys (owner-managed fallback). All configured keys
  // count as available — inactive ones still serve as failover candidates
  // in the recommendations chain; only the active one is the primary.
  const platformKeys = await db
    .prepare('SELECT provider, is_active FROM platform_ai_keys WHERE api_key_encrypted IS NOT NULL')
    .all();
  const platformRows = platformKeys.results || [];
  const hasPlatformKey = platformRows.some((r) => r.is_active);
  const platformProvider = platformRows.find((r) => r.is_active)?.provider || null;
  const platformConfigured = (p) => platformRows.some((r) => r.provider === p);

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
        platformConfigured('anthropic') ||
        envKeys.anthropic,
      openai:
        (hasOrgKey && activeProvider === 'openai') ||
        platformConfigured('openai') ||
        envKeys.openai,
      google:
        (hasOrgKey && activeProvider === 'google') ||
        platformConfigured('google') ||
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
        throw serverError('Server configuration error - encryption not available');
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
        throw serverError('Server configuration error - encryption not available');
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

  // Check platform-level keys (owner-managed fallback) — same availability
  // semantics as GET /ai above: any configured platform key counts.
  const platformKeys = await db
    .prepare('SELECT provider, is_active FROM platform_ai_keys WHERE api_key_encrypted IS NOT NULL')
    .all();
  const platformRows = platformKeys.results || [];
  const hasPlatformKey = platformRows.some((r) => r.is_active);
  const platformProvider = platformRows.find((r) => r.is_active)?.provider || null;
  const platformConfigured = (p) => platformRows.some((r) => r.provider === p);

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
        platformConfigured('anthropic') ||
        envKeys.anthropic,
      openai:
        (hasOrgKey && activeProvider === 'openai') ||
        platformConfigured('openai') ||
        envKeys.openai,
      google:
        (hasOrgKey && activeProvider === 'google') ||
        platformConfigured('google') ||
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
 * GET /api/settings/ai/models?provider=anthropic|openai|google
 *
 * Live model list for the picker on the AI settings page. `provider`
 * defaults to the org's configured provider, else the active platform
 * provider. The key is resolved down the same ladder as `resolveAiConfig`:
 * the org's own key (when it is for this provider) → a platform key for this
 * provider → the environment variable. Whichever rung answers, the response
 * says which (`source`) so the client can label the list honestly.
 *
 * Listing models is deliberately NOT gated on the AI add-on. The add-on
 * gates *spending* (recommendations, the stats summary); model names are
 * not a secret, and the page already tells a school "Active key source:
 * Platform key" — showing them a picker of last year's models underneath
 * that line is worse than showing the real ones. The old gate is why every
 * school without the add-on saw the static fallback list.
 */
aiSettingsRouter.get('/ai/models', requireAdmin(), async (c) => {
  const db = getDB(c.env);
  const organizationId = c.get('organizationId');

  const validProviders = ['anthropic', 'openai', 'google'];
  const requested = c.req.query('provider') || null;
  if (requested && !validProviders.includes(requested)) {
    throw badRequestError('Invalid provider');
  }

  const config = await db
    .prepare('SELECT provider, api_key_encrypted FROM org_ai_config WHERE organization_id = ?')
    .bind(organizationId)
    .first();

  const platformKeys = await db
    .prepare(
      'SELECT provider, api_key_encrypted, is_active FROM platform_ai_keys WHERE api_key_encrypted IS NOT NULL'
    )
    .all();
  const platformRows = platformKeys.results || [];

  const provider =
    requested || config?.provider || platformRows.find((r) => r.is_active)?.provider || 'anthropic';

  let keyEncrypted = null;
  let source = 'none';
  if (config?.api_key_encrypted && config.provider === provider) {
    keyEncrypted = config.api_key_encrypted;
    source = 'organization';
  } else {
    const row = platformRows.find((r) => r.provider === provider);
    if (row) {
      keyEncrypted = row.api_key_encrypted;
      source = 'platform';
    }
  }

  let apiKey;
  if (keyEncrypted) {
    const encSecret = getEncryptionSecret(c.env);
    if (!encSecret) {
      return c.json({ provider, source: 'none', models: [] });
    }
    try {
      apiKey = await decryptSensitiveData(keyEncrypted, encSecret);
    } catch (err) {
      console.error('[ai/models] could not decrypt stored key', { provider, source, err });
      return c.json({ provider, source: 'none', models: [] });
    }
  } else {
    apiKey = envKeyFor(c.env, provider);
    if (apiKey) source = 'environment';
  }

  if (!apiKey) {
    return c.json({ provider, source: 'none', models: [] });
  }

  try {
    const models = await fetchProviderModels(provider, apiKey);
    return c.json({ provider, source, models: models || [] });
  } catch (err) {
    console.error('[ai/models] provider list failed', { provider, source, err });
    return c.json({ provider, source, models: [] });
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
      throw badRequestError('Invalid API key');
    }
    return c.json({ models });
  } catch {
    throw createError('Failed to reach provider API', 502);
  }
});

export { aiSettingsRouter };
