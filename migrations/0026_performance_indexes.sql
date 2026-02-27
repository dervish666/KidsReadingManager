-- Performance indexes identified during codebase optimization audit
-- These cover the most common query patterns that were missing index support

-- Rate limiting: compound index for the COUNT + INSERT pattern in authRateLimit()
-- Query: SELECT COUNT(*) FROM rate_limits WHERE key = ? AND endpoint = ? AND created_at > ...
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_endpoint_date
  ON rate_limits(key, endpoint, created_at DESC);

-- Audit log: pagination queries filtered by organization
-- Query: SELECT * FROM audit_log WHERE organization_id = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_audit_log_org_created
  ON audit_log(organization_id, created_at DESC);

-- Wonde sync: organization lookup by wonde_school_id (webhook + sync)
-- Query: SELECT * FROM organizations WHERE wonde_school_id = ?
CREATE INDEX IF NOT EXISTS idx_organizations_wonde_school
  ON organizations(wonde_school_id);

-- Reading sessions: date-based queries for org stats and timeline charts
-- Query: SELECT ... FROM reading_sessions WHERE session_date >= ?
CREATE INDEX IF NOT EXISTS idx_sessions_date
  ON reading_sessions(session_date DESC);

-- Classes: teacher lookup for class assignment queries
CREATE INDEX IF NOT EXISTS idx_classes_org_teacher
  ON classes(organization_id, teacher_id);
