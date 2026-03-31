-- migrations/0042_metadata_ownership.sql

-- Global metadata configuration (single row, owner-managed)
CREATE TABLE IF NOT EXISTS metadata_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  provider_chain TEXT NOT NULL DEFAULT '["hardcover","googlebooks","openlibrary"]',
  hardcover_api_key_encrypted TEXT,
  google_books_api_key_encrypted TEXT,
  rate_limit_delay_ms INTEGER NOT NULL DEFAULT 1500,
  batch_size INTEGER NOT NULL DEFAULT 10,
  fetch_covers INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Seed default config row
INSERT OR IGNORE INTO metadata_config (id) VALUES ('default');

-- Enrichment job tracking
CREATE TABLE IF NOT EXISTS metadata_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  job_type TEXT NOT NULL CHECK (job_type IN ('fill_missing', 'refresh_all')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
  total_books INTEGER NOT NULL DEFAULT 0,
  processed_books INTEGER NOT NULL DEFAULT 0,
  enriched_books INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_book_id TEXT,
  include_covers INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metadata_jobs_org ON metadata_jobs(organization_id);

-- Per-book enrichment history
CREATE TABLE IF NOT EXISTS book_metadata_log (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  fields_updated TEXT,
  cover_url TEXT,
  enriched_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metadata_log_book_id ON book_metadata_log(book_id);
