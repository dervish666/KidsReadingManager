# Local Dev Login Fix

**Date:** 2026-05-04
**Status:** Draft

## Problem

After migrating to Cloudflare Workers with JWT multi-tenant auth, local development login doesn't work. The `.env` file sets `JWT_SECRET`, activating JWT auth mode, but the local D1 database has no schema or seed data. Every login attempt fails.

The workaround has been deploying to production to test, which is unsustainable now that there are real customers.

## Solution

Three small changes — no modifications to application code.

### 1. Seed Script (`scripts/seed-local.js`)

A Node.js script that bootstraps local D1 for development:

**Step 1 — Apply migrations:**
Runs `npx wrangler d1 migrations apply reading-manager-db --local` to create all tables.

**Step 2 — Generate password hash:**
Uses Node.js `crypto.subtle` (same PBKDF2-SHA256, 100k iterations, 16-byte salt as `src/utils/crypto.js`) to hash the password `password`. This keeps the seed script aligned with the app's hashing without importing ESM modules.

**Step 3 — Insert seed data:**
Runs `npx wrangler d1 execute reading-manager-db --local --command="..."` to insert:

- **Organization:** id `dev-org`, name "Dev School", slug `dev-school`, is_active 1
- **User:** id `dev-owner`, email `dev@tallyreading.uk`, role `owner`, organization_id `dev-org`, is_active 1

Uses `INSERT OR IGNORE` so the script is idempotent — safe to run multiple times.

**Step 4 — Print confirmation:**
Outputs the credentials and a reminder to run `npm run start:dev`.

### 2. Package.json Changes

**New script:**
```json
"seed:local": "node scripts/seed-local.js"
```

**Fixed script:**
```json
"start:dev": "concurrently -n worker,frontend -c blue,green \"npm run dev\" \"npm run start\""
```

The current `start:dev` uses shell `&` backgrounding, which loses the worker process on ctrl-c and doesn't show clean output. `concurrently` gives labeled output, proper signal forwarding, and clean shutdown.

**New devDependency:**
```json
"concurrently": "^9.1.2"
```

### 3. No Application Code Changes

The auth routes (`src/routes/auth.js`), JWT middleware (`src/middleware/tenant.js`), frontend login (`src/components/Login.js`), and API proxy (`rsbuild.config.mjs`) all work correctly already. The only gap was missing data in the local D1 database.

## Local Dev Workflow (After)

```bash
# One-time setup
npm run seed:local

# Daily development
npm run start:dev
# → Frontend on http://localhost:3001
# → Worker on http://localhost:8787
# → Login with dev@tallyreading.uk / password
```

## Seed Credentials

| Field    | Value                  |
|----------|------------------------|
| Email    | dev@tallyreading.uk    |
| Password | password               |
| Role     | owner                  |
| Org      | Dev School             |

## Files Changed

| File | Change |
|------|--------|
| `scripts/seed-local.js` | New — seed script |
| `package.json` | Add `seed:local` script, fix `start:dev`, add `concurrently` devDep |
