-- Migration 0033: Term Dates
-- Per-organization half-term date ranges for academic year reporting

CREATE TABLE IF NOT EXISTS term_dates (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    term_name TEXT NOT NULL,
    term_order INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    updated_by TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE(organization_id, academic_year, term_order)
);

CREATE INDEX IF NOT EXISTS idx_term_dates_org_year ON term_dates(organization_id, academic_year);
