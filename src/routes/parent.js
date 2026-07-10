/**
 * Parent Portal Routes
 *
 * Public endpoints (token-based auth, no JWT required):
 *   GET  /api/parent/:token          — student view for parents
 *   POST /api/parent/:token/sessions — log a home reading session
 *   GET  /api/parent/:token/books    — search school library + OpenLibrary
 *
 * Teacher-authenticated endpoints (require JWT + teacher role):
 *   POST   /api/parent/generate/:classId        — bulk generate tokens for a class
 *   GET    /api/parent/class/:classId           — list tokens for print view
 *   GET    /api/parent/token/student/:studentId — fetch existing active token (no side effects)
 *   POST   /api/parent/generate/student/:studentId — regenerate token for one student
 *   DELETE /api/parent/tokens/:tokenId          — revoke a token
 */

import { Hono } from 'hono';
import { requireTeacher, rateLimit } from '../middleware/tenant.js';
import { requireDB } from '../utils/routeHelpers.js';
import { generateId, generateToken } from '../utils/helpers.js';
import { notFoundError, badRequestError } from '../middleware/errorHandler.js';
import {
  ensureCurrentBand,
  getOrgBandSettings,
  runSessionSideEffects,
} from './students/_shared.js';
import { getDateString } from '../utils/streakCalculator.js';
import { ACADEMIC_YEAR_START_MONTH } from '../utils/constants.js';
import { bandForCount, bandTransition } from '../utils/readingBandEngine.js';
import { BADGE_DEFINITIONS } from '../utils/badgeDefinitions.js';
import { classNameToYearGroup } from '../utils/yearGroup.js';
import { filterContentSafe } from '../utils/contentModeration.js';
import { computeLibraryRecommendations } from '../utils/libraryRecommendations.js';

export const parentRouter = new Hono();

/**
 * Enrich earned-badge rows with their definitions so the parent payload is
 * self-contained (name/description/icon, no badge_id lookups client-side).
 * Rows for retired badge ids are dropped.
 */
export function enrichEarnedBadges(rows) {
  return (rows || [])
    .map((row) => {
      const def = BADGE_DEFINITIONS.find((b) => b.id === row.badge_id);
      if (!def) return null;
      return {
        badgeId: def.id,
        name: def.name,
        tier: row.tier || def.tier,
        description: def.description,
        icon: def.icon,
        earnedAt: row.earned_at,
      };
    })
    .filter(Boolean);
}

/**
 * Shape a stored AI recommendation snapshot for the parent payload. Pure so it
 * can be unit-tested without a DB (same pattern as decideParentBandCelebration).
 *
 * Returns [] when the student is opted out of AI, the snapshot is missing, or
 * the stored JSON is corrupt. Re-runs content moderation as defence-in-depth —
 * the text was filtered at write time, but a denylist update must never surface
 * stale unfiltered text to a child's parent. Only display fields are exposed
 * (no libraryBookId — the parent view is read-only).
 */
export function shapeParentRecommendations(suggestionsJson, aiOptOut) {
  if (aiOptOut || !suggestionsJson) return [];

  let parsed;
  try {
    parsed = JSON.parse(suggestionsJson);
  } catch {
    return [];
  }

  const { kept } = filterContentSafe(Array.isArray(parsed) ? parsed : []);
  return kept
    .filter((s) => s && s.title)
    .map((s) => {
      // The AI synopsis powers the "What it's about" section. It's separately
      // re-moderated (the outer filterContentSafe only checks title + reason) so
      // a denylist hit blanks only the synopsis, not the whole card.
      const synopsisSafe =
        !s.synopsis || filterContentSafe([{ title: s.title, reason: s.synopsis }]).kept.length > 0;
      return {
        title: s.title,
        author: s.author || '',
        ageRange: s.ageRange || null,
        reason: s.reason || '',
        whereToFind: s.whereToFind || null,
        inLibrary: !!s.inLibrary,
        description: synopsisSafe ? s.synopsis || null : null,
      };
    });
}

/**
 * Decide whether to show a parent the band-up celebration on portal load.
 * marker = parent_last_seen_band (NULL until first view); current = child's band.
 * Returns { bandUp, newSeen } — newSeen is the value to persist (never decreases).
 */
export function decideParentBandCelebration(marker, currentBand, bands) {
  const current = currentBand || 0;
  if (marker === null || marker === undefined) {
    return { bandUp: null, newSeen: current }; // first view: adopt silently
  }
  if (current > marker) {
    return { bandUp: bandTransition(marker, current, bands), newSeen: current };
  }
  return { bandUp: null, newSeen: marker };
}

// ============================================================================
// Helper: calculate current academic year string (e.g. "2025-2026")
// September–August cycle.
// ============================================================================
function currentAcademicYear() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-indexed
  if (month >= ACADEMIC_YEAR_START_MONTH) {
    // September or later → new academic year has started
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

// ============================================================================
// Helper: validate a parent access token
// Returns the token row (joined with student fields) or null.
// ============================================================================
async function validateParentToken(db, token) {
  const row = await db
    .prepare(
      `SELECT pat.id as token_id,
              pat.token,
              pat.student_id,
              pat.organization_id,
              pat.academic_year,
              pat.revoked_at,
              pat.parent_last_seen_band,
              s.is_active as student_active,
              s.processing_restricted,
              COALESCE(s.year_group, c.year_group) as year_group,
              c.name as class_name
         FROM parent_access_tokens pat
         JOIN students s ON s.id = pat.student_id
         LEFT JOIN classes c ON c.id = s.class_id
        WHERE pat.token = ?`
    )
    .bind(token)
    .first();

  if (!row) return null;
  if (row.revoked_at) return null;
  if (!row.student_active) return null;
  if (row.academic_year !== currentAcademicYear()) return null;

  return row;
}

// ============================================================================
// GET /api/parent/:token
// Parent-facing student view — rate limited 60/min
// ============================================================================
parentRouter.get('/:token', rateLimit(60, 60000, 'parent:view'), async (c) => {
  const db = requireDB(c.env);
  const { token } = c.req.param();

  const tokenRow = await validateParentToken(db, token);
  if (!tokenRow) {
    return c.json({ error: 'Invalid or expired access token' }, 404);
  }

  // GDPR Article 18: when processing is restricted, the record may be stored
  // but not otherwise processed (including disclosure). Mirror the POST guard
  // so a restricted student's reading data is not served to the parent view.
  if (tokenRow.processing_restricted) {
    return c.json(
      { error: 'This reading record is temporarily unavailable.', restricted: true },
      403
    );
  }

  const { student_id: studentId, organization_id: organizationId } = tokenRow;

  // Fetch student name + current_book_id + streak fields + band fields
  const student = await db
    .prepare(
      `SELECT id, name, current_book_id, current_streak, last_read_date,
              current_band, band_reads_count, band_year_start
         FROM students
        WHERE id = ? AND organization_id = ? AND is_active = 1`
    )
    .bind(studentId, organizationId)
    .first();

  if (!student) {
    return c.json({ error: 'Student not found' }, 404);
  }

  const studentFirstName = (student.name || '').split(' ')[0];

  // Fetch current book (with cover URL derived from ISBN)
  let currentBook = null;
  if (student.current_book_id) {
    const book = await db
      .prepare('SELECT id, title, author, isbn FROM books WHERE id = ?')
      .bind(student.current_book_id)
      .first();
    if (book) {
      currentBook = {
        id: book.id,
        title: book.title,
        author: book.author,
        coverUrl: book.isbn ? `/api/covers/isbn/${book.isbn}` : null,
      };
    }
  }

  // Streak — determine isActive by comparing streak_last_date to today/yesterday
  const today = getDateString(new Date(), 'UTC');
  const yesterday = getDateString(new Date(Date.now() - 86400000), 'UTC');
  const streakLastDate = student.last_read_date || '';
  const streakIsActive = streakLastDate === today || streakLastDate === yesterday;

  const streak = {
    current: student.current_streak || 0,
    isActive: streakIsActive,
  };

  // Last 30 sessions
  const sessionsResult = await db
    .prepare(
      `SELECT rs.session_date as date,
              COALESCE(b.title, rs.book_title_manual) as bookTitle,
              rs.location
         FROM reading_sessions rs
         LEFT JOIN books b ON rs.book_id = b.id
        WHERE rs.student_id = ?
        ORDER BY rs.session_date DESC
        LIMIT 30`
    )
    .bind(studentId)
    .all();

  const sessions = (sessionsResult.results || []).map((s) => ({
    date: s.date,
    bookTitle: s.bookTitle,
    location: s.location || 'school',
  }));

  // Earned badges (see enrichEarnedBadges above)
  const badgesResult = await db
    .prepare(
      'SELECT badge_id, tier, earned_at FROM student_badges WHERE student_id = ? ORDER BY earned_at DESC'
    )
    .bind(studentId)
    .all();
  const badges = enrichEarnedBadges(badgesResult.results);
  const badgeCount = badges.length;

  // Reading band: lazily reset for the academic year, then decide whether to
  // celebrate a climb the parent hasn't seen yet (e.g. a teacher's logs).
  const { readsPerBand, bands } = await getOrgBandSettings(db, organizationId, c.env || {});
  const { currentBand, bandReadsCount } = await ensureCurrentBand(
    db,
    student,
    organizationId,
    c.env || {}
  );
  const { bandUp, newSeen } = decideParentBandCelebration(
    tokenRow.parent_last_seen_band,
    currentBand,
    bands
  );
  if (newSeen !== tokenRow.parent_last_seen_band) {
    // Best-effort: a failed marker write must not 500 the portal — worst case
    // the same celebration shows again next visit.
    try {
      await db
        .prepare('UPDATE parent_access_tokens SET parent_last_seen_band = ? WHERE id = ?')
        .bind(newSeen, tokenRow.token_id)
        .run();
    } catch (err) {
      console.warn(`[Parent] Could not persist last-seen band for token: ${err.message}`);
    }
  }
  const band = bandForCount(bandReadsCount, readsPerBand, bands);

  c.header('Cache-Control', 'no-store');
  return c.json({
    studentFirstName,
    currentBook,
    streak,
    sessions,
    badgeCount,
    badges,
    band,
    bandUp,
    bands,
  });
});

// ============================================================================
// GET /api/parent/:token/book-ideas
// Book Ideas tab — lazy-loaded when the parent opens it. Returns:
//   • ai:      the latest AI recommendation snapshot (written by teachers via
//              /api/books/ai-suggestions; suppressed when the student is AI
//              opted-out). No AI runs here — snapshot read only.
//   • library: live matches from the school's own catalogue, computed with the
//              same logic as the teacher's library-search. Always fresh, always
//              borrowable, so the tab isn't empty for schools without AI.
// Rate limited 30/min. Both lookups are fail-open — a book-ideas error never
// blocks the parent portal.
// ============================================================================
parentRouter.get('/:token/book-ideas', rateLimit(30, 60000, 'parent:book-ideas'), async (c) => {
  const db = requireDB(c.env);
  const { token } = c.req.param();

  const tokenRow = await validateParentToken(db, token);
  if (!tokenRow) {
    return c.json({ error: 'Invalid or expired access token' }, 404);
  }

  // GDPR Article 18: mirror the main view's restriction guard.
  if (tokenRow.processing_restricted) {
    return c.json(
      { error: 'This reading record is temporarily unavailable.', restricted: true },
      403
    );
  }

  const { student_id: studentId, organization_id: organizationId } = tokenRow;

  const student = await db
    .prepare(
      'SELECT ai_opt_out FROM students WHERE id = ? AND organization_id = ? AND is_active = 1'
    )
    .bind(studentId, organizationId)
    .first();
  if (!student) {
    return c.json({ error: 'Student not found' }, 404);
  }

  // ── AI snapshot (fail-open, opt-out-gated) ──────────────────────────────────
  let ai = [];
  let aiGeneratedAt = null;
  if (!student.ai_opt_out) {
    try {
      const recRow = await db
        .prepare(
          `SELECT suggestions, generated_at
             FROM student_recommendations
            WHERE student_id = ? AND organization_id = ?`
        )
        .bind(studentId, organizationId)
        .first();
      if (recRow?.suggestions) {
        ai = shapeParentRecommendations(recRow.suggestions, student.ai_opt_out);
        aiGeneratedAt = ai.length ? recRow.generated_at || null : null;
      }
    } catch (err) {
      console.warn('[parent/book-ideas] AI snapshot lookup failed', {
        studentId,
        error: err.message,
      });
    }
  }

  // ── Live library matches (fail-open). Deterministic catalogue query — no AI —
  //    so shown regardless of ai_opt_out. Re-moderated as defence-in-depth and
  //    all borrowable (inLibrary: true).
  //
  //    KV-cached per student (PERF-M3): the computation is deterministic per
  //    (student, catalogue, read-set), so recomputing ~6 D1 queries on every
  //    tab open was pure waste. Cached UN-deduped and shaped; the AI-title
  //    dedupe runs at serve time so a teacher regenerating AI recs doesn't
  //    serve stale dedupe. Invalidated on session write (runSessionSideEffects)
  //    + a TTL backstop for catalogue changes. ────────────────────────────────
  let libraryAll = null;
  const kv = c.env.RECOMMENDATIONS_CACHE;
  const cacheKey = `parentLibRecs:v1:${studentId}`;
  if (kv) {
    try {
      libraryAll = await kv.get(cacheKey, 'json');
    } catch {
      // cache miss path below covers it
    }
  }

  if (!Array.isArray(libraryAll)) {
    libraryAll = [];
    try {
      const result = await computeLibraryRecommendations(db, {
        studentId,
        organizationId,
        limit: 8,
      });
      if (result?.books?.length) {
        const shaped = result.books
          .filter((b) => b.title)
          .map((b) => {
            // The catalogue description is external-sourced metadata — re-moderate
            // it (defence-in-depth) before showing it on a child's parent view.
            // A denylist hit blanks only the description; the rest of the card stays.
            const descSafe =
              !b.description ||
              filterContentSafe([{ title: b.title, reason: b.description }]).kept.length > 0;
            return {
              bookId: b.id,
              title: b.title,
              author: b.author || '',
              ageRange: b.ageRange || null,
              reason: b.matchReason || '', // why it was recommended
              description: descSafe ? b.description || '' : '', // what it's about
              genres: b.genres || [],
              pageCount: b.pageCount || null,
              seriesName: b.seriesName || null,
              seriesNumber: b.seriesNumber || null,
              publicationYear: b.publicationYear || null,
              isbn: b.isbn || null,
              inLibrary: true,
            };
          });
        libraryAll = filterContentSafe(shaped).kept;
        if (kv) {
          c.executionCtx?.waitUntil?.(
            kv
              .put(cacheKey, JSON.stringify(libraryAll), { expirationTtl: 6 * 60 * 60 })
              .catch((err) => console.warn('[parent/book-ideas] cache write failed', err.message))
          );
        }
      }
    } catch (err) {
      console.warn('[parent/book-ideas] library lookup failed', {
        studentId,
        error: err.message,
      });
    }
  }

  // Dedupe on title+author, not title alone — two different books can share
  // a title, and title-only matching dropped the borrowable library copy.
  // (AI suggestions carry no catalogue id to key on.)
  const aiKeys = new Set(
    ai.map((r) => `${(r.title || '').toLowerCase()}|${(r.author || '').toLowerCase()}`)
  );
  const library = libraryAll.filter(
    (b) => !aiKeys.has(`${b.title.toLowerCase()}|${(b.author || '').toLowerCase()}`)
  );

  c.header('Cache-Control', 'no-store');
  return c.json({ ai, aiGeneratedAt, library });
});

// ============================================================================
// POST /api/parent/:token/sessions
// Log a home reading session — rate limited 10/min
// ============================================================================
parentRouter.post('/:token/sessions', rateLimit(10, 60000, 'parent:sessions'), async (c) => {
  const db = requireDB(c.env);
  const { token } = c.req.param();

  const tokenRow = await validateParentToken(db, token);
  if (!tokenRow) {
    return c.json({ error: 'Invalid or expired access token' }, 404);
  }

  const { student_id: studentId, organization_id: organizationId } = tokenRow;

  // GDPR Article 18: block restricted students
  if (tokenRow.processing_restricted) {
    return c.json(
      { error: 'Processing is restricted for this student. No new sessions can be recorded.' },
      403
    );
  }

  const body = await c.req.json();
  const { sessionDate, bookId, bookTitleManual, bookAuthorManual } = body || {};

  // Validate date format and not-future
  if (!sessionDate || !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    throw badRequestError('sessionDate must be in YYYY-MM-DD format');
  }
  const today = getDateString(new Date(), 'UTC');
  if (sessionDate > today) {
    throw badRequestError('sessionDate cannot be in the future');
  }

  // Duplicate guard: one HOME session per student per date
  const existing = await db
    .prepare(
      `SELECT id FROM reading_sessions
        WHERE student_id = ? AND session_date = ? AND location = 'home'`
    )
    .bind(studentId, sessionDate)
    .first();
  if (existing) {
    return c.json(
      { error: `Already logged a home reading session for ${sessionDate}`, duplicate: true },
      409
    );
  }

  // Verify library book is in org's selections (if provided)
  if (bookId) {
    const sel = await db
      .prepare(
        'SELECT 1 FROM org_book_selections WHERE book_id = ? AND organization_id = ? AND is_available = 1'
      )
      .bind(bookId, organizationId)
      .first();
    if (!sel) {
      throw badRequestError("Book not found in this organisation's library");
    }
  }

  const bookTitleTruncated = bookTitleManual ? bookTitleManual.slice(0, 500) : null;
  const sessionId = generateId();

  // Core writes — batched atomically
  const coreWrites = [
    db
      .prepare(
        `INSERT INTO reading_sessions
           (id, student_id, session_date, book_id, book_title_manual, book_author_manual,
            location, recorded_by, read_source)
         VALUES (?, ?, ?, ?, ?, ?, 'home', NULL, 'parent')`
      )
      .bind(
        sessionId,
        studentId,
        sessionDate,
        bookId || null,
        bookTitleTruncated,
        bookAuthorManual || null
      ),
  ];

  if (bookId) {
    coreWrites.push(
      db
        .prepare(
          `UPDATE students SET current_book_id = ?, updated_at = datetime('now')
            WHERE id = ? AND organization_id = ?`
        )
        .bind(bookId, studentId, organizationId)
    );
  }

  // NOTE: do NOT update students.last_read_date here. That column tracks
  // *school* reading only (v3.64.3) and drives the teacher "needs attention"
  // view; advancing it for a home session logged by a parent would wrongly
  // show the child as having read at school. The current_streak below still
  // reflects home reading via updateStudentStreak.

  await db.batch(coreWrites);

  // Side-effects: shared best-effort chain (see runSessionSideEffects in
  // students/_shared.js — single source of truth with the teacher route).
  const { streakData, newBadges } = await runSessionSideEffects(db, c.env, {
    studentId,
    organizationId,
    yearGroup: tokenRow.year_group || classNameToYearGroup(tokenRow.class_name),
    isMarkerSession: false, // parents can only log real home reads
    newSessions: [{ id: sessionId, date: sessionDate, bookId: bookId || null, isMarker: false }],
    logPrefix: 'parent/sessions',
    logContext: { sessionId },
  });
  const updatedStreak = streakData ? { current: streakData.currentStreak } : null;

  // Fetch the inserted session to build the response
  const session = await db
    .prepare(
      `SELECT rs.*, b.title as book_title
         FROM reading_sessions rs
         LEFT JOIN books b ON rs.book_id = b.id
        WHERE rs.id = ?`
    )
    .bind(sessionId)
    .first();

  return c.json(
    {
      id: session.id,
      date: session.session_date,
      bookTitle: session.book_title || session.book_title_manual,
      bookId: session.book_id,
      location: 'home',
      streak: updatedStreak,
      newBadges,
    },
    201
  );
});

// ============================================================================
// GET /api/parent/:token/books?q=...
// Book search — library + OpenLibrary — rate limited 30/min
// ============================================================================
parentRouter.get('/:token/books', rateLimit(30, 60000, 'parent:books'), async (c) => {
  const db = requireDB(c.env);
  const { token } = c.req.param();

  const tokenRow = await validateParentToken(db, token);
  if (!tokenRow) {
    return c.json({ error: 'Invalid or expired access token' }, 404);
  }

  const { organization_id: organizationId } = tokenRow;
  const q = (c.req.query('q') || '').trim();

  if (q.length < 2) {
    throw badRequestError('Search query must be at least 2 characters');
  }

  // ── Library search (ISBN exact-match, then FTS5 with LIKE fallback) ──────
  const isbnCandidate = q.replace(/[-\s]/g, '');
  const looksLikeIsbn = /^\d{10}(\d{3})?$/.test(isbnCandidate) || /^\d{9}[Xx]$/.test(isbnCandidate);

  let libraryResults;

  if (looksLikeIsbn) {
    const result = await db
      .prepare(
        `SELECT b.id, b.title, b.author, b.isbn
           FROM books b
           INNER JOIN org_book_selections obs ON b.id = obs.book_id
          WHERE obs.organization_id = ? AND obs.is_available = 1 AND b.isbn = ?
          LIMIT 1`
      )
      .bind(organizationId, isbnCandidate)
      .all();
    libraryResults = result.results || [];
  }

  if (!looksLikeIsbn || libraryResults.length === 0) {
    const ftsQuery = q
      .replace(/['"*()^]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `"${t}"*`)
      .join(' ');

    try {
      const result = await db
        .prepare(
          `SELECT b.id, b.title, b.author, b.isbn
             FROM books b
             INNER JOIN org_book_selections obs ON b.id = obs.book_id
             INNER JOIN books_fts ON b.id = books_fts.id
            WHERE obs.organization_id = ? AND obs.is_available = 1 AND books_fts MATCH ?
            ORDER BY rank LIMIT 10`
        )
        .bind(organizationId, ftsQuery)
        .all();
      libraryResults = result.results || [];
    } catch {
      const likeQuery = `%${q}%`;
      const result = await db
        .prepare(
          `SELECT b.id, b.title, b.author, b.isbn
             FROM books b
             INNER JOIN org_book_selections obs ON b.id = obs.book_id
            WHERE obs.organization_id = ? AND obs.is_available = 1
              AND (b.title LIKE ? OR b.author LIKE ?)
            ORDER BY b.title LIMIT 10`
        )
        .bind(organizationId, likeQuery, likeQuery)
        .all();
      libraryResults = result.results || [];
    }
  }

  const library = libraryResults.map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    coverUrl: b.isbn ? `/api/covers/isbn/${b.isbn}` : null,
    source: 'library',
  }));

  // ── OpenLibrary external search (KV-cached 24h — parents repeat the same
  //    title searches, and each uncached query is a 5s external fetch) ───────
  let external = [];
  const KV = c.env?.READING_MANAGER_KV;
  const olCacheKey = `ol:psearch:${q.toLowerCase().slice(0, 80)}`;
  if (KV) {
    try {
      const cached = await KV.get(olCacheKey);
      if (cached) external = JSON.parse(cached);
    } catch {
      /* cache miss/parse failure — fall through to live fetch */
    }
  }
  if (external.length === 0) {
    try {
      const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5&fields=title,author_name,first_publish_year,cover_i`;
      const resp = await fetch(olUrl, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const data = await resp.json();
        external = (data.docs || []).map((doc) => ({
          title: doc.title || '',
          author: (doc.author_name || [])[0] || '',
          coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
          source: 'external',
        }));
        // Only cache non-empty results so transient failures don't stick
        if (KV && external.length > 0) {
          try {
            await KV.put(olCacheKey, JSON.stringify(external), { expirationTtl: 86400 });
          } catch {
            /* non-critical */
          }
        }
      }
    } catch (err) {
      console.warn('[parent/books] OpenLibrary search failed', err.message);
    }
  }

  return c.json({ library, external });
});

// ============================================================================
// POST /api/parent/generate/:classId
// Bulk-generate tokens for all students in a class without active tokens
// ============================================================================
parentRouter.post('/generate/:classId', requireTeacher(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const { classId } = c.req.param();

  // Verify class belongs to org
  const cls = await db
    .prepare('SELECT id FROM classes WHERE id = ? AND organization_id = ?')
    .bind(classId, organizationId)
    .first();
  if (!cls) {
    throw notFoundError('Class not found');
  }

  const academicYear = currentAcademicYear();

  // Students in class without an active token for this year
  const studentsResult = await db
    .prepare(
      `SELECT s.id
         FROM students s
        WHERE s.class_id = ? AND s.organization_id = ? AND s.is_active = 1
          AND s.id NOT IN (
            SELECT student_id FROM parent_access_tokens
             WHERE organization_id = ? AND academic_year = ? AND revoked_at IS NULL
          )`
    )
    .bind(classId, organizationId, organizationId, academicYear)
    .all();

  const students = studentsResult.results || [];
  if (students.length === 0) {
    return c.json({ generated: 0 });
  }

  // Build insert statements and chunk to respect D1's 100-statement limit
  const userId = c.get('userId');
  const inserts = students.map((s) =>
    db
      .prepare(
        `INSERT INTO parent_access_tokens (id, token, student_id, organization_id, academic_year, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(generateId(), generateToken(), s.id, organizationId, academicYear, userId)
  );

  const chunkSize = 50;
  for (let i = 0; i < inserts.length; i += chunkSize) {
    await db.batch(inserts.slice(i, i + chunkSize));
  }

  return c.json({ generated: students.length });
});

// ============================================================================
// GET /api/parent/class/:classId
// List active tokens for a class (for print view)
// ============================================================================
parentRouter.get('/class/:classId', requireTeacher(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const { classId } = c.req.param();

  const cls = await db
    .prepare('SELECT id FROM classes WHERE id = ? AND organization_id = ?')
    .bind(classId, organizationId)
    .first();
  if (!cls) {
    throw notFoundError('Class not found');
  }

  const academicYear = currentAcademicYear();

  const result = await db
    .prepare(
      `SELECT pat.id as tokenId,
              pat.token,
              pat.student_id as studentId,
              s.name as studentName,
              pat.created_at as createdAt
         FROM parent_access_tokens pat
         JOIN students s ON s.id = pat.student_id
        WHERE s.class_id = ? AND pat.organization_id = ?
          AND pat.academic_year = ? AND pat.revoked_at IS NULL
        ORDER BY s.name ASC`
    )
    .bind(classId, organizationId, academicYear)
    .all();

  const tokens = (result.results || []).map((row) => ({
    tokenId: row.tokenId,
    token: row.token,
    studentId: row.studentId,
    studentFirstName: (row.studentName || '').split(' ')[0],
    createdAt: row.createdAt,
  }));

  return c.json({ tokens, academicYear });
});

// ============================================================================
// GET /api/parent/token/student/:studentId
// Fetch existing active token for a student (does NOT create one)
// ============================================================================
parentRouter.get('/token/student/:studentId', requireTeacher(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const { studentId } = c.req.param();

  const academicYear = currentAcademicYear();

  const row = await db
    .prepare(
      `SELECT id as tokenId, token
         FROM parent_access_tokens
        WHERE student_id = ? AND organization_id = ? AND academic_year = ? AND revoked_at IS NULL`
    )
    .bind(studentId, organizationId, academicYear)
    .first();

  if (!row) {
    return c.json({ tokenId: null, token: null });
  }

  return c.json({ tokenId: row.tokenId, token: row.token });
});

// ============================================================================
// POST /api/parent/generate/student/:studentId
// Regenerate token for a single student
// ============================================================================
parentRouter.post('/generate/student/:studentId', requireTeacher(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const { studentId } = c.req.param();

  // Verify student belongs to org
  const student = await db
    .prepare('SELECT id FROM students WHERE id = ? AND organization_id = ? AND is_active = 1')
    .bind(studentId, organizationId)
    .first();
  if (!student) {
    throw notFoundError('Student not found');
  }

  const academicYear = currentAcademicYear();

  // Revoke any existing active token for this student + year
  await db
    .prepare(
      `UPDATE parent_access_tokens
          SET revoked_at = datetime('now')
        WHERE student_id = ? AND organization_id = ? AND academic_year = ? AND revoked_at IS NULL`
    )
    .bind(studentId, organizationId, academicYear)
    .run();

  // Insert new token
  const tokenId = generateId();
  const token = generateToken();

  const userId = c.get('userId');
  await db
    .prepare(
      `INSERT INTO parent_access_tokens (id, token, student_id, organization_id, academic_year, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(tokenId, token, studentId, organizationId, academicYear, userId)
    .run();

  return c.json({ tokenId, token });
});

// ============================================================================
// DELETE /api/parent/tokens/:tokenId
// Revoke a parent access token
// ============================================================================
parentRouter.delete('/tokens/:tokenId', requireTeacher(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const { tokenId } = c.req.param();

  const tokenRow = await db
    .prepare('SELECT id FROM parent_access_tokens WHERE id = ? AND organization_id = ?')
    .bind(tokenId, organizationId)
    .first();
  if (!tokenRow) {
    throw notFoundError('Token not found');
  }

  await db
    .prepare(`UPDATE parent_access_tokens SET revoked_at = datetime('now') WHERE id = ?`)
    .bind(tokenId)
    .run();

  return c.json({ revoked: true });
});
