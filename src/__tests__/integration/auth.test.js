/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock the email module BEFORE importing the router
vi.mock('../../utils/email.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true }),
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true })
}));

// Mock crypto functions to avoid slow PBKDF2 in tests
vi.mock('../../utils/crypto.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    hashPassword: vi.fn().mockResolvedValue('mocked-salt:mocked-hash'),
    verifyPassword: vi.fn().mockResolvedValue({ valid: true, needsRehash: false }),
    hashToken: vi.fn().mockImplementation(async (token) => `hashed-${token}`),
    createAccessToken: vi.fn().mockResolvedValue('mocked-access-token'),
    createRefreshToken: vi.fn().mockResolvedValue({
      token: 'mocked-refresh-token',
      hash: 'mocked-refresh-hash',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    })
  };
});

// Mock the tenant middleware to avoid rate_limits table issues
vi.mock('../../middleware/tenant.js', () => ({
  authRateLimit: () => async (_c, next) => next()
}));

// Import after mocks
const { authRouter } = await import('../../routes/auth.js');
const { hashPassword, verifyPassword, hashToken } = await import('../../utils/crypto.js');
const { sendPasswordResetEmail } = await import('../../utils/email.js');

const TEST_SECRET = 'test-jwt-secret-for-testing-that-is-long-enough';

/**
 * Create a mock D1 database with SQL-aware routing.
 * The `responses` object maps query patterns to return values.
 * The `prepare` mock inspects the SQL string and returns appropriate data.
 */
const createMockDB = (queryHandler) => {
  const calls = [];

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
        _boundArgs: []
      };
      return chain;
    }),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    _calls: calls
  };

  return db;
};

/**
 * Create a Hono test app with auth router mounted and environment injected
 */
const createTestApp = (mockDB) => {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.env = {
      JWT_SECRET: TEST_SECRET,
      READING_MANAGER_DB: mockDB,
      APP_URL: 'http://localhost:3000',
      ENVIRONMENT: 'development'
    };
    await next();
  });
  app.route('/api/auth', authRouter);
  return app;
};

/**
 * Helper to make HTTP requests to the test app
 */
const makeRequest = async (app, method, path, body = null, headers = {}) => {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  return app.request(path, options);
};

describe('Auth API Routes', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // ===========================================================================
  // 1. Login: Account Lockout After Failed Attempts
  // ===========================================================================
  describe('POST /api/auth/login - Account Lockout', () => {
    it('should return 429 when account is locked due to too many failed attempts', async () => {
      const mockDB = createMockDB((sql) => {
        // isAccountLocked query - return count >= 5 to indicate locked
        if (sql.includes('login_attempts') && sql.includes('COUNT')) {
          return { count: 5 };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'locked@example.com',
        password: 'wrongpassword'
      });
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toContain('too many failed login attempts');
      expect(data.retryAfter).toBeDefined();
    });

    it('should allow login when failed attempts are below the threshold', async () => {
      const mockDB = createMockDB((sql) => {
        // isAccountLocked query - return count < 5
        if (sql.includes('login_attempts') && sql.includes('COUNT')) {
          return { count: 3 };
        }
        // User query
        if (sql.includes('users u') && sql.includes('organizations o')) {
          return {
            id: 'user-123',
            email: 'test@example.com',
            password_hash: 'mocked-salt:mocked-hash',
            name: 'Test User',
            role: 'teacher',
            is_active: 1,
            organization_id: 'org-456',
            org_name: 'Test School',
            org_slug: 'test-school',
            org_active: 1
          };
        }
        return null;
      });

      verifyPassword.mockResolvedValueOnce({ valid: true, needsRehash: false });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'correctpassword'
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.accessToken).toBeDefined();
      expect(data.user.email).toBe('test@example.com');
    });

    it('should return 429 when exactly at the lockout threshold', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('login_attempts') && sql.includes('COUNT')) {
          return { count: 5 };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'locked@example.com',
        password: 'anypassword'
      });

      expect(response.status).toBe(429);
    });

    it('should allow login after the lockout cooldown period', async () => {
      // Simulate that the lockout has expired (count is 0 within window)
      const mockDB = createMockDB((sql) => {
        if (sql.includes('login_attempts') && sql.includes('COUNT')) {
          return { count: 0 };
        }
        if (sql.includes('users u') && sql.includes('organizations o')) {
          return {
            id: 'user-123',
            email: 'test@example.com',
            password_hash: 'mocked-salt:mocked-hash',
            name: 'Test User',
            role: 'teacher',
            is_active: 1,
            organization_id: 'org-456',
            org_name: 'Test School',
            org_slug: 'test-school',
            org_active: 1
          };
        }
        return null;
      });

      verifyPassword.mockResolvedValueOnce({ valid: true, needsRehash: false });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'correctpassword'
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.accessToken).toBeDefined();
    });

    it('should record failed login attempts', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('login_attempts') && sql.includes('COUNT')) {
          return { count: 0 };
        }
        // User not found
        if (sql.includes('users u') && sql.includes('organizations o')) {
          return null;
        }
        return null;
      });

      hashPassword.mockResolvedValueOnce('dummy-hash');

      const app = createTestApp(mockDB);

      await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'nonexistent@example.com',
        password: 'somepassword'
      });

      // Verify INSERT INTO login_attempts was called
      const insertCalls = mockDB._calls.filter(sql =>
        sql.includes('INSERT INTO login_attempts')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 2. Login: Deactivated User and Inactive Org Rejection
  // ===========================================================================
  describe('POST /api/auth/login - Deactivated User / Inactive Org', () => {
    it('should return 403 for deactivated user (is_active = 0)', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('login_attempts') && sql.includes('COUNT')) {
          return { count: 0 };
        }
        if (sql.includes('users u') && sql.includes('organizations o')) {
          return {
            id: 'user-123',
            email: 'deactivated@example.com',
            password_hash: 'mocked-salt:mocked-hash',
            name: 'Deactivated User',
            role: 'teacher',
            is_active: 0, // Deactivated
            organization_id: 'org-456',
            org_name: 'Test School',
            org_slug: 'test-school',
            org_active: 1
          };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'deactivated@example.com',
        password: 'correctpassword'
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Account is deactivated');
    });

    it('should return 403 for user in inactive organization (org_active = 0)', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('login_attempts') && sql.includes('COUNT')) {
          return { count: 0 };
        }
        if (sql.includes('users u') && sql.includes('organizations o')) {
          return {
            id: 'user-123',
            email: 'user@example.com',
            password_hash: 'mocked-salt:mocked-hash',
            name: 'Active User',
            role: 'teacher',
            is_active: 1,
            organization_id: 'org-456',
            org_name: 'Inactive School',
            org_slug: 'inactive-school',
            org_active: 0 // Inactive org
          };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'user@example.com',
        password: 'correctpassword'
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Organization is inactive');
    });

    it('should succeed for active user in active organization', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('login_attempts') && sql.includes('COUNT')) {
          return { count: 0 };
        }
        if (sql.includes('users u') && sql.includes('organizations o')) {
          return {
            id: 'user-123',
            email: 'active@example.com',
            password_hash: 'mocked-salt:mocked-hash',
            name: 'Active User',
            role: 'admin',
            is_active: 1,
            organization_id: 'org-456',
            org_name: 'Active School',
            org_slug: 'active-school',
            org_active: 1
          };
        }
        return null;
      });

      verifyPassword.mockResolvedValueOnce({ valid: true, needsRehash: false });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'active@example.com',
        password: 'correctpassword'
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.accessToken).toBeDefined();
      expect(data.user.id).toBe('user-123');
      expect(data.user.role).toBe('admin');
      expect(data.organization.name).toBe('Active School');
    });

    it('should return 401 for invalid credentials', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('login_attempts') && sql.includes('COUNT')) {
          return { count: 0 };
        }
        if (sql.includes('users u') && sql.includes('organizations o')) {
          return {
            id: 'user-123',
            email: 'user@example.com',
            password_hash: 'real-salt:real-hash',
            name: 'Test User',
            role: 'teacher',
            is_active: 1,
            organization_id: 'org-456',
            org_name: 'Test School',
            org_slug: 'test-school',
            org_active: 1
          };
        }
        return null;
      });

      verifyPassword.mockResolvedValueOnce({ valid: false, needsRehash: false });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'user@example.com',
        password: 'wrongpassword'
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid email or password');
    });

    it('should return 401 for nonexistent user without revealing email existence', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('login_attempts') && sql.includes('COUNT')) {
          return { count: 0 };
        }
        if (sql.includes('users u') && sql.includes('organizations o')) {
          return null; // User not found
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'nobody@example.com',
        password: 'anypassword'
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      // Same error as invalid password to prevent email enumeration
      expect(data.error).toBe('Invalid email or password');
    });

    it('should return 400 when email or password is missing', async () => {
      const mockDB = createMockDB();
      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'test@example.com'
        // No password
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email and password required');
    });
  });

  // ===========================================================================
  // 3. Token Refresh: Rotation and Old Token Revocation
  // ===========================================================================
  describe('POST /api/auth/refresh - Token Rotation', () => {
    it('should return new tokens for a valid refresh token via cookie', async () => {
      const mockDB = createMockDB((sql) => {
        // Find the refresh token
        if (sql.includes('refresh_tokens rt') && sql.includes('users u')) {
          return {
            id: 'rt-123',
            user_id: 'user-123',
            token_hash: 'hashed-valid-refresh-token',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Future
            revoked_at: null,
            email: 'user@example.com',
            name: 'Test User',
            role: 'teacher',
            user_active: 1,
            org_id: 'org-456',
            org_name: 'Test School',
            org_slug: 'test-school',
            org_active: 1
          };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/refresh', null, {
        cookie: 'refresh_token=valid-refresh-token'
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.accessToken).toBeDefined();
      expect(data.user.id).toBe('user-123');
      expect(data.user.email).toBe('user@example.com');
      expect(data.organization.id).toBe('org-456');
    });

    it('should revoke the old refresh token during rotation', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('refresh_tokens rt') && sql.includes('users u')) {
          return {
            id: 'rt-old-123',
            user_id: 'user-123',
            token_hash: 'hashed-old-token',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            revoked_at: null,
            email: 'user@example.com',
            name: 'Test User',
            role: 'teacher',
            user_active: 1,
            org_id: 'org-456',
            org_name: 'Test School',
            org_slug: 'test-school',
            org_active: 1
          };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      await makeRequest(app, 'POST', '/api/auth/refresh', null, {
        cookie: 'refresh_token=old-token'
      });

      // Verify that the old token was revoked (UPDATE ... SET revoked_at)
      const revokeCalls = mockDB._calls.filter(sql =>
        sql.includes('UPDATE refresh_tokens SET revoked_at')
      );
      expect(revokeCalls.length).toBeGreaterThan(0);

      // Verify that a new refresh token was inserted
      const insertCalls = mockDB._calls.filter(sql =>
        sql.includes('INSERT INTO refresh_tokens')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
    });

    it('should return 401 for a revoked (invalid) refresh token', async () => {
      const mockDB = createMockDB((sql) => {
        // The query has WHERE ... revoked_at IS NULL, so a revoked token returns null
        if (sql.includes('refresh_tokens rt') && sql.includes('users u')) {
          return null; // Not found (already revoked)
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/refresh', null, {
        cookie: 'refresh_token=revoked-token'
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid refresh token');
    });

    it('should return 401 for an expired refresh token', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('refresh_tokens rt') && sql.includes('users u')) {
          return {
            id: 'rt-expired',
            user_id: 'user-123',
            token_hash: 'hashed-expired-token',
            expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Past
            revoked_at: null,
            email: 'user@example.com',
            name: 'Test User',
            role: 'teacher',
            user_active: 1,
            org_id: 'org-456',
            org_name: 'Test School',
            org_slug: 'test-school',
            org_active: 1
          };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/refresh', null, {
        cookie: 'refresh_token=expired-token'
      });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Refresh token expired');
    });

    it('should return 400 when no refresh token is provided', async () => {
      const mockDB = createMockDB();
      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/refresh');
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Refresh token required');
    });

    it('should accept refresh token from request body as fallback', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('refresh_tokens rt') && sql.includes('users u')) {
          return {
            id: 'rt-body',
            user_id: 'user-123',
            token_hash: 'hashed-body-token',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            revoked_at: null,
            email: 'user@example.com',
            name: 'Test User',
            role: 'teacher',
            user_active: 1,
            org_id: 'org-456',
            org_name: 'Test School',
            org_slug: 'test-school',
            org_active: 1
          };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/refresh', {
        refreshToken: 'body-token'
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.accessToken).toBeDefined();
    });

    it('should return 403 for deactivated user on refresh', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('refresh_tokens rt') && sql.includes('users u')) {
          return {
            id: 'rt-123',
            user_id: 'user-123',
            token_hash: 'hashed-token',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            revoked_at: null,
            email: 'user@example.com',
            name: 'Deactivated User',
            role: 'teacher',
            user_active: 0, // Deactivated
            org_id: 'org-456',
            org_name: 'Test School',
            org_slug: 'test-school',
            org_active: 1
          };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/refresh', null, {
        cookie: 'refresh_token=some-token'
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Account is deactivated');
    });

    it('should return 403 for inactive organization on refresh', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('refresh_tokens rt') && sql.includes('users u')) {
          return {
            id: 'rt-123',
            user_id: 'user-123',
            token_hash: 'hashed-token',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            revoked_at: null,
            email: 'user@example.com',
            name: 'Test User',
            role: 'teacher',
            user_active: 1,
            org_id: 'org-456',
            org_name: 'Inactive School',
            org_slug: 'inactive-school',
            org_active: 0 // Inactive org
          };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/refresh', null, {
        cookie: 'refresh_token=some-token'
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Organization is inactive');
    });

    it('should set new refresh token as httpOnly cookie', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('refresh_tokens rt') && sql.includes('users u')) {
          return {
            id: 'rt-123',
            user_id: 'user-123',
            token_hash: 'hashed-token',
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            revoked_at: null,
            email: 'user@example.com',
            name: 'Test User',
            role: 'teacher',
            user_active: 1,
            org_id: 'org-456',
            org_name: 'Test School',
            org_slug: 'test-school',
            org_active: 1
          };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/refresh', null, {
        cookie: 'refresh_token=old-token'
      });

      const setCookie = response.headers.get('set-cookie');
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain('refresh_token=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Path=/api/auth');
      expect(setCookie).toContain('SameSite=Strict');
    });
  });

  // ===========================================================================
  // 4. Registration: Duplicate Email Rejection
  // ===========================================================================
  describe('POST /api/auth/register - Duplicate Email', () => {
    it('should return 400 for registration with an existing email', async () => {
      const mockDB = createMockDB((sql) => {
        // Check for existing user by email
        if (sql.includes('SELECT id FROM users WHERE email')) {
          return { id: 'existing-user-123' }; // Email already exists
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/register', {
        organizationName: 'New School',
        email: 'existing@example.com',
        password: 'password123',
        name: 'New User'
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      // The error is intentionally generic to prevent email enumeration
      expect(data.error).toContain('Registration could not be completed');
    });

    it('should create user and organization in a batch for new registration', async () => {
      const mockDB = createMockDB((sql) => {
        // No existing user
        if (sql.includes('SELECT id FROM users WHERE email')) {
          return null;
        }
        // No existing org with this slug
        if (sql.includes('SELECT id FROM organizations WHERE slug')) {
          return null;
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/register', {
        organizationName: 'Brand New School',
        email: 'newuser@example.com',
        password: 'securepassword123',
        name: 'New User'
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.message).toBe('Registration successful');
      expect(data.accessToken).toBeDefined();
      expect(data.user.email).toBe('newuser@example.com');
      expect(data.user.name).toBe('New User');
      expect(data.user.role).toBe('owner');
      expect(data.organization.name).toBe('Brand New School');

      // Verify batch was called to create org + user atomically
      expect(mockDB.batch).toHaveBeenCalled();
    });

    it('should reject registration with missing required fields', async () => {
      const mockDB = createMockDB();
      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/register', {
        email: 'test@example.com'
        // Missing organizationName, password, name
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Missing required fields');
      expect(data.required).toContain('organizationName');
      expect(data.required).toContain('password');
      expect(data.required).toContain('name');
    });

    it('should reject registration with invalid email format', async () => {
      const mockDB = createMockDB();
      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/register', {
        organizationName: 'Test School',
        email: 'not-an-email',
        password: 'password123',
        name: 'Test User'
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid email format');
    });

    it('should reject registration with weak password (under 8 chars)', async () => {
      const mockDB = createMockDB();
      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/register', {
        organizationName: 'Test School',
        email: 'user@example.com',
        password: 'short',
        name: 'Test User'
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Password must be at least 8 characters');
    });

    it('should set refresh token cookie on successful registration', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('SELECT id FROM users WHERE email')) {
          return null;
        }
        if (sql.includes('SELECT id FROM organizations WHERE slug')) {
          return null;
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/register', {
        organizationName: 'Cookie School',
        email: 'cookie@example.com',
        password: 'password123',
        name: 'Cookie User'
      });

      expect(response.status).toBe(201);
      const setCookie = response.headers.get('set-cookie');
      expect(setCookie).toContain('refresh_token=');
      expect(setCookie).toContain('HttpOnly');
    });

    it('should generate a unique slug when slug already exists', async () => {
      let slugCheckCount = 0;
      const mockDB = createMockDB((sql) => {
        if (sql.includes('SELECT id FROM users WHERE email')) {
          return null;
        }
        if (sql.includes('SELECT id FROM organizations WHERE slug')) {
          slugCheckCount++;
          // First slug check: already taken; second: available
          if (slugCheckCount === 1) return { id: 'existing-org' };
          return null;
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/register', {
        organizationName: 'Duplicate School',
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User'
      });

      expect(response.status).toBe(201);
      // Slug was checked at least twice (first taken, then unique)
      expect(slugCheckCount).toBe(2);
    });
  });

  // ===========================================================================
  // 5. Password Reset: Full Flow
  // ===========================================================================
  describe('POST /api/auth/forgot-password - Request Reset', () => {
    it('should return success message for existing email and store token', async () => {
      const mockDB = createMockDB((sql) => {
        // Find user by email
        if (sql.includes('SELECT id, email, name FROM users') && sql.includes('is_active')) {
          return { id: 'user-123', email: 'user@example.com', name: 'Test User' };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/forgot-password', {
        email: 'user@example.com'
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('If the email exists, a reset link will be sent');

      // Verify that old tokens were invalidated
      const invalidateCalls = mockDB._calls.filter(sql =>
        sql.includes('UPDATE password_reset_tokens SET used_at')
      );
      expect(invalidateCalls.length).toBeGreaterThan(0);

      // Verify that new token was stored
      const insertCalls = mockDB._calls.filter(sql =>
        sql.includes('INSERT INTO password_reset_tokens')
      );
      expect(insertCalls.length).toBeGreaterThan(0);

      // Verify email was sent
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.anything(),
        'user@example.com',
        'Test User',
        expect.any(String), // Reset token
        'http://localhost:3000'
      );
    });

    it('should return same success message for nonexistent email (prevent enumeration)', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('SELECT id, email, name FROM users')) {
          return null; // User not found
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/forgot-password', {
        email: 'nonexistent@example.com'
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      // Same message regardless of whether user exists
      expect(data.message).toBe('If the email exists, a reset link will be sent');

      // No email should have been sent
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should return 400 when email is missing', async () => {
      const mockDB = createMockDB();
      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/forgot-password', {});
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Email required');
    });
  });

  describe('POST /api/auth/reset-password - Reset with Token', () => {
    it('should reset password with a valid token', async () => {
      const mockDB = createMockDB((sql) => {
        // Find reset token
        if (sql.includes('password_reset_tokens') && sql.includes('token_hash') && sql.includes('used_at IS NULL')) {
          return {
            id: 'prt-123',
            user_id: 'user-123',
            token_hash: 'hashed-valid-reset-token',
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min future
            used_at: null
          };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/reset-password', {
        token: 'valid-reset-token',
        password: 'newpassword123'
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Password reset successful');

      // Verify batch was called with password update, token marking, and token revocation
      expect(mockDB.batch).toHaveBeenCalled();
    });

    it('should fail with an expired token', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('password_reset_tokens') && sql.includes('token_hash') && sql.includes('used_at IS NULL')) {
          return {
            id: 'prt-expired',
            user_id: 'user-123',
            token_hash: 'hashed-expired-token',
            expires_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
            used_at: null
          };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/reset-password', {
        token: 'expired-token',
        password: 'newpassword123'
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Reset token has expired');
    });

    it('should fail with an already-used token', async () => {
      const mockDB = createMockDB((sql) => {
        // Query has used_at IS NULL, so a used token returns null
        if (sql.includes('password_reset_tokens') && sql.includes('token_hash')) {
          return null; // Not found because used_at IS NOT NULL
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/reset-password', {
        token: 'already-used-token',
        password: 'newpassword123'
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid or expired reset token');
    });

    it('should fail with a completely invalid token', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('password_reset_tokens') && sql.includes('token_hash')) {
          return null; // Not found
        }
        return null;
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/reset-password', {
        token: 'totally-invalid-token',
        password: 'newpassword123'
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid or expired reset token');
    });

    it('should return 400 when token or password is missing', async () => {
      const mockDB = createMockDB();
      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/reset-password', {
        token: 'some-token'
        // Missing password
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Token and password required');
    });

    it('should reject weak new password during reset', async () => {
      const mockDB = createMockDB();
      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/reset-password', {
        token: 'some-token',
        password: 'short'
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Password must be at least 8 characters');
    });

    it('should revoke all refresh tokens after password reset', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('password_reset_tokens') && sql.includes('token_hash') && sql.includes('used_at IS NULL')) {
          return {
            id: 'prt-123',
            user_id: 'user-123',
            token_hash: 'hashed-token',
            expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            used_at: null
          };
        }
        return null;
      });

      const app = createTestApp(mockDB);

      await makeRequest(app, 'POST', '/api/auth/reset-password', {
        token: 'valid-token',
        password: 'newpassword123'
      });

      // Verify batch was called
      expect(mockDB.batch).toHaveBeenCalled();
      const batchArgs = mockDB.batch.mock.calls[0][0];

      // The batch should contain 3 operations:
      // 1. UPDATE users SET password_hash
      // 2. UPDATE password_reset_tokens SET used_at
      // 3. UPDATE refresh_tokens SET revoked_at
      expect(batchArgs).toHaveLength(3);
    });
  });

  // ===========================================================================
  // Login: Additional Edge Cases
  // ===========================================================================
  describe('POST /api/auth/login - Password Rehash', () => {
    it('should rehash password when needsRehash is true', async () => {
      const mockDB = createMockDB((sql) => {
        if (sql.includes('login_attempts') && sql.includes('COUNT')) {
          return { count: 0 };
        }
        if (sql.includes('users u') && sql.includes('organizations o')) {
          return {
            id: 'user-123',
            email: 'user@example.com',
            password_hash: 'old-salt:old-hash',
            name: 'Test User',
            role: 'teacher',
            is_active: 1,
            organization_id: 'org-456',
            org_name: 'Test School',
            org_slug: 'test-school',
            org_active: 1
          };
        }
        return null;
      });

      verifyPassword.mockResolvedValueOnce({ valid: true, needsRehash: true });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'user@example.com',
        password: 'correctpassword'
      });

      expect(response.status).toBe(200);

      // hashPassword should have been called to rehash
      expect(hashPassword).toHaveBeenCalled();

      // Verify UPDATE users SET password_hash was called for rehash
      const rehashCalls = mockDB._calls.filter(sql =>
        sql.includes('UPDATE users SET password_hash')
      );
      expect(rehashCalls.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================
  describe('Error Handling', () => {
    it('should return 500 for database errors on login', async () => {
      const mockDB = createMockDB(() => {
        throw new Error('Database connection failed');
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/login', {
        email: 'user@example.com',
        password: 'password123'
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Login failed');
    });

    it('should return 500 for database errors on register', async () => {
      const mockDB = createMockDB(() => {
        throw new Error('Database connection failed');
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/register', {
        organizationName: 'Test',
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Registration failed');
    });

    it('should return 500 for database errors on refresh', async () => {
      const mockDB = createMockDB(() => {
        throw new Error('Database connection failed');
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/refresh', null, {
        cookie: 'refresh_token=some-token'
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Token refresh failed');
    });

    it('should return 500 for database errors on forgot-password', async () => {
      const mockDB = createMockDB(() => {
        throw new Error('Database connection failed');
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/forgot-password', {
        email: 'user@example.com'
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Password reset request failed');
    });

    it('should return 500 for database errors on reset-password', async () => {
      const mockDB = createMockDB(() => {
        throw new Error('Database connection failed');
      });

      const app = createTestApp(mockDB);

      const response = await makeRequest(app, 'POST', '/api/auth/reset-password', {
        token: 'some-token',
        password: 'newpassword123'
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Password reset failed');
    });
  });
});
