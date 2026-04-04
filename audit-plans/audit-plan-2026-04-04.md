# Implementation Plan — Codebase Audit 2026-04-04

## Overview
This audit produced 8 actionable findings: 3 High, 4 Medium, and 1 Low. The work is front-loaded toward auth/date correctness and recommendation scalability, with testing hardening as the next major payoff.

## Phase 1: Critical & Security (Do First)
| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 1 | Remove browser-persisted access tokens | `src/contexts/AuthContext.js:61`, `src/contexts/AuthContext.js:187`, `src/contexts/AuthContext.js:287`, `src/contexts/AuthContext.js:466`, `src/contexts/AuthContext.js:529`, `src/utils/hardcoverApi.js:37` | L | Stop reading/writing bearer tokens from `localStorage`, keep the access token only in memory, and change Hardcover API calls to use the central authenticated fetch path so refresh/logout/subscription handling stays consistent. |
| 2 | Eliminate UTC-based local-day writes | `src/routes/students.js:1285`, `src/routes/students.js:1312`, `src/routes/students.js:1564`, `src/contexts/DataContext.js:594`, `src/components/sessions/SessionForm.js:52`, `src/components/stats/ReadingStats.js:70`, `src/utils/helpers.js:31`, `src/routes/organization.js:198` | L | Add one shared local-date helper that accepts organisation timezone and replace every remaining `toISOString().split('T')[0]` path that drives session creation, session edits, stats filters, and month boundaries. |

## Phase 2: High Priority Bugs & Data Integrity
| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 3 | Timezone-aware reading status | `src/utils/helpers.js:41` | M | Change `getReadingStatus()` to accept organisation timezone and compare calendar dates using the same timezone-aware helper already used by streak calculation. |
| 4 | Remove version/schema drift | `src/worker.js:56`, `src/routes/auth.js:164`, `src/routes/auth.js:903`, `src/routes/organization.js:675` | M | Source the health/version string from one canonical version input and delete the remaining `subscription_tier` reads/writes so future schema cleanup does not break registration or auth payloads. |

## Phase 3: Performance & Scalability
| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 5 | Replace `ORDER BY RANDOM()` recommendation sampling | `src/data/d1Provider.js:565`, `src/data/d1Provider.js:624`, `src/data/index.js:184` | M | Rework recommendation candidate selection to avoid full random sorts in SQL and quadratic-style randomisation in JS; use deterministic sampling plus a small final in-memory shuffle. |

## Phase 4: Code Quality & Tech Debt
| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 6 | Fix invalid dialog heading structure | `src/components/BookRecommendations.js:1218` | S | Remove the nested heading by rendering the `DialogTitle` text directly or changing the inner `Typography` to `component="span"`. |
| 7 | Migrate remaining deprecated MUI Grid props | `src/components/books/BookManager.js:449`, `src/components/books/BookEditDialog.js:339` | S | Convert the remaining `item` / `xs` / `sm` usages to the Grid v2 API so runtime/test warnings stop masking real issues. |

## Phase 5: Nice-to-Haves & Hardening
| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 8 | Restore storage-related frontend tests | `src/__tests__/setup.js:1`, `vitest.config.mjs:28`, `src/__tests__/unit/BookCover.test.js:20`, `src/__tests__/unit/BookCoverContext.test.js:30`, `src/__tests__/unit/useBookCover.test.js:15`, `src/__tests__/unit/hardcoverApi.test.js:28` | M | Add a deterministic Storage shim for the Vitest environment or pin the DOM runtime so `localStorage` exposes the full Storage API and the 114 failing cover/storage tests run again. |
| 9 | Fully isolate Wonde webhook tests from network access | `src/routes/webhooks.js:70`, `src/__tests__/unit/webhooks.test.js:1`, `src/__tests__/integration/wondeIntegration.test.js:52` | S | Mock `fetchSchoolDetails` at the module boundary and complete the `helpers.js` mock in integration tests so the suite no longer emits DNS and missing-export noise. |

## Dependencies & Ordering Notes
- Item 1 should happen before or alongside item 8 because the current failing Hardcover tests assume `localStorage` token access.
- Item 2 should precede any further stats or session-form changes; otherwise new work may keep baking in UTC dates.
- Item 4 should land before the next schema cleanup or migration that touches `organizations`.
- Items 8 and 9 can run in parallel once item 1’s auth approach is settled.

## Quick Wins
- Item 6 is a fast accessibility fix with a clear test signal.
- Item 7 is a quick warning cleanup that improves signal-to-noise immediately.
- Item 9 is a small test-isolation patch with outsized CI value.
