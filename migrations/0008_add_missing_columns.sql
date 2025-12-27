-- Migration 0008: Add missing columns to classes and students tables
-- ===================================================================
-- This migration adds columns that were expected by the application code
-- but were missing from the original schema

-- Add teacher_name and academic_year to classes table
ALTER TABLE classes ADD COLUMN teacher_name TEXT;
ALTER TABLE classes ADD COLUMN academic_year TEXT;
ALTER TABLE classes ADD COLUMN created_by TEXT;

-- Add likes and dislikes to students table (for reading preferences)
ALTER TABLE students ADD COLUMN likes TEXT;
ALTER TABLE students ADD COLUMN dislikes TEXT;
