-- Indexes for the collapsed class-goals recalculation query (classGoalsEngine.js).
-- Every goals GET now runs one SELECT with six scalar subqueries that all
-- filter `students s ON rs.student_id = s.id` by `(s.class_id, s.organization_id)`.
-- The existing `idx_students_org_class` leads with `organization_id`, which is
-- less selective than `class_id` in this path — adding the reverse order so
-- SQLite can pin on class_id first. Also add a class-scoped student-badges
-- index to cover the badges subquery.

CREATE INDEX IF NOT EXISTS idx_students_class_org
  ON students(class_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_student_badges_student_earned
  ON student_badges(student_id, earned_at);
