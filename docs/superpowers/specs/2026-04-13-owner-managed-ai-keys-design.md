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

The env var fallback (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`) is removed entirely. All keys live in D1.

## Database

### New table: `platform_ai_keys`

```sql
CREATE TABLE IF NOT EXISTS platform_ai_keys (
    provider TEXT PRIMARY KEY,           -- 'anthropic', 'openai', 'google'
    api_key_encrypted TEXT NOT NULL,     -- AES-GCM encrypted
    is_active INTEGER DEFAULT 0,         -- 1 = this is the default provider
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT                       -- user ID of who last changed it
);
```

- At most one row has `is_active = 1` (enforced in application code on save).
- No `organization_id` — this is a global table, not org-scoped.
- Uses the same `encryptSensitiveData`/`decryptSensitiveData` from `utils/crypto.js` as `org_ai_config`.

## API Endpoints

All endpoints require `requireOwner()`.

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

Upsert a provider key and/or set the active provider.

**Request body:**
```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-...",
  "setActive": true
}
```

- `apiKey` is optional — omit to just change active provider without updating the key.
- `setActive: true` sets this provider as active and clears `is_active` on others.
- Validates `provider` is one of `anthropic`, `openai`, `google`.

### `DELETE /api/settings/platform-ai/:provider`

Remove a provider's key. If the deleted provider was active, no provider is active (AI falls back to 403 for owner-managed schools until another is set active).

## Frontend

### Platform Settings Page

New route: `/platform` (owner-only, guarded by role check).

**UI:**
- Header: "Platform Settings"
- Section: "AI API Keys"
- Three cards (one per provider), each showing:
  - Provider name and icon
  - Status chip: "Configured" (green) or "Not configured" (grey)
  - "Active" indicator if this is the default provider
  - Text field to enter/update key (masked, like existing AISettings)
  - Save button per provider
- Radio or toggle to select which configured provider is the active default
- Info text explaining that these keys are used for schools with the AI add-on that haven't configured their own key

**Navigation:** Add "Platform" link in Header, visible only to owner role.

### SchoolManagement — AI Status

In the existing `SchoolReadView.js`, add an "AI" info line to the school detail cards:

- **AI Add-on:** "Active" / "Inactive" (from `ai_addon_active`)
- **Key source:** "Own key (Anthropic)" / "Owner-managed (Anthropic)" / "Not configured"

This reads from data already available — `ai_addon_active` from the org, and existence of `org_ai_config` for that org. The owner can see at a glance whether each school is using their own key or the platform key.

In `SchoolTable.js`, add an AI status column showing a simple icon/chip.

## Backend Changes

### `src/routes/books.js` — AI suggestions (Path 2)

Replace the env var fallback (lines 686–708) with:

```js
// Path 2: Use owner's platform key
const platformKey = await db
  .prepare('SELECT provider, api_key_encrypted FROM platform_ai_keys WHERE is_active = 1')
  .first();

if (!platformKey?.api_key_encrypted) {
  throw badRequestError('AI not configured. Contact your administrator.');
}

const decryptedKey = await decryptSensitiveData(platformKey.api_key_encrypted, encSecret);
aiConfig = {
  provider: platformKey.provider,
  apiKey: decryptedKey,
  model: null,
};
```

### `src/routes/settings.js` — AI config GET

Update the `GET /api/settings/ai` response to indicate key source more accurately:
- `keySource: 'org'` — school's own key
- `keySource: 'platform'` — owner-managed key
- `keySource: 'none'` — no key available

Remove references to env var key detection.

### Env var cleanup

After this ships, the `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `GOOGLE_API_KEY` Worker secrets can be removed. The migration path is: set up platform keys in the new UI, verify they work, then `wrangler secret delete` the old env vars.

## SchoolManagement Data

The `GET /api/organizations` response (used by SchoolManagement) already includes `ai_addon_active`. To show key source, either:
- Add `has_org_ai_key` to the org query (a `LEFT JOIN` or subquery on `org_ai_config`)
- Or fetch it client-side when the school drawer opens (simpler, already loads school detail)

Recommend the latter — the drawer already makes detail requests, and this avoids changing the list query.

## Files to Change

| File | Change |
|------|--------|
| `migrations/0048_platform_ai_keys.sql` | New table |
| `src/routes/settings.js` | New platform-ai endpoints, update ai config GET |
| `src/routes/books.js` | Replace env var fallback with platform key lookup |
| `src/worker.js` | Register platform-ai routes |
| `src/components/PlatformSettings.js` | New page (owner-only) |
| `src/components/Header.js` | Add Platform nav link for owner |
| `src/components/schools/SchoolReadView.js` | Add AI status display |
| `src/components/schools/SchoolTable.js` | Add AI status column |
| `src/components/schools/SchoolDrawer.js` | Fetch org_ai_config existence |
| `src/App.js` | Add /platform route |

## Testing

- Unit: platform key CRUD, key resolution logic
- Integration: AI suggestions with platform key, with org key, with no key
- Manual: set platform keys, verify demo site recommendations work, verify school with own key still works
