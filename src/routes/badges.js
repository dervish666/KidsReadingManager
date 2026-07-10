/**
 * Badge routes — GET /api/students/:id/badges, POST /api/students/:id/badges/notify
 *
 * These are registered under /api/badges in worker.js but use student ID params.
 * Alternatively, these could live in students.js — but a separate file keeps
 * the badge logic contained.
 */

import { Hono } from 'hono';
import { requireReadonly, requireTeacher } from '../middleware/tenant.js';
import { notFoundError, badRequestError } from '../middleware/errorHandler.js';
import { requireDB } from '../utils/routeHelpers.js';
import { rowToBadge, rowToReadingStats } from '../utils/rowMappers.js';
import { BADGE_DEFINITIONS, resolveKeyStage } from '../utils/badgeDefinitions.js';
import { calculateNearMisses } from '../utils/badgeEngine.js';
import { classNameToYearGroup } from '../utils/yearGroup.js';
import { getDateString } from '../utils/streakCalculator.js';
import { getOrgStreakSettings } from './students/_shared.js';

const badgesRouter = new Hono();

/**
 * GET /api/badges/ticker
 * Today's celebration events (band-ups, badge awards) for the org — rotated
 * through the header Reading News ticker for the rest of the day.
 */
badgesRouter.get('/ticker', requireReadonly(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');

  // "Today" is the org's local day, not UTC — during BST a 00:00–01:00
  // celebration belongs to the new local day even though UTC hasn't rolled
  // over. Pull a generous UTC window, then filter to the local date in JS
  // (SQLite has no timezone tables).
  const { timezone } = await getOrgStreakSettings(db, organizationId, c.env || {});
  const todayLocal = getDateString(new Date(), timezone);

  const result = await db
    .prepare(
      `SELECT id, type, message, created_at FROM ticker_events
       WHERE organization_id = ? AND created_at >= datetime('now', '-1 day')
       ORDER BY created_at DESC LIMIT 50`
    )
    .bind(organizationId)
    .all();

  const events = (result.results || [])
    .filter(
      (r) => getDateString(new Date(r.created_at.replace(' ', 'T') + 'Z'), timezone) === todayLocal
    )
    .map((r) => ({
      id: r.id,
      type: r.type,
      message: r.message,
      createdAt: r.created_at,
    }));

  c.header('Cache-Control', 'private, max-age=60, must-revalidate');
  c.header('Vary', 'X-Organization-Id');
  return c.json({ events });
});

/**
 * GET /api/badges/today
 * Celebration events (band-ups, badge awards) from the last 24 hours, joined
 * to the student so the Today tab can show names and honour the class filter.
 * Same source table as the ticker — rows are purged after two days, so the
 * one-day window is always fully covered.
 */
badgesRouter.get('/today', requireReadonly(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');

  const result = await db
    .prepare(
      `SELECT te.id, te.type, te.message, te.created_at, te.student_id,
              s.name AS student_name, s.class_id
       FROM ticker_events te
       LEFT JOIN students s ON te.student_id = s.id AND s.is_active = 1
       WHERE te.organization_id = ? AND te.created_at >= datetime('now', '-1 day')
       ORDER BY te.created_at DESC
       LIMIT 200`
    )
    .bind(organizationId)
    .all();

  const events = (result.results || []).map((r) => ({
    id: r.id,
    type: r.type,
    message: r.message,
    createdAt: r.created_at,
    studentId: r.student_id || null,
    studentName: r.student_name || null,
    classId: r.class_id || null,
  }));

  c.header('Cache-Control', 'private, max-age=60, must-revalidate');
  c.header('Vary', 'X-Organization-Id');
  return c.json({ events });
});

/**
 * GET /api/badges/students/:id
 * Full badge collection for a student: earned, progress, near-misses
 */
badgesRouter.get('/students/:id', requireReadonly(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const { id } = c.req.param();

  // Verify student belongs to org (class name lets key stage resolve when the
  // MIS synced no year group — see classNameToYearGroup)
  const student = await db
    .prepare(
      `SELECT s.id, COALESCE(s.year_group, c.year_group) AS year_group, c.name AS class_name
       FROM students s
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE s.id = ? AND s.organization_id = ? AND s.is_active = 1`
    )
    .bind(id, organizationId)
    .first();
  if (!student) {
    throw notFoundError('Student not found');
  }

  const effectiveYearGroup = student.year_group || classNameToYearGroup(student.class_name);

  // Fetch earned badges and stats in parallel
  const [badgesResult, statsRow] = await Promise.all([
    db
      .prepare('SELECT * FROM student_badges WHERE student_id = ? ORDER BY earned_at DESC')
      .bind(id)
      .all(),
    db.prepare('SELECT * FROM student_reading_stats WHERE student_id = ?').bind(id).first(),
  ]);

  const earned = (badgesResult.results || []).map(rowToBadge);
  const stats = statsRow ? rowToReadingStats(statsRow) : null;
  const earnedBadgeIds = new Set(earned.map((b) => b.badgeId));

  // Calculate near-misses
  const nearMisses = stats ? calculateNearMisses(stats, effectiveYearGroup, earnedBadgeIds) : [];

  // Build progress for all non-secret, non-earned badges
  const keyStage = resolveKeyStage(effectiveYearGroup);
  const context = { keyStage, earnedBadgeIds };
  const allProgress = BADGE_DEFINITIONS.filter((b) => !b.isSecret && !earnedBadgeIds.has(b.id)).map(
    (b) => ({
      badgeId: b.id,
      name: b.name,
      tier: b.tier,
      category: b.category,
      description: b.description,
      ...b.progress(stats || {}, context),
    })
  );

  c.header('Cache-Control', 'private, max-age=30, must-revalidate');
  c.header('Vary', 'X-Organization-Id');
  return c.json({ earned, stats, nearMisses, progress: allProgress });
});

/**
 * POST /api/badges/students/:id/notify
 * Mark badge(s) as notified
 */
badgesRouter.post('/students/:id/notify', requireTeacher(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const { id } = c.req.param();
  const { badgeIds } = await c.req.json();

  if (!Array.isArray(badgeIds) || badgeIds.length === 0) {
    throw badRequestError('badgeIds array required');
  }

  // Update notified flag for matching badges
  const placeholders = badgeIds.map(() => '?').join(',');
  await db
    .prepare(
      `UPDATE student_badges SET notified = 1
       WHERE student_id = ? AND organization_id = ? AND badge_id IN (${placeholders})`
    )
    .bind(id, organizationId, ...badgeIds)
    .run();

  return c.json({ updated: badgeIds.length });
});

/**
 * GET /api/badges/summary
 * Class-wide badge progress: aggregate counts + per-student progress for each badge.
 * Query: ?classId=<id|all|unassigned>
 */
badgesRouter.get('/summary', requireReadonly(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const classId = c.req.query('classId') || 'all';

  // Validate classId when it's a specific class
  if (classId !== 'all' && classId !== 'unassigned') {
    const cls = await db
      .prepare('SELECT id FROM classes WHERE id = ? AND organization_id = ?')
      .bind(classId, organizationId)
      .first();
    if (!cls) throw notFoundError('Class not found');
  }

  // Build student query with class filter
  let studentSql = `
    SELECT s.id, s.name, COALESCE(s.year_group, c.year_group) AS year_group, c.name AS class_name
    FROM students s
    LEFT JOIN classes c ON s.class_id = c.id
    WHERE s.organization_id = ? AND s.is_active = 1`;
  const binds = [organizationId];

  if (classId === 'unassigned') {
    studentSql += ' AND s.class_id IS NULL';
  } else if (classId !== 'all') {
    studentSql += ' AND s.class_id = ?';
    binds.push(classId);
  } else {
    studentSql += ' AND (s.class_id IS NULL OR c.disabled = 0)';
  }
  studentSql += ' ORDER BY s.name ASC';

  const studentsResult = await db
    .prepare(studentSql)
    .bind(...binds)
    .all();
  const students = studentsResult.results || [];

  if (students.length === 0) {
    return c.json({ totalStudents: 0, studentsWithBadges: 0, totalBadgesEarned: 0, badges: [] });
  }

  // Use subqueries to avoid D1 bind parameter limits for large student sets
  const classFilter =
    classId === 'unassigned'
      ? ' AND s.class_id IS NULL'
      : classId !== 'all'
        ? ' AND s.class_id = ?'
        : ' AND (s.class_id IS NULL OR c.disabled = 0)';
  const studentSubquery = `SELECT s.id FROM students s
    LEFT JOIN classes c ON s.class_id = c.id
    WHERE s.organization_id = ? AND s.is_active = 1${classFilter}`;
  const subBinds =
    classId !== 'all' && classId !== 'unassigned' ? [organizationId, classId] : [organizationId];

  const [badgesResult, statsResult] = await Promise.all([
    db
      .prepare(`SELECT * FROM student_badges WHERE student_id IN (${studentSubquery})`)
      .bind(...subBinds)
      .all(),
    db
      .prepare(`SELECT * FROM student_reading_stats WHERE student_id IN (${studentSubquery})`)
      .bind(...subBinds)
      .all(),
  ]);

  // Index badges and stats by student_id
  const badgesByStudent = {};
  for (const b of badgesResult.results || []) {
    (badgesByStudent[b.student_id] ||= []).push(b);
  }
  const statsByStudent = {};
  for (const s of statsResult.results || []) {
    statsByStudent[s.student_id] = rowToReadingStats(s);
  }

  const studentsWithBadgesSet = new Set(Object.keys(badgesByStudent));
  const totalBadgesEarned = (badgesResult.results || []).length;

  // Build per-badge summary
  const nonSecretDefs = BADGE_DEFINITIONS.filter((b) => !b.isSecret);
  const secretDefs = BADGE_DEFINITIONS.filter((b) => b.isSecret);
  const badgeSummaries = [];

  for (const def of nonSecretDefs) {
    const badgeStudents = students.map((s) => {
      const studentBadges = badgesByStudent[s.id] || [];
      const earned = studentBadges.find((b) => b.badge_id === def.id);
      if (earned) {
        return { id: s.id, name: s.name, earned: true, earnedAt: earned.earned_at };
      }
      // Compute progress — authorBookCounts intentionally omitted (too expensive for summary);
      // series_finisher falls back to { current: 0, target: 3 }
      const stats = statsByStudent[s.id] || {};
      const keyStage = resolveKeyStage(s.year_group || classNameToYearGroup(s.class_name));
      const progress = def.progress(stats, { keyStage });
      return {
        id: s.id,
        name: s.name,
        earned: false,
        current: progress.current,
        target: progress.target,
      };
    });

    const earnedCount = badgeStudents.filter((s) => s.earned).length;
    badgeSummaries.push({ badgeId: def.id, earnedCount, students: badgeStudents });
  }

  // Secret badges — only include if any student earned them
  for (const def of secretDefs) {
    const earnedStudents = [];
    for (const s of students) {
      const studentBadges = badgesByStudent[s.id] || [];
      const earned = studentBadges.find((b) => b.badge_id === def.id);
      if (earned) {
        earnedStudents.push({ id: s.id, name: s.name, earned: true, earnedAt: earned.earned_at });
      }
    }
    if (earnedStudents.length > 0) {
      badgeSummaries.push({
        badgeId: def.id,
        earnedCount: earnedStudents.length,
        students: earnedStudents,
      });
    }
  }

  return c.json({
    totalStudents: students.length,
    studentsWithBadges: studentsWithBadgesSet.size,
    totalBadgesEarned,
    badges: badgeSummaries,
  });
});

export default badgesRouter;
