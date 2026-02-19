/**
 * Unified Book Metadata API
 * Provides a unified interface for fetching book metadata from either
 * OpenLibrary or Google Books API based on user configuration.
 */

import * as openLibrary from './openLibraryApi';
import * as googleBooks from './googleBooksApi';

// Supported metadata providers
export const METADATA_PROVIDERS = {
  OPEN_LIBRARY: 'openlibrary',
  GOOGLE_BOOKS: 'googlebooks'
};

// Default provider
export const DEFAULT_PROVIDER = METADATA_PROVIDERS.OPEN_LIBRARY;

/**
 * Get the current metadata provider configuration
 * @param {Object} settings - Application settings object
 * @returns {{provider: string, apiKey: string|null}}
 */
export function getMetadataConfig(settings) {
  const bookMetadata = settings?.bookMetadata || {};
  return {
    provider: bookMetadata.provider || DEFAULT_PROVIDER,
    apiKey: bookMetadata.googleBooksApiKey || null
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
  return config.provider === METADATA_PROVIDERS.GOOGLE_BOOKS;
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
  
  return { valid: true, error: null };
}

/**
 * Batch fetch all metadata (author, description, genres) for a list of books.
 * Makes one lookup pass per book, calling getBookDetails + findAuthorForBook + findGenresForBook.
 * @param {Array} books - Array of book objects
 * @param {Object} settings - Application settings object
 * @param {Function} onProgress - Optional progress callback ({current, total, book})
 * @returns {Promise<Array>} Array of {book, foundAuthor, foundDescription, foundGenres, error}
 */
export async function batchFetchAllMetadata(books, settings, onProgress = null) {
  if (!books || books.length === 0) return [];

  const results = [];

  for (let i = 0; i < books.length; i++) {
    const book = books[i];

    try {
      // Small delay to be respectful to the API
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Fetch all metadata in parallel for this book
      const [authorResult, detailsResult, genresResult] = await Promise.allSettled([
        findAuthorForBook(book.title, settings),
        getBookDetails(book.title, book.author || null, settings),
        findGenresForBook(book.title, book.author || null, settings),
      ]);

      const foundAuthor = authorResult.status === 'fulfilled' ? authorResult.value : null;
      const details = detailsResult.status === 'fulfilled' ? detailsResult.value : null;
      const foundGenres = genresResult.status === 'fulfilled' ? genresResult.value : null;

      results.push({
        book,
        foundAuthor: foundAuthor || null,
        foundDescription: details?.description || null,
        foundGenres: foundGenres || null,
        foundIsbn: details?.isbn || null,
        foundPageCount: details?.pageCount || null,
        foundPublicationYear: details?.publicationYear || null,
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
        error: error.message,
      });
    }

    if (onProgress) {
      const last = results[results.length - 1];
      onProgress({
        ...last,
        current: i + 1,
        total: books.length,
        book: book.title,
      });
    }
  }

  return results;
}
