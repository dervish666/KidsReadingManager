import { Hono } from 'hono';

// Import data provider functions
import { createProvider } from '../data/index.js';
import { getBooksByOrganization } from '../data/d1Provider.js';

// Import AI service
import { generateBroadSuggestions } from '../services/aiService.js';

// Import utilities
import { notFoundError, badRequestError, serverError } from '../middleware/errorHandler';
import { decryptSensitiveData, permissions } from '../utils/crypto.js';
import { buildStudentReadingProfile } from '../utils/studentProfile.js';
import { isExactMatch, isFuzzyMatch } from '../utils/stringMatching.js';

// Import middleware
import { requireReadonly, requireTeacher } from '../middleware/tenant.js';

// Create router
const booksRouter = new Hono();

// Apply authentication middleware to all book routes
// GET endpoints require at least readonly access
// POST/PUT/DELETE endpoints require teacher access (checked via permissions below)

/**
 * GET /api/books
 * Get all books (with optional pagination)
 * Query params:
 * - page: Page number (1-based, optional)
 * - pageSize: Items per page (default 50, optional)
 * - search: Search query for title/author (optional)
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/', requireReadonly(), async (c) => {
  const provider = await createProvider(c.env);
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;
  const { page, pageSize, search } = c.req.query();

  // In multi-tenant mode, always scope to organization's books
  if (organizationId && db) {
    // Search with org scoping
    if (search && search.trim()) {
      const limit = pageSize ? parseInt(pageSize, 10) : 50;
      const likeQuery = `%${search.trim()}%`;
      const result = await db.prepare(`
        SELECT b.* FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND (b.title LIKE ? OR b.author LIKE ?)
        ORDER BY b.title LIMIT ?
      `).bind(organizationId, likeQuery, likeQuery, limit).all();
      return c.json((result.results || []).map(b => ({
        id: b.id, title: b.title, author: b.author,
        readingLevel: b.reading_level, ageRange: b.age_range,
        genreIds: b.genre_ids, description: b.description
      })));
    }

    // Pagination with org scoping
    if (page) {
      const pageNum = parseInt(page, 10) || 1;
      const size = parseInt(pageSize, 10) || 50;
      const offset = (pageNum - 1) * size;
      const countResult = await db.prepare(
        'SELECT COUNT(*) as count FROM books b INNER JOIN org_book_selections obs ON b.id = obs.book_id WHERE obs.organization_id = ?'
      ).bind(organizationId).first();
      const total = countResult?.count || 0;
      const result = await db.prepare(`
        SELECT b.* FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ?
        ORDER BY b.title LIMIT ? OFFSET ?
      `).bind(organizationId, size, offset).all();
      return c.json({
        books: (result.results || []).map(b => ({
          id: b.id, title: b.title, author: b.author,
          readingLevel: b.reading_level, ageRange: b.age_range,
          genreIds: b.genre_ids, description: b.description
        })),
        total, page: pageNum, pageSize: size,
        totalPages: Math.ceil(total / size)
      });
    }

    // Default: all org books with safety cap to prevent unbounded result sets
    const MAX_DEFAULT_BOOKS = 5000;
    const result = await db.prepare(`
      SELECT b.* FROM books b
      INNER JOIN org_book_selections obs ON b.id = obs.book_id
      WHERE obs.organization_id = ? AND obs.is_available = 1
      ORDER BY b.title LIMIT ?
    `).bind(organizationId, MAX_DEFAULT_BOOKS).all();
    return c.json((result.results || []).map(b => ({
      id: b.id, title: b.title, author: b.author,
      readingLevel: b.reading_level, ageRange: b.age_range,
      genreIds: b.genre_ids, description: b.description
    })));
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

  const maxResults = limit ? parseInt(limit, 10) : 50;
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  // In multi-tenant mode, scope search to organization's books
  if (organizationId && db) {
    const likeQuery = `%${q.trim()}%`;
    const result = await db.prepare(`
      SELECT b.* FROM books b
      INNER JOIN org_book_selections obs ON b.id = obs.book_id
      WHERE obs.organization_id = ? AND (b.title LIKE ? OR b.author LIKE ?)
      ORDER BY b.title LIMIT ?
    `).bind(organizationId, likeQuery, likeQuery, maxResults).all();
    const books = (result.results || []).map(b => ({
      id: b.id, title: b.title, author: b.author,
      readingLevel: b.reading_level, ageRange: b.age_range,
      genreIds: b.genre_ids, description: b.description
    }));
    return c.json({ query: q.trim(), count: books.length, books });
  }

  // Legacy mode
  const provider = await createProvider(c.env);
  const books = await provider.searchBooks(q.trim(), maxResults);
  return c.json({ query: q.trim(), count: books.length, books });
});

/**
 * GET /api/books/library-search
 * Find books from the library matching a student's profile
 * No AI - pure database search
 *
 * Query params:
 * - studentId: Required - the student to find books for
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/library-search', requireReadonly(), async (c) => {
  try {
    const { studentId } = c.req.query();

    if (!studentId) {
      throw badRequestError('studentId query parameter is required');
    }

    const organizationId = c.get('organizationId');
    const db = c.env.READING_MANAGER_DB;

    if (!organizationId || !db) {
      throw badRequestError('Multi-tenant mode required for library search');
    }

    // Build student profile
    const profile = await buildStudentReadingProfile(studentId, organizationId, db);

    if (!profile) {
      throw notFoundError(`Student with ID ${studentId} not found`);
    }

    // Build the search query
    const { student, preferences, inferredGenres, readBookIds } = profile;

    // Build query to find matching books, scoped to organization
    let query = `
      SELECT DISTINCT b.id, b.title, b.author, b.reading_level, b.age_range, b.genre_ids, b.description
      FROM books b
      INNER JOIN org_book_selections obs ON b.id = obs.book_id AND obs.organization_id = ?
      WHERE 1=1
    `;
    const params = [organizationId];

    // Filter by reading level range if student has one set
    const minLevel = student.readingLevelMin;
    const maxLevel = student.readingLevelMax;

    if (minLevel !== null && maxLevel !== null) {
      // Filter books where book level falls within student's range
      // Include books with no reading level (don't exclude unleveled books)
      query += ` AND (b.reading_level IS NULL OR (
        CAST(b.reading_level AS REAL) >= ? AND CAST(b.reading_level AS REAL) <= ?
      ))`;
      params.push(minLevel, maxLevel);
    }
    // If no range set, don't filter by level (return all books)

    // Exclude already-read books
    if (readBookIds.length > 0) {
      const placeholders = readBookIds.map(() => '?').join(',');
      query += ` AND b.id NOT IN (${placeholders})`;
      params.push(...readBookIds);
    }

    // Exclude disliked books (by title match)
    if (preferences.dislikes.length > 0) {
      for (const disliked of preferences.dislikes) {
        query += ` AND b.title NOT LIKE ?`;
        params.push(`%${disliked}%`);
      }
    }

    query += ` LIMIT 100`; // Get more than we need for scoring

    const booksResult = await db.prepare(query).bind(...params).all();
    let books = booksResult.results || [];

    // Score and sort books by genre match
    const scoredBooks = books.map(book => {
      let score = 0;
      const matchReasons = [];
      const bookGenreIds = book.genre_ids ? book.genre_ids.split(',').map(g => g.trim()) : [];

      // Score for matching favorite genres
      for (const genreId of bookGenreIds) {
        if (preferences.favoriteGenreIds.includes(genreId)) {
          score += 3; // Explicit favorite gets higher weight
          matchReasons.push('favorite genre');
        } else if (inferredGenres.some(g => g.id === genreId)) {
          score += 2; // Inferred favorite
          matchReasons.push('matches reading history');
        }
      }

      // Score for books well within the reading level range
      if (minLevel !== null && maxLevel !== null && book.reading_level) {
        const bookLevel = parseFloat(book.reading_level);
        if (!isNaN(bookLevel)) {
          // Calculate how centered the book is within the range
          const rangeCenter = (minLevel + maxLevel) / 2;
          const rangeHalf = (maxLevel - minLevel) / 2;
          const distanceFromCenter = Math.abs(bookLevel - rangeCenter);
          // Bonus for books closer to the center of the range
          if (distanceFromCenter <= rangeHalf * 0.5) {
            score += 1;
            matchReasons.push('ideal level match');
          }
        }
      }

      return { ...book, score, matchReasons: [...new Set(matchReasons)] };
    });

    // Sort by score (highest first) and take top 10
    scoredBooks.sort((a, b) => b.score - a.score);
    const topBooks = scoredBooks.slice(0, 10);

    // Get genre names for display
    const allGenreIds = [...new Set(topBooks.flatMap(b =>
      b.genre_ids ? b.genre_ids.split(',').map(g => g.trim()) : []
    ))];

    let genreNameMap = {};
    if (allGenreIds.length > 0) {
      const placeholders = allGenreIds.map(() => '?').join(',');
      const genresResult = await db.prepare(`
        SELECT id, name FROM genres WHERE id IN (${placeholders})
      `).bind(...allGenreIds).all();

      for (const row of (genresResult.results || [])) {
        genreNameMap[row.id] = row.name;
      }
    }

    // Format response
    const formattedBooks = topBooks.map(book => {
      const genreIds = book.genre_ids ? book.genre_ids.split(',').map(g => g.trim()) : [];
      // Only include genres that have a name in the map (filter out invalid IDs)
      const genres = genreIds
        .filter(id => genreNameMap[id])
        .map(id => genreNameMap[id]);

      // Build match reason string
      let matchReason = 'Matches your reading level';
      if (book.matchReasons.includes('favorite genre')) {
        const matchingGenre = genres.find(g => preferences.favoriteGenreNames.includes(g));
        matchReason = `Matches favorite genre: ${matchingGenre || genres[0] || 'General'}`;
      } else if (book.matchReasons.includes('matches reading history')) {
        matchReason = 'Similar to books you\'ve enjoyed';
      }

      return {
        id: book.id,
        title: book.title,
        author: book.author,
        readingLevel: book.reading_level,
        ageRange: book.age_range,
        description: book.description,
        genres,
        matchReason
      };
    });

    return c.json({
      books: formattedBooks,
      studentProfile: {
        name: student.name,
        readingLevel: student.readingLevel,
        readingLevelMin: student.readingLevelMin,
        readingLevelMax: student.readingLevelMax,
        favoriteGenres: preferences.favoriteGenreNames,
        inferredGenres: inferredGenres.map(g => g.name),
        booksRead: profile.booksReadCount
      }
    });
  } catch (error) {
    // Re-throw known errors (badRequestError, notFoundError)
    if (error.status) {
      throw error;
    }
    // Log unexpected errors and re-throw
    console.error('Error in library-search:', error);
    throw error;
  }
});

/**
 * GET /api/books/ai-suggestions
 * Get AI-powered book suggestions (not constrained to library)
 *
 * Query params:
 * - studentId: Required - the student to get suggestions for
 * - focusMode: Optional - 'balanced' | 'consolidation' | 'challenge' (default: 'balanced')
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/ai-suggestions', requireReadonly(), async (c) => {
  try {
    const { studentId, focusMode = 'balanced' } = c.req.query();

    if (!studentId) {
      throw badRequestError('studentId query parameter is required');
    }

    const organizationId = c.get('organizationId');
    const db = c.env.READING_MANAGER_DB;
    const jwtSecret = c.env.JWT_SECRET;

    if (!organizationId || !db || !jwtSecret) {
      throw badRequestError('Multi-tenant mode required for AI suggestions');
    }

    // Build student profile
    const profile = await buildStudentReadingProfile(studentId, organizationId, db);

    if (!profile) {
      throw notFoundError(`Student with ID ${studentId} not found`);
    }

    // Get AI configuration
    const dbConfig = await db.prepare(`
      SELECT provider, api_key_encrypted, model_preference, is_enabled
      FROM org_ai_config WHERE organization_id = ?
    `).bind(organizationId).first();

    if (!dbConfig || !dbConfig.is_enabled || !dbConfig.api_key_encrypted) {
      throw badRequestError('AI not configured. Please configure an AI provider in Settings to use AI suggestions.');
    }

    // Decrypt API key
    let aiConfig;
    try {
      const decryptedApiKey = await decryptSensitiveData(dbConfig.api_key_encrypted, jwtSecret);
      aiConfig = {
        provider: dbConfig.provider || 'anthropic',
        apiKey: decryptedApiKey,
        model: dbConfig.model_preference
      };
    } catch (decryptError) {
      console.error('Failed to decrypt API key:', decryptError.message);
      throw badRequestError('AI configuration error. Please check Settings.');
    }

    // Generate AI suggestions
    const suggestions = await generateBroadSuggestions(profile, aiConfig, focusMode);

    // Check which suggestions are in the library
    // Add null safety in case AI returns malformed data
    const suggestionTitles = (suggestions || [])
      .filter(s => s && s.title)
      .map(s => s.title.toLowerCase());
    let libraryMatches = {};

    if (suggestionTitles.length > 0) {
      // Search for title matches in library
      const placeholders = suggestionTitles.map(() => '?').join(',');
      const booksResult = await db.prepare(`
        SELECT id, title FROM books WHERE LOWER(title) IN (${placeholders})
      `).bind(...suggestionTitles).all();

      for (const book of (booksResult.results || [])) {
        libraryMatches[book.title.toLowerCase()] = book.id;
      }
    }

    // Add inLibrary flag to each suggestion (with null safety)
    const enrichedSuggestions = (suggestions || []).map(suggestion => ({
      ...suggestion,
      inLibrary: suggestion?.title ? !!libraryMatches[suggestion.title.toLowerCase()] : false,
      libraryBookId: suggestion?.title ? (libraryMatches[suggestion.title.toLowerCase()] || null) : null
    }));

    return c.json({
      suggestions: enrichedSuggestions,
      studentProfile: {
        name: profile.student.name,
        readingLevel: profile.student.readingLevel,
        favoriteGenres: profile.preferences.favoriteGenreNames,
        inferredGenres: profile.inferredGenres.map(g => g.name),
        recentReads: profile.recentReads.map(r => r.title)
      }
    });

  } catch (error) {
    // Re-throw known errors (badRequestError, notFoundError, etc.)
    if (error.status) {
      throw error;
    }
    // Log and handle AI service errors (use 500 for upstream failures)
    console.error('AI suggestions error:', error.message, error.stack);
    throw serverError(`AI error: ${error.message || 'Unknown error'}. Try "Find in Library" instead.`);
  }
});

/**
 * GET /api/books/count
 * Get total book count
 *
 * Requires authentication (at least readonly access)
 */
booksRouter.get('/count', requireReadonly(), async (c) => {
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

  // Basic validation - only title is required
  if (!bookData.title) {
    throw badRequestError('Book must have a title');
  }

  const newBook = {
    id: bookData.id || crypto.randomUUID(),
    title: bookData.title,
    author: bookData.author || null,
    genreIds: bookData.genreIds || [],
    readingLevel: bookData.readingLevel || null,
    ageRange: bookData.ageRange || null,
    description: bookData.description || null
  };

  const provider = await createProvider(c.env);
  const savedBook = await provider.addBook(newBook);
  return c.json(savedBook, 201);
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

  // Check if book exists
  const provider = await createProvider(c.env);
  const existingBook = await provider.getBookById(id);
  if (!existingBook) {
    throw notFoundError(`Book with ID ${id} not found`);
  }

  // In multi-tenant mode, verify the book belongs to this organization
  const organizationId = c.get('organizationId');
  if (organizationId && c.env.READING_MANAGER_DB) {
    const db = c.env.READING_MANAGER_DB;
    const orgLink = await db.prepare(
      'SELECT 1 FROM org_book_selections WHERE organization_id = ? AND book_id = ?'
    ).bind(organizationId, id).first();
    if (!orgLink) {
      throw notFoundError(`Book with ID ${id} not found`);
    }
  }

  // Update book with safe merge
  const updatedBook = {
    ...existingBook,
    title: bookData.title !== undefined ? bookData.title : existingBook.title,
    author: bookData.author !== undefined ? bookData.author : existingBook.author,
    genreIds: bookData.genreIds !== undefined ? bookData.genreIds : existingBook.genreIds,
    readingLevel: bookData.readingLevel !== undefined ? bookData.readingLevel : existingBook.readingLevel,
    ageRange: bookData.ageRange !== undefined ? bookData.ageRange : existingBook.ageRange,
    description: bookData.description !== undefined ? bookData.description : existingBook.description,
    id // Ensure ID doesn't change
  };

  // Validate title if it was changed/provided
  if (!updatedBook.title) {
    throw badRequestError('Book must have a title');
  }

  const updateProvider = await createProvider(c.env);
  const savedBook = await updateProvider.updateBook(id, updatedBook);
  return c.json(savedBook);
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
     const orgLink = await db.prepare(
       'SELECT 1 FROM org_book_selections WHERE organization_id = ? AND book_id = ?'
     ).bind(organizationId, id).first();
     if (!orgLink) {
       throw notFoundError(`Book with ID ${id} not found`);
     }
     // Remove the org's link to the book rather than deleting the global book record
     await db.prepare(
       'DELETE FROM org_book_selections WHERE organization_id = ? AND book_id = ?'
     ).bind(organizationId, id).run();
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

/**
 * POST /api/books/bulk
 * Bulk import books with duplicate detection and KV optimization
 *
 * Requires authentication (at least teacher access)
 */
booksRouter.post('/bulk', requireTeacher(), async (c) => {
  const booksData = await c.req.json();

  // Validate input
  if (!Array.isArray(booksData) || booksData.length === 0) {
    throw badRequestError('Request must contain an array of books');
  }

  // Filter valid books and prepare them
  const validBooks = booksData
    .filter(book => book.title && book.title.trim())
    .map(book => ({
      id: crypto.randomUUID(),
      title: book.title.trim(),
      author: book.author || null,
      genreIds: book.genreIds || [],
      readingLevel: book.readingLevel || null,
      ageRange: book.ageRange || null,
      description: book.description || null
    }));

  if (validBooks.length === 0) {
    throw badRequestError('No valid books found in request');
  }

  // Get existing books for duplicate detection
  const provider = await createProvider(c.env);
  const existingBooks = await provider.getAllBooks();

  // Filter out duplicates
  const isDuplicate = (newBook, existingBooks) => {
    const normalizeTitle = (title) => title.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
    const normalizeAuthor = (author) => author ? author.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ') : '';

    const newTitle = normalizeTitle(newBook.title);
    const newAuthor = normalizeAuthor(newBook.author);

    return existingBooks.some(existing => {
      const existingTitle = normalizeTitle(existing.title);
      const existingAuthor = normalizeAuthor(existing.author);

      if (newTitle === existingTitle) {
        if (newAuthor && existingAuthor) {
          return newAuthor === existingAuthor;
        }
        return true; // Same title, consider duplicate
      }
      return false;
    });
  };

  const newBooks = validBooks.filter(book => !isDuplicate(book, existingBooks));
  const duplicateCount = validBooks.length - newBooks.length;

  // Use batch operation for efficiency (only 2 KV operations total)
  let savedBooks = [];
  if (newBooks.length > 0) {
    savedBooks = await provider.addBooksBatch(newBooks);
  }

  return c.json({
    imported: savedBooks.length,
    duplicates: duplicateCount,
    total: validBooks.length,
    books: savedBooks
  }, 201);
});

/**
 * POST /api/books/import/preview
 * Preview import results: categorize books into matched, fuzzy matches, new, and conflicts
 *
 * Request body: { books: [{ title, author, readingLevel }] }
 * Response: { matched, possibleMatches, newBooks, conflicts, alreadyInLibrary, summary }
 *
 * Categories:
 * - matched: Exact matches to existing books (auto-link to org)
 * - possibleMatches: Fuzzy matches (require user confirmation)
 * - newBooks: No match found (will create new book)
 * - conflicts: Match exists but metadata differs (user decides to update)
 * - alreadyInLibrary: Already linked to this organization
 *
 * Requires authentication (at least teacher access)
 */
booksRouter.post('/import/preview', requireTeacher(), async (c) => {
  const { books: importBooks } = await c.req.json();
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  if (!Array.isArray(importBooks) || importBooks.length === 0) {
    throw badRequestError('Request must contain an array of books');
  }

  if (!organizationId || !db) {
    throw badRequestError('Multi-tenant mode required for import preview');
  }

  // Get all existing books
  const allBooksResult = await db.prepare('SELECT * FROM books').all();
  const existingBooks = allBooksResult.results || [];

  // Get books already in this organization's library
  const orgBooksResult = await db.prepare(
    'SELECT book_id FROM org_book_selections WHERE organization_id = ? AND is_available = 1'
  ).bind(organizationId).all();
  const orgBookIds = new Set((orgBooksResult.results || []).map(r => r.book_id));

  // Categorize imports
  const matched = [];
  const possibleMatches = [];
  const newBooks = [];
  const conflicts = [];
  const alreadyInLibrary = [];

  for (const importedBook of importBooks) {
    if (!importedBook.title || !importedBook.title.trim()) continue;

    // Check for exact match
    const exactMatch = existingBooks.find(existing =>
      isExactMatch(existing.title, importedBook.title) &&
      (!importedBook.author || !existing.author || isExactMatch(existing.author, importedBook.author))
    );

    if (exactMatch) {
      // Check if already in this org's library
      if (orgBookIds.has(exactMatch.id)) {
        alreadyInLibrary.push({ importedBook, existingBook: exactMatch });
        continue;
      }

      // Check for metadata conflicts (reading level difference)
      const hasConflict = importedBook.readingLevel &&
                          exactMatch.reading_level &&
                          importedBook.readingLevel !== exactMatch.reading_level;

      if (hasConflict) {
        conflicts.push({ importedBook, existingBook: exactMatch });
      } else {
        matched.push({ importedBook, existingBook: exactMatch });
      }
      continue;
    }

    // Check for fuzzy match
    const fuzzyMatch = existingBooks.find(existing =>
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
      alreadyInLibrary: alreadyInLibrary.length
    }
  });
});

/**
 * POST /api/books/import/confirm
 * Execute the import based on user's decisions from preview
 *
 * Request body: {
 *   matched: [{ existingBookId }],
 *   newBooks: [{ title, author, readingLevel }],
 *   conflicts: [{ existingBookId, updateReadingLevel, newReadingLevel }]
 * }
 */
booksRouter.post('/import/confirm', requireTeacher(), async (c) => {
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
      stmt: db.prepare(`
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
        ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
      `).bind(crypto.randomUUID(), organizationId, match.existingBookId),
      onSuccess: () => { linked++; },
      onError: (err) => { errors.push({ type: 'link', bookId: match.existingBookId, error: err }); }
    });
  }

  // 2. Create new books and link to organization
  for (const book of newBooks) {
    const bookId = crypto.randomUUID();
    statements.push({
      stmt: db.prepare(`
        INSERT INTO books (id, title, author, reading_level, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(bookId, book.title, book.author || null, book.readingLevel || null),
      onSuccess: () => { created++; },
      onError: (err) => { errors.push({ type: 'create', title: book.title, error: err }); }
    });
    statements.push({
      stmt: db.prepare(`
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
      `).bind(crypto.randomUUID(), organizationId, bookId),
      onSuccess: () => {},
      onError: (err) => { errors.push({ type: 'create', title: book.title, error: err }); }
    });
  }

  // 3. Handle conflicts (update books if requested, then link)
  for (const conflict of conflicts) {
    if (conflict.updateReadingLevel) {
      statements.push({
        stmt: db.prepare(`
          UPDATE books SET reading_level = ?, updated_at = datetime('now') WHERE id = ?
        `).bind(conflict.newReadingLevel, conflict.existingBookId),
        onSuccess: () => { updated++; },
        onError: (err) => { errors.push({ type: 'conflict', bookId: conflict.existingBookId, error: err }); }
      });
    }
    statements.push({
      stmt: db.prepare(`
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
        ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
      `).bind(crypto.randomUUID(), organizationId, conflict.existingBookId),
      onSuccess: () => { linked++; },
      onError: (err) => { errors.push({ type: 'conflict', bookId: conflict.existingBookId, error: err }); }
    });
  }

  // Execute in batches of 100 (D1 batch limit)
  const BATCH_SIZE = 100;
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    const batch = statements.slice(i, i + BATCH_SIZE);
    try {
      const results = await db.batch(batch.map(b => b.stmt));
      results.forEach((result, idx) => {
        if (result.success) {
          batch[idx].onSuccess();
        } else {
          batch[idx].onError(result.error || 'Unknown error');
        }
      });
    } catch (error) {
      // If the entire batch fails, record errors for all items in it
      batch.forEach(b => b.onError(error.message));
    }
  }

  return c.json({
    linked,
    created,
    updated,
    errors: errors.length > 0 ? errors : undefined,
    success: errors.length === 0
  });
});

export { booksRouter };