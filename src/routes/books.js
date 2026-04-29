/**
 * Books entry router.
 *
 * The book surface area is split across files in `src/routes/books/`
 * for readability — recommendations, isbn/scan, and import each get
 * their own module. This file owns the core CRUD (list, search, count,
 * get, create, update, delete, clear-library, enrich) and composes
 * the sub-routers in.
 *
 * Order of mounting matters: the sub-routers carry literal paths
 * (`/library-search`, `/ai-suggestions`, `/isbn/:isbn`, `/scan`,
 * `/search-external`, `/bulk`, `/import/*`) that need to be matched
 * before this file's bare `/:id` handlers. Hono's trie prefers static
 * routes over params, but mounting sub-routers first keeps the
 * precedence explicit and trivially auditable.
 */

import { Hono } from 'hono';

import { createProvider } from '../data/index.js';
import { notFoundError, badRequestError } from '../middleware/errorHandler';
import { getEncryptionSecret } from '../utils/crypto.js';
import { validateBook } from '../utils/validation.js';
import { rowToBook } from '../utils/rowMappers.js';
import { requireReadonly, requireTeacher, requireAdmin, auditLog } from '../middleware/tenant.js';
import { getConfigWithKeys } from './metadata.js';
import { enrichBook } from '../services/metadataService.js';

import { recommendationsRouter } from './books/recommendations.js';
import { isbnRouter } from './books/isbn.js';
import { importRouter } from './books/import.js';

const booksRouter = new Hono();

// Mount sub-routers first so their literal paths take precedence over
// the `/:id` core handlers below.
booksRouter.route('/', recommendationsRouter);
booksRouter.route('/', isbnRouter);
booksRouter.route('/', importRouter);

/**
 * GET /api/books
 * Get all books (with optional pagination)
 * Query params:
 * - page: Page number (1-based, optional)
 * - pageSize: Items per page (default 50, optional)
 * - search: Search query for title/author (optional)
 * - all: If 'true', return all books without pagination (for initial context load)
 * - fields: If 'minimal', return only id/title/author (use with all=true for autocomplete)
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/', requireReadonly(), async (c) => {
  const provider = await createProvider(c.env);
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;
  const { page, pageSize, search, all, fields, limit } = c.req.query();

  // In multi-tenant mode, always scope to organization's books
  if (organizationId && db) {
    // Return minimal book list for autocomplete (avoids N+1 paginated fetches).
    //
    // Optional `limit` caps the response so the SPA doesn't pull megabytes
    // of catalog on every reloadDataFromServer. We order by updated_at DESC
    // so recently-touched books (the ones teachers are actively using) are
    // always in the local cache; BookAutocomplete falls through to the
    // external-provider search for anything further back.
    if (all === 'true') {
      const columns = fields === 'minimal' ? 'b.id, b.title, b.author' : 'b.*';
      const parsedLimit = limit ? Math.max(1, Math.min(10000, parseInt(limit, 10) || 0)) : null;
      const limitClause = parsedLimit ? ` LIMIT ${parsedLimit}` : '';
      const orderClause = parsedLimit ? 'b.updated_at DESC, b.title' : 'b.title';
      const result = await db
        .prepare(
          `
        SELECT ${columns} FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND obs.is_available = 1
        ORDER BY ${orderClause}${limitClause}
      `
        )
        .bind(organizationId)
        .all();
      if (fields === 'minimal') {
        return c.json(
          (result.results || []).map((r) => ({ id: r.id, title: r.title, author: r.author }))
        );
      }
      return c.json((result.results || []).map(rowToBook));
    }

    // Search with org scoping using FTS5 for performance
    if (search && search.trim()) {
      const limit = pageSize ? parseInt(pageSize, 10) : 50;
      const searchTerm = search.trim();
      // Try FTS5 first (handles prefix matching and is much faster than LIKE on large tables)
      // Escape FTS5 special characters and add prefix matching
      const ftsQuery = searchTerm
        .replace(/['"*()^]/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => `"${t}"*`)
        .join(' ');
      let result;
      try {
        result = await db
          .prepare(
            `
          SELECT b.* FROM books b
          INNER JOIN org_book_selections obs ON b.id = obs.book_id
          INNER JOIN books_fts fts ON b.id = fts.id
          WHERE obs.organization_id = ? AND fts MATCH ?
          ORDER BY rank LIMIT ?
        `
          )
          .bind(organizationId, ftsQuery, limit)
          .all();
      } catch {
        // FTS5 may not be available or query may be invalid — fall back to LIKE
        const likeQuery = `%${searchTerm}%`;
        result = await db
          .prepare(
            `
          SELECT b.* FROM books b
          INNER JOIN org_book_selections obs ON b.id = obs.book_id
          WHERE obs.organization_id = ? AND (b.title LIKE ? OR b.author LIKE ?)
          ORDER BY b.title LIMIT ?
        `
          )
          .bind(organizationId, likeQuery, likeQuery, limit)
          .all();
      }
      return c.json((result.results || []).map(rowToBook));
    }

    // Pagination with org scoping
    if (page) {
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const size = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 100);
      const offset = (pageNum - 1) * size;
      const countResult = await db
        .prepare(
          'SELECT COUNT(*) as count FROM books b INNER JOIN org_book_selections obs ON b.id = obs.book_id WHERE obs.organization_id = ? AND obs.is_available = 1'
        )
        .bind(organizationId)
        .first();
      const total = countResult?.count || 0;
      const result = await db
        .prepare(
          `
        SELECT b.* FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND obs.is_available = 1
        ORDER BY b.title LIMIT ? OFFSET ?
      `
        )
        .bind(organizationId, size, offset)
        .all();
      return c.json({
        books: (result.results || []).map(rowToBook),
        total,
        page: pageNum,
        pageSize: size,
        totalPages: Math.ceil(total / size),
      });
    }

    // Default: paginated org books (page 1 if not specified)
    const defaultPageSize = 50;
    const countResult = await db
      .prepare(
        'SELECT COUNT(*) as count FROM books b INNER JOIN org_book_selections obs ON b.id = obs.book_id WHERE obs.organization_id = ? AND obs.is_available = 1'
      )
      .bind(organizationId)
      .first();
    const total = countResult?.count || 0;
    const result = await db
      .prepare(
        `
      SELECT b.* FROM books b
      INNER JOIN org_book_selections obs ON b.id = obs.book_id
      WHERE obs.organization_id = ? AND obs.is_available = 1
      ORDER BY b.title LIMIT ? OFFSET 0
    `
      )
      .bind(organizationId, defaultPageSize)
      .all();
    return c.json({
      books: (result.results || []).map(rowToBook),
      total,
      page: 1,
      pageSize: defaultPageSize,
      totalPages: Math.ceil(total / defaultPageSize),
    });
  }

  // Legacy mode: no org scoping
  if (search && search.trim()) {
    const limit = pageSize ? parseInt(pageSize, 10) : 50;
    const books = await provider.searchBooks(search.trim(), limit);
    return c.json(books);
  }
  if (page) {
    const pageNum = parseInt(page, 10) || 1;
    const size = parseInt(pageSize, 10) || 50;
    const result = await provider.getBooksPaginated(pageNum, size);
    return c.json(result);
  }
  const books = await provider.getAllBooks();
  return c.json(books);
});

/**
 * GET /api/books/search
 * Search books by title or author (full-text search with D1)
 * Query params:
 * - q: Search query (required)
 * - limit: Maximum results (default 50)
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/search', requireReadonly(), async (c) => {
  const { q, limit } = c.req.query();

  if (!q || !q.trim()) {
    return c.json({ error: 'Search query (q) is required' }, 400);
  }

  const maxResults = Math.min(Math.max(limit ? parseInt(limit, 10) : 50, 1), 100);
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  // In multi-tenant mode, scope search to organization's books using FTS5
  if (organizationId && db) {
    const searchTerm = q.trim();
    const ftsQuery = searchTerm
      .replace(/['"*()^]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `"${t}"*`)
      .join(' ');
    let result;
    try {
      result = await db
        .prepare(
          `
        SELECT b.* FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        INNER JOIN books_fts fts ON b.id = fts.id
        WHERE obs.organization_id = ? AND fts MATCH ?
        ORDER BY rank LIMIT ?
      `
        )
        .bind(organizationId, ftsQuery, maxResults)
        .all();
    } catch {
      // FTS5 fallback to LIKE
      const likeQuery = `%${searchTerm}%`;
      result = await db
        .prepare(
          `
        SELECT b.* FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND (b.title LIKE ? OR b.author LIKE ?)
        ORDER BY b.title LIMIT ?
      `
        )
        .bind(organizationId, likeQuery, likeQuery, maxResults)
        .all();
    }
    const books = (result.results || []).map(rowToBook);
    return c.json({ query: q.trim(), count: books.length, books });
  }

  // Legacy mode
  const provider = await createProvider(c.env);
  const books = await provider.searchBooks(q.trim(), maxResults);
  return c.json({ query: q.trim(), count: books.length, books });
});

/**
 * GET /api/books/count
 * Get total book count
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/count', requireReadonly(), async (c) => {
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;
  if (organizationId && db) {
    const result = await db
      .prepare(
        'SELECT COUNT(*) as count FROM org_book_selections WHERE organization_id = ? AND is_available = 1'
      )
      .bind(organizationId)
      .first();
    return c.json({ count: result?.count || 0 });
  }
  const provider = await createProvider(c.env);
  const count = await provider.getBookCount();
  return c.json({ count });
});

/**
 * POST /api/books
 * Add a new book
 *
 * Requires authentication (at least teacher access)
 */
booksRouter.post('/', requireTeacher(), async (c) => {
  const bookData = await c.req.json();

  // Validate book data
  const validation = validateBook(bookData);
  if (!validation.isValid) {
    throw badRequestError(validation.errors.join('; '));
  }

  const newBook = {
    id: bookData.id || crypto.randomUUID(),
    title: bookData.title,
    author: bookData.author || null,
    genreIds: bookData.genreIds || [],
    readingLevel: bookData.readingLevel || null,
    ageRange: bookData.ageRange || null,
    description: bookData.description || null,
    isbn: bookData.isbn || null,
    pageCount: bookData.pageCount ?? null,
    seriesName: bookData.seriesName || null,
    seriesNumber: bookData.seriesNumber ?? null,
    publicationYear: bookData.publicationYear ?? null,
  };

  const provider = await createProvider(c.env);
  const savedBook = await provider.addBook(newBook);

  // Link book to the current organization
  const organizationId = c.get('organizationId');
  if (organizationId) {
    const db = c.env.READING_MANAGER_DB;
    if (db) {
      await db
        .prepare(
          'INSERT OR IGNORE INTO org_book_selections (id, organization_id, book_id, is_available) VALUES (?, ?, ?, 1)'
        )
        .bind(crypto.randomUUID(), organizationId, savedBook.id)
        .run();
    }
  }

  return c.json(savedBook, 201);
});

/**
 * GET /api/books/:id
 * Get a single book by ID (full details)
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/:id', requireReadonly(), async (c) => {
  const { id } = c.req.param();
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  let book;
  if (organizationId && db) {
    const row = await db
      .prepare(
        `SELECT b.* FROM books b
       INNER JOIN org_book_selections obs ON obs.book_id = b.id
       WHERE b.id = ? AND obs.organization_id = ?`
      )
      .bind(id, organizationId)
      .first();
    book = row ? rowToBook(row) : null;
  } else {
    const provider = await createProvider(c.env);
    book = await provider.getBookById(id);
  }

  if (!book) {
    throw notFoundError(`Book with ID ${id} not found`);
  }

  return c.json(book);
});

/**
 * PUT /api/books/:id
 * Update a book
 *
 * Requires authentication (at least teacher access)
 */
booksRouter.put('/:id', requireTeacher(), async (c) => {
  const { id } = c.req.param();
  const bookData = await c.req.json();
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  // Single query: check book exists and org ownership in one round-trip
  let existingBook;
  if (organizationId && db) {
    const row = await db
      .prepare(
        `SELECT b.* FROM books b
       INNER JOIN org_book_selections obs ON obs.book_id = b.id
       WHERE b.id = ? AND obs.organization_id = ?`
      )
      .bind(id, organizationId)
      .first();
    if (!row) {
      throw notFoundError(`Book with ID ${id} not found`);
    }
    existingBook = rowToBook(row);
  } else {
    const provider = await createProvider(c.env);
    existingBook = await provider.getBookById(id);
    if (!existingBook) {
      throw notFoundError(`Book with ID ${id} not found`);
    }
  }

  // Update book with safe merge
  const updatedBook = {
    ...existingBook,
    title: bookData.title !== undefined ? bookData.title : existingBook.title,
    author: bookData.author !== undefined ? bookData.author : existingBook.author,
    genreIds: bookData.genreIds !== undefined ? bookData.genreIds : existingBook.genreIds,
    readingLevel:
      bookData.readingLevel !== undefined ? bookData.readingLevel : existingBook.readingLevel,
    ageRange: bookData.ageRange !== undefined ? bookData.ageRange : existingBook.ageRange,
    description:
      bookData.description !== undefined ? bookData.description : existingBook.description,
    isbn: bookData.isbn !== undefined ? bookData.isbn : existingBook.isbn,
    pageCount: bookData.pageCount !== undefined ? bookData.pageCount : existingBook.pageCount,
    seriesName: bookData.seriesName !== undefined ? bookData.seriesName : existingBook.seriesName,
    seriesNumber:
      bookData.seriesNumber !== undefined ? bookData.seriesNumber : existingBook.seriesNumber,
    publicationYear:
      bookData.publicationYear !== undefined
        ? bookData.publicationYear
        : existingBook.publicationYear,
    id, // Ensure ID doesn't change
  };

  // Validate the merged book data
  const bookValidation = validateBook(updatedBook);
  if (!bookValidation.isValid) {
    throw badRequestError(bookValidation.errors.join('; '));
  }

  const provider = await createProvider(c.env);
  const savedBook = await provider.updateBook(id, updatedBook);
  return c.json(savedBook);
});

/**
 * DELETE /api/books/clear-library
 * Remove all books from the current organization's library and clean up orphaned global books.
 *
 * Requires authentication (at least admin access)
 */
booksRouter.delete('/clear-library', requireAdmin(), auditLog('clear', 'library'), async (c) => {
  const organizationId = c.get('organizationId');
  if (!organizationId || !c.env.READING_MANAGER_DB) {
    throw badRequestError('Clear library is only available in multi-tenant mode');
  }

  const db = c.env.READING_MANAGER_DB;

  // Count books linked to this org
  const countResult = await db
    .prepare('SELECT COUNT(*) as count FROM org_book_selections WHERE organization_id = ?')
    .bind(organizationId)
    .first();
  const booksUnlinked = countResult?.count || 0;

  if (booksUnlinked === 0) {
    return c.json({ message: 'No books to clear', booksUnlinked: 0, orphansDeleted: 0 });
  }

  // Remove all org links and clean up orphaned books
  await db.batch([
    db.prepare('DELETE FROM org_book_selections WHERE organization_id = ?').bind(organizationId),
    db.prepare(
      'DELETE FROM books WHERE NOT EXISTS (SELECT 1 FROM org_book_selections WHERE org_book_selections.book_id = books.id)'
    ),
  ]);

  return c.json({
    message: `Cleared ${booksUnlinked} books from library`,
    booksUnlinked,
  });
});

/**
 * POST /api/books/:id/enrich
 * Enrich a single book using the metadata cascade engine.
 */
booksRouter.post('/:id/enrich', requireAdmin(), async (c) => {
  const { id } = c.req.param();
  const db = c.env.READING_MANAGER_DB;
  if (!db) throw notFoundError('Book not found');

  const organizationId = c.get('organizationId');
  if (!organizationId) throw notFoundError('Book not found');

  const book = await db
    .prepare(
      `SELECT b.* FROM books b
       INNER JOIN org_book_selections obs ON b.id = obs.book_id
       WHERE b.id = ? AND obs.organization_id = ? AND obs.is_available = 1`
    )
    .bind(id, organizationId)
    .first();
  if (!book) throw notFoundError('Book not found');

  const encSecret = getEncryptionSecret(c.env);
  const config = await getConfigWithKeys(db, encSecret);
  if (!config) return c.json({ error: 'Metadata configuration not found' }, 500);
  config.fetchCovers = Boolean(config.fetchCovers);

  const { merged, log } = await enrichBook(
    { id: book.id, title: book.title, author: book.author, isbn: book.isbn },
    config
  );

  const fieldsEnriched = log.flatMap((entry) => entry.fields);

  // Store cover in R2 if a coverUrl was found and the book has an ISBN
  let coverStored = false;
  const r2 = c.env.BOOK_COVERS;
  if (merged.coverUrl && book.isbn && r2) {
    try {
      const res = await fetch(merged.coverUrl, {
        headers: { 'User-Agent': 'TallyReading/1.0 (educational-app)' },
      });
      if (res.ok) {
        const imageData = await res.arrayBuffer();
        if (imageData.byteLength > 1000) {
          await r2.put(`isbn/${book.isbn}-M.jpg`, imageData, {
            httpMetadata: { contentType: res.headers.get('Content-Type') || 'image/jpeg' },
          });
          coverStored = true;
        }
      }
    } catch {
      /* non-critical */
    }
  }

  return c.json({
    description: merged.description || null,
    genres: merged.genres || null,
    coverStored,
    fieldsEnriched,
  });
});

/**
 * DELETE /api/books/:id
 * Delete a book
 *
 * Requires authentication (at least teacher access)
 */
booksRouter.delete('/:id', requireTeacher(), async (c) => {
  const { id } = c.req.param();

  // In multi-tenant mode, only remove the org's link to the book (not the global book)
  const organizationId = c.get('organizationId');
  if (organizationId && c.env.READING_MANAGER_DB) {
    const db = c.env.READING_MANAGER_DB;
    const orgLink = await db
      .prepare('SELECT 1 FROM org_book_selections WHERE organization_id = ? AND book_id = ?')
      .bind(organizationId, id)
      .first();
    if (!orgLink) {
      throw notFoundError(`Book with ID ${id} not found`);
    }
    // Remove the org's link to the book rather than deleting the global book record
    await db
      .prepare('DELETE FROM org_book_selections WHERE organization_id = ? AND book_id = ?')
      .bind(organizationId, id)
      .run();
    return c.json({ message: 'Book removed from organization successfully' });
  }

  // Legacy mode: delete the book directly
  const provider = await createProvider(c.env);
  const deletedBook = await provider.deleteBook(id);

  if (!deletedBook) {
    throw notFoundError(`Book with ID ${id} not found`);
  }

  return c.json({ message: 'Book deleted successfully' });
});

export { booksRouter };
