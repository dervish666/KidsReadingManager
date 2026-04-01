# Implementation Plan — Codebase Audit 2026-04-01

## Overview

69 findings across security, bugs, performance, and code quality. Estimated effort: ~15 S, ~30 M, ~24 L items. Phase 1 (Critical + Security) should be prioritised before any feature work.

---

## Phase 1: Critical & Security (Do First)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 1 | C1: SSO callback drops access token | `src/routes/mylogin.js:286-306` | M | Either store access token in KV keyed by a one-time code appended to the redirect URL (client fetches and deletes), or add explicit retry logic in `AuthContext.js` for the `/?auth=callback` path. The current approach silently relies on `/api/auth/refresh` succeeding on page load. |
| 2 | C4: Webhook secret in query string | `src/routes/webhooks.js:32-34` | S | Change `url.searchParams.get('secret')` to `c.req.header('X-Webhook-Secret')`. Update Wonde dashboard webhook URL to send header instead of query param. |
| 3 | H1: Logger logs secrets in URLs | `src/worker.js:59` | S | Replace `logger()` with a custom Hono middleware that strips query parameters from logged URLs: `const url = new URL(req.url); url.search = ''; console.log(method, url.pathname)`. |
| 4 | C5: No rate limiting on AI/cost endpoints | `src/middleware/tenant.js`, `src/worker.js` | M | Create a `costRateLimit()` middleware (similar to `authRateLimit` but with different limits). Apply to `POST /api/books/ai-suggestions` (10/min), `POST /api/metadata/enrich` (5/min), `POST /api/hardcover/graphql` (30/min). |
| 5 | H10: Password change missing max length | `src/routes/auth.js:948-959` | S | Add `if (newPassword.length > 128) return c.json({ error: 'Password must be 128 characters or fewer' }, 400);` after the min-length check. |
| 6 | H11: Env var names logged | `src/utils/email.js:101` | S | Replace line 101 with `console.warn('No email provider configured for this environment.');` |
| 7 | H5: SSO auto-elevates roles | `src/routes/mylogin.js:218-228` | M | Before the UPDATE, SELECT the existing user's role. If the new role has higher privilege than the existing one, log a warning and keep the existing role. Add audit logging: `INSERT INTO audit_log (action, entity_type, ...) VALUES ('role_change_blocked', 'user', ...)`. |
| 8 | M20: Raw AI response logged | `src/services/aiService.js:255, 417` | S | Change both `console.error('Raw response:', text)` to `console.error('Raw response (truncated):', text?.substring(0, 200))`. |
| 9 | H2: SELECT * includes password_hash | `src/routes/users.js:284-289` | S | Replace `SELECT *` with explicit column list: `SELECT id, organization_id, email, name, role, is_active, last_login_at, created_at, updated_at, auth_provider, mylogin_id, wonde_employee_id`. |
| 10 | M1: Hardcover proxy allows arbitrary queries | `src/routes/hardcover.js:57-78` | M | Strip comments from query before regex check: `const cleaned = trimmed.replace(/#[^\n]*/g, '').replace(/^[\s\n]+/, '')`. Also add query depth/complexity limit (reject queries with more than 3 nesting levels). |
| 11 | M4: Encryption key from JWT secret | `src/utils/crypto.js:496-521` | M | Add `ENCRYPTION_KEY` env var. In `deriveEncryptionKey`, use `secret` param which callers should pass as `c.env.ENCRYPTION_KEY || c.env.JWT_SECRET` (backward compatible). Document the new var in CLAUDE.md. |
| 12 | M2: Genres globally mutable by any admin | `src/routes/genres.js:31-47` | S | Add `requireOwner()` middleware to POST, PUT, DELETE genre routes. Teachers/admins can still read genres. |

---

## Phase 2: High Priority Bugs & Data Integrity

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 13 | C2: readBookIds exceeds bind limit | `src/routes/books.js:281-285` | M | Chunk `readBookIds` into groups of 400. Build multiple `NOT IN` clauses joined with `AND`: `AND b.id NOT IN (?) AND b.id NOT IN (?)`. Apply same fix to library-search path at line 282. |
| 14 | H4: Wonde sync non-atomic DELETE+INSERT | `src/services/wondeSync.js:274` | M | Move the `DELETE FROM wonde_employee_classes WHERE organization_id = ?` into the first batch of INSERT statements. D1 batch is atomic, so the delete and first round of inserts succeed or fail together. |
| 15 | H3: Owner GET user by ID org-scoped | `src/routes/users.js:88-97` | S | Add owner bypass: `if (role === 'owner') { query without org filter } else { existing query with org filter }`, matching the pattern in the PUT handler. |
| 16 | H9: Org creation slug collision | `src/routes/organization.js:646-661` | S | Replace the 409 error with the slug-generation loop from `auth.js:139-149`. Handle UNIQUE constraint violation as retry signal. |
| 17 | M12: Registration slug TOCTOU race | `src/routes/auth.js:139-149` | S | Wrap the INSERT in a try/catch. On UNIQUE constraint violation (`SQLITE_CONSTRAINT`), retry with incremented counter up to 5 times. |
| 18 | H8: MyLogin logout null DB | `src/routes/mylogin.js:318-330` | S | Replace `const db = c.env.READING_MANAGER_DB;` with `const db = getDB(c.env);` (import `getDB` from `src/utils/routeHelpers.js`). |
| 19 | M8: D1 batch per-item success check | `src/routes/books.js:1492-1508` | S | Remove the `if (result.success)` / `else onError` branch. After a successful batch, call `batch.forEach(b => b.onSuccess())`. The outer try/catch already handles batch failure. |
| 20 | M6: Stats timezone handling | `src/routes/students.js:353-356, 421` | M | Fetch org timezone from `organization_settings`. Use it in `toLocaleDateString('en-CA', { timeZone })` for week boundaries. Normalize `diffDays` by converting both dates to the org's local midnight. |
| 21 | M7: CSV BOM handling | `src/utils/csvParser.js:9` | S | Add `csvText = csvText.replace(/^\uFEFF/, '');` as the first line of the parse function. |
| 22 | M10: LIKE wildcard escaping | `src/routes/books.js:288-293` | S | Before building LIKE patterns, escape wildcards: `const escaped = disliked.replace(/%/g, '\\%').replace(/_/g, '\\_');`. Add `ESCAPE '\\'` to the LIKE clause. |
| 23 | M11: Metadata config JSON.parse | `src/routes/metadata.js:16, 48` | S | Wrap in try/catch: `let chain; try { chain = JSON.parse(row.provider_chain); } catch { chain = ['openLibrary', 'googleBooks', 'hardcover']; console.warn('Corrupt provider_chain, using default'); }` |
| 24 | M9: Term dates overlap `<=` | `src/routes/termDates.js:72-77` | S | Change `<=` to `<` and add a comment: `// Terms can be back-to-back (start === prev end) but not overlapping`. |

---

## Phase 3: Performance & Frontend

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 25 | C3: SettingsPage eager rendering | `src/components/SettingsPage.js:40-70` | M | Change tabs array to store component references: `{ component: Settings }` instead of `{ component: <Settings /> }`. Render with `{React.createElement(tabs[currentTab]?.component)}`. |
| 26 | H6: BookManager redundant fetch | `src/components/books/BookManager.js:49-59` | M | Remove the standalone `fetchWithAuth('/api/books?all=true')` call. Use books from DataContext. If full details are needed, extend DataContext with a `fetchFullBooks()` that caches the result. |
| 27 | H7: Charts without virtualisation | `src/components/stats/ReadingFrequencyChart.js:68`, `src/components/stats/DaysSinceReadingChart.js:98` | M | Limit displayed students to top 30 by default with a "Show all N students" toggle. This avoids adding a `react-window` dependency while solving the DOM explosion. |
| 28 | M22: LandingPage IntersectionObserver refs | `src/components/LandingPage.js:57-59` | S | Replace `revealRefs.current` array with a `Set`. Change `addRevealRef` to use `.add(el)`. |
| 29 | M14: SupportTicketManager silent errors | `src/components/SupportTicketManager.js` | S | Add `const [error, setError] = useState(null)`. In each catch block, call `setError('Failed to load/update. Please try again.')`. Render an MUI Alert when error is set. |
| 30 | M16: Settings save no loading state | `src/components/Settings.js:98-131` | S | Add `const [saving, setSaving] = useState(false)`. Set true at start of `handleSaveSettings`, false in finally. Disable Save button: `disabled={saving}`. |
| 31 | M13: DpaConsentModal ARIA | `src/components/DpaConsentModal.js:87` | S | Add `role="alertdialog"` and `aria-describedby="dpa-description"` to Dialog. Add `id="dpa-description"` to the body Typography. |
| 32 | M15: Duplicate polling logic | `src/components/BookMetadataSettings.js`, `src/components/MetadataManagement.js` | M | Extract a `useEnrichmentPolling(fetchWithAuth, endpoint)` hook that encapsulates the AbortController, while loop, progress state, and cleanup. Both components consume the hook. |

---

## Phase 4: Code Quality & Configuration

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 33 | M3: Support ticket no role check | `src/routes/support.js:9-14` | S | Add `requireReadonly()` middleware to `supportRouter.post('/')`. |
| 34 | M5: CORS null origin | `src/worker.js:64-66` | S | Change `if (!origin) return origin;` to `if (!origin) return null;`. |
| 35 | M17: Stripe trial email stub | `src/routes/stripeWebhook.js:182-186` | M | Implement `sendTrialEndingEmail(orgAdmin, daysRemaining)` using `src/utils/email.js`. Look up org admin from subscription metadata. |
| 36 | M18: node-fetch missing from deps | `package.json` | S | Run `npm install --save-dev node-fetch` or rewrite scripts to use native `fetch`. |
| 37 | M19: Stripe secrets undocumented | `CLAUDE.md`, `wrangler.toml` | S | Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to the Environment Variables section. Add `SENTRY_DSN` too. |
| 38 | M21: Org search no min length | `src/routes/organization.js:95-98` | S | Add `if (search && search.length < 3) return c.json({ error: 'Search term must be at least 3 characters' }, 400);`. |
| 39 | M23: App.js duplicate Suspense | `src/App.js:152-213` | S | Extract `const PageFallback = () => <Box sx={{...}}>...</Box>` and reuse for all three routes. |
| 40 | L17: Unused Login imports | `src/components/Login.js:11` | S | Remove `Tabs, Tab` from the MUI import. |
| 41 | L18: Dead fetchOrganizations | `src/components/UserManagement.js:106-119` | S | Delete the unused function. |
| 42 | L19: Duplicate backgroundColor | `src/components/BookCoverPlaceholder.js:43, 53` | S | Remove `backgroundColor` from the `sx` prop (keep it in `style`). |
| 43 | L23: Dead MUI wrapper slot | `src/styles/theme.js:289-292` | S | Remove the `wrapper` key from `MuiBottomNavigationAction` styleOverrides. |
| 44 | L25: uuid in prod deps | `package.json` | S | `npm install --save-dev uuid && npm uninstall uuid && npm install --save-dev uuid`. |
| 45 | L26: Dead helpers exports | `src/utils/helpers.js:96-162` | S | Remove `formatSuccessResponse`, `formatErrorResponse`, `updateLastReadDate` and their tests. |
| 46 | L27: Dead defaultProvider export | `src/data/index.js:192-195` | S | Remove `const defaultProvider = null;` and `export default defaultProvider;`. |
| 47 | L28: Orphaned JSDoc | `src/utils/helpers.js:178-185` | S | Remove the duplicate `fetchWithTimeout` JSDoc block. |
| 48 | L30: Unused REACT_APP define | `rsbuild.config.mjs:21` | S | Remove the `REACT_APP_API_BASE_URL` define entry. |

---

## Phase 5: Nice-to-Haves & Hardening

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 49 | L1: Legacy auth weak token | `src/middleware/auth.js:16-34` | L | Replace `SHA-256(payload\|secret)` with HMAC-SHA256, or deprecate/remove legacy mode entirely. |
| 50 | L2: Body-based refresh token path | `src/routes/auth.js:500-501` | S | Remove the `body.refreshToken` fallback once all clients confirmed on cookie-based auth. |
| 51 | L3: Audit log not org-scoped in export | `src/routes/users.js:700-710` | S | Add `AND organization_id = ?` to the audit log query, bind to target user's org. |
| 52 | L4: Teacher-level bulk book import | `src/routes/books.js:28, 1091` | S | Change `requireTeacher()` to `requireAdmin()` on import endpoints. |
| 53 | L5: Student ID in errors | `src/routes/students.js:479, 539` | S | Change to `throw notFoundError('Student not found');` (remove ID echo). |
| 54 | L6: Probabilistic OAuth cleanup | `src/routes/mylogin.js:62-63` | S | Remove the `Math.random() < 0.1` block. Cron cleanup at 2 AM is sufficient. |
| 55 | L7: Tour ID no length validation | `src/routes/tours.js:24-53` | S | Add `if (!tourId \|\| tourId.length > 50) return c.json({ error: 'Invalid tour ID' }, 400);`. |
| 56 | L8: Redundant token expiry check | `src/routes/auth.js:549-552` | S | Remove the JS-side expiry check or add a `// Defense against D1/Worker clock skew` comment. |
| 57 | L9: Slug generation no max iterations | `src/routes/auth.js:140-149` | S | Add `if (slugCounter > 100) throw badRequestError('Unable to generate unique slug');`. |
| 58 | L10: OpenLibrary meta-subjects | `src/services/providers/openLibraryProvider.js:56` | S | Filter: `doc.subject?.filter(s => s.length < 50 && !['Accessible book', 'Protected DAISY', 'Internet Archive Wishlist'].includes(s)).slice(0, 5)`. |
| 59 | L11: Batch student import self-dedup | `src/routes/students.js:892-928` | S | Deduplicate by normalized name before processing: `const seen = new Set(); students = students.filter(s => { const key = s.name.trim().toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });`. |
| 60 | L12: Session book org check | `src/routes/students.js:1019-1037` | S | Before INSERT, verify: `SELECT 1 FROM org_book_selections WHERE book_id = ? AND organization_id = ?`. Return 400 if not found. |
| 61 | L13: User deactivation class_assignments | `src/routes/users.js:462-481` | S | Add `db.prepare('DELETE FROM class_assignments WHERE user_id = ?').bind(userId)` to the deactivation batch. |
| 62 | L14: Email transfer encoding | `src/utils/email.js:171-173` | S | Change `Content-Transfer-Encoding: 7bit` to `Content-Transfer-Encoding: base64` and base64-encode the HTML body. |
| 63 | L15: Hardcover empty catch blocks | `src/services/providers/hardcoverProvider.js:101-117` | S | Add `console.debug('Failed to parse cached_contributors:', e.message)` inside catch. |
| 64 | L16: Silent streak timezone fallback | `src/utils/streakCalculator.js:13-19` | S | Add `console.warn('Invalid timezone, falling back to UTC:', timezone)` in catch block. |
| 65 | L20: BookManager getUniqueReadingLevels | `src/components/books/BookManager.js:262-270, 499` | S | Wrap in `useMemo`: `const readingLevels = useMemo(() => getUniqueReadingLevels(), [books]);`. Use `readingLevels` in JSX. |
| 66 | L21: Duplicate error display | `src/components/books/BookManager.js:435-439, 451-455` | S | Remove the error Alert inside the form Paper (lines 435-439). Keep the one outside. |
| 67 | L22: BulkImport self-dedup | `src/components/students/BulkImport.js:69-87` | S | After splitting names, deduplicate: `names = [...new Set(names.map(n => n.trim()))].filter(Boolean)`. |
| 68 | L24: CLAUDE.md stale file refs | `CLAUDE.md` | S | Remove `StudentProfile.js` and `StudentSessions.js` entries. Add `StudentDetailDrawer.js`, `StudentEditForm.js`, `StudentReadView.js` if they exist. |
| 69 | L29: Dead data routes | `src/routes/data.js` | S | Add comment at top: `// LEGACY: These routes are blocked in multi-tenant mode (JWT_SECRET set). Retained for KV-mode backward compatibility only.` |

---

## Dependencies & Ordering Notes

- **C4 and H1 are coupled**: Fix webhook secret (C4) first, then the logger (H1) — otherwise the new header could still be logged.
- **C5 depends on nothing**: Rate limiting can be added independently.
- **M4 (encryption key separation) should be coordinated with deployment**: Existing encrypted data uses JWT_SECRET-derived key. The fix must be backward-compatible (fall back to JWT_SECRET if ENCRYPTION_KEY not set).
- **Phase 4 items are all independent** and can be parallelised freely.
- **Phase 5 items are all independent** S-effort fixes, ideal for batch cleanup.

## Quick Wins (S effort + High/Critical severity)

These are the fastest critical/high fixes — do them first within each phase:

1. **C4**: Webhook secret → header (S, Critical)
2. **H10**: Password max length check (S, High)
3. **H11**: Remove env key logging (S, High)
4. **H1**: Custom logger to strip query params (S, High)
5. **H2**: Replace `SELECT *` with explicit columns (S, High)
6. **M20**: Truncate raw AI response log (S, Medium)
7. **M12**: Genre mutations → owner only (S, Medium)
8. **H3**: Owner GET user bypass (S, High)
9. **H9**: Org slug auto-increment (S, High)
10. **H8**: MyLogin logout null DB (S, High)
