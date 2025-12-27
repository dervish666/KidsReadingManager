-- Migration 0010: Add is_predefined column to genres table
-- =========================================================
-- This column indicates whether a genre is a system default or user-created

ALTER TABLE genres ADD COLUMN is_predefined INTEGER DEFAULT 0;

-- Mark existing default genres as predefined
UPDATE genres SET is_predefined = 1 WHERE id LIKE 'genre-%';
