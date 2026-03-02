-- Add disabled column to classes table
-- Used by frontend to hide classes from dropdowns/filters without deleting them
ALTER TABLE classes ADD COLUMN disabled INTEGER DEFAULT 0;
