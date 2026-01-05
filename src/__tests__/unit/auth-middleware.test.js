import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createAuthToken,
  validateAuthToken,
  authMiddleware,
  handleLogin
} from '../../middleware/auth.js';

// Mock environment
const createMockEnv = (password = 'test-password') => ({
  WORKER_ADMIN_PASSWORD: password
});

describe('Legacy Auth Middleware', () => {
  describe('createAuthToken', () => {
    it('should create a base64-encoded token', async () => {
      const env = createMockEnv();
      const token = await createAuthToken(env);

      expect(token).toBeTruthy();
      // Should be decodable as base64
      expect(() => atob(token)).not.toThrow();
    });

    it('should include iat, exp, and sig fields', async () => {
      const env = createMockEnv();
      const token = await createAuthToken(env);
      const decoded = JSON.parse(atob(token));

      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.sig).toBeDefined();
    });

    it('should set expiry 12 hours in the future', async () => {
      const env = createMockEnv();
      const now = Date.now();
      const token = await createAuthToken(env);
      const decoded = JSON.parse(atob(token));

      const expectedExpiry = now + 1000 * 60 * 60 * 12;
      // Allow 1 second tolerance
      expect(Math.abs(decoded.exp - expectedExpiry)).toBeLessThan(1000);
    });
  });

  describe('validateAuthToken', () => {
    it('should validate a valid token', async () => {
      const env = createMockEnv();
      const token = await createAuthToken(env);

      const isValid = await validateAuthToken(env, token);
      expect(isValid).toBe(true);
    });

    it('should reject token with wrong password', async () => {
      const env = createMockEnv('password1');
      const token = await createAuthToken(env);

      const differentEnv = createMockEnv('password2');
      const isValid = await validateAuthToken(differentEnv, token);
      expect(isValid).toBe(false);
    });

    it('should reject malformed token (not base64)', async () => {
      const env = createMockEnv();
      const isValid = await validateAuthToken(env, '!!not-base64!!');
      expect(isValid).toBe(false);
    });

    it('should reject token missing required fields', async () => {
      const env = createMockEnv();
      const invalidToken = btoa(JSON.stringify({ iat: Date.now() })); // missing exp and sig
      const isValid = await validateAuthToken(env, invalidToken);
      expect(isValid).toBe(false);
    });

    it('should reject expired token', async () => {
      const env = createMockEnv();
      // Create a token that expired in the past
      const expiredPayload = {
        iat: Date.now() - 100000,
        exp: Date.now() - 1000, // expired
        sig: 'fake-sig'
      };
      const token = btoa(JSON.stringify(expiredPayload));

      const isValid = await validateAuthToken(env, token);
      expect(isValid).toBe(false);
    });

    it('should reject null token', async () => {
      const env = createMockEnv();
      const isValid = await validateAuthToken(env, null);
      expect(isValid).toBe(false);
    });

    it('should reject empty string token', async () => {
      const env = createMockEnv();
      const isValid = await validateAuthToken(env, '');
      expect(isValid).toBe(false);
    });
  });

  describe('authMiddleware', () => {
    const createMockContext = (path, authHeader = null) => {
      const req = {
        url: `http://localhost${path}`,
        header: vi.fn((name) => {
          if (name.toLowerCase() === 'authorization') return authHeader;
          return null;
        })
      };
      return {
        req,
        env: createMockEnv(),
        json: vi.fn().mockImplementation((data, status) => ({ data, status }))
      };
    };

    it('should allow access to /api/login without auth', async () => {
      const c = createMockContext('/api/login');
      const next = vi.fn().mockResolvedValue('next-result');
      const middleware = authMiddleware();

      const result = await middleware(c, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow access to /api/health without auth', async () => {
      const c = createMockContext('/api/health');
      const next = vi.fn().mockResolvedValue('next-result');
      const middleware = authMiddleware();

      const result = await middleware(c, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject requests without Authorization header', async () => {
      const c = createMockContext('/api/students');
      const next = vi.fn();
      const middleware = authMiddleware();

      const result = await middleware(c, next);

      expect(c.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject requests with non-Bearer auth', async () => {
      const c = createMockContext('/api/students', 'Basic abc123');
      const next = vi.fn();
      const middleware = authMiddleware();

      const result = await middleware(c, next);

      expect(c.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401);
    });

    it('should accept valid Bearer token', async () => {
      const env = createMockEnv();
      const token = await createAuthToken(env);
      const c = createMockContext('/api/students', `Bearer ${token}`);
      c.env = env;
      const next = vi.fn().mockResolvedValue('next-result');
      const middleware = authMiddleware();

      await middleware(c, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject invalid Bearer token', async () => {
      const c = createMockContext('/api/students', 'Bearer invalid-token');
      const next = vi.fn();
      const middleware = authMiddleware();

      await middleware(c, next);

      expect(c.json).toHaveBeenCalledWith({ error: 'Unauthorized' }, 401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('handleLogin', () => {
    it('should return error when password not configured', async () => {
      const c = {
        env: {},
        req: { json: vi.fn().mockResolvedValue({ password: 'test' }) },
        json: vi.fn().mockImplementation((data, status) => ({ data, status }))
      };

      await handleLogin(c);

      expect(c.json).toHaveBeenCalledWith(
        { error: 'Server auth not configured' },
        500
      );
    });

    it('should return error for wrong password', async () => {
      const c = {
        env: { WORKER_ADMIN_PASSWORD: 'correct-password' },
        req: { json: vi.fn().mockResolvedValue({ password: 'wrong-password' }) },
        json: vi.fn().mockImplementation((data, status) => ({ data, status }))
      };

      await handleLogin(c);

      expect(c.json).toHaveBeenCalledWith(
        { error: 'Invalid password' },
        401
      );
    });

    it('should return error for missing password', async () => {
      const c = {
        env: { WORKER_ADMIN_PASSWORD: 'correct-password' },
        req: { json: vi.fn().mockResolvedValue({}) },
        json: vi.fn().mockImplementation((data, status) => ({ data, status }))
      };

      await handleLogin(c);

      expect(c.json).toHaveBeenCalledWith(
        { error: 'Invalid password' },
        401
      );
    });

    it('should return token for correct password', async () => {
      const c = {
        env: { WORKER_ADMIN_PASSWORD: 'correct-password' },
        req: { json: vi.fn().mockResolvedValue({ password: 'correct-password' }) },
        json: vi.fn().mockImplementation((data, status) => ({ data, status }))
      };

      await handleLogin(c);

      expect(c.json).toHaveBeenCalledWith(expect.objectContaining({
        token: expect.any(String)
      }));
    });

    it('should handle JSON parse errors gracefully', async () => {
      const c = {
        env: { WORKER_ADMIN_PASSWORD: 'correct-password' },
        req: { json: vi.fn().mockRejectedValue(new Error('Invalid JSON')) },
        json: vi.fn().mockImplementation((data, status) => ({ data, status }))
      };

      await handleLogin(c);

      expect(c.json).toHaveBeenCalledWith(
        { error: 'Invalid password' },
        401
      );
    });
  });
});
