-- Remove legacy subscription tier (replaced by Stripe billing)
-- D1 doesn't support DROP COLUMN, so we null it out and stop reading it.
-- The column itself is harmless and can stay until a table rebuild.
UPDATE organizations SET subscription_tier = NULL WHERE subscription_tier IS NOT NULL;

-- Add billing fields to organizations
ALTER TABLE organizations ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE organizations ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE organizations ADD COLUMN subscription_status TEXT DEFAULT 'none';
ALTER TABLE organizations ADD COLUMN subscription_plan TEXT;       -- 'monthly'/'termly'/'annual', synced from Stripe
ALTER TABLE organizations ADD COLUMN ai_addon_active INTEGER DEFAULT 0;  -- whether AI add-on is on the subscription
ALTER TABLE organizations ADD COLUMN trial_ends_at TEXT;
ALTER TABLE organizations ADD COLUMN current_period_end TEXT;
ALTER TABLE organizations ADD COLUMN billing_email TEXT;

-- Index for webhook lookups by stripe_customer_id
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer
  ON organizations(stripe_customer_id);

-- Audit trail for webhook events (deduplication + debugging)
CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT NOT NULL UNIQUE,
  data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_billing_events_organization
  ON billing_events(organization_id);
