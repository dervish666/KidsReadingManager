-- Support ticket storage for contact form submissions
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  user_id TEXT,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_org
  ON support_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets(status, created_at);
