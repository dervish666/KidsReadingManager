// ============================================================================
// Platform AI Keys (owner-only)
// ============================================================================

import { Hono } from 'hono';

// Import utilities
import { badRequestError } from '../../middleware/errorHandler';
import { auditLog, requireOwner } from '../../middleware/tenant';
import {
  encryptSensitiveData,
  decryptSensitiveData,
  getEncryptionSecret,
} from '../../utils/crypto';

import { getDB } from '../../utils/routeHelpers';

import { fetchProviderModels } from './_shared.js';

const platformAiRouter = new Hono();

const VALID_AI_PROVIDERS = ['anthropic', 'openai', 'google'];

/**
 * Build the standard response shape for platform AI key endpoints.
 */
function buildPlatformAiResponse(rows) {
  const keys = {};
  let activeProvider = null;

  for (const provider of VALID_AI_PROVIDERS) {
    const row = rows.find((r) => r.provider === provider);
    keys[provider] = {
      configured: Boolean(row?.api_key_encrypted),
      isActive: Boolean(row?.is_active),
      updatedAt: row?.updated_at || null,
      modelPreference: row?.model_preference || null,
    };
    if (row?.is_active) {
      activeProvider = provider;
    }
  }

  return { keys, activeProvider };
}

/**
 * GET /api/settings/platform-ai
 * List platform AI key status (never returns actual keys).
 */
platformAiRouter.get('/platform-ai', requireOwner(), async (c) => {
  const db = getDB(c.env);

  const result = await db.prepare('SELECT * FROM platform_ai_keys').all();

  return c.json(buildPlatformAiResponse(result.results || []));
});

/**
 * PUT /api/settings/platform-ai
 * Upsert a platform AI key and/or set the active provider.
 */
platformAiRouter.put(
  '/platform-ai',
  requireOwner(),
  auditLog('update', 'platform_ai_keys'),
  async (c) => {
    const db = getDB(c.env);
    const userId = c.get('userId');
    const body = await c.req.json();
    const { provider, apiKey, setActive } = body;

    // Validate provider
    if (!provider || !VALID_AI_PROVIDERS.includes(provider)) {
      throw badRequestError('Invalid AI provider. Must be one of: anthropic, openai, google');
    }

    // Validate apiKey length if provided
    if (apiKey !== undefined) {
      if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 500) {
        throw badRequestError('API key must be a string between 10 and 500 characters');
      }
    }

    const modelPrefProvided = 'modelPreference' in body;
    const modelPrefValue = modelPrefProvided ? body.modelPreference || null : undefined;

    if (setActive && apiKey) {
      // Encrypt the key and atomically: clear others + upsert with is_active=1
      const encSecret = getEncryptionSecret(c.env);
      const encrypted = await encryptSensitiveData(apiKey, encSecret);

      const clearStmt = db
        .prepare('UPDATE platform_ai_keys SET is_active = 0 WHERE provider != ?')
        .bind(provider);

      const upsertSql = modelPrefProvided
        ? `INSERT INTO platform_ai_keys (provider, api_key_encrypted, is_active, model_preference, updated_at, updated_by)
           VALUES (?, ?, 1, ?, datetime("now"), ?)
           ON CONFLICT(provider) DO UPDATE SET
             api_key_encrypted = excluded.api_key_encrypted,
             is_active = excluded.is_active,
             model_preference = excluded.model_preference,
             updated_at = excluded.updated_at,
             updated_by = excluded.updated_by`
        : `INSERT INTO platform_ai_keys (provider, api_key_encrypted, is_active, updated_at, updated_by)
           VALUES (?, ?, 1, datetime("now"), ?)
           ON CONFLICT(provider) DO UPDATE SET
             api_key_encrypted = excluded.api_key_encrypted,
             is_active = excluded.is_active,
             updated_at = excluded.updated_at,
             updated_by = excluded.updated_by`;

      const upsertStmt = modelPrefProvided
        ? db.prepare(upsertSql).bind(provider, encrypted, modelPrefValue, userId)
        : db.prepare(upsertSql).bind(provider, encrypted, userId);

      await db.batch([clearStmt, upsertStmt]);
    } else if (setActive && !apiKey) {
      // Just activate an existing key — no new key supplied
      const clearStmt = db
        .prepare('UPDATE platform_ai_keys SET is_active = 0 WHERE provider != ?')
        .bind(provider);

      const activateSql = modelPrefProvided
        ? `UPDATE platform_ai_keys SET is_active = 1, model_preference = ?, updated_at = datetime("now"), updated_by = ? WHERE provider = ?`
        : `UPDATE platform_ai_keys SET is_active = 1, updated_at = datetime("now"), updated_by = ? WHERE provider = ?`;

      const activateStmt = modelPrefProvided
        ? db.prepare(activateSql).bind(modelPrefValue, userId, provider)
        : db.prepare(activateSql).bind(userId, provider);

      await db.batch([clearStmt, activateStmt]);
    } else if (apiKey) {
      // Store/update key without changing active status
      const encSecret = getEncryptionSecret(c.env);
      const encrypted = await encryptSensitiveData(apiKey, encSecret);

      const storeSql = modelPrefProvided
        ? `INSERT INTO platform_ai_keys (provider, api_key_encrypted, is_active, model_preference, updated_at, updated_by)
           VALUES (?, ?, 0, ?, datetime("now"), ?)
           ON CONFLICT(provider) DO UPDATE SET
             api_key_encrypted = excluded.api_key_encrypted,
             is_active = excluded.is_active,
             model_preference = excluded.model_preference,
             updated_at = excluded.updated_at,
             updated_by = excluded.updated_by`
        : `INSERT INTO platform_ai_keys (provider, api_key_encrypted, is_active, updated_at, updated_by)
           VALUES (?, ?, 0, datetime("now"), ?)
           ON CONFLICT(provider) DO UPDATE SET
             api_key_encrypted = excluded.api_key_encrypted,
             is_active = excluded.is_active,
             updated_at = excluded.updated_at,
             updated_by = excluded.updated_by`;

      const bindArgs = modelPrefProvided
        ? [provider, encrypted, modelPrefValue, userId]
        : [provider, encrypted, userId];
      await db
        .prepare(storeSql)
        .bind(...bindArgs)
        .run();
    }

    // Return current state
    const result = await db.prepare('SELECT * FROM platform_ai_keys').all();
    return c.json(buildPlatformAiResponse(result.results || []));
  }
);

/**
 * GET /api/settings/platform-ai/models
 * Fetch available models using the active platform key.
 */
platformAiRouter.get('/platform-ai/models', requireOwner(), async (c) => {
  const db = getDB(c.env);

  const activeKey = await db
    .prepare('SELECT provider, api_key_encrypted FROM platform_ai_keys WHERE is_active = 1')
    .first();

  if (!activeKey?.api_key_encrypted) {
    return c.json({ models: [] });
  }

  const encSecret = getEncryptionSecret(c.env);
  if (!encSecret) {
    return c.json({ models: [] });
  }

  let apiKey;
  try {
    apiKey = await decryptSensitiveData(activeKey.api_key_encrypted, encSecret);
  } catch {
    return c.json({ models: [] });
  }

  try {
    const models = await fetchProviderModels(activeKey.provider, apiKey);
    return c.json({ models: models || [] });
  } catch {
    return c.json({ models: [] });
  }
});

/**
 * DELETE /api/settings/platform-ai/:provider
 * Remove a platform AI key.
 */
platformAiRouter.delete(
  '/platform-ai/:provider',
  requireOwner(),
  auditLog('delete', 'platform_ai_keys'),
  async (c) => {
    const provider = c.req.param('provider');

    if (!VALID_AI_PROVIDERS.includes(provider)) {
      throw badRequestError('Invalid AI provider. Must be one of: anthropic, openai, google');
    }

    const db = getDB(c.env);
    await db.prepare('DELETE FROM platform_ai_keys WHERE provider = ?').bind(provider).run();

    return c.json({ success: true });
  }
);

export { platformAiRouter };
