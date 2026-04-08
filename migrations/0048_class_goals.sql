-- Migration 0048: Collaborative Class Goals
-- ==========================================
-- Per-class reading goals with denormalized progress counters.
-- Goals span one half-term and auto-generate when first accessed.

CREATE TABLE IF NOT EXISTS class_goals (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    target INTEGER NOT NULL,
    current INTEGER DEFAULT 0,
    term TEXT,
    achieved_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_class_goals_class ON class_goals(class_id);
CREATE INDEX IF NOT EXISTS idx_class_goals_org ON class_goals(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_class_goals_unique ON class_goals(class_id, metric, term);
