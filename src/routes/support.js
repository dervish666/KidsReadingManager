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
  }

  return c.json({ success: true, ticketId });
});

export { supportRouter };
