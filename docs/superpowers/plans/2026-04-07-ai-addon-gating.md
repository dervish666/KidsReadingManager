# AI Add-on Gating Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate AI recommendations behind either a paid subscription addon or a school's own API key.

**Architecture:** Three-file change. Backend settings endpoint exposes `aiAddonActive`. Backend AI endpoint adds environment key fallback for addon subscribers. Frontend derives `hasActiveAI` from subscription + key source and shows an informational message when neither path is available.

**Tech Stack:** Hono routes, React 19, MUI v7, Vitest integration tests

**Spec:** `docs/superpowers/specs/2026-04-07-ai-addon-gating-design.md`

---

## Task 1: Backend — Add `aiAddonActive` to settings response

**Files:**
- Modify: `src/routes/settings.js:159-207`
- Test: `src/__tests__/integration/settings.test.js`

- [ ] **Step 1: Write failing test — aiAddonActive in multi-tenant response**

Add to `settings.test.js` in the `GET /api/settings/ai` describe block:

```js
it('should include aiAddonActive from organization record', async () => {
  const { app, mockDB } = createTestApp({
    organizationId: 'org-123',
    userRole: 'teacher',
    userId: 'user-123',
    anthropicKey: 'test-key',
  });

  // First call: org_ai_config query
  mockDB._chain.first.mockResolvedValueOnce({
    provider: 'anthropic',
    api_key_encrypted: 'encrypted-key',
    model_preference: null,
    is_enabled: 1,
  });
  // Second call: organization ai_addon_active query
  mockDB._chain.first.mockResolvedValueOnce({ ai_addon_active: 1 });

  const response = await makeRequest(app, 'GET', '/api/settings/ai');
  const data = await response.json();

  expect(response.status).toBe(200);
  expect(data.aiAddonActive).toBe(true);
});

it('should return aiAddonActive false when addon not active', async () => {
  const { app, mockDB } = createTestApp({
    organizationId: 'org-123',
    userRole: 'teacher',
    userId: 'user-123',
    anthropicKey: 'test-key',
  });

  mockDB._chain.first.mockResolvedValueOnce({
    provider: 'anthropic',
    api_key_encrypted: 'encrypted-key',
    model_preference: null,
    is_enabled: 1,
  });
  // Organization has ai_addon_active = 0
  mockDB._chain.first.mockResolvedValueOnce({ ai_addon_active: 0 });

  const response = await makeRequest(app, 'GET', '/api/settings/ai');
  const data = await response.json();

  expect(response.status).toBe(200);
  expect(data.aiAddonActive).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/integration/settings.test.js --testNamePattern="aiAddonActive" -v`
Expected: FAIL — `aiAddonActive` not present in response

- [ ] **Step 3: Implement — add org query and aiAddonActive to response**

In `src/routes/settings.js`, inside the `settingsRouter.get('/ai', ...)` handler, after the `org_ai_config` query (line 174), add a query for the org's addon status:

```js
// After line 174 (the org_ai_config query):
const org = await db.prepare(
  'SELECT ai_addon_active FROM organizations WHERE id = ?'
).bind(organizationId).first();
const aiAddonActive = Boolean(org?.ai_addon_active);
```

Then add `aiAddonActive` to the JSON response object (line 179-192):

```js
return c.json({
  provider: activeProvider,
  modelPreference: config?.model_preference || null,
  isEnabled: Boolean(config?.is_enabled),
  hasApiKey: hasOrgKey,
  availableProviders: { ... },
  keySource: hasOrgKey ? 'organization' : (envKeys[activeProvider] ? 'environment' : 'none'),
  aiAddonActive,
});
```

For legacy mode (line 199-206), add `aiAddonActive: true` — no gating in legacy mode.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/integration/settings.test.js -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings.js src/__tests__/integration/settings.test.js
git commit -m "feat: add aiAddonActive to GET /api/settings/ai response"
```

---

## Task 2: Backend — Add addon gating + environment key fallback to AI endpoint

**Files:**
- Modify: `src/routes/books.js:643-672`
- Test: `src/__tests__/integration/books.test.js`

- [ ] **Step 1: Write failing tests — addon gating and env key fallback**

Add to `books.test.js` in the `GET /api/books/ai-suggestions` > `AI configuration checks` describe block:

```js
it('should return 403 when no org key and ai_addon_active is false', async () => {
  const { app, mockDB } = createTestApp(createUserContext({ userRole: 'readonly' }));

  mockDB._chain.first
    .mockResolvedValueOnce({ processing_restricted: 0, ai_opt_out: 0 })
    .mockResolvedValueOnce(createMockStudent())
    // AI config: no org key
    .mockResolvedValueOnce(null)
    // Organization: addon not active
    .mockResolvedValueOnce({ ai_addon_active: 0 });

  mockDB._chain.all.mockResolvedValue({ results: [], success: true });

  const response = await makeRequest(app, 'GET', '/api/books/ai-suggestions?studentId=student-123');
  expect(response.status).toBe(403);
  const data = await response.json();
  expect(data.message).toContain('not enabled');
});

it('should allow access when ai_addon_active is true and env key exists', async () => {
  const { app, mockDB } = createTestApp({
    ...createUserContext({ userRole: 'readonly' }),
    env: { ANTHROPIC_API_KEY: 'env-test-key' },
  });

  mockDB._chain.first
    .mockResolvedValueOnce({ processing_restricted: 0, ai_opt_out: 0 })
    .mockResolvedValueOnce(createMockStudent())
    // AI config: no org key
    .mockResolvedValueOnce(null)
    // Organization: addon active
    .mockResolvedValueOnce({ ai_addon_active: 1 });

  // Mock remaining queries (sessions, books, genres for profile building)
  mockDB._chain.all.mockResolvedValue({ results: [], success: true });

  const response = await makeRequest(app, 'GET', '/api/books/ai-suggestions?studentId=student-123');
  // Won't be 200 (no mock for AI service) but should NOT be 400/403 for config reasons
  // The request should proceed past the config check
  expect(response.status).not.toBe(400);
  expect(response.status).not.toBe(403);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/integration/books.test.js --testNamePattern="addon" -v`
Expected: FAIL — current code returns 400 "AI not configured" for both cases

- [ ] **Step 3: Implement — gating check + env key fallback**

In `src/routes/books.js`, replace the AI config block (lines 643-672) with:

```js
// Get AI configuration
const dbConfig = await db
  .prepare(
    `SELECT provider, api_key_encrypted, model_preference, is_enabled
     FROM org_ai_config WHERE organization_id = ?`
  )
  .bind(organizationId)
  .first();

let aiConfig;
const encSecret = c.env.ENCRYPTION_KEY || c.env.JWT_SECRET;

if (dbConfig && dbConfig.is_enabled && dbConfig.api_key_encrypted) {
  // Path 1: School has their own API key configured
  try {
    const decryptedApiKey = await decryptSensitiveData(dbConfig.api_key_encrypted, encSecret);
    aiConfig = {
      provider: dbConfig.provider || 'anthropic',
      apiKey: decryptedApiKey,
      model: dbConfig.model_preference,
    };
  } catch (decryptError) {
    console.error('Failed to decrypt API key:', decryptError.message);
    throw badRequestError('AI configuration error. Please check Settings.');
  }
} else {
  // Path 2: Check if org has the paid AI addon
  const org = await db
    .prepare('SELECT ai_addon_active FROM organizations WHERE id = ?')
    .bind(organizationId)
    .first();

  if (!org?.ai_addon_active) {
    throw Object.assign(
      new Error('AI recommendations are not enabled for this organisation.'),
      { status: 403 }
    );
  }

  // Use environment API key
  const envProvider = c.env.ANTHROPIC_API_KEY
    ? 'anthropic'
    : c.env.OPENAI_API_KEY
      ? 'openai'
      : c.env.GOOGLE_API_KEY
        ? 'google'
        : null;
  const envKeyMap = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', google: 'GOOGLE_API_KEY' };

  if (!envProvider) {
    throw badRequestError('AI not configured. No API key available.');
  }

  aiConfig = {
    provider: envProvider,
    apiKey: c.env[envKeyMap[envProvider]],
    model: null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/integration/books.test.js -v`
Expected: ALL PASS (including existing tests — the "AI not configured" test at line 545 still passes because `dbConfig` is null and `ai_addon_active` is 0/not queried)

- [ ] **Step 5: Commit**

```bash
git add src/routes/books.js src/__tests__/integration/books.test.js
git commit -m "feat: gate AI endpoint behind addon subscription or own API key"
```

---

## Task 3: Frontend — Update hasActiveAI derivation and message copy

**Files:**
- Modify: `src/components/BookRecommendations.js:404,1188-1206`
- Test: `src/__tests__/components/BookRecommendations.test.jsx`

- [ ] **Step 1: Update `hasActiveAI` derivation**

In `src/components/BookRecommendations.js`, replace line 404:

```js
// Before:
const hasActiveAI = aiConfig?.hasApiKey || aiConfig?.keySource === 'environment';

// After:
const hasActiveAI =
  aiConfig?.keySource === 'organization' ||
  (aiConfig?.keySource === 'environment' && aiConfig?.aiAddonActive);
```

- [ ] **Step 2: Update the "not configured" message copy**

Replace the message text at lines 1201-1204:

```jsx
<SmartToyIcon sx={{ color: 'text.secondary' }} />
<Typography variant="body2" color="text.secondary">
  AI recommendations require an API key. Your school admin can configure one in
  Settings, or contact Tally Reading to enable the AI add-on.
</Typography>
```

- [ ] **Step 3: Update existing test mocks to include aiAddonActive**

In `src/__tests__/components/BookRecommendations.test.jsx`, find the mock for `/api/settings/ai` responses and add `aiAddonActive: true` where AI should be active, and `aiAddonActive: false` where testing the not-configured state. The mock likely returns `keySource: 'environment'` — these need `aiAddonActive: true` to keep working.

Search for the mock pattern and update all instances.

- [ ] **Step 4: Run component tests**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx -v`
Expected: ALL PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/BookRecommendations.js src/__tests__/components/BookRecommendations.test.jsx
git commit -m "feat: gate AI recommendations UI behind addon or own API key"
```

---

## Task 4: Manual smoke test and deploy

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 2: Deploy**

Run: `npx wrangler deploy`

- [ ] **Step 3: Mark todo as done**

Update the checkbox in `~/vault/projects/Tally Reading.md` for the "AI add-on gating" todo.
