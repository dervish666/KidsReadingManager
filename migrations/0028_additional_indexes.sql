-- Additional performance indexes for common query patterns
-- Audit item 24 (P-5): Missing indexes on frequently queried columns

-- Students: class-based filtering for class roster views
CREATE INDEX IF NOT EXISTS idx_students_class_id
  ON students(class_id);

-- Reading sessions: student + session_date compound for session history queries
-- Note: idx_sessions_student_date already exists from 0004, so this is a no-op
CREATE INDEX IF NOT EXISTS idx_sessions_student_date
  ON reading_sessions(student_id, session_date DESC);
