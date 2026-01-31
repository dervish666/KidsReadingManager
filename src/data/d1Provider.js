/**
 * D1 Provider for Book Data
 * Handles all book operations using Cloudflare D1 SQL database
 * 
 * This provider is designed for large book collections (18,000+ books)
 * and provides efficient SQL-based queries with full-text search support.
 */

/**
 * Get the D1 database instance
 * @param {Object} env - Worker environment object with D1 binding
 * @returns {Object} D1 database instance or null if not available
 */
const getDB = (env) => {
  if (!env || !env.READING_MANAGER_DB) {
    console.warn('READING_MANAGER_DB binding not found in environment');
    return null;
  }
  return env.READING_MANAGER_DB;
};

/**
 * Convert database row to book object (snake_case to camelCase)
 * @param {Object} row - Database row
 * @returns {Object} Book object with camelCase properties
 */
const rowToBook = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    genreIds: row.genre_ids ? JSON.parse(row.genre_ids) : [],
    readingLevel: row.reading_level,
    ageRange: row.age_range,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/**
 * Convert book object to database row (camelCase to snake_case)
 * @param {Object} book - Book object
 * @returns {Object} Database row with snake_case properties
 */
const bookToRow = (book) => {
  return {
    id: book.id,
    title: book.title,
    author: book.author || null,
    genre_ids: book.genreIds ? JSON.stringify(book.genreIds) : null,
    reading_level: book.readingLevel || null,
    age_range: book.ageRange || null,
    description: book.description || null
  };
};

/**
 * Get all books from D1 database (no organization filter - for admin/legacy use)
 * @param {Object} env - Worker environment
 * @returns {Promise<Array>} Array of book objects
 */
const getAllBooks = async (env) => {
  try {
    const db = getDB(env);
    if (!db) {
      throw new Error('D1 database not available');
    }

    const result = await db.prepare('SELECT * FROM books ORDER BY title').all();
    return (result.results || []).map(rowToBook);
  } catch (error) {
    console.error('Error getting all books from D1:', error);
    throw new Error('Failed to retrieve books');
  }
};

/**
 * Get books for a specific organization (filtered by org_book_selections)
 * @param {Object} env - Worker environment
 * @param {string} organizationId - Organization ID to filter by
 * @returns {Promise<Array>} Array of book objects linked to the organization
 */
const getBooksByOrganization = async (env, organizationId) => {
  try {
    const db = getDB(env);
    if (!db) {
      throw new Error('D1 database not available');
    }

    const result = await db.prepare(`
      SELECT b.* FROM books b
      INNER JOIN org_book_selections obs ON b.id = obs.book_id
      WHERE obs.organization_id = ? AND obs.is_available = 1
      ORDER BY b.title
    `).bind(organizationId).all();

    return (result.results || []).map(rowToBook);
  } catch (error) {
    console.error('Error getting books by organization from D1:', error);
    throw new Error('Failed to retrieve books');
  }
};

/**
 * Get a specific book by ID from D1 database
 * @param {Object} env - Worker environment
 * @param {string} id - Book ID to retrieve
 * @returns {Promise<Object|null>} Book object or null if not found
 */
const getBookById = async (env, id) => {
  try {
    const db = getDB(env);
    if (!db) {
      throw new Error('D1 database not available');
    }

    const result = await db.prepare('SELECT * FROM books WHERE id = ?').bind(id).first();
    return rowToBook(result);
  } catch (error) {
    console.error('Error getting book by ID from D1:', error);
    throw new Error('Failed to retrieve book');
  }
};

/**
 * Add a new book to D1 database
 * @param {Object} env - Worker environment
 * @param {Object} newBook - Book object to add
 * @returns {Promise<Object>} Added book object
 */
const addBook = async (env, newBook) => {
  try {
    const db = getDB(env);
    if (!db) {
      throw new Error('D1 database not available');
    }

    const row = bookToRow(newBook);
    
    await db.prepare(`
      INSERT INTO books (id, title, author, genre_ids, reading_level, age_range, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      row.id,
      row.title,
      row.author,
      row.genre_ids,
      row.reading_level,
      row.age_range,
      row.description
    ).run();

    return newBook;
  } catch (error) {
    console.error('Error adding book to D1:', error);
    throw new Error('Failed to save book');
  }
};

/**
 * Update an existing book in D1 database
 * @param {Object} env - Worker environment
 * @param {string} id - Book ID to update
 * @param {Object} updatedBook - Updated book data
 * @returns {Promise<Object>} Updated book object
 */
const updateBook = async (env, id, updatedBook) => {
  try {
    const db = getDB(env);
    if (!db) {
      throw new Error('D1 database not available');
    }

    // Check if book exists
    const existing = await getBookById(env, id);
    if (!existing) {
      throw new Error('Book not found');
    }

    const row = bookToRow({ ...updatedBook, id });
    
    await db.prepare(`
      UPDATE books 
      SET title = ?, author = ?, genre_ids = ?, reading_level = ?, age_range = ?, description = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      row.title,
      row.author,
      row.genre_ids,
      row.reading_level,
      row.age_range,
      row.description,
      id
    ).run();

    return { ...updatedBook, id };
  } catch (error) {
    console.error('Error updating book in D1:', error);
    throw new Error('Failed to update book');
  }
};

/**
 * Delete a book by ID from D1 database
 * @param {Object} env - Worker environment
 * @param {string} id - Book ID to delete
 * @returns {Promise<Object|null>} Deleted book object for reference
 */
const deleteBook = async (env, id) => {
  try {
    const db = getDB(env);
    if (!db) {
      throw new Error('D1 database not available');
    }

    // Get book before deleting for return value
    const bookToDelete = await getBookById(env, id);
    if (!bookToDelete) {
      throw new Error('Book not found');
    }

    await db.prepare('DELETE FROM books WHERE id = ?').bind(id).run();

    return bookToDelete;
  } catch (error) {
    console.error('Error deleting book from D1:', error);
    throw new Error('Failed to delete book');
  }
};

/**
 * Add multiple books in a single batch operation
 * Uses D1 batch API for efficient bulk inserts
 * @param {Object} env - Worker environment
 * @param {Array} newBooks - Array of book objects to add
 * @returns {Promise<Array>} Array of added books
 */
const addBooksBatch = async (env, newBooks) => {
  try {
    const db = getDB(env);
    if (!db) {
      throw new Error('D1 database not available');
    }

    if (!Array.isArray(newBooks) || newBooks.length === 0) {
      return [];
    }

    // Prepare batch statements
    const statements = newBooks.map(book => {
      const row = bookToRow(book);
      return db.prepare(`
        INSERT INTO books (id, title, author, genre_ids, reading_level, age_range, description)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        row.id,
        row.title,
        row.author,
        row.genre_ids,
        row.reading_level,
        row.age_range,
        row.description
      );
    });

    // Execute batch (D1 supports up to 100 statements per batch)
    // For larger batches, we need to chunk them
    const BATCH_SIZE = 100;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const batch = statements.slice(i, i + BATCH_SIZE);
      await db.batch(batch);
    }

    return newBooks;
  } catch (error) {
    console.error('Error adding books batch to D1:', error);
    throw new Error('Failed to save books batch');
  }
};

/**
 * Update multiple books in a single batch operation
 * @param {Object} env - Worker environment
 * @param {Array} bookUpdates - Array of {id, bookData} objects
 * @returns {Promise<Array>} Array of updated books
 */
const updateBooksBatch = async (env, bookUpdates) => {
  try {
    const db = getDB(env);
    if (!db) {
      throw new Error('D1 database not available');
    }

    if (!Array.isArray(bookUpdates) || bookUpdates.length === 0) {
      return [];
    }

    // Prepare batch statements
    const statements = bookUpdates.map(({ id, bookData }) => {
      const row = bookToRow({ ...bookData, id });
      return db.prepare(`
        UPDATE books 
        SET title = ?, author = ?, genre_ids = ?, reading_level = ?, age_range = ?, description = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        row.title,
        row.author,
        row.genre_ids,
        row.reading_level,
        row.age_range,
        row.description,
        id
      );
    });

    // Execute batch
    const BATCH_SIZE = 100;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      const batch = statements.slice(i, i + BATCH_SIZE);
      await db.batch(batch);
    }

    return bookUpdates.map(({ id, bookData }) => ({ ...bookData, id }));
  } catch (error) {
    console.error('Error updating books batch in D1:', error);
    throw new Error('Failed to update books batch');
  }
};

/**
 * Search books using full-text search
 * @param {Object} env - Worker environment
 * @param {string} query - Search query
 * @param {number} limit - Maximum number of results (default 50)
 * @returns {Promise<Array>} Array of matching book objects
 */
const searchBooks = async (env, query, limit = 50) => {
  try {
    const db = getDB(env);
    if (!db) {
      throw new Error('D1 database not available');
    }

    if (!query || query.trim().length === 0) {
      return [];
    }

    // Use FTS5 for full-text search
    const result = await db.prepare(`
      SELECT books.* FROM books
      INNER JOIN books_fts ON books.id = books_fts.id
      WHERE books_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).bind(query + '*', limit).all();

    return (result.results || []).map(rowToBook);
  } catch (error) {
    console.error('Error searching books in D1:', error);
    // Fallback to LIKE search if FTS fails
    try {
      const db = getDB(env);
      const likeQuery = `%${query}%`;
      const result = await db.prepare(`
        SELECT * FROM books 
        WHERE title LIKE ? OR author LIKE ?
        ORDER BY title
        LIMIT ?
      `).bind(likeQuery, likeQuery, limit).all();
      
      return (result.results || []).map(rowToBook);
    } catch (fallbackError) {
      console.error('Fallback search also failed:', fallbackError);
      throw new Error('Failed to search books');
    }
  }
};

/**
 * Get books with pagination
 * @param {Object} env - Worker environment
 * @param {number} page - Page number (1-based)
 * @param {number} pageSize - Number of items per page
 * @returns {Promise<{books: Array, total: number, page: number, pageSize: number, totalPages: number}>}
 */
const getBooksPaginated = async (env, page = 1, pageSize = 50) => {
  try {
    const db = getDB(env);
    if (!db) {
      throw new Error('D1 database not available');
    }

    const offset = (page - 1) * pageSize;

    // Get total count
    const countResult = await db.prepare('SELECT COUNT(*) as count FROM books').first();
    const total = countResult?.count || 0;

    // Get paginated results
    const result = await db.prepare(`
      SELECT * FROM books 
      ORDER BY title 
      LIMIT ? OFFSET ?
    `).bind(pageSize, offset).all();

    return {
      books: (result.results || []).map(rowToBook),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    };
  } catch (error) {
    console.error('Error getting paginated books from D1:', error);
    throw new Error('Failed to retrieve books');
  }
};

/**
 * Get book count
 * @param {Object} env - Worker environment
 * @returns {Promise<number>} Total number of books
 */
const getBookCount = async (env) => {
  try {
    const db = getDB(env);
    if (!db) {
      throw new Error('D1 database not available');
    }

    const result = await db.prepare('SELECT COUNT(*) as count FROM books').first();
    return result?.count || 0;
  } catch (error) {
    console.error('Error getting book count from D1:', error);
    throw new Error('Failed to get book count');
  }
};

/**
 * Reading level to numeric value mapping for range queries
 * Allows filtering books within ±N levels of student's reading level
 */
const READING_LEVEL_MAP = {
  'beginner': 1,
  'early': 2,
  'developing': 3,
  'intermediate': 4,
  'advanced': 5,
  'expert': 6
};

/**
 * Get numeric value for a reading level (case-insensitive)
 * @param {string} level - Reading level string
 * @returns {number} Numeric value (defaults to 4 for intermediate if unknown)
 */
const getReadingLevelValue = (level) => {
  if (!level) return 4; // Default to intermediate
  const normalized = level.toLowerCase().trim();
  return READING_LEVEL_MAP[normalized] || 4;
};

/**
 * Get filtered books optimized for AI recommendations
 * Uses SQL-level filtering to efficiently handle large book collections (18,000+)
 *
 * Filtering strategy:
 * 1. Exclude already-read books
 * 2. Filter by reading level (±levelRange from student's level)
 * 3. Filter by favorite genres (if specified)
 * 4. Randomize results for variety
 * 5. Limit to specified count
 *
 * @param {Object} env - Worker environment
 * @param {Object} options - Filtering options
 * @param {string} options.readingLevel - Student's reading level
 * @param {Array<string>} options.excludeBookIds - Book IDs to exclude (already read)
 * @param {Array<string>} options.favoriteGenreIds - Preferred genre IDs
 * @param {number} options.levelRange - Reading level range (default: 2)
 * @param {number} options.limit - Maximum books to return (default: 100)
 * @returns {Promise<Array>} Array of filtered book objects
 */
const getFilteredBooksForRecommendations = async (env, options = {}) => {
  try {
    const db = getDB(env);
    if (!db) {
      throw new Error('D1 database not available');
    }

    const {
      readingLevel = 'intermediate',
      excludeBookIds = [],
      favoriteGenreIds = [],
      levelRange = 2,
      limit = 100
    } = options;

    // Calculate reading level range
    const studentLevel = getReadingLevelValue(readingLevel);
    const minLevel = Math.max(1, studentLevel - levelRange);
    const maxLevel = Math.min(6, studentLevel + levelRange);

    // Get reading levels that fall within the range
    const validLevels = Object.entries(READING_LEVEL_MAP)
      .filter(([_, value]) => value >= minLevel && value <= maxLevel)
      .map(([level, _]) => level);

    // Build the query dynamically based on filters
    let query = 'SELECT * FROM books WHERE 1=1';
    const params = [];

    // Filter by reading level if we have valid levels
    if (validLevels.length > 0) {
      const levelPlaceholders = validLevels.map(() => '?').join(', ');
      query += ` AND (reading_level IN (${levelPlaceholders}) OR reading_level IS NULL)`;
      params.push(...validLevels);
    }

    // Exclude already-read books (batch into chunks to avoid SQL limits)
    if (excludeBookIds.length > 0) {
      // SQLite has a limit on the number of parameters, so we handle this carefully
      // For very large exclusion lists, we'll use a subquery approach
      if (excludeBookIds.length <= 500) {
        const excludePlaceholders = excludeBookIds.map(() => '?').join(', ');
        query += ` AND id NOT IN (${excludePlaceholders})`;
        params.push(...excludeBookIds);
      }
      // For larger lists, we'll filter in JavaScript after the query
    }

    // Filter by favorite genres if specified
    // Genre IDs are stored as JSON array in genre_ids column
    if (favoriteGenreIds.length > 0) {
      // Use LIKE for JSON array matching (works with SQLite)
      const genreConditions = favoriteGenreIds.map(() => 'genre_ids LIKE ?').join(' OR ');
      query += ` AND (${genreConditions})`;
      params.push(...favoriteGenreIds.map(id => `%"${id}"%`));
    }

    // Add randomization and limit
    query += ' ORDER BY RANDOM() LIMIT ?';
    params.push(limit);

    console.log('Filtered books query:', query);
    console.log('Query params count:', params.length);

    const result = await db.prepare(query).bind(...params).all();
    let books = (result.results || []).map(rowToBook);

    // If we had too many exclusions, filter them in JavaScript
    if (excludeBookIds.length > 500) {
      const excludeSet = new Set(excludeBookIds);
      books = books.filter(book => !excludeSet.has(book.id));
    }

    console.log(`Filtered books: ${books.length} results for level ${readingLevel} (range: ${minLevel}-${maxLevel})`);

    // If we got too few results, try a fallback query with relaxed filters
    if (books.length < 20) {
      console.log('Too few results, trying fallback query with relaxed filters...');
      return await getFilteredBooksForRecommendationsFallback(env, {
        excludeBookIds,
        limit
      });
    }

    return books;
  } catch (error) {
    console.error('Error getting filtered books from D1:', error);
    // Fallback to basic query on error
    return await getFilteredBooksForRecommendationsFallback(env, {
      excludeBookIds: options.excludeBookIds || [],
      limit: options.limit || 100
    });
  }
};

/**
 * Fallback query for when strict filtering returns too few results
 * Returns random books excluding already-read ones
 *
 * @param {Object} env - Worker environment
 * @param {Object} options - Options
 * @param {Array<string>} options.excludeBookIds - Book IDs to exclude
 * @param {number} options.limit - Maximum books to return
 * @returns {Promise<Array>} Array of book objects
 */
const getFilteredBooksForRecommendationsFallback = async (env, options = {}) => {
  try {
    const db = getDB(env);
    if (!db) {
      throw new Error('D1 database not available');
    }

    const { excludeBookIds = [], limit = 100 } = options;

    let query = 'SELECT * FROM books';
    const params = [];

    if (excludeBookIds.length > 0 && excludeBookIds.length <= 500) {
      const excludePlaceholders = excludeBookIds.map(() => '?').join(', ');
      query += ` WHERE id NOT IN (${excludePlaceholders})`;
      params.push(...excludeBookIds);
    }

    query += ' ORDER BY RANDOM() LIMIT ?';
    params.push(limit);

    const result = await db.prepare(query).bind(...params).all();
    let books = (result.results || []).map(rowToBook);

    // Filter exclusions in JavaScript if needed
    if (excludeBookIds.length > 500) {
      const excludeSet = new Set(excludeBookIds);
      books = books.filter(book => !excludeSet.has(book.id));
    }

    console.log(`Fallback query returned ${books.length} books`);
    return books;
  } catch (error) {
    console.error('Error in fallback books query:', error);
    throw new Error('Failed to retrieve books for recommendations');
  }
};

export {
  getAllBooks,
  getBooksByOrganization,
  getBookById,
  addBook,
  updateBook,
  deleteBook,
  addBooksBatch,
  updateBooksBatch,
  searchBooks,
  getBooksPaginated,
  getBookCount,
  getFilteredBooksForRecommendations,
  READING_LEVEL_MAP
};