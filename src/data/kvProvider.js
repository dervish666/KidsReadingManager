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
    console.log('📚 KV addBook called with:', {
      hasEnv: !!env,
      hasKV: !!(env?.READING_MANAGER_KV),
      bookId: newBook?.id,
      bookTitle: newBook?.title
    });

    const kv = getKV(env);
    console.log('📚 KV namespace result:', { hasKV: !!kv });
    
    if (!kv) {
      console.error('❌ KV namespace not available');
      throw new Error('KV namespace not available');
    }

    console.log('📚 Getting existing books...');
    const books = await getAllBooks(env);
    console.log('📚 Current books count:', books.length);

    // Add the new book to the array
    books.push(newBook);
    console.log('📚 Added book, new count:', books.length);

    // Save updated books array
    console.log('📚 Saving to KV...');
    await kv.put('books', JSON.stringify(books));
    console.log('📚 Successfully saved to KV');

    return newBook;
  } catch (error) {
    console.error('❌ Error adding book to KV:', error);
    console.error('❌ Error stack:', error.stack);
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

export {
  getAllBooks,
  getBookById,
  addBook,
  updateBook,
  deleteBook
};