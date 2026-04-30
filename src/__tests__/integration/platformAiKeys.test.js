import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock the crypto module for encryption/decryption
vi.mock('../../utils/crypto.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    encryptSensitiveData: vi.fn().mockResolvedValue('encrypted-api-key-data'),
    decryptSensitiveData: vi.fn().mockResolvedValue('decrypted-api-key'),
    getEncryptionSecret: vi.fn().mockReturnValue('test-encryption-secret'),
  };
});

// Now import the router after mocks are set up
const { settingsRouter } = await import('../../routes/settings.js');
const { ROLES } = await import('../../utils/crypto.js');

const TEST_SECRET = 'test-jwt-secret-for-testing';

/**
 * Create a mock D1 database for testing
 */
const createMockDB = (overrides = {}) => {
  const prepareChain = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue(overrides.allResults || { results: [], success: true }),
    first: vi.fn().mockResolvedValue(overrides.firstResult || null),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
  };

  return {
    prepare: vi.fn().mockReturnValue(prepareChain),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    _chain: prepareChain,
    ...overrides,
  };
};

/**
 * Helper to create user context values
 */
const createUserContext = (role, overrides = {}) => ({
  userId: 'user-123',
  organizationId: 'org-456',
  userRole: role,
  user: { id: 'user-123', role },
  ...overrides,
});

/**
 * Create a Hono app with the settings router mounted and middleware mocked
 */
const createTestApp = (contextValues = {}, dbOverrides = {}) => {
  const app = new Hono();
  const mockDB = createMockDB(dbOverrides);

  // Use Hono's onError hook for proper error handling in tests
  app.onError((err, c) => {
    const status = err.status || 500;
    return c.json(
      {
        status: 'error',
        message: err.message || 'Internal Server Error',
        path: c.req.path,
      },
      status
    );
  });

  // Middleware to inject context values (simulates auth middleware)
  app.use('*', async (c, next) => {
    c.env = {
      JWT_SECRET: TEST_SECRET,
      READING_MANAGER_DB: mockDB,
      READING_MANAGER_KV: contextValues.kv || null,
      ...contextValues.env,
    };

    // Set context values that would normally come from auth middleware
    if (contextValues.userId) c.set('userId', contextValues.userId);
    if (contextValues.organizationId) c.set('organizationId', contextValues.organizationId);
    if (contextValues.userRole) c.set('userRole', contextValues.userRole);
    if (contextValues.user) c.set('user', contextValues.user);

    await next();
  });

  app.route('/api/settings', settingsRouter);

  return { app, mockDB };
};

/**
 * Helper to make requests with proper headers
 */
const makeRequest = async (app, method, path, body = null) => {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return app.request(path, options);
};

describe('Platform AI Keys API Routes', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('GET /api/settings/platform-ai', () => {
    it('should return empty keys for owner when no keys configured', async () => {
      const { app } = createTestApp(createUserContext(ROLES.OWNER));

      const response = await makeRequest(app, 'GET', '/api/settings/platform-ai');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.keys).toBeDefined();
      expect(data.keys.anthropic).toEqual({
        configured: false,
        isActive: false,
        updatedAt: null,
        modelPreference: null,
      });
      expect(data.keys.openai).toEqual({
        configured: false,
        isActive: false,
        updatedAt: null,
        modelPreference: null,
      });
      expect(data.keys.google).toEqual({
        configured: false,
        isActive: false,
        updatedAt: null,
        modelPreference: null,
      });
      expect(data.activeProvider).toBeNull();
    });

    it('should return 403 for non-owner (admin role)', async () => {
      const { app } = createTestApp(createUserContext(ROLES.ADMIN));

      const response = await makeRequest(app, 'GET', '/api/settings/platform-ai');

      expect(response.status).toBe(403);
    });

    it('should return configured keys with active provider', async () => {
      const { app } = createTestApp(createUserContext(ROLES.OWNER), {
        allResults: {
          results: [
            {
              provider: 'anthropic',
              api_key_encrypted: 'enc-key-1',
              is_active: 1,
              updated_at: '2026-01-01T00:00:00Z',
            },
            {
              provider: 'openai',
              api_key_encrypted: 'enc-key-2',
              is_active: 0,
              updated_at: '2026-01-02T00:00:00Z',
            },
          ],
          success: true,
        },
      });

      const response = await makeRequest(app, 'GET', '/api/settings/platform-ai');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.keys.anthropic.configured).toBe(true);
      expect(data.keys.anthropic.isActive).toBe(true);
      expect(data.keys.anthropic.updatedAt).toBe('2026-01-01T00:00:00Z');
      expect(data.keys.openai.configured).toBe(true);
      expect(data.keys.openai.isActive).toBe(false);
      expect(data.keys.google.configured).toBe(false);
      expect(data.activeProvider).toBe('anthropic');
    });
  });

  describe('PUT /api/settings/platform-ai', () => {
    it('should store a valid provider key and return configured=true', async () => {
      // After PUT, the GET-style response is returned. Mock the post-upsert SELECT.
      const { app, mockDB } = createTestApp(createUserContext(ROLES.OWNER), {
        allResults: {
          results: [
            {
              provider: 'anthropic',
              api_key_encrypted: 'encrypted-api-key-data',
              is_active: 0,
              updated_at: '2026-04-13T00:00:00Z',
            },
          ],
          success: true,
        },
      });

      const response = await makeRequest(app, 'PUT', '/api/settings/platform-ai', {
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key-1234567890',
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.keys.anthropic.configured).toBe(true);
      // Verify encryption was called
      const { encryptSensitiveData } = await import('../../utils/crypto.js');
      expect(encryptSensitiveData).toHaveBeenCalledWith(
        'sk-ant-test-key-1234567890',
        'test-encryption-secret'
      );
    });

    it('should set active provider and clear others when setActive is true', async () => {
      const { app, mockDB } = createTestApp(createUserContext(ROLES.OWNER), {
        allResults: {
          results: [
            {
              provider: 'openai',
              api_key_encrypted: 'encrypted-api-key-data',
              is_active: 1,
              updated_at: '2026-04-13T00:00:00Z',
            },
          ],
          success: true,
        },
      });

      const response = await makeRequest(app, 'PUT', '/api/settings/platform-ai', {
        provider: 'openai',
        apiKey: 'sk-openai-test-key-1234567890',
        setActive: true,
      });
      const _data = await response.json();

      expect(response.status).toBe(200);
      // Verify batch was used (to atomically clear other providers + upsert)
      expect(mockDB.batch).toHaveBeenCalled();
      const batchArgs = mockDB.batch.mock.calls[0][0];
      // Should have 2 statements: clear others + upsert target
      expect(batchArgs.length).toBe(2);
    });

    it('should return 400 for invalid provider', async () => {
      const { app } = createTestApp(createUserContext(ROLES.OWNER));

      const response = await makeRequest(app, 'PUT', '/api/settings/platform-ai', {
        provider: 'invalid-provider',
        apiKey: 'sk-some-key-1234567890',
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 for key too short (<10 chars)', async () => {
      const { app } = createTestApp(createUserContext(ROLES.OWNER));

      const response = await makeRequest(app, 'PUT', '/api/settings/platform-ai', {
        provider: 'anthropic',
        apiKey: 'short',
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 for key too long (>500 chars)', async () => {
      const { app } = createTestApp(createUserContext(ROLES.OWNER));

      const response = await makeRequest(app, 'PUT', '/api/settings/platform-ai', {
        provider: 'anthropic',
        apiKey: 'x'.repeat(501),
      });

      expect(response.status).toBe(400);
    });

    it('should allow setActive without apiKey to activate existing key', async () => {
      const { app, mockDB } = createTestApp(createUserContext(ROLES.OWNER), {
        allResults: {
          results: [
            {
              provider: 'anthropic',
              api_key_encrypted: 'existing-encrypted-key',
              is_active: 1,
              updated_at: '2026-04-13T00:00:00Z',
            },
          ],
          success: true,
        },
      });

      const response = await makeRequest(app, 'PUT', '/api/settings/platform-ai', {
        provider: 'anthropic',
        setActive: true,
      });
      const _data = await response.json();

      expect(response.status).toBe(200);
      // Should use batch to atomically clear others + set active
      expect(mockDB.batch).toHaveBeenCalled();
    });

    it('should return 403 for non-owner', async () => {
      const { app } = createTestApp(createUserContext(ROLES.ADMIN));

      const response = await makeRequest(app, 'PUT', '/api/settings/platform-ai', {
        provider: 'anthropic',
        apiKey: 'sk-ant-test-key-1234567890',
      });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/settings/platform-ai/:provider', () => {
    it('should delete a provider key and return success', async () => {
      const { app, mockDB } = createTestApp(createUserContext(ROLES.OWNER));

      const response = await makeRequest(app, 'DELETE', '/api/settings/platform-ai/anthropic');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // Verify DELETE was issued
      expect(mockDB.prepare).toHaveBeenCalled();
      const deleteCall = mockDB.prepare.mock.calls.find((call) =>
        call[0].toUpperCase().includes('DELETE')
      );
      expect(deleteCall).toBeDefined();
    });

    it('should return 400 for invalid provider', async () => {
      const { app } = createTestApp(createUserContext(ROLES.OWNER));

      const response = await makeRequest(app, 'DELETE', '/api/settings/platform-ai/invalid');

      expect(response.status).toBe(400);
    });

    it('should return 403 for non-owner', async () => {
      const { app } = createTestApp(createUserContext(ROLES.ADMIN));

      const response = await makeRequest(app, 'DELETE', '/api/settings/platform-ai/anthropic');

      expect(response.status).toBe(403);
    });
  });

  describe('Platform AI Keys - Model Preference', () => {
    it('GET /api/settings/platform-ai should include modelPreference in response', async () => {
      const { app, mockDB } = createTestApp(createUserContext(ROLES.OWNER));

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
      const { app, mockDB } = createTestApp(createUserContext(ROLES.OWNER));

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
      const _data = await response.json();

      expect(response.status).toBe(200);
      // Verify the SQL included model_preference
      const prepareCalls = mockDB.prepare.mock.calls;
      const upsertCall = prepareCalls.find((c) => c[0].includes('model_preference'));
      expect(upsertCall).toBeDefined();
    });

    it('GET /api/settings/platform-ai/models should return models for active provider', async () => {
      const { app, mockDB } = createTestApp(createUserContext(ROLES.OWNER));

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
      const { app, mockDB } = createTestApp(createUserContext(ROLES.OWNER));

      mockDB._chain.first.mockResolvedValue(null);

      const response = await makeRequest(app, 'GET', '/api/settings/platform-ai/models');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.models).toEqual([]);
    });
  });
});
