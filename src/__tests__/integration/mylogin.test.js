/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock crypto functions to avoid slow PBKDF2 in tests
vi.mock('../../utils/crypto.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    hashToken: vi.fn().mockImplementation(async (token) => `hashed-${token}`),
    createRefreshToken: vi.fn().mockResolvedValue({
      token: 'mocked-refresh-token',
      hash: 'mocked-refresh-hash',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  };
});

// Mock classAssignments to avoid extra DB calls
vi.mock('../../utils/classAssignments.js', () => ({
  syncUserClassAssignments: vi.fn().mockResolvedValue(0),
}));

// Import after mocks
const { myloginRouter } = await import('../../routes/mylogin.js');

const TEST_SECRET = 'test-jwt-secret-for-testing-that-is-long-enough';

/**
 * Create a mock D1 database with SQL-aware routing.
 *
 * Tracks all prepared statements executed via `.run()` in `runCalls` so
 * tests can assert which mutations were performed without coupling to the
 * full SQL string of the read queries.
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

/**
 * Minimal KV stub covering the fallback lookup in the callback handler.
 */
const createMockKV = () => ({
  get: vi.fn().mockResolvedValue(null),
  delete: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
});

/**
 * Create a Hono test app with the mylogin router mounted and environment injected.
 */
const createTestApp = (mockDB, mockKV = createMockKV()) => {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.env = {
      JWT_SECRET: TEST_SECRET,
      READING_MANAGER_DB: mockDB,
      READING_MANAGER_KV: mockKV,
      MYLOGIN_CLIENT_ID: 'test-client-id',
      MYLOGIN_CLIENT_SECRET: 'test-client-secret',
      MYLOGIN_REDIRECT_URI: 'http://localhost:8787/api/auth/mylogin/callback',
      ENVIRONMENT: 'development',
    };
    await next();
  });
  app.route('/api/auth/mylogin', myloginRouter);
  return app;
};

describe('MyLogin OAuth Routes', () => {
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

  describe('GET /api/auth/mylogin/callback', () => {
    it('rejects a stale oauth_state row (no DELETE, redirects to login)', async () => {
      // Behavioural test: the handler deletes oauth_state rows only when the
      // SELECT returned a valid row. If the TTL filter excludes the stale
      // row, `first()` returns null and no DELETE is executed. We assert
      // both the redirect AND the absence of the DELETE side-effect so the
      // test stays decoupled from the exact WHERE clause wording.
      const mockDB = createMockDB((sql) => {
        if (sql.includes('FROM oauth_state')) {
          // Simulate TTL-filtered read: stale row excluded regardless of
          // how the handler phrases the filter.
          return null;
        }
        return null;
      });

      const app = createTestApp(mockDB);
      const response = await app.request('/api/auth/mylogin/callback?code=abc&state=stale-state');

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/api/auth/mylogin/login');

      // Critical behavioural assertion: no DELETE was issued for oauth_state,
      // because the handler only deletes rows it successfully read.
      const deleteCalls = mockDB._runCalls.filter((call) =>
        call.sql.includes('DELETE FROM oauth_state')
      );
      expect(deleteCalls).toHaveLength(0);
    });

    it('accepts a fresh oauth_state row (DELETE fires, proceeds past state check)', async () => {
      // Positive case: the SELECT returns a matching fresh row, so the
      // handler marks state as valid AND deletes it (single-use CSRF token).
      // Token exchange will then fail (no network in test env) but that's
      // after the state check — the DELETE is the observable signal that
      // the state validation succeeded.
      const mockDB = createMockDB((sql) => {
        if (sql.includes('FROM oauth_state')) {
          return { state: 'fresh-state' };
        }
        return null;
      });

      const app = createTestApp(mockDB);
      const response = await app.request('/api/auth/mylogin/callback?code=abc&state=fresh-state');

      // State validation + DELETE happened; token exchange then fails
      // (no network), landing on the generic error redirect. Either the
      // token_exchange_failed redirect or the catch-all internal error
      // redirect proves we moved past state validation.
      expect(response.status).toBe(302);
      const location = response.headers.get('location') || '';
      expect(location).not.toBe('/api/auth/mylogin/login');
      expect(location).toContain('/?auth=error');

      // Primary assertion: DELETE FROM oauth_state was executed with the
      // matching state value, proving the handler consumed the CSRF token.
      const deleteCalls = mockDB._runCalls.filter((call) =>
        call.sql.includes('DELETE FROM oauth_state')
      );
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0].args).toEqual(['fresh-state']);
    });
  });
});
