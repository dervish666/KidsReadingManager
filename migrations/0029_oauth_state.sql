-- Store OAuth2 CSRF state in D1 for strong read-after-write consistency.
-- KV's eventual consistency can cause state lookups to fail when the
-- /login and /callback requests hit different Cloudflare edge nodes.

CREATE TABLE IF NOT EXISTS oauth_state (
  state TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Auto-cleanup: index on created_at for efficient expiry queries
CREATE INDEX IF NOT EXISTS idx_oauth_state_created ON oauth_state(created_at);
