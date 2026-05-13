-- Composite index for badge lookups: student detail page fetches earned badges
-- sorted by earned_at, and the badge cron checks earned badge_ids per student.
CREATE INDEX IF NOT EXISTS idx_student_badges_student_earned
  ON student_badges(student_id, earned_at DESC);
