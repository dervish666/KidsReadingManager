# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Terminal Multiplexer (cmux)

This project uses **cmux** as the terminal multiplexer. Run `cmux help` or `cmux <command> --help` to discover available commands. Use cmux to maximise productivity:

- `cmux read-screen` — read terminal output from other panes/surfaces
- `cmux send` / `cmux send-key` — send commands or keystrokes to other panes
- `cmux new-split` / `cmux new-pane` — create split panes for parallel tasks
- `cmux list-panes` / `cmux list-workspaces` — see current layout
- `cmux notify` — send desktop notifications (e.g. when long tasks complete)
- `cmux set-status` / `cmux set-progress` — update sidebar status/progress indicators
- `cmux log` — write to the sidebar log
- `cmux browser *` — browser automation subcommands

When unsure about a cmux capability, run `cmux help` or `cmux <command>` to check usage.

## Project Overview

Tally Reading is a multi-tenant SaaS application for tracking student reading progress. Built with React 19 frontend and Cloudflare Workers backend (using Hono framework), it runs entirely on Cloudflare's edge infrastructure with D1 database and KV storage.

## Codebase Structure Index

The codebase is large (~190 source files). Two indexes keep this file small:

- **Full per-file map:** `.claude/structure/file-map.md` — one line per file, grouped by directory. Read it for orientation when you don't yet know which file owns a concern.
- **Export signatures & dependencies:** the `.claude/structure/*.yaml` files (see below).

When you add, remove, or rename source files or public classes/functions, update `.claude/structure/file-map.md` and the relevant structure YAML (and the directory list below if a whole directory is added or removed).

### Directory Index

| Directory         | What lives there                                                                                                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/` (root)     | `worker.js` (Worker entry, middleware chain, cron), `App.js`, `index.js`, `instrument.js`                                                                                                                                                                                                                                          |
| `src/routes/`     | REST handlers — auth, mylogin, students, books, classes, genres, covers, users, organization, billing, parent, webhooks, stripeWebhook, support, contact, signup, metadata, badges, termDates, tours, settings, wondeAdmin, hardcover, data (+ `students/`, `books/`, `users/`, `organization/`, `settings/`, `auth/` sub-routers) |
| `src/middleware/` | `tenant.js` (JWT auth, tenant isolation, role guards, audit, rate limit), `errorHandler.js`, legacy `auth.js`                                                                                                                                                                                                                      |
| `src/data/`       | D1 books provider (`d1Provider`, factory `index.js`), `demoSnapshot`                                                                                                                                                                                                                                                               |
| `src/services/`   | `aiService`, `wondeSync`, `metadataService`, `demoReset`, `orgPurge`, and `providers/` (OpenLibrary, Google Books, Hardcover adapters)                                                                                                                                                                                             |
| `src/utils/`      | crypto, validation, helpers, streakCalculator, badge engine/definitions, stripe, rowMappers, routeHelpers, metadata API clients, content moderation, d1Batch, d1Retry, cronWatchdog, caches                                                                                                                                                               |
| `src/contexts/`   | `AuthContext`, `DataContext`, `UIContext`, composite `AppContext`, and `data/` CRUD hooks                                                                                                                                                                                                                                          |
| `src/hooks/`      | `useEnrichmentPolling`                                                                                                                                                                                                                                                                                                             |
| `src/components/` | React UI — root-level pages plus subfolders: `students/`, `books/`, `sessions/`, `schools/`, `classes/`, `badges/`, `goals/`, `parent/`, `stats/`, `tour/`, `news/`, `legal/`                                                                                                                                                      |
| `src/styles/`     | `theme.js` (Material-UI theme)                                                                                                                                                                                                                                                                                                     |
| `scripts/`        | `build-and-deploy.sh`, `sentry-release.sh`, `seed-local.js`, `migration.js`, `reset-admin-password.js`, `export-demo-snapshot.js`, `test-api.js`, `graphify-refresh.sh`                                                                                                                                                            |

### Structure Detail Files

```
.claude/structure/
├── file-map.md           # Full per-file index (one line per source file)
├── routes.yaml           # API route handlers with endpoints
├── middleware.yaml        # Auth, tenant, error handling middleware
├── data.yaml             # Storage providers (D1, KV, JSON)
├── utils-services.yaml   # Utilities and service layer
├── components.yaml       # React components with props
└── contexts-hooks.yaml   # Context providers and custom hooks
```

## Development Commands

### Local Development

```bash
# One-time setup (creates local D1 database with dev user)
npm run seed:local

# Start both frontend and backend (recommended)
npm run start:dev

# Frontend only (requires worker running separately)
npm start          # Runs on http://localhost:3001

# Worker only (API server)
npm run dev        # Runs on http://localhost:8787
```

**Local dev account** (created by `seed:local`):

| Field    | Value               |
| -------- | ------------------- |
| Email    | dev@tallyreading.uk |
| Password | password            |
| Role     | owner               |
| Org      | Dev School          |

### Building & Deployment

```bash
npm run build                 # Build React frontend (Rsbuild, outputs to build/)
npm run go                    # Build + migrate remote D1 + deploy to Cloudflare production
npm run build:deploy:dev      # Build + deploy to dev environment
./scripts/build-and-deploy.sh # Full rebuild with clean install
```

### Database

```bash
npx wrangler d1 migrations apply reading-manager-db --local   # Local
npx wrangler d1 migrations apply reading-manager-db --remote  # Production
npm run migrate                                                # Data migration from old format
```

### Linting

```bash
npm run lint                                                # Run ESLint on src/
npm run lint:fix                                            # Auto-fix lint issues
```

ESLint 10 with flat config (`eslint.config.js`). Key rules: `no-undef` (error), `no-unused-vars` (warn), `react-hooks/rules-of-hooks` (error), `react-hooks/exhaustive-deps` (warn). Backend files get Cloudflare Workers globals; test files get Vitest globals. Zero errors required; warnings are informational.

### Testing

```bash
npm test                                                    # Run all tests once
npm run test:watch                                          # Watch mode
npm run test:coverage                                       # With coverage
npx vitest run src/__tests__/unit/validation.test.js        # Single file
npx vitest run --testNamePattern="password"                 # Pattern match
npm run test:e2e                                            # Playwright E2E tests
npx playwright test e2e/tests/landing.spec.js               # Single E2E file
```

Unit tests use Vitest with happy-dom environment. Setup file (`src/__tests__/setup.js`) mocks Web Crypto API, btoa/atob, and TextEncoder/TextDecoder. The vitest config (`vitest.config.mjs`) aliases `cloudflare:email` to a test mock. Test files live in `src/__tests__/unit/` and `src/__tests__/integration/`. E2E tests use Playwright and live in `e2e/tests/`.

CI runs on push/PR to `main` via GitHub Actions (`.github/workflows/build.yml`), as **three independent jobs**:

| Job | Runs | Node |
| --- | --- | --- |
| `checks` | `prettier --check "src/**/*.js"`, then `npm run lint` | 22.x |
| `build` | `npm run build`, then `npm run test:coverage` | 22.x **and** 24.x |
| `e2e` | Playwright — **PRs only** (`needs: build`) | 22.x |

`checks` and `build` deliberately have **no `needs` between them** — they run in parallel, so a formatting or lint failure cannot stop the test suite from running. Preserve that if you touch this file: they were once steps 1–2 of a single job, and a whitespace-only prettier failure on 2026-07-10 silently skipped lint, build and all 2,493 tests on every push to `main` for a month. The red X read as "a check failed" when it meant "nothing was checked". **Cheap checks must never gate expensive ones**, and the same reasoning applies within `checks` — Lint carries `if: ${{ !cancelled() && steps.install.outcome == 'success' }}` so a formatting nit can't hide a real lint error.

## Architecture

### Tech Stack

- **Frontend**: React 19, Material-UI v7, Rsbuild (build tool), plain JS (no TypeScript)
- **Backend**: Cloudflare Workers, Hono framework, D1 database, KV storage
- **Testing**: Vitest, happy-dom, @testing-library/react

### Authentication System

Three auth modes coexist, auto-detected from environment variables (see the auth-mode detection block in `src/worker.js`):

1. **MyLogin SSO** (`MYLOGIN_CLIENT_ID` configured): OAuth2 Authorization Code flow via MyLogin for school users. Primary auth for schools. Routes in `src/routes/mylogin.js`.
2. **Email/Password** (`JWT_SECRET` configured): JWT auth with email/password for owner account and fallback.
A third mode — **legacy shared-password** (`WORKER_ADMIN_PASSWORD`, KV-backed) — was removed in 2026-08. Nothing used it, but every route carried an `isMultiTenantMode(c)` branch to serve it, and `services/kvService.js`, `middleware/auth.js`, `routes/data.js` and a whole second login form existed only for it. `JWT_SECRET` is now required and the Worker returns 500 without one. **KV itself is still used** — org-status cache, recommendations cache, Wonde sync lock, demo-reset fingerprint — just not as a data store.

After MyLogin OAuth completes, the system issues a standard Tally JWT — the frontend auth flow works identically for SSO and email/password users. JWT payload includes `authProvider` field (`'mylogin'` or `'local'`).

JWT lifecycle: access tokens (15 min) + refresh tokens (7 days). Client auto-refreshes 60 seconds before expiration. Password hashing uses PBKDF2 with 100,000 iterations (`src/utils/crypto.js`). Role constants defined in `ROLES` object in `src/utils/crypto.js`.

### Request Flow

1. Request hits Cloudflare Worker (`src/worker.js`)
2. Middleware chain: `logger()` → `cors()` → security headers → `errorHandler()` → auth middleware (JWT or legacy) → `tenantMiddleware()`
3. Auth endpoints additionally pass through `authRateLimit()` (rate limiting via D1 `rate_limits` table)
4. Routes in `src/routes/` handle business logic
5. Data providers (`src/data/`) abstract storage layer

### Frontend Architecture

**State Management**: Three domain-specific contexts replace the former single `AppContext`:

- `AuthContext` (`src/contexts/AuthContext.js`) — auth tokens, user, login/logout, `fetchWithAuth`, permissions, org switching. Changes rarely (login/logout/org switch only).
- `DataContext` (`src/contexts/DataContext.js`) — students, classes, books, genres, settings. State + reload logic lives here; domain CRUD is in `src/contexts/data/` hooks (useStudentOperations, useBookOperations, useSessionOperations, useClassOperations). Re-renders when entity data changes.
- `UIContext` (`src/contexts/UIContext.js`) — class filter, priority list, reading status, tours. Re-renders on filter/settings changes.

Hooks: `useAuth()`, `useData()`, `useUI()`. The composite `AppProvider` in `src/contexts/AppContext.js` nests all three (`Auth > Data > UI`). All API calls go through `fetchWithAuth()` (from AuthContext) which auto-attaches JWT and handles 401 refresh. Concurrent requests share a single refresh promise to prevent thundering herd on token expiry.

**Owner Organization Switching**: Owners can switch org context via `X-Organization-Id` header (set in `fetchWithAuth()` when `activeOrganizationId` is set). Backend validates this in `tenantMiddleware()` — only works for `owner` role.

**Frontend-Backend Integration**:

- Development: Rsbuild proxies `/api` to `http://localhost:8787` (see `rsbuild.config.mjs`)
- Production: Worker serves both API (`/api/*`) and static assets from `build/` directory

### Data Storage

**D1 (Multi-Tenant)**: Normalized SQL tables with organization scoping. Provider: `src/data/d1Provider.js`
**Provider**: `src/data/index.js` is D1-only — it throws without the `READING_MANAGER_DB` binding. The former KV/JSON book providers were removed (audit cycle 15): they covered only the books interface while everything else used D1 directly, so local "json mode" diverged from production. Local dev uses a local D1 database (`npm run seed:local`). KV remains in use for caching and the legacy shared-password mode (`services/kvService.js`).

**Critical**: D1 batch operations are limited to 100 statements. Chunk with `D1_BATCH_LIMIT` from `src/utils/d1Batch.js` — see `src/routes/books/import.js` or `src/routes/students/_shared.js`.

### Naming Conventions

- **Database**: snake_case columns (`organization_id`, `reading_level_min`)
- **JavaScript**: camelCase properties (`organizationId`, `readingLevelMin`)
- Data providers handle the conversion between these conventions.

## Multi-Tenant Architecture

### Organization Isolation

`tenantMiddleware()` injects `c.get('organizationId')` into Hono context. All routes filter with `WHERE organization_id = ?`. Users only access their organization's data (except owners).

### Role Hierarchy

- **Owner**: Full system access, manages all organizations, can switch between schools
- **Admin**: Organization-level management, creates users/teachers
- **Teacher**: Manages students, classes, reading sessions
- **Readonly**: View-only access

Permissions enforced via `requireOwner()`, `requireAdmin()`, `requireTeacher()`, `requireReadonly()` helpers in `src/middleware/tenant.js`. Audit logging via `auditLog()` middleware wrapper (same file).

### Key Tables

- `organizations` - Multi-tenant foundation (soft delete via `is_active`, `legal_hold` prevents automated purge, `purged_at` marks anonymised tombstones)
- `users` - Accounts with roles and org FK (soft delete via `is_active`)
- `students` - Organization-scoped, has `reading_level_min`/`reading_level_max` range, demographics from Wonde (`date_of_birth`, `gender`, `first_language`, `eal_detailed_status`)
- `reading_sessions` - Session data linked to students (hard delete)
- `books` - Global catalog with FTS5 search (`books_fts` virtual table)
- `org_book_selections` - Links books to organizations (controls per-school visibility)
- `classes`, `genres`, `organization_settings` - Organization-scoped. `classes.year_group` is an optional admin-set year group used to resolve a student's year when the MIS syncs none and the class name doesn't encode it (precedence: `students.year_group` → `classes.year_group` → parsed from class name; see `src/utils/yearGroup.js`)
- `term_dates` - Academic year term dates per organization (half-terms, holidays)
- `parent_access_tokens` - Token-based parent portal access per student per academic year (token auth, teacher-revocable)
- `student_recommendations` - Latest AI recommendation snapshot per student (one row per student, `student_id` PK, `suggestions` JSON). Written (upsert) by `GET /api/books/ai-suggestions` whenever recs are generated/served for a student; read read-only by the parent portal's "Book Ideas" tab (`GET /api/parent/:token/book-ideas`, lazy-loaded) so parents see the same AI picks as a take-away — no AI is run on the public endpoint. That same endpoint also returns **live** school-library matches (`computeLibraryRecommendations` in `src/utils/libraryRecommendations.js`, shared with the teacher's `/library-search`) so Book Ideas isn't empty for schools without the AI add-on. AI snapshot suppressed when `students.ai_opt_out` is set (library shown regardless — it's a deterministic catalogue query, not AI); purged on student erase / org purge (migration 0068)
- `ticker_events` - Celebration events (band-ups, badge awards) for the header Reading News ticker; written by `runSessionSideEffects` (real-time) and `processBadgesForOrg` (overnight badge cron), read via `GET /api/badges/ticker`, purged after 2 days by the 2 AM cron

### Book Visibility Model

Books use a shared global catalog with per-organization visibility via `org_book_selections`. When schools import books, matching books are linked (not duplicated). Each school only sees books linked to them.

**Shared catalog is owner-only for writes.** The `books` row is global — editing it affects every linked school. Only the `owner` role may edit shared metadata (title/author/description/isbn/etc.) via `PUT /api/books/:id`; non-owners attempting metadata edits get 403. A school customises a book's reading level for itself only, via the per-org `org_book_selections.reading_level_override` column (migration 0066). NULL = use the global `books.reading_level`. The read path COALESCEs the override over the global value — `rowToBook` (`src/utils/rowMappers.js`) prefers `reading_level_override` when an org-scoped query selects it, so every org-scoped book read must `SELECT … obs.reading_level_override` (or, for explicit column lists like recommendations, `COALESCE(obs.reading_level_override, b.reading_level)`). This rides on the `org_book_selections` row already INNER JOINed on every org book read — no extra query/round-trip. Non-owner reading-level edits (`PUT /api/books/:id`, import-confirm conflicts) write the override, never the global row. The book-edit dialog (`src/components/books/BookEditDialog.js`) disables shared-metadata fields for non-owners and sends only `readingLevel` on their saves.

## Important Implementation Details

### Book Recommendations (AI)

Optimized for large collections (18,000+ books):

1. SQL pre-filter by reading level range + genres, exclude already-read
2. Randomize and limit to ~100 books
3. Send to AI provider with student context and focus mode (balanced/consolidation/challenge)

See `src/routes/books/recommendations.js` and `src/components/BookRecommendations.js`. AI providers configured in `src/services/aiService.js`.

### AI Entitlement (shared by every AI feature)

**There is exactly one place that resolves an AI key: `resolveAiConfig()` in `src/utils/aiProviderResolver.js`.** Precedence is BYOK (`org_ai_config`, needs no add-on — the school is spending its own tokens) → `organizations.ai_addon_active` must be 1 → `platform_ai_keys` → env vars. `buildFailoverChain()` in the same file appends the other configured providers behind the primary. Both were inlined in `recommendations.js` until a second AI feature needed them; a copy-paste of that block is how one feature quietly ends up ignoring a school's own key. There is still **no** `requireAiAddon()` middleware and `ai_addon_active` is **not** on the Hono context or in the KV org-status cache, so each AI request pays one extra D1 read.

**The frontend gate is easy to get wrong, and one copy already is.** The only correct expression is: `keySource === 'organization' || ((keySource === 'platform' || keySource === 'environment') && aiAddonActive)`. `src/components/BookRecommendations.js:416` omits the `aiAddonActive` check on the `platform` branch, so a school with no add-on sees a green "AI: Claude" chip and an "Ask AI" button that 403s. `ReadingStats.js` uses the correct form. Both read `GET /api/settings/ai`, which has **no role guard** — any authenticated role can read the org's provider and add-on state.

### Stats AI Summary

`POST /api/students/stats/ai-summary` (`src/routes/students/aiSummary.js`, `requireAdmin()`) turns the figures on the Stats page into a narrative briefing for a headteacher. Rendered by `src/components/stats/AiSummaryPanel.js`, launched from the Stats header button, which appears only for admin/owner **and** only when AI is genuinely usable.

- **The client POSTs the figures rather than the server recomputing them.** Deliberate: two of the numbers on screen (reading-band spread, needs-attention count) are derived in the browser from `UIContext.getReadingStatus` and have no server endpoint, and a summary quoting different totals from the page it sits on would be worse than none. That makes the body untrusted input.
- **`sanitiseStatsPayload()` in `src/services/statsSummaryService.js` is the privacy boundary.** It is a true allow-list that rebuilds the object from scratch, coercing every number and capping every string. It must never grow a pupil name, id, or any field in `PROTECTED_STUDENT_FIELDS`. Note `/api/students/stats` returns `topStreaks` as student IDs — the client payload builder deliberately does not spread `...stats` for exactly that reason. `src/__tests__/unit/statsSummaryService.test.js` asserts the exclusions; if you widen the allow-list you will have to delete a test that exists to stop you.
- **The published sub-processor register describes this feature.** `public/legal/sub-processors.md` §3.2 and `docs/gdpr/{02,04,08}` now say AI providers are engaged for recommendations *and* aggregate statistics summaries, and that the latter sends no personal data. Widening what the summary sends makes those published statements false.
- **The prompt gets the school calendar, and that is what stops it being wrong.** `buildCalendarContext` in `src/utils/schoolCalendar.js` turns the org's `term_dates` rows plus today (in the org timezone) into: term/break/holiday status, days since the last term ended, and **school days in the last 7 and 14 days**. Without it, the first version reported "reading activity has stalled completely in the past two weeks" on 15 August — 29 days into the summer holidays. Two figures poison a summary outside term time and the prompt now says so explicitly: `weeklyActivity` is always relative to *today* regardless of the selected period, and the reading-status flags are days-since-last-read so they flag the whole school after any break. When `schoolDaysInLast14 === 0` the prompt carries a hard instruction not to call it a stall. **The query deliberately loads every academic year, not the current one** — `getCurrentAcademicYear()` rolls over on 1 August, so an August school with no next-year dates entered would look like it had no calendar at all, exactly when it matters. No term dates at all → the prompt says it cannot tell term time from a holiday rather than guessing.
- **The cache key is a hash of the sanitised payload itself** (`summaryCacheKey`), so the figures changing *is* the invalidation and re-clicking on an unchanged page is free. 24h TTL in `RECOMMENDATIONS_CACHE`. The calendar (`today`, `status`, `schoolDaysInLast14`) is in the key too — during a long holiday nothing is logged, so the figures are byte-identical week to week and day 20 of the break would otherwise be served the summary written on day 3. Bump `STATS_SUMMARY_PROMPT_VERSION` when the prompt or output contract changes — nothing else invalidates.
- **The school's name is sent, and comes from the `organizations` row, never the request body.** `sanitiseStatsPayload(raw, { schoolName })` takes it as a separate server-supplied argument for exactly that reason — a `schoolName` in the client payload is dropped on the floor.
- Shares the org's monthly AI bucket with recommendations (`aiCostCap.js`, 500/month default), plus `costRateLimit(5)` per minute in `worker.js`.
- **`parseStatsSummaryResponse` degrades rather than throws.** A non-JSON reply renders as plain prose with `degraded: true` and a `console.warn`, because an approximate summary beats a 500 — but it means provider failover only covers transport failures, not badly-shaped replies.
- Zero sessions or zero pupils short-circuits to a deterministic message **before** any provider call, so an empty school costs nothing and cannot be given an empty table and an invitation to invent a trend.

### Reading Level Range

Students have `readingLevelMin` to `readingLevelMax` (AR levels 1.0–13.0). UI: `src/components/students/ReadingLevelRangeInput.js`. Validation in `src/utils/validation.js`.

### Home Reading Register

Unified register for class-wide home reading: status buttons (read/multiple/absent/no record), multi-day history with date range presets (This Week/Last Week/Last Month/Custom), daily totals footer, student book persistence, bulk session creation. See `src/components/sessions/HomeReadingRegister.js`.

### Book Cover System

`BookCover` (`src/components/BookCover.js`) resolves covers entirely via the worker. Two routes exist on `/api/covers` (`src/routes/covers.js`): `/:type/:key` for identifier-based lookups (ISBN, OpenLibrary ID) and `/search?title=…&author=…` for title-based lookups. Both check R2 first, then chain OpenLibrary → Google Books → Hardcover (the same provider adapters used for metadata enrichment). Successful covers are cached in R2 for 30 days; 404s carry a 1-hour Cache-Control so broken titles don't hammer providers. Component behaviour: prefer the ISBN URL when available, fall through to the search URL on image error, and show a deterministic gradient placeholder (`BookCoverPlaceholder`) if all attempts fail.

### Multi-School Library Import

CSV import wizard (`src/components/books/BookImportWizard.js`) with:

- Column auto-detection + manual override
- Deduplication: exact match (auto-link), fuzzy match at 85% similarity (flagged for review), new books created
- API: `POST /api/books/import/preview` and `POST /api/books/import/confirm`
- String matching: `src/utils/stringMatching.js` (Levenshtein distance)

### Error Handling

Global error handler in `src/middleware/errorHandler.js` standardizes all error responses. Helper constructors: `notFoundError()`, `badRequestError()`, `serverError()`. 5xx responses are sanitized to prevent internal detail leakage.

### Public Endpoints

Public paths are defined in `PUBLIC_PATHS` in `src/utils/constants.js` (imported by `src/middleware/tenant.js`): `/api/auth/mode`, `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/mylogin/login`, `/api/auth/mylogin/callback`, `/api/auth/demo`, `/api/webhooks/wonde`, `/api/webhooks/stripe`, `/api/health`, `/api/login` (legacy redirect), `/api/logout`, `/api/signup`, `/api/contact`, `/api/covers/*`, and `/api/parent/*` (token-authenticated, bypasses JWT/tenant/subscription middleware). When adding public paths, update `PUBLIC_PATHS` in `src/utils/constants.js` AND the tenant middleware bypass in `src/worker.js`. **Important:** Each public path must be explicitly listed — do not use wildcard `startsWith` patterns for new path prefixes, as this creates unintended auth bypass for all future routes under that prefix. The `/api/webhooks/wonde` endpoint is public but implements its own shared-secret authentication via `WONDE_WEBHOOK_SECRET`. The `/api/webhooks/stripe` endpoint verifies signatures via `STRIPE_WEBHOOK_SECRET`. The `/api/parent/*` public endpoints use token-in-URL authentication — the token IS the auth; teacher-facing endpoints under the same router use JWT auth.

### Scheduled Tasks

Cron triggers (all in `src/worker.js` `scheduled` handler):

- **Every minute** — background metadata enrichment job processing (`src/services/metadataService.js`). Its `metadata_jobs` probe query **logs** D1 failures rather than capturing them (see the D1 transients gotcha below), and heartbeats `recordCronSuccess('metadata-enrichment')` on the :00/:15/:30/:45 slots so the watchdog can still see it die.
- **Hourly at :07** — demo environment reset (`src/services/demoReset.js`) + cron liveness watchdog (`checkCronFreshness`). **:07, not :00** — on the hour it collided with the 02:00 and 03:00 nightly jobs. The schedule string lives in **three** places that must agree: `wrangler.toml` `[triggers]`, the `event.cron` test in `src/worker.js`, and `schedule.value` in that job's `Sentry.withMonitor` options; a mismatch is silently rejected at ingest and the monitor just stops working.
- **2:00 AM UTC** — streak recalculation + GDPR purge (`src/utils/streakCalculator.js`, `src/services/orgPurge.js`)
- **2:30 AM UTC** — badge evaluation + class goal drift correction (`src/utils/badgeEngine.js`, `src/utils/classGoalsEngine.js`)
- **3:00 AM UTC** — Wonde delta sync (`src/services/wondeSync.js`)

**The demo reset is conditional.** `resetDemoData(db, kv)` computes a one-round-trip fingerprint of everything a demo visitor can change (row counts plus `MAX(updated_at)` on `students` and `org_book_selections`) and skips the whole job when it matches the fingerprint stored in KV, with a 6-hour floor that forces a reset regardless. It used to delete and re-insert all 2,791 snapshot rows every hour forever — ~67k row-writes a day rebuilding byte-identical data, the largest recurring writer in the system, on the same D1 primary the real schools use. Two traps if you touch it: a `COUNT(*)` guard is **not** sufficient (a teacher setting `org_book_selections.reading_level_override` changes no count), and `processBadgesForOrg` must **not** be given a watermark here (snapshot sessions carry fixed March/April `created_at`, so any watermark matches zero students and the demo shows no badges at all).

**The snapshot references global tables it does not own**, so it rots on its own: `org_book_selections.book_id` and `reading_sessions.book_id` point at `books`, and `student_preferences.genre_id` at `genres`. An owner deleting a book or retiring a genre leaves those rows failing `FOREIGN KEY constraint failed` on *every* reset — seven book selections and ten preferences had been failing that way since the April export, invisible until v3.116.0 started reporting fallbacks. `EXTERNAL_REFS` in `src/services/demoReset.js` now reads each referenced table's id set once per reset and skips the dead rows, so the demo self-heals instead of needing the snapshot re-cut; the load is deliberately **fail-open** (a table it cannot read is left unfiltered, because failing closed would serve a demo with an empty library). Two rules that follow: the fingerprint is withheld when a step actually **failed** but not when rows were merely **skipped** (skips are stable, expected drift — blocking on them would restore the hourly rebuild), and skipped/failed counts are logged separately because `${rows.length} rows inserted` once printed 2,411 on a reset that landed 2,404.

**`scripts/export-demo-snapshot.js` is not safe to run blind.** It used to carry `AND session_date > date('now', '-90 days')` on `reading_sessions`, and the demo's sessions are fixed January–April dates — so from mid-July onwards, re-exporting would have written a snapshot with **zero** reading sessions and the next reset would have served an empty demo school. The window is gone, but the general point stands: the export takes whatever is in the demo org *right now*, so check the row counts it prints against the previous snapshot before committing the result.

### Wonde + MyLogin Integration

School data sync and SSO login via two external services:

**Wonde Data Sync** (`src/utils/wondeApi.js`, `src/services/wondeSync.js`): Syncs students, classes, and teacher data from school MIS systems. Schools are onboarded via `schoolApproved` webhook (`src/routes/webhooks.js`), which creates the organization and triggers a full sync. Daily delta sync runs at 3 AM. Manual sync available via `POST /api/wonde/sync` (admin only, `src/routes/wondeAdmin.js`).

**MyLogin OAuth2 SSO** (`src/routes/mylogin.js`): OAuth2 Authorization Code flow. Login initiation stores state in KV, redirects to MyLogin. Callback exchanges code for token, fetches user profile, matches org by `wonde_school_id`, creates/updates user by `mylogin_id`, issues standard Tally JWT. **Staff only:** the only permitted MyLogin types are admin→admin and employee→teacher (`STAFF_ROLE_BY_MYLOGIN_TYPE` in `src/routes/mylogin.js`). Any other type — student, parent, or one added by MyLogin later — is refused at the callback with `?auth=error&reason=staff_only` *before* any org lookup or user row is touched, so no account is ever created for a pupil. Students previously mapped to `readonly`, which let a pupil see every class, student and teacher in their school (found by Wonde's integration testers, July 2026). Student *records* still sync from Wonde into the `students` table as normal — that is unrelated to logins.

**MyLogin's own quirks, verified against their live API (v3.117.0):** their profile schema makes `email` **nullable** (support staff often have none in the MIS) and `organisation.wonde_id` **nullable** (org not Wonde-connected) — `users.email` is `UNIQUE NOT NULL` *globally*, so the callback synthesises `mylogin-<id>@no-email.invalid` on insert, `COALESCE(?, email)` on update, and adopts a same-org local account that already holds the address rather than colliding (cross-org or already-linked → `email_conflict`). The stored row's `organization_id` is the tenant boundary the JWT is scoped to, so it is re-checked against the org MyLogin authenticated for (`school_mismatch`) — matching by `mylogin_id` alone would serve a moved teacher their previous school's children. `/oauth/authorize` also takes an optional `organisation=<slug|encoded id>` that skips MyLogin's national school picker; we forward it from `/?school=<slug>`. To check whether a school is on MyLogin at all (separate from Wonde data approval): `GET https://app.mylogin.com/login/api/organisations?search=<term>`.

**Key tables**: `wonde_sync_log` (sync tracking), `wonde_employee_classes` (teacher-class mapping from sync, used at first login). New columns on `organizations` (wonde_school_id, wonde_school_token, wonde_last_sync_at, mylogin_org_id), `users` (mylogin_id, wonde_employee_id, auth_provider), `students` (wonde_student_id, sen_status, pupil_premium, eal_status, fsm, year_group, date_of_birth, gender, first_language, eal_detailed_status), `classes` (wonde_class_id). See `migrations/0024_wonde_mylogin_integration.sql`.

**Token security**: Wonde school tokens are AES-GCM encrypted in D1 using `encryptSensitiveData`/`decryptSensitiveData` from `src/utils/crypto.js`.

## Common Development Patterns

### Adding a New API Endpoint

1. Add route handler in `src/routes/*.js`
2. Use `c.get('organizationId')` for tenant scoping — **always** add `WHERE organization_id = ?` to queries
3. Access D1 via `c.env.READING_MANAGER_DB`
4. Apply role guards: `requireOwner()`, `requireAdmin()`, `requireTeacher()`, or `requireReadonly()` from `src/middleware/tenant.js`
5. For tables with soft delete (`organizations`, `users`), filter `WHERE is_active = 1` — this is not automatic
6. Return JSON with proper HTTP status codes

### Adding a Database Migration

1. Create `migrations/XXXX_description.sql` (next sequential number in `migrations/`)
2. Use `IF NOT EXISTS` for safety (migrations are forward-only, no down migrations)
3. Test locally: `npx wrangler d1 migrations apply reading-manager-db --local`
4. Apply to remote **before** pushing code that uses the new schema: `npx wrangler d1 migrations apply reading-manager-db --remote`

**Deploying is manual — use `npm run go`, not push-to-deploy.** `npm run go` builds, applies remote D1 migrations, then `wrangler deploy`s, all in one command; run it after `/ship` pushes. Because it applies migrations immediately before deploying, new-column code and its migration go out together (no 500 gap), so you don't have to apply migrations separately first. **Do not rely on Cloudflare Workers Builds:** CWB used to auto-deploy on push to `main`, but on 2026-07-02 it went unreliable — running 40+ min behind and deploying a _stale_ commit late, which rolled prod back to an older version. Until it's fixed, **disable CWB** (Worker → Settings → Builds → turn off automatic/branch deploys) or it will keep clobbering manual deploys with stale ones. The `/ship` skill ends at `git push`; `npm run go` is the separate, authoritative deploy step. Keep migrations backward-compatible (additive, nullable columns) regardless.

### Working with Data Providers

Books data operations live in `d1Provider.js`, exposed via `createProvider(env)` in `data/index.js` (D1-only). Other entities (students, sessions, classes, settings) are queried directly in their route modules — that is intentional, not a missing abstraction.

## Local Development Setup

After first checkout, run `npm run seed:local` once. It applies the migrations to a local D1 database, seeds a dev owner account (`dev@tallyreading.uk` / `password`), **and writes `.dev.vars` with a `JWT_SECRET`** — so there is nothing to configure by hand. It is safe to re-run (migrations are idempotent, seed rows are `INSERT OR IGNORE`).

`.dev.vars` is the only file the worker reads locally — that is Wrangler's convention.

**A `.env` file is read by nothing.** This section used to claim local dev "requires two files" with `.env` supplying `JWT_SECRET`; it does not. Verified 2026-08-18 by deleting `.env` and booting `wrangler dev`: `/api/health` returned `200 {"database":"connected"}`. The repo has no `dotenv` import outside `e2e/playwright.config.js`, which reads `.env.e2e` only. The committed `.env` also still sets `STORAGE_TYPE`, a leftover of the KV/JSON providers deleted in audit cycle 15.

The frontend dev server (port 3001) proxies `/api` requests to the worker (port 8787). Use `npm run start:dev` to run both concurrently.

### Utility Scripts

- `scripts/build-and-deploy.sh` — Full rebuild + deploy pipeline (supports `production` and `dev` args)
- `scripts/sentry-release.sh` — Runs between build and deploy: uploads source maps to Sentry, then **always** deletes every `.map` from `build/`. rsbuild's `hidden-source-map` still writes map files and `[assets]` deploys the whole directory, so without this the full unminified source is served publicly. Needs `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` to upload; skips the upload loudly without them but still strips the maps. See `docs/sentry.md`.
- `scripts/migration.js` — Data migration from old format to new
- `scripts/reset-admin-password.js` — Admin password reset utility
- `scripts/seed-local.js` — Bootstrap local D1 with migrations and a dev owner account (dev@tallyreading.uk / password)
- `scripts/graphify-refresh.sh` — Rebuild the graphify knowledge graph from a scoped staging copy of `src/` (tests excluded); `--label` re-names communities via the local claude CLI
- `scripts/reading-news-stats.mjs` — Read-only aggregate of most-read books/authors across all schools from D1 (`wrangler ... --remote --json`); feeds the `reading-news` skill (`.claude/skills/reading-news/`) that generates `public/reading-news.json` for the Stats-page news ticker

## Configuration

### Environment Variables (Cloudflare)

- `JWT_SECRET` - **Required.** JWT auth secret; the Worker returns 500 without it
- `ENCRYPTION_KEY` - Optional separate key for AES-GCM encryption of sensitive data (Wonde tokens, API keys). Falls back to `JWT_SECRET` if not set. Recommended for defense-in-depth.
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` - AI recommendation providers
- `ALLOWED_ORIGINS` - Comma-separated CORS whitelist
- `EMAIL_FROM` - Email sender address
- `MYLOGIN_CLIENT_ID` - MyLogin OAuth2 client ID
- `MYLOGIN_CLIENT_SECRET` - MyLogin OAuth2 client secret
- `MYLOGIN_REDIRECT_URI` - MyLogin OAuth2 callback URL (e.g. `https://tallyreading.uk/api/auth/mylogin/callback`)
- `WONDE_WEBHOOK_SECRET` - Shared secret for Wonde webhook authentication. Accepted **either** as an `X-Webhook-Secret` header **or** as `?secret=<value>` on the webhook URL (v3.119.0). Wonde's dashboard offers a URL field and event checkboxes only — there is nowhere to set a custom header — so the query string is the mechanism actually in use, and the secret should be treated as log-exposed. See the webhook gotcha below.
- `SENTRY_DSN` - Sentry error tracking DSN (Worker only; the frontend DSN is public and hardcoded in `src/instrument.js`)
- `APP_VERSION` - **Not an env var you set.** `src/worker.js` reads the version from the bundled `package.json`. An `env.APP_VERSION` still wins if explicitly set, but nothing sets it. See the APP_VERSION gotcha below for why the old deploy-time `--var` approach was removed — this paragraph used to describe it as current, which is the belief that caused the outage.
- `STRIPE_SECRET_KEY` - Stripe API secret key (set via `wrangler secret put`)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret (set via `wrangler secret put`)
- `STRIPE_ANNUAL_PRICE_ID` - Stripe price ID for annual plan
- `STRIPE_AI_ADDON_PRICE_ID` - Stripe price ID for AI add-on
- `APP_URL` - Application URL (used in MyLogin redirects and email links)
- `PUBLIC_REGISTRATION_ENABLED` - Controls open registration (true/false)

### Wrangler Bindings (`wrangler.toml`)

- `READING_MANAGER_KV` - KV namespace for legacy storage
- `READING_MANAGER_DB` - D1 database for multi-tenant storage
- `RECOMMENDATIONS_CACHE` - KV namespace for AI recommendation caching
- `BOOK_COVERS` - R2 bucket for cached book cover images
- `EMAIL_SENDER` - Email sending (requires Email Routing on domain)

## Gotchas

Long-form incident background for the linked entries lives in [`docs/incidents.md`](docs/incidents.md) — moved there to keep this file readable; nothing was deleted.


- **D1 batch limit**: Max 100 statements per `db.batch()` call. Chunk with `D1_BATCH_LIMIT` from `src/utils/d1Batch.js`; see `src/routes/books/import.js`.
- **Soft delete is not automatic**: `organizations` and `users` use `is_active` column. Queries must explicitly filter `WHERE is_active = 1` — forgetting this returns "deleted" records.
- **snake_case ↔ camelCase**: Database uses snake_case, JavaScript uses camelCase. Conversion happens in `rowTo*()` functions (e.g., `rowToStudent`, `rowToBook`). New columns need mapping in both directions.
- **Routes sometimes bypass the data provider**: Some routes (especially `books/core.js`) call D1 directly for complex queries (FTS5, JOINs) instead of going through the provider abstraction. This is intentional when query complexity exceeds what the provider interface supports.
- **Security headers applied after handler**: In `src/worker.js`, security headers are set in the `onResponse` callback, meaning they run after the route handler executes.
- **Rate limiting uses D1**: Auth rate limiting stores attempts in the D1 `rate_limits` table, not Cloudflare's built-in rate limiting. See `authRateLimit()` in `src/middleware/tenant.js`.
- **Never deploy source maps**: `hidden-source-map` still writes `.map` files and `[assets]` ships the whole `build/` directory. Deploy only via `npm run go` or `scripts/build-and-deploy.sh` — both run `scripts/sentry-release.sh`, which strips them. See [Incidents](docs/incidents.md#never-deploy-source-maps).
- **A Sentry cron monitor only goes red if the callback throws**: if a wrapped handler catches and logs its own error, `withMonitor` reports success. Rethrow. See [Incidents](docs/incidents.md#sentry-monitor-swallowed-errors).
- **Only one Sentry cron monitor is available** (free plan) and it is spent on `demo-environment-reset`. The three nightly crons use `cron_runs` + `src/utils/cronWatchdog.js` instead — do not add `withMonitor` to them. See [Incidents](docs/incidents.md#one-sentry-cron-monitor).
- **Sentry monitor schedules must be `{ type: 'crontab', value: '…' }`**: the `{ crontab: '…' }` shorthand is silently rejected at ingest and no monitor is created. After adding one, confirm it appears on Sentry's Crons page. See [Incidents](docs/incidents.md#sentry-monitor-schedule-shape).
- **A D1 error from a cron is usually Cloudflare's, not yours**: `D1_ERROR: internal error; reference = …`, `Network connection lost` and `DB is overloaded` are platform-side. **Never `captureException` a transient D1 failure from a high-frequency cron** — log it and let the watchdog alert on sustained absence. Wrap the cron's own D1 calls in `retryD1()` from `src/utils/d1Retry.js` instead; it retries the known transient signatures three times, refuses to retry a constraint error, and rethrows once the attempts are spent so a real failure still reaches Sentry. See [Incidents](docs/incidents.md#transient-d1-errors).
- **Cron staleness alerts are edge-triggered, not hourly**: `checkCronFreshness` captures one Sentry event per outage and stamps `cron_runs.stale_alerted_at`; `recordCronSuccess` clears it, so recovery re-arms the alert. A job that stays stale re-alerts once every `STALE_REALERT_HOURS` (24) — never zero, because an alert that fires once and goes quiet is indistinguishable from a fixed problem. Before this, one missed badge run produced 22 events and 3 emails titled 27h through 48h. See [Incidents](docs/incidents.md#cron-staleness-edge-trigger).
- **`APP_VERSION` comes from the bundled `package.json`, not a deploy-time `--var`**: `src/worker.js` imports it from `package.json`. `/api/health` is NOT a check for this — verify with `wrangler versions view <live-id>` or by searching Sentry for `release:tally-reading@3.x`. See [Incidents](docs/incidents.md#app-version-source).
- **Class goals use `resolveAcademicYear`, never `resolveCurrentTerm`**: every `class_goals` row is keyed by an academic year (`2025/26`), not a calendar quarter (`Q3 2026`). **Every statement touching `class_goals` must carry `AND term = ?`.** See [Incidents](docs/incidents.md#class-goals-term-key).
- **MyLogin may never remove an elevated Tally role**: `resolveRole` in `src/routes/mylogin.js` blocks elevation *and* pins `admin`/`owner`. Users are matched by `mylogin_id`, then email, then `wonde_employee_id`. See [Incidents](docs/incidents.md#mylogin-role-pin).
- **Bot Fight Mode stays OFF on this zone.** It 403s every inbound webhook (Wonde, Stripe) at the edge — no log line, no Sentry event, no D1 row, because the request never reaches the Worker. A WAF skip rule does not rescue it on the free plan. See [Incidents](docs/incidents.md#bot-fight-mode-webhooks).
- **A shared secret in a query string is not the string you stored**: `URLSearchParams` decodes `+` as a space, so a base64 secret arrives mangled. `readQuerySecret()` in `src/routes/webhooks.js` parses the raw query instead. Applies to any secret ever put in a URL. See [Incidents](docs/incidents.md#query-string-secret-plus).
- **Prettier**: `.prettierrc` (single quotes, trailing commas, 100 cols), auto-run on edited files via a Claude Code hook and re-checked by `.githooks/pre-commit` (activated by `npm install`). Bypass once with `git commit --no-verify`. See [Incidents](docs/incidents.md#prettier-pre-commit).
- **Dependabot**: weekly npm + monthly actions updates; dev and prod minor/patch grouped, majors individual. Read advisories for *applicability* first — most land on dev-only transitives that never reach the Worker. See [Incidents](docs/incidents.md#dependabot-scope).
- **ESLint**: see the Linting section under Development Commands.

## Design Context

Full design context is maintained in `.impeccable.md` at the project root. Key principles for quick reference:

### Brand Personality

**Warm, Practical, Caring** — like a trusted teaching assistant. Understated British voice: friendly but not patronising, helpful without being showy.

### Aesthetic Direction

"Cozy Bookshelf" theme: warm creams, sage greens, soft earth tones. Light mode only. Glassmorphism surfaces with warm shadows. The app should feel like a well-loved school library corner, not an enterprise dashboard.

### Design Principles

1. **Invisible until needed** — The interface disappears during reading sessions. Nothing distracts from the child and the book.
2. **Big enough to tap without thinking** — Minimum 44px touch targets, prefer 48px+. Volunteers shouldn't concentrate on hitting a button while a child reads.
3. **Warm, never clinical** — Cream over white, sage over blue, rounded over sharp. Every surface should feel cozy.
4. **One glance, full picture** — Key info scannable without interaction. Colour, position, and size create natural hierarchy.
5. **Trust through simplicity** — Schools trust tools that feel simple and safe. Every screen should feel manageable.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `./scripts/graphify-refresh.sh` to keep the graph current (AST-only, no API cost). Do **not** run `graphify update .` from the repo root — the graph is built from a scoped staging copy of `src/` with tests excluded (graphify has no exclude flags), and a root rebuild would clobber it with test-fixture noise. Add `--label` to re-name communities (uses the local claude CLI).
- Graph node paths are relative to `src/` (e.g. `components/BookManager.js`, not `src/components/BookManager.js`).
