# Metadata Ownership — Centralised Cascading Enrichment

**Date:** 2026-03-31
**Status:** Draft

## Problem

Book metadata settings (provider choice, API keys, batch config) are currently per-school in `org_settings`. Schools shouldn't manage this — the owner should configure providers centrally and run enrichment across the platform. Schools experienced frequent rate limiting when running bulk operations from the browser.

## Solution

Move metadata configuration and bulk enrichment to an owner-managed, server-side system with a cascading multi-provider engine. Schools retain a simplified "Fill Missing" button. All provider API calls happen on the Cloudflare Worker, not in the browser.

## Design Decisions

- **Merge best-of** across providers: each book goes through the full cascade, first non-empty value wins per field. Gives best coverage at the cost of more API calls.
- **Server-side batched with frontend-driven polling**: the frontend calls `POST /api/metadata/enrich` in a loop, each call processes a small batch. Job state persists in D1 so closing the tab doesn't lose progress — reopening resumes.
- **Aggressive self-throttling**: configurable delay between books (default 2000ms), auto-doubles on 429. Owner controls the pace.
- **Covers optional**: enrichment can fetch and store covers in R2 as part of the pass, toggled per job.

## Data Model

### New Tables

#### `metadata_config`

Single row, owner-managed. Global configuration for the cascade engine.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Fixed value `'default'` — enforces single row via PK constraint |
| provider_chain | TEXT | JSON array, e.g. `["hardcover","googlebooks","openlibrary"]` |
| hardcover_api_key_encrypted | TEXT | AES-GCM encrypted via `encryptSensitiveData` |
| google_books_api_key_encrypted | TEXT | AES-GCM encrypted via `encryptSensitiveData` |
| rate_limit_delay_ms | INTEGER | Default 1500. Delay between books in a batch. |
| batch_size | INTEGER | Default 10. Books processed per API call. |
| fetch_covers | INTEGER | Default 1. Whether to fetch and cache covers in R2. |
| updated_by | TEXT | User ID |
| updated_at | TEXT | ISO datetime |

PUT endpoint uses `INSERT ... ON CONFLICT(id) DO UPDATE` with `id='default'` — guarantees single row.

#### `metadata_jobs`

One row per enrichment run. Tracks progress for resume capability.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| organization_id | TEXT | FK to organizations. NULL = all orgs (owner only). |
| job_type | TEXT | `fill_missing` or `refresh_all` |
| status | TEXT | `pending`, `running`, `paused`, `completed`, `failed` |
| total_books | INTEGER | Count of eligible books at job creation |
| processed_books | INTEGER | Books attempted so far |
| enriched_books | INTEGER | Books where at least one field was updated |
| error_count | INTEGER | Provider errors encountered |
| last_book_id | TEXT | Cursor for resume — last book ID processed |
| include_covers | INTEGER | Whether this job fetches covers |
| created_by | TEXT | User ID |
| created_at | TEXT | ISO datetime |
| updated_at | TEXT | ISO datetime |

#### `book_metadata_log`

Per-book enrichment history. Tracks which provider supplied what.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| book_id | TEXT | FK to books |
| provider | TEXT | Provider that supplied the data |
| fields_updated | TEXT | JSON array, e.g. `["author","description","series"]` |
| cover_url | TEXT | Source cover URL if fetched |
| enriched_at | TEXT | ISO datetime |

### Changes to Existing Tables

- **`org_settings`**: Remove `bookMetadata` key rows (provider, API keys, batch settings all move to `metadata_config`)
- **`books`**: No changes — enrichment writes to existing columns

### Indexes

- `CREATE INDEX idx_metadata_log_book_id ON book_metadata_log(book_id)` — for enrichment history lookups
- `CREATE INDEX idx_metadata_jobs_org ON metadata_jobs(organization_id)` — for per-org job queries

### Migration

Two-phase migration:

**Phase 1 — SQL migration (`migrations/XXXX_metadata_ownership.sql`):**
- Create `metadata_config`, `metadata_jobs`, `book_metadata_log` tables with indexes
- Seed `metadata_config` with `id='default'`, default chain `["hardcover","googlebooks","openlibrary"]`, rate limit 1500ms, batch size 10, fetch_covers 1

**Phase 2 — Post-deploy key migration (manual):**
- API keys in `org_settings.bookMetadata` are AES-GCM encrypted and cannot be decrypted in pure SQL
- Owner re-enters API keys via the new `PUT /api/metadata/config` endpoint after deploy
- `bookMetadata` rows in `org_settings` are left in place (harmless, ignored by new code) and can be cleaned up in a follow-up migration once keys are confirmed migrated

This avoids risking key loss during migration. The old `bookMetadata` settings are simply unused by the new system.

## Backend Architecture

### Cascade Engine — `src/services/metadataService.js`

Core function: `enrichBook(book, config)`

1. Iterates `config.provider_chain` in order
2. Each provider returns a partial result: `{ author, description, genres, isbn, pageCount, publicationYear, seriesName, seriesNumber, coverUrl }`
3. Merges progressively — first non-empty value wins per field
4. Short-circuits if all fields populated before reaching last provider
5. If `config.fetch_covers` and a `coverUrl` was found, fetches the image and stores in R2 (`BOOK_COVERS` bucket) using the same key format as the existing cover system (`isbn/{isbn13}-M.jpg` for medium size). Uses `c.executionCtx.waitUntil()` for the R2 write so it doesn't block the batch
6. Returns merged result plus a log of which provider supplied which fields

**Cloudflare Workers constraint:** Paid plan allows 30 seconds wall-clock time per request. With `batch_size=10` and `rate_limit_delay_ms=1500`, that's ~15s of delays plus API call time. Cover fetching adds 1-2s per book when enabled. The defaults leave headroom. If covers are enabled, the engine should reduce effective batch size (e.g. process 7 books instead of 10) to stay within limits.

Rate limiting built into the engine:
- Waits `config.rate_limit_delay_ms` between books
- On 429 from any provider: doubles delay for subsequent books (capped at 5000ms), logs warning
- On consecutive 429s from same provider: skips that provider for remaining books in batch
- If accumulated delay would push the batch past ~25 seconds, stop the batch early and return what was processed (resume picks up the rest)

### Provider Adapters

Thin server-side wrappers in `src/services/providers/`:

- **`hardcoverProvider.js`** — Hardcover GraphQL API. Uses centrally-stored API key from `metadata_config`. Adapts existing `hardcoverApi.js` query logic for server-side `fetch()`.
- **`googleBooksProvider.js`** — Google Books REST API. Uses centrally-stored API key. Adapts existing `googleBooksApi.js` logic.
- **`openLibraryProvider.js`** — OpenLibrary API. No key needed. Adapts existing `openLibraryApi.js` logic.

All implement: `async fetchMetadata(book) → { author, description, genres, isbn, pageCount, publicationYear, seriesName, seriesNumber, coverUrl }`

### Job Endpoint — `POST /api/metadata/enrich`

**Request:**
```json
{
  "jobId": "optional — omit to create, include to resume",
  "organizationId": "optional — null for all orgs, owner only",
  "jobType": "fill_missing | refresh_all",
  "includeCovers": true
}
```

**Behaviour:**
- No `jobId`: creates job row, counts eligible books, returns job info (no processing). Lets frontend confirm before starting.
- With `jobId`: loads job, picks up from `last_book_id`, processes `batch_size` books through cascade, updates job, returns progress.

**Response:**
```json
{
  "jobId": "abc",
  "status": "running",
  "totalBooks": 342,
  "processedBooks": 45,
  "enrichedBooks": 38,
  "errorCount": 2,
  "currentBook": "The Gruffalo",
  "done": false
}
```

Frontend calls in a loop until `done: true`.

**Book selection per job type:**
- `fill_missing`: books where any of author, description, genres, isbn, pageCount, publicationYear, seriesName are missing/empty. Scoped by `organization_id` if set (joins through `org_book_selections` to get that org's books).
- `refresh_all`: all books. Scoped by `organization_id` if set. Owner only.

**Note on global catalog:** Books live in a shared global catalog. Scoping by `organization_id` only filters *which* books are eligible for processing (via `org_book_selections`). Enrichment writes to the global `books` table, so enriching a book for one school enriches it for all schools that share that book.

**Resume:** uses `last_book_id` as cursor. Books are processed in `id` order. On resume, query starts with `WHERE id > last_book_id`.

**Concurrency:** Only one job may be `running` globally at a time. Creating a new job while one is running returns 409. This prevents concurrent jobs from doubling API call rate against shared provider keys.

**Admin restrictions enforced server-side:** If `userRole === 'admin'`, the endpoint ignores request body `organizationId` and uses `c.get('organizationId')` instead. `jobType` must be `fill_missing` — requesting `refresh_all` returns 403.

**Genre mapping during enrichment:** When providers return genre names, the cascade engine creates missing genres via the existing `genres` table (INSERT IF NOT EXISTS) and maps names to IDs before writing `genreIds` to the book. This logic lives in `metadataService.js`.

### Additional Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/metadata/config` | GET | Owner | Read cascade config (API keys redacted to booleans) |
| `/api/metadata/config` | PUT | Owner | Update provider chain, API keys, rate limits, batch size, covers toggle |
| `/api/metadata/jobs` | GET | Owner + Admin | List recent jobs. Owner sees all; admin sees own org only. |
| `/api/metadata/jobs/:id` | DELETE | Owner | Cancel a running job (sets status to `paused`) |
| `/api/metadata/status` | GET | Admin+ | Enrichment status for caller's org: enriched count, total count, last job date |
| `/api/metadata/enrich` | POST | Owner + Admin | Create or advance an enrichment job |

Admin access to `/api/metadata/enrich` is restricted: `organizationId` is always set to caller's org (ignores request body), `jobType` must be `fill_missing` (403 on `refresh_all`).

`GET /api/metadata/status` returns:
```json
{
  "totalBooks": 1920,
  "enrichedBooks": 1847,
  "lastJobDate": "2026-03-29T14:30:00Z",
  "activeJob": null
}
```
`enrichedBooks` = books linked to this org (via `org_book_selections`) where all of author, description, isbn are non-empty. `activeJob` is the job ID if a running/pending job exists for this org, so the frontend can resume polling.

### Route Registration

New route file: `src/routes/metadata.js`. Registered in `src/worker.js` alongside other routes.

## Frontend

### Owner View — New "Metadata" Tab on SettingsPage

Replaces the current BookMetadataSettings tab position. Owner only.

**Provider Configuration Section:**
- Drag-to-reorder list for cascade priority (Hardcover, Google Books, OpenLibrary)
- API key fields for Hardcover and Google Books (same encrypted pattern, stored in `metadata_config`)
- Rate limit delay slider (500ms–5000ms)
- Batch size input (5–50)
- "Fetch covers" toggle
- Save button

**Global Enrichment Section:**
- Dropdown: select a school or "All schools"
- Two buttons: "Fill Missing" and "Refresh All"
- Live progress bar: current book name, processed/total counts, error count
- Stop button to pause
- Job history table: recent runs with date, school, type, result counts

### School Admin View — Simplified BookMetadataSettings

Stripped-down version visible to admins only (not teachers/readonly):

- **Removed:** provider selector, API key fields, batch size, speed preset, auto-fallback, provider comparison, save button, Refresh All button and review dialog
- **Shows:** read-only status line — "1,847 of 1,920 books enriched · Last run: 2 days ago"
- **Shows:** "Fill Missing" button — triggers `POST /api/metadata/enrich` with their org ID and `fill_missing` type
- **Shows:** live progress bar when Fill Missing is running (same polling pattern as owner view)

### Tab Visibility in SettingsPage

Current tabs by role:
- All: Application Settings, Data Management, AI Integration, **Book Metadata**
- Admin+: User Management
- Owner: School Management, Billing, Support Tickets

Changes:
- "Book Metadata" tab: shown to admins+ only (currently shown to all). Renamed from "Book Metadata" — keep the same name.
- Owner sees the full metadata management view (provider config + global enrichment)
- Admin sees the simplified view (status + Fill Missing)
- Teacher/Readonly: tab hidden

## Cleanup

### Removed from Backend
- `BOOK_METADATA_SECRET_KEYS`, `encryptBookMetadataKeys`, `decryptBookMetadataKeys` from `src/routes/settings.js`
- `bookMetadata` handling in GET/POST `/api/settings` (the `allowedKeys` entry, preserve logic, decrypt/redact logic)

### Removed from Frontend
- Provider config UI from `BookMetadataSettings.js` (everything above bulk ops)
- `Refresh All` button and review dialog from school admin view
- Client-side batch processing logic (`batchFetchAllMetadata` calls, `checkAvailability` calls)
- Imports of `METADATA_PROVIDERS`, `batchFetchAllMetadata`, `checkAvailability`, `getProviderDisplayName`, `getMetadataConfig`, `validateProviderConfig` from `bookMetadataApi.js` in `BookMetadataSettings.js`

### Kept
- Individual book editing by schools (unchanged)
- Cover system (`/api/covers/*`, R2, `BookCoverContext`) — enrichment writes to the same R2 bucket
- `src/utils/openLibraryApi.js`, `googleBooksApi.js`, `hardcoverApi.js` — kept for client-side single-book lookups (e.g. `AddBookModal`, `ScanBookFlow`, live search in `BookAutocomplete`). Server-side provider adapters are separate implementations.
- `src/utils/bookMetadataApi.js` — verify no remaining consumers after migration before removing. Functions like `searchBooksByTitle` may still be used by `AddBookModal`, `ScanBookFlow`, or `BookImportWizard` for per-book lookups. If so, keep those functions and remove only the bulk/batch functions.

## File Changes Summary

### New Files
- `src/routes/metadata.js` — API endpoints
- `src/services/metadataService.js` — cascade engine
- `src/services/providers/hardcoverProvider.js` — Hardcover adapter
- `src/services/providers/googleBooksProvider.js` — Google Books adapter
- `src/services/providers/openLibraryProvider.js` — OpenLibrary adapter
- `src/components/MetadataManagement.js` — Owner metadata management view
- `migrations/XXXX_metadata_ownership.sql` — New tables, data migration

### Modified Files
- `src/worker.js` — register metadata routes
- `src/routes/settings.js` — remove bookMetadata handling
- `src/components/BookMetadataSettings.js` — strip to simplified admin view
- `src/components/SettingsPage.js` — conditional tab rendering (owner vs admin)

### Potentially Removed
- `src/utils/bookMetadataApi.js` — if no remaining consumers after migration
