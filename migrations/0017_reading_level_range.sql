-- Migration 0017: Add reading level range columns
-- ===============================================
-- Add min/max reading level columns to support flexible range matching
-- instead of a single reading level value

-- Add new reading level range columns
ALTER TABLE students ADD COLUMN reading_level_min REAL;
ALTER TABLE students ADD COLUMN reading_level_max REAL;

-- Create index for range queries
CREATE INDEX IF NOT EXISTS idx_students_reading_level_range
ON students(reading_level_min, reading_level_max);

-- Migrate existing data: X becomes (X-0.5, X+0.5)
-- Handle edge case: values below 1.5 get min clamped to 1.0
UPDATE students
SET
  reading_level_min = CASE
    WHEN reading_level IS NOT NULL AND CAST(reading_level AS REAL) > 0
    THEN MAX(1.0, CAST(reading_level AS REAL) - 0.5)
    ELSE NULL
  END,
  reading_level_max = CASE
    WHEN reading_level IS NOT NULL AND CAST(reading_level AS REAL) > 0
    THEN MIN(13.0, CAST(reading_level AS REAL) + 0.5)
    ELSE NULL
  END
WHERE reading_level IS NOT NULL
  AND reading_level != ''
  AND CAST(reading_level AS REAL) > 0;

-- Drop old column and index (SQLite requires table recreation)
-- For now, leave reading_level in place for rollback safety
-- Will be removed in a future cleanup migration

-- Drop the old single-level index
DROP INDEX IF EXISTS idx_students_reading_level;
