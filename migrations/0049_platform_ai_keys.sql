-- Migration 0049: Platform-level AI API keys
-- Owner-managed keys used as fallback for schools with AI add-on

CREATE TABLE IF NOT EXISTS platform_ai_keys (
    provider TEXT PRIMARY KEY,
    api_key_encrypted TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT
);
