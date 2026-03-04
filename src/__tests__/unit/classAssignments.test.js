/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncUserClassAssignments } from '../../utils/classAssignments.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockDB(selectResults = []) {
  const stmts = [];
  const db = {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
        all: vi.fn().mockResolvedValue({ results: selectResults }),
      };
      stmts.push({ sql, stmt });
      return stmt;
    }),
  };
  return { db, stmts };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syncUserClassAssignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // No-op when wondeEmployeeId is null
  // -------------------------------------------------------------------------
  it('returns 0 and does not call db.prepare when wondeEmployeeId is null', async () => {
    const { db } = createMockDB();

    const result = await syncUserClassAssignments(db, 'user-1', null, 'org-1');

    expect(result).toBe(0);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('returns 0 and does not call db.prepare when wondeEmployeeId is undefined', async () => {
    const { db } = createMockDB();

    const result = await syncUserClassAssignments(db, 'user-1', undefined, 'org-1');

    expect(result).toBe(0);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('returns 0 and does not call db.prepare when wondeEmployeeId is empty string', async () => {
    const { db } = createMockDB();

    const result = await syncUserClassAssignments(db, 'user-1', '', 'org-1');

    expect(result).toBe(0);
    expect(db.prepare).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Delete + recreate flow with matching classes
  // -------------------------------------------------------------------------
  it('deletes existing assignments, queries wonde mappings, and inserts new assignments', async () => {
    const selectResults = [
      { class_id: 'tally-class-1' },
      { class_id: 'tally-class-2' },
    ];
    const { db, stmts } = createMockDB(selectResults);

    const result = await syncUserClassAssignments(db, 'user-1', 'wonde-emp-1', 'org-1');

    expect(result).toBe(2);

    // Should have called db.prepare 4 times: 1 DELETE + 1 SELECT + 2 INSERTs
    expect(db.prepare).toHaveBeenCalledTimes(4);

    // First call: DELETE existing assignments
    const deleteStmt = stmts[0];
    expect(deleteStmt.sql).toContain('DELETE FROM class_assignments');
    expect(deleteStmt.sql).toContain('user_id');
    expect(deleteStmt.stmt.bind).toHaveBeenCalledWith('user-1');
    expect(deleteStmt.stmt.run).toHaveBeenCalled();

    // Second call: SELECT to join wonde_employee_classes with classes
    const selectStmt = stmts[1];
    expect(selectStmt.sql).toContain('wonde_employee_classes');
    expect(selectStmt.sql).toContain('JOIN classes');
    expect(selectStmt.sql).toContain('wonde_class_id');
    expect(selectStmt.stmt.bind).toHaveBeenCalledWith('org-1', 'wonde-emp-1');
    expect(selectStmt.stmt.all).toHaveBeenCalled();

    // Third and fourth calls: INSERT for each class
    const insert1 = stmts[2];
    expect(insert1.sql).toContain('INSERT OR IGNORE INTO class_assignments');
    expect(insert1.stmt.bind).toHaveBeenCalledWith(
      expect.any(String), 'tally-class-1', 'user-1'
    );
    expect(insert1.stmt.run).toHaveBeenCalled();

    const insert2 = stmts[3];
    expect(insert2.sql).toContain('INSERT OR IGNORE INTO class_assignments');
    expect(insert2.stmt.bind).toHaveBeenCalledWith(
      expect.any(String), 'tally-class-2', 'user-1'
    );
    expect(insert2.stmt.run).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Returns 0 when no wonde class mappings found
  // -------------------------------------------------------------------------
  it('returns 0 and does not insert when SELECT returns empty results', async () => {
    const { db, stmts } = createMockDB([]);

    const result = await syncUserClassAssignments(db, 'user-1', 'wonde-emp-1', 'org-1');

    expect(result).toBe(0);

    // Should have called db.prepare 2 times: 1 DELETE + 1 SELECT (no INSERTs)
    expect(db.prepare).toHaveBeenCalledTimes(2);

    // First call: DELETE
    expect(stmts[0].sql).toContain('DELETE FROM class_assignments');
    expect(stmts[0].stmt.run).toHaveBeenCalled();

    // Second call: SELECT
    expect(stmts[1].sql).toContain('wonde_employee_classes');
    expect(stmts[1].stmt.all).toHaveBeenCalled();

    // No INSERT calls
    const insertCalls = stmts.filter(s => s.sql.includes('INSERT'));
    expect(insertCalls).toHaveLength(0);
  });
});
