import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

import coversRouter from '../../routes/covers.js';

/**
 * Create a mock R2 bucket for testing
 */
const createMockR2 = (overrides = {}) => ({
  get: vi.fn().mockResolvedValue(null),
  put: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

/**
 * Create a mock R2Object (returned by R2.get() on cache hit)
 */
const createMockR2Object = (body = new Uint8Array([1, 2, 3]), overrides = {}) => ({
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(body);
      controller.close();
    }
  }),
  httpMetadata: {
    contentType: 'image/jpeg',
    ...overrides.httpMetadata
  },
  size: body.length,
  ...overrides
});

/**
 * Create a Hono test app with the covers router mounted.
 *
 * Uses Hono's proper app.request(path, init, Env, executionCtx) API
 * to inject env and executionCtx, avoiding the read-only getter issue.
 */
const createTestApp = (envOverrides = {}) => {
  const app = new Hono();
  const mockR2 = createMockR2();
  const mockWaitUntil = vi.fn();

  app.onError((error, c) => {
    const status = error.status || 500;
    return c.json({
      status: 'error',
      message: error.message || 'Internal Server Error'
    }, status);
  });

  app.route('/api/covers', coversRouter);

  const env = {
    BOOK_COVERS: mockR2,
    ...envOverrides
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
      const imageData = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG magic bytes
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
          headers: { 'Content-Length': '2000', 'Content-Type': 'image/jpeg' }
        })
      );

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      expect(response.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://covers.openlibrary.org/b/isbn/9780140449136-M.jpg'
      );
    });

    it('should store fetched image in R2 via waitUntil', async () => {
      const { request, mockR2, mockWaitUntil } = createTestApp();
      mockR2.get.mockResolvedValue(null);

      const imageBody = new Uint8Array(2000);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(imageBody, {
          status: 200,
          headers: { 'Content-Length': '2000', 'Content-Type': 'image/jpeg' }
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
          headers: { 'Content-Length': '2000', 'Content-Type': 'image/jpeg' }
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
          headers: { 'Content-Length': '2000', 'Content-Type': 'image/jpeg' }
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
          headers: { 'Content-Length': '500', 'Content-Type': 'image/jpeg' }
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
          headers: { 'Content-Length': '500', 'Content-Type': 'image/jpeg' }
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
          headers: { 'Content-Type': 'image/jpeg' }
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

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Not Found', { status: 404 })
      );

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

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Not Found', { status: 404 })
      );

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
          headers: { 'Content-Type': 'image/jpeg' }
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
          headers: { 'Content-Length': '2000', 'Content-Type': 'image/jpeg' }
        })
      );

      const response = await request('/api/covers/isbn/9780140449136-M.jpg');

      // Should still work by fetching from origin, just skip R2
      expect(response.status).toBe(200);
      expect(response.headers.get('X-Cache-Source')).toBe('origin');
    });
  });
});
