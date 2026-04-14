import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { hardDeleteOrganization } from '../../services/orgPurge.js';
import { organizationRouter } from '../../routes/organization.js';

// Track all SQL statements and their bind args
let sqlLog = [];

/**
 * Build a mock D1 database.
 *
 * `firstResult` controls what the initial SELECT returns.
 * `batchShouldFail` (optional) makes db.batch() reject atomically.
 */
const createMockDB = ({ firstResult = null, batchShouldFail = false } = {}) => {
  sqlLog = [];

  const db = {
    prepare: vi.fn().mockImplementation((sql) => {
      const entry = { sql, binds: [] };
      sqlLog.push(entry);

      const chainable = {
        bind: vi.fn((...args) => {
          entry.binds = args;
          return chainable;
        }),
        first: vi.fn().mockResolvedValue(firstResult),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
        all: vi.fn().mockResolvedValue({ results: [], success: true }),
      };
      return chainable;
    }),
    batch: vi.fn().mockImplementation((statements) => {
      if (batchShouldFail) {
        return Promise.reject(new Error('D1_ERROR: batch aborted'));
      }
      return Promise.resolve(statements.map(() => ({ success: true, meta: { changes: 1 } })));
    }),
  };

  return db;
};

const ORG_ID = 'org-test-123';

const activeOrg = {
  id: ORG_ID,
  name: 'Test School',
  legal_hold: 0,
  purged_at: null,
};

describe('hardDeleteOrganization', () => {
  beforeEach(() => {
    sqlLog = [];
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('purge-log-uuid') });
  });

  // ---------------------------------------------------------------
  // 1. Happy path
  // ---------------------------------------------------------------
  it('runs a single atomic batch: log insert, 26 deletes, log cleanup, tombstone', async () => {
    const db = createMockDB({ firstResult: activeOrg });

    const result = await hardDeleteOrganization(db, ORG_ID);

    // -- Verify SELECT fired first
    expect(sqlLog[0].sql).toContain('SELECT');
    expect(sqlLog[0].binds).toEqual([ORG_ID]);

    // -- Single atomic batch invocation for all destructive work
    expect(db.batch).toHaveBeenCalledTimes(1);
    const batchStatements = db.batch.mock.calls[0][0];
    // 1 log insert + 26 deletes + 1 log cleanup + 1 tombstone = 29
    expect(batchStatements).toHaveLength(29);

    // -- data_rights_log INSERT comes first inside the batch (sqlLog index 1)
    expect(sqlLog[1].sql).toContain('INSERT INTO data_rights_log');
    expect(sqlLog[1].binds).toEqual(['purge-log-uuid', ORG_ID, ORG_ID]);

    // -- 26 DELETEs from DELETE_ORDER (indexes 2..27)
    const deleteSqls = sqlLog.slice(2, 28);
    expect(deleteSqls).toHaveLength(26);
    for (const entry of deleteSqls) {
      expect(entry.sql).toMatch(/^DELETE FROM /);
      expect(entry.binds).toEqual([ORG_ID]);
    }

    // Verify FK-safe order: children before parents
    const tableOrder = deleteSqls.map((e) => e.sql.match(/DELETE FROM (\S+)/)[1]);
    expect(tableOrder[0]).toBe('support_ticket_notes');
    expect(tableOrder[1]).toBe('support_tickets');
    expect(tableOrder.indexOf('students')).toBeLessThan(tableOrder.indexOf('classes'));
    expect(tableOrder.indexOf('reading_sessions')).toBeLessThan(tableOrder.indexOf('students'));
    // class_goals must be deleted before classes (FK constraint)
    expect(tableOrder.indexOf('class_goals')).toBeLessThan(tableOrder.indexOf('classes'));
    expect(tableOrder[tableOrder.length - 1]).toBe('users');

    // -- data_rights_log cleanup DELETE (sqlLog index 28)
    expect(sqlLog[28].sql).toContain('DELETE FROM data_rights_log');
    expect(sqlLog[28].binds).toEqual([ORG_ID, 'purge-log-uuid']);

    // -- Anonymise UPDATE (sqlLog index 29)
    expect(sqlLog[29].sql).toContain('UPDATE organizations SET');
    expect(sqlLog[29].sql).toContain("name = 'Deleted Organisation'");
    expect(sqlLog[29].sql).toContain('purged_at');
    expect(sqlLog[29].binds).toEqual([ORG_ID]);

    // -- Return value
    expect(result.orgId).toBe(ORG_ID);
    expect(result.tablesProcessed).toBe(27); // 26 DELETE_ORDER + 1 data_rights_log
    expect(result.errors).toEqual([]);
  });

  // ---------------------------------------------------------------
  // 2. Org not found
  // ---------------------------------------------------------------
  it('throws 404 when organisation does not exist', async () => {
    const db = createMockDB({ firstResult: null });

    await expect(hardDeleteOrganization(db, 'no-such-org')).rejects.toThrow(
      'Organization not found'
    );

    try {
      await hardDeleteOrganization(db, 'no-such-org');
    } catch (err) {
      expect(err.status).toBe(404);
    }
  });

  // ---------------------------------------------------------------
  // 3. Legal hold
  // ---------------------------------------------------------------
  it('throws 409 when organisation is under legal hold', async () => {
    const db = createMockDB({
      firstResult: { ...activeOrg, legal_hold: 1 },
    });

    await expect(hardDeleteOrganization(db, ORG_ID)).rejects.toThrow('legal hold');

    try {
      await hardDeleteOrganization(db, ORG_ID);
    } catch (err) {
      expect(err.status).toBe(409);
    }
  });

  // ---------------------------------------------------------------
  // 4. Already purged
  // ---------------------------------------------------------------
  it('throws 409 when organisation has already been purged', async () => {
    const db = createMockDB({
      firstResult: { ...activeOrg, purged_at: '2025-01-01T00:00:00Z' },
    });

    await expect(hardDeleteOrganization(db, ORG_ID)).rejects.toThrow('already been purged');

    try {
      await hardDeleteOrganization(db, ORG_ID);
    } catch (err) {
      expect(err.status).toBe(409);
    }
  });

  // ---------------------------------------------------------------
  // 5. Atomic rollback on batch failure
  // ---------------------------------------------------------------
  it('throws when the atomic batch fails, so callers can retry instead of tombstoning partially', async () => {
    const db = createMockDB({
      firstResult: activeOrg,
      batchShouldFail: true,
    });

    await expect(hardDeleteOrganization(db, ORG_ID)).rejects.toThrow(/purge failed/i);
  });
});

// ---------------------------------------------------------------
// Endpoint tests for DELETE /api/organization/:id/purge
// ---------------------------------------------------------------

/**
 * Build a Hono test app with the organization router mounted.
 * Middleware injects env and context values with owner defaults.
 */
const createPurgeTestApp = (mockDb, contextValues = {}) => {
  const app = new Hono();

  app.use('*', async (c, next) => {
    c.env = { JWT_SECRET: 'test-secret', READING_MANAGER_DB: mockDb };
    c.set('userId', contextValues.userId || 'user-owner-1');
    c.set('organizationId', contextValues.organizationId || ORG_ID);
    c.set('userRole', contextValues.userRole || 'owner');
    c.set(
      'user',
      contextValues.user || { id: 'user-owner-1', role: 'owner', organizationId: ORG_ID }
    );
    await next();
  });

  app.onError((error, c) => {
    const status = error.status || 500;
    return c.json({ error: error.message }, status);
  });

  app.route('/api/organization', organizationRouter);
  return app;
};

describe('DELETE /api/organization/:id/purge', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('purge-log-uuid') });
  });

  it('returns 400 when confirm name does not match', async () => {
    const db = createMockDB({
      firstResult: {
        id: ORG_ID,
        name: 'Actual School Name',
        legal_hold: 0,
        purged_at: null,
      },
    });

    const app = createPurgeTestApp(db);
    const res = await app.request(`/api/organization/${ORG_ID}/purge`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'Wrong Name' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/does not match/i);
  });

  it('returns 409 when org has legal_hold = 1', async () => {
    const db = createMockDB({
      firstResult: {
        id: ORG_ID,
        name: 'Test School',
        legal_hold: 1,
        purged_at: null,
      },
    });

    const app = createPurgeTestApp(db);
    const res = await app.request(`/api/organization/${ORG_ID}/purge`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'Test School' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/legal hold/i);
  });

  it('returns 409 when org is already purged', async () => {
    const db = createMockDB({
      firstResult: {
        id: ORG_ID,
        name: 'Test School',
        legal_hold: 0,
        purged_at: '2025-06-01T00:00:00Z',
      },
    });

    const app = createPurgeTestApp(db);
    const res = await app.request(`/api/organization/${ORG_ID}/purge`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'Test School' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already been purged/i);
  });

  it('returns 200 with summary on successful purge', async () => {
    const db = createMockDB({
      firstResult: {
        id: ORG_ID,
        name: 'Test School',
        legal_hold: 0,
        purged_at: null,
      },
    });

    const app = createPurgeTestApp(db);
    const res = await app.request(`/api/organization/${ORG_ID}/purge`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'Test School' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orgId).toBe(ORG_ID);
    expect(body.errors).toEqual([]);
  });
});
