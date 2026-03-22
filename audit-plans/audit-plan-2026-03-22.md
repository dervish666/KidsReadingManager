# Implementation Plan — Codebase Audit 2026-03-22

## Overview

128 total findings across security, bugs, auth, performance, code quality, frontend, config, and accessibility. Estimated effort: ~15 S items, ~25 M items, ~8 L items across 5 phases. Quick wins (S effort + High/Critical severity) should be tackled first within each phase.

---

## Phase 1: Critical & Security (Do First)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 1 | SEC-C1: Webhook secret in URL | `src/routes/webhooks.js:31-32` | M | Move webhook authentication from `url.searchParams.get('secret')` to `c.req.header('X-Webhook-Secret')` or `Authorization: Bearer <secret>`. Update Wonde dashboard webhook URL to remove `?secret=` and add the header instead. If Wonde doesn't support headers, implement HMAC body signature verification. |
| 2 | SEC-C2/C3: XSS in email templates | `src/utils/email.js:35,71,82-83,250,294` | S | Apply the existing `escapeHtml()` function to `resetUrl`, `loginUrl`, and `verifyUrl` everywhere they appear in HTML `href` attributes and text content. Approximately 6 substitution points across `sendPasswordResetEmail`, `sendWelcomeEmail`, and `sendVerificationEmail`. |
| 3 | SEC-C4: MyLogin role not synced | `src/routes/mylogin.js:218-224` | M | In the `existingUser` branch, add `role` to the UPDATE statement: `UPDATE users SET name = ?, email = ?, role = ?, ...`. Map MyLogin profile type to Tally role using the existing `mapRole()` function. Log role changes via `console.log('[MyLogin] Role updated for user ${userId}: ${existingUser.role} → ${role}')`. |
| 4 | SEC-C5: Rate limiting fails open | `src/middleware/tenant.js:296-299` | M | Change the catch block in `authRateLimit()` to reject requests on sensitive paths (`/api/auth/login`, `/api/auth/register`, `/api/auth/reset-password`) when the rate limiter fails. Return `c.json({ error: 'Service temporarily unavailable' }, 503)`. Keep fail-open for non-auth paths. |
| 5 | BUG-C1: `bookToRow` uses `\|\|` for numerics | `src/data/d1Provider.js:39-43` | S | Change `book.pageCount \|\| null` to `book.pageCount ?? null` for `page_count`, `series_number`, and `publication_year`. Also change string fields at lines 33-37 from `\|\|` to `??` if empty strings should be preserved. |
| 6 | SEC-H1: Webhook leaks org ID | `src/routes/webhooks.js:91` | S | Change `return c.json({ success: true, organizationId: orgId })` to `return c.json({ success: true })`. |
| 7 | SEC-H2: Refresh token reuse detection | `src/routes/auth.js:543-546` | M | Before the "Invalid refresh token" 401 response, check if the presented token hash matches a *revoked* token (not just expired). If so, revoke ALL refresh tokens for that user via `UPDATE refresh_tokens SET revoked_at = datetime("now") WHERE user_id = ? AND revoked_at IS NULL`. Log the incident. |
| 8 | SEC-H5: GraphQL proxy forwards arbitrary queries | `src/routes/hardcover.js:50-67` | M | Add query validation: parse the `query` string and reject if it contains `mutation` or `subscription` keywords. Simplest approach: `if (/^\s*(mutation|subscription)\b/i.test(query.trim())) return c.json({ error: 'Only queries allowed' }, 400)`. |
| 9 | AUTH-H1/H2: Settings POST missing auth | `src/routes/settings.js:119,308` | S | Add `requireAdmin()` middleware to both `settingsRouter.post('/')` and `settingsRouter.post('/ai')`. Import from `../middleware/tenant.js`. |
| 10 | SEC-M2: SQL template literal for lockout | `src/routes/auth.js:241` | S | Change `'-${LOCKOUT_DURATION_MINUTES} minutes'` to a bind parameter. Use `.bind(email.toLowerCase(), `-${LOCKOUT_DURATION_MINUTES} minutes`)` and `datetime('now', ?)` in the query. |
| 11 | SEC-M4: Genre ID LIKE injection | `src/data/d1Provider.js:558` | S | Escape `%`, `_`, and `"` in genre IDs before embedding in LIKE pattern: `const escaped = String(id).replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/"/g, '');` |
| 12 | SEC-M6: Ownership check fails open | `src/middleware/tenant.js:215-218` | S | Change the catch block in `requireOrgOwnership` to `return c.json({ error: 'Service temporarily unavailable' }, 503)` instead of calling `next()`. |

---

## Phase 2: High Priority Bugs & Auth Gaps

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 13 | AUTH-H3: POST /books no org link | `src/routes/books.js:622-648` | S | After `const savedBook = await provider.addBook(newBook)`, add: `await db.prepare('INSERT INTO org_book_selections (id, organization_id, book_id, is_available) VALUES (?, ?, ?, 1)').bind(generateId(), organizationId, savedBook.id).run()`. Import `generateId` if not already imported. |
| 14 | AUTH-H4: POST /books/bulk no org link | `src/routes/books.js:1001-1125` | M | After `provider.addBooksBatch()`, generate `org_book_selections` INSERT statements for each created book. Chunk into batches of 100 for `db.batch()`. |
| 15 | AUTH-M1–M5: Missing auth middleware on org/settings GETs | `src/routes/organization.js:18,95,149,258`, `src/routes/settings.js:73` | S | Add `requireReadonly()` middleware to: `orgRouter.get('/')`, `orgRouter.get('/stats')`, `orgRouter.get('/settings')`, `orgRouter.get('/ai-config')`, and `settingsRouter.get('/')`. |
| 16 | BUG-H1: Session update missing `location` | `src/routes/students.js:1240-1261` | S | Add `location = ?` to the UPDATE SQL and bind `body.location \|\| existingSession.location \|\| 'school'`. |
| 17 | BUG-H2: Session update missing `last_read_date` recalc | `src/routes/students.js:1239-1264` | S | After the UPDATE, copy the `last_read_date` recalculation query from the DELETE handler (~5 lines of SQL to find max session_date and update student). |
| 18 | BUG-H3: Class assignments batch limit | `src/utils/classAssignments.js:33-39` | S | Replace `await db.batch(statements)` with: `for (let i = 0; i < statements.length; i += 100) { await db.batch(statements.slice(i, i + 100)); }` |
| 19 | BUG-H4: Wonde DELETE+INSERT atomicity | `src/services/wondeSync.js:264-291` | S | Execute the DELETE as a standalone `await db.prepare(...).run()`, then batch only the INSERTs in groups of 100. |
| 20 | BUG-M4: Recommendation cache missing student ID | `src/utils/recommendationCache.js:22-36` | S | Add `studentId: inputs.studentId` to the normalized JSON object used for cache key generation. |
| 21 | BUG-M6: `daysBetween` DST issue | `src/utils/streakCalculator.js:48-52` | S | Append `'T00:00:00Z'` when parsing date strings: `const d1 = new Date(date1 + 'T00:00:00Z')`. |
| 22 | BUG-M7/M8: wondeAdmin missing error handling | `src/routes/wondeAdmin.js:27,66` | S | Add `if (!c.env.JWT_SECRET) return c.json({ error: 'Encryption not configured' }, 500)` before decrypt calls. Wrap `decryptSensitiveData` in try/catch returning `{ error: 'Failed to decrypt token' }`. |
| 23 | BUG-M9: isbnLookup missing timeout | `src/utils/isbnLookup.js:101,128` | S | Replace both `fetch(url, opts)` calls with `fetchWithTimeout(url, opts, 5000)`. Import `fetchWithTimeout` from `./helpers.js`. |
| 24 | FE-H1: UserManagement false success | `src/components/UserManagement.js:138-148` | S | After `fetchWithAuth`, check `if (!data.ok) { const err = await data.json(); throw new Error(err.error); }` before showing success. Apply same pattern to all mutation calls in the component. |
| 25 | FE-H2: SettingsPage broken tab indices | `src/components/SettingsPage.js:119-127` | M | Build a `tabComponents` array dynamically (push entries based on role flags), then render `{tabComponents[currentTab]?.component}` instead of hardcoded index checks. |
| 26 | FE-H3: HomeReadingRegister global filter mutation | `src/components/sessions/HomeReadingRegister.js:285-296` | M | Replace `setGlobalClassFilter` with a local `useState` for class selection within HomeReadingRegister. Remove the `useEffect` that mutates the global filter. Pass the local selection to child queries. |
| 27 | FE-H4: Stale closure in useEffect | `src/components/UserManagement.js:77-80`, `src/components/SchoolManagement.js:55-57` | S | Wrap `fetchUsers`/`fetchOrganizations`/`fetchSchools` in `useCallback([fetchWithAuth])` and add to useEffect dependency arrays. Or inline the fetch calls directly in the useEffect. |

---

## Phase 3: Performance & Scalability

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 28 | PERF-M1: No student list pagination | `src/routes/students.js:189` | L | Add `page` and `limit` query params (default limit 100). Add `LIMIT ? OFFSET ?` to the SQL. Return `{ students, total, page, limit }`. Update frontend `AppContext` to handle pagination. |
| 29 | PERF-M2: BookAutocomplete filters 18K books | `src/components/sessions/BookAutocomplete.js:131` | S | Add `.slice(0, 100)` to `computedOptions` return to cap visible results. |
| 30 | PERF-M3: StudentSessions O(n) book lookup | `src/components/sessions/StudentSessions.js:74` | S | Add `const booksMap = useMemo(() => new Map(books.map(b => [b.id, b])), [books])` and use `booksMap.get(bookId)` in `getBookInfo`. |
| 31 | PERF-M4: BookCoverContext frequent localStorage writes | `src/contexts/BookCoverContext.js:141` | S | Debounce `saveCacheToStorage`: use a `useRef` timeout that clears/resets on each call, writing after 2 seconds of inactivity. |
| 32 | PERF-M5: DaysSinceReadingChart unmemoized | `src/components/stats/DaysSinceReadingChart.js:60` | S | Wrap `calculateDaysSinceReading()` call in `useMemo(() => calculateDaysSinceReading(), [activeStudents])`. |
| 33 | PERF-M7: Redundant AbortController | `src/utils/openLibraryApi.js:32-43` | S | Remove the outer `AbortController` and `setTimeout`. Pass only `fetchWithTimeout(url, { method: 'GET', headers }, timeout)`. |
| 34 | BUG-M2: Unbounded readBookIds in SQL | `src/routes/books.js:281-284` | M | If `readBookIds.length > 500`, skip the `NOT IN` filter and do post-query JS filtering (similar to `getFilteredBooksForRecommendations`). Or limit to most recent 200 read book IDs. |
| 35 | BUG-M5: getFilteredBooks returns too few | `src/data/d1Provider.js:543-572` | S | When `excludeBookIds.length > 500`, increase SQL LIMIT to `limit + Math.min(excludeBookIds.length, 500)` to compensate for post-query filtering. |
| 36 | BUG-M1: N+1 in recalculate-streaks | `src/routes/students.js:1392-1406` | M | Replace the per-student loop with a bulk approach: fetch all sessions for the org in one query, group by student, calculate streaks in JS, then batch-update all students. |

---

## Phase 4: Code Quality & Tech Debt

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 37 | CFG-H1: APP_VERSION mismatch | `src/worker.js:48`, `src/instrument.js:5` | S | Update both `APP_VERSION` and Sentry `release` to `3.23.3`. Long-term: inject version from `package.json` at build time via Rsbuild `define`. |
| 38 | CFG-H2: Sentry 100% trace sampling | `src/worker.js:312`, `src/instrument.js:17` | S | Change `tracesSampleRate: 1.0` to `tracesSampleRate: 0.1` in both files. |
| 39 | CFG-H3: No ESLint | project root | L | Install `eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`. Create `eslint.config.js` with flat config. Add `"lint": "eslint src/"` to scripts. Add `npm run lint` step to `.github/workflows/build.yml`. |
| 40 | CQ-M1: Client-controlled IDs | `src/routes/students.js:627`, `src/routes/classes.js:155`, `src/routes/genres.js:108` | S | Remove `body.id ||` from all three create endpoints. Always use `generateId()`. |
| 41 | CQ-M2: Duplicate AI config endpoints | `src/routes/organization.js:306-412`, `src/routes/settings.js:308-436` | M | Extract shared AI config logic into `src/utils/aiConfigHelper.js`. Have both endpoints call the same function. Consider deprecating one endpoint. |
| 42 | CQ-M3: Duplicate title-matching functions | `src/utils/openLibraryApi.js:265-337`, `src/utils/googleBooksApi.js:384-451`, `src/utils/hardcoverApi.js:173-247` | M | Extract `normalizeTitle`, `calculateTitleSimilarity`, `findBestTitleMatch` into `src/utils/titleMatching.js`. Update all three API files to import from shared module. |
| 43 | CQ-M4: normalizeString strips Unicode | `src/utils/stringMatching.js:17` | S | Change `.replace(/[^\w\s]/g, '')` to `.replace(/[^\p{L}\p{N}\s]/gu, '')` to preserve Unicode letters. |
| 44 | CQ-M7: Inconsistent error response patterns | Multiple route files | L | Standardize all route error handling to use `throw badRequestError()` / `throw notFoundError()` pattern from `errorHandler.js`. Audit all `return c.json({ error: ... })` patterns and convert. |
| 45 | CQ-M8: Remove `uuid` dependency | `src/contexts/AppContext.js:10` | S | Replace `import { v4 as uuidv4 } from 'uuid'` with `crypto.randomUUID()`. Remove `uuid` from `package.json` dependencies. |
| 46 | SEC-H3: Separate encryption secret | `src/utils/crypto.js:496-521`, `wrangler.toml` | M | Add `ENCRYPTION_SECRET` env var. Update `deriveEncryptionKey` to accept and prefer it, falling back to `JWT_SECRET`. Add to wrangler.toml secrets. Re-encrypt existing Wonde tokens with new key. |
| 47 | SEC-H4: Remove plaintext decrypt fallback | `src/utils/crypto.js:565-569` | S | After migrating all tokens (see #46), remove the `if (!encryptedData.includes(':'))` fallback. Throw an error for invalid format instead. |
| 48 | FE-M1: ErrorBoundary Sentry integration | `src/components/ErrorBoundary.js:14` | S | Add `import * as Sentry from '@sentry/react'` and `Sentry.captureException(error, { extra: errorInfo })` in `componentDidCatch`. Store error in state for display. |
| 49 | FE-M2: QuickEntry snackbar severity | `src/components/sessions/QuickEntry.js:385` | S | Add `const [snackbarSeverity, setSnackbarSeverity] = useState('success')`. Set to `'error'` in catch blocks, `'success'` on success. Use `severity={snackbarSeverity}` in Alert. |

---

## Phase 5: Nice-to-Haves & Hardening

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 50 | SEC-M1: Legacy auth HMAC | `src/middleware/auth.js:16-33` | M | Replace `crypto.subtle.digest('SHA-256', ...)` with `crypto.subtle.sign('HMAC', key, data)`. Or deprecate legacy auth entirely if all deployments use JWT. |
| 51 | SEC-M3: Deep prototype pollution check | `src/utils/validation.js:113-128` | S | Add recursive check for nested objects: `function checkDangerousKeys(obj) { for (const [k, v] of Object.entries(obj)) { if (DANGEROUS_KEYS.has(k)) return false; if (v && typeof v === 'object' && !checkDangerousKeys(v)) return false; } return true; }` |
| 52 | SEC-M5: Book count not org-scoped | `src/routes/books.js:610-614` | S | Change to `SELECT COUNT(*) as count FROM org_book_selections WHERE organization_id = ? AND is_available = 1`. |
| 53 | SEC-M7: Legacy auth rate limiting | `src/middleware/auth.js:118`, `src/worker.js:254` | S | Add `authRateLimit()` middleware to the legacy `POST /api/login` route in `worker.js`. |
| 54 | FE-M3: Settings sync on server update | `src/components/Settings.js:50-54` | S | Add `useEffect(() => { setLocalSettings({ recentlyReadDays: readingStatusSettings.recentlyReadDays, ... }) }, [readingStatusSettings, settings])`. |
| 55 | FE-M4: AssessmentSelector accessibility | `src/components/sessions/AssessmentSelector.js:20` | M | Add `role="slider"`, `aria-label="Set reading assessment level"`, `tabIndex={0}`, `aria-valuemin={0}`, `aria-valuemax={marks.length - 1}`, and `onKeyDown` handler for arrow key navigation. |
| 56 | FE-M5: BookImportWizard state reset | `src/components/books/BookImportWizard.js:33` | S | Add `useEffect(() => { if (open) { setCsvData(null); setPreviewResults(null); setActiveStep(0); ... } }, [open])`. |
| 57 | CI improvements | `.github/workflows/build.yml` | M | Add steps: `npm run lint`, `npx prettier --check "src/**/*.js"`, `npm audit --audit-level=high`. Add Node 22.x to matrix. Add `.nvmrc` with `22`. |
| 58 | start:dev orphan fix | `package.json:9` | S | Install `concurrently` as devDependency. Change `"start:dev"` to `"concurrently \"npm run dev\" \"npm run start\""`. |
| 59 | E2E default URL safety | `e2e/playwright.config.js:16` | S | Change default `baseURL` to `http://localhost:3001` or add `if (!process.env.E2E_BASE_URL) throw new Error('Set E2E_BASE_URL')`. |
| 60 | CORS trailing slash | `wrangler.toml:51` | S | Remove trailing `/` from `https://kids-reading-manager.brisflix.workers.dev/`. |
| 61 | Max password length | `src/routes/auth.js:100` | S | Add `if (password.length > 128) { return c.json({ error: 'Password must be 128 characters or fewer' }, 400); }` before hashing, in register, login, and reset-password handlers. |

---

## Dependencies & Ordering Notes

- **#46 (separate encryption secret) must precede #47** (remove plaintext fallback) — need to re-encrypt all Wonde tokens with the new key first.
- **#39 (ESLint setup) should precede #44** (error pattern standardization) — ESLint rules will catch inconsistencies automatically.
- **#1 (webhook secret header)** requires coordination with Wonde's webhook configuration dashboard — may need to schedule a maintenance window.
- **#3 (MyLogin role sync)** should be tested carefully to avoid accidentally demoting manually-elevated users. Consider adding a `role_locked` flag if needed.
- **Phase 1 items #1-12 can be parallelized** — they touch different files with no dependencies.
- **Phase 2 items #13-27 can mostly be parallelized** — except #25 (SettingsPage tabs) and #26 (HomeReadingRegister) which both affect navigation UX.

## Quick Wins (S effort + High/Critical severity)

These should be done first — each takes under 30 minutes:

1. **#2** — Escape URLs in email templates (SEC-C2/C3)
2. **#5** — Fix `||` to `??` in `bookToRow` (BUG-C1)
3. **#6** — Remove org ID from webhook response (SEC-H1)
4. **#9** — Add `requireAdmin()` to settings POST endpoints (AUTH-H1/H2)
5. **#10** — Parameterize SQL lockout duration (SEC-M2)
6. **#11** — Escape genre IDs in LIKE patterns (SEC-M4)
7. **#12** — Fail closed on ownership check error (SEC-M6)
8. **#13** — Link books to org on POST /books (AUTH-H3)
9. **#15** — Add `requireReadonly()` to org/settings GETs (AUTH-M1-M5)
10. **#16** — Add `location` to session update (BUG-H1)
11. **#17** — Add `last_read_date` recalc to session update (BUG-H2)
12. **#18** — Chunk class assignment batches (BUG-H3)
13. **#19** — Fix Wonde DELETE atomicity (BUG-H4)
14. **#20** — Add student ID to recommendation cache key (BUG-M4)
15. **#24** — Fix UserManagement false success (FE-H1)
16. **#27** — Fix stale closure in useEffect (FE-H4)
17. **#37** — Update APP_VERSION to 3.23.3 (CFG-H1)
18. **#38** — Reduce Sentry trace sampling (CFG-H2)
