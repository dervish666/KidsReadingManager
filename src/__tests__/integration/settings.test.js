import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock the crypto module for encryption/decryption
vi.mock('../../utils/crypto.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    encryptSensitiveData: vi.fn().mockResolvedValue('encrypted-api-key-data'),
    decryptSensitiveData: vi.fn().mockResolvedValue('decrypted-api-key')
  };
});

// Now import the router after mocks are set up
const { settingsRouter } = await import('../../routes/settings.js');
const { ROLES, permissions } = await import('../../utils/crypto.js');

const TEST_SECRET = 'test-jwt-secret-for-testing';

/**
 * Create a mock D1 database for testing
 */
const createMockDB = (overrides = {}) => {
  const prepareChain = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue(overrides.allResults || { results: [], success: true }),
    first: vi.fn().mockResolvedValue(overrides.firstResult || null),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
  };

  return {
    prepare: vi.fn().mockReturnValue(prepareChain),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    _chain: prepareChain,
    ...overrides
  };
};

/**
 * Create a Hono app with the settings router mounted and middleware mocked
 */
const createTestApp = (contextValues = {}, dbOverrides = {}) => {
  const app = new Hono();
  const mockDB = createMockDB(dbOverrides);

  // Use Hono's onError hook for proper error handling in tests
  app.onError((err, c) => {
    const status = err.status || 500;
    return c.json({
      status: 'error',
      message: err.message || 'Internal Server Error',
      path: c.req.path
    }, status);
  });

  // Middleware to inject context values (simulates auth middleware)
  app.use('*', async (c, next) => {
    c.env = {
      JWT_SECRET: TEST_SECRET,
      READING_MANAGER_DB: mockDB,
      READING_MANAGER_KV: contextValues.kv || null,
      ANTHROPIC_API_KEY: contextValues.anthropicKey || null,
      OPENAI_API_KEY: contextValues.openaiKey || null,
      GOOGLE_API_KEY: contextValues.googleKey || null,
      ...contextValues.env
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
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return app.request(path, options);
};

describe('Settings API Routes', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('GET /api/settings', () => {
    describe('Multi-tenant mode', () => {
      it('should return settings with defaults when no settings exist', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          allResults: { results: [], success: true }
        });

        const response = await makeRequest(app, 'GET', '/api/settings');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.readingStatusSettings).toBeDefined();
        expect(data.readingStatusSettings.recentlyReadDays).toBe(3);
        expect(data.readingStatusSettings.needsAttentionDays).toBe(7);
        expect(data.timezone).toBe('UTC');
      });

      it('should return stored settings merged with defaults', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          allResults: {
            results: [
              { setting_key: 'timezone', setting_value: '"America/New_York"' },
              { setting_key: 'schoolName', setting_value: '"Test School"' },
              { setting_key: 'readingStatusSettings', setting_value: '{"recentlyReadDays":5,"needsAttentionDays":10}' }
            ],
            success: true
          }
        });

        const response = await makeRequest(app, 'GET', '/api/settings');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.timezone).toBe('America/New_York');
        expect(data.schoolName).toBe('Test School');
        expect(data.readingStatusSettings.recentlyReadDays).toBe(5);
        expect(data.readingStatusSettings.needsAttentionDays).toBe(10);
      });

      it('should handle non-JSON setting values', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          allResults: {
            results: [
              { setting_key: 'schoolName', setting_value: 'Plain text value' }
            ],
            success: true
          }
        });

        const response = await makeRequest(app, 'GET', '/api/settings');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.schoolName).toBe('Plain text value');
      });

      it('should scope queries to organization', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          allResults: { results: [], success: true }
        });

        await makeRequest(app, 'GET', '/api/settings');

        expect(mockDB.prepare).toHaveBeenCalled();
        const prepareCall = mockDB.prepare.mock.calls[0][0];
        expect(prepareCall).toContain('organization_id');
        expect(mockDB._chain.bind).toHaveBeenCalledWith('org-456');
      });
    });

    describe('Legacy mode (no JWT_SECRET)', () => {
      it('should fall back to KV storage when not in multi-tenant mode', async () => {
        const mockKV = {
          get: vi.fn().mockResolvedValue(JSON.stringify({ timezone: 'Europe/London' }))
        };

        const { app } = createTestApp({
          userId: 'user-123',
          kv: mockKV,
          env: { JWT_SECRET: null }
        });

        const response = await makeRequest(app, 'GET', '/api/settings');
        const data = await response.json();

        expect(response.status).toBe(200);
        // In legacy mode, KV service is called
        expect(mockKV.get).toHaveBeenCalled();
      });
    });
  });

  describe('POST /api/settings', () => {
    describe('Permission checks', () => {
      it('should reject requests from teachers', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        const response = await makeRequest(app, 'POST', '/api/settings', {
          timezone: 'America/Los_Angeles'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Permission denied');
      });

      it('should reject requests from readonly users', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.READONLY
        });

        const response = await makeRequest(app, 'POST', '/api/settings', {
          timezone: 'America/Los_Angeles'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Permission denied');
      });

      it('should allow requests from admins', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        }, {
          allResults: { results: [], success: true }
        });

        const response = await makeRequest(app, 'POST', '/api/settings', {
          timezone: 'America/Los_Angeles'
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockDB.batch).toHaveBeenCalled();
      });

      it('should allow requests from owners', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.OWNER
        }, {
          allResults: { results: [], success: true }
        });

        const response = await makeRequest(app, 'POST', '/api/settings', {
          timezone: 'Europe/London'
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(mockDB.batch).toHaveBeenCalled();
      });
    });

    describe('Settings validation', () => {
      it('should reject invalid readingStatusSettings - recentlyReadDays not positive', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        const response = await makeRequest(app, 'POST', '/api/settings', {
          readingStatusSettings: {
            recentlyReadDays: 0,
            needsAttentionDays: 7
          }
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        // Error handler uses 'message' field
        expect(data.message).toContain('Recently read days must be a positive number');
      });

      it('should reject invalid readingStatusSettings - needsAttentionDays not positive', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        const response = await makeRequest(app, 'POST', '/api/settings', {
          readingStatusSettings: {
            recentlyReadDays: 3,
            needsAttentionDays: -1
          }
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        // Error handler uses 'message' field
        expect(data.message).toContain('Needs attention days must be a positive number');
      });

      it('should reject when recentlyReadDays >= needsAttentionDays', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        const response = await makeRequest(app, 'POST', '/api/settings', {
          readingStatusSettings: {
            recentlyReadDays: 7,
            needsAttentionDays: 5
          }
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        // Error handler uses 'message' field
        expect(data.message).toContain('Recently read days must be less than needs attention days');
      });

      it('should reject null settings data', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        const response = await app.request('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'null'
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        // Error handler uses 'message' field
        expect(data.message).toContain('Settings data is required');
      });
    });

    describe('Allowed settings keys', () => {
      it('should accept allowed setting keys', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        }, {
          allResults: { results: [], success: true }
        });

        const response = await makeRequest(app, 'POST', '/api/settings', {
          timezone: 'UTC',
          academicYear: '2025',
          defaultReadingLevel: 3,
          schoolName: 'Test School',
          readingStatusSettings: { recentlyReadDays: 5, needsAttentionDays: 14 },
          bookMetadata: { provider: 'openLibrary' },
          streakGracePeriodDays: 2
        });

        expect(response.status).toBe(200);
        expect(mockDB.batch).toHaveBeenCalled();
      });

      it('should ignore disallowed setting keys', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        const response = await makeRequest(app, 'POST', '/api/settings', {
          dangerousKey: 'malicious value',
          systemConfig: 'injection attempt'
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('No valid settings to update');
      });

      it('should filter out disallowed keys while keeping allowed ones', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        }, {
          allResults: { results: [], success: true }
        });

        const response = await makeRequest(app, 'POST', '/api/settings', {
          timezone: 'America/Chicago',
          invalidKey: 'should be ignored'
        });

        expect(response.status).toBe(200);
        // Only the valid key should be processed
        expect(mockDB.batch).toHaveBeenCalled();
      });
    });

    describe('Settings update behavior', () => {
      it('should upsert settings in database', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        }, {
          allResults: { results: [], success: true }
        });

        await makeRequest(app, 'POST', '/api/settings', {
          timezone: 'Asia/Tokyo'
        });

        // Check that INSERT ... ON CONFLICT was used
        const prepareCall = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('INSERT INTO org_settings') && call[0].includes('ON CONFLICT')
        );
        expect(prepareCall).toBeDefined();
      });

      it('should return updated settings after update', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        // Configure mock to return updated settings on the second query
        let queryCount = 0;
        mockDB._chain.all.mockImplementation(() => {
          queryCount++;
          if (queryCount === 1) {
            // First call is the final fetch
            return Promise.resolve({
              results: [
                { setting_key: 'timezone', setting_value: '"Asia/Tokyo"' }
              ],
              success: true
            });
          }
          return Promise.resolve({ results: [], success: true });
        });

        const response = await makeRequest(app, 'POST', '/api/settings', {
          timezone: 'Asia/Tokyo'
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.timezone).toBe('Asia/Tokyo');
      });

      it('should stringify object values', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        }, {
          allResults: { results: [], success: true }
        });

        await makeRequest(app, 'POST', '/api/settings', {
          readingStatusSettings: { recentlyReadDays: 5, needsAttentionDays: 14 }
        });

        // Verify binding includes stringified JSON
        const bindCalls = mockDB._chain.bind.mock.calls;
        const hasJsonString = bindCalls.some(call =>
          call.some(arg => typeof arg === 'string' && arg.includes('recentlyReadDays'))
        );
        expect(hasJsonString).toBe(true);
      });
    });
  });

  describe('GET /api/settings/ai', () => {
    describe('Multi-tenant mode', () => {
      it('should return AI configuration without exposing API key', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        mockDB._chain.first.mockResolvedValue({
          provider: 'anthropic',
          model_preference: 'claude-3-sonnet',
          is_enabled: 1,
          api_key_encrypted: 'encrypted-key-data'
        });

        const response = await makeRequest(app, 'GET', '/api/settings/ai');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.provider).toBe('anthropic');
        expect(data.modelPreference).toBe('claude-3-sonnet');
        expect(data.isEnabled).toBe(true);
        expect(data.hasApiKey).toBe(true);
        expect(data.keySource).toBe('organization');
        // Ensure API key is not exposed
        expect(data.apiKey).toBeUndefined();
        expect(data.api_key_encrypted).toBeUndefined();
      });

      it('should return defaults when no AI config exists', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'GET', '/api/settings/ai');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.provider).toBe('anthropic');
        expect(data.isEnabled).toBe(false);
        expect(data.hasApiKey).toBe(false);
        expect(data.keySource).toBe('none');
      });

      it('should show environment key source when no org key', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER,
          anthropicKey: 'sk-test-key'
        });

        mockDB._chain.first.mockResolvedValue({
          provider: 'anthropic',
          is_enabled: 1,
          api_key_encrypted: null
        });

        const response = await makeRequest(app, 'GET', '/api/settings/ai');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.keySource).toBe('environment');
        expect(data.availableProviders.anthropic).toBe(true);
      });

      it('should show available providers from environment', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER,
          anthropicKey: 'sk-anthropic',
          openaiKey: 'sk-openai',
          googleKey: null
        });

        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'GET', '/api/settings/ai');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.availableProviders.anthropic).toBe(true);
        expect(data.availableProviders.openai).toBe(true);
        expect(data.availableProviders.google).toBe(false);
      });
    });

    describe('Legacy mode', () => {
      it('should return AI config based on environment variables', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          anthropicKey: 'sk-test',
          env: { JWT_SECRET: null }
        });

        const response = await makeRequest(app, 'GET', '/api/settings/ai');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.provider).toBe('anthropic');
        expect(data.isEnabled).toBe(true);
        expect(data.keySource).toBe('environment');
      });

      it('should detect openai as primary when only openai key exists', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          openaiKey: 'sk-openai',
          env: { JWT_SECRET: null }
        });

        const response = await makeRequest(app, 'GET', '/api/settings/ai');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.provider).toBe('openai');
      });

      it('should detect google as primary when only google key exists', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          googleKey: 'google-key',
          env: { JWT_SECRET: null }
        });

        const response = await makeRequest(app, 'GET', '/api/settings/ai');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.provider).toBe('google');
      });
    });
  });

  describe('POST /api/settings/ai', () => {
    describe('Permission checks', () => {
      it('should reject requests from teachers', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        const response = await makeRequest(app, 'POST', '/api/settings/ai', {
          provider: 'openai'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Permission denied');
      });

      it('should reject requests from readonly users', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.READONLY
        });

        const response = await makeRequest(app, 'POST', '/api/settings/ai', {
          provider: 'anthropic'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Permission denied');
      });

      it('should allow requests from admins', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({ id: 'existing-config' });

        const response = await makeRequest(app, 'POST', '/api/settings/ai', {
          provider: 'openai'
        });

        expect(response.status).toBe(200);
      });

      it('should allow requests from owners', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.OWNER
        });

        mockDB._chain.first.mockResolvedValue({ id: 'existing-config' });

        const response = await makeRequest(app, 'POST', '/api/settings/ai', {
          provider: 'google',
          isEnabled: true
        });

        expect(response.status).toBe(200);
      });
    });

    describe('Provider validation', () => {
      it('should reject invalid AI provider', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        const response = await makeRequest(app, 'POST', '/api/settings/ai', {
          provider: 'invalid-provider'
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        // Error handler uses 'message' field for thrown errors
        expect(data.message).toBe('Invalid AI provider');
      });

      it('should accept anthropic provider', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({ id: 'existing-config' });

        const response = await makeRequest(app, 'POST', '/api/settings/ai', {
          provider: 'anthropic'
        });

        expect(response.status).toBe(200);
      });

      it('should accept openai provider', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({ id: 'existing-config' });

        const response = await makeRequest(app, 'POST', '/api/settings/ai', {
          provider: 'openai'
        });

        expect(response.status).toBe(200);
      });

      it('should accept google provider', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({ id: 'existing-config' });

        const response = await makeRequest(app, 'POST', '/api/settings/ai', {
          provider: 'google'
        });

        expect(response.status).toBe(200);
      });
    });

    describe('AI config update behavior', () => {
      it('should update existing config', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        let queryCount = 0;
        mockDB._chain.first.mockImplementation(() => {
          queryCount++;
          if (queryCount === 1) {
            // First call: check if config exists
            return Promise.resolve({ id: 'existing-config' });
          }
          // Second call: return updated config
          return Promise.resolve({
            provider: 'openai',
            model_preference: 'gpt-4',
            is_enabled: 1,
            api_key_encrypted: null
          });
        });

        const response = await makeRequest(app, 'POST', '/api/settings/ai', {
          provider: 'openai',
          modelPreference: 'gpt-4',
          isEnabled: true
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.provider).toBe('openai');
        expect(data.modelPreference).toBe('gpt-4');
        expect(data.isEnabled).toBe(true);
      });

      it('should create new config if none exists', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        let queryCount = 0;
        mockDB._chain.first.mockImplementation(() => {
          queryCount++;
          if (queryCount === 1) {
            // First call: no existing config
            return Promise.resolve(null);
          }
          // Second call: return newly created config
          return Promise.resolve({
            provider: 'google',
            model_preference: null,
            is_enabled: 1,
            api_key_encrypted: null
          });
        });

        const response = await makeRequest(app, 'POST', '/api/settings/ai', {
          provider: 'google',
          isEnabled: true
        });

        expect(response.status).toBe(200);
        // Verify INSERT was called
        const insertCall = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('INSERT INTO org_ai_config')
        );
        expect(insertCall).toBeDefined();
      });

      it('should encrypt API key when provided', async () => {
        const { encryptSensitiveData } = await import('../../utils/crypto.js');

        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        let queryCount = 0;
        mockDB._chain.first.mockImplementation(() => {
          queryCount++;
          if (queryCount === 1) {
            return Promise.resolve({ id: 'existing-config' });
          }
          return Promise.resolve({
            provider: 'anthropic',
            is_enabled: 1,
            api_key_encrypted: 'encrypted-api-key-data'
          });
        });

        const response = await makeRequest(app, 'POST', '/api/settings/ai', {
          apiKey: 'sk-test-key-12345'
        });

        expect(response.status).toBe(200);
        expect(encryptSensitiveData).toHaveBeenCalledWith('sk-test-key-12345', TEST_SECRET);
      });

      it('should fail when JWT_SECRET is not available for encryption', async () => {
        // When JWT_SECRET is null and organizationId is set, isMultiTenantMode returns false
        // because it checks Boolean(c.env.JWT_SECRET && c.get('organizationId'))
        // So this test verifies that in legacy mode, API key setting is rejected
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN,
          env: { JWT_SECRET: null }
        });

        mockDB._chain.first.mockResolvedValue({ id: 'existing-config' });

        const response = await makeRequest(app, 'POST', '/api/settings/ai', {
          apiKey: 'sk-test-key'
        });
        const data = await response.json();

        // In legacy mode, AI config cannot be updated
        expect(response.status).toBe(400);
        expect(data.error).toContain('AI configuration is managed via environment variables');
      });
    });

    describe('Legacy mode', () => {
      it('should reject AI config update in legacy mode', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          env: { JWT_SECRET: null }
        });

        const response = await makeRequest(app, 'POST', '/api/settings/ai', {
          provider: 'openai'
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toContain('AI configuration is managed via environment variables');
      });
    });
  });

  describe('Organization scoping', () => {
    it('should scope GET /api/settings to organization', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'specific-org-789',
        userRole: ROLES.TEACHER
      }, {
        allResults: { results: [], success: true }
      });

      await makeRequest(app, 'GET', '/api/settings');

      expect(mockDB._chain.bind).toHaveBeenCalledWith('specific-org-789');
    });

    it('should scope POST /api/settings to organization', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'specific-org-789',
        userRole: ROLES.ADMIN
      }, {
        allResults: { results: [], success: true }
      });

      await makeRequest(app, 'POST', '/api/settings', {
        timezone: 'UTC'
      });

      // Check that organizationId is used in the upsert
      const bindCalls = mockDB._chain.bind.mock.calls;
      const hasOrgId = bindCalls.some(call =>
        call.includes('specific-org-789')
      );
      expect(hasOrgId).toBe(true);
    });

    it('should scope GET /api/settings/ai to organization', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'specific-org-789',
        userRole: ROLES.TEACHER
      });

      await makeRequest(app, 'GET', '/api/settings/ai');

      expect(mockDB._chain.bind).toHaveBeenCalledWith('specific-org-789');
    });

    it('should scope POST /api/settings/ai to organization', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'specific-org-789',
        userRole: ROLES.ADMIN
      });

      mockDB._chain.first.mockResolvedValue({ id: 'config' });

      await makeRequest(app, 'POST', '/api/settings/ai', {
        provider: 'anthropic'
      });

      const bindCalls = mockDB._chain.bind.mock.calls;
      const hasOrgId = bindCalls.some(call =>
        call.includes('specific-org-789')
      );
      expect(hasOrgId).toBe(true);
    });
  });

  describe('Response format', () => {
    it('should return settings as JSON object', async () => {
      const { app } = createTestApp({
        userId: 'user-123',
        organizationId: 'org-456',
        userRole: ROLES.TEACHER
      }, {
        allResults: {
          results: [
            { setting_key: 'timezone', setting_value: '"UTC"' }
          ],
          success: true
        }
      });

      const response = await makeRequest(app, 'GET', '/api/settings');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(typeof data).toBe('object');
      expect(data.timezone).toBe('UTC');
    });

    it('should return AI config with expected structure', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'org-456',
        userRole: ROLES.TEACHER
      });

      mockDB._chain.first.mockResolvedValue({
        provider: 'anthropic',
        model_preference: 'claude-3-opus',
        is_enabled: 1,
        api_key_encrypted: 'encrypted'
      });

      const response = await makeRequest(app, 'GET', '/api/settings/ai');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('provider');
      expect(data).toHaveProperty('modelPreference');
      expect(data).toHaveProperty('isEnabled');
      expect(data).toHaveProperty('hasApiKey');
      expect(data).toHaveProperty('availableProviders');
      expect(data).toHaveProperty('keySource');
    });
  });

  describe('Error handling', () => {
    it('should handle database errors on GET /api/settings', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'org-456',
        userRole: ROLES.TEACHER
      });

      mockDB._chain.all.mockRejectedValue(new Error('Database error'));

      const response = await makeRequest(app, 'GET', '/api/settings');

      expect(response.status).toBe(500);
    });

    it('should handle database errors on POST /api/settings', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'org-456',
        userRole: ROLES.ADMIN
      });

      mockDB.batch.mockRejectedValue(new Error('Database error'));

      const response = await makeRequest(app, 'POST', '/api/settings', {
        timezone: 'UTC'
      });

      expect(response.status).toBe(500);
    });

    it('should handle database errors on GET /api/settings/ai', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'org-456',
        userRole: ROLES.TEACHER
      });

      mockDB._chain.first.mockRejectedValue(new Error('Database error'));

      const response = await makeRequest(app, 'GET', '/api/settings/ai');

      expect(response.status).toBe(500);
    });

    it('should handle database errors on POST /api/settings/ai', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'org-456',
        userRole: ROLES.ADMIN
      });

      mockDB._chain.first.mockRejectedValue(new Error('Database error'));

      const response = await makeRequest(app, 'POST', '/api/settings/ai', {
        provider: 'anthropic'
      });

      expect(response.status).toBe(500);
    });
  });

  describe('Role hierarchy tests', () => {
    const testCases = [
      { role: ROLES.OWNER, canRead: true, canWrite: true },
      { role: ROLES.ADMIN, canRead: true, canWrite: true },
      { role: ROLES.TEACHER, canRead: true, canWrite: false },
      { role: ROLES.READONLY, canRead: true, canWrite: false }
    ];

    testCases.forEach(({ role, canRead, canWrite }) => {
      describe(`Role: ${role}`, () => {
        it(`should ${canRead ? 'allow' : 'deny'} GET /api/settings`, async () => {
          const { app } = createTestApp({
            userId: 'user-123',
            organizationId: 'org-456',
            userRole: role
          }, {
            allResults: { results: [], success: true }
          });

          const response = await makeRequest(app, 'GET', '/api/settings');

          if (canRead) {
            expect(response.status).toBe(200);
          } else {
            expect(response.status).toBe(403);
          }
        });

        it(`should ${canWrite ? 'allow' : 'deny'} POST /api/settings`, async () => {
          const { app, mockDB } = createTestApp({
            userId: 'user-123',
            organizationId: 'org-456',
            userRole: role
          }, {
            allResults: { results: [], success: true }
          });

          const response = await makeRequest(app, 'POST', '/api/settings', {
            timezone: 'UTC'
          });

          if (canWrite) {
            expect(response.status).toBe(200);
          } else {
            expect(response.status).toBe(403);
          }
        });

        it(`should ${canRead ? 'allow' : 'deny'} GET /api/settings/ai`, async () => {
          const { app, mockDB } = createTestApp({
            userId: 'user-123',
            organizationId: 'org-456',
            userRole: role
          });

          mockDB._chain.first.mockResolvedValue(null);

          const response = await makeRequest(app, 'GET', '/api/settings/ai');

          if (canRead) {
            expect(response.status).toBe(200);
          } else {
            expect(response.status).toBe(403);
          }
        });

        it(`should ${canWrite ? 'allow' : 'deny'} POST /api/settings/ai`, async () => {
          const { app, mockDB } = createTestApp({
            userId: 'user-123',
            organizationId: 'org-456',
            userRole: role
          });

          mockDB._chain.first.mockResolvedValue({ id: 'config' });

          const response = await makeRequest(app, 'POST', '/api/settings/ai', {
            provider: 'anthropic'
          });

          if (canWrite) {
            expect(response.status).toBe(200);
          } else {
            expect(response.status).toBe(403);
          }
        });
      });
    });
  });
});
