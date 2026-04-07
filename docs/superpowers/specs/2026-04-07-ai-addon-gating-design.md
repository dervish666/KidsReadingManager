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

Add `aiAddonActive` (boolean) to the response payload. Read from `organizations.ai_addon_active` for the current org. This endpoint already returns `keySource` and `hasApiKey`, so the frontend has everything it needs.

#### 2. Frontend — BookRecommendations.js

On clicking "AI Suggestions", check the AI config state before making the API call:

- If `keySource === 'organization'` → proceed (own key, always allowed)
- If `keySource === 'environment'` AND `aiAddonActive === true` → proceed (paid addon)
- Otherwise → show inline message instead of calling the API

The inline message replaces the recommendations area (not a modal, not a banner — just content where results would appear):

> "AI recommendations require an API key. Your school admin can either enable the AI add-on in billing, or configure their own API key in Settings > AI Integration."

Warm, informational tone. No upsell language. Teachers seeing this likely can't change it themselves.

#### 3. Backend enforcement — AI suggestions endpoint (src/routes/books.js)

Defence in depth: before calling the AI service, check whether the request is authorised:

- If org has its own API key (`keySource === 'organization'`) → allow
- If `ai_addon_active === true` on the org → allow (using environment key)
- Otherwise → return 403 with message: "AI recommendations are not enabled for this organisation"

This prevents direct API calls from bypassing the frontend gate.

### What doesn't change

- Schools with their own API key — completely unaffected
- Schools with the AI addon active — completely unaffected
- "Find in Library" button — always available, no gating
- No new components, modals, or paywall screens
- No changes to AI settings page or billing flow

### Files Modified

| File | Change |
|------|--------|
| `src/routes/settings.js` | Add `aiAddonActive` to GET /api/settings/ai response |
| `src/routes/books.js` | Add addon check before AI service call |
| `src/components/BookRecommendations.js` | Gate AI button click, show inline message |
