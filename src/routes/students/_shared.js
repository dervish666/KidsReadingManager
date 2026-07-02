/**
 * Shared helpers for the student route modules.
 *
 * The students surface area is split across several files for readability —
 * core CRUD, sessions, stats, streak, bulk, gdpr — and these helpers are
 * imported wherever they're needed. They were inlined in students.js before
 * the split.
 */

import { generateId } from '../../utils/helpers.js';
import { D1_BATCH_LIMIT } from '../../utils/d1Batch.js';
import { calculateStreak, getDateString } from '../../utils/streakCalculator.js';
import { recalculateStats, evaluateRealTime } from '../../utils/badgeEngine.js';
import { recordSessionTickerEvents } from '../../utils/tickerEvents.js';
import { bumpClassGoalsOnSessions } from '../../utils/classGoalsEngine.js';
import {
  countReads,
  computeBandIndex,
  academicYearStart,
  bandTransition,
} from '../../utils/readingBandEngine.js';
import {
  DEFAULT_READS_PER_BAND,
  DEFAULT_BANDS,
  resolveBands,
  MIN_BANDS,
  MAX_BANDS,
} from '../../utils/readingBandDefinitions.js';

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
    const batchSize = D1_BATCH_LIMIT;
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

// A band list is usable if it sits within the configurable bounds; out-of-bounds
// or unparseable values fall back to the default ladder.
const bandsInBounds = (list) =>
  Array.isArray(list) && list.length >= MIN_BANDS && list.length <= MAX_BANDS;

/**
 * Reads-per-band threshold and the band list ({ name, color }) for an org.
 * KV-cached (1h), mirroring getOrgStreakSettings — keeps the per-session-write
 * band update off the D1 hot path. Stored as `readsPerBand` and `bands` keys in
 * org_settings; honours the legacy colour-only `bands`/`bandColors` form for
 * schools that customised colours before names/count were configurable.
 */
export const getOrgBandSettings = async (db, organizationId, env) => {
  // v2 key: the cached shape changed from { bandColors } to { bands }.
  const cacheKey = `org-band-settings-v2:${organizationId}`;
  const KV = env?.READING_MANAGER_KV;

  if (KV) {
    try {
      const cached = await KV.get(cacheKey);
      if (cached) {
        const parsedCache = JSON.parse(cached);
        if (!bandsInBounds(parsedCache.bands)) {
          parsedCache.bands = DEFAULT_BANDS;
        }
        return parsedCache;
      }
    } catch (err) {
      // Fall through to D1 — but surface it: a persistently failing KV
      // namespace silently puts every session write on the D1 hot path.
      console.warn('[band-settings] KV cache read failed:', err?.message);
    }
  }

  const [rpbRes, bandsRes, colorsRes] = await db.batch([
    db
      .prepare(
        `SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'readsPerBand'`
      )
      .bind(organizationId),
    db
      .prepare(
        `SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'bands'`
      )
      .bind(organizationId),
    db
      .prepare(
        `SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'bandColors'`
      )
      .bind(organizationId),
  ]);

  let readsPerBand = DEFAULT_READS_PER_BAND;
  const rpbRow = rpbRes?.results?.[0];
  if (rpbRow?.setting_value) {
    try {
      const parsed = parseInt(JSON.parse(rpbRow.setting_value), 10);
      if (parsed > 0) readsPerBand = parsed;
    } catch {
      /* default */
    }
  }

  // Prefer the new `bands` setting; fall back to legacy `bandColors` (colour-only
  // array — resolveBands zips ladder names); else the default ladder.
  const readBands = (row) => {
    if (!row?.setting_value) return null;
    try {
      const parsed = JSON.parse(row.setting_value);
      const resolved = resolveBands(parsed);
      return bandsInBounds(resolved) ? resolved : null;
    } catch {
      return null;
    }
  };
  const bands =
    readBands(bandsRes?.results?.[0]) || readBands(colorsRes?.results?.[0]) || DEFAULT_BANDS;

  const settings = { readsPerBand, bands };
  if (KV) {
    try {
      await KV.put(cacheKey, JSON.stringify(settings), { expirationTtl: 3600 });
    } catch (err) {
      // Non-critical (D1 stays authoritative) but must not fail silently.
      console.warn('[band-settings] KV cache write failed:', err?.message);
    }
  }
  return settings;
};

/**
 * Recompute and persist a student's reading band from this academic year's
 * reads. Called after any session create/update/delete. Returns a `bandUp`
 * transition object when the band INCREASED (for celebration), else null.
 */
export const updateStudentBand = async (db, studentId, organizationId, env, { timezone } = {}) => {
  const { readsPerBand, bands } = await getOrgBandSettings(db, organizationId, env || {});
  const tz = timezone || 'UTC';
  const yearStart = academicYearStart(getDateString(new Date(), tz));

  const prevRow = await db
    .prepare('SELECT current_band, baseline_reads, baseline_year_start FROM students WHERE id = ?')
    .bind(studentId)
    .first();
  const previousBand = prevRow?.current_band || 0;

  // Mid-year onboarding baseline (reads carried over from a previous system).
  // It only counts for the academic year it was entered in: once the stored
  // baseline_year_start no longer matches the current year, the baseline is
  // stale — drop it from the count AND clear it so it never lingers into a new
  // year (mirrors the band_year_start reset).
  const baselineStale = prevRow?.baseline_year_start && prevRow.baseline_year_start !== yearStart;
  const baselineReads = baselineStale ? 0 : prevRow?.baseline_reads || 0;
  const baselineYearStart = baselineStale ? null : (prevRow?.baseline_year_start ?? null);

  const rows = await db
    .prepare(`SELECT notes FROM reading_sessions WHERE student_id = ? AND session_date >= ?`)
    .bind(studentId, yearStart)
    .all();

  const readsCount = countReads(rows.results || []) + baselineReads;
  const currentBand = computeBandIndex(readsCount, readsPerBand, bands.length);

  await db
    .prepare(
      `UPDATE students SET band_reads_count = ?, current_band = ?, band_year_start = ?,
         baseline_reads = ?, baseline_year_start = ?,
         updated_at = datetime("now") WHERE id = ?`
    )
    .bind(readsCount, currentBand, yearStart, baselineReads, baselineYearStart, studentId)
    .run();

  const bandUp =
    currentBand > previousBand ? bandTransition(previousBand, currentBand, bands) : null;
  return { previousBand, currentBand, readsCount, bandUp };
};

/**
 * Set a student's mid-year baseline reads and recompute their band.
 *
 * Stamps baseline_year_start to the current academic year so the baseline only
 * applies this year (auto-drops at the September rollover via updateStudentBand),
 * then recomputes the band so band_reads_count/current_band reflect it
 * immediately. Returns the band recompute result (incl. any `bandUp`).
 */
export const setStudentBaselineReads = async (
  db,
  studentId,
  organizationId,
  env,
  value,
  { timezone } = {}
) => {
  const tz = timezone || 'UTC';
  const yearStart = academicYearStart(getDateString(new Date(), tz));
  const reads = Math.max(0, Math.floor(Number(value) || 0));

  await db
    .prepare(
      `UPDATE students SET baseline_reads = ?, baseline_year_start = ?,
         updated_at = datetime("now") WHERE id = ? AND organization_id = ?`
    )
    .bind(reads, yearStart, studentId, organizationId)
    .run();

  return updateStudentBand(db, studentId, organizationId, env, { timezone: tz });
};

/**
 * Run the post-create session side-effect chain — the single source of truth
 * shared by the teacher route (students/sessions.js) and the parent portal
 * (parent.js). Core session writes must already be committed; everything here
 * is best-effort (a failure is logged, never thrown) because the nightly cron
 * reconciles streaks/stats/badges/goals.
 *
 * Ordering: streak, stats, class goals and band write disjoint tables and run
 * concurrently; badge evaluation reads the freshly-written stats row, so it
 * runs after. Marker sessions ([ABSENT]/[NO_RECORD]) skip goals/band/badges.
 *
 * @param {object} db
 * @param {object} env - Worker env (KV settings cache)
 * @param {object} opts
 * @param {string} opts.studentId
 * @param {string} opts.organizationId
 * @param {string|null} [opts.yearGroup] - for badge key-stage resolution
 * @param {boolean} [opts.isMarkerSession]
 * @param {string|null} [opts.timezone] - pass when already fetched (saves a KV read)
 * @param {Array<{id: string, date: string, bookId?: string|null, isMarker?: boolean}>} [opts.newSessions]
 *   The just-inserted sessions, for the incremental class-goal bump.
 * @param {string} [opts.logPrefix]
 * @param {object} [opts.logContext] - extra fields for error logs (e.g. sessionId)
 * @returns {Promise<{streakData?: object, completedGoals: Array, bandResult?: object, bandUp: object|null, newBadges: Array}>}
 */
export const runSessionSideEffects = async (
  db,
  env,
  {
    studentId,
    organizationId,
    yearGroup = null,
    isMarkerSession = false,
    timezone = null,
    newSessions = null,
    logPrefix = 'sessions',
    logContext = {},
  }
) => {
  const runSafe = async (label, fn) => {
    try {
      return await fn();
    } catch (err) {
      console.error(`[${logPrefix}] ${label} failed`, { studentId, ...logContext, err });
      return undefined;
    }
  };

  const [streakData, , completedGoalsResult, bandResult] = await Promise.all([
    runSafe('streak update', () => updateStudentStreak(db, studentId, organizationId, env)),
    runSafe('stats recalc', () => recalculateStats(db, studentId, organizationId)),
    isMarkerSession
      ? Promise.resolve(undefined)
      : runSafe('class goal update', () =>
          bumpClassGoalsOnSessions(db, studentId, organizationId, newSessions || [])
        ),
    isMarkerSession
      ? Promise.resolve(undefined)
      : runSafe('band update', () =>
          updateStudentBand(db, studentId, organizationId, env, { timezone })
        ),
  ]);

  let newBadges = [];
  if (!isMarkerSession) {
    newBadges =
      (await runSafe('badge evaluation', () =>
        evaluateRealTime(db, studentId, organizationId, yearGroup)
      )) || [];
  }

  const bandUp = bandResult?.bandUp || null;
  if (bandUp || newBadges.length > 0) {
    await runSafe('ticker events', () =>
      recordSessionTickerEvents(db, organizationId, studentId, { bandUp, newBadges })
    );
  }

  return {
    streakData,
    completedGoals: completedGoalsResult || [],
    bandResult,
    bandUp,
    newBadges,
  };
};

/**
 * Ensure a student's stored band matches the CURRENT academic year. If the
 * stored band_year_start is stale (new year) or never computed, recompute.
 * Used by read paths (parent portal, student detail) so the yearly reset
 * happens lazily without a cron. Never celebrates (drops/first-compute are silent).
 */
export const ensureCurrentBand = async (db, studentRow, organizationId, env, { timezone } = {}) => {
  const tz = timezone || 'UTC';
  const yearStart = academicYearStart(getDateString(new Date(), tz));
  if (studentRow.band_year_start === yearStart) {
    return {
      currentBand: studentRow.current_band || 0,
      bandReadsCount: studentRow.band_reads_count || 0,
      recomputed: false,
    };
  }
  const r = await updateStudentBand(db, studentRow.id, organizationId, env, { timezone: tz });
  return { currentBand: r.currentBand, bandReadsCount: r.readsCount, recomputed: true };
};
