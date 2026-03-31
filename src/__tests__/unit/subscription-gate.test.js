import { describe, it, expect, vi } from 'vitest';
import { subscriptionGate } from '../../middleware/tenant.js';

const createMockContext = (overrides = {}) => {
  const store = new Map();
  return {
    req: {
      url: 'http://localhost/api/students',
      method: 'GET',
      path: '/api/students',
      ...overrides.req,
    },
    json: vi.fn((data, status) => ({ data, status })),
    set: vi.fn((key, value) => store.set(key, value)),
    get: vi.fn((key) => {
      if (overrides.context && key in overrides.context) return overrides.context[key];
      return store.get(key);
    }),
  };
};

describe('subscriptionGate', () => {
  const gate = subscriptionGate();

  describe('owner bypass', () => {
    it('should pass for owner regardless of subscription status', async () => {
      const statuses = ['cancelled', 'past_due', 'canceled', 'unpaid', 'incomplete_expired'];
      for (const status of statuses) {
        const c = createMockContext({
          context: { userRole: 'owner', subscriptionStatus: status },
          req: { url: 'http://localhost/api/students', method: 'DELETE', path: '/api/students' },
        });
        const next = vi.fn().mockResolvedValue('next');
        await gate(c, next);
        expect(next).toHaveBeenCalled();
        expect(c.json).not.toHaveBeenCalled();
      }
    });
  });

  describe('exempt paths', () => {
    const exemptPaths = [
      ['/api/auth/login', 'POST'],
      ['/api/auth/refresh', 'POST'],
      ['/api/billing/status', 'GET'],
      ['/api/billing/portal', 'POST'],
      ['/api/billing/subscription-status', 'GET'],
    ];

    exemptPaths.forEach(([path, method]) => {
      it(`should pass for ${method} ${path} even when cancelled`, async () => {
        const c = createMockContext({
          context: { userRole: 'teacher', subscriptionStatus: 'cancelled' },
          req: { url: `http://localhost${path}`, method, path },
        });
        const next = vi.fn().mockResolvedValue('next');
        await gate(c, next);
        expect(next).toHaveBeenCalled();
      });
    });

    it('should pass for POST /api/support when cancelled', async () => {
      const c = createMockContext({
        context: { userRole: 'teacher', subscriptionStatus: 'cancelled' },
        req: { url: 'http://localhost/api/support', method: 'POST', path: '/api/support' },
      });
      const next = vi.fn().mockResolvedValue('next');
      await gate(c, next);
      expect(next).toHaveBeenCalled();
    });

    it('should NOT exempt GET /api/support when cancelled', async () => {
      const c = createMockContext({
        context: { userRole: 'teacher', subscriptionStatus: 'cancelled' },
        req: { url: 'http://localhost/api/support', method: 'GET', path: '/api/support' },
      });
      const next = vi.fn();
      await gate(c, next);
      expect(next).not.toHaveBeenCalled();
      expect(c.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'SUBSCRIPTION_CANCELLED' }),
        403,
      );
    });
  });

  describe('allowed statuses', () => {
    const allowed = [null, undefined, 'none', 'trialing', 'active'];
    allowed.forEach((status) => {
      it(`should pass for status "${status}"`, async () => {
        const c = createMockContext({
          context: { userRole: 'teacher', subscriptionStatus: status || 'none' },
          req: { url: 'http://localhost/api/students', method: 'POST', path: '/api/students' },
        });
        const next = vi.fn().mockResolvedValue('next');
        await gate(c, next);
        expect(next).toHaveBeenCalled();
      });
    });
  });

  describe('past_due — read-only mode', () => {
    it('should allow GET requests', async () => {
      const c = createMockContext({
        context: { userRole: 'teacher', subscriptionStatus: 'past_due' },
        req: { url: 'http://localhost/api/students', method: 'GET', path: '/api/students' },
      });
      const next = vi.fn().mockResolvedValue('next');
      await gate(c, next);
      expect(next).toHaveBeenCalled();
    });

    it('should allow HEAD requests', async () => {
      const c = createMockContext({
        context: { userRole: 'teacher', subscriptionStatus: 'past_due' },
        req: { url: 'http://localhost/api/students', method: 'HEAD', path: '/api/students' },
      });
      const next = vi.fn().mockResolvedValue('next');
      await gate(c, next);
      expect(next).toHaveBeenCalled();
    });

    const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    writeMethods.forEach((method) => {
      it(`should block ${method} requests with SUBSCRIPTION_PAST_DUE`, async () => {
        const c = createMockContext({
          context: { userRole: 'teacher', subscriptionStatus: 'past_due' },
          req: { url: 'http://localhost/api/students', method, path: '/api/students' },
        });
        const next = vi.fn();
        await gate(c, next);
        expect(next).not.toHaveBeenCalled();
        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'SUBSCRIPTION_PAST_DUE' }),
          403,
        );
      });
    });
  });

  describe('cancelled — fully blocked', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
    methods.forEach((method) => {
      it(`should block ${method} requests with SUBSCRIPTION_CANCELLED`, async () => {
        const c = createMockContext({
          context: { userRole: 'teacher', subscriptionStatus: 'cancelled' },
          req: { url: 'http://localhost/api/students', method, path: '/api/students' },
        });
        const next = vi.fn();
        await gate(c, next);
        expect(next).not.toHaveBeenCalled();
        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'SUBSCRIPTION_CANCELLED' }),
          403,
        );
      });
    });
  });

  describe('unknown Stripe statuses default to blocked', () => {
    const unknownStatuses = ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'];
    unknownStatuses.forEach((status) => {
      it(`should block for unknown status "${status}"`, async () => {
        const c = createMockContext({
          context: { userRole: 'teacher', subscriptionStatus: status },
          req: { url: 'http://localhost/api/students', method: 'GET', path: '/api/students' },
        });
        const next = vi.fn();
        await gate(c, next);
        expect(next).not.toHaveBeenCalled();
        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'SUBSCRIPTION_CANCELLED' }),
          403,
        );
      });
    });
  });
});
