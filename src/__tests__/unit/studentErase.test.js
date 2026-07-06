import { describe, it, expect, vi } from 'vitest';
import { studentEraseStatements, STUDENT_ERASE_STATEMENT_COUNT } from '../../utils/studentErase.js';

const createMockDb = () => {
  const sqls = [];
  return {
    sqls,
    prepare: vi.fn((sql) => {
      sqls.push(sql);
      return { bind: vi.fn().mockReturnThis() };
    }),
  };
};

// Audit cycle 16 COMP-M1/M2: the retention cron previously deleted only 4 of
// the interactive erase's 7 tables, orphaning live parent_access_tokens (a
// working portal token for an erased child), badges and stats; ticker_events
// (child first name) was in no erasure path at all. Both paths now share this
// single statement set.
describe('studentEraseStatements', () => {
  it('covers every child table, ticker events, and the student row, children first', () => {
    const db = createMockDb();
    studentEraseStatements(db, 'stu-1');

    const tables = db.sqls.map((sql) => sql.match(/DELETE FROM (\S+)/)[1]);
    expect(tables).toEqual([
      'reading_sessions',
      'student_preferences',
      'student_badges',
      'student_reading_stats',
      'parent_access_tokens',
      'student_recommendations',
      'ticker_events',
      'students',
    ]);
    // The student row goes last (FK-safe), scoped by id not student_id
    expect(db.sqls[db.sqls.length - 1]).toContain('WHERE id = ?');
  });

  it('exports a statement count that matches reality (cron chunk sizing depends on it)', () => {
    const db = createMockDb();
    expect(studentEraseStatements(db, 'stu-1')).toHaveLength(STUDENT_ERASE_STATEMENT_COUNT);
    // chunk × statements must stay under D1's 100-statement batch cap
    expect(
      Math.floor(100 / STUDENT_ERASE_STATEMENT_COUNT) * STUDENT_ERASE_STATEMENT_COUNT
    ).toBeLessThanOrEqual(100);
  });
});
