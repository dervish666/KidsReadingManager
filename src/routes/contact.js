import { Hono } from 'hono';
import { rateLimit } from '../middleware/tenant.js';
import { sendSupportNotificationEmail } from '../utils/email.js';

const contactRouter = new Hono();

// Rate limit: 5 per minute per IP
contactRouter.use('/', rateLimit(5, 60000));

contactRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ error: 'Invalid request' }, 400);
  }

  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const message = (body.message || '').trim();

  if (!name || name.length > 100) {
    return c.json({ error: 'Name is required (max 100 characters)' }, 400);
  }
  if (!email) {
    return c.json({ error: 'Email is required' }, 400);
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email) || email.length > 200) {
    return c.json({ error: 'Invalid email format' }, 400);
  }
  if (!message || message.length > 5000) {
    return c.json({ error: 'Message is required (max 5000 characters)' }, 400);
  }

  const db = c.env.READING_MANAGER_DB;
  if (!db) {
    return c.json({ success: true });
  }

  const ticketId = crypto.randomUUID();
  const subject = 'Landing page enquiry';

  try {
    await db
      .prepare(
        `INSERT INTO support_tickets (id, organization_id, user_id, user_name, user_email, subject, message, page_url, status, source, created_at)
         VALUES (?, NULL, NULL, ?, ?, ?, ?, '/', 'open', 'landing_page', datetime('now'))`
      )
      .bind(ticketId, name, email, subject, message)
      .run();
  } catch (error) {
    console.error('Contact form DB error:', error.message);
    return c.json({ success: true });
  }

  // Send notification email (fire and forget)
  try {
    await sendSupportNotificationEmail(c.env, {
      ticketId,
      userName: name,
      userEmail: email,
      organizationName: null,
      pageUrl: '/',
      subject,
      message,
    });
  } catch (error) {
    console.error('Contact notification email error:', error.message);
  }

  return c.json({ success: true });
});

export { contactRouter };
