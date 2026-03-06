import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { termDatesRouter } from '../../routes/termDates.js';

vi.mock('../../middleware/tenant', () => ({
  requireAdmin: () => (c, next) => next(),
  requireReadonly: () => (c, next) => next(),
}));

vi.mock('../../utils/routeHelpers', () => ({
  getDB: (env) => env.READING_MANAGER_DB,
  isMultiTenantMode: () => true,
}));

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
      READING_MANAGER_DB: mockDB,
      ...contextValues.env,
    };
    if (contextValues.organizationId) c.set('organizationId', contextValues.organizationId);
    if (contextValues.userId) c.set('userId', contextValues.userId);
    if (contextValues.userRole) c.set('userRole', contextValues.userRole);
    await next();
  });

  app.route('/api/term-dates', termDatesRouter);
  return { app, mockDB };
};

const makeRequest = async (app, method, path, body = null) => {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  return app.request(path, options);
};

const SAMPLE_TERMS = [
  { termName: 'Autumn 1', termOrder: 1, startDate: '2025-09-03', endDate: '2025-10-24' },
  { termName: 'Autumn 2', termOrder: 2, startDate: '2025-11-03', endDate: '2025-12-19' },
  { termName: 'Spring 1', termOrder: 3, startDate: '2026-01-05', endDate: '2026-02-13' },
  { termName: 'Spring 2', termOrder: 4, startDate: '2026-02-23', endDate: '2026-03-27' },
  { termName: 'Summer 1', termOrder: 5, startDate: '2026-04-13', endDate: '2026-05-22' },
  { termName: 'Summer 2', termOrder: 6, startDate: '2026-06-01', endDate: '2026-07-17' },
];

describe('GET /api/term-dates', () => {
  it('returns empty array when no term dates exist', async () => {
    const { app } = createTestApp({
      organizationId: 'org-1',
      userId: 'user-1',
      userRole: 'teacher',
    });

    const res = await makeRequest(app, 'GET', '/api/term-dates');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.terms).toEqual([]);
    expect(data.academicYear).toBeDefined();
  });

  it('returns term dates for given year', async () => {
    const termRows = [
      { term_name: 'Autumn 1', term_order: 1, start_date: '2025-09-03', end_date: '2025-10-24' },
      { term_name: 'Autumn 2', term_order: 2, start_date: '2025-11-03', end_date: '2025-12-19' },
    ];

    const { app, mockDB } = createTestApp(
      { organizationId: 'org-1', userId: 'user-1', userRole: 'teacher' },
      { allResults: { results: termRows, success: true } }
    );

    const res = await makeRequest(app, 'GET', '/api/term-dates?year=2025/26');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.academicYear).toBe('2025/26');
    expect(data.terms).toHaveLength(2);
    expect(data.terms[0].termName).toBe('Autumn 1');
    expect(data.terms[0].startDate).toBe('2025-09-03');
    expect(data.terms[1].termName).toBe('Autumn 2');

    // Verify query used the year param
    expect(mockDB._chain.bind).toHaveBeenCalledWith('org-1', '2025/26');
  });

  it('defaults to current academic year when no year param', async () => {
    const { app, mockDB } = createTestApp({
      organizationId: 'org-1',
      userId: 'user-1',
      userRole: 'teacher',
    });

    const res = await makeRequest(app, 'GET', '/api/term-dates');
    expect(res.status).toBe(200);
    const data = await res.json();

    // Current academic year: March 2026 is in the 2025/26 academic year
    expect(data.academicYear).toBe('2025/26');
  });
});

describe('PUT /api/term-dates', () => {
  it('saves all 6 term dates via db.batch with DELETE + 6 INSERTs', async () => {
    const { app, mockDB } = createTestApp({
      organizationId: 'org-1',
      userId: 'user-1',
      userRole: 'admin',
    });

    const res = await makeRequest(app, 'PUT', '/api/term-dates', {
      academicYear: '2025/26',
      terms: SAMPLE_TERMS,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.academicYear).toBe('2025/26');
    expect(data.terms).toHaveLength(6);

    // Verify db.batch called with 7 statements (1 DELETE + 6 INSERTs)
    expect(mockDB.batch).toHaveBeenCalledTimes(1);
    const batchArg = mockDB.batch.mock.calls[0][0];
    expect(batchArg).toHaveLength(7);
  });

  it('rejects missing academicYear', async () => {
    const { app } = createTestApp({
      organizationId: 'org-1',
      userId: 'user-1',
      userRole: 'admin',
    });

    const res = await makeRequest(app, 'PUT', '/api/term-dates', {
      terms: SAMPLE_TERMS,
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toMatch(/academicYear/i);
  });

  it('rejects overlapping dates', async () => {
    const overlappingTerms = [
      { termName: 'Autumn 1', termOrder: 1, startDate: '2025-09-03', endDate: '2025-10-24' },
      { termName: 'Autumn 2', termOrder: 2, startDate: '2025-10-20', endDate: '2025-12-19' },
    ];

    const { app } = createTestApp({
      organizationId: 'org-1',
      userId: 'user-1',
      userRole: 'admin',
    });

    const res = await makeRequest(app, 'PUT', '/api/term-dates', {
      academicYear: '2025/26',
      terms: overlappingTerms,
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toMatch(/overlap/i);
  });

  it('rejects startDate after endDate', async () => {
    const badTerms = [
      { termName: 'Autumn 1', termOrder: 1, startDate: '2025-10-24', endDate: '2025-09-03' },
    ];

    const { app } = createTestApp({
      organizationId: 'org-1',
      userId: 'user-1',
      userRole: 'admin',
    });

    const res = await makeRequest(app, 'PUT', '/api/term-dates', {
      academicYear: '2025/26',
      terms: badTerms,
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toMatch(/before/i);
  });

  it('accepts partial terms (not all 6 required)', async () => {
    const partialTerms = [
      { termName: 'Autumn 1', termOrder: 1, startDate: '2025-09-03', endDate: '2025-10-24' },
      { termName: 'Autumn 2', termOrder: 2, startDate: '2025-11-03', endDate: '2025-12-19' },
    ];

    const { app, mockDB } = createTestApp({
      organizationId: 'org-1',
      userId: 'user-1',
      userRole: 'admin',
    });

    const res = await makeRequest(app, 'PUT', '/api/term-dates', {
      academicYear: '2025/26',
      terms: partialTerms,
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.terms).toHaveLength(2);

    // Verify db.batch called with 3 statements (1 DELETE + 2 INSERTs)
    expect(mockDB.batch).toHaveBeenCalledTimes(1);
    const batchArg = mockDB.batch.mock.calls[0][0];
    expect(batchArg).toHaveLength(3);
  });
});
