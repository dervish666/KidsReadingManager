-- Badge idempotency: concurrent evaluations (realtime + overnight cron) could
-- award the same badge twice. Dedup existing rows, then enforce uniqueness so
-- INSERT OR IGNORE in badgeEngine.js is a no-op on re-award.
DELETE FROM student_badges
WHERE rowid NOT IN (
  SELECT MIN(rowid) FROM student_badges GROUP BY student_id, badge_id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_badges_unique
  ON student_badges (student_id, badge_id);
