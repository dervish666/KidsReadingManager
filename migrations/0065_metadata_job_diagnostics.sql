-- migrations/0065_metadata_job_diagnostics.sql
-- Make enrichment jobs debuggable: record *why* a job failed and *which*
-- providers actually contributed data. Both columns are additive + nullable so
-- this is safe against the currently-live code in the apply→deploy gap.

-- Human-readable failure reason, set when a job transitions to 'failed'
-- (route + cron catch sites). NULL for jobs that never failed.
ALTER TABLE metadata_jobs ADD COLUMN error_message TEXT;

-- Per-provider contribution tally as JSON, accumulated across batches, e.g.
-- {"openlibrary":312,"googlebooks":88,"bookinfo":40}. Counts the number of
-- fields each provider supplied across the job. NULL until the first batch runs.
ALTER TABLE metadata_jobs ADD COLUMN provider_stats TEXT;
