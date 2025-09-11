/**
 * KV Provider for Book Data
 * Handles all book operations using Cloudflare Workers KV
 */

// Assuming KV namespace binding is named 'BOOKS_KV' in wrangler.toml
// This should be updated if the binding name is different

/**
 * Get the KV namespace utility function for Workers
 * @param {Object} env - Worker environment object with KV bindings
 * @returns {Object} KV namespace or null if not available
 */
const getKV = (env) => {
  if (!env || !env.READING_MANAGER_KV) {
    console.warn('READING_MANAGER_KV binding not found in environment');
    return null;
  }
  return env.READING_MANAGER_KV;
};

/**
 * Get all books from KV storage
 * @param {Object} env - Worker environment
 * @returns {Array} Array of book objects
 */
const getAllBooks = async (env) => {
  try {
    const kv = getKV(env);
    if (!kv) {
      throw new Error('KV namespace not available');
    }

    const booksData = await kv.get('books');
    if (!booksData) {
      // Initialize empty array if no data exists
      const emptyBooks = JSON.stringify([]);
      await kv.put('books', emptyBooks);
      return [];
    }

    return JSON.parse(booksData);
  } catch (error) {
    console.error('Error getting all books from KV:', error);
    throw new Error('Failed to retrieve books');
  }
};

/**
 * Get a specific book by ID from KV storage
 * @param {Object} env - Worker environment
 * @param {string} id - Book ID to retrieve
 * @returns {Object|null} Book object or null if not found
 */
const getBookById = async (env, id) => {
  try {
    const books = await getAllBooks(env);
    return books.find(book => book.id === id) || null;
  } catch (error) {
    console.error('Error getting book by ID from KV:', error);
    throw new Error('Failed to retrieve book');
  }
};

/**
 * Add a new book to KV storage
 * @param {Object} env - Worker environment
 * @param {Object} newBook - Book object to add
 * @returns {Object} Added book object with any modifications
 */
const addBook = async (env, newBook) => {
  try {
    const kv = getKV(env);
    if (!kv) {
      throw new Error('KV namespace not available');
    }

    const books = await getAllBooks(env);

    // Add the new book to the array
    books.push(newBook);

    // Save updated books array
    await kv.put('books', JSON.stringify(books));

    return newBook;
  } catch (error) {
    console.error('Error adding book to KV:', error);
    throw new Error('Failed to save book');
  }
};

/**
 * Update an existing book in KV storage
 * @param {Object} env - Worker environment
 * @param {string} id - Book ID to update
 * @param {Object} updatedBook - Updated book data
 * @returns {Object} Updated book object
 */
const updateBook = async (env, id, updatedBook) => {
  try {
    const kv = getKV(env);
    if (!kv) {
      throw new Error('KV namespace not available');
    }

    const books = await getAllBooks(env);
    const index = books.findIndex(book => book.id === id);

    if (index === -1) {
      throw new Error('Book not found');
    }

    // Preserve the id and update other fields
    books[index] = { ...updatedBook, id };

    // Save updated books array
    await kv.put('books', JSON.stringify(books));

    return books[index];
  } catch (error) {
    console.error('Error updating book in KV:', error);
    throw new Error('Failed to update book');
  }
};

/**
 * Delete a book by ID from KV storage
 * @param {Object} env - Worker environment
 * @param {string} id - Book ID to delete
 * @returns {Object} Deleted book object for reference
 */
const deleteBook = async (env, id) => {
  try {
    const kv = getKV(env);
    if (!kv) {
      throw new Error('KV namespace not available');
    }

    const books = await getAllBooks(env);
    const bookToDelete = books.find(book => book.id === id);
    const initialLength = books.length;

    const updatedBooks = books.filter(book => book.id !== id);

    if (updatedBooks.length === initialLength) {
      throw new Error('Book not found');
    }

    // Save updated books array
    await kv.put('books', JSON.stringify(updatedBooks));

    return bookToDelete;
  } catch (error) {
    console.error('Error deleting book from KV:', error);
    throw new Error('Failed to delete book');
  }
};

/**
 * Add multiple books in a single batch operation
 * This is more efficient for bulk imports as it only requires 2 KV operations total
 * @param {Object} env - Worker environment
 * @param {Array} newBooks - Array of book objects to add
 * @returns {Array} Array of added books
 */
const addBooksBatch = async (env, newBooks) => {
  try {
    const kv = getKV(env);
    if (!kv) {
      throw new Error('KV namespace not available');
    }

    if (!Array.isArray(newBooks) || newBooks.length === 0) {
      return [];
    }

    // Get current books (1 KV operation)
    const existingBooks = await getAllBooks(env);
    
    // Add all new books to the array
    const updatedBooks = [...existingBooks, ...newBooks];
    
    // Save updated books array (1 KV operation)
    await kv.put('books', JSON.stringify(updatedBooks));
    
    return newBooks;
  } catch (error) {
    console.error('Error adding books batch to KV:', error);
    throw new Error('Failed to save books batch');
  }
};

/**
 * Update multiple books in a single batch operation
 * More efficient for bulk updates as it only requires 2 KV operations total
 * @param {Object} env - Worker environment
 * @param {Array} bookUpdates - Array of {id, bookData} objects
 * @returns {Array} Array of updated books
 */
const updateBooksBatch = async (env, bookUpdates) => {
  try {
    const kv = getKV(env);
    if (!kv) {
      throw new Error('KV namespace not available');
    }

    if (!Array.isArray(bookUpdates) || bookUpdates.length === 0) {
      return [];
    }

    // Get current books (1 KV operation)
    const books = await getAllBooks(env);
    const updatedBooks = [];
    
    // Apply all updates
    bookUpdates.forEach(({ id, bookData }) => {
      const index = books.findIndex(book => book.id === id);
      if (index !== -1) {
        books[index] = { ...bookData, id };
        updatedBooks.push(books[index]);
      }
    });
    
    // Save updated books array (1 KV operation)
    await kv.put('books', JSON.stringify(books));
    
    return updatedBooks;
  } catch (error) {
    console.error('Error updating books batch in KV:', error);
    throw new Error('Failed to update books batch');
  }
};

/**
 * Enhanced addBook that can handle both single and batch operations
 * Automatically detects if we're in a batch context to optimize KV usage
 * @param {Object} env - Worker environment
 * @param {Object} newBook - Book object to add
 * @param {Object} options - Options including batch context
 * @returns {Object} Added book object
 */
const addBookOptimized = async (env, newBook, options = {}) => {
  // If this is part of a batch operation, use the batch method
  if (options.batch && Array.isArray(options.batch)) {
    return addBooksBatch(env, options.batch);
  }
  
  // Otherwise use the original single-book method
  return addBook(env, newBook);
};

export {
  getAllBooks,
  getBookById,
  addBook,
  updateBook,
  deleteBook,
  addBooksBatch,
  updateBooksBatch,
  addBookOptimized
};