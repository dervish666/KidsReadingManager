-- Migration 0037: Convert assessment from TEXT to INTEGER (1-10 scale)
-- SQLite cannot ALTER COLUMN, so we recreate the table

-- Step 1: Create new table with INTEGER assessment
CREATE TABLE IF NOT EXISTS reading_sessions_new (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    book_id TEXT,
    book_title TEXT,
    session_date TEXT NOT NULL,
    duration_minutes INTEGER,
    pages_read INTEGER,
    assessment INTEGER,
    notes TEXT,
    rating INTEGER,
    recorded_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    book_title_manual TEXT,
    book_author_manual TEXT,
    location TEXT DEFAULT 'school',
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Step 2: Copy data, converting assessment strings to integers
-- Home reading markers get NULL assessment
-- Other values (guided, read_aloud, not_assessed, struggled) map to 5 via ELSE catch-all
INSERT INTO reading_sessions_new
SELECT
    id, student_id, book_id, book_title, session_date,
    duration_minutes, pages_read,
    CASE
        WHEN notes LIKE '%[ABSENT]%' THEN NULL
        WHEN notes LIKE '%[NO_RECORD]%' THEN NULL
        WHEN notes LIKE '%[COUNT:%' THEN NULL
        WHEN assessment = 'struggling' THEN 2
        WHEN assessment = 'needs-help' THEN 5
        WHEN assessment = 'needs_help' THEN 5
        WHEN assessment = 'independent' THEN 9
        WHEN assessment IS NULL THEN NULL
        ELSE 5
    END,
    notes, rating, recorded_by, created_at, updated_at,
    book_title_manual, book_author_manual, location
FROM reading_sessions;

-- Step 3: Drop old table and rename
DROP TABLE reading_sessions;
ALTER TABLE reading_sessions_new RENAME TO reading_sessions;

-- Step 4: Recreate all indexes
CREATE INDEX IF NOT EXISTS idx_sessions_student ON reading_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON reading_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_book ON reading_sessions(book_id);
CREATE INDEX IF NOT EXISTS idx_sessions_recorded_by ON reading_sessions(recorded_by);
CREATE INDEX IF NOT EXISTS idx_sessions_student_date ON reading_sessions(student_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_location ON reading_sessions(location);
CREATE INDEX IF NOT EXISTS idx_sessions_session_date_desc ON reading_sessions(session_date DESC);

-- Step 5: Recreate triggers
CREATE TRIGGER IF NOT EXISTS update_student_last_read_insert
AFTER INSERT ON reading_sessions
BEGIN
    UPDATE students
    SET last_read_date = (
        SELECT MAX(session_date)
        FROM reading_sessions
        WHERE student_id = NEW.student_id
    ),
    updated_at = datetime('now')
    WHERE id = NEW.student_id;
END;

CREATE TRIGGER IF NOT EXISTS update_student_last_read_delete
AFTER DELETE ON reading_sessions
BEGIN
    UPDATE students
    SET last_read_date = (
        SELECT MAX(session_date)
        FROM reading_sessions
        WHERE student_id = OLD.student_id
    ),
    updated_at = datetime('now')
    WHERE id = OLD.student_id;
END;

CREATE TRIGGER IF NOT EXISTS update_student_last_read_update
AFTER UPDATE OF session_date ON reading_sessions
BEGIN
    UPDATE students
    SET last_read_date = (
        SELECT MAX(session_date)
        FROM reading_sessions
        WHERE student_id = NEW.student_id
    ),
    updated_at = datetime('now')
    WHERE id = NEW.student_id;
END;
