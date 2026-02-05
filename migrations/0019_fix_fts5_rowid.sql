-- Fix: FTS5 content_rowid='rowid' is incompatible with TEXT primary key
-- Rebuild FTS5 as a standalone (non-content-sync) table
-- The existing triggers already handle manual sync, so content-sync mode is not needed

-- Drop existing triggers (they reference the old FTS table)
DROP TRIGGER IF EXISTS books_ai;
DROP TRIGGER IF EXISTS books_ad;
DROP TRIGGER IF EXISTS books_au;

-- Drop old FTS table
DROP TABLE IF EXISTS books_fts;

-- Create new FTS5 table WITHOUT content sync (standalone)
CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
    id,
    title,
    author
);

-- Populate FTS from existing books data
INSERT INTO books_fts(id, title, author)
SELECT id, title, author FROM books;

-- Recreate triggers for the standalone FTS table
CREATE TRIGGER IF NOT EXISTS books_ai AFTER INSERT ON books BEGIN
    INSERT INTO books_fts(id, title, author) VALUES (new.id, new.title, new.author);
END;

CREATE TRIGGER IF NOT EXISTS books_ad AFTER DELETE ON books BEGIN
    DELETE FROM books_fts WHERE id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE ON books BEGIN
    DELETE FROM books_fts WHERE id = old.id;
    INSERT INTO books_fts(id, title, author) VALUES (new.id, new.title, new.author);
END;
