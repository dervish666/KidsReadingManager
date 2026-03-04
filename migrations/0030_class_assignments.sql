-- Class assignments: links users to classes (populated from Wonde employee-class data)
CREATE TABLE IF NOT EXISTS class_assignments (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(class_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_class_assignments_user ON class_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_class_assignments_class ON class_assignments(class_id);
