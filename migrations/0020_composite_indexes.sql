-- Add composite indexes for common query patterns
-- SQLite can only use one index per table scan, so composite indexes
-- are needed when WHERE clauses filter on multiple columns

-- students: nearly every query filters on (organization_id, is_active)
CREATE INDEX IF NOT EXISTS idx_students_org_active
  ON students(organization_id, is_active);

-- reading_sessions: fetched by student_id, often ordered by session_date
CREATE INDEX IF NOT EXISTS idx_sessions_student_date
  ON reading_sessions(student_id, session_date DESC);

-- org_book_selections: queried by (organization_id, is_available) frequently
CREATE INDEX IF NOT EXISTS idx_org_books_org_available
  ON org_book_selections(organization_id, is_available);

-- users: login and list queries filter on (organization_id, is_active)
CREATE INDEX IF NOT EXISTS idx_users_org_active
  ON users(organization_id, is_active);
