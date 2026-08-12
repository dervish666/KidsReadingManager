-- Seed the metadata-enrichment poller into the cron liveness table.
--
-- The `*/1 * * * *` cron used to report its own failures directly:
-- `Sentry.captureException` on the metadata_jobs probe query. That query reads
-- a handful of rows in under a millisecond, so every failure it ever reported
-- was D1 being unreachable rather than anything wrong here — and because the
-- cron fires 1,440 times a day it turned short Cloudflare D1 wobbles into
-- per-minute alert storms (TALLY-READING-5: 58 consecutive failures on
-- 2026-07-16, each with its own `D1_ERROR: internal error; reference = …`
-- handle).
--
-- The probe now logs transients instead of capturing them, which moves the
-- responsibility for reporting a genuinely dead poller here. Without this row
-- checkCronFreshness() would report 'no record' on the very first run after
-- deploy — see src/utils/cronWatchdog.js, where a missing row is deliberately
-- treated as a reportable gap rather than skipped.

INSERT OR IGNORE INTO cron_runs (job_name, last_success_at) VALUES
  ('metadata-enrichment', datetime('now'));
