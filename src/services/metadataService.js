/**
 * Metadata cascade engine.
 * Calls providers in configured order, merges best-of results per field.
 */
import { fetchMetadata as openLibraryFetch } from './providers/openLibraryProvider.js';
import { fetchMetadata as googleBooksFetch } from './providers/googleBooksProvider.js';
import { fetchMetadata as hardcoverFetch } from './providers/hardcoverProvider.js';

const PROVIDERS = {
  openlibrary: { fetch: openLibraryFetch, needsKey: false },
  googlebooks: { fetch: googleBooksFetch, needsKey: true, keyField: 'googleBooksApiKey' },
  hardcover: { fetch: hardcoverFetch, needsKey: true, keyField: 'hardcoverApiKey' },
};

const MERGE_FIELDS = [
  'author', 'description', 'genres', 'isbn',
  'pageCount', 'publicationYear', 'seriesName', 'seriesNumber', 'coverUrl',
];

/**
 * Enrich a single book by calling providers in cascade order.
 *
 * @param {{ id: string, title: string, author?: string, isbn?: string }} book
 * @param {{ providerChain: string[], hardcoverApiKey?: string, googleBooksApiKey?: string, fetchCovers: boolean }} config
 * @returns {Promise<{ merged: object, log: Array<{ provider: string, fields: string[] }>, rateLimited: string[] }>}
 */
export async function enrichBook(book, config) {
  const merged = {};
  const log = [];
  const rateLimited = [];

  // Determine which fields to target (exclude coverUrl if fetchCovers is false)
  const targetFields = config.fetchCovers === false
    ? MERGE_FIELDS.filter((f) => f !== 'coverUrl')
    : MERGE_FIELDS;

  for (const providerName of config.providerChain) {
    const provider = PROVIDERS[providerName];
    if (!provider) continue;

    // Skip providers that need a key if none is configured
    if (provider.needsKey && !config[provider.keyField]) continue;

    // Call the provider
    const apiKey = provider.needsKey ? config[provider.keyField] : undefined;
    const result = await provider.fetch(book, apiKey);

    if (result.rateLimited) {
      rateLimited.push(providerName);
      continue;
    }

    // Merge: first non-empty value wins per field
    const fieldsFromThisProvider = [];
    for (const field of targetFields) {
      if (merged[field] != null) continue; // Already filled by earlier provider
      const value = result[field];
      if (value == null) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (typeof value === 'string' && !value.trim()) continue;

      merged[field] = value;
      fieldsFromThisProvider.push(field);
    }

    if (fieldsFromThisProvider.length > 0) {
      log.push({ provider: providerName, fields: fieldsFromThisProvider });
    }

    // Short-circuit if all target fields are populated
    const allFilled = targetFields.every((f) => merged[f] != null);
    if (allFilled) break;
  }

  return { merged, log, rateLimited };
}

/**
 * Process a batch of books through the cascade engine.
 *
 * @param {Array<{ id, title, author?, isbn? }>} books
 * @param {object} config - Cascade config with providerChain, API keys, etc.
 * @param {{ onBookResult: Function, delayMs?: number }} options
 * @returns {Promise<{ processedBooks: number, enrichedBooks: number, errorCount: number, rateLimitedProviders: string[], lastBookId: string|null }>}
 */
export async function processBatch(books, config, options = {}) {
  const { onBookResult, delayMs } = options;
  let processedBooks = 0;
  let enrichedBooks = 0;
  let errorCount = 0;
  const rateLimitedProviders = new Set();
  const consecutiveRateLimits = {}; // provider -> count
  let lastBookId = null;
  let currentDelay = delayMs ?? config.rateLimitDelayMs ?? 1500;
  const startTime = Date.now();

  // Build a mutable copy of the provider chain so we can skip rate-limited providers
  const activeChain = [...config.providerChain];

  for (const book of books) {
    // Safety: stop batch early to leave time for DB writes after processing
    if (Date.now() - startTime > 20000) break;

    try {
      // Pass the active chain (may have providers removed due to rate limiting)
      const effectiveConfig = { ...config, providerChain: activeChain };
      const result = await enrichBook(book, effectiveConfig);

      // Track rate-limited providers and adapt
      for (const p of result.rateLimited) {
        rateLimitedProviders.add(p);
        consecutiveRateLimits[p] = (consecutiveRateLimits[p] || 0) + 1;

        // Double delay on any rate limit (capped at 5000ms)
        currentDelay = Math.min(currentDelay * 2, 5000);

        // Skip provider entirely after 2 consecutive rate limits
        if (consecutiveRateLimits[p] >= 2) {
          const idx = activeChain.indexOf(p);
          if (idx !== -1) activeChain.splice(idx, 1);
        }
      }

      // Reset consecutive count for providers that succeeded
      for (const p of activeChain) {
        if (!result.rateLimited.includes(p)) {
          consecutiveRateLimits[p] = 0;
        }
      }

      // Check if any fields were actually populated
      const hasUpdates = Object.values(result.merged).some(
        (v) => v != null && (!Array.isArray(v) || v.length > 0),
      );

      if (hasUpdates) {
        enrichedBooks++;
      }

      if (onBookResult) {
        onBookResult(book.id, result.merged, result.log);
      }
    } catch {
      errorCount++;
    }

    processedBooks++;
    lastBookId = book.id;

    // Delay between books (skip for last book)
    if (currentDelay > 0 && processedBooks < books.length) {
      await new Promise((r) => setTimeout(r, currentDelay));
    }
  }

  return {
    processedBooks,
    enrichedBooks,
    errorCount,
    rateLimitedProviders: [...rateLimitedProviders],
    lastBookId,
  };
}
