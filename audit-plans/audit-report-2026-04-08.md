# Codebase Audit Report — Tally Reading
## Date: 2026-04-08
## Scope: Full application codebase (frontend, worker routes, services, utils, scripts, config, tests, CI, docs spot-check)

## Executive Summary
Tally Reading is in solid shape overall: the app builds cleanly, the automated suite currently passes, tenant scoping and auth middleware are established, and the repository has already absorbed a large amount of hardening work from the late-March and early-April audit cycles. The biggest remaining concern is not a broken endpoint but a security architecture gap: JWT access tokens are still persisted in `localStorage`, and one helper bypasses the shared authenticated fetch path entirely.

Beyond that, the current issues are mostly medium- and low-severity quality risks rather than production-stopping failures. The main themes are stale version/documentation drift, one remaining timezone-sensitive chart path, an emergency admin script that still interpolates SQL, a heavy public landing experience, and tests that pass while still leaking warnings and network noise.

## Critical Issues (Fix Immediately)
No current Critical issues were confirmed in the audited tree.

## Findings By Category

### Security

#### High — Access tokens are still stored in `localStorage`, and one client helper reads them directly
**Files**
- `src/contexts/AuthContext.js:61-69`
- `src/contexts/AuthContext.js:187-188`
- `src/contexts/AuthContext.js:287-288`
- `src/contexts/AuthContext.js:470-473`
- `src/contexts/AuthContext.js:533-536`
- `src/components/LandingPage.js:42-44`
- `src/utils/hardcoverApi.js:37-47`

**Why this matters**
The app already uses an `httpOnly` refresh cookie, but the short-lived access token is still persisted in `localStorage` and rehydrated on load. Any XSS in the app or a compromised third-party script can still exfiltrate the bearer token during its lifetime. `hardcoverApi.js` also bypasses `fetchWithAuth`, so it hard-depends on that `localStorage` copy and sidesteps the centralized refresh/retry path.

**Problematic code**
```js
const [authToken, setAuthToken] = useState(() => {
  return window.localStorage.getItem(AUTH_STORAGE_KEY) || null;
});
```

```js
const token = typeof localStorage !== 'undefined'
  ? localStorage.getItem('krm_auth_token')
  : null;
```

**Concrete fix**
- Move access-token storage to in-memory React state only.
- Continue using the refresh cookie for session persistence.
- Route `hardcoverApi` requests through `fetchWithAuth` or inject an auth-aware fetch dependency instead of reading storage directly.
- Keep only non-sensitive auth metadata in storage if needed.

#### Medium — Emergency password reset script builds SQL with string interpolation
**File**
- `scripts/reset-admin-password.js:77-85`

**Why this matters**
This is an operator-facing script, so the blast radius is limited, but it still builds SQL by interpolating `email` into the command string. A malformed or malicious email argument can break the command or alter the query unexpectedly.

**Problematic code**
```js
const sql = `UPDATE users SET password_hash = '${escapedHash}', updated_at = datetime('now') WHERE email = '${email.toLowerCase()}'`;
const cmd = `npx wrangler d1 execute reading-manager-db ${remoteFlag} --command "${sql}"`;
```

**Concrete fix**
- Reject unexpected email characters before command construction.
- Prefer a temporary SQL file or a safer execution path that avoids nested shell quoting.
- If the tool must stay CLI-only, at least escape the email path as rigorously as the hash.

### Bugs & Data Integrity

#### Medium — Reading timeline date range still converts local dates through UTC ISO strings
**File**
- `src/components/stats/ReadingTimelineChart.js:57-69`

**Why this matters**
The chart derives its API range using `toISOString().split('T')[0]`. Around timezone boundaries, users west of UTC can get a shifted start/end date, which means the stats request can silently miss or include an extra day.

**Problematic code**
```js
return {
  startDateISO: startDate.toISOString().split('T')[0],
  endDateISO: endDate.toISOString().split('T')[0]
};
```

**Concrete fix**
- Format these dates as local calendar dates, matching the newer helpers used elsewhere (`toLocaleDateString('en-CA')` or a shared date utility).
- Add a regression test that runs under a non-UTC timezone.

#### Medium — Worker version endpoint is out of sync with the shipped package version
**Files**
- `package.json:3`
- `src/worker.js:60`

**Why this matters**
The package version is `3.42.1`, while the worker reports `3.42.0`. That makes debugging and support harder because the UI/API can claim an older build than the one actually deployed.

**Problematic code**
```js
const APP_VERSION = '3.42.0';
```

**Concrete fix**
- Generate the runtime version from one source of truth at build time, or at minimum update the constant as part of release automation.

### Performance

#### Medium — Public landing experience eagerly bundles and displays large screenshot assets
**Files**
- `src/App.js:13-19`
- `src/components/LandingPage.js:4-9`

**Why this matters**
The current build succeeded, but it emitted six screenshot assets around 700–800 KB each. The landing page imports all of them up front, and `App.js` eagerly imports `LandingPage`, so the anonymous user experience carries a large asset cost before sign-in.

**Concrete fix**
- Convert the screenshot gallery to lazy-loaded images (`loading="lazy"` where applicable).
- Consider serving smaller responsive variants or WebP/AVIF assets.
- If only some sections are below the fold, defer those images until reveal/intersection.

### Testing & Developer Experience

#### Low — Webhook unit tests still hit live network paths for school-details lookup
**Files**
- `src/routes/webhooks.js:68-72`
- `src/__tests__/unit/webhooks.test.js:5-18`

**Why this matters**
`npm test` passes today, but it emits `getaddrinfo ENOTFOUND api.wonde.com` noise because the route calls `fetchSchoolDetails()` and the unit test only mocks crypto and sync helpers. That makes the suite noisier and more environment-dependent than it needs to be.

**Concrete fix**
- Mock `../../utils/wondeApi.js` in the unit test.
- Assert the success path with deterministic fake school details instead of relying on the route’s error swallowing.

#### Low — Several component tests pass while emitting React `act(...)` warnings
**Files**
- `src/__tests__/components/HomeReadingRegister.test.jsx:1-80`
- `src/__tests__/components/BookManager.test.jsx:1-80`

**Why this matters**
The suite is green, but `npm test` logs repeated React warnings about updates not wrapped in `act(...)`. That reduces signal quality and can hide genuine async/render timing regressions later.

**Concrete fix**
- Wrap state-changing async flows with `await act(async () => ...)` where appropriate, or restructure assertions around `findBy*`/`waitFor` so React Testing Library fully settles updates.
- Treat warning-free tests as the quality bar in CI.

### Documentation

#### Low — README quick-start instructions are stale
**File**
- `README.md:82-92`

**Why this matters**
The README still points to the old repo folder name and says to open `http://localhost:3000`, while the current rsbuild config serves the frontend on port `3001`. New contributors can follow the doc and land in the wrong place immediately.

**Concrete fix**
- Update the clone path/folder name to match the current repository.
- Point local frontend usage at `http://localhost:3001`.
- Trim or refresh any user-facing feature copy that no longer matches the current product.

## Clean Areas
- CI is present and wired to run both build and tests: `.github/workflows/build.yml:1-36`.
- `npm test` currently passes all 1867 tests.
- `npm run build` currently succeeds.
- CORS, auth middleware, and subscription gating are present and broadly well-structured in `src/worker.js` and `src/middleware/tenant.js`.
- No live `TODO`/`FIXME`/`HACK` comments were found in application source files; remaining placeholders are primarily in planning and GDPR docs.

## Validation Notes
- `npm test`: passed (`81` test files, `1867` tests), but emitted React `act(...)` warnings and external-network `ENOTFOUND` noise for unmocked Wonde paths.
- `npm run build`: passed.
- `npm audit --json`: could not complete in this environment because DNS resolution for `registry.npmjs.org` failed.

## Summary Statistics
| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | 0 | 1 | 1 | 0 |
| Bugs | 0 | 0 | 2 | 0 |
| Performance | 0 | 0 | 1 | 0 |
| Testing / DX | 0 | 0 | 0 | 2 |
| Documentation | 0 | 0 | 0 | 1 |

## Recommended Priority Order
1. Remove `localStorage` access-token persistence and route all authenticated client calls through the shared auth path.
2. Fix the password-reset admin script quoting/interpolation so emergency operations are safer.
3. Replace the remaining UTC ISO chart-range formatting with timezone-safe local date formatting.
4. Sync version reporting so support/debug output matches deployed code.
5. Reduce landing-page asset cost for anonymous users.
6. Clean up the test suite by mocking Wonde lookups and eliminating `act(...)` warnings.
7. Refresh the README so local setup matches the current repo and ports.
