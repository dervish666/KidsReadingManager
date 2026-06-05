-- Migration 0062: Per-student baseline reads (mid-year onboarding)
-- Lets a school joining partway through the academic year seed each child's
-- existing read total (from their previous system) so the Reading Band volume
-- rank picks up where they left off. The baseline is added to the current
-- academic year's session reads when computing the band; it is year-scoped via
-- baseline_year_start and self-clears at the September rollover (handled in
-- updateStudentBand). Additive + nullable so it's safe against live code.

ALTER TABLE students ADD COLUMN baseline_reads INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN baseline_year_start TEXT;
