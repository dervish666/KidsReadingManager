/**
 * Badge engine — stats calculation, real-time evaluation, and batch evaluation.
 *
 * recalculateStats(db, studentId, orgId) — full rebuild from sessions
 * evaluateRealTime(db, studentId, orgId, yearGroup) — check real-time badges
 * evaluateBatch(db, studentId, orgId, yearGroup) — check batch badges
 */

import { generateId } from './helpers.js';
import { D1_BATCH_LIMIT } from './d1Batch.js';
import { buildTickerMessages } from './tickerEvents.js';
import {
  resolveKeyStage,
  getRealtimeBadges,
  getBatchBadges,
  BADGE_DEFINITIONS,
} from './badgeDefinitions.js';
import { classNameToYearGroup } from './yearGroup.js';

// ── Genre Classification ────────────────────────────────────────────────────

export const GENRE_CLASSIFICATION = {
  Adventure: 'fiction',
  Fantasy: 'fiction',
  Mystery: 'fiction',
  'Science Fiction': 'fiction',
  'Realistic Fiction': 'fiction',
  'Historical Fiction': 'fiction',
  Humor: 'fiction',
  'Animal Stories': 'fiction',
  'Fairy Tales': 'fiction',
  'Graphic Novels': 'fiction',
  'Horror/Scary': 'fiction',
  Sports: 'fiction',
  'Non-Fiction': 'nonfiction',
  Biography: 'nonfiction',
  Poetry: 'poetry',
};

export const classifyGenre = (genreName) => GENRE_CLASSIFICATION[genreName] || 'fiction';

// ── Stats Calculation ───────────────────────────────────────────────────────

const isMarkerSession = (notes) =>
  notes && (notes.includes('[ABSENT]') || notes.includes('[NO_RECORD]'));

/**
 * Fetch the platform-wide genre id→name map. Genres are a single global
 * reference table (only the owner role can create/edit them — see
 * src/routes/genres.js — so no cross-tenant write path; reading unscoped
 * is safe). Exposed as a helper so cron paths can fetch once and pass
 * the map into many `recalculateStats` calls instead of re-querying per
 * student. See `recalculateStats` and the cron orchestration in
 * `processBadgesForOrg`.
 *
 * @param {Object} db - D1 database binding
 * @returns {Promise<Map<string, string>>} id → name
 */
export async function fetchGenreNameMap(db) {
  const result = await db.prepare('SELECT id, name FROM genres').all();
  return new Map((result.results || []).map((g) => [g.id, g.name]));
}

/**
 * Recompute a student's reading stats and persist them to
 * `student_reading_stats`. Side-effecting — caller passes a `genreNameMap`
 * if they're already iterating across many students (the nightly badge
 * cron); other callers (per-session POST/PUT/DELETE) can omit it and the
 * function will fetch it lazily.
 */
export async function recalculateStats(db, studentId, organizationId, genreNameMap = null) {
  // Fetch all sessions for the student
  const sessionsResult = await db
    .prepare(
      `SELECT rs.session_date, rs.book_id, rs.duration_minutes, rs.pages_read, rs.notes
       FROM reading_sessions rs
       WHERE rs.student_id = ?
       ORDER BY rs.session_date ASC`
    )
    .bind(studentId)
    .all();
  const sessions = sessionsResult.results || [];

  // Fetch book details for genre/author info
  const booksResult = await db
    .prepare(
      `SELECT DISTINCT b.id, b.author, b.genre_ids
       FROM books b
       INNER JOIN reading_sessions rs ON rs.book_id = b.id
       WHERE rs.student_id = ?`
    )
    .bind(studentId)
    .all();
  const books = booksResult.results || [];
  const bookMap = new Map(books.map((b) => [b.id, b]));

  // Use caller-provided genres map if available (cron hot path); otherwise
  // lazy-fetch (per-request callers don't benefit from hoisting).
  const resolvedGenreMap = genreNameMap ?? (await fetchGenreNameMap(db));

  // Calculate aggregate stats
  const bookIds = new Set();
  const readingDates = new Set(); // dates with real reading (not markers)
  let totalSessions = 0;
  let totalMinutes = 0;
  let totalPages = 0;
  const genreIdSet = new Set();
  const authorSet = new Set();
  let fictionCount = 0;
  let nonfictionCount = 0;
  let poetryCount = 0;

  for (const s of sessions) {
    totalSessions++;
    totalMinutes += s.duration_minutes || 0;
    totalPages += s.pages_read || 0;

    if (!isMarkerSession(s.notes)) {
      readingDates.add(s.session_date);

      if (s.book_id && !bookIds.has(s.book_id)) {
        bookIds.add(s.book_id);
        const book = bookMap.get(s.book_id);
        if (book) {
          if (book.author) authorSet.add(book.author);
          // Parse genre_ids JSON and classify (per-book, not per-genre)
          try {
            const gids = JSON.parse(book.genre_ids || '[]');
            const bookTypes = new Set();
            for (const gid of gids) {
              genreIdSet.add(gid);
              const gname = resolvedGenreMap.get(gid);
              if (gname) bookTypes.add(classifyGenre(gname));
            }
            // Count once per book per type
            if (bookTypes.has('fiction')) fictionCount++;
            if (bookTypes.has('nonfiction')) nonfictionCount++;
            if (bookTypes.has('poetry')) poetryCount++;
          } catch {
            // ignore bad JSON
          }
        }
      }
    }
  }

  // Time-window calculations
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth(); // 0-indexed
  const datesArray = [...readingDates].sort();

  // Days read this week (Mon-Sun containing today)
  const todayDay = now.getUTCDay(); // 0=Sun
  const mondayOffset = todayDay === 0 ? -6 : 1 - todayDay;
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() + mondayOffset);
  const mondayStr = monday.toISOString().slice(0, 10);
  const sundayEnd = new Date(monday);
  sundayEnd.setUTCDate(sundayEnd.getUTCDate() + 6);
  const sundayStr = sundayEnd.toISOString().slice(0, 10);
  const daysReadThisWeek = datesArray.filter((d) => d >= mondayStr && d <= sundayStr).length;

  // Days read this month
  const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
  const nextMonth =
    currentMonth === 11
      ? `${currentYear + 1}-01-01`
      : `${currentYear}-${String(currentMonth + 2).padStart(2, '0')}-01`;
  const daysReadThisMonth = datesArray.filter((d) => d >= monthStart && d < nextMonth).length;

  // Weeks with 4+ days this month
  const weekBuckets = {};
  for (const d of datesArray.filter((d) => d >= monthStart && d < nextMonth)) {
    const dt = new Date(d);
    const dayOfWeek = dt.getUTCDay();
    const weekMondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekMonday = new Date(dt);
    weekMonday.setUTCDate(weekMonday.getUTCDate() + weekMondayOffset);
    const weekKey = weekMonday.toISOString().slice(0, 10);
    weekBuckets[weekKey] = (weekBuckets[weekKey] || 0) + 1;
  }
  const weeksWith4PlusDays = Object.values(weekBuckets).filter((c) => c >= 4).length;

  // Days read this term and weeks with reading (use full dataset for term — simplified to calendar year term)
  // For MVP, "term" = current academic term. We use all dates in the dataset for now.
  const daysReadThisTerm = datesArray.length;
  const termWeekBuckets = {};
  for (const d of datesArray) {
    const dt = new Date(d);
    const dayOfWeek = dt.getUTCDay();
    const weekMondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekMonday = new Date(dt);
    weekMonday.setUTCDate(weekMonday.getUTCDate() + weekMondayOffset);
    const weekKey = weekMonday.toISOString().slice(0, 10);
    termWeekBuckets[weekKey] = true;
  }
  const weeksWithReading = Object.keys(termWeekBuckets).length;

  const stats = {
    totalBooks: bookIds.size,
    totalSessions,
    totalMinutes,
    totalPages,
    genresRead: [...genreIdSet],
    uniqueAuthorsCount: authorSet.size,
    fictionCount,
    nonfictionCount,
    poetryCount,
    daysReadThisWeek,
    daysReadThisTerm,
    daysReadThisMonth,
    weeksWith4PlusDays,
    weeksWithReading,
  };

  // Upsert into student_reading_stats
  await db
    .prepare(
      `INSERT INTO student_reading_stats (
        student_id, organization_id, total_books, total_sessions, total_minutes, total_pages,
        genres_read, unique_authors_count, fiction_count, nonfiction_count, poetry_count,
        days_read_this_week, days_read_this_term, days_read_this_month,
        weeks_with_4plus_days, weeks_with_reading, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(student_id) DO UPDATE SET
        organization_id = excluded.organization_id,
        total_books = excluded.total_books,
        total_sessions = excluded.total_sessions,
        total_minutes = excluded.total_minutes,
        total_pages = excluded.total_pages,
        genres_read = excluded.genres_read,
        unique_authors_count = excluded.unique_authors_count,
        fiction_count = excluded.fiction_count,
        nonfiction_count = excluded.nonfiction_count,
        poetry_count = excluded.poetry_count,
        days_read_this_week = excluded.days_read_this_week,
        days_read_this_term = excluded.days_read_this_term,
        days_read_this_month = excluded.days_read_this_month,
        weeks_with_4plus_days = excluded.weeks_with_4plus_days,
        weeks_with_reading = excluded.weeks_with_reading,
        updated_at = datetime('now')`
    )
    .bind(
      studentId,
      organizationId,
      stats.totalBooks,
      stats.totalSessions,
      stats.totalMinutes,
      stats.totalPages,
      JSON.stringify(stats.genresRead),
      stats.uniqueAuthorsCount,
      stats.fictionCount,
      stats.nonfictionCount,
      stats.poetryCount,
      stats.daysReadThisWeek,
      stats.daysReadThisTerm,
      stats.daysReadThisMonth,
      stats.weeksWith4PlusDays,
      stats.weeksWithReading
    )
    .run();

  return stats;
}

// ── Shared helpers ─────────────────────────────────────────────────────────

function parseStatsRow(statsRow) {
  return {
    totalBooks: statsRow.total_books || 0,
    totalSessions: statsRow.total_sessions || 0,
    totalMinutes: statsRow.total_minutes || 0,
    totalPages: statsRow.total_pages || 0,
    genresRead: JSON.parse(statsRow.genres_read || '[]'),
    uniqueAuthorsCount: statsRow.unique_authors_count || 0,
    fictionCount: statsRow.fiction_count || 0,
    nonfictionCount: statsRow.nonfiction_count || 0,
    poetryCount: statsRow.poetry_count || 0,
    daysReadThisWeek: statsRow.days_read_this_week || 0,
    daysReadThisTerm: statsRow.days_read_this_term || 0,
    daysReadThisMonth: statsRow.days_read_this_month || 0,
    weeksWith4PlusDays: statsRow.weeks_with_4plus_days || 0,
    weeksWithReading: statsRow.weeks_with_reading || 0,
  };
}

// ── Real-time Evaluation ────────────────────────────────────────────────────

export async function evaluateRealTime(db, studentId, organizationId, yearGroup) {
  // Load current stats
  const statsRow = await db
    .prepare('SELECT * FROM student_reading_stats WHERE student_id = ?')
    .bind(studentId)
    .first();
  if (!statsRow) return [];

  const stats = parseStatsRow(statsRow);

  // Load already-earned badge IDs
  const earnedResult = await db
    .prepare('SELECT badge_id FROM student_badges WHERE student_id = ?')
    .bind(studentId)
    .all();
  const earnedBadgeIds = new Set((earnedResult.results || []).map((r) => r.badge_id));

  const keyStage = resolveKeyStage(yearGroup);
  const context = { keyStage, earnedBadgeIds, currentDate: new Date().toISOString().slice(0, 10) };

  const newBadges = [];
  for (const badge of getRealtimeBadges()) {
    if (earnedBadgeIds.has(badge.id)) continue;
    if (badge.evaluate(stats, context)) {
      const badgeRecord = {
        id: generateId(),
        studentId,
        organizationId,
        badgeId: badge.id,
        tier: badge.tier,
      };
      await db
        .prepare(
          `INSERT INTO student_badges (id, student_id, organization_id, badge_id, tier)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(badgeRecord.id, studentId, organizationId, badge.id, badge.tier)
        .run();
      newBadges.push({
        id: badge.id,
        name: badge.name,
        tier: badge.tier,
        unlockMessage: badge.unlockMessage,
        icon: badge.icon,
      });
    }
  }

  return newBadges;
}

// ── Batch Evaluation ────────────────────────────────────────────────────────

export async function evaluateBatch(db, studentId, organizationId, yearGroup) {
  const statsRow = await db
    .prepare('SELECT * FROM student_reading_stats WHERE student_id = ?')
    .bind(studentId)
    .first();
  if (!statsRow) return [];

  const stats = parseStatsRow(statsRow);

  // Load already-earned badge IDs
  const earnedResult = await db
    .prepare('SELECT badge_id FROM student_badges WHERE student_id = ?')
    .bind(studentId)
    .all();
  const earnedBadgeIds = new Set((earnedResult.results || []).map((r) => r.badge_id));

  // Load sessions for session-level badges (secret badges)
  const sessionsResult = await db
    .prepare(
      `SELECT session_date as date, notes FROM reading_sessions
       WHERE student_id = ? AND notes NOT LIKE '%[ABSENT]%' AND notes NOT LIKE '%[NO_RECORD]%'
       ORDER BY session_date DESC`
    )
    .bind(studentId)
    .all();
  const sessions = sessionsResult.results || [];

  // Load per-author book counts for Series Finisher
  const authorResult = await db
    .prepare(
      `SELECT b.author, COUNT(DISTINCT b.id) as book_count
       FROM reading_sessions rs
       INNER JOIN books b ON rs.book_id = b.id
       WHERE rs.student_id = ? AND b.author IS NOT NULL AND b.author != ''
       GROUP BY b.author`
    )
    .bind(studentId)
    .all();
  const authorBookCounts = {};
  for (const r of authorResult.results || []) {
    authorBookCounts[r.author] = r.book_count;
  }

  const keyStage = resolveKeyStage(yearGroup);
  const context = {
    keyStage,
    earnedBadgeIds,
    currentDate: new Date().toISOString().slice(0, 10),
    sessions,
    authorBookCounts,
  };

  const newBadges = [];
  for (const badge of getBatchBadges()) {
    if (earnedBadgeIds.has(badge.id)) continue;
    if (badge.evaluate(stats, context)) {
      const badgeRecord = {
        id: generateId(),
        studentId,
        organizationId,
        badgeId: badge.id,
        tier: badge.tier,
      };
      await db
        .prepare(
          `INSERT INTO student_badges (id, student_id, organization_id, badge_id, tier)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(badgeRecord.id, studentId, organizationId, badge.id, badge.tier)
        .run();
      newBadges.push({
        id: badge.id,
        name: badge.name,
        tier: badge.tier,
      });
    }
  }

  return newBadges;
}

// ── Near-Miss Calculation ───────────────────────────────────────────────────

export function calculateNearMisses(stats, yearGroup, earnedBadgeIds) {
  const keyStage = resolveKeyStage(yearGroup);
  const context = { keyStage, earnedBadgeIds };
  const nearMisses = [];

  for (const badge of BADGE_DEFINITIONS) {
    if (earnedBadgeIds.has(badge.id)) continue;
    if (badge.isSecret) continue; // Don't reveal secret badges
    const { current, target } = badge.progress(stats, context);
    if (target > 0 && current / target >= 0.6) {
      nearMisses.push({
        badgeId: badge.id,
        name: badge.name,
        tier: badge.tier,
        current,
        target,
        remaining: target - current,
      });
    }
  }

  // Sort by closest to completion, cap at 3
  nearMisses.sort((a, b) => a.remaining / a.target - b.remaining / b.target);
  return nearMisses.slice(0, 3);
}

// ── Cron-time per-org processor with budget + cursor ────────────────────────

/**
 * Run badge evaluation for every active student in `orgId`, honouring a
 * deadline and resuming from a stored cursor.
 *
 * Strategy: students are ordered by `id` and filtered to `id > cursor` if
 * a cursor is supplied, so a partial run can resume cleanly on the next
 * cron invocation. The inner loop checks the deadline before every
 * student so we stop *before* exceeding it rather than mid-evaluation.
 *
 * Returns `{ exhausted, lastProcessedId, processedCount, newBadgeCount }`.
 * Caller is responsible for persisting `lastProcessedId` to
 * `organizations.last_badge_cursor` when `exhausted` is true, and clearing
 * the cursor (set NULL) when `exhausted` is false.
 *
 * @param {Object} db - D1 database binding
 * @param {string} orgId - Organization id
 * @param {string|null} cursor - Resume-after student id, or null to start at beginning
 * @param {number} deadlineMs - `Date.now()` value at which to stop
 * @returns {Promise<{exhausted: boolean, lastProcessedId: string|null, processedCount: number, newBadgeCount: number}>}
 */
export async function processBadgesForOrg(db, orgId, cursor, deadlineMs) {
  // ORDER BY s.id is required for the cursor to be deterministic across runs.
  // The cursor predicate uses two binds for the same value because some D1
  // versions reject the same placeholder bound twice — explicit args are
  // safest. (? IS NULL OR s.id > ?) lets us pass cursor=null on first run.
  const students = await db
    .prepare(
      `SELECT DISTINCT s.id, s.name, COALESCE(s.year_group, c.year_group) AS year_group,
              c.name AS class_name
       FROM students s
       INNER JOIN reading_sessions rs ON rs.student_id = s.id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE s.organization_id = ? AND s.is_active = 1
         AND (? IS NULL OR s.id > ?)
       ORDER BY s.id`
    )
    .bind(orgId, cursor, cursor)
    .all();

  // Fetch the platform-wide genres map once per org-run and pass it into
  // every `recalculateStats` call below. Without this hoist, each student
  // triggers a full-table `SELECT id, name FROM genres` scan; at 100 orgs
  // × 500 students × 1k genres = 50M row reads per nightly cron, all of
  // which return identical data. Fetching once collapses that to one scan
  // per org.
  const genreNameMap = await fetchGenreNameMap(db);

  let lastProcessedId = cursor;
  let processedCount = 0;
  let newBadgeCount = 0;
  let exhausted = false;

  const currentDate = new Date().toISOString().slice(0, 10);

  for (const student of students.results || []) {
    if (Date.now() > deadlineMs) {
      exhausted = true;
      break;
    }
    try {
      await recalculateStats(db, student.id, orgId, genreNameMap);

      // Batch-fetch all data needed for both realtime + batch evaluation
      // in a single D1 round-trip (was 6 separate queries before).
      const [statsResult, earnedResult, sessionsResult, authorResult] = await db.batch([
        db.prepare('SELECT * FROM student_reading_stats WHERE student_id = ?').bind(student.id),
        db.prepare('SELECT badge_id FROM student_badges WHERE student_id = ?').bind(student.id),
        db
          .prepare(
            `SELECT session_date as date, notes FROM reading_sessions
             WHERE student_id = ? AND notes NOT LIKE '%[ABSENT]%' AND notes NOT LIKE '%[NO_RECORD]%'
             ORDER BY session_date DESC`
          )
          .bind(student.id),
        db
          .prepare(
            `SELECT b.author, COUNT(DISTINCT b.id) as book_count
             FROM reading_sessions rs
             INNER JOIN books b ON rs.book_id = b.id
             WHERE rs.student_id = ? AND b.author IS NOT NULL AND b.author != ''
             GROUP BY b.author`
          )
          .bind(student.id),
      ]);

      const statsRow = statsResult.results?.[0];
      if (!statsRow) {
        lastProcessedId = student.id;
        processedCount++;
        continue;
      }

      const stats = parseStatsRow(statsRow);
      const earnedBadgeIds = new Set((earnedResult.results || []).map((r) => r.badge_id));
      const sessions = sessionsResult.results || [];
      const authorBookCounts = {};
      for (const r of authorResult.results || []) {
        authorBookCounts[r.author] = r.book_count;
      }

      const keyStage = resolveKeyStage(
        student.year_group || classNameToYearGroup(student.class_name)
      );
      const context = {
        keyStage,
        earnedBadgeIds,
        currentDate,
        sessions,
        authorBookCounts,
      };

      // Evaluate both realtime and batch badges against shared data
      const insertStatements = [];
      const awardedBadges = [];
      const allBadges = [...getRealtimeBadges(), ...getBatchBadges()];
      for (const badge of allBadges) {
        if (earnedBadgeIds.has(badge.id)) continue;
        if (badge.evaluate(stats, context)) {
          awardedBadges.push(badge);
          insertStatements.push(
            db
              .prepare(
                `INSERT INTO student_badges (id, student_id, organization_id, badge_id, tier)
                 VALUES (?, ?, ?, ?, ?)`
              )
              .bind(generateId(), student.id, orgId, badge.id, badge.tier)
          );
        }
      }

      // Overnight awards join the header ticker rotation for the next day
      for (const m of buildTickerMessages(student.name, { newBadges: awardedBadges })) {
        insertStatements.push(
          db
            .prepare(
              `INSERT INTO ticker_events (id, organization_id, student_id, type, message)
               VALUES (?, ?, ?, ?, ?)`
            )
            .bind(generateId(), orgId, student.id, m.type, m.message)
        );
      }

      // Batch-insert all earned badges + ticker events in one round-trip
      if (insertStatements.length > 0) {
        for (let i = 0; i < insertStatements.length; i += D1_BATCH_LIMIT) {
          await db.batch(insertStatements.slice(i, i + D1_BATCH_LIMIT));
        }
        newBadgeCount += awardedBadges.length;
      }

      lastProcessedId = student.id;
      processedCount++;
    } catch (err) {
      console.error(`[Cron] Badge evaluation error for student ${student.id}:`, err.message);
    }
  }

  return { exhausted, lastProcessedId, processedCount, newBadgeCount };
}
