# Owner-Managed AI Keys Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner store per-provider AI API keys in D1, used automatically for schools with the AI add-on that haven't configured their own key.

**Architecture:** New `platform_ai_keys` table stores AES-GCM encrypted keys per provider. New owner-only API endpoints for CRUD. AI resolution in `books.js` and `settings.js` checks platform keys before falling back to env vars. New "Platform" tab in SettingsPage for key management. AI status visible in SchoolManagement.

**Tech Stack:** Cloudflare Workers (Hono), D1, React 19, MUI v7, AES-GCM encryption via `utils/crypto.js`

**Spec:** `docs/superpowers/specs/2026-04-13-owner-managed-ai-keys-design.md`

---

## Chunk 1: Database + Backend API

### Task 1: Database migration

**Files:**
- Create: `migrations/0049_platform_ai_keys.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Migration 0049: Platform-level AI API keys
-- Owner-managed keys used as fallback for schools with AI add-on

CREATE TABLE IF NOT EXISTS platform_ai_keys (
    provider TEXT PRIMARY KEY,
    api_key_encrypted TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT
);
```

- [ ] **Step 2: Apply migration locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration applies successfully

- [ ] **Step 3: Commit**

```bash
git add migrations/0049_platform_ai_keys.sql
git commit -m "feat: add platform_ai_keys table (migration 0049)"
```

---

### Task 2: Platform AI key API endpoints

**Files:**
- Modify: `src/routes/settings.js` (add 3 new route handlers after line 512)
- Modify: `src/middleware/tenant.js` (import `requireOwner` — already exported)
- Test: `src/__tests__/integration/platformAiKeys.test.js`

- [ ] **Step 1: Write integration tests**

Create `src/__tests__/integration/platformAiKeys.test.js`. Test:
1. `GET /api/settings/platform-ai` returns empty keys for owner
2. `GET /api/settings/platform-ai` returns 403 for non-owner
3. `PUT /api/settings/platform-ai` with valid provider+key stores encrypted key
4. `PUT /api/settings/platform-ai` with `setActive: true` clears other providers' `is_active`
5. `PUT /api/settings/platform-ai` with invalid provider returns 400
6. `PUT /api/settings/platform-ai` with key too short (<10 chars) returns 400
7. `DELETE /api/settings/platform-ai/:provider` removes key
8. `DELETE /api/settings/platform-ai/:provider` on active provider clears `is_active`

Use the same test harness pattern as `src/__tests__/integration/settings.test.js` — `createTestApp()` with `mockDB`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/integration/platformAiKeys.test.js`
Expected: All tests FAIL (routes don't exist yet)

- [ ] **Step 3: Implement the three endpoints in settings.js**

First, update the import at line 13 of `src/routes/settings.js`:

```js
// Before:
import { auditLog, requireReadonly, requireAdmin } from '../middleware/tenant';
// After:
import { auditLog, requireReadonly, requireAdmin, requireOwner } from '../middleware/tenant';
```

Then add to `src/routes/settings.js` before the `export { settingsRouter }` line:

**GET /api/settings/platform-ai:**
```js
settingsRouter.get('/platform-ai', requireOwner(), async (c) => {
  const db = getDB(c.env);
  const result = await db.prepare('SELECT provider, is_active, updated_at FROM platform_ai_keys').all();
  const rows = result.results || [];

  const keys = {};
  let activeProvider = null;
  for (const provider of ['anthropic', 'openai', 'google']) {
    const row = rows.find((r) => r.provider === provider);
    keys[provider] = {
      configured: Boolean(row),
      isActive: Boolean(row?.is_active),
      updatedAt: row?.updated_at || null,
    };
    if (row?.is_active) activeProvider = provider;
  }

  return c.json({ keys, activeProvider });
});
```

**PUT /api/settings/platform-ai:**
```js
settingsRouter.put(
  '/platform-ai',
  requireOwner(),
  auditLog('update', 'platform_ai_keys'),
  async (c) => {
    const db = getDB(c.env);
    const userId = c.get('userId');
    const { provider, apiKey, setActive } = await c.req.json();

    const validProviders = ['anthropic', 'openai', 'google'];
    if (!provider || !validProviders.includes(provider)) {
      throw badRequestError('Invalid provider. Must be anthropic, openai, or google.');
    }

    if (apiKey !== undefined) {
      if (typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 500) {
        throw badRequestError('API key must be between 10 and 500 characters.');
      }
    }

    const encSecret = getEncryptionSecret(c.env);
    if (!encSecret) {
      return c.json({ error: 'Server configuration error - encryption not available' }, 500);
    }

    const statements = [];

    if (apiKey !== undefined) {
      const encrypted = await encryptSensitiveData(apiKey, encSecret);
      statements.push(
        db
          .prepare(
            `INSERT INTO platform_ai_keys (provider, api_key_encrypted, is_active, updated_at, updated_by)
             VALUES (?, ?, ?, datetime('now'), ?)
             ON CONFLICT(provider) DO UPDATE SET
               api_key_encrypted = excluded.api_key_encrypted,
               is_active = excluded.is_active,
               updated_at = datetime('now'),
               updated_by = excluded.updated_by`
          )
          .bind(provider, encrypted, setActive ? 1 : 0, userId)
      );
    }

    if (setActive) {
      // Clear is_active on all other providers
      statements.push(
        db
          .prepare('UPDATE platform_ai_keys SET is_active = 0 WHERE provider != ?')
          .bind(provider)
      );
      // Set is_active on the target provider (if not already done via upsert above)
      if (!apiKey) {
        statements.push(
          db
            .prepare(
              'UPDATE platform_ai_keys SET is_active = 1, updated_at = datetime(\'now\'), updated_by = ? WHERE provider = ?'
            )
            .bind(userId, provider)
        );
      }
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

    // Return updated state
    const result = await db
      .prepare('SELECT provider, is_active, updated_at FROM platform_ai_keys')
      .all();
    const rows = result.results || [];

    const keys = {};
    let activeProviderResult = null;
    for (const p of validProviders) {
      const row = rows.find((r) => r.provider === p);
      keys[p] = {
        configured: Boolean(row),
        isActive: Boolean(row?.is_active),
        updatedAt: row?.updated_at || null,
      };
      if (row?.is_active) activeProviderResult = p;
    }

    return c.json({ keys, activeProvider: activeProviderResult });
  }
);
```

**DELETE /api/settings/platform-ai/:provider:**
```js
settingsRouter.delete(
  '/platform-ai/:provider',
  requireOwner(),
  auditLog('delete', 'platform_ai_keys'),
  async (c) => {
    const db = getDB(c.env);
    const provider = c.req.param('provider');

    const validProviders = ['anthropic', 'openai', 'google'];
    if (!validProviders.includes(provider)) {
      throw badRequestError('Invalid provider.');
    }

    await db.prepare('DELETE FROM platform_ai_keys WHERE provider = ?').bind(provider).run();
    return c.json({ success: true });
  }
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/integration/platformAiKeys.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings.js src/__tests__/integration/platformAiKeys.test.js
git commit -m "feat: platform AI key CRUD endpoints (owner-only)"
```

---

### Task 3: Update AI key resolution in books.js

**Files:**
- Modify: `src/routes/books.js:672-708` (replace Path 2 env var fallback)
- Test: `src/__tests__/integration/books.test.js` (add platform key test cases)

- [ ] **Step 1: Write integration tests for platform key resolution**

Add test cases to the existing AI suggestions describe block in `src/__tests__/integration/books.test.js`:

1. `should use platform key when org has ai_addon_active but no org key` — mock `platform_ai_keys` returning a row with `api_key_encrypted`, verify AI call uses it
2. `should fall back to env var when no platform key exists` — mock `platform_ai_keys` returning null, env var set, verify it still works
3. `should return 403 when no org key, no platform key, no env var` — all empty

**Important:** The new `platform_ai_keys` query adds an extra `db.prepare().first()` call in Path 2. Existing tests that mock the Path 2 flow (e.g. `should allow access when ai_addon_active is true and env key exists` at ~line 640) will need an additional `.mockResolvedValueOnce(null)` inserted in their mock chain for the platform key lookup, before the env var fallback takes effect.

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `npx vitest run src/__tests__/integration/books.test.js --testNamePattern="platform key"`
Expected: FAIL

- [ ] **Step 3: Update Path 2 in books.js**

Replace `src/routes/books.js` lines 686–708 (the `// Use environment API key` block) with:

```js
      // Path 2a: Use owner's platform key
      const platformKey = await db
        .prepare('SELECT provider, api_key_encrypted FROM platform_ai_keys WHERE is_active = 1')
        .first();

      if (platformKey?.api_key_encrypted) {
        try {
          const decryptedKey = await decryptSensitiveData(platformKey.api_key_encrypted, encSecret);
          aiConfig = {
            provider: platformKey.provider,
            apiKey: decryptedKey,
            model: null,
          };
        } catch (decryptError) {
          console.error('Failed to decrypt platform API key:', decryptError.message);
          throw badRequestError('Platform AI configuration error. Contact the administrator.');
        }
      } else {
        // Path 2b: Tertiary fallback — env vars (transitional, remove after platform keys confirmed)
        const envProvider = c.env.ANTHROPIC_API_KEY
          ? 'anthropic'
          : c.env.OPENAI_API_KEY
            ? 'openai'
            : c.env.GOOGLE_API_KEY
              ? 'google'
              : null;

        if (!envProvider) {
          throw badRequestError('AI not configured. Contact your administrator.');
        }

        const envKeyMap = {
          anthropic: 'ANTHROPIC_API_KEY',
          openai: 'OPENAI_API_KEY',
          google: 'GOOGLE_API_KEY',
        };

        aiConfig = {
          provider: envProvider,
          apiKey: c.env[envKeyMap[envProvider]],
          model: null,
        };
      }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/integration/books.test.js`
Expected: All tests PASS (existing + new)

- [ ] **Step 5: Commit**

```bash
git add src/routes/books.js src/__tests__/integration/books.test.js
git commit -m "feat: AI key resolution uses platform keys before env var fallback"
```

---

### Task 4: Update settings/ai GET to report platform key source

**Files:**
- Modify: `src/routes/settings.js:170-236` (GET /ai handler)
- Test: `src/__tests__/integration/settings.test.js` (add platform keySource tests)

- [ ] **Step 1: Add tests for platform key source detection**

Add to `src/__tests__/integration/settings.test.js`:
1. `should return keySource 'platform' when no org key but platform key active` — mock org_ai_config null, platform_ai_keys returns active row
2. `should show platform provider in availableProviders` — verify the active platform provider shows as available

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run src/__tests__/integration/settings.test.js --testNamePattern="platform"`
Expected: FAIL

- [ ] **Step 3: Update the GET /ai handler**

In `src/routes/settings.js`, inside the `GET /ai` handler (multi-tenant block, ~line 178), after reading `envKeys` and `config`, add a platform key check:

```js
    // Check platform-level keys (owner-managed fallback)
    const platformKeyRow = await db
      .prepare('SELECT provider, is_active FROM platform_ai_keys WHERE is_active = 1')
      .first();
    const hasPlatformKey = Boolean(platformKeyRow);
    const platformProvider = platformKeyRow?.provider || null;
```

Then update the `keySource` logic (~line 213):
```js
    keySource: hasOrgKey
      ? 'organization'
      : hasPlatformKey
        ? 'platform'
        : envKeys[activeProvider]
          ? 'environment'
          : 'none',
```

And update `availableProviders` to include platform key:
```js
    availableProviders: {
      anthropic:
        (hasOrgKey && activeProvider === 'anthropic') ||
        (hasPlatformKey && platformProvider === 'anthropic') ||
        envKeys.anthropic,
      openai:
        (hasOrgKey && activeProvider === 'openai') ||
        (hasPlatformKey && platformProvider === 'openai') ||
        envKeys.openai,
      google:
        (hasOrgKey && activeProvider === 'google') ||
        (hasPlatformKey && platformProvider === 'google') ||
        envKeys.google,
    },
```

Also update the `upsertAiConfig` function (~line 246) which returns the same `availableProviders` and `keySource` fields in the POST `/ai` response. Add the same platform key lookup and update the `keySource`/`availableProviders` logic at ~lines 382-392 to match the GET handler, so the frontend gets consistent key source info after both GET and POST.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/integration/settings.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings.js src/__tests__/integration/settings.test.js
git commit -m "feat: settings/ai GET and POST report platform key source"
```

---

### Task 5: Add has_ai_key to organization list

**Files:**
- Modify: `src/routes/organization.js:159-170` (data query)
- Modify: `src/utils/rowMappers.js:148` (rowToOrganization)

- [ ] **Step 1: Add subquery to org list data query**

In `src/routes/organization.js:159-170`, add a subquery after the `last_sync_error` subquery:

```sql
        (SELECT COUNT(*) FROM org_ai_config WHERE organization_id = o.id AND api_key_encrypted IS NOT NULL) as has_ai_key
```

- [ ] **Step 2: Add field to rowToOrganization**

In `src/utils/rowMappers.js`, after line 152 (`lastSyncError`), add:

```js
    hasAiKey: Boolean(row.has_ai_key),
```

- [ ] **Step 3: Run existing org tests**

Run: `npx vitest run src/__tests__/integration/organization.test.js`
Expected: PASS (existing tests shouldn't break — the new field is additive)

- [ ] **Step 4: Commit**

```bash
git add src/routes/organization.js src/utils/rowMappers.js
git commit -m "feat: include has_ai_key in organization list response"
```

---

## Chunk 2: Frontend — Platform Settings + School AI Status

### Task 6: PlatformSettings component

**Files:**
- Create: `src/components/PlatformSettings.js`

- [ ] **Step 1: Create the PlatformSettings component**

Build a component that:
- Calls `GET /api/settings/platform-ai` on mount to load current state
- Renders three provider cards (Anthropic, OpenAI, Google) each with:
  - Provider name
  - Status chip: "Configured" (green) or "Not configured" (grey)
  - "Active" chip if `isActive`
  - Masked text field for API key (placeholder "Enter API key" or "Key configured — enter new key to replace")
  - Save button that calls `PUT /api/settings/platform-ai`
- Radio group to select the active provider (only configured providers selectable)
- Changing the active provider calls `PUT` with `{ provider, setActive: true }` (no apiKey)
- Delete button per configured provider that calls `DELETE /api/settings/platform-ai/:provider`
- Info alert at top: "These keys are used for schools with the AI add-on that haven't configured their own key."
- Follow the existing `AISettings.js` patterns for layout, MUI styling, and save/error state handling
- Use `fetchWithAuth` from `useAuth()` for API calls

- [ ] **Step 2: Verify it renders without errors**

Import it temporarily in `SettingsPage.js`, add as a tab, start dev server with `npm run start:dev`, navigate to the Platform tab.

- [ ] **Step 3: Commit**

```bash
git add src/components/PlatformSettings.js
git commit -m "feat: PlatformSettings component for owner AI key management"
```

---

### Task 7: Add Platform tab to SettingsPage

**Files:**
- Modify: `src/components/SettingsPage.js:1-71` (imports + tabs array)

- [ ] **Step 1: Add import and tab entry**

Add import at top of `SettingsPage.js`:
```js
import PlatformSettings from './PlatformSettings';
import TuneIcon from '@mui/icons-material/Tune';
```

In the `tabs` useMemo, add the Platform tab inside the `if (isOwner)` block, before School Management:
```js
      allTabs.push({
        label: 'Platform',
        icon: <TuneIcon />,
        component: PlatformSettings,
      });
```

- [ ] **Step 2: Test in browser**

Start dev server, log in as owner, navigate to Settings. Verify:
- "Platform" tab appears only for owner
- Tab renders PlatformSettings component
- Can enter a key, save, see "Configured" status
- Can switch active provider
- Non-owner users don't see the tab

- [ ] **Step 3: Commit**

```bash
git add src/components/SettingsPage.js
git commit -m "feat: add Platform tab to SettingsPage (owner-only)"
```

---

### Task 8: AI status in SchoolReadView

**Files:**
- Modify: `src/components/schools/SchoolReadView.js:136-176` (billing card area)

- [ ] **Step 1: Add AI status to the billing card**

The billing card already shows `AI Add-on: Enabled/Not enabled` at line 154. Extend this section to also show key source. After the `AI Add-on` LabelValue, add:

```jsx
          {school.aiAddonActive && (
            <LabelValue
              label="AI Key"
              value={
                school.hasAiKey ? (
                  <Chip label="Own key" size="small" color="info" sx={{ fontWeight: 600, fontSize: '0.7rem' }} />
                ) : (
                  <Chip label="Owner-managed" size="small" color="default" sx={{ fontWeight: 600, fontSize: '0.7rem' }} />
                )
              }
            />
          )}
```

This uses `hasAiKey` from the org response (added in Task 5). `Chip` is already imported.

- [ ] **Step 2: Test in browser**

Open SchoolManagement, click a school. Verify:
- Schools with `aiAddonActive` show the AI Key line
- Schools with their own key show "Own key" chip
- Schools without show "Owner-managed" chip
- Schools without AI add-on don't show the AI Key line

- [ ] **Step 3: Commit**

```bash
git add src/components/schools/SchoolReadView.js
git commit -m "feat: show AI key source in school detail view"
```

---

### Task 9: AI status column in SchoolTable

**Files:**
- Modify: `src/components/schools/SchoolTable.js` (add column)

- [ ] **Step 1: Add AI column to SchoolTable**

Add a column after the billing status column. Show a simple chip:
- `aiAddonActive && hasAiKey` → SmartToy icon in info color (own key)
- `aiAddonActive && !hasAiKey` → SmartToy icon in default color (owner-managed)
- `!aiAddonActive` → nothing / grey dash

Use `SmartToyIcon` from `@mui/icons-material/SmartToy` (already imported in AISettings, needs import here).

- [ ] **Step 2: Test in browser**

View the school table. Verify the AI column shows correct icons for different school states.

- [ ] **Step 3: Commit**

```bash
git add src/components/schools/SchoolTable.js
git commit -m "feat: AI status column in school table"
```

---

## Chunk 3: Deploy + Verify + Docs

### Task 10: Deploy and configure platform keys

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (except the 4 pre-existing timezone failures in students.test.js)

- [ ] **Step 2: Apply migration to remote D1**

Run: `npx wrangler d1 migrations apply reading-manager-db --remote`

- [ ] **Step 3: Build and deploy**

Run: `npm run go`

- [ ] **Step 4: Configure platform keys via the new UI**

Log in as owner, go to Settings → Platform tab. Enter the Anthropic API key and set it as active.

- [ ] **Step 5: Verify Learnalot demo**

Open the Learnalot demo, navigate to a student, request AI recommendations. Verify they work.

- [ ] **Step 6: Commit version bump and ship**

Use the `/ship` skill to bump version, update changelog, tag, and push.

---

### Task 11: Update CLAUDE.md and structure files

- [ ] **Step 1: Update CLAUDE.md file map**

Add entries for:
- `src/components/PlatformSettings.js` — Platform AI key management (owner-only)
- `migrations/0049_platform_ai_keys.sql` — Platform AI keys table

- [ ] **Step 2: Update `.claude/structure/routes.yaml`**

Add the three new platform-ai endpoints under settings routes.

- [ ] **Step 3: Update `.claude/structure/components.yaml`**

Add PlatformSettings component entry.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md .claude/structure/
git commit -m "docs: update file map and structure for platform AI keys"
```
