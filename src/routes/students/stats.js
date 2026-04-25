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
    // 90 IDs per IN-clause keeps us comfortably under SQLite's bind ceiling
    const BIND_LIMIT = 90;
    let allSessionRows = [];
    for (let i = 0; i < studentIds.length; i += BIND_LIMIT) {
      const chunk = studentIds.slice(i, i + BIND_LIMIT);
      const placeholders = chunk.map(() => '?').join(',');
      const dateFilter =
        startDate && endDate ? ' AND rs.session_date >= ? AND rs.session_date <= ?' : '';
      const binds = startDate && endDate ? [...chunk, startDate, endDate] : [...chunk];
      const sessResult = await db
        .prepare(
          `SELECT rs.student_id, rs.session_date, rs.location, b.title as book_title
           FROM reading_sessions rs
           LEFT JOIN books b ON rs.book_id = b.id
           WHERE rs.student_id IN (${placeholders})${dateFilter}
             AND (rs.notes IS NULL OR (rs.notes NOT LIKE '%[ABSENT]%' AND rs.notes NOT LIKE '%[NO_RECORD]%'))`
        )
        .bind(...binds)
        .all();
      allSessionRows.push(...(sessResult.results || []));
    }

    const locationCounts = { home: 0, school: 0 };
    const dayCounts = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const bookCounts = {};
    const startOfWeek = new Date(todayLocal);
    startOfWeek.setUTCDate(todayLocal.getUTCDate() - todayLocal.getUTCDay());
    const startOfLastWeek = new Date(startOfWeek);
    startOfLastWeek.setUTCDate(startOfLastWeek.getUTCDate() - 7);
    const startOfWeekStr = startOfWeek.toISOString().split('T')[0];
    const startOfLastWeekStr = startOfLastWeek.toISOString().split('T')[0];
    let thisWeek = 0;
    let lastWeek = 0;

    for (const row of allSessionRows) {
      const loc = row.location || 'school';
      if (locationCounts.hasOwnProperty(loc)) locationCounts[loc]++;
      if (row.session_date) {
        const d = new Date(row.session_date);
        dayCounts[dayNames[d.getUTCDay()]]++;
        // Compare as YYYY-MM-DD strings so timezone doesn't skew week buckets
        if (row.session_date >= startOfWeekStr) thisWeek++;
        else if (row.session_date >= startOfLastWeekStr) lastWeek++;
      }
      if (row.book_title) {
        bookCounts[row.book_title] = (bookCounts[row.book_title] || 0) + 1;
      }
      if (row.student_id && row.session_date) {
        const existing = studentLastReadMap.get(row.student_id);
        if (!existing || row.session_date > existing) {
          studentLastReadMap.set(row.student_id, row.session_date);
        }
      }
    }

    const mostReadBooks = Object.entries(bookCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([title, count]) => ({ title, count }));

    sessionStats = {
      totalSessions: allSessionRows.length,
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
