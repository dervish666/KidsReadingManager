# Contact Form on Landing Page — Design Spec

**Date:** 2026-04-07
**Status:** Approved

## Problem

The landing page has a stale "We're launching soon" newsletter signup section. There's no way for prospective customers to contact Tally Reading before signing up. The in-app support form requires authentication, so it's only available to existing users.

## Design

### Purpose

Pre-sales contact form for schools wanting to learn more, ask questions, or request information. Existing users continue using the in-app support button.

### Form Fields

- **Name** (required, max 100 chars)
- **Email** (required, max 200 chars, validated format)
- **Message** (required, max 5000 chars)

No auth required. Rate limited at 5 requests per minute per IP (same pattern as `/api/signup`).

### Backend — `POST /api/contact`

New public endpoint in `src/routes/contact.js`. Does not reuse `/api/support` (which requires JWT auth).

Behaviour:
1. Validate inputs (name, email, message)
2. Rate limit check (5/min per IP, using D1 `rate_limits` table)
3. Insert into `support_tickets` with:
   - `organization_id = NULL` (no org context)
   - `user_id = NULL` (no auth)
   - `user_name` = form name field
   - `user_email` = form email field
   - `subject` = "Landing page enquiry"
   - `message` = form message field
   - `source = 'landing_page'`
   - `page_url = '/'`
   - `status = 'open'`
4. Send email notification via `sendSupportNotificationEmail()` (non-blocking)
5. Return `{ success: true }` — never reveal internal details

### Database Migration

Add `source` column to `support_tickets`:

```sql
ALTER TABLE support_tickets ADD COLUMN source TEXT DEFAULT 'in_app';
```

Existing rows get `'in_app'` default. Landing page submissions use `'landing_page'`. No backfill needed.

### Frontend — LandingPage.js

Replace the "We're launching soon" newsletter CTA section (lines 400-448) with a "Get in Touch" form:

- Three fields: Name, Email, Message
- Submit button with loading state
- Success message after submission ("Thanks! We'll be in touch shortly.")
- Error handling for rate limit and validation failures
- Matches existing landing page aesthetic (warm tones, cozy bookshelf theme)
- Direct fetch to `/api/contact` (no auth needed)

### Public Path Registration

Add `/api/contact` to public paths in:
- `src/middleware/tenant.js` (jwtAuthMiddleware publicPaths array)
- `src/worker.js` (tenant middleware bypass)

### Support Ticket Triage Integration

The existing support ticket triage skill queries `WHERE status IN ('open', 'in-progress')`. Landing page submissions will appear as customer tickets (non-owner email) and trigger alerts. The `source` column allows filtering if needed.

### Row Mapper Update

Update `rowToSupportTicket` in `src/utils/rowMappers.js` to include the `source` field.

### Files Modified

| File | Change |
|------|--------|
| `migrations/XXXX_contact_source.sql` | Add `source` column to `support_tickets` |
| `src/routes/contact.js` | New public endpoint for contact form |
| `src/worker.js` | Register contact route + public path |
| `src/middleware/tenant.js` | Add `/api/contact` to publicPaths |
| `src/components/LandingPage.js` | Replace newsletter section with contact form |
| `src/utils/rowMappers.js` | Add `source` to `rowToSupportTicket` |
