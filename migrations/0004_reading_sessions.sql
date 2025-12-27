-- Migration 0004: Reading Sessions and Student Preferences
-- =========================================================
-- Normalize reading sessions from embedded arrays to separate table
-- Also normalize student genre preferences (likes/dislikes)

-- Reading sessions table (normalized from embedded arrays in students)
CREATE TABLE IF NOT EXISTS reading_sessions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    book_id TEXT,                         -- References global books table
    book_title TEXT,                      -- Denormalized for display (in case book is deleted)
    session_date TEXT NOT NULL,           -- ISO date (YYYY-MM-DD)
    duration_minutes INTEGER,
    pages_read INTEGER,
    assessment TEXT,                      -- 'struggling', 'needs_help', 'independent'
    notes TEXT,
    rating INTEGER,                       -- 1-5 stars
    recorded_by TEXT,                     -- User who recorded this session
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_student ON reading_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON reading_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_book ON reading_sessions(book_id);
CREATE INDEX IF NOT EXISTS idx_sessions_recorded_by ON reading_sessions(recorded_by);

-- Composite index for common query: sessions by student ordered by date
CREATE INDEX IF NOT EXISTS idx_sessions_student_date ON reading_sessions(student_id, session_date DESC);

-- Student preferences (likes/dislikes - normalized from embedded arrays)
CREATE TABLE IF NOT EXISTS student_preferences (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    genre_id TEXT NOT NULL,
    preference_type TEXT NOT NULL,        -- 'like' or 'dislike'
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE,
    UNIQUE(student_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_preferences_student ON student_preferences(student_id);
CREATE INDEX IF NOT EXISTS idx_preferences_genre ON student_preferences(genre_id);
CREATE INDEX IF NOT EXISTS idx_preferences_type ON student_preferences(preference_type);

-- Trigger to update student's last_read_date when a session is added
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

-- Trigger to update student's last_read_date when a session is deleted
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

-- Trigger to update student's last_read_date when a session date is updated
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
