-- Migration 0057: Drop the last_read_date maintenance triggers.
--
-- These triggers (created in 0004, recreated in 0037) recompute
--   students.last_read_date = MAX(session_date) over ALL reading_sessions
-- on every insert/update/delete. That includes home sessions and
-- ABSENT / NO_RECORD marker rows, which silently defeats the v3.64.3
-- ("last read date tracks school sessions only") application-layer fix:
-- the trigger fires inside the INSERT and overwrites whatever the app set.
--
-- Symptom: marking a child absent, or a parent logging a home session,
-- advances last_read_date to that date, so the teacher register / "needs
-- attention" view wrongly shows the child as having just read.
-- (Matches open support tickets "Last read counting home reading" and
-- "X days since last read should be school only", 2026-05-14.)
--
-- The application now maintains last_read_date correctly on every path:
--   - INSERT  src/routes/students/sessions.js:250  (school, non-marker only)
--   - DELETE  src/routes/students/sessions.js:392  (recompute, school+non-marker)
--   - UPDATE  src/routes/students/sessions.js:505  (recompute, school+non-marker)
-- so these triggers are now both redundant and incorrect. Drop them.

DROP TRIGGER IF EXISTS update_student_last_read_insert;
DROP TRIGGER IF EXISTS update_student_last_read_delete;
DROP TRIGGER IF EXISTS update_student_last_read_update;
