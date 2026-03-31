/**
 * Hardcover server-side provider adapter.
 * Calls Hardcover GraphQL API directly with centrally-stored API key.
 * Best source for series data.
 */
import { fetchWithTimeout } from '../../utils/helpers.js';

const GRAPHQL_URL = 'https://api.hardcover.app/v1/graphql';
const TIMEOUT = 8000;

const SEARCH_QUERY = `
  query SearchBooks($q: String!, $perPage: Int!) {
    search(query: $q, query_type: "Book", per_page: $perPage) {
      results
    }
  }
`;

const DETAILS_QUERY = `
  query BookDetails($id: Int!) {
    books(where: {id: {_eq: $id}}) {
      id title description pages release_year
      cached_contributors cached_tags cached_image
      book_series(order_by: {featured: desc}) {
        position series { name }
      }
      editions(limit: 1, order_by: {users_count: desc}) {
        isbn_13 isbn_10 pages release_date
      }
    }
  }
`;

async function graphql(query, variables, apiKey) {
  return fetchWithTimeout(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  }, TIMEOUT);
}

/**
 * @param {{ title: string, author?: string, isbn?: string }} book
 * @param {string|null} apiKey
 * @returns {Promise<{ author, description, genres, isbn, pageCount, publicationYear, seriesName, seriesNumber, coverUrl, rateLimited? }>}
 */
export async function fetchMetadata(book, apiKey) {
  const empty = {
    author: null, description: null, genres: null, isbn: null,
    pageCount: null, publicationYear: null, seriesName: null,
    seriesNumber: null, coverUrl: null,
  };

  if (!apiKey) return empty;

  try {
    // 1. Search for the book
    const searchQ = book.author ? `${book.title} ${book.author}` : book.title;
    const searchRes = await graphql(SEARCH_QUERY, { q: searchQ, perPage: 5 }, apiKey);

    if (!searchRes.ok) {
      if (searchRes.status === 429) return { ...empty, rateLimited: true };
      return empty;
    }

    const searchData = await searchRes.json();

    // Check for rate limit in GraphQL errors
    if (searchData.errors?.some((e) => /rate.?limit|too many/i.test(e.message))) {
      return { ...empty, rateLimited: true };
    }

    const resultsStr = searchData.data?.search?.results;
    if (!resultsStr) return empty;

    const parsed = typeof resultsStr === 'string' ? JSON.parse(resultsStr) : resultsStr;
    const hit = parsed.hits?.[0]?.document;
    if (!hit?.id) return empty;

    // 2. Fetch full details
    const detailsRes = await graphql(DETAILS_QUERY, { id: hit.id }, apiKey);
    if (!detailsRes.ok) {
      if (detailsRes.status === 429) return { ...empty, rateLimited: true };
      return empty;
    }

    const detailsData = await detailsRes.json();
    if (detailsData.errors?.some((e) => /rate.?limit|too many/i.test(e.message))) {
      return { ...empty, rateLimited: true };
    }

    const b = detailsData.data?.books?.[0];
    if (!b) return empty;

    const result = { ...empty };

    // Author from cached_contributors
    try {
      const contributors = typeof b.cached_contributors === 'string'
        ? JSON.parse(b.cached_contributors)
        : b.cached_contributors;
      result.author = contributors?.[0]?.author?.name || null;
    } catch { /* ignore */ }

    result.description = b.description || null;
    result.pageCount = b.pages || b.editions?.[0]?.pages || null;
    result.publicationYear = b.release_year || null;
    result.coverUrl = b.cached_image || null;

    // Genres from cached_tags
    try {
      const tags = typeof b.cached_tags === 'string' ? JSON.parse(b.cached_tags) : b.cached_tags;
      result.genres = tags?.slice(0, 5).map((t) => t.tag || t) || null;
    } catch { /* ignore */ }

    // ISBN from edition
    const edition = b.editions?.[0];
    result.isbn = edition?.isbn_13 || edition?.isbn_10 || null;

    // Series data
    const primarySeries = b.book_series?.[0];
    if (primarySeries?.series?.name) {
      result.seriesName = primarySeries.series.name;
      const pos = Number(primarySeries.position);
      result.seriesNumber = isNaN(pos) ? null : pos;
    }

    return result;
  } catch {
    return empty;
  }
}
