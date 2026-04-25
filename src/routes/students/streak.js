/**
 * Student streak routes + the cron-time `recalculateAllStreaks` helper.
 *
 *   GET  /:id/streak              — single-student streak details
 *   POST /recalculate-streaks     — admin-triggered org-wide refresh
 *
 * `recalculateAllStreaks` is invoked from the nightly cron in src/worker.js.
 * It bulk-fetches per org, calculates in JS, and batch-writes — never N+1.
 */

import { Hono } from 'hono';
import { calculateStreak } from '../../utils/streakCalculator.js';
import { notFoundError, forbiddenError } from '../../middleware/errorHandler.js';
import { requireReadonly } from '../../middleware/tenant.js';
import { permissions } from '../../utils/crypto.js';
import { getDB, isMultiTenantMode } from '../../utils/routeHelpers.js';
import { getStudentById as getStudentByIdKV } from '../../services/kvService.js';
import { getOrgStreakSettings } from './_shared.js';

const streakRouter = new Hono();

streakRouter.get('/:id/streak', requireReadonly(), async (c) => {
  const { id } = c.req.param();

  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const student = await db
      .prepare(
        `SELECT id, current_streak, longest_streak, streak_start_date
         FROM students WHERE id = ? AND organization_id = ? AND is_active = 1`
      )
      .bind(id, organizationId)
      .first();

    if (!student) {
      throw notFoundError('Student not found');
    }

    const lastSession = await db
      .prepare(
        `SELECT session_date FROM reading_sessions
         WHERE student_id = ?
         ORDER BY session_date DESC
         LIMIT 1`
      )
      .bind(id)
      .first();

    return c.json({
      currentStreak: student.current_streak || 0,
      longestStreak: student.longest_streak || 0,
      streakStartDate: student.streak_start_date || null,
      lastReadDate: lastSession?.session_date || null,
    });
  }

  const student = await getStudentByIdKV(c.env, id);
  if (!student) {
    throw notFoundError('Student not found');
  }

  const streakData = calculateStreak(student.readingSessions || [], {
    gracePeriodDays: 1,
  });

  return c.json(streakData);
});

streakRouter.post('/recalculate-streaks', async (c) => {
  if (!isMultiTenantMode(c)) {
    return c.json({ error: 'This endpoint requires multi-tenant mode' }, 400);
  }

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');

  const userRole = c.get('userRole');
  if (!permissions.canManageSettings(userRole)) {
    throw forbiddenError();
  }

  const students = await db
    .prepare(`SELECT id FROM students WHERE organization_id = ? AND is_active = 1`)
    .bind(organizationId)
    .all();

  const studentIds = (students.results || []).map((s) => s.id);

  if (studentIds.length === 0) {
    return c.json({ total: 0, updated: 0, errors: [] });
  }

  const allSessions = await db
    .prepare(
      `SELECT student_id, session_date as date FROM reading_sessions
       WHERE student_id IN (SELECT id FROM students WHERE organization_id = ? AND is_active = 1)
         AND (notes IS NULL OR (notes NOT LIKE '%[ABSENT]%' AND notes NOT LIKE '%[NO_RECORD]%'))
       ORDER BY session_date DESC`
    )
    .bind(organizationId)
    .all();

  const sessionsByStudent = new Map();
  for (const session of allSessions.results || []) {
    if (!sessionsByStudent.has(session.student_id)) {
      sessionsByStudent.set(session.student_id, []);
    }
    sessionsByStudent.get(session.student_id).push(session);
  }

  const { gracePeriodDays, timezone } = await getOrgStreakSettings(db, organizationId, c.env || {});

  const updateStatements = [];
  const results = { total: studentIds.length, updated: 0, errors: [] };

  for (const studentId of studentIds) {
    try {
      const sessions = sessionsByStudent.get(studentId) || [];
      const streakData = calculateStreak(sessions, { gracePeriodDays, timezone });

      const lastReadDate = sessions.length > 0 ? sessions[0].date : null;

      updateStatements.push(
        db
          .prepare(
            `UPDATE students SET
               current_streak = ?,
               longest_streak = ?,
               streak_start_date = ?,
               last_read_date = ?,
               updated_at = datetime("now")
             WHERE id = ? AND organization_id = ?`
          )
          .bind(
            streakData.currentStreak,
            streakData.longestStreak,
            streakData.streakStartDate,
            lastReadDate,
            studentId,
            organizationId
          )
      );
      results.updated++;
    } catch (error) {
      results.errors.push({ studentId, error: error.message });
    }
  }

  for (let i = 0; i < updateStatements.length; i += 100) {
    await db.batch(updateStatements.slice(i, i + 100));
  }

  return c.json(results);
});

/**
 * Cron-time bulk recalculation across all orgs. Each org is fully isolated:
 * a D1 timeout or other failure in one org must not abort the cron for the
 * remaining orgs (Sentry TALLY-READING-6 caught this regression).
 */
export const recalculateAllStreaks = async (db) => {
  const results = {
    total: 0,
    updated: 0,
    errors: [],
    organizations: 0,
  };

  const orgs = await db.prepare(`SELECT id FROM organizations WHERE is_active = 1`).all();
  results.organizations = orgs.results?.length || 0;

  for (const org of orgs.results || []) {
    const organizationId = org.id;

    try {
      let orgSettings;
      try {
        orgSettings = await getOrgStreakSettings(db, organizationId, {});
      } catch {
        orgSettings = { gracePeriodDays: 1, timezone: 'UTC' };
      }

      const studentsResult = await db
        .prepare(`SELECT id FROM students WHERE organization_id = ? AND is_active = 1`)
        .bind(organizationId)
        .all();

      const studentList = studentsResult.results || [];
      results.total += studentList.length;

      if (studentList.length === 0) continue;

      const studentIds = studentList.map((s) => s.id);
      const allSessions = [];
      const SESSION_BATCH = 25;
      for (let i = 0; i < studentIds.length; i += SESSION_BATCH) {
        const batch = studentIds.slice(i, i + SESSION_BATCH);
        const placeholders = batch.map(() => '?').join(',');
        const sessionsResult = await db
          .prepare(
            `SELECT student_id, session_date as date FROM reading_sessions
             WHERE student_id IN (${placeholders})
               AND session_date >= date('now', '-90 days')
               AND (notes IS NULL OR (notes NOT LIKE '%[ABSENT]%' AND notes NOT LIKE '%[NO_RECORD]%'))
             ORDER BY session_date DESC`
          )
          .bind(...batch)
          .all();
        allSessions.push(...(sessionsResult.results || []));
      }

      const sessionsByStudent = new Map();
      for (const session of allSessions) {
        if (!sessionsByStudent.has(session.student_id)) {
          sessionsByStudent.set(session.student_id, []);
        }
        sessionsByStudent.get(session.student_id).push(session);
      }

      const updateStatements = [];
      for (const student of studentList) {
        const studentSessions = sessionsByStudent.get(student.id) || [];
        const streakData = calculateStreak(studentSessions, orgSettings);

        updateStatements.push(
          db
            .prepare(
              `UPDATE students SET
                 current_streak = ?,
                 longest_streak = MAX(longest_streak, ?),
                 streak_start_date = ?,
                 updated_at = datetime("now")
               WHERE id = ?`
            )
            .bind(
              streakData.currentStreak,
              streakData.longestStreak,
              streakData.streakStartDate,
              student.id
            )
        );
      }

      const BATCH_SIZE = 50;
      for (let i = 0; i < updateStatements.length; i += BATCH_SIZE) {
        const chunk = updateStatements.slice(i, i + BATCH_SIZE);
        await db.batch(chunk);
      }
      results.updated += studentList.length;
    } catch (err) {
      results.errors.push({
        organizationId,
        error: err?.message || 'Streak recalculation failed for organization',
      });
    }
  }

  return results;
};

export { streakRouter };
