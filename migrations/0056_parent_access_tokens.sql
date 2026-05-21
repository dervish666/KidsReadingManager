-- Parent access tokens for QR-code-based parent portal
CREATE TABLE IF NOT EXISTS parent_access_tokens (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    student_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    created_by TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_parent_tokens_token ON parent_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_parent_tokens_student ON parent_access_tokens(student_id);
CREATE INDEX IF NOT EXISTS idx_parent_tokens_org_year ON parent_access_tokens(organization_id, academic_year);
