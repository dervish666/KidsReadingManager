/**
 * String matching utilities for book import deduplication
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
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
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

  return 1 - (distance / maxLength);
};

/**
 * Check if two strings are an exact match after normalization
 */
export const isExactMatch = (a, b) => {
  return normalizeString(a) === normalizeString(b);
};

/**
 * Check if two books are a fuzzy match
 * Requires title similarity > 85% AND (author similarity > 85% OR one author missing OR one contains the other)
 */
export const isFuzzyMatch = (bookA, bookB, threshold = 0.85) => {
  const titleSimilarity = calculateSimilarity(bookA.title, bookB.title);

  if (titleSimilarity < threshold) return false;

  // If one or both authors are missing, match on title alone
  const authorA = normalizeString(bookA.author);
  const authorB = normalizeString(bookB.author);

  if (!authorA || !authorB) return true;

  // Check if one author contains the other (e.g., "Tolkien" in "jrr tolkien")
  if (authorA.includes(authorB) || authorB.includes(authorA)) return true;

  const authorSimilarity = calculateSimilarity(bookA.author, bookB.author);
  return authorSimilarity >= threshold;
};
