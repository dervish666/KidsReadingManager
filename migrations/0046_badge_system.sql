-- Migration 0046: Badge & Achievement System
-- ============================================
-- Two new tables: student_reading_stats (aggregated counters) and
-- student_badges (earned badge records).

-- ── Aggregated reading stats per student ────────────────────────────────────

CREATE TABLE IF NOT EXISTS student_reading_stats (
    student_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    total_books INTEGER DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    total_minutes INTEGER DEFAULT 0,
    total_pages INTEGER DEFAULT 0,
    genres_read TEXT DEFAULT '[]',
    unique_authors_count INTEGER DEFAULT 0,
    fiction_count INTEGER DEFAULT 0,
    nonfiction_count INTEGER DEFAULT 0,
    poetry_count INTEGER DEFAULT 0,
    days_read_this_week INTEGER DEFAULT 0,
    days_read_this_term INTEGER DEFAULT 0,
    days_read_this_month INTEGER DEFAULT 0,
    weeks_with_4plus_days INTEGER DEFAULT 0,
    weeks_with_reading INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_reading_stats_org ON student_reading_stats(organization_id);

-- ── Earned badges ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS student_badges (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    tier TEXT NOT NULL,
    earned_at TEXT DEFAULT (datetime('now')),
    notified INTEGER DEFAULT 0,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_badges_student ON student_badges(student_id);
CREATE INDEX IF NOT EXISTS idx_badges_org ON student_badges(organization_id);
