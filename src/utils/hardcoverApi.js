/**
 * Hardcover API Integration
 * Provides functions to query the Hardcover GraphQL API
 * for book metadata, including series information.
 *
 * All requests are proxied through the backend at /api/hardcover/graphql
 * to avoid browser CORS restrictions (Hardcover's API does not set
 * Access-Control-Allow-Origin headers).
 */

import { fetchWithTimeout } from './helpers.js';

const PROXY_URL = '/api/hardcover/graphql';

// Cache for Hardcover availability status
let hardcoverAvailable = null;
let lastAvailabilityCheck = 0;
const AVAILABILITY_CHECK_INTERVAL = 60000; // Re-check every 60 seconds

// Rate limit state — time-based cooldown
let rateLimitCooldownEnd = 0;
const RATE_LIMIT_COOLDOWN_MS = 60000; // 60 second cooldown after rate limit detected

/**
 * Internal helper to POST a GraphQL query via the backend proxy.
 * The proxy forwards the request to Hardcover server-side, avoiding CORS.
 * The API key is read from org settings on the backend; an optional apiKey
 * can be passed for availability checks before the key is saved.
 *
 * @param {string} query - GraphQL query string
 * @param {Object} variables - GraphQL variables
 * @param {string} apiKey - Hardcover API key (passed to proxy as optional override)
 * @param {Object} [options] - Additional fetch options (e.g. signal)
 * @returns {Promise<Object>} The `data` field from the GraphQL response
 * @throws {Error} On HTTP errors or GraphQL errors
 */
async function hardcoverQuery(query, variables, apiKey, options = {}) {
  const token = typeof localStorage !== 'undefined'
    ? localStorage.getItem('krm_auth_token')
    : null;

  const headers = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetchWithTimeout(PROXY_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables, apiKey }),
    ...options
  }, 5000);

  if (!response.ok) {
    // Detect rate limiting from HTTP status
    if (response.status === 429) {
      rateLimitCooldownEnd = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    }
    throw new Error(`Hardcover API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  if (json.errors && json.errors.length > 0) {
    const errorMsg = json.errors[0].message;
    // Detect rate limiting from GraphQL error messages
    if (/rate.?limit|too many requests/i.test(errorMsg)) {
      rateLimitCooldownEnd = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    }
    throw new Error(`Hardcover GraphQL error: ${errorMsg}`);
  }

  return json.data;
}

/**
 * Check if the Hardcover API is available with a quick timeout.
 * Sends a lightweight introspection query and caches the result for 60 seconds.
 * @param {string} apiKey - Hardcover API key
 * @param {number} timeout - Timeout in milliseconds (default: 3000ms)
 * @returns {Promise<boolean>} True if Hardcover API is reachable and authenticated
 */
export async function checkHardcoverAvailability(apiKey, timeout = 3000) {
  const now = Date.now();

  // Return cached result if recent
  if (hardcoverAvailable !== null && (now - lastAvailabilityCheck) < AVAILABILITY_CHECK_INTERVAL) {
    return hardcoverAvailable;
  }

  if (!apiKey) {
    console.warn('Hardcover API key not provided');
    return false;
  }

  let timeoutId;
  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), timeout);

    await hardcoverQuery(
      '{ __typename }',
      {},
      apiKey,
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    hardcoverAvailable = true;
    lastAvailabilityCheck = now;

    // Availability check succeeded — no need to log success
    return true;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('Hardcover API availability check failed:', error.message);
    hardcoverAvailable = false;
    lastAvailabilityCheck = now;
    return false;
  }
}

/**
 * Reset the availability cache (useful for retry scenarios)
 */
export function resetHardcoverAvailabilityCache() {
  hardcoverAvailable = null;
  lastAvailabilityCheck = 0;
}

/**
 * Get the current cached availability status without making a request
 * @returns {{available: boolean|null, lastCheck: number, stale: boolean}}
 */
export function getHardcoverStatus() {
  const now = Date.now();
  return {
    available: hardcoverAvailable,
    lastCheck: lastAvailabilityCheck,
    stale: (now - lastAvailabilityCheck) >= AVAILABILITY_CHECK_INTERVAL
  };
}

/**
 * Check if Hardcover is currently rate limited.
 * Returns true if the cooldown period hasn't expired yet.
 * @returns {boolean}
 */
export function isHardcoverRateLimited() {
  return Date.now() < rateLimitCooldownEnd;
}

/**
 * Reset the rate limit flag (for testing or manual recovery)
 */
export function resetHardcoverRateLimitFlag() {
  rateLimitCooldownEnd = 0;
}

// ---------------------------------------------------------------------------
// Title similarity helpers (mirrored from openLibraryApi.js, adapted for
// Hardcover's data shape)
// ---------------------------------------------------------------------------

/**
 * Normalize a title for comparison: lowercase, strip punctuation, collapse whitespace.
 * @param {string} title
 * @returns {string}
 */
// Title matching utilities imported from shared module
import { normalizeTitle, calculateTitleSimilarity, findBestTitleMatch as _findBestTitleMatch } from './titleMatching.js';

function findBestTitleMatch(searchTitle, results) {
  return _findBestTitleMatch(searchTitle, results, {
    hasAuthor: (r) => !!r.author,
  });
}

// ---------------------------------------------------------------------------
// Book search and author lookup
// ---------------------------------------------------------------------------

const SEARCH_BOOKS_QUERY = `
query SearchBooks($q: String!, $perPage: Int!) {
  search(query: $q, query_type: "Book", per_page: $perPage) {
    results
  }
}`;

/**
 * Search for books by title using the Hardcover GraphQL search API.
 *
 * The `results` field in the response is a JSON **string** that must be parsed.
 * Each element has shape:
 *   { document: { id, title, author_names: [], isbns: [], series_names: [] } }
 *
 * @param {string} title - The book title to search for
 * @param {string} apiKey - Hardcover API key
 * @param {number} [limit=5] - Max results to return (maps to per_page)
 * @returns {Promise<Array<{id: number, title: string, author: string|null, isbns: string[], seriesNames: string[]}>>}
 */
export async function searchBooksByTitle(title, apiKey, limit = 5) {
  if (isHardcoverRateLimited()) return [];

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new Error('Title is required and must be a non-empty string');
  }
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('API key is required');
  }

  const data = await hardcoverQuery(
    SEARCH_BOOKS_QUERY,
    { q: title.trim(), perPage: limit },
    apiKey
  );

  const rawResults = data?.search?.results;
  if (!rawResults) {
    return [];
  }

  // Hardcover returns results as an object with a `hits` array.
  // Each hit has shape: { document: { id, title, author_names, isbns, series_names } }
  let hits;
  if (rawResults.hits && Array.isArray(rawResults.hits)) {
    // Standard format: { hits: [...], found: N }
    hits = rawResults.hits;
  } else if (Array.isArray(rawResults)) {
    // Fallback: raw array of { document: ... }
    hits = rawResults;
  } else if (typeof rawResults === 'string') {
    // Legacy: JSON string (unlikely but handle for safety)
    try {
      const parsed = JSON.parse(rawResults);
      hits = Array.isArray(parsed) ? parsed : (parsed.hits || []);
    } catch {
      console.error('Failed to parse Hardcover search results JSON');
      return [];
    }
  } else {
    return [];
  }

  return hits.map(item => {
    const doc = item.document || {};
    const authorNames = Array.isArray(doc.author_names) ? doc.author_names : [];

    return {
      id: typeof doc.id === 'string' ? parseInt(doc.id, 10) : doc.id,
      title: doc.title || '',
      author: authorNames.length > 0 ? authorNames[0] : null,
      isbns: Array.isArray(doc.isbns) ? doc.isbns : [],
      seriesNames: Array.isArray(doc.series_names) ? doc.series_names : []
    };
  });
}

/**
 * Find the best author match for a book title using Hardcover search.
 *
 * Searches Hardcover, scores results by title similarity, and returns the
 * author of the best match. Returns null if no good match is found.
 *
 * @param {string} title - The book title to search for
 * @param {string} apiKey - Hardcover API key
 * @returns {Promise<string|null>} The best matching author name, or null
 */
export async function findAuthorForBook(title, apiKey) {
  if (isHardcoverRateLimited()) return null;

  try {
    const candidates = await findTopAuthorCandidatesForBook(title, apiKey, 1);
    return candidates.length > 0 ? candidates[0].name : null;
  } catch (error) {
    console.error(`Error finding author for "${title}":`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Book detail lookup (search + full detail fetch with series data)
// ---------------------------------------------------------------------------

const BOOK_DETAILS_QUERY = `
query BookDetails($id: Int!) {
  books(where: {id: {_eq: $id}}) {
    id title description pages release_year
    cached_contributors cached_tags cached_image
    book_series(order_by: {featured: desc}) {
      position details featured
      series { name }
    }
    editions(limit: 1, order_by: {users_count: desc}) {
      isbn_13 isbn_10 pages release_date
    }
  }
}`;

/**
 * Get detailed book information from Hardcover, including series data.
 *
 * Two-step lookup:
 *   1. Search by title (+ author if provided) via searchBooksByTitle
 *   2. Fetch full book details by ID via hardcoverQuery
 *
 * @param {string} title - The book title to look up
 * @param {string|null} author - Optional author name to narrow the search
 * @param {string} apiKey - Hardcover API key
 * @returns {Promise<Object|null>} Book details object, or null if not found
 */
export async function getBookDetails(title, author, apiKey) {
  if (isHardcoverRateLimited()) return null;

  try {
    // Step 1: Search for candidates
    const searchQuery = author ? `${title} ${author}` : title;
    const searchResults = await searchBooksByTitle(searchQuery, apiKey, 5);

    // Find best title match
    const bestMatch = findBestTitleMatch(title, searchResults);
    if (!bestMatch) {
      return null;
    }

    // Step 2: Fetch full details by ID
    const data = await hardcoverQuery(BOOK_DETAILS_QUERY, { id: bestMatch.id }, apiKey);
    const books = data?.books;
    if (!books || books.length === 0) {
      return null;
    }

    const book = books[0];

    // Extract edition data (first/most popular edition)
    const edition = book.editions && book.editions.length > 0 ? book.editions[0] : null;

    // Extract series data (first entry is the primary/featured one, ordered by featured desc)
    let seriesName = null;
    let seriesNumber = null;
    if (book.book_series && book.book_series.length > 0) {
      const primarySeries = book.book_series[0];
      seriesName = primarySeries.series?.name || null;
      const pos = Number(primarySeries.position);
      seriesNumber = Number.isNaN(pos) ? null : pos;
    }

    // Extract cover URL
    const coverUrl = book.cached_image?.url || null;

    // Extract and truncate description
    let description = book.description || null;
    if (description && description.length > 500) {
      description = description.slice(0, 500) + '...';
    }

    // Extract ISBN: prefer isbn_13, fall back to isbn_10
    const isbn = edition?.isbn_13 || edition?.isbn_10 || null;

    // Extract page count: prefer edition, fall back to book.pages
    const pageCount = edition?.pages || book.pages || null;

    // Extract publication year
    const publicationYear = book.release_year || null;

    // Extract genres from cached_tags
    const genres = Array.isArray(book.cached_tags?.Genre) && book.cached_tags.Genre.length > 0
      ? book.cached_tags.Genre
      : null;

    return {
      coverUrl,
      description,
      isbn,
      pageCount,
      publicationYear,
      seriesName,
      seriesNumber,
      genres,
      hardcoverId: book.id
    };
  } catch (error) {
    console.error(`Error getting book details for "${title}":`, error);
    return null;
  }
}

/**
 * Find the top N author candidates for a given book title from Hardcover.
 * Returns objects with author name, source title, similarity score, and
 * cover URL so the UI can present choices.
 *
 * @param {string} title - The book title to search for
 * @param {string} apiKey - Hardcover API key
 * @param {number} [limit=3] - Max number of unique author candidates to return
 * @returns {Promise<Array<{name: string, sourceTitle: string, similarity: number, coverUrl: string|null}>>}
 */
export async function findTopAuthorCandidatesForBook(title, apiKey, limit = 3) {
  if (isHardcoverRateLimited()) return [];

  const maxResults = Math.max(1, Math.min(limit, 10));

  try {
    const results = await searchBooksByTitle(title, apiKey, 10);

    if (!results || results.length === 0) {
      return [];
    }

    const normalizedSearchTitle = normalizeTitle(title);

    // Score results by title similarity and filter to those with authors
    const scored = results
      .filter(r => !!r.author)
      .map(r => {
        const normalizedResultTitle = normalizeTitle(r.title || '');
        const similarity = calculateTitleSimilarity(normalizedSearchTitle, normalizedResultTitle);

        // Build a cover URL from ISBN if available (via our cover proxy)
        let coverUrl = null;
        if (r.isbns && r.isbns.length > 0) {
          coverUrl = `/api/covers/isbn/${encodeURIComponent(r.isbns[0])}-M.jpg`;
        }

        return {
          source: r,
          title: r.title || '',
          author: r.author,
          similarity,
          coverUrl
        };
      })
      .filter(entry => entry.similarity > 0.2);

    if (scored.length === 0) {
      return [];
    }

    // Sort best-first
    scored.sort((a, b) => b.similarity - a.similarity);

    // Build unique author candidates preserving order
    const seen = new Set();
    const candidates = [];

    for (const entry of scored) {
      const key = entry.author.trim().toLowerCase();
      if (!key || seen.has(key)) continue;

      seen.add(key);
      candidates.push({
        name: entry.author.trim(),
        sourceTitle: entry.title,
        similarity: entry.similarity,
        coverUrl: entry.coverUrl || null
      });

      if (candidates.length >= maxResults) {
        return candidates;
      }
    }

    return candidates.slice(0, maxResults);
  } catch (error) {
    console.error(`Error finding author candidates for "${title}":`, error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Unified metadata fetch (1 search + 1 detail = 2 API calls per book)
// ---------------------------------------------------------------------------

/**
 * Fetch all metadata for a book in 2 API calls (search + detail).
 * Replaces the previous pattern of 5 separate API calls per book.
 *
 * @param {string} title - The book title to search for
 * @param {string} author - The book's author (optional, improves matching)
 * @param {string} apiKey - Hardcover API key
 * @returns {Promise<Object|null>} All metadata or null if not found
 */
export async function fetchAllMetadata(title, author, apiKey) {
  if (isHardcoverRateLimited()) return null;

  try {
    // Step 1: Search for candidates
    const searchQuery = author ? `${title} ${author}` : title;
    const searchResults = await searchBooksByTitle(searchQuery, apiKey, 5);

    const bestMatch = findBestTitleMatch(title, searchResults);
    if (!bestMatch) {
      return null;
    }

    // Author from search results
    const foundAuthor = bestMatch.author || null;

    // Step 2: Fetch full details by ID
    const data = await hardcoverQuery(BOOK_DETAILS_QUERY, { id: bestMatch.id }, apiKey);
    const books = data?.books;
    if (!books || books.length === 0) {
      return {
        foundAuthor,
        description: null,
        isbn: null,
        pageCount: null,
        publicationYear: null,
        genres: null,
        coverUrl: null,
        seriesName: null,
        seriesNumber: null
      };
    }

    const book = books[0];
    const edition = book.editions && book.editions.length > 0 ? book.editions[0] : null;

    // Series
    let seriesName = null;
    let seriesNumber = null;
    if (book.book_series && book.book_series.length > 0) {
      const primarySeries = book.book_series[0];
      seriesName = primarySeries.series?.name || null;
      const pos = Number(primarySeries.position);
      seriesNumber = Number.isNaN(pos) ? null : pos;
    }

    // Description
    let description = book.description || null;
    if (description && description.length > 500) {
      description = description.slice(0, 500) + '...';
    }

    // Genres
    const genres = Array.isArray(book.cached_tags?.Genre) && book.cached_tags.Genre.length > 0
      ? book.cached_tags.Genre
      : null;

    return {
      foundAuthor,
      description,
      isbn: edition?.isbn_13 || edition?.isbn_10 || null,
      pageCount: edition?.pages || book.pages || null,
      publicationYear: book.release_year || null,
      genres,
      coverUrl: book.cached_image?.url || null,
      seriesName,
      seriesNumber
    };
  } catch (error) {
    console.error(`Error fetching all metadata for "${title}":`, error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Genre lookup
// ---------------------------------------------------------------------------

/**
 * Find genre/subject information for a book from Hardcover.
 *
 * Uses `getBookDetails` (which already fetches `cached_tags` in the detail
 * query) and extracts the `Genre` key from `cached_tags`.
 *
 * @param {string} title - The book title to search for
 * @param {string|null} author - Optional author name to narrow the search
 * @param {string} apiKey - Hardcover API key
 * @returns {Promise<Array<string>|null>} Array of genre strings or null if not found
 */
export async function findGenresForBook(title, author, apiKey) {
  if (isHardcoverRateLimited()) return null;

  try {
    const details = await getBookDetails(title, author, apiKey);
    if (!details) {
      return null;
    }

    const genres = details.genres;
    if (!genres || genres.length === 0) {
      return null;
    }

    return genres;
  } catch (error) {
    console.error(`Error finding genres for "${title}":`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cover URL helper
// ---------------------------------------------------------------------------

/**
 * Get cover URL from book data.
 * Simple helper matching the pattern of openLibraryApi.js's getCoverUrl.
 *
 * @param {Object} bookData - Book data (e.g. from getBookDetails)
 * @returns {string|null} Cover URL or null
 */
export function getCoverUrl(bookData) {
  if (!bookData) return null;

  if (bookData.coverUrl) {
    return bookData.coverUrl;
  }

  if (bookData.cached_image?.url) {
    return bookData.cached_image.url;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

/**
 * Batch process multiple books to find missing authors.
 *
 * Iterates books without authors, calls findAuthorForBook for each with
 * 200ms delay between requests (Hardcover has 60 req/min limit).
 *
 * @param {Array} books - Array of book objects with title and author properties
 * @param {string} apiKey - Hardcover API key
 * @param {Function} [onProgress] - Callback with {current, total, book} at each step
 * @returns {Promise<Array<{book: Object, foundAuthor: string|null, success: boolean, error?: string}>>}
 */
export async function batchFindMissingAuthors(books, apiKey, onProgress = null) {
  if (isHardcoverRateLimited()) return [];

  const results = [];

  const needsAuthor = (book) => {
    const author = (book.author || '').trim().toLowerCase();
    return !author || author === 'unknown';
  };

  const booksNeedingAuthors = books.filter(needsAuthor);

  if (booksNeedingAuthors.length === 0) {
    return [];
  }

  for (let i = 0; i < booksNeedingAuthors.length; i++) {
    const book = booksNeedingAuthors[i];

    try {
      // 200ms delay between requests (Hardcover 60 req/min limit)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const foundAuthor = await findAuthorForBook(book.title, apiKey);

      results.push({
        book,
        foundAuthor,
        success: !!foundAuthor
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingAuthors.length,
          book: book.title,
          foundAuthor,
          success: !!foundAuthor
        });
      }
    } catch (error) {
      console.error(`Error processing book "${book.title}":`, error);
      results.push({
        book,
        foundAuthor: null,
        success: false,
        error: error.message
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingAuthors.length,
          book: book.title,
          foundAuthor: null,
          success: false,
          error: error.message
        });
      }
    }
  }

  return results;
}

/**
 * Batch process multiple books to find missing descriptions.
 *
 * Iterates books without descriptions, calls getBookDetails for each with
 * 200ms delay between requests.
 *
 * @param {Array} books - Array of book objects with title, author, and description
 * @param {string} apiKey - Hardcover API key
 * @param {Function} [onProgress] - Callback with {current, total, book} at each step
 * @returns {Promise<Array<{book: Object, foundDescription: string|null, success: boolean, error?: string}>>}
 */
export async function batchFindMissingDescriptions(books, apiKey, onProgress = null) {
  if (isHardcoverRateLimited()) return [];

  const results = [];

  const needsDescription = (book) => {
    const description = (book.description || '').trim();
    return !description;
  };

  const booksNeedingDescriptions = books.filter(needsDescription);

  if (booksNeedingDescriptions.length === 0) {
    return [];
  }

  for (let i = 0; i < booksNeedingDescriptions.length; i++) {
    const book = booksNeedingDescriptions[i];

    try {
      // 200ms delay between requests
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const details = await getBookDetails(book.title, book.author || null, apiKey);
      const foundDescription = details?.description || null;

      results.push({
        book,
        foundDescription,
        success: !!foundDescription
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingDescriptions.length,
          book: book.title,
          foundDescription,
          success: !!foundDescription
        });
      }
    } catch (error) {
      console.error(`Error processing book "${book.title}":`, error);
      results.push({
        book,
        foundDescription: null,
        success: false,
        error: error.message
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingDescriptions.length,
          book: book.title,
          foundDescription: null,
          success: false,
          error: error.message
        });
      }
    }
  }

  return results;
}

/**
 * Batch process multiple books to find missing genres.
 *
 * Iterates books without genres (empty genreIds), calls findGenresForBook
 * for each with 200ms delay between requests.
 *
 * @param {Array} books - Array of book objects with title, author, and genreIds
 * @param {string} apiKey - Hardcover API key
 * @param {Function} [onProgress] - Callback with {current, total, book} at each step
 * @returns {Promise<Array<{book: Object, foundGenres: Array<string>, success: boolean, error?: string}>>}
 */
export async function batchFindMissingGenres(books, apiKey, onProgress = null) {
  if (isHardcoverRateLimited()) return [];

  const results = [];

  const needsGenres = (book) => {
    const genreIds = book.genreIds || [];
    return genreIds.length === 0;
  };

  const booksNeedingGenres = books.filter(needsGenres);

  if (booksNeedingGenres.length === 0) {
    return [];
  }

  for (let i = 0; i < booksNeedingGenres.length; i++) {
    const book = booksNeedingGenres[i];

    try {
      // 200ms delay between requests
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const foundGenres = await findGenresForBook(book.title, book.author || null, apiKey);

      results.push({
        book,
        foundGenres: foundGenres || [],
        success: !!(foundGenres && foundGenres.length > 0)
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingGenres.length,
          book: book.title,
          foundGenres: foundGenres || [],
          success: !!(foundGenres && foundGenres.length > 0)
        });
      }
    } catch (error) {
      console.error(`Error processing book "${book.title}":`, error);
      results.push({
        book,
        foundGenres: [],
        success: false,
        error: error.message
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingGenres.length,
          book: book.title,
          foundGenres: [],
          success: false,
          error: error.message
        });
      }
    }
  }

  return results;
}
