-- Migration 0012: Add location column to reading_sessions
-- ========================================================
-- The location column tracks where the reading session took place
-- Values: 'school', 'home', or NULL

ALTER TABLE reading_sessions ADD COLUMN location TEXT DEFAULT 'school';

-- Create index for filtering by location
CREATE INDEX IF NOT EXISTS idx_sessions_location ON reading_sessions(location);
