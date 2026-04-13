# AI Management Enhancements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add owner-toggleable AI addon per school and platform-level model selection with dropdown.

**Architecture:** Two independent features sharing the platform AI infrastructure. Feature 1 adds a boolean field to the org update endpoint and a Switch in SchoolReadView. Feature 2 adds a `model_preference` column to `platform_ai_keys`, a models-fetch endpoint, and a Select dropdown in PlatformSettings.

**Tech Stack:** Hono (backend), D1/SQLite (database), React 19 + MUI v7 (frontend), Vitest (testing)

**Spec:** `docs/superpowers/specs/2026-04-13-ai-management-enhancements-design.md`

---

## Chunk 1: Feature 1 — AI Toggle Per School

### Task 1: Backend — Accept aiAddonActive in PUT /api/organization/:id

**Files:**
- Modify: `src/routes/organization.js:721-799`
- Test: `src/__tests__/integration/organization.test.js`

- [ ] **Step 1: Write the failing test**

Add to the `PUT /api/organization/:id` describe block in `src/__tests__/integration/organization.test.js`:

```javascript
it('should update ai_addon_active when aiAddonActive is provided', async () => {
  const mockOrg = createMockOrganization({ ai_addon_active: 1 });
  let callCount = 0;
  const mockDb = createMockDB();

  mockDb.prepare = vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ id: 'org-123' }); // exists check
      return Promise.resolve(mockOrg);
    }),
    run: vi.fn().mockResolvedValue({ success: true }),
  });

  const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

  const response = await app.request('/api/organization/org-123', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aiAddonActive: true }),
  });
  const data = await response.json();

  expect(response.status).toBe(200);
  expect(data.message).toBe('Organization updated successfully');
});

it('should accept aiAddonActive=false as the only field', async () => {
  const mockOrg = createMockOrganization({ ai_addon_active: 0 });
  let callCount = 0;
  const mockDb = createMockDB();

  mockDb.prepare = vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ id: 'org-123' });
      return Promise.resolve(mockOrg);
    }),
    run: vi.fn().mockResolvedValue({ success: true }),
  });

  const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

  const response = await app.request('/api/organization/org-123', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aiAddonActive: false }),
  });

  expect(response.status).toBe(200);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/integration/organization.test.js --testNamePattern="aiAddonActive"`
Expected: FAIL — `{ aiAddonActive: true }` alone hits the "No valid fields to update" guard

- [ ] **Step 3: Implement — add aiAddonActive handling in PUT /:id**

In `src/routes/organization.js`, in the `PUT /:id` handler (~line 727), add `aiAddonActive` to the destructured body, then add handling **before** the `stringFields` loop and **before** the empty-check guard:

```javascript
// Line 727: add aiAddonActive to destructure
const { name, contactEmail, billingEmail, phone, addressLine1, addressLine2, town, postcode, aiAddonActive } =
  body;

// After the stringFields loop (after line 763), before the empty-check guard (line 765):
if (aiAddonActive !== undefined) {
  updates.push('ai_addon_active = ?');
  params.push(aiAddonActive ? 1 : 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/integration/organization.test.js --testNamePattern="aiAddonActive"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/organization.js src/__tests__/integration/organization.test.js
git commit -m "feat: accept aiAddonActive in PUT /api/organization/:id"
```

---

### Task 2: Frontend — AI toggle switch in SchoolReadView

**Files:**
- Modify: `src/components/schools/SchoolReadView.js`
- Modify: `src/components/schools/SchoolDrawer.js`
- Modify: `src/components/SchoolManagement.js`

- [ ] **Step 1: Add onToggleAi handler to SchoolManagement.js**

Add a new callback after the existing `handleDeactivate` (~line 304):

```javascript
const handleToggleAi = useCallback(async (newValue) => {
  setSaving(true);
  setError(null);
  try {
    const res = await fetchWithAuth(`/api/organization/${selectedSchool.id}`, {
      method: 'PUT',
      body: JSON.stringify({ aiAddonActive: newValue }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to update AI status');
    }
    const newSchools = await fetchSchools();
    const updatedSchool = newSchools.find((s) => s.id === selectedSchool.id);
    if (updatedSchool) setSelectedSchool(updatedSchool);
    setSuccess(`AI ${newValue ? 'enabled' : 'disabled'} for ${selectedSchool.name}`);
  } catch (err) {
    setError(err.message || 'Failed to update AI status');
  } finally {
    setSaving(false);
  }
}, [selectedSchool, fetchWithAuth, fetchSchools]);
```

Pass it to `SchoolDrawer`:

```jsx
<SchoolDrawer
  ...existing props...
  onToggleAi={handleToggleAi}
/>
```

- [ ] **Step 2: Thread onToggleAi and loading through SchoolDrawer.js**

Add `onToggleAi` and `loading` to the props destructure at line 19, and pass them to `SchoolReadView` at line 76:

```jsx
const SchoolDrawer = ({
  ...existing props...,
  onToggleAi,
}) => {
```

```jsx
<SchoolReadView
  school={school}
  onEdit={onEdit}
  onSync={onSync}
  onStartTrial={onStartTrial}
  onOpenPortal={onOpenPortal}
  onDeactivate={handleDeactivateClick}
  onToggleAi={onToggleAi}
  loading={loading}
/>
```

- [ ] **Step 3: Replace static AI Add-on text with Switch in SchoolReadView.js**

Add `Switch` to the MUI imports at line 1:

```javascript
import { Box, Typography, Chip, Button, Divider, Alert, Switch } from '@mui/material';
```

Update the `SchoolReadView` component props to accept `onToggleAi` and `loading`:

```javascript
const SchoolReadView = ({ school, onEdit, onSync, onStartTrial, onOpenPortal, onDeactivate, onToggleAi, loading }) => {
```

Replace the AI Add-on `LabelValue` at line 154 with a Switch. Use pessimistic updates: disable the switch during the API call (the `loading` prop from SchoolManagement's `saving` state):

```jsx
<LabelValue
  label="AI Add-on"
  value={
    <Switch
      checked={school.aiAddonActive}
      onChange={(e) => onToggleAi(e.target.checked)}
      disabled={loading}
      size="small"
    />
  }
/>
```

Keep the existing AI Key chip display that follows (lines 155-176) — it should still show "Own key" / "Owner-managed" when AI is active.

- [ ] **Step 4: Test manually in browser**

1. Run `npm run start:dev`
2. Log in as owner
3. Go to School Management, click a school
4. Toggle the AI switch on → should show success message, table AI column updates
5. Toggle off → should show disabled, table shows "—"

- [ ] **Step 5: Commit**

```bash
git add src/components/schools/SchoolReadView.js src/components/schools/SchoolDrawer.js src/components/SchoolManagement.js
git commit -m "feat: AI toggle switch in school management drawer"
```

---

## Chunk 2: Feature 2 — Platform Model Selection

### Task 3: Database migration — add model_preference column

**Files:**
- Create: `migrations/0050_platform_ai_model_preference.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Migration 0050: Add model preference to platform AI keys
-- Allows owner to select a default model per provider

ALTER TABLE platform_ai_keys ADD COLUMN model_preference TEXT;
```

- [ ] **Step 2: Apply locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration 0050 applied successfully

- [ ] **Step 3: Commit**

```bash
git add migrations/0050_platform_ai_model_preference.sql
git commit -m "migration: add model_preference to platform_ai_keys"
```

---

### Task 4: Backend — model_preference in platform-ai CRUD + models endpoint

**Files:**
- Modify: `src/routes/settings.js:567-704`
- Test: `src/__tests__/integration/platformAiKeys.test.js` (has crypto mocks for encrypt/decrypt)

- [ ] **Step 1: Update existing assertions in platformAiKeys.test.js**

The `buildPlatformAiResponse` change adds `modelPreference` to every provider entry. Update existing `.toEqual()` assertions that check the exact shape. In `src/__tests__/integration/platformAiKeys.test.js`:

At lines 133-147 (empty keys test), update each expected object to include `modelPreference: null`:
```javascript
expect(data.keys.anthropic).toEqual({
  configured: false,
  isActive: false,
  updatedAt: null,
  modelPreference: null,
});
// Same for openai and google entries
```

At lines 183-191 (configured keys test), add `modelPreference: null` to assertions that use `.toEqual()` for provider objects, or switch those to use individual property checks (`.toBe()`/`.toBeNull()`).

- [ ] **Step 2: Write new failing tests**

Add to `src/__tests__/integration/platformAiKeys.test.js`, in a new describe block:

```javascript
describe('Platform AI Keys - Model Preference', () => {
  it('GET /api/settings/platform-ai should include modelPreference in response', async () => {
    const { app, mockDB } = createTestApp({
      userId: 'user-owner',
      organizationId: 'org-owner',
      userRole: 'owner',
    });

    mockDB._chain.all.mockResolvedValue({
      results: [
        {
          provider: 'anthropic',
          api_key_encrypted: 'enc-key',
          is_active: 1,
          model_preference: 'claude-sonnet-4-6',
          updated_at: '2026-04-13',
        },
      ],
      success: true,
    });

    const response = await makeRequest(app, 'GET', '/api/settings/platform-ai');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.keys.anthropic.modelPreference).toBe('claude-sonnet-4-6');
    expect(data.keys.openai.modelPreference).toBeNull();
  });

  it('PUT /api/settings/platform-ai should store modelPreference', async () => {
    const { app, mockDB } = createTestApp({
      userId: 'user-owner',
      organizationId: 'org-owner',
      userRole: 'owner',
    });

    mockDB._chain.all.mockResolvedValue({
      results: [
        {
          provider: 'anthropic',
          api_key_encrypted: 'enc-key',
          is_active: 1,
          model_preference: 'claude-sonnet-4-6',
          updated_at: '2026-04-13',
        },
      ],
      success: true,
    });

    const response = await makeRequest(app, 'PUT', '/api/settings/platform-ai', {
      provider: 'anthropic',
      apiKey: 'sk-ant-test-key-1234567890',
      setActive: true,
      modelPreference: 'claude-sonnet-4-6',
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    // Verify the SQL included model_preference
    const prepareCalls = mockDB.prepare.mock.calls;
    const upsertCall = prepareCalls.find((c) => c[0].includes('model_preference'));
    expect(upsertCall).toBeDefined();
  });

  it('GET /api/settings/platform-ai/models should return models for active provider', async () => {
    const { app, mockDB } = createTestApp({
      userId: 'user-owner',
      organizationId: 'org-owner',
      userRole: 'owner',
    });

    mockDB._chain.first.mockResolvedValue({
      provider: 'anthropic',
      api_key_encrypted: 'enc-key',
      is_active: 1,
    });

    // Mock global fetch for the Anthropic models API
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' },
            { id: 'claude-haiku-4-5-20251001', display_name: 'Claude Haiku 4.5' },
          ],
        }),
    });

    try {
      const response = await makeRequest(app, 'GET', '/api/settings/platform-ai/models');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.models).toHaveLength(2);
      expect(data.models[0].id).toBe('claude-sonnet-4-6');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('GET /api/settings/platform-ai/models should return empty when no active key', async () => {
    const { app, mockDB } = createTestApp({
      userId: 'user-owner',
      organizationId: 'org-owner',
      userRole: 'owner',
    });

    mockDB._chain.first.mockResolvedValue(null);

    const response = await makeRequest(app, 'GET', '/api/settings/platform-ai/models');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.models).toEqual([]);
  });
});
```

- [ ] **Step 3: Run tests to verify new tests fail and updated assertions still fail**

Run: `npx vitest run src/__tests__/integration/platformAiKeys.test.js --testNamePattern="Model Preference"`
Expected: FAIL — modelPreference not in response, /platform-ai/models route not found

- [ ] **Step 4: Update buildPlatformAiResponse to include modelPreference**

In `src/routes/settings.js`, update `buildPlatformAiResponse` (~line 567):

```javascript
function buildPlatformAiResponse(rows) {
  const keys = {};
  let activeProvider = null;

  for (const provider of VALID_AI_PROVIDERS) {
    const row = rows.find((r) => r.provider === provider);
    keys[provider] = {
      configured: Boolean(row?.api_key_encrypted),
      isActive: Boolean(row?.is_active),
      updatedAt: row?.updated_at || null,
      modelPreference: row?.model_preference || null,
    };
    if (row?.is_active) {
      activeProvider = provider;
    }
  }

  return { keys, activeProvider };
}
```

- [ ] **Step 5: Update PUT /api/settings/platform-ai — all three SQL branches**

In the PUT handler (~line 602), determine whether `modelPreference` was explicitly provided and resolve its value:

```javascript
const { provider, apiKey, setActive } = body;
const modelPrefProvided = 'modelPreference' in body;
const modelPrefValue = modelPrefProvided ? (body.modelPreference || null) : undefined;
```

Three cases: `modelPreference` not in body → preserve existing DB value. `modelPreference` is `null`/`''` → clear to NULL. `modelPreference` is a string → store it. We use conditional SQL (include `model_preference` column only when provided) to handle this cleanly:

Then in each branch, conditionally add `model_preference`:

**Branch 1** (setActive + apiKey):
```javascript
const upsertSql = modelPrefProvided
  ? `INSERT INTO platform_ai_keys (provider, api_key_encrypted, is_active, model_preference, updated_at, updated_by)
     VALUES (?, ?, 1, ?, datetime("now"), ?)
     ON CONFLICT(provider) DO UPDATE SET
       api_key_encrypted = excluded.api_key_encrypted,
       is_active = excluded.is_active,
       model_preference = excluded.model_preference,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`
  : `INSERT INTO platform_ai_keys (provider, api_key_encrypted, is_active, updated_at, updated_by)
     VALUES (?, ?, 1, datetime("now"), ?)
     ON CONFLICT(provider) DO UPDATE SET
       api_key_encrypted = excluded.api_key_encrypted,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`;

const upsertStmt = modelPrefProvided
  ? db.prepare(upsertSql).bind(provider, encrypted, modelPrefValue, userId)
  : db.prepare(upsertSql).bind(provider, encrypted, userId);
```

**Branch 2** (setActive only, ~line 646):
```javascript
const activateSql = modelPrefProvided
  ? `UPDATE platform_ai_keys SET is_active = 1, model_preference = ?, updated_at = datetime("now"), updated_by = ? WHERE provider = ?`
  : `UPDATE platform_ai_keys SET is_active = 1, updated_at = datetime("now"), updated_by = ? WHERE provider = ?`;

const activateStmt = modelPrefProvided
  ? db.prepare(activateSql).bind(modelPrefValue, userId, provider)
  : db.prepare(activateSql).bind(userId, provider);
```

**Branch 3** (apiKey only, ~line 659):
```javascript
const storeSql = modelPrefProvided
  ? `INSERT INTO platform_ai_keys (provider, api_key_encrypted, is_active, model_preference, updated_at, updated_by)
     VALUES (?, ?, 0, ?, datetime("now"), ?)
     ON CONFLICT(provider) DO UPDATE SET
       api_key_encrypted = excluded.api_key_encrypted,
       is_active = excluded.is_active,
       model_preference = excluded.model_preference,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`
  : `INSERT INTO platform_ai_keys (provider, api_key_encrypted, is_active, updated_at, updated_by)
     VALUES (?, ?, 0, datetime("now"), ?)
     ON CONFLICT(provider) DO UPDATE SET
       api_key_encrypted = excluded.api_key_encrypted,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`;

const bindArgs = modelPrefProvided
  ? [provider, encrypted, modelPrefValue, userId]
  : [provider, encrypted, userId];
await db.prepare(storeSql).bind(...bindArgs).run();
```

- [ ] **Step 6: Add GET /api/settings/platform-ai/models endpoint**

Add before the DELETE endpoint (~line 684 in settings.js):

```javascript
/**
 * GET /api/settings/platform-ai/models
 * Fetch available models using the active platform key.
 */
settingsRouter.get('/platform-ai/models', requireOwner(), async (c) => {
  const db = getDB(c.env);

  const activeKey = await db
    .prepare('SELECT provider, api_key_encrypted FROM platform_ai_keys WHERE is_active = 1')
    .first();

  if (!activeKey?.api_key_encrypted) {
    return c.json({ models: [] });
  }

  const encSecret = getEncryptionSecret(c.env);
  if (!encSecret) {
    return c.json({ models: [] });
  }

  let apiKey;
  try {
    apiKey = await decryptSensitiveData(activeKey.api_key_encrypted, encSecret);
  } catch {
    return c.json({ models: [] });
  }

  try {
    const models = await fetchProviderModels(activeKey.provider, apiKey);
    return c.json({ models: models || [] });
  } catch {
    return c.json({ models: [] });
  }
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/integration/platformAiKeys.test.js`
Expected: ALL tests pass (both new and updated existing assertions)

- [ ] **Step 8: Commit**

```bash
git add src/routes/settings.js src/__tests__/integration/platformAiKeys.test.js
git commit -m "feat: platform AI model preference CRUD + models endpoint"
```

---

### Task 5: Backend — Use platform model_preference in AI resolution

**Files:**
- Modify: `src/routes/books.js:687-698`

- [ ] **Step 1: Update platform key SELECT to include model_preference**

In `src/routes/books.js` (~line 687), change:

```javascript
const platformKey = await db
  .prepare('SELECT provider, api_key_encrypted FROM platform_ai_keys WHERE is_active = 1')
  .first();
```

to:

```javascript
const platformKey = await db
  .prepare('SELECT provider, api_key_encrypted, model_preference FROM platform_ai_keys WHERE is_active = 1')
  .first();
```

- [ ] **Step 2: Pass model_preference to aiConfig**

Change line ~697 from:

```javascript
model: null,
```

to:

```javascript
model: platformKey.model_preference || null,
```

- [ ] **Step 3: Run existing tests to ensure no regressions**

Run: `npx vitest run src/__tests__/ --reporter=verbose`
Expected: All existing tests pass

- [ ] **Step 4: Commit**

```bash
git add src/routes/books.js
git commit -m "feat: use platform model_preference in AI resolution"
```

---

### Task 6: Frontend — Model dropdown in PlatformSettings

**Files:**
- Modify: `src/components/PlatformSettings.js`

- [ ] **Step 1: Add state and fetch logic for models**

Add new state variables and a fetch function after the existing state declarations (~line 45):

```javascript
const [models, setModels] = useState([]);
const [loadingModels, setLoadingModels] = useState(false);
const [selectedModel, setSelectedModel] = useState('');

const fetchModels = useCallback(async () => {
  setLoadingModels(true);
  try {
    const response = await fetchWithAuth(`${API_URL}/settings/platform-ai/models`);
    if (response.ok) {
      const data = await response.json();
      setModels(data.models || []);
    }
  } catch (error) {
    console.error('Error fetching models:', error);
  } finally {
    setLoadingModels(false);
  }
}, [fetchWithAuth]);
```

- [ ] **Step 2: Fetch models when active provider changes and set selectedModel from keys**

Add a useEffect that triggers on `activeProvider` and `keys` changes:

```javascript
// Set selected model from current key state
useEffect(() => {
  if (activeProvider && keys[activeProvider]) {
    setSelectedModel(keys[activeProvider].modelPreference || '');
  } else {
    setSelectedModel('');
  }
}, [activeProvider, keys]);

// Fetch models when active provider changes (not on every keys update to avoid re-fetch after model save)
useEffect(() => {
  if (activeProvider) {
    fetchModels();
  } else {
    setModels([]);
  }
}, [activeProvider, fetchModels]);
```

- [ ] **Step 3: Add model save handler**

```javascript
const handleModelChange = async (newModel) => {
  setSelectedModel(newModel);
  try {
    const response = await fetchWithAuth(`${API_URL}/settings/platform-ai`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: activeProvider,
        setActive: true,
        modelPreference: newModel || null,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update model');
    }

    const data = await response.json();
    setKeys(data.keys || {});
    setActiveProvider(data.activeProvider || null);
    showFeedback('success', `Default model updated.`);
  } catch (error) {
    console.error('Error updating model:', error);
    showFeedback('error', `Failed to update model. ${error.message}`);
    // Revert selection on failure
    if (activeProvider && keys[activeProvider]) {
      setSelectedModel(keys[activeProvider].modelPreference || '');
    }
  }
};
```

- [ ] **Step 4: Add model Select UI after the active provider RadioGroup**

After the closing `</FormControl>` for the active provider section (~line 364), add:

```jsx
{/* Default model selection */}
{activeProvider && keys[activeProvider]?.configured && (
  <>
    <Divider sx={{ my: 3 }} />

    <Box>
      <Typography
        variant="subtitle1"
        sx={{
          fontWeight: 700,
          fontFamily: '"Nunito", sans-serif',
          mb: 1,
        }}
      >
        Default Model
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        The default model used for AI recommendations. Leave as "Default" to use the
        provider's standard model.
      </Typography>

      {loadingModels ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Loading available models...
          </Typography>
        </Box>
      ) : (
        <FormControl fullWidth size="small">
          <InputLabel>Model</InputLabel>
          <Select
            value={selectedModel}
            label="Model"
            onChange={(e) => handleModelChange(e.target.value)}
          >
            <MenuItem value="">
              <em>Default (provider decides)</em>
            </MenuItem>
            {models.map((model) => (
              <MenuItem key={model.id} value={model.id}>
                {model.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
    </Box>
  </>
)}
```

Add the required MUI imports at the top of the file (add `Select`, `MenuItem`, `InputLabel`, `FormControl` — note: `FormControl` and `FormLabel` are already imported, but add `Select`, `MenuItem`, `InputLabel`):

```javascript
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  Stack,
  IconButton,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  Tooltip,
  Select,
  MenuItem,
  InputLabel,
} from '@mui/material';
```

- [ ] **Step 5: Test manually in browser**

1. Run `npm run start:dev`
2. Log in as owner
3. Go to Platform Settings
4. Save an API key for a provider and set it as active
5. Model dropdown should appear with "Loading..." then populated options
6. Select a model → success feedback
7. Select "Default (provider decides)" → clears the model preference
8. Switch active provider → dropdown updates with new provider's models

- [ ] **Step 6: Commit**

```bash
git add src/components/PlatformSettings.js
git commit -m "feat: model selection dropdown in Platform Settings"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: End-to-end smoke test**

1. Start dev server: `npm run start:dev`
2. Log in as owner
3. Platform Settings: save Anthropic key, set active, pick a model from dropdown
4. School Management: click Learnalot → toggle AI switch on → verify "Platform" chip in table
5. Switch to Learnalot context → try AI recommendations → should use the platform key + model
