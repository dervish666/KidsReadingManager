# Implementation Plan — Codebase Audit 2026-04-09

## Overview
25 findings confirmed across full codebase: 5 High, 12 Medium, 8 Low. Three of the High items are 1-5 line fixes. Total estimated effort: ~8-10 hours across all phases.

## Phase 1: Critical & Security (Do First)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 1 | d1Provider.getBookById null crash | `src/data/d1Provider.js:107` | S | Add null guard: `return result ? rowToBook(result) : null;` — prevents 500 errors when book ID not found. |
| 2 | Wonde sync batch overflow at 100 employees | `src/services/wondeSync.js:300-303` | S | When `i === 0`, slice 99 items (not 100) before `unshift(deleteStmt)` to stay within D1's 100-statement batch limit. |
| 3 | Streak cron loses longest_streak history | `src/routes/students.js:2486` | S | Change UPDATE SQL to `longest_streak = MAX(longest_streak, ?)` so the cron never regresses historical records. |
| 4 | Error message leakage + missing try/catch | `src/routes/billing.js:146,217-241,248-288`, `src/routes/metadata.js:470`, `src/routes/books.js:780` | S | Wrap billing portal/change-plan in try/catch. Replace raw `err.message` with generic messages in all 5 locations. |
| 5 | Badge engine genres query lacks org scope | `src/utils/badgeEngine.js:67` | S | Add `WHERE organization_id = ?` to genres query. Pass `organizationId` through the function chain. |
| 6 | OpenAI error response parsing | `src/services/aiService.js:188-189` | S | Add `.catch(() => ({}))` to `response.json()` call, matching the Anthropic handler pattern. |
| 7 | decryptSensitiveData plaintext fallback | `src/utils/crypto.js:577-580` | M | Add a prefix marker (e.g., `enc:`) to encrypted values so plaintext can't be silently accepted. Update encrypt to add prefix and decrypt to require it, with migration path for existing data. |

## Phase 2: High Priority Bugs & Frontend

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 8 | DataContext stale closure in optimistic rollback | `src/contexts/DataContext.js:294-930` (9 functions) | M | Refactor all 9 mutation functions to capture previous state inside the functional updater (like `addStudent` at lines 210-211 already does), or use a ref. Affects: `updateStudentClassId`, `updateStudent`, `deleteStudent`, `updateStudentCurrentBook`, `updateBook`, `addGenre`, `addClass`, `updateClass`, `deleteClass`. |
| 9 | Default reading status thresholds inconsistency | `src/routes/students.js:518-519` | S | Change initial values from `recentlyReadDays = 14; needsAttentionDays = 21` to `3` and `7` to match documented defaults. |
| 10 | Missing AbortController on fetch effects | `src/components/sessions/SessionForm.js:97-121`, `src/components/sessions/HomeReadingRegister.js:227-253`, `src/components/BookRecommendations.js:141-256` | M | Add AbortController to each useEffect, pass signal to fetchWithAuth, abort on cleanup. Follow the pattern in `StudentDetailDrawer.js:119`. |
| 11 | ClassGoalsEditor silent save errors | `src/components/goals/ClassGoalsEditor.js:23-42` | S | Add catch block with `setError(...)` state and `<Alert>` display for failed saves. |

## Phase 3: Accessibility & UX

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 12 | BookCoverPlaceholder missing role/aria-label | `src/components/BookCoverPlaceholder.js:37` | S | Add `role="img"` and `aria-label={`Placeholder for ${title}`}` to outer Box. |
| 13 | Scan ISBN button uses title not aria-label | `src/components/sessions/BookAutocomplete.js:299` | S | Change `title="Scan ISBN barcode"` to `aria-label="Scan ISBN barcode"`. |
| 14 | BadgeCelebration dialog missing aria-labelledby | `src/components/badges/BadgeCelebration.js` | S | Add `id="badge-celebration-title"` to title Typography, set `aria-labelledby` on Dialog. |
| 15 | HomeReadingRegister cells missing aria-labels | `src/components/sessions/HomeReadingRegister.js:797-837` | S | Add `aria-label` to each status cell ("Read", "Absent", "No record", "Not entered"). |
| 16 | Search clear icon not keyboard-accessible | `src/components/students/StudentList.js:338-342` | S | Replace plain ClearIcon with `<IconButton size="small" aria-label="Clear search">`. |
| 17 | Confetti ignores prefers-reduced-motion | `src/components/goals/ClassGoalsDisplay.js:56-62` | S | Add `@media (prefers-reduced-motion: reduce)` override to the inline style block. |

## Phase 4: Code Quality & Documentation

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 18 | DRY: Extract shared helpers | `src/routes/students.js`, `src/routes/users.js`, `src/routes/auth.js`, `src/routes/organization.js`, `src/routes/webhooks.js`, `src/routes/wondeAdmin.js` | M | Extract: (a) `csvRow()` to `helpers.js`, (b) `validatePassword()` to `validation.js`, (c) `validateSessionInput()` to `validation.js`, (d) `generateUniqueSlug()` to `helpers.js`. |
| 19 | Update CLAUDE.md file map | `CLAUDE.md` | M | Add ~15 missing file entries (contact.js, billing.js, stripeWebhook.js, stripe.js, statsExport.js, useEnrichmentPolling.js, BillingBanner.js, BillingDashboard.js, SubscriptionBlockedScreen.js, ClassAssignmentBanner.js, WelcomeDialog.js, BookExportMenu.js, BookEditDialog.js, bookImportUtils.js). Update structure YAML files. |
| 20 | Update `.env.example` | `.env.example` | S | Add ENCRYPTION_KEY, SENTRY_DSN, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_ANNUAL_PRICE_ID, STRIPE_AI_ADDON_PRICE_ID, RESEND_API_KEY with descriptions. |
| 21 | Move vite to devDependencies | `package.json` | S | Move `"vite"` from `dependencies` to `devDependencies`. |
| 22 | Fix normalizeTitle Unicode handling | `src/utils/titleMatching.js:18` | S | Change `.replace(/[^\w\s]/g, '')` to `.replace(/[^\p{L}\p{N}\s]/gu, '')`. |

## Phase 5: CI/CD & Nice-to-Haves

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 23 | Add prettier/lint check to CI | `.github/workflows/build.yml` | S | Add step: `npx prettier --check "src/**/*.js"`. Run after item 24. |
| 24 | Remove console.log debug leftovers | `src/components/sessions/SessionForm.js`, `BookAutocomplete.js`, `ClassManager.js`, `MetadataManagement.js`, `AISettings.js` | S | Remove ~10 debug console.log statements. Keep console.error for genuine errors. |
| 25 | Document 5th cron trigger | `wrangler.toml:67-72` | S | Add comment explaining `30 2 * * *` cron (GDPR cleanup at 2:30 AM UTC). |

## Dependencies & Ordering Notes

- **Items 1-6 are all independent** — can be done in parallel, each is a small targeted fix
- **Item 7** (decrypt prefix) needs careful migration planning for existing encrypted data
- **Item 8** (DataContext stale closure) is the most complex fix — requires touching 9 functions with careful testing
- **Item 10** (AbortController) can be done alongside item 8 since both touch component/context code
- **Items 12-17** (accessibility) are all independent and can be done in any order
- **Item 23** (CI lint) should be done after item 24 (console log cleanup) to avoid immediate CI failures
- **Item 19** (CLAUDE.md) should wait until other file-creating changes are settled

## Quick Wins (S effort + High/Medium severity)

These items each take under 15 minutes and have the highest impact:

1. **Item 1**: d1Provider null guard — 1 line
2. **Item 2**: Wonde batch slice fix — 3 lines
3. **Item 3**: Streak MAX() fix — 1 SQL clause
4. **Item 5**: Badge engine org scope — 2 lines
5. **Item 6**: OpenAI error parsing — 1 line
6. **Item 9**: Threshold defaults — 2 lines
7. **Item 11**: ClassGoalsEditor error handling — 5 lines
8. **Item 21**: Move vite to devDeps — 1 line move
9. **Item 22**: normalizeTitle Unicode — 1 regex change
