# Caching Plan: Book Covers & AI Recommendations

## Overview

Currently, book cover images are fetched from OpenLibrary (or Google Books) on every page load, and AI recommendations hit the LLM API every time. This works fine with zero users but will cause problems at scale — slow page loads, rate limiting from OpenLibrary, unnecessary AI API costs, and a poor experience when OpenLibrary is down (which already happens enough to warrant the availability check in `openLibraryApi.js`).

This plan adds two caching layers using Cloudflare services already in the stack:

| Content | Cache Layer | Backing Store | Cost |
|---------|------------|---------------|------|
| Book cover images | CDN edge cache | **R2** (persistent object storage) | $0/mo (10GB free, zero egress) |
| AI recommendations | — | **KV** (already deployed) | $0/mo (already on Workers Paid) |

---

## Part 1: Book Cover Image Caching (R2)

### Problem

Cover URLs are constructed dynamically from OpenLibrary cover IDs (stored as `cover_i` in search results) and never persisted. Every time a book appears on screen, the browser fetches `https://covers.openlibrary.org/b/id/{coverId}-M.jpg` directly. With 18,000+ books and multiple schools, this means:

- Thousands of requests to OpenLibrary per page load across all users
- Slow cover loading (OpenLibrary is not a CDN)
- Broken covers when OpenLibrary is down (already a known issue)
- No control over image availability

### Solution: R2 Image Proxy Worker

Create a cover proxy endpoint on your domain that serves images through a three-layer cache:

```
Browser → CDN Edge Cache → R2 Bucket → OpenLibrary (origin)
```

First request for any cover: fetches from OpenLibrary, stores in R2, caches at CDN edge.
Subsequent requests: served from CDN (sub-millisecond) or R2 (global, persistent).

### Implementation Steps

#### Step 1: Create R2 Bucket

```bash
npx wrangler r2 bucket create book-covers
```

#### Step 2: Add R2 Binding to `wrangler.toml`

```toml
# Add after the existing d1_databases section
[[r2_buckets]]
binding = "BOOK_COVERS"
bucket_name = "book-covers"
```

#### Step 3: Create Cover Proxy Route

Create `src/routes/covers.js`:

```javascript
import { Hono } from 'hono';

const covers = new Hono();

/**
 * Cover image proxy with R2 caching
 * 
 * URL patterns:
 *   /api/covers/olid/{olid}-{size}.jpg     - OpenLibrary Work/Edition ID
 *   /api/covers/id/{coverId}-{size}.jpg     - OpenLibrary Cover ID
 *   /api/covers/isbn/{isbn}-{size}.jpg      - ISBN lookup
 *
 * Sizes: S (small), M (medium), L (large)
 * 
 * Cache layers:
 *   1. Cloudflare CDN edge cache (Cache-Control header, free)
 *   2. R2 persistent storage (survives cache eviction)
 *   3. OpenLibrary origin (only on first request per cover)
 */
covers.get('/:type/:key', async (c) => {
  const { type, key } = c.req.param();
  
  // Validate type
  if (!['olid', 'id', 'isbn'].includes(type)) {
    return c.json({ error: 'Invalid cover type. Use: olid, id, isbn' }, 400);
  }
  
  // Validate key format (e.g., "12345-M.jpg")
  if (!/^[\w]+-[SML]\.(jpg|jpeg|png)$/i.test(key)) {
    return c.json({ error: 'Invalid key format. Expected: {id}-{S|M|L}.jpg' }, 400);
  }
  
  const r2Key = `${type}/${key}`;
  const env = c.env;
  
  // Layer 1: Check CDN edge cache
  const cacheKey = new Request(c.req.url);
  const cache = caches.default;
  let response = await cache.match(cacheKey);
  if (response) {
    return response;
  }
  
  // Layer 2: Check R2
  const r2Object = await env.BOOK_COVERS.get(r2Key);
  if (r2Object) {
    const headers = new Headers();
    r2Object.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=2592000'); // 30 days
    headers.set('X-Cache-Source', 'r2');
    
    response = new Response(r2Object.body, { headers });
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }
  
  // Layer 3: Fetch from OpenLibrary
  const originUrl = `https://covers.openlibrary.org/b/${type}/${key}`;
  
  try {
    const originResponse = await fetch(originUrl, {
      headers: { 'User-Agent': 'KidsReadingManager/1.0 (educational-app)' },
      cf: { cacheTtl: 0 } // Don't let CF cache the origin fetch
    });
    
    // OpenLibrary returns a 1x1 pixel for missing covers — check content length
    const contentLength = parseInt(originResponse.headers.get('Content-Length') || '0');
    if (!originResponse.ok || contentLength < 1000) {
      // Return a 404 — don't cache missing covers in R2
      return c.json({ error: 'Cover not found' }, 404);
    }
    
    const imageData = await originResponse.arrayBuffer();
    const contentType = originResponse.headers.get('Content-Type') || 'image/jpeg';
    
    // Store in R2 (non-blocking)
    c.executionCtx.waitUntil(
      env.BOOK_COVERS.put(r2Key, imageData, {
        httpMetadata: {
          contentType,
          cacheControl: 'public, max-age=2592000',
        },
      })
    );
    
    // Build response
    response = new Response(imageData, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=2592000',
        'X-Cache-Source': 'origin',
      },
    });
    
    // Cache at edge (non-blocking)
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    
    return response;
  } catch (error) {
    console.error('Cover fetch error:', error);
    return c.json({ error: 'Failed to fetch cover' }, 502);
  }
});

export default covers;
```

#### Step 4: Register Route in `worker.js`

```javascript
import covers from './routes/covers.js';

// Add with other route registrations
app.route('/api/covers', covers);
```

#### Step 5: Update Frontend Cover URL Generation

In `src/utils/openLibraryApi.js`, change `getCoverUrl()` to point at your proxy:

```javascript
// Before
const COVERS_BASE_URL = 'https://covers.openlibrary.org/b';

// After
const COVERS_BASE_URL = '/api/covers';

// The URL format stays the same:
// /api/covers/id/{coverId}-M.jpg
// /api/covers/olid/{olid}-M.jpg
```

Similarly update any cover URL construction in `googleBooksApi.js` and `BookRecommendations.js`.

**Important:** Google Books cover URLs (`books.google.com/books/content?...`) use a different format. For these, either:
- Proxy them through a similar route (`/api/covers/gbooks/{volumeId}`)
- Or download and store in R2 with a `gbooks/` prefix during the metadata fetch

#### Step 6: Add cover_url Column to Books Table (Optional but Recommended)

Currently the books table has no cover data. Adding a column lets you persist the cover reference so you don't need to re-fetch from OpenLibrary to know the cover ID:

```sql
-- Migration: Add cover metadata to books table
ALTER TABLE books ADD COLUMN cover_id TEXT;        -- OpenLibrary cover_i value
ALTER TABLE books ADD COLUMN cover_source TEXT;     -- 'openlibrary', 'googlebooks'
ALTER TABLE books ADD COLUMN cover_url TEXT;        -- Constructed proxy URL for convenience

CREATE INDEX IF NOT EXISTS idx_books_cover ON books(cover_id);
```

Then when fetching book details from OpenLibrary (the existing "Get Details" button in BookManager), save the `cover_i` to the database. The frontend reads `book.coverUrl` from the database rather than constructing it on the fly.

### R2 Storage Estimates

| Metric | Estimate |
|--------|----------|
| Unique covers | ~10,000 (not all 18k books have covers) |
| Average cover size (M) | ~50 KB |
| Total storage | ~500 MB (5% of 10 GB free tier) |
| Initial writes | 10,000 Class A ops (1% of 1M free) |
| Monthly reads (cache misses) | Minimal — CDN handles most |

**Cost: $0/month** well into hundreds of schools.

---

## Part 2: AI Recommendation Caching (KV)

### Problem

Every recommendation request calls the AI API (Claude/OpenAI/Gemini), costing both time and money. But recommendations for children with similar profiles (same reading level, similar genres, similar age range) will be very similar. A Year 3 child who likes adventure books at reading level "developing" will get broadly the same suggestions as every other child matching that profile.

### Solution: Hash-Based KV Cache

Generate a deterministic cache key from the recommendation inputs. Check KV before calling the AI. Cache hits return instantly; misses call the AI and store the result.

### Implementation Steps

#### Step 1: Create a Recommendations KV Namespace

```bash
npx wrangler kv namespace create "RECOMMENDATIONS_CACHE"
# Note the ID from the output
```

#### Step 2: Add KV Binding to `wrangler.toml`

```toml
# Add to existing kv_namespaces array
kv_namespaces = [
  { binding = "READING_MANAGER_KV", id = "09297a22cb3b4abc96bf0a5d4c79b4e9", preview_id = "6b452436a7794d36810e929dde07debf" },
  { binding = "RECOMMENDATIONS_CACHE", id = "<your-namespace-id>", preview_id = "<your-preview-id>" }
]
```

#### Step 3: Create Cache Utility

Create `src/utils/recommendationCache.js`:

```javascript
/**
 * Recommendation caching using Cloudflare KV
 * 
 * Cache key is a SHA-256 hash of the normalised recommendation inputs.
 * This means identical inputs across different students/schools
 * will share cached results — maximising hit rate.
 * 
 * TTL: 7 days (recommendations don't need to be real-time fresh)
 */

const CACHE_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Generate a deterministic cache key from recommendation inputs
 */
async function generateCacheKey(inputs) {
  // Normalise and sort all inputs for deterministic hashing
  const normalised = JSON.stringify({
    ageRange: inputs.ageRange || '',
    genres: (inputs.genres || []).slice().sort(),
    readingLevel: inputs.readingLevel || '',
    recentBookIds: (inputs.recentBookIds || []).slice().sort(),
    // Note: we deliberately exclude student name/id so different
    // students with the same profile share cache entries
    provider: inputs.provider || 'anthropic',
  });
  
  const encoder = new TextEncoder();
  const data = encoder.encode(normalised);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'rec:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get cached recommendations if available
 * 
 * @param {Object} env - Worker environment (needs RECOMMENDATIONS_CACHE binding)
 * @param {Object} inputs - The recommendation input parameters
 * @returns {Object|null} Cached recommendations or null
 */
export async function getCachedRecommendations(env, inputs) {
  if (!env.RECOMMENDATIONS_CACHE) return null;
  
  try {
    const key = await generateCacheKey(inputs);
    const cached = await env.RECOMMENDATIONS_CACHE.get(key, { type: 'json' });
    
    if (cached) {
      console.log(`Recommendation cache HIT: ${key.substring(0, 16)}...`);
      return {
        ...cached,
        _cached: true,
        _cacheKey: key.substring(0, 16),
      };
    }
    
    console.log(`Recommendation cache MISS: ${key.substring(0, 16)}...`);
    return null;
  } catch (error) {
    console.error('Recommendation cache read error:', error);
    return null; // Fail open — just call the AI
  }
}

/**
 * Store recommendations in cache
 * 
 * @param {Object} env - Worker environment
 * @param {Object} inputs - The recommendation input parameters (used to generate key)
 * @param {Object} result - The AI recommendation response to cache
 */
export async function cacheRecommendations(env, inputs, result) {
  if (!env.RECOMMENDATIONS_CACHE) return;
  
  try {
    const key = await generateCacheKey(inputs);
    
    await env.RECOMMENDATIONS_CACHE.put(key, JSON.stringify(result), {
      expirationTtl: CACHE_TTL,
      metadata: {
        cachedAt: new Date().toISOString(),
        provider: inputs.provider || 'unknown',
        readingLevel: inputs.readingLevel || '',
      },
    });
    
    console.log(`Recommendation cached: ${key.substring(0, 16)}... (TTL: ${CACHE_TTL}s)`);
  } catch (error) {
    console.error('Recommendation cache write error:', error);
    // Non-fatal — recommendation was already returned to user
  }
}

/**
 * Invalidate cached recommendations (e.g., when book database changes significantly)
 * 
 * Note: KV doesn't support prefix deletion, so for bulk invalidation
 * you'd need to let entries expire naturally or track keys separately.
 * For most cases, the 7-day TTL handles staleness automatically.
 */
export async function invalidateCache(env, inputs) {
  if (!env.RECOMMENDATIONS_CACHE) return;
  
  try {
    const key = await generateCacheKey(inputs);
    await env.RECOMMENDATIONS_CACHE.delete(key);
  } catch (error) {
    console.error('Recommendation cache invalidation error:', error);
  }
}
```

#### Step 4: Integrate into Recommendations Route

In the existing recommendation endpoint (likely in `src/routes/books.js` or similar), wrap the AI call:

```javascript
import { getCachedRecommendations, cacheRecommendations } from '../utils/recommendationCache.js';

// Inside the recommendation handler, before calling the AI:
const cacheInputs = {
  ageRange: student.ageRange,
  genres: studentGenres,
  readingLevel: student.readingLevel,
  recentBookIds: recentBooks.map(b => b.id),
  provider: aiProvider,
};

// Check cache first
const cached = await getCachedRecommendations(env, cacheInputs);
if (cached) {
  return c.json({
    recommendations: cached.recommendations,
    cached: true,
  });
}

// Cache miss — call AI as normal
const aiResult = await callAIProvider(/* existing logic */);

// Store in cache (non-blocking)
c.executionCtx.waitUntil(
  cacheRecommendations(env, cacheInputs, aiResult)
);

return c.json({
  recommendations: aiResult.recommendations,
  cached: false,
});
```

#### Step 5: Add Cache Indicator to Frontend (Optional)

Show a small "cached" badge or tooltip on recommendations served from cache, so teachers know it's a fast result. Consider adding a "Refresh" button that bypasses cache.

### Cache Key Design Notes

The cache key deliberately **excludes** student-specific identifiers (name, ID, school). This means:

- Two students at the same school with the same reading level and genre preferences will share cached results ✓
- Two students at different schools with the same profile will also share cached results ✓
- This maximises cache hit rate across the entire platform

The key **includes** `recentBookIds` so students who've just read different books get different recommendations (avoiding "you already read this" suggestions).

### KV Storage Estimates

| Metric | Estimate |
|--------|----------|
| Unique input combinations | ~500–2,000 (levels × genre combos × recent books) |
| Average response size | ~2–5 KB JSON |
| Total storage | ~5–10 MB (0.5–1% of 1 GB limit) |
| Daily writes (new combos) | ~20–100 (well within 1M/mo on Paid) |
| Daily reads (cache checks) | ~200–2,000 (well within 10M/mo on Paid) |

**Cost: $0/month** (already on Workers Paid plan).

---

## Part 3: Deployment Checklist

### Before deploying

- [ ] Create R2 bucket: `npx wrangler r2 bucket create book-covers`
- [ ] Create KV namespace: `npx wrangler kv namespace create "RECOMMENDATIONS_CACHE"`
- [ ] Update `wrangler.toml` with R2 and KV bindings
- [ ] Apply new database migration (cover_id column) if using Step 6
- [ ] Deploy with `npm run build && npm run deploy`

### After deploying

- [ ] Test cover proxy: visit `https://reading.brisflix.com/api/covers/id/12345-M.jpg`
- [ ] Verify R2 storage: `npx wrangler r2 object list book-covers`
- [ ] Test recommendation caching: make same recommendation request twice, check logs for "cache HIT"
- [ ] Verify CDN caching: check `X-Cache-Source` response header on cover requests

### Monitoring

- R2 usage: Cloudflare dashboard → R2 → book-covers bucket → Metrics
- KV usage: Cloudflare dashboard → Workers KV → RECOMMENDATIONS_CACHE → Metrics
- Cache hit rates: Worker logs (`console.log` statements in the cache utility)

---

## Part 4: Future Enhancements

### Cover Pre-warming

Run a one-time script to pre-fetch and cache all existing book covers in R2:

```javascript
// Script to pre-warm R2 cover cache
// Run via wrangler or a scheduled worker
const books = await db.prepare('SELECT id, cover_id FROM books WHERE cover_id IS NOT NULL').all();
for (const book of books.results) {
  await fetch(`https://reading.brisflix.com/api/covers/id/${book.cover_id}-M.jpg`);
  await new Promise(r => setTimeout(r, 100)); // Rate limit: 10/sec
}
```

### Image Optimisation

Later, if mobile performance matters, add Cloudflare Image Transformations on top of R2-stored originals. The free tier allows 5,000 unique transformations/month — enough for generating mobile-optimised thumbnails of the most popular covers.

### Recommendation Cache Warming

For schools with many students at the same reading level, pre-generate recommendations for common level/genre combinations during quiet hours (e.g., via a Cron Trigger):

```toml
# Add to wrangler.toml
[triggers]
crons = ["0 3 * * *"]  # Run at 3am daily
```

### Cache Admin Endpoint

Add a protected admin endpoint to view cache stats and flush entries:

```
GET  /api/admin/cache/stats          — KV key count, R2 object count
POST /api/admin/cache/flush/covers   — Clear R2 bucket  
POST /api/admin/cache/flush/recs     — Clear KV recommendations
```

---

*Document created: February 2026*
