# Owner-Managed AI Keys

## Problem

Schools that purchase the AI add-on via Stripe but don't configure their own API key currently fall back to a Worker-level environment variable (`ANTHROPIC_API_KEY`). This key has expired, breaking AI recommendations for the demo site and any school relying on it. There's no way to update it from the app, no visibility into which provider is active, and no per-provider key management.

## Design

### Concept

The owner stores one API key per AI provider (Anthropic, OpenAI, Google) in a secure platform-wide table. A single "active provider" setting controls which key is used. Schools with `ai_addon_active` (set by Stripe) that haven't configured their own key automatically use the owner's platform key. Schools that enter their own key in AI Settings continue using it — no change to that path.

### Key resolution order (unchanged logic, new source)

```
1. org_ai_config has encrypted key for this org? → Use school's own key (Path 1)
2. org.ai_addon_active is true?
   → Read platform_ai_keys for the active provider → Use owner's key (Path 2, NEW)
3. Neither → 403 "AI not enabled"
```

### Env var transition

During the transition period, keep the env var fallback as a tertiary fallback (platform keys → env vars → 403). This prevents a broken deploy if the code ships before keys are configured in the new UI. A follow-up task removes the env var fallback after platform keys are confirmed working.

## Database

### New table: `platform_ai_keys`

Migration: `migrations/0049_platform_ai_keys.sql`

```sql
CREATE TABLE IF NOT EXISTS platform_ai_keys (
    provider TEXT PRIMARY KEY,           -- 'anthropic', 'openai', 'google'
    api_key_encrypted TEXT NOT NULL,     -- AES-GCM encrypted
    is_active INTEGER DEFAULT 0,         -- 1 = this is the default provider
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT                       -- user ID of who last changed it
);
```

- At most one row has `is_active = 1`, enforced transactionally via `db.batch()` (clear all `is_active` + set target in a single atomic batch).
- No `organization_id` — this is a global table, not org-scoped.
- Uses the same `encryptSensitiveData`/`decryptSensitiveData` from `utils/crypto.js` as `org_ai_config`.
- No `rowToX` mapper needed — only 3–4 fields returned, used in two places.

## API Endpoints

All endpoints require `requireOwner()` and use `auditLog()` middleware for writes.

### `GET /api/settings/platform-ai`

Returns current platform AI key status (never returns actual keys).

```json
{
  "keys": {
    "anthropic": { "configured": true, "isActive": true, "updatedAt": "2026-04-13T..." },
    "openai": { "configured": false, "isActive": false, "updatedAt": null },
    "google": { "configured": false, "isActive": false, "updatedAt": null }
  },
  "activeProvider": "anthropic"
}
```

### `PUT /api/settings/platform-ai`

Upsert a provider key and/or set the active provider. Uses `auditLog('update', 'platform_ai_keys')`.

**Request body:**
```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-...",
  "setActive": true
}
```

- `apiKey` is optional — omit to just change active provider without updating the key.
- `setActive: true` clears `is_active` on all rows and sets it on the target, in a single `db.batch()`.
- Validates: `provider` is one of `anthropic`, `openai`, `google`; `apiKey` is a non-empty string of 10–500 characters when provided.

### `DELETE /api/settings/platform-ai/:provider`

Remove a provider's key. Uses `auditLog('delete', 'platform_ai_keys')`. If the deleted provider was active, no provider is active (AI falls back to env vars, then 403).

## Frontend

### Platform Settings — new tab in SettingsPage

The app uses tab-based navigation (not URL routing). Add a "Platform" tab to `SettingsPage.js`, visible only to users with `owner` role. Position it after the existing tabs.

**Tab content:**
- Section header: "AI API Keys"
- Three cards (one per provider), each showing:
  - Provider name and icon
  - Status chip: "Configured" (green) or "Not configured" (grey)
  - "Active" indicator if this is the default provider
  - Text field to enter/update key (masked, like existing AISettings)
  - Save button per provider
- Radio or toggle to select which configured provider is the active default
- Info text explaining that these keys are used for schools with the AI add-on that haven't configured their own key

### SchoolManagement — AI Status

Add `has_ai_key` boolean to the `GET /api/organizations` response via a subquery on `org_ai_config`. This avoids a separate fetch since the org list is already loaded.

In `SchoolReadView.js`, add an "AI" info line to the school detail cards:

- **AI Add-on:** "Active" / "Inactive" (from `ai_addon_active`)
- **Key source:** "Own key (Anthropic)" / "Owner-managed (Anthropic)" / "Not configured"

In `SchoolTable.js`, add an AI status column showing a simple icon/chip.

## Backend Changes

### `src/routes/books.js` — AI suggestions (Path 2)

Replace the env var fallback (lines 686–708) with platform key lookup, keeping env vars as tertiary fallback:

```js
// Path 2: Use owner's platform key
const platformKey = await db
  .prepare('SELECT provider, api_key_encrypted FROM platform_ai_keys WHERE is_active = 1')
  .first();

if (platformKey?.api_key_encrypted) {
  const decryptedKey = await decryptSensitiveData(platformKey.api_key_encrypted, encSecret);
  aiConfig = {
    provider: platformKey.provider,
    apiKey: decryptedKey,
    model: null,
  };
} else {
  // Tertiary fallback: env vars (to be removed after platform keys are confirmed)
  const envProvider = c.env.ANTHROPIC_API_KEY ? 'anthropic'
    : c.env.OPENAI_API_KEY ? 'openai'
    : c.env.GOOGLE_API_KEY ? 'google'
    : null;

  if (!envProvider) {
    throw badRequestError('AI not configured. Contact your administrator.');
  }

  aiConfig = {
    provider: envProvider,
    apiKey: c.env[{ anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', google: 'GOOGLE_API_KEY' }[envProvider]],
    model: null,
  };
}
```

### `src/routes/settings.js` — AI config GET

Update `GET /api/settings/ai` to check platform keys when determining key source:
- `keySource: 'organization'` — school's own key (unchanged value for backward compat)
- `keySource: 'platform'` — owner-managed key (new value, replaces `'environment'`)
- `keySource: 'environment'` — env var fallback (transitional, removed later)
- `keySource: 'none'` — no key available

The `availableProviders` and `envKeys` logic in the GET handler (lines ~200–230) needs to also check `platform_ai_keys` for the active provider, in addition to env vars.

### `src/routes/organization.js` — Org list query

Add `has_ai_key` to the org list response:

```sql
SELECT o.*,
  (SELECT COUNT(*) > 0 FROM org_ai_config WHERE organization_id = o.id AND api_key_encrypted IS NOT NULL) as has_ai_key
FROM organizations o
WHERE o.is_active = 1
```

## Files to Change

| File | Change |
|------|--------|
| `migrations/0049_platform_ai_keys.sql` | New table |
| `src/routes/settings.js` | New platform-ai endpoints, update ai config GET |
| `src/routes/books.js` | Replace env var fallback with platform key lookup |
| `src/routes/organization.js` | Add `has_ai_key` to org list query |
| `src/utils/rowMappers.js` | Add `hasAiKey` to `rowToOrganization` |
| `src/worker.js` | Register platform-ai routes (if separate router) |
| `src/components/SettingsPage.js` | Add "Platform" tab (owner-only) |
| `src/components/PlatformSettings.js` | New component for platform AI key management |
| `src/components/schools/SchoolReadView.js` | Add AI status display |
| `src/components/schools/SchoolTable.js` | Add AI status column |

Post-implementation: update CLAUDE.md file map and `.claude/structure/*.yaml` for new/changed files.

## Testing

- Unit: platform key CRUD, key resolution logic, `is_active` uniqueness
- Integration: AI suggestions with platform key, with org key, with neither; settings/ai GET returns correct keySource for each scenario
- Manual: set platform keys, verify demo site recommendations work, verify school with own key still works
