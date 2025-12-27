-- Migration 0011: Add manual book title/author columns to reading_sessions
-- ========================================================================
-- These columns store manually entered book info when no book_id is provided

ALTER TABLE reading_sessions ADD COLUMN book_title_manual TEXT;
ALTER TABLE reading_sessions ADD COLUMN book_author_manual TEXT;

-- Copy existing book_title data to book_title_manual for consistency
UPDATE reading_sessions SET book_title_manual = book_title WHERE book_title IS NOT NULL;
