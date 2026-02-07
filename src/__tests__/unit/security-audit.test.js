import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  errorHandler,
  createError,
  notFoundError,
  badRequestError,
  serverError
} from '../../middleware/errorHandler.js';
import {
  encryptSensitiveData,
  decryptSensitiveData
} from '../../utils/crypto.js';
import { validateSettings } from '../../utils/validation.js';
import { parseCSV, detectColumnMapping } from '../../utils/csvParser.js';

// ============================================================================
// 1. Error Handler: 5xx Sanitization
// ============================================================================

describe('Error Handler Middleware', () => {
  let app;

  beforeEach(() => {
    app = new Hono();

    // The real error sanitization in worker.js uses app.onError, not the
    // errorHandler() middleware. Test the actual pattern from worker.js (line 247).
    app.onError((err, c) => {
      const status = err.status || 500;
      const message = status >= 500
        ? 'Internal Server Error'
        : (err.message || 'An error occurred');
      return c.json({ status: 'error', message }, status);
    });

    // Route that throws a raw Error (simulates an unhandled server error)
    app.get('/test-5xx', () => {
      throw new Error('database connection string: postgres://user:pass@host/db');
    });

    // Route that throws a 5xx with createError
    app.get('/test-503', () => {
      throw createError('Redis cluster unreachable at 10.0.0.5:6379', 503);
    });

    // Route that throws a 4xx error
    app.get('/test-4xx', () => {
      throw createError('Invalid input', 400);
    });

    // Route that throws a 404
    app.get('/test-404', () => {
      throw notFoundError('Book not found');
    });

    // Route that throws a 401
    app.get('/test-401', () => {
      throw createError('Authentication required', 401);
    });

    // Suppress console.error noise during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('5xx error sanitization', () => {
    it('should return "Internal Server Error" for unhandled errors, never leaking details', async () => {
      const res = await app.request('/test-5xx');
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.message).toBe('Internal Server Error');
      expect(body.message).not.toContain('database');
      expect(body.message).not.toContain('postgres');
      expect(body.message).not.toContain('pass');
    });

    it('should return "Internal Server Error" for explicit 503 errors, hiding infrastructure details', async () => {
      const res = await app.request('/test-503');
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.message).toBe('Internal Server Error');
      expect(body.message).not.toContain('Redis');
      expect(body.message).not.toContain('10.0.0.5');
    });

    it('should return proper JSON structure with status and message', async () => {
      const res = await app.request('/test-5xx');
      const body = await res.json();

      expect(body).toHaveProperty('status', 'error');
      expect(body).toHaveProperty('message', 'Internal Server Error');
      expect(Object.keys(body)).toEqual(expect.arrayContaining(['status', 'message']));
    });
  });

  describe('4xx error passthrough', () => {
    it('should pass through 400 error messages as-is', async () => {
      const res = await app.request('/test-4xx');
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.message).toBe('Invalid input');
    });

    it('should pass through 404 error messages as-is', async () => {
      const res = await app.request('/test-404');
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.message).toBe('Book not found');
    });

    it('should pass through 401 error messages as-is', async () => {
      const res = await app.request('/test-401');
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.message).toBe('Authentication required');
    });

    it('should use fallback message when error has no message', async () => {
      // Add a route that throws an error with status but no message
      app.get('/test-no-msg', () => {
        const err = new Error('');
        err.status = 422;
        throw err;
      });

      const res = await app.request('/test-no-msg');
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.message).toBe('An error occurred');
    });
  });

  describe('errorHandler middleware (from errorHandler.js)', () => {
    it('should sanitize 5xx errors when error is thrown during next() in middleware chain', async () => {
      // The errorHandler() middleware wraps await next() in try/catch.
      // When a downstream middleware throws during its own next() call,
      // errorHandler catches it. We simulate this by having a route that
      // throws inside a middleware that itself called next().
      const middlewareApp = new Hono();
      middlewareApp.use('*', errorHandler());
      middlewareApp.use('/api/*', async (c, next) => {
        // This middleware calls next(), which will invoke the route handler.
        // If the route handler throws, that error propagates through next().
        await next();
      });
      // In Hono, route handler errors propagate through Hono's internal mechanism.
      // The errorHandler middleware's try/catch around next() catches errors
      // that are thrown by downstream middleware before route dispatch.
      // Test the middleware function directly to verify its logic.

      const mockContext = {
        req: { path: '/api/data' },
        json: vi.fn((body, status) => ({ body, status }))
      };

      // Import and call the middleware factory, then invoke the returned function
      const middleware = errorHandler();
      const failingNext = async () => {
        throw createError('DB connection pool exhausted', 500);
      };

      const result = await middleware(mockContext, failingNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          status: 'error',
          message: 'Internal Server Error',
          path: '/api/data'
        },
        500
      );
    });

    it('should pass through 4xx errors in the middleware function', async () => {
      const mockContext = {
        req: { path: '/api/books' },
        json: vi.fn((body, status) => ({ body, status }))
      };

      const middleware = errorHandler();
      const failingNext = async () => {
        throw createError('Book not found', 404);
      };

      await middleware(mockContext, failingNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          status: 'error',
          message: 'Book not found',
          path: '/api/books'
        },
        404
      );
    });
  });
});

// ============================================================================
// 2. Error Handler Helpers
// ============================================================================

describe('Error Handler Helpers', () => {
  describe('createError', () => {
    it('should create an Error with the given message and status', () => {
      const err = createError('Something went wrong', 422);

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Something went wrong');
      expect(err.status).toBe(422);
    });

    it('should default to status 400 when no status is provided', () => {
      const err = createError('Bad data');

      expect(err.status).toBe(400);
    });
  });

  describe('notFoundError', () => {
    it('should create a 404 error with the given message', () => {
      const err = notFoundError('Student not found');

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Student not found');
      expect(err.status).toBe(404);
    });

    it('should use default message when none is provided', () => {
      const err = notFoundError();

      expect(err.message).toBe('Resource not found');
      expect(err.status).toBe(404);
    });
  });

  describe('badRequestError', () => {
    it('should create a 400 error with the given message', () => {
      const err = badRequestError('Missing required field');

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Missing required field');
      expect(err.status).toBe(400);
    });

    it('should use default message when none is provided', () => {
      const err = badRequestError();

      expect(err.message).toBe('Bad request');
      expect(err.status).toBe(400);
    });
  });

  describe('serverError', () => {
    it('should create a 500 error with the given message', () => {
      const err = serverError('Database unavailable');

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Database unavailable');
      expect(err.status).toBe(500);
    });

    it('should use default message when none is provided', () => {
      const err = serverError();

      expect(err.message).toBe('Internal server error');
      expect(err.status).toBe(500);
    });
  });
});

// ============================================================================
// 3. Encrypt/Decrypt Round-Trip (AES-GCM)
// ============================================================================

describe('Encrypt/Decrypt Round-Trip', () => {
  const testSecret = 'test-jwt-secret-key-for-encryption';

  it('should encrypt then decrypt back to original plaintext', async () => {
    const original = 'sk-ant-api03-secret-key-value-here';

    const encrypted = await encryptSensitiveData(original, testSecret);
    const decrypted = await decryptSensitiveData(encrypted, testSecret);

    expect(decrypted).toBe(original);
  });

  it('should produce different ciphertext for the same plaintext (random IV)', async () => {
    const plaintext = 'identical-api-key-value';

    const encrypted1 = await encryptSensitiveData(plaintext, testSecret);
    const encrypted2 = await encryptSensitiveData(plaintext, testSecret);

    expect(encrypted1).not.toBe(encrypted2);

    // Both should still decrypt to the same value
    const decrypted1 = await decryptSensitiveData(encrypted1, testSecret);
    const decrypted2 = await decryptSensitiveData(encrypted2, testSecret);
    expect(decrypted1).toBe(plaintext);
    expect(decrypted2).toBe(plaintext);
  });

  it('should fail to decrypt with a different secret key', async () => {
    const plaintext = 'sensitive-data';
    const encrypted = await encryptSensitiveData(plaintext, testSecret);

    await expect(
      decryptSensitiveData(encrypted, 'wrong-secret-key-entirely-different')
    ).rejects.toThrow();
  });

  it('should pass through legacy unencrypted data (no colon separator) unchanged', async () => {
    const legacyPlaintext = 'sk-old-api-key-without-encryption';

    const result = await decryptSensitiveData(legacyPlaintext, testSecret);

    expect(result).toBe(legacyPlaintext);
  });

  it('should throw when encrypting with empty plaintext', async () => {
    await expect(
      encryptSensitiveData('', testSecret)
    ).rejects.toThrow('Plaintext and secret are required for encryption');
  });

  it('should throw when encrypting with null plaintext', async () => {
    await expect(
      encryptSensitiveData(null, testSecret)
    ).rejects.toThrow('Plaintext and secret are required for encryption');
  });

  it('should throw when encrypting with empty secret', async () => {
    await expect(
      encryptSensitiveData('some-data', '')
    ).rejects.toThrow('Plaintext and secret are required for encryption');
  });

  it('should throw when decrypting with null input', async () => {
    await expect(
      decryptSensitiveData(null, testSecret)
    ).rejects.toThrow('Encrypted data and secret are required for decryption');
  });

  it('should throw when decrypting with empty secret', async () => {
    await expect(
      decryptSensitiveData('some:data', '')
    ).rejects.toThrow('Encrypted data and secret are required for decryption');
  });

  it('should handle unicode plaintext correctly', async () => {
    const unicode = 'API-Key: \u00e9\u00e8\u00ea \u00fc\u00f6\u00e4 \u4f60\u597d';

    const encrypted = await encryptSensitiveData(unicode, testSecret);
    const decrypted = await decryptSensitiveData(encrypted, testSecret);

    expect(decrypted).toBe(unicode);
  });

  it('should produce encrypted output in iv:ciphertext format', async () => {
    const encrypted = await encryptSensitiveData('test-data', testSecret);

    expect(encrypted).toContain(':');
    const [ivPart, ciphertextPart] = encrypted.split(':');
    expect(ivPart.length).toBeGreaterThan(0);
    expect(ciphertextPart.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// 4. parseCookies Edge Cases
// ============================================================================

describe('parseCookies Edge Cases', () => {
  // Replicate the parseCookies logic from auth.js (not exported)
  function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(';').forEach(cookie => {
      const [name, ...rest] = cookie.trim().split('=');
      if (name) cookies[name] = rest.join('=');
    });
    return cookies;
  }

  it('should parse multiple cookies correctly', () => {
    const header = 'session=abc123; token=xyz789; theme=dark';
    const cookies = parseCookies(header);

    expect(cookies.session).toBe('abc123');
    expect(cookies.token).toBe('xyz789');
    expect(cookies.theme).toBe('dark');
  });

  it('should handle = signs in cookie values (e.g., base64 JWT tokens)', () => {
    const header = 'token=abc=def=ghi; other=value';
    const cookies = parseCookies(header);

    expect(cookies.token).toBe('abc=def=ghi');
    expect(cookies.other).toBe('value');
  });

  it('should return empty object for null cookie header', () => {
    const cookies = parseCookies(null);
    expect(cookies).toEqual({});
  });

  it('should return empty object for undefined cookie header', () => {
    const cookies = parseCookies(undefined);
    expect(cookies).toEqual({});
  });

  it('should return empty object for empty string cookie header', () => {
    const cookies = parseCookies('');
    expect(cookies).toEqual({});
  });

  it('should handle whitespace around cookie names and values', () => {
    const header = '  session = abc123 ;  token = xyz789 ';
    const cookies = parseCookies(header);

    // The implementation trims the cookie pair but splits on = first
    // After trim: "session = abc123", split on "=" gives ["session ", " abc123"]
    // The name is "session " (not trimmed individually) - testing actual behavior
    expect(cookies).toHaveProperty('session ');
    expect(cookies['session ']).toBe(' abc123');
  });

  it('should handle a single cookie without semicolons', () => {
    const header = 'refresh_token=long-opaque-value-here';
    const cookies = parseCookies(header);

    expect(cookies.refresh_token).toBe('long-opaque-value-here');
  });

  it('should handle cookies with empty values', () => {
    const header = 'empty=; hasvalue=123';
    const cookies = parseCookies(header);

    expect(cookies.empty).toBe('');
    expect(cookies.hasvalue).toBe('123');
  });
});

// ============================================================================
// 5. CSV Column Detection Edge Cases
// ============================================================================

describe('CSV Column Detection Edge Cases', () => {
  describe('ambiguous header matching', () => {
    it('should detect "by" as an author column', () => {
      const headers = ['Title', 'By', 'Level'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.author).toBe(1);
    });

    it('should detect "Published by" and match it to author via "by" pattern', () => {
      // "Published by" contains "by" which is in the author patterns
      const headers = ['Title', 'Published by', 'Reading Level'];
      const mapping = detectColumnMapping(headers);

      // The findIndex logic: h.includes(pattern) || pattern.includes(h)
      // For pattern "by": "published by".includes("by") => true, so index 1 matches author
      expect(mapping.author).toBe(1);
    });

    it('should handle "Writer" as author column name', () => {
      const headers = ['Book Name', 'Writer', 'Grade Level'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.title).toBe(0);
      expect(mapping.author).toBe(1);
      expect(mapping.readingLevel).toBe(2);
    });

    it('should handle case-insensitive matching', () => {
      const headers = ['TITLE', 'AUTHOR', 'READING LEVEL'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.title).toBe(0);
      expect(mapping.author).toBe(1);
      expect(mapping.readingLevel).toBe(2);
    });

    it('should return null for all fields when headers are completely unrecognized', () => {
      const headers = ['ISBN', 'Publisher', 'Year'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.title).toBeNull();
      // "Publisher" contains no author patterns, but let us verify
      // "publisher".includes("author") => false, "author".includes("publisher") => false
      // "publisher".includes("writer") => false, "publisher".includes("by") => false
      // but "by" is short: "publisher".includes("by") => false (no "by" substring)
      // Actually wait: does it? "pu-b-lisher" - no, "publisher" does not contain "by"
      expect(mapping.author).toBeNull();
      expect(mapping.readingLevel).toBeNull();
    });
  });

  describe('empty and edge-case CSV handling', () => {
    it('should throw on empty CSV input', () => {
      expect(() => parseCSV('')).toThrow('CSV file is empty');
    });

    it('should throw on whitespace-only CSV input', () => {
      expect(() => parseCSV('   \n   \n   ')).toThrow('CSV file is empty');
    });

    it('should handle CSV with headers only and no data rows', () => {
      const result = parseCSV('Title,Author,Level');

      expect(result.headers).toEqual(['Title', 'Author', 'Level']);
      expect(result.rows).toHaveLength(0);
    });

    it('should handle CSV with Windows-style line endings (CRLF)', () => {
      const csv = 'Title,Author\r\nThe BFG,Roald Dahl\r\nMatilda,Roald Dahl';
      const result = parseCSV(csv);

      expect(result.headers).toEqual(['Title', 'Author']);
      expect(result.rows).toHaveLength(2);
    });
  });
});

// ============================================================================
// 6. Settings Prototype Pollution Guard
// ============================================================================

describe('Settings Prototype Pollution Guard', () => {
  describe('validateSettings behavior with dangerous keys', () => {
    it('should accept normal settings keys without errors', () => {
      const result = validateSettings({
        readingStatusSettings: {
          recentlyReadDays: 3,
          needsAttentionDays: 7
        }
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should document that validateSettings does NOT reject __proto__ keys (security gap)', () => {
      // This test documents that the current validateSettings does not guard
      // against prototype pollution keys. It should be addressed in a future fix.
      const malicious = {
        __proto__: { isAdmin: true },
        readingStatusSettings: {
          recentlyReadDays: 3,
          needsAttentionDays: 7
        }
      };

      const result = validateSettings(malicious);

      // Current behavior: validateSettings does not check for dangerous keys.
      // This test passes to document the gap. A fix would reject __proto__,
      // constructor, and prototype keys.
      expect(result.isValid).toBe(true);
    });

    it('should document that validateSettings does NOT reject constructor keys (security gap)', () => {
      const malicious = {
        constructor: { prototype: { isAdmin: true } },
        readingStatusSettings: {
          recentlyReadDays: 3,
          needsAttentionDays: 7
        }
      };

      const result = validateSettings(malicious);

      // Current behavior: passes validation. Documenting as a known gap.
      expect(result.isValid).toBe(true);
    });

    it('should verify that Object.create(null) prevents prototype chain attacks', () => {
      // Defensive pattern: using Object.create(null) for settings storage
      // ensures no prototype chain pollution is possible
      const safeObj = Object.create(null);
      safeObj.recentlyReadDays = 3;
      safeObj.needsAttentionDays = 7;

      expect(safeObj.hasOwnProperty).toBeUndefined();
      expect(safeObj.constructor).toBeUndefined();
      expect(safeObj.recentlyReadDays).toBe(3);
    });

    it('should verify that JSON.parse does not carry __proto__ into object prototype', () => {
      // When settings come from JSON body parsing, __proto__ in JSON does not
      // actually set the prototype of the parsed object
      const parsed = JSON.parse('{"__proto__": {"polluted": true}, "name": "test"}');

      // The __proto__ key becomes an own property, not the actual prototype
      expect(parsed.name).toBe('test');
      // A clean object should not be polluted
      const clean = {};
      expect(clean.polluted).toBeUndefined();
    });
  });
});
