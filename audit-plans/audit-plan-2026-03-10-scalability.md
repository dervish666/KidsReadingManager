# Codebase Scalability Audit Report — Tally Reading

## Date: 2026-03-10
## Scope: Full codebase — scaling from ~5 schools to 50–100+ schools

---

## Executive Summary

Tally Reading works well at its current scale of a handful of schools with a few hundred students each. However, **the architecture has several hard ceilings that will cause failures — not just slowness — as you scale to more schools**. The two most urgent are the **cron jobs** (streak recalculation and Wonde sync), which process all students/orgs sequentially and will exceed Cloudflare Worker CPU time limits at roughly 8–17 schools. The **frontend loads all data on login** (every student, every book) with no pagination, which becomes untenable at scale. There are also **zero timeouts on any external API call** (AI providers, Wonde, OpenLibrary, Google Books), meaning a single slow upstream can hang an entire Worker request until Cloudflare kills it.

The good news: tenant isolation is solid, the D1 batch chunking pattern is correct, and the core data model is sound. The fixes are incremental — no rewrites needed. Roughly **3–4 days of focused work** addresses everything through Phase 3 (50 schools). Phase 4+ items are quality-of-life improvements.

**Finding counts:** 5 Critical, 7 High, 8 Medium

---

## Critical Issues (Fix Before ~10 Schools)

### C1. Streak Cron Will Timeout at ~8 Schools

**Severity:** CRITICAL — **silent failure, streaks stop updating**

`src/routes/students.js:1515-1557` / `src/worker.js:336-362`

The daily streak cron iterates **all organisations, then all students within each, sequentially**:

```javascript
for (const org of (orgs.results || [])) {
  const students = await db.prepare(
    `SELECT id FROM students WHERE organization_id = ? AND is_active = 1`
  ).bind(organizationId).all();

  for (const student of (students.results || [])) {
    await updateStudentStreak(db, student.id, organizationId); // 2 queries per student
  }
}
```

Each `updateStudentStreak` does a SELECT (all sessions) + UPDATE (streak columns) = ~10–15ms per student. With 10 schools × 500 students = 5,000 students × 12ms = **60 seconds**. Cloudflare Workers paid plan allows **30 seconds CPU time per cron invocation**. The cron silently fails mid-way, leaving some orgs with stale streaks.

The GDPR hard-delete loop (`src/worker.js:407-469`) runs in the **same** scheduled handler, compounding the time budget.

### C2. Wonde Sync Cron Will Timeout at ~17 Schools

**Severity:** CRITICAL — **schools stop receiving student/class updates**

`src/worker.js:471-490`

The daily Wonde delta sync also processes orgs sequentially:

```javascript
for (const org of (wondeOrgs.results || [])) {
  const schoolToken = await decryptSensitiveData(org.wonde_school_token, env.JWT_SECRET);
  await runFullSync(org.id, schoolToken, org.wonde_school_id, db, {
    updatedAfter: org.wonde_last_sync_at,
  });
}
```

Each org sync involves 3 paginated Wonde API calls + D1 batch upserts ≈ 1.5–2s per org. At 17 orgs: 17 × 2s = 34s > 30s limit. And the sync itself (`src/services/wondeSync.js:300-306`) has a nested sequential loop for user class assignments.

### C3. Frontend Loads ALL Students + ALL Books on Every Login

**Severity:** CRITICAL — **slow login, high memory usage, eventual browser OOM**

`src/contexts/AppContext.js:673-681`

```javascript
const [studentsResponse, classesResponse, booksResponse, ...] =
  await Promise.all([
    fetchWithAuth(`${API_URL}/students`),   // ALL students, ALL sessions, ALL preferences
    fetchWithAuth(`${API_URL}/books`),       // Up to 5,000 books (hard cap)
    ...
  ]);
```

The students endpoint (`src/routes/students.js:189-280`) fetches every student, then batch-fetches ALL their reading sessions (no date limit) and ALL preferences, then **recalculates streaks in JavaScript** for every student before responding. For 500 students with 50 sessions each = 25,000 session rows in a single response. The books endpoint caps at 5,000 rows (`src/routes/books.js:102`) but doesn't tell the frontend it's truncated.

### C4. Import Preview Loads ENTIRE Book Catalog Into Memory

**Severity:** CRITICAL — **Worker OOM on book import**

`src/routes/books.js:1043`

```javascript
const allBooksResult = await db.prepare('SELECT * FROM books').all();
```

No WHERE clause, no LIMIT, no org scoping. Loads the **global** book catalog (18,000+ rows, all columns) into Worker memory for JavaScript `.find()` deduplication loops (`books.js:1064-1083`). This is O(N×M) where N = import batch, M = total books, with Levenshtein distance calculations on each comparison.

### C5. Zero Timeouts on All External HTTP Calls

**Severity:** CRITICAL — **a single slow upstream hangs the entire request**

No `AbortController` or timeout on any external `fetch()`:

| File | Line | Service |
|------|------|---------|
| `src/services/aiService.js` | 99, 126, 190 | Anthropic, OpenAI, Gemini |
| `src/utils/wondeApi.js` | 39 | Wonde paginated fetch (while loop!) |
| `src/utils/openLibraryApi.js` | 96, 434, 464 | OpenLibrary search + work fetch |
| `src/utils/googleBooksApi.js` | 105, 149 | Google Books search |
| `src/utils/hardcoverApi.js` | 48 | Hardcover GraphQL |
| `src/routes/covers.js` | 66 | OpenLibrary cover images |
| `src/utils/email.js` | 111, 145 | Resend, Cloudflare Email |

The Wonde API client is particularly risky — it's a `while(nextUrl)` pagination loop with no escape hatch. If the API stalls mid-pagination, the Worker hangs until Cloudflare kills it.

---

## High Priority Issues (Fix Before ~50 Schools)

### H1. Student List Recalculates Streaks in JS on Every Request

`src/routes/students.js:262-280`

Despite the cron job updating `current_streak` / `longest_streak` in the database, the GET `/api/students` endpoint **recalculates streaks from scratch in JavaScript** for every student on every request. This adds ~5ms × N students of pure CPU to every student list fetch. The DB columns already hold correct values — this is redundant.

### H2. No Pagination on Books API Default Response

`src/routes/books.js:101-109`

The default (no search, no page param) returns up to 5,000 books with `LIMIT 5000`. If a school has 8,000 books, they get a truncated dataset with no indication. The frontend has client-side pagination (slicing the array) but no server-side pagination for the default fetch.

### H3. Rate Limiting Writes to D1 on Every Auth Request

`src/middleware/tenant.js:292-340`

Every rate-limited request does an INSERT into the `rate_limits` table, plus a SELECT COUNT. Cleanup is probabilistic (1% random chance per request). Under a login spike (e.g., 200 teachers logging in at 8:55 AM), this adds 400+ D1 write operations. D1 is single-writer, so these queue behind each other.

### H4. Audit Log Grows Unbounded

`src/worker.js:384-388`

Audit entries are **anonymised** after 90 days but **never deleted**. At 50 schools × 100 users × 20 audited actions/day = 100K rows/day ≈ 36M rows/year. D1 has a 10GB limit. At ~200 bytes/row, this fills ~7GB/year, leaving little headroom.

### H5. O(n) Book Lookups in HomeReadingRegister

`src/components/sessions/HomeReadingRegister.js:369-387`

```javascript
const getStudentLastBook = useCallback((studentId) => {
  const student = students.find(s => s.id === studentId);
  if (student?.currentBookId) {
    const book = books.find(b => b.id === student.currentBookId); // O(n) in 5,000+ books
  }
}, [books, students]);
```

Called once per student in the table. With 200 students and 5,000 books = 1M iterations per render.

### H6. HomeReadingRegister: N×M Table Without Virtualization

`src/components/sessions/HomeReadingRegister.js:931-997`

The register renders a TableCell for every student × every date in range. With 200 students and a month view (31 days) = 6,200+ DOM nodes, plus the `dailyTotals` useMemo at line 336 that iterates the same N×M space. No react-window or virtualization.

### H7. Missing Composite Index on org_book_selections

Every book query JOINs `org_book_selections` on `(organization_id, book_id)`, but the only index is on `organization_id` alone. The JOIN-side `book_id` lookup is unindexed, causing a scan per book.

---

## Medium Priority Issues (Fix Before ~100 Schools)

### M1. Sequential User Class Assignment Sync in Wonde

`src/services/wondeSync.js:300-306` — Each teacher's class assignment is synced one-at-a-time with `await`. With 50 teachers, this adds ~2–5s to each org sync.

### M2. reading_sessions Has No organization_id Column

Org-scoped session queries (e.g., org-level stats in `src/routes/organization.js:97`) must JOIN through students to filter by org. A denormalised `organization_id` on reading_sessions with a composite index would eliminate this JOIN.

### M3. localStorage Cover Cache Too Small

`src/contexts/BookCoverContext.js:8` — MAX_CACHE_ENTRIES = 500. With 5,000 books, cache hit rate is ~10%. Covers are re-fetched on every page load for most books, hammering OpenLibrary.

### M4. Batch Metadata Operations Have Excessively Long Delays

`src/utils/openLibraryApi.js` (500ms), `src/utils/googleBooksApi.js` (300ms), `src/utils/hardcoverApi.js` (1000ms) — Inter-request delays in batch operations. 100 books at 500ms = 50 seconds, which exceeds the 30s Worker limit after ~60 books. These delays are well above what's needed for rate limit compliance.

### M5. Hardcover Rate Limit Uses Module-Level State

`src/utils/hardcoverApi.js:18-21` — `hardcoverRateLimited` is a module-scope boolean. If one request triggers a rate limit, ALL concurrent requests across all users are blocked for 60 seconds. Should be per-request or per-org context.

### M6. Stats Calculation Repeats Filtering

`src/components/stats/ReadingStats.js:178, 291-311` — Session date-range filtering is repeated multiple times (timeline chart, frequency chart, sorting comparator) without shared memoization. With 500 students × 50 sessions, this is 75K+ filter operations per render.

### M7. Missing Index on classes(organization_id, name)

`src/routes/classes.js:34-40` — Class list queries ORDER BY name but no composite index supports this sort within an org scope.

### M8. GDPR Hard-Delete Loop Is Sequential

`src/worker.js:407-469` — Deletes soft-deleted students and users one-at-a-time with individual `db.batch()` calls. If 500 students were deactivated after a school offboarding, this is 500 sequential batch operations within the already-tight cron budget.

---

## What's Already Good

- **Tenant isolation** is consistent — `WHERE organization_id = ?` on all routes
- **D1 batch chunking** respects the 100-statement limit correctly
- **Session/preference batch fetch** on student list avoids N+1 (well-chunked)
- **Book visibility model** (shared catalog + org_book_selections) is the right design
- **Soft delete + GDPR retention** is thorough
- **KV recommendation caching** prevents redundant AI calls
- **R2 cover caching** with OpenLibrary fallback is solid
- **Rate limit cleanup runs in the cron** (worker.js:390-394), not just probabilistically

---

## Summary Statistics

| Category | Critical | High | Medium |
|----------|----------|------|--------|
| Cron/Scheduled Tasks | 2 | 0 | 2 |
| API/Backend | 2 | 3 | 2 |
| Frontend | 1 | 2 | 2 |
| Database | 0 | 1 | 2 |
| External APIs | 0 | 0 | 2 |
| **Total** | **5** | **7** | **8** |

---

## Implementation Plan

### Phase 1: Critical Fixes — Crons and Timeouts (Do First)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 1 | C1: Streak cron timeout | `src/routes/students.js:1515-1557` | M | Replace nested sequential loops with batched SQL approach: fetch all students per org in one query, process in Promise.all with concurrency limit of 10, add 25s overall timeout with AbortController. Consider: single UPDATE query using SQL-computed streaks if feasible. |
| 2 | C2: Wonde sync timeout | `src/worker.js:471-490`, `src/services/wondeSync.js:300-306` | M | Process orgs in parallel with Promise.allSettled (concurrency 5). Add 20s timeout per org. Parallelize user class assignments within each org (Promise.all, concurrency 5). Log partial success. |
| 3 | C5: Missing timeouts | `src/services/aiService.js:99,126,190`, `src/utils/wondeApi.js:39`, `src/utils/openLibraryApi.js:96`, `src/utils/googleBooksApi.js:105`, `src/utils/hardcoverApi.js:48`, `src/routes/covers.js:66`, `src/utils/email.js:111,145` | M | Create shared `fetchWithTimeout(url, options, timeoutMs)` helper. Apply 10s timeout to AI calls, 5s to metadata APIs, 8s to Wonde pagination, 5s to covers, 5s to email. Use AbortController pattern. |
| 4 | C8: GDPR cron sequential | `src/worker.js:407-469` | S | Batch the hard-delete: collect all stale student IDs first, then delete in chunked db.batch() calls (100 per batch) instead of one-by-one. Same for users. |

### Phase 2: Data Loading and API Fixes (10→50 Schools)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 5 | C3: Frontend loads everything | `src/contexts/AppContext.js:673-681`, `src/routes/students.js:189-280` | L | Add server-side pagination: `GET /api/students?page=1&pageSize=100`. Return pre-calculated streak from DB columns instead of recalculating. Frontend: load first page on login, load rest on demand or via infinite scroll. |
| 6 | H1: JS streak recalculation | `src/routes/students.js:262-280` | S | Remove the `calculateStreak()` call in the GET handler. Return `current_streak`, `longest_streak`, `streak_start_date` directly from DB row (already populated by cron). Delete ~20 lines of per-request streak computation. |
| 7 | H2: Books 5000 cap | `src/routes/books.js:101-109` | M | Change default response to paginated (page=1, pageSize=50). Add total count in response. Frontend BookManager already has client pagination — wire it to server pagination. |
| 8 | C4: Import preview loads all books | `src/routes/books.js:1043-1094` | M | Replace `SELECT * FROM books` with targeted queries: ISBN lookup via `WHERE isbn IN (?)` (batch imported ISBNs), title/author fuzzy match via FTS5 `books_fts`. Move Levenshtein to a second pass on FTS candidates only. |
| 9 | H3: Rate limiting writes | `src/middleware/tenant.js:292-340` | M | Replace D1-based rate limiting with Cloudflare's built-in Rate Limiting Rules (WAF), or use KV with sliding window counters (1 read + conditional write vs current 1 read + 1 write every time). |

### Phase 3: Frontend Performance and Indexes (50→100 Schools)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 10 | H5: O(n) book lookups | `src/components/sessions/HomeReadingRegister.js:369-387` | S | Wrap books array in a `useMemo(() => new Map(books.map(b => [b.id, b])), [books])`. Replace `.find()` with `.get()`. |
| 11 | H6: N×M table no virtualization | `src/components/sessions/HomeReadingRegister.js:931-997` | M | Add react-window or @tanstack/react-virtual for row virtualization. Only render visible rows (~20) instead of all students. Keep date columns as-is (typically ≤31). |
| 12 | H7: Missing composite index | New migration file | S | `CREATE INDEX IF NOT EXISTS idx_org_book_selections_composite ON org_book_selections(organization_id, book_id);` |
| 13 | M7: Missing classes index | New migration file | S | `CREATE INDEX IF NOT EXISTS idx_classes_org_name ON classes(organization_id, name);` |
| 14 | H4: Audit log growth | `src/worker.js:384-388` | S | Add `DELETE FROM audit_log WHERE created_at < datetime('now', '-365 days')` to the existing cron cleanup block. One year retention is more than sufficient. |
| 15 | M6: Stats repeated filtering | `src/components/stats/ReadingStats.js:178,291-311` | S | Extract filtered sessions into a single useMemo, pass to all chart components. Avoid re-filtering per chart. |

### Phase 4: Hardening (100+ Schools)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 16 | M2: reading_sessions no org_id | New migration + `src/routes/students.js` | L | Add `organization_id` column to reading_sessions, backfill from students table, add composite index `(organization_id, session_date DESC)`. Update INSERT in session creation to include org_id. |
| 17 | M3: Cover cache too small | `src/contexts/BookCoverContext.js:8` | S | Increase MAX_CACHE_ENTRIES to 2000. Consider migrating to IndexedDB for larger capacity. |
| 18 | M4: Batch metadata delays | `src/utils/openLibraryApi.js`, `googleBooksApi.js`, `hardcoverApi.js` | S | Reduce delays: OpenLibrary 500ms→100ms, Google 300ms→50ms, Hardcover 1000ms→100ms. Add batch size limits to stay within Worker timeout. |
| 19 | M5: Hardcover module state | `src/utils/hardcoverApi.js:18-21` | S | Pass rate limit state through request context (c.set/c.get) instead of module-level variables. Or use KV with per-org rate limit keys. |
| 20 | M1: Sequential class assignments | `src/services/wondeSync.js:300-306` | S | Replace `for...await` with `Promise.allSettled()` batched at 5 concurrent. |

---

## Dependencies & Ordering Notes

- **Item 6 (remove JS streak calc) should be done WITH item 1** (fix cron) — the cron must be reliable before the endpoint can trust DB values.
- **Item 5 (pagination) is the largest single change** — touches AppContext, student route, and every component that reads from `students` state. Consider splitting: first add pagination to the API, then migrate frontend incrementally.
- **Items 12–13 (indexes) can be deployed independently** via migration — zero code changes, instant improvement.
- **Items 1–4 (Phase 1) are fully independent** and can be parallelised across developers/agents.

## Quick Wins (Small Effort + High Impact)

1. **Item 6** (S) — Remove JS streak recalculation from student list endpoint. ~20 lines deleted, immediate response time improvement.
2. **Item 10** (S) — Map lookup for books. 5-minute change, eliminates millions of iterations.
3. **Items 12–13** (S) — New migration with 2 CREATE INDEX statements. Deploy and forget.
4. **Item 14** (S) — Add one DELETE statement to existing cron. Prevents unbounded audit log growth.
5. **Item 17** (S) — Change one constant from 500 to 2000. Reduces cover API calls 4×.

## Scaling Breakpoint Estimates

| Schools | Students | Current Status | After Phase 1 | After Phase 2 |
|---------|----------|----------------|---------------|---------------|
| 5 | 2,500 | Works | Works | Works |
| 10 | 5,000 | Cron fails | Works | Works |
| 20 | 10,000 | Cron fails, login slow | Works | Works |
| 50 | 25,000 | Cron fails, login very slow, imports broken | Crons work | Works |
| 100 | 50,000 | Multiple failures | Crons work, login slow | Works |
