-- Add current_book_id to students table for consistent book tracking
-- This replaces the localStorage-based approach which was device-specific

ALTER TABLE students ADD COLUMN current_book_id TEXT REFERENCES books(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_students_current_book ON students(current_book_id);

-- Populate current_book_id from most recent reading session for existing students
-- This provides a sensible default based on their last recorded session
UPDATE students
SET current_book_id = (
    SELECT book_id
    FROM reading_sessions
    WHERE reading_sessions.student_id = students.id
      AND book_id IS NOT NULL
    ORDER BY session_date DESC, created_at DESC
    LIMIT 1
);
