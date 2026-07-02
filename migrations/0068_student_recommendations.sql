-- Per-student snapshot of the latest AI book recommendations.
--
-- AI recommendations are generated on demand (GET /api/books/ai-suggestions) and
-- cached in KV keyed by a hash of the reading profile — there was no per-student
-- record of what a child was actually shown. This table stores the latest
-- moderated set per student so the parent portal can surface it read-only
-- (no AI spend on the public token endpoint) as a "Book Ideas" take-away.
--
-- One row per student (student_id PRIMARY KEY) — the newest generation upserts
-- over the previous one. `suggestions` is a JSON array of the display fields
-- (title, author, ageRange, readingLevel, reason, whereToFind, inLibrary).
CREATE TABLE IF NOT EXISTS student_recommendations (
    student_id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    focus_mode TEXT,
    suggestions TEXT NOT NULL,
    generated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- Org scope for GDPR purge (orgPurge.js) and admin cleanup.
CREATE INDEX IF NOT EXISTS idx_student_recs_org ON student_recommendations(organization_id);
