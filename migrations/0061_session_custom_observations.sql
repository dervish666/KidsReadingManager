-- Migration 0061: Custom reading-observation slots on a session.
-- Extends the v3.70.0 fixed observations (read_fluent/read_expressive/read_phonics)
-- with three generic slots so each school can configure its own observations
-- (enable/disable + relabel the built-ins, or add up to three of their own).
-- The slot labels + enabled flags live in the `readingObservations` org setting;
-- these columns just store the per-session 0/1 ticks. Nullable, like 0060.

ALTER TABLE reading_sessions ADD COLUMN read_custom1 INTEGER;
ALTER TABLE reading_sessions ADD COLUMN read_custom2 INTEGER;
ALTER TABLE reading_sessions ADD COLUMN read_custom3 INTEGER;
