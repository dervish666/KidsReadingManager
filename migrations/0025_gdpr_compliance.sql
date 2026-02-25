-- Migration 0025: GDPR Compliance
-- ================================
-- Adds columns and tables required for UK GDPR compliance:
-- - Processing restriction flag (Article 18)
-- - Per-student AI opt-out
-- - DPA consent tracking on organizations
-- - Data rights request log (SAR, erasure, etc.)
-- - Wonde erased students exclusion list

-- Students: GDPR processing controls
ALTER TABLE students ADD COLUMN processing_restricted INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN ai_opt_out INTEGER DEFAULT 0;

-- Organizations: DPA consent tracking
ALTER TABLE organizations ADD COLUMN consent_given_at TEXT;
ALTER TABLE organizations ADD COLUMN consent_version TEXT;
ALTER TABLE organizations ADD COLUMN consent_given_by TEXT;

-- Data rights request log (Article 15/17/18 tracking)
CREATE TABLE IF NOT EXISTS data_rights_log (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    request_type TEXT NOT NULL,           -- 'access', 'erasure', 'rectification', 'restriction', 'portability'
    subject_type TEXT NOT NULL,           -- 'student', 'user'
    subject_id TEXT NOT NULL,             -- FK to students or users (may reference erased records)
    requested_by TEXT,                    -- User ID who initiated the request
    status TEXT DEFAULT 'pending',        -- 'pending', 'in_progress', 'completed', 'rejected'
    completed_at TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_data_rights_org ON data_rights_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_data_rights_type ON data_rights_log(request_type);
CREATE INDEX IF NOT EXISTS idx_data_rights_subject ON data_rights_log(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_data_rights_status ON data_rights_log(status);

-- Wonde erased students exclusion list
-- Prevents Wonde sync from re-creating students that were erased via Article 17
CREATE TABLE IF NOT EXISTS wonde_erased_students (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    wonde_student_id TEXT NOT NULL,
    erased_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wonde_erased_org_student ON wonde_erased_students(organization_id, wonde_student_id);
