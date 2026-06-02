-- Migration 0059: Reading bands (gamified reading-volume rank)
-- Per-student band derived from reads logged in the current academic year.

ALTER TABLE students ADD COLUMN band_reads_count INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN current_band INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN band_year_start TEXT;

-- Parent-view state: highest band a parent has already been shown a celebration
-- for. NULL means "never seen" -> the portal silently adopts the current band
-- on first open (no false celebration after deploy).
ALTER TABLE parent_access_tokens ADD COLUMN parent_last_seen_band INTEGER;

-- One-time approximate backfill for the current academic year. Each non-marker
-- session counts as 1 here; [COUNT:n] multiples and any org-specific
-- reads_per_band are corrected on the student's next session write. 20/band default.
UPDATE students
SET band_year_start = CASE
      WHEN CAST(strftime('%m', 'now') AS INTEGER) >= 9
        THEN strftime('%Y', 'now') || '-09-01'
      ELSE (CAST(strftime('%Y', 'now') AS INTEGER) - 1) || '-09-01'
    END;

UPDATE students
SET band_reads_count = (
  SELECT COUNT(*)
  FROM reading_sessions rs
  WHERE rs.student_id = students.id
    AND rs.session_date >= students.band_year_start
    AND (rs.notes IS NULL OR (rs.notes NOT LIKE '%[ABSENT]%' AND rs.notes NOT LIKE '%[NO_RECORD]%'))
);

UPDATE students SET current_band = MIN(15, band_reads_count / 20);

-- Existing parents adopt the child's current band so they aren't spammed with a
-- celebration for an already-held band on first open.
UPDATE parent_access_tokens
SET parent_last_seen_band = (
  SELECT s.current_band FROM students s WHERE s.id = parent_access_tokens.student_id
);
