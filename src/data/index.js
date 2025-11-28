/**
 * Data Provider Exports
 * Conditionally exports the correct data provider functions based on environment
 *
 * Storage Strategy:
 * - D1 Database: Used for books (scalable SQL storage for 18,000+ books)
 * - KV Storage: Used for students, classes, settings, genres (smaller datasets)
 * - JSON: Used for local development only
 */

import * as kvProvider from './kvProvider.js';
import * as d1Provider from './d1Provider.js';

/**
 * Detects the appropriate storage mechanism and returns the corresponding provider functions
 * Priority order:
 * 1. D1 database if available (for books - scalable SQL storage)
 * 2. STORAGE_TYPE environment variable (if set to 'kv' or 'json')
 * 3. Environment detection (KV available = Cloudflare Worker, otherwise local JSON)
 *
 * @param {Object|null} env - Worker environment (null for Node.js local development)
 * @returns {Object} Object with all provider functions (getAllBooks, getBookById, addBook, updateBook, deleteBook)
 */
async function createProvider(env = null) {
  // Check for explicit STORAGE_TYPE environment variable first
  const storageType = typeof process !== 'undefined' ? (process.env.STORAGE_TYPE || process.env.storage_type) : null;

  // If D1 database is available, use it for books (preferred for large collections)
  if (env && env.READING_MANAGER_DB) {
    console.log('Using D1 database for books (scalable SQL storage)');
    return createD1Provider(env);
  }

  if (storageType === 'kv') {
    console.log('Using KV storage (explicitly set via STORAGE_TYPE)');
    return createKVProvider(env);
  }

  if (storageType === 'json') {
    console.log('Using JSON storage (explicitly set via STORAGE_TYPE)');
    return await createJSONProvider();
  }

  // Auto-detect based on environment - fallback to KV if D1 not available
  if (env && env.READING_MANAGER_KV) {
    console.log('Using KV storage (auto-detected Cloudflare Worker environment, D1 not available)');
    return createKVProvider(env);
  }

  // Default to JSON for local development
  console.log('Using JSON storage (auto-detected local Node.js environment)');
  return await createJSONProvider();
}

// Wrapper for JSON provider to make it async-compatible
async function createJSONProvider() {
  // Check if we're in a Node.js environment (not Cloudflare Workers)
  if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
    throw new Error('JSON provider is only available in Node.js environments for local development');
  }

  // Dynamic import to avoid build errors in Cloudflare Workers
  const jsonProvider = await import('./jsonProvider.js').catch(err => {
    throw new Error(`Failed to load JSON provider: ${err.message}`);
  });

  return {
    async getAllBooks() {
      return jsonProvider.default.getAllBooks();
    },

    async getBookById(id) {
      return jsonProvider.default.getBookById(id);
    },

    async addBook(book) {
      return jsonProvider.default.addBook(book);
    },

    async updateBook(id, book) {
      return jsonProvider.default.updateBook(id, book);
    },

    async deleteBook(id) {
      return jsonProvider.default.deleteBook(id);
    },

    async addBooksBatch(books) {
      return jsonProvider.default.addBooksBatch(books);
    },

    async updateBooksBatch(bookUpdates) {
      return jsonProvider.default.updateBooksBatch(bookUpdates);
    }
  };
}

// Wrapper for D1 provider (SQL database for books)
function createD1Provider(env) {
  return {
    getAllBooks: (...args) => d1Provider.getAllBooks(env || {}, ...args),
    getBookById: (...args) => d1Provider.getBookById(env || {}, ...args),
    addBook: (...args) => d1Provider.addBook(env || {}, ...args),
    updateBook: (...args) => d1Provider.updateBook(env || {}, ...args),
    deleteBook: (...args) => d1Provider.deleteBook(env || {}, ...args),
    addBooksBatch: (...args) => d1Provider.addBooksBatch(env || {}, ...args),
    updateBooksBatch: (...args) => d1Provider.updateBooksBatch(env || {}, ...args),
    // D1-specific methods for enhanced functionality
    searchBooks: (...args) => d1Provider.searchBooks(env || {}, ...args),
    getBooksPaginated: (...args) => d1Provider.getBooksPaginated(env || {}, ...args),
    getBookCount: (...args) => d1Provider.getBookCount(env || {})
  };
}

// Wrapper for KV provider (already async) - fallback for when D1 is not available
function createKVProvider(env) {
  return {
    getAllBooks: (...args) => kvProvider.getAllBooks(env || {}, ...args),
    getBookById: (...args) => kvProvider.getBookById(env || {}, ...args),
    addBook: (...args) => kvProvider.addBook(env || {}, ...args),
    updateBook: (...args) => kvProvider.updateBook(env || {}, ...args),
    deleteBook: (...args) => kvProvider.deleteBook(env || {}, ...args),
    addBooksBatch: (...args) => kvProvider.addBooksBatch(env || {}, ...args),
    updateBooksBatch: (...args) => kvProvider.updateBooksBatch(env || {}, ...args),
    // Stub methods for compatibility (KV doesn't have these optimized methods)
    searchBooks: async (query, limit = 50) => {
      const books = await kvProvider.getAllBooks(env || {});
      const lowerQuery = query.toLowerCase();
      return books
        .filter(book =>
          book.title?.toLowerCase().includes(lowerQuery) ||
          book.author?.toLowerCase().includes(lowerQuery)
        )
        .slice(0, limit);
    },
    getBooksPaginated: async (page = 1, pageSize = 50) => {
      const books = await kvProvider.getAllBooks(env || {});
      const offset = (page - 1) * pageSize;
      return {
        books: books.slice(offset, offset + pageSize),
        total: books.length,
        page,
        pageSize,
        totalPages: Math.ceil(books.length / pageSize)
      };
    },
    getBookCount: async () => {
      const books = await kvProvider.getAllBooks(env || {});
      return books.length;
    }
  };
}

// Default export - for backwards compatibility, always uses JSON provider
// This can be used when env is not available (like in tests or migrations)
const defaultProvider = null;

// For ES6 modules compatibility in Workers
export default defaultProvider;
export { createProvider };