import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hardDeleteOrganization } from '../../services/orgPurge.js';

// Track all SQL statements and their bind args
let sqlLog = [];

/**
 * Build a mock D1 database.
 *
 * `firstResult` controls what the initial SELECT returns.
 * `failingTable` (optional) makes the DELETE for that table throw.
 */
const createMockDB = ({ firstResult = null, failingTable = null } = {}) => {
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
        run: vi.fn().mockImplementation(() => {
          if (failingTable && sql.includes(`FROM ${failingTable} `)) {
            return Promise.reject(new Error(`D1_ERROR: table ${failingTable} locked`));
          }
          return Promise.resolve({ success: true, meta: { changes: 1 } });
        }),
        all: vi.fn().mockResolvedValue({ results: [], success: true }),
      };
      return chainable;
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
  it('deletes all 26 tables in order, anonymises org, and returns summary', async () => {
    const db = createMockDB({ firstResult: activeOrg });

    const result = await hardDeleteOrganization(db, ORG_ID);

    // -- Verify SELECT fired first
    expect(sqlLog[0].sql).toContain('SELECT');
    expect(sqlLog[0].binds).toEqual([ORG_ID]);

    // -- data_rights_log INSERT is second
    expect(sqlLog[1].sql).toContain('INSERT INTO data_rights_log');
    expect(sqlLog[1].binds).toEqual(['purge-log-uuid', ORG_ID, ORG_ID]);

    // -- 25 DELETEs from DELETE_ORDER (indexes 2..26)
    const deleteSqls = sqlLog.slice(2, 27);
    expect(deleteSqls).toHaveLength(25);
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
    expect(tableOrder[tableOrder.length - 1]).toBe('users');

    // -- data_rights_log DELETE (index 27)
    expect(sqlLog[27].sql).toContain('DELETE FROM data_rights_log');
    expect(sqlLog[27].binds).toEqual([ORG_ID, 'purge-log-uuid']);

    // -- Anonymise UPDATE (index 28)
    expect(sqlLog[28].sql).toContain('UPDATE organizations SET');
    expect(sqlLog[28].sql).toContain("name = 'Deleted Organisation'");
    expect(sqlLog[28].sql).toContain('purged_at');
    expect(sqlLog[28].binds).toEqual([ORG_ID]);

    // -- Return value
    expect(result.orgId).toBe(ORG_ID);
    expect(result.tablesProcessed).toBe(26); // 25 DELETE_ORDER + 1 data_rights_log
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
  // 5. Per-table resilience
  // ---------------------------------------------------------------
  it('logs failing table in errors array without aborting remaining deletes', async () => {
    const db = createMockDB({
      firstResult: activeOrg,
      failingTable: 'student_badges',
    });

    const result = await hardDeleteOrganization(db, ORG_ID);

    // The function should continue past the failure
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('student_badges');

    // 24 succeeded from DELETE_ORDER + 1 data_rights_log = 25
    expect(result.tablesProcessed).toBe(25);

    // Verify tables after the failing one were still processed
    const deleteSqls = sqlLog.filter((e) => e.sql.startsWith('DELETE FROM'));
    // 25 DELETEs from DELETE_ORDER + 1 data_rights_log = 26 total attempted
    expect(deleteSqls).toHaveLength(26);
  });
});
