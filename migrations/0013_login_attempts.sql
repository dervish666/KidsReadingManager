-- Migration 0013: Login Attempts Tracking
-- =========================================
-- Track failed login attempts to implement account lockout

-- Login attempts table for brute force protection
CREATE TABLE IF NOT EXISTS login_attempts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    success INTEGER DEFAULT 0,  -- 0 = failed, 1 = success
    created_at TEXT DEFAULT (datetime('now'))
);

-- Index for efficient lookups by email and time
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_created ON login_attempts(email, created_at);

-- Cleanup job helper: Delete attempts older than 24 hours
-- This should be run periodically via cron or scheduled worker
-- DELETE FROM login_attempts WHERE created_at < datetime('now', '-24 hours');
