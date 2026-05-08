import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processBadgesForOrg } from '../../utils/badgeEngine.js';

/**
 * Tests for the per-org badge processor — specifically the budget-aware
 * inner loop and resume cursor. The actual badge calculation (recalculateStats,
 * evaluateRealTime, evaluateBatch) is exercised by other tests; here we just
 * verify the cron orchestration logic.
 *
 * The mock D1 returns the supplied list of students for the student-fetch
 * query and empty results for every other query (sessions / books / genres /
 * existing badges) — recalculateStats etc. complete with zero stats / no
 * new badges, which is what we want for an isolation test of the loop.
 */

const buildMockDB = (studentResults) => {
  const calls = [];
  const prepare = vi.fn((sql) => {
    const chain = {
      bind: vi.fn((...args) => {
        calls.push({ sql, args });
        return chain;
      }),
      all: vi.fn(() => {
        if (sql.includes('FROM students s') && sql.includes('reading_sessions rs')) {
          return Promise.resolve({ results: studentResults, success: true });
        }
        return Promise.resolve({ results: [], success: true });
      }),
      first: vi.fn(() => Promise.resolve(null)),
      run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 0 } })),
    };
    return chain;
  });
  return {
    prepare,
    batch: vi.fn(() => Promise.resolve([])),
    _calls: calls,
    _getBoundArgs: () => calls.map((c) => c.args),
  };
};

const buildStudents = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `student-${String(i + 1).padStart(3, '0')}`, // student-001, student-002, ...
    year_group: '4',
  }));

describe('processBadgesForOrg', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('processes every student when deadline is far in the future', async () => {
    const db = buildMockDB(buildStudents(5));
    const deadlineMs = Date.now() + 60_000;

    const result = await processBadgesForOrg(db, 'org-1', null, deadlineMs);

    expect(result.exhausted).toBe(false);
    expect(result.processedCount).toBe(5);
    expect(result.lastProcessedId).toBe('student-005');
  });

  it('returns exhausted=true and stops mid-iteration when deadline passes', async () => {
    const db = buildMockDB(buildStudents(10));
    // Lock time so we can simulate deadline passing on the fly.
    vi.useFakeTimers();
    const t0 = 1_700_000_000_000;
    vi.setSystemTime(t0);
    const deadlineMs = t0 + 100; // 100ms budget

    // Advance time by 50ms before each Date.now() call. After 2 student
    // iterations (2 * 50 = 100ms), the deadline check fires.
    let callCount = 0;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount += 1;
      return t0 + callCount * 50;
    });

    const result = await processBadgesForOrg(db, 'org-1', null, deadlineMs);

    expect(result.exhausted).toBe(true);
    // Some students processed before the deadline tripped
    expect(result.processedCount).toBeGreaterThan(0);
    expect(result.processedCount).toBeLessThan(10);
    expect(result.lastProcessedId).not.toBe('student-010');

    dateNowSpy.mockRestore();
  });

  it('passes cursor in the SQL bind for resume after partial run', async () => {
    const db = buildMockDB(buildStudents(3));
    const deadlineMs = Date.now() + 60_000;

    await processBadgesForOrg(db, 'org-1', 'student-005', deadlineMs);

    // The student-fetch query should have been bound with (orgId, cursor, cursor)
    const studentFetchCall = db._calls.find(
      (c) => c.sql.includes('FROM students s') && c.sql.includes('reading_sessions rs')
    );
    expect(studentFetchCall).toBeDefined();
    expect(studentFetchCall.args).toEqual(['org-1', 'student-005', 'student-005']);
  });

  it('passes null cursor on first run', async () => {
    const db = buildMockDB(buildStudents(2));
    const deadlineMs = Date.now() + 60_000;

    await processBadgesForOrg(db, 'org-1', null, deadlineMs);

    const studentFetchCall = db._calls.find(
      (c) => c.sql.includes('FROM students s') && c.sql.includes('reading_sessions rs')
    );
    expect(studentFetchCall.args).toEqual(['org-1', null, null]);
  });

  it('returns lastProcessedId === cursor when no students match', async () => {
    const db = buildMockDB([]);
    const deadlineMs = Date.now() + 60_000;

    const result = await processBadgesForOrg(db, 'org-1', 'student-prev', deadlineMs);

    expect(result.exhausted).toBe(false);
    expect(result.processedCount).toBe(0);
    // No students processed — cursor unchanged so a future run could retry
    expect(result.lastProcessedId).toBe('student-prev');
  });

  it('returns exhausted=true and processedCount=0 when deadline already past on entry', async () => {
    const db = buildMockDB(buildStudents(5));
    const deadlineMs = Date.now() - 1; // already past

    const result = await processBadgesForOrg(db, 'org-1', null, deadlineMs);

    expect(result.exhausted).toBe(true);
    expect(result.processedCount).toBe(0);
  });

  it('continues processing remaining students if one student throws', async () => {
    // Override the mock so that recalculateStats throws for student-002 specifically.
    // We do this by intercepting the prepare for student_reading_stats writes
    // — recalculateStats issues an UPSERT against that table. If we make that
    // call throw on the second iteration, the catch in processBadgesForOrg
    // logs and continues.
    const db = buildMockDB(buildStudents(4));
    const deadlineMs = Date.now() + 60_000;

    let runCallNumber = 0;
    const originalPrepare = db.prepare;
    db.prepare = vi.fn((sql) => {
      const chain = originalPrepare(sql);
      const originalRun = chain.run;
      chain.run = vi.fn(() => {
        runCallNumber += 1;
        // Throw on a write inside the second student's processing
        if (sql.includes('student_reading_stats') && runCallNumber === 2) {
          return Promise.reject(new Error('Simulated D1 write failure'));
        }
        return originalRun();
      });
      return chain;
    });

    const result = await processBadgesForOrg(db, 'org-1', null, deadlineMs);

    // 4 students attempted; throws don't break the loop, but the failed
    // student doesn't increment processedCount or advance lastProcessedId
    expect(result.exhausted).toBe(false);
    expect(result.processedCount).toBeGreaterThanOrEqual(3);
  });
});
