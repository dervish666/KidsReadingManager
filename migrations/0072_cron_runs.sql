-- Cron liveness tracking.
--
-- Sentry's free/dev plan includes exactly ONE cron monitor, and upgrading is
-- £89/mo — not proportionate for a solo product. That single slot is spent on
-- `demo-environment-reset` (hourly), which answers "is Cloudflare running our
-- crons at all?".
--
-- This table answers the other half — "did each individual nightly job actually
-- finish?" — without needing a monitor per job. Each cron stamps a row on
-- success; a watchdog in the hourly cron reports any job that has gone stale
-- (see src/utils/cronWatchdog.js).
--
-- Why a dedicated table rather than reading each job's own output: there was no
-- reliable completion marker for the 2am streaks+GDPR job at all. It updates
-- streak fields and audit rows, but in a quiet period nothing changes, so
-- `students.updated_at` can't distinguish "ran, no work to do" from "never ran".
-- A table that records success explicitly is uniform across jobs and doesn't
-- couple the watchdog to any job's internals.

CREATE TABLE IF NOT EXISTS cron_runs (
  job_name TEXT PRIMARY KEY,
  last_success_at TEXT NOT NULL,
  last_duration_ms INTEGER
);

-- Seed the nightly jobs at migration time so the staleness clock starts now.
-- Without this the table is empty on first deploy and the watchdog can't tell
-- "hasn't run yet" from "never runs" — a job that silently never fires would
-- go unreported forever.
INSERT OR IGNORE INTO cron_runs (job_name, last_success_at) VALUES
  ('streaks-and-gdpr-cleanup', datetime('now')),
  ('badge-evaluation', datetime('now')),
  ('wonde-school-sync', datetime('now'));
