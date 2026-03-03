-- Additional performance indexes for common query patterns
-- Audit item 24 (P-5): Missing indexes on frequently queried columns

-- Students: class-based filtering for class roster views
CREATE INDEX IF NOT EXISTS idx_students_class_id
  ON students(class_id);

-- Reading sessions: student + date compound for session history queries
-- Query: SELECT * FROM reading_sessions WHERE student_id = ? ORDER BY date DESC
CREATE INDEX IF NOT EXISTS idx_reading_sessions_student_date
  ON reading_sessions(student_id, date DESC);

-- Reading sessions: org + date compound for org-wide stats/reports
-- Query: SELECT * FROM reading_sessions WHERE organization_id = ? AND date >= ?
CREATE INDEX IF NOT EXISTS idx_reading_sessions_org_date
  ON reading_sessions(organization_id, date DESC);
