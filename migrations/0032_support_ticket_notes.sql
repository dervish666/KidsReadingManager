-- Support ticket notes and updated_at tracking
CREATE TABLE IF NOT EXISTS support_ticket_notes (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_notes_ticket
  ON support_ticket_notes(ticket_id, created_at);

ALTER TABLE support_tickets ADD COLUMN updated_at TEXT;
