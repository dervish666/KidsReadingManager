-- Make the cron staleness alert edge-triggered rather than level-triggered.
--
-- `checkCronFreshness` runs inside the hourly :07 cron and captured a Sentry
-- exception on EVERY pass while a job was stale. One missed badge run on
-- 2026-08-21 therefore produced 22 events and 3 emails over 24 hours, each with
-- a different hour count in the title ("27h", "30h", … "48h"), which reads like
-- a worsening incident rather than one job that missed one night.
--
-- This column records when we last alerted about the CURRENT outage.
-- `recordCronSuccess` clears it, so recovery re-arms the alert: the next
-- genuine outage is loud again. While a job stays stale we re-alert at most
-- once every 24 hours, so a permanently dead cron still nags daily instead of
-- going quiet — an alert that fires once and never again is indistinguishable
-- from a fixed problem.
--
-- NULL means "no outage currently alerted", which is also the correct state for
-- every existing row: any job that is stale right now gets exactly one alert on
-- the next hourly pass after this migration lands.

ALTER TABLE cron_runs ADD COLUMN stale_alerted_at TEXT;
