# Project Documentation Rules (Non-Obvious Only)

- `src/worker.js` contains Cloudflare Worker code, not frontend source (counterintuitive naming)
- `server/index.js` is Express server for local dev only, not production server
- Data flows through dual architecture: JSON files (local) vs KV storage (production)
- React Context in `src/contexts/AppContext.js` is the single source of truth for all data
- API routes duplicated: Express (`server/index.js`) and Hono (`src/routes/`) must stay in sync
- Book recommendations require `ANTHROPIC_API_KEY` - feature fails silently without it
- `config/app_data.json` is mounted volume in Docker, not part of container filesystem
- Provider pattern auto-detects environment - never reference storage implementations directly
- Reading sessions need `bookId` for autocomplete - missing field breaks functionality