# Support Contact Form Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a support contact form (modal) accessible from the Header and Settings page, with submissions stored in D1 and emailed to a support address.

**Architecture:** New `support_tickets` D1 table, new `POST /api/support` Hono route with rate limiting, new `SupportModal` React component opened from Header icon button and Settings page. Email notification uses existing multi-provider email infrastructure.

**Tech Stack:** Hono (backend route), D1 (SQLite storage), MUI Dialog/TextField/Button (frontend modal), existing email.js utilities (Resend/Cloudflare Email)

---

### Task 1: Database Migration

**Files:**
- Create: `migrations/0031_support_tickets.sql`

**Step 1: Write the migration**

```sql
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
```

**Step 2: Apply migration locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration applied successfully

**Step 3: Commit**

```bash
git add migrations/0031_support_tickets.sql
git commit -m "feat: add support_tickets migration (0031)"
```

---

### Task 2: Email Notification Function

**Files:**
- Modify: `src/utils/email.js` (append new export at end of file)
- Test: `src/__tests__/unit/supportEmail.test.js`

**Step 1: Write the failing test**

Create `src/__tests__/unit/supportEmail.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendSupportNotificationEmail } from '../../utils/email.js';

describe('sendSupportNotificationEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it('sends email via Resend when RESEND_API_KEY is configured', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'email-123' }),
    });

    const env = {
      RESEND_API_KEY: 'test-key',
      EMAIL_FROM: 'support@tallyreading.uk',
    };

    const result = await sendSupportNotificationEmail(env, {
      ticketId: 'ticket-001',
      userName: 'Jane Smith',
      userEmail: 'jane@school.sch.uk',
      organizationName: 'Test School',
      subject: 'Cannot import books',
      message: 'I tried to import a CSV but it failed.',
    });

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' })
    );

    // Verify email content
    const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody.subject).toBe('[Tally Support] Cannot import books');
    expect(callBody.to).toBe('support@tallyreading.uk');
    expect(callBody.text).toContain('Jane Smith');
    expect(callBody.text).toContain('jane@school.sch.uk');
    expect(callBody.text).toContain('Test School');
    expect(callBody.text).toContain('ticket-001');
  });

  it('uses SUPPORT_EMAIL when configured', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'email-123' }),
    });

    const env = {
      RESEND_API_KEY: 'test-key',
      SUPPORT_EMAIL: 'help@tallyreading.uk',
      EMAIL_FROM: 'noreply@tallyreading.uk',
    };

    const result = await sendSupportNotificationEmail(env, {
      ticketId: 'ticket-002',
      userName: 'John',
      userEmail: 'john@school.sch.uk',
      organizationName: null,
      subject: 'Help',
      message: 'Need help.',
    });

    expect(result.success).toBe(true);
    const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody.to).toBe('help@tallyreading.uk');
  });

  it('returns error when no email provider is configured', async () => {
    const env = {};

    const result = await sendSupportNotificationEmail(env, {
      ticketId: 'ticket-003',
      userName: 'Test',
      userEmail: 'test@test.com',
      organizationName: 'School',
      subject: 'Test',
      message: 'Test message',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Email service not configured');
  });

  it('escapes HTML in user-controlled values', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'email-123' }),
    });

    const env = {
      RESEND_API_KEY: 'test-key',
      EMAIL_FROM: 'support@tallyreading.uk',
    };

    await sendSupportNotificationEmail(env, {
      ticketId: 'ticket-004',
      userName: '<script>alert("xss")</script>',
      userEmail: 'test@test.com',
      organizationName: 'School',
      subject: 'Test',
      message: 'Test <b>message</b>',
    });

    const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(callBody.html).not.toContain('<script>');
    expect(callBody.html).toContain('&lt;script&gt;');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/supportEmail.test.js`
Expected: FAIL — `sendSupportNotificationEmail` is not exported

**Step 3: Implement `sendSupportNotificationEmail` in `src/utils/email.js`**

Append to the end of `src/utils/email.js`:

```js
/**
 * Send a notification email when a support ticket is submitted
 * @param {Object} env - Cloudflare environment bindings
 * @param {Object} ticket - Ticket details
 * @param {string} ticket.ticketId - Ticket ID
 * @param {string} ticket.userName - Submitter's name
 * @param {string} ticket.userEmail - Submitter's email
 * @param {string|null} ticket.organizationName - School name (may be null)
 * @param {string} ticket.subject - Ticket subject
 * @param {string} ticket.message - Ticket message
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendSupportNotificationEmail(env, ticket) {
  const to = env.SUPPORT_EMAIL || env.EMAIL_FROM || 'hello@tallyreading.uk';
  const from = env.EMAIL_FROM || 'hello@tallyreading.uk';
  const subject = `[Tally Support] ${ticket.subject}`;
  const timestamp = new Date().toISOString();

  const textBody = `New support ticket from Tally Reading.

Ticket ID: ${ticket.ticketId}
From: ${ticket.userName} (${ticket.userEmail})
School: ${ticket.organizationName || 'N/A'}
Time: ${timestamp}

Subject: ${ticket.subject}

Message:
${ticket.message}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%); padding: 30px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Tally Reading — Support</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="font-size: 16px;">New support ticket submitted:</p>

    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; margin: 20px 0;">
      <p style="margin: 5px 0; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">Ticket: ${escapeHtml(ticket.ticketId)}</p>
      <p style="margin: 5px 0; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">From: ${escapeHtml(ticket.userName)} (${escapeHtml(ticket.userEmail)})</p>
      <p style="margin: 5px 0; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">School: ${escapeHtml(ticket.organizationName || 'N/A')}</p>
      <p style="margin: 5px 0; font-family: monospace; background: #f3f4f6; padding: 8px; border-radius: 4px;">Time: ${timestamp}</p>
    </div>

    <h3 style="margin-bottom: 8px;">${escapeHtml(ticket.subject)}</h3>
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; white-space: pre-wrap;">${escapeHtml(ticket.message)}</div>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="color: #9ca3af; font-size: 12px; margin: 0;">Reply directly to ${escapeHtml(ticket.userEmail)}</p>
  </div>
</body>
</html>`;

  // Try Resend first
  if (env.RESEND_API_KEY) {
    return await sendWithResend(env.RESEND_API_KEY, from, to, subject, textBody, htmlBody);
  }

  // Try Cloudflare Email Routing binding
  if (env.EMAIL_SENDER) {
    return await sendWithCloudflareEmail(env.EMAIL_SENDER, from, to, subject, textBody, htmlBody);
  }

  console.warn('No email provider configured for support notification.');
  return { success: false, error: 'Email service not configured' };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/supportEmail.test.js`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/utils/email.js src/__tests__/unit/supportEmail.test.js
git commit -m "feat: add sendSupportNotificationEmail email utility"
```

---

### Task 3: Backend API Route

**Files:**
- Create: `src/routes/support.js`
- Modify: `src/worker.js:219-223` (add route registration)
- Test: `src/__tests__/integration/support.test.js`

**Step 1: Write the failing test**

Create `src/__tests__/integration/support.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { supportRouter } from '../../routes/support.js';

const TEST_SECRET = 'test-jwt-secret-for-testing';

const createMockDB = (overrides = {}) => {
  const prepareChain = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue(overrides.allResults || { results: [], success: true }),
    first: vi.fn().mockResolvedValue(overrides.firstResult || null),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
  };

  return {
    prepare: vi.fn().mockReturnValue(prepareChain),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    _chain: prepareChain,
    ...overrides,
  };
};

const createTestApp = (contextValues = {}, dbOverrides = {}) => {
  const app = new Hono();
  const mockDB = createMockDB(dbOverrides);

  app.onError((error, c) => {
    const status = error.status || 500;
    return c.json({
      status: 'error',
      message: error.message || 'Internal Server Error',
    }, status);
  });

  app.use('*', async (c, next) => {
    c.env = {
      JWT_SECRET: TEST_SECRET,
      READING_MANAGER_DB: mockDB,
      ...contextValues.env,
    };
    if (contextValues.userId) c.set('userId', contextValues.userId);
    if (contextValues.organizationId) c.set('organizationId', contextValues.organizationId);
    if (contextValues.userRole) c.set('userRole', contextValues.userRole);
    if (contextValues.user) c.set('user', contextValues.user);
    await next();
  });

  app.route('/api/support', supportRouter);
  return { app, mockDB };
};

const makeRequest = async (app, method, path, body = null) => {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  return app.request(path, options);
};

describe('POST /api/support', () => {
  it('creates a support ticket successfully', async () => {
    const { app, mockDB } = createTestApp({
      userId: 'user-1',
      organizationId: 'org-1',
      userRole: 'teacher',
      user: { id: 'user-1', name: 'Jane Smith', email: 'jane@school.sch.uk' },
    });

    const res = await makeRequest(app, 'POST', '/api/support', {
      subject: 'Cannot import books',
      message: 'CSV import is failing with an error.',
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.ticketId).toBeDefined();

    // Verify DB insert was called
    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO support_tickets')
    );
  });

  it('rejects missing subject', async () => {
    const { app } = createTestApp({
      userId: 'user-1',
      organizationId: 'org-1',
      userRole: 'teacher',
      user: { id: 'user-1', name: 'Jane', email: 'jane@test.com' },
    });

    const res = await makeRequest(app, 'POST', '/api/support', {
      message: 'No subject here',
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Subject is required');
  });

  it('rejects missing message', async () => {
    const { app } = createTestApp({
      userId: 'user-1',
      organizationId: 'org-1',
      userRole: 'teacher',
      user: { id: 'user-1', name: 'Jane', email: 'jane@test.com' },
    });

    const res = await makeRequest(app, 'POST', '/api/support', {
      subject: 'Help',
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Message is required');
  });

  it('rejects subject exceeding 200 characters', async () => {
    const { app } = createTestApp({
      userId: 'user-1',
      organizationId: 'org-1',
      userRole: 'teacher',
      user: { id: 'user-1', name: 'Jane', email: 'jane@test.com' },
    });

    const res = await makeRequest(app, 'POST', '/api/support', {
      subject: 'x'.repeat(201),
      message: 'Some message',
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Subject must be 200 characters or less');
  });

  it('rejects message exceeding 5000 characters', async () => {
    const { app } = createTestApp({
      userId: 'user-1',
      organizationId: 'org-1',
      userRole: 'teacher',
      user: { id: 'user-1', name: 'Jane', email: 'jane@test.com' },
    });

    const res = await makeRequest(app, 'POST', '/api/support', {
      subject: 'Help',
      message: 'x'.repeat(5001),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Message must be 5000 characters or less');
  });

  it('rejects unauthenticated request (no user in context)', async () => {
    const { app } = createTestApp({});

    const res = await makeRequest(app, 'POST', '/api/support', {
      subject: 'Help',
      message: 'Need help',
    });

    expect(res.status).toBe(401);
  });

  it('succeeds even if email sending fails', async () => {
    const { app, mockDB } = createTestApp({
      userId: 'user-1',
      organizationId: 'org-1',
      userRole: 'teacher',
      user: { id: 'user-1', name: 'Jane', email: 'jane@test.com' },
      env: {}, // No email provider configured
    });

    const res = await makeRequest(app, 'POST', '/api/support', {
      subject: 'Help',
      message: 'Need help.',
    });

    // Should still succeed — email failure is non-blocking
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('trims and sanitizes subject and message', async () => {
    const { app, mockDB } = createTestApp({
      userId: 'user-1',
      organizationId: 'org-1',
      userRole: 'teacher',
      user: { id: 'user-1', name: 'Jane', email: 'jane@test.com' },
    });

    const res = await makeRequest(app, 'POST', '/api/support', {
      subject: '  Help me  ',
      message: '  I need assistance.  ',
    });

    expect(res.status).toBe(200);

    // Verify the bound values are trimmed
    const bindCalls = mockDB._chain.bind.mock.calls;
    // Find the bind call for the INSERT (it has the most arguments)
    const insertBind = bindCalls.find(call => call.length >= 7);
    expect(insertBind).toBeDefined();
    // subject is the 5th arg (index 4), message is the 6th (index 5)
    expect(insertBind[4]).toBe('Help me');
    expect(insertBind[5]).toBe('I need assistance.');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/integration/support.test.js`
Expected: FAIL — cannot import `supportRouter`

**Step 3: Implement the route**

Create `src/routes/support.js`:

```js
import { Hono } from 'hono';
import { rateLimit } from '../middleware/tenant.js';
import { generateId } from '../utils/helpers.js';
import { sendSupportNotificationEmail } from '../utils/email.js';

const supportRouter = new Hono();

// Rate limit: 5 per hour per user
supportRouter.use('/', rateLimit(5, 3600000));

supportRouter.post('/', async (c) => {
  // Require authentication
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Authentication required' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  // Validate
  if (!subject) {
    return c.json({ error: 'Subject is required' }, 400);
  }
  if (subject.length > 200) {
    return c.json({ error: 'Subject must be 200 characters or less' }, 400);
  }
  if (!message) {
    return c.json({ error: 'Message is required' }, 400);
  }
  if (message.length > 5000) {
    return c.json({ error: 'Message must be 5000 characters or less' }, 400);
  }

  const db = c.env.READING_MANAGER_DB;
  if (!db) {
    return c.json({ error: 'Database not available' }, 500);
  }

  const ticketId = generateId();
  const organizationId = c.get('organizationId') || null;

  // Insert ticket
  await db.prepare(
    `INSERT INTO support_tickets (id, organization_id, user_id, user_name, user_email, subject, message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    ticketId,
    organizationId,
    user.id,
    user.name || 'Unknown',
    user.email || 'unknown',
    subject,
    message
  ).run();

  // Send email notification (fire and forget — don't block the response)
  try {
    // Fetch org name for the email
    let organizationName = null;
    if (organizationId) {
      const org = await db.prepare(
        'SELECT name FROM organizations WHERE id = ? AND is_active = 1'
      ).bind(organizationId).first();
      organizationName = org?.name || null;
    }

    await sendSupportNotificationEmail(c.env, {
      ticketId,
      userName: user.name || 'Unknown',
      userEmail: user.email || 'unknown',
      organizationName,
      subject,
      message,
    });
  } catch (error) {
    console.error('Support notification email error:', error.message);
    // Non-blocking — ticket is already saved
  }

  return c.json({ success: true, ticketId });
});

export { supportRouter };
```

**Step 4: Register the route in `src/worker.js`**

Add after line 223 (`app.route('/api/wonde', wondeAdminRouter);`):

```js
import { supportRouter } from './routes/support.js';
```
(Add to the imports section at the top, around line 35)

```js
app.route('/api/support', supportRouter);
```
(Add after the wonde admin route registration, around line 224)

**Step 5: Run test to verify it passes**

Run: `npx vitest run src/__tests__/integration/support.test.js`
Expected: All 8 tests PASS

**Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests still pass

**Step 7: Commit**

```bash
git add src/routes/support.js src/__tests__/integration/support.test.js src/worker.js
git commit -m "feat: add POST /api/support route with D1 storage and email notification"
```

---

### Task 4: SupportModal Component

**Files:**
- Create: `src/components/SupportModal.js`

**Step 1: Create the SupportModal component**

```jsx
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useAppContext } from '../contexts/AppContext';

const SupportModal = ({ open, onClose }) => {
  const { user, fetchWithAuth } = useAppContext();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [ticketId, setTicketId] = useState(null);

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);

    try {
      const response = await fetchWithAuth('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), message: message.trim() }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit support request');
      }

      const data = await response.json();
      setTicketId(data.ticketId);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset form state on close
    setSubject('');
    setMessage('');
    setError(null);
    setSuccess(false);
    setTicketId(null);
    onClose();
  };

  const isValid = subject.trim().length > 0 && message.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '16px',
          backgroundColor: '#FFFEF9',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: '"Nunito", sans-serif',
          fontWeight: 800,
          color: '#4A4A4A',
          pb: 0,
        }}
      >
        Contact Support
        <IconButton onClick={handleClose} size="small" aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {success ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 56, color: '#6B8E6B', mb: 2 }} />
            <Typography
              variant="h6"
              sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: '#4A4A4A', mb: 1 }}
            >
              Message sent
            </Typography>
            <Typography
              sx={{ fontFamily: '"DM Sans", sans-serif', color: '#7A7A7A', mb: 2 }}
            >
              We'll get back to you as soon as we can.
            </Typography>
            <Typography
              variant="caption"
              sx={{ fontFamily: '"DM Sans", sans-serif', color: '#9A9A9A' }}
            >
              Reference: {ticketId?.slice(0, 8)}
            </Typography>
          </Box>
        ) : (
          <>
            <Box
              sx={{
                backgroundColor: 'rgba(107, 142, 107, 0.08)',
                borderRadius: '10px',
                p: 2,
                mb: 2,
                mt: 1,
              }}
            >
              <Typography variant="body2" sx={{ fontFamily: '"DM Sans", sans-serif', color: '#5A5A5A' }}>
                Sending as <strong>{user?.name}</strong> ({user?.email})
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <TextField
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              fullWidth
              required
              inputProps={{ maxLength: 200 }}
              helperText={`${subject.length}/200`}
              sx={{ mb: 2 }}
              disabled={loading}
              autoFocus
            />

            <TextField
              label="How can we help?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              fullWidth
              required
              multiline
              rows={6}
              inputProps={{ maxLength: 5000 }}
              helperText={`${message.length}/5000`}
              disabled={loading}
            />
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {success ? (
          <Button
            onClick={handleClose}
            variant="outlined"
            sx={{
              color: '#6B8E6B',
              borderColor: 'rgba(107, 142, 107, 0.3)',
              textTransform: 'none',
              fontWeight: 600,
              '&:hover': { borderColor: '#6B8E6B', backgroundColor: 'rgba(107, 142, 107, 0.05)' },
            }}
          >
            Close
          </Button>
        ) : (
          <>
            <Button
              onClick={handleClose}
              disabled={loading}
              sx={{ color: '#7A7A7A', textTransform: 'none', fontWeight: 600 }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={!isValid || loading}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
              sx={{
                backgroundColor: '#6B8E6B',
                textTransform: 'none',
                fontWeight: 600,
                borderRadius: '10px',
                px: 3,
                '&:hover': { backgroundColor: '#5A7D5A' },
                '&.Mui-disabled': { backgroundColor: 'rgba(107, 142, 107, 0.3)' },
              }}
            >
              {loading ? 'Sending...' : 'Send message'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default SupportModal;
```

**Step 2: Commit**

```bash
git add src/components/SupportModal.js
git commit -m "feat: add SupportModal component"
```

---

### Task 5: Add Help Icon to Header

**Files:**
- Modify: `src/components/Header.js`

**Step 1: Add the support icon and modal to Header**

In `src/components/Header.js`:

1. Add imports at the top:
```js
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SupportModal from './SupportModal';
```

2. Add state inside the component (after line 26, after `schoolAnchorEl` state):
```js
const [supportOpen, setSupportOpen] = useState(false);
```

3. Add help icon button inside the authenticated section (before the Logout button, inside the `Box` with `ml: 'auto'` at line 211). Insert before the `<Button variant="outlined"` logout button:
```jsx
<IconButton
  onClick={() => setSupportOpen(true)}
  size="small"
  aria-label="Contact support"
  sx={{
    color: '#6B8E6B',
    '&:hover': { backgroundColor: 'rgba(107, 142, 107, 0.08)' },
  }}
>
  <HelpOutlineIcon sx={{ fontSize: 20 }} />
</IconButton>
```

4. Add `IconButton` to the MUI imports at line 2.

5. Add `SupportModal` render just before the closing `</AppBar>` tag:
```jsx
<SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
```

**Step 2: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Header.js
git commit -m "feat: add support help icon to Header"
```

---

### Task 6: Add Support Section to Settings Page

**Files:**
- Modify: `src/components/SettingsPage.js`

**Step 1: Add support section to SettingsPage**

In `src/components/SettingsPage.js`:

1. Add imports:
```js
import { useState } from 'react';  // already imported
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SupportModal from './SupportModal';
import { Button } from '@mui/material';  // Button already imported via MUI
```

2. Add state (inside the component, after line 28):
```js
const [supportOpen, setSupportOpen] = useState(false);
```

3. Replace the existing `<Box sx={{ mt: 3, textAlign: 'center' }}>` section (lines 122-140) — the privacy link area — with:
```jsx
<Box sx={{ mt: 3, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
  <Box
    sx={{
      backgroundColor: 'rgba(107, 142, 107, 0.06)',
      borderRadius: '12px',
      p: 2.5,
      maxWidth: 400,
      width: '100%',
    }}
  >
    <Typography
      variant="subtitle2"
      sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: '#4A4A4A', mb: 0.5 }}
    >
      Need help?
    </Typography>
    <Typography
      variant="body2"
      sx={{ fontFamily: '"DM Sans", sans-serif', color: '#7A7A7A', mb: 1.5, fontSize: '0.85rem' }}
    >
      Get in touch and we'll help you get set up.
    </Typography>
    <Button
      variant="outlined"
      startIcon={<HelpOutlineIcon />}
      onClick={() => setSupportOpen(true)}
      sx={{
        color: '#6B8E6B',
        borderColor: 'rgba(107, 142, 107, 0.3)',
        textTransform: 'none',
        fontWeight: 600,
        borderRadius: '10px',
        '&:hover': { borderColor: '#6B8E6B', backgroundColor: 'rgba(107, 142, 107, 0.05)' },
      }}
    >
      Contact support
    </Button>
  </Box>

  <Link
    href="/privacy"
    target="_blank"
    rel="noopener"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 0.5,
      color: 'rgba(74, 74, 74, 0.5)',
      fontSize: '0.85rem',
      textDecoration: 'none',
      '&:hover': { color: '#6B8E6B' },
    }}
  >
    <PolicyIcon sx={{ fontSize: 16 }} />
    Privacy Policy
  </Link>
</Box>

<SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
```

**Step 2: Verify build compiles**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/SettingsPage.js
git commit -m "feat: add support section to Settings page"
```

---

### Task 7: Update Structure Index

**Files:**
- Modify: `CLAUDE.md` (file map section — add SupportModal entry)
- Modify: `.claude/structure/routes.yaml` (add support route)
- Modify: `.claude/structure/components.yaml` (add SupportModal)

**Step 1: Update CLAUDE.md file map**

Add under `<!-- Frontend Components - Root -->` section, after the BookRecommendations line:
```
src/components/SupportModal.js - Support contact form modal (subject, message, email notification)
```

Add under `<!-- Backend Routes -->` section, after the wondeAdmin line:
```
src/routes/support.js - POST support ticket submission with D1 storage and email notification
```

**Step 2: Update structure YAML files**

Add to `.claude/structure/routes.yaml`:
```yaml
support.js:
  exports:
    - supportRouter
  endpoints:
    - POST / - Submit support ticket (rate limited: 5/hour, requires auth)
  dependencies:
    - ../middleware/tenant.js (rateLimit)
    - ../utils/helpers.js (generateId)
    - ../utils/email.js (sendSupportNotificationEmail)
```

Add to `.claude/structure/components.yaml`:
```yaml
SupportModal.js:
  props:
    - open: boolean
    - onClose: () => void
  state: subject, message, loading, error, success, ticketId
  dependencies:
    - ../contexts/AppContext.js (useAppContext — user, fetchWithAuth)
  api_calls:
    - POST /api/support
```

**Step 3: Commit**

```bash
git add CLAUDE.md .claude/structure/routes.yaml .claude/structure/components.yaml
git commit -m "docs: update structure index for support feature"
```

---

### Task 8: Full Verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new support tests)

**Step 2: Build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Apply migration to production (when ready)**

Run: `npx wrangler d1 migrations apply reading-manager-db --remote`

**Step 4: Final commit with version bump**

Update `package.json` version to `3.10.6`, update health endpoint version in `src/worker.js`.

```bash
git add package.json src/worker.js
git commit -m "chore: bump version to 3.10.6"
```

---

### Summary of files changed

| Action | File |
|--------|------|
| Create | `migrations/0031_support_tickets.sql` |
| Create | `src/routes/support.js` |
| Create | `src/components/SupportModal.js` |
| Create | `src/__tests__/unit/supportEmail.test.js` |
| Create | `src/__tests__/integration/support.test.js` |
| Modify | `src/utils/email.js` (add `sendSupportNotificationEmail`) |
| Modify | `src/worker.js` (import + route registration) |
| Modify | `src/components/Header.js` (help icon + modal) |
| Modify | `src/components/SettingsPage.js` (support section + modal) |
| Modify | `CLAUDE.md` (file map) |
| Modify | `.claude/structure/routes.yaml` |
| Modify | `.claude/structure/components.yaml` |

### New env var

| Variable | Purpose | Required |
|----------|---------|----------|
| `SUPPORT_EMAIL` | Override recipient for support notifications | No (falls back to `EMAIL_FROM` then `hello@tallyreading.uk`) |
