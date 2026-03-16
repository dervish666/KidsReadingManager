-- Add composite index for common class-scoped student queries
CREATE INDEX IF NOT EXISTS idx_students_org_class_active ON students(organization_id, class_id, is_active);

-- Add composite index for wonde sync log queries
CREATE INDEX IF NOT EXISTS idx_wonde_sync_log_org_started ON wonde_sync_log(organization_id, started_at DESC);
