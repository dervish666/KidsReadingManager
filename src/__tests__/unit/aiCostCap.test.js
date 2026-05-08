import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getCurrentPeriod,
  getMonthlyLimit,
  checkAIBudget,
  recordAICall,
  DEFAULT_MONTHLY_CALL_LIMIT,
} from '../../utils/aiCostCap.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('getCurrentPeriod', () => {
  it("returns 'YYYY-MM' format with zero-padded month", () => {
    expect(getCurrentPeriod(new Date('2026-01-15T12:00:00Z'))).toBe('2026-01');
    expect(getCurrentPeriod(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09');
    expect(getCurrentPeriod(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });

  it('uses UTC, not local time', () => {
    // 2026-01-31T23:00:00Z is still January UTC even if local is February
    expect(getCurrentPeriod(new Date('2026-01-31T23:00:00Z'))).toBe('2026-01');
  });
});

describe('getMonthlyLimit', () => {
  it('returns the default when env var is unset', () => {
    expect(getMonthlyLimit({})).toBe(DEFAULT_MONTHLY_CALL_LIMIT);
    expect(getMonthlyLimit(null)).toBe(DEFAULT_MONTHLY_CALL_LIMIT);
    expect(getMonthlyLimit(undefined)).toBe(DEFAULT_MONTHLY_CALL_LIMIT);
  });

  it('returns the env-provided positive integer', () => {
    expect(getMonthlyLimit({ AI_MONTHLY_CALL_LIMIT: '1000' })).toBe(1000);
    expect(getMonthlyLimit({ AI_MONTHLY_CALL_LIMIT: 250 })).toBe(250);
  });

  it('falls back to default for invalid env values', () => {
    expect(getMonthlyLimit({ AI_MONTHLY_CALL_LIMIT: 'abc' })).toBe(DEFAULT_MONTHLY_CALL_LIMIT);
    expect(getMonthlyLimit({ AI_MONTHLY_CALL_LIMIT: '' })).toBe(DEFAULT_MONTHLY_CALL_LIMIT);
    expect(getMonthlyLimit({ AI_MONTHLY_CALL_LIMIT: '0' })).toBe(DEFAULT_MONTHLY_CALL_LIMIT);
    expect(getMonthlyLimit({ AI_MONTHLY_CALL_LIMIT: '-50' })).toBe(DEFAULT_MONTHLY_CALL_LIMIT);
  });
});

describe('checkAIBudget', () => {
  const buildDB = (storedCount) => {
    const prepare = vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(storedCount === null ? null : { call_count: storedCount }),
    }));
    return { prepare };
  };

  it('allows calls when usage is below the limit', async () => {
    const db = buildDB(50);
    const result = await checkAIBudget(db, 'org-1', 500);
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(50);
    expect(result.limit).toBe(500);
    expect(result.period).toMatch(/^\d{4}-\d{2}$/);
  });

  it('returns used=0 when no row exists for the period', async () => {
    const db = buildDB(null);
    const result = await checkAIBudget(db, 'org-1', 500);
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
  });

  it('rejects when usage equals the limit', async () => {
    const db = buildDB(500);
    const result = await checkAIBudget(db, 'org-1', 500);
    expect(result.allowed).toBe(false);
  });

  it('rejects when usage exceeds the limit', async () => {
    const db = buildDB(750);
    const result = await checkAIBudget(db, 'org-1', 500);
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(750);
  });

  it('queries with current period in the bind args', async () => {
    const bindCalls = [];
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn((...args) => {
          bindCalls.push(args);
          return { first: vi.fn().mockResolvedValue(null) };
        }),
      })),
    };

    await checkAIBudget(db, 'org-7', 500);

    expect(bindCalls).toHaveLength(1);
    expect(bindCalls[0][0]).toBe('org-7');
    expect(bindCalls[0][1]).toMatch(/^\d{4}-\d{2}$/);
  });

  it('fails open if the read errors (rather than blocking all AI)', async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockRejectedValue(new Error('D1 unavailable')),
      })),
    };

    const result = await checkAIBudget(db, 'org-1', 500);
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
  });
});

describe('recordAICall', () => {
  it('binds orgId + period and runs the upsert', async () => {
    const bindCalls = [];
    const run = vi.fn().mockResolvedValue({ success: true });
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn((...args) => {
          bindCalls.push(args);
          return { run };
        }),
      })),
    };

    await recordAICall(db, 'org-1');

    expect(bindCalls).toHaveLength(1);
    expect(bindCalls[0][0]).toBe('org-1');
    expect(bindCalls[0][1]).toMatch(/^\d{4}-\d{2}$/);
    expect(run).toHaveBeenCalled();
  });

  it('issues an UPSERT (ON CONFLICT) statement', async () => {
    let preparedSQL;
    const db = {
      prepare: vi.fn((sql) => {
        preparedSQL = sql;
        return {
          bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({}) }),
        };
      }),
    };
    await recordAICall(db, 'org-1');
    expect(preparedSQL).toMatch(/INSERT INTO organization_ai_usage/);
    expect(preparedSQL).toMatch(/ON CONFLICT/);
    expect(preparedSQL).toMatch(/call_count = call_count \+ 1/);
  });

  it('swallows write errors (does not throw)', async () => {
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockRejectedValue(new Error('D1 write error')),
        }),
      })),
    };
    // Must not throw — accounting failure shouldn't 5xx the user request
    await expect(recordAICall(db, 'org-1')).resolves.toBeUndefined();
  });
});
