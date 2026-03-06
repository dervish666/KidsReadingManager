# Support Contact Form — Design

**Date:** 2026-03-05
**Status:** Approved

## Overview

Add a support contact form accessible from the Header (help icon) and Settings page. Submissions are stored in D1 and emailed to a support address. Logged-in users only.

## Database Schema

Migration `0031_support_tickets.sql`:

```sql
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
```

Status values: `open`, `closed`. Expandable later.

## API

### `POST /api/support`

- **Auth:** Required (JWT)
- **Rate limit:** 5 per hour per user
- **Body:** `{ subject: string (max 200), message: string (max 5000) }`
- **Auto-populated:** user name, email, organization ID from JWT context
- **Response:** `{ success: true, ticketId: string }`
- **Side effect:** Sends email notification to `SUPPORT_EMAIL` env var (falls back to `EMAIL_FROM`)

Registered in `src/worker.js` under the authenticated route group.

## Frontend

### SupportModal.js (new component)

MUI Dialog with:
- Subject TextField (required, max 200 chars)
- Message TextField (multiline, 6 rows, required, max 5000 chars)
- Read-only display of user name/email (context for what gets sent)
- Submit button with loading state
- Success state: confirmation message with ticket reference
- Error state: message with retry option

### Header.js changes

- Add `HelpOutlineIcon` button next to logout button
- Opens `SupportModal`
- Only visible when authenticated (already inside the auth-gated section)

### SettingsPage.js changes

- Add a "Need Help?" section below the privacy link
- Brief message + button to open `SupportModal`

## Email Notification

New function `sendSupportNotificationEmail()` in `src/utils/email.js`:
- To: `SUPPORT_EMAIL` or `EMAIL_FROM`
- Subject: `[Tally Support] {ticket subject}`
- Body: user name, email, school name, message, ticket ID
- HTML template matching existing email styling

## Not Included (YAGNI)

- No user-facing ticket tracking UI
- No admin ticket management view
- No file/screenshot uploads
- No categories or priority
- No auto-responder to user
- No public (unauthenticated) access
