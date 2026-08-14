import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock crypto and sync modules before imports
vi.mock('../../utils/crypto.js', () => ({
  encryptSensitiveData: vi.fn(),
  constantTimeStringEqual: vi.fn((a, b) => a === b),
  getEncryptionSecret: vi.fn((env) => env.ENCRYPTION_KEY || env.JWT_SECRET),
}));

vi.mock('../../services/wondeSync.js', () => ({
  runFullSync: vi.fn(),
}));

vi.mock('../../utils/wondeApi.js', () => ({
  fetchSchoolDetails: vi.fn(),
}));

import webhooksRouter from '../../routes/webhooks.js';
import { encryptSensitiveData } from '../../utils/crypto.js';
import { runFullSync } from '../../services/wondeSync.js';
import { fetchSchoolDetails } from '../../utils/wondeApi.js';

// ---------------------------------------------------------------------------
// Helper: create a mock D1 database
// ---------------------------------------------------------------------------
function createMockDb() {
  const db = {
    prepare: vi.fn().mockImplementation(() => {
      const stmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
      // Allow chaining: bind returns the same statement
      stmt.bind.mockReturnValue(stmt);
      return stmt;
    }),
  };

  return db;
}

// ---------------------------------------------------------------------------
// Helper: create a Hono app with the webhooks router mounted
// ---------------------------------------------------------------------------
function createApp() {
  const app = new Hono();
  app.route('/api/webhooks', webhooksRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Helper: send a POST request to the webhook endpoint
// ---------------------------------------------------------------------------
// `via` selects how the shared secret is presented: the 'header' Wonde would
// use if their dashboard supported custom headers, or the 'query' string it
// actually offers. Both are accepted by the handler; see webhooks.js.
async function postWebhook(
  app,
  body,
  env,
  { secret = 'test-webhook-secret', via = 'header' } = {}
) {
  const headers = { 'Content-Type': 'application/json' };
  let path = '/api/webhooks/wonde';
  if (secret) {
    if (via === 'query') {
      // Deliberately NOT encodeURIComponent'd — this mirrors a dashboard where
      // the operator pastes the raw secret into the URL field.
      path += `?secret=${secret}`;
    } else {
      headers['X-Webhook-Secret'] = secret;
    }
  }
  return app.request(
    path,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
    env
  );
}

describe('Wonde Webhook Handler', () => {
  let app;
  let mockDb;
  let env;

  beforeEach(() => {
    vi.clearAllMocks();

    app = createApp();
    mockDb = createMockDb();
    env = {
      READING_MANAGER_DB: mockDb,
      READING_MANAGER_KV: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      JWT_SECRET: 'test-secret-key',
      WONDE_WEBHOOK_SECRET: 'test-webhook-secret',
    };

    // Default mock return values
    encryptSensitiveData.mockResolvedValue('encrypted-iv:encrypted-ciphertext');
    runFullSync.mockResolvedValue({ status: 'completed' });
    fetchSchoolDetails.mockResolvedValue({
      id: 'A1234567890',
      name: 'Test School',
      address: {
        address_line_1: '1 Test St',
        address_town: 'Testville',
        address_postcode: 'TE1 1ST',
      },
      phone_number: '01234567890',
      email: 'office@testschool.example.com',
    });
  });

  // -------------------------------------------------------------------------
  // schoolApproved
  // -------------------------------------------------------------------------
  describe('schoolApproved', () => {
    const validPayload = {
      payload_type: 'schoolApproved',
      school_id: 'A1234567890',
      school_name: 'Cheddar Grove Primary School',
      school_token: 'tok_abc123',
    };

    it('creates an organization and triggers sync', async () => {
      const res = await postWebhook(app, validPayload, env);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.success).toBe(true);
    });

    it('inserts the organization into D1 with correct fields', async () => {
      await postWebhook(app, validPayload, env);

      // Should have called prepare with an INSERT INTO organizations query
      const prepareCalls = mockDb.prepare.mock.calls;
      const insertCall = prepareCalls.find((call) => call[0].includes('INSERT INTO organizations'));
      expect(insertCall).toBeDefined();

      // Find the bind call for the INSERT
      const insertStatement = mockDb.prepare.mock.results.find((result, idx) =>
        mockDb.prepare.mock.calls[idx][0].includes('INSERT INTO organizations')
      );
      const bindArgs = insertStatement.value.bind.mock.calls[0];

      // bindArgs: [orgId, school_name, slug, school_id, encryptedToken]
      expect(bindArgs[1]).toBe('Cheddar Grove Primary School'); // name
      expect(bindArgs[2]).toBe('cheddar-grove-primary-school'); // slug
      expect(bindArgs[3]).toBe('A1234567890'); // wonde_school_id
      expect(bindArgs[4]).toBe('encrypted-iv:encrypted-ciphertext'); // encrypted token
    });

    it('encrypts the school token using the JWT secret', async () => {
      await postWebhook(app, validPayload, env);

      expect(encryptSensitiveData).toHaveBeenCalledWith('tok_abc123', 'test-secret-key');
    });

    it('calls runFullSync with correct parameters', async () => {
      await postWebhook(app, validPayload, env);

      expect(runFullSync).toHaveBeenCalledWith(
        expect.any(String), // orgId (UUID)
        'tok_abc123', // school token
        'A1234567890', // wonde school id
        mockDb, // database
        expect.objectContaining({ kv: expect.any(Object) })
      );
    });

    it('generates a valid slug from the school name', async () => {
      const payload = {
        ...validPayload,
        school_name: "St. Mary's C of E Primary & Nursery School!!!",
      };
      await postWebhook(app, payload, env);

      const _insertCall = mockDb.prepare.mock.calls.find((call) =>
        call[0].includes('INSERT INTO organizations')
      );
      const bindArgs = mockDb.prepare.mock.results.find((result, idx) =>
        mockDb.prepare.mock.calls[idx][0].includes('INSERT INTO organizations')
      ).value.bind.mock.calls[0];

      // Slug should be lowercase, alphanumeric + hyphens, no leading/trailing hyphens
      const slug = bindArgs[2];
      expect(slug).toBe('st-mary-s-c-of-e-primary-nursery-school');
    });

    it('returns 400 when school_id is missing', async () => {
      const { school_id: _school_id, ...payload } = validPayload;
      const res = await postWebhook(app, payload, env);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/missing required fields/i);
    });

    it('returns 400 when school_name is missing', async () => {
      const { school_name: _school_name, ...payload } = validPayload;
      const res = await postWebhook(app, payload, env);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/missing required fields/i);
    });

    it('returns 400 when school_token is missing', async () => {
      const { school_token: _school_token, ...payload } = validPayload;
      const res = await postWebhook(app, payload, env);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/missing required fields/i);
    });
  });

  // -------------------------------------------------------------------------
  // accessRevoked
  // -------------------------------------------------------------------------
  describe('accessRevoked', () => {
    it('soft-deletes the organization when found', async () => {
      // Mock finding the org
      mockDb.prepare.mockImplementation((sql) => {
        if (sql.includes('SELECT') && sql.includes('wonde_school_id')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ id: 'org-uuid-123' }),
              run: vi.fn().mockResolvedValue({ success: true }),
            }),
          };
        }
        // For UPDATE query
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      });

      const res = await postWebhook(
        app,
        {
          payload_type: 'accessRevoked',
          school_id: 'A1234567890',
          school_name: 'Test School',
          revoke_reason: 'No longer needed',
        },
        env
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify UPDATE was called to soft-delete
      const updateCall = mockDb.prepare.mock.calls.find(
        (call) => call[0].includes('UPDATE organizations') && call[0].includes('is_active = 0')
      );
      expect(updateCall).toBeDefined();
    });

    it('returns 200 even when organization not found', async () => {
      // Default mock returns null for first() — org not found
      const res = await postWebhook(
        app,
        {
          payload_type: 'accessRevoked',
          school_id: 'UNKNOWN_ID',
          school_name: 'Unknown School',
        },
        env
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('returns 400 when school_id is missing', async () => {
      const res = await postWebhook(
        app,
        {
          payload_type: 'accessRevoked',
          school_name: 'Test School',
        },
        env
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/missing school_id/i);
    });
  });

  // -------------------------------------------------------------------------
  // accessDeclined
  // -------------------------------------------------------------------------
  describe('accessDeclined', () => {
    it('soft-deletes the organization (same as accessRevoked)', async () => {
      mockDb.prepare.mockImplementation((sql) => {
        if (sql.includes('SELECT') && sql.includes('wonde_school_id')) {
          return {
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({ id: 'org-uuid-456' }),
              run: vi.fn().mockResolvedValue({ success: true }),
            }),
          };
        }
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      });

      const res = await postWebhook(
        app,
        {
          payload_type: 'accessDeclined',
          school_id: 'A1234567890',
          school_name: 'Declined School',
          decline_reason: 'Not interested',
        },
        env
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      const updateCall = mockDb.prepare.mock.calls.find(
        (call) => call[0].includes('UPDATE organizations') && call[0].includes('is_active = 0')
      );
      expect(updateCall).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // schoolMigration
  // -------------------------------------------------------------------------
  describe('schoolMigration', () => {
    it('returns 200 and acknowledges the migration', async () => {
      const res = await postWebhook(
        app,
        {
          payload_type: 'schoolMigration',
          school_name: 'Migrating School',
          migrate_from: 'old-server',
          migrate_to: 'new-server',
        },
        env
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown payload type
  // -------------------------------------------------------------------------
  describe('unknown payload type', () => {
    it('returns 200 with acknowledgment', async () => {
      const res = await postWebhook(
        app,
        {
          payload_type: 'someFutureEvent',
          school_id: 'A1234567890',
        },
        env
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toMatch(/unknown payload type/i);
    });
  });

  // -------------------------------------------------------------------------
  // Missing payload_type
  // -------------------------------------------------------------------------
  describe('missing payload_type', () => {
    it('returns 400 when payload_type is not provided', async () => {
      const res = await postWebhook(
        app,
        {
          school_id: 'A1234567890',
          school_name: 'Test School',
        },
        env
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/missing payload_type/i);
    });
  });

  // -------------------------------------------------------------------------
  // Webhook authentication
  // -------------------------------------------------------------------------
  describe('webhook authentication', () => {
    it('returns 503 when WONDE_WEBHOOK_SECRET is not configured', async () => {
      const envNoSecret = { ...env };
      delete envNoSecret.WONDE_WEBHOOK_SECRET;

      const res = await postWebhook(
        app,
        {
          payload_type: 'schoolApproved',
          school_id: 'A1234567890',
          school_name: 'Test School',
          school_token: 'tok_abc123',
        },
        envNoSecret
      );

      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error).toMatch(/not configured/i);
    });

    it('returns 401 when the secret is missing entirely', async () => {
      const res = await postWebhook(
        app,
        {
          payload_type: 'schoolApproved',
          school_id: 'A1234567890',
          school_name: 'Test School',
          school_token: 'tok_abc123',
        },
        env,
        { secret: null }
      );

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('returns 401 when the X-Webhook-Secret header is wrong', async () => {
      const res = await postWebhook(
        app,
        {
          payload_type: 'schoolApproved',
          school_id: 'A1234567890',
          school_name: 'Test School',
          school_token: 'tok_abc123',
        },
        env,
        { secret: 'wrong-secret' }
      );

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('succeeds when correct secret is provided', async () => {
      const res = await postWebhook(
        app,
        {
          payload_type: 'schoolMigration',
          school_name: 'Test',
          migrate_from: 'a',
          migrate_to: 'b',
        },
        env,
        { secret: 'test-webhook-secret' }
      );

      expect(res.status).toBe(200);
    });

    // Wonde's webhook dashboard has a URL field and event checkboxes, and no
    // way to set a custom request header — so ?secret= is the mechanism that
    // actually gets used in production. These four cases exist because the
    // header-only version of this handler would have 401'd every real delivery.
    const migration = {
      payload_type: 'schoolMigration',
      school_name: 'Test',
      migrate_from: 'a',
      migrate_to: 'b',
    };

    it('accepts the secret in the ?secret= query string', async () => {
      const res = await postWebhook(app, migration, env, {
        secret: 'test-webhook-secret',
        via: 'query',
      });

      expect(res.status).toBe(200);
    });

    it('returns 401 when the ?secret= query string is wrong', async () => {
      const res = await postWebhook(app, migration, env, {
        secret: 'wrong-secret',
        via: 'query',
      });

      expect(res.status).toBe(401);
    });

    // Regression guard for the decoding trap: URLSearchParams follows
    // form-encoding rules and turns a literal `+` into a space, so a base64
    // secret read that way arrives mangled and never matches. Roughly half of
    // all generated base64 secrets contain `+` or `/`.
    it('accepts a base64 secret containing + and / from the query string', async () => {
      const base64Secret = 'tEsT+fIxTuRe/nOtArEaLsEcReT0000=';
      const res = await postWebhook(
        app,
        migration,
        { ...env, WONDE_WEBHOOK_SECRET: base64Secret },
        {
          secret: base64Secret,
          via: 'query',
        }
      );

      expect(res.status).toBe(200);
    });

    it('accepts a percent-encoded secret from the query string', async () => {
      const base64Secret = 'tEsT+fIxTuRe/nOtArEaLsEcReT0000=';
      const res = await app.request(
        `/api/webhooks/wonde?secret=${encodeURIComponent(base64Secret)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(migration),
        },
        { ...env, WONDE_WEBHOOK_SECRET: base64Secret }
      );

      expect(res.status).toBe(200);
    });
  });
});
