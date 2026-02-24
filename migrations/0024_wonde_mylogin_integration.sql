-- Migration 0024: Add Wonde and MyLogin integration columns

-- Organizations: Wonde school linkage
ALTER TABLE organizations ADD COLUMN wonde_school_id TEXT;
ALTER TABLE organizations ADD COLUMN wonde_school_token TEXT;
ALTER TABLE organizations ADD COLUMN wonde_last_sync_at TEXT;
ALTER TABLE organizations ADD COLUMN mylogin_org_id TEXT;

-- Users: MyLogin SSO linkage
ALTER TABLE users ADD COLUMN mylogin_id TEXT;
ALTER TABLE users ADD COLUMN wonde_employee_id TEXT;
ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local';

-- Create unique index on mylogin_id (nullable, only enforced when not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mylogin_id ON users(mylogin_id) WHERE mylogin_id IS NOT NULL;

-- Students: Wonde student linkage + extended data
ALTER TABLE students ADD COLUMN wonde_student_id TEXT;
ALTER TABLE students ADD COLUMN sen_status TEXT;
ALTER TABLE students ADD COLUMN pupil_premium INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN eal_status TEXT;
ALTER TABLE students ADD COLUMN fsm INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN year_group TEXT;

-- Classes: Wonde class linkage
ALTER TABLE classes ADD COLUMN wonde_class_id TEXT;

-- Sync tracking table
CREATE TABLE IF NOT EXISTS wonde_sync_log (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    sync_type TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    students_created INTEGER DEFAULT 0,
    students_updated INTEGER DEFAULT 0,
    students_deactivated INTEGER DEFAULT 0,
    classes_created INTEGER DEFAULT 0,
    classes_updated INTEGER DEFAULT 0,
    employees_synced INTEGER DEFAULT 0,
    error_message TEXT,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- Employee-class mapping (populated during Wonde sync, used at first MyLogin login)
CREATE TABLE IF NOT EXISTS wonde_employee_classes (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    wonde_employee_id TEXT NOT NULL,
    wonde_class_id TEXT NOT NULL,
    employee_name TEXT,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- Indexes for sync performance
CREATE INDEX IF NOT EXISTS idx_students_wonde_id ON students(wonde_student_id) WHERE wonde_student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classes_wonde_id ON classes(wonde_class_id) WHERE wonde_class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orgs_wonde_school ON organizations(wonde_school_id) WHERE wonde_school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employee_classes_org ON wonde_employee_classes(organization_id);
CREATE INDEX IF NOT EXISTS idx_employee_classes_employee ON wonde_employee_classes(wonde_employee_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_org ON wonde_sync_log(organization_id);
