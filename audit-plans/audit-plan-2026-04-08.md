# Implementation Plan — Codebase Audit 2026-04-08

## Overview
7 findings were confirmed in the current tree: 1 High, 4 Medium, 2 Low. The bulk of the work is moderate refactoring around auth token handling, plus a handful of smaller hardening, testing, and documentation tasks.

## Phase 1: Critical & Security (Do First)
| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 1 | Remove `localStorage` access-token persistence and direct token reads | `src/contexts/AuthContext.js:61-69`, `src/contexts/AuthContext.js:187-188`, `src/contexts/AuthContext.js:287-288`, `src/contexts/AuthContext.js:470-473`, `src/contexts/AuthContext.js:533-536`, `src/components/LandingPage.js:42-44`, `src/utils/hardcoverApi.js:37-47` | L | Keep access tokens in memory only, rely on the refresh cookie for session restoration, and refactor Hardcover requests to use `fetchWithAuth` or an injected auth-aware fetch helper instead of reading `localStorage`. |
| 2 | Harden emergency password reset script against SQL/shell injection | `scripts/reset-admin-password.js:77-85` | M | Validate the email input before command construction and replace direct SQL string interpolation with a safer execution path that avoids nested shell quoting. |

## Phase 2: High Priority Bugs & Data Integrity
| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 3 | Fix timezone-sensitive chart range formatting | `src/components/stats/ReadingTimelineChart.js:57-69` | S | Replace `toISOString().split('T')[0]` with a local-calendar formatter shared with the rest of the app, then add a regression test for non-UTC timezones. |
| 4 | Sync runtime version reporting with release version | `package.json:3`, `src/worker.js:60` | S | Make the worker version come from the same source as `package.json`, or at minimum update the constant and add a release check so the values cannot drift again. |

## Phase 3: Performance & Scalability
| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 5 | Reduce landing-page screenshot payload | `src/App.js:13-19`, `src/components/LandingPage.js:4-9` | M | Convert screenshot assets to smaller responsive formats and defer below-the-fold image loading so the anonymous landing flow does not eagerly pull all six large screenshots. |

## Phase 4: Code Quality & Tech Debt
| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 6 | Isolate webhook unit tests from live Wonde calls | `src/routes/webhooks.js:68-72`, `src/__tests__/unit/webhooks.test.js:5-18` | S | Mock `fetchSchoolDetails` in the unit suite and assert deterministic contact-detail behavior so `npm test` no longer emits `ENOTFOUND api.wonde.com` noise. |
| 7 | Eliminate React `act(...)` warnings in component tests | `src/__tests__/components/HomeReadingRegister.test.jsx:1-80`, `src/__tests__/components/BookManager.test.jsx:1-80` | M | Wrap async state-changing flows with `act` where needed or rework assertions around settled async helpers so the component suite runs warning-free. |

## Phase 5: Nice-to-Haves & Hardening
| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 8 | Refresh stale README quick-start instructions | `README.md:82-92` | S | Update the clone/folder naming and local URL to match the current repo and rsbuild port, then review nearby setup text for current accuracy. |

## Dependencies & Ordering Notes
- Do the auth-token refactor before touching Hardcover integration so the replacement fetch path is designed once and reused.
- The chart date fix is independent and can ship quickly in parallel with the security work.
- Test cleanup should follow the auth refactor if any auth-related client tests need updating anyway.
- README fixes can happen at any time after technical changes are settled.

## Quick Wins
- Item 3: timezone-safe chart date formatting.
- Item 4: version sync.
- Item 6: mock Wonde school-details lookups in unit tests.
- Item 8: README quick-start refresh.
