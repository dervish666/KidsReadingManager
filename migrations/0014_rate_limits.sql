-- Migration 0014: Rate Limits Table
-- ==================================
-- Track API requests for distributed rate limiting across Worker instances

-- Rate limits table for distributed rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,           -- IP address or user ID
    endpoint TEXT NOT NULL,       -- API endpoint path
    created_at TEXT DEFAULT (datetime('now'))
);

-- Index for efficient lookups by key, endpoint, and time
CREATE INDEX IF NOT EXISTS idx_rate_limits_key_endpoint ON rate_limits(key, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_created ON rate_limits(created_at);

-- Note: Cleanup should happen periodically
-- Run this manually or via scheduled worker:
-- DELETE FROM rate_limits WHERE created_at < datetime('now', '-1 hour');
