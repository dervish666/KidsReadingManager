# AI Add-on Gating — Design Spec

**Date:** 2026-04-07
**Status:** Approved

## Problem

The AI recommendations feature has no access control linked to the subscription system. Any school with AI technically configured can use it, regardless of whether they've paid for the AI add-on. Schools without any AI configuration see a generic "Not configured" message with no explanation of how to enable it.

## Design

### Access Model

Three paths to AI access:

1. **Paid addon** — `organizations.ai_addon_active = true`. School uses Tally's environment API key.
2. **Bring your own key** — School configures their own API key in Settings > AI Integration (`org_ai_config.api_key_encrypted` exists, `keySource = 'organization'`). No subscription required.
3. **No AI** — Neither of the above. AI features are gated.

Schools with their own key bypass subscription checks entirely — they're using their own credits.

### Changes

#### 1. Backend — `GET /api/settings/ai` (src/routes/settings.js)

Add `aiAddonActive` (boolean) to the response payload. Read from `organizations.ai_addon_active` for the current org (line ~170). This endpoint already returns `keySource` and `hasApiKey`, so the frontend has everything it needs.

Legacy mode (no `organizations` table): `aiAddonActive` is always `true` — environment keys work as before, no gating.

#### 2. Frontend — BookRecommendations.js

Replace the `hasActiveAI` derivation (currently line 404):

```js
// Before:
const hasActiveAI = aiConfig?.hasApiKey || aiConfig?.keySource === 'environment';

// After:
const hasActiveAI = aiConfig?.keySource === 'organization' ||
  (aiConfig?.keySource === 'environment' && aiConfig?.aiAddonActive);
```

This single change propagates to all downstream UI:
- The AI status chip (lines 429-447) — shows provider or "Not configured"
- The "Ask AI" banner after library results (line ~1146) — conditional on `hasActiveAI`
- The "not configured" banner (line ~1188) — conditional on `!hasActiveAI`

Update the "not configured" message copy to be informational:

> "AI recommendations require an API key. Your school admin can configure their own API key in Settings, or contact Tally Reading to enable the AI add-on."

Warm, informational tone. No upsell language. Teachers seeing this likely can't change it themselves.

#### 3. Backend enforcement — AI suggestions endpoint (src/routes/books.js)

**Two changes needed:**

**a) Gating check** — before the existing `org_ai_config` query (line 643), check access:

- If org has its own API key in `org_ai_config` → allow (existing path)
- If `organizations.ai_addon_active === true` → allow, fall through to key resolution
- Otherwise → return 403 with message: "AI recommendations are not enabled for this organisation"

**b) Environment key resolution** — currently (line 654) the endpoint fails with "AI not configured" if `org_ai_config` has no row or no `api_key_encrypted`. For the paid addon path, add fallback logic:

When `ai_addon_active === true` and no org key exists, construct `aiConfig` from environment variables:

```js
aiConfig = {
  provider: envProvider,  // first available: anthropic > openai > google
  apiKey: c.env[envKeyName],
  model: null,  // use provider default
};
```

This bypasses the `org_ai_config.is_enabled` check for the environment key path — the subscription is the authorisation, and new schools may never have visited the AI settings page.

### What doesn't change

- Schools with their own API key — completely unaffected
- Schools with the AI addon active — completely unaffected
- "Find in Library" button — always available, no gating
- No new components, modals, or paywall screens
- No changes to AI settings page or billing flow
- `src/services/aiService.js` — already accepts an `apiKey` param, agnostic to source

### Files Modified

| File | Change |
|------|--------|
| `src/routes/settings.js` | Add `aiAddonActive` to GET /api/settings/ai response |
| `src/routes/books.js` | Add addon gating check + environment key fallback |
| `src/components/BookRecommendations.js` | Update `hasActiveAI` derivation, update message copy |
