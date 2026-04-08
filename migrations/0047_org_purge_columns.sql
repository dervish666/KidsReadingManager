-- Add purge tracking and legal hold columns to organizations
ALTER TABLE organizations ADD COLUMN purged_at TEXT;
ALTER TABLE organizations ADD COLUMN legal_hold INTEGER NOT NULL DEFAULT 0;
