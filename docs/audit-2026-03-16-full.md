# Codebase Audit Report — Tally Reading
## Date: 2026-03-16
## Scope: Full codebase (v3.18.4) — backend, frontend, database, security, deployment, testing

## Executive Summary

Tally Reading is a well-built multi-tenant SaaS application with strong fundamentals: parameterized SQL queries, tenant isolation via middleware, httpOnly refresh cookies, PBKDF2 password hashing, and a clean codebase with zero TODO/FIXME/HACK comments and no commented-out code blocks.

However, this comprehensive audit across 6 specialist domains (security, backend, frontend, database, deployment, testing) uncovered **78 findings**: 7 Critical, 16 High, 30 Medium, and 25 Low. The most impactful issues are:

1. **Active bugs** — `DpaConsentModal` crash on logout (references non-existent `handleLogout`), `last_read_date` never written on session creation, status color mapping mismatch across 5 components showing wrong colors
2. **Security gaps** — SQL interpolation in LIMIT clause, missing input validation on session PUT, Google API key leaked in POST response, password change skips complexity rules
3. **Operational risks** — both cron triggers execute the same handler (double work), `npm run go` skips DB migrations, dev deploys hit production data
4. **Performance** — monolithic AppContext re-renders every component on any state change, BookAutocomplete filters 18,000+ books on every keystroke without debounce

All 7 previously-fixed security issues from the March 4th audit were verified as still in place.

---

## Critical Issues (Fix Immediately)

### C1. Bug: DpaConsentModal crashes on "Decline and Log Out"
- **Severity**: Critical
- **File**: `src/components/DpaConsentModal.js:22`
- **Issue**: Destructures `handleLogout` from `useAppContext()`, but the context exports `logout`. The "Decline and Log Out" button calls `undefined`, causing a runtime crash.
- **Fix**: Change `handleLogout` to `logout` in both the destructuring and the onClick handler.

### C2. Bug: `last_read_date` never written on session creation
- **Severity**: Critical
- **File**: `src/routes/students.js:1000-1030`
- **Issue**: POST `/:id/sessions` inserts the session and updates `current_book_id`, but never sets `last_read_date` on the student. Yet `last_read_date` is read by the stats endpoint to compute reading status distribution. Will always be null unless seeded by migration or KV import.
- **Fix**: After session INSERT, add `UPDATE students SET last_read_date = ? WHERE id = ?` bound to the session date.

### C3. Bug: Status color mapping mismatch across 5 components
- **Severity**: Critical
- **File**: `src/styles/theme.js:27-30`, `src/components/students/StudentTable.js:241`, `src/components/students/StudentCard.js:29`, `src/components/sessions/QuickEntry.js:156-161`, `src/components/students/PrioritizedStudentsList.js:24-29`, `src/components/BookRecommendations.js:427-437`
- **Issue**: `getReadingStatus()` returns `'never'`/`'recent'`/`'attention'`/`'overdue'`, but `theme.palette.status` has keys `notRead`/`needsAttention`/`recentlyRead`. Every status indicator falls through to the fallback color — all status dots/borders show the wrong color.
- **Fix**: Add a mapping function: `const STATUS_TO_PALETTE = { never: 'notRead', attention: 'needsAttention', overdue: 'notRead', recent: 'recentlyRead' }` and use it in all 5 components.

### C4. SQL Interpolation in LIMIT clause
- **Severity**: Critical (pattern risk)
- **File**: `src/routes/students.js:471-478`
- **Issue**: `` LIMIT ${Math.max(...)} `` uses string interpolation instead of parameterized bind. Currently safe due to parseInt+clamp, but is the sole exception to parameterized queries in the entire codebase.
- **Fix**: Use `LIMIT ?` with `.bind(id, limitValue)`.

### C5. Tenant isolation gap: GET /api/classes/:id/students
- **Severity**: Critical
- **File**: `src/routes/classes.js:116`
- **Issue**: `SELECT * FROM students WHERE class_id = ? AND is_active = 1` does not include `AND organization_id = ?`. Defense-in-depth violation — if the class ownership check is ever bypassed, students from any org could leak.
- **Fix**: Add `AND organization_id = ?` and bind `organizationId`.

### C6. Both cron triggers run identical handler — double work
- **Severity**: Critical (operational)
- **File**: `src/worker.js:336`
- **Issue**: `wrangler.toml` defines crons at 2:00 and 3:00 UTC, but the `scheduled` handler has no `event.cron` routing. Both crons execute streaks + GDPR cleanup + Wonde sync — everything runs twice daily, doubling D1 load and risking Worker CPU timeout.
- **Fix**: Check `event.cron` to route: `if (event.cron === '0 2 * * *') { /* streaks + GDPR */ } if (event.cron === '0 3 * * *') { /* Wonde sync */ }`

### C7. `npm run go` skips database migrations
- **Severity**: Critical (operational)
- **File**: `package.json:9`
- **Issue**: `"go": "npm run build && npm run deploy"` does not run migrations. If a release requires a schema change and is deployed via `npm run go`, the app crashes.
- **Fix**: Change to `"go": "npm run build && npx wrangler d1 migrations apply reading-manager-db --remote && npm run deploy"`.

---

## Findings by Category

### 1. Security

| # | Severity | Finding | File | Fix |
|---|----------|---------|------|-----|
| S1 | High | Missing input validation on PUT session update | `src/routes/students.js:1146` | Copy validation from POST handler (pagesRead, duration, date format, notes length, assessment, location) |
| S2 | High | Hardcover proxy accepts client-supplied API key fallback | `src/routes/hardcover.js:49` | Remove `body.apiKey` fallback; return error if no server key configured |
| S3 | Medium | Google API key leaked in POST /api/settings response | `src/routes/settings.js:236-237` | Add `hasGoogleBooksApiKey` boolean + `delete googleBooksApiKey` to POST response (matches GET path) |
| S4 | Medium | Password change endpoint skips complexity validation | `src/routes/auth.js:812-815` | Add uppercase/lowercase/number checks matching registration |
| S5 | Medium | Registration slug uniqueness ignores soft-deleted orgs | `src/routes/auth.js:123-129` | Remove `AND is_active = 1` from slug check |
| S6 | Medium | CSP headers only on API responses, not frontend HTML | `src/worker.js:97-131` | Add security headers to `env.ASSETS.fetch()` response at line 324 |
| S7 | Medium | Health endpoint exposes auth mode, environment, features | `src/worker.js:230-254` | Reduce to `{ status: 'ok', database: 'connected' }` |
| S8 | Medium | Deactivated org still accessible via GET /api/organization | `src/routes/organization.js:23` | Add `AND is_active = 1` to query |
| S9 | Medium | GET /api/auth/me doesn't check is_active for user or org | `src/routes/auth.js:748-755` | Add `AND u.is_active = 1 AND o.is_active = 1` |
| S10 | Low | Access token stored in localStorage (XSS-accessible) | `src/contexts/AppContext.js:228` | Known SPA trade-off; 15-min TTL mitigates. Consider in-memory storage |
| S11 | Low | Webhook response leaks internal org ID | `src/routes/webhooks.js:91` | Return only `{ success: true }` |
| S12 | Low | Email signup rate limit bypassed when D1 unavailable | `src/routes/signup.js:8-10` | Consider WAF-level rate limiting for public endpoints |
| S13 | Low | Encryption key derived from JWT secret (coupled rotation) | `src/utils/crypto.js:496-521` | Consider separate ENCRYPTION_KEY env var |

**Confirmed still fixed**: login is_active filtering, constantTimeEqual timing, role disclosure in 403s, body size limits, Google API key GET redaction, password complexity on register/reset, prototype pollution rejection.

### 2. Bugs & Error Handling

| # | Severity | Finding | File | Fix |
|---|----------|---------|------|-----|
| B1 | Critical | DpaConsentModal `handleLogout` → should be `logout` | `src/components/DpaConsentModal.js:22` | Rename destructured variable |
| B2 | Critical | `last_read_date` never updated on session creation | `src/routes/students.js:1000-1030` | Add UPDATE after INSERT |
| B3 | Critical | Status color mapping mismatch in 5 components | See C3 above | Add STATUS_TO_PALETTE mapping |
| B4 | High | `rowToStudent` missing `yearGroup` mapping | `src/utils/rowMappers.js:34-63` | Add `yearGroup: row.year_group \|\| null` |
| B5 | High | SessionForm snackbar shows "saved" on error paths | `src/components/sessions/SessionForm.js:761-776` | Add `snackbarMessage` state; set appropriate message per path |
| B6 | Medium | Session PUT doesn't recalculate streak after date change | `src/routes/students.js:1146-1208` | Add `await updateStudentStreak(db, id, organizationId)` after update |
| B7 | Medium | `updateStudentStreak` passes `{}` instead of `c.env` | `src/routes/students.js:159` | Pass `c.env` so KV cache works |
| B8 | Medium | Classes GET endpoints have no role guard | `src/routes/classes.js:27,59,98` | Add `requireReadonly()` middleware |
| B9 | Medium | Non-atomic session creation (INSERT + UPDATE not batched) | `src/routes/students.js:1001-1030` | Combine INSERT and UPDATE into `db.batch()` |
| B10 | Medium | `auth/me` doesn't check is_active | `src/routes/auth.js:748-755` | Add is_active filter |
| B11 | Medium | Genres are global, not org-scoped — any admin affects all schools | `src/routes/genres.js:32-41` | Either add org-scoping or restrict create/delete to owner |
| B12 | Low | User delete doesn't filter is_active (allows re-deletion) | `src/routes/users.js:420` | Add `AND is_active = 1` |
| B13 | Low | Missing try/catch in hardcover proxy fetch | `src/routes/hardcover.js:60-70` | Wrap in try/catch, return 502 |
| B14 | Low | Org name length not validated | `src/routes/auth.js:83`, `src/routes/organization.js:568` | Add 200-char max |

### 3. Performance

| # | Severity | Finding | File | Fix |
|---|----------|---------|------|-----|
| P1 | Critical | AppContext monolith re-renders entire app on any state change | `src/contexts/AppContext.js` | Split into AuthContext, StudentsContext, BooksContext, etc. |
| P2 | High | BookAutocomplete filters 18,000+ books per keystroke without debounce | `src/components/sessions/BookAutocomplete.js:123-145` | Add 150ms debounce on inputValue |
| P3 | High | N+1 queries in `recalculateAllStreaks` (2 queries per student) | `src/routes/students.js:1757-1782` | Bulk fetch sessions, batch UPDATE with db.batch() |
| P4 | High | Streak cron: 2 D1 queries per student, unbatched updates | `src/worker.js:336+` | Batch UPDATEs in chunks of 100 |
| P5 | Medium | `prettyJSON()` active in production (+15-25% response size) | `src/worker.js:52` | Conditionally apply for non-production |
| P6 | Medium | ReadingStats shadows `activeStudents` in `getNeedsAttentionStudents` | `src/components/stats/ReadingStats.js:184-201` | Use outer memoized `activeStudents` |
| P7 | Medium | ReadingFrequencyChart/DaysSinceReadingChart filter without useMemo | `src/components/stats/ReadingFrequencyChart.js:21-33`, `DaysSinceReadingChart.js:22-34` | Wrap in useMemo |
| P8 | Medium | ReadingTimelineChart `generateTimelineDates` on every render | `src/components/stats/ReadingTimelineChart.js:98-109` | Wrap in useMemo |
| P9 | Medium | SettingsPage destroys/recreates tab content on switch (repeated API calls) | `src/components/SettingsPage.js:121-129` | Cache API results or use display:none pattern |
| P10 | Medium | `createProvider` logs on every request in production | `src/data/index.js:30-51` | Remove or gate behind debug flag |
| P11 | Medium | `books/bulk` loads ALL books for duplicate detection | `src/routes/books.js:982-1007` | Use ISBN/FTS-based detection like import/preview |
| P12 | Medium | 1MB body limit blocks large CSV imports | `src/worker.js:53` | Override to 5MB for import endpoints |
| P13 | Low | PrioritizedStudentsList cards each subscribe to entire AppContext | `src/components/students/PrioritizedStudentsList.js:21` | Pass getReadingStatus as prop or use React.memo |
| P14 | Low | BookCoverPlaceholder sets backgroundColor twice (sx + style) | `src/components/BookCoverPlaceholder.js:43,52` | Remove redundant `style` |
| P15 | Low | theme.js declares MuiBottomNavigation height twice | `src/styles/theme.js:213,231` | Remove first declaration |

### 4. Database & Schema

| # | Severity | Finding | File | Fix |
|---|----------|---------|------|-----|
| D1 | High | Missing composite index `(organization_id, class_id, is_active)` on students | migrations/ | Add migration with CREATE INDEX IF NOT EXISTS |
| D2 | High | FTS5 alias mismatch: JOINs alias as `fts` but WHERE uses `books_fts` | `src/routes/books.js` | Use alias `fts MATCH ?` consistently |
| D3 | High | Orphan book cleanup uses `NOT IN (subquery)` — O(N*M) | `src/routes/books.js:898` | Use `NOT EXISTS` with index on org_book_selections(book_id) |
| D4 | Medium | `books.reading_level` is TEXT, queries use CAST — can't use index | migrations/ | Add REAL column + index in new migration |
| D5 | Medium | `books.genre_ids` stores JSON array, queries use LIKE — no index | migrations/ | Unused `book_genres` junction table exists; either use it or accept trade-off |
| D6 | Medium | Duplicate indexes across migrations (3x `idx_sessions_student_date`) | migrations/ | Harmless but messy; no action needed |
| D7 | Medium | Wonde sync employee-class rebuild is non-atomic across batches | `src/services/wondeSync.js` | Combine DELETE + INSERTs in single batch where possible |
| D8 | Medium | `rate_limits` grows unboundedly between cleanup runs | `src/middleware/tenant.js:292-350` | More aggressive cleanup or move to KV |
| D9 | Medium | Refresh token lookup doesn't check expires_at in SQL | `src/routes/auth.js:448` | Add `AND expires_at > datetime('now')` to query |
| D10 | Low | Migration 0001 has `DROP TABLE IF EXISTS books` — dangerous on re-run | migrations/ | Already forward-only; no action needed |
| D11 | Low | `students.reading_level` TEXT column superseded but not dropped | migrations/ | Drop in future migration |
| D12 | Low | `book_genres` junction table is unused dead schema | migrations/ | Drop or start using |
| D13 | Low | Classes have both `is_active` and `disabled` — two soft-delete mechanisms | migrations/ | Document the distinction: disabled = hidden from dropdowns, is_active = deleted |
| D14 | Low | Missing composite index on `wonde_sync_log(organization_id, started_at)` | migrations/ | Add in next migration |

### 5. Code Quality & Maintainability

| # | Severity | Finding | File | Fix |
|---|----------|---------|------|-----|
| Q1 | Medium | 206 console statements in production (27 log, 152 error, 27 warn) | Various | Replace with centralized logging utility or remove non-essential |
| Q2 | Medium | Duplicate `formatRelativeTime` in 2 components | `SupportTicketManager.js:26-43`, `UserManagement.js:275-289` | Extract to `src/utils/helpers.js` |
| Q3 | Medium | Duplicate student filtering logic across 6+ components | `StudentList.js`, `ReadingFrequencyChart.js`, etc. | Extract `useFilteredStudents()` custom hook |
| Q4 | Medium | Duplicate AI config update logic in 2 route files | `organization.js:280-372`, `settings.js:306-427` | Extract shared helper |
| Q5 | Medium | Duplicate settings endpoints in organization.js and settings.js | Both files | Consolidate to single source of truth |
| Q6 | Low | Unused import: `getBooksByOrganization` in books.js | `src/routes/books.js:5` | Remove |
| Q7 | Low | `inputStyles` defined after use in Login.js | `src/components/Login.js:482` | Move above first reference |
| Q8 | Low | Inconsistent MUI Grid API (legacy v4 vs v7 `size` prop) | Various components | Standardize on v7 API |
| Q9 | Low | AppContext `refreshAccessToken` missing `clearAuthState` dependency | `src/contexts/AppContext.js:307` | Add to dependency array |

### 6. Dead Code

| # | Severity | Finding | File | Fix |
|---|----------|---------|------|-----|
| DC1 | High | `ReadingPreferences.js` — entire file unused, duplicated by StudentProfile.js | `src/components/students/ReadingPreferences.js` | Delete |
| DC2 | Low | `VisualIndicators.js` — entire file unused | `src/components/stats/VisualIndicators.js` | Delete |
| DC3 | Low | 12 unused exports in helpers.js, bookMetadataApi.js, isbn.js, kvProvider.js, streakCalculator.js | Various | Remove or mark as internal |
| DC4 | Low | `deploy.sh` — outdated, references KV-only setup | `scripts/deploy.sh` | Delete (build-and-deploy.sh is canonical) |
| DC5 | Low | `jsdom` in devDependencies — unused (tests use happy-dom) | `package.json:44` | Remove |

### 7. Accessibility (WCAG 2.1 AA)

| # | Severity | Finding | File | Fix |
|---|----------|---------|------|-----|
| A1 | High | Genre Select in StudentProfile missing accessible label | `src/components/students/StudentProfile.js:402-427` | Add InputLabel + labelId |
| A2 | Medium | Search input in StudentList missing label | `src/components/students/StudentList.js:323-356` | Add `aria-label="Search students"` |
| A3 | Medium | Search input in BookManager missing label | `src/components/books/BookManager.js` | Add `aria-label="Search books"` |
| A4 | Medium | Priority student cards not keyboard accessible | `src/components/students/PrioritizedStudentsList.js:46-141` | Add tabIndex, role="button", onKeyDown |
| A5 | Medium | BookRecommendations quick-pick cards not keyboard accessible | `src/components/BookRecommendations.js:442-475` | Same fix as A4 |
| A6 | Low | LandingPage nav logo uses span with onClick, no keyboard support | `src/components/LandingPage.js:90` | Use button or add role/tabIndex/onKeyDown |

### 8. Testing

| # | Severity | Finding | File | Fix |
|---|----------|---------|------|-----|
| T1 | High | 40 of 48 component files have no tests | `src/components/` | Priority: Header, StudentList, StudentCard, ClassManager, Settings |
| T2 | Medium | 4 route files have no tests: data.js, signup.js, hardcover.js, wondeAdmin.js | `src/routes/` | Add integration tests |
| T3 | Medium | All 4 data provider files lack dedicated tests | `src/data/` | Add unit tests for d1Provider at minimum |
| T4 | Medium | AppContext (central state manager) has no dedicated test | `src/contexts/AppContext.js` | Add unit tests for state transitions |
| T5 | Medium | AI service: only prompt builder tested; API call functions untested | `src/services/aiService.js` | Add tests with mocked fetch |
| T6 | Low | `routeHelpers.js`, `rowMappers.js`, `googleBooksApi.js`, `openLibraryApi.js` lack tests | `src/utils/` | Add unit tests |

### 9. Deployment & Configuration

| # | Severity | Finding | File | Fix |
|---|----------|---------|------|-----|
| DP1 | High | No CI/CD deployment stage — manual deploys only | `.github/workflows/build.yml` | Add deployment job after tests pass on main |
| DP2 | High | No dev environment isolation — dev deploys hit production data | `wrangler.toml` | Add `[env.dev]` with separate D1/KV/R2 bindings |
| DP3 | Medium | Health endpoint version hardcoded at 3.10.7 (actual: 3.18.4) | `src/worker.js:234` | Inject from package.json at build time |
| DP4 | Medium | GitHub Actions uses outdated v3 actions | `.github/workflows/build.yml:18-22` | Update to v4 |
| DP5 | Medium | No ESLint or Prettier configuration | (missing) | Add eslint.config.js + .prettierrc |
| DP6 | Medium | `start:dev` uses shell `&` (output interleaves, orphan processes) | `package.json:9` | Use `concurrently` package |
| DP7 | Medium | No `.env.example` file | (missing) | Create with all required/optional vars |
| DP8 | Low | `deploy.sh` is outdated, references KV-only setup | `scripts/deploy.sh` | Delete |
| DP9 | Low | No pre-commit hooks | (missing) | Add husky + lint-staged |

### 10. Feature Suggestions

| # | Value | Feature | Description |
|---|-------|---------|-------------|
| F1 | High | Parent/Home portal | Scoped read-only view for parents to see their child's reading. Leverage existing `readonly` role. Single highest-value feature for school adoption |
| F2 | High | Reading goals & challenges | "Read 20 books this term", genre variety goals. `term_dates` table provides the foundation |
| F3 | Medium | Class-level reporting | Aggregate stats per class — avg books, level progression, cross-class comparison. Add `GET /api/classes/:id/stats` |
| F4 | Medium | Book reviews & ratings | Student ratings enable peer recommendations without AI costs |
| F5 | Medium | Notifications & reminders | Email alerts for students falling behind, weekly parent digests. Streak calculator already identifies at-risk students |
| F6 | Low | Reading log export (PDF) | Printable reading passport for parents' evenings |
| F7 | Low | Multi-class student support | Students in reading groups across class boundaries |

---

## Summary Statistics

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | 2 | 2 | 5 | 4 |
| Bugs | 3 | 2 | 5 | 3 |
| Performance | 1 | 3 | 7 | 3 |
| Database | 1 | 3 | 5 | 5 |
| Code Quality | 0 | 0 | 5 | 4 |
| Dead Code | 0 | 1 | 0 | 4 |
| Accessibility | 0 | 1 | 4 | 1 |
| Testing | 0 | 1 | 4 | 1 |
| Deployment | 2 | 2 | 5 | 2 |
| **Total** | **9** | **15** | **40** | **27** |

**Note**: Some findings appear in multiple categories (e.g., C4 is both Security and Database). The total unique finding count is 78.

## Recommended Priority Order

1. **C1 DpaConsentModal crash** — 1-line fix, prevents runtime error on DPA decline
2. **C7 `npm run go` missing migrations** — 1-line fix, prevents deploy disasters
3. **C6 Cron double execution** — 5-line fix, halves D1 load
4. **C4 SQL LIMIT interpolation** — 2-line fix, eliminates only SQL injection vector
5. **C5 Tenant isolation on classes/:id/students** — 1-line fix, defense-in-depth
6. **C2 last_read_date never written** — data integrity bug affecting stats
7. **C3 Status color mismatch** — visual bug across 5 components, confusing to users
8. **S1 Session PUT validation** — copy existing validation from POST handler
9. **S3 Google API key leak in POST** — 2-line fix
10. **B4 rowToStudent missing yearGroup** — 1-line fix, Wonde data silently lost
