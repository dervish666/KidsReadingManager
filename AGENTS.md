# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Build & Development Commands
- `npm run start` - Frontend dev server (rsbuild) at http://localhost:3000
- `npm run start:server` - Node.js backend only at port 3000
- `npm run dev` - Cloudflare Worker dev mode (wrangler dev)
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run migrate` - Run data migration script

## Dual Architecture Pattern
- **Local Dev**: Express server (`server/index.js`) + JSON file storage (`config/app_data.json`)
- **Production**: Cloudflare Worker (`src/worker.js`) + KV storage
- Data providers auto-switch based on `STORAGE_TYPE` env var or environment detection
- API routes exist in both `server/index.js` (Express) and `src/routes/` (Hono/Workers)

## Critical Data Storage Rules
- JSON storage: `config/app_data.json` (local dev only, requires filesystem access)
- KV storage: Uses `READING_MANAGER_KV` binding (Workers only)
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