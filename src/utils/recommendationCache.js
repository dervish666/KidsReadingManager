/**
 * Recommendation Cache Utility
 *
 * Caches AI book recommendation results in Cloudflare KV to avoid
 * redundant API calls for identical recommendation parameters.
 * All operations are fail-open: cache errors never block recommendations.
 */

/**
 * Generate a deterministic cache key from recommendation inputs.
 * Arrays are sorted so order doesn't affect the hash.
 *
 * @param {Object} inputs - Recommendation parameters
 * @param {string} [inputs.focusMode] - Focus mode (balanced/consolidation/challenge)
 * @param {string[]} [inputs.genres] - Genre filters
 * @param {string} [inputs.provider] - AI provider name
 * @param {number|string} [inputs.readingLevelMin] - Minimum reading level
 * @param {number|string} [inputs.readingLevelMax] - Maximum reading level
 * @param {number[]} [inputs.recentBookIds] - Recently read book IDs to exclude
 * @returns {Promise<string>} Cache key in format `rec:{64-char-hex}`
 */
export async function generateCacheKey(inputs) {
  const normalised = JSON.stringify({
    focusMode: inputs.focusMode || 'balanced',
    genres: (inputs.genres || []).slice().sort(),
    provider: inputs.provider || 'anthropic',
    readingLevelMax: inputs.readingLevelMax ?? '',
    readingLevelMin: inputs.readingLevelMin ?? '',
    recentBookIds: (inputs.recentBookIds || []).slice().sort(),
  });

  const data = new TextEncoder().encode(normalised);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return 'rec:' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get cached recommendations. Returns null on miss or error (fail-open).
 *
 * @param {Object} env - Cloudflare Worker environment bindings
 * @param {Object} inputs - Recommendation parameters (same as generateCacheKey)
 * @returns {Promise<Object|null>} Cached result with `_cached: true` flag, or null
 */
export async function getCachedRecommendations(env, inputs) {
  if (!env.RECOMMENDATIONS_CACHE) return null;
  try {
    const key = await generateCacheKey(inputs);
    const raw = await env.RECOMMENDATIONS_CACHE.get(key);
    if (raw) return { ...JSON.parse(raw), _cached: true };
    return null;
  } catch (error) {
    console.error('Recommendation cache read error:', error);
    return null;
  }
}

/**
 * Store recommendations in cache. Silently ignores errors (fail-open).
 *
 * @param {Object} env - Cloudflare Worker environment bindings
 * @param {Object} inputs - Recommendation parameters (same as generateCacheKey)
 * @param {Object} result - Recommendation result to cache
 * @returns {Promise<void>}
 */
export async function cacheRecommendations(env, inputs, result) {
  if (!env.RECOMMENDATIONS_CACHE) return;
  try {
    const key = await generateCacheKey(inputs);
    await env.RECOMMENDATIONS_CACHE.put(key, JSON.stringify(result), {
      expirationTtl: 7 * 24 * 60 * 60, // 7 days
    });
  } catch (error) {
    console.error('Recommendation cache write error:', error);
  }
}
