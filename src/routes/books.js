import { Hono } from 'hono';

// Import data provider functions
import { createProvider } from '../data/index.js';

// Import KV service functions
import {
  getStudents,
  getClasses,
  getBooks,
  getSettings
} from '../services/kvService.js';

// Import AI service
import { generateRecommendations } from '../services/aiService.js';

// Import utilities
import { notFoundError, badRequestError } from '../middleware/errorHandler';
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
  const { studentId } = c.req.query();

  if (!studentId) {
    return c.json({ error: 'studentId query parameter is required' }, 400);
  }

  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  if (!organizationId || !db) {
    return c.json({ error: 'Multi-tenant mode required for library search' }, 400);
  }

  // Build student profile
  const profile = await buildStudentReadingProfile(studentId, organizationId, db);

  if (!profile) {
    return c.json({ error: `Student with ID ${studentId} not found` }, 404);
  }

  // Build the search query
  const { student, preferences, inferredGenres, readBookIds } = profile;

  // Reading level mapping for ±1 level matching
  const levelOrder = ['beginner', 'elementary', 'intermediate', 'advanced', 'expert'];
  const studentLevelIndex = levelOrder.indexOf(student.readingLevel.toLowerCase());
  const validLevels = levelOrder.slice(
    Math.max(0, studentLevelIndex - 1),
    Math.min(levelOrder.length, studentLevelIndex + 2)
  );

  // Build query to find matching books
  let query = `
    SELECT DISTINCT b.id, b.title, b.author, b.reading_level, b.age_range, b.genre_ids, b.description
    FROM books b
    WHERE 1=1
  `;
  const params = [];

  // Filter by reading level (±1 level)
  if (validLevels.length > 0 && studentLevelIndex >= 0) {
    const placeholders = validLevels.map(() => '?').join(',');
    query += ` AND LOWER(b.reading_level) IN (${placeholders})`;
    params.push(...validLevels);
  }

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
    if (book.reading_level?.toLowerCase() === student.readingLevel.toLowerCase()) {
      score += 1;
      matchReasons.push('perfect level match');
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

/**
 * GET /api/books/recommendations
 * Get AI-powered book recommendations for a student
 *
 * Optimized for large book collections (18,000+) by using smart pre-filtering:
 * - Filters by reading level (±2 levels from student's level)
 * - Filters by favorite genres (if specified)
 * - Excludes already-read books at the database level
 * - Limits to 100 most relevant books before sending to AI
 */
booksRouter.get('/recommendations', async (c) => {
  try {
    // Extract studentId from query parameters
    const { studentId } = c.req.query();

    if (!studentId) {
      return c.json({ error: 'studentId query parameter is required' }, 400);
    }

    // Get student data from KV service
    const students = await getStudents(c.env);
    const student = students.find(s => s.id === studentId);

    if (!student) {
      return c.json({ error: `Student with ID ${studentId} not found` }, 404);
    }

    // Get the data provider
    const provider = await createProvider(c.env);

    // Get books the student has already read (for the student profile)
    const readBookIds = student.readingSessions?.map(session => session.bookId).filter(Boolean) || [];
    
    // Get AI configuration - check multi-tenant mode first, then fall back to legacy
    let aiConfig = {};
    const organizationId = c.get('organizationId');
    const db = c.env.READING_MANAGER_DB;
    const jwtSecret = c.env.JWT_SECRET;

    if (organizationId && db && jwtSecret) {
      // Multi-tenant mode: get AI config from database
      const dbConfig = await db.prepare(`
        SELECT provider, api_key_encrypted, model_preference, is_enabled
        FROM org_ai_config WHERE organization_id = ?
      `).bind(organizationId).first();

      if (dbConfig && dbConfig.is_enabled && dbConfig.api_key_encrypted) {
        // Decrypt the API key
        try {
          const decryptedApiKey = await decryptSensitiveData(dbConfig.api_key_encrypted, jwtSecret);
          aiConfig = {
            provider: dbConfig.provider || 'anthropic',
            apiKey: decryptedApiKey,
            model: dbConfig.model_preference
          };
        } catch (decryptError) {
          console.error('Failed to decrypt API key:', decryptError.message);
          // Continue without API key - will use fallback recommendations
        }
      }
    } else {
      // Legacy mode: get settings from KV
      const settings = await getSettings(c.env);
      aiConfig = settings?.ai || {};

      // Resolve API key based on provider
      if (aiConfig.keys && aiConfig.provider && aiConfig.keys[aiConfig.provider]) {
        aiConfig.apiKey = aiConfig.keys[aiConfig.provider];
      }

      // Resolve model based on provider
      if (aiConfig.models && aiConfig.provider && aiConfig.models[aiConfig.provider]) {
        aiConfig.model = aiConfig.models[aiConfig.provider];
      }
    }

    // Debug logging (without exposing the actual key)
    console.log('AI Config Debug:', {
      provider: aiConfig.provider,
      hasKey: !!aiConfig.apiKey,
      keyLength: aiConfig.apiKey ? aiConfig.apiKey.length : 0,
      model: aiConfig.model
    });

    if (!aiConfig.apiKey) {
      // Return fallback recommendations
      const fallbackRecommendations = [
        {
          title: "Charlotte's Web",
          author: "E.B. White",
          genre: "Fiction",
          ageRange: "8-12",
          reason: "Classic children's literature with themes of friendship and growing up"
        },
        {
          title: "The Secret Garden",
          author: "Frances Hodgson Burnett",
          genre: "Fiction",
          ageRange: "9-13",
          reason: "Beautiful story about healing, friendship, and the power of nature"
        },
        {
          title: "Harry Potter and the Sorcerer's Stone",
          author: "J.K. Rowling",
          genre: "Fantasy",
          ageRange: "9-12",
          reason: "Magical adventure that sparks imagination and creativity"
        }
      ];

      return c.json({ recommendations: fallbackRecommendations });
    }

    // Use smart filtering to get relevant books for recommendations
    // This is optimized for large book collections (18,000+)
    const studentReadingLevel = student.readingLevel || 'intermediate';
    const favoriteGenreIds = student.preferences?.favoriteGenreIds || [];

    console.log('Recommendation filtering:', {
      studentName: student.name,
      readingLevel: studentReadingLevel,
      favoriteGenres: favoriteGenreIds.length,
      alreadyReadCount: readBookIds.length
    });

    // Get filtered books using the optimized query
    // This filters at the database level instead of loading all 18,000+ books
    let filteredBooks = [];
    if (provider.getFilteredBooksForRecommendations) {
      filteredBooks = await provider.getFilteredBooksForRecommendations({
        readingLevel: studentReadingLevel,
        excludeBookIds: readBookIds,
        favoriteGenreIds: favoriteGenreIds,
        levelRange: 2, // ±2 reading levels
        limit: 100 // Get up to 100 relevant books
      });
    } else {
      // Fallback for providers without optimized filtering
      const allBooks = await provider.getAllBooks();
      filteredBooks = allBooks
        .filter(book => !readBookIds.includes(book.id))
        .slice(0, 100);
    }

    console.log(`Filtered books for AI: ${filteredBooks.length} books (from potentially 18,000+)`);

    // Get read books for the student profile (need to fetch these separately)
    // Only fetch the ones we need for the profile (last 10 read)
    let readBooks = [];
    if (readBookIds.length > 0) {
      const recentReadIds = readBookIds.slice(-10); // Last 10 books read
      const bookPromises = recentReadIds.map(id => provider.getBookById(id));
      const fetchedBooks = await Promise.all(bookPromises);
      readBooks = fetchedBooks.filter(Boolean); // Remove any null results
    }

    // Prepare data for AI service
    const studentProfile = {
      name: student.name,
      readingLevel: studentReadingLevel,
      preferences: student.preferences || {},
      booksRead: readBooks.map(book => ({
        title: book.title,
        author: book.author,
        genre: book.genreIds?.join(', ') || 'General Fiction',
        readingLevel: book.readingLevel || 'intermediate'
      }))
    };

    // Prepare available books for AI (limit to 50 for prompt size)
    const availableBooks = filteredBooks.slice(0, 50).map(book => ({
      title: book.title,
      author: book.author,
      genre: book.genreIds?.join(', ') || 'General Fiction',
      readingLevel: book.readingLevel || 'intermediate',
      ageRange: book.ageRange || '8-12'
    }));

    // Generate recommendations using AI service
    try {
      const recommendations = await generateRecommendations({
        studentProfile,
        availableBooks,
        config: aiConfig
      });

      return c.json({ recommendations });

    } catch (aiError) {
      console.error('AI service error:', aiError);
      
      // Return fallback recommendations on error
      const emergencyRecommendations = [
        {
          title: "Wonder",
          author: "R.J. Palacio",
          genre: "Fiction",
          ageRange: "8-12",
          reason: "Inspiring story about kindness and understanding differences, perfect for developing empathy and emotional intelligence"
        },
        {
          title: "The One and Only Ivan",
          author: "Katherine Applegate",
          genre: "Fiction",
          ageRange: "8-12",
          reason: "Heartwarming story about friendship and freedom told from an elephant's perspective"
        },
        {
          title: "Roald Dahl Collection",
          author: "Roald Dahl",
          genre: "Fiction",
          ageRange: "8-12",
          reason: "Imaginative and humorous stories that spark creativity and encourage a love of reading"
        }
      ];

      return c.json({ recommendations: emergencyRecommendations });
    }

  } catch (error) {
    console.error('Error generating recommendations:', error);

    // Return basic fallback recommendations
    const fallbackRecommendations = [
      {
        title: "The Giving Tree",
        author: "Shel Silverstein",
        genre: "Fiction",
        ageRange: "5-10",
        reason: "A touching story about friendship and generosity that teaches valuable life lessons"
      },
      {
        title: "Where the Wild Things Are",
        author: "Maurice Sendak",
        genre: "Picture Book",
        ageRange: "4-8",
        reason: "A classic picture book that explores imagination and emotions through Max's adventure"
      },
      {
        title: "Green Eggs and Ham",
        author: "Dr. Seuss",
        genre: "Fiction",
        ageRange: "4-8",
        reason: "Fun rhyming story that encourages trying new things and expanding your horizons"
      }
    ];

    return c.json({ recommendations: fallbackRecommendations });
  }
});

export { booksRouter };