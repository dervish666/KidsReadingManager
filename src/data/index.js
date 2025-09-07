/**
 * Data Provider Exports
 * Conditionally exports the correct data provider functions based on environment
 */

import * as kvProvider from './kvProvider.js';

/**
 * Detects the appropriate storage mechanism and returns the corresponding provider functions
 * Priority order:
 * 1. STORAGE_TYPE environment variable (if set to 'kv' or 'json')
 * 2. Environment detection (KV available = Cloudflare Worker, otherwise local JSON)
 *
 * @param {Object|null} env - Worker environment (null for Node.js local development)
 * @returns {Object} Object with all provider functions (getAllBooks, getBookById, addBook, updateBook, deleteBook)
 */
async function createProvider(env = null) {
  // Check for explicit STORAGE_TYPE environment variable first
  const storageType = process.env.STORAGE_TYPE || process.env.storage_type;

  if (storageType === 'kv') {
    console.log('Using KV storage (explicitly set via STORAGE_TYPE)');
    return createKVProvider(env);
  }

  if (storageType === 'json') {
    console.log('Using JSON storage (explicitly set via STORAGE_TYPE)');
    return await createJSONProvider();
  }

  // Auto-detect based on environment
  if (env && env.READING_MANAGER_KV) {
    console.log('Using KV storage (auto-detected Cloudflare Worker environment)');
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
    }
  };
}

// Wrapper for KV provider (already async)
function createKVProvider(env) {
  return {
    getAllBooks: (...args) => kvProvider.getAllBooks(env || {}, ...args),
    getBookById: (...args) => kvProvider.getBookById(env || {}, ...args),
    addBook: (...args) => kvProvider.addBook(env || {}, ...args),
    updateBook: (...args) => kvProvider.updateBook(env || {}, ...args),
    deleteBook: (...args) => kvProvider.deleteBook(env || {}, ...args)
  };
}

// Default export - for backwards compatibility, always uses JSON provider
// This can be used when env is not available (like in tests or migrations)
const defaultProvider = null;

// For ES6 modules compatibility in Workers
export default defaultProvider;
export { createProvider };