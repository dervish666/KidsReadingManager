-- H11: Track whether a billing event's state mutation actually committed.
-- Before this migration, billing_events was inserted before the mutation
-- ran, so a failed UPDATE would leave the event "processed" without the
-- intended side-effects. Adding a processed flag lets the dedup check
-- distinguish "we saw this event" from "we applied this event".
ALTER TABLE billing_events ADD COLUMN processed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_events ADD COLUMN processed_at TEXT;

-- Backfill: every existing row is assumed to have completed under the
-- old flow. Without this, the first webhook after deploy would see 0
-- matches for any historic event and dedup would fail.
UPDATE billing_events SET processed = 1, processed_at = created_at WHERE processed = 0;
