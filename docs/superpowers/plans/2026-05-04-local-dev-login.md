# Local Dev Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable local development login by seeding the local D1 database with a dev user/org and fixing the `start:dev` script.

**Architecture:** A Node.js seed script generates a PBKDF2 password hash (matching the app's `crypto.js` format), applies D1 migrations locally, and inserts a dev org + owner user via `wrangler d1 execute --local`. The `start:dev` npm script is updated to use `concurrently` for reliable parallel process management.

**Tech Stack:** Node.js `crypto` module (PBKDF2), wrangler CLI (D1 local), concurrently (npm)

**Spec:** `docs/superpowers/specs/2026-05-04-local-dev-login-design.md`

---

### Task 1: Create the seed script

**Files:**
- Create: `scripts/seed-local.js`

The script follows the same pattern as the existing `scripts/reset-admin-password.js`: Node.js `crypto.pbkdf2Sync` for password hashing, temp SQL file written to disk, executed via `npx wrangler d1 execute --local --file`. Note: this script uses `execSync` with hard-coded commands (no user input), following the same pattern as the existing `reset-admin-password.js` in this repo. The security hook about `execFileNoThrow` applies to the app's runtime code, not dev-only CLI scripts.

- [ ] **Step 1: Create `scripts/seed-local.js`**

```js
#!/usr/bin/env node
const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// PBKDF2 configuration matching src/utils/crypto.js
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;

// Seed data
const ORG_ID = 'dev-org';
const ORG_NAME = 'Dev School';
const ORG_SLUG = 'dev-school';
const USER_ID = 'dev-owner';
const USER_EMAIL = 'dev@tallyreading.uk';
const USER_PASSWORD = 'password';
const USER_NAME = 'Dev Owner';

function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, HASH_LENGTH, 'sha256');
  return `${salt.toString('base64')}:${hash.toString('base64')}`;
}

function run(cmd) {
  try {
    execSync(cmd, { encoding: 'utf8', cwd: process.cwd(), stdio: 'inherit' });
  } catch (error) {
    console.error(`Command failed: ${cmd}`);
    process.exit(1);
  }
}

async function main() {
  console.log('=== Tally Reading Local Dev Seed ===\n');

  // Step 1: Apply migrations
  console.log('1. Applying D1 migrations locally...');
  run('npx wrangler d1 migrations apply reading-manager-db --local');
  console.log('');

  // Step 2: Generate password hash
  console.log('2. Generating password hash...');
  const passwordHash = hashPassword(USER_PASSWORD);
  console.log('   Done (PBKDF2, 100k iterations)\n');

  // Step 3: Insert seed data
  console.log('3. Inserting seed data...');
  const escapedHash = passwordHash.replace(/'/g, "''");
  const now = new Date().toISOString();

  const sql = `
INSERT OR IGNORE INTO organizations (id, name, slug, is_active, created_at, updated_at)
VALUES ('${ORG_ID}', '${ORG_NAME}', '${ORG_SLUG}', 1, '${now}', '${now}');

INSERT OR IGNORE INTO users (id, email, password_hash, name, role, organization_id, is_active, created_at, updated_at)
VALUES ('${USER_ID}', '${USER_EMAIL}', '${escapedHash}', '${USER_NAME}', 'owner', '${ORG_ID}', 1, '${now}', '${now}');
`;

  const tmpFile = path.join(os.tmpdir(), `seed-local-${Date.now()}.sql`);
  fs.writeFileSync(tmpFile, sql, 'utf8');

  try {
    run(`npx wrangler d1 execute reading-manager-db --local --file ${tmpFile}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }

  console.log('');
  console.log('=== Local dev environment ready ===');
  console.log('');
  console.log('  npm run start:dev');
  console.log('');
  console.log('  Then log in at http://localhost:3001 with:');
  console.log(`    Email:    ${USER_EMAIL}`);
  console.log(`    Password: ${USER_PASSWORD}`);
  console.log('');
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run the seed script to verify it works**

Run: `node scripts/seed-local.js`

Expected: Migrations apply successfully, seed data inserts without errors, script prints credentials.

- [ ] **Step 3: Verify seed data exists in local D1**

Run: `npx wrangler d1 execute reading-manager-db --local --command "SELECT id, email, role FROM users WHERE id = 'dev-owner'"`

Expected: One row returned with `dev-owner | dev@tallyreading.uk | owner`

- [ ] **Step 4: Run seed script again to verify idempotency**

Run: `node scripts/seed-local.js`

Expected: Completes without errors (INSERT OR IGNORE skips existing rows).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-local.js
git commit -m "feat: add local dev seed script for D1 database"
```

---

### Task 2: Add `concurrently` and update package.json scripts

**Files:**
- Modify: `package.json` (lines 6-10, scripts section; line 41+, devDependencies)

- [ ] **Step 1: Install concurrently**

Run: `npm install --save-dev concurrently`

Expected: Added to devDependencies in package.json.

- [ ] **Step 2: Add `seed:local` script and fix `start:dev` in package.json**

In `package.json`, in the `"scripts"` section, change:

```json
"start:dev": "npm run dev & npm run start",
```

to:

```json
"start:dev": "concurrently -n worker,frontend -c blue,green \"npm run dev\" \"npm run start\"",
"seed:local": "node scripts/seed-local.js",
```

- [ ] **Step 3: Verify `start:dev` runs both processes**

Run: `npm run start:dev`

Expected: Two labeled processes (`[worker]` in blue, `[frontend]` in green). Worker on :8787, frontend on :3001. Ctrl-C cleanly stops both.

- [ ] **Step 4: Verify login works end-to-end**

Open `http://localhost:3001` in a browser. Log in with:
- Email: `dev@tallyreading.uk`
- Password: `password`

Expected: Login succeeds, redirects to the main app view with "Dev School" as the org.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add seed:local script, fix start:dev with concurrently"
```
