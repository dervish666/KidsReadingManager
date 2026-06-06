/**
 * String/title matching utilities — the single home for "is this the same
 * book?" logic. Two similarity strategies live here; pick deliberately:
 *
 *   - calculateSimilarity (Levenshtein, threshold ~0.85): strict edit-distance
 *     similarity. Use for IMPORT DEDUPLICATION, where a false merge corrupts
 *     a school's catalog (BookImportWizard, books/import, bookDedup).
 *
 *   - calculateTitleSimilarity (substring + word overlap + bigram Jaccard,
 *     threshold ~0.3): tolerant partial matching. Use for RANKING METADATA
 *     PROVIDER RESULTS, where the search APIs return subtitle/series variants
 *     of the right book (openLibraryApi, googleBooksApi, hardcoverApi).
 */

/**
 * Normalize a string for comparison
 * - Lowercase
 * - Trim whitespace
 * - Remove punctuation
 * - Collapse multiple spaces
 */
export const normalizeString = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
};

/**
 * Normalize an author name for comparison
 * Handles "Last, First" vs "First Last" by sorting words alphabetically
 */
export const normalizeAuthor = (str) => {
  const normalized = normalizeString(str);
  if (!normalized) return '';
  return normalized.split(' ').sort().join(' ');
};

/**
 * Convert "Lastname, Firstname" format to "Firstname Lastname".
 * If the name doesn't contain a comma, returns it trimmed as-is.
 */
export const normalizeAuthorDisplay = (str) => {
  if (!str) return null;
  const trimmed = str.trim();
  if (!trimmed.includes(',')) return trimmed;
  const parts = trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 2) {
    return `${parts[1]} ${parts[0]}`;
  }
  return trimmed;
};

/**
 * Calculate Levenshtein distance between two strings
 */
const levenshteinDistance = (a, b) => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
};

/**
 * Calculate similarity ratio (0-1) between two strings
 */
export const calculateSimilarity = (a, b) => {
  const normalA = normalizeString(a);
  const normalB = normalizeString(b);

  if (normalA === normalB) return 1;
  if (!normalA || !normalB) return 0;

  const maxLength = Math.max(normalA.length, normalB.length);
  const distance = levenshteinDistance(normalA, normalB);

  return 1 - distance / maxLength;
};

/**
 * Check if two strings are an exact match after normalization
 */
export const isExactMatch = (a, b) => {
  return normalizeString(a) === normalizeString(b);
};

/**
 * Check if two author names match, handling "Last, First" vs "First Last"
 */
export const isAuthorMatch = (a, b) => {
  if (!a || !b) return true; // missing author = don't block match
  return normalizeAuthor(a) === normalizeAuthor(b);
};

// ── Title-matching strategy (metadata provider ranking) ─────────────────────
// Formerly src/utils/titleMatching.js; merged here so both similarity
// strategies share one normalizer and one home.

/**
 * Strip characters that confuse search API query syntax (e.g. # in "#Goldilocks").
 * Preserves case and meaningful punctuation like hyphens and apostrophes.
 */
export function sanitizeForSearch(title) {
  return title
    .replace(/[#@:;!?*~^{}[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a title for comparison. Same transformation as normalizeString —
 * the alias survives because provider modules read clearer in title vocabulary.
 */
export const normalizeTitle = normalizeString;

/**
 * Calculate similarity between two titles using a fuzzy strategy tuned for
 * partial matches (see file header for when to use this vs calculateSimilarity).
 *
 * Signals: substring coverage, word-overlap ratio, character-bigram Jaccard.
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
  const combined = 0.5 * substringScore + 0.3 * wordScore + 0.2 * charScore;

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

  const { threshold = 0.3, getTitle = (r) => r.title || '', hasAuthor = () => true } = options;

  const normalizedSearchTitle = normalizeTitle(searchTitle);

  const scoredResults = results.map((result) => {
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

/**
 * Check if two books are a fuzzy match
 * Requires title similarity > 85% AND (author match OR one author missing OR one contains the other)
 */
export const isFuzzyMatch = (bookA, bookB, threshold = 0.85) => {
  const titleSimilarity = calculateSimilarity(bookA.title, bookB.title);

  if (titleSimilarity < threshold) return false;

  // If one or both authors are missing, match on title alone
  const authorA = normalizeString(bookA.author);
  const authorB = normalizeString(bookB.author);

  if (!authorA || !authorB) return true;

  // Check word-order-independent match (handles "Last, First" vs "First Last")
  if (normalizeAuthor(bookA.author) === normalizeAuthor(bookB.author)) return true;

  // Check if one author contains the other (e.g., "Tolkien" in "jrr tolkien")
  if (authorA.includes(authorB) || authorB.includes(authorA)) return true;

  const authorSimilarity = calculateSimilarity(bookA.author, bookB.author);
  return authorSimilarity >= threshold;
};
