# Support Ticket Management Page — Design

**Date:** 2026-03-05
**Status:** Approved

## Overview

Owner-only support ticket management page within SettingsPage. Master-detail layout with ticket list on left, detail panel on right. Supports status changes and internal notes.

## Backend

### New API Endpoints (on `supportRouter`, all owner-only)

- `GET /api/support` — List all tickets. Query params: `?status=open|in-progress|resolved`, `?sort=newest|oldest`. JOINs org name.
- `GET /api/support/:id` — Single ticket with notes array.
- `PATCH /api/support/:id` — Update status (`open` → `in-progress` → `resolved`).
- `POST /api/support/:id/notes` — Add internal note (text, user_id, user_name, timestamp).

### New Migration (0032)

```sql
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
```

### Access Control

All new endpoints use `requireOwner()` middleware from `src/middleware/tenant.js`.

## Frontend

### SettingsPage Integration

New tab: "Support Tickets" with SupportOutlined icon. Visible only when `isOwner`. Follows existing conditional tab pattern.

### SupportTicketManager Component

**Left panel (~40% width):**
- Status filter chips: All / Open / In Progress / Resolved (with counts)
- Ticket cards: subject, submitter name, org name, relative time, status chip
- Selected ticket highlighted

**Right panel (~60% width):**
- Full message display
- Submitter info (name, email, org)
- Status dropdown
- Notes timeline (chronological)
- "Add note" text field at bottom

**Mobile:** List full-width, detail opens as overlay with back button.

### Statuses

- `open` (default) — new/unhandled
- `in-progress` — being worked on
- `resolved` — done

## Styling

Follows existing app conventions: Nunito headings, DM Sans body, #6B8E6B accent, #4A4A4A text, cream backgrounds, 16px border radius on cards.
