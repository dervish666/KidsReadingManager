# Implementation Plan — Codebase Audit 2026-03-03

## Progress: 34 of 44 items completed (2026-03-03)

## Overview
44 findings across 10 categories. Estimated effort: 8 S items, 20 M items, 16 L items. Total: ~40-60 hours of work across all phases.

---

## Phase 1: Critical & Security (Do First)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 1 | ~~Student names sent to AI providers (C-1)~~ | `src/utils/studentProfile.js:131`, `src/components/DpaConsentModal.js:115` | S | DONE: Removed `name` from studentProfile, books.js response payloads (3 places), and DPA consent text. |
| 2 | CI never runs tests (C-2) | `.github/workflows/build.yml:30` | S | Add `- name: Test\n  run: npm test` after line 30 in the workflow file. |
| 3 | ~~Missing role guards on student write endpoints (S-1)~~ | `src/routes/students.js:620,899,958` | M | DONE: Added requireTeacher() to PUT current-book, DELETE/PUT sessions, POST sessions. Added requireReadonly() to GET list, GET by id, GET streak. |
| 4 | ~~Owner user listing returns deleted users (B-3)~~ | `src/routes/users.js:32-38` | S | DONE: Added WHERE u.is_active = 1. |
| 5 | ~~Template literal SQL injection in rate limiter (S-8)~~ | `src/middleware/tenant.js:325` | S | DONE: Parameterized with `? || ' seconds'` binding. |
| 6 | ~~Tenant middleware fails open on DB error (S-5)~~ | `src/middleware/tenant.js:126-129` | S | DONE: Returns 503 instead of continuing. |
| 7 | ~~Falsy-zero bug on pagesRead/duration (B-1, B-2)~~ | `src/routes/students.js:825-826,995-996` | S | DONE: Replaced || with ?? for all numeric fields in students.js and books.js (pageCount, seriesNumber, publicationYear in 3 locations + rowMappers). |
| 8 | ~~rowToBook JSON.parse crash on corrupted data (B-4)~~ | `src/utils/rowMappers.js:18` | S | DONE: Wrapped in try/catch, returns [] on parse failure. |
| 9 | ~~Webhook schoolApproved duplicate org check (B-5)~~ | `src/routes/webhooks.js` | M | DONE: Added SELECT check before INSERT. Reactivates existing inactive orgs, updates token on re-approval. |
| 10 | ~~SEN/pupil premium data stored without purpose (PR-1)~~ | `src/services/wondeSync.js:38,220-221,236` | M | DONE: Option (a) — removed SEN/PP/EAL/FSM from mapWondeStudent, UPDATE/INSERT SQL, and Wonde API include params. Existing data remains in DB but won't be populated for new/updated students. |

---

## Phase 2: High Priority Bugs & Data Integrity

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 11 | ~~DPA consent modal cannot be dismissed (PR-3)~~ | `src/components/DpaConsentModal.js:86-87` | S | DONE: Added "Decline and Log Out" button. Updated AI data description in key points. |
| 12 | No storage consent / cookie banner (PR-2) | `src/contexts/AppContext.js`, new component | L | Add a storage/cookie disclosure component. Auth tokens are "strictly necessary" under PECR but cover cache is not. At minimum, add disclosure to the privacy policy. For full compliance, add a consent banner for non-essential localStorage usage. |
| 13 | ~~Color-only status indicators (A-1)~~ | `src/components/students/StudentCard.js:182-188`, `StudentTable.js:266`, `QuickEntry.js:187`, `PrioritizedStudentsList.js:122` | M | DONE: Added role="img" + aria-label to StudentCard dot, aria-label with status to StudentTable rows and QuickEntry cards. |
| 14 | ~~Missing skip navigation link (A-2)~~ | `src/App.js` | S | DONE: Added skip link with visually-hidden styles and focus reveal. |
| 15 | ~~IconButtons missing aria-label (A-3)~~ | `ReadingPreferences.js:189`, `QuickEntry.js:166-173`, `SessionNotes.js:67,77`, `PrioritizedStudentsList.js:239,242`, `StudentCard.js:166` | M | DONE: Added aria-labels to all IconButtons across 5 components. |
| 16 | ~~Quick Entry save not awaited (U-1)~~ | `src/components/sessions/QuickEntry.js:88-107` | M | DONE: Made handleSave async, awaited addReadingSession, added try/catch with error Snackbar. Only advances on success. |
| 17 | ~~Gemini API key in URL query parameter (S-2)~~ | `src/services/aiService.js:186` | S | DONE: Added documentation comment noting Gemini API constraint and mitigation advice. |
| 18 | ~~Public paths arrays diverging (Q-3)~~ | `src/worker.js:171-185`, `src/middleware/tenant.js:23-36` | M | DONE: Extracted PUBLIC_PATHS to src/utils/constants.js, imported in both worker.js and tenant.js. Also unified the divergent /api/logout entry. |
| 19 | Duplicate AI config endpoints (Q-2) | `src/routes/settings.js:242-417`, `src/routes/organization.js:238-372` | L | Consolidate AI config CRUD into one location (prefer `organization.js` since it's org-scoped). Have `settings.js` delegate or remove its duplicate endpoints. Update frontend to use a single endpoint set. |

---

## Phase 3: Performance & Scalability

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 20 | All books loaded into frontend on login (P-1) | `src/contexts/AppContext.js:658-665` | L | Implement server-side book search via `GET /api/books?q=...&limit=50`. Remove bulk book loading from `reloadDataFromServer()`. Update `BookAutocomplete` to use server-side search with debounce. Keep a small recently-used cache client-side. |
| 21 | No timeouts on external fetch calls (P-3) | `src/routes/covers.js`, `src/routes/mylogin.js`, `src/utils/openLibraryApi.js`, `src/utils/googleBooksApi.js`, `src/utils/hardcoverApi.js`, `src/utils/wondeApi.js`, `src/services/aiService.js`, `src/hooks/useBookCover.js` | M | Add `AbortController` with `signal` and `setTimeout` to every external `fetch()` call. Use 5s for metadata APIs, 10s for AI providers, 30s for Wonde sync. Create a shared `fetchWithTimeout(url, options, timeoutMs)` utility. |
| 22 | Monolithic AppContext causes re-renders (P-2) | `src/contexts/AppContext.js` | L | Split into focused contexts: `AuthContext`, `StudentsContext`, `BooksContext`, `ClassesContext`, `SettingsContext`. Each context only re-renders its consumers. Alternatively, use `useSyncExternalStore` or a state library with selectors. |
| 23 | BookAutocomplete filters entire array on keystroke (P-4) | `src/components/sessions/BookAutocomplete.js` | M | After P-1 is done, this becomes a server-side search with debounce (300ms). If P-1 is deferred, add `useMemo` + debounced input with `startTransition`. |
| 24 | ~~Missing database indexes (P-5)~~ | `migrations/` (new migration) | M | DONE: Created migrations/0028_additional_indexes.sql with idx_students_class_id, idx_reading_sessions_student_date, idx_reading_sessions_org_date. |
| 25 | ~~Sequential awaits in Wonde sync (P-6)~~ | `src/services/wondeSync.js` | M | DONE: Parallelized fetchAllStudents, fetchAllEmployees, and fetchDeletions with Promise.all (all run after classes are fetched/processed). |
| 26 | ~~Book cover cache grows unbounded (P-8)~~ | `src/contexts/BookCoverContext.js` | S | DONE: Added MAX_CACHE_ENTRIES = 500 with LRU-style eviction by fetchedAt timestamp. |

---

## Phase 4: Code Quality & Tech Debt

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 27 | No ESLint configuration (Q-1) | Project root | M | Add `.eslintrc.json` with `eslint:recommended` + `plugin:react/recommended` + `plugin:react-hooks/recommended`. Run `npx eslint src/ --fix` to auto-fix. Add `"lint": "eslint src/"` to package.json scripts. Add lint step to CI. |
| 28 | ~~CORS missing X-Organization-Id header (S-3)~~ | `src/worker.js:85` | S | DONE: Added to allowHeaders. |
| 29 | ~~Rate limiting fails open on DB error (S-4)~~ | `src/middleware/tenant.js:304-308,351-355` | M | DONE: Changed console.error to console.warn for rate limiting bypass. WAF rules are an infrastructure-level change (not code). |
| 30 | ~~Env var validation at startup (E-1)~~ | `src/worker.js` | M | DONE: Added middleware that returns 500 on missing auth config or incomplete MyLogin config. |
| 31 | ~~Console.log debugging leftovers (Q-4)~~ | Multiple source files | M | DONE: Cleaned up debug console.logs in email.js, googleBooksApi.js, openLibraryApi.js, hardcoverApi.js. Converted "not provided" messages to console.warn. Kept intentional operational logs ([Cron], [Webhook]). |
| 32 | Magic numbers hardcoded (Q-5) | Multiple files | M | Extract rate limit values, TTLs, cache sizes, and thresholds into named constants in `src/utils/constants.js`. Examples: `RATE_LIMIT_AUTH_MAX = 5`, `RATE_LIMIT_AUTH_WINDOW_MS = 900000`, `JWT_ACCESS_TOKEN_EXPIRY = '15m'`, `BOOK_COVER_CACHE_TTL_DAYS = 7`. |
| 33 | ~~Owner org-switch JWT trust window (S-6)~~ | `src/middleware/tenant.js:99-104` | M | DONE: Added DB lookup to verify user still has owner role before allowing org override via X-Organization-Id. |
| 34 | ~~Modulo bias in temp password generation (S-7)~~ | `src/utils/crypto.js:569` | S | DONE: Implemented rejection sampling. |

---

## Phase 5: Nice-to-Haves & Hardening

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 35 | ~~Missing landmark roles (A-4)~~ | `src/App.js`, `src/components/Header.js` | S | DONE: Added component="header" to AppBar, component="nav" with aria-label to BottomNavigation Paper. |
| 36 | ~~Error messages not announced (A-5)~~ | `src/components/Login.js` | S | DONE: Changed error Typography to Alert severity="error" with role="alert". |
| 37 | Charts lack SR alternatives (A-6) | `src/components/stats/*.js` | M | Add `role="img"` with `aria-label` containing summary data to chart containers. |
| 38 | ~~Clickable Box without keyboard (A-7)~~ | `src/components/sessions/SessionNotes.js:96-112` | S | DONE: Added role="button", tabIndex={0}, onKeyDown for Enter/Space, aria-label. |
| 39 | ~~TableRow not keyboard accessible (A-8)~~ | `src/components/students/StudentTable.js:251-253` | S | DONE: Added tabIndex={0}, aria-label with student name+status, onKeyDown for Enter/Space. |
| 40 | ~~Incomplete logout clearing (PR-5)~~ | `src/contexts/AppContext.js:299-300` | S | DONE: Added bookCovers and sessionStorage.clear() to logout. |
| 41 | Data retention not disclosed (PR-4) | Application docs/privacy policy | M | Document retention periods: 90-day audit log anonymisation, 30-day login cleanup, 90-day hard purge of soft-deleted records. Add to privacy policy. |
| 42 | Missing LICENSE file (L-1) | Project root | S | Create a `LICENSE` file with the CC BY-NC 4.0 text. Consider switching to a proper software license (AGPL-3.0 or BSL-1.1). |
| 43 | ~~Audit log JSON.parse unguarded (B-7)~~ | `src/routes/organization.js:408` | S | DONE: Wrapped in try/catch. |
| 44 | ~~Deprecated onKeyPress (A-9)~~ | `ReadingPreferences.js:329`, `StudentProfile.js:517` | S | DONE: Replaced onKeyPress with onKeyDown in both files. |

---

## Dependencies & Ordering Notes

- **P-1 (book loading) must come before P-4 (BookAutocomplete)** — server-side search replaces client-side filtering.
- **Q-3 (public paths) should come before any new public endpoint additions** — prevents further divergence.
- **C-1 (student names) and PR-1 (SEN data) can be done in parallel** — both are data minimisation fixes.
- **S-1 (role guards) is independent** — can be done immediately with no dependencies.
- **Q-1 (ESLint) should be done before Q-4 (console.log cleanup)** — ESLint can auto-detect many leftovers.
- **P-2 (AppContext split) is a large refactor** — schedule after P-1, test thoroughly. Consider doing incrementally (extract AuthContext first, then others).

## Quick Wins
Items that are S effort and High/Critical — do these first within each phase:

1. **C-1:** Remove `student.name` from AI profile (`src/utils/studentProfile.js:131`) — 1 line change
2. **C-2:** Add `npm test` to CI (`.github/workflows/build.yml`) — 2 lines
3. **B-3:** Add `WHERE is_active = 1` to owner user query (`src/routes/users.js:37`) — 1 line
4. **S-5:** Change tenant middleware catch to return 503 (`src/middleware/tenant.js:127-128`) — 1 line
5. **B-1/B-2:** Replace `||` with `??` for pagesRead/duration (`src/routes/students.js:825-826,995-996`) — 4 lines
6. **B-4:** Wrap JSON.parse in try/catch (`src/utils/rowMappers.js:18`) — 3 lines
7. **S-8:** Fix template literal in rate limiter SQL (`src/middleware/tenant.js:325`) — 1 line
8. **PR-3:** Add "Decline and Log Out" to DPA modal (`src/components/DpaConsentModal.js`) — ~10 lines
9. **A-2:** Add skip navigation link (`src/App.js`) — 5 lines
10. **S-3:** Add `X-Organization-Id` to CORS headers (`src/worker.js:85`) — 1 line
