/**
 * Hardcover API Integration
 * Provides functions to query the Hardcover GraphQL API
 * for book metadata, including series information.
 */

const HARDCOVER_GRAPHQL_URL = 'https://api.hardcover.app/v1/graphql';

// Cache for Hardcover availability status
let hardcoverAvailable = null;
let lastAvailabilityCheck = 0;
const AVAILABILITY_CHECK_INTERVAL = 60000; // Re-check every 60 seconds

/**
 * Internal helper to POST a GraphQL query to the Hardcover API.
 * @param {string} query - GraphQL query string
 * @param {Object} variables - GraphQL variables
 * @param {string} apiKey - Hardcover API key
 * @param {Object} [options] - Additional fetch options (e.g. signal)
 * @returns {Promise<Object>} The `data` field from the GraphQL response
 * @throws {Error} On HTTP errors or GraphQL errors
 */
async function hardcoverQuery(query, variables, apiKey, options = {}) {
  const response = await fetch(HARDCOVER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: apiKey
    },
    body: JSON.stringify({ query, variables }),
    ...options
  });

  if (!response.ok) {
    throw new Error(`Hardcover API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Hardcover GraphQL error: ${json.errors[0].message}`);
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
    console.log('Hardcover API key not provided');
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

    console.log('Hardcover API availability check: available');
    return true;
  } catch (error) {
    clearTimeout(timeoutId);
    console.log('Hardcover API availability check failed:', error.message);
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

// ---------------------------------------------------------------------------
// Title similarity helpers (mirrored from openLibraryApi.js, adapted for
// Hardcover's data shape)
// ---------------------------------------------------------------------------

/**
 * Normalize a title for comparison: lowercase, strip punctuation, collapse whitespace.
 * @param {string} title
 * @returns {string}
 */
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')  // Remove punctuation
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

/**
 * Calculate similarity between two titles using a fuzzy strategy tuned for
 * partial matches.
 *
 * Uses three signals (same approach as openLibraryApi.js):
 *   - Substring coverage (shorter fully contained in longer)
 *   - Word-overlap ratio
 *   - Character bigram Jaccard similarity
 *
 * @param {string} title1 - Normalized title
 * @param {string} title2 - Normalized title
 * @returns {number} Similarity between 0 and 1
 */
function calculateTitleSimilarity(title1, title2) {
  if (!title1 || !title2) return 0;

  // Exact match
  if (title1 === title2) return 1;

  const words1 = title1.split(' ').filter(Boolean);
  const words2 = title2.split(' ').filter(Boolean);

  // Word overlap ratio
  const set2 = new Set(words2);
  let overlap = 0;
  for (const w of words1) {
    if (set2.has(w)) overlap++;
  }
  const wordScore = overlap / Math.max(words1.length, words2.length);

  // Substring coverage: shorter fully contained in longer -> strong signal
  const shorter = title1.length <= title2.length ? title1 : title2;
  const longer = title1.length > title2.length ? title1 : title2;
  const substringScore = longer.includes(shorter) ? shorter.length / longer.length : 0;

  // Character bigram Jaccard for extra fuzziness tolerance
  const bigrams = (s) => {
    const res = [];
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      if (bg.trim().length === 2) res.push(bg);
    }
    return res;
  };

  const b1 = bigrams(title1);
  const b2 = bigrams(title2);
  let charScore = 0;
  if (b1.length && b2.length) {
    const setB1 = new Set(b1);
    const setB2 = new Set(b2);
    let intersect = 0;
    for (const bg of setB1) {
      if (setB2.has(bg)) intersect++;
    }
    const union = setB1.size + setB2.size - intersect;
    charScore = union > 0 ? intersect / union : 0;
  }

  // Weighted combination; emphasize partial/substring coverage
  const combined =
    0.5 * substringScore +
    0.3 * wordScore +
    0.2 * charScore;

  return Math.max(0, Math.min(1, combined));
}

/**
 * Find the best matching book result based on title similarity.
 * Returns the best-scoring result that exceeds the similarity threshold.
 *
 * @param {string} searchTitle - The original search title
 * @param {Array} results - Formatted results from searchBooksByTitle
 * @returns {Object|null} The best matching result or null
 */
function findBestTitleMatch(searchTitle, results) {
  if (!results || results.length === 0) {
    return null;
  }

  const normalizedSearchTitle = normalizeTitle(searchTitle);

  const scoredResults = results.map(result => {
    const normalizedResultTitle = normalizeTitle(result.title || '');
    const similarity = calculateTitleSimilarity(normalizedSearchTitle, normalizedResultTitle);

    return {
      ...result,
      similarity,
      hasAuthor: !!result.author
    };
  });

  // Sort by similarity (descending), prefer results with authors
  scoredResults.sort((a, b) => {
    if (a.hasAuthor && !b.hasAuthor) return -1;
    if (!a.hasAuthor && b.hasAuthor) return 1;
    return b.similarity - a.similarity;
  });

  const bestMatch = scoredResults[0];
  if (bestMatch && bestMatch.similarity > 0.3) {
    return bestMatch;
  }

  return null;
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

  let parsed;
  try {
    parsed = JSON.parse(rawResults);
  } catch {
    console.error('Failed to parse Hardcover search results JSON');
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map(item => {
    const doc = item.document || {};
    const authorNames = Array.isArray(doc.author_names) ? doc.author_names : [];

    return {
      id: doc.id,
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
  try {
    const candidates = await findTopAuthorCandidatesForBook(title, apiKey, 1);
    return candidates.length > 0 ? candidates[0].name : null;
  } catch (error) {
    console.error(`Error finding author for "${title}":`, error);
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
