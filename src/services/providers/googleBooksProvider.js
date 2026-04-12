/**
 * Google Books server-side provider adapter.
 * Requires API key from metadata_config.
 */
import { fetchWithTimeout } from '../../utils/helpers.js';

const VOLUMES_URL = 'https://www.googleapis.com/books/v1/volumes';
const TIMEOUT = 5000;

/**
 * @param {{ title: string, author?: string, isbn?: string }} book
 * @param {string|null} apiKey - Google Books API key
 * @returns {Promise<{ author, description, genres, isbn, pageCount, publicationYear, seriesName, seriesNumber, coverUrl, rateLimited? }>}
 */
export async function fetchMetadata(book, apiKey) {
  const empty = {
    author: null,
    description: null,
    genres: null,
    isbn: null,
    pageCount: null,
    publicationYear: null,
    seriesName: null,
    seriesNumber: null,
    coverUrl: null,
  };

  if (!apiKey) return empty;

  try {
    // Build query: prefer ISBN, fall back to title+author
    let q;
    if (book.isbn) {
      q = `isbn:${book.isbn}`;
    } else {
      q = `intitle:${book.title.trim()}`;
      if (book.author) q += `+inauthor:${book.author.trim()}`;
    }

    const params = new URLSearchParams({
      q,
      maxResults: '5',
      key: apiKey,
    });

    const res = await fetchWithTimeout(`${VOLUMES_URL}?${params}`, {}, TIMEOUT);

    if (!res.ok) {
      if (res.status === 429) return { ...empty, rateLimited: true };
      return empty;
    }

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return empty;

    const vol = item.volumeInfo;
    const result = { ...empty };

    result.author = vol.authors?.[0] || null;
    result.description = vol.description || null;
    result.pageCount = vol.pageCount || null;
    result.genres = vol.categories?.slice(0, 5) || null;

    // Publication year from date string
    if (vol.publishedDate) {
      const year = parseInt(vol.publishedDate.substring(0, 4), 10);
      if (!isNaN(year)) result.publicationYear = year;
    }

    // ISBN: prefer ISBN_13
    const ids = vol.industryIdentifiers || [];
    const isbn13 = ids.find((i) => i.type === 'ISBN_13');
    const isbn10 = ids.find((i) => i.type === 'ISBN_10');
    result.isbn = isbn13?.identifier || isbn10?.identifier || null;

    // Cover URL — upgrade to higher res by removing edge=curl and zoom
    if (vol.imageLinks?.thumbnail) {
      result.coverUrl = vol.imageLinks.thumbnail
        .replace('&edge=curl', '')
        .replace('zoom=1', 'zoom=2');
    }

    return result;
  } catch {
    return empty;
  }
}
