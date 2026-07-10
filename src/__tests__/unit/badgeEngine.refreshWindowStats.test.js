import { describe, it, expect, vi } from 'vitest';
import { refreshWindowStats, currentStatWindows } from '../../utils/badgeEngine.js';

// Audit cycle 16 PERF-M2: with the session watermark, students without new
// sessions no longer get a full nightly recalc — this cheap refresh must
// decay their rolling window stats instead (5 days "this week" must become
// 0 once the week has passed).

const buildMockDb = ({ dateRows, statsRows }) => {
  const updates = [];
  const db = {
    prepare: vi.fn((sql) => ({
      bind: vi.fn((...args) => {
        if (sql.includes('UPDATE student_reading_stats')) updates.push({ sql, args });
        return { sql };
      }),
    })),
    batch: vi.fn((stmts) => {
      // First batch call is the paired reads; later calls are update chunks.
      if (db.batch.mock.calls.length === 1) {
        return Promise.resolve([
          { results: dateRows, success: true },
          { results: statsRows, success: true },
        ]);
      }
      return Promise.resolve(stmts.map(() => ({ success: true })));
    }),
    _updates: updates,
  };
  return db;
};

describe('refreshWindowStats', () => {
  const { mondayStr } = currentStatWindows();

  it('zeroes stale window stats for students with no in-window reads', async () => {
    const db = buildMockDb({
      dateRows: [],
      statsRows: [
        { student_id: 'stu-1', days_read_this_week: 5, days_read_this_month: 12, weeks_with_4plus_days: 2 },
      ],
    });

    const result = await refreshWindowStats(db, 'org-1');

    expect(result.statsUpdated).toBe(1);
    expect(db._updates).toHaveLength(1);
    // week, month, 4+-weeks all decay to 0
    expect(db._updates[0].args.slice(0, 3)).toEqual([0, 0, 0]);
    expect(db._updates[0].args[3]).toBe('stu-1');
  });

  it('counts in-window reading dates and leaves already-correct rows alone', async () => {
    const db = buildMockDb({
      dateRows: [
        { student_id: 'stu-1', session_date: mondayStr }, // read this week (and month)
      ],
      statsRows: [
        // stu-1 is stale (claims 0), stu-2 is already correct (0 reads, 0 stats)
        { student_id: 'stu-1', days_read_this_week: 0, days_read_this_month: 0, weeks_with_4plus_days: 0 },
        { student_id: 'stu-2', days_read_this_week: 0, days_read_this_month: 0, weeks_with_4plus_days: 0 },
      ],
    });

    const result = await refreshWindowStats(db, 'org-1');

    expect(result.studentsChecked).toBe(2);
    expect(result.statsUpdated).toBe(1);
    expect(db._updates[0].args[3]).toBe('stu-1');
    // Monday is in both the current week and (usually) the current month —
    // the week count must be 1 regardless.
    expect(db._updates[0].args[0]).toBe(1);
  });
});
