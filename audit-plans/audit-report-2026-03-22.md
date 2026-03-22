# Codebase Audit Report — Tally Reading

## Date: 2026-03-22
## Scope: Full codebase (backend, frontend, utils, services, data layer, config, tests)

---

## Executive Summary

Tally Reading is a well-architected multi-tenant SaaS application with **strong security fundamentals** — constant-time comparisons, proper JWT lifecycle, refresh token hashing, tenant isolation, GDPR compliance, and comprehensive security headers. The codebase is clean with zero TODO/FIXME comments in production code, zero npm audit vulnerabilities, and solid test coverage across most areas.

However, the audit identified **several high-priority issues** that should be addressed before further scaling:

- **5 missing auth middleware gaps** on settings and organization endpoints that could allow unauthorized access in edge cases
- **2 routes that create books without linking them to the organization**, making imported books invisible
- **Webhook secret passed in URL query string**, exposable in logs
- **MyLogin SSO role not synchronized** on subsequent logins, allowing stale elevated privileges
- **Version mismatch** (worker reports 3.19.0, package.json is 3.23.3) affecting Sentry releases
- **Sentry trace sampling at 100%** in production, wasting cost
- **No ESLint** and incomplete CI pipeline
- **Several frontend state management issues** causing stale data or confusing UX

**Total findings: 128** (6 Critical, 17 High, 47 Medium, 58 Low)

---

## Summary Statistics

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Security | 4 | 6 | 8 | 7 | 25 |
| Bugs & Data Integrity | 1 | 6 | 9 | 8 | 24 |
| Missing Auth/Authorization | 0 | 4 | 5 | 1 | 10 |
| Performance | 0 | 0 | 8 | 5 | 13 |
| Code Quality | 0 | 1 | 8 | 15 | 24 |
| Frontend State/UX | 1 | 4 | 5 | 8 | 18 |
| Config & Infrastructure | 0 | 4 | 4 | 6 | 14 |
| Accessibility | 0 | 0 | 2 | 3 | 5 |
| **Totals** | **6** | **17** | **47** | **58** | **128** |

---

## Critical Issues (Fix Immediately)

### SEC-C1. Webhook Secret Passed in URL Query String
**Severity:** Critical | **File:** `src/routes/webhooks.js:31-32`

The Wonde webhook authenticates via `?secret=<value>` in the URL. Query strings are logged by Cloudflare, proxies, and Sentry breadcrumbs.

```js
const url = new URL(c.req.url);
const providedSecret = url.searchParams.get('secret') || '';
```

**Impact:** Secret exposure enables forged webhook calls to create organizations or deactivate schools.
**Fix:** Switch to `X-Webhook-Secret` header or HMAC signature verification on request body.

### SEC-C2. XSS in Password Reset Email via `resetUrl`
**Severity:** Critical | **File:** `src/utils/email.js:35,71,82-83`

The `resetUrl` (built from `baseUrl` + `resetToken`) is interpolated directly into HTML `href` attributes without escaping. The `baseUrl` could contain Host header injection.

```js
const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
// Later:
<a href="${resetUrl}" ...>Reset Password</a>
```

**Fix:** Apply `escapeHtml()` to all URLs in HTML email templates (`resetUrl`, `loginUrl`, `verifyUrl`).

### SEC-C3. XSS in Welcome Email via `loginUrl`
**Severity:** Critical | **File:** `src/utils/email.js:250,294`

Same pattern as SEC-C2 — `loginUrl` unescaped in HTML attributes.

### SEC-C4. MyLogin SSO Role Not Updated on Subsequent Logins
**Severity:** Critical | **File:** `src/routes/mylogin.js:218-224`

When an existing MyLogin user logs in, `name` and `email` are synced but `role` is not. Users demoted in MyLogin retain elevated Tally privileges indefinitely.

```js
if (existingUser) {
  userId = existingUser.id;
  await db.prepare(
    `UPDATE users SET name = ?, email = ?, last_login_at = datetime("now") WHERE id = ?`
  ).bind(name, email, userId).run();
}
// JWT uses existingUser.role — the STALE role
```

**Fix:** Update role on each login based on MyLogin profile type. Log role changes for audit.

### SEC-C5. Rate Limiting Bypassed When Database Is Unavailable
**Severity:** Critical | **File:** `src/middleware/tenant.js:296-299`

When D1 is unavailable, rate limiting silently passes all requests through, including login endpoints.

```js
if (!db) { return next(); }
// Also:
} catch (error) { console.warn('Rate limiting bypassed...'); }
```

**Fix:** Reject requests to sensitive endpoints when rate limiter fails (fail closed). Use Cloudflare WAF rate limiting as defense-in-depth.

### BUG-C1. `bookToRow` Loses Falsy-but-Valid Numeric Values
**Severity:** Critical | **File:** `src/data/d1Provider.js:39-43`

Uses `||` instead of `??`, silently converting `0` values to `null`:

```js
page_count: book.pageCount || null,      // pageCount of 0 → null
series_number: book.seriesNumber || null, // seriesNumber of 0 → null
publication_year: book.publicationYear || null,
```

**Fix:** Use nullish coalescing: `book.pageCount ?? null`

---

## High Priority Findings

### AUTH-H1. `POST /settings` Missing Auth Middleware
**File:** `src/routes/settings.js:119` | In legacy mode, settings can be modified without any authorization check.
**Fix:** Add `requireAdmin()` middleware.

### AUTH-H2. `POST /settings/ai` Missing Auth Middleware
**File:** `src/routes/settings.js:308` | Same issue as AUTH-H1.
**Fix:** Add `requireAdmin()` middleware.

### AUTH-H3. `POST /books` Does Not Link to Organization
**File:** `src/routes/books.js:622-648` | Books created via `POST /books` never get an `org_book_selections` record, making them invisible to the creating organization.
**Fix:** After `addBook()`, insert into `org_book_selections` with current `organizationId`.

### AUTH-H4. `POST /books/bulk` Does Not Link to Organization
**File:** `src/routes/books.js:1001-1125` | Same orphaned-book issue as AUTH-H3 for bulk imports.
**Fix:** Insert `org_book_selections` rows for each created book.

### SEC-H1. Webhook Response Leaks Internal Organization ID
**File:** `src/routes/webhooks.js:91` | Returns `{ success: true, organizationId: orgId }` to external callers.
**Fix:** Return only `{ success: true }`.

### SEC-H2. Refresh Token Rotation Without Reuse Detection
**File:** `src/routes/auth.js:543-546` | If a stolen refresh token is used before the legitimate user, the attacker gets a valid new token. No detection of reuse occurs.
**Fix:** If a revoked refresh token is presented, revoke ALL tokens for that user.

### SEC-H3. Encryption Key Derived from JWT Secret (Single Point of Failure)
**File:** `src/utils/crypto.js:496-521` | `JWT_SECRET` compromise exposes both JWT signing AND encrypted Wonde tokens.
**Fix:** Use a separate `ENCRYPTION_SECRET` environment variable.

### SEC-H4. `decryptSensitiveData` Falls Through to Plaintext
**File:** `src/utils/crypto.js:565-569` | Data without a colon is returned as-is (legacy plaintext fallback). Cannot distinguish unencrypted from corrupted.
**Fix:** Migrate all plaintext tokens, then remove the fallback.

### SEC-H5. Hardcover GraphQL Proxy Forwards Arbitrary Queries
**File:** `src/routes/hardcover.js:50-67` | Any authenticated user can send arbitrary GraphQL (including mutations) through the proxy.
**Fix:** Allowlist specific query patterns or validate query is read-only.

### BUG-H1. Session Update Missing `location` Field
**File:** `src/routes/students.js:1240-1261` | `PUT /:id/sessions/:sessionId` omits `location` from UPDATE.
**Fix:** Add `location = ?` to the UPDATE statement.

### BUG-H2. Session Update Missing `last_read_date` Recalculation
**File:** `src/routes/students.js:1239-1264` | Changing session date doesn't recalculate student's `last_read_date`.
**Fix:** Add the same recalculation query used in the DELETE handler.

### BUG-H3. `classAssignments.js` Doesn't Respect D1 Batch Limit
**File:** `src/utils/classAssignments.js:33-39` | >100 class assignments will exceed D1 batch limit.
**Fix:** Chunk statements into groups of 100.

### BUG-H4. Wonde Employee-Class DELETE+INSERT Not Atomic
**File:** `src/services/wondeSync.js:264-291` | DELETE is in the first batch; if a later batch fails, partial data remains.
**Fix:** Execute DELETE standalone, then batch INSERTs.

### CFG-H1. APP_VERSION Mismatch (3.19.0 vs 3.23.3)
**Files:** `src/worker.js:48`, `src/instrument.js:5` | Health endpoint and Sentry releases report wrong version.
**Fix:** Update both to current version. Add build-time injection.

### CFG-H2. Sentry tracesSampleRate Is 100% in Production
**Files:** `src/worker.js:312`, `src/instrument.js:17` | Every transaction sent to Sentry — costs money, adds overhead.
**Fix:** Set to `0.1` or `0.2`.

### CFG-H3. No ESLint Configuration
**Finding:** No ESLint exists. No lint step in CI.
**Fix:** Add ESLint with React config. Add `npm run lint` to CI.

### FE-H1. `handleRegister` in UserManagement Doesn't Check Response Status
**File:** `src/components/UserManagement.js:138-148` | Shows "User registered successfully" even on 400/500 responses.
**Fix:** Check `response.ok` before showing success.

### FE-H2. SettingsPage Tab Index Broken for Conditional Tabs
**File:** `src/components/SettingsPage.js:119-127` | Non-admin owners see wrong tab content.
**Fix:** Compute tab-to-component mapping dynamically based on rendered tabs.

### FE-H3. HomeReadingRegister Mutates Global Class Filter
**File:** `src/components/sessions/HomeReadingRegister.js:285-296` | Navigating to Home Reading permanently changes the global class filter.
**Fix:** Use a local class selection state within the component.

### FE-H4. Stale Closure in UserManagement/SchoolManagement useEffect
**Files:** `src/components/UserManagement.js:77-80`, `src/components/SchoolManagement.js:55-57` | `fetchWithAuth` may use expired tokens.
**Fix:** Wrap fetch functions in `useCallback` with proper dependencies.

---

## Medium Priority Findings

### Security (Medium)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| SEC-M1 | Legacy auth token uses bare SHA-256, not HMAC | `src/middleware/auth.js:16-33` | Use `crypto.subtle.sign('HMAC', ...)` |
| SEC-M2 | Account lockout duration uses template literal in SQL | `src/routes/auth.js:241` | Use bind parameter |
| SEC-M3 | Prototype pollution check only on top-level keys | `src/utils/validation.js:113-128` | Check nested objects recursively |
| SEC-M4 | Genre ID interpolation in LIKE pattern | `src/data/d1Provider.js:558` | Escape `%`, `_`, `"` in genre IDs |
| SEC-M5 | `GET /books/count` not scoped to organization | `src/routes/books.js:610-614` | Query `org_book_selections` instead |
| SEC-M6 | Ownership check silently passes on DB error | `src/middleware/tenant.js:215-218` | Return 503 on DB failure |
| SEC-M7 | Legacy auth mode has no rate limiting | `src/middleware/auth.js:118`, `src/worker.js:254` | Apply `authRateLimit()` |
| SEC-M8 | Open registration with no CAPTCHA/email verification | `src/routes/auth.js:75` | Add email verification |

### Bugs & Data Integrity (Medium)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| BUG-M1 | N+1 query in `recalculate-streaks` | `src/routes/students.js:1392-1406` | Use bulk `recalculateAllStreaks()` |
| BUG-M2 | Unbounded `readBookIds` in SQL | `src/routes/books.js:281-284` | Chunk or limit book IDs |
| BUG-M3 | `import/confirm` batch error handling logic wrong | `src/routes/books.js:1391-1405` | Simplify D1 batch error handling |
| BUG-M4 | Recommendation cache key missing student ID | `src/utils/recommendationCache.js:22-36` | Add `studentId` to key |
| BUG-M5 | `getFilteredBooks` returns too few after JS exclusion | `src/data/d1Provider.js:543-572` | Increase SQL LIMIT to compensate |
| BUG-M6 | `daysBetween` loses a day at DST boundaries | `src/utils/streakCalculator.js:48-52` | Parse dates as UTC |
| BUG-M7 | Missing `try/catch` around `decryptSensitiveData` | `src/routes/wondeAdmin.js:27` | Wrap with user-friendly error |
| BUG-M8 | Missing `JWT_SECRET` check in wondeAdmin | `src/routes/wondeAdmin.js:27,66` | Guard with existence check |
| BUG-M9 | `isbnLookup.js` no timeout on external fetches | `src/utils/isbnLookup.js:101,128` | Use `fetchWithTimeout` |

### Missing Auth Middleware (Medium)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| AUTH-M1 | `GET /organization` no auth middleware | `src/routes/organization.js:18` | Add `requireReadonly()` |
| AUTH-M2 | `GET /organization/settings` no auth middleware | `src/routes/organization.js:149` | Add `requireReadonly()` |
| AUTH-M3 | `GET /organization/ai-config` no auth middleware | `src/routes/organization.js:258` | Add `requireReadonly()` |
| AUTH-M4 | `GET /organization/stats` no auth middleware | `src/routes/organization.js:95` | Add `requireReadonly()` |
| AUTH-M5 | `GET /settings` no auth middleware | `src/routes/settings.js:73` | Add `requireReadonly()` |

### Frontend (Medium)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| FE-M1 | ErrorBoundary doesn't report to Sentry | `src/components/ErrorBoundary.js:14` | Add `Sentry.captureException()` |
| FE-M2 | QuickEntry Snackbar always shows "success" severity | `src/components/sessions/QuickEntry.js:385` | Track severity in state |
| FE-M3 | Settings doesn't sync localSettings from server | `src/components/Settings.js:50-54` | Add `useEffect` to sync |
| FE-M4 | AssessmentSelector missing keyboard/screen reader support | `src/components/sessions/AssessmentSelector.js:20` | Add role, aria-label, tabIndex |
| FE-M5 | BookImportWizard doesn't reset state on re-open | `src/components/books/BookImportWizard.js:33` | Reset state when `open` transitions |

### Performance (Medium)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| PERF-M1 | No pagination on student list | `src/routes/students.js:189` | Add LIMIT/OFFSET |
| PERF-M2 | BookAutocomplete filters 18K books on keystroke | `src/components/sessions/BookAutocomplete.js:131` | Limit results to 100 |
| PERF-M3 | StudentSessions O(n) book lookup per session | `src/components/sessions/StudentSessions.js:74` | Use `booksMap` |
| PERF-M4 | BookCoverContext writes localStorage on every cache update | `src/contexts/BookCoverContext.js:141` | Debounce writes |
| PERF-M5 | DaysSinceReadingChart recalculates on every render | `src/components/stats/DaysSinceReadingChart.js:60` | Wrap in `useMemo` |
| PERF-M6 | Charts render unbounded student lists | `src/components/stats/ReadingFrequencyChart.js:66` | Add pagination/virtualization |
| PERF-M7 | Redundant AbortController in openLibraryApi | `src/utils/openLibraryApi.js:32-43` | Use `fetchWithTimeout` directly |
| PERF-M8 | `updateLastReadDate` creates Date objects in loop | `src/utils/helpers.js:102-103` | Parse once, compare timestamps |

### Code Quality (Medium)

| ID | Finding | File | Fix |
|----|---------|------|-----|
| CQ-M1 | Client-controlled IDs on create endpoints | `students.js:627`, `classes.js:155`, `genres.js:108` | Always generate server-side |
| CQ-M2 | Duplicate AI config endpoints | `organization.js:306-412`, `settings.js:308-436` | Remove one, extract shared logic |
| CQ-M3 | Duplicate title-matching functions across 3 files | `openLibraryApi.js`, `googleBooksApi.js`, `hardcoverApi.js` | Extract to shared utility |
| CQ-M4 | `normalizeString` strips Unicode letters | `src/utils/stringMatching.js:17` | Use Unicode-aware regex |
| CQ-M5 | `jsonProvider.js` uses CommonJS in ESM project | `src/data/jsonProvider.js:1-2` | Convert to ESM or document |
| CQ-M6 | `bookToRow` loses empty-string values | `src/data/d1Provider.js:33-37` | Use `?? null` for all fields |
| CQ-M7 | Inconsistent error response patterns across routes | Multiple files | Standardize on `throw` pattern |
| CQ-M8 | `uuid` package used in only one file | `src/contexts/AppContext.js:10` | Replace with `crypto.randomUUID()` |

---

## Low Priority Findings

<details>
<summary>Click to expand 58 Low findings</summary>

### Security (Low)
- No max password length enforced (`src/routes/auth.js:100`) — DoS via long passwords
- Password policy doesn't check breached passwords
- `X-Organization-Id` not validated as UUID format (`src/middleware/tenant.js:85`)
- Email case sensitivity inconsistency (`src/routes/users.js:176`)
- No rate limiting on cover proxy (`src/routes/covers.js:25`)
- Sentry DSN hardcoded in `src/instrument.js:4` — move to env var
- Gemini/Google API keys exposed in URLs (`src/services/aiService.js:191`, `src/utils/googleBooksApi.js:40`)

### Bugs (Low)
- `restrict` endpoint doesn't filter `is_active` (`src/routes/students.js:1515`)
- Class filter missing `disabled` check in `GET /sessions` (`src/routes/students.js:240`)
- `DELETE /users/:id` doesn't filter `is_active` (`src/routes/users.js:436`)
- `GET /wonde/status` doesn't filter `is_active` on org (`src/routes/wondeAdmin.js:83`)
- `bookToRow` string fields lose empty strings (`src/data/d1Provider.js:33-37`)
- `csvParser` doesn't handle embedded newlines (`src/utils/csvParser.js:9`)
- `csvParser` doesn't validate pageCount/publicationYear as numbers (`src/utils/csvParser.js:109`)
- `csvParser` column detection false positives with short headers (`src/utils/csvParser.js:75`)
- `studentProfile.js` readBookIds may have duplicates (`src/utils/studentProfile.js:53`)
- Wonde sync deletion count may overcount (`src/services/wondeSync.js:332`)
- Duplicate JSDoc for `fetchWithTimeout` (`src/utils/helpers.js:178-185`)

### Frontend (Low)
- `Login` unused `Tabs`/`Tab` imports (`src/components/Login.js:3`)
- `Login` no rate-limiting indication on 429 (`src/components/Login.js:86`)
- `Login` uses `inputStyles` before declaration (`src/components/Login.js:254,482`)
- `BulkImport` preview uses array index as key (`src/components/students/BulkImport.js:167`)
- `ReadingTimelineChart` uses index as key for dates (`src/components/stats/ReadingTimelineChart.js:226`)
- `SupportTicketManager` uses `window.confirm` (`src/components/SupportTicketManager.js:187`)
- `PrioritizedStudentsList` uses `Math.abs` instead of `Math.max(0,...)` (`src/components/students/PrioritizedStudentsList.js:36`)
- `DataManagement` Snackbar inside Grid container (`src/components/DataManagement.js:327`)
- `AISettings` google/gemini provider name inconsistency (`src/components/AISettings.js:83`)
- `StudentProfile` AI opt-out fires immediately, other changes need Save (`src/components/students/StudentProfile.js:167`)
- `SchoolManagement` table colSpan wrong (`src/components/SchoolManagement.js:310`)
- `StudentTable` memo references unstable functions (`src/components/students/StudentTable.js:147`)
- `AppContext` `refreshAccessToken` missing `clearAuthState` dependency (`src/contexts/AppContext.js:278`)
- `BarcodeScanner` `onScan` dependency causes scanner restart (`src/components/books/BarcodeScanner.js:98`)
- `BookManager`/`BookMetadataSettings` duplicate book fetch (`src/components/books/BookManager.js:58`)
- `NavIcon` not memoized (`src/App.js:44`)
- `Header` renders SupportModal when closed (`src/components/Header.js:323`)
- `App.js` reads `window.location.pathname` during render (`src/App.js:101`)

### Config & Infrastructure (Low)
- No TODO/FIXME/HACK comments in production code (positive finding)
- Zero npm audit vulnerabilities (positive finding)
- E2E test coverage thin (4 spec files, missing book/class/settings flows)
- Test coverage gaps for `data.js`, `hardcover.js`, `signup.js`, `wondeAdmin.js`, `errorHandler.js`
- `start:dev` uses `&` which orphans background process (`package.json:9`)
- `scripts/deploy.sh` referenced in CLAUDE.md but doesn't exist
- Migration numbering anomaly (0028/0029 timestamps swapped)
- `build-and-deploy.sh` dead code and wrong step numbering
- CI only Node 20.x; local is Node 22
- Missing env validation for `MYLOGIN_REDIRECT_URI`, `WONDE_WEBHOOK_SECRET`
- `esbuild`/`undici` overrides undocumented (`package.json:66`)
- `ALLOWED_ORIGINS` trailing slash on workers.dev domain (`wrangler.toml:51`)
- E2E tests default to production URL (`e2e/playwright.config.js:16`)
- `@anthropic-ai/sdk` in dependencies may inflate frontend bundle

### Code Quality (Low)
- Genre permission checks redundant with middleware (`src/routes/genres.js:103`)
- Genre hard delete has no explicit cascade safeguard (`src/routes/genres.js:259`)
- Slug collision not fully prevented (`src/routes/organization.js:650`)
- Duplicate `PUT /organization` endpoints (`src/routes/organization.js:845`)
- `GET /users/:id` doesn't handle owner cross-org access (`src/routes/users.js:87`)
- Support ticket creation uses manual auth check (`src/routes/support.js:11`)
- Missing pagination on ticket list (`src/routes/support.js:92`)
- No limit on term array size (`src/routes/termDates.js:53`)
- Date format validation missing in termDates (`src/routes/termDates.js:57`)
- Missing JSON parse error handling in hardcover proxy (`src/routes/hardcover.js:66`)
- `DEFAULT_DATA` timestamp evaluated at module load (`src/services/kvService.js:20`)
- KV fallback `searchBooks` is O(n) (`src/data/index.js:123`)
- `validateBook` doesn't validate ISBN format (`src/utils/validation.js:305`)
- Hardcover API key sent in request body to proxy (`src/utils/hardcoverApi.js:52`)

</details>

---

## Positive Observations

The audit found many areas of strong implementation:

1. **Constant-time comparisons everywhere** — password verification, JWT signatures, webhook secrets, refresh tokens all use `constantTimeEqual` (`src/utils/crypto.js:336-356`)
2. **Timing-safe login** — dummy `hashPassword()` on unknown users prevents email enumeration (`src/routes/auth.js:360`)
3. **Refresh tokens hashed in DB** — SHA-256 hashes, not plaintext (`src/utils/crypto.js:228-233`)
4. **HttpOnly, SameSite=Strict, Secure cookies** — proper cookie flags (`src/utils/crypto.js:241-250`)
5. **Comprehensive security headers** — CSP, HSTS, X-Frame-Options DENY, etc. (`src/worker.js:99-133`)
6. **Table name whitelist** in ownership middleware prevents dynamic table injection (`src/middleware/tenant.js:164-174`)
7. **5xx error sanitization** — internal details never leaked to clients (`src/middleware/errorHandler.js:17-20`)
8. **GDPR compliance** — 90-day audit log anonymization, SAR export, right to erasure (`src/worker.js:388-427`, `src/routes/users.js:487-574`)
9. **Account lockout** with configurable thresholds (`src/routes/auth.js:228-306`)
10. **Prototype pollution protection** on settings (`src/utils/validation.js:113-128`)
11. **Wonde tokens encrypted with AES-GCM** using HKDF-derived keys (`src/utils/crypto.js:529-551`)
12. **Password change invalidates all sessions** — all refresh tokens revoked (`src/routes/auth.js:828-834`)
13. **1MB body size limit** applied globally (`src/worker.js:55`)
14. **Zero npm vulnerabilities** and zero TODO/FIXME in production code
15. **Solid test coverage** — 39 test files covering auth, crypto, routes, components, and integration flows
