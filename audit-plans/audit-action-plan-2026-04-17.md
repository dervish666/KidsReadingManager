# Audit Action Plan — 2026-04-17

## Source

Derived from [audit-report-2026-04-14-1347.md](./audit-report-2026-04-14-1347.md) (the 2026-04-14 full codebase audit), cross-referenced against v3.49.0 "audit hardening" commit `287e077` and v3.50.0 `91919d2`.

## Headline

**Zero Critical findings.** The 2026-04-14 audit closed the book on Criticals — all agent-proposed Criticals were verified and downgraded (see the Verification Downgrades section of the source audit).

Of the Highs and Mediums flagged on 14 Apr, **most were shipped in v3.49.0**. This document lists only what remains, with file:line references so the work can be picked up without re-reading the source audit.

## Already Fixed in v3.49.0 (`287e077`) — No Action Needed

- Google API key → header (`src/routes/settings.js:479`)
- Book-import error sanitised (`src/routes/books.js:~1909`)
- decryptSensitiveData plaintext fallback now warns (`src/utils/crypto.js:583-585`)
- AI resolution decrypt errors wrapped in try/catch (`src/routes/books.js:661-704`)
- orgPurge atomic batch + fail-loud (`src/services/orgPurge.js:129-138`)
- tenantMiddleware KV-cached org status (`src/middleware/tenant.js`)
- Wonde `runFullSync` per-org KV lock (`src/services/wondeSync.js`)
- Badge cron 22s budget + per-org timing (`src/worker.js:618-666`)
- PlatformSettings typed DELETE confirmation (`src/components/PlatformSettings.js:143-173`)
- HomeReadingRegister first-fetch AbortController + refresh-error Snackbar (`src/components/sessions/HomeReadingRegister.js:194-225`)
- QuickReadingView keyboard-accessible edit cell (`src/components/sessions/QuickReadingView.js:311`)
- StudentDetailDrawer focus restoration on close
- classes.js soft-delete defense-in-depth org scope

---

## Outstanding — Action Needed

Priority order preserves the recommendations from the source audit, minus the items already fixed.

### High

No Highs remain unaddressed from the 2026-04-14 audit. The only High-severity concern still monitored is:

- **Badge evaluation cron scalability at 100+ orgs** (`src/worker.js:618-666`) — observability (budget + timing) is in place; chunking across multiple scheduled runs / Queue fan-out is the next phase when active org count approaches the budget.
  - Current state: sequential loop, 22s budget, deferred orgs pick up next night.
  - Action when needed: fan out via Queue binding or split cron into shards keyed by org-ID hash.

### Medium

1. **Badge engine author N+1 query** — `src/utils/badgeEngine.js:~352-367`
   - One `SELECT COUNT(DISTINCT book_id)` fires per distinct author per student (Series Finisher calc).
   - Fix: single `GROUP BY author` query, filter in memory.
   - Est: 30 min.

2. **Class-goals recalc: 6 separate aggregation queries per class** — `src/utils/classGoalsEngine.js:~144-246`
   - Sessions, books, genres, reading_days, readers, badges all query separately.
   - Fix: combine into one query using SQLite subqueries in the SELECT list.
   - Est: 45 min.

3. **`students` GET uses SELECT \* with correlated subqueries** — `src/routes/students.js:~243-250`
   - `(SELECT COUNT(*) FROM reading_sessions …)` and `(SELECT COUNT(*) FROM student_badges …)` fire once per row.
   - Fix: `LEFT JOIN` against `student_reading_stats` and a pre-aggregated badge-count view. Replace `SELECT *` with explicit columns.
   - Est: 1 h.

4. **Missing compound index on `reading_sessions`** — migration work
   - Current indexes cover `student_id + session_date`, not `organization_id`.
   - Fix: new migration — `CREATE INDEX idx_reading_sessions_org_student_date ON reading_sessions(organization_id, student_id, session_date DESC);`
   - Est: 15 min + deploy.

5. **`genres` query spans all orgs (design-accepted but still a cross-tenant surface)** — `src/utils/badgeEngine.js:71`
   - Currently commented as intentional; but `POST /api/genres` lets any org add genres, so school A's names are visible to school B's badge classification.
   - Fix (pick one): (a) lock genre writes to owner-only; or (b) scope the query to the student's organization.
   - Est: 45 min (option b preferred).

6. **Stripe webhook silently drops trial-ending email failures** — `src/routes/stripeWebhook.js:~212-214`
   - Email error is logged to console, webhook returns 200, no retry. Schools miss the reminder and churn.
   - Fix: Sentry capture at minimum, or enqueue into `email_outbox` table with retry.
   - Est: 30 min (Sentry-only) / 2 h (outbox pattern).

7. **Wonde `schoolApproved` school-details fetch fails silently** — `src/routes/webhooks.js:72-77`
   - Org is created with null contact/address fields on fetch failure; no signal to admins.
   - Fix: Sentry event + set `onboarding_incomplete = 1` flag on the org so the admin UI can surface a retry banner.
   - Est: 30 min + migration for the flag.

8. **UserManagement class-assignment save has no loading feedback** — `src/components/UserManagement.js:~706-770`
   - Save button doesn't disable or spin during the PUT. Users click repeatedly.
   - Fix: `savingClasses` state + disabled button + `<CircularProgress size={16}/>` inline.
   - Est: 15 min.

9. **CI: no E2E or ESLint gate** — `.github/workflows/build.yml`
   - Currently runs `npm ci && npm run build` only.
   - Fix: add a PR-only job that runs `npx playwright test` against a local preview; add `eslint-plugin-react-hooks` and gate on `--max-warnings 0`.
   - Est: 1 h (E2E) + 45 min (ESLint).

### Low

10. **KV cache growth monitoring** — `src/utils/recommendationCache.js`, `src/utils/isbnLookup.js`
    - Both use `expirationTtl` correctly; just needs dashboard monitoring.
    - Action: consider dropping recommendation TTL 7d → 1-2d.

11. **metadataService serial 1500ms delay** — `src/services/metadataService.js:106-159`
    - ~19 books per cron run; large backfills take weeks.
    - Action: parallelise within per-provider rate limits if metadata backlog becomes user-visible.

12. **DRY extraction (carryover)** — `csvRow()`, `validatePassword()`, session-input validation, `generateUniqueSlug()`
    - Duplicated across routes. No regression; no progress.
    - Est: 2 h total.

13. **No ESLint config in repo**
    - Folded into item #9.

14. **`demoReset.js` template-interpolated DELETE** — `src/services/demoReset.js:130`
    - Not exploitable today (static constants) but brittle to future refactors.
    - Fix: add a comment warning against external input, or hardcode the DELETEs.
    - Est: 5 min.

15. **PlatformSettings raw `error.message` in UI feedback** — `src/components/PlatformSettings.js:137,169`
    - Owner-only route; still surfaces internal detail. Swap for generic copy.
    - Est: 10 min.

16. **HomeReadingRegister 1000+ line mega-component (carryover)**
    - Flagged in prior audits. No regression.
    - Action: split when next touching this file for feature work.

---

## Tier 5 Deferred Items (from pre-launch-cleanup-plan, still open)

Not from the 14 Apr audit but tracked in user-memory. Independent of the audit.

- AppContext splitting (done — now Auth/Data/UI ✓ — reclassify as complete if still in the memory)
- Component splitting — BookManager 1,325 / HomeReadingRegister 1,081 / ReadingStats 984
- AppContext value memoization
- Pagination for `/api/students` and `/api/books`
- Missing composite index `wonde_employee_classes(organization_id, wonde_employee_id)`
- Accessibility pass (~13 components have aria attributes — spot-check)
- Test coverage gaps (BookRecommendations, HomeReadingRegister, Header)
- setTimeout cleanup in StudentTable.js

---

## How to Use This Document

- The numbered items in "Outstanding" are independent; no ordering dependencies.
- Each item lists an estimate; total outstanding Medium-tier work is **~5-6 hours**.
- The Lows are all under 15 min each and can be cleaned up in one sitting.
- Check items off by deleting them or appending `[done commit-sha]`.
- When tackled, run the relevant tests — the 2026-04-14 audit verified 1920/1920 tests pass; keep that green.

## Cross-References

- Source audit: `audit-plans/audit-report-2026-04-14-1347.md`
- Audit plan: `audit-plans/audit-plan-2026-04-14-1347.md`
- Fix commit: `287e077` (v3.49.0, 14 Apr 2026)
- Earlier audits for context: `docs/audit-2026-04-02.md`, `audit-plans/audit-report-2026-04-09.md`

---

## Post-v3.51.0 Findings (from pen-test smoke test)

### `rateLimit` helper has D1 read-replica lag

Production smoke test of H8 (covers rate-limit) showed the helper in `src/middleware/tenant.js:363-456` only starts returning 429 after roughly 2× the configured budget under sustained pressure: a 150-request burst against `/api/covers/search` returned **132 × 404 then 18 × 429** rather than the expected 60 × 404 then 90 × 429.

**Cause:** `.first()` on the COUNT query can hit a D1 read replica that hasn't observed the previous requests' INSERTs yet. Each Worker request runs with its own D1 session, and the helper does not pin reads to the primary or use the D1 Sessions API bookmark.

**Impact:** Affects every caller of `rateLimit()` — covers, contact, signup, and (most importantly) `authRateLimit` for login/register/reset-password. Under steady-state attack the rate limit still throttles, just with a 2–3× over-budget warmup. Not a regression from this PR — pre-existing behaviour surfaced by the H8 smoke test.

**Fix direction:** Use D1 Sessions API with `c.env.READING_MANAGER_DB.withSession()` and reuse the bookmark across the SELECT/INSERT pair, or move the counter to KV with `put`/`get` on a per-(key,endpoint) counter. Needs benchmarking — KV is eventually consistent too, but with different lag characteristics.

**Priority:** Medium. The existing behaviour delivers meaningful throttling for scripted attacks; making it precise matters for finer limits like `authRateLimit(10, 60000)` on login.
