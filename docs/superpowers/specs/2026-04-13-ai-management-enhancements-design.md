# AI Management Enhancements

**Date**: 2026-04-13
**Status**: Approved

## Problem

Two gaps in the owner's AI management workflow:

1. **No way to toggle AI per school.** The `ai_addon_active` flag on organizations is only set by Stripe webhooks. For testing and demo setup (e.g. enabling AI on the Learnalot demo school), the owner needs a manual override.

2. **No model selection on platform keys.** When a school uses the owner-managed platform key, `model: null` is passed to the AI service, falling back to provider defaults. The owner wants to see available models and pick a specific default.

## Feature 1: AI Toggle Per School

### Backend

Accept `aiAddonActive` as a boolean field in `PUT /api/organization/:id` (owner-only route in `src/routes/organization.js`). When provided, set `ai_addon_active` on the organizations row.

Add it alongside the existing `stringFields` block as a separate boolean field with explicit 0/1 casting. Important: the boolean push to `updates` must happen *before* the existing `if (updates.length === 0)` guard, otherwise a body of `{ aiAddonActive: true }` alone would be rejected as "No valid fields to update".

### Frontend

**SchoolReadView.js**: Replace the static "AI Add-on: Enabled / Not enabled" text with a MUI `Switch` component. Clicking it triggers an immediate API call — no need to enter edit mode. Use pessimistic updates: disable the switch during the API call, only flip it on success, show error feedback on failure.

**SchoolManagement.js**: Add a new `handleToggleAi` callback that:
1. Calls `PUT /api/organization/:id` with `{ aiAddonActive: <newValue> }`
2. Refreshes the school list
3. Updates the selected school in state

Pass this handler through `SchoolDrawer` to `SchoolReadView` as `onToggleAi`.

**SchoolDrawer.js**: Thread the new `onToggleAi` prop to `SchoolReadView`.

## Feature 2: Platform Model Selection

### Database

New migration adds an optional column to the existing table:

```sql
ALTER TABLE platform_ai_keys ADD COLUMN model_preference TEXT;
```

### Backend

**`GET /api/settings/platform-ai`**: Include `modelPreference` in the per-provider response object via `buildPlatformAiResponse`.

**`PUT /api/settings/platform-ai`**: Accept optional `modelPreference` string. Store it alongside the key. When `modelPreference` is explicitly `null` or empty string, clear it (revert to provider default). All three existing SQL branches need updating:
1. `setActive + apiKey` — add `model_preference` to the INSERT/ON CONFLICT upsert
2. `setActive` only — add `model_preference` to the UPDATE
3. `apiKey` only — add `model_preference` to the INSERT/ON CONFLICT upsert

**New `GET /api/settings/platform-ai/models`** (owner-only): Fetch available models using the active platform key. Decrypt the active key, call the existing `fetchProviderModels` helper, return the model list. Returns empty array if no active key.

**`src/routes/books.js` (~line 688)**: When reading the platform key for AI resolution, also SELECT `model_preference` and pass it as `model` in the aiConfig object instead of `null`.

### Frontend

**PlatformSettings.js**: After the active provider radio group, add a model selection section:

- Only visible when an active provider is configured
- On mount and on active provider change, fetch models from `GET /api/settings/platform-ai/models`
- Display a `Select` dropdown with:
  - "Default (provider decides)" as the first option (value: empty string)
  - Fetched models listed by name (in API response order — OpenAI is pre-sorted by recency, others use provider ordering)
- Selecting a model calls `PUT /api/settings/platform-ai` with `{ provider, modelPreference, setActive: true }`
- Loading state while models are being fetched

### Key Resolution Flow (Updated)

```
1. org_ai_config has encrypted key? → Use school's own key + model_preference (Path 1)
2. org.ai_addon_active is true?
   → platform_ai_keys active row → Use platform key + model_preference (Path 2a)
3. Env vars fallback → model: null (Path 2b)
```

## Files Changed

### Backend
- `src/routes/organization.js` — accept `aiAddonActive` in PUT /:id
- `src/routes/settings.js` — model endpoint, model_preference in platform-ai CRUD, update buildPlatformAiResponse
- `src/routes/books.js` — read model_preference from platform key

### Frontend
- `src/components/schools/SchoolReadView.js` — AI toggle switch
- `src/components/schools/SchoolDrawer.js` — thread onToggleAi prop
- `src/components/SchoolManagement.js` — handleToggleAi handler
- `src/components/PlatformSettings.js` — model dropdown section

### Database
- `migrations/0050_platform_ai_model_preference.sql` — add model_preference column

## Out of Scope

- Per-school model override from owner view (schools manage their own model via AISettings)
- Model validation (checking if selected model still exists on provider)
- Caching the model list
