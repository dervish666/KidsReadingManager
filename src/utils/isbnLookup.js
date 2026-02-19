/**
 * OpenLibrary ISBN lookup utility with KV caching.
 *
 * Fetches book metadata from OpenLibrary's ISBN API and caches
 * results in Cloudflare KV to minimise external API calls.
 */

import { normalizeISBN } from './isbn.js';

const USER_AGENT = 'TallyReading/1.0 (https://tallyreading.uk)';
const CACHE_TTL_SUCCESS = 2592000; // 30 days
const CACHE_TTL_NOT_FOUND = 86400; // 24 hours

/**
 * Extract a 4-digit year from various publish_date formats.
 *
 * Handles: "2020", "January 2015", "June 8, 1949", etc.
 *
 * @param {string|undefined} publishDate
 * @returns {number|null}
 */
function parsePublicationYear(publishDate) {
  if (!publishDate) return null;
  const match = publishDate.match(/\b(\d{4})\b/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Parse structured book data from an OpenLibrary ISBN API response.
 *
 * @param {object} olData - Raw response from OpenLibrary /isbn/{isbn}.json
 * @returns {object} Parsed book fields
 */
export function parseOpenLibraryBook(olData) {
  const title = olData.title || null;
  const pageCount = olData.number_of_pages ?? null;
  const publicationYear = parsePublicationYear(olData.publish_date);
  const coverId = olData.covers && olData.covers.length > 0
    ? olData.covers[0]
    : null;

  let seriesName = null;
  if (olData.series) {
    seriesName = Array.isArray(olData.series)
      ? olData.series[0]
      : olData.series;
  }

  let seriesNumber = null;
  if (olData.volume_number != null) {
    const parsed = parseInt(olData.volume_number, 10);
    seriesNumber = Number.isNaN(parsed) ? null : parsed;
  }

  return {
    title,
    pageCount,
    publicationYear,
    coverId,
    seriesName,
    seriesNumber,
  };
}

/**
 * Look up a book by ISBN via OpenLibrary with KV caching.
 *
 * Flow:
 * 1. Normalize ISBN (return null if invalid)
 * 2. Check KV cache (return cached or null for negative cache)
 * 3. Fetch from OpenLibrary ISBN API
 * 4. Fetch author name from author endpoint
 * 5. Cache and return result
 *
 * @param {string} isbn - ISBN-10 or ISBN-13 (with or without formatting)
 * @param {object} env - Cloudflare env bindings (needs RECOMMENDATIONS_CACHE KV)
 * @returns {Promise<object|null>} Book data or null if not found/invalid
 */
export async function lookupISBN(isbn, env) {
  const normalized = normalizeISBN(isbn);
  if (!normalized) return null;

  const cacheKey = `isbn:${normalized}`;

  // Check KV cache
  try {
    const cached = await env.RECOMMENDATIONS_CACHE.get(cacheKey, 'json');
    if (cached) {
      if (cached.notFound) return null;
      return cached;
    }
  } catch {
    // KV unavailable — proceed without cache
  }

  // Fetch from OpenLibrary
  const fetchOptions = {
    headers: { 'User-Agent': USER_AGENT },
  };

  const response = await fetch(
    `https://openlibrary.org/isbn/${normalized}.json`,
    fetchOptions
  );

  if (!response.ok) {
    // Cache the negative result
    try {
      await env.RECOMMENDATIONS_CACHE.put(
        cacheKey,
        JSON.stringify({ notFound: true }),
        { expirationTtl: CACHE_TTL_NOT_FOUND }
      );
    } catch {
      // KV unavailable — skip caching
    }
    return null;
  }

  const olData = await response.json();
  const parsed = parseOpenLibraryBook(olData);

  // Fetch author name
  let author = null;
  try {
    if (olData.authors && olData.authors.length > 0) {
      const authorKey = olData.authors[0].key;
      const authorResponse = await fetch(
        `https://openlibrary.org${authorKey}.json`,
        fetchOptions
      );
      if (authorResponse.ok) {
        const authorData = await authorResponse.json();
        author = authorData.name || null;
      }
    }
  } catch {
    // Author fetch failed — continue without author
  }

  const result = {
    isbn: normalized,
    title: parsed.title,
    author,
    pageCount: parsed.pageCount,
    publicationYear: parsed.publicationYear,
    seriesName: parsed.seriesName,
    seriesNumber: parsed.seriesNumber,
    coverId: parsed.coverId,
    coverSource: 'openlibrary',
  };

  // Cache successful result
  try {
    await env.RECOMMENDATIONS_CACHE.put(
      cacheKey,
      JSON.stringify(result),
      { expirationTtl: CACHE_TTL_SUCCESS }
    );
  } catch {
    // KV unavailable — skip caching
  }

  return result;
}
