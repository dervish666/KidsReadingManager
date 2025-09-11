# Project Architecture Rules (Non-Obvious Only)

- Dual deployment architecture: local Express + production Cloudflare Workers (not typical)
- Data providers MUST be stateless - auto-switching between JSON/KV based on environment
- React Context (`src/contexts/AppContext.js`) centralizes ALL state - components never manage data
- API routes duplicated across Express and Hono - changes must be synchronized manually
- Optimistic updates pattern: UI updates immediately, reverts on API failure
- Worker environment detection: presence of `env.READING_MANAGER_KV` binding (not env vars)
- UUID generation uses Web Crypto API for cross-platform compatibility (Node.js + Workers)
- Book autocomplete depends on session `bookId` field - architectural coupling not obvious
- Storage abstraction in `src/data/index.js` prevents direct provider imports