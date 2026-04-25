/**
 * Students entry router.
 *
 * The student surface area is split across files in `src/routes/students/`
 * for readability — sessions, stats, streak, bulk and gdpr each get their
 * own module. This file owns the core CRUD plus two small focused mutators
 * (`current-book`, `feedback`), and composes the sub-routers in.
 *
 * Order of mounting matters: the sub-routers carry the literal paths
 * (`/stats`, `/sessions`, `/bulk`, `/recalculate-streaks`) and the
 * `/:id/...` paths that need to be matched before this file's bare `/:id`
 * handlers. Hono's trie prefers static routes over params, but mounting
 * sub-routers first keeps the precedence explicit and trivially auditable.
 *
 * The cron-time `recalculateAllStreaks` lives in `students/streak.js` and
 * is re-exported here so worker.js's existing import keeps working.
 */

import { Hono } from 'hono';
import { generateId } from '../utils/helpers.js';
import { calculateStreak } from '../utils/streakCalculator.js';

import {
  getStudents as getStudentsKV,
  getStudentById as getStudentByIdKV,
  saveStudent as saveStudentKV,
  deleteStudent as deleteStudentKV,
} from '../services/kvService.js';

import { validateStudent, validateReadingLevelRange } from '../utils/validation.js';
import { notFoundError, badRequestError, forbiddenError } from '../middleware/errorHandler.js';
import { requireTeacher, requireReadonly, auditLog } from '../middleware/tenant.js';
import { permissions } from '../utils/crypto.js';
import { getDB, isMultiTenantMode, requireStudent } from '../utils/routeHelpers.js';
import { rowToStudent, rowToReadingStats } from '../utils/rowMappers.js';
import { calculateNearMisses } from '../utils/badgeEngine.js';

import {
  fetchStudentPreferences,
  saveStudentPreferences,
  getOrgStreakSettings,
} from './students/_shared.js';
import { sessionsRouter } from './students/sessions.js';
import { statsRouter } from './students/stats.js';
import { streakRouter, recalculateAllStreaks } from './students/streak.js';
import { bulkRouter } from './students/bulk.js';
import { gdprRouter } from './students/gdpr.js';

const studentsRouter = new Hono();

// Mount sub-routers first so their literal paths take precedence over the
// `/:id` core handlers below. The trie router would resolve this either way,
// but explicit ordering means a future maintainer doesn't have to reason
// about routing precedence.
studentsRouter.route('/', sessionsRouter);
studentsRouter.route('/', statsRouter);
studentsRouter.route('/', streakRouter);
studentsRouter.route('/', bulkRouter);
studentsRouter.route('/', gdprRouter);

/**
 * GET /api/students
 * List active students with denormalised class name + current-book name +
 * pre-aggregated session/badge counts.
 */
studentsRouter.get('/', requireReadonly(), async (c) => {
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    // Pre-aggregate session and badge counts once per org (grouped subqueries)
    // instead of a correlated subquery per student row. At 1000 students this
    // is one pass over each child table rather than 2000 executions.
    const result = await db
      .prepare(
        `SELECT s.*, c.name as class_name, b.title as current_book_title, b.author as current_book_author,
           COALESCE(rs_counts.total_session_count, 0) as total_session_count,
           COALESCE(sb_counts.badge_count, 0) as badge_count
         FROM students s
         LEFT JOIN classes c ON s.class_id = c.id
         LEFT JOIN books b ON s.current_book_id = b.id
         LEFT JOIN (
           SELECT rs.student_id, COUNT(*) AS total_session_count
           FROM reading_sessions rs
           JOIN students rs_s ON rs.student_id = rs_s.id
           WHERE rs_s.organization_id = ?1
             AND rs_s.is_active = 1
             AND (rs.notes IS NULL OR (rs.notes NOT LIKE '%[ABSENT]%' AND rs.notes NOT LIKE '%[NO_RECORD]%'))
           GROUP BY rs.student_id
         ) rs_counts ON rs_counts.student_id = s.id
         LEFT JOIN (
           SELECT sb.student_id, COUNT(*) AS badge_count
           FROM student_badges sb
           WHERE sb.organization_id = ?1
           GROUP BY sb.student_id
         ) sb_counts ON sb_counts.student_id = s.id
         WHERE s.organization_id = ?1 AND s.is_active = 1
         ORDER BY s.name ASC`
      )
      .bind(organizationId)
      .all();

    const students = (result.results || []).map((row) => ({
      ...rowToStudent(row),
      className: row.class_name,
      totalSessionCount: row.total_session_count || 0,
      badgeCount: row.badge_count || 0,
    }));

    return c.json(students);
  }

  const students = await getStudentsKV(c.env);
  return c.json(students);
});

/**
 * GET /api/students/:id
 * Single student with sessions, badges, stats, near-miss badges, and a
 * freshly-recalculated streak (cheaper than the cron's bulk path here
 * because we already have the sessions in memory).
 */
studentsRouter.get('/:id', requireReadonly(), async (c) => {
  const { id } = c.req.param();

  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const [streakSettings, studentResult] = await Promise.all([
      getOrgStreakSettings(db, organizationId, c.env),
      db
        .prepare(
          `SELECT s.*, c.name as class_name, b.title as current_book_title, b.author as current_book_author
           FROM students s
           LEFT JOIN classes c ON s.class_id = c.id
           LEFT JOIN books b ON s.current_book_id = b.id
           WHERE s.id = ? AND s.organization_id = ? AND s.is_active = 1`
        )
        .bind(id, organizationId)
        .first(),
    ]);
    const { gracePeriodDays, timezone } = streakSettings;
    const student = studentResult;

    if (!student) {
      throw notFoundError('Student not found');
    }

    const result = rowToStudent(student);
    result.className = student.class_name;

    const sessions = await db
      .prepare(
        `SELECT rs.*, b.title as book_title, b.author as book_author
         FROM reading_sessions rs
         LEFT JOIN books b ON rs.book_id = b.id
         WHERE rs.student_id = ?
         ORDER BY rs.session_date DESC`
      )
      .bind(id)
      .all();

    result.readingSessions = (sessions.results || []).map((s) => ({
      id: s.id,
      date: s.session_date,
      bookTitle: s.book_title || s.book_title_manual,
      bookAuthor: s.book_author || s.book_author_manual,
      bookId: s.book_id,
      pagesRead: s.pages_read,
      duration: s.duration_minutes,
      assessment: s.assessment,
      notes: s.notes,
      location: s.location || 'school',
      recordedBy: s.recorded_by,
    }));

    // Recalculate streak on-the-fly from the sessions we just loaded so the
    // detail page is always exact, even if the cron hasn't run since the
    // last session edit. Excludes marker rows.
    const streakData = calculateStreak(
      result.readingSessions
        .filter((s) => !s.notes?.includes('[ABSENT]') && !s.notes?.includes('[NO_RECORD]'))
        .map((s) => ({ date: s.date })),
      { gracePeriodDays, timezone }
    );
    result.currentStreak = streakData.currentStreak;
    // Preserve the historical longest if the rolling calc came out lower.
    result.longestStreak = Math.max(streakData.longestStreak, result.longestStreak);
    result.streakStartDate = streakData.streakStartDate;

    result.preferences = await fetchStudentPreferences(db, id);
    // Mirror book-title likes/dislikes from the students row into preferences
    // so the UI can read them off one object.
    result.preferences.likes = result.likes || [];
    result.preferences.dislikes = result.dislikes || [];

    const [badgesResult, statsRow] = await Promise.all([
      db
        .prepare('SELECT * FROM student_badges WHERE student_id = ? ORDER BY earned_at DESC')
        .bind(id)
        .all(),
      db.prepare('SELECT * FROM student_reading_stats WHERE student_id = ?').bind(id).first(),
    ]);
    result.badges = (badgesResult.results || []).map((r) => ({
      badgeId: r.badge_id,
      tier: r.tier,
      earnedAt: r.earned_at,
      notified: Boolean(r.notified),
    }));
    if (statsRow) {
      result.readingStats = rowToReadingStats(statsRow);
    }
    const earnedBadgeIds = new Set(result.badges.map((b) => b.badgeId));
    result.nearMisses = statsRow
      ? calculateNearMisses(rowToReadingStats(statsRow), student.year_group, earnedBadgeIds)
      : [];

    return c.json(result);
  }

  const student = await getStudentByIdKV(c.env, id);
  if (!student) {
    throw notFoundError('Student not found');
  }
  return c.json(student);
});

/**
 * POST /api/students
 * Create a student in the caller's organisation.
 */
studentsRouter.post('/', auditLog('create', 'student'), async (c) => {
  const body = await c.req.json();

  const validation = validateStudent(body);
  if (!validation.isValid) {
    throw badRequestError(validation.errors.join(', '));
  }

  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');

    const userRole = c.get('userRole');
    if (!permissions.canManageStudents(userRole)) {
      throw forbiddenError();
    }

    const rangeValidation = validateReadingLevelRange(body.readingLevelMin, body.readingLevelMax);
    if (!rangeValidation.isValid) {
      throw badRequestError(rangeValidation.errors[0]);
    }

    const studentId = generateId();

    await db
      .prepare(
        `INSERT INTO students (id, organization_id, name, class_id, reading_level_min, reading_level_max, likes, dislikes, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        studentId,
        organizationId,
        body.name,
        body.classId || null,
        rangeValidation.normalizedMin ?? null,
        rangeValidation.normalizedMax ?? null,
        JSON.stringify(body.likes || []),
        JSON.stringify(body.dislikes || []),
        body.notes || null,
        userId
      )
      .run();

    const student = await db.prepare(`SELECT * FROM students WHERE id = ?`).bind(studentId).first();

    return c.json(rowToStudent(student), 201);
  }

  const newStudent = {
    id: body.id || generateId(),
    name: body.name,
    classId: body.classId || null,
    lastReadDate: body.lastReadDate || null,
    readingSessions: body.readingSessions || [],
    likes: body.likes || [],
    dislikes: body.dislikes || [],
    readingLevelMin: body.readingLevelMin || null,
    readingLevelMax: body.readingLevelMax || null,
  };

  const savedStudent = await saveStudentKV(c.env, newStudent);
  return c.json(savedStudent, 201);
});

/**
 * PUT /api/students/:id
 * Update student fields including likes/dislikes and genre preferences.
 */
studentsRouter.put('/:id', auditLog('update', 'student'), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  const validation = validateStudent(body);
  if (!validation.isValid) {
    throw badRequestError(validation.errors.join(', '));
  }

  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const userRole = c.get('userRole');
    if (!permissions.canManageStudents(userRole)) {
      throw forbiddenError();
    }

    await requireStudent(db, id, organizationId);

    const rangeValidation = validateReadingLevelRange(body.readingLevelMin, body.readingLevelMax);
    if (!rangeValidation.isValid) {
      throw badRequestError(rangeValidation.errors[0]);
    }

    // Prefer top-level likes/dislikes; fall back to preferences.likes /
    // preferences.dislikes so older clients that bundle them inside
    // `preferences` continue to work.
    let likes = body.likes || [];
    let dislikes = body.dislikes || [];

    if (body.preferences) {
      if (body.preferences.likes && Array.isArray(body.preferences.likes)) {
        likes = body.preferences.likes;
      }
      if (body.preferences.dislikes && Array.isArray(body.preferences.dislikes)) {
        dislikes = body.preferences.dislikes;
      }
    }

    await db
      .prepare(
        `UPDATE students SET
           name = ?,
           class_id = ?,
           reading_level_min = ?,
           reading_level_max = ?,
           likes = ?,
           dislikes = ?,
           notes = ?,
           updated_at = datetime("now")
         WHERE id = ? AND organization_id = ?`
      )
      .bind(
        body.name,
        body.classId || null,
        rangeValidation.normalizedMin ?? null,
        rangeValidation.normalizedMax ?? null,
        JSON.stringify(likes),
        JSON.stringify(dislikes),
        body.notes || null,
        id,
        organizationId
      )
      .run();

    if (body.preferences) {
      await saveStudentPreferences(db, id, body.preferences);
    }

    const student = await db.prepare(`SELECT * FROM students WHERE id = ?`).bind(id).first();

    const result = rowToStudent(student);

    result.preferences = await fetchStudentPreferences(db, id);
    result.preferences.likes = likes;
    result.preferences.dislikes = dislikes;

    return c.json(result);
  }

  const existingStudent = await getStudentByIdKV(c.env, id);
  if (!existingStudent) {
    throw notFoundError('Student not found');
  }

  const updatedStudent = {
    ...existingStudent,
    ...body,
    id,
  };

  const savedStudent = await saveStudentKV(c.env, updatedStudent);
  return c.json(savedStudent);
});

/**
 * DELETE /api/students/:id
 * Soft delete in multi-tenant mode (preserves history); legacy KV is
 * a hard delete.
 */
studentsRouter.delete('/:id', auditLog('delete', 'student'), async (c) => {
  const { id } = c.req.param();

  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const userRole = c.get('userRole');
    if (!permissions.canManageStudents(userRole)) {
      throw forbiddenError();
    }

    await requireStudent(db, id, organizationId);

    await db
      .prepare(`UPDATE students SET is_active = 0, updated_at = datetime("now") WHERE id = ?`)
      .bind(id)
      .run();

    return c.json({ message: 'Student deleted successfully' });
  }

  const success = await deleteStudentKV(c.env, id);

  if (!success) {
    throw notFoundError('Student not found');
  }

  return c.json({ message: 'Student deleted successfully' });
});

/**
 * PUT /api/students/:id/current-book
 * Lightweight setter for the in-progress book; used by the register and the
 * book-edit popover.
 */
studentsRouter.put('/:id/current-book', requireTeacher(), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    await requireStudent(db, id, organizationId);

    await db
      .prepare(
        `UPDATE students SET current_book_id = ?, updated_at = datetime("now")
         WHERE id = ?`
      )
      .bind(body.bookId || null, id)
      .run();

    const student = await db
      .prepare(
        `SELECT s.*, b.title as current_book_title, b.author as current_book_author
         FROM students s
         LEFT JOIN books b ON s.current_book_id = b.id
         WHERE s.id = ?`
      )
      .bind(id)
      .first();

    return c.json({
      currentBookId: student.current_book_id,
      currentBookTitle: student.current_book_title,
      currentBookAuthor: student.current_book_author,
    });
  }

  return c.json({ error: 'Current book tracking requires multi-tenant mode' }, 400);
});

/**
 * PUT /api/students/:id/feedback
 * Lightweight likes/dislikes update — skips full validation for hot paths
 * like the recommendation thumbs-up/down.
 */
studentsRouter.put('/:id/feedback', requireTeacher(), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  if (!isMultiTenantMode(c)) {
    throw badRequestError('Feedback requires multi-tenant mode');
  }

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  await requireStudent(db, id, organizationId);

  const likes = Array.isArray(body.likes) ? body.likes : [];
  const dislikes = Array.isArray(body.dislikes) ? body.dislikes : [];

  await db
    .prepare(
      `UPDATE students SET likes = ?, dislikes = ?, updated_at = datetime("now")
       WHERE id = ? AND organization_id = ?`
    )
    .bind(JSON.stringify(likes), JSON.stringify(dislikes), id, organizationId)
    .run();

  return c.json({ likes, dislikes });
});

export { studentsRouter, recalculateAllStreaks };
