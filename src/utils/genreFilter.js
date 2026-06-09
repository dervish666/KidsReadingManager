/**
 * Shared junk-genre filter.
 *
 * Metadata providers (Hardcover, BookInfo/Goodreads shelves, etc.) hand back a
 * lot of strings that aren't useful genres: catalog subject-headings
 * ("African americans, fiction", "Aeronautics, juvenile literature"), date
 * ranges ("1939-1945 World War"), and sentinels ("none" — what
 * rreading-glasses returns for a work with no genres).
 *
 * Without a filter, metadataService creates a brand-new `genres` row for every
 * distinct string it sees, with no curation. That is exactly how the books-page
 * genre dropdown ballooned to ~1,600 entries, ~950 of them attached to zero
 * books (cleaned up 2026-06-09). This module is the single chokepoint that keeps
 * the catalog junk out so the dropdown stays meaningful.
 *
 * It is intentionally conservative: it targets the *systematic* junk patterns
 * (commas, embedded years, sentinels, over-long phrases) rather than trying to
 * judge whether a short, plausible-looking name is a "real" genre.
 */

// Exact, case-insensitive sentinels / placeholders that are never genres.
const JUNK_EXACT = new Set([
  '',
  'none',
  'n/a',
  'na',
  'nan',
  'null',
  'undefined',
  'unknown',
  'general',
  'genre',
  'genres',
  'misc',
  'miscellaneous',
  'uncategorized',
  'uncategorised',
]);

// Pure year ("1978") or year range ("1939-1945", "1960 - 1988", en-dash too).
const YEAR_ONLY_RE = /^\d{4}(\s*[-–—]\s*\d{4})?$/;
// Any standalone 4-digit year embedded anywhere ("Civil war, 1861-1865").
const EMBEDDED_YEAR_RE = /\b\d{4}\b/;
// Catalog-heading phrasings that aren't genres.
const HEADING_PHRASE_RE =
  /\b(juvenile literature|juvenile audience|in fiction|in literature|specimens|pictorial works|early works|large type)\b/i;

const MAX_GENRE_LENGTH = 40;
const DEFAULT_MAX_GENRES = 8;

/**
 * Is this string junk rather than a usable genre?
 * @param {unknown} name
 * @returns {boolean}
 */
function isJunkGenre(name) {
  if (typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;

  const lower = trimmed.toLowerCase();
  if (JUNK_EXACT.has(lower)) return true;
  if (trimmed.length > MAX_GENRE_LENGTH) return true;
  if (YEAR_ONLY_RE.test(trimmed)) return true;
  if (EMBEDDED_YEAR_RE.test(trimmed)) return true;
  // Catalog subject-headings are comma-delimited ("African americans, fiction").
  // Real genres effectively never contain a comma.
  if (trimmed.includes(',')) return true;
  if (HEADING_PHRASE_RE.test(trimmed)) return true;

  return false;
}

/**
 * Filter and de-duplicate a list of provider genre strings.
 * Drops junk, collapses whitespace, removes case-insensitive duplicates, and
 * caps the result so a single book can't add a dozen niche tags.
 *
 * @param {unknown} names
 * @param {number} [max=DEFAULT_MAX_GENRES]
 * @returns {string[]}
 */
function filterGenres(names, max = DEFAULT_MAX_GENRES) {
  if (!Array.isArray(names)) return [];
  const seen = new Set();
  const out = [];
  for (const name of names) {
    if (isJunkGenre(name)) continue;
    const clean = name.trim().replace(/\s+/g, ' ');
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

export { isJunkGenre, filterGenres, MAX_GENRE_LENGTH };
