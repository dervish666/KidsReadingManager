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
 *   POST   /api/parent/generate/student/:studentId — regenerate token for one student
 *   DELETE /api/parent/tokens/:tokenId          — revoke a token
 */

import { Hono } from 'hono';
import { requireTeacher, rateLimit } from '../middleware/tenant.js';
import { requireDB } from '../utils/routeHelpers.js';
import { generateId, generateToken } from '../utils/helpers.js';
import { notFoundError, badRequestError } from '../middleware/errorHandler.js';
import { updateStudentStreak } from './students/_shared.js';
import { getDateString } from '../utils/streakCalculator.js';
import { recalculateStats, evaluateRealTime } from '../utils/badgeEngine.js';
import { updateClassGoalOnSession } from '../utils/classGoalsEngine.js';

export const parentRouter = new Hono();

// ============================================================================
// Helper: calculate current academic year string (e.g. "2025-2026")
// September–August cycle.
// ============================================================================
function currentAcademicYear() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed; September = 8
  if (month >= 8) {
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
              s.is_active as student_active,
              s.processing_restricted,
              s.year_group
         FROM parent_access_tokens pat
         JOIN students s ON s.id = pat.student_id
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
parentRouter.get('/:token', rateLimit(60, 60000), async (c) => {
  const db = requireDB(c.env);
  const { token } = c.req.param();

  const tokenRow = await validateParentToken(db, token);
  if (!tokenRow) {
    return c.json({ error: 'Invalid or expired access token' }, 404);
  }

  const { student_id: studentId, organization_id: organizationId } = tokenRow;

  // Fetch student name + current_book_id + streak fields
  const student = await db
    .prepare(
      `SELECT id, name, current_book_id, current_streak, last_read_date
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

  // Badge count
  const badgeCountRow = await db
    .prepare('SELECT COUNT(*) as count FROM student_badges WHERE student_id = ?')
    .bind(studentId)
    .first();
  const badgeCount = badgeCountRow?.count || 0;

  c.header('Cache-Control', 'private, max-age=60, must-revalidate');
  return c.json({
    studentFirstName,
    currentBook,
    streak,
    sessions,
    badgeCount,
  });
});

// ============================================================================
// POST /api/parent/:token/sessions
// Log a home reading session — rate limited 10/min
// ============================================================================
parentRouter.post('/:token/sessions', rateLimit(10, 60000), async (c) => {
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
            location, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, 'home', NULL)`
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

  // Always update last_read_date for home sessions
  coreWrites.push(
    db
      .prepare(
        `UPDATE students
            SET last_read_date = MAX(COALESCE(last_read_date, ''), ?),
                updated_at = datetime('now')
          WHERE id = ? AND organization_id = ?`
      )
      .bind(sessionDate, studentId, organizationId)
  );

  await db.batch(coreWrites);

  // Side-effects: best-effort — a failure here must not lose the committed session
  let updatedStreak = null;
  try {
    const streakData = await updateStudentStreak(db, studentId, organizationId, c.env);
    updatedStreak = { current: streakData.currentStreak };
  } catch (err) {
    console.error('[parent/sessions] streak update failed', { sessionId, studentId, err });
  }

  try {
    await recalculateStats(db, studentId, organizationId);
  } catch (err) {
    console.error('[parent/sessions] stats recalc failed', { sessionId, studentId, err });
  }

  let newBadges = [];
  try {
    newBadges = await evaluateRealTime(db, studentId, organizationId, tokenRow.year_group);
  } catch (err) {
    console.error('[parent/sessions] badge evaluation failed', { sessionId, studentId, err });
  }

  try {
    await updateClassGoalOnSession(db, studentId, organizationId);
  } catch (err) {
    console.error('[parent/sessions] class goal update failed', { sessionId, studentId, err });
  }

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
parentRouter.get('/:token/books', rateLimit(30, 60000), async (c) => {
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

  // ── Library search (FTS5 with LIKE fallback) ──────────────────────────────
  const ftsQuery = q
    .replace(/['"*()^]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t}"*`)
    .join(' ');

  let libraryResults;
  try {
    const result = await db
      .prepare(
        `SELECT b.id, b.title, b.author, b.isbn
           FROM books b
           INNER JOIN org_book_selections obs ON b.id = obs.book_id
           INNER JOIN books_fts fts ON b.id = fts.id
          WHERE obs.organization_id = ? AND obs.is_available = 1 AND fts MATCH ?
          ORDER BY rank LIMIT 10`
      )
      .bind(organizationId, ftsQuery)
      .all();
    libraryResults = result.results || [];
  } catch {
    // FTS5 unavailable or malformed query — fall back to LIKE
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

  const library = libraryResults.map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    coverUrl: b.isbn ? `/api/covers/isbn/${b.isbn}` : null,
    source: 'library',
  }));

  // ── OpenLibrary external search ───────────────────────────────────────────
  let external = [];
  try {
    const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5&fields=title,author_name,first_publish_year,cover_i`;
    const resp = await fetch(olUrl, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      external = (data.docs || []).map((doc) => ({
        title: doc.title || '',
        author: (doc.author_name || [])[0] || '',
        coverUrl: doc.cover_i
          ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
          : null,
        source: 'external',
      }));
    }
  } catch (err) {
    console.warn('[parent/books] OpenLibrary search failed', err.message);
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
    .prepare(
      'SELECT id FROM parent_access_tokens WHERE id = ? AND organization_id = ?'
    )
    .bind(tokenId, organizationId)
    .first();
  if (!tokenRow) {
    throw notFoundError('Token not found');
  }

  await db
    .prepare(
      `UPDATE parent_access_tokens SET revoked_at = datetime('now') WHERE id = ?`
    )
    .bind(tokenId)
    .run();

  return c.json({ revoked: true });
});
