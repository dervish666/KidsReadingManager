/**
 * @vitest-environment node
 *
 * Integration test: Wonde webhook + sync + MyLogin OAuth full flow
 *
 * Tests the connected system of route handlers with mocked external APIs
 * (Wonde API, MyLogin API) and mock D1. Verifies:
 *
 *   1. Webhook schoolApproved creates org, encrypts token, triggers sync
 *   2. MyLogin OAuth callback creates a new teacher with correct role/JWT
 *   3. Subsequent MyLogin login finds existing user (no duplicate)
 *   4. Webhook accessRevoked soft-deletes the organization
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that use them
// ---------------------------------------------------------------------------

vi.mock('../../utils/crypto.js', async () => {
  const actual = await vi.importActual('../../utils/crypto.js');
  return {
    ...actual,
    encryptSensitiveData: vi.fn().mockResolvedValue('encrypted:school-token'),
    decryptSensitiveData: vi.fn().mockResolvedValue('raw-school-token'),
    createJWTPayload: vi.fn().mockReturnValue({
      sub: 'user-id',
      email: 'jane@school.org',
      name: 'Jane Teacher',
      org: 'org-id',
      orgSlug: 'furlong-school',
      role: 'teacher',
    }),
    createAccessToken: vi.fn().mockResolvedValue('mock-access-token'),
    createRefreshToken: vi.fn().mockResolvedValue({
      token: 'mock-refresh-token',
      hash: 'mock-refresh-hash',
      expiresAt: '2026-03-03T00:00:00.000Z',
    }),
    hashToken: vi.fn().mockResolvedValue('hashed-token'),
  };
});

vi.mock('../../services/wondeSync.js', () => ({
  runFullSync: vi.fn().mockResolvedValue({
    status: 'completed',
    counts: { students: 10, classes: 3, employees: 5, deletions: 0 },
  }),
}));

vi.mock('../../utils/helpers.js', () => ({
  generateId: vi.fn().mockReturnValue('generated-id-1'),
  generateUniqueSlug: vi.fn().mockImplementation(async (_db, name) => {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
    return slug || 'org';
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import webhooksRouter from '../../routes/webhooks.js';
import { myloginRouter } from '../../routes/mylogin.js';
import { encryptSensitiveData } from '../../utils/crypto.js';
import { createJWTPayload, createAccessToken, createRefreshToken } from '../../utils/crypto.js';
import { runFullSync } from '../../services/wondeSync.js';
import { generateId } from '../../utils/helpers.js';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const WONDE_SCHOOL_ID = 'A2032141745';
const SCHOOL_NAME = 'Furlong School';
const SCHOOL_TOKEN = 'tok_furlong_abc123';

const MYLOGIN_USER_PROFILE = {
  id: 'ml-user-789',
  first_name: 'Jane',
  last_name: 'Teacher',
  email: 'jane@furlongschool.org',
  type: 'employee',
  service_providers: {
    wonde: { service_provider_id: 'wonde-emp-456' },
  },
  organisation: {
    wonde_id: WONDE_SCHOOL_ID,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a Hono app with both webhook and MyLogin routers mounted.
 */
function createApp() {
  const app = new Hono();
  app.route('/api/webhooks', webhooksRouter);
  app.route('/api/auth/mylogin', myloginRouter);
  return app;
}

/**
 * Create a mock D1 database with SQL-aware prepare that returns different
 * responses depending on the query text.
 *
 * @param {Object} overrides - Optional per-query response overrides
 *   { orgByWondeId, userByMyloginId, employeeClasses }
 */
function createMockDb(overrides = {}) {
  const { orgByWondeId = null, userByMyloginId = null, employeeClasses = [] } = overrides;

  const db = {
    prepare: vi.fn(),
    batch: vi.fn().mockResolvedValue([]),
  };

  db.prepare.mockImplementation((sql) => {
    // SELECT org by wonde_school_id
    if (
      sql.includes('SELECT') &&
      sql.includes('organizations') &&
      sql.includes('wonde_school_id')
    ) {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(orgByWondeId),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    }

    // INSERT organization
    if (sql.includes('INSERT INTO organizations')) {
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    }

    // UPDATE organizations (soft delete)
    if (sql.includes('UPDATE organizations') && sql.includes('is_active')) {
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    }

    // SELECT user by mylogin_id
    if (sql.includes('SELECT') && sql.includes('users') && sql.includes('mylogin_id')) {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(userByMyloginId),
        }),
      };
    }

    // UPDATE existing user
    if (sql.includes('UPDATE') && sql.includes('users')) {
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    }

    // INSERT new user
    if (sql.includes('INSERT INTO users')) {
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    }

    // SELECT wonde_employee_classes
    if (sql.includes('wonde_employee_classes')) {
      return {
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: employeeClasses }),
        }),
      };
    }

    // SELECT class by wonde_class_id
    if (sql.includes('SELECT') && sql.includes('classes') && sql.includes('wonde_class_id')) {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ id: 'tally-class-1' }),
        }),
      };
    }

    // INSERT class_assignments
    if (sql.includes('class_assignments')) {
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    }

    // INSERT refresh_tokens
    if (sql.includes('INSERT INTO refresh_tokens')) {
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    }

    // Default fallback
    return {
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    };
  });

  return db;
}

/**
 * Create the mock environment for both webhooks and MyLogin routes.
 */
const WEBHOOK_SECRET = 'test-webhook-secret';

function createMockEnv(dbOverrides = {}) {
  return {
    READING_MANAGER_DB: createMockDb(dbOverrides),
    READING_MANAGER_KV: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
    JWT_SECRET: 'test-secret-key',
    WONDE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    MYLOGIN_CLIENT_ID: 'test-client-id',
    MYLOGIN_CLIENT_SECRET: 'test-client-secret',
    MYLOGIN_REDIRECT_URI: 'https://tallyreading.uk/api/auth/mylogin/callback',
    ENVIRONMENT: 'development',
  };
}

/**
 * Set up global.fetch mock for MyLogin token exchange and user profile.
 */
function setupMyLoginFetch(userProfile = MYLOGIN_USER_PROFILE) {
  global.fetch = vi.fn().mockImplementation((url) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    // Token exchange
    if (urlStr.includes('/oauth/token')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'mylogin-access-token',
            token_type: 'Bearer',
          }),
      });
    }

    // User profile
    if (urlStr.includes('/api/user')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(userProfile),
      });
    }

    return Promise.resolve({ ok: false, status: 404 });
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Wonde + MyLogin Integration', () => {
  let app;
  let originalFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = global.fetch;
    app = createApp();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // Test 1: Full webhook schoolApproved flow
  // =========================================================================
  describe('Webhook schoolApproved -> org created + sync triggered', () => {
    it('creates an organization, encrypts the token, and triggers sync', async () => {
      const env = createMockEnv();

      const res = await app.request(
        `/api/webhooks/wonde`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': WEBHOOK_SECRET },
          body: JSON.stringify({
            payload_type: 'schoolApproved',
            school_id: WONDE_SCHOOL_ID,
            school_name: SCHOOL_NAME,
            school_token: SCHOOL_TOKEN,
          }),
        },
        env
      );

      const json = await res.json();

      // Response is successful
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.success).toBe(true);

      // Token was encrypted
      expect(encryptSensitiveData).toHaveBeenCalledWith(SCHOOL_TOKEN, 'test-secret-key');

      // Organization INSERT called with correct fields
      const insertCall = env.READING_MANAGER_DB.prepare.mock.calls.find((call) =>
        call[0].includes('INSERT INTO organizations')
      );
      expect(insertCall).toBeDefined();

      // Find the bind args for the INSERT
      const insertIdx = env.READING_MANAGER_DB.prepare.mock.calls.findIndex((call) =>
        call[0].includes('INSERT INTO organizations')
      );
      const bindArgs =
        env.READING_MANAGER_DB.prepare.mock.results[insertIdx].value.bind.mock.calls[0];

      // bindArgs: [orgId, school_name, slug, wonde_school_id, encrypted_token]
      expect(bindArgs[1]).toBe(SCHOOL_NAME);
      expect(bindArgs[2]).toBe('furlong-school'); // slug
      expect(bindArgs[3]).toBe(WONDE_SCHOOL_ID);
      expect(bindArgs[4]).toBe('encrypted:school-token');

      // Sync triggered with correct parameters
      expect(runFullSync).toHaveBeenCalledWith(
        expect.any(String), // orgId
        SCHOOL_TOKEN,
        WONDE_SCHOOL_ID,
        env.READING_MANAGER_DB,
        expect.objectContaining({ kv: expect.anything() })
      );
    });
  });

  // =========================================================================
  // Test 2: MyLogin callback creates a new teacher
  // =========================================================================
  describe('MyLogin callback -> new teacher user created', () => {
    it('creates a new teacher user with correct role, auth_provider, and JWT', async () => {
      const orgData = { id: 'org-id-1', slug: 'furlong-school', name: SCHOOL_NAME };
      const env = createMockEnv({
        orgByWondeId: orgData,
        userByMyloginId: null, // no existing user
        employeeClasses: [{ wonde_class_id: 'wonde-class-A' }],
      });

      setupMyLoginFetch();

      // Valid state in KV
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      const res = await app.request(
        '/api/auth/mylogin/callback?code=auth-code-123&state=test-state',
        { method: 'GET' },
        env
      );

      // Should redirect to app
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/?auth=callback');

      // State was verified and deleted
      expect(env.READING_MANAGER_KV.get).toHaveBeenCalledWith('oauth_state:test-state');
      expect(env.READING_MANAGER_KV.delete).toHaveBeenCalledWith('oauth_state:test-state');

      // Token exchange and user profile fetched
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://app.mylogin.com/oauth/token',
        expect.objectContaining({ method: 'POST' })
      );
      expect(global.fetch).toHaveBeenCalledWith(
        'https://app.mylogin.com/api/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mylogin-access-token',
          }),
        })
      );

      // User INSERT was called (not UPDATE)
      const insertCall = env.READING_MANAGER_DB.prepare.mock.calls.find((call) =>
        call[0].includes('INSERT INTO users')
      );
      expect(insertCall).toBeDefined();

      // Verify INSERT bind args contain correct values
      const insertIdx = env.READING_MANAGER_DB.prepare.mock.calls.findIndex((call) =>
        call[0].includes('INSERT INTO users')
      );
      const bindArgs =
        env.READING_MANAGER_DB.prepare.mock.results[insertIdx].value.bind.mock.calls[0];

      expect(bindArgs).toContain('Jane Teacher'); // name
      expect(bindArgs).toContain('jane@furlongschool.org'); // email
      expect(bindArgs).toContain('mylogin'); // auth_provider
      expect(bindArgs).toContain('teacher'); // role (employee -> teacher)
      expect(bindArgs).toContain(String(MYLOGIN_USER_PROFILE.id)); // mylogin_id
      expect(bindArgs).toContain('wonde-emp-456'); // wonde_employee_id

      // Refresh token was created (access token is obtained via /api/auth/refresh after redirect)
      expect(createRefreshToken).toHaveBeenCalled();

      // Refresh token stored in DB
      const refreshInsert = env.READING_MANAGER_DB.prepare.mock.calls.find((call) =>
        call[0].includes('INSERT INTO refresh_tokens')
      );
      expect(refreshInsert).toBeDefined();

      // Cookie set with refresh token
      const cookie = res.headers.get('Set-Cookie');
      expect(cookie).toContain('refresh_token=mock-refresh-token');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/api/auth');

      // Employee classes looked up for new teacher
      const classLookup = env.READING_MANAGER_DB.prepare.mock.calls.find((call) =>
        call[0].includes('wonde_employee_classes')
      );
      expect(classLookup).toBeDefined();
    });
  });

  // =========================================================================
  // Test 3: MyLogin callback finds existing user (no duplicate)
  // =========================================================================
  describe('MyLogin callback -> existing user found', () => {
    it('updates existing user and issues JWT without creating a duplicate', async () => {
      const orgData = { id: 'org-id-1', slug: 'furlong-school', name: SCHOOL_NAME };
      const existingUser = {
        id: 'existing-user-id',
        organization_id: 'org-id-1',
        name: 'Jane OldName',
        email: 'jane.old@school.org',
        role: 'teacher',
        mylogin_id: String(MYLOGIN_USER_PROFILE.id),
      };

      const env = createMockEnv({
        orgByWondeId: orgData,
        userByMyloginId: existingUser,
      });

      setupMyLoginFetch();
      env.READING_MANAGER_KV.get.mockResolvedValue('1');

      const res = await app.request(
        '/api/auth/mylogin/callback?code=auth-code-456&state=test-state-2',
        { method: 'GET' },
        env
      );

      // Still redirects successfully
      expect(res.status).toBe(302);
      expect(res.headers.get('Location')).toBe('/?auth=callback');

      // UPDATE was called on the existing user
      const updateCall = env.READING_MANAGER_DB.prepare.mock.calls.find(
        (call) => call[0].includes('UPDATE') && call[0].includes('users')
      );
      expect(updateCall).toBeDefined();

      // INSERT INTO users was NOT called (no duplicate)
      const insertCall = env.READING_MANAGER_DB.prepare.mock.calls.find((call) =>
        call[0].includes('INSERT INTO users')
      );
      expect(insertCall).toBeUndefined();

      // Refresh token stored and cookie set
      const refreshInsert = env.READING_MANAGER_DB.prepare.mock.calls.find((call) =>
        call[0].includes('INSERT INTO refresh_tokens')
      );
      expect(refreshInsert).toBeDefined();

      const cookie = res.headers.get('Set-Cookie');
      expect(cookie).toContain('refresh_token=mock-refresh-token');
    });
  });

  // =========================================================================
  // Test 4: Webhook accessRevoked soft-deletes the organization
  // =========================================================================
  describe('Webhook accessRevoked -> org soft-deleted', () => {
    it('sets is_active = 0 on the organization', async () => {
      const env = createMockEnv({
        orgByWondeId: { id: 'org-id-1', slug: 'furlong-school', name: SCHOOL_NAME },
      });

      const res = await app.request(
        `/api/webhooks/wonde`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': WEBHOOK_SECRET },
          body: JSON.stringify({
            payload_type: 'accessRevoked',
            school_id: WONDE_SCHOOL_ID,
            school_name: SCHOOL_NAME,
            revoke_reason: 'Switching to a different platform',
          }),
        },
        env
      );

      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      // SELECT to find the org by wonde_school_id
      const selectCall = env.READING_MANAGER_DB.prepare.mock.calls.find(
        (call) => call[0].includes('SELECT') && call[0].includes('wonde_school_id')
      );
      expect(selectCall).toBeDefined();

      // UPDATE setting is_active = 0
      const updateCall = env.READING_MANAGER_DB.prepare.mock.calls.find(
        (call) => call[0].includes('UPDATE organizations') && call[0].includes('is_active = 0')
      );
      expect(updateCall).toBeDefined();

      // No sync was triggered (unlike schoolApproved)
      expect(runFullSync).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Test 5: End-to-end sequence — approve, login, re-login, revoke
  // =========================================================================
  describe('Full lifecycle: approve -> login -> re-login -> revoke', () => {
    it('processes a complete school lifecycle correctly', async () => {
      // Step 1: School approves via webhook
      const step1Env = createMockEnv();
      const webhookRes = await app.request(
        `/api/webhooks/wonde`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': WEBHOOK_SECRET },
          body: JSON.stringify({
            payload_type: 'schoolApproved',
            school_id: WONDE_SCHOOL_ID,
            school_name: SCHOOL_NAME,
            school_token: SCHOOL_TOKEN,
          }),
        },
        step1Env
      );

      const webhookJson = await webhookRes.json();
      expect(webhookRes.status).toBe(200);
      expect(webhookJson.success).toBe(true);

      // Verify org was created and sync triggered
      expect(encryptSensitiveData).toHaveBeenCalled();
      expect(runFullSync).toHaveBeenCalledTimes(1);
      // Get the org ID from the runFullSync call (first argument)
      const createdOrgId = runFullSync.mock.calls[0][0];
      expect(createdOrgId).toBeDefined();

      vi.clearAllMocks();

      // Step 2: Teacher logs in via MyLogin (first time - creates user)
      const orgData = { id: createdOrgId, slug: 'furlong-school', name: SCHOOL_NAME };
      const step2Env = createMockEnv({
        orgByWondeId: orgData,
        userByMyloginId: null,
        employeeClasses: [],
      });
      setupMyLoginFetch();
      step2Env.READING_MANAGER_KV.get.mockResolvedValue('1');

      const loginRes = await app.request(
        '/api/auth/mylogin/callback?code=first-login-code&state=state-1',
        { method: 'GET' },
        step2Env
      );

      expect(loginRes.status).toBe(302);
      expect(loginRes.headers.get('Location')).toBe('/?auth=callback');

      // User INSERT was called
      const userInsert = step2Env.READING_MANAGER_DB.prepare.mock.calls.find((call) =>
        call[0].includes('INSERT INTO users')
      );
      expect(userInsert).toBeDefined();

      vi.clearAllMocks();

      // Step 3: Same teacher logs in again (finds existing user)
      const existingUser = {
        id: 'the-teacher-id',
        organization_id: createdOrgId,
        name: 'Jane Teacher',
        email: 'jane@furlongschool.org',
        role: 'teacher',
      };
      const step3Env = createMockEnv({
        orgByWondeId: orgData,
        userByMyloginId: existingUser,
      });
      setupMyLoginFetch();
      step3Env.READING_MANAGER_KV.get.mockResolvedValue('1');

      const reloginRes = await app.request(
        '/api/auth/mylogin/callback?code=second-login-code&state=state-2',
        { method: 'GET' },
        step3Env
      );

      expect(reloginRes.status).toBe(302);

      // No INSERT INTO users this time
      const noInsert = step3Env.READING_MANAGER_DB.prepare.mock.calls.find((call) =>
        call[0].includes('INSERT INTO users')
      );
      expect(noInsert).toBeUndefined();

      // UPDATE was called instead
      const updateUser = step3Env.READING_MANAGER_DB.prepare.mock.calls.find(
        (call) => call[0].includes('UPDATE') && call[0].includes('users')
      );
      expect(updateUser).toBeDefined();

      vi.clearAllMocks();

      // Step 4: School revokes access
      const step4Env = createMockEnv({
        orgByWondeId: { id: createdOrgId },
      });

      const revokeRes = await app.request(
        `/api/webhooks/wonde`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': WEBHOOK_SECRET },
          body: JSON.stringify({
            payload_type: 'accessRevoked',
            school_id: WONDE_SCHOOL_ID,
            school_name: SCHOOL_NAME,
            revoke_reason: 'Contract ended',
          }),
        },
        step4Env
      );

      expect(revokeRes.status).toBe(200);

      // Org soft-deleted
      const softDelete = step4Env.READING_MANAGER_DB.prepare.mock.calls.find(
        (call) => call[0].includes('UPDATE organizations') && call[0].includes('is_active = 0')
      );
      expect(softDelete).toBeDefined();

      // No sync triggered on revocation
      expect(runFullSync).not.toHaveBeenCalled();
    });
  });
});
