# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Build & Development Commands
- `npm run start` - Frontend dev server (rsbuild) at http://localhost:3001 (proxies to Worker)
- `npm run dev` - Cloudflare Worker dev mode (wrangler dev) at http://localhost:8787
- `npm run start:dev` - Runs both frontend and worker concurrently
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run migrate` - Run data migration script
- `npx wrangler d1 migrations apply reading-manager-db --local` - Apply D1 migrations locally
- `npx wrangler d1 migrations apply reading-manager-db --remote` - Apply D1 migrations to production

## Architecture
- **Backend**: Cloudflare Worker (`src/worker.js`)
- **Frontend**: React (Rsbuild)
- **Data Storage**: Hybrid approach using both D1 and KV
  - **D1 Database** (`READING_MANAGER_DB`): Books (scalable SQL storage for 18,000+ books)
  - **KV Storage** (`READING_MANAGER_KV`): Students, Classes, Settings, Genres
- API routes are defined in `src/routes/` using Hono

## Critical Data Storage Rules
- **Books**: Use D1 database via `d1Provider.js` - supports search, pagination, bulk imports
- **Other Data**: Use KV storage via `kvProvider.js` - students, classes, settings, genres
- Provider pattern in `src/data/index.js` auto-detects storage type based on bindings
- D1 provider is used when `env.READING_MANAGER_DB` is available
- KV provider is used when `env.READING_MANAGER_KV` is available
- D1 batch operations limited to 100 statements per batch

## Non-Standard Patterns
- React Context (`src/contexts/AppContext.js`) handles ALL API calls and optimistic updates
- **Authentication**: All internal API calls MUST use `fetchWithAuth` from `AppContext` to ensure proper authentication headers are sent.
- API calls use relative `/api` paths (same-origin serving)
- UUID generation uses Web Crypto API (`src/utils/helpers.js`) for Worker compatibility
- Book autocomplete requires `bookId` field in sessions for tracking
- D1 uses snake_case columns, JS uses camelCase - conversion handled in d1Provider.js

## Environment-Specific Gotchas
- `wrangler.toml` requires both KV namespace and D1 database creation before first deploy
- D1 migrations must be applied before deploying (`migrations/` directory)
- AI configuration (Provider/API Key) can be set via Settings UI or `ANTHROPIC_API_KEY` env var (fallback)
- Worker environment detection: `env.READING_MANAGER_DB` for D1, `env.READING_MANAGER_KV` for KV