# Codebase Audit Report — Tally Reading
## Date: 2026-04-04
## Scope: Full codebase

## Executive Summary
The codebase is in decent operational shape: `npm run build` succeeds, the backend still shows strong tenant scoping, parameterised SQL is used consistently, and the recent security hardening work is visible throughout the worker and route layer. The remaining issues are concentrated rather than pervasive.

The biggest live risks are: browser-stored bearer tokens that are still readable by JavaScript, a second wave of UTC date handling bugs outside the already-fixed home-reading flow, and recommendation queries that still use `ORDER BY RANDOM()` against a growing catalogue. I did not find a fresh critical-severity tenant-isolation or SQL-injection issue in the current source.

Validation commands run during this audit:
- `npm run build` — passed
- `npm test` — failed with 114 test failures across 4 files
- `npm audit --json` — could not complete because the sandbox could not resolve `registry.npmjs.org`

## Critical Issues (Fix Immediately)
No new Critical findings in the current source sweep.

## Findings by Category

### Security Vulnerabilities

#### High — JWT access tokens are still persisted in `localStorage`, and one client helper bypasses `fetchWithAuth`
Affected locations:
- [src/contexts/AuthContext.js](/Users/dervish/CascadeProjects/TallyReading/src/contexts/AuthContext.js#L61) and repeated writes at [src/contexts/AuthContext.js](/Users/dervish/CascadeProjects/TallyReading/src/contexts/AuthContext.js#L187), [src/contexts/AuthContext.js](/Users/dervish/CascadeProjects/TallyReading/src/contexts/AuthContext.js#L287), [src/contexts/AuthContext.js](/Users/dervish/CascadeProjects/TallyReading/src/contexts/AuthContext.js#L466), [src/contexts/AuthContext.js](/Users/dervish/CascadeProjects/TallyReading/src/contexts/AuthContext.js#L529)
- [src/utils/hardcoverApi.js](/Users/dervish/CascadeProjects/TallyReading/src/utils/hardcoverApi.js#L37)

Impact:
Any XSS bug becomes an account-takeover bug because the bearer token is readable from `window.localStorage`. The Hardcover client also bypasses the central auth path, so it misses refresh / block handling and keeps duplicating the insecure pattern.

Problematic code:
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

Suggested direction:
```js
// Keep access token only in memory and refresh it via the httpOnly cookie.
const [authToken, setAuthToken] = useState(null);
```

```js
// Route Hardcover calls through fetchWithAuth instead of reading storage directly.
const response = await fetchWithAuth(PROXY_URL, { ... });
```

Concrete fix:
Move access-token persistence fully in-memory, keep refresh state in the existing httpOnly cookie, and refactor `hardcoverApi.js` to receive an authenticated fetch function or proxy through `fetchWithAuth`.

### Bug Fixes & Error Handling

#### High — UTC date defaults will still write and filter the wrong day around BST/DST transitions
Affected locations:
- [src/routes/students.js](/Users/dervish/CascadeProjects/TallyReading/src/routes/students.js#L1285), [src/routes/students.js](/Users/dervish/CascadeProjects/TallyReading/src/routes/students.js#L1312), [src/routes/students.js](/Users/dervish/CascadeProjects/TallyReading/src/routes/students.js#L1564)
- [src/contexts/DataContext.js](/Users/dervish/CascadeProjects/TallyReading/src/contexts/DataContext.js#L594)
- [src/components/sessions/SessionForm.js](/Users/dervish/CascadeProjects/TallyReading/src/components/sessions/SessionForm.js#L52)
- [src/components/stats/ReadingStats.js](/Users/dervish/CascadeProjects/TallyReading/src/components/stats/ReadingStats.js#L70)
- [src/utils/helpers.js](/Users/dervish/CascadeProjects/TallyReading/src/utils/helpers.js#L31)
- [src/routes/organization.js](/Users/dervish/CascadeProjects/TallyReading/src/routes/organization.js#L198)

Impact:
The earlier DST fix was localised to the home-reading register. These remaining call sites still derive local dates with `toISOString().split('T')[0]`, so users in `Europe/London` can still create, edit, export, and filter sessions against the previous day around midnight / BST changes.

Problematic code:
```js
body.date || new Date().toISOString().split('T')[0]
```

Suggested direction:
```js
import { getDateString } from '../utils/streakCalculator.js';

const sessionDate = body.date || getDateString(new Date(), timezone);
```

Concrete fix:
Introduce one shared "local calendar date" helper and replace every remaining `toISOString().split('T')[0]` path that represents a user-facing local day.

#### Medium — `getReadingStatus()` and related helpers still use local `Date` math without organisation timezone input
Affected locations:
- [src/utils/helpers.js](/Users/dervish/CascadeProjects/TallyReading/src/utils/helpers.js#L41)

Impact:
Reading-status chips can drift by one day for organisations outside the browser timezone or near local midnight, even if the underlying session dates are correct.

Concrete fix:
Pass the organisation timezone into `getReadingStatus()` and reuse the existing timezone-aware date-string approach already used in `streakCalculator.js`.

### Performance Optimisation

#### High — recommendation queries still rely on `ORDER BY RANDOM()`, which will degrade as the catalogue grows
Affected locations:
- [src/data/d1Provider.js](/Users/dervish/CascadeProjects/TallyReading/src/data/d1Provider.js#L565)
- [src/data/d1Provider.js](/Users/dervish/CascadeProjects/TallyReading/src/data/d1Provider.js#L624)
- [src/data/index.js](/Users/dervish/CascadeProjects/TallyReading/src/data/index.js#L184)

Impact:
`ORDER BY RANDOM()` forces SQLite to assign and sort a random value for every qualifying row before applying the limit. On a catalogue sized for this app, that becomes a full-table hot path for AI recommendations.

Problematic code:
```sql
SELECT * FROM books ... ORDER BY RANDOM() LIMIT ?
```

Suggested direction:
```sql
SELECT * FROM books
WHERE id > ?
ORDER BY id
LIMIT ?
```

Concrete fix:
Replace random sort with deterministic sampling: preselect candidate IDs, use a rolling/random offset, or maintain a small sampled candidate pool before final in-memory shuffling.

### Code Quality & Maintainability

#### Medium — version and schema drift has reappeared: health endpoint is stale and `subscription_tier` is still treated as live data
Affected locations:
- [src/worker.js](/Users/dervish/CascadeProjects/TallyReading/src/worker.js#L56)
- [src/routes/auth.js](/Users/dervish/CascadeProjects/TallyReading/src/routes/auth.js#L164)
- [src/routes/auth.js](/Users/dervish/CascadeProjects/TallyReading/src/routes/auth.js#L903)
- [src/routes/organization.js](/Users/dervish/CascadeProjects/TallyReading/src/routes/organization.js#L675)

Impact:
`/api/health` reports `3.36.1` while `package.json` is `3.37.0`, and multiple routes still write/read `subscription_tier` despite the project note recording its removal. This is exactly the kind of drift that breaks migrations later and makes ops/debugging misleading now.

Concrete fix:
Generate `APP_VERSION` from one source of truth at build time and remove remaining `subscription_tier` reads/writes from route code before the column is dropped for real.

#### Low — deprecated MUI Grid v1 props are still present and now produce upgrade warnings
Affected locations:
- [src/components/books/BookManager.js](/Users/dervish/CascadeProjects/TallyReading/src/components/books/BookManager.js#L449)
- [src/components/books/BookEditDialog.js](/Users/dervish/CascadeProjects/TallyReading/src/components/books/BookEditDialog.js#L339)

Impact:
This is not breaking production today, but the test suite already emits migration warnings for `item`, `xs`, and `sm`, which adds noise and increases the cost of future MUI upgrades.

Concrete fix:
Migrate these remaining grids to the Grid v2 API consistently.

### Accessibility & UX

#### Medium — preferences dialog renders an invalid heading hierarchy (`<h6>` nested inside `<h2>`)
Affected location:
- [src/components/BookRecommendations.js](/Users/dervish/CascadeProjects/TallyReading/src/components/BookRecommendations.js#L1218)

Impact:
The dialog title creates invalid HTML and can confuse screen-reader heading navigation. React is already warning about the hydration risk in tests.

Problematic code:
```jsx
<DialogTitle>
  <Typography variant="h6">{selectedStudent?.name} — Reading Preferences</Typography>
</DialogTitle>
```

Concrete fix:
Either let `DialogTitle` own the heading text directly, or render the nested `Typography` as `component="span"`.

### Developer Experience & Tooling

#### Medium — the automated test harness is currently broken for every cover-storage suite
Affected locations:
- [src/__tests__/setup.js](/Users/dervish/CascadeProjects/TallyReading/src/__tests__/setup.js#L1)
- [vitest.config.mjs](/Users/dervish/CascadeProjects/TallyReading/vitest.config.mjs#L28)
- Failures observed in [src/__tests__/unit/BookCover.test.js](/Users/dervish/CascadeProjects/TallyReading/src/__tests__/unit/BookCover.test.js#L20), [src/__tests__/unit/BookCoverContext.test.js](/Users/dervish/CascadeProjects/TallyReading/src/__tests__/unit/BookCoverContext.test.js#L30), [src/__tests__/unit/useBookCover.test.js](/Users/dervish/CascadeProjects/TallyReading/src/__tests__/unit/useBookCover.test.js#L15), [src/__tests__/unit/hardcoverApi.test.js](/Users/dervish/CascadeProjects/TallyReading/src/__tests__/unit/hardcoverApi.test.js#L28)

Impact:
`npm test` currently fails with 114 failures because `localStorage.clear`, `setItem`, and `removeItem` are not available at runtime in the test environment. That means a meaningful chunk of frontend coverage is effectively offline right now.

Concrete fix:
Install a stable Storage shim in `src/__tests__/setup.js` (or swap to a DOM environment/version combination that provides the full Storage API) and make the cover-related tests explicitly depend on that shim.

#### Medium — webhook tests are still leaking to real network paths instead of being fully isolated
Affected locations:
- Live fetch in [src/routes/webhooks.js](/Users/dervish/CascadeProjects/TallyReading/src/routes/webhooks.js#L70)
- Incomplete unit mocking in [src/__tests__/unit/webhooks.test.js](/Users/dervish/CascadeProjects/TallyReading/src/__tests__/unit/webhooks.test.js#L1)
- Incomplete integration mock in [src/__tests__/integration/wondeIntegration.test.js](/Users/dervish/CascadeProjects/TallyReading/src/__tests__/integration/wondeIntegration.test.js#L52)

Impact:
The suite emits `ENOTFOUND api.wonde.com` noise in unit tests, and the integration test’s `helpers.js` mock is incomplete enough to log missing-export errors. That makes failures harder to trust and weakens CI reproducibility.

Concrete fix:
Mock `fetchSchoolDetails` directly in webhook tests, or mock the Wonde helper module at its boundary instead of letting route code try a live fetch.

## Clean Areas
- No fresh cross-tenant access-control break was found in the current route sweep.
- I did not find new raw-SQL injection risks; D1 calls are consistently parameterised.
- `src/` contains no active `TODO`/`FIXME`/`HACK` comments.
- The production bundle builds successfully with the current code.

## Summary Statistics
| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | 0 | 1 | 0 | 0 |
| Bugs | 0 | 1 | 1 | 0 |
| Performance | 0 | 1 | 0 | 0 |
| Code Quality | 0 | 0 | 1 | 1 |
| Accessibility | 0 | 0 | 1 | 0 |
| Developer Experience | 0 | 0 | 2 | 0 |

## Recommended Priority Order
1. Remove browser-persisted bearer tokens and route Hardcover requests through the authenticated fetch path.
2. Replace all remaining UTC date defaults used for local school-day logic.
3. Remove `ORDER BY RANDOM()` from recommendation queries before catalogue size makes the feature sluggish.
4. Restore the broken frontend storage-related test suites so future regressions are catchable again.
5. Clean up version/schema drift (`APP_VERSION`, `subscription_tier`) before the next migration round.
