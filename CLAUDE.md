# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

<!-- Backend Routes -->
src/routes/auth.js - POST/GET register, login, refresh, logout, password reset
src/routes/mylogin.js - MyLogin OAuth2 SSO (login, callback, logout)
src/routes/students.js - GET/POST/PUT/DELETE student CRUD, bulk import
src/routes/books.js - GET/POST/PUT/DELETE books, AI recommendations, search, CSV import
src/routes/classes.js - GET/POST/PUT/DELETE class management
src/routes/genres.js - GET/POST/PUT/DELETE genre management
src/routes/covers.js - GET book covers from R2 cache + OpenLibrary fallback
src/routes/users.js - GET/POST/PUT/DELETE user management (admin only)
src/routes/organization.js - GET/POST/PUT/DELETE org settings, AI config, audit log
src/routes/settings.js - GET/POST application settings and AI configuration
src/routes/signup.js - POST email newsletter signup (rate limited)
src/routes/data.js - GET/POST legacy data export/import
src/routes/hardcover.js - POST Hardcover GraphQL API proxy
src/routes/webhooks.js - POST Wonde webhook handler (schoolApproved, accessRevoked)
src/routes/wondeAdmin.js - POST/GET manual Wonde sync and status

<!-- Middleware -->
src/middleware/tenant.js - JWT auth, tenant isolation, role guards, audit logging, rate limiting
src/middleware/auth.js - Legacy password auth, token creation (deprecated)
src/middleware/errorHandler.js - Global error handler, error constructors

<!-- Data Providers -->
src/data/index.js - Provider factory; auto-detects D1, KV, or JSON storage
src/data/d1Provider.js - D1 SQL implementation with FTS5 search
src/data/kvProvider.js - Cloudflare KV storage (legacy)
src/data/jsonProvider.js - File-based JSON storage (dev only)

<!-- Services -->
src/services/aiService.js - AI recommendation generation (Anthropic/OpenAI/Google)
src/services/kvService.js - KV storage operations (legacy)
src/services/wondeSync.js - Wonde delta/full sync orchestration

<!-- Utilities -->
src/utils/crypto.js - PBKDF2 hashing, JWT, AES-GCM encryption, role constants
src/utils/validation.js - Input validation for students, books, ranges
src/utils/helpers.js - ID generation, reading status, student sorting
src/utils/email.js - Password reset/welcome/signup emails (multi-provider)
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
src/utils/routeHelpers.js - Shared route helpers (getDB, requireDB, isMultiTenantMode, requireStudent)
src/utils/rowMappers.js - Centralized row-to-object mappers (rowToBook, rowToStudent, rowToClass, rowToUser, rowToOrganization, rowToGenre)
src/utils/constants.js - Shared constants (PUBLIC_PATHS for auth bypass)
src/utils/wondeApi.js - Wonde REST API client for school data sync

<!-- Contexts & Hooks -->
src/contexts/AppContext.js - Global app state (auth, students, classes, books, settings)
src/contexts/BookCoverContext.js - Book cover URL caching (localStorage, 7-day TTL)
src/hooks/useBookCover.js - Hook for book cover fetching with deduplication

<!-- Frontend Components - Root -->
src/components/Header.js - App bar with nav, class filter, school switcher
src/components/LandingPage.js - Marketing landing page with email signup
src/components/Login.js - Auth UI (legacy, email/password, MyLogin SSO)
src/components/ErrorBoundary.js - React error boundary wrapper
src/components/BookCover.js - Book cover image with placeholder fallback
src/components/BookCoverPlaceholder.js - Gradient placeholder from title hash
src/components/TallyLogo.js - Shared tally mark SVG logo (4 vertical + 1 diagonal line)
src/components/BookRecommendations.js - AI recommendations with library search
src/components/BookMetadataSettings.js - Metadata provider config and bulk ops
src/components/Settings.js - Reading status thresholds and streak settings
src/components/SettingsPage.js - Settings hub with tabs
src/components/AISettings.js - AI provider configuration
src/components/UserManagement.js - User CRUD and role assignment
src/components/SchoolManagement.js - Organization management with Wonde status
src/components/DataManagement.js - Export/import and Wonde sync UI

<!-- Frontend Components - Books -->
src/components/books/BookManager.js - Book library with search, add, import, export
src/components/books/BookImportWizard.js - CSV import with fuzzy matching
src/components/books/AddBookModal.js - Add single book dialog
src/components/books/BarcodeScanner.js - ISBN barcode scanner (html5-qrcode)
src/components/books/ScanBookFlow.js - Scan-to-add workflow orchestrator

<!-- Frontend Components - Classes -->
src/components/classes/ClassManager.js - Class CRUD with year groups

<!-- Frontend Components - Students -->
src/components/students/StudentList.js - Student listing with filters and sorting
src/components/students/StudentCard.js - Student card with status and streak
src/components/students/StudentProfile.js - Student settings and preferences modal
src/components/students/StudentTable.js - Tabular student view
src/components/students/StreakBadge.js - Flame icon streak counter
src/components/students/ReadingLevelRangeInput.js - Dual-slider for AR level range
src/components/students/ReadingPreferences.js - Genre preference selection
src/components/students/PrioritizedStudentsList.js - Priority-ordered student list
src/components/students/BulkImport.js - CSV bulk student import

<!-- Frontend Components - Sessions -->
src/components/sessions/HomeReadingRegister.js - Class-wide register with drag-drop
src/components/sessions/SessionForm.js - Reading session form
src/components/sessions/QuickEntry.js - Fast session entry for priority students
src/components/sessions/StudentSessions.js - Student session history
src/components/sessions/BookAutocomplete.js - Book search autocomplete
src/components/sessions/AssessmentSelector.js - Assessment level radio group
src/components/sessions/SessionNotes.js - Session notes text area
src/components/sessions/StudentInfoCard.js - Student info during session entry
src/components/sessions/ClassReadingHistoryTable.js - Class reading history table

<!-- Frontend Components - Stats -->
src/components/stats/ReadingStats.js - Stats dashboard with metrics and charts
src/components/stats/ReadingTimelineChart.js - Reading timeline line chart
src/components/stats/ReadingFrequencyChart.js - Reading frequency bar chart
src/components/stats/DaysSinceReadingChart.js - Days since reading indicator
src/components/stats/VisualIndicators.js - Key metric cards with badges

<!-- Styling -->
src/styles/theme.js - Material-UI theme configuration

<!-- Scripts -->
scripts/build-and-deploy.sh - Full rebuild + deploy pipeline
scripts/deploy.sh - Deployment script
scripts/migration.js - Data migration from old format
scripts/reset-admin-password.js - Admin password reset utility

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
npm run go                    # Build + deploy to Cloudflare production
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
```

Tests use Vitest with happy-dom environment. Setup file (`src/__tests__/setup.js`) mocks Web Crypto API, btoa/atob, and TextEncoder/TextDecoder. The vitest config (`vitest.config.mjs`) aliases `cloudflare:email` to a test mock. Test files live in `src/__tests__/unit/` and `src/__tests__/integration/`.

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

**State Management**: Single `AppContext` (`src/contexts/AppContext.js`) holds all global state (students, classes, books, sessions, auth, settings). All API calls go through `fetchWithAuth()` which auto-attaches JWT and handles 401 refresh. Concurrent requests share a single refresh promise to prevent thundering herd on token expiry.

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

- `organizations` - Multi-tenant foundation (soft delete via `is_active`)
- `users` - Accounts with roles and org FK (soft delete via `is_active`)
- `students` - Organization-scoped, has `reading_level_min`/`reading_level_max` range
- `reading_sessions` - Session data linked to students (hard delete)
- `books` - Global catalog with FTS5 search (`books_fts` virtual table)
- `org_book_selections` - Links books to organizations (controls per-school visibility)
- `classes`, `genres`, `organization_settings` - Organization-scoped

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

Quick entry grid for class-wide reading: status buttons (read/multiple/absent/no record), student book persistence, drag-and-drop reordering (`@dnd-kit`), bulk session creation. See `src/components/sessions/HomeReadingRegister.js`.

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

Cron triggers run daily: 2:00 AM UTC for streak recalculation (`src/utils/streakCalculator.js`), 3:00 AM UTC for Wonde delta sync (`src/services/wondeSync.js`). Both run in `src/worker.js` `scheduled` handler.

### Wonde + MyLogin Integration

School data sync and SSO login via two external services:

**Wonde Data Sync** (`src/utils/wondeApi.js`, `src/services/wondeSync.js`): Syncs students, classes, and teacher data from school MIS systems. Schools are onboarded via `schoolApproved` webhook (`src/routes/webhooks.js`), which creates the organization and triggers a full sync. Daily delta sync runs at 3 AM. Manual sync available via `POST /api/wonde/sync` (admin only, `src/routes/wondeAdmin.js`).

**MyLogin OAuth2 SSO** (`src/routes/mylogin.js`): OAuth2 Authorization Code flow. Login initiation stores state in KV, redirects to MyLogin. Callback exchanges code for token, fetches user profile, matches org by `wonde_school_id`, creates/updates user by `mylogin_id`, issues standard Tally JWT. Role mapping: MyLogin admin→admin, employee→teacher, student→readonly.

**Key tables**: `wonde_sync_log` (sync tracking), `wonde_employee_classes` (teacher-class mapping from sync, used at first login). New columns on `organizations` (wonde_school_id, wonde_school_token, wonde_last_sync_at, mylogin_org_id), `users` (mylogin_id, wonde_employee_id, auth_provider), `students` (wonde_student_id, sen_status, pupil_premium, eal_status, fsm, year_group), `classes` (wonde_class_id). See `migrations/0024_wonde_mylogin_integration.sql`.

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

1. Create `migrations/XXXX_description.sql` (next number after 0022)
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
- `WORKER_ADMIN_PASSWORD` - Legacy shared password auth
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` - AI recommendation providers
- `ALLOWED_ORIGINS` - Comma-separated CORS whitelist
- `EMAIL_FROM` - Email sender address
- `MYLOGIN_CLIENT_ID` - MyLogin OAuth2 client ID
- `MYLOGIN_CLIENT_SECRET` - MyLogin OAuth2 client secret
- `MYLOGIN_REDIRECT_URI` - MyLogin OAuth2 callback URL (e.g. `https://tallyreading.uk/api/auth/mylogin/callback`)
- `WONDE_WEBHOOK_SECRET` - Shared secret for Wonde webhook authentication (append `?secret=<value>` to the webhook URL in Wonde dashboard)

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
