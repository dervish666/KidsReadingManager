import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { toursRouter } from '../../routes/tours';

const mockDb = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  all: vi.fn().mockResolvedValue({ results: [] }),
  run: vi.fn().mockResolvedValue({ success: true }),
};

const createApp = () => {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('userId', 1);
    c.set('userRole', 'teacher');
    c.env = { READING_MANAGER_DB: mockDb };
    await next();
  });
  app.route('/api/tours', toursRouter);
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.prepare.mockReturnThis();
  mockDb.bind.mockReturnThis();
  mockDb.all.mockResolvedValue({ results: [] });
  mockDb.run.mockResolvedValue({ success: true });
});

describe('GET /api/tours/status', () => {
  it('returns empty array when no tours completed', async () => {
    const app = createApp();
    const res = await app.request('/api/tours/status');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it('returns completed tours with tourId and version', async () => {
    mockDb.all.mockResolvedValue({
      results: [
        {
          id: 1,
          user_id: 1,
          tour_id: 'students',
          tour_version: 1,
          completed_at: '2026-03-26T12:00:00Z',
        },
        {
          id: 2,
          user_id: 1,
          tour_id: 'stats',
          tour_version: 1,
          completed_at: '2026-03-26T13:00:00Z',
        },
      ],
    });

    const app = createApp();
    const res = await app.request('/api/tours/status');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([
      { tourId: 'students', version: 1 },
      { tourId: 'stats', version: 1 },
    ]);
  });
});

describe('POST /api/tours/:tourId/complete', () => {
  it('returns 400 if version is missing', async () => {
    const app = createApp();
    const res = await app.request('/api/tours/students/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 if version is not a number', async () => {
    const app = createApp();
    const res = await app.request('/api/tours/students/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 'abc' }),
    });
    expect(res.status).toBe(400);
  });

  it('upserts completion and returns success', async () => {
    const app = createApp();
    const res = await app.request('/api/tours/students/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ success: true, tourId: 'students', version: 1 });
    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_tour_completions')
    );
  });
});
