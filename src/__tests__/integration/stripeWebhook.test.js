/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock Stripe SDK factory + price-id helpers so tests can inject event payloads
vi.mock('../../utils/stripe.js', () => ({
  getStripe: vi.fn(),
  getPlanFromPriceId: vi.fn().mockReturnValue('annual'),
  hasAiAddon: vi.fn().mockReturnValue(false),
}));

vi.mock('../../utils/orgStatusCache.js', () => ({
  invalidateOrgStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/helpers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateId: vi.fn().mockReturnValue('generated-id-1'),
  };
});

vi.mock('../../utils/email.js', () => ({
  sendTrialEndingEmail: vi.fn().mockResolvedValue({ success: true }),
}));

const stripeWebhookRouter = (await import('../../routes/stripeWebhook.js')).default;
const { getStripe } = await import('../../utils/stripe.js');

const TEST_SECRET = 'test-jwt-secret-for-testing-that-is-long-enough';

/**
 * SQL-aware mock DB. queryHandler(sql, boundArgs, op) returns row for 'first'
 * or result for 'run'/'all'. All `.run()` invocations are recorded in
 * `_runCalls` so tests can assert which mutations fired.
 */
const createMockDB = (queryHandler) => {
  const calls = [];
  const runCalls = [];

  const makeChain = (sql) => {
    const chain = {
      bind: vi.fn((...args) => {
        chain._boundArgs = args;
        return chain;
      }),
      first: vi.fn(() => {
        if (queryHandler) {
          return Promise.resolve(queryHandler(sql, chain._boundArgs, 'first'));
        }
        return Promise.resolve(null);
      }),
      run: vi.fn(() => {
        runCalls.push({ sql, args: chain._boundArgs });
        if (queryHandler) {
          const result = queryHandler(sql, chain._boundArgs, 'run');
          if (result && result.__reject) {
            return Promise.reject(result.__reject);
          }
          if (result) return Promise.resolve(result);
        }
        return Promise.resolve({ success: true, meta: { changes: 1 } });
      }),
      all: vi.fn(() => Promise.resolve({ results: [], success: true })),
      _boundArgs: [],
    };
    return chain;
  };

  const db = {
    prepare: vi.fn((sql) => {
      calls.push(sql);
      return makeChain(sql);
    }),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    _calls: calls,
    _runCalls: runCalls,
  };

  return db;
};

const createTestApp = (mockDB, { eventPayload }) => {
  getStripe.mockReturnValue({
    webhooks: {
      constructEventAsync: vi.fn().mockResolvedValue(eventPayload),
    },
  });

  const app = new Hono();
  app.use('*', async (c, next) => {
    c.env = {
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      READING_MANAGER_DB: mockDB,
      READING_MANAGER_KV: {
        get: async () => null,
        put: async () => {},
        delete: async () => {},
      },
      JWT_SECRET: TEST_SECRET,
      APP_URL: 'http://localhost:3000',
    };
    await next();
  });
  app.route('/api/webhooks/stripe', stripeWebhookRouter);
  return app;
};

const postWebhook = (app) =>
  app.request('/api/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=abc' },
    body: 'irrelevant',
  });

describe('POST /api/webhooks/stripe - processed flag', () => {
  let consoleErrorSpy;
  let consoleWarnSpy;
  let consoleLogSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('happy path: inserts with processed=0, then UPDATEs processed=1 after state mutation', async () => {
    const event = {
      id: 'evt_test_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          customer: 'cus_abc',
          id: 'sub_abc',
          status: 'active',
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: { data: [] },
        },
      },
    };

    const mockDB = createMockDB((sql) => {
      if (sql.includes('FROM organizations WHERE stripe_customer_id')) return { id: 'org-1' };
      if (sql.includes('FROM billing_events WHERE stripe_event_id')) return null;
      return null;
    });

    const app = createTestApp(mockDB, { eventPayload: event });
    const response = await postWebhook(app);

    expect(response.status).toBe(200);

    const inserts = mockDB._runCalls.filter((c) =>
      c.sql.includes('INSERT OR IGNORE INTO billing_events')
    );
    expect(inserts.length).toBe(1);

    const processedUpdates = mockDB._runCalls.filter(
      (c) => c.sql.includes('UPDATE billing_events') && c.sql.includes('processed = 1')
    );
    expect(processedUpdates.length).toBe(1);
  });

  it('failure path: state mutation throws → processed stays 0, returns 500', async () => {
    const event = {
      id: 'evt_test_2',
      type: 'customer.subscription.updated',
      data: {
        object: {
          customer: 'cus_abc',
          id: 'sub_abc',
          status: 'active',
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: { data: [] },
        },
      },
    };

    const mockDB = createMockDB((sql, _args, op) => {
      if (sql.includes('FROM organizations WHERE stripe_customer_id') && op === 'first') {
        return { id: 'org-1' };
      }
      if (sql.includes('FROM billing_events WHERE stripe_event_id') && op === 'first') {
        return null;
      }
      if (op === 'run' && sql.includes('UPDATE organizations SET stripe_subscription_id')) {
        return { __reject: new Error('D1 transient') };
      }
      return null;
    });

    const app = createTestApp(mockDB, { eventPayload: event });
    const response = await postWebhook(app);

    expect(response.status).toBe(500);

    const processedUpdates = mockDB._runCalls.filter(
      (c) => c.sql.includes('UPDATE billing_events') && c.sql.includes('processed = 1')
    );
    expect(processedUpdates.length).toBe(0);
  });

  it('retry after failure: second delivery with same stripe_event_id re-runs the mutation', async () => {
    const event = {
      id: 'evt_test_3',
      type: 'customer.subscription.updated',
      data: {
        object: {
          customer: 'cus_abc',
          id: 'sub_abc',
          status: 'active',
          current_period_end: Math.floor(Date.now() / 1000) + 86400,
          items: { data: [] },
        },
      },
    };

    // Dedup lookup filters on processed=1; returns null because prior attempt left processed=0.
    const mockDB = createMockDB((sql) => {
      if (sql.includes('FROM organizations WHERE stripe_customer_id')) return { id: 'org-1' };
      if (sql.includes('FROM billing_events WHERE stripe_event_id') && sql.includes('processed = 1')) {
        return null;
      }
      return null;
    });

    const app = createTestApp(mockDB, { eventPayload: event });
    const response = await postWebhook(app);

    expect(response.status).toBe(200);
    const inserts = mockDB._runCalls.filter((c) =>
      c.sql.includes('INSERT OR IGNORE INTO billing_events')
    );
    expect(inserts.length).toBe(1);
  });

  it('already-processed: second delivery after success → early exit 200', async () => {
    const event = {
      id: 'evt_test_4',
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_abc' } },
    };

    const mockDB = createMockDB((sql) => {
      if (sql.includes('FROM billing_events WHERE stripe_event_id') && sql.includes('processed = 1')) {
        return { id: 'billing-event-row-id' };
      }
      return null;
    });

    const app = createTestApp(mockDB, { eventPayload: event });
    const response = await postWebhook(app);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('already_processed');

    const inserts = mockDB._runCalls.filter((c) =>
      c.sql.includes('INSERT OR IGNORE INTO billing_events')
    );
    expect(inserts.length).toBe(0);
  });
});
