-- Explicit read source for reading sessions ('teacher' | 'parent').
-- Previously inferred from recorded_by IS NULL => parent app, but users are
-- hard-deleted on GDPR erase / staff removal and recorded_by is
-- ON DELETE SET NULL — so a departed teacher's home reads retroactively
-- flipped from the sage "home" tick to the plum "parent app" tick.
ALTER TABLE reading_sessions ADD COLUMN read_source TEXT;

-- Backfill from the old inference. Rows whose teacher was already deleted are
-- unrecoverable (their recorded_by is long NULLed) and stay labelled parent.
UPDATE reading_sessions
SET read_source = CASE WHEN recorded_by IS NULL THEN 'parent' ELSE 'teacher' END;
