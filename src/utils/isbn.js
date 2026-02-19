/**
 * ISBN validation and normalization utilities.
 *
 * Supports ISBN-10 and ISBN-13 with or without hyphens/spaces.
 * Follows the standard check-digit algorithms defined by the
 * International ISBN Agency.
 */

/**
 * Strip hyphens and spaces from an ISBN string.
 * @param {string} isbn
 * @returns {string}
 */
function stripFormatting(isbn) {
  return isbn.replace(/[-\s]/g, '');
}

/**
 * Validate an ISBN-10 check digit.
 *
 * Algorithm: sum of (digit * weight) where weights count down from 10 to 1.
 * The last character may be 'X' representing 10.
 * Valid when sum % 11 === 0.
 *
 * @param {string} digits - 10-character stripped ISBN-10
 * @returns {boolean}
 */
function isValidISBN10(digits) {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = digits[i];
    let value;
    if (i === 9 && (ch === 'X' || ch === 'x')) {
      value = 10;
    } else if (ch >= '0' && ch <= '9') {
      value = parseInt(ch, 10);
    } else {
      return false;
    }
    sum += value * (10 - i);
  }
  return sum % 11 === 0;
}

/**
 * Validate an ISBN-13 check digit.
 *
 * Algorithm: alternating weights of 1 and 3 for the first 12 digits.
 * Check digit = (10 - sum % 10) % 10.
 * Valid when the 13th digit equals the computed check digit.
 *
 * @param {string} digits - 13-character stripped ISBN-13
 * @returns {boolean}
 */
function isValidISBN13(digits) {
  // All characters must be digits
  if (!/^\d{13}$/.test(digits)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const weight = i % 2 === 0 ? 1 : 3;
    sum += parseInt(digits[i], 10) * weight;
  }
  const check = (10 - (sum % 10)) % 10;
  return parseInt(digits[12], 10) === check;
}

/**
 * Validate an ISBN string (ISBN-10 or ISBN-13).
 *
 * Accepts ISBNs with or without hyphens and spaces.
 * Validates the check digit using the appropriate algorithm.
 *
 * @param {*} isbn - The ISBN to validate
 * @returns {boolean} true if the ISBN is valid
 */
export function validateISBN(isbn) {
  if (typeof isbn !== 'string') {
    return false;
  }

  const stripped = stripFormatting(isbn);

  if (stripped.length === 13) {
    return isValidISBN13(stripped);
  }

  if (stripped.length === 10) {
    return isValidISBN10(stripped);
  }

  return false;
}

/**
 * Convert a 10-digit ISBN-10 to a 13-digit ISBN-13.
 *
 * Steps:
 * 1. Validate the ISBN-10 check digit
 * 2. Prepend "978" and drop the old check digit (giving 12 digits)
 * 3. Calculate the new ISBN-13 check digit
 *
 * Expects stripped input (no hyphens or spaces).
 *
 * @param {*} isbn10 - A 10-character ISBN-10 string
 * @returns {string|null} The ISBN-13 string, or null if input is invalid
 */
export function isbn10ToIsbn13(isbn10) {
  if (typeof isbn10 !== 'string') {
    return null;
  }

  // Normalize lowercase x
  const normalized = isbn10.replace(/x$/i, 'X');

  if (normalized.length !== 10) {
    return null;
  }

  if (!isValidISBN10(normalized)) {
    return null;
  }

  // Prepend 978, drop old check digit
  const base = '978' + normalized.slice(0, 9);

  // Calculate ISBN-13 check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const weight = i % 2 === 0 ? 1 : 3;
    sum += parseInt(base[i], 10) * weight;
  }
  const check = (10 - (sum % 10)) % 10;

  return base + check;
}

/**
 * Normalize an ISBN to ISBN-13 format without hyphens.
 *
 * - Strips hyphens and spaces
 * - Converts ISBN-10 to ISBN-13
 * - Validates the check digit
 *
 * @param {*} isbn - The ISBN string to normalize
 * @returns {string|null} The normalized ISBN-13, or null if invalid
 */
export function normalizeISBN(isbn) {
  if (typeof isbn !== 'string') {
    return null;
  }

  const stripped = stripFormatting(isbn);

  if (stripped.length === 13) {
    if (!isValidISBN13(stripped)) {
      return null;
    }
    return stripped;
  }

  if (stripped.length === 10) {
    return isbn10ToIsbn13(stripped);
  }

  return null;
}
