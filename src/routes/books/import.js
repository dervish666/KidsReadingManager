import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createProvider } from '../../data/index.js';
import { badRequestError } from '../../middleware/errorHandler.js';
import { isExactMatch, isFuzzyMatch, isAuthorMatch } from '../../utils/stringMatching.js';
import { requireTeacher, requireAdmin, auditLog } from '../../middleware/tenant.js';

const importRouter = new Hono();

// Override global 1MB body limit for import endpoints (CSV files can be large)
importRouter.use('/import/*', bodyLimit({ maxSize: 5 * 1024 * 1024 }));

/**
 * POST /api/books/bulk
 * Bulk import books with duplicate detection and KV optimization
 *
 * Requires authentication (at least teacher access)
 */
importRouter.post('/bulk', requireTeacher(), async (c) => {
  const booksData = await c.req.json();

  // Validate input
  if (!Array.isArray(booksData) || booksData.length === 0) {
    throw badRequestError('Request must contain an array of books');
  }

  // Filter valid books and prepare them
  const validBooks = booksData
    .filter((book) => book.title && book.title.trim())
    .map((book) => ({
      id: crypto.randomUUID(),
      title: book.title.trim(),
      author: book.author || null,
      genreIds: book.genreIds || [],
      readingLevel: book.readingLevel || null,
      ageRange: book.ageRange || null,
      description: book.description || null,
      isbn: book.isbn || null,
      pageCount: book.pageCount ?? null,
      seriesName: book.seriesName || null,
      seriesNumber: book.seriesNumber ?? null,
      publicationYear: book.publicationYear ?? null,
    }));

  if (validBooks.length === 0) {
    throw badRequestError('No valid books found in request');
  }

  // Targeted duplicate detection — avoid loading entire book catalog
  const db = c.env.READING_MANAGER_DB;
  const existingByIsbn = new Map();
  const existingByTitle = new Map();

  if (db) {
    // 1. Batch ISBN lookup for books that have ISBNs
    const isbns = validBooks.filter((b) => b.isbn).map((b) => b.isbn);
    if (isbns.length > 0) {
      const ISBN_BATCH = 50;
      for (let i = 0; i < isbns.length; i += ISBN_BATCH) {
        const batch = isbns.slice(i, i + ISBN_BATCH);
        const placeholders = batch.map(() => '?').join(',');
        const result = await db
          .prepare(`SELECT id, isbn, title, author FROM books WHERE isbn IN (${placeholders})`)
          .bind(...batch)
          .all();
        for (const book of result.results || []) {
          if (book.isbn) existingByIsbn.set(book.isbn, book);
        }
      }
    }

    // 2. FTS5 title search for books without ISBNs (or as fallback)
    for (const book of validBooks) {
      if (book.isbn && existingByIsbn.has(book.isbn)) continue; // already matched by ISBN
      const ftsQuery = book.title.trim().replace(/['"*()]/g, '');
      if (!ftsQuery) continue;
      try {
        const ftsResult = await db
          .prepare(
            `SELECT id, title, author FROM books
           INNER JOIN books_fts fts ON books.id = fts.id
           WHERE fts MATCH ? LIMIT 10`
          )
          .bind(`"${ftsQuery}"`)
          .all();
        for (const match of ftsResult.results || []) {
          const key = match.title.toLowerCase().trim();
          if (!existingByTitle.has(key)) existingByTitle.set(key, match);
        }
      } catch {
        // FTS match failed (e.g. special chars) — skip
      }
    }
  } else {
    // Legacy mode: fall back to provider
    const provider = await createProvider(c.env);
    const allBooks = await provider.getAllBooks();
    for (const book of allBooks) {
      if (book.isbn) existingByIsbn.set(book.isbn, book);
      const key = book.title.toLowerCase().trim();
      if (!existingByTitle.has(key)) existingByTitle.set(key, book);
    }
  }

  // Filter out duplicates using the targeted lookup results
  const normalizeTitle = (title) =>
    title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  const normalizeAuthor = (author) =>
    author
      ? author
          .toLowerCase()
          .trim()
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, ' ')
      : '';

  const isDuplicate = (newBook) => {
    // Check ISBN match first
    if (newBook.isbn && existingByIsbn.has(newBook.isbn)) return true;

    // Check title match
    const newTitle = normalizeTitle(newBook.title);
    const newAuthor = normalizeAuthor(newBook.author);

    for (const [, existing] of existingByTitle) {
      const existingTitle = normalizeTitle(existing.title);
      if (newTitle === existingTitle) {
        const existingAuthor = normalizeAuthor(existing.author);
        if (newAuthor && existingAuthor) {
          if (newAuthor === existingAuthor) return true;
        } else {
          return true; // Same title, consider duplicate
        }
      }
    }
    return false;
  };

  const newBooks = validBooks.filter((book) => !isDuplicate(book));
  const duplicateCount = validBooks.length - newBooks.length;

  // Use batch operation for efficiency (only 2 KV operations total)
  const provider = await createProvider(c.env);
  let savedBooks = [];
  if (newBooks.length > 0) {
    savedBooks = await provider.addBooksBatch(newBooks);
  }

  // Link new books to the current organization
  const organizationId = c.get('organizationId');
  if (organizationId && db && savedBooks.length > 0) {
    const linkStatements = savedBooks.map((book) =>
      db
        .prepare(
          'INSERT OR IGNORE INTO org_book_selections (id, organization_id, book_id, is_available) VALUES (?, ?, ?, 1)'
        )
        .bind(crypto.randomUUID(), organizationId, book.id)
    );
    for (let i = 0; i < linkStatements.length; i += 100) {
      await db.batch(linkStatements.slice(i, i + 100));
    }
  }

  return c.json(
    {
      imported: savedBooks.length,
      duplicates: duplicateCount,
      total: validBooks.length,
      books: savedBooks,
    },
    201
  );
});

/**
 * POST /api/books/import/preview
 * Preview import results: categorize books into matched, fuzzy matches, new, and conflicts
 *
 * Request body: { books: [{ title, author, readingLevel, isbn }] }
 * Response: { matched, possibleMatches, newBooks, conflicts, alreadyInLibrary, summary }
 *
 * Requires authentication (at least admin access)
 */
importRouter.post('/import/preview', requireAdmin(), async (c) => {
  const { books: importBooks } = await c.req.json();
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  if (!Array.isArray(importBooks) || importBooks.length === 0) {
    throw badRequestError('Request must contain an array of books');
  }

  if (!organizationId || !db) {
    throw badRequestError('Multi-tenant mode required for import preview');
  }

  // Get books already in this organization's library
  const orgBooksResult = await db
    .prepare(
      'SELECT book_id FROM org_book_selections WHERE organization_id = ? AND is_available = 1'
    )
    .bind(organizationId)
    .all();
  const orgBookIds = new Set((orgBooksResult.results || []).map((r) => r.book_id));

  // Categorize imports
  const matched = [];
  const possibleMatches = [];
  const newBooks = [];
  const conflicts = [];
  const alreadyInLibrary = [];

  // Step 1: Batch ISBN lookup (avoids loading entire book catalog)
  const importIsbns = importBooks.filter((b) => b.isbn).map((b) => b.isbn);
  const isbnBookMap = new Map();
  if (importIsbns.length > 0) {
    const ISBN_BATCH = 50;
    for (let i = 0; i < importIsbns.length; i += ISBN_BATCH) {
      const batch = importIsbns.slice(i, i + ISBN_BATCH);
      const placeholders = batch.map(() => '?').join(',');
      const isbnResult = await db
        .prepare(`SELECT * FROM books WHERE isbn IN (${placeholders})`)
        .bind(...batch)
        .all();
      for (const book of isbnResult.results || []) {
        isbnBookMap.set(book.isbn, book);
      }
    }
  }

  // Step 2: Process each imported book
  for (const importedBook of importBooks) {
    if (!importedBook.title || !importedBook.title.trim()) continue;

    // ISBN exact match (from batch lookup)
    if (importedBook.isbn && isbnBookMap.has(importedBook.isbn)) {
      const isbnMatch = isbnBookMap.get(importedBook.isbn);
      if (orgBookIds.has(isbnMatch.id)) {
        alreadyInLibrary.push({ importedBook, existingBook: isbnMatch });
      } else {
        const hasConflict =
          importedBook.readingLevel &&
          isbnMatch.reading_level &&
          importedBook.readingLevel !== isbnMatch.reading_level;
        if (hasConflict) {
          conflicts.push({ importedBook, existingBook: isbnMatch });
        } else {
          matched.push({ importedBook, existingBook: isbnMatch });
        }
      }
      continue;
    }

    // FTS5 title search for exact and fuzzy matching candidates
    let candidates = [];
    try {
      // Escape FTS5 special characters and search by title
      const ftsQuery = importedBook.title.trim().replace(/['"*()]/g, '');
      if (ftsQuery) {
        const ftsResult = await db
          .prepare(
            `SELECT b.* FROM books b
           INNER JOIN books_fts fts ON b.id = fts.id
           WHERE fts MATCH ? LIMIT 20`
          )
          .bind(`"${ftsQuery}"`)
          .all();
        candidates = ftsResult.results || [];
      }
    } catch {
      // FTS match failed (e.g. special chars) — skip to newBooks
    }

    // Check for exact title/author match in candidates
    const exactMatch = candidates.find(
      (existing) =>
        isExactMatch(existing.title, importedBook.title) &&
        isAuthorMatch(existing.author, importedBook.author)
    );

    if (exactMatch) {
      if (orgBookIds.has(exactMatch.id)) {
        alreadyInLibrary.push({ importedBook, existingBook: exactMatch });
        continue;
      }
      const hasConflict =
        importedBook.readingLevel &&
        exactMatch.reading_level &&
        importedBook.readingLevel !== exactMatch.reading_level;
      if (hasConflict) {
        conflicts.push({ importedBook, existingBook: exactMatch });
      } else {
        matched.push({ importedBook, existingBook: exactMatch });
      }
      continue;
    }

    // Check for fuzzy match in candidates
    const fuzzyMatch = candidates.find((existing) =>
      isFuzzyMatch(
        { title: importedBook.title, author: importedBook.author },
        { title: existing.title, author: existing.author }
      )
    );

    if (fuzzyMatch) {
      possibleMatches.push({ importedBook, existingBook: fuzzyMatch });
    } else {
      newBooks.push({ importedBook });
    }
  }

  return c.json({
    matched,
    possibleMatches,
    newBooks,
    conflicts,
    alreadyInLibrary,
    summary: {
      total: importBooks.length,
      matched: matched.length,
      possibleMatches: possibleMatches.length,
      newBooks: newBooks.length,
      conflicts: conflicts.length,
      alreadyInLibrary: alreadyInLibrary.length,
    },
  });
});

/**
 * POST /api/books/import/confirm
 * Execute the import based on user's decisions from preview
 *
 * Request body: {
 *   matched: [{ existingBookId }],
 *   newBooks: [{ title, author, readingLevel, isbn, description, pageCount, publicationYear, seriesName, seriesNumber }],
 *   conflicts: [{ existingBookId, updateReadingLevel, newReadingLevel }]
 * }
 */
importRouter.post('/import/confirm', requireAdmin(), auditLog('import', 'books'), async (c) => {
  const { matched = [], newBooks = [], conflicts = [] } = await c.req.json();
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  if (!organizationId || !db) {
    throw badRequestError('Multi-tenant mode required for import');
  }

  let linked = 0;
  let created = 0;
  let updated = 0;
  const errors = [];

  // Collect all statements, then execute in batches of 100 (D1 limit)
  const statements = [];

  // 1. Link matched books to organization
  for (const match of matched) {
    statements.push({
      stmt: db
        .prepare(
          `
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
        ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
      `
        )
        .bind(crypto.randomUUID(), organizationId, match.existingBookId),
      onSuccess: () => {
        linked++;
      },
      onError: (err) => {
        errors.push({ type: 'link', bookId: match.existingBookId, error: err });
      },
    });
  }

  // 2. Create new books and link to organization
  const isbnToBookId = new Map();
  for (const book of newBooks) {
    const isbn = book.isbn || null;

    // If we've already seen this ISBN in this import, just link to the existing book
    if (isbn && isbnToBookId.has(isbn)) {
      const existingBookId = isbnToBookId.get(isbn);
      statements.push({
        stmt: db
          .prepare(
            `
          INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
          VALUES (?, ?, ?, 1, datetime('now'))
          ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
        `
          )
          .bind(crypto.randomUUID(), organizationId, existingBookId),
        onSuccess: () => {
          linked++;
        },
        onError: (err) => {
          errors.push({ type: 'link', title: book.title, error: err });
        },
      });
      continue;
    }

    const bookId = crypto.randomUUID();
    if (isbn) isbnToBookId.set(isbn, bookId);

    const pageCount = book.pageCount ? parseInt(book.pageCount, 10) || null : null;
    const publicationYear = book.publicationYear
      ? parseInt(book.publicationYear, 10) || null
      : null;
    const seriesNumber = book.seriesNumber ? parseInt(book.seriesNumber, 10) || null : null;
    statements.push({
      stmt: db
        .prepare(
          `
        INSERT INTO books (id, title, author, reading_level, isbn, description, page_count, publication_year, series_name, series_number, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `
        )
        .bind(
          bookId,
          book.title,
          book.author || null,
          book.readingLevel || null,
          isbn,
          book.description || null,
          pageCount,
          publicationYear,
          book.seriesName || null,
          seriesNumber
        ),
      onSuccess: () => {
        created++;
      },
      onError: (err) => {
        errors.push({ type: 'create', title: book.title, error: err });
      },
    });
    statements.push({
      stmt: db
        .prepare(
          `
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
      `
        )
        .bind(crypto.randomUUID(), organizationId, bookId),
      onSuccess: () => {},
      onError: (err) => {
        errors.push({ type: 'create', title: book.title, error: err });
      },
    });
  }

  // 3. Handle conflicts (update books if requested, then link)
  for (const conflict of conflicts) {
    if (conflict.updateReadingLevel) {
      statements.push({
        stmt: db
          .prepare(
            `
          UPDATE books SET reading_level = ?, updated_at = datetime('now') WHERE id = ?
        `
          )
          .bind(conflict.newReadingLevel, conflict.existingBookId),
        onSuccess: () => {
          updated++;
        },
        onError: (err) => {
          errors.push({ type: 'conflict', bookId: conflict.existingBookId, error: err });
        },
      });
    }
    statements.push({
      stmt: db
        .prepare(
          `
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
        ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
      `
        )
        .bind(crypto.randomUUID(), organizationId, conflict.existingBookId),
      onSuccess: () => {
        linked++;
      },
      onError: (err) => {
        errors.push({ type: 'conflict', bookId: conflict.existingBookId, error: err });
      },
    });
  }

  // Execute in batches of 100 (D1 batch limit)
  const BATCH_SIZE = 100;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const batch = statements.slice(i, i + BATCH_SIZE);
    try {
      await db.batch(batch.map((b) => b.stmt));
      // D1 batches are all-or-nothing — if we get here, all succeeded
      batch.forEach((b) => b.onSuccess());
    } catch (error) {
      // If the entire batch fails, record errors for all items in it
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
      batch.forEach((b) => b.onError('Import batch failed. Please contact support.'));
    }
  }

  return c.json({
    linked,
    created,
    updated,
    errors: errors.length > 0 ? errors : undefined,
    success: errors.length === 0,
  });
});

export { importRouter };
