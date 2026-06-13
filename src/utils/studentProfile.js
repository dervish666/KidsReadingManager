/**
 * Student Profile Builder
 * Builds a comprehensive reading profile for a student including:
 * - Basic info (name, level, age)
 * - Explicit preferences (favorite genres, likes, dislikes)
 * - Inferred preferences (genres from reading history)
 * - Reading history (recent reads, all read book IDs)
 */

import { parseGenreIds } from './helpers.js';

/**
 * Build a comprehensive student reading profile
 * @param {string} studentId - The student's ID
 * @param {string} organizationId - The organization's ID
 * @param {Object} db - D1 database binding
 * @returns {Promise<Object|null>} Student profile or null if not found
 */
export async function buildStudentReadingProfile(studentId, organizationId, db) {
  // 1. Get student basic info
  const student = await db
    .prepare(
      `
    SELECT s.id, s.name, s.reading_level, s.reading_level_min, s.reading_level_max, s.age_range,
           s.likes, s.dislikes, s.notes, s.date_of_birth, s.gender, s.first_language,
           s.eal_detailed_status, s.year_group, c.name AS class_name
    FROM students s
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE s.id = ? AND s.organization_id = ?
  `
    )
    .bind(studentId, organizationId)
    .first();

  if (!student) {
    return null;
  }

  // 2. Get explicit preferences (favorite genres from student_preferences table)
  const preferencesResult = await db
    .prepare(
      `
    SELECT sp.genre_id, g.name as genre_name, sp.preference_type
    FROM student_preferences sp
    LEFT JOIN genres g ON sp.genre_id = g.id
    WHERE sp.student_id = ?
  `
    )
    .bind(studentId)
    .all();

  const favoriteGenreIds = [];
  const favoriteGenreNames = [];

  for (const row of preferencesResult.results || []) {
    if (row.preference_type === 'favorite') {
      favoriteGenreIds.push(row.genre_id);
      if (row.genre_name) {
        favoriteGenreNames.push(row.genre_name);
      }
    }
  }

  // 3. Get reading history with book details
  const sessionsResult = await db
    .prepare(
      `
    SELECT DISTINCT rs.book_id, b.title, b.author, b.genre_ids, rs.session_date
    FROM reading_sessions rs
    LEFT JOIN books b ON rs.book_id = b.id
    WHERE rs.student_id = ? AND rs.book_id IS NOT NULL
    ORDER BY rs.session_date DESC
  `
    )
    .bind(studentId)
    .all();

  const sessions = sessionsResult.results || [];
  const readBookIds = sessions.map((s) => s.book_id).filter(Boolean);

  // Recent reads (last 5 with titles)
  const recentReads = sessions
    .filter((s) => s.title)
    .slice(0, 5)
    .map((s) => ({
      title: s.title,
      author: s.author,
    }));

  // 4. Infer favorite genres from reading history
  const genreCounts = {};
  for (const session of sessions) {
    if (session.genre_ids) {
      const genreIds = parseGenreIds(session.genre_ids);
      for (const genreId of genreIds) {
        genreCounts[genreId] = (genreCounts[genreId] || 0) + 1;
      }
    }
  }

  // Sort by count and take top 3
  const sortedGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Get genre names for inferred genres
  let inferredGenres = [];
  if (sortedGenres.length > 0) {
    const genreIds = sortedGenres.map(([id]) => id);
    const placeholders = genreIds.map(() => '?').join(',');
    const genreNamesResult = await db
      .prepare(
        `
      SELECT id, name FROM genres WHERE id IN (${placeholders})
    `
      )
      .bind(...genreIds)
      .all();

    const genreNameMap = {};
    for (const row of genreNamesResult.results || []) {
      genreNameMap[row.id] = row.name;
    }

    // Only include genres that have a valid name (filter out invalid IDs like book UUIDs)
    inferredGenres = sortedGenres
      .filter(([id]) => genreNameMap[id])
      .map(([id, count]) => ({
        id,
        name: genreNameMap[id],
        count,
      }));
  }

  // Parse likes/dislikes from JSON strings
  let likes, dislikes;

  try {
    likes = student.likes ? JSON.parse(student.likes) : [];
  } catch {
    likes = [];
  }

  try {
    dislikes = student.dislikes ? JSON.parse(student.dislikes) : [];
  } catch {
    dislikes = [];
  }

  return {
    student: {
      id: student.id,
      readingLevel: student.reading_level || null,
      readingLevelMin: student.reading_level_min ?? null,
      readingLevelMax: student.reading_level_max ?? null,
      ageRange: student.age_range || null,
      notes: student.notes,
      age: student.date_of_birth
        ? Math.floor(
            (Date.now() - new Date(student.date_of_birth).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000)
          )
        : null,
      gender: student.gender || null,
      firstLanguage: student.first_language || null,
      ealDetailedStatus: student.eal_detailed_status || null,
      // Fall back to the class name when the MIS didn't sync a year group.
      // Some Wonde connections (registration-groups schools like Cheddar Grove)
      // return no education data, so year_group is empty — but the class name
      // usually encodes the NC year ("5D" → Year 5, "RF" → Reception).
      yearGroup: student.year_group || classNameToYearGroup(student.class_name),
    },
    preferences: {
      favoriteGenreIds,
      favoriteGenreNames,
      likes,
      dislikes,
    },
    inferredGenres,
    recentReads,
    readBookIds,
    booksReadCount: readBookIds.length,
  };
}

/**
 * Map a UK year group to a coarse, approximate age band.
 *
 * Tally syncs `year_group` from Wonde's `current_nc_year` (National Curriculum
 * year), which is a bare code: "R" for Reception, "1".."13" for school years,
 * "N1"/"N2" for nursery. Other places in this codebase store it differently
 * ("Year 2", "Y2"), so we parse defensively rather than assuming one format.
 *
 * Returns a coarse two-year band ({ min, max }) — never an exact age. A child
 * in Year N is age (N+4) at the September start of the school year and turns
 * (N+5) during it, so the band is [N+4, N+5]. This band is the ONLY age signal
 * that crosses the AI boundary (see toAISafeProfile): it's the granularity
 * needed to keep recommended content age-appropriate, without exposing DOB,
 * exact age, or the raw year group.
 *
 * @param {string|number|null} yearGroup
 * @returns {{min: number, max: number}|null} Age band, or null if unparseable
 */
export function yearGroupToAgeBand(yearGroup) {
  if (yearGroup == null) return null;
  const raw = String(yearGroup).trim().toLowerCase();
  if (!raw) return null;

  // Nursery (Wonde "N1"/"N2", or "nursery")
  if (raw.includes('nursery') || /^n\d*$/.test(raw)) {
    return { min: 3, max: 4 };
  }

  // Reception (Wonde "R", or "YR"/"reception")
  if (raw.includes('reception') || raw === 'r' || raw === 'yr') {
    return { min: 4, max: 5 };
  }

  // Numeric school year — pull the first integer from "2", "Year 2", "Y2", "yr 2"
  const match = raw.match(/\d+/);
  if (!match) return null;
  const year = parseInt(match[0], 10);
  if (!Number.isInteger(year) || year < 0 || year > 13) return null;
  if (year === 0) return { min: 4, max: 5 }; // Reception expressed as Year 0

  return { min: year + 4, max: year + 5 };
}

/**
 * Best-effort UK year group from a class / registration-group name.
 *
 * Some Wonde connections (registration-groups schools) return no education
 * data, leaving `students.year_group` empty — but the class name usually
 * encodes the year: "5D" → "5", "6A" → "6", "RF"/"RJM" → "R" (Reception).
 * Tree/colour-named classes ("Willow", "Cherry") carry no year and return
 * null. Output is a year-group token suitable for yearGroupToAgeBand(); this
 * is only ever a fallback when the real year group is missing.
 *
 * @param {string|null} className
 * @returns {string|null} Year-group token ("5", "R", …), or null if not derivable
 */
export function classNameToYearGroup(className) {
  if (className == null) return null;
  const raw = String(className).trim().toLowerCase();
  if (!raw) return null;

  // Leading school-year number, optionally "y"/"year" prefixed: "5d", "y5", "year 5"
  const yearMatch = raw.match(/^(?:year\s*|y)?(\d{1,2})/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    if (year >= 1 && year <= 13) return String(year);
    if (year === 0) return 'R'; // Reception expressed as "0…"
    return null;
  }

  // Reception registration groups: "rf", "rjm", "r" (leading R, then only letters)
  if (/^r[a-z]*$/.test(raw)) return 'R';

  return null;
}

/**
 * Strip demographic fields from a student-reading profile before sending to
 * an external AI provider.
 *
 * Tally is a children's-data product. The full profile carries DOB-derived
 * `age`, `gender`, `firstLanguage`, `ealDetailedStatus`, `yearGroup`,
 * `ageRange`, free-text `notes`, and the student `id` — none of which the
 * AI needs to recommend appropriate books. Reading level + genre + reading
 * history is sufficient. Stripping these fields at the boundary means a
 * future commit that adds them to the prompt template can't accidentally
 * exfiltrate them.
 *
 * One deliberate exception: a coarse `ageBand` ({ min, max }, a two-year span)
 * derived from the year group IS forwarded. Reading level governs difficulty
 * but not the maturity of themes/content, so without an age signal the AI was
 * recommending books a year or two too old. The band is intentionally coarse
 * and non-identifying — the raw year group, DOB and exact age never cross.
 *
 * @param {Object} profile - Output of buildStudentReadingProfile()
 * @returns {Object} A profile with the same shape but no demographic data
 */
export function toAISafeProfile(profile) {
  if (!profile) return profile;

  const { student, preferences, inferredGenres, recentReads, readBookIds, booksReadCount } =
    profile;

  return {
    student: {
      readingLevel: student?.readingLevel ?? null,
      readingLevelMin: student?.readingLevelMin ?? null,
      readingLevelMax: student?.readingLevelMax ?? null,
      ageBand: yearGroupToAgeBand(student?.yearGroup),
    },
    preferences: {
      favoriteGenreIds: preferences?.favoriteGenreIds ?? [],
      favoriteGenreNames: preferences?.favoriteGenreNames ?? [],
      likes: preferences?.likes ?? [],
      dislikes: preferences?.dislikes ?? [],
    },
    inferredGenres: (inferredGenres ?? []).map((g) => ({ name: g.name, count: g.count })),
    recentReads: (recentReads ?? []).map((b) => ({ title: b.title, author: b.author })),
    readBookIds: readBookIds ?? [],
    booksReadCount: booksReadCount ?? 0,
  };
}
