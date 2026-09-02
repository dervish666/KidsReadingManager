import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Encryption is mocked so a stored key decrypts to a known string.
vi.mock('../../utils/crypto.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    encryptSensitiveData: vi.fn().mockResolvedValue('encrypted-api-key-data'),
    decryptSensitiveData: vi.fn().mockResolvedValue('decrypted-api-key'),
    getEncryptionSecret: vi.fn().mockReturnValue('test-encryption-secret'),
  };
});

const { settingsRouter } = await import('../../routes/settings.js');
const { ROLES } = await import('../../utils/crypto.js');

/**
 * GET /api/settings/ai/models — the live model picker behind the AI settings
 * page. The route reads org_ai_config with `.first()` and platform_ai_keys
 * with `.all()`, so the mock DB answers those two calls.
 */
const createTestApp = ({ role = ROLES.ADMIN, orgConfig = null, platformRows = [], env = {} }) => {
  const chain = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(orgConfig),
    all: vi.fn().mockResolvedValue({ results: platformRows, success: true }),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
  };
  const mockDB = { prepare: vi.fn().mockReturnValue(chain), _chain: chain };

  const app = new Hono();
  app.onError((err, c) => c.json({ status: 'error', message: err.message }, err.status || 500));
  app.use('*', async (c, next) => {
    c.env = { JWT_SECRET: 'test', READING_MANAGER_DB: mockDB, ...env };
    c.set('userId', 'user-1');
    c.set('organizationId', 'org-1');
    c.set('userRole', role);
    c.set('user', { id: 'user-1', role });
    await next();
  });
  app.route('/api/settings', settingsRouter);
  return { app, mockDB };
};

const anthropicList = {
  data: [
    {
      id: 'claude-haiku-4-5',
      display_name: 'Claude Haiku 4.5',
      created_at: '2025-10-01T00:00:00Z',
    },
    { id: 'claude-opus-5', display_name: 'Claude Opus 5', created_at: '2026-05-01T00:00:00Z' },
    {
      id: 'claude-haiku-4-5-20251001',
      display_name: 'Claude Haiku 4.5 (dated)',
      created_at: '2025-10-01T00:00:00Z',
    },
  ],
};

const openaiList = {
  data: [
    { id: 'gpt-5.4-nano', created: 1_770_000_000 },
    { id: 'gpt-4o-realtime-preview', created: 1_780_000_000 },
    { id: 'text-embedding-3-small', created: 1_790_000_000 },
    { id: 'gpt-5.6', created: 1_785_000_000 },
    { id: 'gpt-5.4-mini', created: 1_775_000_000 },
  ],
};

describe('GET /api/settings/ai/models', () => {
  let originalFetch;
  let fetchMock;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const anthropicOk = () =>
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(anthropicList) });

  it('lists models from the platform key even when the school has no AI add-on', async () => {
    anthropicOk();
    const { app } = createTestApp({
      platformRows: [{ provider: 'anthropic', api_key_encrypted: 'enc', is_active: 1 }],
    });

    const res = await app.request('/api/settings/ai/models');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.provider).toBe('anthropic');
    expect(data.source).toBe('platform');
    // Low-cost tier only, newest first: Opus is dropped, both Haiku ids stay
    expect(data.models.map((m) => m.id)).toEqual(['claude-haiku-4-5', 'claude-haiku-4-5-20251001']);
    expect(fetchMock.mock.calls[0][0]).toContain('limit=1000');
  });

  it('uses ?provider= to pick that provider’s platform key, not the active one', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve(openaiList) });
    const { app } = createTestApp({
      platformRows: [
        { provider: 'anthropic', api_key_encrypted: 'enc-a', is_active: 1 },
        { provider: 'openai', api_key_encrypted: 'enc-o', is_active: 0 },
      ],
    });

    const res = await app.request('/api/settings/ai/models?provider=openai');
    const data = await res.json();

    expect(data.provider).toBe('openai');
    expect(data.source).toBe('platform');
    expect(fetchMock.mock.calls[0][0]).toContain('api.openai.com');
    // Cheap chat models only, newest first; full-size, realtime and embedding models dropped
    expect(data.models.map((m) => m.id)).toEqual(['gpt-5.4-mini', 'gpt-5.4-nano']);
  });

  it('prefers the school’s own key when it is for the requested provider', async () => {
    anthropicOk();
    const { app } = createTestApp({
      orgConfig: { provider: 'anthropic', api_key_encrypted: 'org-enc' },
      platformRows: [{ provider: 'anthropic', api_key_encrypted: 'enc', is_active: 1 }],
    });

    const data = await (await app.request('/api/settings/ai/models')).json();
    expect(data.source).toBe('organization');
  });

  it('falls past a school key for a different provider to the platform key', async () => {
    anthropicOk();
    const { app } = createTestApp({
      orgConfig: { provider: 'google', api_key_encrypted: 'org-enc' },
      platformRows: [{ provider: 'anthropic', api_key_encrypted: 'enc', is_active: 0 }],
    });

    const data = await (await app.request('/api/settings/ai/models?provider=anthropic')).json();
    expect(data.source).toBe('platform');
    expect(data.models).toHaveLength(2);
  });

  it('falls back to the environment variable when no key is stored', async () => {
    anthropicOk();
    const { app } = createTestApp({ env: { ANTHROPIC_API_KEY: 'env-key' } });

    const data = await (await app.request('/api/settings/ai/models?provider=anthropic')).json();
    expect(data.source).toBe('environment');
    expect(fetchMock.mock.calls[0][1].headers['x-api-key']).toBe('env-key');
  });

  it('returns an empty list with source none when nothing holds a key', async () => {
    const { app } = createTestApp({});

    const data = await (await app.request('/api/settings/ai/models?provider=google')).json();
    expect(data).toEqual({ provider: 'google', source: 'none', models: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an empty list rather than a 500 when the provider rejects the key', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) });
    const { app } = createTestApp({
      platformRows: [{ provider: 'anthropic', api_key_encrypted: 'enc', is_active: 1 }],
    });

    const res = await app.request('/api/settings/ai/models');
    expect(res.status).toBe(200);
    expect((await res.json()).models).toEqual([]);
  });

  it('rejects an unknown provider', async () => {
    const { app } = createTestApp({});
    const res = await app.request('/api/settings/ai/models?provider=llama');
    expect(res.status).toBe(400);
  });

  it('is admin-only', async () => {
    const { app } = createTestApp({ role: ROLES.TEACHER });
    const res = await app.request('/api/settings/ai/models');
    expect(res.status).toBe(403);
  });
});
