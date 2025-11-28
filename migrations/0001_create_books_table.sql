-- Migration: Create books table for D1 database
-- This replaces the KV-based book storage with a proper SQL database
-- to support large book collections (18,000+ books)

-- Drop table if exists (for clean migrations)
DROP TABLE IF EXISTS books;

-- Create the books table with all necessary fields
CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    genre_ids TEXT, -- JSON array stored as text: ["genre-1", "genre-2"]
    reading_level TEXT,
    age_range TEXT,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_reading_level ON books(reading_level);

-- Full-text search index for book title and author (for autocomplete)
-- Note: SQLite FTS5 is available in D1
CREATE VIRTUAL TABLE IF NOT EXISTS books_fts USING fts5(
    id,
    title,
    author,
    content='books',
    content_rowid='rowid'
);

-- Triggers to keep FTS index in sync with books table
CREATE TRIGGER IF NOT EXISTS books_ai AFTER INSERT ON books BEGIN
    INSERT INTO books_fts(id, title, author) VALUES (new.id, new.title, new.author);
END;

CREATE TRIGGER IF NOT EXISTS books_ad AFTER DELETE ON books BEGIN
    INSERT INTO books_fts(books_fts, id, title, author) VALUES('delete', old.id, old.title, old.author);
END;

CREATE TRIGGER IF NOT EXISTS books_au AFTER UPDATE ON books BEGIN
    INSERT INTO books_fts(books_fts, id, title, author) VALUES('delete', old.id, old.title, old.author);
    INSERT INTO books_fts(id, title, author) VALUES (new.id, new.title, new.author);
END;
