/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock Wonde API so individual tests control the verification outcome
vi.mock('../../utils/wondeApi.js', () => ({
  fetchSchoolDetails: vi.fn(),
}));

// Mock Wonde sync so the handler doesn't attempt a real network sync on success
vi.mock('../../services/wondeSync.js', () => ({
  runFullSync: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

// Keep crypto fast — encryption falls back to JWT_SECRET so provide a small stub
vi.mock('../../utils/crypto.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    encryptSensitiveData: vi.fn().mockResolvedValue('encrypted-token-blob'),
  };
});

// Import after mocks
const webhooksRouter = (await import('../../routes/webhooks.js')).default;
const { fetchSchoolDetails } = await import('../../utils/wondeApi.js');

const TEST_SECRET = 'test-jwt-secret-for-testing-that-is-long-enough';

/**
 * SQL-aware mock DB. queryHandler(sql, boundArgs, op) returns row for 'first'
 * or result for 'run'/'all'. All `.run()` invocations are recorded in
 * `_runCalls` so tests can assert which mutations fired.
 */
const createMockDB = (queryHandler) => {
  const calls = [];
  const runCalls = [];

  const db = {
    prepare: vi.fn((sql) => {
      calls.push(sql);
      const chain = {
        bind: vi.fn((...args) => {
          chain._boundArgs = args;
          return chain;
        }),
        first: vi.fn(() => {
          if (queryHandler) {
            return Promise.resolve(queryHandler(sql, chain._boundArgs, 'first'));
          }
          return Promise.resolve(null);
        }),
        run: vi.fn(() => {
          runCalls.push({ sql, args: chain._boundArgs });
          if (queryHandler) {
            const result = queryHandler(sql, chain._boundArgs, 'run');
            if (result) return Promise.resolve(result);
          }
          return Promise.resolve({ success: true, meta: { changes: 1 } });
        }),
        all: vi.fn(() => {
          if (queryHandler) {
            const result = queryHandler(sql, chain._boundArgs, 'all');
            if (result) return Promise.resolve(result);
          }
          return Promise.resolve({ results: [], success: true });
        }),
        _boundArgs: [],
      };
      return chain;
    }),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    _calls: calls,
    _runCalls: runCalls,
  };

  return db;
};

const createMockKV = () => ({
  get: vi.fn().mockResolvedValue(null),
  put: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
});

const createTestApp = (mockDB) => {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.env = {
      JWT_SECRET: TEST_SECRET,
      WONDE_WEBHOOK_SECRET: 'test-secret',
      READING_MANAGER_DB: mockDB,
      READING_MANAGER_KV: createMockKV(),
      ENVIRONMENT: 'development',
    };
    await next();
  });
  app.route('/api/webhooks', webhooksRouter);
  return { app };
};

const makeWebhook = async (app, secret, body) =>
  app.request('/api/webhooks/wonde', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Secret': secret,
    },
    body: JSON.stringify(body),
  });

describe('POST /api/webhooks/wonde - schoolApproved verification', () => {
  let consoleErrorSpy;
  let consoleWarnSpy;
  let consoleLogSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('creates a new org when fetchSchoolDetails returns matching details', async () => {
    fetchSchoolDetails.mockResolvedValue({
      id: 'wonde-school-123',
      email: 'admin@school.example',
      phone_number: '01234 567890',
      address: {
        address_line_1: '1 School Rd',
        address_line_2: '',
        address_town: 'Townsville',
        address_postcode: 'TS1 1SS',
      },
    });

    const mockDB = createMockDB(() => null); // no existing org
    const { app } = createTestApp(mockDB);

    const response = await makeWebhook(app, 'test-secret', {
      payload_type: 'schoolApproved',
      school_id: 'wonde-school-123',
      school_name: 'Test School',
      school_token: 'valid-token',
    });

    expect(response.status).toBe(200);
    const inserts = mockDB._runCalls.filter((c) => c.sql.includes('INSERT INTO organizations'));
    expect(inserts.length).toBe(1);
  });

  it('reactivates an existing soft-deleted org when fetchSchoolDetails returns matching details', async () => {
    fetchSchoolDetails.mockResolvedValue({
      id: 'wonde-school-123',
      email: null,
      phone_number: null,
      address: {},
    });

    const mockDB = createMockDB((sql) => {
      if (sql.includes('FROM organizations')) {
        return { id: 'org-1', is_active: 0 };
      }
      return null;
    });
    const { app } = createTestApp(mockDB);

    const response = await makeWebhook(app, 'test-secret', {
      payload_type: 'schoolApproved',
      school_id: 'wonde-school-123',
      school_name: 'Test School',
      school_token: 'valid-token',
    });

    expect(response.status).toBe(200);
    const updates = mockDB._runCalls.filter((c) => c.sql.includes('UPDATE organizations'));
    expect(updates.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 400 when fetchSchoolDetails throws (no existing org)', async () => {
    fetchSchoolDetails.mockRejectedValue(new Error('401 Unauthorized'));
    const mockDB = createMockDB(() => null);
    const { app } = createTestApp(mockDB);

    const response = await makeWebhook(app, 'test-secret', {
      payload_type: 'schoolApproved',
      school_id: 'wonde-school-123',
      school_name: 'Test School',
      school_token: 'bogus',
    });

    expect(response.status).toBe(400);
    const writes = mockDB._runCalls.filter(
      (c) => c.sql.includes('INSERT INTO organizations') || c.sql.includes('UPDATE organizations')
    );
    expect(writes.length).toBe(0);
  });

  it('returns 400 when fetchSchoolDetails throws AND existing soft-deleted org exists (reactivation attack)', async () => {
    fetchSchoolDetails.mockRejectedValue(new Error('401 Unauthorized'));
    const mockDB = createMockDB((sql) => {
      if (sql.includes('FROM organizations')) {
        return { id: 'org-1', is_active: 0 };
      }
      return null;
    });
    const { app } = createTestApp(mockDB);

    const response = await makeWebhook(app, 'test-secret', {
      payload_type: 'schoolApproved',
      school_id: 'wonde-school-123',
      school_name: 'Test School',
      school_token: 'bogus',
    });

    expect(response.status).toBe(400);
    const updates = mockDB._runCalls.filter((c) => c.sql.includes('UPDATE organizations'));
    expect(updates.length).toBe(0);
  });

  it('returns 400 when fetchSchoolDetails returns mismatched school_id', async () => {
    fetchSchoolDetails.mockResolvedValue({
      id: 'wonde-school-OTHER',
      email: null,
      phone_number: null,
      address: {},
    });
    const mockDB = createMockDB(() => null);
    const { app } = createTestApp(mockDB);

    const response = await makeWebhook(app, 'test-secret', {
      payload_type: 'schoolApproved',
      school_id: 'wonde-school-123',
      school_name: 'Test School',
      school_token: 'valid-token',
    });

    expect(response.status).toBe(400);
    const writes = mockDB._runCalls.filter(
      (c) => c.sql.includes('INSERT INTO organizations') || c.sql.includes('UPDATE organizations')
    );
    expect(writes.length).toBe(0);
  });

  it('returns 401 when secret is invalid', async () => {
    const mockDB = createMockDB();
    const { app } = createTestApp(mockDB);
    const response = await makeWebhook(app, 'wrong-secret', {
      payload_type: 'schoolApproved',
    });
    expect(response.status).toBe(401);
  });
});
