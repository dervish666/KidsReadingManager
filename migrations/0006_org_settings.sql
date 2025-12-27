-- Migration 0006: Organization Settings
-- ======================================
-- Per-organization settings (migrated from KV blob to D1)

CREATE TABLE IF NOT EXISTS org_settings (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value TEXT,                   -- JSON or simple value
    updated_by TEXT,                      -- User who last updated this setting
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(organization_id, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_settings_org ON org_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_settings_key ON org_settings(setting_key);

-- Common setting keys that will be used:
-- 'readingStatusSettings' - JSON: { recentlyReadDays: 3, needsAttentionDays: 7 }
-- 'aiProvider' - 'anthropic' | 'openai' | 'google'
-- 'aiApiKey' - encrypted API key
-- 'schoolName' - display name
-- 'timezone' - school's timezone
-- 'academicYear' - current academic year
-- 'defaultReadingLevel' - default for new students

-- AI configuration table (separate for security - API keys)
CREATE TABLE IF NOT EXISTS org_ai_config (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL UNIQUE,
    provider TEXT DEFAULT 'anthropic',    -- 'anthropic', 'openai', 'google'
    api_key_encrypted TEXT,               -- Encrypted API key
    model_preference TEXT,                -- Preferred model name
    is_enabled INTEGER DEFAULT 0,
    updated_by TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_config_org ON org_ai_config(organization_id);

-- Audit log for sensitive operations (optional but recommended for multi-tenant)
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,                 -- 'login', 'logout', 'create', 'update', 'delete'
    entity_type TEXT,                     -- 'student', 'class', 'session', 'user', 'settings'
    entity_id TEXT,
    details TEXT,                         -- JSON with additional context
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- Composite index for common query: recent audit entries for an org
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_log(organization_id, created_at DESC);
