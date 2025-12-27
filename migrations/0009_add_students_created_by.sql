-- Migration 0009: Add created_by column to students table
-- ========================================================
-- This column tracks which user created each student record

ALTER TABLE students ADD COLUMN created_by TEXT;
