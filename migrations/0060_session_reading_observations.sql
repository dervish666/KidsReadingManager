-- Migration 0060: Reading observations on a session ("how did they read today?")
-- Three optional, independent teacher observations captured on the School Reading
-- page alongside the 1-10 assessment slider. Stored as nullable 0/1 flags;
-- NULL on pre-existing rows and on paths that don't capture them (home/parent).

ALTER TABLE reading_sessions ADD COLUMN read_fluent INTEGER;
ALTER TABLE reading_sessions ADD COLUMN read_expressive INTEGER;
ALTER TABLE reading_sessions ADD COLUMN read_phonics INTEGER;
