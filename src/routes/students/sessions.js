/**
 * Reading-session routes for a single student.
 *
 *   GET    /sessions                      — class-scoped sessions in a date range
 *   GET    /:id/sessions                  — single student's recent sessions (paged)
 *   POST   /:id/sessions                  — create a session (hot path; batched)
 *   DELETE /:id/sessions/:sessionId
 *   PUT    /:id/sessions/:sessionId
 *
 * The POST handler is the busiest write path in the app. The session row
 * plus the student's `current_book_id` / `last_read_date` updates are
 * batched atomically. Streak / stats / badge / class-goal recomputation
 * are best-effort: each runs in its own try/catch so one bad evaluator
 * can't lose the session that just committed.
 */

import { Hono } from 'hono';
import { generateId } from '../../utils/helpers.js';
import { getDateString } from '../../utils/streakCalculator.js';
import { validateSessionInput } from '../../utils/validation.js';
import { notFoundError, badRequestError } from '../../middleware/errorHandler.js';
import { requireReadonly, requireTeacher, auditLog } from '../../middleware/tenant.js';
import { getDB, isMultiTenantMode, requireStudent } from '../../utils/routeHelpers.js';
import { recalculateStats, evaluateRealTime } from '../../utils/badgeEngine.js';
import { updateClassGoalOnSession } from '../../utils/classGoalsEngine.js';
import {
  getStudentById as getStudentByIdKV,
  saveStudent as saveStudentKV,
} from '../../services/kvService.js';
import { getOrgStreakSettings, updateStudentStreak } from './_shared.js';

const sessionsRouter = new Hono();

sessionsRouter.get('/sessions', requireReadonly(), async (c) => {
  if (!isMultiTenantMode(c)) {
    return c.json([]);
  }
  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const { classId, startDate, endDate } = c.req.query();

  if (!classId || !startDate || !endDate) {
    throw badRequestError('classId, startDate, and endDate are required');
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (
    !dateRegex.test(startDate) ||
    !dateRegex.test(endDate) ||
    isNaN(Date.parse(startDate)) ||
    isNaN(Date.parse(endDate))
  ) {
    throw badRequestError('startDate and endDate must be valid YYYY-MM-DD format');
  }

  let classClause;
  let binds;
  if (classId === 'all') {
    classClause = '';
    binds = [organizationId, startDate, endDate];
  } else if (classId === 'unassigned') {
    classClause = ' AND s.class_id IS NULL';
    binds = [organizationId, startDate, endDate];
  } else {
    classClause = ' AND s.class_id = ?';
    binds = [organizationId, classId, startDate, endDate];
  }

  const result = await db
    .prepare(
      `SELECT rs.*, s.name as student_name,
              b.title as book_title, b.author as book_author
       FROM reading_sessions rs
       INNER JOIN students s ON rs.student_id = s.id
       LEFT JOIN books b ON rs.book_id = b.id
       WHERE s.organization_id = ?${classClause} AND s.is_active = 1
         AND rs.session_date >= ? AND rs.session_date <= ?
       ORDER BY rs.session_date DESC`
    )
    .bind(...binds)
    .all();

  const sessions = (result.results || []).map((s) => ({
    id: s.id,
    studentId: s.student_id,
    date: s.session_date,
    bookId: s.book_id,
    bookTitle: s.book_title || s.book_title_manual,
    bookAuthor: s.book_author || s.book_author_manual,
    pagesRead: s.pages_read,
    duration: s.duration_minutes,
    assessment: s.assessment,
    notes: s.notes,
    location: s.location || 'school',
    recordedBy: s.recorded_by,
    studentName: s.student_name,
  }));

  return c.json(sessions);
});

sessionsRouter.get('/:id/sessions', requireReadonly(), async (c) => {
  const { id } = c.req.param();

  if (!isMultiTenantMode(c)) {
    return c.json([]);
  }
  const db = getDB(c.env);
  const organizationId = c.get('organizationId');

  const student = await db
    .prepare('SELECT id FROM students WHERE id = ? AND organization_id = ? AND is_active = 1')
    .bind(id, organizationId)
    .first();

  if (!student) {
    throw notFoundError('Student not found');
  }

  const limitParam = c.req.query('limit');
  const limitValue = limitParam
    ? Math.max(1, Math.min(parseInt(limitParam, 10) || 1000, 1000))
    : 1000;

  const result = await db
    .prepare(
      `SELECT rs.*, b.title as book_title, b.author as book_author
       FROM reading_sessions rs
       LEFT JOIN books b ON rs.book_id = b.id
       WHERE rs.student_id = ?
       ORDER BY rs.session_date DESC
       LIMIT ?`
    )
    .bind(id, limitValue)
    .all();

  const sessions = (result.results || []).map((s) => ({
    id: s.id,
    studentId: s.student_id,
    date: s.session_date,
    bookId: s.book_id,
    bookTitle: s.book_title || s.book_title_manual,
    bookAuthor: s.book_author || s.book_author_manual,
    pagesRead: s.pages_read,
    duration: s.duration_minutes,
    assessment: s.assessment,
    notes: s.notes,
    location: s.location || 'school',
    recordedBy: s.recorded_by,
  }));

  return c.json(sessions);
});

sessionsRouter.post('/:id/sessions', requireTeacher(), auditLog('create', 'session'), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const sessionValidation = validateSessionInput(body);
  if (!sessionValidation.isValid) {
    throw badRequestError(sessionValidation.error);
  }
  Object.assign(body, sessionValidation.data);

  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');

    const { timezone } = await getOrgStreakSettings(db, organizationId, c.env || {});
    const sessionDate = body.date || getDateString(new Date(), timezone);

    const student = await db
      .prepare(
        `SELECT id, processing_restricted, year_group FROM students WHERE id = ? AND organization_id = ? AND is_active = 1`
      )
      .bind(id, organizationId)
      .first();

    if (!student) {
      throw notFoundError('Student not found');
    }

    // GDPR Article 18: blocked students cannot record new sessions
    if (student.processing_restricted) {
      return c.json(
        {
          error: 'Processing is restricted for this student. No new sessions can be recorded.',
        },
        403
      );
    }

    if (body.bookId) {
      const bookSelection = await db
        .prepare(
          'SELECT 1 FROM org_book_selections WHERE book_id = ? AND organization_id = ? AND is_available = 1'
        )
        .bind(body.bookId, organizationId)
        .first();
      if (!bookSelection) {
        throw badRequestError("Book not found in this organization's library");
      }
    }

    const sessionId = generateId();
    const isMarkerSession =
      body.notes && (body.notes.includes('[ABSENT]') || body.notes.includes('[NO_RECORD]'));

    // Core writes batched atomically: the session row plus the two summary
    // updates on the student. Either all commit or none do, which means
    // the register and student card can't disagree about whether this
    // session happened. Side-effects (streak/stats/badges/goals) run
    // afterwards and are allowed to fail without rolling back the session
    // — the nightly cron reconciles them.
    const coreWrites = [
      db
        .prepare(
          `INSERT INTO reading_sessions (
               id, student_id, session_date, book_id, book_title_manual, book_author_manual,
               pages_read, duration_minutes, assessment, notes, location, recorded_by
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          sessionId,
          id,
          sessionDate,
          body.bookId || null,
          body.bookTitle || null,
          body.bookAuthor || null,
          body.pagesRead ?? null,
          body.duration ?? null,
          body.assessment ?? null,
          body.notes ?? null,
          body.location || 'school',
          userId
        ),
    ];

    if (body.bookId) {
      coreWrites.push(
        db
          .prepare(
            `UPDATE students SET current_book_id = ?, updated_at = datetime("now")
               WHERE id = ? AND organization_id = ?`
          )
          .bind(body.bookId, id, organizationId)
      );
    }

    if (!isMarkerSession) {
      coreWrites.push(
        db
          .prepare(
            `UPDATE students SET last_read_date = MAX(COALESCE(last_read_date, ''), ?), updated_at = datetime("now")
               WHERE id = ? AND organization_id = ?`
          )
          .bind(sessionDate, id, organizationId)
      );
    }

    await db.batch(coreWrites);

    // Side-effects: best-effort. A streak/stats/badge/goal failure must
    // not lose the session that just committed. Each runs in its own
    // try/catch so one bad evaluator doesn't skip the others.
    try {
      await updateStudentStreak(db, id, organizationId, c.env);
    } catch (err) {
      console.error('[sessions] streak update failed', { sessionId, studentId: id, err });
    }

    try {
      await recalculateStats(db, id, organizationId);
    } catch (err) {
      console.error('[sessions] stats recalc failed', { sessionId, studentId: id, err });
    }

    let newBadges = [];
    if (!isMarkerSession) {
      try {
        newBadges = await evaluateRealTime(db, id, organizationId, student.year_group);
      } catch (err) {
        console.error('[sessions] badge evaluation failed', {
          sessionId,
          studentId: id,
          err,
        });
      }
    }

    let completedGoals = [];
    if (!isMarkerSession) {
      try {
        completedGoals = await updateClassGoalOnSession(db, id, organizationId);
      } catch (err) {
        console.error('[sessions] class goal update failed', {
          sessionId,
          studentId: id,
          err,
        });
      }
    }

    const session = await db
      .prepare(
        `SELECT rs.*, b.title as book_title, b.author as book_author
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
        bookAuthor: session.book_author || session.book_author_manual,
        bookId: session.book_id,
        pagesRead: session.pages_read,
        duration: session.duration_minutes,
        assessment: session.assessment,
        notes: session.notes,
        location: session.location || 'school',
        recordedBy: session.recorded_by,
        newBadges,
        completedGoals,
      },
      201
    );
  }

  // Legacy KV path
  const student = await getStudentByIdKV(c.env, id);
  if (!student) {
    throw notFoundError('Student not found');
  }

  const newSession = {
    id: generateId(),
    date: body.date || new Date().toLocaleDateString('en-CA'),
    bookTitle: body.bookTitle,
    bookAuthor: body.bookAuthor,
    bookId: body.bookId,
    pagesRead: body.pagesRead,
    duration: body.duration,
    assessment: body.assessment,
    notes: body.notes,
    location: body.location || 'school',
  };

  student.readingSessions = student.readingSessions || [];
  student.readingSessions.unshift(newSession);
  student.lastReadDate = newSession.date;

  await saveStudentKV(c.env, student);

  return c.json(newSession, 201);
});

sessionsRouter.delete(
  '/:id/sessions/:sessionId',
  requireTeacher(),
  auditLog('delete', 'session'),
  async (c) => {
    const { id, sessionId } = c.req.param();

    if (isMultiTenantMode(c)) {
      const db = getDB(c.env);
      const organizationId = c.get('organizationId');

      await requireStudent(db, id, organizationId);

      const session = await db
        .prepare(`SELECT id FROM reading_sessions WHERE id = ? AND student_id = ?`)
        .bind(sessionId, id)
        .first();

      if (!session) {
        throw notFoundError(`Session with ID ${sessionId} not found`);
      }

      await db.prepare(`DELETE FROM reading_sessions WHERE id = ?`).bind(sessionId).run();

      // Streak / stats / class goals must reflect the deletion. Badges are
      // not revoked on delete — earning a badge is a one-way transition.
      await updateStudentStreak(db, id, organizationId, c.env);
      await recalculateStats(db, id, organizationId);
      await updateClassGoalOnSession(db, id, organizationId);

      // Recompute last_read_date from the remaining real sessions
      await db
        .prepare(
          `UPDATE students SET last_read_date = (
             SELECT MAX(session_date) FROM reading_sessions WHERE student_id = ?
               AND (notes IS NULL OR (notes NOT LIKE '%[ABSENT]%' AND notes NOT LIKE '%[NO_RECORD]%'))
           ), updated_at = datetime("now") WHERE id = ? AND organization_id = ?`
        )
        .bind(id, id, organizationId)
        .run();

      return c.json({ message: 'Session deleted successfully' });
    }

    const student = await getStudentByIdKV(c.env, id);
    if (!student) {
      throw notFoundError('Student not found');
    }

    const sessionIndex = student.readingSessions?.findIndex((s) => s.id === sessionId);
    if (sessionIndex === -1 || sessionIndex === undefined) {
      throw notFoundError(`Session with ID ${sessionId} not found`);
    }

    student.readingSessions.splice(sessionIndex, 1);

    if (student.readingSessions.length > 0) {
      student.lastReadDate = student.readingSessions[0].date;
    } else {
      student.lastReadDate = null;
    }

    await saveStudentKV(c.env, student);

    return c.json({ message: 'Session deleted successfully' });
  }
);

sessionsRouter.put(
  '/:id/sessions/:sessionId',
  requireTeacher(),
  auditLog('update', 'session'),
  async (c) => {
    const { id, sessionId } = c.req.param();
    const body = await c.req.json();

    const sessionValidation = validateSessionInput(body);
    if (!sessionValidation.isValid) {
      throw badRequestError(sessionValidation.error);
    }
    Object.assign(body, sessionValidation.data);

    if (isMultiTenantMode(c)) {
      const db = getDB(c.env);
      const organizationId = c.get('organizationId');

      const { timezone } = await getOrgStreakSettings(db, organizationId, c.env || {});

      await requireStudent(db, id, organizationId);

      const existingSession = await db
        .prepare(`SELECT id FROM reading_sessions WHERE id = ? AND student_id = ?`)
        .bind(sessionId, id)
        .first();

      if (!existingSession) {
        throw notFoundError(`Session with ID ${sessionId} not found`);
      }

      await db
        .prepare(
          `UPDATE reading_sessions SET
             session_date = ?,
             book_id = ?,
             book_title_manual = ?,
             book_author_manual = ?,
             pages_read = ?,
             duration_minutes = ?,
             assessment = ?,
             notes = ?,
             location = ?
           WHERE id = ?`
        )
        .bind(
          body.date || getDateString(new Date(), timezone),
          body.bookId ?? null,
          body.bookTitle ?? null,
          body.bookAuthor ?? null,
          body.pagesRead ?? null,
          body.duration ?? null,
          body.assessment ?? null,
          body.notes ?? null,
          body.location ?? 'school',
          sessionId
        )
        .run();

      await updateStudentStreak(db, id, organizationId, c.env);
      await recalculateStats(db, id, organizationId);

      const studentForBadges = await db
        .prepare('SELECT year_group FROM students WHERE id = ?')
        .bind(id)
        .first();
      const newBadges = await evaluateRealTime(
        db,
        id,
        organizationId,
        studentForBadges?.year_group
      );
      const completedGoals = await updateClassGoalOnSession(db, id, organizationId);

      await db
        .prepare(
          `UPDATE students SET last_read_date = (
             SELECT MAX(session_date) FROM reading_sessions WHERE student_id = ?
               AND (notes IS NULL OR (notes NOT LIKE '%[ABSENT]%' AND notes NOT LIKE '%[NO_RECORD]%'))
           ), updated_at = datetime("now") WHERE id = ? AND organization_id = ?`
        )
        .bind(id, id, organizationId)
        .run();

      const session = await db
        .prepare(
          `SELECT rs.*, b.title as book_title, b.author as book_author
           FROM reading_sessions rs
           LEFT JOIN books b ON rs.book_id = b.id
           WHERE rs.id = ?`
        )
        .bind(sessionId)
        .first();

      return c.json({
        id: session.id,
        date: session.session_date,
        bookTitle: session.book_title || session.book_title_manual,
        bookAuthor: session.book_author || session.book_author_manual,
        bookId: session.book_id,
        pagesRead: session.pages_read,
        duration: session.duration_minutes,
        assessment: session.assessment,
        notes: session.notes,
        newBadges,
        completedGoals,
      });
    }

    const student = await getStudentByIdKV(c.env, id);
    if (!student) {
      throw notFoundError('Student not found');
    }

    const sessionIndex = student.readingSessions.findIndex((s) => s.id === sessionId);
    if (sessionIndex === -1) {
      throw notFoundError(`Session with ID ${sessionId} not found`);
    }

    student.readingSessions[sessionIndex] = {
      ...student.readingSessions[sessionIndex],
      ...body,
      id: sessionId,
    };

    await saveStudentKV(c.env, student);

    return c.json(student.readingSessions[sessionIndex]);
  }
);

export { sessionsRouter };
