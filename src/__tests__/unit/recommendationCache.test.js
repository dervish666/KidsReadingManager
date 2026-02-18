import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateCacheKey,
  getCachedRecommendations,
  cacheRecommendations,
} from '../../utils/recommendationCache.js';

describe('recommendationCache', () => {
  describe('generateCacheKey', () => {
    it('should produce a deterministic hash (same inputs → same key)', async () => {
      const inputs = {
        focusMode: 'balanced',
        genres: ['fiction', 'adventure'],
        provider: 'anthropic',
        readingLevelMin: 2.0,
        readingLevelMax: 4.5,
        recentBookIds: [101, 202, 303],
      };

      const key1 = await generateCacheKey(inputs);
      const key2 = await generateCacheKey(inputs);

      expect(key1).toBe(key2);
    });

    it('should return key in format rec:{64-char-hex}', async () => {
      const inputs = {
        focusMode: 'balanced',
        genres: ['fiction'],
        provider: 'anthropic',
        readingLevelMin: 1.0,
        readingLevelMax: 3.0,
        recentBookIds: [],
      };

      const key = await generateCacheKey(inputs);

      expect(key).toMatch(/^rec:[0-9a-f]{64}$/);
    });

    it('should produce the same key regardless of genre array order', async () => {
      const inputs1 = {
        focusMode: 'challenge',
        genres: ['mystery', 'adventure', 'fiction'],
        provider: 'openai',
        readingLevelMin: 3.0,
        readingLevelMax: 5.0,
        recentBookIds: [10, 20],
      };
      const inputs2 = {
        ...inputs1,
        genres: ['fiction', 'mystery', 'adventure'],
      };

      const key1 = await generateCacheKey(inputs1);
      const key2 = await generateCacheKey(inputs2);

      expect(key1).toBe(key2);
    });

    it('should produce the same key regardless of recentBookIds array order', async () => {
      const inputs1 = {
        focusMode: 'consolidation',
        genres: ['science'],
        provider: 'anthropic',
        readingLevelMin: 2.0,
        readingLevelMax: 4.0,
        recentBookIds: [300, 100, 200],
      };
      const inputs2 = {
        ...inputs1,
        recentBookIds: [100, 200, 300],
      };

      const key1 = await generateCacheKey(inputs1);
      const key2 = await generateCacheKey(inputs2);

      expect(key1).toBe(key2);
    });

    it('should produce different keys for different inputs', async () => {
      const inputs1 = {
        focusMode: 'balanced',
        genres: ['fiction'],
        provider: 'anthropic',
        readingLevelMin: 1.0,
        readingLevelMax: 3.0,
        recentBookIds: [],
      };
      const inputs2 = {
        focusMode: 'challenge',
        genres: ['fiction'],
        provider: 'anthropic',
        readingLevelMin: 1.0,
        readingLevelMax: 3.0,
        recentBookIds: [],
      };

      const key1 = await generateCacheKey(inputs1);
      const key2 = await generateCacheKey(inputs2);

      expect(key1).not.toBe(key2);
    });

    it('should handle missing optional fields gracefully', async () => {
      const key1 = await generateCacheKey({});
      const key2 = await generateCacheKey({});

      // Should not throw and should produce a valid key
      expect(key1).toMatch(/^rec:[0-9a-f]{64}$/);
      // Should be deterministic even with empty input
      expect(key1).toBe(key2);
    });

    it('should treat missing fields with consistent defaults', async () => {
      const explicit = {
        focusMode: 'balanced',
        genres: [],
        provider: 'anthropic',
        readingLevelMin: '',
        readingLevelMax: '',
        recentBookIds: [],
      };
      const implicit = {};

      const key1 = await generateCacheKey(explicit);
      const key2 = await generateCacheKey(implicit);

      expect(key1).toBe(key2);
    });
  });

  describe('getCachedRecommendations', () => {
    const sampleInputs = {
      focusMode: 'balanced',
      genres: ['fiction'],
      provider: 'anthropic',
      readingLevelMin: 2.0,
      readingLevelMax: 4.0,
      recentBookIds: [1, 2, 3],
    };

    it('should return null when KV binding is missing', async () => {
      const env = {};

      const result = await getCachedRecommendations(env, sampleInputs);

      expect(result).toBeNull();
    });

    it('should return null on cache miss', async () => {
      const env = {
        RECOMMENDATIONS_CACHE: {
          get: vi.fn().mockResolvedValue(null),
        },
      };

      const result = await getCachedRecommendations(env, sampleInputs);

      expect(result).toBeNull();
      expect(env.RECOMMENDATIONS_CACHE.get).toHaveBeenCalledOnce();
    });

    it('should return cached data with _cached: true flag on hit', async () => {
      const cachedData = {
        recommendations: [{ id: 1, title: 'Test Book' }],
        provider: 'anthropic',
      };
      const env = {
        RECOMMENDATIONS_CACHE: {
          get: vi.fn().mockResolvedValue(JSON.stringify(cachedData)),
        },
      };

      const result = await getCachedRecommendations(env, sampleInputs);

      expect(result).toEqual({ ...cachedData, _cached: true });
      expect(result._cached).toBe(true);
    });

    it('should pass the correct cache key to KV get', async () => {
      const env = {
        RECOMMENDATIONS_CACHE: {
          get: vi.fn().mockResolvedValue(null),
        },
      };

      await getCachedRecommendations(env, sampleInputs);

      const expectedKey = await generateCacheKey(sampleInputs);
      expect(env.RECOMMENDATIONS_CACHE.get).toHaveBeenCalledWith(expectedKey);
    });

    it('should return null and log error on KV error (fail-open)', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const env = {
        RECOMMENDATIONS_CACHE: {
          get: vi.fn().mockRejectedValue(new Error('KV read failure')),
        },
      };

      const result = await getCachedRecommendations(env, sampleInputs);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Recommendation cache read error:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('cacheRecommendations', () => {
    const sampleInputs = {
      focusMode: 'balanced',
      genres: ['fiction'],
      provider: 'anthropic',
      readingLevelMin: 2.0,
      readingLevelMax: 4.0,
      recentBookIds: [1, 2, 3],
    };
    const sampleResult = {
      recommendations: [{ id: 1, title: 'Test Book' }],
      provider: 'anthropic',
    };

    it('should do nothing when KV binding is missing', async () => {
      const env = {};

      // Should not throw
      await expect(cacheRecommendations(env, sampleInputs, sampleResult)).resolves.toBeUndefined();
    });

    it('should store result in KV with 7-day TTL (604800 seconds)', async () => {
      const env = {
        RECOMMENDATIONS_CACHE: {
          put: vi.fn().mockResolvedValue(undefined),
        },
      };

      await cacheRecommendations(env, sampleInputs, sampleResult);

      const expectedKey = await generateCacheKey(sampleInputs);
      expect(env.RECOMMENDATIONS_CACHE.put).toHaveBeenCalledWith(
        expectedKey,
        JSON.stringify(sampleResult),
        { expirationTtl: 604800 }
      );
    });

    it('should use a key in the rec:{hex} format', async () => {
      const env = {
        RECOMMENDATIONS_CACHE: {
          put: vi.fn().mockResolvedValue(undefined),
        },
      };

      await cacheRecommendations(env, sampleInputs, sampleResult);

      const calledKey = env.RECOMMENDATIONS_CACHE.put.mock.calls[0][0];
      expect(calledKey).toMatch(/^rec:[0-9a-f]{64}$/);
    });

    it('should not throw on KV write error (fail-open)', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const env = {
        RECOMMENDATIONS_CACHE: {
          put: vi.fn().mockRejectedValue(new Error('KV write failure')),
        },
      };

      await expect(
        cacheRecommendations(env, sampleInputs, sampleResult)
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Recommendation cache write error:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
