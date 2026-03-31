import { Hono } from 'hono';
import { requireOwner, requireAdmin, auditLog } from '../middleware/tenant';
import { badRequestError } from '../middleware/errorHandler';
import { encryptSensitiveData, decryptSensitiveData } from '../utils/crypto';
import { requireDB } from '../utils/routeHelpers';
import { enrichBook, processBatch } from '../services/metadataService';

const metadataRouter = new Hono();

// --- Helpers ---

async function getConfig(db) {
  const row = await db.prepare('SELECT * FROM metadata_config WHERE id = ?').bind('default').first();
  if (!row) return null;
  return {
    providerChain: JSON.parse(row.provider_chain),
    hasHardcoverApiKey: Boolean(row.hardcover_api_key_encrypted),
    hasGoogleBooksApiKey: Boolean(row.google_books_api_key_encrypted),
    rateLimitDelayMs: row.rate_limit_delay_ms,
    batchSize: row.batch_size,
    fetchCovers: Boolean(row.fetch_covers),
  };
}

async function getConfigWithKeys(db, jwtSecret) {
  const row = await db.prepare('SELECT * FROM metadata_config WHERE id = ?').bind('default').first();
  if (!row) return null;

  let hardcoverApiKey = null;
  let googleBooksApiKey = null;

  if (row.hardcover_api_key_encrypted && jwtSecret) {
    try {
      hardcoverApiKey = await decryptSensitiveData(row.hardcover_api_key_encrypted, jwtSecret);
    } catch {
      /* plaintext or corrupt — ignore */
    }
  }
  if (row.google_books_api_key_encrypted && jwtSecret) {
    try {
      googleBooksApiKey = await decryptSensitiveData(row.google_books_api_key_encrypted, jwtSecret);
    } catch {
      /* plaintext or corrupt — ignore */
    }
  }

  return {
    providerChain: JSON.parse(row.provider_chain),
    hardcoverApiKey,
    googleBooksApiKey,
    rateLimitDelayMs: row.rate_limit_delay_ms,
    batchSize: row.batch_size,
    fetchCovers: Boolean(row.fetch_covers),
  };
}

// --- Config Endpoints (Owner Only) ---

/**
 * GET /api/metadata/config
 * Read cascade configuration (API keys redacted to booleans).
 */
metadataRouter.get('/config', requireOwner(), async (c) => {
  const db = requireDB(c.env);
  const config = await getConfig(db);
  return c.json(config || {});
});

/**
 * PUT /api/metadata/config
 * Update cascade configuration.
 */
metadataRouter.put('/config', requireOwner(), auditLog('update', 'metadata_config'), async (c) => {
  const db = requireDB(c.env);
  const body = await c.req.json();
  const jwtSecret = c.env.JWT_SECRET;
  const userId = c.get('userId');

  // Validate provider chain if provided
  if (body.providerChain !== undefined) {
    const validProviders = ['hardcover', 'googlebooks', 'openlibrary'];
    if (
      !Array.isArray(body.providerChain) ||
      !body.providerChain.every((p) => validProviders.includes(p))
    ) {
      throw badRequestError('Invalid provider chain');
    }
  }

  if (body.rateLimitDelayMs !== undefined) {
    const delay = parseInt(body.rateLimitDelayMs, 10);
    if (isNaN(delay) || delay < 500 || delay > 5000)
      throw badRequestError('rateLimitDelayMs must be 500-5000');
  }

  if (body.batchSize !== undefined) {
    const size = parseInt(body.batchSize, 10);
    if (isNaN(size) || size < 5 || size > 50) throw badRequestError('batchSize must be 5-50');
  }

  // Encrypt API keys if provided
  let hardcoverEncrypted = undefined;
  if (body.hardcoverApiKey !== undefined && jwtSecret) {
    hardcoverEncrypted = body.hardcoverApiKey
      ? await encryptSensitiveData(body.hardcoverApiKey, jwtSecret)
      : null;
  }

  let googleEncrypted = undefined;
  if (body.googleBooksApiKey !== undefined && jwtSecret) {
    googleEncrypted = body.googleBooksApiKey
      ? await encryptSensitiveData(body.googleBooksApiKey, jwtSecret)
      : null;
  }

  // UPSERT: INSERT ... ON CONFLICT DO UPDATE
  // Read current values first so we only overwrite what was sent
  const current = await db
    .prepare('SELECT * FROM metadata_config WHERE id = ?')
    .bind('default')
    .first();

  await db
    .prepare(
      `
    INSERT INTO metadata_config (id, provider_chain, hardcover_api_key_encrypted, google_books_api_key_encrypted,
      rate_limit_delay_ms, batch_size, fetch_covers, updated_by, updated_at)
    VALUES ('default', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      provider_chain = excluded.provider_chain,
      hardcover_api_key_encrypted = excluded.hardcover_api_key_encrypted,
      google_books_api_key_encrypted = excluded.google_books_api_key_encrypted,
      rate_limit_delay_ms = excluded.rate_limit_delay_ms,
      batch_size = excluded.batch_size,
      fetch_covers = excluded.fetch_covers,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `,
    )
    .bind(
      body.providerChain !== undefined
        ? JSON.stringify(body.providerChain)
        : current?.provider_chain || '["hardcover","googlebooks","openlibrary"]',
      hardcoverEncrypted !== undefined
        ? hardcoverEncrypted
        : current?.hardcover_api_key_encrypted || null,
      googleEncrypted !== undefined
        ? googleEncrypted
        : current?.google_books_api_key_encrypted || null,
      body.rateLimitDelayMs !== undefined
        ? parseInt(body.rateLimitDelayMs, 10)
        : current?.rate_limit_delay_ms || 1500,
      body.batchSize !== undefined ? parseInt(body.batchSize, 10) : current?.batch_size || 10,
      body.fetchCovers !== undefined ? (body.fetchCovers ? 1 : 0) : (current?.fetch_covers ?? 1),
      userId,
    )
    .run();

  const config = await getConfig(db);
  return c.json(config);
});

export { metadataRouter, getConfigWithKeys };
