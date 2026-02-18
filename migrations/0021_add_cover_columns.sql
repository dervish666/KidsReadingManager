-- Add cover metadata columns to books table
-- These enable persisting cover references so the frontend doesn't need to
-- re-discover cover IDs from OpenLibrary on every page load.
-- All columns are nullable — existing books are unaffected.

ALTER TABLE books ADD COLUMN cover_id TEXT;
ALTER TABLE books ADD COLUMN cover_source TEXT;
ALTER TABLE books ADD COLUMN cover_url TEXT;

CREATE INDEX IF NOT EXISTS idx_books_cover ON books(cover_id);
