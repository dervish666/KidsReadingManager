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

import { retryD1 } from './d1Retry.js';

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
    // `stale_alerted_at = NULL` re-arms the staleness alert. Recovery is the
    // only thing that clears it, so the NEXT outage is loud again — without
    // this, one alert would be all a job ever produced.
    await retryD1(
      () =>
        db
          .prepare(
            `INSERT INTO cron_runs (job_name, last_success_at, last_duration_ms)
         VALUES (?, datetime('now'), ?)
         ON CONFLICT(job_name) DO UPDATE SET
           last_success_at = excluded.last_success_at,
           last_duration_ms = excluded.last_duration_ms,
           stale_alerted_at = NULL`
          )
          .bind(jobName, durationMs)
          .run(),
      { label: `recordCronSuccess:${jobName}` }
    );
  } catch (err) {
    console.error(`[CronWatchdog] Failed to record success for ${jobName}:`, err?.message);
  }
}

/**
 * How long a job may stay stale before we alert about it a second time.
 *
 * The check runs hourly, so this used to mean one alert an hour for as long as
 * the outage lasted: the single missed badge run on 2026-08-21 produced 22
 * Sentry events and 3 emails, each titled with a different hour count, which
 * reads as an escalating incident rather than one job that missed one night.
 *
 * Alerting is now edge-triggered — once per outage — and this is the safety
 * valve on that. A cron that is dead for a fortnight should not go quiet after
 * its first alert: silence and "fixed" look identical from the inbox. Daily is
 * loud enough to keep a real outage visible and quiet enough to be ignorable
 * when it is the August holidays and nothing is waiting to be processed.
 */
export const STALE_REALERT_HOURS = 24;

/**
 * Parse a SQLite `datetime('now')` string as UTC.
 *
 * D1 hands back 'YYYY-MM-DD HH:MM:SS' with no zone. The space needs replacing
 * with 'T' and an explicit Z, or Date parses it as LOCAL time — which on a
 * Worker is UTC anyway, but on a developer's machine in BST is an hour out and
 * makes the staleness maths quietly wrong in tests.
 *
 * @returns {number|null} epoch ms, or null if absent/unparseable.
 */
function parseSqliteUtc(value) {
  if (!value) return null;
  const parsed = Date.parse(`${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Report any watched job whose last success is older than its threshold.
 *
 * Alerting is EDGE-TRIGGERED: one Sentry event per outage, re-armed by the next
 * successful run (`recordCronSuccess` clears `stale_alerted_at`), and repeated
 * at most once every STALE_REALERT_HOURS while the outage continues.
 *
 * Returns a summary array so callers/tests can assert on it. Never throws — it
 * is a reporter, and must not break the job it runs alongside.
 */
export async function checkCronFreshness(db) {
  const results = [];

  try {
    const rows = await retryD1(
      () => db.prepare('SELECT job_name, last_success_at, stale_alerted_at FROM cron_runs').all(),
      { label: 'checkCronFreshness' }
    );
    const byName = new Map((rows.results || []).map((r) => [r.job_name, r]));
    const now = Date.now();

    for (const job of WATCHED_JOBS) {
      const row = byName.get(job.jobName);
      const lastSuccess = row?.last_success_at;

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

      const parsed = parseSqliteUtc(lastSuccess);
      if (parsed === null) {
        console.error(`[CronWatchdog] Unparseable timestamp for ${job.jobName}: ${lastSuccess}`);
        continue;
      }

      const ageHours = (now - parsed) / 3_600_000;
      const stale = ageHours > job.maxAgeHours;

      // Already alerted about THIS outage? An unparseable or missing stamp
      // counts as "not yet alerted" — erring towards one extra alert beats
      // erring towards silence for a job nobody is watching by hand.
      const alertedAt = parseSqliteUtc(row?.stale_alerted_at);
      const alertDue = alertedAt === null || (now - alertedAt) / 3_600_000 >= STALE_REALERT_HOURS;
      const alerted = stale && alertDue;

      results.push({
        jobName: job.jobName,
        stale,
        ageHours: Math.round(ageHours * 10) / 10,
        alerted,
      });

      if (stale && !alertDue) {
        console.warn(
          `[CronWatchdog] ${job.jobName} still stale (${Math.round(ageHours)}h) — already alerted, next alert in ${Math.round(STALE_REALERT_HOURS - (now - alertedAt) / 3_600_000)}h`
        );
      }

      if (alerted) {
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
              // Distinguishes the daily nag from the first alert. Without it a
              // second email 24h later is indistinguishable from a new outage.
              repeatAlert: alertedAt !== null,
              previouslyAlertedAt: row?.stale_alerted_at ?? null,
            },
          }
        );
        console.error(
          `[CronWatchdog] ${job.jobName} last succeeded ${Math.round(ageHours)}h ago (max ${job.maxAgeHours}h)`
        );

        // Stamp AFTER capturing, so a failed write costs one duplicate alert
        // next hour rather than losing the alert entirely. Failure here degrades
        // to the old hourly behaviour, which is noisy but never silent.
        try {
          await retryD1(
            () =>
              db
                .prepare(
                  `UPDATE cron_runs SET stale_alerted_at = datetime('now') WHERE job_name = ?`
                )
                .bind(job.jobName)
                .run(),
            { label: `staleAlertStamp:${job.jobName}` }
          );
        } catch (stampErr) {
          console.error(
            `[CronWatchdog] Failed to stamp stale alert for ${job.jobName}:`,
            stampErr?.message
          );
        }
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
