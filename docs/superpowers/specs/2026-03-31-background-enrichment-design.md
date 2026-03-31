# Background Enrichment — Cron-Driven Metadata Processing

**Date:** 2026-03-31
**Status:** Draft

## Problem

Metadata enrichment requires the browser tab to stay open — each batch is driven by a frontend polling call. For large libraries (2,400+ books at 5 per batch), this means hours of babysitting.

## Solution

Add a "Run in background" toggle. When enabled, a cron trigger (every minute) picks up the job and processes batches without the browser. The existing foreground polling mode remains unchanged.

## Data Model

Add column to `metadata_jobs`:
- `background INTEGER DEFAULT 0` — when 1, the cron processes this job

Migration: `ALTER TABLE metadata_jobs ADD COLUMN background INTEGER DEFAULT 0`

## Cron Trigger

Add `*/1 * * * *` to `wrangler.toml` cron triggers (alongside existing daily triggers at 2:00 and 3:00 UTC).

Handler logic in `worker.js` scheduled handler:
1. Query `metadata_jobs WHERE background = 1 AND status IN ('pending', 'running') LIMIT 1`
2. No results → exit immediately (~1ms)
3. Found a job → loop: load config, fetch next batch, process, write results. Repeat until 20s wall-clock cutoff, then exit. Next cron invocation continues.
4. When no more books remain, set `status = 'completed'`.

## Refactor: Extract Shared Processing

The POST `/enrich` handler currently contains ~200 lines of inline processing logic (fetch books, call `processBatch`, genre resolution, D1 writes, cover fetching, progress update). This needs to be callable from both the HTTP handler and the cron handler.

Extract into `metadataService.js`:

```
async function processJobBatch(db, job, config, options?)
```

**Parameters:**
- `db` — D1 database binding
- `job` — the `metadata_jobs` row
- `config` — decrypted config from `getConfigWithKeys`
- `options.r2Bucket` — optional R2 binding for cover caching
- `options.waitUntil` — optional `ctx.waitUntil` for non-blocking cover writes

**Returns:** `{ processedBooks, enrichedBooks, errorCount, lastBookId, done, currentBook }`

**Responsibilities:**
- Fetch next batch of books (using job's cursor and type)
- Call `processBatch` with cascade engine
- Genre name-to-ID resolution
- D1 batch writes (book updates, metadata log, job progress)
- Cover fetching via R2 (if enabled and r2Bucket provided)
- Detect completion (no more books)

Both the HTTP endpoint and the cron handler call this function. The HTTP endpoint returns the result as JSON. The cron handler loops calling it until the 20s cutoff or completion.

## API Changes

**POST /api/metadata/enrich** — request body gains optional `background: true` field. When set, the created job has `background = 1`. The endpoint returns the job info immediately without starting polling.

## Frontend Changes

**MetadataManagement.js** — add a `Switch` labelled "Run in background" next to the action buttons. When toggled on:
- Job creation POST includes `background: true`
- No polling loop starts
- Progress area shows: "Running in background — check Job History for progress"
- Job history table shows progress as usual (refresh button already exists)

When toggled off (default): existing foreground polling behaviour unchanged.

## File Changes

| File | Change |
|------|--------|
| `migrations/0043_background_enrichment.sql` | Add `background` column |
| `wrangler.toml` | Add `*/1 * * * *` cron trigger |
| `src/worker.js` | Add background enrichment to scheduled handler |
| `src/services/metadataService.js` | Extract `processJobBatch` from route |
| `src/routes/metadata.js` | Use `processJobBatch`, handle `background` field |
| `src/components/MetadataManagement.js` | Add background toggle switch |
