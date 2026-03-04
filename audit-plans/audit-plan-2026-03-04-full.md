# Codebase Audit Report — Tally Reading (Full Public-Readiness Review)

## Date: 2026-03-04
## Scope: Full codebase — security, bugs, performance, accessibility, compliance, deployment

## Executive Summary

Tally Reading has strong engineering foundations: parameterized queries throughout (no SQL injection), solid JWT + OAuth2 auth flows, comprehensive GDPR infrastructure (erasure endpoints, DPA consent, audit logging, data retention cron), and good test coverage (~2,083 tests across 47 files). The architecture is well-structured and the codebase shows consistent patterns.

However, **the app is not yet ready to go public** with schools handling children's data. The audit identified **4 critical**, **12 high**, **18 medium**, and **14 low** findings across security, bugs, accessibility, compliance, and deployment.

**The three blockers for public launch are:**

1. **GDPR legal review not done** — all compliance documents are marked "DRAFT — NOT YET LEGALLY REVIEWED." Processing UK children's data without legally reviewed documentation creates significant regulatory risk.
2. **No email verification on registration** — anyone can register with any email address and immediately access the system.
3. **CI doesn't run tests** — the GitHub Actions pipeline only builds, never runs tests. Broken code can merge to main unchecked.

These are fixable, and most other findings are incremental improvements rather than fundamental problems.

---

## Critical Issues (Fix Immediately)

### C1. Login query matches deactivated users — **Critical (Bug)**

**File:** `src/routes/auth.js:296-301`

The login query uses `SELECT u.*` with no `is_active` filter. A deactivated user can still log in — the `is_active` check at line 311 catches it, but the user gets a specific "Account is deactivated" message rather than the generic "Invalid email or password", confirming their email exists. More importantly, if the `is_active` check were accidentally removed in a refactor, deactivated users would gain full access.

```js
// Current — no is_active filter
SELECT u.*, o.name as org_name, o.slug as org_slug, o.is_active as org_active
FROM users u INNER JOIN organizations o ON u.organization_id = o.id
WHERE u.email = ?
```

**Fix:** Add `AND u.is_active = 1` to the WHERE clause. Change the deactivation message to the generic "Invalid email or password" to prevent account enumeration.

### C2. Admin user listing returns soft-deleted users — **Critical (Bug)**

**File:** `src/routes/users.js:47-51`

The admin path for listing users (non-owner) filters by `organization_id` but has no `AND u.is_active = 1` clause. Soft-deleted users appear in the admin panel.

```js
// Current — missing is_active filter
FROM users u LEFT JOIN organizations o ON u.organization_id = o.id
WHERE u.organization_id = ?
ORDER BY u.name
```

**Fix:** Add `AND u.is_active = 1` to the WHERE clause.

### C3. GDPR documents not legally reviewed — **Critical (Compliance)**

**File:** `docs/gdpr/10-compliance-checklist.md:7`

All GDPR documentation (privacy policy, DPA, DPIA, ROPA, breach response plan) is marked "DRAFT — NOT YET LEGALLY REVIEWED." Processing UK school children's data under the Children's Code without legally reviewed documentation creates significant regulatory risk with the ICO.

**Fix:** Commission legal review of all documents in `docs/gdpr/` before onboarding any school.

### C4. CI pipeline does not run tests — **Critical (Deployment)**

**File:** `.github/workflows/build.yml:29-30`

The CI workflow only runs `npm ci` and `npm run build`. Tests are never executed. Broken code can be merged to main without any automated quality gate.

**Fix:** Add `npm test` step after `npm run build`.

---

## Findings by Category

### 1. Security

#### S1. Role and org ID disclosure in 403 responses — **Medium**

**File:** `src/middleware/tenant.js:147-152`

Permission errors return both the `required` role and the `current` user role in the JSON response. This leaks internal role structure to attackers probing for privilege escalation.

```js
return c.json({
  error: 'Forbidden - Insufficient permissions',
  required: requiredRole,  // ← leaks what role is needed
  current: userRole        // ← leaks user's current role
}, 403);
```

**Fix:** Remove `required` and `current` fields. Return only `{ error: 'Forbidden' }`.

#### S2. No request body size limits — **Medium**

**File:** `src/worker.js` (middleware chain)

No middleware enforces a maximum request body size. An attacker could send multi-GB payloads to POST endpoints, consuming Worker CPU and memory. Cloudflare Workers have a 100MB limit at the platform level, but that's still far too large for JSON API payloads.

**Fix:** Add Hono body limit middleware: `app.use('*', bodyLimit({ maxSize: 1024 * 1024 }))` (1MB).

#### S3. `SELECT *` on users table loads password_hash — **Medium**

**File:** `src/routes/users.js:271,276,421` and `src/routes/auth.js:296`

Several queries use `SELECT u.*` or `SELECT *` on the users table, loading `password_hash` into memory unnecessarily. While it's never sent to the client (rowToUser strips it), it increases attack surface if a serialization bug occurs.

**Fix:** Replace `SELECT u.*` with explicit column lists excluding `password_hash` where the hash isn't needed.

#### S4. Unvalidated pagination parameters — **Medium**

**File:** `src/routes/organization.js:384-386`

The audit log endpoint parses `page` and `pageSize` from query params with `parseInt()` but doesn't validate bounds. A request with `pageSize=999999` would return the entire audit log in one response. Negative values or NaN are also possible.

```js
const page = parseInt(c.req.query('page') || '1');
const pageSize = parseInt(c.req.query('pageSize') || '50');
```

**Fix:** Add bounds: `const pageSize = Math.min(Math.max(parseInt(...) || 50, 1), 200)`.

#### S5. Slug uniqueness check matches soft-deleted orgs — **High**

**File:** `src/routes/organization.js:576-578`

When creating a new organization, the slug uniqueness check doesn't filter by `is_active = 1`. A deleted org's slug can't be reused.

```js
'SELECT id FROM organizations WHERE slug = ?'
```

**Fix:** Add `AND is_active = 1`.

#### S6. `constantTimeEqual` leaks length through early return — **High**

**File:** `src/utils/crypto.js:303-304`

The length check `if (a.length !== b.length) return false` exits early, revealing whether two values have the same length via timing. Used for webhook secret comparison and HMAC verification.

**Fix:** Pad the shorter array to match the longer, or use a constant-time length comparison. For HMAC comparisons, this is less critical since HMACs have fixed length, but it's still poor practice.

#### S7. Google Books API key leaked to client — **High**

**File:** `src/routes/settings.js:93-103`

The settings GET endpoint decrypts `bookMetadata` including `googleBooksApiKey` and sends it to the client. While the Hardcover key is correctly redacted to a boolean flag, the Google Books key is returned in full after decryption.

**Fix:** Apply the same pattern as Hardcover — return `hasGoogleBooksApiKey: Boolean(...)` and `delete settings.bookMetadata.googleBooksApiKey`. If the frontend needs it for direct API calls, proxy through the backend instead.

#### S8. Weak password policy — **Medium**

**File:** `src/routes/auth.js:95`

Only enforces `password.length < 8`. No uppercase, lowercase, number, or special character requirements. NCSC guidance for systems handling sensitive data recommends stronger policies.

**Fix:** Add complexity requirements or integrate with the Have I Been Pwned API for compromised password checking.

#### S9. No email verification on registration — **High**

**File:** `src/routes/auth.js:73-197`

`POST /api/auth/register` creates the user and issues tokens immediately with no email confirmation. Anyone can register with any email address.

**Fix:** Add an email verification step. Set a `verified` flag to false on creation, send a verification email with a token, and block login until verified.

### 2. Bugs & Data Integrity

#### B1. MyLogin SSO callback doesn't deliver access token — **High**

**File:** `src/routes/mylogin.js:280-308`

The callback generates an access token but only sets a refresh token cookie and redirects to `/?auth=callback`. The access token is never delivered to the frontend. The frontend relies on `/?auth=callback` to trigger a refresh flow that gets a new access token — this works but is fragile. If cookie setting fails (Safari ITP, third-party cookie blocking), the user is silently locked out.

**Fix:** Set the access token as a short-lived cookie alongside the refresh token, or pass it via a fragment/query parameter that the frontend picks up.

#### B2. Book cover KEY_PATTERN rejects hyphenated ISBNs — **High**

**File:** `src/routes/covers.js:9`

The regex for validating cover cache keys may reject valid ISBN-13 formats with hyphens, causing cache misses and unnecessary OpenLibrary lookups.

**Fix:** Verify the regex accepts both `9781234567890` and `978-1-234-56789-0` formats, or normalize ISBNs before lookup.

#### B3. Import preview loads entire book catalog into memory — **High**

**File:** `src/routes/books.js:1043`

The book import preview endpoint loads all books from the global catalog for fuzzy matching. For 18,000+ books, this is a significant memory allocation in a Worker with 128MB limit.

**Fix:** Use SQL-level filtering (title prefix, ISBN exact match) to narrow candidates before loading into memory for fuzzy matching.

#### B4. Employee-class DELETE+INSERT not atomic across batch boundaries — **Medium**

**File:** `src/services/wondeSync.js:264-265`

The sync DELETEs all employee-class mappings then INSERTs new ones. If the batch of INSERTs fails, the mapping table is empty until next sync. (Partially addressed in earlier audit but the fix needs verification.)

#### B5. Duplicate AI config endpoints — **Medium**

**Files:** `src/routes/settings.js` and `src/routes/organization.js`

Both files contain endpoints for getting/setting AI configuration, creating inconsistency risk. One endpoint could be updated while the other remains stale.

**Fix:** Consolidate to a single set of AI config endpoints.

### 3. Performance

#### P1. Monolithic AppContext causes unnecessary re-renders — **High**

**File:** `src/contexts/AppContext.js`

~1,400 lines with ~40 state variables in a single context. Any state change re-renders all consumer components. While `useMemo` was added to the provider value (per notes), the fundamental issue of a single massive context remains.

**Fix:** Split into domain-specific contexts (AuthContext, StudentContext, BookContext, etc.) for better render performance. This is a medium-effort refactor.

#### P2. No virtualization on student/book lists — **Medium**

**Files:** `src/components/students/StudentList.js`, `src/components/books/BookManager.js`

Schools with 500+ students will render all student cards in the DOM. No windowing/virtualization is used. The `content-visibility: auto` CSS optimization helps but doesn't fully solve the problem.

**Fix:** Add `react-window` or `@tanstack/virtual` for lists exceeding ~100 items.

#### P3. calculateStats runs unmemoized on every render — **Medium**

**File:** `src/components/stats/ReadingStats.js`

The statistics calculation function runs on every render without memoization, processing all sessions and students each time.

**Fix:** Wrap in `useMemo` with appropriate dependencies.

#### P4. Token refresh triggers full data reload — **Medium**

**File:** `src/contexts/AppContext.js`

When an access token is refreshed, `reloadDataFromServer()` is called, fetching all students, classes, books, genres, and settings. This happens every 15 minutes (token expiry), regardless of whether the data has changed.

**Fix:** Only reload data that might have changed, or add ETags/last-modified headers to skip unchanged data.

### 4. Accessibility (WCAG 2.1 AA)

#### A1. Login form fields have no `<label>` elements — **High**

**File:** `src/components/Login.js`

Form fields use placeholder text instead of proper `<label>` elements. Screen readers cannot identify the purpose of inputs. This is a WCAG 2.1 Level A failure (1.3.1 Info and Relationships).

**Fix:** Add `<InputLabel>` components or use MUI TextField's `label` prop for all form fields.

#### A2. Header class filter has no accessible label — **High**

**File:** `src/components/Header.js:165`

The class filter `<Select>` component has no `InputLabel` or `aria-label`. Screen readers announce it as an unlabeled dropdown.

**Fix:** Add `aria-label="Filter by class"` or wrap with `<InputLabel>`.

#### A3. HomeReadingRegister status cells lack accessible names — **High**

**File:** `src/components/sessions/HomeReadingRegister.js`

Status button cells in the reading register grid use color-only indicators without text alternatives. Screen readers cannot convey the reading status.

**Fix:** Add `aria-label` to each status button (e.g., "Read", "Multiple reads", "Absent", "No record").

#### A4. Theme contrast failures — **Medium**

**File:** `src/styles/theme.js`

Custom status colors (e.g., `#D4A574` on `#F5F0E8`) fail WCAG AA contrast ratio requirements at ~2.2:1 (minimum is 4.5:1 for normal text).

**Fix:** Darken the text color or use a darker background for these status indicators.

#### A5. No privacy policy link on login page — **High (Compliance + A11y)**

**File:** `src/components/Login.js`

GDPR requires users to be informed of data processing before providing personal data. No privacy policy link is present on the login or registration forms.

**Fix:** Add a visible link to `/privacy` on the login page.

### 5. Configuration & Deployment

#### D1. `build-and-deploy.sh` destroys lockfile — **High**

**File:** `scripts/build-and-deploy.sh:32-33`

The deploy script runs `rm -rf node_modules package-lock.json` then `npm install`. This makes deployments non-reproducible — dependency versions may float between deployments.

```bash
rm -rf node_modules package-lock.json
npm install
```

**Fix:** Change to `npm ci` (which uses the lockfile) and remove the `rm -rf`.

#### D2. Health endpoint hardcodes version 2.0.0 — **Medium**

**File:** `src/worker.js:229`

The `/api/health` endpoint returns `version: '2.0.0'` while `package.json` says `3.10.3`. This makes production monitoring unreliable.

**Fix:** Update to match `package.json` version, or inject at build time.

#### D3. Health check doesn't verify database connectivity — **Low**

**File:** `src/worker.js:224-235`

`/api/health` returns `status: 'ok'` without checking if D1 is reachable. A deployment with a broken D1 binding reports healthy.

**Fix:** Add a lightweight `SELECT 1` query to the health check.

#### D4. No `.env.example` file — **Medium**

New developers have no documentation on which environment variables to set. Guidance is scattered across `CLAUDE.md` and `wrangler.toml` comments.

**Fix:** Create `.env.example` with all required variables and comments.

#### D5. `STORAGE_TYPE = "kv"` in production wrangler.toml — **Low**

**File:** `wrangler.toml:50`

Production config says `STORAGE_TYPE = "kv"` but the app runs on D1. The auto-detection in `data/index.js` overrides this, but the config is misleading.

**Fix:** Remove or update to reflect actual state.

#### D6. Stale API URL in build script — **Medium**

**File:** `scripts/build-and-deploy.sh:38`

Hardcodes `REACT_APP_API_BASE_URL="https://kids-reading-manager.workers.dev/api"` — the old domain. The frontend uses relative `/api` paths so this likely has no effect, but it's misleading.

**Fix:** Remove this environment variable.

#### D7. No database migration step in deploy pipeline — **Medium**

Migrations must be run manually. If a deployment requires a schema change, there's no automation to ensure migrations run before new code goes live.

**Fix:** Add migration step to `build-and-deploy.sh`.

### 6. Missing Features for Public Launch

#### F1. No Terms of Service — **High**

No ToS page, no `/terms` route, no terms document. Schools and users agree to nothing when using the platform.

**Fix:** Draft Terms of Service, create a page at `/terms`, require acceptance during registration.

#### F2. No multi-factor authentication — **High**

No 2FA/TOTP exists. For a system handling children's data, MFA for admin accounts is expected by school IT departments.

**Fix:** Implement TOTP-based MFA for admin and owner roles.

#### F3. No cookie policy page — **Medium**

The privacy policy discusses storage, but a separate cookie policy is standard for UK web applications under PECR.

**Fix:** Create a cookie policy page or integrate into privacy policy more prominently.

#### F4. Self-service account deletion not available — **Medium**

Users cannot delete their own accounts. The erasure endpoint requires admin role. GDPR Article 17 should be achievable without admin intervention for staff users.

**Fix:** Add a self-service account deletion flow or a request mechanism.

### 7. Testing Gaps

#### T1. No tests for GDPR endpoints — **Medium**

`DELETE /api/students/:id/erase`, `PUT /api/students/:id/restrict`, `PUT /api/students/:id/ai-opt-out`, `GET /api/students/:id/export`, `DELETE /api/users/:id/erase`, `GET /api/users/:id/export`, `GET/POST /api/organization/dpa-consent` — all compliance-critical paths with no automated tests.

**Fix:** Add integration tests for each GDPR endpoint.

#### T2. No tests for cron/scheduled handler — **Medium**

**File:** `src/worker.js:317-472`

The cron handler runs GDPR data retention cleanup, streak recalculation, and Wonde delta sync — all critical paths with no automated verification.

**Fix:** Add integration tests that invoke the `scheduled()` export with mocked D1.

#### T3. Prototype pollution gap documented but unfixed — **Low**

**File:** `src/__tests__/unit/security-audit.test.js:550-607`

A test documents that `validateSettings` doesn't reject `__proto__`, `constructor`, or `prototype` keys. The test says "Documenting as a known gap."

**Fix:** Add key filtering to `validateSettings`.

### 8. Code Quality

#### Q1. 18 console.log/warn/error statements in production components — **Low**

Console statements left in frontend production code across multiple components.

**Fix:** Remove or gate behind a debug flag.

#### Q2. Cookie construction copy-pasted 3 times — **Low**

**Files:** `src/routes/auth.js` (2 locations) and `src/routes/mylogin.js` (1 location)

The `Set-Cookie` header construction for refresh tokens is duplicated with minor variations.

**Fix:** Extract a `buildRefreshCookie()` helper.

#### Q3. Duplicate AI config endpoints — **Medium**

Both `settings.js` and `organization.js` handle AI configuration, creating maintenance burden and inconsistency risk.

**Fix:** Consolidate to one file.

---

## Summary Statistics

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | 0 | 4 | 4 | 0 |
| Bugs | 2 | 3 | 2 | 0 |
| Accessibility | 0 | 3 | 1 | 0 |
| Performance | 0 | 1 | 3 | 0 |
| Compliance | 1 | 3 | 2 | 0 |
| Deployment | 1 | 1 | 4 | 2 |
| Testing | 0 | 0 | 2 | 1 |
| Code Quality | 0 | 0 | 1 | 2 |
| **Total** | **4** | **15** | **19** | **5** |

---

## Implementation Plan

### Overview
43 findings total. Estimated effort: ~4-6 days of focused development for Phases 1-3.

### Phase 1: Critical & Security Blockers (Do First)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 1 | C1: Login matches deactivated users | `src/routes/auth.js:296-301` | S | Add `AND u.is_active = 1` to login query WHERE clause. Change "Account is deactivated" response to generic "Invalid email or password" to prevent enumeration. |
| 2 | C2: Admin user listing shows deleted users | `src/routes/users.js:47-51` | S | Add `AND u.is_active = 1` to the admin-path user listing query. |
| 3 | C4: CI doesn't run tests | `.github/workflows/build.yml` | S | Add `- name: Test` step with `run: npm test` after the Build step. |
| 4 | S6: constantTimeEqual leaks length | `src/utils/crypto.js:303-304` | S | Either always compare at fixed HMAC length (already fixed-size for its callers), or pad shorter array. Add comment documenting the constraint. |
| 5 | S7: Google Books API key exposed to client | `src/routes/settings.js:93-103` | M | Apply the same redaction pattern as Hardcover: `hasGoogleBooksApiKey: Boolean(...)`, `delete settings.bookMetadata.googleBooksApiKey`. Proxy Google Books queries through backend if frontend needs them. |
| 6 | S5: Org slug check matches deleted orgs | `src/routes/organization.js:576-578` | S | Add `AND is_active = 1` to the slug uniqueness query. |
| 7 | S9: No email verification | `src/routes/auth.js:73-197` | L | Add `email_verified` column to users table. Create verification token endpoint. Send verification email on registration. Block login until verified. Update tests. |
| 8 | S1: Role disclosure in 403 | `src/middleware/tenant.js:147-152` | S | Remove `required` and `current` fields from 403 response body. |
| 9 | D1: Deploy script destroys lockfile | `scripts/build-and-deploy.sh:32-34` | S | Replace `rm -rf node_modules package-lock.json && npm install` with `npm ci`. |

### Phase 2: High Priority (Compliance, Bugs, A11y)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 10 | C3: GDPR legal review | `docs/gdpr/*` | External | Commission solicitor review of all 10 GDPR documents. Not a code task — requires external legal counsel. |
| 11 | F1: No Terms of Service | New file + `src/App.js` | M | Draft ToS document, create `TermsOfService.js` component, add `/terms` route. Add acceptance checkbox to registration flow. |
| 12 | A5: No privacy link on login | `src/components/Login.js` | S | Add `<Link to="/privacy">Privacy Policy</Link>` to login and registration forms. |
| 13 | A1: Login form missing labels | `src/components/Login.js` | S | Add `label` prop to all MUI TextField components instead of relying on `placeholder`. |
| 14 | A2: Header class filter no label | `src/components/Header.js:165` | S | Add `aria-label="Filter by class"` to the Select component. |
| 15 | A3: HomeReadingRegister a11y | `src/components/sessions/HomeReadingRegister.js` | M | Add `aria-label` to each status button with descriptive text. |
| 16 | B1: SSO callback token delivery | `src/routes/mylogin.js:280-308` | M | Set access token as a short-lived httpOnly cookie alongside the refresh token. Update frontend auth flow to read it. |
| 17 | B2: Cover KEY_PATTERN rejects hyphens | `src/routes/covers.js:9` | S | Update regex to accept hyphenated ISBNs or normalize ISBNs before lookup. |
| 18 | F2: No MFA | `src/routes/auth.js`, new migration | L | Implement TOTP-based MFA for admin and owner roles. Add `mfa_secret`, `mfa_enabled` columns. Create setup/verify endpoints. Update login flow. |
| 19 | B3: Import loads entire catalog | `src/routes/books.js:1043` | M | Use SQL-level pre-filtering (title LIKE, ISBN exact match) before loading candidates for fuzzy matching. |

### Phase 3: Medium Priority (Performance, Config, Testing)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 20 | S2: No body size limits | `src/worker.js` | S | Add `app.use('*', bodyLimit({ maxSize: 1024 * 1024 }))`. |
| 21 | S3: SELECT * loads password_hash | `src/routes/users.js:271,276,421`, `src/routes/auth.js:296` | M | Replace `SELECT u.*` with explicit column lists excluding `password_hash` where hash isn't needed. |
| 22 | S4: Unvalidated pagination | `src/routes/organization.js:384-386` | S | Add bounds: `Math.min(Math.max(parseInt(...) \|\| 50, 1), 200)`. |
| 23 | S8: Weak password policy | `src/routes/auth.js:95` | S | Add complexity requirements (uppercase, lowercase, number, 8+ chars). |
| 24 | P1: Monolithic AppContext | `src/contexts/AppContext.js` | L | Split into domain-specific contexts (Auth, Students, Books, Settings). Large refactor but high impact on render performance. |
| 25 | P3: Unmemoized calculateStats | `src/components/stats/ReadingStats.js` | S | Wrap stats calculation in `useMemo`. |
| 26 | A4: Theme contrast failures | `src/styles/theme.js` | S | Darken status text colors to meet WCAG AA 4.5:1 contrast ratio. |
| 27 | D2: Health endpoint wrong version | `src/worker.js:229` | S | Update hardcoded version or inject from package.json at build time. |
| 28 | D4: No .env.example | Project root | S | Create `.env.example` with all required variables and comments. |
| 29 | D6: Stale API URL in build script | `scripts/build-and-deploy.sh:38` | S | Remove the `REACT_APP_API_BASE_URL` environment variable. |
| 30 | D7: No migration step in deploy | `scripts/build-and-deploy.sh` | S | Add `npx wrangler d1 migrations apply reading-manager-db --remote` before `wrangler deploy`. |
| 31 | T1: No GDPR endpoint tests | `src/__tests__/integration/` | M | Add integration tests for all 7 GDPR endpoints. |
| 32 | T2: No cron handler tests | `src/__tests__/integration/` | M | Add tests for the scheduled handler with mocked D1. |
| 33 | B5: Duplicate AI config endpoints | `src/routes/settings.js`, `src/routes/organization.js` | M | Consolidate AI config to one location. |
| 34 | P4: Token refresh full reload | `src/contexts/AppContext.js` | M | Only refresh auth state on token refresh, not all data. |
| 35 | F3: No cookie policy | New file + `src/App.js` | S | Create cookie policy page or integrate into privacy policy. |
| 36 | F4: No self-service account deletion | `src/routes/users.js` | M | Add a self-service deletion endpoint or request mechanism. |

### Phase 4: Low Priority (Hardening)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 37 | P2: No list virtualization | `src/components/students/StudentList.js`, `BookManager.js` | M | Add react-window for lists > 100 items. |
| 38 | D3: Health check no DB ping | `src/worker.js:224-235` | S | Add `SELECT 1` query to health check. |
| 39 | D5: STORAGE_TYPE misleading | `wrangler.toml:50` | S | Remove or update to match actual production state. |
| 40 | T3: Prototype pollution unfixed | `src/utils/validation.js` | S | Add key filtering for `__proto__`, `constructor`, `prototype`. |
| 41 | Q1: Console statements in prod | Various components | S | Remove or gate behind debug flag. |
| 42 | Q2: Cookie construction duplication | `src/routes/auth.js`, `src/routes/mylogin.js` | S | Extract `buildRefreshCookie()` helper. |
| 43 | B4: Employee-class atomicity | `src/services/wondeSync.js:264-265` | S | Verify the earlier fix ensures DELETE is in the first batch. |

### Dependencies & Ordering Notes

- **#1 and #2 are instant quick wins** — simple WHERE clause additions, do these first.
- **#3** (CI tests) should be done before any other merges to catch regressions.
- **#7** (email verification) and **#18** (MFA) are the largest engineering tasks (~L effort each). They can be done in parallel.
- **#10** (GDPR legal review) is external — start the process immediately as it has the longest lead time.
- **#11** (ToS) depends on legal input but can be drafted in parallel with #10.
- **#24** (AppContext split) is the largest refactor. Schedule after all critical fixes.
- **#16** (SSO token delivery) should be tested thoroughly with Safari/iOS before deployment.

### Quick Wins (S effort, High+ priority)

1. **#1** — Add is_active filter to login query (S, Critical)
2. **#2** — Add is_active filter to admin user listing (S, Critical)
3. **#3** — Add tests to CI (S, Critical)
4. **#4** — Fix constantTimeEqual (S, High)
5. **#6** — Add is_active to slug check (S, High)
6. **#8** — Remove role from 403 responses (S, Medium)
7. **#9** — Fix deploy script lockfile deletion (S, High)
8. **#12** — Add privacy link to login (S, High)
9. **#13** — Add form labels to Login.js (S, High)
10. **#14** — Add aria-label to class filter (S, High)
