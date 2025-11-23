# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Build & Development Commands
- `npm run start` - Frontend dev server (rsbuild) at http://localhost:3001 (proxies to Worker)
- `npm run dev` - Cloudflare Worker dev mode (wrangler dev) at http://localhost:8787
- `npm run start:dev` - Runs both frontend and worker concurrently
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run migrate` - Run data migration script

## Architecture
- **Backend**: Cloudflare Worker (`src/worker.js`) + KV storage
- **Frontend**: React (Rsbuild)
- **Data Storage**: Cloudflare KV (`READING_MANAGER_KV`)
- API routes are defined in `src/routes/` using Hono

## Critical Data Storage Rules
- KV storage: Uses `READING_MANAGER_KV` binding
- Provider pattern in `src/data/index.js` auto-detects storage type
- **Never mix storage types** - data providers are mutually exclusive

## Non-Standard Patterns
- React Context (`src/contexts/AppContext.js`) handles ALL API calls and optimistic updates
- API calls use relative `/api` paths (same-origin serving)
- UUID generation uses Web Crypto API (`src/utils/helpers.js`) for Worker compatibility
- Book autocomplete requires `bookId` field in sessions for tracking

## Environment-Specific Gotchas
- `wrangler.toml` requires KV namespace creation before first deploy
- Docker serves on port 8080 (maps to internal 3000)
- AI configuration (Provider/API Key) can be set via Settings UI or `ANTHROPIC_API_KEY` env var (fallback)
- Worker environment detection: `env.READING_MANAGER_KV` presence