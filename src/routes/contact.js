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
  const ticketId = crypto.randomUUID();
  const subject = 'Landing page enquiry';

  // An enquiry reaches a human two ways: the support_tickets row and the
  // notification email. Either one alone is a delivered enquiry, so both are
  // attempted independently and success is only reported if one landed.
  //
  // This used to `return c.json({ success: true })` inside the DB catch, which
  // both swallowed the failure AND skipped the email below it — a prospective
  // school saw a thank-you message while the enquiry was discarded entirely.
  let stored = false;
  let notified = false;

  if (db) {
    try {
      await db
        .prepare(
          `INSERT INTO support_tickets (id, organization_id, user_id, user_name, user_email, subject, message, page_url, status, source, created_at)
         VALUES (?, NULL, NULL, ?, ?, ?, ?, '/', 'open', 'landing_page', datetime('now'))`
        )
        .bind(ticketId, name, email, subject, message)
        .run();
      stored = true;
    } catch (error) {
      console.error('Contact form DB error:', error.message);
    }
  } else {
    console.error('Contact form: no READING_MANAGER_DB binding; relying on email only');
  }

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
    notified = true;
  } catch (error) {
    console.error('Contact notification email error:', error.message);
  }

  if (!stored && !notified) {
    // Both delivery routes failed — say so rather than pretending. Sentry sees
    // this via consoleLoggingIntegration on the two console.error calls above.
    console.error(`Contact form: enquiry from ${email} could not be delivered by any route`);
    return c.json(
      {
        error:
          'Sorry, we could not submit your enquiry just now. Please try again in a moment, or email us directly.',
      },
      503
    );
  }

  return c.json({ success: true });
});

export { contactRouter };
