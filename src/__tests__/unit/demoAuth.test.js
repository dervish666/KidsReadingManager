/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { PUBLIC_PATHS } from '../../utils/constants.js';

// Mock crypto to avoid slow PBKDF2
vi.mock('../../utils/crypto.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    hashPassword: vi.fn().mockResolvedValue('mocked-salt:mocked-hash'),
    verifyPassword: vi.fn().mockResolvedValue({ valid: true, needsRehash: false }),
    hashToken: vi.fn().mockImplementation(async (token) => `hashed-${token}`),
    createAccessToken: vi.fn().mockResolvedValue('mocked-demo-access-token'),
    createRefreshToken: vi.fn().mockResolvedValue({
      token: 'mocked-refresh-token',
      hash: 'mocked-refresh-hash',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  };
});

vi.mock('../../middleware/tenant.js', () => ({
  authRateLimit: () => async (_c, next) => next(),
}));

vi.mock('../../utils/email.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
}));

const { authRouter } = await import('../../routes/auth.js');
const { createAccessToken } = await import('../../utils/crypto.js');

const TEST_SECRET = 'test-jwt-secret-for-testing-that-is-long-enough';

const DEMO_USER = {
  id: 'demo-teacher-001',
  email: 'demo@tallyreading.uk',
  name: 'Demo Teacher',
  role: 'teacher',
  auth_provider: 'demo',
  org_id: 'learnalot-org-id',
  org_name: 'Learnalot School',
  org_slug: 'learnalot-school',
};

const createMockDB = (queryHandler) => {
  const db = {
    prepare: vi.fn((sql) => {
      const chain = {
        bind: vi.fn((...args) => {
          chain._boundArgs = args;
          return chain;
        }),
        first: vi.fn(() => {
          if (queryHandler) return Promise.resolve(queryHandler(sql, chain._boundArgs, 'first'));
          return Promise.resolve(null);
        }),
        run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })),
        all: vi.fn(() => Promise.resolve({ results: [], success: true })),
        _boundArgs: [],
      };
      return chain;
    }),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
  };
  return db;
};

const createTestApp = (mockDB) => {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.env = {
      JWT_SECRET: TEST_SECRET,
      READING_MANAGER_DB: mockDB,
      ENVIRONMENT: 'development',
    };
    await next();
  });
  app.route('/api/auth', authRouter);
  return app;
};

describe('demo auth public path', () => {
  it('includes /api/auth/demo in PUBLIC_PATHS', () => {
    expect(PUBLIC_PATHS).toContain('/api/auth/demo');
  });
});

describe('POST /api/auth/demo', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns an access token with demo authProvider and no refresh token', async () => {
    const mockDB = createMockDB((sql, args, method) => {
      if (sql.includes('auth_provider') && method === 'first') {
        return DEMO_USER;
      }
      return null;
    });

    const app = createTestApp(mockDB);
    const response = await app.request('/api/auth/demo', { method: 'POST' });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.accessToken).toBe('mocked-demo-access-token');
    expect(data.user.authProvider).toBe('demo');
    expect(data.user.role).toBe('teacher');
    expect(data.user.id).toBe('demo-teacher-001');
    expect(data.organization.id).toBe('learnalot-org-id');
    expect(data.organization.name).toBe('Learnalot School');

    // No refresh token should be returned
    expect(data.refreshToken).toBeUndefined();

    // No Set-Cookie header (no refresh cookie)
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it('passes 1-hour TTL to createAccessToken', async () => {
    const mockDB = createMockDB((sql, args, method) => {
      if (sql.includes('auth_provider') && method === 'first') {
        return DEMO_USER;
      }
      return null;
    });

    const app = createTestApp(mockDB);
    await app.request('/api/auth/demo', { method: 'POST' });

    expect(createAccessToken).toHaveBeenCalledWith(expect.any(Object), TEST_SECRET, 60 * 60 * 1000);
  });

  it('returns 503 when no demo user exists', async () => {
    const mockDB = createMockDB(() => null);
    const app = createTestApp(mockDB);

    const response = await app.request('/api/auth/demo', { method: 'POST' });
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.error).toBe('Demo not available');
  });
});
