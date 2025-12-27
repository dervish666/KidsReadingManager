-- Migration 0007: Genres
-- =======================
-- Migrate genres from KV blob to D1 (global, shared across all organizations)

CREATE TABLE IF NOT EXISTS genres (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    color TEXT,                           -- Optional color for UI display
    icon TEXT,                            -- Optional icon name
    is_active INTEGER DEFAULT 1,
    display_order INTEGER DEFAULT 0,      -- For custom ordering in UI
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_genres_name ON genres(name);
CREATE INDEX IF NOT EXISTS idx_genres_active ON genres(is_active);
CREATE INDEX IF NOT EXISTS idx_genres_order ON genres(display_order);

-- Insert default genres (common children's book genres)
INSERT OR IGNORE INTO genres (id, name, description, display_order) VALUES
    ('genre-adventure', 'Adventure', 'Exciting journeys and quests', 1),
    ('genre-fantasy', 'Fantasy', 'Magic, mythical creatures, and imaginary worlds', 2),
    ('genre-mystery', 'Mystery', 'Puzzles, detectives, and solving crimes', 3),
    ('genre-science-fiction', 'Science Fiction', 'Space, technology, and the future', 4),
    ('genre-realistic-fiction', 'Realistic Fiction', 'Stories that could happen in real life', 5),
    ('genre-historical-fiction', 'Historical Fiction', 'Stories set in the past', 6),
    ('genre-humor', 'Humor', 'Funny stories and jokes', 7),
    ('genre-animal-stories', 'Animal Stories', 'Stories featuring animals as main characters', 8),
    ('genre-fairy-tales', 'Fairy Tales', 'Classic tales with magic and morals', 9),
    ('genre-poetry', 'Poetry', 'Poems and verse', 10),
    ('genre-non-fiction', 'Non-Fiction', 'True stories and factual information', 11),
    ('genre-biography', 'Biography', 'Stories about real people''s lives', 12),
    ('genre-sports', 'Sports', 'Stories about athletics and competition', 13),
    ('genre-graphic-novels', 'Graphic Novels', 'Stories told through illustrations', 14),
    ('genre-horror', 'Horror/Scary', 'Spooky and frightening stories', 15);

-- Book-Genre relationship table (for many-to-many if we move away from JSON arrays)
-- This is optional - we can continue using genre_ids JSON in books table
-- But this normalized approach is better for querying
CREATE TABLE IF NOT EXISTS book_genres (
    book_id TEXT NOT NULL,
    genre_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (book_id, genre_id),
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_book_genres_book ON book_genres(book_id);
CREATE INDEX IF NOT EXISTS idx_book_genres_genre ON book_genres(genre_id);
