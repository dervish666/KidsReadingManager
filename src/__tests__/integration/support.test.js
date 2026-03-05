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
