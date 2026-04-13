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

The file map below provides instant orientation. For detailed export signatures and dependencies, read the relevant `.claude/structure/*.yaml` file for the directory you're working in.

After adding, removing, or renaming source files or public classes/functions, update both the file map below and the relevant structure YAML file.

### File Map

<!-- One line per source file: relative path - brief description -->

<!-- Entry point -->
src/worker.js - Cloudflare Worker entry; middleware chain, route registration, scheduled tasks
src/App.js - Main React app component; layout, routing, auth gate
src/index.js - React app entry point
src/instrument.js - Sentry browser SDK initialization

<!-- Backend Routes -->
src/routes/auth.js - POST/GET register, login, refresh, logout, password reset
src/routes/mylogin.js - MyLogin OAuth2 SSO (login, callback, logout)
src/routes/students.js - GET/POST/PUT/DELETE student CRUD, bulk import
src/routes/books.js - GET/POST/PUT/DELETE books, AI recommendations, search, CSV import
src/routes/classes.js - GET/POST/PUT/DELETE class management, GET/PUT class goals
src/routes/genres.js - GET/POST/PUT/DELETE genre management
src/routes/covers.js - GET book covers from R2 cache + OpenLibrary fallback
src/routes/users.js - GET/POST/PUT/DELETE user management (admin only)
src/routes/organization.js - GET/POST/PUT/DELETE org settings, AI config, audit log, purge (Article 17)
src/routes/settings.js - GET/POST application settings and AI configuration
src/routes/signup.js - POST email newsletter signup (rate limited)
src/routes/data.js - GET/POST legacy data export/import
src/routes/hardcover.js - POST Hardcover GraphQL API proxy
src/routes/webhooks.js - POST Wonde webhook handler (schoolApproved, accessRevoked)
src/routes/wondeAdmin.js - POST/GET manual Wonde sync and status
src/routes/support.js - Support ticket submission, listing, detail, status management, internal notes (owner management endpoints)
src/routes/termDates.js - GET/PUT term dates per organization and academic year
src/routes/tours.js - GET/POST tour completion tracking per user
src/routes/metadata.js - GET/PUT metadata config, GET status, GET/DELETE jobs, POST enrich
src/routes/badges.js - GET/POST badge collection, notify, and class-wide summary endpoints
src/routes/contact.js - POST landing page contact form enquiry (public, rate limited)
src/routes/billing.js - POST/GET Stripe billing setup, status, portal, plan changes
src/routes/stripeWebhook.js - POST Stripe webhook handler (signature verification, event dedup)

<!-- Middleware -->
src/middleware/tenant.js - JWT auth, tenant isolation, role guards, audit logging, rate limiting
src/middleware/auth.js - Legacy password auth, token creation (deprecated)
src/middleware/errorHandler.js - Global error handler, error constructors

<!-- Data Providers -->
src/data/index.js - Provider factory; auto-detects D1, KV, or JSON storage
src/data/d1Provider.js - D1 SQL implementation with FTS5 search
src/data/kvProvider.js - Cloudflare KV storage (legacy)
src/data/jsonProvider.js - File-based JSON storage (dev only)
src/data/demoSnapshot.js - Learnalot demo data snapshot (auto-generated, used by demoReset)

<!-- Services -->
src/services/aiService.js - AI recommendation generation (Anthropic/OpenAI/Google)
src/services/kvService.js - KV storage operations (legacy)
src/services/wondeSync.js - Wonde delta/full sync orchestration
src/services/metadataService.js - Cascade engine (enrichBook, processBatch) for multi-provider metadata enrichment
src/services/demoReset.js - Hourly demo environment reset (FK-safe delete + snapshot re-insert)
src/services/orgPurge.js - Cascade hard-delete all org data (26 tables FK-safe), anonymise org row
src/services/providers/openLibraryProvider.js - OpenLibrary server-side adapter (no API key)
src/services/providers/googleBooksProvider.js - Google Books server-side adapter (requires API key)
src/services/providers/hardcoverProvider.js - Hardcover GraphQL server-side adapter (requires API key, best series data)

<!-- Utilities -->
src/utils/crypto.js - PBKDF2 hashing, JWT, AES-GCM encryption, role constants
src/utils/validation.js - Input validation (students, books, sessions, passwords, ranges, genres, classes)
src/utils/helpers.js - ID generation, reading status, student sorting, csvRow, slug generation, fetchWithTimeout
src/utils/calculateAge.js - Age calculation from date of birth
src/utils/email.js - Password reset/welcome/signup/support emails (multi-provider)
src/utils/streakCalculator.js - Reading streak calculation with grace period
src/utils/studentProfile.js - Build student reading profile for AI context
src/utils/stringMatching.js - Levenshtein distance for book deduplication
src/utils/recommendationCache.js - KV caching for AI recommendations
src/utils/isbn.js - ISBN validation and normalization
src/utils/isbnLookup.js - OpenLibrary ISBN lookup with KV caching
src/utils/openLibraryApi.js - OpenLibrary API client for book metadata
src/utils/googleBooksApi.js - Google Books API client
src/utils/hardcoverApi.js - Hardcover GraphQL API client with rate limiting
src/utils/bookMetadataApi.js - Unified metadata API with provider abstraction
src/utils/csvParser.js - CSV parsing for book import
src/utils/classAssignments.js - Sync class_assignments from wonde_employee_classes for a user
src/utils/classGoalsEngine.js - Term resolution, auto-generation defaults, class goal progress recalculation
src/utils/routeHelpers.js - Shared route helpers (getDB, requireDB, isMultiTenantMode, requireStudent)
src/utils/rowMappers.js - Centralized row-to-object mappers (rowToBook, rowToStudent, rowToClass, rowToUser, rowToOrganization, rowToGenre, rowToSupportTicket, rowToSupportNote, rowToTourCompletion, rowToBadge, rowToReadingStats, rowToClassGoal)
src/utils/constants.js - Shared constants (PUBLIC_PATHS for auth bypass)
src/utils/wondeApi.js - Wonde REST API client for school data sync
src/utils/badgeDefinitions.js - Badge definitions with evaluate/progress functions, key stage resolution
src/utils/badgeEngine.js - Stats calculation, real-time/batch evaluation, genre classification, near-miss calculation
src/utils/stripe.js - Stripe client factory, price ID helpers, AI add-on detection
src/utils/statsExport.js - PDF/CSV stats report generation (jsPDF)
src/utils/titleMatching.js - Title normalization and similarity scoring for metadata APIs

<!-- Contexts & Hooks -->
src/contexts/AuthContext.js - Auth tokens, user, fetchWithAuth, login/logout, permissions, org switching
src/contexts/DataContext.js - Students, classes, books, genres, settings, all CRUD operations
src/contexts/UIContext.js - Class filter, priority list, reading status, tours
src/contexts/AppContext.js - Composite provider (nests Auth > Data > UI), re-exports hooks
src/contexts/BookCoverContext.js - Book cover URL caching (localStorage, 7-day TTL)
src/hooks/useBookCover.js - Hook for book cover fetching with deduplication
src/hooks/useEnrichmentPolling.js - Polling hook for metadata enrichment job progress

<!-- Frontend Components - Root -->
src/components/Header.js - App bar with nav, class filter, school switcher
src/components/LandingPage.js - Marketing landing page with email signup
src/components/LandingPage.css - Landing page styles (scroll animations, floating blobs, responsive)
src/components/Login.js - Auth UI (legacy, email/password, MyLogin SSO)
src/components/ErrorBoundary.js - React error boundary wrapper
src/components/BookCover.js - Book cover image with placeholder fallback
src/components/BookCoverPlaceholder.js - Gradient placeholder from title hash
src/components/TallyLogo.js - Shared tally mark SVG logo (4 vertical + 1 diagonal line)
src/components/TermsOfService.js - Terms of Service standalone page
src/components/CookiePolicy.js - Cookie Policy standalone page
src/components/DpaConsentModal.js - DPA consent dialog for data processing agreement
src/components/PrivacyPolicy.js - Privacy Policy standalone page
src/components/BookRecommendations.js - AI recommendations with library search
src/components/SupportModal.js - Support contact form modal (subject, message, email notification)
src/components/SupportTicketManager.js - Owner-only support ticket list with detail panel, status management, internal notes
src/components/PlatformSettings.js - Owner-only platform AI key management (per-provider keys, active provider selection)
src/components/BookMetadataSettings.js - Simplified admin view: enrichment status + Fill Missing
src/components/MetadataManagement.js - Owner metadata config, global enrichment, job history
src/components/Settings.js - Reading status thresholds and streak settings
src/components/SettingsPage.js - Settings hub with tabs
src/components/AISettings.js - AI provider configuration
src/components/UserManagement.js - User CRUD and role assignment
src/components/SchoolManagement.js - School management container (state, API calls, table+drawer orchestration)
src/components/DataManagement.js - Export/import and Wonde sync UI
src/components/BillingBanner.js - Subscription status banner (trial countdown, past-due warning)
src/components/BillingDashboard.js - Billing management dashboard for admins
src/components/SubscriptionBlockedScreen.js - Blocked state screen when subscription cancelled
src/components/ClassAssignmentBanner.js - Class assignment notification for new teachers
src/components/WelcomeDialog.js - First-time user welcome dialog

src/components/schools/SchoolTable.js - School data table with search, filters, sorting, pagination
src/components/schools/SchoolDrawer.js - Side drawer wrapper (read/edit/add modes, deactivate dialog)
src/components/schools/SchoolReadView.js - Read-only school detail cards (contact, address, billing, wonde)
src/components/schools/SchoolEditForm.js - School edit form with save/cancel

<!-- Frontend Components - Books -->
src/components/books/BookManager.js - Book library with search, add, import, export
src/components/books/BookImportWizard.js - CSV import with fuzzy matching
src/components/books/AddBookModal.js - Add single book dialog
src/components/books/BarcodeScanner.js - ISBN barcode scanner (html5-qrcode)
src/components/books/ScanBookFlow.js - Scan-to-add workflow orchestrator
src/components/books/BookEditDialog.js - Book editing dialog (title, author, ISBN, genre)
src/components/books/BookExportMenu.js - Book export menu (JSON/CSV download)
src/components/books/bookImportUtils.js - Import utility functions (column detection, dedup)

<!-- Frontend Components - Classes -->
src/components/classes/ClassManager.js - Class CRUD with year groups

src/components/tour/TourProvider.js - Tour context provider with lazy-loaded react-joyride
src/components/tour/TourButton.js - Floating compass replay button (fixed bottom-right)
src/components/tour/TourTooltip.js - Glassmorphism custom tooltip for tour steps
src/components/tour/tourSteps.js - Tour step definitions per page (targets, titles, content)
src/components/tour/useTour.js - Hook for auto-start, ready guard, and button props

<!-- Frontend Components - Students -->
src/components/students/StudentList.js - Student listing with filters and sorting
src/components/students/StudentCard.js - Student card with status and streak
src/components/students/StudentDetailDrawer.js - Student detail side drawer (read/edit modes)
src/components/students/StudentEditForm.js - Student edit form with save/cancel
src/components/students/StudentReadView.js - Read-only student detail cards
src/components/students/StudentTable.js - Tabular student view
src/components/students/StreakBadge.js - Flame icon streak counter
src/components/students/ReadingLevelRangeInput.js - Dual-slider for AR level range
src/components/students/PrioritizedStudentsList.js - Priority-ordered student list
src/components/students/StudentTimeline.js - Chronological reading session timeline for a student
src/components/students/BulkImport.js - CSV bulk student import

<!-- Frontend Components - Sessions -->
src/components/sessions/HomeReadingRegister.js - Unified reading register with multi-day history columns
src/components/sessions/homeReadingUtils.js - Reading status constants and helpers for home reading
src/components/sessions/MultipleCountDialog.js - Dialog for entering multiple reading session count
src/components/sessions/FullReadingView.js - Expanded reading session entry view
src/components/sessions/QuickReadingView.js - Compact quick-entry reading view
src/components/sessions/SessionForm.js - Reading session form
src/components/sessions/QuickEntry.js - Fast session entry for priority students
src/components/sessions/BookAutocomplete.js - Book search autocomplete
src/components/sessions/AssessmentSelector.js - Assessment level radio group
src/components/sessions/SessionNotes.js - Session notes text area
src/components/sessions/StudentInfoCard.js - Student info during session entry

<!-- Frontend Components - Badges -->
src/components/badges/BadgeIcon.js - Single badge circle with tier gradient and category icon
src/components/badges/GardenHeader.js - Layered watercolor PNG garden header; 8 elements appear progressively as badges are earned (seedling→sprout→bloom→full garden)
src/components/badges/BadgeCollection.js - Grid of earned badges + near-miss progress bars
src/components/badges/BadgeCelebration.js - Unlock celebration dialog shown after session save
src/components/badges/BadgeIndicators.js - Mini badge count chip for StudentCard

<!-- Frontend Components - Goals -->
src/components/goals/ClassGoalsEditor.js - Teacher modal for editing class goal targets
src/components/goals/ClassGoalsDisplay.js - Fullscreen classroom projection view with garden and confetti

<!-- Frontend Components - Stats -->
src/components/stats/ReadingStats.js - Stats dashboard with metrics and charts
src/components/stats/OverviewTab.js - Stats overview with summary cards and trend indicators
src/components/stats/FrequencyTab.js - Reading frequency analysis tab
src/components/stats/StreaksTab.js - Streak leaderboard and history tab
src/components/stats/NeedsAttentionTab.js - Students needing reading attention tab
src/components/stats/ReadingTimelineChart.js - Reading timeline line chart
src/components/stats/ReadingFrequencyChart.js - Reading frequency bar chart
src/components/stats/DaysSinceReadingChart.js - Days since reading indicator
src/components/stats/AchievementsTab.js - Achievements tab: class-wide badge progress with expandable per-student drill-down

<!-- Styling -->
src/styles/theme.js - Material-UI theme configuration

<!-- Scripts -->
scripts/build-and-deploy.sh - Full rebuild + deploy pipeline
scripts/deploy.sh - Deployment script
scripts/migration.js - Data migration from old format
scripts/reset-admin-password.js - Admin password reset utility
scripts/test-api.js - API endpoint smoke tests
scripts/export-demo-snapshot.js - Export Learnalot data from remote D1 into demoSnapshot.js

### Structure Detail Files

```
.claude/structure/
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
# Start both frontend and backend (recommended)
npm run start:dev

# Frontend only (requires worker running separately)
npm start          # Runs on http://localhost:3001

# Worker only (API server)
npm run dev        # Runs on http://localhost:8787
```

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

CI runs on push/PR to `main` via GitHub Actions (`.github/workflows/build.yml`): installs deps with `npm ci` and runs `npm run build`.

## Architecture

### Tech Stack
- **Frontend**: React 19, Material-UI v7, Rsbuild (build tool), plain JS (no TypeScript)
- **Backend**: Cloudflare Workers, Hono framework, D1 database, KV storage
- **Testing**: Vitest, happy-dom, @testing-library/react

### Authentication System

Three auth modes coexist, auto-detected from environment variables (`src/worker.js:129-138`):

1. **MyLogin SSO** (`MYLOGIN_CLIENT_ID` configured): OAuth2 Authorization Code flow via MyLogin for school users. Primary auth for schools. Routes in `src/routes/mylogin.js`.
2. **Email/Password** (`JWT_SECRET` configured): JWT auth with email/password for owner account and fallback.
3. **Legacy Mode** (`WORKER_ADMIN_PASSWORD` only): Simple shared password, KV storage.

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
- `DataContext` (`src/contexts/DataContext.js`) — students, classes, books, genres, settings, all CRUD operations. Re-renders when entity data changes.
- `UIContext` (`src/contexts/UIContext.js`) — class filter, priority list, reading status, tours. Re-renders on filter/settings changes.

Hooks: `useAuth()`, `useData()`, `useUI()`. The composite `AppProvider` in `src/contexts/AppContext.js` nests all three (`Auth > Data > UI`). All API calls go through `fetchWithAuth()` (from AuthContext) which auto-attaches JWT and handles 401 refresh. Concurrent requests share a single refresh promise to prevent thundering herd on token expiry.

**Owner Organization Switching**: Owners can switch org context via `X-Organization-Id` header (set in `fetchWithAuth()` when `activeOrganizationId` is set). Backend validates this in `tenantMiddleware()` — only works for `owner` role.

**Frontend-Backend Integration**:
- Development: Rsbuild proxies `/api` to `http://localhost:8787` (see `rsbuild.config.mjs`)
- Production: Worker serves both API (`/api/*`) and static assets from `build/` directory

### Data Storage

**D1 (Multi-Tenant)**: Normalized SQL tables with organization scoping. Provider: `src/data/d1Provider.js`
**KV (Legacy)**: JSON blobs in Cloudflare KV. Provider: `src/data/kvProvider.js`
**JSON (Local Dev)**: File-based storage via `data.json`. Provider: `src/data/jsonProvider.js`
**Provider Factory**: `src/data/index.js` auto-detects in priority order: D1 binding present → `STORAGE_TYPE` env var → KV binding present → JSON file fallback (Node.js only).

**Critical**: D1 batch operations are limited to 100 statements. See batch pattern in `src/routes/books.js`.

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
- `classes`, `genres`, `organization_settings` - Organization-scoped
- `term_dates` - Academic year term dates per organization (half-terms, holidays)

### Book Visibility Model

Books use a shared global catalog with per-organization visibility via `org_book_selections`. When schools import books, matching books are linked (not duplicated). Each school only sees books linked to them.

## Important Implementation Details

### Book Recommendations (AI)

Optimized for large collections (18,000+ books):
1. SQL pre-filter by reading level range + genres, exclude already-read
2. Randomize and limit to ~100 books
3. Send to AI provider with student context and focus mode (balanced/consolidation/challenge)

See `src/routes/books.js` and `src/components/BookRecommendations.js`. AI providers configured in `src/services/aiService.js`.

### Reading Level Range

Students have `readingLevelMin` to `readingLevelMax` (AR levels 1.0–13.0). UI: `src/components/students/ReadingLevelRangeInput.js`. Validation in `src/utils/validation.js`.

### Home Reading Register

Unified register for class-wide home reading: status buttons (read/multiple/absent/no record), multi-day history with date range presets (This Week/Last Week/Last Month/Custom), daily totals footer, student book persistence, bulk session creation. See `src/components/sessions/HomeReadingRegister.js`.

### Book Cover System

Covers fetched from OpenLibrary with multi-strategy lookup (ISBN → OCLC → title), request deduplication, localStorage caching (`src/contexts/BookCoverContext.js`), and deterministic gradient placeholders from title hash.

### Multi-School Library Import

CSV import wizard (`src/components/books/BookImportWizard.js`) with:
- Column auto-detection + manual override
- Deduplication: exact match (auto-link), fuzzy match at 85% similarity (flagged for review), new books created
- API: `POST /api/books/import/preview` and `POST /api/books/import/confirm`
- String matching: `src/utils/stringMatching.js` (Levenshtein distance)

### Error Handling

Global error handler in `src/middleware/errorHandler.js` standardizes all error responses. Helper constructors: `notFoundError()`, `badRequestError()`, `serverError()`. 5xx responses are sanitized to prevent internal detail leakage.

### Public Endpoints

Public paths are defined in `src/middleware/tenant.js` (jwtAuthMiddleware): `/api/auth/mode`, `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/mylogin/login`, `/api/auth/mylogin/callback`, `/api/webhooks/wonde`, `/api/health`, `/api/login` (legacy redirect), and `/api/covers/*`. When adding public paths, update the `publicPaths` array in BOTH `jwtAuthMiddleware()` in `src/middleware/tenant.js` AND the tenant middleware bypass in `src/worker.js`. **Important:** Each public path must be explicitly listed — do not use wildcard `startsWith` patterns for new path prefixes, as this creates unintended auth bypass for all future routes under that prefix. The `/api/webhooks/wonde` endpoint is public but implements its own shared-secret authentication via `WONDE_WEBHOOK_SECRET`.

### Scheduled Tasks

Cron triggers (all in `src/worker.js` `scheduled` handler):
- **Every minute** — background metadata enrichment job processing (`src/services/metadataService.js`)
- **Hourly** — demo environment reset (`src/services/demoReset.js`)
- **2:00 AM UTC** — streak recalculation + GDPR purge (`src/utils/streakCalculator.js`, `src/services/orgPurge.js`)
- **2:30 AM UTC** — badge evaluation + class goal drift correction (`src/utils/badgeEngine.js`, `src/utils/classGoalsEngine.js`)
- **3:00 AM UTC** — Wonde delta sync (`src/services/wondeSync.js`)

### Wonde + MyLogin Integration

School data sync and SSO login via two external services:

**Wonde Data Sync** (`src/utils/wondeApi.js`, `src/services/wondeSync.js`): Syncs students, classes, and teacher data from school MIS systems. Schools are onboarded via `schoolApproved` webhook (`src/routes/webhooks.js`), which creates the organization and triggers a full sync. Daily delta sync runs at 3 AM. Manual sync available via `POST /api/wonde/sync` (admin only, `src/routes/wondeAdmin.js`).

**MyLogin OAuth2 SSO** (`src/routes/mylogin.js`): OAuth2 Authorization Code flow. Login initiation stores state in KV, redirects to MyLogin. Callback exchanges code for token, fetches user profile, matches org by `wonde_school_id`, creates/updates user by `mylogin_id`, issues standard Tally JWT. Role mapping: MyLogin admin→admin, employee→teacher, student→readonly.

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
4. Deploy: `npx wrangler d1 migrations apply reading-manager-db --remote`

### Working with Data Providers

When adding new data operations, implement in `d1Provider.js` (primary) and `kvProvider.js`/`jsonProvider.js` for backward compatibility. All three providers export the same interface. The factory in `data/index.js` routes to the correct one.

## Local Development Setup

Local dev requires two files in the project root:
- `.env` — sets `STORAGE_TYPE=json` and `JWT_SECRET` for local multi-tenant mode
- `.dev.vars` — sets `WORKER_ADMIN_PASSWORD` for legacy mode testing

The frontend dev server (port 3001) proxies `/api` requests to the worker (port 8787). Use `npm run start:dev` to run both concurrently.

### Utility Scripts

- `scripts/build-and-deploy.sh` — Full rebuild + deploy pipeline (supports `production` and `dev` args)
- `scripts/migration.js` — Data migration from old format to new
- `scripts/reset-admin-password.js` — Admin password reset utility

## Configuration

### Environment Variables (Cloudflare)

- `JWT_SECRET` - Enables multi-tenant JWT auth
- `ENCRYPTION_KEY` - Optional separate key for AES-GCM encryption of sensitive data (Wonde tokens, API keys). Falls back to `JWT_SECRET` if not set. Recommended for defense-in-depth.
- `WORKER_ADMIN_PASSWORD` - Legacy shared password auth
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` - AI recommendation providers
- `ALLOWED_ORIGINS` - Comma-separated CORS whitelist
- `EMAIL_FROM` - Email sender address
- `MYLOGIN_CLIENT_ID` - MyLogin OAuth2 client ID
- `MYLOGIN_CLIENT_SECRET` - MyLogin OAuth2 client secret
- `MYLOGIN_REDIRECT_URI` - MyLogin OAuth2 callback URL (e.g. `https://tallyreading.uk/api/auth/mylogin/callback`)
- `WONDE_WEBHOOK_SECRET` - Shared secret for Wonde webhook authentication (send as `X-Webhook-Secret` header)
- `SENTRY_DSN` - Sentry error tracking DSN
- `STRIPE_SECRET_KEY` - Stripe API secret key (set via `wrangler secret put`)
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret (set via `wrangler secret put`)

### Wrangler Bindings (`wrangler.toml`)

- `READING_MANAGER_KV` - KV namespace for legacy storage
- `READING_MANAGER_DB` - D1 database for multi-tenant storage
- `RECOMMENDATIONS_CACHE` - KV namespace for AI recommendation caching
- `BOOK_COVERS` - R2 bucket for cached book cover images
- `EMAIL_SENDER` - Email sending (requires Email Routing on domain)

## Gotchas

- **D1 batch limit**: Max 100 statements per `db.batch()` call. Chunk larger operations. See pattern in `src/routes/books.js`.
- **Soft delete is not automatic**: `organizations` and `users` use `is_active` column. Queries must explicitly filter `WHERE is_active = 1` — forgetting this returns "deleted" records.
- **snake_case ↔ camelCase**: Database uses snake_case, JavaScript uses camelCase. Conversion happens in `rowTo*()` functions (e.g., `rowToStudent`, `rowToBook`). New columns need mapping in both directions.
- **Routes sometimes bypass the data provider**: Some routes (especially `books.js`) call D1 directly for complex queries (FTS5, JOINs) instead of going through the provider abstraction. This is intentional when query complexity exceeds what the provider interface supports.
- **Security headers applied after handler**: In `src/worker.js`, security headers are set in the `onResponse` callback, meaning they run after the route handler executes.
- **Rate limiting uses D1**: Auth rate limiting stores attempts in the D1 `rate_limits` table, not Cloudflare's built-in rate limiting. See `authRateLimit()` in `src/middleware/tenant.js`.
- **Prettier**: Configured via `.prettierrc` (single quotes, trailing commas, 100 char width). Auto-runs on edited files via Claude Code hook. Run `npx prettier --write "src/**/*.js"` to format the full codebase.

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
