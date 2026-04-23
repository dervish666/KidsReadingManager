import { Hono } from 'hono';
import { fetchWithTimeout } from '../utils/helpers.js';
import { getConfigWithKeys } from './metadata.js';
import { getEncryptionSecret, hashToken } from '../utils/crypto.js';
import { rateLimit } from '../middleware/tenant.js';
import { fetchMetadata as googleBooksFetch } from '../services/providers/googleBooksProvider.js';
import { fetchMetadata as hardcoverFetch } from '../services/providers/hardcoverProvider.js';

const coversRouter = new Hono();

// H8: cap unauthenticated cover lookups. 60/min per IP is generous for
// normal classroom load (a single class rarely renders more than ~30
// covers) while blocking scripted enumeration that would burn external
// provider quota and fill R2 with orphan keys.
coversRouter.use('*', rateLimit(60, 60000));

// Valid cover types for /:type/:key
const VALID_TYPES = new Set(['id', 'olid', 'isbn', 'ia']);

// Key format: {identifier}-{S|M|L}.jpg
const KEY_PATTERN = /^[A-Za-z0-9_-]+-[SML]\.jpg$/;

// Cache-Control: 30 days for successful hits
const CACHE_CONTROL_HIT = 'public, max-age=2592000';
// Cache-Control: 1 hour for misses, so broken titles don't hammer providers
const CACHE_CONTROL_MISS = 'public, max-age=3600';

// Minimum content-length for a real cover image (below this = placeholder)
const MIN_IMAGE_SIZE = 1000;

// Query param limits for /search
const MAX_TITLE_LEN = 200;
const MAX_AUTHOR_LEN = 200;

/**
 * Fetch an image URL. Returns:
 *   { imageData, contentType } on success (image >= MIN_IMAGE_SIZE)
 *   null if origin returned non-OK or a placeholder
 * Throws on network error (caller decides whether to fall back or 502).
 */
async function fetchCoverImage(url) {
  const res = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': 'TallyReading/1.0 (educational-app)' } },
    5000
  );
  if (!res.ok) return null;
  const imageData = await res.arrayBuffer();
  if (imageData.byteLength < MIN_IMAGE_SIZE) return null;
  return {
    imageData,
    contentType: res.headers.get('Content-Type') || 'image/jpeg',
  };
}

/**
 * Query OpenLibrary search API to find a cover_i for a title+author.
 * Returns the direct covers.openlibrary.org URL, or null.
 */
async function openLibrarySearchCover(title, author) {
  const params = new URLSearchParams({ title, limit: '1', fields: 'cover_i' });
  if (author) params.set('author', author);
  const url = `https://openlibrary.org/search.json?${params.toString()}`;
  try {
    const res = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': 'TallyReading/1.0 (educational-app)' } },
      5000
    );
    if (!res.ok) return null;
    const data = await res.json();
    const coverId = data.docs?.[0]?.cover_i;
    if (!coverId) return null;
    return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
  } catch (err) {
    console.error('OL search error:', err);
    return null;
  }
}

/**
 * Try Google Books and Hardcover for an ISBN cover when OpenLibrary has nothing.
 * Returns { imageData, contentType, source } on success, null otherwise.
 */
async function fetchIsbnFallback(isbn, env) {
  const db = env.READING_MANAGER_DB;
  if (!db) return null;

  let config;
  try {
    const encSecret = getEncryptionSecret(env);
    config = await getConfigWithKeys(db, encSecret);
  } catch (err) {
    console.error('Cover fallback config error:', err);
    return null;
  }
  if (!config) return null;

  const attempts = [
    { name: 'google-books', fn: googleBooksFetch, apiKey: config.googleBooksApiKey },
    { name: 'hardcover', fn: hardcoverFetch, apiKey: config.hardcoverApiKey },
  ];

  for (const { name, fn, apiKey } of attempts) {
    if (!apiKey) continue;
    try {
      const result = await fn({ title: '', isbn }, apiKey);
      if (!result?.coverUrl) continue;
      const fetched = await fetchCoverImage(result.coverUrl);
      if (fetched) {
        console.log(`[covers] ISBN ${isbn} served via ${name} fallback`);
        return { ...fetched, source: name };
      }
    } catch (err) {
      console.error(`Cover fallback ${name} error:`, err);
    }
  }

  return null;
}

/**
 * Normalize a title/author string for stable keying:
 * NFC → lowercase → trim → collapse whitespace.
 */
function normalizeForKey(str) {
  if (!str) return '';
  return str.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Compute a deterministic R2 key for a title+author search.
 * Uses the first 16 hex chars of sha256(`${title}|${author}`).
 */
async function searchKey(title, author) {
  const composite = `${normalizeForKey(title)}|${normalizeForKey(author || '')}`;
  const hash = await hashToken(composite);
  return `search/${hash.slice(0, 16)}-M.jpg`;
}

/**
 * GET /search?title=...&author=...
 * Server-side cover resolver for title+author queries.
 *
 * Order: R2 → OpenLibrary search → Google Books → Hardcover.
 * Declared BEFORE /:type/:key so the literal "search" segment isn't interpreted
 * as a cover type.
 */
coversRouter.get('/search', async (c) => {
  const title = c.req.query('title');
  const author = c.req.query('author') || null;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return c.json({ message: 'title query param is required' }, 400);
  }
  if (title.length > MAX_TITLE_LEN) {
    return c.json({ message: `title exceeds ${MAX_TITLE_LEN} chars` }, 400);
  }
  if (author && author.length > MAX_AUTHOR_LEN) {
    return c.json({ message: `author exceeds ${MAX_AUTHOR_LEN} chars` }, 400);
  }

  const r2Key = await searchKey(title, author);
  const r2 = c.env.BOOK_COVERS;

  // 1. Check R2 cache
  if (r2) {
    try {
      const cached = await r2.get(r2Key);
      if (cached) {
        const contentType = cached.httpMetadata?.contentType || 'image/jpeg';
        return new Response(cached.body, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': CACHE_CONTROL_HIT,
            'X-Cache-Source': 'r2',
          },
        });
      }
    } catch (err) {
      console.error('R2 get error:', err);
    }
  }

  // 2. Try each provider in order until one yields an image
  let fetched = null;
  let source = null;

  // 2a. OpenLibrary search
  const olUrl = await openLibrarySearchCover(title, author);
  if (olUrl) {
    try {
      const res = await fetchCoverImage(olUrl);
      if (res) {
        fetched = res;
        source = 'openlibrary';
      }
    } catch (err) {
      console.error('OL cover fetch error:', err);
    }
  }

  // 2b. Google Books + Hardcover (need config)
  if (!fetched) {
    let config = null;
    if (c.env.READING_MANAGER_DB) {
      try {
        const encSecret = getEncryptionSecret(c.env);
        config = await getConfigWithKeys(c.env.READING_MANAGER_DB, encSecret);
      } catch (err) {
        console.error('Search config error:', err);
      }
    }

    const attempts = [
      {
        name: 'google-books',
        fn: googleBooksFetch,
        apiKey: config?.googleBooksApiKey,
      },
      {
        name: 'hardcover',
        fn: hardcoverFetch,
        apiKey: config?.hardcoverApiKey,
      },
    ];

    for (const { name, fn, apiKey } of attempts) {
      if (!apiKey) continue;
      try {
        const result = await fn({ title, author }, apiKey);
        if (!result?.coverUrl) continue;
        const res = await fetchCoverImage(result.coverUrl);
        if (res) {
          fetched = res;
          source = name;
          console.log(`[covers] "${title}" served via ${name} search fallback`);
          break;
        }
      } catch (err) {
        console.error(`Search ${name} error:`, err);
      }
    }
  }

  if (!fetched) {
    return new Response(JSON.stringify({ message: 'Cover not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': CACHE_CONTROL_MISS },
    });
  }

  // 3. Cache in R2 via waitUntil (non-blocking)
  if (r2) {
    const r2PutPromise = r2
      .put(r2Key, fetched.imageData.slice(0), {
        httpMetadata: { contentType: fetched.contentType },
      })
      .catch((err) => {
        console.error('R2 put error:', err);
      });
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(r2PutPromise);
    }
  }

  return new Response(fetched.imageData, {
    status: 200,
    headers: {
      'Content-Type': fetched.contentType,
      'Cache-Control': CACHE_CONTROL_HIT,
      'X-Cache-Source': source,
    },
  });
});

/**
 * GET /:type/:key
 * Serve cover images through R2 with multi-provider origin fallback.
 *
 * :type = id | olid | isbn | ia
 * :key  = {identifier}-{S|M|L}.jpg
 *
 * Order for ISBN: R2 → OpenLibrary covers → Google Books → Hardcover.
 * Order for other types (OpenLibrary-specific IDs): R2 → OpenLibrary only.
 */
coversRouter.get('/:type/:key', async (c) => {
  const { type, key } = c.req.param();

  if (!VALID_TYPES.has(type)) {
    return c.json({ message: 'Invalid cover type. Must be id, olid, isbn, or ia.' }, 400);
  }

  if (!KEY_PATTERN.test(key)) {
    return c.json({ message: 'Invalid key format. Expected {identifier}-{S|M|L}.jpg' }, 400);
  }

  const r2Key = `${type}/${key}`;
  const r2 = c.env.BOOK_COVERS;

  // 1. Check R2 cache
  if (r2) {
    try {
      const cached = await r2.get(r2Key);
      if (cached) {
        const contentType = cached.httpMetadata?.contentType || 'image/jpeg';
        return new Response(cached.body, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': CACHE_CONTROL_HIT,
            'X-Cache-Source': 'r2',
          },
        });
      }
    } catch (err) {
      console.error('R2 get error:', err);
    }
  }

  // 2. Try OpenLibrary covers origin
  const originUrl = `https://covers.openlibrary.org/b/${type}/${key}`;
  let fetched = null;
  let source = 'origin';
  let originThrew = false;

  try {
    fetched = await fetchCoverImage(originUrl);
  } catch (err) {
    console.error('Origin fetch error:', err);
    originThrew = true;
  }

  // 3. ISBN fallback: Google Books → Hardcover
  if (!fetched && type === 'isbn') {
    const isbn = key.replace(/-[SML]\.jpg$/, '');
    const fallback = await fetchIsbnFallback(isbn, c.env);
    if (fallback) {
      fetched = fallback;
      source = fallback.source;
    }
  }

  // 3b. Non-ISBN fallback: when OpenLibrary origin threw for id/olid/ia types,
  // try the search-based fallback (Google Books → Hardcover) using title+author
  // query params if the caller supplied them.
  if (!fetched && originThrew && type !== 'isbn') {
    const title = c.req.query('title');
    const author = c.req.query('author') || null;

    if (title && typeof title === 'string' && title.trim()) {
      let config = null;
      if (c.env.READING_MANAGER_DB) {
        try {
          const encSecret = getEncryptionSecret(c.env);
          config = await getConfigWithKeys(c.env.READING_MANAGER_DB, encSecret);
        } catch (err) {
          console.error('Non-ISBN fallback config error:', err);
        }
      }

      const attempts = [
        { name: 'google-books', fn: googleBooksFetch, apiKey: config?.googleBooksApiKey },
        { name: 'hardcover', fn: hardcoverFetch, apiKey: config?.hardcoverApiKey },
      ];

      for (const { name, fn, apiKey } of attempts) {
        if (!apiKey) continue;
        try {
          const result = await fn({ title: title.trim(), author }, apiKey);
          if (!result?.coverUrl) continue;
          const res = await fetchCoverImage(result.coverUrl);
          if (res) {
            fetched = res;
            source = name;
            console.log(`[covers] ${type}/${key} served via ${name} search fallback`);
            break;
          }
        } catch (err) {
          console.error(`Non-ISBN fallback ${name} error:`, err);
        }
      }
    }
  }

  if (!fetched) {
    if (originThrew) {
      return c.json({ message: 'Failed to fetch cover from origin' }, 502);
    }
    return new Response(JSON.stringify({ message: 'Cover not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': CACHE_CONTROL_MISS },
    });
  }

  // 4. Cache in R2 via waitUntil (non-blocking). Copy buffer so R2 and Response don't race.
  if (r2) {
    const r2PutPromise = r2
      .put(r2Key, fetched.imageData.slice(0), {
        httpMetadata: { contentType: fetched.contentType },
      })
      .catch((err) => {
        console.error('R2 put error:', err);
      });
    if (c.executionCtx?.waitUntil) {
      c.executionCtx.waitUntil(r2PutPromise);
    }
  }

  return new Response(fetched.imageData, {
    status: 200,
    headers: {
      'Content-Type': fetched.contentType,
      'Cache-Control': CACHE_CONTROL_HIT,
      'X-Cache-Source': source,
    },
  });
});

export default coversRouter;
