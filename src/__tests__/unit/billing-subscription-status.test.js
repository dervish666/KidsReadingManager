import { describe, it, expect, vi } from 'vitest';
import { billingRouter } from '../../routes/billing.js';

describe('GET /api/billing/subscription-status', () => {
  it('should return subscription status for any authenticated user', async () => {
    const mockDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({
            subscription_status: 'trialing',
          }),
        })),
      })),
    };

    const { Hono } = await import('hono');
    const app = new Hono();

    app.use('*', async (c, next) => {
      c.set('organizationId', 'org-1');
      c.set('userRole', 'teacher');
      c.env = { READING_MANAGER_DB: mockDb };
      return next();
    });

    app.route('/api/billing', billingRouter);

    const res = await app.request('/api/billing/subscription-status');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('trialing');
  });

  it('should return none when subscription_status is NULL', async () => {
    const mockDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({
            subscription_status: null,
          }),
        })),
      })),
    };

    const { Hono } = await import('hono');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('organizationId', 'org-1');
      c.set('userRole', 'readonly');
      c.env = { READING_MANAGER_DB: mockDb };
      return next();
    });
    app.route('/api/billing', billingRouter);

    const res = await app.request('/api/billing/subscription-status');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('none');
  });
});
