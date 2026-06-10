-- Migration 0066: Per-organization reading-level override
-- =============================================
-- `books` is a SHARED global catalog; every school sees a book via
-- org_book_selections. Previously a school could edit a book's reading_level
-- on the global row, which corrupted that field for every other linked school
-- (and a body-supplied id allowed cross-tenant writes via import/confirm).
--
-- This column lets each school set its own reading level for a book WITHOUT
-- touching the shared row. NULL means "use the global books.reading_level".
-- It rides on the org_book_selections row that is already INNER JOINed on every
-- org book read, so the read path costs no extra query and no extra join — just
-- a COALESCE(obs.reading_level_override, b.reading_level).
--
-- TEXT to match books.reading_level (AR levels are stored as text, e.g. "13.0").

ALTER TABLE org_book_selections ADD COLUMN reading_level_override TEXT;
