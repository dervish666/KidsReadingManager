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

    await db
      .prepare(
        `
      INSERT INTO metadata_jobs (id, organization_id, job_type, status, total_books, include_covers, created_by)
      VALUES (?, ?, ?, 'pending', ?, ?, ?)
    `,
      )
      .bind(jobId, organizationId, jobType, totalBooks, includeCovers ? 1 : 0, userId)
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

  // Fetch next batch of books
  let booksQuery, booksBindings;
  const cursor = job.last_book_id || '';

  if (job.job_type === 'fill_missing') {
    if (job.organization_id) {
      booksQuery = `
        SELECT b.id, b.title, b.author, b.isbn, b.description, b.page_count, b.publication_year, b.series_name
        FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND obs.is_available = 1
          AND b.id > ?
          AND (b.author IS NULL OR b.author = '' OR LOWER(b.author) = 'unknown'
            OR b.description IS NULL OR b.description = ''
            OR b.isbn IS NULL OR b.isbn = ''
            OR b.page_count IS NULL
            OR b.publication_year IS NULL
            OR b.series_name IS NULL
            OR b.genre_ids IS NULL OR b.genre_ids = '' OR b.genre_ids = '[]')
        ORDER BY b.id LIMIT ?
      `;
      booksBindings = [job.organization_id, cursor, config.batchSize];
    } else {
      booksQuery = `
        SELECT id, title, author, isbn, description, page_count, publication_year, series_name FROM books
        WHERE id > ?
          AND (author IS NULL OR author = '' OR LOWER(author) = 'unknown'
            OR description IS NULL OR description = ''
            OR isbn IS NULL OR isbn = ''
            OR page_count IS NULL
            OR publication_year IS NULL
            OR series_name IS NULL
            OR genre_ids IS NULL OR genre_ids = '' OR genre_ids = '[]')
        ORDER BY id LIMIT ?
      `;
      booksBindings = [cursor, config.batchSize];
    }
  } else {
    // refresh_all
    if (job.organization_id) {
      booksQuery = `
        SELECT b.id, b.title, b.author, b.isbn FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND obs.is_available = 1 AND b.id > ?
        ORDER BY b.id LIMIT ?
      `;
      booksBindings = [job.organization_id, cursor, config.batchSize];
    } else {
      booksQuery = `SELECT id, title, author, isbn FROM books WHERE id > ? ORDER BY id LIMIT ?`;
      booksBindings = [cursor, config.batchSize];
    }
  }

  const booksResult = await db.prepare(booksQuery).bind(...booksBindings).all();
  const books = (booksResult.results || []).map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author || '',
    isbn: row.isbn || '',
  }));

  // No more books — job complete
  if (books.length === 0) {
    await db
      .prepare(
        "UPDATE metadata_jobs SET status = 'completed', updated_at = datetime('now') WHERE id = ?",
      )
      .bind(job.id)
      .run();

    return c.json({
      jobId: job.id,
      status: 'completed',
      totalBooks: job.total_books,
      processedBooks: job.processed_books,
      enrichedBooks: job.enriched_books,
      errorCount: job.error_count,
      currentBook: null,
      done: true,
    });
  }

  // Mark job as running
  if (job.status === 'pending') {
    await db
      .prepare(
        "UPDATE metadata_jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?",
      )
      .bind(job.id)
      .run();
  }

  // Process the batch
  const bookUpdates = [];
  const logEntries = [];
  let currentBook = '';

  const progress = await processBatch(books, config, {
    delayMs: config.rateLimitDelayMs,
    onBookResult: (bookId, merged, log) => {
      currentBook = books.find((b) => b.id === bookId)?.title || '';
      if (Object.values(merged).some((v) => v != null)) {
        bookUpdates.push({ bookId, merged });
      }
      for (const entry of log) {
        logEntries.push({
          bookId,
          provider: entry.provider,
          fields: entry.fields,
          coverUrl: merged.coverUrl,
        });
      }
    },
  });

  // --- Genre name-to-ID mapping ---
  // Providers return genre names (e.g. ["Fiction", "Animals"]).
  // The books table stores genre IDs (UUIDs) in genre_ids as JSON.
  // We need to resolve names to IDs, creating new genres as needed.
  // Genres are global (not org-scoped in the genres table).
  const genreNameToId = {};
  const existingGenres = await db.prepare('SELECT id, name FROM genres').all();
  for (const g of existingGenres.results || []) {
    genreNameToId[g.name.toLowerCase()] = g.id;
  }

  // Resolve genre names to IDs for each book, creating missing genres
  const genreCreateStatements = [];
  for (const { merged } of bookUpdates) {
    if (!merged.genres?.length) continue;
    const genreIds = [];
    for (const name of merged.genres) {
      const key = name.toLowerCase();
      if (!genreNameToId[key]) {
        const newId = crypto.randomUUID();
        genreNameToId[key] = newId;
        genreCreateStatements.push(
          db.prepare('INSERT OR IGNORE INTO genres (id, name) VALUES (?, ?)').bind(newId, name),
        );
      }
      genreIds.push(genreNameToId[key]);
    }
    // Replace genre names with resolved IDs
    merged.genreIds = genreIds;
  }

  // Create new genres first (in batches of 100)
  for (let i = 0; i < genreCreateStatements.length; i += 100) {
    await db.batch(genreCreateStatements.slice(i, i + 100));
  }

  // --- Apply book updates and metadata log ---
  const statements = [];

  for (const { bookId, merged } of bookUpdates) {
    if (job.job_type === 'fill_missing') {
      // Only update fields that are currently empty
      const conditionalSets = [];
      const conditionalParams = [];

      if (merged.author) {
        conditionalSets.push(
          "author = CASE WHEN author IS NULL OR author = '' OR LOWER(author) = 'unknown' THEN ? ELSE author END",
        );
        conditionalParams.push(merged.author);
      }
      if (merged.description) {
        conditionalSets.push(
          "description = CASE WHEN description IS NULL OR description = '' THEN ? ELSE description END",
        );
        conditionalParams.push(merged.description);
      }
      if (merged.isbn) {
        conditionalSets.push(
          "isbn = CASE WHEN isbn IS NULL OR isbn = '' THEN ? ELSE isbn END",
        );
        conditionalParams.push(merged.isbn);
      }
      if (merged.pageCount) {
        conditionalSets.push(
          'page_count = CASE WHEN page_count IS NULL THEN ? ELSE page_count END',
        );
        conditionalParams.push(merged.pageCount);
      }
      if (merged.publicationYear) {
        conditionalSets.push(
          'publication_year = CASE WHEN publication_year IS NULL THEN ? ELSE publication_year END',
        );
        conditionalParams.push(merged.publicationYear);
      }
      if (merged.seriesName) {
        conditionalSets.push(
          "series_name = CASE WHEN series_name IS NULL OR series_name = '' THEN ? ELSE series_name END",
        );
        conditionalParams.push(merged.seriesName);
      }
      if (merged.seriesNumber != null) {
        conditionalSets.push(
          'series_number = CASE WHEN series_number IS NULL THEN ? ELSE series_number END',
        );
        conditionalParams.push(merged.seriesNumber);
      }
      if (merged.genreIds?.length) {
        conditionalSets.push(
          "genre_ids = CASE WHEN genre_ids IS NULL OR genre_ids = '' OR genre_ids = '[]' THEN ? ELSE genre_ids END",
        );
        conditionalParams.push(JSON.stringify(merged.genreIds));
      }

      if (conditionalSets.length > 0) {
        conditionalSets.push("updated_at = datetime('now')");
        conditionalParams.push(bookId);
        statements.push(
          db
            .prepare(`UPDATE books SET ${conditionalSets.join(', ')} WHERE id = ?`)
            .bind(...conditionalParams),
        );
      }
    } else {
      // refresh_all: overwrite all fields
      const setClauses = [];
      const params = [];

      if (merged.author) {
        setClauses.push('author = ?');
        params.push(merged.author);
      }
      if (merged.description) {
        setClauses.push('description = ?');
        params.push(merged.description);
      }
      if (merged.isbn) {
        setClauses.push('isbn = ?');
        params.push(merged.isbn);
      }
      if (merged.pageCount) {
        setClauses.push('page_count = ?');
        params.push(merged.pageCount);
      }
      if (merged.publicationYear) {
        setClauses.push('publication_year = ?');
        params.push(merged.publicationYear);
      }
      if (merged.seriesName) {
        setClauses.push('series_name = ?');
        params.push(merged.seriesName);
      }
      if (merged.seriesNumber != null) {
        setClauses.push('series_number = ?');
        params.push(merged.seriesNumber);
      }
      if (merged.genreIds?.length) {
        setClauses.push('genre_ids = ?');
        params.push(JSON.stringify(merged.genreIds));
      }

      if (setClauses.length > 0) {
        setClauses.push("updated_at = datetime('now')");
        params.push(bookId);
        statements.push(
          db
            .prepare(`UPDATE books SET ${setClauses.join(', ')} WHERE id = ?`)
            .bind(...params),
        );
      }
    }
  }

  // Log entries
  for (const entry of logEntries) {
    statements.push(
      db
        .prepare(
          'INSERT INTO book_metadata_log (id, book_id, provider, fields_updated, cover_url) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(
          crypto.randomUUID(),
          entry.bookId,
          entry.provider,
          JSON.stringify(entry.fields),
          entry.coverUrl || null,
        ),
    );
  }

  // Update job progress
  const newProcessed = job.processed_books + progress.processedBooks;
  const newEnriched = job.enriched_books + progress.enrichedBooks;
  const newErrors = job.error_count + progress.errorCount;

  statements.push(
    db
      .prepare(
        `
      UPDATE metadata_jobs
      SET processed_books = ?, enriched_books = ?, error_count = ?, last_book_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `,
      )
      .bind(newProcessed, newEnriched, newErrors, progress.lastBookId, job.id),
  );

  // Execute all statements in batches of 100 (D1 limit)
  for (let i = 0; i < statements.length; i += 100) {
    await db.batch(statements.slice(i, i + 100));
  }

  // Handle cover fetching via waitUntil (non-blocking)
  if (config.fetchCovers && c.env.BOOK_COVERS && c.executionCtx?.waitUntil) {
    const coverPromises = bookUpdates
      .filter(({ merged }) => merged.coverUrl && merged.isbn)
      .map(async ({ merged }) => {
        try {
          const res = await fetch(merged.coverUrl, {
            headers: { 'User-Agent': 'TallyReading/1.0 (educational-app)' },
          });
          if (res.ok) {
            const imageData = await res.arrayBuffer();
            if (imageData.byteLength > 1000) {
              const r2Key = `isbn/${merged.isbn}-M.jpg`;
              await c.env.BOOK_COVERS.put(r2Key, imageData, {
                httpMetadata: {
                  contentType: res.headers.get('Content-Type') || 'image/jpeg',
                },
              });
            }
          }
        } catch {
          /* cover fetch failed — non-critical */
        }
      });

    c.executionCtx.waitUntil(Promise.allSettled(coverPromises));
  }

  return c.json({
    jobId: job.id,
    status: 'running',
    totalBooks: job.total_books,
    processedBooks: newProcessed,
    enrichedBooks: newEnriched,
    errorCount: newErrors,
    currentBook,
    done: false,
  });
});

export { metadataRouter, getConfigWithKeys };
