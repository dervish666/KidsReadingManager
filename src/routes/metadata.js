import { Hono } from 'hono';
import { requireOwner, requireAdmin, auditLog } from '../middleware/tenant';
import { badRequestError } from '../middleware/errorHandler';
import { encryptSensitiveData, decryptSensitiveData } from '../utils/crypto';
import { requireDB } from '../utils/routeHelpers';
import { processJobBatch } from '../services/metadataService';

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

// --- Jobs Endpoints (Admin+) ---

/**
 * GET /api/metadata/jobs
 * List recent enrichment jobs.
 * Owner sees all; admin sees own org only.
 */
metadataRouter.get('/jobs', requireAdmin(), async (c) => {
  const db = requireDB(c.env);
  const userRole = c.get('userRole');
  const organizationId = c.get('organizationId');

  let query, bindings;
  if (userRole === 'owner') {
    query = `SELECT * FROM metadata_jobs ORDER BY created_at DESC LIMIT 20`;
    bindings = [];
  } else {
    query = `SELECT * FROM metadata_jobs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 20`;
    bindings = [organizationId];
  }

  const result = bindings.length
    ? await db.prepare(query).bind(...bindings).all()
    : await db.prepare(query).all();

  const jobs = (result.results || []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    jobType: row.job_type,
    status: row.status,
    totalBooks: row.total_books,
    processedBooks: row.processed_books,
    enrichedBooks: row.enriched_books,
    errorCount: row.error_count,
    includeCovers: Boolean(row.include_covers),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return c.json({ jobs });
});

/**
 * DELETE /api/metadata/jobs/:id
 * Cancel a running job (set status to paused).
 * Owner can cancel any job. Admin can only cancel jobs for their own org.
 */
metadataRouter.delete('/jobs/:id', requireAdmin(), async (c) => {
  const db = requireDB(c.env);
  const { id } = c.req.param();
  const userRole = c.get('userRole');
  const organizationId = c.get('organizationId');

  // Admin: verify job belongs to their org
  if (userRole !== 'owner') {
    const job = await db
      .prepare('SELECT organization_id FROM metadata_jobs WHERE id = ?')
      .bind(id)
      .first();
    if (!job || job.organization_id !== organizationId) {
      return c.json({ error: 'Job not found' }, 404);
    }
  }

  await db
    .prepare(
      "UPDATE metadata_jobs SET status = 'paused', updated_at = datetime('now') WHERE id = ? AND status IN ('pending', 'running')",
    )
    .bind(id)
    .run();

  return c.json({ success: true });
});

// --- Enrich Endpoint (Admin+) ---

/**
 * POST /api/metadata/enrich
 * Create or advance an enrichment job.
 * Owner: any org or all orgs, fill_missing or refresh_all.
 * Admin: own org only, fill_missing only.
 */
metadataRouter.post('/enrich', requireAdmin(), async (c) => {
  const db = requireDB(c.env);
  const userRole = c.get('userRole');
  const callerOrgId = c.get('organizationId');
  const userId = c.get('userId');
  const jwtSecret = c.env.JWT_SECRET;
  const body = await c.req.json();

  // --- Permission enforcement ---
  let organizationId = body.organizationId || null;
  let jobType = body.jobType || 'fill_missing';
  const includeCovers = body.includeCovers !== false;

  if (userRole !== 'owner') {
    // Admin: force own org, force fill_missing
    organizationId = callerOrgId;
    if (jobType !== 'fill_missing') {
      return c.json({ error: 'Only fill_missing is available for admin users' }, 403);
    }
  }

  // --- Concurrency guard: only one running job at a time ---
  const runningJob = await db
    .prepare("SELECT id FROM metadata_jobs WHERE status IN ('pending', 'running') LIMIT 1")
    .first();

  if (runningJob && runningJob.id !== body.jobId) {
    // Redact job ID for admins (may belong to a different org)
    const responseJobId = userRole === 'owner' ? runningJob.id : undefined;
    return c.json(
      { error: 'Another enrichment job is already running', activeJobId: responseJobId },
      409,
    );
  }

  // --- Job creation (no jobId) ---
  if (!body.jobId) {
    // Count eligible books
    let countQuery, countBindings;
    if (jobType === 'fill_missing') {
      if (organizationId) {
        countQuery = `
          SELECT COUNT(*) as count FROM books b
          INNER JOIN org_book_selections obs ON b.id = obs.book_id
          WHERE obs.organization_id = ? AND obs.is_available = 1
            AND (b.author IS NULL OR b.author = '' OR LOWER(b.author) = 'unknown'
              OR b.description IS NULL OR b.description = ''
              OR b.isbn IS NULL OR b.isbn = ''
              OR b.page_count IS NULL
              OR b.publication_year IS NULL
              OR b.series_name IS NULL
              OR b.genre_ids IS NULL OR b.genre_ids = '' OR b.genre_ids = '[]')
        `;
        countBindings = [organizationId];
      } else {
        countQuery = `
          SELECT COUNT(*) as count FROM books
          WHERE author IS NULL OR author = '' OR LOWER(author) = 'unknown'
            OR description IS NULL OR description = ''
            OR isbn IS NULL OR isbn = ''
            OR page_count IS NULL
            OR publication_year IS NULL
            OR series_name IS NULL
            OR genre_ids IS NULL OR genre_ids = '' OR genre_ids = '[]'
        `;
        countBindings = [];
      }
    } else {
      // refresh_all
      if (organizationId) {
        countQuery = `
          SELECT COUNT(*) as count FROM books b
          INNER JOIN org_book_selections obs ON b.id = obs.book_id
          WHERE obs.organization_id = ? AND obs.is_available = 1
        `;
        countBindings = [organizationId];
      } else {
        countQuery = 'SELECT COUNT(*) as count FROM books';
        countBindings = [];
      }
    }

    const countRow = countBindings.length
      ? await db.prepare(countQuery).bind(...countBindings).first()
      : await db.prepare(countQuery).first();

    const totalBooks = countRow?.count || 0;
    const jobId = crypto.randomUUID();

    const background = body.background ? 1 : 0;

    await db
      .prepare(
        `
      INSERT INTO metadata_jobs (id, organization_id, job_type, status, total_books, include_covers, background, created_by)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
    `,
      )
      .bind(jobId, organizationId, jobType, totalBooks, includeCovers ? 1 : 0, background, userId)
      .run();

    return c.json({
      jobId,
      status: 'pending',
      totalBooks,
      processedBooks: 0,
      enrichedBooks: 0,
      errorCount: 0,
      currentBook: null,
      done: totalBooks === 0,
    });
  }

  // --- Batch processing (with jobId) ---
  const job = await db
    .prepare('SELECT * FROM metadata_jobs WHERE id = ?')
    .bind(body.jobId)
    .first();
  if (!job) return c.json({ error: 'Job not found' }, 404);
  if (job.status === 'paused' || job.status === 'completed' || job.status === 'failed') {
    return c.json({ error: `Job is ${job.status}` }, 400);
  }

  // Load config with decrypted keys
  const config = await getConfigWithKeys(db, jwtSecret);
  if (!config) return c.json({ error: 'Metadata configuration not found' }, 500);
  config.fetchCovers = job.include_covers && config.fetchCovers;

  try {
    const result = await processJobBatch(db, job, config, {
      r2Bucket: c.env.BOOK_COVERS,
      waitUntil: c.executionCtx?.waitUntil?.bind(c.executionCtx),
    });

    return c.json({
      jobId: job.id,
      status: result.jobStatus,
      totalBooks: job.total_books,
      processedBooks: result.processedBooks,
      enrichedBooks: result.enrichedBooks,
      errorCount: result.errorCount,
      currentBook: result.currentBook,
      done: result.done,
    });
  } catch (err) {
    console.error('Enrich batch error:', err);
    try {
      await db.prepare(
        "UPDATE metadata_jobs SET status = 'failed', updated_at = datetime('now') WHERE id = ?"
      ).bind(job.id).run();
    } catch { /* best effort */ }
    return c.json({ error: 'Batch processing failed: ' + (err.message || 'unknown error'), jobId: job.id, status: 'failed', done: true }, 500);
  }
});

export { metadataRouter, getConfigWithKeys };
