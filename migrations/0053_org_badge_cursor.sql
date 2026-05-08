-- 0053: Add resumable cursor for the nightly badge cron.
--
-- Worker scheduled tasks have a 30s CPU limit; the badge cron self-bails at
-- 22s to leave headroom. Today the bail is per-org (we stop iterating orgs
-- but never within an org), so a school with 1000+ students can exhaust the
-- whole budget mid-iteration and the next run starts from scratch on the
-- same org. At target scale this never converges.
--
-- `last_badge_cursor` stores the student id we processed last when we ran
-- out of budget mid-org. The next run filters `WHERE s.id > cursor` and
-- resumes after it. Cleared (set NULL) when an org's run completes
-- naturally.

ALTER TABLE organizations ADD COLUMN last_badge_cursor TEXT DEFAULT NULL;
