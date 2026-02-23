import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkHardcoverAvailability,
  resetHardcoverAvailabilityCache,
  getHardcoverStatus
} from '../../utils/hardcoverApi.js';

describe('hardcoverApi', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    resetHardcoverAvailabilityCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  describe('checkHardcoverAvailability', () => {
    it('returns true on valid response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __typename: 'query_root' } })
      });

      const result = await checkHardcoverAvailability('test-api-key');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hardcover.app/v1/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            authorization: 'test-api-key'
          }),
          body: expect.any(String),
          signal: expect.any(AbortSignal)
        })
      );

      // Verify the body contains the introspection query
      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.query).toContain('__typename');
    });

    it('returns false on GraphQL errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          errors: [{ message: 'Unauthorized' }]
        })
      });

      const result = await checkHardcoverAvailability('bad-api-key');

      expect(result).toBe(false);
    });

    it('returns false on fetch throw', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await checkHardcoverAvailability('test-api-key');

      expect(result).toBe(false);
    });

    it('returns false when no API key provided', async () => {
      global.fetch = vi.fn();

      const result = await checkHardcoverAvailability(null);

      expect(result).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('caches result for 60 seconds (second call does not re-fetch)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __typename: 'query_root' } })
      });

      const result1 = await checkHardcoverAvailability('test-api-key');
      expect(result1).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Advance time by 30 seconds (within cache window)
      vi.advanceTimersByTime(30000);

      const result2 = await checkHardcoverAvailability('test-api-key');
      expect(result2).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1, no re-fetch

      // Advance time past 60 seconds total
      vi.advanceTimersByTime(31000);

      const result3 = await checkHardcoverAvailability('test-api-key');
      expect(result3).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2); // Now re-fetched
    });

    it('returns false on HTTP error response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const result = await checkHardcoverAvailability('test-api-key');

      expect(result).toBe(false);
    });
  });

  describe('getHardcoverStatus', () => {
    it('returns null available before first check', () => {
      const status = getHardcoverStatus();

      expect(status.available).toBeNull();
      expect(status.lastCheck).toBe(0);
      expect(status.stale).toBe(true);
    });

    it('returns status after successful check', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __typename: 'query_root' } })
      });

      vi.setSystemTime(new Date('2026-02-23T12:00:00Z'));
      await checkHardcoverAvailability('test-api-key');

      const status = getHardcoverStatus();

      expect(status.available).toBe(true);
      expect(status.lastCheck).toBe(Date.now());
      expect(status.stale).toBe(false);
    });

    it('reports stale after 60 seconds', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __typename: 'query_root' } })
      });

      await checkHardcoverAvailability('test-api-key');

      // Advance past the 60-second cache window
      vi.advanceTimersByTime(61000);

      const status = getHardcoverStatus();

      expect(status.available).toBe(true); // Still has last known value
      expect(status.stale).toBe(true);
    });

    it('returns false available after failed check', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await checkHardcoverAvailability('test-api-key');

      const status = getHardcoverStatus();

      expect(status.available).toBe(false);
      expect(status.stale).toBe(false);
    });
  });

  describe('resetHardcoverAvailabilityCache', () => {
    it('clears the cache so next check re-fetches', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __typename: 'query_root' } })
      });

      await checkHardcoverAvailability('test-api-key');
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Reset the cache
      resetHardcoverAvailabilityCache();

      // Verify status is cleared
      const status = getHardcoverStatus();
      expect(status.available).toBeNull();
      expect(status.lastCheck).toBe(0);

      // Next check should re-fetch
      await checkHardcoverAvailability('test-api-key');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
