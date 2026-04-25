/**
 * Shared helpers for the student route modules.
 *
 * The students surface area is split across several files for readability —
 * core CRUD, sessions, stats, streak, bulk, gdpr — and these helpers are
 * imported wherever they're needed. They were inlined in students.js before
 * the split.
 */

import { generateId } from '../../utils/helpers.js';
import { calculateStreak } from '../../utils/streakCalculator.js';

/**
 * Fetch student preferences from the student_preferences table.
 *
 * Returns favorite genre IDs plus likes/dislikes denormalised onto the
 * students row. The student_preferences table is genre-scoped only;
 * book-title likes/dislikes live on students.likes / students.dislikes.
 */
export const fetchStudentPreferences = async (db, studentId) => {
  const result = await db
    .prepare(
      `SELECT sp.genre_id, sp.preference_type, g.name as genre_name
       FROM student_preferences sp
       LEFT JOIN genres g ON sp.genre_id = g.id
       WHERE sp.student_id = ?`
    )
    .bind(studentId)
    .all();

  const preferences = {
    favoriteGenreIds: [],
    likes: [],
    dislikes: [],
  };

  for (const row of result.results || []) {
    if (row.preference_type === 'favorite') {
      preferences.favoriteGenreIds.push(row.genre_id);
    } else if (row.preference_type === 'like') {
      preferences.likes.push(row.genre_name || row.genre_id);
    } else if (row.preference_type === 'dislike') {
      preferences.dislikes.push(row.genre_name || row.genre_id);
    }
  }

  return preferences;
};

/**
 * Save genre-favourite preferences. Replaces the existing rows wholesale —
 * callers compute the desired set and pass it in. Book-title likes/dislikes
 * are stored separately on the students row.
 */
export const saveStudentPreferences = async (db, studentId, preferences) => {
  if (!preferences) return;

  await db.prepare(`DELETE FROM student_preferences WHERE student_id = ?`).bind(studentId).run();

  const statements = [];

  if (preferences.favoriteGenreIds && Array.isArray(preferences.favoriteGenreIds)) {
    for (const genreId of preferences.favoriteGenreIds) {
      statements.push(
        db
          .prepare(
            `INSERT INTO student_preferences (id, student_id, genre_id, preference_type)
             VALUES (?, ?, ?, 'favorite')`
          )
          .bind(generateId(), studentId, genreId)
      );
    }
  }

  if (statements.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < statements.length; i += batchSize) {
      const batch = statements.slice(i, i + batchSize);
      await db.batch(batch);
    }
  }
};

/**
 * Get streak settings (gracePeriodDays + timezone) for an organization.
 *
 * KV-cached with a 1-hour TTL. tenantMiddleware only caches
 * is_active/subscription_status, so we still need a separate cache layer
 * here to keep the per-session-write streak update off the D1 hot path.
 */
export const getOrgStreakSettings = async (db, organizationId, env) => {
  const cacheKey = `org-streak-settings:${organizationId}`;
  const KV = env?.READING_MANAGER_KV;

  if (KV) {
    try {
      const cached = await KV.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      /* KV read failed — fall through to D1 */
    }
  }

  const [gracePeriodResult, timezoneResult] = await db.batch([
    db
      .prepare(
        `SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'streakGracePeriodDays'`
      )
      .bind(organizationId),
    db
      .prepare(
        `SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'timezone'`
      )
      .bind(organizationId),
  ]);

  let gracePeriodDays = 1;
  if (gracePeriodResult.results?.[0]?.setting_value) {
    try {
      gracePeriodDays = parseInt(JSON.parse(gracePeriodResult.results[0].setting_value), 10);
    } catch {
      /* use default */
    }
  }

  let timezone = 'UTC';
  if (timezoneResult.results?.[0]?.setting_value) {
    try {
      timezone = JSON.parse(timezoneResult.results[0].setting_value);
    } catch {
      timezone = timezoneResult.results[0].setting_value;
    }
  }

  const settings = { gracePeriodDays, timezone };

  if (KV) {
    try {
      await KV.put(cacheKey, JSON.stringify(settings), { expirationTtl: 3600 });
    } catch {
      /* KV write failed — non-critical */
    }
  }

  return settings;
};

/**
 * Recalculate and persist a student's streak from their reading sessions.
 *
 * Called after any session create/update/delete. Excludes marker rows
 * ([ABSENT]/[NO_RECORD]) so absences don't extend streaks.
 */
export const updateStudentStreak = async (db, studentId, organizationId, env) => {
  const sessions = await db
    .prepare(
      `SELECT session_date as date FROM reading_sessions
       WHERE student_id = ?
         AND (notes IS NULL OR (notes NOT LIKE '%[ABSENT]%' AND notes NOT LIKE '%[NO_RECORD]%'))
       ORDER BY session_date DESC`
    )
    .bind(studentId)
    .all();

  const { gracePeriodDays, timezone } = await getOrgStreakSettings(db, organizationId, env || {});

  const streakData = calculateStreak(sessions.results || [], {
    gracePeriodDays,
    timezone,
  });

  await db
    .prepare(
      `UPDATE students SET
         current_streak = ?,
         longest_streak = ?,
         streak_start_date = ?,
         updated_at = datetime("now")
       WHERE id = ?`
    )
    .bind(streakData.currentStreak, streakData.longestStreak, streakData.streakStartDate, studentId)
    .run();

  return streakData;
};
