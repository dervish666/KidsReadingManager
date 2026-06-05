/**
 * Book deduplication helpers (pure — no DB access).
 *
 * Used by the owner-only global merge tool (`src/routes/books/duplicates.js`).
 * Detection runs as two SQL passes over the shared global catalogue (books that
 * share a normalised ISBN, and books that share a normalised title+author);
 * these helpers turn the candidate rows into clusters, suggest a canonical
 * "survivor" per cluster, and compute the metadata backfill applied to that
 * survivor on merge.
 *
 * Kept pure so the clustering/heuristics are unit-testable without D1 — the
 * SQL passes are deliberately lenient and `clusterDuplicates` does the precise
 * grouping here (reusing the same `normalizeString` the importer trusts).
 */

import { normalizeString } from './stringMatching.js';

/**
 * Reduce an ISBN to a comparable key: digits only plus a trailing `x`
 * (ISBN-10 check digit), lowercased. Strips hyphens, spaces, and any other
 * formatting so "978-0-14-031647-5" and "9780140316475" collide.
 */
export const normalizeIsbn = (isbn) => {
  if (!isbn) return '';
  return String(isbn)
    .toLowerCase()
    .replace(/[^0-9x]/g, '');
};

/**
 * The two signatures a book can collide on. Empty signatures never match
 * (a book with no title or no ISBN doesn't get grouped on that axis).
 */
export const bookSignatures = (book) => {
  const isbn = normalizeIsbn(book.isbn);
  const title = normalizeString(book.title);
  const author = normalizeString(book.author);
  return {
    isbn: isbn || null,
    titleAuthor: title ? `${title}|${author}` : null,
  };
};

/**
 * Group candidate book rows into duplicate clusters using union-find over two
 * relations: a shared normalised ISBN, and a shared normalised title+author.
 * Transitive overlaps merge (e.g. A shares an ISBN with B, B shares a
 * title+author with C → one cluster {A, B, C}).
 *
 * Returns only clusters with 2+ members. Each cluster is an array of the
 * original row objects, preserving input order (so canonical tie-breaks are
 * deterministic).
 */
export const clusterDuplicates = (books) => {
  const parent = new Map();
  for (const b of books) parent.set(b.id, b.id);

  const find = (x) => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root);
    // Path compression
    while (parent.get(x) !== root) {
      const next = parent.get(x);
      parent.set(x, root);
      x = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const firstByIsbn = new Map();
  const firstByTitleAuthor = new Map();
  for (const b of books) {
    const sig = bookSignatures(b);
    if (sig.isbn) {
      if (firstByIsbn.has(sig.isbn)) union(firstByIsbn.get(sig.isbn), b.id);
      else firstByIsbn.set(sig.isbn, b.id);
    }
    if (sig.titleAuthor) {
      if (firstByTitleAuthor.has(sig.titleAuthor))
        union(firstByTitleAuthor.get(sig.titleAuthor), b.id);
      else firstByTitleAuthor.set(sig.titleAuthor, b.id);
    }
  }

  const groups = new Map();
  for (const b of books) {
    const root = find(b.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(b);
  }
  return [...groups.values()].filter((group) => group.length >= 2);
};

// Snake_case columns we copy onto the survivor when its own value is empty.
export const BACKFILL_FIELDS = [
  'author',
  'description',
  'isbn',
  'page_count',
  'series_name',
  'series_number',
  'publication_year',
  'age_range',
  'reading_level',
  'genre_ids',
];

const isEmptyValue = (field, value) => {
  if (value == null) return true;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return true;
    if (field === 'genre_ids' && trimmed === '[]') return true;
    if (field === 'author' && trimmed.toLowerCase() === 'unknown') return true;
  }
  return false;
};

// Metadata-completeness score; higher = a better survivor. ISBN is weighted
// highest because it anchors covers and future enrichment.
const completeness = (book) => {
  let score = 0;
  if (!isEmptyValue('isbn', book.isbn)) score += 4;
  if (!isEmptyValue('author', book.author)) score += 2;
  if (!isEmptyValue('description', book.description)) score += 2;
  if (!isEmptyValue('genre_ids', book.genre_ids)) score += 1;
  if (book.page_count != null) score += 1;
  if (book.publication_year != null) score += 1;
  if (!isEmptyValue('series_name', book.series_name)) score += 1;
  if (!isEmptyValue('reading_level', book.reading_level)) score += 1;
  if (!isEmptyValue('age_range', book.age_range)) score += 1;
  return score;
};

/**
 * Pick the suggested survivor id for a cluster: most complete metadata, then
 * most reading sessions (most "established"), then oldest (keep the original).
 * `sessionCounts` is a Map of bookId → session count.
 */
export const suggestCanonical = (cluster, sessionCounts = new Map()) => {
  const ranked = [...cluster].sort((a, b) => {
    const byCompleteness = completeness(b) - completeness(a);
    if (byCompleteness) return byCompleteness;
    const bySessions = (sessionCounts.get(b.id) || 0) - (sessionCounts.get(a.id) || 0);
    if (bySessions) return bySessions;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  return ranked[0]?.id ?? null;
};

/**
 * Compute which empty columns on the canonical row should be filled from the
 * duplicates (first non-empty wins, in the given duplicate order). Returns a
 * `{ column: value }` object containing only the columns to update — empty if
 * the survivor already has everything.
 */
export const computeBackfill = (canonical, duplicates) => {
  const updates = {};
  for (const field of BACKFILL_FIELDS) {
    if (!isEmptyValue(field, canonical[field])) continue;
    for (const dup of duplicates) {
      if (!isEmptyValue(field, dup[field])) {
        updates[field] = dup[field];
        break;
      }
    }
  }
  return updates;
};
