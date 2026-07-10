-- Badge-cron session watermark (audit cycle 16 PERF-M2).
-- The nightly badge cron previously full-recalced every active student's
-- stats from their entire session history every night. The watermark lets it
-- full-process only students with a session created since the last completed
-- run; everyone else gets a cheap window-stat refresh instead.
ALTER TABLE organizations ADD COLUMN last_badge_watermark TEXT;
