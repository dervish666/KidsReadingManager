# Implementation Plan — Codebase Audit 2026-03-16

## Overview
78 findings across security, bugs, performance, database, code quality, accessibility, testing, and deployment. Estimated effort: ~8 S items, ~20 M items, ~8 L items. Quick wins alone (Phase 1) fix 12 issues in under 2 hours.

## Phase 1: Critical & Security (Do First)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 1 | C1: DpaConsentModal crash | `src/components/DpaConsentModal.js:22,148` | S | Change `handleLogout` to `logout` in destructuring and onClick handler |
| 2 | C7: npm run go skips migrations | `package.json:9` | S | Change `"go"` to `"npm run build && npx wrangler d1 migrations apply reading-manager-db --remote && npm run deploy"` |
| 3 | C6: Cron double execution | `src/worker.js:336` | S | Add `if (event.cron === '0 2 * * *')` / `if (event.cron === '0 3 * * *')` routing in scheduled handler |
| 4 | C4: SQL LIMIT interpolation | `src/routes/students.js:471-478` | S | Replace `` LIMIT ${...} `` with `LIMIT ?` and add to `.bind()` |
| 5 | C5: Tenant isolation on classes/:id/students | `src/routes/classes.js:116` | S | Add `AND organization_id = ?` and bind `organizationId` |
| 6 | S1: Session PUT missing validation | `src/routes/students.js:1146` | M | Copy validation block from POST handler (lines 948-977) into PUT handler. Add `auditLog('update', 'session')` middleware |
| 7 | S3: Google API key leaked in POST settings | `src/routes/settings.js:236-237` | S | Add `settings.bookMetadata.hasGoogleBooksApiKey = Boolean(settings.bookMetadata.googleBooksApiKey); delete settings.bookMetadata.googleBooksApiKey;` after existing Hardcover redaction |
| 8 | S4: Password change skips complexity | `src/routes/auth.js:812-815` | S | Add `if (!/[A-Z]/.test(newPassword) \|\| !/[a-z]/.test(newPassword) \|\| !/[0-9]/.test(newPassword))` check matching registration |
| 9 | S2: Hardcover proxy client API key fallback | `src/routes/hardcover.js:49` | S | Replace `const effectiveApiKey = apiKey \|\| body.apiKey` with `if (!apiKey) return c.json({ error: 'Hardcover API key not configured' }, 400)` |
| 10 | S8: Deactivated org accessible | `src/routes/organization.js:23` | S | Add `AND is_active = 1` to SELECT query |
| 11 | S9: auth/me doesn't check is_active | `src/routes/auth.js:748-755` | S | Add `AND u.is_active = 1 AND o.is_active = 1` to query |
| 12 | S5: Slug uniqueness ignores soft-deleted orgs | `src/routes/auth.js:123-129`, `src/routes/organization.js:577` | S | Remove `AND is_active = 1` from both slug uniqueness checks |

## Phase 2: High Priority Bugs & Data Integrity

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 13 | C2: last_read_date never written | `src/routes/students.js:1000-1030` | M | After session INSERT, add `UPDATE students SET last_read_date = ?, updated_at = datetime("now") WHERE id = ?` bound to session date. Also update delete-session handler to recalculate from remaining sessions |
| 14 | C3: Status color mapping mismatch | `src/styles/theme.js`, `StudentTable.js:241`, `StudentCard.js:29`, `QuickEntry.js:156-161`, `PrioritizedStudentsList.js:24-29`, `BookRecommendations.js:427-437` | M | Create `STATUS_TO_PALETTE` mapping object. Update all 5 components to use `theme.palette.status[STATUS_TO_PALETTE[status]]` instead of `theme.palette.status[status]` |
| 15 | B4: rowToStudent missing yearGroup | `src/utils/rowMappers.js:34-63` | S | Add `yearGroup: row.year_group \|\| null` to the mapper object |
| 16 | B5: SessionForm snackbar shows "saved" on error | `src/components/sessions/SessionForm.js:761-776` | S | Add `snackbarMessage` state, set per outcome, use in Snackbar |
| 17 | B6: Session PUT doesn't recalculate streak | `src/routes/students.js:1146-1208` | S | Add `await updateStudentStreak(db, id, organizationId)` after the UPDATE |
| 18 | B7: updateStudentStreak passes {} for env | `src/routes/students.js:159` | S | Thread `c.env` through; pass to `getOrgStreakSettings(db, organizationId, c.env)` |
| 19 | B8: Classes GET missing role guard | `src/routes/classes.js:27,59,98` | S | Add `requireReadonly()` to all three GET routes |
| 20 | B9: Non-atomic session creation | `src/routes/students.js:1001-1030` | M | Combine INSERT session + UPDATE current_book + UPDATE last_read_date into `db.batch()` |
| 21 | D9: Refresh token lookup missing expires_at | `src/routes/auth.js:448` | S | Add `AND expires_at > datetime('now')` to the refresh token SELECT |
| 22 | DC1: Delete unused ReadingPreferences.js | `src/components/students/ReadingPreferences.js` | S | Delete entire file; verify no imports reference it |
| 23 | DC2: Delete unused VisualIndicators.js | `src/components/stats/VisualIndicators.js` | S | Delete entire file |

## Phase 3: Performance & Scalability

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 24 | P2: BookAutocomplete no debounce | `src/components/sessions/BookAutocomplete.js:123-145` | M | Add 150ms debounce on `inputValue` used in the useMemo filter. Use a `debouncedInputValue` state variable updated via setTimeout |
| 25 | P3+P4: Streak cron N+1 queries | `src/routes/students.js:1757-1782`, `src/worker.js` | L | Bulk fetch all sessions per org, group by student_id in JS, batch UPDATE streak values in chunks of 100 via db.batch() |
| 26 | P5: prettyJSON in production | `src/worker.js:52` | S | Wrap in `if (c.env.ENVIRONMENT !== 'production')` check, or remove entirely |
| 27 | P6: ReadingStats shadows activeStudents | `src/components/stats/ReadingStats.js:184-201` | S | Change `getNeedsAttentionStudents` to filter from outer `activeStudents` instead of re-filtering `students` |
| 28 | P7: Chart components missing useMemo | `ReadingFrequencyChart.js:21-33`, `DaysSinceReadingChart.js:22-34` | S | Wrap `activeStudents` in `useMemo` with `[students, globalClassFilter, classes]` deps |
| 29 | P8: ReadingTimelineChart no useMemo | `ReadingTimelineChart.js:98-109` | S | Wrap `generateTimelineDates()` and `getVisibleDates()` in useMemo |
| 30 | P10: createProvider logs on every request | `src/data/index.js:30-51` | S | Remove all `console.log` statements from `createProvider` |
| 31 | P11: books/bulk loads ALL books | `src/routes/books.js:982-1007` | M | Use ISBN/FTS lookup for duplicate detection (same pattern as import/preview) |
| 32 | P12: 1MB body limit blocks CSV imports | `src/worker.js:53` | S | Add override for import endpoints: `booksRouter.use('/import/*', bodyLimit({ maxSize: 5 * 1024 * 1024 }))` |
| 33 | D1: Missing composite index on students | New migration file | S | `CREATE INDEX IF NOT EXISTS idx_students_org_class_active ON students(organization_id, class_id, is_active)` |
| 34 | D2: FTS5 alias mismatch | `src/routes/books.js` (multiple JOIN+WHERE) | S | Change `books_fts MATCH ?` to `fts MATCH ?` where alias is used |
| 35 | D3: Orphan cleanup NOT IN → NOT EXISTS | `src/routes/books.js:898` | S | Replace `WHERE id NOT IN (SELECT book_id FROM org_book_selections)` with `WHERE NOT EXISTS (SELECT 1 FROM org_book_selections WHERE book_id = books.id)` |

## Phase 4: Code Quality & Tech Debt

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 36 | Q1: Console statements cleanup | Various (206 instances) | M | Remove `console.log` from `data/index.js`. Keep `console.error` in catch blocks (appropriate for Workers). Remove `console.warn` debugging leftovers from components |
| 37 | Q2: Duplicate formatRelativeTime | `SupportTicketManager.js:26-43`, `UserManagement.js:275-289` | S | Move to `src/utils/helpers.js`, import from both |
| 38 | Q3: Duplicate student filtering | `StudentList.js`, chart components, `ReadingStats.js`, `BookRecommendations.js` | M | Extract `useFilteredStudents(students, globalClassFilter, classes)` custom hook |
| 39 | Q4+Q5: Duplicate AI config + settings endpoints | `organization.js`, `settings.js` | L | Extract shared AI config update helper. Deprecate one set of endpoints |
| 40 | Q6: Unused import in books.js | `src/routes/books.js:5` | S | Delete `import { getBooksByOrganization }` |
| 41 | Q8: Inconsistent MUI Grid API | Various components | M | Find-and-replace legacy `<Grid item xs={N}>` with `<Grid size={N}>` pattern |
| 42 | DC3: Unused exports | `helpers.js`, `bookMetadataApi.js`, `isbn.js`, `kvProvider.js`, `streakCalculator.js` | S | Remove `getProviderStatus`, `isGoogleBooksConfigured`, `resetAvailabilityCache`, `addBookOptimized`, `wouldExtendStreak` exports |
| 43 | DC4+DC5: Dead files/deps | `scripts/deploy.sh`, `package.json:44` | S | Delete `deploy.sh`. Remove `jsdom` from devDependencies |

## Phase 5: Accessibility & UX

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 44 | A1: Genre Select missing label | `src/components/students/StudentProfile.js:402-427` | S | Add `<InputLabel id="genre-label">Favorite Genres</InputLabel>` and `labelId="genre-label"` to Select |
| 45 | A2+A3: Search inputs missing labels | `StudentList.js:323-356`, `BookManager.js` | S | Add `aria-label="Search students"` / `aria-label="Search books"` |
| 46 | A4+A5: Cards not keyboard accessible | `PrioritizedStudentsList.js:46-141`, `BookRecommendations.js:442-475` | M | Add `tabIndex={0}`, `role="button"`, `onKeyDown` handler for Enter/Space to all clickable cards |
| 47 | A6: LandingPage nav logo no keyboard | `LandingPage.js:90` | S | Add `role="button"`, `tabIndex={0}`, `onKeyDown` |

## Phase 6: Deployment & DX

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 48 | DP1: No CI/CD deployment | `.github/workflows/build.yml` | L | Add deployment job: run migrations then `wrangler deploy` with CF API token secret on push to main |
| 49 | DP2: Dev hits production data | `wrangler.toml` | L | Add `[env.dev]` section with separate D1 database, KV namespace, R2 bucket |
| 50 | DP3: Stale health version | `src/worker.js:234` | M | Add `define: { 'process.env.APP_VERSION': JSON.stringify(require('./package.json').version) }` to rsbuild.config.mjs. Use in health endpoint |
| 51 | DP4: Outdated GH Actions | `.github/workflows/build.yml:18-22` | S | Update `actions/checkout@v3` → `@v4`, `actions/setup-node@v3` → `@v4` |
| 52 | DP5: No linting config | (new files) | M | Add `eslint.config.js` (flat config), `.prettierrc`, `"lint"` script in package.json |
| 53 | DP6: start:dev uses shell & | `package.json:9` | S | Install `concurrently`, change to `"concurrently \"npm:dev\" \"npm:start\""` |
| 54 | DP7: No .env.example | (new file) | S | Create `.env.example` documenting all vars from CLAUDE.md |
| 55 | S6: CSP headers on frontend | `src/worker.js:324` | M | After `env.ASSETS.fetch(request)`, clone response and add security headers |
| 56 | S7: Reduce health endpoint info | `src/worker.js:230-254` | S | Strip to `{ status: 'ok', database: 'connected'/'unreachable', version }` behind auth for details |

## Phase 7: Testing (Ongoing)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 57 | T1: 40 untested components | `src/components/` | L | Start with Header.js, StudentList.js, StudentCard.js, ClassManager.js, Settings.js — highest user-facing risk |
| 58 | T2: 4 untested routes | `src/routes/data.js`, `signup.js`, `hardcover.js`, `wondeAdmin.js` | M | Add integration tests for each; prioritize hardcover (proxy) and wondeAdmin (admin operations) |
| 59 | T3: Data providers untested | `src/data/d1Provider.js` | M | Add unit tests for core CRUD operations with mocked D1 |
| 60 | T4: AppContext untested | `src/contexts/AppContext.js` | L | Add tests for auth flow, state transitions, fetchWithAuth retry logic |
| 61 | T5: AI service API functions untested | `src/services/aiService.js` | M | Mock fetch, test each provider's call function + parseAIResponse |

## Dependencies & Ordering Notes

- **Items 1-12** (Phase 1) are all independent and can be parallelized across agents
- **Item 13** (last_read_date) should be done before Item 20 (atomic session creation) as they modify the same code
- **Item 14** (status colors) is standalone but visually impactful — good candidate for early verification
- **Item 25** (streak cron) depends on Item 3 (cron routing) being done first
- **Item 48** (CI/CD) should come before Item 49 (dev environment) — deploy pipeline first, then add staging
- **Phase 7** (Testing) can be worked on in parallel with all other phases

## Quick Wins (S effort + High/Critical severity)

These items are all under 30 minutes each and fix Critical or High issues:

1. Item 1: DpaConsentModal logout fix (Critical, ~2 min)
2. Item 2: npm run go migrations (Critical, ~2 min)
3. Item 3: Cron routing (Critical, ~5 min)
4. Item 4: SQL LIMIT parameterization (Critical, ~5 min)
5. Item 5: Tenant isolation on classes (Critical, ~2 min)
6. Item 7: Google API key POST redaction (Security, ~2 min)
7. Item 8: Password change complexity (Security, ~5 min)
8. Item 9: Hardcover proxy key fallback (Security, ~2 min)
9. Item 10: Deactivated org filter (Security, ~2 min)
10. Item 11: auth/me is_active (Security, ~2 min)
11. Item 12: Slug uniqueness (Security, ~2 min)
12. Item 15: rowToStudent yearGroup (High bug, ~2 min)
13. Item 16: SessionForm snackbar (High bug, ~10 min)
14. Item 17: Session PUT streak recalc (Medium bug, ~2 min)
15. Item 18: updateStudentStreak env (Medium bug, ~5 min)
16. Item 19: Classes GET role guard (Medium bug, ~5 min)
17. Item 21: Refresh token expires_at (Medium DB, ~2 min)
18. Item 22+23: Delete dead files (High+Low dead code, ~2 min)
