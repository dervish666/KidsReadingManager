-- Migration 0003: Classes and Students
-- =====================================
-- Migrate classes and students from KV to D1 with organization_id for multi-tenancy

-- Classes table (migrated from KV)
CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    year_group TEXT,
    teacher_id TEXT,                      -- Optional: assign to specific teacher
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_classes_organization ON classes(organization_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_active ON classes(is_active);

-- Students table (migrated from KV)
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    class_id TEXT,
    name TEXT NOT NULL,
    reading_level TEXT,
    age_range TEXT,
    notes TEXT,
    last_read_date TEXT,                  -- Denormalized for quick access
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_students_organization ON students(organization_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_reading_level ON students(reading_level);
CREATE INDEX IF NOT EXISTS idx_students_last_read ON students(last_read_date);
CREATE INDEX IF NOT EXISTS idx_students_active ON students(is_active);

-- Composite index for common query: students by org and class
CREATE INDEX IF NOT EXISTS idx_students_org_class ON students(organization_id, class_id);
