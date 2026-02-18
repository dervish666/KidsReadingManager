# Caching Design: Book Covers (R2) & AI Recommendations (KV)

*Approved: 2026-02-18*

## Summary

Add two server-side caching layers to reduce external API dependency, improve load times, and cut AI costs:

1. **Book cover images** — R2-backed proxy with CDN edge caching
2. **AI recommendations** — KV-backed hash cache with 7-day TTL

## Prerequisites

Commit the existing unstaged focusMode changes (books.js + BookRecommendations.js) before starting caching work on a new branch.

---

## Part 1: Cover Proxy Route

### Endpoint

`GET /api/covers/:type/:key` — public (no auth)

- `:type` = `id`, `olid`, or `isbn`
- `:key` = `{identifier}-{S|M|L}.jpg`

### Cache Layers

| Layer | Storage | TTL | Latency |
|-------|---------|-----|---------|
| 1. CDN edge | Cloudflare Cache API | 30 days (`Cache-Control`) | Sub-ms |
| 2. R2 bucket | `book-covers` bucket | Permanent | ~10ms |
| 3. OpenLibrary | Origin fetch | N/A | 200-800ms |

### Behavior

- CDN hit → return immediately
- R2 hit → return, `waitUntil` CDN put
- Origin fetch → return, `waitUntil` R2 put + CDN put
- Missing cover (content-length < 1000 or non-200) → 404, not cached in R2
- OpenLibrary failure → 502
- Invalid type → 400
- Invalid key format → 400

### Infrastructure

- New R2 bucket: `book-covers`
- New binding in `wrangler.toml`: `BOOK_COVERS`
- New file: `src/routes/covers.js`
- Add `/api/covers` to public paths in `worker.js`

---

## Part 2: Frontend Cover URL Migration

### Changes

1. **`useBookCover.js`** — `buildCoverUrl()` base URL changes from `https://covers.openlibrary.org/b` to `/api/covers`
2. **`openLibraryApi.js`** — `getCoverUrl()` same base URL change
3. **`googleBooksApi.js`** — no change (different URL pattern, only used in import wizard)

### What stays the same

- OpenLibrary search API calls to discover `cover_i` — unchanged
- localStorage cache in `BookCoverContext` — kept, prevents redundant search calls
- The `__NO_COVER__` sentinel pattern — unchanged

---

## Part 3: Database Migration

**File:** `migrations/0020_add_cover_columns.sql`

```sql
ALTER TABLE books ADD COLUMN cover_id TEXT;
ALTER TABLE books ADD COLUMN cover_source TEXT;
ALTER TABLE books ADD COLUMN cover_url TEXT;
CREATE INDEX IF NOT EXISTS idx_books_cover ON books(cover_id);
```

All columns nullable. No existing queries affected. Populated lazily when covers are discovered (future optimization hook — not required for caching to function).

---

## Part 4: AI Recommendation Caching

### Cache Key

SHA-256 hash of normalized JSON:

```json
{
  "readingLevelMin": "2.0",
  "readingLevelMax": "4.5",
  "genres": ["adventure", "fantasy"],
  "focusMode": "balanced",
  "recentBookIds": ["abc", "def"],
  "provider": "anthropic"
}
```

Student name/ID/organization excluded — students with identical profiles share cache entries.

### Infrastructure

- New KV namespace: `RECOMMENDATIONS_CACHE`
- New binding in `wrangler.toml`: `RECOMMENDATIONS_CACHE`
- New file: `src/utils/recommendationCache.js`

### Integration

In `GET /api/books/ai-suggestions` (books.js):

1. Build cache inputs from student profile
2. Check KV — hit returns `{ ...result, cached: true }`
3. Miss calls AI, `waitUntil` KV put
4. `skipCache=true` query param bypasses cache

**TTL:** 7 days. Fail-open on KV errors.

### Frontend

- Show "Cached" indicator in `BookRecommendations.js` when `data.cached === true`
- Add "Refresh" button that passes `skipCache=true`

---

## Part 5: Testing

### Unit Tests

- `recommendationCache.js` — deterministic key generation, hit/miss flow, fail-open on errors
- Cover route — input validation (type, key format)

### Integration Tests

- Cover proxy — mock R2 + fetch, verify three-layer cascade
- Recommendation cache — mock KV, verify cache-before-AI flow, `skipCache` bypass, `waitUntil` storage

### Not Tested

CDN edge behavior, OpenLibrary uptime, R2/KV latency (Cloudflare's responsibility).

---

## Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cover auth | Public (no auth) | Non-sensitive images; auth headers prevent CDN caching |
| Cache key includes recentBookIds | Yes | Avoids suggesting already-read books; better UX over higher hit rate |
| Google Books covers | Not proxied | Different URL pattern, only used in import wizard, defer to later |
| DB cover columns | Included | Future optimization hook for avoiding redundant OpenLibrary searches |
| Recommendation KV namespace | Separate from READING_MANAGER_KV | Isolation of concerns |
| Part 4 extras (pre-warming, admin endpoint) | Deferred | Ship core first |
