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

// --- Status Endpoint (Admin+) ---

/**
 * GET /api/metadata/status
 * Enrichment status for caller's org.
 * Returns enriched/total counts and last job info.
 */
metadataRouter.get('/status', requireAdmin(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');

  // Count total books linked to this org
  const totalRow = await db
    .prepare(
      'SELECT COUNT(*) as count FROM org_book_selections WHERE organization_id = ? AND is_available = 1',
    )
    .bind(organizationId)
    .first();

  // Count books with "complete enough" metadata (author + description + isbn all non-empty)
  const enrichedRow = await db
    .prepare(
      `
    SELECT COUNT(*) as count FROM books b
    INNER JOIN org_book_selections obs ON b.id = obs.book_id
    WHERE obs.organization_id = ? AND obs.is_available = 1
      AND b.author IS NOT NULL AND b.author != '' AND LOWER(b.author) != 'unknown'
      AND b.description IS NOT NULL AND b.description != ''
      AND b.isbn IS NOT NULL AND b.isbn != ''
  `,
    )
    .bind(organizationId)
    .first();

  // Last completed job for this org (or global)
  const lastJob = await db
    .prepare(
      `
    SELECT created_at, enriched_books, processed_books FROM metadata_jobs
    WHERE (organization_id = ? OR organization_id IS NULL)
      AND status = 'completed'
    ORDER BY created_at DESC LIMIT 1
  `,
    )
    .bind(organizationId)
    .first();

  // Active job for this org
  const activeJob = await db
    .prepare(
      `
    SELECT id FROM metadata_jobs
    WHERE (organization_id = ? OR organization_id IS NULL)
      AND status IN ('pending', 'running')
    ORDER BY created_at DESC LIMIT 1
  `,
    )
    .bind(organizationId)
    .first();

  return c.json({
    totalBooks: totalRow?.count || 0,
    enrichedBooks: enrichedRow?.count || 0,
    lastJobDate: lastJob?.created_at || null,
    activeJobId: activeJob?.id || null,
  });
});

export { metadataRouter, getConfigWithKeys };
