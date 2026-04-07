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

export default badgesRouter;
