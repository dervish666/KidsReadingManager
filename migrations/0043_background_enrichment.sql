-- Add background processing flag to metadata jobs
ALTER TABLE metadata_jobs ADD COLUMN background INTEGER DEFAULT 0;
