-- Migration: Add reading streak tracking to students table
-- Tracks consecutive calendar days of reading with configurable grace period

-- Add streak columns to students table
ALTER TABLE students ADD COLUMN current_streak INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN longest_streak INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN streak_start_date TEXT;

-- Note: Grace period setting will be stored in org_settings table
-- Key: 'streakGracePeriodDays', Value: integer (default 1)
-- This is handled via the existing settings API, no schema change needed
