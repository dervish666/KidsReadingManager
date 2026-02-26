/**
 * Unified Book Metadata API
 * Provides a unified interface for fetching book metadata from either
 * OpenLibrary or Google Books API based on user configuration.
 */

import * as openLibrary from './openLibraryApi';
import * as googleBooks from './googleBooksApi';
import * as hardcover from './hardcoverApi';
import { isHardcoverRateLimited } from './hardcoverApi';

// Supported metadata providers
export const METADATA_PROVIDERS = {
  OPEN_LIBRARY: 'openlibrary',
  GOOGLE_BOOKS: 'googlebooks',
  HARDCOVER: 'hardcover'
};

// Default provider
export const DEFAULT_PROVIDER = METADATA_PROVIDERS.OPEN_LIBRARY;

// Speed presets: delay in ms between books during batch operations
export const SPEED_PRESETS = {
  careful: 2000,
  normal: 1000,
  fast: 500
};

/**
 * Get the current metadata provider configuration
 * @param {Object} settings - Application settings object
 * @returns {{provider: string, apiKey: string|null}}
 */
export function getMetadataConfig(settings) {
  const bookMetadata = settings?.bookMetadata || {};
  return {
    provider: bookMetadata.provider || DEFAULT_PROVIDER,
    apiKey: bookMetadata.googleBooksApiKey || null,
    // Hardcover key is stored server-side (encrypted). The proxy reads it from DB.
    // Use a placeholder when the server has a key, so client-side validation passes.
    // The proxy ignores the placeholder and uses the DB key.
    hardcoverApiKey: bookMetadata.hardcoverApiKey || (bookMetadata.hasHardcoverApiKey ? '__server_stored__' : null),
    hasHardcoverApiKey: Boolean(bookMetadata.hardcoverApiKey || bookMetadata.hasHardcoverApiKey),
    batchSize: bookMetadata.batchSize || 50,
    speedPreset: bookMetadata.speedPreset || 'normal',
    autoFallback: bookMetadata.autoFallback !== false
  };
}

/**
 * Check if the configured metadata provider is available
 * @param {Object} settings - Application settings object
 * @param {number} timeout - Timeout in milliseconds (default: 3000ms)
 * @returns {Promise<boolean>} True if the provider is reachable
 */
export async function checkAvailability(settings, timeout = 3000) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    return googleBooks.checkGoogleBooksAvailability(config.apiKey, timeout);
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    return hardcover.checkHardcoverAvailability(config.hardcoverApiKey, timeout);
  }

  return openLibrary.checkOpenLibraryAvailability(timeout);
}

/**
 * Reset the availability cache for the configured provider
 * @param {Object} settings - Application settings object
 */
export function resetAvailabilityCache(settings) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    googleBooks.resetGoogleBooksAvailabilityCache();
  } else if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    hardcover.resetHardcoverAvailabilityCache();
  } else {
    openLibrary.resetOpenLibraryAvailabilityCache();
  }
}

/**
 * Get the current cached availability status
 * @param {Object} settings - Application settings object
 * @returns {{available: boolean|null, lastCheck: number, stale: boolean}}
 */
export function getProviderStatus(settings) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    return googleBooks.getGoogleBooksStatus();
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    return hardcover.getHardcoverStatus();
  }

  return openLibrary.getOpenLibraryStatus();
}

/**
 * Get the display name for the current provider
 * @param {Object} settings - Application settings object
 * @returns {string}
 */
export function getProviderDisplayName(settings) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    return 'Google Books';
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    return 'Hardcover';
  }

  return 'Open Library';
}

/**
 * Search for books by title
 * @param {string} title - The book title to search for
 * @param {Object} settings - Application settings object
 * @param {number} limit - Maximum number of results to return (default: 5)
 * @returns {Promise<Array>} Array of book results
 */
export async function searchBooksByTitle(title, settings, limit = 5) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    if (!config.apiKey) {
      throw new Error('Google Books API key is not configured. Please add it in Settings.');
    }
    return googleBooks.searchBooksByTitle(title, config.apiKey, limit);
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    if (!config.hardcoverApiKey) {
      throw new Error('Hardcover API key is not configured. Please add it in Settings.');
    }
    try {
      const result = await hardcover.searchBooksByTitle(title, config.hardcoverApiKey, limit);
      if (result && result.length > 0) return result;
    } catch (e) {
      console.warn('Hardcover lookup failed, falling back to OpenLibrary:', e.message);
    }
    // Waterfall to OpenLibrary
    return openLibrary.searchBooksByTitle(title, limit);
  }

  return openLibrary.searchBooksByTitle(title, limit);
}

/**
 * Find the best author match for a book title
 * @param {string} title - The book title to search for
 * @param {Object} settings - Application settings object
 * @returns {Promise<string|null>} The best matching author name or null if not found
 */
export async function findAuthorForBook(title, settings) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    if (!config.apiKey) {
      throw new Error('Google Books API key is not configured. Please add it in Settings.');
    }
    return googleBooks.findAuthorForBook(title, config.apiKey);
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    if (!config.hardcoverApiKey) {
      throw new Error('Hardcover API key is not configured. Please add it in Settings.');
    }
    try {
      const result = await hardcover.findAuthorForBook(title, config.hardcoverApiKey);
      if (result) return result;
    } catch (e) {
      console.warn('Hardcover lookup failed, falling back to OpenLibrary:', e.message);
    }
    // Waterfall to OpenLibrary
    return openLibrary.findAuthorForBook(title);
  }

  return openLibrary.findAuthorForBook(title);
}

/**
 * Find the top N author candidates for a given book title.
 * @param {string} title - The book title to search for
 * @param {Object} settings - Application settings object
 * @param {number} [limit=3] - Max number of candidates to return
 * @returns {Promise<Array<{name: string, sourceTitle: string, similarity: number, coverUrl: string|null}>>}
 */
export async function findTopAuthorCandidatesForBook(title, settings, limit = 3) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    if (!config.apiKey) {
      throw new Error('Google Books API key is not configured. Please add it in Settings.');
    }
    return googleBooks.findTopAuthorCandidatesForBook(title, config.apiKey, limit);
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    if (!config.hardcoverApiKey) {
      throw new Error('Hardcover API key is not configured. Please add it in Settings.');
    }
    try {
      const result = await hardcover.findTopAuthorCandidatesForBook(title, config.hardcoverApiKey, limit);
      if (result && result.length > 0) return result;
    } catch (e) {
      console.warn('Hardcover lookup failed, falling back to OpenLibrary:', e.message);
    }
    // Waterfall to OpenLibrary
    return openLibrary.findTopAuthorCandidatesForBook(title, limit);
  }

  return openLibrary.findTopAuthorCandidatesForBook(title, limit);
}

/**
 * Get book details including cover and description
 * @param {string} title - The book title to search for
 * @param {string} author - The book's author (optional, improves matching)
 * @param {Object} settings - Application settings object
 * @returns {Promise<Object|null>} Book details or null if not found
 */
export async function getBookDetails(title, author, settings) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    if (!config.apiKey) {
      throw new Error('Google Books API key is not configured. Please add it in Settings.');
    }
    return googleBooks.getBookDetails(title, author, config.apiKey);
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    if (!config.hardcoverApiKey) {
      throw new Error('Hardcover API key is not configured. Please add it in Settings.');
    }
    try {
      const result = await hardcover.getBookDetails(title, author, config.hardcoverApiKey);
      if (result) return result;
    } catch (e) {
      console.warn('Hardcover lookup failed, falling back to OpenLibrary:', e.message);
    }
    // Waterfall to OpenLibrary
    return openLibrary.getBookDetails(title, author);
  }

  return openLibrary.getBookDetails(title, author);
}

/**
 * Find genre/category information for a book
 * @param {string} title - The book title to search for
 * @param {string} author - The book's author (optional, improves matching)
 * @param {Object} settings - Application settings object
 * @returns {Promise<Array<string>|null>} Array of genres or null if not found
 */
export async function findGenresForBook(title, author, settings) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    if (!config.apiKey) {
      throw new Error('Google Books API key is not configured. Please add it in Settings.');
    }
    return googleBooks.findGenresForBook(title, author, config.apiKey);
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    if (!config.hardcoverApiKey) {
      throw new Error('Hardcover API key is not configured. Please add it in Settings.');
    }
    try {
      const result = await hardcover.findGenresForBook(title, author, config.hardcoverApiKey);
      if (result) return result;
    } catch (e) {
      console.warn('Hardcover lookup failed, falling back to OpenLibrary:', e.message);
    }
    // Waterfall to OpenLibrary
    return openLibrary.findGenresForBook(title, author);
  }

  return openLibrary.findGenresForBook(title, author);
}

/**
 * Batch process multiple books to find missing authors
 * @param {Array} books - Array of book objects with title and author properties
 * @param {Object} settings - Application settings object
 * @param {Function} onProgress - Callback function called with progress updates
 * @returns {Promise<Array>} Array of results with original book and found author
 */
export async function batchFindMissingAuthors(books, settings, onProgress = null) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    if (!config.apiKey) {
      throw new Error('Google Books API key is not configured. Please add it in Settings.');
    }
    return googleBooks.batchFindMissingAuthors(books, config.apiKey, onProgress);
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    if (!config.hardcoverApiKey) {
      throw new Error('Hardcover API key is not configured. Please add it in Settings.');
    }
    return hardcover.batchFindMissingAuthors(books, config.hardcoverApiKey, onProgress);
  }

  return openLibrary.batchFindMissingAuthors(books, onProgress);
}

/**
 * Batch process multiple books to find missing descriptions
 * @param {Array} books - Array of book objects with title, author, and description properties
 * @param {Object} settings - Application settings object
 * @param {Function} onProgress - Callback function called with progress updates
 * @returns {Promise<Array>} Array of results with original book and found description
 */
export async function batchFindMissingDescriptions(books, settings, onProgress = null) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    if (!config.apiKey) {
      throw new Error('Google Books API key is not configured. Please add it in Settings.');
    }
    return googleBooks.batchFindMissingDescriptions(books, config.apiKey, onProgress);
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    if (!config.hardcoverApiKey) {
      throw new Error('Hardcover API key is not configured. Please add it in Settings.');
    }
    return hardcover.batchFindMissingDescriptions(books, config.hardcoverApiKey, onProgress);
  }

  return openLibrary.batchFindMissingDescriptions(books, onProgress);
}

/**
 * Batch process multiple books to find missing genres
 * @param {Array} books - Array of book objects with title, author, and genreIds properties
 * @param {Object} settings - Application settings object
 * @param {Function} onProgress - Callback function called with progress updates
 * @returns {Promise<Array>} Array of results with original book and found genres
 */
export async function batchFindMissingGenres(books, settings, onProgress = null) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    if (!config.apiKey) {
      throw new Error('Google Books API key is not configured. Please add it in Settings.');
    }
    return googleBooks.batchFindMissingGenres(books, config.apiKey, onProgress);
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    if (!config.hardcoverApiKey) {
      throw new Error('Hardcover API key is not configured. Please add it in Settings.');
    }
    return hardcover.batchFindMissingGenres(books, config.hardcoverApiKey, onProgress);
  }

  return openLibrary.batchFindMissingGenres(books, onProgress);
}

/**
 * Get cover URL from book data
 * @param {Object} bookData - Book data from either provider
 * @param {Object} settings - Application settings object
 * @returns {string|null} Cover URL or null
 */
export function getCoverUrl(bookData, settings) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    return googleBooks.getCoverUrl(bookData);
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    return hardcover.getCoverUrl(bookData);
  }

  return openLibrary.getCoverUrl(bookData);
}

/**
 * Check if Google Books API is properly configured
 * @param {Object} settings - Application settings object
 * @returns {boolean}
 */
export function isGoogleBooksConfigured(settings) {
  const config = getMetadataConfig(settings);
  return config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS && !!config.apiKey;
}

/**
 * Check if the current provider requires an API key
 * @param {Object} settings - Application settings object
 * @returns {boolean}
 */
export function providerRequiresApiKey(settings) {
  const config = getMetadataConfig(settings);
  return config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS ||
    config.provider === METADATA_PROVIDERS.HARDCOVER;
}

/**
 * Validate the provider configuration
 * @param {Object} settings - Application settings object
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateProviderConfig(settings) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    if (!config.apiKey) {
      return {
        valid: false,
        error: 'Google Books API key is required. Please configure it in Settings.'
      };
    }
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    if (!config.hardcoverApiKey) {
      return {
        valid: false,
        error: 'Hardcover API key is required. Please configure it in Settings.'
      };
    }
  }

  return { valid: true, error: null };
}

/**
 * Helper: delay that can be aborted via an AbortSignal.
 * Resolves immediately if signal is already aborted or becomes aborted.
 * @param {number} ms - Delay in milliseconds
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<void>}
 */
function abortableDelay(ms, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    }
  });
}

/**
 * Fetch all metadata for a single book in minimal API calls.
 * Each provider implements a unified fetch: 1 search for Google Books,
 * 1 search + 1 work fetch for OpenLibrary, 1 search + 1 detail for Hardcover.
 *
 * @param {string} title - The book title to search for
 * @param {string} author - The book's author (optional, improves matching)
 * @param {Object} settings - Application settings object
 * @returns {Promise<Object|null>} All metadata or null if not found
 */
export async function fetchAllMetadata(title, author, settings) {
  const config = getMetadataConfig(settings);

  if (config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS) {
    if (!config.apiKey) {
      throw new Error('Google Books API key is not configured. Please add it in Settings.');
    }
    return googleBooks.fetchAllMetadata(title, author, config.apiKey);
  }

  if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
    if (!config.hardcoverApiKey) {
      throw new Error('Hardcover API key is not configured. Please add it in Settings.');
    }
    try {
      const result = await hardcover.fetchAllMetadata(title, author, config.hardcoverApiKey);
      if (result) return result;
    } catch (e) {
      console.warn('Hardcover lookup failed, falling back to OpenLibrary:', e.message);
    }
    // Waterfall to OpenLibrary
    return openLibrary.fetchAllMetadata(title, author);
  }

  return openLibrary.fetchAllMetadata(title, author);
}

/**
 * Batch fetch all metadata (author, description, genres) for a list of books.
 * Uses a single unified fetch per book instead of 3+ separate API calls.
 *
 * Supports:
 * - AbortController via options.signal — stops processing and returns partial results
 * - Adaptive delay — doubles delay on rate limit, recovers when clear
 * - Auto-fallback — switches to OpenLibrary after consecutive rate-limited books
 * - Batch size — slices books array via options.batchSize
 * - Speed presets — reads base delay from config.speedPreset
 *
 * @param {Array} books - Array of book objects
 * @param {Object} settings - Application settings object
 * @param {Function} onProgress - Optional progress callback ({current, total, book, ...})
 * @param {Object} [options] - Optional: { signal, batchSize, autoFallback }
 * @returns {Promise<Array>} Array of {book, foundAuthor, foundDescription, foundGenres, error}
 */
export async function batchFetchAllMetadata(books, settings, onProgress = null, options = {}) {
  if (!books || books.length === 0) return [];

  const config = getMetadataConfig(settings);
  const signal = options.signal || null;
  const effectiveBatchSize = options.batchSize || config.batchSize || books.length;
  const overallTotal = books.length;
  const booksToProcess = books.slice(0, effectiveBatchSize);
  const baseDelay = SPEED_PRESETS[config.speedPreset] || SPEED_PRESETS.normal;
  let currentDelay = baseDelay;
  let consecutiveRateLimited = 0;
  const autoFallback = options.autoFallback !== undefined ? options.autoFallback : config.autoFallback;
  let providerSwitched = false;
  let effectiveSettings = settings;

  const results = [];

  for (let i = 0; i < booksToProcess.length; i++) {
    // Check abort before each book
    if (signal?.aborted) break;

    const book = booksToProcess[i];

    try {
      // Delay between books (not before first)
      if (i > 0) {
        await abortableDelay(currentDelay, signal);
        if (signal?.aborted) break;
      }

      // Single unified fetch per book (1-2 API calls instead of 3-5)
      const metadata = await fetchAllMetadata(book.title, book.author || null, effectiveSettings);

      results.push({
        book,
        foundAuthor: metadata?.foundAuthor || null,
        foundDescription: metadata?.description || null,
        foundGenres: metadata?.genres || null,
        foundIsbn: metadata?.isbn || null,
        foundPageCount: metadata?.pageCount || null,
        foundPublicationYear: metadata?.publicationYear || null,
        foundSeriesName: metadata?.seriesName || null,
        foundSeriesNumber: metadata?.seriesNumber != null ? metadata.seriesNumber : null,
      });
    } catch (error) {
      results.push({
        book,
        foundAuthor: null,
        foundDescription: null,
        foundGenres: null,
        foundIsbn: null,
        foundPageCount: null,
        foundPublicationYear: null,
        foundSeriesName: null,
        foundSeriesNumber: null,
        error: error.message,
      });
    }

    // Invoke per-book callback (e.g. to apply updates immediately)
    if (options.onBookResult) {
      try {
        await options.onBookResult(results[results.length - 1]);
      } catch (callbackError) {
        // Don't let callback errors stop the batch
        console.warn('onBookResult callback error:', callbackError);
      }
    }

    // Check rate limit state after processing this book (outside try/catch)
    const rateLimited = config.provider === METADATA_PROVIDERS.HARDCOVER &&
      typeof isHardcoverRateLimited === 'function' && isHardcoverRateLimited();

    if (rateLimited) {
      consecutiveRateLimited++;
      // Double the delay, cap at 30s
      currentDelay = Math.min(currentDelay * 2, 30000);

      // Auto-switch to OpenLibrary after 5 consecutive rate-limited books
      if (autoFallback && consecutiveRateLimited >= 5 && !providerSwitched) {
        providerSwitched = true;
        effectiveSettings = {
          ...settings,
          bookMetadata: {
            ...settings?.bookMetadata,
            provider: METADATA_PROVIDERS.OPEN_LIBRARY
          }
        };
        currentDelay = baseDelay; // Reset delay after switching
      }
    } else {
      consecutiveRateLimited = 0;
      // Gradually recover delay if we were slowed
      if (currentDelay > baseDelay) {
        currentDelay = Math.max(baseDelay, Math.floor(currentDelay / 1.5));
      }
    }

    if (onProgress) {
      const last = results[results.length - 1];
      onProgress({
        ...last,
        current: i + 1,
        total: booksToProcess.length,
        batchTotal: booksToProcess.length,
        overallTotal,
        book: book.title,
        rateLimited: rateLimited || false,
        currentDelay,
        providerSwitched,
        switchedFrom: providerSwitched ? 'Hardcover' : undefined,
      });
    }
  }

  return results;
}
