-- Migration 0005: Organization Book Selections
-- =============================================
-- Schools select which books from the global catalog are available to their students
-- This allows each organization to curate their own book library from the shared catalog

CREATE TABLE IF NOT EXISTS org_book_selections (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    is_available INTEGER DEFAULT 1,       -- Can toggle without deleting
    added_by TEXT,                        -- User who added this book
    notes TEXT,                           -- Optional notes about why this book was selected
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(organization_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_book_selections_org ON org_book_selections(organization_id);
CREATE INDEX IF NOT EXISTS idx_book_selections_book ON org_book_selections(book_id);
CREATE INDEX IF NOT EXISTS idx_book_selections_available ON org_book_selections(is_available);

-- Composite index for common query: available books for an organization
CREATE INDEX IF NOT EXISTS idx_book_selections_org_available ON org_book_selections(organization_id, is_available);

-- View for easy querying of available books for an organization
-- Note: D1 supports views but they're read-only
CREATE VIEW IF NOT EXISTS v_org_available_books AS
SELECT 
    obs.organization_id,
    b.id as book_id,
    b.title,
    b.author,
    b.genre_ids,
    b.reading_level,
    b.age_range,
    b.description,
    obs.added_by,
    obs.notes as selection_notes,
    obs.created_at as selected_at
FROM org_book_selections obs
INNER JOIN books b ON obs.book_id = b.id
WHERE obs.is_available = 1;
