# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tally Reading is a multi-tenant SaaS application for tracking student reading progress. Built with React 19 frontend and Cloudflare Workers backend (using Hono framework), it runs entirely on Cloudflare's edge infrastructure with D1 database and KV storage.

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

### Dual Authentication System

Two auth modes coexist, auto-detected from environment variables (`src/worker.js:129-138`):

1. **Multi-Tenant Mode** (`JWT_SECRET` configured): JWT auth with organizations, users, roles, D1 storage
2. **Legacy Mode** (`WORKER_ADMIN_PASSWORD` only): Simple shared password, KV storage

JWT lifecycle: access tokens (15 min) + refresh tokens (7 days). Client auto-refreshes 60 seconds before expiration. Password hashing uses PBKDF2 with 100,000 iterations (`src/utils/crypto.js`). Role constants defined in `ROLES` object in `src/utils/crypto.js`.

### Request Flow

1. Request hits Cloudflare Worker (`src/worker.js`)
2. Middleware chain: `logger()` → `cors()` → security headers → `errorHandler()` → auth middleware (JWT or legacy) → `tenantMiddleware()`
3. Auth endpoints additionally pass through `authRateLimit()` (rate limiting via D1 `rate_limits` table)
4. Routes in `src/routes/` handle business logic
5. Data providers (`src/data/`) abstract storage layer

### Frontend Architecture

**State Management**: Single `AppContext` (`src/contexts/AppContext.js`) holds all global state (students, classes, books, sessions, auth, settings). All API calls go through `fetchWithAuth()` which auto-attaches JWT and handles 401 refresh.

**Frontend-Backend Integration**:
- Development: Rsbuild proxies `/api` to `http://localhost:8787` (see `rsbuild.config.mjs`)
- Production: Worker serves both API (`/api/*`) and static assets from `build/` directory

### Data Storage

**D1 (Multi-Tenant)**: Normalized SQL tables with organization scoping. Provider: `src/data/d1Provider.js`
**KV (Legacy)**: JSON blobs in Cloudflare KV. Provider: `src/data/kvProvider.js`
**JSON (Local Dev)**: File-based storage via `data.json`. Provider: `src/data/jsonProvider.js`
**Provider Factory**: `src/data/index.js` auto-detects: D1 binding > `STORAGE_TYPE` env var > fallback.

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

These paths bypass auth middleware: `/api/auth/*`, `/api/health`, `/api/login`, `/api/logout`. The health endpoint is useful for monitoring. Legacy `/api/login` and `/api/logout` redirect to the auth router equivalents.

### Scheduled Tasks

Cron trigger runs daily at 2:00 AM UTC to recalculate all student reading streaks (`wrangler.toml` triggers, handler in `src/worker.js`, logic in `src/utils/streakCalculator.js`).

## Common Development Patterns

### Adding a New API Endpoint

1. Add route handler in `src/routes/*.js`
2. Use `c.get('organizationId')` for tenant scoping
3. Access D1 via `c.env.READING_MANAGER_DB`
4. Return JSON with proper HTTP status codes

### Adding a Database Migration

1. Create `migrations/XXXX_description.sql` (next number after 0020)
2. Use `IF NOT EXISTS` for safety
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

### Wrangler Bindings (`wrangler.toml`)

- `READING_MANAGER_KV` - KV namespace for legacy storage
- `READING_MANAGER_DB` - D1 database for multi-tenant storage
- `EMAIL_SENDER` - Email sending (requires Email Routing on domain)
