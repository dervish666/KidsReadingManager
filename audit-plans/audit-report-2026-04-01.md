# Codebase Audit Report — Tally Reading

## Date: 2026-04-01
## Scope: Full codebase (backend, frontend, configuration, dependencies)

---

## Executive Summary

Tally Reading is a multi-tenant SaaS application for tracking student reading progress, built on Cloudflare Workers (Hono) + React 19 + Material-UI v7. This audit examined **every source file** across four parallel workstreams: security, bugs/error-handling, frontend/performance, and completeness/dependencies.

**Overall health: GOOD with targeted weaknesses.** The codebase demonstrates strong fundamentals — parameterized SQL everywhere, proper PBKDF2 hashing with 100K iterations, refresh token rotation with reuse detection, tenant isolation consistently enforced, and zero npm audit vulnerabilities. The main concerns cluster around: (1) a functional gap in the SSO authentication flow, (2) missing rate limiting on cost-sensitive endpoints, (3) frontend performance anti-patterns in the settings page and chart components, and (4) several data integrity edge cases in sync and import operations.

**Finding totals (deduplicated): 5 Critical, 11 High, 23 Medium, 30 Low = 69 findings.**

---

## Critical Issues (Fix Immediately)

### C1. MyLogin SSO callback never delivers access token to frontend
- **Category**: Security — Authentication
- **File**: `src/routes/mylogin.js:286-306`
- **Detail**: The SSO callback generates `tallyAccessToken` (line 286) but the redirect response only sets a refresh cookie and redirects to `/?auth=callback`. The access token is computed and discarded. The frontend must silently call `/api/auth/refresh` to obtain a usable token — a fragile pattern that adds latency, creates a race condition with page load, and means the generated token is wasted.
- **Impact**: All school SSO users hit this path. If the implicit refresh-on-load fails, users appear unauthenticated after a successful login.
- **Fix**: Either deliver the access token via a short-lived server-side session (store in KV keyed by a one-time code in the redirect URL, client fetches and deletes), or explicitly document and harden the refresh-on-load approach with retry logic.

### C2. `readBookIds` can exceed SQLite bind parameter limit (999)
- **Category**: Bug — Edge Case
- **File**: `src/routes/books.js:281-285` (AI suggestions), `src/routes/books.js:282` (library search)
- **Detail**: When building the `NOT IN (${placeholders})` clause for books a student has already read, no chunking is applied. A prolific reader with 500+ books, combined with other query parameters, can exceed D1's `SQLITE_MAX_VARIABLE_NUMBER` limit (typically 999). The `d1Provider.js` correctly chunks at 500, but the route-level code does not.
- **Fix**: Chunk `readBookIds` into batches of 400, or use a CTE/temp table approach matching the pattern in `d1Provider.js:542-548`.

### C3. SettingsPage eagerly instantiates all tab components
- **Category**: Performance — Rendering
- **File**: `src/components/SettingsPage.js:40-70`
- **Detail**: The `tabs` array stores JSX instances (`<Settings />`, `<DataManagement />`, `<AISettings />`, `<SchoolManagement />`, `<UserManagement />`, etc.) in a `useMemo`. Even though only the active tab is rendered, React instantiates all elements — triggering hooks, effects, and API calls in every component on every render. Each tab component makes its own `fetchWithAuth` calls on mount.
- **Impact**: Opening the Settings page fires 6–8 unnecessary API requests and renders 6–8 invisible component trees.
- **Fix**: Store component references (not instances) in the tabs array: `{ component: Settings }` instead of `{ component: <Settings /> }`. Render with `React.createElement(tabs[currentTab]?.component)`.

### C4. Webhook secret transmitted in URL query string
- **Category**: Security — Data Exposure
- **File**: `src/routes/webhooks.js:32-34`
- **Detail**: Wonde webhook authentication uses `?secret=<value>` in the URL. Query parameters appear in Cloudflare access logs, the Hono `logger()` middleware output (worker.js:59), Sentry breadcrumbs, and potentially CDN analytics. The secret is used with `constantTimeStringEqual` (good), but the transmission channel leaks it.
- **Impact**: An attacker who obtains the logged secret could forge `schoolApproved` webhooks to create rogue organizations.
- **Fix**: Switch to an `X-Webhook-Secret` HTTP header. Update the Wonde dashboard webhook URL to exclude the query parameter.

### C5. No rate limiting on cost-sensitive authenticated endpoints
- **Category**: Security — API Security
- **File**: `src/middleware/tenant.js:349-425`, `src/worker.js`
- **Detail**: `authRateLimit()` only covers `/api/auth/*`. No rate limiting on `/api/books/ai-suggestions` (calls Anthropic/OpenAI/Google APIs with per-token costs), `/api/metadata/enrich` (bulk external API calls), `/api/hardcover/graphql` (proxied to Hardcover with org API key), or bulk import endpoints.
- **Impact**: A compromised teacher account could generate unbounded AI API costs, exfiltrate data rapidly, or abuse the Hardcover proxy.
- **Fix**: Apply tiered rate limiting: strict for AI/external calls (e.g., 10/min), moderate for writes (e.g., 60/min), lenient for reads.

---

## High Priority Issues

### H1. Hono logger logs full URLs including secrets
- **Category**: Security — Data Exposure
- **File**: `src/worker.js:59`
- **Detail**: `app.use('/api/*', logger())` logs complete request URLs. Combined with C4, the webhook secret appears in plaintext logs. OAuth state tokens, search terms containing student names, and other query params are also logged.
- **Fix**: Replace `logger()` with a custom logger that strips query parameters or redacts sensitive fields.

### H2. Owner role `SELECT *` includes password_hash in memory
- **Category**: Security — Data Exposure
- **File**: `src/routes/users.js:284-289`
- **Detail**: The `PUT /api/users/:id` handler uses `SELECT * FROM users WHERE id = ?` for the existing user lookup. While `password_hash` is stripped by `rowToUser` before the response, it is loaded into Worker memory unnecessarily. The listing endpoint (lines 33-42) correctly uses explicit columns.
- **Fix**: Replace `SELECT *` with an explicit column list matching the listing query.

### H3. Owner GET user by ID is incorrectly org-scoped
- **Category**: Bug — Access Control
- **File**: `src/routes/users.js:88-97`
- **Detail**: `GET /api/users/:id` always filters by `organization_id`, even for owners. The PUT endpoint correctly differentiates with an owner bypass, but GET does not. An owner viewing a user they created in another organization gets a 404.
- **Fix**: Add an owner bypass: query without `organization_id` filter when `role === 'owner'`.

### H4. Wonde sync non-atomic DELETE + INSERT for employee-class mappings
- **Category**: Bug — Data Integrity
- **File**: `src/services/wondeSync.js:274`
- **Detail**: The sync deletes all `wonde_employee_classes` for the org as a standalone statement, then inserts new mappings in subsequent batches. If the Worker times out or the network fails mid-insert, the table is left partially populated or empty. Teachers lose their class assignments until the next successful sync.
- **Fix**: Include the DELETE in the first INSERT batch so they execute atomically within D1's batch guarantee.

### H5. MyLogin SSO role mapping auto-elevates without approval
- **Category**: Security — Authorization
- **File**: `src/routes/mylogin.js:218-228`
- **Detail**: On each SSO login, the user's Tally role is overwritten from MyLogin's profile type. A school's MyLogin admin could change a student's type to "admin," and the next Tally login would silently grant admin access.
- **Fix**: Log role changes with before/after values. Never auto-elevate to admin — require explicit Tally admin confirmation for privilege increases.

### H6. BookManager fetches full book list redundantly
- **Category**: Performance — Network
- **File**: `src/components/books/BookManager.js:49-59`
- **Detail**: DataContext already fetches `/api/books?all=true&fields=minimal` on initial load. BookManager immediately fetches `/api/books?all=true` again without `fields=minimal`. For 18,000+ books, this doubles the largest network payload.
- **Fix**: Use books from DataContext, or extend DataContext with a `fetchFullBooks()` function that returns full details on demand.

### H7. Stats charts render unbounded DOM without virtualisation
- **Category**: Performance — Rendering
- **Files**: `src/components/stats/ReadingFrequencyChart.js:68`, `src/components/stats/DaysSinceReadingChart.js:98`
- **Detail**: Both charts render one Box per student with no virtualisation. Classes with 100+ students create hundreds of DOM nodes for bars that aren't visible without scrolling.
- **Fix**: Add virtualisation (`react-window`) or limit to top N with a "Show more" toggle.

### H8. MyLogin logout crashes if D1 binding unavailable
- **Category**: Bug — Error Handling
- **File**: `src/routes/mylogin.js:318-330`
- **Detail**: Uses `c.env.READING_MANAGER_DB` directly without null check. The auth.js logout uses `getDB(c.env)` which throws a controlled error. If the D1 binding is temporarily unavailable, this throws an uncaught exception.
- **Fix**: Use `getDB(c.env)` or add a null check before `db.prepare()`.

### H9. Organization creation slug collision returns 409 instead of auto-incrementing
- **Category**: Bug — Data Integrity
- **File**: `src/routes/organization.js:646-661`
- **Detail**: Unlike the registration endpoint (`auth.js:139-149`) which loops to find a unique slug, the org creation endpoint rejects with 409. Also has a TOCTOU race condition between the SELECT check and INSERT.
- **Fix**: Use the same slug-generation loop as `auth.js`, and handle UNIQUE constraint violations gracefully.

### H10. Password change endpoint missing max length validation
- **Category**: Security — Input Validation
- **File**: `src/routes/auth.js:948-959`
- **Detail**: Register and reset-password enforce 128-char max, but the change-password endpoint (`PUT /password`) does not. An extremely long password causes excessive PBKDF2 computation.
- **Fix**: Add `if (newPassword.length > 128)` check.

### H11. Environment variable names logged to console
- **Category**: Security — Information Disclosure
- **File**: `src/utils/email.js:101`
- **Code**: `console.warn('Available env keys:', Object.keys(env || {}).join(', '));`
- **Detail**: Logs all env var names (including `JWT_SECRET`, `STRIPE_SECRET_KEY`, etc.) when no email provider is configured. Visible in Cloudflare Workers logs.
- **Fix**: Replace with `console.warn('No email provider configured.')`.

---

## Medium Priority Issues

### M1. Hardcover GraphQL proxy allows arbitrary read queries
- **Category**: Security — API Security / SSRF
- **File**: `src/routes/hardcover.js:57-78`
- **Detail**: Mutation/subscription check uses a regex on trimmed query start, bypassable with leading comments (`# comment\nmutation { ... }`). Allows arbitrary read queries including introspection.
- **Fix**: Parse the query to extract operation type, or allowlist specific named operations.

### M2. Genres are global, not org-scoped — any admin can mutate
- **Category**: Security — Authorization
- **File**: `src/routes/genres.js:31-47`
- **Detail**: Any admin from any organization can create/update/delete non-predefined genres, affecting all organizations.
- **Fix**: Restrict genre mutation to owner role, or make genres org-scoped with a global predefined set.

### M3. Support ticket creation lacks role-based authorization
- **Category**: Security — Authorization
- **File**: `src/routes/support.js:9-14`
- **Detail**: Only checks `c.get('user')` presence, not role. A deactivated user with an unexpired JWT can submit tickets.
- **Fix**: Add `requireReadonly()` middleware.

### M4. Encryption key derived from JWT secret (single point of failure)
- **Category**: Security — Cryptography
- **File**: `src/utils/crypto.js:496-521`
- **Detail**: AES-GCM encryption key for Wonde tokens and AI API keys is derived from `JWT_SECRET` via HKDF. Compromising one secret compromises all encrypted data.
- **Fix**: Use a separate `ENCRYPTION_KEY` environment variable.

### M5. CORS returns undefined origin for same-origin requests
- **Category**: Security — Configuration
- **File**: `src/worker.js:64-66`
- **Detail**: When no Origin header is present, the handler returns `origin` (which is `undefined`). With `credentials: true`, requests from `file://` origins could theoretically pass.
- **Fix**: Return `null` explicitly for the `!origin` case.

### M6. Stats week/date calculations use UTC, not org timezone
- **Category**: Bug — Edge Case
- **Files**: `src/routes/students.js:353-356`, `src/routes/students.js:421`
- **Detail**: "This week" boundaries use Worker UTC time. `diffDays` uses `Math.ceil` on UTC dates. Schools in UTC+1 see sessions at 11 PM local time counted in the wrong week; students who read "today" may show `diffDays = 1`.
- **Fix**: Compute date boundaries in the org's configured timezone.

### M7. CSV parser does not handle UTF-8 BOM
- **Category**: Bug — Edge Case
- **File**: `src/utils/csvParser.js:9`
- **Detail**: Excel-generated CSVs often start with `\uFEFF`. The BOM would be included in the first header name, breaking column auto-detection.
- **Fix**: Add `csvText = csvText.replace(/^\uFEFF/, '')` before processing.

### M8. D1 batch `result.success` per-item check is misleading
- **Category**: Bug — Error Handling
- **File**: `src/routes/books.js:1492-1508`
- **Detail**: D1 `batch()` is all-or-nothing — it throws on failure rather than returning per-item `success: false`. The per-result `onError` callback never fires.
- **Fix**: Remove per-result success check. Run `onSuccess` for all items in a successful batch.

### M9. Term dates overlap uses `<=` — blocks back-to-back terms
- **Category**: Bug — Edge Case
- **File**: `src/routes/termDates.js:72-77`
- **Detail**: A term starting on the exact end date of the previous term is flagged as overlapping. This may be intentional (gaps for holidays) but is undocumented.
- **Fix**: Clarify intent. If back-to-back terms are valid, use `<` instead of `<=`.

### M10. LIKE patterns in dislikes don't escape `%` and `_`
- **Category**: Bug — Edge Case
- **File**: `src/routes/books.js:288-293`
- **Detail**: User-supplied `dislikes` values used in `NOT LIKE ?` patterns without escaping SQL wildcards. A dislike of `"100%"` matches any title containing `"100"` + anything.
- **Fix**: Escape `%` and `_` in dislike strings before LIKE patterns.

### M11. Metadata config JSON.parse has no error handling
- **Category**: Bug — Error Handling
- **File**: `src/routes/metadata.js:16, 48`
- **Detail**: `JSON.parse(row.provider_chain)` throws unhandled if data is corrupt. The outer try/catch returns a generic 500.
- **Fix**: Wrap in try/catch with a fallback default chain and a descriptive error.

### M12. Registration slug uniqueness has TOCTOU race condition
- **Category**: Bug — Data Integrity
- **File**: `src/routes/auth.js:139-149`
- **Detail**: Between the SELECT that finds no slug and the batch INSERT, a concurrent registration could insert the same slug. The UNIQUE constraint violation surfaces as a generic "Registration failed" 500.
- **Fix**: Handle the UNIQUE constraint violation gracefully with retry or explicit error message.

### M13. DpaConsentModal lacks ARIA attributes for screen readers
- **Category**: Accessibility
- **File**: `src/components/DpaConsentModal.js:87`
- **Detail**: Dialog has `disableEscapeKeyDown` and no `onClose`, creating a keyboard trap. Missing `role="alertdialog"` and `aria-describedby`.
- **Fix**: Add `role="alertdialog"` and `aria-describedby` linking to the body text.

### M14. SupportTicketManager silently swallows all errors
- **Category**: Frontend — Error UX
- **File**: `src/components/SupportTicketManager.js:87-91, 107-110, 154-159, 185-188, 210-212`
- **Detail**: Every catch block either silently fails or reverts optimistic updates with no user feedback.
- **Fix**: Add error state and display Alert/Snackbar on API failures.

### M15. MetadataManagement and BookMetadataSettings duplicate polling logic
- **Category**: Code Quality — DRY
- **Files**: `src/components/BookMetadataSettings.js:38-76`, `src/components/MetadataManagement.js:265-319`
- **Detail**: Nearly identical `startPolling` functions with AbortController, while loops, and progress updates.
- **Fix**: Extract a shared `useEnrichmentPolling` hook.

### M16. Settings save button has no loading/disabled state
- **Category**: Frontend — Error UX
- **File**: `src/components/Settings.js:98-131`
- **Detail**: `handleSaveSettings` is async but the Save button is never disabled during the operation. Users can double-click.
- **Fix**: Add `saving` state, disable button while saving.

### M17. Stripe trial_will_end webhook handler is a stub
- **Category**: Incomplete Feature
- **File**: `src/routes/stripeWebhook.js:182-186`
- **Code**: `// TODO: Send reminder email to school admin`
- **Detail**: Only logs; does not send the intended email. Schools approaching trial expiry get no notification.
- **Fix**: Implement using the existing email utility.

### M18. `node-fetch` used in scripts but not in package.json
- **Category**: Configuration — Missing Dependency
- **Files**: `scripts/migration.js:22`, `scripts/test-api.js:12`
- **Detail**: Both scripts `require('node-fetch')` but it's not listed in dependencies. Scripts fail on fresh install.
- **Fix**: Add as devDependency, or rewrite to use Node's built-in `fetch`.

### M19. Stripe secrets undocumented
- **Category**: Configuration — Documentation
- **Files**: `src/routes/stripeWebhook.js:46`, `src/utils/stripe.js:8`
- **Detail**: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are required but not documented in CLAUDE.md or wrangler.toml.
- **Fix**: Document alongside existing secret documentation.

### M20. Raw AI response logged to console
- **Category**: Security — Information Disclosure
- **File**: `src/services/aiService.js:255, 417`
- **Detail**: `console.error('Raw response:', text)` could log sensitive AI output or student context.
- **Fix**: Truncate to first 200 chars.

### M21. Organization listing LIKE search has no minimum length
- **Category**: Security — API Security
- **File**: `src/routes/organization.js:95-98`
- **Detail**: Single-character `%a%` LIKE patterns with correlated subqueries (student_count, class_count) can be expensive on large datasets.
- **Fix**: Enforce minimum 3-character search term.

### M22. LandingPage IntersectionObserver refs grow unboundedly
- **Category**: Performance — Memory
- **File**: `src/components/LandingPage.js:57-59`
- **Detail**: `revealRefs.current` accumulates elements with O(n) `.includes()` checks on each ref callback.
- **Fix**: Use a `Set` instead of an array, clear on unmount.

### M23. App.js duplicates Suspense fallback three times
- **Category**: Code Quality — DRY
- **File**: `src/App.js:152-213`
- **Detail**: Identical loading spinner for `/privacy`, `/terms`, `/cookies`.
- **Fix**: Extract shared `PageLoadingFallback` component.

---

## Low Priority Issues

### L1. Legacy auth uses SHA-256 instead of HMAC (deprecated mode)
- **File**: `src/middleware/auth.js:16-34`
- **Fix**: Migrate remaining deployments to JWT mode; replace with HMAC if legacy must remain.

### L2. CSRF: body-based refresh token path is a theoretical attack surface
- **File**: `src/routes/auth.js:500-501`
- **Fix**: Remove body-based refresh token fallback once all clients use cookies.

### L3. User export audit log not scoped to organization
- **File**: `src/routes/users.js:700-710`
- **Fix**: Add `AND organization_id = ?` to audit log query.

### L4. Book import allows teacher-level bulk creation of global books
- **File**: `src/routes/books.js:28, 1091`
- **Fix**: Consider requiring admin role for bulk imports.

### L5. Student ID echoed in error messages
- **File**: `src/routes/students.js:479, 539`
- **Fix**: Use generic "Student not found" without echoing the ID.

### L6. OAuth state cleanup uses Math.random() probabilistic execution
- **File**: `src/routes/mylogin.js:62-63`
- **Fix**: Remove; cron cleanup at 2 AM is sufficient.

### L7. Tour ID parameter has no length validation
- **File**: `src/routes/tours.js:24-53`
- **Fix**: Validate max 50 chars, alphanumeric with hyphens.

### L8. Redundant expired-token JS check after SQL already filters
- **File**: `src/routes/auth.js:549-552`
- **Fix**: Remove or add comment explaining clock-skew rationale.

### L9. Infinite loop potential in slug generation
- **File**: `src/routes/auth.js:140-149`
- **Fix**: Add max iteration count (100).

### L10. OpenLibrary subjects may contain irrelevant meta-subjects
- **File**: `src/services/providers/openLibraryProvider.js:56`
- **Fix**: Filter out common meta-subjects before storing.

### L11. Batch student import doesn't deduplicate within the batch
- **File**: `src/routes/students.js:892-928`
- **Fix**: Add name-based dedup within import batch.

### L12. Session creation doesn't verify book belongs to org
- **File**: `src/routes/students.js:1019-1037`
- **Fix**: Verify `bookId` exists in `org_book_selections` for current org.

### L13. User deactivation doesn't clear class_assignments
- **File**: `src/routes/users.js:462-481`
- **Fix**: Add `DELETE FROM class_assignments WHERE user_id = ?`.

### L14. Email HTML uses `7bit` transfer encoding
- **File**: `src/utils/email.js:171-173`
- **Fix**: Use `quoted-printable` or `base64` for HTML part.

### L15. Hardcover parsing has empty catch blocks
- **File**: `src/services/providers/hardcoverProvider.js:101-117`
- **Fix**: Add `console.debug` inside catch blocks.

### L16. Streak timezone fallback is silent
- **File**: `src/utils/streakCalculator.js:13-19`
- **Fix**: Log a warning when fallback is triggered.

### L17. Login component has unused `Tabs`/`Tab` imports
- **File**: `src/components/Login.js:11`
- **Fix**: Remove unused imports.

### L18. UserManagement has unused `fetchOrganizations` function
- **File**: `src/components/UserManagement.js:106-119`
- **Fix**: Remove the dead function.

### L19. BookCoverPlaceholder sets backgroundColor in both `sx` and `style`
- **File**: `src/components/BookCoverPlaceholder.js:43, 53`
- **Fix**: Remove the duplicate from `sx`.

### L20. BookManager `getUniqueReadingLevels()` called on every render
- **File**: `src/components/books/BookManager.js:262-270, 499`
- **Fix**: Wrap in `useMemo` with `[books]` dependency.

### L21. BookManager has duplicate error display
- **File**: `src/components/books/BookManager.js:435-439, 451-455`
- **Fix**: Remove one of the duplicate error displays.

### L22. BulkImport does not deduplicate names within the import
- **File**: `src/components/students/BulkImport.js:69-87`
- **Fix**: Deduplicate the `names` array before import.

### L23. MUI v7 `wrapper` slot on BottomNavigationAction is removed
- **File**: `src/styles/theme.js:289-292`
- **Fix**: Remove the dead `wrapper` override.

### L24. CLAUDE.md references non-existent files
- **Files**: `StudentProfile.js`, `StudentSessions.js` referenced but don't exist
- **Fix**: Update file map.

### L25. `uuid` in production deps, only used in scripts
- **File**: `package.json`
- **Fix**: Move to devDependencies.

### L26. Dead exports: `formatSuccessResponse`, `formatErrorResponse`, `updateLastReadDate`
- **File**: `src/utils/helpers.js:96-162`
- **Fix**: Remove functions and their tests.

### L27. `defaultProvider = null` exported from data/index.js, never imported
- **File**: `src/data/index.js:192-195`
- **Fix**: Remove dead export.

### L28. Orphaned JSDoc block in helpers.js
- **File**: `src/utils/helpers.js:178-185`
- **Fix**: Remove duplicate JSDoc for `fetchWithTimeout`.

### L29. Legacy data routes blocked in production, effectively dead
- **File**: `src/routes/data.js`
- **Fix**: Remove or mark clearly as legacy-only.

### L30. `REACT_APP_API_BASE_URL` defined in Rsbuild config, never referenced
- **File**: `rsbuild.config.mjs:21`
- **Fix**: Remove the unused `define` entry.

---

## Positive Observations

The audit identified several areas of strong practice worth acknowledging:

1. **SQL injection protection**: 100% parameterized queries across all 25+ route files. No string interpolation of user input into SQL.
2. **Password security**: PBKDF2 with 100,000 iterations, random salts, constant-time comparison. Anti-enumeration on login/register/forgot-password.
3. **Refresh token security**: Rotation with reuse detection — if a revoked token is reused, all tokens for that user are revoked.
4. **Encryption at rest**: AES-GCM with HKDF-derived keys for sensitive data (Wonde tokens, AI API keys).
5. **Security headers**: Comprehensive set (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy).
6. **GDPR compliance**: Data export, erasure, processing restriction, AI opt-out, and retention cleanup all implemented.
7. **Account lockout**: 5-attempt lockout for 15 minutes, stored in D1.
8. **Tenant isolation**: `organizationId` scoping consistently applied across data access.
9. **Error sanitisation**: 5xx responses stripped of internal details.
10. **Prototype pollution protection**: Settings validation checks for `__proto__`, `constructor`, `prototype`.
11. **Zero npm vulnerabilities**: `npm audit` clean.

---

## Summary Statistics

| Category | Critical | High | Medium | Low |
|---|---|---|---|---|
| Security — Auth/AuthZ | 1 | 2 | 2 | 2 |
| Security — Data Exposure | 1 | 2 | 1 | 0 |
| Security — API Security | 1 | 0 | 2 | 1 |
| Security — Crypto/Config | 0 | 1 | 2 | 1 |
| Bugs — Logic/Data Integrity | 1 | 3 | 4 | 5 |
| Bugs — Error Handling | 0 | 1 | 2 | 3 |
| Bugs — Edge Cases | 0 | 0 | 4 | 2 |
| Performance — Rendering | 1 | 1 | 1 | 1 |
| Performance — Network | 0 | 1 | 0 | 0 |
| Performance — Memory | 0 | 0 | 1 | 0 |
| Accessibility | 0 | 0 | 1 | 0 |
| Frontend — Error UX | 0 | 0 | 2 | 0 |
| Code Quality / DRY | 0 | 0 | 2 | 8 |
| Configuration / Deps | 0 | 0 | 2 | 4 |
| Incomplete Features | 0 | 0 | 1 | 3 |
| **Totals** | **5** | **11** | **23** | **30** |
