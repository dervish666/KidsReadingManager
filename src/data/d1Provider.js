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
 * Get all books from D1 database
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

export {
  getAllBooks,
  getBookById,
  addBook,
  updateBook,
  deleteBook,
  addBooksBatch,
  updateBooksBatch,
  searchBooks,
  getBooksPaginated,
  getBookCount
};