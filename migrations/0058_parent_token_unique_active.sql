-- Migration 0058: enforce one active parent token per student per academic year.
--
-- Nothing previously prevented two non-revoked tokens for the same
-- (student_id, academic_year), so a race between the class bulk-generate and a
-- single-student regenerate could leave duplicates, and the print sheet vs the
-- single-QR dialog could then disagree on "the" link.
--
-- Step 1: revoke any duplicate active tokens, keeping the most recently
-- inserted one per (student_id, academic_year). Done first so the unique index
-- below can be created even if duplicates already exist.
UPDATE parent_access_tokens
SET revoked_at = datetime('now')
WHERE revoked_at IS NULL
  AND rowid NOT IN (
    SELECT MAX(rowid)
    FROM parent_access_tokens
    WHERE revoked_at IS NULL
    GROUP BY student_id, academic_year
  );

-- Step 2: partial unique index — only active (non-revoked) tokens are
-- constrained, so historical revoked rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_parent_tokens_active_unique
  ON parent_access_tokens(student_id, academic_year)
  WHERE revoked_at IS NULL;
