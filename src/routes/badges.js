/**
 * Badge routes — GET /api/students/:id/badges, POST /api/students/:id/badges/notify
 *
 * These are registered under /api/badges in worker.js but use student ID params.
 * Alternatively, these could live in students.js — but a separate file keeps
 * the badge logic contained.
 */

import { Hono } from 'hono';
import { requireReadonly, requireTeacher } from '../middleware/tenant.js';
import { requireDB } from '../utils/routeHelpers.js';
import { rowToBadge, rowToReadingStats } from '../utils/rowMappers.js';
import { BADGE_DEFINITIONS, resolveKeyStage } from '../utils/badgeDefinitions.js';
import { calculateNearMisses } from '../utils/badgeEngine.js';

const badgesRouter = new Hono();

/**
 * GET /api/badges/students/:id
 * Full badge collection for a student: earned, progress, near-misses
 */
badgesRouter.get('/students/:id', requireReadonly(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const { id } = c.req.param();

  // Verify student belongs to org
  const student = await db
    .prepare(
      'SELECT id, year_group FROM students WHERE id = ? AND organization_id = ? AND is_active = 1'
    )
    .bind(id, organizationId)
    .first();
  if (!student) {
    return c.json({ error: 'Student not found' }, 404);
  }

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
  const nearMisses = stats ? calculateNearMisses(stats, student.year_group, earnedBadgeIds) : [];

  // Build progress for all non-secret, non-earned badges
  const keyStage = resolveKeyStage(student.year_group);
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
    return c.json({ error: 'badgeIds array required' }, 400);
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
    if (!cls) return c.json({ error: 'Class not found' }, 404);
  }

  // Build student query with class filter
  let studentSql = `
    SELECT s.id, s.name, s.year_group
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
      const keyStage = resolveKeyStage(s.year_group);
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
