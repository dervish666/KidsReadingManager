-- 0054: Per-organization AI usage tracking for monthly cost cap.
--
-- Today the AI recommendations endpoint has only the generic
-- `costRateLimit(10)` (10 req/min) and a 3/hour cap on demo-tier users.
-- An authenticated school user can spam the endpoint legitimately or
-- maliciously and run up unmetered Anthropic / OpenAI / Google token
-- spend against a per-pupil priced product. This table is the cost
-- ceiling.
--
-- Buckets are calendar-monthly (period_start = 'YYYY-MM'). On each
-- successful AI call the row's call_count is upserted; before each
-- call the route checks call_count < limit and rejects 429 otherwise.
-- A simple call-counter is sufficient to bound spend; token-level
-- accounting can be added later without schema change (existing
-- columns + tokens_in/tokens_out additions).

CREATE TABLE IF NOT EXISTS organization_ai_usage (
  organization_id TEXT NOT NULL,
  period_start TEXT NOT NULL, -- 'YYYY-MM' UTC
  call_count INTEGER NOT NULL DEFAULT 0,
  last_call_at TEXT,
  PRIMARY KEY (organization_id, period_start),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- For the cost-cap pre-flight read on the request hot path.
CREATE INDEX IF NOT EXISTS idx_org_ai_usage_org_period
  ON organization_ai_usage(organization_id, period_start);
