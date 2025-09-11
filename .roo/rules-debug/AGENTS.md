# Project Debug Rules (Non-Obvious Only)

- Dual architecture means errors can occur in either Express (`server/index.js`) OR Worker (`src/worker.js`)
- Data provider failures are silent - check `STORAGE_TYPE` env var and `env.READING_MANAGER_KV` presence
- Optimistic updates in `src/contexts/AppContext.js` revert on API failure - check previous state
- KV namespace must exist before Worker deployment or all data operations fail silently
- Docker port mapping: external 8080 → internal 3000 (check correct port in browser)
- Worker environment detection relies on `env.READING_MANAGER_KV` binding existence
- API calls use relative `/api` paths - absolute URLs will fail in production
- Book autocomplete breaks if sessions missing `bookId` field (no error thrown)
- JSON file operations require filesystem access (fail in Worker environment)