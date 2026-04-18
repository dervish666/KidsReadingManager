import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock metadata + provider modules so the covers router imports cleanly
// without touching a real DB or external services. These aren't exercised
// directly by the rate-limit path (R2 hit returns before fallbacks), but
// they must be mockable because covers.js imports them at module scope.
vi.mock('../../routes/metadata.js', () => ({
  getConfigWithKeys: vi.fn().mockResolvedValue(null),
  metadataRouter: {},
}));
vi.mock('../../services/providers/googleBooksProvider.js', () => ({
  fetchMetadata: vi.fn(),
}));
vi.mock('../../services/providers/hardcoverProvider.js', () => ({
  fetchMetadata: vi.fn(),
}));

const coversRouter = (await import('../../routes/covers.js')).default;

/**
 * Create a mock D1 binding that simulates the `rate_limits` table used by
 * rateLimit() in src/middleware/tenant.js. Tracks inserted rows per key
 * in-memory so successive COUNT queries reflect the growing request count.
 */
const createMockDB = () => {
  const rows = []; // { key, endpoint }

  const prepare = vi.fn((sql) => {
    const chain = {
      _sql: sql,
      _args: [],
      bind: vi.fn(function (...args) {
        this._args = args;
        return this;
      }),
      first: vi.fn(async function () {
        // rateLimit's SELECT: binds (key, endpoint, -windowSeconds)
        if (/SELECT COUNT\(\*\)/i.test(this._sql)) {
          const [key, endpoint] = this._args;
          const count = rows.filter((r) => r.key === key && r.endpoint === endpoint).length;
          return { count };
        }
        return null;
      }),
      run: vi.fn(async function () {
        // rateLimit's INSERT: binds (id, key, endpoint)
        if (/INSERT INTO rate_limits/i.test(this._sql)) {
          const [, key, endpoint] = this._args;
          rows.push({ key, endpoint });
        }
        return { success: true, meta: { changes: 1 } };
      }),
      all: vi.fn().mockResolvedValue({ results: [], success: true }),
    };
    return chain;
  });

  return { prepare };
};

/**
 * Minimal R2 mock — always returns a cached object so requests short-circuit
 * before any external provider call. We only care about whether rateLimit
 * rejects the 61st request.
 */
const createMockR2 = () => ({
  get: vi.fn().mockResolvedValue({
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
        controller.close();
      },
    }),
    httpMetadata: { contentType: 'image/jpeg' },
    size: 4,
  }),
  put: vi.fn().mockResolvedValue(undefined),
});

const createTestApp = () => {
  const app = new Hono();
  const mockDB = createMockDB();
  const mockR2 = createMockR2();

  app.onError((err, c) => c.json({ error: err.message }, err.status || 500));

  app.route('/api/covers', coversRouter);

  const env = { READING_MANAGER_DB: mockDB, BOOK_COVERS: mockR2 };
  const executionCtx = { waitUntil: vi.fn() };

  const request = (path, headers = {}) => app.request(path, { headers }, env, executionCtx);

  return { request, mockDB, mockR2 };
};

describe('covers rate limiting (H8)', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('allows 60 requests per minute per IP then returns 429 on the 61st', async () => {
    const { request } = createTestApp();
    const ip = '203.0.113.7';

    for (let i = 0; i < 60; i++) {
      const res = await request('/api/covers/isbn/9780140449136-M.jpg', {
        'CF-Connecting-IP': ip,
      });
      expect(res.status).not.toBe(429);
    }

    const blocked = await request('/api/covers/isbn/9780140449136-M.jpg', {
      'CF-Connecting-IP': ip,
    });

    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error).toMatch(/too many requests/i);
  });

  it('tracks rate limits per IP independently', async () => {
    const { request } = createTestApp();

    // IP A exhausts its quota
    for (let i = 0; i < 60; i++) {
      await request('/api/covers/isbn/9780140449136-M.jpg', {
        'CF-Connecting-IP': '203.0.113.7',
      });
    }
    const blockedA = await request('/api/covers/isbn/9780140449136-M.jpg', {
      'CF-Connecting-IP': '203.0.113.7',
    });
    expect(blockedA.status).toBe(429);

    // IP B still has full quota
    const allowedB = await request('/api/covers/isbn/9780140449136-M.jpg', {
      'CF-Connecting-IP': '198.51.100.42',
    });
    expect(allowedB.status).not.toBe(429);
  });

  it('rate-limits /api/covers/search (title+author) path independently', async () => {
    // rateLimit() keys by `c.req.path`, so /search must enforce its own
    // 60/min budget. The pen-test attack targets this path specifically,
    // so prove it's covered end-to-end.
    const { request } = createTestApp();
    const ip = '198.51.100.99';
    const path = '/api/covers/search?title=probe&author=dahl';

    for (let i = 0; i < 60; i++) {
      const res = await request(path, { 'CF-Connecting-IP': ip });
      expect(res.status).not.toBe(429);
    }

    const blocked = await request(path, { 'CF-Connecting-IP': ip });

    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.error).toMatch(/too many requests/i);
  });
});
