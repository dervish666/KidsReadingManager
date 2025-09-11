# Project Coding Rules (Non-Obvious Only)

- Always use `generateId()` from `src/utils/helpers.js` instead of `uuidv4()` for Worker compatibility
- API retry mechanism in `src/contexts/AppContext.js` uses optimistic updates (revert on failure)
- Data provider pattern in `src/data/index.js` auto-switches - never import providers directly
- Book operations MUST use `createProvider(env)` pattern for dual architecture support
- React Context handles ALL API calls - components never call fetch directly
- Session data requires `bookId` field for autocomplete functionality to work
- UUID generation uses Web Crypto API (`crypto.getRandomValues`) not Node.js crypto
- Express routes in `server/index.js` and Hono routes in `src/routes/` must stay synchronized