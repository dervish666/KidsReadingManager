/**
 * BookInfo (rreading-glasses) server-side provider adapter.
 *
 * Serves Goodreads-schema metadata via a Readarr-compatible API. Strong on
 * genres ("shelves") and series data — the fields OpenLibrary / Google Books
 * are weakest at. No API key required.
 *
 * The base URL is configurable. It defaults to the public shared instance
 * (`https://api.bookinfo.pro`), which is rate-limited; for bulk jobs point it
 * at a self-hosted instance via the metadata config. The cascade engine treats
 * HTTP 429 as a transient rate-limit and backs off / drops the provider, so the
 * public instance degrades gracefully rather than failing the batch.
 *
 * Lookup flow: /search?q= returns ID-only hits, so we take the first work,
 * fetch /work/{workId} for the full resource, and verify the title to guard
 * against bad matches (search carries no title to score against).
 */
import { fetchWithTimeout } from '../../utils/helpers.js';
import { sanitizeForSearch, calculateTitleSimilarity } from '../../utils/stringMatching.js';
import { isJunkGenre } from '../../utils/genreFilter.js';

export const DEFAULT_BOOKINFO_BASE_URL = 'https://api.bookinfo.pro';
const TIMEOUT = 8000;

// Reject obviously-wrong matches. Loose on purpose — the cascade only fills
// empty fields, so we just want to exclude unrelated works, not demand exact.
const MIN_TITLE_SIMILARITY = 0.5;

// Goodreads "shelves" that aren't genres — mirror the spirit of the OpenLibrary
// subject filter so we don't store shelf noise as a genre.
const SHELF_STOPWORDS = new Set([
  'audiobook',
  'audiobooks',
  'ebook',
  'ebooks',
  'kindle',
  'owned',
  'to-read',
  'currently-reading',
  'favorites',
  'favourites',
  'default',
  'books-i-own',
  'library',
  'wish-list',
  'wishlist',
]);

function parseYear(...values) {
  for (const v of values) {
    if (!v) continue;
    const m = String(v).match(/(\d{4})/);
    if (m) {
      const y = parseInt(m[1], 10);
      if (y >= 1000 && y <= 2200) return y;
    }
  }
  return null;
}

/**
 * @param {{ title: string, author?: string, isbn?: string }} book
 * @param {string|{ baseUrl?: string, accessClientId?: string, accessClientSecret?: string }} [options]
 *   Either a base URL string (back-compat) or an options object. `baseUrl` falls
 *   back to the public instance when empty. `accessClientId` / `accessClientSecret`
 *   are a Cloudflare Access service token — sent as CF-Access-Client-Id /
 *   CF-Access-Client-Secret so a self-hosted instance gated behind an Access
 *   policy lets the request through. Both must be set for the headers to be added.
 * @returns {Promise<{ author, description, genres, isbn, pageCount, publicationYear, seriesName, seriesNumber, coverUrl, rateLimited? }>}
 */
export async function fetchMetadata(book, options) {
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

  const opts = typeof options === 'string' ? { baseUrl: options } : options || {};
  const base = (opts.baseUrl || DEFAULT_BOOKINFO_BASE_URL).replace(/\/+$/, '');
  const headers = {
    'User-Agent': 'TallyReading/1.0 (educational-app)',
    Accept: 'application/json',
  };

  // Cloudflare Access service token — required when the (self-hosted) instance is
  // gated behind an Access policy. Only sent when both halves are present so the
  // public-instance and ungated paths are unaffected.
  if (opts.accessClientId && opts.accessClientSecret) {
    headers['CF-Access-Client-Id'] = opts.accessClientId;
    headers['CF-Access-Client-Secret'] = opts.accessClientSecret;
  }

  try {
    // 1. Search → workId. The search endpoint has no ISBN param and returns
    //    only { bookId, workId, author }, so query by title (+ author).
    const query = book.author
      ? `${sanitizeForSearch(book.title)} ${book.author}`
      : sanitizeForSearch(book.title);

    const searchRes = await fetchWithTimeout(
      `${base}/search?q=${encodeURIComponent(query)}`,
      { headers },
      TIMEOUT
    );
    if (!searchRes.ok) {
      if (searchRes.status === 429) return { ...empty, rateLimited: true };
      return empty;
    }

    const hits = await searchRes.json();
    const workId = Array.isArray(hits) ? hits[0]?.workId : null;
    if (!workId) return empty;

    // 2. Fetch the full work resource.
    const workRes = await fetchWithTimeout(`${base}/work/${workId}`, { headers }, TIMEOUT);
    if (!workRes.ok) {
      if (workRes.status === 429) return { ...empty, rateLimited: true };
      return empty;
    }

    const work = await workRes.json();
    if (!work?.Title) return empty;

    // Guard: search is ID-only, so verify the returned work actually matches.
    if (calculateTitleSimilarity(book.title, work.Title) < MIN_TITLE_SIMILARITY) return empty;

    const result = { ...empty };

    // Genres — the primary reason to use this provider. rreading-glasses returns
    // ['none'] for works with no genres, and Goodreads shelves include plenty of
    // non-genre noise; isJunkGenre is the shared filter (sentinels, catalog
    // headings, years) and SHELF_STOPWORDS adds the Goodreads-specific shelves.
    if (Array.isArray(work.Genres)) {
      const genres = work.Genres.filter(
        (g) => !isJunkGenre(g) && !SHELF_STOPWORDS.has(g.toLowerCase())
      ).slice(0, 5);
      result.genres = genres.length ? genres : null;
    }

    // Author (first/primary contributor).
    result.author = work.Authors?.[0]?.Name || null;

    // Series + position. Prefer the first titled series; read this work's
    // position from its link item.
    const series = work.Series?.find((s) => s?.Title) || null;
    if (series) {
      result.seriesName = series.Title;
      const link =
        series.LinkItems?.find((l) => l.ForeignWorkId === work.ForeignId) || series.LinkItems?.[0];
      const pos = link ? Number(link.SeriesPosition ?? link.PositionInSeries) : NaN;
      result.seriesNumber = Number.isFinite(pos) && pos > 0 ? pos : null;
    }

    // Pick the best edition: prefer one matching the book's ISBN, else the
    // first (the API returns the "best"/original edition first).
    const editions = Array.isArray(work.Books) ? work.Books : [];
    let edition = null;
    if (book.isbn) edition = editions.find((e) => e.Isbn13 && e.Isbn13 === book.isbn) || null;
    if (!edition) edition = editions[0] || null;

    if (edition) {
      result.isbn = edition.Isbn13 || null;
      result.pageCount = edition.NumPages || null;
      result.coverUrl = edition.ImageUrl || null;
    }

    // Description: chosen edition first, else any edition that has one.
    const description =
      edition?.Description?.trim() || editions.find((e) => e.Description?.trim())?.Description;
    result.description = description?.trim() || null;

    // Publication year: prefer the work's first-published date (matches the
    // "first publish year" semantics other providers use), else the edition's.
    result.publicationYear = parseYear(
      work.ReleaseDate,
      work.ReleaseDateRaw,
      edition?.ReleaseDate,
      edition?.ReleaseDateRaw
    );

    return result;
  } catch {
    return empty;
  }
}
