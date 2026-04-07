# Contact Form Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale newsletter signup on the landing page with a "Get in Touch" contact form that stores submissions as support tickets.

**Architecture:** New migration adds `source` column. New `contact.js` route handles public submissions with rate limiting. Landing page replaces newsletter section with 3-field form. Submissions flow into existing support ticket triage.

**Tech Stack:** Hono routes, D1 database, React landing page (plain CSS, no MUI), Vitest

**Spec:** `docs/superpowers/specs/2026-04-07-contact-form-design.md`

---

## Task 1: Database migration — add `source` column

**Files:**
- Create: `migrations/0045_support_ticket_source.sql`

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE support_tickets ADD COLUMN source TEXT DEFAULT 'in_app';
```

- [ ] **Step 2: Apply locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`

- [ ] **Step 3: Commit**

```bash
git add migrations/0045_support_ticket_source.sql
git commit -m "chore: add source column to support_tickets"
```

---

## Task 2: Backend — contact route

**Files:**
- Create: `src/routes/contact.js`
- Modify: `src/worker.js`
- Modify: `src/utils/constants.js`
- Modify: `src/utils/rowMappers.js:171-187`

- [ ] **Step 1: Create the contact route**

Create `src/routes/contact.js`:

```js
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
```

- [ ] **Step 2: Register route in worker.js**

In `src/worker.js`, add the import alongside the other route imports (near line 30):

```js
import { contactRouter } from './routes/contact.js';
```

Add the route registration alongside the other routes (near line 270):

```js
app.route('/api/contact', contactRouter);
```

- [ ] **Step 3: Add to PUBLIC_PATHS**

In `src/utils/constants.js`, add `/api/contact` to the array:

```js
'/api/auth/demo',
'/api/contact',
```

- [ ] **Step 4: Add source to rowToSupportTicket**

In `src/utils/rowMappers.js`, add `source` to the `rowToSupportTicket` function:

```js
updatedAt: row.updated_at || null,
source: row.source || 'in_app',
```

- [ ] **Step 5: Write integration test**

Create `src/__tests__/integration/contact.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../utils/email.js', () => ({
  sendSupportNotificationEmail: vi.fn().mockResolvedValue(undefined),
}));

const { contactRouter } = await import('../../routes/contact.js');

const createMockDB = () => {
  const chain = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue({ results: [], success: true }),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
  };
  return { prepare: vi.fn().mockReturnValue(chain), _chain: chain };
};

const createTestApp = (dbOverrides) => {
  const app = new Hono();
  const mockDB = dbOverrides || createMockDB();

  app.onError((err, c) => {
    return c.json({ error: err.message }, err.status || 500);
  });

  app.use('*', async (c, next) => {
    c.env = { READING_MANAGER_DB: mockDB };
    await next();
  });

  app.route('/api/contact', contactRouter);
  return { app, mockDB };
};

const makeRequest = (app, body) =>
  app.request('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/contact', () => {
  it('should accept valid contact submission', async () => {
    const { app } = createTestApp();
    const response = await makeRequest(app, {
      name: 'Jane Teacher',
      email: 'jane@school.sch.uk',
      message: 'I would like to know more about Tally Reading.',
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  it('should require name', async () => {
    const { app } = createTestApp();
    const response = await makeRequest(app, {
      email: 'jane@school.sch.uk',
      message: 'Hello',
    });
    expect(response.status).toBe(400);
  });

  it('should require email', async () => {
    const { app } = createTestApp();
    const response = await makeRequest(app, {
      name: 'Jane',
      message: 'Hello',
    });
    expect(response.status).toBe(400);
  });

  it('should reject invalid email', async () => {
    const { app } = createTestApp();
    const response = await makeRequest(app, {
      name: 'Jane',
      email: 'not-an-email',
      message: 'Hello',
    });
    expect(response.status).toBe(400);
  });

  it('should require message', async () => {
    const { app } = createTestApp();
    const response = await makeRequest(app, {
      name: 'Jane',
      email: 'jane@school.sch.uk',
    });
    expect(response.status).toBe(400);
  });

  it('should insert into support_tickets with landing_page source', async () => {
    const { app, mockDB } = createTestApp();
    await makeRequest(app, {
      name: 'Jane Teacher',
      email: 'jane@school.sch.uk',
      message: 'Interested in Tally.',
    });

    expect(mockDB.prepare).toHaveBeenCalled();
    const insertCall = mockDB.prepare.mock.calls.find((call) =>
      call[0].includes('INSERT INTO support_tickets')
    );
    expect(insertCall).toBeTruthy();
    expect(insertCall[0]).toContain('landing_page');
  });
});
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/__tests__/integration/contact.test.js -v`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/routes/contact.js src/worker.js src/utils/constants.js src/utils/rowMappers.js src/__tests__/integration/contact.test.js
git commit -m "feat: add public contact form API endpoint"
```

---

## Task 3: Frontend — replace newsletter with contact form

**Files:**
- Modify: `src/components/LandingPage.js:26,89-113,399-448`
- Modify: `src/components/LandingPage.css:707-795`

- [ ] **Step 1: Replace state variables**

In `src/components/LandingPage.js`, replace the signup state (lines 26, 89-90) with contact form state:

```js
// Replace:
const [signupSubmitted, setSignupSubmitted] = useState(false);
// ...
const [signupLoading, setSignupLoading] = useState(false);
const [signupError, setSignupError] = useState(null);

// With:
const [contactSubmitted, setContactSubmitted] = useState(false);
const [contactLoading, setContactLoading] = useState(false);
const [contactError, setContactError] = useState(null);
```

- [ ] **Step 2: Replace the submit handler**

Replace `handleSignup` (lines 92-113) with:

```js
const handleContact = async (e) => {
  e.preventDefault();
  const form = e.target;
  const name = form.querySelector('input[name="name"]').value;
  const email = form.querySelector('input[name="email"]').value;
  const message = form.querySelector('textarea[name="message"]').value;
  setContactLoading(true);
  setContactError(null);
  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Something went wrong');
    }
    setContactSubmitted(true);
  } catch (err) {
    setContactError(err.message);
  } finally {
    setContactLoading(false);
  }
};
```

- [ ] **Step 3: Replace the CTA section JSX**

Replace the entire CTA section (lines 399-448) with:

```jsx
{/* Get in Touch */}
<section className="lp-cta" id="contact">
  <div className="lp-cta-box lp-reveal" ref={addRevealRef}>
    <h2>Get in Touch</h2>
    <p>
      Interested in Tally Reading for your school? Drop us a message and
      we'll get back to you.
    </p>
    <form className="lp-contact-form" onSubmit={handleContact}>
      {!contactSubmitted ? (
        <div className="lp-contact-fields">
          <input
            type="text"
            name="name"
            placeholder="Your name"
            required
            maxLength={100}
            className="lp-contact-input"
            disabled={contactLoading}
          />
          <input
            type="email"
            name="email"
            placeholder="your.name@school.sch.uk"
            required
            className="lp-contact-input"
            disabled={contactLoading}
          />
          <textarea
            name="message"
            placeholder="How can we help?"
            required
            maxLength={5000}
            rows={4}
            className="lp-contact-textarea"
            disabled={contactLoading}
          />
          <button
            type="submit"
            className="lp-btn lp-btn-primary"
            disabled={contactLoading}
          >
            {contactLoading ? 'Sending...' : 'Send Message'}
          </button>
          {contactError && (
            <p className="lp-contact-error">{contactError}</p>
          )}
          <p className="lp-contact-note">
            We'll reply to your email within one working day. See our{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#6B8E6B' }}
            >
              Privacy Policy
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="lp-contact-thanks">
          <p>Thanks for getting in touch!</p>
          <p>We'll reply to your email shortly.</p>
        </div>
      )}
    </form>
  </div>
</section>
```

- [ ] **Step 4: Update CSS**

In `src/components/LandingPage.css`, replace the signup-specific styles (lines 741-795) with contact form styles. Keep the existing `.lp-cta` and `.lp-cta-box` styles (lines 707-738) unchanged:

```css
/* Replace .lp-signup-* classes with: */

.lp-contact-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 480px;
  margin: 0 auto;
}

.lp-contact-input,
.lp-contact-textarea {
  padding: 14px 18px;
  border: 1.5px solid rgba(107, 142, 107, 0.25);
  border-radius: 12px;
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.7);
  font-family: inherit;
  color: #4a3728;
  transition: border-color 0.2s;
}

.lp-contact-input:focus,
.lp-contact-textarea:focus {
  border-color: #6B8E6B;
  outline: none;
}

.lp-contact-input::placeholder,
.lp-contact-textarea::placeholder {
  color: #a0937e;
}

.lp-contact-textarea {
  resize: vertical;
  min-height: 100px;
}

.lp-contact-note {
  font-size: 0.82rem;
  color: #8b7d6b;
  margin-top: 4px;
  text-align: center;
}

.lp-contact-error {
  color: #c0392b;
  font-size: 0.9rem;
  margin: 0;
  text-align: center;
}

.lp-contact-thanks p:first-child {
  font-size: 1.25rem;
  font-weight: 700;
  color: #6B8E6B;
  margin-bottom: 8px;
}

.lp-contact-thanks p:last-child {
  color: #8b7d6b;
}
```

- [ ] **Step 5: Run build to verify**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add src/components/LandingPage.js src/components/LandingPage.css
git commit -m "feat: replace newsletter signup with contact form on landing page"
```

---

## Task 4: Build, deploy, update CLAUDE.md

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: ALL PASS

- [ ] **Step 2: Apply remote migration**

Run: `npx wrangler d1 migrations apply reading-manager-db --remote`

- [ ] **Step 3: Build and deploy**

Run: `npm run build && npx wrangler deploy`

- [ ] **Step 4: Mark todo as done**

Update the checkbox in `~/vault/projects/Tally Reading.md` for the "Contact form on landing page" todo.
