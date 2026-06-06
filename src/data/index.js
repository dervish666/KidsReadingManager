/**
 * Data Provider — D1-only.
 *
 * Books live in D1 (FTS5-backed global catalog, 18,000+ rows). The former
 * KV/JSON fallback providers were a half-abstraction: they implemented only
 * this books interface while the rest of the app talks to D1 directly, so
 * the local "json mode" silently diverged from production behaviour.
 * Removed in audit cycle 15 (2026-06) — local development uses a local D1
 * database instead (`npm run seed:local`, then `npm run dev`).
 *
 * KV (READING_MANAGER_KV) is still used elsewhere for caching and the legacy
 * shared-password mode (services/kvService.js) — just not as a books store.
 */
import * as d1Provider from './d1Provider.js';

/**
 * Return the books data provider bound to the Worker environment.
 * Kept async for call-site compatibility (`await createProvider(c.env)`).
 *
 * @param {Object} env - Worker environment with READING_MANAGER_DB binding
 * @returns {Promise<Object>} Books provider functions
 * @throws {Error} when the D1 binding is missing
 */
async function createProvider(env = null) {
  if (!env || !env.READING_MANAGER_DB) {
    throw new Error(
      'D1 binding READING_MANAGER_DB is required — for local development run `npm run seed:local` once, then `npm run dev`'
    );
  }

  return {
    getAllBooks: (...args) => d1Provider.getAllBooks(env, ...args),
    getBookById: (...args) => d1Provider.getBookById(env, ...args),
    addBook: (...args) => d1Provider.addBook(env, ...args),
    updateBook: (...args) => d1Provider.updateBook(env, ...args),
    deleteBook: (...args) => d1Provider.deleteBook(env, ...args),
    addBooksBatch: (...args) => d1Provider.addBooksBatch(env, ...args),
    updateBooksBatch: (...args) => d1Provider.updateBooksBatch(env, ...args),
    searchBooks: (...args) => d1Provider.searchBooks(env, ...args),
    getBooksPaginated: (...args) => d1Provider.getBooksPaginated(env, ...args),
    getBookCount: (..._args) => d1Provider.getBookCount(env),
    // AI recommendation filtering - optimized for large book collections
    getFilteredBooksForRecommendations: (...args) =>
      d1Provider.getFilteredBooksForRecommendations(env, ...args),
  };
}

export { createProvider };
