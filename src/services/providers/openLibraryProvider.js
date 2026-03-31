/**
 * OpenLibrary server-side provider adapter.
 * Fetches book metadata from OpenLibrary Search + Works APIs.
 * No API key required.
 */
import { fetchWithTimeout } from '../../utils/helpers.js';

const SEARCH_URL = 'https://openlibrary.org/search.json';
const COVERS_URL = 'https://covers.openlibrary.org/b';
const TIMEOUT = 5000;

/**
 * @param {{ title: string, author?: string, isbn?: string }} book
 * @returns {Promise<{ author, description, genres, isbn, pageCount, publicationYear, seriesName, seriesNumber, coverUrl }>}
 */
export async function fetchMetadata(book) {
  const empty = {
    author: null, description: null, genres: null, isbn: null,
    pageCount: null, publicationYear: null, seriesName: null,
    seriesNumber: null, coverUrl: null,
  };

  try {
    // 1. Search by ISBN first (most precise), fall back to title+author
    const params = new URLSearchParams({
      limit: '5',
      fields: 'key,title,author_name,first_publish_year,isbn,cover_i,number_of_pages_median,subject',
    });

    if (book.isbn) {
      params.set('isbn', book.isbn);
    } else {
      params.set('title', book.title);
      if (book.author) params.set('author', book.author);
    }

    const searchRes = await fetchWithTimeout(
      `${SEARCH_URL}?${params}`,
      { headers: { 'User-Agent': 'TallyReading/1.0 (educational-app)' } },
      TIMEOUT,
    );

    if (!searchRes.ok) return empty;
    const searchData = await searchRes.json();
    const doc = searchData.docs?.[0];
    if (!doc) return empty;

    // 2. Extract structured fields from search result
    const result = { ...empty };
    result.author = doc.author_name?.[0] || null;
    result.publicationYear = doc.first_publish_year || null;
    result.pageCount = doc.number_of_pages_median || null;
    result.genres = doc.subject?.slice(0, 5) || null;

    // Pick the first ISBN-13 (13 digits) or first ISBN
    if (doc.isbn?.length) {
      result.isbn = doc.isbn.find((i) => i.length === 13) || doc.isbn[0];
    }

    // Cover URL from cover ID
    if (doc.cover_i) {
      result.coverUrl = `${COVERS_URL}/id/${doc.cover_i}-M.jpg`;
    }

    // 3. Fetch description from Works API (search doesn't include it)
    if (doc.key) {
      try {
        const worksRes = await fetchWithTimeout(
          `https://openlibrary.org${doc.key}.json`,
          { headers: { 'User-Agent': 'TallyReading/1.0 (educational-app)' } },
          TIMEOUT,
        );
        if (worksRes.ok) {
          const worksData = await worksRes.json();
          const desc = worksData.description;
          result.description = typeof desc === 'string' ? desc : desc?.value || null;
        }
      } catch {
        // Description fetch failed — continue with what we have
      }
    }

    return result;
  } catch {
    return empty;
  }
}
