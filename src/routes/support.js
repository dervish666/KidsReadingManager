import { Hono } from 'hono';
import { rateLimit, requireOwner } from '../middleware/tenant.js';
import { generateId } from '../utils/helpers.js';
import { sendSupportNotificationEmail } from '../utils/email.js';
import { rowToSupportTicket, rowToSupportNote } from '../utils/rowMappers.js';

const supportRouter = new Hono();

supportRouter.post('/', rateLimit(5, 3600000), async (c) => {
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
  const pageUrl = typeof body.pageUrl === 'string' ? body.pageUrl.trim().slice(0, 500) : null;

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
  const userId = c.get('userId') || user.sub || null;

  // Insert ticket
  await db.prepare(
    `INSERT INTO support_tickets (id, organization_id, user_id, user_name, user_email, subject, message, page_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    ticketId,
    organizationId,
    userId,
    user.name || 'Unknown',
    user.email || 'unknown',
    subject,
    message,
    pageUrl
  ).run();

  // Send email notification (non-blocking — errors caught and logged)
  try {
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
      pageUrl,
    });
  } catch (error) {
    console.error('Support notification email error:', error.message);
  }

  return c.json({ success: true, ticketId });
});

// ── Owner-only ticket management endpoints ──────────────────────────────────

// GET /api/support — list all tickets (owner only)
supportRouter.get('/', requireOwner(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  if (!db) {
    return c.json({ error: 'Database not available' }, 500);
  }

  const status = c.req.query('status');
  const validStatuses = ['open', 'in-progress', 'resolved'];

  let sql = `
    SELECT st.*, o.name AS organization_name
    FROM support_tickets st
    LEFT JOIN organizations o ON st.organization_id = o.id
  `;
  const binds = [];

  if (status && validStatuses.includes(status)) {
    sql += ' WHERE st.status = ?';
    binds.push(status);
  }

  sql += ' ORDER BY st.created_at DESC';

  const result = await db.prepare(sql).bind(...binds).all();
  const tickets = (result.results || []).map(rowToSupportTicket);

  return c.json({ tickets });
});

// GET /api/support/:id — ticket detail with notes (owner only)
supportRouter.get('/:id', requireOwner(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  if (!db) {
    return c.json({ error: 'Database not available' }, 500);
  }

  const ticketId = c.req.param('id');

  const ticketRow = await db.prepare(`
    SELECT st.*, o.name AS organization_name
    FROM support_tickets st
    LEFT JOIN organizations o ON st.organization_id = o.id
    WHERE st.id = ?
  `).bind(ticketId).first();

  if (!ticketRow) {
    return c.json({ error: 'Ticket not found' }, 404);
  }

  const notesResult = await db.prepare(
    'SELECT * FROM support_ticket_notes WHERE ticket_id = ? ORDER BY created_at ASC'
  ).bind(ticketId).all();

  const ticket = rowToSupportTicket(ticketRow);
  const notes = (notesResult.results || []).map(rowToSupportNote);

  return c.json({ ticket, notes });
});

// PATCH /api/support/:id — update ticket status (owner only)
supportRouter.patch('/:id', requireOwner(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  if (!db) {
    return c.json({ error: 'Database not available' }, 500);
  }

  const ticketId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const validStatuses = ['open', 'in-progress', 'resolved'];
  if (!body.status || !validStatuses.includes(body.status)) {
    return c.json({ error: 'Invalid status. Must be: open, in-progress, or resolved' }, 400);
  }

  const existing = await db.prepare('SELECT id FROM support_tickets WHERE id = ?').bind(ticketId).first();
  if (!existing) {
    return c.json({ error: 'Ticket not found' }, 404);
  }

  await db.prepare(
    "UPDATE support_tickets SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(body.status, ticketId).run();

  return c.json({ success: true });
});

// POST /api/support/:id/notes — add note to ticket (owner only)
supportRouter.post('/:id/notes', requireOwner(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  if (!db) {
    return c.json({ error: 'Database not available' }, 500);
  }

  const ticketId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const noteText = typeof body.note === 'string' ? body.note.trim() : '';
  if (!noteText) {
    return c.json({ error: 'Note is required' }, 400);
  }
  if (noteText.length > 2000) {
    return c.json({ error: 'Note must be 2000 characters or less' }, 400);
  }

  const existing = await db.prepare('SELECT id FROM support_tickets WHERE id = ?').bind(ticketId).first();
  if (!existing) {
    return c.json({ error: 'Ticket not found' }, 404);
  }

  const user = c.get('user');
  const userId = c.get('userId') || user.sub || null;
  const noteId = generateId();

  await db.batch([
    db.prepare(
      'INSERT INTO support_ticket_notes (id, ticket_id, user_id, user_name, note) VALUES (?, ?, ?, ?, ?)'
    ).bind(noteId, ticketId, userId, user.name || 'Unknown', noteText),
    db.prepare(
      "UPDATE support_tickets SET updated_at = datetime('now') WHERE id = ?"
    ).bind(ticketId),
  ]);

  return c.json({ success: true, noteId });
});

export { supportRouter };
