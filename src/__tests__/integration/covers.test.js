import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock the metadata config loader so /search tests can control what API
// keys (if any) are available without hitting a real DB.
vi.mock('../../routes/metadata.js', () => ({
  getConfigWithKeys: vi.fn(),
  metadataRouter: {},
}));

// Mock provider adapters so /search tests can drive cover URL returns
// from Google Books and Hardcover deterministically.
vi.mock('../../services/providers/googleBooksProvider.js', () => ({
  fetchMetadata: vi.fn(),
}));
vi.mock('../../services/providers/hardcoverProvider.js', () => ({
  fetchMetadata: vi.fn(),
}));

import coversRouter from '../../routes/covers.js';
import { getConfigWithKeys } from '../../routes/metadata.js';
import { fetchMetadata as googleBooksFetch } from '../../services/providers/googleBooksProvider.js';
import { fetchMetadata as hardcoverFetch } from '../../services/providers/hardcoverProvider.js';

/**
 * Create a mock R2 bucket for testing
 */
const createMockR2 = (overrides = {}) => ({
  get: vi.fn().mockResolvedValue(null),
  put: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

/**
 * Create a mock R2Object (returned by R2.get() on cache hit)
 */
const createMockR2Object = (body = new Uint8Array([1, 2, 3]), overrides = {}) => ({
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(body);
      controller.close();
    },
  }),
  httpMetadata: {
    contentType: 'image/jpeg',
    ...overrides.httpMetadata,
  },
  size: body.length,
  ...overrides,
});

/**
 * Create a Hono test app with the covers router mounted.
 *
 * Uses Hono's proper app.request(path, init, Env, executionCtx) API
 * to inject env and executionCtx, avoiding the read-only getter issue.
 */
/**
 * Minimal rate-limit DB mock. rateLimit() middleware in tenant.js now fails
 * closed for /api/covers/ when the DB binding is missing (so a D1 outage
 * can't be used to bypass the cover-endpoint rate limit and drive R2 cost).
 * These tests care about provider/cache behaviour, not rate limiting, so a
 * permissive mock is all we need here — the real limiter is covered in
 * covers.rateLimit.test.js.
 */
const createPermissiveDB = () => ({
  prepare: vi.fn(() => ({
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue({ count: 0 }),
    run: vi.fn().mockResolvedValue({ success: true }),
    all: vi.fn().mockResolvedValue({ results: [], success: true }),
  })),
});

const createTestApp = (envOverrides = {}) => {
  const app = new Hono();
  const mockR2 = createMockR2();
  const mockWaitUntil = vi.fn();

  app.onError((error, c) => {
    const status = error.status || 500;
    return c.json(
      {
        status: 'error',
        message: error.message || 'Internal Server Error',
      },
      status
    );
  });

  app.route('/api/covers', coversRouter);

  const env = {
    BOOK_COVERS: mockR2,
    READING_MANAGER_DB: createPermissiveDB(),
    ...envOverrides,
  };

  const executionCtx = { waitUntil: mockWaitUntil };

  /**
   * Helper to make requests through Hono's test API with env and executionCtx
   */
  const request = (path) => app.request(path, undefined, env, executionCtx);

  return { app, mockR2, mockWaitUntil, env, executionCtx, request };
};

describe('Cover Proxy Route', () => {
  let consoleErrorSpy;
  let consoleLogSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('Input validation', () => {
    it('should reject invalid cover type (not id/olid/isbn)', async () => {
      const { request } = createTestApp();

      const response = await request('/api/covers/badtype/12345-M.jpg');

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.message).toMatch(/invalid.*type/i);
    });

    it('should reject key missing size suffix', async () => {
      const { request } = createTestApp();

      const response = await request('/api/covers/isbn/9780140449136.jpg');

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.message).toMatch(/invalid.*key/i);
    });

    it('should reject key without .jpg extension', async () => {
      const { request } = createTestApp();

      const response = await request('/api/covers/isbn/9780140449136-M');

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.message).toMatch(/invalid.*key/i);
    });

    it('should reject key containing whitespace', async () => {
      const { request } = createTestApp();

      const response = await request('/api/covers/id/foo%20bar-M.jpg');

      expect(response.status).toBe(400);
    });

    it('should accept type "id" with valid key', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(createMockR2Object());

      const response = await request('/api/covers/id/12345-M.jpg');

      expect(response.status).toBe(200);
    });

    it('should accept type "olid" with valid key', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(createMockR2Object());

      const response = await request('/api/covers/olid/OL12345M-S.jpg');

      expect(response.status).toBe(200);
    });

    it('should accept type "isbn" with valid key', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(createMockR2Object());

      const response = await request('/api/covers/isbn/9780140449136-L.jpg');

      expect(response.status).toBe(200);
    });

    it('should accept type "ia" with valid key', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(createMockR2Object());

      const response = await request('/api/covers/ia/harrypottersorce0000rowl-M.jpg');

      expect(response.status).toBe(200);
    });

    it('should accept all valid size suffixes (S, M, L)', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(createMockR2Object());

      for (const size of ['S', 'M', 'L']) {
        const response = await request(`/api/covers/isbn/9780140449136-${size}.jpg`);
        expect(response.status).toBe(200);
      }
    });
  });

  describe('R2 cache hit', () => {
    it('should return image from R2 when cached', async () => {
      const imageData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG magic bytes
      const { request, mockR2 } = createTestApp();

      mockR2.get.mockResolvedValue(createMockR2Object(imageData));

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(response.status).toBe(200);
      expect(mockR2.get).toHaveBeenCalledWith('isbn/9780140449136-M.jpg');
    });

    it('should set correct Cache-Control header on R2 hit', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(createMockR2Object());

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(response.headers.get('Cache-Control')).toBe('public, max-age=2592000');
    });

    it('should set X-Cache-Source header to "r2" on R2 hit', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(createMockR2Object());

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(response.headers.get('X-Cache-Source')).toBe('r2');
    });

    it('should set Content-Type to image/jpeg on R2 hit', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(createMockR2Object());

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    });
  });

  describe('Origin fetch (R2 miss)', () => {
    it('should fetch from OpenLibrary on R2 miss', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(null); // R2 miss

      const imageBody = new Uint8Array(2000); // Big enough to be a real image
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(imageBody, {
          status: 200,
          headers: { 'Content-Length': '2000', 'Content-Type': 'image/jpeg' },
        })
      );

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://covers.openlibrary.org/b/isbn/9780140449136-M.jpg',
        expect.objectContaining({
          headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
        })
      );
    });

    it('should store fetched image in R2 via waitUntil', async () => {
      const { request, mockR2, mockWaitUntil } = createTestApp();
      mockR2.get.mockResolvedValue(null);

      const imageBody = new Uint8Array(2000);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(imageBody, {
          status: 200,
          headers: { 'Content-Length': '2000', 'Content-Type': 'image/jpeg' },
        })
      );

      await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(mockWaitUntil).toHaveBeenCalled();
    });

    it('should return X-Cache-Source header as "origin" on origin fetch', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(null);

      const imageBody = new Uint8Array(2000);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(imageBody, {
          status: 200,
          headers: { 'Content-Length': '2000', 'Content-Type': 'image/jpeg' },
        })
      );

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(response.headers.get('X-Cache-Source')).toBe('origin');
    });

    it('should set Cache-Control header on origin fetch', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(null);

      const imageBody = new Uint8Array(2000);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(imageBody, {
          status: 200,
          headers: { 'Content-Length': '2000', 'Content-Type': 'image/jpeg' },
        })
      );

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(response.headers.get('Cache-Control')).toBe('public, max-age=2592000');
    });

    it('should return 404 for tiny images (content-length < 1000 = missing cover placeholder)', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(null);

      const tinyImage = new Uint8Array(500); // Too small, placeholder image
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(tinyImage, {
          status: 200,
          headers: { 'Content-Length': '500', 'Content-Type': 'image/jpeg' },
        })
      );

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(response.status).toBe(404);
    });

    it('should not cache tiny/placeholder images in R2', async () => {
      const { request, mockR2, mockWaitUntil } = createTestApp();
      mockR2.get.mockResolvedValue(null);

      const tinyImage = new Uint8Array(500);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(tinyImage, {
          status: 200,
          headers: { 'Content-Length': '500', 'Content-Type': 'image/jpeg' },
        })
      );

      await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(mockWaitUntil).not.toHaveBeenCalled();
      expect(mockR2.put).not.toHaveBeenCalled();
    });

    it('should return valid image even when origin omits Content-Length header', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(null);

      const imageBody = new Uint8Array(2000);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(imageBody, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
          // No Content-Length header
        })
      );

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Source')).toBe('origin');
    });

    it('should return 404 when OpenLibrary returns non-OK response', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(null);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', { status: 404 }));

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(response.status).toBe(404);
    });

    it('should return 502 when OpenLibrary fetch throws an error', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(null);

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(response.status).toBe(502);
    });

    it('should not cache failed origin responses in R2', async () => {
      const { request, mockR2, mockWaitUntil } = createTestApp();
      mockR2.get.mockResolvedValue(null);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', { status: 404 }));

      await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(mockWaitUntil).not.toHaveBeenCalled();
      expect(mockR2.put).not.toHaveBeenCalled();
    });
  });

  describe('R2 get() error', () => {
    it('should fall through to origin fetch when R2 get() throws', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockRejectedValue(new Error('R2 internal error'));

      const imageBody = new Uint8Array(2000);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(imageBody, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      );

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Source')).toBe('origin');
    });
  });

  describe('R2 binding unavailable', () => {
    it('should handle null BOOK_COVERS binding gracefully', async () => {
      const { request } = createTestApp({ BOOK_COVERS: null });

      const imageBody = new Uint8Array(2000);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(imageBody, {
          status: 200,
          headers: { 'Content-Length': '2000', 'Content-Type': 'image/jpeg' },
        })
      );

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      // Should still work by fetching from origin, just skip R2
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Source')).toBe('origin');
    });
  });
});

/**
 * Helper: build a fetch mock that routes requests by URL pattern. Any pattern
 * not matched returns a 404 so tests fail loudly on unexpected calls.
 */
const mockFetchByUrl = (handlers) => {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    for (const [pattern, response] of handlers) {
      if (urlStr.includes(pattern)) {
        return typeof response === 'function' ? response(urlStr) : response;
      }
    }
    return new Response('Unexpected URL: ' + urlStr, { status: 404 });
  });
};

const imageResponse = (size = 2000, contentType = 'image/jpeg') =>
  new Response(new Uint8Array(size), {
    status: 200,
    headers: { 'Content-Type': contentType },
  });

describe('Cover Search Route', () => {
  let consoleErrorSpy;
  let consoleLogSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Default: no DB, no config — tests opt in to Google/Hardcover by
    // providing env.READING_MANAGER_DB and overriding getConfigWithKeys.
    getConfigWithKeys.mockResolvedValue(null);
    googleBooksFetch.mockResolvedValue({ coverUrl: null });
    hardcoverFetch.mockResolvedValue({ coverUrl: null });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('Validation', () => {
    it('rejects a request with no title', async () => {
      const { request } = createTestApp();
      const response = await request('/api/covers/search');
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.message).toMatch(/title/i);
    });

    it('rejects a title that is too long', async () => {
      const { request } = createTestApp();
      const longTitle = 'x'.repeat(201);
      const response = await request(`/api/covers/search?title=${encodeURIComponent(longTitle)}`);
      expect(response.status).toBe(400);
    });

    it('rejects an author that is too long', async () => {
      const { request } = createTestApp();
      const longAuthor = 'y'.repeat(201);
      const response = await request(
        `/api/covers/search?title=Book&author=${encodeURIComponent(longAuthor)}`
      );
      expect(response.status).toBe(400);
    });
  });

  describe('R2 cache hit', () => {
    it('returns the cached image without calling any origin', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(createMockR2Object());
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const response = await request('/api/covers/search?title=Harry+Potter&author=Rowling');

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Source')).toBe('r2');
      expect(fetchSpy).not.toHaveBeenCalled();
      // R2 key should be under "search/" with a 16-char hex hash
      const key = mockR2.get.mock.calls[0][0];
      expect(key).toMatch(/^search\/[a-f0-9]{16}-M\.jpg$/);
    });

    it('normalizes case and whitespace to produce stable R2 keys', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(createMockR2Object());

      await request('/api/covers/search?title=Harry+Potter&author=J.K.+Rowling');
      const key1 = mockR2.get.mock.calls[0][0];

      mockR2.get.mockClear();
      await request('/api/covers/search?title=  HARRY   POTTER  &author=j.k.+rowling');
      const key2 = mockR2.get.mock.calls[0][0];

      expect(key1).toBe(key2);
    });
  });

  describe('OpenLibrary search path', () => {
    it('fetches from OpenLibrary search, then the cover endpoint', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(null);

      const fetchSpy = mockFetchByUrl([
        [
          'openlibrary.org/search.json',
          new Response(JSON.stringify({ docs: [{ cover_i: 42 }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ],
        ['covers.openlibrary.org/b/id/42-M.jpg', imageResponse()],
      ]);

      const response = await request('/api/covers/search?title=Harry+Potter&author=Rowling');

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Source')).toBe('openlibrary');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('openlibrary.org/search.json?title=Harry+Potter'),
        expect.any(Object)
      );
    });

    it('caches the fetched image in R2 under the search key', async () => {
      const { request, mockR2, mockWaitUntil } = createTestApp();
      mockR2.get.mockResolvedValue(null);

      mockFetchByUrl([
        ['openlibrary.org/search.json', new Response(JSON.stringify({ docs: [{ cover_i: 42 }] }))],
        ['covers.openlibrary.org', imageResponse()],
      ]);

      await request('/api/covers/search?title=Harry+Potter');

      expect(mockWaitUntil).toHaveBeenCalled();
      // R2 put fires inside waitUntil; we don't await it, but confirming the
      // put was queued with the expected key is enough
      const putKey = mockR2.put.mock.calls[0]?.[0];
      expect(putKey).toMatch(/^search\/[a-f0-9]{16}-M\.jpg$/);
    });
  });

  describe('Google Books fallback', () => {
    it('falls back to Google Books when OpenLibrary finds nothing', async () => {
      const { request, mockR2 } = createTestApp({
        READING_MANAGER_DB: createPermissiveDB(),
        JWT_SECRET: 'test-secret',
      });
      mockR2.get.mockResolvedValue(null);
      getConfigWithKeys.mockResolvedValue({
        providerChain: ['openlibrary', 'googlebooks', 'hardcover'],
        googleBooksApiKey: 'gb-key',
        hardcoverApiKey: null,
      });
      googleBooksFetch.mockResolvedValue({
        coverUrl: 'https://books.google.com/cover/abc.jpg',
      });

      mockFetchByUrl([
        [
          'openlibrary.org/search.json',
          new Response(JSON.stringify({ docs: [] }), {
            headers: { 'Content-Type': 'application/json' },
          }),
        ],
        ['books.google.com/cover/abc.jpg', imageResponse()],
      ]);

      const response = await request('/api/covers/search?title=Obscure+Title&author=Nobody');

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Source')).toBe('google-books');
      expect(googleBooksFetch).toHaveBeenCalledWith(
        { title: 'Obscure Title', author: 'Nobody' },
        'gb-key'
      );
    });
  });

  describe('Hardcover fallback', () => {
    it('falls back to Hardcover when OpenLibrary and Google Books miss', async () => {
      const { request, mockR2 } = createTestApp({
        READING_MANAGER_DB: createPermissiveDB(),
        JWT_SECRET: 'test-secret',
      });
      mockR2.get.mockResolvedValue(null);
      getConfigWithKeys.mockResolvedValue({
        providerChain: ['openlibrary', 'googlebooks', 'hardcover'],
        googleBooksApiKey: 'gb-key',
        hardcoverApiKey: 'hc-key',
      });
      googleBooksFetch.mockResolvedValue({ coverUrl: null });
      hardcoverFetch.mockResolvedValue({
        coverUrl: 'https://hardcover.app/cover/xyz.jpg',
      });

      mockFetchByUrl([
        ['openlibrary.org/search.json', new Response(JSON.stringify({ docs: [] }))],
        ['hardcover.app/cover/xyz.jpg', imageResponse()],
      ]);

      const response = await request('/api/covers/search?title=Something+Rare&author=Unknown');

      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Source')).toBe('hardcover');
      expect(hardcoverFetch).toHaveBeenCalledWith(
        { title: 'Something Rare', author: 'Unknown' },
        'hc-key'
      );
    });
  });

  describe('All providers miss', () => {
    it('returns 404 with a short Cache-Control when nothing resolves', async () => {
      const { request, mockR2 } = createTestApp({
        READING_MANAGER_DB: createPermissiveDB(),
        JWT_SECRET: 'test-secret',
      });
      mockR2.get.mockResolvedValue(null);
      getConfigWithKeys.mockResolvedValue({
        googleBooksApiKey: 'gb-key',
        hardcoverApiKey: 'hc-key',
      });
      googleBooksFetch.mockResolvedValue({ coverUrl: null });
      hardcoverFetch.mockResolvedValue({ coverUrl: null });

      mockFetchByUrl([['openlibrary.org/search.json', new Response(JSON.stringify({ docs: [] }))]]);

      const response = await request('/api/covers/search?title=Nothing+Here&author=No+One');

      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    });
  });

  describe('Provider failure isolation', () => {
    it('continues to Hardcover when Google Books throws', async () => {
      const { request, mockR2 } = createTestApp({
        READING_MANAGER_DB: createPermissiveDB(),
        JWT_SECRET: 'test-secret',
      });
      mockR2.get.mockResolvedValue(null);
      getConfigWithKeys.mockResolvedValue({
        googleBooksApiKey: 'gb-key',
        hardcoverApiKey: 'hc-key',
      });
      googleBooksFetch.mockRejectedValue(new Error('GB blew up'));
      hardcoverFetch.mockResolvedValue({
        coverUrl: 'https://hardcover.app/cover/ok.jpg',
      });

      mockFetchByUrl([
        ['openlibrary.org/search.json', new Response(JSON.stringify({ docs: [] }))],
        ['hardcover.app/cover/ok.jpg', imageResponse()],
      ]);

      const response = await request('/api/covers/search?title=Whatever');
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Source')).toBe('hardcover');
    });

    it('returns 404 when OpenLibrary search itself throws but no config is set', async () => {
      const { request, mockR2 } = createTestApp();
      mockR2.get.mockResolvedValue(null);
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network down'));

      const response = await request('/api/covers/search?title=Whatever');
      expect(response.status).toBe(404);
    });
  });
});
