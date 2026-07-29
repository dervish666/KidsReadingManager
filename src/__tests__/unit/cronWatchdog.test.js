import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordCronSuccess, checkCronFreshness, WATCHED_JOBS } from '../../utils/cronWatchdog.js';
import * as Sentry from '@sentry/cloudflare';

vi.mock('@sentry/cloudflare', () => ({
  captureException: vi.fn(),
}));

/** Minimal D1 stub: `all()` returns `rows`, `run()` records the bind args. */
function makeDb({ rows = [], throwOn = null } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      if (throwOn && sql.includes(throwOn)) {
        throw new Error('D1_ERROR: simulated failure');
      }
      return {
        bind: (...args) => ({
          run: async () => {
            calls.push({ sql, args });
            return { meta: { changes: 1 } };
          },
        }),
        all: async () => ({ results: rows }),
      };
    },
  };
}

/** D1 datetime('now') format, offset by the given hours into the past. */
function hoursAgo(h) {
  return new Date(Date.now() - h * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recordCronSuccess', () => {
  it('upserts the job name and duration', async () => {
    const db = makeDb();
    await recordCronSuccess(db, 'wonde-school-sync', 1234);

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].sql).toContain('INSERT INTO cron_runs');
    expect(db.calls[0].sql).toContain('ON CONFLICT(job_name) DO UPDATE');
    expect(db.calls[0].args).toEqual(['wonde-school-sync', 1234]);
  });

  it('never throws when the write fails — a bookkeeping error must not fail the job', async () => {
    const db = makeDb({ throwOn: 'INSERT INTO cron_runs' });
    await expect(recordCronSuccess(db, 'badge-evaluation', 10)).resolves.toBeUndefined();
  });
});

describe('checkCronFreshness', () => {
  it('reports nothing when every job is recent', async () => {
    const db = makeDb({
      rows: WATCHED_JOBS.map((j) => ({ job_name: j.jobName, last_success_at: hoursAgo(1) })),
    });

    const results = await checkCronFreshness(db);

    expect(results.every((r) => !r.stale)).toBe(true);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('does not fire at 25h — inside the 26h allowance for cron drift', async () => {
    const db = makeDb({
      rows: WATCHED_JOBS.map((j) => ({ job_name: j.jobName, last_success_at: hoursAgo(25) })),
    });

    const results = await checkCronFreshness(db);

    expect(results.every((r) => !r.stale)).toBe(true);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reports a job that has skipped a day', async () => {
    const db = makeDb({
      rows: [
        { job_name: 'streaks-and-gdpr-cleanup', last_success_at: hoursAgo(1) },
        { job_name: 'badge-evaluation', last_success_at: hoursAgo(30) },
        { job_name: 'wonde-school-sync', last_success_at: hoursAgo(1) },
      ],
    });

    const results = await checkCronFreshness(db);

    expect(results.find((r) => r.jobName === 'badge-evaluation').stale).toBe(true);
    expect(results.find((r) => r.jobName === 'wonde-school-sync').stale).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);

    const [err, ctx] = Sentry.captureException.mock.calls[0];
    expect(err.message).toContain('badge-evaluation');
    expect(ctx.tags).toMatchObject({ cron: 'badge-evaluation', watchdog: 'stale' });
  });

  it('reports a watched job with no row at all rather than skipping it', async () => {
    const db = makeDb({
      rows: [
        { job_name: 'streaks-and-gdpr-cleanup', last_success_at: hoursAgo(1) },
        { job_name: 'badge-evaluation', last_success_at: hoursAgo(1) },
        // wonde-school-sync missing entirely
      ],
    });

    const results = await checkCronFreshness(db);

    const wonde = results.find((r) => r.jobName === 'wonde-school-sync');
    expect(wonde.stale).toBe(true);
    expect(wonde.reason).toBe('no record');
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException.mock.calls[0][1].tags.watchdog).toBe('missing');
  });

  it('treats D1 timestamps as UTC, not local time', async () => {
    // 25h old. If the space-separated timestamp were parsed as local time, a
    // machine at UTC+2 would read it as 23h and wrongly call it fresh — or at
    // UTC-2 as 27h and wrongly alert. Either way the test below would flip.
    const db = makeDb({
      rows: [{ job_name: 'wonde-school-sync', last_success_at: hoursAgo(25) }],
    });

    const results = await checkCronFreshness(db);
    const wonde = results.find((r) => r.jobName === 'wonde-school-sync');

    expect(wonde.ageHours).toBeGreaterThan(24.5);
    expect(wonde.ageHours).toBeLessThan(25.5);
  });

  it('surfaces its own failure instead of silently losing all detection', async () => {
    const db = makeDb({ throwOn: 'SELECT job_name' });

    const results = await checkCronFreshness(db);

    expect(results).toEqual([]);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException.mock.calls[0][1].tags.watchdog).toBe('self-failure');
  });
});
