/**
 * Student stats aggregation route.
 *
 *   GET /stats — org-wide rollup: session counts, weekly activity, day-of-week
 *                distribution, status distribution, streak leaderboard,
 *                most-liked / least-liked book lists.
 *
 * One handler, ~280 LOC, drives the Stats dashboard. Uses the org's stored
 * timezone so week boundaries match what teachers see locally rather than
 * UTC.
 */

import { Hono } from 'hono';
import { requireReadonly } from '../../middleware/tenant.js';
import { getDB, isMultiTenantMode } from '../../utils/routeHelpers.js';

const statsRouter = new Hono();

statsRouter.get('/stats', requireReadonly(), async (c) => {
  if (!isMultiTenantMode(c)) {
    return c.json({});
  }
  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const { classId, startDate, endDate } = c.req.query();

  // Org timezone (stored as JSON string in org_settings) drives week boundaries
  // and "days since" calculations — without it, a session at 23:30 local
  // would land in tomorrow's bucket on UTC servers.
  let timezone = 'UTC';
  try {
    const tzRow = await db
      .prepare(
        `SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'timezone'`
      )
      .bind(organizationId)
      .first();
    if (tzRow?.setting_value) {
      let parsed;
      try {
        parsed = JSON.parse(tzRow.setting_value);
      } catch {
        parsed = tzRow.setting_value;
      }
      if (typeof parsed === 'string' && parsed.length > 0) timezone = parsed;
    }
  } catch {
    /* use UTC */
  }

  let studentWhere = 's.organization_id = ? AND s.is_active = 1';
  const studentBinds = [organizationId];
  if (classId && classId !== 'all') {
    if (classId === 'unassigned') {
      studentWhere += ' AND s.class_id IS NULL';
    } else {
      studentWhere += ' AND s.class_id = ?';
      studentBinds.push(classId);
    }
  }

  const studentsResult = await db
    .prepare(
      `SELECT s.id, s.last_read_date, s.current_streak, s.longest_streak, s.streak_start_date, s.likes, s.dislikes
       FROM students s
       LEFT JOIN classes c ON s.class_id = c.id
       WHERE ${studentWhere} AND (s.class_id IS NULL OR c.disabled = 0)`
    )
    .bind(...studentBinds)
    .all();

  const studentList = studentsResult.results || [];
  const studentIds = studentList.map((s) => s.id);

  let sessionStats = {
    totalSessions: 0,
    locationDistribution: { home: 0, school: 0 },
    weeklyActivity: { thisWeek: 0, lastWeek: 0 },
    readingByDay: { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 },
    mostReadBooks: [],
  };
  // Track each student's most-recent real (non-marker) session date so we
  // can classify status from actual reading rather than absence markers.
  const studentLastReadMap = new Map();

  let todayStr;
  try {
    todayStr = new Date().toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    todayStr = new Date().toISOString().split('T')[0];
  }
  const todayLocal = new Date(todayStr + 'T00:00:00Z');

  if (studentIds.length > 0) {
    const BIND_LIMIT = 90;
    const locationCounts = { home: 0, school: 0 };
    const dayKeys = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayCounts = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
    const bookCounts = {};
    const startOfWeek = new Date(todayLocal);
    startOfWeek.setUTCDate(todayLocal.getUTCDate() - todayLocal.getUTCDay());
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() - 7);
    const startOfWeekStr = startOfWeek.toISOString().split('T')[0];
    const startOfLastWeekStr = startOfLastWeek.toISOString().split('T')[0];
    let totalSessions = 0;
    let thisWeek = 0;
    let lastWeek = 0;

    const notMarker = `(rs.notes IS NULL OR (rs.notes NOT LIKE '%[ABSENT]%' AND rs.notes NOT LIKE '%[NO_RECORD]%'))`;

    for (let i = 0; i < studentIds.length; i += BIND_LIMIT) {
      const chunk = studentIds.slice(i, i + BIND_LIMIT);
      const ph = chunk.map(() => '?').join(',');
      const dateFilter =
        startDate && endDate ? ' AND rs.session_date >= ? AND rs.session_date <= ?' : '';
      const dateBinds = startDate && endDate ? [startDate, endDate] : [];

      const [aggResult, bookResult, lastReadResult] = await db.batch([
        db
          .prepare(
            `SELECT
              COUNT(*) as total,
              SUM(CASE WHEN rs.location = 'home' THEN 1 ELSE 0 END) as home_count,
              SUM(CASE WHEN rs.location IS NULL OR rs.location = 'school' THEN 1 ELSE 0 END) as school_count,
              SUM(CASE WHEN rs.session_date >= ? THEN 1 ELSE 0 END) as this_week,
              SUM(CASE WHEN rs.session_date >= ? AND rs.session_date < ? THEN 1 ELSE 0 END) as last_week,
              SUM(CASE WHEN strftime('%w', rs.session_date) = '0' THEN 1 ELSE 0 END) as d0,
              SUM(CASE WHEN strftime('%w', rs.session_date) = '1' THEN 1 ELSE 0 END) as d1,
              SUM(CASE WHEN strftime('%w', rs.session_date) = '2' THEN 1 ELSE 0 END) as d2,
              SUM(CASE WHEN strftime('%w', rs.session_date) = '3' THEN 1 ELSE 0 END) as d3,
              SUM(CASE WHEN strftime('%w', rs.session_date) = '4' THEN 1 ELSE 0 END) as d4,
              SUM(CASE WHEN strftime('%w', rs.session_date) = '5' THEN 1 ELSE 0 END) as d5,
              SUM(CASE WHEN strftime('%w', rs.session_date) = '6' THEN 1 ELSE 0 END) as d6
             FROM reading_sessions rs
             WHERE rs.student_id IN (${ph})${dateFilter} AND ${notMarker}`
          )
          .bind(...chunk, ...dateBinds, startOfWeekStr, startOfLastWeekStr, startOfWeekStr),
        db
          .prepare(
            `SELECT b.title, COUNT(*) as cnt
             FROM reading_sessions rs
             LEFT JOIN books b ON rs.book_id = b.id
             WHERE rs.student_id IN (${ph})${dateFilter} AND ${notMarker} AND b.title IS NOT NULL
             GROUP BY b.title`
          )
          .bind(...chunk, ...dateBinds),
        db
          .prepare(
            `SELECT rs.student_id, MAX(rs.session_date) as last_read
             FROM reading_sessions rs
             WHERE rs.student_id IN (${ph})${dateFilter} AND ${notMarker}
               AND COALESCE(rs.location, 'school') = 'school'
             GROUP BY rs.student_id`
          )
          .bind(...chunk, ...dateBinds),
      ]);

      const agg = aggResult.results?.[0];
      if (agg) {
        totalSessions += agg.total || 0;
        locationCounts.home += agg.home_count || 0;
        locationCounts.school += agg.school_count || 0;
        thisWeek += agg.this_week || 0;
        lastWeek += agg.last_week || 0;
        for (let d = 0; d < 7; d++) {
          dayCounts[dayKeys[d]] += agg[`d${d}`] || 0;
        }
      }

      for (const r of bookResult.results || []) {
        bookCounts[r.title] = (bookCounts[r.title] || 0) + r.cnt;
      }

      for (const r of lastReadResult.results || []) {
        const existing = studentLastReadMap.get(r.student_id);
        if (!existing || r.last_read > existing) {
          studentLastReadMap.set(r.student_id, r.last_read);
        }
      }
    }

    const mostReadBooks = Object.entries(bookCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([title, count]) => ({ title, count }));

    sessionStats = {
      totalSessions,
      locationDistribution: locationCounts,
      weeklyActivity: { thisWeek, lastWeek },
      readingByDay: dayCounts,
      mostReadBooks,
    };
  }

  const settingsResult = await db
    .prepare(
      `SELECT setting_value FROM org_settings
       WHERE organization_id = ? AND setting_key = 'readingStatusSettings'`
    )
    .bind(organizationId)
    .first();

  let recentlyReadDays = 3;
  let needsAttentionDays = 7;
  if (settingsResult?.setting_value) {
    try {
      const parsed = JSON.parse(settingsResult.setting_value);
      recentlyReadDays = parsed.recentlyReadDays || 3;
      needsAttentionDays = parsed.needsAttentionDays || 7;
    } catch {
      /* use defaults */
    }
  }

  let studentsWithNoSessions = 0;
  let studentsWithActiveStreak = 0;
  let totalActiveStreakDays = 0;
  let longestCurrentStreak = 0;
  let longestEverStreak = 0;
  const statusCounts = { notRead: 0, needsAttention: 0, recentlyRead: 0 };
  const streakLeaderboard = [];

  for (const s of studentList) {
    const actualLastRead = studentLastReadMap.get(s.id) || null;
    if (!actualLastRead) {
      statusCounts.notRead++;
      studentsWithNoSessions++;
    } else {
      const lastReadDate = new Date(actualLastRead + 'T00:00:00Z');
      const diffDays = Math.floor((todayLocal - lastReadDate) / 86400000);
      if (diffDays <= recentlyReadDays) statusCounts.recentlyRead++;
      else if (diffDays <= needsAttentionDays) statusCounts.needsAttention++;
      else statusCounts.notRead++;
    }

    const cs = s.current_streak || 0;
    const ls = s.longest_streak || 0;
    if (cs > 0) {
      studentsWithActiveStreak++;
      totalActiveStreakDays += cs;
      if (cs > longestCurrentStreak) longestCurrentStreak = cs;
    }
    if (ls > longestEverStreak) longestEverStreak = ls;
    if (cs > 0 || ls > 0) {
      streakLeaderboard.push({
        id: s.id,
        currentStreak: cs,
        longestStreak: ls,
        streakStartDate: s.streak_start_date,
      });
    }
  }

  const topStreaks = streakLeaderboard
    .sort((a, b) => b.currentStreak - a.currentStreak || b.longestStreak - a.longestStreak)
    .slice(0, 5);

  // Aggregate book-title likes/dislikes (stored as JSON arrays per student)
  const likeCounts = {};
  const dislikeCounts = {};
  for (const s of studentList) {
    try {
      const likes = s.likes ? JSON.parse(s.likes) : [];
      for (const title of likes) {
        if (title) likeCounts[title] = (likeCounts[title] || 0) + 1;
      }
    } catch {
      /* skip malformed */
    }
    try {
      const dislikes = s.dislikes ? JSON.parse(s.dislikes) : [];
      for (const title of dislikes) {
        if (title) dislikeCounts[title] = (dislikeCounts[title] || 0) + 1;
      }
    } catch {
      /* skip malformed */
    }
  }

  const mostLikedBooks = Object.entries(likeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, count]) => ({ title, count }));

  const leastLikedBooks = Object.entries(dislikeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, count]) => ({ title, count }));

  c.header('Cache-Control', 'private, max-age=60, must-revalidate');
  return c.json({
    totalStudents: studentList.length,
    ...sessionStats,
    averageSessionsPerStudent:
      studentList.length > 0 ? sessionStats.totalSessions / studentList.length : 0,
    studentsWithNoSessions,
    statusDistribution: statusCounts,
    studentsWithActiveStreak,
    totalActiveStreakDays,
    longestCurrentStreak,
    longestEverStreak,
    averageStreak:
      studentsWithActiveStreak > 0 ? totalActiveStreakDays / studentsWithActiveStreak : 0,
    topStreaks,
    mostLikedBooks,
    leastLikedBooks,
  });
});

export { statsRouter };
