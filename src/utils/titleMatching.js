/**
 * Shared title matching utilities for book metadata APIs.
 *
 * Used by openLibraryApi.js, googleBooksApi.js, and hardcoverApi.js
 * for consistent title normalization and similarity scoring.
 */

/**
 * Normalize a title for comparison.
 * Lowercases, strips punctuation, collapses whitespace.
 *
 * @param {string} title
 * @returns {string} Normalized title
 */
export function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
}

/**
 * Calculate similarity between two titles using a fuzzy strategy tuned for
 * partial matches.
 *
 * Uses three signals:
 *   - Substring coverage (shorter fully contained in longer)
 *   - Word-overlap ratio
 *   - Character bigram Jaccard similarity
 *
 * @param {string} title1 - Normalized title
 * @param {string} title2 - Normalized title
 * @returns {number} Similarity between 0 and 1
 */
export function calculateTitleSimilarity(title1, title2) {
  if (!title1 || !title2) return 0;

  // Exact match
  if (title1 === title2) return 1;

  const words1 = title1.split(' ').filter(Boolean);
  const words2 = title2.split(' ').filter(Boolean);

  // Word overlap ratio
  const set2 = new Set(words2);
  let overlap = 0;
  for (const w of words1) {
    if (set2.has(w)) overlap++;
  }
  const wordScore = overlap / Math.max(words1.length, words2.length);

  // Substring coverage: shorter fully contained in longer -> strong signal
  const shorter = title1.length <= title2.length ? title1 : title2;
  const longer = title1.length > title2.length ? title1 : title2;
  const substringScore = longer.includes(shorter) ? shorter.length / longer.length : 0;

  // Character bigram Jaccard for extra fuzziness tolerance
  const bigrams = (s) => {
    const res = [];
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      if (bg.trim().length === 2) res.push(bg);
    }
    return res;
  };

  const b1 = bigrams(title1);
  const b2 = bigrams(title2);
  let charScore = 0;
  if (b1.length && b2.length) {
    const setB1 = new Set(b1);
    const setB2 = new Set(b2);
    let intersect = 0;
    for (const bg of setB1) {
      if (setB2.has(bg)) intersect++;
    }
    const union = setB1.size + setB2.size - intersect;
    charScore = union > 0 ? intersect / union : 0;
  }

  // Weighted combination; emphasize partial/substring coverage
  const combined =
    0.5 * substringScore +
    0.3 * wordScore +
    0.2 * charScore;

  return Math.max(0, Math.min(1, combined));
}

/**
 * Find the best matching result from a list based on title similarity.
 *
 * @param {string} searchTitle - The title to search for
 * @param {Array} results - Array of result objects with a `title` property
 * @param {Object} [options]
 * @param {number} [options.threshold=0.3] - Minimum similarity to accept
 * @param {Function} [options.getTitle] - Extract title from a result (default: r => r.title)
 * @param {Function} [options.hasAuthor] - Check if result has an author (default: () => true)
 * @returns {Object|null} Best matching result with `similarity` added, or null
 */
export function findBestTitleMatch(searchTitle, results, options = {}) {
  if (!results || results.length === 0) return null;

  const {
    threshold = 0.3,
    getTitle = (r) => r.title || '',
    hasAuthor = () => true,
  } = options;

  const normalizedSearchTitle = normalizeTitle(searchTitle);

  const scoredResults = results.map(result => {
    const normalizedResultTitle = normalizeTitle(getTitle(result));
    const similarity = calculateTitleSimilarity(normalizedSearchTitle, normalizedResultTitle);
    return {
      ...result,
      similarity,
      _hasAuthor: hasAuthor(result),
    };
  });

  // Sort by similarity (descending) and prefer results with authors
  scoredResults.sort((a, b) => {
    if (a._hasAuthor && !b._hasAuthor) return -1;
    if (!a._hasAuthor && b._hasAuthor) return 1;
    return b.similarity - a.similarity;
  });

  const bestMatch = scoredResults[0];
  if (bestMatch && bestMatch.similarity > threshold) {
    const { _hasAuthor, ...rest } = bestMatch;
    return rest;
  }

  return null;
}
