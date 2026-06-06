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
import {
  getOrgStreakSettings,
  updateStudentStreak,
  updateStudentBand,
  runSessionSideEffects,
} from './_shared.js';
import { OBSERVATION_SLOTS } from '../../utils/readingObservations.js';

const sessionsRouter = new Hono();

/**
 * Map the stored reading-observation columns (nullable 0/1) onto the boolean
 * API shape used by the client. Null/0 -> false (unticked), 1 -> true.
 * Covers all six configurable slots (read_fluent … read_custom3).
 */
const readObservations = (row) =>
  Object.fromEntries(OBSERVATION_SLOTS.map((s) => [s.key, !!row[s.column]]));

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
    // Validate the class exists in this org — org scoping below already makes
    // foreign ids harmless (zero rows), but a 404 beats a silently-empty list.
    const cls = await db
      .prepare(`SELECT id FROM classes WHERE id = ? AND organization_id = ?`)
      .bind(classId, organizationId)
      .first();
    if (!cls) throw notFoundError('Class not found');
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
    ...readObservations(s),
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
    ...readObservations(s),
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
               pages_read, duration_minutes, assessment, notes, location, recorded_by,
               read_fluent, read_expressive, read_phonics, read_custom1, read_custom2, read_custom3
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          userId,
          body.readFluent ?? null,
          body.readExpressive ?? null,
          body.readPhonics ?? null,
          body.readCustom1 ?? null,
          body.readCustom2 ?? null,
          body.readCustom3 ?? null
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

    if (!isMarkerSession && (body.location || 'school') === 'school') {
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

    // Side-effects: shared best-effort chain (see runSessionSideEffects in
    // _shared.js — single source of truth with the parent portal).
    const { completedGoals, bandUp, bandResult, newBadges } = await runSessionSideEffects(
      db,
      c.env,
      {
        studentId: id,
        organizationId,
        yearGroup: student.year_group,
        isMarkerSession: Boolean(isMarkerSession),
        timezone,
        newSessions: [
          {
            id: sessionId,
            date: sessionDate,
            bookId: body.bookId || null,
            isMarker: Boolean(isMarkerSession),
          },
        ],
        logPrefix: 'sessions',
        logContext: { sessionId },
      }
    );

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
        ...readObservations(session),
        newBadges,
        completedGoals,
        bandUp,
        currentBand: bandResult?.currentBand,
        bandReadsCount: bandResult?.readsCount,
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
    readFluent: body.readFluent ?? null,
    readExpressive: body.readExpressive ?? null,
    readPhonics: body.readPhonics ?? null,
    readCustom1: body.readCustom1 ?? null,
    readCustom2: body.readCustom2 ?? null,
    readCustom3: body.readCustom3 ?? null,
  };

  student.readingSessions = student.readingSessions || [];
  student.readingSessions.unshift(newSession);
  student.lastReadDate = newSession.date;

  await saveStudentKV(c.env, student);

  return c.json(newSession, 201);
});

// Maximum sessions per bulk create — covers a full month of register backfill.
const MAX_BULK_SESSIONS = 31;

/**
 * POST /:id/sessions/bulk — create several sessions for one student in a
 * single request. Replaces the register's sequential per-day POST loop: one
 * atomic insert batch, then the side-effect chain (streak/stats/goals/band/
 * badges) runs ONCE instead of once per day.
 *
 * Body: { sessions: [{ date, bookId, bookTitle, bookAuthor, pagesRead,
 *         duration, assessment, notes, location, read* }] }
 */
sessionsRouter.post(
  '/:id/sessions/bulk',
  requireTeacher(),
  auditLog('create', 'session'),
  async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const items = Array.isArray(body?.sessions) ? body.sessions : null;

    if (!items || items.length === 0) {
      throw badRequestError('sessions must be a non-empty array');
    }
    if (items.length > MAX_BULK_SESSIONS) {
      throw badRequestError(`Cannot create more than ${MAX_BULK_SESSIONS} sessions at once`);
    }

    // Validate every item up front — reject the whole batch on any bad item,
    // so the client never has to reason about partial creation.
    const validated = items.map((raw, i) => {
      const v = validateSessionInput(raw || {});
      if (!v.isValid) {
        throw badRequestError(`sessions[${i}]: ${v.error}`);
      }
      return { ...raw, ...v.data };
    });

    if (isMultiTenantMode(c)) {
      const db = getDB(c.env);
      const organizationId = c.get('organizationId');
      const userId = c.get('userId');

      const { timezone } = await getOrgStreakSettings(db, organizationId, c.env || {});

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

      // Verify all referenced library books in one query
      const bookIds = [...new Set(validated.map((s) => s.bookId).filter(Boolean))];
      if (bookIds.length > 0) {
        const ph = bookIds.map(() => '?').join(',');
        const found = await db
          .prepare(
            `SELECT book_id FROM org_book_selections WHERE organization_id = ? AND is_available = 1 AND book_id IN (${ph})`
          )
          .bind(organizationId, ...bookIds)
          .all();
        const foundSet = new Set((found.results || []).map((r) => r.book_id));
        if (bookIds.some((b) => !foundSet.has(b))) {
          throw badRequestError("Book not found in this organization's library");
        }
      }

      const newSessions = validated.map((s) => ({
        ...s,
        sessionId: generateId(),
        sessionDate: s.date || getDateString(new Date(), timezone),
        isMarker: Boolean(
          s.notes && (s.notes.includes('[ABSENT]') || s.notes.includes('[NO_RECORD]'))
        ),
      }));

      // Core writes batched atomically: all session rows plus the student
      // summary updates (same invariants as the single-session POST).
      const coreWrites = newSessions.map((s) =>
        db
          .prepare(
            `INSERT INTO reading_sessions (
               id, student_id, session_date, book_id, book_title_manual, book_author_manual,
               pages_read, duration_minutes, assessment, notes, location, recorded_by,
               read_fluent, read_expressive, read_phonics, read_custom1, read_custom2, read_custom3
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            s.sessionId,
            id,
            s.sessionDate,
            s.bookId || null,
            s.bookTitle || null,
            s.bookAuthor || null,
            s.pagesRead ?? null,
            s.duration ?? null,
            s.assessment ?? null,
            s.notes ?? null,
            s.location || 'school',
            userId,
            s.readFluent ?? null,
            s.readExpressive ?? null,
            s.readPhonics ?? null,
            s.readCustom1 ?? null,
            s.readCustom2 ?? null,
            s.readCustom3 ?? null
          )
      );

      // current_book_id: most recent batch item carrying a bookId
      const withBook = newSessions
        .filter((s) => s.bookId)
        .sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : -1));
      if (withBook.length > 0) {
        coreWrites.push(
          db
            .prepare(
              `UPDATE students SET current_book_id = ?, updated_at = datetime("now")
                 WHERE id = ? AND organization_id = ?`
            )
            .bind(withBook[0].bookId, id, organizationId)
        );
      }

      // last_read_date: max school non-marker date in the batch (school-only,
      // per v3.64.3 — home sessions never advance the teacher-facing date)
      const schoolDates = newSessions
        .filter((s) => !s.isMarker && (s.location || 'school') === 'school')
        .map((s) => s.sessionDate)
        .sort();
      if (schoolDates.length > 0) {
        coreWrites.push(
          db
            .prepare(
              `UPDATE students SET last_read_date = MAX(COALESCE(last_read_date, ''), ?), updated_at = datetime("now")
                 WHERE id = ? AND organization_id = ?`
            )
            .bind(schoolDates[schoolDates.length - 1], id, organizationId)
        );
      }

      await db.batch(coreWrites);

      // Side-effects ONCE for the whole batch (the entire point of this route)
      const allMarkers = newSessions.every((s) => s.isMarker);
      const sideEffects = await runSessionSideEffects(db, c.env, {
        studentId: id,
        organizationId,
        yearGroup: student.year_group,
        isMarkerSession: allMarkers,
        timezone,
        newSessions: newSessions.map((s) => ({
          id: s.sessionId,
          date: s.sessionDate,
          bookId: s.bookId || null,
          isMarker: s.isMarker,
        })),
        logPrefix: 'sessions/bulk',
        logContext: { count: newSessions.length },
      });

      c.set('auditDetails', {
        bulk: true,
        count: newSessions.length,
        dates: newSessions.map((s) => s.sessionDate),
      });

      return c.json(
        {
          created: newSessions.length,
          sessions: newSessions.map((s) => ({
            id: s.sessionId,
            date: s.sessionDate,
            bookId: s.bookId || null,
            location: s.location || 'school',
            notes: s.notes ?? null,
          })),
          newBadges: sideEffects.newBadges,
          completedGoals: sideEffects.completedGoals,
          bandUp: sideEffects.bandUp,
          currentBand: sideEffects.bandResult?.currentBand,
          bandReadsCount: sideEffects.bandResult?.readsCount,
          streak: sideEffects.streakData ? { current: sideEffects.streakData.currentStreak } : null,
        },
        201
      );
    }

    // Legacy KV path — append all sessions to the student JSON in one save
    const student = await getStudentByIdKV(c.env, id);
    if (!student) {
      throw notFoundError('Student not found');
    }

    student.readingSessions = student.readingSessions || [];
    const created = validated.map((s) => {
      const newSession = {
        id: generateId(),
        date: s.date || new Date().toLocaleDateString('en-CA'),
        bookTitle: s.bookTitle,
        bookAuthor: s.bookAuthor,
        bookId: s.bookId,
        pagesRead: s.pagesRead,
        duration: s.duration,
        assessment: s.assessment,
        notes: s.notes,
        location: s.location || 'school',
        readFluent: s.readFluent ?? null,
        readExpressive: s.readExpressive ?? null,
        readPhonics: s.readPhonics ?? null,
        readCustom1: s.readCustom1 ?? null,
        readCustom2: s.readCustom2 ?? null,
        readCustom3: s.readCustom3 ?? null,
      };
      student.readingSessions.unshift(newSession);
      return newSession;
    });

    const nonMarkerDates = created
      .filter(
        (s) => !(s.notes && (s.notes.includes('[ABSENT]') || s.notes.includes('[NO_RECORD]')))
      )
      .map((s) => s.date)
      .sort();
    if (nonMarkerDates.length > 0) {
      student.lastReadDate = nonMarkerDates[nonMarkerDates.length - 1];
    }

    await saveStudentKV(c.env, student);

    return c.json(
      {
        created: created.length,
        sessions: created,
        newBadges: [],
        completedGoals: [],
        bandUp: null,
      },
      201
    );
  }
);

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
      await updateStudentBand(db, id, organizationId, c.env);
      await recalculateStats(db, id, organizationId);
      await updateClassGoalOnSession(db, id, organizationId);

      // Recompute last_read_date from remaining school sessions only
      await db
        .prepare(
          `UPDATE students SET last_read_date = (
             SELECT MAX(session_date) FROM reading_sessions WHERE student_id = ?
               AND (notes IS NULL OR (notes NOT LIKE '%[ABSENT]%' AND notes NOT LIKE '%[NO_RECORD]%'))
               AND COALESCE(location, 'school') = 'school'
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
             location = ?,
             read_fluent = ?,
             read_expressive = ?,
             read_phonics = ?,
             read_custom1 = ?,
             read_custom2 = ?,
             read_custom3 = ?
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
          body.readFluent ?? null,
          body.readExpressive ?? null,
          body.readPhonics ?? null,
          body.readCustom1 ?? null,
          body.readCustom2 ?? null,
          body.readCustom3 ?? null,
          sessionId
        )
        .run();

      await updateStudentStreak(db, id, organizationId, c.env);
      await updateStudentBand(db, id, organizationId, c.env, { timezone });
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
               AND COALESCE(location, 'school') = 'school'
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
        ...readObservations(session),
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
