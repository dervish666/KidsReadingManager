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

/**
 * A cron_runs row for every watched job, all fresh, with named overrides.
 * Derived from WATCHED_JOBS so tests assert on the behaviour under test rather
 * than on how many jobs happen to be watched today.
 */
function freshRows(overrides = {}, alertStamps = {}) {
  return WATCHED_JOBS.map((j) => ({
    job_name: j.jobName,
    last_success_at: overrides[j.jobName] ?? hoursAgo(1),
    stale_alerted_at: alertStamps[j.jobName] ?? null,
  }));
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
      // Only the 26h nightly jobs; metadata-enrichment heartbeats 4x/hour and
      // is deliberately stale at 25h.
      rows: WATCHED_JOBS.filter((j) => j.maxAgeHours >= 26).map((j) => ({
        job_name: j.jobName,
        last_success_at: hoursAgo(25),
      })),
    });

    const results = await checkCronFreshness(db);

    expect(results.filter((r) => r.reason !== 'no record').every((r) => !r.stale)).toBe(true);
  });

  it('holds the every-minute poller to a much shorter threshold than the nightly jobs', async () => {
    // The poller's D1 probe logs transient failures rather than capturing them
    // (see the `*/1` branch in src/worker.js), so this threshold is the ONLY
    // thing that reports a genuinely dead poller. 3h stale must fire even
    // though the same age is perfectly healthy for a nightly job.
    const db = makeDb({ rows: freshRows({ 'metadata-enrichment': hoursAgo(3) }) });

    const results = await checkCronFreshness(db);

    expect(results.find((r) => r.jobName === 'metadata-enrichment').stale).toBe(true);
    expect(results.find((r) => r.jobName === 'badge-evaluation').stale).toBe(false);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException.mock.calls[0][1].tags).toMatchObject({
      cron: 'metadata-enrichment',
      watchdog: 'stale',
    });
  });

  it('reports a job that has skipped a day', async () => {
    // Rows derived from WATCHED_JOBS rather than hardcoded, so adding a watched
    // job doesn't fail this test for the wrong reason — it did exactly that
    // when metadata-enrichment was added.
    const db = makeDb({
      rows: freshRows({ 'badge-evaluation': hoursAgo(30) }),
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
      // wonde-school-sync missing entirely
      rows: freshRows().filter((r) => r.job_name !== 'wonde-school-sync'),
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

describe('checkCronFreshness alerting is edge-triggered', () => {
  it('stamps the outage when it alerts, so the next hourly pass can stay quiet', async () => {
    const db = makeDb({ rows: freshRows({ 'badge-evaluation': hoursAgo(30) }) });

    await checkCronFreshness(db);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    const stamp = db.calls.find((c) => c.sql.includes('stale_alerted_at = '));
    expect(stamp).toBeDefined();
    expect(stamp.args).toEqual(['badge-evaluation']);
  });

  it('stays silent on the next hourly pass of the SAME outage', async () => {
    // The behaviour this whole change exists for: one missed badge run on
    // 2026-08-21 produced 22 events and 3 emails, titled 27h through 48h, which
    // reads as an escalating incident rather than one job that missed one night.
    const db = makeDb({
      rows: freshRows({ 'badge-evaluation': hoursAgo(30) }, { 'badge-evaluation': hoursAgo(1) }),
    });

    const results = await checkCronFreshness(db);

    expect(Sentry.captureException).not.toHaveBeenCalled();
    // Still REPORTED as stale — only the alert is suppressed, not the finding.
    const badge = results.find((r) => r.jobName === 'badge-evaluation');
    expect(badge.stale).toBe(true);
    expect(badge.alerted).toBe(false);
  });

  it('re-alerts after a day so a permanently dead cron does not go quiet', async () => {
    // Silence and "someone fixed it" look identical from an inbox.
    const db = makeDb({
      rows: freshRows({ 'badge-evaluation': hoursAgo(200) }, { 'badge-evaluation': hoursAgo(25) }),
    });

    const results = await checkCronFreshness(db);

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(results.find((r) => r.jobName === 'badge-evaluation').alerted).toBe(true);
  });

  it('costs a duplicate alert, not a lost one, when the stamp write fails', async () => {
    const db = makeDb({
      rows: freshRows({ 'badge-evaluation': hoursAgo(30) }),
      throwOn: 'UPDATE cron_runs',
    });

    const results = await checkCronFreshness(db);

    // The alert fired first; only the bookkeeping failed, so next hour repeats
    // it. Noisy beats silent.
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(results.find((r) => r.jobName === 'badge-evaluation').alerted).toBe(true);
  });
});

describe('recordCronSuccess re-arms the alert', () => {
  it('clears stale_alerted_at so the NEXT outage is loud again', async () => {
    // Without this, an edge-triggered alert would fire once in the lifetime of
    // the job and never again.
    const db = makeDb();
    await recordCronSuccess(db, 'badge-evaluation', 14863);

    expect(db.calls[0].sql).toContain('stale_alerted_at = NULL');
  });
});
