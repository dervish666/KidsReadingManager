-- Add ISBN and enrichment columns to books table
-- All columns nullable for backward compatibility with existing books

ALTER TABLE books ADD COLUMN isbn TEXT;
ALTER TABLE books ADD COLUMN page_count INTEGER;
ALTER TABLE books ADD COLUMN series_name TEXT;
ALTER TABLE books ADD COLUMN series_number INTEGER;
ALTER TABLE books ADD COLUMN publication_year INTEGER;

-- Unique index on ISBN (where not null) for fast lookup and dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn) WHERE isbn IS NOT NULL;
