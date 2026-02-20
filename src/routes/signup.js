import { Hono } from 'hono';
import { rateLimit } from '../middleware/tenant.js';
import { sendSignupNotificationEmail } from '../utils/email.js';

const signupRouter = new Hono();

// Rate limit: 5 per minute per IP
signupRouter.use('/', rateLimit(5, 60000));

signupRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.email) {
    return c.json({ error: 'Email is required' }, 400);
  }

  const email = body.email.trim().toLowerCase();

  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return c.json({ error: 'Invalid email format' }, 400);
  }

  const db = c.env.READING_MANAGER_DB;
  if (!db) {
    // No database — accept silently
    return c.json({ message: 'Thanks! We\'ll be in touch.' });
  }

  try {
    await db.prepare(
      'INSERT OR IGNORE INTO email_signups (email) VALUES (?)'
    ).bind(email).run();
  } catch (error) {
    console.error('Email signup DB error:', error.message);
    // Don't reveal DB errors to the user
  }

  // Send notification email (fire and forget — don't block the response)
  try {
    await sendSignupNotificationEmail(c.env, email);
  } catch (error) {
    console.error('Signup notification email error:', error.message);
  }

  // Always return success — don't reveal whether the email was already registered
  return c.json({ message: 'Thanks! We\'ll be in touch.' });
});

export { signupRouter };
