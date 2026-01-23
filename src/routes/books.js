import { Hono } from 'hono';

// Import data provider functions
import { createProvider } from '../data/index.js';

// Import AI service
import { generateBroadSuggestions } from '../services/aiService.js';

// Import utilities
import { notFoundError, badRequestError, serverError } from '../middleware/errorHandler';
import { decryptSensitiveData } from '../utils/crypto.js';
import { buildStudentReadingProfile } from '../utils/studentProfile.js';

// Create router
const booksRouter = new Hono();

/**
 * GET /api/books
 * Get all books (with optional pagination)
 * Query params:
 * - page: Page number (1-based, optional)
 * - pageSize: Items per page (default 50, optional)
 * - search: Search query for title/author (optional)
 */
booksRouter.get('/', async (c) => {
  const provider = await createProvider(c.env);
  const { page, pageSize, search } = c.req.query();
  
  // If search query provided, use search functionality
  if (search && search.trim()) {
    const limit = pageSize ? parseInt(pageSize, 10) : 50;
    const books = await provider.searchBooks(search.trim(), limit);
    return c.json(books);
  }
  
  // If pagination params provided, use paginated query
  if (page) {
    const pageNum = parseInt(page, 10) || 1;
    const size = parseInt(pageSize, 10) || 50;
    const result = await provider.getBooksPaginated(pageNum, size);
    return c.json(result);
  }
  
  // Default: return all books
  const books = await provider.getAllBooks();
  return c.json(books);
});

/**
 * GET /api/books/search
 * Search books by title or author (full-text search with D1)
 * Query params:
 * - q: Search query (required)
 * - limit: Maximum results (default 50)
 */
booksRouter.get('/search', async (c) => {
  const { q, limit } = c.req.query();
  
  if (!q || !q.trim()) {
    return c.json({ error: 'Search query (q) is required' }, 400);
  }
  
  const provider = await createProvider(c.env);
  const maxResults = limit ? parseInt(limit, 10) : 50;
  const books = await provider.searchBooks(q.trim(), maxResults);
  
  return c.json({
    query: q.trim(),
    count: books.length,
    books
  });
});

/**
 * GET /api/books/library-search
 * Find books from the library matching a student's profile
 * No AI - pure database search
 *
 * Query params:
 * - studentId: Required - the student to find books for
 */
booksRouter.get('/library-search', async (c) => {
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

    // Build query to find matching books
    let query = `
      SELECT DISTINCT b.id, b.title, b.author, b.reading_level, b.age_range, b.genre_ids, b.description
      FROM books b
      WHERE 1=1
    `;
    const params = [];

    // Filter by reading level if student has one set
    // Reading levels can be numeric (0.5, 1.0, 2.0) or text (beginner, intermediate)
    const studentLevel = student.readingLevel;
    if (studentLevel) {
      const numericLevel = parseFloat(studentLevel);
      if (!isNaN(numericLevel)) {
        // Numeric level: match within ±0.5 range
        query += ` AND CAST(b.reading_level AS REAL) BETWEEN ? AND ?`;
        params.push(numericLevel - 0.5, numericLevel + 0.5);
      } else {
        // Text level: use text-based matching
        const levelOrder = ['beginner', 'elementary', 'intermediate', 'advanced', 'expert'];
        const studentLevelIndex = levelOrder.indexOf(studentLevel.toLowerCase());
        if (studentLevelIndex >= 0) {
          const validLevels = levelOrder.slice(
            Math.max(0, studentLevelIndex - 1),
            Math.min(levelOrder.length, studentLevelIndex + 2)
          );
          const placeholders = validLevels.map(() => '?').join(',');
          query += ` AND LOWER(b.reading_level) IN (${placeholders})`;
          params.push(...validLevels);
        }
      }
    }
    // If no reading level set, don't filter by level (return all levels)

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

      // Score for matching reading level exactly
      if (studentLevel && book.reading_level) {
        const bookLevel = book.reading_level.toLowerCase();
        const studentLevelLower = studentLevel.toLowerCase();
        if (bookLevel === studentLevelLower) {
          score += 1;
          matchReasons.push('perfect level match');
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
      const genres = genreIds.map(id => genreNameMap[id] || id);

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
        genres,
        matchReason
      };
    });

    return c.json({
      books: formattedBooks,
      studentProfile: {
        name: student.name,
        readingLevel: student.readingLevel,
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
 */
booksRouter.get('/ai-suggestions', async (c) => {
  try {
    const { studentId } = c.req.query();

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
    const suggestions = await generateBroadSuggestions(profile, aiConfig);

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
    console.error('AI suggestions error:', error);
    throw serverError('Failed to generate suggestions. Try again or use "Find in Library" instead.');
  }
});

/**
 * GET /api/books/count
 * Get total book count
 */
booksRouter.get('/count', async (c) => {
  const provider = await createProvider(c.env);
  const count = await provider.getBookCount();
  return c.json({ count });
});

/**
 * POST /api/books
 * Add a new book
 */
booksRouter.post('/', async (c) => {
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
 */
booksRouter.put('/:id', async (c) => {
  const { id } = c.req.param();
  const bookData = await c.req.json();

  // Check if book exists
  const provider = await createProvider(c.env);
  const existingBook = await provider.getBookById(id);
  if (!existingBook) {
    throw notFoundError(`Book with ID ${id} not found`);
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
 */
booksRouter.delete('/:id', async (c) => {
   const { id } = c.req.param();

   // Delete book
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
 */
booksRouter.post('/bulk', async (c) => {
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

export { booksRouter };