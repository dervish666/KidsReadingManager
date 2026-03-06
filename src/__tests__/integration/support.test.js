import { describe, it, expect, vi } from 'vitest';
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
      user: { sub: 'user-1', name: 'Jane Smith', email: 'jane@school.sch.uk' },
    });

    const res = await makeRequest(app, 'POST', '/api/support', {
      subject: 'Cannot import books',
      message: 'CSV import is failing with an error.',
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.ticketId).toBeDefined();

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO support_tickets')
    );
  });

  it('rejects missing subject', async () => {
    const { app } = createTestApp({
      userId: 'user-1',
      organizationId: 'org-1',
      userRole: 'teacher',
      user: { sub: 'user-1', name: 'Jane', email: 'jane@test.com' },
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
      user: { sub: 'user-1', name: 'Jane', email: 'jane@test.com' },
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
      user: { sub: 'user-1', name: 'Jane', email: 'jane@test.com' },
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
      user: { sub: 'user-1', name: 'Jane', email: 'jane@test.com' },
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
      user: { sub: 'user-1', name: 'Jane', email: 'jane@test.com' },
      env: {},
    });

    const res = await makeRequest(app, 'POST', '/api/support', {
      subject: 'Help',
      message: 'Need help.',
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it('trims subject and message', async () => {
    const { app, mockDB } = createTestApp({
      userId: 'user-1',
      organizationId: 'org-1',
      userRole: 'teacher',
      user: { sub: 'user-1', name: 'Jane', email: 'jane@test.com' },
    });

    const res = await makeRequest(app, 'POST', '/api/support', {
      subject: '  Help me  ',
      message: '  I need assistance.  ',
    });

    expect(res.status).toBe(200);

    const bindCalls = mockDB._chain.bind.mock.calls;
    const insertBind = bindCalls.find(call => call.length >= 7);
    expect(insertBind).toBeDefined();
    expect(insertBind[5]).toBe('Help me');
    expect(insertBind[6]).toBe('I need assistance.');
  });
});

describe('GET /api/support', () => {
  it('returns all tickets for owner', async () => {
    const ticketRows = [
      { id: 'ticket-1', organization_id: 'org-1', user_id: 'user-1', user_name: 'Jane', user_email: 'jane@test.com', subject: 'Help', message: 'Need help', status: 'open', created_at: '2026-03-05T10:00:00Z', updated_at: null, organization_name: 'Test School' },
      { id: 'ticket-2', organization_id: 'org-2', user_id: 'user-2', user_name: 'Bob', user_email: 'bob@test.com', subject: 'Bug', message: 'Found bug', status: 'resolved', created_at: '2026-03-04T10:00:00Z', updated_at: '2026-03-05T10:00:00Z', organization_name: 'Other School' },
    ];

    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { allResults: { results: ticketRows, success: true } }
    );

    const res = await makeRequest(app, 'GET', '/api/support');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tickets).toHaveLength(2);
    expect(data.tickets[0].id).toBe('ticket-1');
    expect(data.tickets[0].organizationName).toBe('Test School');
  });

  it('rejects non-owner users', async () => {
    const { app } = createTestApp({
      userId: 'user-1', userRole: 'teacher',
      user: { sub: 'user-1', name: 'Jane', email: 'jane@test.com' },
    });

    const res = await makeRequest(app, 'GET', '/api/support');
    expect(res.status).toBe(403);
  });

  it('filters by status when query param provided', async () => {
    const { app, mockDB } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { allResults: { results: [], success: true } }
    );

    await makeRequest(app, 'GET', '/api/support?status=open');
    expect(mockDB.prepare).toHaveBeenCalledWith(expect.stringContaining('st.status = ?'));
  });
});

describe('GET /api/support/:id', () => {
  it('returns ticket with notes', async () => {
    const ticketRow = { id: 'ticket-1', organization_id: 'org-1', user_id: 'user-1', user_name: 'Jane', user_email: 'jane@test.com', subject: 'Help', message: 'Need help', status: 'open', created_at: '2026-03-05T10:00:00Z', updated_at: null, organization_name: 'Test School' };
    const noteRows = [
      { id: 'note-1', ticket_id: 'ticket-1', user_id: 'owner-1', user_name: 'Owner', note: 'Looking into it', created_at: '2026-03-05T11:00:00Z' },
    ];

    const mockDB = createMockDB();
    let callCount = 0;
    mockDB.prepare = vi.fn().mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(callCount++ === 0 ? ticketRow : null),
        all: vi.fn().mockResolvedValue({ results: noteRows, success: true }),
      }),
    }));

    const app = new Hono();
    app.use('*', async (c, next) => {
      c.env = { READING_MANAGER_DB: mockDB };
      c.set('userRole', 'owner');
      c.set('userId', 'owner-1');
      c.set('user', { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' });
      await next();
    });
    app.route('/api/support', supportRouter);

    const res = await makeRequest(app, 'GET', '/api/support/ticket-1');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ticket.id).toBe('ticket-1');
    expect(data.notes).toHaveLength(1);
    expect(data.notes[0].note).toBe('Looking into it');
  });

  it('returns 404 for non-existent ticket', async () => {
    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { firstResult: null }
    );

    const res = await makeRequest(app, 'GET', '/api/support/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/support/:id', () => {
  it('updates ticket status', async () => {
    const { app, mockDB } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { firstResult: { id: 'ticket-1', status: 'open' } }
    );

    const res = await makeRequest(app, 'PATCH', '/api/support/ticket-1', { status: 'in-progress' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE support_tickets SET status')
    );
  });

  it('rejects invalid status', async () => {
    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { firstResult: { id: 'ticket-1', status: 'open' } }
    );

    const res = await makeRequest(app, 'PATCH', '/api/support/ticket-1', { status: 'deleted' });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent ticket', async () => {
    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { firstResult: null }
    );

    const res = await makeRequest(app, 'PATCH', '/api/support/nonexistent', { status: 'resolved' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/support/:id/notes', () => {
  it('adds a note to a ticket', async () => {
    const { app, mockDB } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { firstResult: { id: 'ticket-1' } }
    );

    const res = await makeRequest(app, 'POST', '/api/support/ticket-1/notes', { note: 'Working on it' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.noteId).toBeDefined();

    expect(mockDB.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO support_ticket_notes')
    );
  });

  it('rejects empty note', async () => {
    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
    );

    const res = await makeRequest(app, 'POST', '/api/support/ticket-1/notes', { note: '' });
    expect(res.status).toBe(400);
  });

  it('rejects note exceeding 2000 characters', async () => {
    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
    );

    const res = await makeRequest(app, 'POST', '/api/support/ticket-1/notes', { note: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
  });

  it('returns 404 for non-existent ticket', async () => {
    const { app } = createTestApp(
      { userId: 'owner-1', userRole: 'owner', user: { sub: 'owner-1', name: 'Owner', email: 'owner@test.com' } },
      { firstResult: null }
    );

    const res = await makeRequest(app, 'POST', '/api/support/nonexistent/notes', { note: 'Test' });
    expect(res.status).toBe(404);
  });
});
