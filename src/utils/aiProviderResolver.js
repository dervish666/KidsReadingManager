/**
 * AI provider resolution — shared by every feature that spends money on an
 * LLM call.
 *
 * Two distinct jobs live here, and they were previously inlined in
 * `routes/books/recommendations.js` as the only AI feature. They are extracted
 * because a second consumer (the Stats page AI summary) must resolve keys
 * *identically* — a school that has configured its own Anthropic key expects
 * every AI feature to use it, and an entitlement bug in one copy would not be
 * visible from the other.
 *
 * 1. `resolveAiConfig()` — pick the primary key, in strict precedence:
 *      Path 1  org_ai_config           (BYOK — school's own key, no add-on needed)
 *      Path 2  organizations.ai_addon_active MUST be set, then:
 *      Path 2a platform_ai_keys        (Tally's key, licensed by the add-on)
 *      Path 2b env vars                (transitional)
 *
 * 2. `buildFailoverChain()` — append the *other* configured keys after the
 *    primary so a transient 5xx/timeout on one provider doesn't 5xx the user.
 *
 * Note the asymmetry in Path 1 vs Path 2: BYOK deliberately bypasses the paid
 * add-on gate (the school is spending its own tokens), but NOT `subscriptionGate()`
 * in middleware/tenant.js, which still blocks a cancelled subscription.
 *
 * Whatever path answers, the model is passed through `clampToCheapModel`
 * (utils/aiModelTiers.js): only the provider's low-cost tier ever runs. The
 * pickers already filter to that tier, so a clamp here means a stored
 * preference pre-dates the rule or was written by hand — it is logged.
 */

import { decryptSensitiveData, getEncryptionSecret } from './crypto.js';
import { badRequestError } from '../middleware/errorHandler.js';
import { clampToCheapModel } from './aiModelTiers.js';

/**
 * Thrown when an organisation is not entitled to use the platform's AI key.
 * Carries `status: 403` so the global error handler renders it directly.
 *
 * The message is caller-supplied because it is user-facing and names the
 * feature the user just tried to use ("AI recommendations are not enabled…"
 * vs "AI summaries are not enabled…").
 */
export function aiNotEntitledError(message) {
  return Object.assign(new Error(message), { status: 403 });
}

const ENV_KEY_BY_PROVIDER = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
};

/**
 * Resolve the primary AI config for an organisation.
 *
 * @param {Object} params
 * @param {Object} params.db - D1 binding
 * @param {Object} params.env - Worker env (for encryption secret + env keys)
 * @param {string} params.organizationId
 * @param {string} params.notEntitledMessage - 403 body when the org has no
 *   BYOK key and no AI add-on. Name the feature the user just invoked.
 * @returns {Promise<{provider: string, apiKey: string, model: string|null, source: string}>}
 * @throws 403 when not entitled; 400 when entitled but nothing is configured,
 *   or when a stored key cannot be decrypted.
 */
export async function resolveAiConfig({ db, env, organizationId, notEntitledMessage }) {
  const encSecret = getEncryptionSecret(env);

  const dbConfig = await db
    .prepare(
      `
      SELECT provider, api_key_encrypted, model_preference, is_enabled
      FROM org_ai_config WHERE organization_id = ?
    `
    )
    .bind(organizationId)
    .first();

  // Path 1: School has their own API key configured
  if (dbConfig && dbConfig.is_enabled && dbConfig.api_key_encrypted) {
    try {
      const decryptedApiKey = await decryptSensitiveData(dbConfig.api_key_encrypted, encSecret);
      return {
        provider: dbConfig.provider || 'anthropic',
        apiKey: decryptedApiKey,
        model: safeModel(
          dbConfig.provider || 'anthropic',
          dbConfig.model_preference,
          'organization'
        ),
        source: 'organization',
      };
    } catch (decryptError) {
      console.error('Failed to decrypt API key:', decryptError.message);
      throw badRequestError('AI configuration error. Please check Settings.');
    }
  }

  // Path 2: Check if org has the paid AI addon
  const org = await db
    .prepare('SELECT ai_addon_active FROM organizations WHERE id = ?')
    .bind(organizationId)
    .first();

  if (!org?.ai_addon_active) {
    throw aiNotEntitledError(notEntitledMessage);
  }

  // Path 2a: Use owner's platform key
  const platformKey = await db
    .prepare(
      'SELECT provider, api_key_encrypted, model_preference FROM platform_ai_keys WHERE is_active = 1'
    )
    .first();

  if (platformKey?.api_key_encrypted) {
    try {
      const decryptedKey = await decryptSensitiveData(platformKey.api_key_encrypted, encSecret);
      return {
        provider: platformKey.provider,
        apiKey: decryptedKey,
        model: safeModel(platformKey.provider, platformKey.model_preference, 'platform'),
        source: 'platform',
      };
    } catch (decryptError) {
      console.error('Failed to decrypt platform API key:', decryptError.message);
      throw badRequestError('Platform AI configuration error. Contact the administrator.');
    }
  }

  // Path 2b: Tertiary fallback — env vars (transitional, remove after platform keys confirmed)
  const envProvider = env.ANTHROPIC_API_KEY
    ? 'anthropic'
    : env.OPENAI_API_KEY
      ? 'openai'
      : env.GOOGLE_API_KEY
        ? 'google'
        : null;

  if (!envProvider) {
    throw badRequestError('AI not configured. Contact your administrator.');
  }

  return {
    provider: envProvider,
    apiKey: env[ENV_KEY_BY_PROVIDER[envProvider]],
    model: safeModel(envProvider, null, 'environment'),
    source: 'environment',
  };
}

/**
 * Clamp a stored model preference to the low-cost tier, logging when it had
 * to change so a rogue row is visible rather than silently rewritten.
 */
function safeModel(provider, preference, source) {
  const { model, clamped } = clampToCheapModel(provider, preference);
  if (clamped) {
    console.warn(
      `[ai-config] ${source} preference "${preference}" for ${provider} is outside the low-cost tier; running ${model} instead`
    );
  }
  return model;
}

/**
 * Build the ordered failover chain. `primary` stays at index 0; every other
 * configured platform key, then every env key, is appended as a fallback for
 * a *transient* failure (5xx / timeout / malformed response).
 *
 * Note: platform/env failover means a school-key failure can fall through to
 * our platform spend — acceptable as a transient-outage handler, not a
 * routing default.
 *
 * Never throws: a failure to load fallbacks leaves the primary intact, because
 * a thinner chain is strictly better than no AI at all. Both failure paths log
 * loudly — a rotated ENCRYPTION_KEY silently thinning the chain is exactly the
 * kind of invisible degradation that hides until every provider is down.
 *
 * @param {Object} params
 * @param {Object} params.db
 * @param {Object} params.env
 * @param {Object} params.primary - Output of `resolveAiConfig`
 * @returns {Promise<Array<{provider: string, apiKey: string, model: string|null}>>}
 */
export async function buildFailoverChain({ db, env, primary }) {
  const encSecret = getEncryptionSecret(env);
  const configs = [primary];

  try {
    const platformKeyRows = await db
      .prepare(
        'SELECT provider, api_key_encrypted, model_preference FROM platform_ai_keys WHERE api_key_encrypted IS NOT NULL'
      )
      .all();
    for (const row of platformKeyRows.results || []) {
      if (configs.some((cfg) => cfg.provider === row.provider)) continue;
      try {
        const key = await decryptSensitiveData(row.api_key_encrypted, encSecret);
        configs.push({
          provider: row.provider,
          apiKey: key,
          model: safeModel(row.provider, row.model_preference, 'platform'),
        });
      } catch {
        // Undecryptable fallback key — skip it, the primary still works.
        // Warn so a rotated ENCRYPTION_KEY doesn't silently thin the chain.
        console.warn(`[ai-failover] skipping undecryptable platform key for ${row.provider}`);
      }
    }
  } catch (platformErr) {
    console.error('Failed to load platform failover keys:', platformErr.message);
  }

  for (const [provider, envKey] of Object.entries(ENV_KEY_BY_PROVIDER)) {
    const envApiKey = env[envKey];
    if (envApiKey && !configs.some((cfg) => cfg.provider === provider)) {
      configs.push({
        provider,
        apiKey: envApiKey,
        model: safeModel(provider, null, 'environment'),
      });
    }
  }

  return configs;
}
