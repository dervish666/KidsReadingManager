/**
 * Cron liveness watchdog.
 *
 * Sentry's free/dev plan allows ONE cron monitor and the next tier is £89/mo,
 * so we can't have a `withMonitor` per job. Coverage is split in two:
 *
 *   1. "Are crons running at all?" — the single Sentry monitor on
 *      `demo-environment-reset` (hourly). If Cloudflare's scheduler dies
 *      entirely, that goes red within ~15 minutes.
 *
 *   2. "Did each nightly job actually finish?" — this file. Each job stamps
 *      `cron_runs` on success; `checkCronFreshness` runs hourly and captures a
 *      Sentry exception for anything overdue.
 *
 * The two halves cover each other's blind spot: a watchdog can't report its own
 * death, which is exactly what the hourly monitor catches. Conversely the
 * monitor can't tell you the 3am Wonde sync stopped, which is what this does.
 *
 * Note this detects ABSENCE. Failures are already covered — every cron rethrows
 * and the scheduled handler captures the exception.
 */

import * as Sentry from '@sentry/cloudflare';

/**
 * Jobs to watch, and how old a successful run may get before we care.
 *
 * 26h rather than 24h for the daily jobs: Cloudflare cron triggers are
 * best-effort and drift by several minutes (measured ~8-9 min on this account),
 * so a 24h threshold would false-positive whenever a run slipped past its
 * previous start time. 26h still catches a job that skipped a whole day.
 *
 * `demo-environment-reset` is deliberately absent — it's the job this watchdog
 * runs inside, so it could never report its own absence. The Sentry monitor
 * owns that one.
 */
const WATCHED_JOBS = [
  { jobName: 'streaks-and-gdpr-cleanup', maxAgeHours: 26, schedule: '02:00 UTC daily' },
  { jobName: 'badge-evaluation', maxAgeHours: 26, schedule: '02:30 UTC daily' },
  { jobName: 'wonde-school-sync', maxAgeHours: 26, schedule: '03:00 UTC daily' },
  // The every-minute enrichment poller. It heartbeats 4x/hour (on the :00/:15/
  // :30/:45 slots), so 2h is ~8 missed beats — comfortably clear of the 8-9 min
  // trigger drift, and short enough to be useful for a job whose whole purpose
  // is responsiveness. This entry is load-bearing: the poller's D1 probe now
  // logs transient failures instead of capturing them (see the `*/1` branch in
  // src/worker.js), so absence detection is the ONLY thing that reports a
  // sustained outage. Remove one without the other and a dead poller is silent.
  { jobName: 'metadata-enrichment', maxAgeHours: 2, schedule: 'every minute (heartbeat 4x/hour)' },
];

/**
 * Record a successful cron run. Call at the end of a job, not the start —
 * the point is to record completion.
 *
 * Never throws: a watchdog bookkeeping failure must not fail the job that just
 * succeeded. It does log, so it can't fail silently.
 */
export async function recordCronSuccess(db, jobName, durationMs = null) {
  try {
    await db
      .prepare(
        `INSERT INTO cron_runs (job_name, last_success_at, last_duration_ms)
         VALUES (?, datetime('now'), ?)
         ON CONFLICT(job_name) DO UPDATE SET
           last_success_at = excluded.last_success_at,
           last_duration_ms = excluded.last_duration_ms`
      )
      .bind(jobName, durationMs)
      .run();
  } catch (err) {
    console.error(`[CronWatchdog] Failed to record success for ${jobName}:`, err?.message);
  }
}

/**
 * Report any watched job whose last success is older than its threshold.
 *
 * Returns a summary array so callers/tests can assert on it. Never throws — it
 * is a reporter, and must not break the job it runs alongside.
 */
export async function checkCronFreshness(db) {
  const results = [];

  try {
    const rows = await db.prepare('SELECT job_name, last_success_at FROM cron_runs').all();
    const byName = new Map((rows.results || []).map((r) => [r.job_name, r.last_success_at]));
    const now = Date.now();

    for (const job of WATCHED_JOBS) {
      const lastSuccess = byName.get(job.jobName);

      // A missing row means the job has never recorded a success. The migration
      // seeds all watched jobs, so this only happens if someone adds a job here
      // without seeding it — report rather than skip, or the gap hides forever.
      if (!lastSuccess) {
        results.push({ jobName: job.jobName, stale: true, ageHours: null, reason: 'no record' });
        Sentry.captureException(new Error(`Cron never recorded a successful run: ${job.jobName}`), {
          level: 'warning',
          tags: { cron: job.jobName, watchdog: 'missing' },
          extra: { expectedSchedule: job.schedule },
        });
        continue;
      }

      // D1 datetime('now') is 'YYYY-MM-DD HH:MM:SS' UTC; the space needs
      // replacing with 'T' and an explicit Z or Date parses it as local time.
      const parsed = Date.parse(`${String(lastSuccess).replace(' ', 'T')}Z`);
      if (Number.isNaN(parsed)) {
        console.error(`[CronWatchdog] Unparseable timestamp for ${job.jobName}: ${lastSuccess}`);
        continue;
      }

      const ageHours = (now - parsed) / 3_600_000;
      const stale = ageHours > job.maxAgeHours;
      results.push({ jobName: job.jobName, stale, ageHours: Math.round(ageHours * 10) / 10 });

      if (stale) {
        Sentry.captureException(
          new Error(
            `Cron has not completed in ${Math.round(ageHours)}h: ${job.jobName} (expected ${job.schedule})`
          ),
          {
            level: 'error',
            tags: { cron: job.jobName, watchdog: 'stale' },
            extra: {
              lastSuccessAt: lastSuccess,
              ageHours: Math.round(ageHours * 10) / 10,
              maxAgeHours: job.maxAgeHours,
              expectedSchedule: job.schedule,
            },
          }
        );
        console.error(
          `[CronWatchdog] ${job.jobName} last succeeded ${Math.round(ageHours)}h ago (max ${job.maxAgeHours}h)`
        );
      }
    }
  } catch (err) {
    // The watchdog failing is itself worth knowing about — if this query breaks,
    // every job silently loses its absence detection.
    console.error('[CronWatchdog] Freshness check failed:', err?.message);
    Sentry.captureException(err, { tags: { watchdog: 'self-failure' } });
  }

  return results;
}

export { WATCHED_JOBS };
