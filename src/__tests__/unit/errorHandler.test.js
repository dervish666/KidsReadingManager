import { describe, it, expect, vi, afterEach } from 'vitest';
import { onError } from '../../middleware/errorHandler.js';

const ctx = () => ({
  req: { path: '/api/students/x/sessions' },
  json: vi.fn((body, status) => ({ body, status })),
});

describe('onError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('tags a transient D1 failure so Sentry can count it apart from real 500s', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = onError(
      new Error('D1_ERROR: D1 DB is overloaded. Requests queued for too long.'),
      ctx()
    );
    expect(spy.mock.calls[0][0]).toMatch(/^\[D1Transient\] Error in request/);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal Server Error');
  });

  it('leaves an ordinary error untagged', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    onError(Object.assign(new Error('Permission denied'), { status: 403 }), ctx());
    expect(spy.mock.calls[0][0]).toMatch(/^Error in request/);
  });
});
