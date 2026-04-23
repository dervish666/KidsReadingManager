/**
 * Metadata cascade engine.
 * Calls providers in configured order, merges best-of results per field.
 */
import { fetchMetadata as openLibraryFetch } from './providers/openLibraryProvider.js';
import { fetchMetadata as googleBooksFetch } from './providers/googleBooksProvider.js';
import { fetchMetadata as hardcoverFetch } from './providers/hardcoverProvider.js';

const PROVIDERS = {
  openlibrary: { fetch: openLibraryFetch, needsKey: false },
  googlebooks: { fetch: googleBooksFetch, needsKey: true, keyField: 'googleBooksApiKey' },
  hardcover: { fetch: hardcoverFetch, needsKey: true, keyField: 'hardcoverApiKey' },
};

const MERGE_FIELDS = [
  'author',
  'description',
  'genres',
  'isbn',
  'pageCount',
  'publicationYear',
  'seriesName',
  'seriesNumber',
  'coverUrl',
];

/**
 * Enrich a single book by calling providers in cascade order.
 *
 * @param {{ id: string, title: string, author?: string, isbn?: string }} book
 * @param {{ providerChain: string[], hardcoverApiKey?: string, googleBooksApiKey?: string, fetchCovers: boolean }} config
 * @returns {Promise<{ merged: object, log: Array<{ provider: string, fields: string[] }>, rateLimited: string[] }>}
 */
export async function enrichBook(book, config) {
  const merged = {};
  const log = [];
  const rateLimited = [];

  // Determine which fields to target (exclude coverUrl if fetchCovers is false)
  const targetFields =
    config.fetchCovers === false ? MERGE_FIELDS.filter((f) => f !== 'coverUrl') : MERGE_FIELDS;

  for (const providerName of config.providerChain) {
    try {
      const provider = PROVIDERS[providerName];
      if (!provider) continue;

      // Skip providers that need a key if none is configured
      if (provider.needsKey && !config[provider.keyField]) continue;

      // Call the provider
      const apiKey = provider.needsKey ? config[provider.keyField] : undefined;
      const result = await provider.fetch(book, apiKey);

      if (result.rateLimited) {
        rateLimited.push(providerName);
        continue;
      }

      // Merge: first non-empty value wins per field
      const fieldsFromThisProvider = [];
      for (const field of targetFields) {
        if (merged[field] != null) continue; // Already filled by earlier provider
        const value = result[field];
        if (value == null) continue;
        if (Array.isArray(value) && value.length === 0) continue;
        if (typeof value === 'string' && !value.trim()) continue;

        merged[field] = value;
        fieldsFromThisProvider.push(field);
      }

      if (fieldsFromThisProvider.length > 0) {
        log.push({ provider: providerName, fields: fieldsFromThisProvider });
      }

      // Short-circuit if all target fields are populated
      const allFilled = targetFields.every((f) => merged[f] != null);
      if (allFilled) break;
    } catch (err) {
      console.error(`Provider ${providerName} failed for "${book.title}":`, err.message);
      continue;
    }
  }

  return { merged, log, rateLimited };
}

/**
 * Process a batch of books through the cascade engine.
 *
 * @param {Array<{ id, title, author?, isbn? }>} books
 * @param {object} config - Cascade config with providerChain, API keys, etc.
 * @param {{ onBookResult: Function, delayMs?: number }} options
 * @returns {Promise<{ processedBooks: number, enrichedBooks: number, errorCount: number, rateLimitedProviders: string[], lastBookId: string|null }>}
 */
export async function processBatch(books, config, options = {}) {
  const { onBookResult, delayMs } = options;
  let processedBooks = 0;
  let enrichedBooks = 0;
  let errorCount = 0;
  const rateLimitedProviders = new Set();
  const consecutiveRateLimits = {}; // provider -> count
  let lastBookId = null;
  let currentDelay = delayMs ?? config.rateLimitDelayMs ?? 1500;
  const startTime = Date.now();

  // Build a mutable copy of the provider chain so we can skip rate-limited providers
  const activeChain = [...config.providerChain];

  for (const book of books) {
    // Safety: stop batch early to leave time for DB writes after processing
    if (Date.now() - startTime > 20000) break;

    try {
      // Pass the active chain (may have providers removed due to rate limiting)
      const effectiveConfig = { ...config, providerChain: activeChain };
      const result = await enrichBook(book, effectiveConfig);

      // Track rate-limited providers and adapt
      for (const p of result.rateLimited) {
        rateLimitedProviders.add(p);
        consecutiveRateLimits[p] = (consecutiveRateLimits[p] || 0) + 1;

        // Double delay on any rate limit (capped at 5000ms)
        currentDelay = Math.min(currentDelay * 2, 5000);

        // Skip provider entirely after 2 consecutive rate limits
        if (consecutiveRateLimits[p] >= 2) {
          const idx = activeChain.indexOf(p);
          if (idx !== -1) activeChain.splice(idx, 1);
        }
      }

      // Reset consecutive count for providers that succeeded
      for (const p of activeChain) {
        if (!result.rateLimited.includes(p)) {
          consecutiveRateLimits[p] = 0;
        }
      }

      // Check if any fields were actually populated
      const hasUpdates = Object.values(result.merged).some(
        (v) => v != null && (!Array.isArray(v) || v.length > 0)
      );

      if (hasUpdates) {
        enrichedBooks++;
      }

      if (onBookResult) {
        onBookResult(book.id, result.merged, result.log);
      }
    } catch (err) {
      console.error(`Enrichment failed for book "${book?.title}":`, err.message);
      errorCount++;
    }

    processedBooks++;
    lastBookId = book.id;

    // Delay between books (skip for last book)
    if (currentDelay > 0 && processedBooks < books.length) {
      await new Promise((r) => setTimeout(r, currentDelay));
    }
  }

  return {
    processedBooks,
    enrichedBooks,
    errorCount,
    rateLimitedProviders: [...rateLimitedProviders],
    lastBookId,
  };
}

// ─── Fill-missing WHERE clause (shared by count + batch queries) ───
const FILL_MISSING_CONDITION = `
  (author IS NULL OR author = '' OR LOWER(author) = 'unknown'
    OR description IS NULL OR description = ''
    OR isbn IS NULL OR isbn = ''
    OR page_count IS NULL
    OR publication_year IS NULL
    OR series_name IS NULL
    OR genre_ids IS NULL OR genre_ids = '' OR genre_ids = '[]')`;

/**
 * Process one batch of an enrichment job — fetch books, call cascade engine,
 * resolve genres, write results to D1, update job progress.
 *
 * Used by both the HTTP POST /enrich handler and the cron background handler.
 *
 * @param {object} db - D1 database binding
 * @param {object} job - metadata_jobs row
 * @param {object} config - decrypted config (providerChain, API keys, batchSize, etc.)
 * @param {{ r2Bucket?: object, waitUntil?: Function }} options
 * @returns {Promise<{ processedBooks, enrichedBooks, errorCount, currentBook, done, jobStatus }>}
 */
export async function processJobBatch(db, job, config, options = {}) {
  const { r2Bucket, waitUntil } = options;

  // Cap batch size for safety (each book hits multiple external APIs)
  const batchSize = Math.min(config.batchSize || 10, 5);

  // Fetch next batch of books using cursor
  const cursor = job.last_book_id || '';
  let booksQuery, booksBindings;

  if (job.job_type === 'fill_missing') {
    if (job.organization_id) {
      booksQuery = `
        SELECT b.id, b.title, b.author, b.isbn FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND obs.is_available = 1
          AND b.id > ? AND ${FILL_MISSING_CONDITION.replace(/(\b)(author|description|isbn|page_count|publication_year|series_name|genre_ids)(\b)/g, '$1b.$2$3')}
        ORDER BY b.id LIMIT ?`;
      booksBindings = [job.organization_id, cursor, batchSize];
    } else {
      booksQuery = `
        SELECT id, title, author, isbn FROM books
        WHERE id > ? AND ${FILL_MISSING_CONDITION}
        ORDER BY id LIMIT ?`;
      booksBindings = [cursor, batchSize];
    }
  } else {
    if (job.organization_id) {
      booksQuery = `
        SELECT b.id, b.title, b.author, b.isbn FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND obs.is_available = 1 AND b.id > ?
        ORDER BY b.id LIMIT ?`;
      booksBindings = [job.organization_id, cursor, batchSize];
    } else {
      booksQuery = `SELECT id, title, author, isbn FROM books WHERE id > ? ORDER BY id LIMIT ?`;
      booksBindings = [cursor, batchSize];
    }
  }

  const booksResult = await db
    .prepare(booksQuery)
    .bind(...booksBindings)
    .all();
  const books = (booksResult.results || []).map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author || '',
    isbn: row.isbn || '',
  }));

  // No more books → job complete
  if (books.length === 0) {
    await db
      .prepare(
        "UPDATE metadata_jobs SET status = 'completed', updated_at = datetime('now') WHERE id = ?"
      )
      .bind(job.id)
      .run();
    return {
      processedBooks: job.processed_books,
      enrichedBooks: job.enriched_books,
      errorCount: job.error_count,
      currentBook: null,
      done: true,
      jobStatus: 'completed',
    };
  }

  // Mark job as running
  if (job.status === 'pending') {
    await db
      .prepare(
        "UPDATE metadata_jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?"
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

  // Genre name-to-ID mapping
  const genreNameToId = {};
  const existingGenres = await db.prepare('SELECT id, name FROM genres').all();
  for (const g of existingGenres.results || []) {
    genreNameToId[g.name.toLowerCase()] = g.id;
  }

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
          db.prepare('INSERT OR IGNORE INTO genres (id, name) VALUES (?, ?)').bind(newId, name)
        );
      }
      genreIds.push(genreNameToId[key]);
    }
    merged.genreIds = genreIds;
  }

  for (let i = 0; i < genreCreateStatements.length; i += 100) {
    await db.batch(genreCreateStatements.slice(i, i + 100));
  }

  // Build D1 statements for book updates and metadata log
  const statements = [];

  for (const { bookId, merged } of bookUpdates) {
    if (job.job_type === 'fill_missing') {
      const sets = [];
      const params = [];
      if (merged.author) {
        sets.push(
          "author = CASE WHEN author IS NULL OR author = '' OR LOWER(author) = 'unknown' THEN ? ELSE author END"
        );
        params.push(merged.author);
      }
      if (merged.description) {
        sets.push(
          "description = CASE WHEN description IS NULL OR description = '' THEN ? ELSE description END"
        );
        params.push(merged.description);
      }
      if (merged.isbn) {
        sets.push("isbn = CASE WHEN isbn IS NULL OR isbn = '' THEN ? ELSE isbn END");
        params.push(merged.isbn);
      }
      if (merged.pageCount) {
        sets.push('page_count = CASE WHEN page_count IS NULL THEN ? ELSE page_count END');
        params.push(merged.pageCount);
      }
      if (merged.publicationYear) {
        sets.push(
          'publication_year = CASE WHEN publication_year IS NULL THEN ? ELSE publication_year END'
        );
        params.push(merged.publicationYear);
      }
      if (merged.seriesName) {
        sets.push(
          "series_name = CASE WHEN series_name IS NULL OR series_name = '' THEN ? ELSE series_name END"
        );
        params.push(merged.seriesName);
      }
      if (merged.seriesNumber != null) {
        sets.push('series_number = CASE WHEN series_number IS NULL THEN ? ELSE series_number END');
        params.push(merged.seriesNumber);
      }
      if (merged.genreIds?.length) {
        sets.push(
          "genre_ids = CASE WHEN genre_ids IS NULL OR genre_ids = '' OR genre_ids = '[]' THEN ? ELSE genre_ids END"
        );
        params.push(JSON.stringify(merged.genreIds));
      }
      if (sets.length > 0) {
        sets.push("updated_at = datetime('now')");
        params.push(bookId);
        statements.push(
          db.prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`).bind(...params)
        );
      }
    } else {
      const sets = [];
      const params = [];
      if (merged.author) {
        sets.push('author = ?');
        params.push(merged.author);
      }
      if (merged.description) {
        sets.push('description = ?');
        params.push(merged.description);
      }
      if (merged.isbn) {
        sets.push('isbn = ?');
        params.push(merged.isbn);
      }
      if (merged.pageCount) {
        sets.push('page_count = ?');
        params.push(merged.pageCount);
      }
      if (merged.publicationYear) {
        sets.push('publication_year = ?');
        params.push(merged.publicationYear);
      }
      if (merged.seriesName) {
        sets.push('series_name = ?');
        params.push(merged.seriesName);
      }
      if (merged.seriesNumber != null) {
        sets.push('series_number = ?');
        params.push(merged.seriesNumber);
      }
      if (merged.genreIds?.length) {
        sets.push('genre_ids = ?');
        params.push(JSON.stringify(merged.genreIds));
      }
      if (sets.length > 0) {
        sets.push("updated_at = datetime('now')");
        params.push(bookId);
        statements.push(
          db.prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = ?`).bind(...params)
        );
      }
    }
  }

  for (const entry of logEntries) {
    statements.push(
      db
        .prepare(
          'INSERT INTO book_metadata_log (id, book_id, provider, fields_updated, cover_url) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(
          crypto.randomUUID(),
          entry.bookId,
          entry.provider,
          JSON.stringify(entry.fields),
          entry.coverUrl || null
        )
    );
  }

  // Update job progress
  const newProcessed = job.processed_books + progress.processedBooks;
  const newEnriched = job.enriched_books + progress.enrichedBooks;
  const newErrors = job.error_count + progress.errorCount;

  statements.push(
    db
      .prepare(
        `UPDATE metadata_jobs SET processed_books = ?, enriched_books = ?, error_count = ?, last_book_id = ?, updated_at = datetime('now') WHERE id = ?`
      )
      .bind(newProcessed, newEnriched, newErrors, progress.lastBookId, job.id)
  );

  for (let i = 0; i < statements.length; i += 100) {
    await db.batch(statements.slice(i, i + 100));
  }

  // Cover fetching (non-blocking if waitUntil is available)
  if (config.fetchCovers && r2Bucket) {
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
              await r2Bucket.put(`isbn/${merged.isbn}-M.jpg`, imageData, {
                httpMetadata: { contentType: res.headers.get('Content-Type') || 'image/jpeg' },
              });
            }
          }
        } catch {
          /* non-critical */
        }
      });

    if (waitUntil) {
      waitUntil(Promise.allSettled(coverPromises));
    } else {
      await Promise.allSettled(coverPromises);
    }
  }

  return {
    processedBooks: newProcessed,
    enrichedBooks: newEnriched,
    errorCount: newErrors,
    currentBook,
    done: false,
    jobStatus: 'running',
  };
}
