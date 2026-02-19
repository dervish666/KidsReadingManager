# Tally Reading Rebrand Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename "Kids Reading Manager" to "Tally Reading" across all code, config, tests, and documentation.

**Architecture:** Single-pass find-and-replace across 43 files. No logic changes — purely text substitution. Tests updated to match new strings.

**Tech Stack:** React, Hono/Cloudflare Workers, Vitest, Material-UI

---

### Task 1: Create feature branch

**Step 1: Create and switch to rebrand branch**

```bash
git checkout -b rebrand/tally-reading
```

---

### Task 2: Update user-facing source files

**Files:**
- Modify: `src/components/Header.js:114`
- Modify: `src/components/Login.js:538`
- Modify: `src/worker.js:2,207`
- Modify: `src/contexts/AppContext.js:1637`
- Modify: `src/routes/covers.js:67`
- Modify: `src/utils/openLibraryApi.js:38,98,435,465,594`

**Step 1: Update Header component**

In `src/components/Header.js:114`, change:
```
Kids Reading Manager
```
to:
```
Tally Reading
```

**Step 2: Update Login component**

In `src/components/Login.js:538`, change:
```
Kids Reading Manager
```
to:
```
Tally Reading
```

**Step 3: Update worker health check and file header**

In `src/worker.js:2`, change:
```
 * Kids Reading Manager - Cloudflare Worker
```
to:
```
 * Tally Reading - Cloudflare Worker
```

In `src/worker.js:207`, change:
```
message: 'Kids Reading Manager API is running',
```
to:
```
message: 'Tally Reading API is running',
```

**Step 4: Update backup filename**

In `src/contexts/AppContext.js:1637`, change:
```
a.download = `reading-manager-backup-${new Date().toISOString().split('T')[0]}.json`;
```
to:
```
a.download = `tally-reading-backup-${new Date().toISOString().split('T')[0]}.json`;
```

**Step 5: Update User-Agent strings**

In `src/routes/covers.js:67` and all 5 occurrences in `src/utils/openLibraryApi.js`, change:
```
'User-Agent': 'KidsReadingManager/1.0 (educational-app)'
```
to:
```
'User-Agent': 'TallyReading/1.0 (educational-app)'
```

Use `replace_all` for `src/utils/openLibraryApi.js` since all 5 instances are identical.

**Step 6: Commit**

```bash
git add src/components/Header.js src/components/Login.js src/worker.js src/contexts/AppContext.js src/routes/covers.js src/utils/openLibraryApi.js
git commit -m "rebrand: update user-facing source files to Tally Reading"
```

---

### Task 3: Update email templates

**Files:**
- Modify: `src/utils/email.js:35,38,47,58,64,197,200,211,222,228`

**Step 1: Update password reset email**

In `src/utils/email.js`, replace all 5 occurrences of `Kids Reading Manager` in `sendPasswordResetEmail` function (lines 35-84):
- Line 35: subject `'Reset your Kids Reading Manager password'` → `'Reset your Tally Reading password'`
- Line 38: text body `Kids Reading Manager` → `Tally Reading`
- Line 47: signature `Kids Reading Manager Team` → `Tally Reading Team`
- Line 58: HTML header `Kids Reading Manager` → `Tally Reading`
- Line 64: HTML body `Kids Reading Manager` → `Tally Reading`

**Step 2: Update welcome email**

In `src/utils/email.js`, replace all 5 occurrences in `sendWelcomeEmail` function (lines 197-243):
- Line 197: subject `'Welcome to Kids Reading Manager - ${organizationName}'` → `'Welcome to Tally Reading - ${organizationName}'`
- Line 200: text body `Welcome to Kids Reading Manager!` → `Welcome to Tally Reading!`
- Line 211: signature `Kids Reading Manager Team` → `Tally Reading Team`
- Line 222: HTML header `Kids Reading Manager` → `Tally Reading`
- Line 228: HTML body `Welcome to Kids Reading Manager!` → `Welcome to Tally Reading!`

Simplest approach: use `replace_all` to change `Kids Reading Manager` → `Tally Reading` across the entire file (all 10 occurrences).

**Step 3: Commit**

```bash
git add src/utils/email.js
git commit -m "rebrand: update email templates to Tally Reading"
```

---

### Task 4: Update config files

**Files:**
- Modify: `package.json:2,4`
- Modify: `rsbuild.config.mjs:42`
- Modify: `wrangler.toml:20,43`
- Modify: `public/index.html:4,12`
- Modify: `public/manifest.json:2,3`
- Modify: `LICENSE:3`

**Step 1: Update package.json**

Line 2: `"name": "kids-reading-manager-cloudflare"` → `"name": "tally-reading"`
Line 4: `"description": "Cloudflare Workers implementation of Kids Reading Manager API"` → `"description": "Cloudflare Workers implementation of Tally Reading API"`

**Step 2: Update rsbuild.config.mjs**

Line 42: `config.title = 'Kids Reading Manager';` → `config.title = 'Tally Reading';`

**Step 3: Update wrangler.toml**

Add new route after existing brisflix route (line 20):
```toml
routes = [
  { pattern = "reading.brisflix.com/*", zone_name = "brisflix.com" },
  { pattern = "tallyreading.uk/*", zone_name = "tallyreading.uk" }
]
```

Update ALLOWED_ORIGINS (line 43):
```toml
ALLOWED_ORIGINS = "https://kids-reading-manager.brisflix.workers.dev/,https://reading.brisflix.com,https://tallyreading.uk"
```

**Step 4: Update public/index.html**

Line 4: `<title>Kids Reading Manager</title>` → `<title>Tally Reading</title>`
Line 12: `content="Kids Reading Manager - Track and manage reading sessions"` → `content="Tally Reading - Track and manage reading sessions"`

**Step 5: Update public/manifest.json**

Line 2: `"short_name": "Reading Manager"` → `"short_name": "Tally Reading"`
Line 3: `"name": "Kids Reading Manager"` → `"name": "Tally Reading"`

**Step 6: Update LICENSE**

Line 3: `Copyright (c) 2025 Kids Reading Manager` → `Copyright (c) 2025 Tally Reading`

**Step 7: Commit**

```bash
git add package.json rsbuild.config.mjs wrangler.toml public/index.html public/manifest.json LICENSE
git commit -m "rebrand: update config files and infrastructure for Tally Reading"
```

---

### Task 5: Update tests

**Files:**
- Modify: `src/__tests__/unit/email.test.js:97,422,481,483,636,680`
- Modify: `src/__tests__/components/Login.test.jsx:259`

**Step 1: Update email tests**

Use `replace_all` to change `Kids Reading Manager` → `Tally Reading` in `src/__tests__/unit/email.test.js` (6 occurrences):
- Line 97: `'Reset your Kids Reading Manager password'`
- Line 422: `'Kids Reading Manager'`
- Line 481: `'Welcome to Kids Reading Manager - Springfield Elementary'`
- Line 483: `'Welcome to Kids Reading Manager'`
- Line 636: `'Welcome to Kids Reading Manager - Awesome School'`
- Line 680: `'Kids Reading Manager'`

**Step 2: Update Login test**

In `src/__tests__/components/Login.test.jsx:259`:
```
expect(screen.getByText('Kids Reading Manager')).toBeInTheDocument();
```
→
```
expect(screen.getByText('Tally Reading')).toBeInTheDocument();
```

**Step 3: Run full test suite**

```bash
npm test
```

Expected: All ~1323 tests pass. If any fail, they will be email or login tests where a string was missed.

**Step 4: Commit**

```bash
git add src/__tests__/unit/email.test.js src/__tests__/components/Login.test.jsx
git commit -m "rebrand: update test expectations for Tally Reading"
```

---

### Task 6: Update documentation

**Files (primary):**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `CHANGELOG.md`
- Modify: `INSTRUCTIONS.md`
- Modify: `IMPROVEMENTS.md`
- Modify: `.serena/project.yml`

**Files (docs/):**
- Modify: `docs/scaling.md`
- Modify: all files in `docs/plans/` that reference the old name

**Files (cline_docs/):**
- Modify: all files in `cline_docs/` that reference the old name

**Files (other):**
- Modify: `public/ICON-INSTRUCTIONS.md`
- Modify: `scripts/build-and-deploy.sh` (if branded)
- Modify: `scripts/deploy.sh` (if branded)
- Modify: `scripts/migration.js` (if branded)
- Modify: `scripts/test-api.js` (if branded)

**Step 1: Update primary docs**

For each file, replace `Kids Reading Manager` → `Tally Reading` and `kids-reading-manager` → `tally-reading` (where it refers to the brand, NOT the Cloudflare worker name or database name).

Be careful in `CLAUDE.md` and `wrangler.toml` references — the worker name `kids-reading-manager` and database name `reading-manager-db` should remain unchanged when they appear as infrastructure identifiers.

**Step 2: Update .serena/project.yml**

Line 88: `project_name: "KidsReadingManager redux"` → `project_name: "TallyReading"`

**Step 3: Update docs/ and cline_docs/**

Replace `Kids Reading Manager` → `Tally Reading` across all markdown files in these directories.
Replace `KidsReadingManager` → `TallyReading` where it appears as a brand reference (NOT the User-Agent, which was already updated in Task 2).

**Step 4: Update scripts/**

Replace any `Kids Reading Manager` references in script files and comments.

**Step 5: Commit**

```bash
git add README.md CLAUDE.md CHANGELOG.md INSTRUCTIONS.md IMPROVEMENTS.md .serena/project.yml docs/ cline_docs/ public/ICON-INSTRUCTIONS.md scripts/
git commit -m "rebrand: update all documentation to Tally Reading"
```

---

### Task 7: Final verification

**Step 1: Search for any remaining old brand references**

```bash
grep -ri "Kids Reading Manager" --include="*.js" --include="*.jsx" --include="*.json" --include="*.html" --include="*.mjs" --include="*.toml" --include="*.md" --include="*.yml" .
```

Any hits should be in:
- The design doc (`docs/plans/2026-02-19-tally-reading-rebrand-design.md`) — OK, it documents the change
- `package-lock.json` — auto-generated, will update on next `npm install`
- Comments referencing the old name in historical context — OK

**Step 2: Run full test suite one more time**

```bash
npm test
```

Expected: All tests pass.

**Step 3: Build the project**

```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 4: Verify locally (manual)**

```bash
npm run start:dev
```

Open http://localhost:3001 and verify:
- Login page shows "Tally Reading"
- Header shows "Tally Reading"
- Page title shows "Tally Reading"

---

### Post-Implementation: Domain Setup (Manual, not code)

1. In Cloudflare dashboard, add DNS record for `tallyreading.uk` → worker
2. Deploy: `npm run go`
3. Verify `https://tallyreading.uk` loads the app
4. Verify `https://reading.brisflix.com` still works (transition period)
