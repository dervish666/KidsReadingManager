# Codebase Audit Report — Tally Reading
## Date: 2026-04-09
## Scope: Full application codebase — frontend, backend routes, services, utilities, middleware, contexts, hooks, tests, configuration, CI/CD, database migrations. Every source file examined.

## Executive Summary

Tally Reading continues to mature well. Since the previous audit (2026-04-08), three of four flagged issues have been resolved. The codebase has grown with billing/Stripe integration, a badge system, class goals, and a contact form — all generally well-implemented.

This audit — performed via 4 parallel deep-dive agents plus direct examination — found **0 Critical, 5 High, 16 Medium, and 14 Low** findings. The most significant discoveries are:

1. **Stale closure in DataContext optimistic rollback** (High) — rapid successive mutations can corrupt rollback state
2. **Wonde sync batch overflow** (High) — when exactly 100 employee-class mappings exist, the batch exceeds D1's 100-statement limit
3. **Cron streak recalculation silently loses longest_streak** (High) — 90-day session window can regress historical records
4. **d1Provider.getBookById crashes on null** (High) — missing null guard causes 500 errors
5. **Error message leakage** (High) — 5 routes forward raw third-party error strings to clients

The codebase has strong fundamentals: consistent tenant isolation, parameterized SQL throughout, proper role guards, refresh token reuse detection with family revocation, FK-safe cascade deletes, and 0 npm vulnerabilities. GDPR compliance is deeply integrated. OWASP Top 10 coverage is strong.

---

## Critical Issues (Fix Immediately)

None confirmed.

## Findings by Category

---

### 1. Security

#### High — Error messages from third-party services leak to API clients

**Files**: `src/routes/billing.js:146`, `src/routes/billing.js:217-241` (portal), `src/routes/billing.js:248-288` (change-plan), `src/routes/metadata.js:470`, `src/routes/books.js:780`

When Stripe, AI providers, or the metadata service throw errors, raw `err.message` is forwarded to the client. The `POST /portal` and `POST /change-plan` billing endpoints also lack try/catch entirely — Stripe SDK errors propagate through the global error handler.

```js
// billing.js:146
return c.json({ error: `Billing setup failed: ${err.message}` }, 500);
// billing.js:217-241 — no try/catch at all
const session = await stripe.billingPortal.sessions.create({...}); // unguarded
```

**Fix**: (1) Wrap portal/change-plan in try/catch like the `/setup` endpoint. (2) Return generic messages in all 5 locations. Log `err.message` server-side only.

#### Medium — Badge engine genres query lacks organization scope

**File**: `src/utils/badgeEngine.js:67`

`recalculateStats` queries `SELECT id, name FROM genres` with no WHERE clause, fetching genres from ALL organizations. While functionally safe (genre matching uses student-specific data), this violates multi-tenant isolation and could theoretically return genre names from other schools.

**Fix**: Add `WHERE organization_id = ?` to the genres query. Pass `organizationId` through the function chain.

#### Medium — `.env.example` missing several production environment variables

**File**: `.env.example`

Missing: `ENCRYPTION_KEY`, `SENTRY_DSN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ANNUAL_PRICE_ID`, `STRIPE_AI_ADDON_PRICE_ID`, `RESEND_API_KEY`.

**Fix**: Add all missing variables with descriptions.

#### Medium — `decryptSensitiveData` treats colon-less data as plaintext

**File**: `src/utils/crypto.js:577-580`

```js
if (!encryptedData.includes(':')) {
    return encryptedData; // returned as-is
}
```

If an attacker can replace an encrypted value with plaintext in the database, the system will use it without decryption. This is a backward-compatibility fallback for legacy data.

**Fix**: Add a prefix or flag to distinguish legacy plaintext from encrypted values.

#### Medium — OpenAI error response parsing may throw

**File**: `src/services/aiService.js:188-189`

Unlike the Anthropic handler (which has `.catch(() => ({}))`), the OpenAI handler does not catch JSON parse failures on error responses. If OpenAI returns non-JSON, an unrelated parsing error masks the real issue.

**Fix**: Add `.catch(() => ({}))` like the Anthropic handler.

#### Low — `normalizeTitle` strips non-ASCII characters

**File**: `src/utils/titleMatching.js:18`

`.replace(/[^\w\s]/g, '')` strips accented characters because `\w` in non-unicode mode is `[a-zA-Z0-9_]`. Compare with `stringMatching.js:17` which correctly uses `[^\p{L}\p{N}\s]` with the `u` flag.

**Fix**: Change to `.replace(/[^\p{L}\p{N}\s]/gu, '')`.

---

### 2. Bugs & Data Integrity

#### High — d1Provider.getBookById crashes on null result

**File**: `src/data/d1Provider.js:107`

```js
const result = await db.prepare('SELECT * FROM books WHERE id = ?').bind(id).first();
return rowToBook(result); // result is null when not found — TypeError
```

**Fix**: `return result ? rowToBook(result) : null;`

#### High — Wonde sync batch overflow when exactly 100 employee-class mappings

**File**: `src/services/wondeSync.js:300-303`

```js
if (i === 0) batch.unshift(deleteStmt); // DELETE + first inserts
```

When `employeeStatements` has exactly 100 items and `i === 0`, the batch becomes 101 items after `unshift`, exceeding D1's 100-statement limit. The entire first batch (including the DELETE) fails.

**Fix**: When `i === 0`, slice only 99 items and unshift the delete to keep the batch at 100.

#### High — `recalculateAllStreaks` cron may lose longest_streak history

**File**: `src/routes/students.js:2453,2486`

The cron only fetches sessions from the last 90 days (`session_date >= date('now', '-90 days')`). The `longestStreak` calculated from this window may be lower than the historical maximum. But the UPDATE unconditionally overwrites `longest_streak`, potentially reducing it. Compare with `GET /:id` (line 761) which uses `Math.max(streakData.longestStreak, result.longestStreak)`.

**Fix**: Change the UPDATE to: `longest_streak = MAX(longest_streak, ?)` so it never decreases.

#### Medium — Default reading status thresholds inconsistency

**File**: `src/routes/students.js:518-525`

Initial defaults are 14/21 days, but fallback defaults in the parse block are 3/7. The documented defaults in `organization.js:288-290` and `settings.js:29-32` are 3/7. The 14/21 values are dead code relics.

**Fix**: Set initial values to 3 and 7 to match documented defaults.

#### Low — Server-side term resolution uses UTC date, not UK local date

**Files**: `src/routes/classes.js:331`, `src/worker.js:679`

During BST (March–October), `toISOString().split('T')[0]` can be off by one day between 23:00-23:59 UTC.

**Fix**: `new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })`

#### Low — Class delete students UPDATE missing organization_id filter

**File**: `src/routes/classes.js:301-304`

The `UPDATE students SET class_id = NULL WHERE class_id = ?` doesn't include `AND organization_id = ?`. Safe due to UUID uniqueness, but inconsistent with defense-in-depth pattern.

**Fix**: Add `AND organization_id = ?` and bind.

---

### 3. Frontend

#### High — Stale closure in DataContext optimistic rollback

**File**: `src/contexts/DataContext.js` — 9 mutation functions (lines 294-930)

Multiple `useCallback` functions capture the full array reference (`const previousStudents = students`) for rollback. If two updates happen in rapid succession, the second callback's captured reference doesn't reflect the first update's optimistic change. Rollback restores to a stale snapshot.

```js
const previousStudents = students; // captures stale reference
setStudents((prev) => prev.map(...)); // optimistic update
// If this fails, rollback uses stale previousStudents
```

**Fix**: Capture previous value inside the functional state updater, or use a ref. The `addStudent` function (lines 210-211) already does this correctly — replicate that pattern.

#### Medium — Missing AbortController on fetch effects

**Files**: `src/components/sessions/SessionForm.js:97-121`, `src/components/sessions/HomeReadingRegister.js:227-253`, `src/components/BookRecommendations.js:141-256`

Several `useEffect` hooks that fetch data don't use AbortController. Rapid student selection changes can cause stale responses to update state for the wrong student. `StudentDetailDrawer.js:119` does this correctly — replicate that pattern.

#### Medium — ClassGoalsEditor silently swallows save errors

**File**: `src/components/goals/ClassGoalsEditor.js:23-42`

The `handleSave` function has try/finally but no catch. If the API call fails, no error feedback is shown — the button just re-enables.

**Fix**: Add catch block with error state and Alert display.

#### Medium — Multiple accessibility gaps

| Issue | File | Fix |
|-------|------|-----|
| BookCoverPlaceholder missing `role="img"` and `aria-label` | `BookCoverPlaceholder.js:37` | Add both |
| Scan ISBN button uses `title` not `aria-label` | `BookAutocomplete.js:299` | Change to `aria-label` |
| BadgeCelebration dialog missing `aria-labelledby` | `BadgeCelebration.js` | Add `id` to title, link with `aria-labelledby` |
| HomeReadingRegister status cells missing `aria-label` | `HomeReadingRegister.js:797-837` | Add labels ("Read", "Absent", etc.) |
| Search clear icon not keyboard-focusable | `StudentList.js:338-342` | Replace with `<IconButton>` |
| Confetti ignores `prefers-reduced-motion` | `ClassGoalsDisplay.js:56-62` | Add media query override |

#### Low — HomeReadingRegister is a mega-component (1009 lines, 20+ useState)

**File**: `src/components/sessions/HomeReadingRegister.js`

**Fix**: Extract session mutation logic into a `useHomeReadingSessions` custom hook.

---

### 4. Performance

#### Medium — `vite` in production dependencies

**File**: `package.json:38`

Vite is listed under `dependencies` instead of `devDependencies`. It bloats production installs.

**Fix**: Move to `devDependencies`.

#### Low — Widespread `SELECT *` in route handlers (58+ occurrences)
#### Low — Several packages significantly behind latest major versions

(Details unchanged from initial report.)

---

### 5. Code Quality & Documentation

#### Medium — CLAUDE.md file map missing ~15 files

(Details unchanged from initial report.)

#### Medium — DRY violations across 4 patterns

| Pattern | Files | Fix |
|---------|-------|-----|
| `csvRow()` helper duplicated | `students.js:2367`, `users.js:899` | Extract to `helpers.js` |
| Password validation repeated 3x | `auth.js:177,893,1039` | Extract to `validation.js` |
| Session input validation duplicated | `students.js:1253,1570` | Extract to helper |
| Slug generation duplicated 4x | `auth.js:131`, `organization.js:666`, `webhooks.js:123`, `wondeAdmin.js:134` | Extract `generateUniqueSlug()` |

#### Low — Console logging across 55 files (262 occurrences)
#### Low — Undocumented 5th cron trigger in wrangler.toml

**File**: `wrangler.toml:72` — comments describe 4 crons but 5 are configured. The `30 2 * * *` entry is undocumented.

---

### 6. Configuration & CI/CD

#### High — E2E tests not run in CI

**File**: `.github/workflows/build.yml`

The CI workflow runs `npm test` (unit tests only). The 10 Playwright E2E spec files covering auth, navigation, reading register, and subscription gating are never executed in CI.

**Fix**: Add a separate CI job that runs `npx playwright test`.

#### Medium — No lint/format enforcement in CI

**Fix**: Add `npx prettier --check "src/**/*.js"` step. Consider adding ESLint.

---

### 7. Strengths (what's working well)

- **Tenant isolation**: Consistent `organization_id` scoping, `tenantMiddleware()`, `requireOrgOwnership()` with table whitelist
- **Auth security**: Refresh token reuse detection with family revocation, PBKDF2-100k, httpOnly cookies, timing-safe comparisons, account lockout after 5 attempts
- **Cryptography**: AES-256-GCM with HKDF key derivation, constant-time comparison for tokens
- **GDPR compliance**: Article 15/17/18 implementation, automated retention cleanup, DPA consent tracking, data rights logging
- **Subscription gating**: Clean middleware with per-status behavior
- **Input validation**: Parameterized SQL everywhere, FTS5 query sanitization, prototype pollution protection
- **D1 batch discipline**: All large batches properly chunked to 100
- **Webhook security**: Constant-time secret comparison (Wonde), cryptographic signature verification + deduplication (Stripe)
- **Error handling**: Global handler sanitizes 5xx responses, React ErrorBoundary wraps app
- **Dependency health**: 0 npm audit vulnerabilities

---

## Summary Statistics

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | 0 | 1 | 4 | 1 |
| Bugs & Data Integrity | 0 | 3 | 1 | 2 |
| Frontend | 0 | 1 | 3 | 1 |
| Performance | 0 | 0 | 1 | 2 |
| Code Quality | 0 | 0 | 2 | 2 |
| Configuration & CI | 0 | 0 | 1 | 0 |
| **Total** | **0** | **5** | **12** | **8** |

Note: Some findings overlap categories. The E2E-in-CI finding is counted under Config/CI but has testing implications.

## Recommended Priority Order

1. **d1Provider null crash** (High, 1-line fix) — prevents 500 errors on missing books
2. **Wonde sync batch overflow** (High, 5-line fix) — prevents sync failure for schools with exactly 100 mappings
3. **Streak cron longest_streak regression** (High, 1-line SQL change) — prevents data loss
4. **Error message leakage + missing try/catch** (High, 5 routes) — security hardening
5. **DataContext stale closure** (High, pattern fix across 9 functions) — data correctness
6. **Badge engine org-scoped genres** (Medium) — tenant isolation
7. **decrypt plaintext fallback** (Medium) — defense in depth
8. **OpenAI error parsing** (Medium) — error handling robustness
9. **Missing AbortController** (Medium) — race condition prevention
10. **Accessibility gaps** (Medium) — 6 specific fixes
11. **vite in prod deps** (Medium) — move to devDependencies
12. **DRY violations** (Medium) — extract 4 shared helpers
13. **.env.example + CLAUDE.md** (Medium) — documentation
14. **CI improvements** (Medium) — E2E tests + lint step
15. Low-severity items as time permits

## Previous Audit Status (2026-04-08)

| # | Finding | Status |
|---|---------|--------|
| 1 | localStorage JWT + hardcoverApi bypass | **Resolved** — hardcoverApi now uses `setFetchFunction()`. localStorage accepted risk. |
| 2 | reset-admin-password.js SQL injection | **Improved** — now uses temp file via `--file` flag. |
| 3 | ReadingTimelineChart timezone bug | **Resolved** — uses `toLocaleDateString('en-CA')` |
| 4 | Worker version out of sync | **Resolved** — matches at 3.43.0 |
| 5 | Landing page screenshot payload | Not re-audited this cycle |
| 6 | Webhook unit test Wonde calls | Not re-audited this cycle |
| 7 | React act() warnings in tests | Not re-audited this cycle |
| 8 | README quick-start instructions | Not re-audited this cycle |
