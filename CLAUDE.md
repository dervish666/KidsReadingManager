# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kids Reading Manager is a multi-tenant SaaS application for tracking student reading progress. Built with React 19 frontend and Cloudflare Workers backend (using Hono framework), it runs entirely on Cloudflare's edge infrastructure with D1 database and KV storage.

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

### Building
```bash
# Build React frontend only
npm run build

# Build and deploy to Cloudflare (production)
npm run go                    # Runs build + deploy
./scripts/build-and-deploy.sh # Full rebuild with clean install

# Build and deploy to dev environment
npm run build:deploy:dev
```

### Database Management
```bash
# Run migrations locally
npx wrangler d1 migrations apply reading-manager-db --local

# Run migrations on production
npx wrangler d1 migrations apply reading-manager-db --remote

# Run data migration from old format
npm run migrate
```

### Testing
```bash
# Run all tests once
npm test

# Run tests in watch mode (during development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run a single test file
npx vitest run src/__tests__/unit/validation.test.js

# Run tests matching a pattern
npx vitest run --testNamePattern="password"
```

Tests use Vitest with happy-dom environment. Test files are located in `src/__tests__/` with unit and integration subdirectories.

### Deployment
```bash
# Deploy to Cloudflare Workers (production)
npm run deploy
wrangler deploy

# Deploy to dev environment
wrangler deploy --env=dev
```

## Architecture

### Dual Authentication System

The application supports two authentication modes that coexist:

1. **Multi-Tenant Mode** (JWT_SECRET configured): JWT-based authentication with organizations, users, roles, and D1 database storage
2. **Legacy Mode** (WORKER_ADMIN_PASSWORD only): Simple shared password with KV storage

The worker automatically detects which mode to use based on environment variables (see `src/worker.js:59-68`). This allows gradual migration from legacy to multi-tenant.

### Data Storage Strategy

**Multi-Tenant Mode (Primary)**:
- D1 SQL database (`READING_MANAGER_DB` binding) for all data
- Normalized tables with foreign keys and organization scoping
- See `migrations/*.sql` for schema
- Data provider: `src/data/d1Provider.js`

**Legacy Mode (Fallback)**:
- Cloudflare KV (`READING_MANAGER_KV` binding) with JSON blobs
- Single-tenant, backward compatible
- Data provider: `src/data/jsonProvider.js`

### Request Flow

1. Request hits Cloudflare Worker (`src/worker.js`)
2. Middleware chain:
   - `logger()` - Request logging
   - `cors()` - CORS headers
   - `errorHandler()` - Catch errors
   - `authMiddleware()` OR `jwtAuthMiddleware()` - Authentication (mode-dependent)
   - `tenantMiddleware()` - Inject organization context (multi-tenant only)
3. Routes in `src/routes/` handle business logic
4. Data providers (`src/data/`) abstract storage layer
5. Response sent back

### Frontend-Backend Integration

**Development**: Frontend proxies `/api` requests to backend (see `rsbuild.config.mjs:8-13`)
**Production**: Worker serves both API (`/api/*`) and static assets from `build/` directory (see `wrangler.toml:22-24`)

## Multi-Tenant Architecture

### Organization Isolation

All data queries are automatically scoped to the user's organization through middleware:
- `tenantMiddleware()` injects `c.get('organizationId')` into context
- Routes use this to filter queries: `WHERE organization_id = ?`
- Users can only access data from their organization (except owners)

### Role Hierarchy

- **Owner**: Full system access, manages all organizations
- **Admin**: Organization-level management, creates users/teachers
- **Teacher**: Manages students, classes, reading sessions
- **Readonly**: View-only access

Permissions are enforced in middleware (`src/middleware/tenant.js`) and route handlers.

### Key Tables

- `organizations` - Multi-tenant foundation with subscription tiers
- `users` - User accounts with roles and organization FK
- `students` - Organization-scoped students
- `reading_sessions` - Session data linked to students
- `books` - Global book catalog with FTS5 search
- `organization_book_selections` - Per-organization book customization
- `classes`, `genres`, `organization_settings` - Organization-scoped

## Important Implementation Details

### Book Recommendations (AI)

The recommendations feature optimizes for large book collections (18,000+):
1. Pre-filter at SQL level by reading level (±2 levels) and genres
2. Exclude already-read books in query
3. Randomize and limit to ~100 books
4. Send filtered list to AI provider with student context
5. AI returns personalized recommendations with reasoning

See `src/routes/books.js` (recommendations endpoint) and `src/components/BookRecommendations.js`.

### Home Reading Register

Quick entry UI for recording class-wide home reading:
- Register-style grid with students as rows
- Status buttons: ✓ (read), 2+ (multiple), A (absent), • (no record)
- Student book persistence (remembers current book)
- Drag-and-drop student reordering
- Efficient bulk session creation

See `src/components/sessions/HomeReadingRegister.js`.

### Book Cover System

The recommendations UI displays book covers fetched from OpenLibrary:

1. **BookCoverContext** (`src/contexts/BookCoverContext.js`): Global cache for cover URLs with localStorage persistence
2. **useBookCover** hook (`src/hooks/useBookCover.js`): Fetches covers using multiple strategies (ISBN → OCLC → title search)
3. **BookCover** component (`src/components/BookCover.js`): Displays cover image or placeholder
4. **BookCoverPlaceholder** (`src/components/BookCoverPlaceholder.js`): Generates gradient placeholders from title hash

The system includes request deduplication, graceful fallbacks, and deterministic placeholder colors.

### Book Metadata APIs

Two providers for fetching book metadata:
- **OpenLibrary API**: Default, no API key required
- **Google Books API**: Requires API key, more complete data

Configured in Settings UI. Used for auto-filling book descriptions, authors, genres.

## Common Development Patterns

### Adding a New API Endpoint

1. Create route handler in `src/routes/*.js` (or add to existing)
2. Apply authentication/authorization checks
3. Use `c.get('organizationId')` for multi-tenant scoping
4. Access D1 via `c.env.READING_MANAGER_DB` or KV via `c.env.READING_MANAGER_KV`
5. Return JSON responses with proper HTTP status codes

Example:
```javascript
app.get('/api/students', async (c) => {
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  const result = await db
    .prepare('SELECT * FROM students WHERE organization_id = ?')
    .bind(organizationId)
    .all();

  return c.json(result.results);
});
```

### Adding a Database Migration

1. Create new file: `migrations/XXXX_description.sql`
2. Write migration SQL (use IF NOT EXISTS for safety)
3. Test locally: `npx wrangler d1 migrations apply reading-manager-db --local`
4. Deploy: `npx wrangler d1 migrations apply reading-manager-db --remote`

### Working with the Data Providers

The data layer is abstracted through providers:
- Multi-tenant: Import functions from `src/data/d1Provider.js`
- Legacy: Import from `src/data/jsonProvider.js`
- Workers automatically route to correct provider based on config

When adding new data operations, implement in both providers for backward compatibility.

## Configuration

### Environment Variables (Cloudflare)

Set in Cloudflare dashboard or `wrangler.toml`:

**Multi-Tenant Mode**:
- `JWT_SECRET` - Required for JWT auth (enables multi-tenant)

**Legacy Mode**:
- `WORKER_ADMIN_PASSWORD` - Shared password for legacy auth

**AI Recommendations** (at least one required for book recommendations):
- `ANTHROPIC_API_KEY` - Claude AI provider
- `OPENAI_API_KEY` - OpenAI provider
- `GOOGLE_API_KEY` - Google Gemini provider

### Wrangler Bindings

Configured in `wrangler.toml`:
- `READING_MANAGER_KV` - KV namespace for legacy storage
- `READING_MANAGER_DB` - D1 database for multi-tenant storage
- `EMAIL_SENDER` - Email sending binding (requires Email Routing on domain)

### Frontend Environment Variables

- `REACT_APP_API_BASE_URL` - API base URL (set during build for production)
