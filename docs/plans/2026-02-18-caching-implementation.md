# Caching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add R2-backed cover image caching and KV-backed AI recommendation caching to reduce external API calls, improve load times, and cut costs.

**Architecture:** Cover images are served through a public Hono proxy route (`/api/covers/:type/:key`) with a 3-layer cache: CDN edge → R2 bucket → OpenLibrary origin. AI recommendations are cached in a dedicated KV namespace keyed by a SHA-256 hash of the student's reading profile inputs. Both systems fail open — cache errors fall through silently to the origin.

**Tech Stack:** Cloudflare Workers (Hono), R2 object storage, KV key-value store, D1 database, Vitest

**Design doc:** `docs/plans/2026-02-18-caching-design.md`

---

### Task 0: Commit existing focusMode changes and create feature branch

The working tree has unstaged changes to `src/routes/books.js` and `src/components/BookRecommendations.js` (focusMode wiring for library-search). These must be committed on `main` before branching.

**Step 1: Commit focusMode changes**

```bash
git add src/routes/books.js src/components/BookRecommendations.js
git commit -m "feat: wire focusMode into library-search endpoint and frontend"
```

**Step 2: Create feature branch**

```bash
git checkout -b feature/caching-r2-kv
```

**Step 3: Run existing tests to confirm baseline**

Run: `npm test`
Expected: All ~1190 tests pass.

---

### Task 1: Cover proxy route — tests

Create tests for the cover proxy route. Test input validation, the 3-layer cache cascade, and error handling.

**Files:**
- Create: `src/__tests__/integration/covers.test.js`

**Step 1: Write the test file**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import covers from '../../routes/covers.js';

/**
 * Create a mock R2 bucket
 */
const createMockR2 = (overrides = {}) => ({
  get: vi.fn().mockResolvedValue(overrides.getResult || null),
  put: vi.fn().mockResolvedValue(undefined),
});

/**
 * Create a test app with the covers router mounted
 */
const createTestApp = (envOverrides = {}) => {
  const app = new Hono();
  const mockR2 = createMockR2(envOverrides.r2);

  app.use('*', async (c, next) => {
    c.env = {
      BOOK_COVERS: mockR2,
      ...envOverrides.env,
    };
    await next();
  });

  app.route('/api/covers', covers);
  return { app, mockR2 };
};

/**
 * Helper to make a fake R2 object (returned by R2.get())
 */
const fakeR2Object = (body, contentType = 'image/jpeg') => ({
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  }),
  writeHttpMetadata: (headers) => {
    headers.set('Content-Type', contentType);
  },
});

describe('Cover Proxy Route', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('input validation', () => {
    it('rejects invalid cover type', async () => {
      const { app } = createTestApp();
      const res = await app.request('/api/covers/invalid/12345-M.jpg');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Invalid cover type/);
    });

    it('rejects invalid key format — missing size suffix', async () => {
      const { app } = createTestApp();
      const res = await app.request('/api/covers/id/12345.jpg');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Invalid key format/);
    });

    it('rejects invalid key format — no extension', async () => {
      const { app } = createTestApp();
      const res = await app.request('/api/covers/id/12345-M');
      expect(res.status).toBe(400);
    });

    it('accepts valid types: id, olid, isbn', async () => {
      // These will miss R2 and try to fetch from origin — mock fetch to return 404-sized response
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('x', { status: 200, headers: { 'Content-Length': '1' } })
      );

      for (const type of ['id', 'olid', 'isbn']) {
        const { app } = createTestApp();
        const res = await app.request(`/api/covers/${type}/12345-M.jpg`);
        // Should not be 400 (validation passed)
        expect(res.status).not.toBe(400);
      }
    });
  });

  describe('R2 cache hit', () => {
    it('returns image from R2 when cached', async () => {
      const imageData = 'fake-jpeg-data';
      const { app, mockR2 } = createTestApp({
        r2: { getResult: fakeR2Object(imageData) },
      });

      const res = await app.request('/api/covers/id/12345-M.jpg');
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=2592000');
      expect(res.headers.get('X-Cache-Source')).toBe('r2');
      expect(mockR2.get).toHaveBeenCalledWith('id/12345-M.jpg');
    });
  });

  describe('origin fetch', () => {
    it('fetches from OpenLibrary on R2 miss and stores in R2', async () => {
      const imageData = new ArrayBuffer(2000); // > 1000 bytes = valid cover
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(imageData, {
          status: 200,
          headers: {
            'Content-Length': '2000',
            'Content-Type': 'image/jpeg',
          },
        })
      );

      const { app, mockR2 } = createTestApp();
      const res = await app.request('/api/covers/id/99999-M.jpg');

      expect(res.status).toBe(200);
      expect(res.headers.get('X-Cache-Source')).toBe('origin');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://covers.openlibrary.org/b/id/99999-M.jpg',
        expect.any(Object)
      );
      expect(mockR2.put).toHaveBeenCalledWith(
        'id/99999-M.jpg',
        expect.any(ArrayBuffer),
        expect.objectContaining({
          httpMetadata: expect.objectContaining({ contentType: 'image/jpeg' }),
        })
      );
    });

    it('returns 404 for tiny images (missing covers)', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('x', {
          status: 200,
          headers: { 'Content-Length': '43' }, // 1x1 pixel placeholder
        })
      );

      const { app, mockR2 } = createTestApp();
      const res = await app.request('/api/covers/id/00000-M.jpg');
      expect(res.status).toBe(404);
      expect(mockR2.put).not.toHaveBeenCalled();
    });

    it('returns 502 when OpenLibrary fetch fails', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const { app } = createTestApp();
      const res = await app.request('/api/covers/id/12345-M.jpg');
      expect(res.status).toBe(502);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/integration/covers.test.js`
Expected: FAIL — `../../routes/covers.js` does not exist yet.

**Step 3: Commit**

```bash
git add src/__tests__/integration/covers.test.js
git commit -m "test: add cover proxy route tests"
```

---

### Task 2: Cover proxy route — implementation

Create the cover proxy route that serves images through R2 with CDN caching.

**Files:**
- Create: `src/routes/covers.js`

**Step 1: Write the cover proxy route**

```javascript
import { Hono } from 'hono';

const covers = new Hono();

const VALID_TYPES = ['id', 'olid', 'isbn'];
const KEY_PATTERN = /^[\w]+-[SML]\.(jpg|jpeg|png)$/i;

/**
 * Cover image proxy with R2 caching
 *
 * GET /api/covers/:type/:key
 *
 * :type  — id, olid, or isbn (OpenLibrary cover lookup strategies)
 * :key   — {identifier}-{S|M|L}.jpg
 *
 * Cache layers:
 *   1. Cloudflare CDN edge cache (Cache-Control header)
 *   2. R2 persistent storage (survives CDN eviction)
 *   3. OpenLibrary origin (only on first request per cover)
 */
covers.get('/:type/:key', async (c) => {
  const { type, key } = c.req.param();

  if (!VALID_TYPES.includes(type)) {
    return c.json({ error: 'Invalid cover type. Use: id, olid, isbn' }, 400);
  }

  if (!KEY_PATTERN.test(key)) {
    return c.json({ error: 'Invalid key format. Expected: {id}-{S|M|L}.jpg' }, 400);
  }

  const r2Key = `${type}/${key}`;
  const r2 = c.env.BOOK_COVERS;

  // Layer 1: R2 check
  const r2Object = r2 ? await r2.get(r2Key) : null;
  if (r2Object) {
    const headers = new Headers();
    r2Object.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=2592000'); // 30 days
    headers.set('X-Cache-Source', 'r2');
    return new Response(r2Object.body, { headers });
  }

  // Layer 2: Fetch from OpenLibrary origin
  const originUrl = `https://covers.openlibrary.org/b/${type}/${key}`;

  try {
    const originResponse = await fetch(originUrl, {
      headers: { 'User-Agent': 'KidsReadingManager/1.0 (educational-app)' },
    });

    const contentLength = parseInt(originResponse.headers.get('Content-Length') || '0');
    if (!originResponse.ok || contentLength < 1000) {
      return c.json({ error: 'Cover not found' }, 404);
    }

    const imageData = await originResponse.arrayBuffer();
    const contentType = originResponse.headers.get('Content-Type') || 'image/jpeg';

    // Store in R2 (non-blocking)
    if (r2) {
      c.executionCtx.waitUntil(
        r2.put(r2Key, imageData, {
          httpMetadata: {
            contentType,
            cacheControl: 'public, max-age=2592000',
          },
        })
      );
    }

    return new Response(imageData, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=2592000',
        'X-Cache-Source': 'origin',
      },
    });
  } catch (error) {
    console.error('Cover fetch error:', error);
    return c.json({ error: 'Failed to fetch cover' }, 502);
  }
});

export default covers;
```

**Note on CDN caching:** The design mentioned using the Cache API (`caches.default`) explicitly. However, Cloudflare automatically caches responses with `Cache-Control: public` headers at the CDN edge for requests through custom domains. Explicit Cache API usage is only needed when you want fine-grained control (e.g., different keys). Since we're using the standard request URL as the cache key, the automatic CDN caching via `Cache-Control` headers is sufficient and simpler. The `X-Cache-Source` header still tells you whether R2 or origin served the request; CF adds its own `CF-Cache-Status` header for CDN hits.

**Step 2: Run cover proxy tests**

Run: `npx vitest run src/__tests__/integration/covers.test.js`
Expected: All tests pass. Some tests may need adjustment if `executionCtx.waitUntil` is not available in test environment — if so, add a mock `executionCtx` in the test app setup:

```javascript
// In createTestApp, before the route:
app.use('*', async (c, next) => {
  c.executionCtx = { waitUntil: vi.fn() };
  // ... rest of env setup
});
```

**Step 3: Commit**

```bash
git add src/routes/covers.js
git commit -m "feat: add cover image proxy route with R2 caching"
```

---

### Task 3: Wire cover route into worker + public paths

Register the cover route in the worker and add it to the public paths lists so it bypasses auth.

**Files:**
- Modify: `src/worker.js:20-28` (imports), `src/worker.js:155-166` (tenant public paths), `src/worker.js:197-199` (route registration)
- Modify: `src/middleware/tenant.js:23-31` (JWT auth public paths)

**Step 1: Add import and route registration in worker.js**

Add to imports (after line 28):

```javascript
import covers from './routes/covers.js';
```

Add route registration (after line 199, before the health check):

```javascript
app.route('/api/covers', covers);
```

**Step 2: Add /api/covers to public paths in worker.js**

In the tenant middleware public paths array (line 156-166), add a prefix check for `/api/covers/`:

```javascript
  // Existing exact-match public paths
  const publicPaths = [
    '/api/auth/mode',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/health',
    '/api/login',
    '/api/logout'
  ];

  if (publicPaths.includes(url.pathname) || url.pathname.startsWith('/api/covers/')) {
    return next();
  }
```

**Step 3: Add /api/covers to JWT auth public paths in tenant.js**

In `jwtAuthMiddleware()` (around line 23-38), add the same prefix check:

```javascript
  // After the existing publicPaths.includes check:
  if (publicPaths.includes(url.pathname) || url.pathname.startsWith('/api/covers/')) {
    return next();
  }
```

**Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass (existing + new cover tests).

**Step 5: Commit**

```bash
git add src/worker.js src/middleware/tenant.js
git commit -m "feat: register cover proxy route as public endpoint"
```

---

### Task 4: Frontend cover URL migration

Change `useBookCover.js` and `openLibraryApi.js` to point cover image URLs at the proxy instead of OpenLibrary directly.

**Files:**
- Modify: `src/hooks/useBookCover.js:48-49` (buildCoverUrl)
- Modify: `src/utils/openLibraryApi.js:9` (COVERS_BASE_URL)

**Step 1: Update useBookCover.js**

Change `buildCoverUrl` (line 48-49) from:

```javascript
const buildCoverUrl = (coverId) => {
  return `https://covers.openlibrary.org/b/id/${coverId}-${COVER_SIZE}.jpg`;
};
```

To:

```javascript
const buildCoverUrl = (coverId) => {
  return `/api/covers/id/${coverId}-${COVER_SIZE}.jpg`;
};
```

**Step 2: Update openLibraryApi.js**

Change `COVERS_BASE_URL` (line 9) from:

```javascript
const COVERS_BASE_URL = 'https://covers.openlibrary.org/b';
```

To:

```javascript
const COVERS_BASE_URL = '/api/covers';
```

This automatically updates all 3 usages: `getCoverUrl()` (line 758), the inline cover URL in `findTopAuthorCandidatesForBook` (line 490), and the `ia` and `olid` fallback URLs (lines 762, 767).

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass. If any existing tests assert specific OpenLibrary cover URLs, they'll need updating to `/api/covers/...`.

**Step 4: Commit**

```bash
git add src/hooks/useBookCover.js src/utils/openLibraryApi.js
git commit -m "feat: redirect cover image URLs to local proxy"
```

---

### Task 5: Database migration for cover columns

Add `cover_id`, `cover_source`, and `cover_url` columns to the books table.

**Files:**
- Create: `migrations/0021_add_cover_columns.sql`

**Step 1: Write the migration**

```sql
-- Add cover metadata columns to books table
-- These enable persisting cover references so the frontend doesn't need to
-- re-discover cover IDs from OpenLibrary on every page load.
-- All columns are nullable — existing books are unaffected.

ALTER TABLE books ADD COLUMN cover_id TEXT;
ALTER TABLE books ADD COLUMN cover_source TEXT;
ALTER TABLE books ADD COLUMN cover_url TEXT;

CREATE INDEX IF NOT EXISTS idx_books_cover ON books(cover_id);
```

**Step 2: Apply locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration applies successfully.

**Step 3: Commit**

```bash
git add migrations/0021_add_cover_columns.sql
git commit -m "db: add cover_id, cover_source, cover_url columns to books table"
```

---

### Task 6: Recommendation cache utility — tests

Create tests for the recommendation cache utility.

**Files:**
- Create: `src/__tests__/unit/recommendationCache.test.js`

**Step 1: Write the test file**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateCacheKey,
  getCachedRecommendations,
  cacheRecommendations,
} from '../../utils/recommendationCache.js';

const createMockKV = (overrides = {}) => ({
  get: vi.fn().mockResolvedValue(overrides.getResult ?? null),
  put: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
});

describe('recommendationCache', () => {
  describe('generateCacheKey', () => {
    it('produces a deterministic hash for the same inputs', async () => {
      const inputs = {
        readingLevelMin: 2.0,
        readingLevelMax: 4.5,
        genres: ['fantasy', 'adventure'],
        focusMode: 'balanced',
        recentBookIds: ['book-2', 'book-1'],
        provider: 'anthropic',
      };

      const key1 = await generateCacheKey(inputs);
      const key2 = await generateCacheKey(inputs);
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^rec:[0-9a-f]{64}$/);
    });

    it('produces the same hash regardless of array order', async () => {
      const inputs1 = {
        readingLevelMin: 2.0,
        readingLevelMax: 4.5,
        genres: ['fantasy', 'adventure'],
        focusMode: 'balanced',
        recentBookIds: ['book-2', 'book-1'],
        provider: 'anthropic',
      };
      const inputs2 = {
        ...inputs1,
        genres: ['adventure', 'fantasy'],
        recentBookIds: ['book-1', 'book-2'],
      };

      const key1 = await generateCacheKey(inputs1);
      const key2 = await generateCacheKey(inputs2);
      expect(key1).toBe(key2);
    });

    it('produces different hashes for different inputs', async () => {
      const base = {
        readingLevelMin: 2.0,
        readingLevelMax: 4.5,
        genres: ['fantasy'],
        focusMode: 'balanced',
        recentBookIds: [],
        provider: 'anthropic',
      };

      const keyA = await generateCacheKey(base);
      const keyB = await generateCacheKey({ ...base, focusMode: 'challenge' });
      const keyC = await generateCacheKey({ ...base, provider: 'openai' });

      expect(keyA).not.toBe(keyB);
      expect(keyA).not.toBe(keyC);
    });

    it('handles missing optional fields gracefully', async () => {
      const minimal = {
        readingLevelMin: 1.0,
        readingLevelMax: 3.0,
        focusMode: 'balanced',
        provider: 'anthropic',
      };

      const key = await generateCacheKey(minimal);
      expect(key).toMatch(/^rec:[0-9a-f]{64}$/);
    });
  });

  describe('getCachedRecommendations', () => {
    it('returns null when KV binding is missing', async () => {
      const result = await getCachedRecommendations({}, { focusMode: 'balanced', provider: 'anthropic' });
      expect(result).toBeNull();
    });

    it('returns null on cache miss', async () => {
      const mockKV = createMockKV();
      const result = await getCachedRecommendations(
        { RECOMMENDATIONS_CACHE: mockKV },
        { readingLevelMin: 2, readingLevelMax: 4, genres: [], focusMode: 'balanced', recentBookIds: [], provider: 'anthropic' }
      );
      expect(result).toBeNull();
      expect(mockKV.get).toHaveBeenCalledTimes(1);
    });

    it('returns cached data with _cached flag on hit', async () => {
      const cachedData = { suggestions: [{ title: 'Test Book' }] };
      const mockKV = createMockKV({ getResult: JSON.stringify(cachedData) });
      const result = await getCachedRecommendations(
        { RECOMMENDATIONS_CACHE: mockKV },
        { readingLevelMin: 2, readingLevelMax: 4, genres: [], focusMode: 'balanced', recentBookIds: [], provider: 'anthropic' }
      );
      expect(result).toEqual({ ...cachedData, _cached: true });
    });

    it('returns null and logs on KV error (fail-open)', async () => {
      const mockKV = createMockKV();
      mockKV.get.mockRejectedValue(new Error('KV unavailable'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await getCachedRecommendations(
        { RECOMMENDATIONS_CACHE: mockKV },
        { readingLevelMin: 2, readingLevelMax: 4, genres: [], focusMode: 'balanced', recentBookIds: [], provider: 'anthropic' }
      );
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('cacheRecommendations', () => {
    it('does nothing when KV binding is missing', async () => {
      await cacheRecommendations({}, {}, {}); // should not throw
    });

    it('stores result in KV with TTL', async () => {
      const mockKV = createMockKV();
      const inputs = { readingLevelMin: 2, readingLevelMax: 4, genres: [], focusMode: 'balanced', recentBookIds: [], provider: 'anthropic' };
      const result = { suggestions: [{ title: 'Cached Book' }] };

      await cacheRecommendations({ RECOMMENDATIONS_CACHE: mockKV }, inputs, result);

      expect(mockKV.put).toHaveBeenCalledTimes(1);
      const [key, value, options] = mockKV.put.mock.calls[0];
      expect(key).toMatch(/^rec:[0-9a-f]{64}$/);
      expect(JSON.parse(value)).toEqual(result);
      expect(options.expirationTtl).toBe(7 * 24 * 60 * 60);
    });

    it('does not throw on KV write error (fail-open)', async () => {
      const mockKV = createMockKV();
      mockKV.put.mockRejectedValue(new Error('KV write failed'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await cacheRecommendations(
        { RECOMMENDATIONS_CACHE: mockKV },
        { readingLevelMin: 2, readingLevelMax: 4, genres: [], focusMode: 'balanced', recentBookIds: [], provider: 'anthropic' },
        { suggestions: [] }
      );
      // Should not throw
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/recommendationCache.test.js`
Expected: FAIL — `../../utils/recommendationCache.js` does not exist yet.

**Step 3: Commit**

```bash
git add src/__tests__/unit/recommendationCache.test.js
git commit -m "test: add recommendation cache utility tests"
```

---

### Task 7: Recommendation cache utility — implementation

Create the cache utility with key generation, get, and put operations.

**Files:**
- Create: `src/utils/recommendationCache.js`

**Step 1: Write the implementation**

```javascript
/**
 * Recommendation caching using Cloudflare KV
 *
 * Cache key is a SHA-256 hash of normalised recommendation inputs.
 * Identical inputs across different students/schools share cached results.
 *
 * TTL: 7 days
 */

const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Generate a deterministic cache key from recommendation inputs.
 * Arrays are sorted so order doesn't affect the hash.
 *
 * @param {Object} inputs
 * @returns {Promise<string>} Cache key prefixed with "rec:"
 */
export async function generateCacheKey(inputs) {
  const normalised = JSON.stringify({
    focusMode: inputs.focusMode || 'balanced',
    genres: (inputs.genres || []).slice().sort(),
    provider: inputs.provider || 'anthropic',
    readingLevelMax: inputs.readingLevelMax ?? '',
    readingLevelMin: inputs.readingLevelMin ?? '',
    recentBookIds: (inputs.recentBookIds || []).slice().sort(),
  });

  const data = new TextEncoder().encode(normalised);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'rec:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get cached recommendations if available.
 * Returns null on miss or error (fail-open).
 *
 * @param {Object} env - Worker environment (needs RECOMMENDATIONS_CACHE binding)
 * @param {Object} inputs - Recommendation input parameters
 * @returns {Promise<Object|null>}
 */
export async function getCachedRecommendations(env, inputs) {
  if (!env.RECOMMENDATIONS_CACHE) return null;

  try {
    const key = await generateCacheKey(inputs);
    const raw = await env.RECOMMENDATIONS_CACHE.get(key);

    if (raw) {
      return { ...JSON.parse(raw), _cached: true };
    }
    return null;
  } catch (error) {
    console.error('Recommendation cache read error:', error);
    return null;
  }
}

/**
 * Store recommendations in cache.
 * Silently ignores errors (fail-open).
 *
 * @param {Object} env - Worker environment
 * @param {Object} inputs - Recommendation input parameters (for key generation)
 * @param {Object} result - The AI recommendation response to cache
 */
export async function cacheRecommendations(env, inputs, result) {
  if (!env.RECOMMENDATIONS_CACHE) return;

  try {
    const key = await generateCacheKey(inputs);
    await env.RECOMMENDATIONS_CACHE.put(key, JSON.stringify(result), {
      expirationTtl: CACHE_TTL,
    });
  } catch (error) {
    console.error('Recommendation cache write error:', error);
  }
}
```

**Step 2: Run recommendation cache tests**

Run: `npx vitest run src/__tests__/unit/recommendationCache.test.js`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add src/utils/recommendationCache.js
git commit -m "feat: add recommendation cache utility with KV storage"
```

---

### Task 8: Integrate recommendation cache into AI suggestions endpoint

Wire the cache into the existing `GET /api/books/ai-suggestions` route.

**Files:**
- Modify: `src/routes/books.js:371-457` (ai-suggestions handler)

**Step 1: Add import at top of books.js**

Add after the existing imports:

```javascript
import { getCachedRecommendations, cacheRecommendations } from '../utils/recommendationCache.js';
```

**Step 2: Add cache check before AI call**

In the `ai-suggestions` handler, after building the student profile (line 388) and before getting AI config (line 395), add the cache check. Also read the `skipCache` query param (alongside `studentId` and `focusMode` on line 373).

Update the destructuring on line 373:

```javascript
const { studentId, focusMode = 'balanced', skipCache } = c.req.query();
```

After the profile null check (line 392), add:

```javascript
    // Build cache inputs from profile
    const cacheInputs = {
      readingLevelMin: profile.student.readingLevelMin,
      readingLevelMax: profile.student.readingLevelMax,
      genres: profile.preferences.favoriteGenreNames,
      focusMode,
      recentBookIds: profile.readBookIds || [],
      provider: null, // set after AI config is loaded
    };

    // Check cache (unless skipCache is requested)
    if (skipCache !== 'true') {
      // We need to determine the provider for the cache key.
      // Quick-read AI config just for provider name:
      const configRow = await db.prepare(
        'SELECT provider FROM org_ai_config WHERE organization_id = ?'
      ).bind(organizationId).first();
      cacheInputs.provider = configRow?.provider || 'anthropic';

      const cached = await getCachedRecommendations(c.env, cacheInputs);
      if (cached) {
        // Still need to do the library cross-check on cached suggestions
        const suggestionTitles = (cached.suggestions || cached._suggestions || [])
          .filter(s => s && s.title)
          .map(s => s.title.toLowerCase());
        let libraryMatches = {};

        if (suggestionTitles.length > 0) {
          const placeholders = suggestionTitles.map(() => '?').join(',');
          const booksResult = await db.prepare(
            `SELECT id, title FROM books WHERE LOWER(title) IN (${placeholders})`
          ).bind(...suggestionTitles).all();

          for (const book of (booksResult.results || [])) {
            libraryMatches[book.title.toLowerCase()] = book.id;
          }
        }

        const enriched = (cached.suggestions || []).map(s => ({
          ...s,
          inLibrary: s?.title ? !!libraryMatches[s.title.toLowerCase()] : false,
          libraryBookId: s?.title ? (libraryMatches[s.title.toLowerCase()] || null) : null,
        }));

        return c.json({
          suggestions: enriched,
          studentProfile: {
            name: profile.student.name,
            readingLevel: profile.student.readingLevel,
            favoriteGenres: profile.preferences.favoriteGenreNames,
            inferredGenres: profile.inferredGenres.map(g => g.name),
            recentReads: profile.recentReads.map(r => r.title),
          },
          cached: true,
        });
      }
    }
```

**Step 3: After the AI call succeeds, cache the result**

After `generateBroadSuggestions` returns (line 419), before the library cross-check, set the provider on cacheInputs and store:

```javascript
    // Set provider for cache key (now we know it from aiConfig)
    cacheInputs.provider = aiConfig.provider;

    // Cache the raw suggestions (non-blocking)
    c.executionCtx.waitUntil(
      cacheRecommendations(c.env, cacheInputs, { suggestions })
    );
```

**Step 4: Add `cached: false` to the existing non-cached response**

On line 447, add `cached: false` to the response JSON:

```javascript
    return c.json({
      suggestions: enrichedSuggestions,
      studentProfile: { ... },
      cached: false,
    });
```

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass. The existing books.test.js tests should still pass because they don't set `RECOMMENDATIONS_CACHE` in env, so the cache is skipped (fail-open).

**Step 6: Commit**

```bash
git add src/routes/books.js
git commit -m "feat: integrate recommendation cache into AI suggestions endpoint"
```

---

### Task 9: Frontend — cached indicator and refresh button

Show a "Cached" chip when recommendations come from cache, and add a "Refresh" button to bypass the cache.

**Files:**
- Modify: `src/components/BookRecommendations.js`

**Step 1: Track cached state**

Add a `isCachedResult` state variable alongside the existing state:

```javascript
const [isCachedResult, setIsCachedResult] = useState(false);
```

**Step 2: Update handleAiSuggestions to read cached flag**

In `handleAiSuggestions` (around line 199), after parsing the response:

```javascript
setIsCachedResult(data.cached === true);
```

Also clear it at the start of the handler:

```javascript
setIsCachedResult(false);
```

**Step 3: Add a refreshAiSuggestions handler**

```javascript
const handleRefreshAiSuggestions = async () => {
  if (!selectedStudentId) return;

  setAiLoading(true);
  setError(null);
  setRecommendations([]);
  setResultType('ai');
  setIsCachedResult(false);

  try {
    const response = await fetchWithAuth(
      `/api/books/ai-suggestions?studentId=${selectedStudentId}&focusMode=${focusMode}&skipCache=true`
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || errorData.error || `API error: ${response.status}`);
    }

    const data = await response.json();
    setStudentProfile(data.studentProfile);
    setRecommendations(data.suggestions || []);
    setIsCachedResult(false);
  } catch (err) {
    setError(err.message);
  } finally {
    setAiLoading(false);
  }
};
```

**Step 4: Show cached indicator and refresh button in the UI**

In the results section, after the recommendations list renders, add a small indicator. Find the area where AI results are displayed and add:

```jsx
{isCachedResult && resultType === 'ai' && (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
    <Chip label="Cached result" size="small" variant="outlined" color="info" />
    <Button
      size="small"
      variant="text"
      onClick={handleRefreshAiSuggestions}
      disabled={aiLoading}
    >
      Get fresh suggestions
    </Button>
  </Box>
)}
```

Note: The exact JSX placement depends on where the recommendation results render in the component. Read the full component to find the right location — it should appear just above the recommendation cards, after the loading spinner.

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/components/BookRecommendations.js
git commit -m "feat: show cached indicator and refresh button for AI recommendations"
```

---

### Task 10: Update wrangler.toml with R2 and KV bindings

Add the R2 bucket binding and KV namespace binding. The actual R2 bucket and KV namespace need to be created via wrangler CLI before deploying, but the toml can be updated now.

**Files:**
- Modify: `wrangler.toml`

**Step 1: Add R2 binding**

After the `[[d1_databases]]` section (line 26), add:

```toml
# R2 bucket for caching book cover images
[[r2_buckets]]
binding = "BOOK_COVERS"
bucket_name = "book-covers"
```

**Step 2: Add KV binding**

Update the existing `kv_namespaces` array (line 7-9) to include the new namespace:

```toml
kv_namespaces = [
  { binding = "READING_MANAGER_KV", id = "09297a22cb3b4abc96bf0a5d4c79b4e9", preview_id = "6b452436a7794d36810e929dde07debf" },
  { binding = "RECOMMENDATIONS_CACHE", id = "PLACEHOLDER_CREATE_BEFORE_DEPLOY", preview_id = "PLACEHOLDER_CREATE_BEFORE_DEPLOY" }
]
```

The placeholder IDs must be replaced with real IDs from `npx wrangler kv namespace create "RECOMMENDATIONS_CACHE"` before deploying to production.

**Step 3: Commit**

```bash
git add wrangler.toml
git commit -m "config: add R2 and KV bindings for cover and recommendation caching"
```

---

### Task 11: Final integration test and cleanup

Run the full test suite, verify everything works together, update the MEMORY.md.

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (~1200+ tests including the new ones).

**Step 2: Run build to verify no compilation errors**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 3: Update project memory**

Update `/Users/dervish/.claude/projects/-Users-dervish-CascadeProjects-KidsReadingManager-redux/memory/MEMORY.md` to note the next migration is now 0022, and record the caching work.

**Step 4: Write session notes**

Write session notes to `~/notes/KidsReadingManager redux.md`.

---

## Pre-Deployment Checklist (manual, not automated)

These steps happen at deploy time, not during implementation:

1. Create R2 bucket: `npx wrangler r2 bucket create book-covers`
2. Create KV namespace: `npx wrangler kv namespace create "RECOMMENDATIONS_CACHE"`
3. Update `wrangler.toml` placeholder IDs with real namespace IDs
4. Apply migration: `npx wrangler d1 migrations apply reading-manager-db --remote`
5. Deploy: `npm run go`
6. Verify: `curl https://reading.brisflix.com/api/covers/id/1-M.jpg` returns image or 404
