import { Hono } from 'hono';
import { createProvider } from '../../data/index.js';
import { notFoundError, badRequestError } from '../../middleware/errorHandler.js';
import { isFuzzyMatch, normalizeAuthorDisplay } from '../../utils/stringMatching.js';
import { normalizeISBN } from '../../utils/isbn.js';
import { lookupISBN } from '../../utils/isbnLookup.js';
import { rowToBook } from '../../utils/rowMappers.js';
import { requireReadonly, requireTeacher } from '../../middleware/tenant.js';

const isbnRouter = new Hono();

function normalizeAuthorName(name) {
  if (!name) return null;
  const trimmed = name.trim();
  const parts = trimmed.split(',');
  if (parts.length === 2) {
    const surname = parts[0].trim();
    const firstname = parts[1].trim();
    if (firstname && surname) {
      return `${firstname} ${surname}`;
    }
  }
  return trimmed;
}

/**
 * GET /api/books/search-external
 * Search external book databases (OpenLibrary) by title for typeahead suggestions.
 * Returns normalized results with title, author, ISBN, and publication year.
 *
 * Query params:
 * - q: Search query (required, min 3 chars)
 * - limit: Max results (default 8, max 20)
 *
 * Requires authentication (at least readonly access)
 */
isbnRouter.get('/search-external', requireReadonly(), async (c) => {
  const { q, limit } = c.req.query();

  if (!q || q.trim().length < 3) {
    return c.json({ results: [] });
  }

  const maxResults = Math.min(parseInt(limit, 10) || 8, 20);
  const searchTerm = q.trim();

  try {
    const params = new URLSearchParams({
      q: searchTerm,
      limit: String(maxResults),
      fields: 'key,title,author_name,first_publish_year,isbn',
    });

    const response = await fetch(`https://openlibrary.org/search.json?${params}`, {
      headers: { 'User-Agent': 'TallyReading/1.0 (educational-app)' },
    });

    if (!response.ok) {
      return c.json({ results: [] });
    }

    const data = await response.json();
    const results = (data.docs || []).map((doc) => ({
      title: doc.title || '',
      author: normalizeAuthorName(doc.author_name?.[0] || null),
      isbn: doc.isbn?.[0] || null,
      publicationYear: doc.first_publish_year || null,
    }));

    return c.json({ results });
  } catch (error) {
    console.error('External book search error:', error);
    return c.json({ results: [] });
  }
});

/**
 * GET /api/books/isbn/:isbn
 * Look up a book by ISBN — checks local D1 first, then OpenLibrary
 *
 * Requires authentication (at least teacher access)
 */
isbnRouter.get('/isbn/:isbn', requireTeacher(), async (c) => {
  const { isbn } = c.req.param();
  const normalized = normalizeISBN(isbn);
  if (!normalized) {
    throw badRequestError('Invalid ISBN');
  }

  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  // Check local D1 database first
  if (db) {
    const row = await db.prepare('SELECT * FROM books WHERE isbn = ?').bind(normalized).first();
    if (row) {
      let inLibrary = false;
      if (organizationId) {
        const orgLink = await db
          .prepare(
            'SELECT 1 FROM org_book_selections WHERE organization_id = ? AND book_id = ? AND is_available = 1'
          )
          .bind(organizationId, row.id)
          .first();
        inLibrary = !!orgLink;
      }
      return c.json({ source: 'local', inLibrary, book: rowToBook(row) });
    }
  }

  // Not found locally by ISBN — try OpenLibrary
  const olBook = await lookupISBN(normalized, c.env);
  if (!olBook) {
    return c.json({ source: 'not_found', isbn: normalized, book: null });
  }

  // Normalize author name from OpenLibrary ("Surname, First" → "First Surname")
  if (olBook.author) {
    olBook.author = normalizeAuthorDisplay(olBook.author);
  }

  // Check if a matching book already exists locally by title+author (different edition/ISBN)
  if (olBook.title && db) {
    const titleQuery = `%${olBook.title.trim()}%`;
    const candidates = await db
      .prepare('SELECT * FROM books WHERE title LIKE ? LIMIT 20')
      .bind(titleQuery)
      .all();
    const match = (candidates.results || []).find((row) =>
      isFuzzyMatch(
        { title: olBook.title, author: olBook.author },
        { title: row.title, author: row.author }
      )
    );
    if (match) {
      let inLibrary = false;
      if (organizationId) {
        const orgLink = await db
          .prepare(
            'SELECT 1 FROM org_book_selections WHERE organization_id = ? AND book_id = ? AND is_available = 1'
          )
          .bind(organizationId, match.id)
          .first();
        inLibrary = !!orgLink;
      }
      return c.json({
        source: 'local',
        inLibrary,
        book: { ...rowToBook(match), isbn: match.isbn || normalized },
      });
    }
  }

  return c.json({ source: 'openlibrary', inLibrary: false, book: olBook });
});

/**
 * POST /api/books/scan
 * Scan a book by ISBN — link existing, preview, or create new
 *
 * Request body: { isbn, confirm }
 * Requires authentication (at least teacher access)
 */
isbnRouter.post('/scan', requireTeacher(), async (c) => {
  const { isbn, confirm } = await c.req.json();
  const normalized = normalizeISBN(isbn);
  if (!normalized) {
    throw badRequestError('Invalid ISBN');
  }

  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  // Check D1 for existing book by ISBN
  let existingRow = null;
  if (db) {
    existingRow = await db.prepare('SELECT * FROM books WHERE isbn = ?').bind(normalized).first();
  }

  if (existingRow) {
    // Book exists — link to this org
    if (organizationId && db) {
      await db
        .prepare(
          `
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
        ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
      `
        )
        .bind(crypto.randomUUID(), organizationId, existingRow.id)
        .run();
    }
    return c.json({ action: 'linked', book: rowToBook(existingRow) });
  }

  // Not found locally by ISBN — look up on OpenLibrary
  const olBook = await lookupISBN(normalized, c.env);

  // Normalize author name from OpenLibrary ("Surname, First" → "First Surname")
  if (olBook?.author) {
    olBook.author = normalizeAuthorDisplay(olBook.author);
  }

  if (!confirm) {
    // Preview mode — return metadata (or just the ISBN if OpenLibrary had nothing)
    return c.json({ action: 'preview', book: olBook || { isbn: normalized } });
  }

  // Before creating, check for title+author duplicates in the database.
  if (olBook?.title && db) {
    const titleQuery = `%${olBook.title.trim()}%`;
    const candidates = await db
      .prepare(
        `
      SELECT * FROM books WHERE title LIKE ? LIMIT 20
    `
      )
      .bind(titleQuery)
      .all();

    const match = (candidates.results || []).find((row) =>
      isFuzzyMatch(
        { title: olBook.title, author: olBook.author },
        { title: row.title, author: row.author }
      )
    );

    if (match) {
      // Duplicate found — update its ISBN if missing, then link to org
      if (!match.isbn && normalized) {
        await db
          .prepare('UPDATE books SET isbn = ?, updated_at = datetime("now") WHERE id = ?')
          .bind(normalized, match.id)
          .run();
      }
      if (organizationId) {
        await db
          .prepare(
            `
          INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
          VALUES (?, ?, ?, 1, datetime('now'))
          ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
        `
          )
          .bind(crypto.randomUUID(), organizationId, match.id)
          .run();
      }
      return c.json({
        action: 'linked',
        book: { ...rowToBook(match), isbn: match.isbn || normalized },
      });
    }
  }

  // No duplicate — create the book and link to org
  const newBook = {
    id: crypto.randomUUID(),
    title: olBook?.title || 'Unknown Title',
    author: olBook?.author || null,
    genreIds: [],
    readingLevel: null,
    ageRange: null,
    description: null,
    isbn: normalized,
    pageCount: olBook?.pageCount ?? null,
    seriesName: olBook?.seriesName || null,
    seriesNumber: olBook?.seriesNumber ?? null,
    publicationYear: olBook?.publicationYear ?? null,
  };

  const provider = await createProvider(c.env);
  const savedBook = await provider.addBook(newBook);

  // Link to org
  if (organizationId && db) {
    await db
      .prepare(
        `
      INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
      VALUES (?, ?, ?, 1, datetime('now'))
      ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
    `
      )
      .bind(crypto.randomUUID(), organizationId, savedBook.id)
      .run();
  }

  return c.json({ action: 'created', book: savedBook }, 201);
});

export { isbnRouter };
