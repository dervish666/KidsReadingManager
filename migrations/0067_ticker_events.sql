-- Migration 0067: Ticker events
-- ==============================
-- Intra-day celebration events (band-ups, badge awards) recorded as they
-- happen and rotated through the header Reading News ticker for the rest of
-- the day. Rows are short-lived: the 2 AM cron deletes anything older than
-- two days.

CREATE TABLE IF NOT EXISTS ticker_events (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    student_id TEXT,
    type TEXT NOT NULL, -- 'band' | 'badge'
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_ticker_events_org_date ON ticker_events(organization_id, created_at);
