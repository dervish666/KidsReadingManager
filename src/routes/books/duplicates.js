/**
 * Owner-only book deduplication for the shared global catalogue.
 *
 * - GET  /api/books/duplicates  — surface duplicate clusters for review
 * - POST /api/books/merge       — merge duplicates into a chosen survivor
 *
 * The `books` table is a single global catalogue shared across all schools
 * (each school sees its books via `org_book_selections`). Merging therefore
 * has a cross-tenant blast radius, so both endpoints are gated to `owner`.
 *
 * Detection is two lenient SQL passes (same normalised ISBN, same lower/trim
 * title+author); the precise grouping + transitive clustering happens in JS
 * via `clusterDuplicates`. (Punctuation/word-order/typo near-duplicates are a
 * planned fuzzy v2 — this v1 covers exact ISBN and exact title+author.)
 *
 * Merge is a repoint-then-delete run in a single atomic `db.batch()`:
 * reading history and current-book pointers are moved to the survivor BEFORE
 * the duplicate is deleted (those FKs are ON DELETE SET NULL, so a naive
 * delete would blank the book off every past session).
 */

import { Hono } from 'hono';
import { requireOwner, auditLog } from '../../middleware/tenant.js';
import { badRequestError, notFoundError } from '../../middleware/errorHandler.js';
import { requireDB } from '../../utils/routeHelpers.js';
import { rowToBook } from '../../utils/rowMappers.js';
import { clusterDuplicates, suggestCanonical, computeBackfill } from '../../utils/bookDedup.js';

export const duplicatesRouter = new Hono();

const MAX_MERGE = 50;

// Lenient SQL keys — JS clusterDuplicates does the precise grouping.
const NORM_ISBN_SQL = "REPLACE(REPLACE(REPLACE(LOWER(isbn), '-', ''), ' ', ''), '_', '')";
const NORM_TA_SQL = "LOWER(TRIM(title)) || '|' || LOWER(TRIM(COALESCE(author, '')))";

// Fetch per-book counts for a column, chunked to stay under SQLite's variable limit.
const fetchCounts = async (db, table, ids) => {
  const counts = new Map();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const placeholders = chunk.map(() => '?').join(',');
    const res = await db
      .prepare(
        `SELECT book_id, COUNT(*) AS c FROM ${table} WHERE book_id IN (${placeholders}) GROUP BY book_id`
      )
      .bind(...chunk)
      .all();
    for (const row of res.results || []) counts.set(row.book_id, row.c);
  }
  return counts;
};

/**
 * GET /api/books/duplicates
 * Returns duplicate clusters across the global catalogue for owner review.
 */
duplicatesRouter.get('/duplicates', requireOwner(), async (c) => {
  const db = requireDB(c.env);

  // Pass 1 — books that share a normalised ISBN.
  const isbnRows = await db
    .prepare(
      `SELECT * FROM (
         SELECT *, ${NORM_ISBN_SQL} AS _k FROM books WHERE isbn IS NOT NULL AND TRIM(isbn) != ''
       ) WHERE _k IN (
         SELECT ${NORM_ISBN_SQL} FROM books
         WHERE isbn IS NOT NULL AND TRIM(isbn) != ''
         GROUP BY ${NORM_ISBN_SQL} HAVING COUNT(*) > 1
       )`
    )
    .all();

  // Pass 2 — books that share a normalised title+author.
  const taRows = await db
    .prepare(
      `SELECT * FROM (
         SELECT *, ${NORM_TA_SQL} AS _k FROM books
       ) WHERE _k IN (
         SELECT ${NORM_TA_SQL} FROM books GROUP BY ${NORM_TA_SQL} HAVING COUNT(*) > 1
       )`
    )
    .all();

  // Union candidates by id.
  const byId = new Map();
  for (const row of [...(isbnRows.results || []), ...(taRows.results || [])]) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  const candidates = [...byId.values()];
  if (candidates.length === 0) {
    return c.json({ clusters: [], totalClusters: 0, totalDuplicateBooks: 0 });
  }

  const ids = candidates.map((b) => b.id);
  const sessionCounts = await fetchCounts(db, 'reading_sessions', ids);
  const schoolCounts = await fetchCounts(db, 'org_book_selections', ids);

  const clusters = clusterDuplicates(candidates).map((group) => ({
    suggestedCanonicalId: suggestCanonical(group, sessionCounts),
    books: group.map((b) => ({
      ...rowToBook(b),
      sessionCount: sessionCounts.get(b.id) || 0,
      schoolCount: schoolCounts.get(b.id) || 0,
    })),
  }));

  // Highest-impact clusters (most reading sessions at stake) first.
  clusters.sort(
    (a, b) =>
      b.books.reduce((n, x) => n + x.sessionCount, 0) -
      a.books.reduce((n, x) => n + x.sessionCount, 0)
  );

  return c.json({
    clusters,
    totalClusters: clusters.length,
    totalDuplicateBooks: clusters.reduce((n, cl) => n + cl.books.length, 0),
  });
});

/**
 * POST /api/books/merge
 * Body: { canonicalId, duplicateIds: [...] }
 * Repoints all references to the survivor, backfills its missing metadata,
 * then deletes the duplicates — atomically.
 */
duplicatesRouter.post('/merge', requireOwner(), auditLog('merge', 'books'), async (c) => {
  const db = requireDB(c.env);
  const body = await c.req.json().catch(() => ({}));

  const canonicalId = typeof body.canonicalId === 'string' ? body.canonicalId : null;
  const duplicateIds = Array.isArray(body.duplicateIds)
    ? [...new Set(body.duplicateIds.filter((x) => typeof x === 'string'))]
    : [];

  if (!canonicalId) throw badRequestError('canonicalId is required');
  if (duplicateIds.length === 0) throw badRequestError('duplicateIds must be a non-empty array');
  if (duplicateIds.includes(canonicalId)) {
    throw badRequestError('canonicalId cannot be one of the duplicateIds');
  }
  if (duplicateIds.length > MAX_MERGE) {
    throw badRequestError(`Cannot merge more than ${MAX_MERGE} books at once`);
  }

  // Verify every book exists before touching anything.
  const allIds = [canonicalId, ...duplicateIds];
  const idPlaceholders = allIds.map(() => '?').join(',');
  const res = await db
    .prepare(`SELECT * FROM books WHERE id IN (${idPlaceholders})`)
    .bind(...allIds)
    .all();
  const rows = res.results || [];
  const canonical = rows.find((r) => r.id === canonicalId);
  if (!canonical) throw notFoundError('Canonical book not found');
  const dupRows = duplicateIds.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
  if (dupRows.length !== duplicateIds.length) {
    throw badRequestError('One or more duplicate books not found');
  }

  const backfill = computeBackfill(canonical, dupRows);
  const backfillCols = Object.keys(backfill);

  const dupPlaceholders = duplicateIds.map(() => '?').join(',');
  const statements = [
    // 1. Repoint reading history + current-book pointers onto the survivor.
    db
      .prepare(`UPDATE reading_sessions SET book_id = ? WHERE book_id IN (${dupPlaceholders})`)
      .bind(canonicalId, ...duplicateIds),
    db
      .prepare(
        `UPDATE students SET current_book_id = ? WHERE current_book_id IN (${dupPlaceholders})`
      )
      .bind(canonicalId, ...duplicateIds),
    // 2. Move per-school links to the survivor. INSERT OR IGNORE + GROUP BY
    //    collapses duplicate links per org and respects UNIQUE(org, book);
    //    a school already linked to the survivor keeps its existing row.
    db
      .prepare(
        `INSERT OR IGNORE INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
         SELECT lower(hex(randomblob(16))), organization_id, ?, MAX(is_available), MIN(created_at)
         FROM org_book_selections WHERE book_id IN (${dupPlaceholders})
         GROUP BY organization_id`
      )
      .bind(canonicalId, ...duplicateIds),
    db
      .prepare(`DELETE FROM org_book_selections WHERE book_id IN (${dupPlaceholders})`)
      .bind(...duplicateIds),
    // 3. Union genre links onto the survivor (PK(book_id, genre_id) dedupes).
    db
      .prepare(
        `INSERT OR IGNORE INTO book_genres (book_id, genre_id)
         SELECT ?, genre_id FROM book_genres WHERE book_id IN (${dupPlaceholders})`
      )
      .bind(canonicalId, ...duplicateIds),
  ];

  // 4. Tidy the enrichment log, then delete the duplicates. Deleting the book
  //    cascades its org_book_selections/book_genres and the AFTER DELETE
  //    trigger cleans the FTS index; sessions/current-book already repointed.
  statements.push(
    db
      .prepare(`DELETE FROM book_metadata_log WHERE book_id IN (${dupPlaceholders})`)
      .bind(...duplicateIds)
  );
  statements.push(
    db.prepare(`DELETE FROM books WHERE id IN (${dupPlaceholders})`).bind(...duplicateIds)
  );

  // 5. Backfill the survivor's empty metadata from the duplicates — AFTER the
  //    duplicates are deleted, so copying a duplicate's ISBN onto the survivor
  //    can't trip the partial UNIQUE(isbn) index while both rows still exist.
  if (backfillCols.length) {
    const setClause = backfillCols.map((col) => `${col} = ?`).join(', ');
    statements.push(
      db
        .prepare(`UPDATE books SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
        .bind(...backfillCols.map((col) => backfill[col]), canonicalId)
    );
  }

  const results = await db.batch(statements);

  return c.json({
    success: true,
    canonicalId,
    booksMerged: duplicateIds.length,
    sessionsRepointed: results[0]?.meta?.changes ?? 0,
    currentBookRepointed: results[1]?.meta?.changes ?? 0,
    backfilledFields: backfillCols,
  });
});
