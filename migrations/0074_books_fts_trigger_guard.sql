-- Only re-index a book in FTS when the indexed columns actually change.
--
-- books_au fired AFTER UPDATE ON books — every column. books_fts indexes only
-- (id, title, author), so an enrichment pass writing description, page_count,
-- publication_year, series_name or genre_ids re-ran the full delete+insert pair
-- for nothing.
--
-- The delete half is the expensive one. books_fts is a STANDALONE fts5 table
-- (migrations/0019_fix_fts5_rowid.sql) — `id` is an indexed fts5 column, not a
-- rowid — so `DELETE FROM books_fts WHERE id = old.id` cannot seek and scans
-- the whole index. At 2,448 books a full-catalogue enrichment pass therefore
-- did ~2,448 scans of a 2,448-row FTS index: quadratic, on the D1 primary,
-- while the metadata cron holds the connection.
--
-- Two deliberate choices:
--   * `AFTER UPDATE OF title, author` narrows which writes fire the trigger,
--     and the WHEN clause catches the rest (a write that sets title to the
--     value it already held). `IS NOT` rather than `!=` so NULL -> NULL counts
--     as unchanged instead of evaluating to NULL and silently skipping.
--   * The body keeps the plain DELETE. The fts5 `'delete'` command form
--     (INSERT INTO books_fts(books_fts, ...) VALUES('delete', ...)) is only
--     valid for external-content tables; on a standalone table this DDL applies
--     green and then raises SQLITE_ERROR on every subsequent title/author write
--     and every DELETE FROM books.

DROP TRIGGER IF EXISTS books_au;

CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE OF title, author ON books
WHEN old.title IS NOT new.title OR old.author IS NOT new.author
BEGIN
    DELETE FROM books_fts WHERE id = old.id;
    INSERT INTO books_fts(id, title, author) VALUES (new.id, new.title, new.author);
END;
