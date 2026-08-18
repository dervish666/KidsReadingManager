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

// These pin the fix for a silent-failure bug: the DB catch used to
// `return c.json({ success: true })`, which both hid the failure AND skipped
// the notification email below it, discarding the enquiry entirely while
// telling the sender it had been received.
//
// Scope note: a *total* D1 outage does not reach this handler at all —
// '/api/contact' is in FAIL_CLOSED_PATHS, so rateLimit() 503s first. The window
// these tests cover is the ticket INSERT failing while D1 is otherwise up
// (constraint violation, schema drift, oversized row), which is exactly the
// case that used to be swallowed.
//
// The DB mock therefore fails only the support_tickets INSERT, leaving the
// rate limiter's own INSERT working.
const createDbFailingTicketInsert = () => {
  const rateLimitChain = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue({ results: [], success: true }),
    first: vi.fn().mockResolvedValue({ count: 0 }),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
  };
  const ticketChain = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue({ results: [], success: true }),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockRejectedValue(new Error('D1_ERROR: constraint failed')),
  };
  return {
    prepare: vi.fn((sql) =>
      sql.includes('INSERT INTO support_tickets') ? ticketChain : rateLimitChain
    ),
  };
};

describe('POST /api/contact — delivery failures are not reported as success', () => {
  it('still sends the notification email when the ticket insert fails', async () => {
    const { sendSupportNotificationEmail } = await import('../../utils/email.js');
    sendSupportNotificationEmail.mockClear();
    sendSupportNotificationEmail.mockResolvedValueOnce(undefined);

    const { app } = createTestApp(createDbFailingTicketInsert());

    const response = await makeRequest(app, {
      name: 'Jane Teacher',
      email: 'jane@school.sch.uk',
      message: 'Interested in Tally.',
    });

    // The email is the other delivery route — it must still be attempted.
    expect(sendSupportNotificationEmail).toHaveBeenCalledTimes(1);
    // One route landed, so this is a genuine success.
    expect(response.status).toBe(200);
    expect((await response.json()).success).toBe(true);
  });

  it('returns 503 when BOTH the ticket insert and the notification email fail', async () => {
    const { sendSupportNotificationEmail } = await import('../../utils/email.js');
    sendSupportNotificationEmail.mockClear();
    sendSupportNotificationEmail.mockRejectedValueOnce(new Error('smtp down'));

    const { app } = createTestApp(createDbFailingTicketInsert());

    const response = await makeRequest(app, {
      name: 'Jane Teacher',
      email: 'jane@school.sch.uk',
      message: 'Interested in Tally.',
    });

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.success).toBeUndefined();
    expect(data.error).toMatch(/could not submit/i);
  });
});
