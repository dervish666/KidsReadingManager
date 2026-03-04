/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('../../utils/crypto.js', () => ({
  createJWTPayload: vi.fn(),
  createAccessToken: vi.fn(),
  createRefreshToken: vi.fn(),
  hashToken: vi.fn(),
  buildRefreshCookie: (token, isProduction) => {
    return [`refresh_token=${token}`, 'HttpOnly', 'Path=/api/auth', `Max-Age=${7*24*60*60}`, 'SameSite=Strict', isProduction ? 'Secure' : ''].filter(Boolean).join('; ');
  },
  buildClearRefreshCookie: (isProduction) => {
    return ['refresh_token=', 'HttpOnly', 'Path=/api/auth', 'Max-Age=0', 'SameSite=Strict', isProduction ? 'Secure' : ''].filter(Boolean).join('; ');
  }
}));

vi.mock('../../utils/helpers.js', () => ({
  generateId: vi.fn()
}));

vi.mock('../../utils/classAssignments.js', () => ({
  syncUserClassAssignments: vi.fn()
}));

import { myloginRouter } from '../../routes/mylogin.js';
import { createJWTPayload, createAccessToken, createRefreshToken, hashToken } from '../../utils/crypto.js';
import { generateId } from '../../utils/helpers.js';
import { syncUserClassAssignments } from '../../utils/classAssignments.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createApp() {
  const app = new Hono();
  app.route('/api/auth/mylogin', myloginRouter);
  return app;
}

function createMockEnv() {
  return {
    READING_MANAGER_DB: createMockDb(),
    READING_MANAGER_KV: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    },
    JWT_SECRET: 'test-secret',
    MYLOGIN_CLIENT_ID: 'test-client-id',
    MYLOGIN_CLIENT_SECRET: 'test-client-secret',
    MYLOGIN_REDIRECT_URI: 'https://tallyreading.uk/api/auth/mylogin/callback',
    ENVIRONMENT: 'development'
  };
}

function createMockDb() {
  const mockStatement = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] })
  };

  return {
    prepare: vi.fn().mockReturnValue(mockStatement),
    _statement: mockStatement
  };
}

/**
 * Standard MyLogin user profile response
 */
function makeUserProfile(overrides = {}) {
  return {
    id: 'ml-user-123',
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane.smith@school.org',
    type: 'employee',
    service_providers: {
      wonde: { service_provider_id: 'wonde-emp-456' }
    },
    organisation: {
      wonde_id: 'A1234567890'
    },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MyLogin OAuth Routes', () => {
  let app;
  let env;
  let originalFetch;

  beforeEach(() => {
    vi.clearAllMocks();

    app = createApp();
    env = createMockEnv();

    // Save original fetch
    originalFetch = global.fetch;

    // Default mock return values for crypto functions
    createJWTPayload.mockReturnValue({
      sub: 'user-id-1',
      email: 'jane.smith@school.org',
      name: 'Jane Smith',
      org: 'org-id-1',
      orgSlug: 'cheddar-grove',
      role: 'teacher'
    });
    createAccessToken.mockResolvedValue('mock-access-token');
    createRefreshToken.mockResolvedValue({
      token: 'mock-refresh-token',
      hash: 'mock-refresh-hash',
      expiresAt: '2026-03-03T00:00:00.000Z'
    });
    hashToken.mockResolvedValue('hashed-refresh-token');
    generateId.mockReturnValue('generated-id-1');
    syncUserClassAssignments.mockResolvedValue(0);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // GET /login
  // =========================================================================
  describe('GET /login', () => {
    it('redirects to the MyLogin authorize URL', async () => {
      const res = await app.request('/api/auth/mylogin/login', { method: 'GET' }, env);

      expect(res.status).toBe(302);

      const location = res.headers.get('Location');
      expect(location).toContain('https://app.mylogin.com/oauth/authorize');
      expect(location).toContain('client_id=test-client-id');
      expect(location).toContain('redirect_uri=');
      expect(location).toContain('response_type=code');
      expect(location).toContain('state=');
    });

    it('stores the state parameter in D1 for strong consistency', async () => {
      await app.request('/api/auth/mylogin/login', { method: 'GET' }, env);

      // Should have inserted state into D1 oauth_state table
      const insertCall = env.READING_MANAGER_DB.prepare.mock.calls.find(
        call => call[0].includes('INSERT INTO oauth_state')
      );
      expect(insertCall).toBeDefined();

      // State should be a UUID
      const state = env.READING_MANAGER_DB._statement.bind.mock.calls[0][0];
      expect(state).toMatch(/^[0-9a-f]{8}-/);
    });

    it('falls back to KV when D1 is not available', async () => {
      delete env.READING_MANAGER_DB;

      await app.request('/api/auth/mylogin/login', { method: 'GET' }, env);

      expect(env.READING_MANAGER_KV.put).toHaveBeenCalledTimes(1);

      const [key, value, options] = env.READING_MANAGER_KV.put.mock.calls[0];
      expect(key).toMatch(/^oauth_state:/);
      expect(value).toBe('1');
      expect(options).toEqual({ expirationTtl: 300 });
    });

    it('uses a unique state parameter for CSRF protection', async () => {
      await app.request('/api/auth/mylogin/login', { method: 'GET' }, env);

      const state1 = env.READING_MANAGER_DB._statement.bind.mock.calls[0][0];

      vi.clearAllMocks();

      await app.request('/api/auth/mylogin/login', { method: 'GET' }, env);

      const state2 = env.READING_MANAGER_DB._statement.bind.mock.calls[0][0];

      // State values should be different between requests (UUIDs)
      expect(state1).not.toBe(state2);
    });
  });

  // =========================================================================
  // GET /callback
  // =========================================================================
  describe('GET /callback', () => {
    /**
     * Helper to set up fetch mock for token exchange and user profile
     */
    function setupFetchMock(userProfile = makeUserProfile()) {
      global.fetch = vi.fn().mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();

        // Token exchange
        if (urlStr.includes('/oauth/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              access_token: 'mylogin-access-token',
              token_type: 'Bearer'
            })
          });
        }

        // User profile
        if (urlStr.includes('/api/user')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(userProfile)
          });
        }

        return Promise.resolve({ ok: false, status: 404 });
      });
    }

    /**
     * Helper to set up DB mock for callback tests
     */
    function setupDbForCallback(options = {}) {
      const {
        orgFound = true,
        existingUser = null,
        employeeClasses = []
      } = options;

      const db = env.READING_MANAGER_DB;

      db.prepare.mockImplementation((sql) => {
        // Match org by wonde_school_id
        if (sql.includes('SELECT') && sql.includes('organizations') && sql.includes('wonde_school_id')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(
                orgFound ? { id: 'org-id-1', slug: 'cheddar-grove', name: 'Cheddar Grove Primary' } : null
              )
            })
          };
        }

        // Find user by mylogin_id
        if (sql.includes('SELECT') && sql.includes('users') && sql.includes('mylogin_id')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(existingUser)
            })
          };
        }

        // Update existing user
        if (sql.includes('UPDATE') && sql.includes('users')) {
          return {
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true })
            })
          };
        }

        // Insert new user
        if (sql.includes('INSERT INTO users')) {
          return {
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true })
            })
          };
        }

        // Look up wonde_employee_classes
        if (sql.includes('wonde_employee_classes')) {
          return {
            bind: vi.fn().mockReturnValue({
              all: vi.fn().mockResolvedValue({ results: employeeClasses })
            })
          };
        }

        // Look up class by wonde_class_id
        if (sql.includes('SELECT') && sql.includes('classes') && sql.includes('wonde_class_id')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ id: 'tally-class-1' })
            })
          };
        }

        // Insert class_assignments
        if (sql.includes('class_assignments')) {
          return {
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true })
            })
          };
        }

        // Insert refresh token
        if (sql.includes('INSERT INTO refresh_tokens')) {
          return {
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true })
            })
          };
        }

        // Find student by wonde_student_id
        if (sql.includes('SELECT') && sql.includes('students') && sql.includes('wonde_student_id')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue(null)
            })
          };
        }

        // Verify OAuth state from D1
        if (sql.includes('oauth_state') && sql.includes('SELECT')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ state: 'valid-state' })
            })
          };
        }

        // Delete OAuth state from D1
        if (sql.includes('oauth_state') && sql.includes('DELETE')) {
          return {
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true })
            })
          };
        }

        // Default fallback
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn().mockResolvedValue({ success: true }),
            all: vi.fn().mockResolvedValue({ results: [] })
          })
        };
      });
    }

    // -----------------------------------------------------------------------
    // Happy path: new teacher
    // -----------------------------------------------------------------------
    it('creates a new teacher user, issues JWT, and redirects on callback', async () => {
      setupFetchMock();
      setupDbForCallback({
        orgFound: true,
        existingUser: null,
        employeeClasses: [
          { wonde_class_id: 'wonde-class-A' },
          { wonde_class_id: 'wonde-class-B' }
        ]
      });

      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      const res = await app.request(
        '/api/auth/mylogin/callback?code=auth-code-123&state=test-state-param',
        { method: 'GET' },
        env
      );

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/?auth=callback');

      // Should have verified state from D1 (strongly consistent)
      const stateSelect = env.READING_MANAGER_DB.prepare.mock.calls.find(
        call => call[0].includes('SELECT') && call[0].includes('oauth_state')
      );
      expect(stateSelect).toBeDefined();

      // Should have deleted state from D1 after verification
      const stateDelete = env.READING_MANAGER_DB.prepare.mock.calls.find(
        call => call[0].includes('DELETE') && call[0].includes('oauth_state')
      );
      expect(stateDelete).toBeDefined();

      // Should have exchanged code for token
      expect(global.fetch).toHaveBeenCalledWith(
        'https://app.mylogin.com/oauth/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded'
          })
        })
      );

      // Should have fetched user profile
      expect(global.fetch).toHaveBeenCalledWith(
        'https://app.mylogin.com/api/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mylogin-access-token'
          })
        })
      );

      // Should have stored refresh token
      const refreshInsert = env.READING_MANAGER_DB.prepare.mock.calls.find(
        call => call[0].includes('INSERT INTO refresh_tokens')
      );
      expect(refreshInsert).toBeDefined();

      // Should have set the cookie
      const cookie = res.headers.get('Set-Cookie');
      expect(cookie).toContain('refresh_token=mock-refresh-token');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/auth');
    });

    it('maps employee type to teacher role', async () => {
      setupFetchMock(makeUserProfile({ type: 'employee' }));
      setupDbForCallback({ orgFound: true, existingUser: null });
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      await app.request(
        '/api/auth/mylogin/callback?code=code&state=state',
        { method: 'GET' },
        env
      );

      // The INSERT INTO users call should use 'teacher' as the role
      const insertCall = env.READING_MANAGER_DB.prepare.mock.calls.find(
        call => call[0].includes('INSERT INTO users')
      );
      expect(insertCall).toBeDefined();

      // Find the bind call for the INSERT (role should be in args)
      const insertStatementIdx = env.READING_MANAGER_DB.prepare.mock.calls.findIndex(
        call => call[0].includes('INSERT INTO users')
      );
      const bindArgs = env.READING_MANAGER_DB.prepare.mock.results[insertStatementIdx].value.bind.mock.calls[0];

      // bindArgs should contain 'teacher' as the role
      expect(bindArgs).toContain('teacher');
    });

    it('syncs class assignments for new teachers via syncUserClassAssignments', async () => {
      syncUserClassAssignments.mockResolvedValue(1);

      setupFetchMock(makeUserProfile({ type: 'employee' }));
      setupDbForCallback({
        orgFound: true,
        existingUser: null
      });
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      await app.request(
        '/api/auth/mylogin/callback?code=code&state=state',
        { method: 'GET' },
        env
      );

      // Should have called the shared helper
      expect(syncUserClassAssignments).toHaveBeenCalledWith(
        env.READING_MANAGER_DB,
        'generated-id-1',      // userId from generateId mock
        'wonde-emp-456',       // wondeEmployeeId from profile
        'org-id-1'             // org.id
      );
    });

    // -----------------------------------------------------------------------
    // Existing user
    // -----------------------------------------------------------------------
    it('updates an existing user and issues a new JWT', async () => {
      const existingUser = {
        id: 'existing-user-id',
        organization_id: 'org-id-1',
        name: 'Jane Old Name',
        email: 'jane.old@school.org',
        role: 'teacher',
        mylogin_id: 'ml-user-123'
      };

      setupFetchMock();
      setupDbForCallback({ orgFound: true, existingUser });
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      const res = await app.request(
        '/api/auth/mylogin/callback?code=code&state=state',
        { method: 'GET' },
        env
      );

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/?auth=callback');

      // Should have updated the existing user, not inserted
      const updateCall = env.READING_MANAGER_DB.prepare.mock.calls.find(
        call => call[0].includes('UPDATE') && call[0].includes('users')
      );
      expect(updateCall).toBeDefined();

      // Should NOT have inserted a new user
      const insertCall = env.READING_MANAGER_DB.prepare.mock.calls.find(
        call => call[0].includes('INSERT INTO users')
      );
      expect(insertCall).toBeUndefined();

      // Should have used existing user ID for JWT
      expect(createJWTPayload).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'existing-user-id' }),
        expect.any(Object)
      );
    });

    // -----------------------------------------------------------------------
    // Existing teacher: class assignment sync
    // -----------------------------------------------------------------------
    it('syncs class assignments for an existing teacher on login', async () => {
      const existingTeacher = {
        id: 'existing-teacher-id',
        organization_id: 'org-id-1',
        name: 'Jane Smith',
        email: 'jane.smith@school.org',
        role: 'teacher',
        mylogin_id: 'ml-user-123'
      };

      syncUserClassAssignments.mockResolvedValue(2);

      setupFetchMock();
      setupDbForCallback({ orgFound: true, existingUser: existingTeacher });
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      const res = await app.request(
        '/api/auth/mylogin/callback?code=code&state=state',
        { method: 'GET' },
        env
      );

      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/?auth=callback');

      // Should have called syncUserClassAssignments with the right args
      expect(syncUserClassAssignments).toHaveBeenCalledWith(
        env.READING_MANAGER_DB,
        'existing-teacher-id',
        'wonde-emp-456',
        'org-id-1'
      );
    });

    it('does not sync class assignments for non-teacher users', async () => {
      const existingAdmin = {
        id: 'existing-admin-id',
        organization_id: 'org-id-1',
        name: 'Admin User',
        email: 'admin@school.org',
        role: 'admin',
        mylogin_id: 'ml-user-123'
      };

      setupFetchMock(makeUserProfile({ type: 'admin' }));
      setupDbForCallback({ orgFound: true, existingUser: existingAdmin });
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      await app.request(
        '/api/auth/mylogin/callback?code=code&state=state',
        { method: 'GET' },
        env
      );

      expect(syncUserClassAssignments).not.toHaveBeenCalled();
    });

    it('does not crash if class assignment sync fails', async () => {
      const existingTeacher = {
        id: 'existing-teacher-id',
        organization_id: 'org-id-1',
        name: 'Jane Smith',
        email: 'jane.smith@school.org',
        role: 'teacher',
        mylogin_id: 'ml-user-123'
      };

      syncUserClassAssignments.mockRejectedValue(new Error('DB error'));

      setupFetchMock();
      setupDbForCallback({ orgFound: true, existingUser: existingTeacher });
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      const res = await app.request(
        '/api/auth/mylogin/callback?code=code&state=state',
        { method: 'GET' },
        env
      );

      // Should still succeed — class sync error is non-fatal
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/?auth=callback');
    });

    // -----------------------------------------------------------------------
    // Invalid state
    // -----------------------------------------------------------------------
    it('redirects to /login to start SP-initiated flow when state is invalid', async () => {
      env.READING_MANAGER_KV.get.mockResolvedValue(null);

      const res = await app.request(
        '/api/auth/mylogin/callback?code=code&state=bad-state',
        { method: 'GET' },
        env
      );

      // Should redirect to /login to start a fresh SP-initiated flow
      // (supports IDP-initiated login from MyLogin's site)
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/api/auth/mylogin/login');
    });

    // -----------------------------------------------------------------------
    // Org not found
    // -----------------------------------------------------------------------
    it('returns error when school is not set up in Tally', async () => {
      setupFetchMock();
      setupDbForCallback({ orgFound: false });
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      const res = await app.request(
        '/api/auth/mylogin/callback?code=code&state=state',
        { method: 'GET' },
        env
      );

      const status = res.status;
      if (status === 302) {
        const location = res.headers.get('Location');
        expect(location).toContain('error');
      } else {
        expect(status).toBe(400);
      }
    });

    // -----------------------------------------------------------------------
    // Student login
    // -----------------------------------------------------------------------
    it('creates a student user with readonly role', async () => {
      setupFetchMock(makeUserProfile({
        type: 'student',
        service_providers: {
          wonde: { service_provider_id: 'wonde-student-789' }
        }
      }));
      setupDbForCallback({ orgFound: true, existingUser: null });
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      await app.request(
        '/api/auth/mylogin/callback?code=code&state=state',
        { method: 'GET' },
        env
      );

      // The INSERT INTO users call should use 'readonly' as the role
      const insertCallIdx = env.READING_MANAGER_DB.prepare.mock.calls.findIndex(
        call => call[0].includes('INSERT INTO users')
      );
      expect(insertCallIdx).not.toBe(-1);

      const bindArgs = env.READING_MANAGER_DB.prepare.mock.results[insertCallIdx].value.bind.mock.calls[0];
      expect(bindArgs).toContain('readonly');
    });

    // -----------------------------------------------------------------------
    // Admin login
    // -----------------------------------------------------------------------
    it('creates an admin user with admin role', async () => {
      setupFetchMock(makeUserProfile({ type: 'admin' }));
      setupDbForCallback({ orgFound: true, existingUser: null });
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      await app.request(
        '/api/auth/mylogin/callback?code=code&state=state',
        { method: 'GET' },
        env
      );

      const insertCallIdx = env.READING_MANAGER_DB.prepare.mock.calls.findIndex(
        call => call[0].includes('INSERT INTO users')
      );
      expect(insertCallIdx).not.toBe(-1);

      const bindArgs = env.READING_MANAGER_DB.prepare.mock.results[insertCallIdx].value.bind.mock.calls[0];
      expect(bindArgs).toContain('admin');
    });

    // -----------------------------------------------------------------------
    // MyLogin API error (token exchange fails)
    // -----------------------------------------------------------------------
    it('returns error when MyLogin token exchange fails', async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('/oauth/token')) {
          return Promise.resolve({
            ok: false,
            status: 400,
            text: () => Promise.resolve('Bad Request')
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      const res = await app.request(
        '/api/auth/mylogin/callback?code=bad-code&state=state',
        { method: 'GET' },
        env
      );

      const status = res.status;
      if (status === 302) {
        const location = res.headers.get('Location');
        expect(location).toContain('error');
      } else {
        expect(status).toBe(500);
      }
    });

    // -----------------------------------------------------------------------
    // MyLogin API error (user profile fetch fails)
    // -----------------------------------------------------------------------
    it('returns error when MyLogin user profile fetch fails', async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('/oauth/token')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ access_token: 'tok', token_type: 'Bearer' })
          });
        }
        if (urlStr.includes('/api/user')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Internal Server Error')
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      const res = await app.request(
        '/api/auth/mylogin/callback?code=code&state=state',
        { method: 'GET' },
        env
      );

      const status = res.status;
      if (status === 302) {
        const location = res.headers.get('Location');
        expect(location).toContain('error');
      } else {
        expect(status).toBe(500);
      }
    });

    // -----------------------------------------------------------------------
    // Token exchange sends correct authorization header
    // -----------------------------------------------------------------------
    it('sends Basic auth header with base64-encoded client_id:client_secret', async () => {
      setupFetchMock();
      setupDbForCallback({ orgFound: true, existingUser: null });
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      await app.request(
        '/api/auth/mylogin/callback?code=code&state=state',
        { method: 'GET' },
        env
      );

      const tokenCall = global.fetch.mock.calls.find(
        call => call[0].includes('/oauth/token')
      );
      expect(tokenCall).toBeDefined();

      const expectedAuth = 'Basic ' + btoa('test-client-id:test-client-secret');
      expect(tokenCall[1].headers.Authorization).toBe(expectedAuth);
    });

    // -----------------------------------------------------------------------
    // User name is constructed from first_name + last_name
    // -----------------------------------------------------------------------
    it('constructs user name from first_name and last_name', async () => {
      setupFetchMock(makeUserProfile({
        first_name: 'John',
        last_name: 'Doe'
      }));
      setupDbForCallback({ orgFound: true, existingUser: null });
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      await app.request(
        '/api/auth/mylogin/callback?code=code&state=state',
        { method: 'GET' },
        env
      );

      // Check that the INSERT uses 'John Doe' as the name
      const insertCallIdx = env.READING_MANAGER_DB.prepare.mock.calls.findIndex(
        call => call[0].includes('INSERT INTO users')
      );
      if (insertCallIdx !== -1) {
        const bindArgs = env.READING_MANAGER_DB.prepare.mock.results[insertCallIdx].value.bind.mock.calls[0];
        expect(bindArgs).toContain('John Doe');
      }
    });

    // -----------------------------------------------------------------------
    // Sets auth_provider to 'mylogin' for new users
    // -----------------------------------------------------------------------
    it('sets auth_provider to mylogin for new users', async () => {
      setupFetchMock();
      setupDbForCallback({ orgFound: true, existingUser: null });
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      await app.request(
        '/api/auth/mylogin/callback?code=code&state=state',
        { method: 'GET' },
        env
      );

      const insertCallIdx = env.READING_MANAGER_DB.prepare.mock.calls.findIndex(
        call => call[0].includes('INSERT INTO users')
      );
      expect(insertCallIdx).not.toBe(-1);

      const bindArgs = env.READING_MANAGER_DB.prepare.mock.results[insertCallIdx].value.bind.mock.calls[0];
      expect(bindArgs).toContain('mylogin');
    });
  });

  // =========================================================================
  // POST /logout
  // =========================================================================
  describe('POST /logout', () => {
    it('revokes the refresh token and clears the cookie', async () => {
      hashToken.mockResolvedValue('hashed-token-value');

      const db = env.READING_MANAGER_DB;
      db.prepare.mockImplementation((sql) => {
        if (sql.includes('UPDATE refresh_tokens') && sql.includes('revoked_at')) {
          return {
            bind: vi.fn().mockReturnValue({
              run: vi.fn().mockResolvedValue({ success: true })
            })
          };
        }
        return {
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({ success: true }),
            first: vi.fn().mockResolvedValue(null)
          })
        };
      });

      const res = await app.request(
        '/api/auth/mylogin/logout',
        {
          method: 'POST',
          headers: {
            cookie: 'refresh_token=some-refresh-token'
          }
        },
        env
      );

      expect(res.status).toBe(200);
      const json = await res.json();

      // Should return the MyLogin logout URL
      expect(json.logoutUrl).toContain('https://app.mylogin.com/oauth/logout');
      expect(json.logoutUrl).toContain('client_id=test-client-id');

      // Should have revoked the refresh token
      const revokeCall = db.prepare.mock.calls.find(
        call => call[0].includes('UPDATE refresh_tokens') && call[0].includes('revoked_at')
      );
      expect(revokeCall).toBeDefined();

      // Should have cleared the cookie
      const cookie = res.headers.get('Set-Cookie');
      expect(cookie).toContain('refresh_token=');
      expect(cookie).toContain('Max-Age=0');
    });

    it('returns logout URL even when no refresh token is present', async () => {
      const res = await app.request(
        '/api/auth/mylogin/logout',
        { method: 'POST' },
        env
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.logoutUrl).toContain('https://app.mylogin.com/oauth/logout');
    });

    it('hashes the refresh token before revoking', async () => {
      const db = env.READING_MANAGER_DB;
      db.prepare.mockImplementation(() => ({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true })
        })
      }));

      await app.request(
        '/api/auth/mylogin/logout',
        {
          method: 'POST',
          headers: {
            cookie: 'refresh_token=the-token'
          }
        },
        env
      );

      expect(hashToken).toHaveBeenCalledWith('the-token');
    });
  });
});
