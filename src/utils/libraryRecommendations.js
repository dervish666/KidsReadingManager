/**
 * Library recommendation matching — pure DB logic, no auth/HTTP context.
 *
 * Finds books from a school's own catalogue that suit a student: filtered by
 * the student's reading-level range (adjusted for focus mode), excluding
 * already-read and disliked titles, then scored by genre affinity and level
 * fit. Used by both the teacher endpoint (`GET /api/books/library-search`,
 * JWT-authed) and the parent portal (`GET /api/parent/:token/book-ideas`,
 * token-authed) so the two can never drift.
 *
 * Deterministic and cheap (a handful of D1 queries) — safe to run live on the
 * public parent endpoint, unlike AI suggestions.
 */

import { buildStudentReadingProfile } from './studentProfile.js';
import { parseGenreIds } from './helpers.js';

/**
 * @param {D1Database} db
 * @param {Object} opts
 * @param {string} opts.studentId
 * @param {string} opts.organizationId
 * @param {string} [opts.focusMode] - 'balanced' | 'consolidation' | 'challenge'
 * @param {number} [opts.limit] - max books to return (default 10)
 * @returns {Promise<{books: Object[], studentProfile: Object}|null>} null if student not found
 */
export async function computeLibraryRecommendations(
  db,
  { studentId, organizationId, focusMode = 'balanced', limit = 10 }
) {
  const profile = await buildStudentReadingProfile(studentId, organizationId, db);
  if (!profile) return null;

  const { student, preferences, inferredGenres, readBookIds } = profile;

  // Base query — scoped to the org's own catalogue via org_book_selections,
  // preferring the per-org reading-level override over the global value.
  let query = `
    SELECT DISTINCT b.id, b.title, b.author,
      COALESCE(obs.reading_level_override, b.reading_level) AS reading_level,
      b.age_range, b.genre_ids, b.description,
      b.isbn, b.page_count, b.series_name, b.series_number, b.publication_year
    FROM books b
    INNER JOIN org_book_selections obs ON b.id = obs.book_id AND obs.organization_id = ?
    WHERE 1=1
  `;
  const params = [organizationId];

  // Reading-level range, narrowed by focus mode (consolidation → lower half,
  // challenge → upper half).
  const minLevel = student.readingLevelMin;
  const maxLevel = student.readingLevelMax;
  let effectiveMin = minLevel;
  let effectiveMax = maxLevel;
  if (minLevel !== null && maxLevel !== null) {
    const midpoint = (minLevel + maxLevel) / 2;
    if (focusMode === 'consolidation') {
      effectiveMax = midpoint;
    } else if (focusMode === 'challenge') {
      effectiveMin = midpoint;
    }
  }

  if (effectiveMin !== null && effectiveMax !== null) {
    query += ` AND (COALESCE(obs.reading_level_override, b.reading_level) IS NULL OR (
      CAST(COALESCE(obs.reading_level_override, b.reading_level) AS REAL) >= ?
      AND CAST(COALESCE(obs.reading_level_override, b.reading_level) AS REAL) <= ?
    ))`;
    params.push(effectiveMin, effectiveMax);
  }

  // Exclude already-read books (chunked to stay within SQLite's 999-bind limit).
  if (readBookIds.length > 0) {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < readBookIds.length; i += CHUNK_SIZE) {
      const chunk = readBookIds.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      query += ` AND b.id NOT IN (${placeholders})`;
      params.push(...chunk);
    }
  }

  // Exclude disliked books (title LIKE, with SQL wildcard escaping).
  if (preferences.dislikes.length > 0) {
    for (const disliked of preferences.dislikes) {
      const escaped = disliked.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      query += ` AND b.title NOT LIKE ? ESCAPE '\\'`;
      params.push(`%${escaped}%`);
    }
  }

  query += ` LIMIT 100`; // over-fetch, then score down

  const booksResult = await db
    .prepare(query)
    .bind(...params)
    .all();
  const books = booksResult.results || [];

  // Score by genre affinity + level fit.
  const scoredBooks = books.map((book) => {
    let score = 0;
    const matchReasons = [];
    const bookGenreIds = parseGenreIds(book.genre_ids);

    for (const genreId of bookGenreIds) {
      if (preferences.favoriteGenreIds.includes(genreId)) {
        score += 3;
        matchReasons.push('favorite genre');
      } else if (inferredGenres.some((g) => g.id === genreId)) {
        score += 2;
        matchReasons.push('matches reading history');
      }
    }

    if (effectiveMin !== null && effectiveMax !== null && book.reading_level) {
      const bookLevel = parseFloat(book.reading_level);
      if (!isNaN(bookLevel)) {
        const targetCenter = (effectiveMin + effectiveMax) / 2;
        const targetHalf = (effectiveMax - effectiveMin) / 2;
        const distanceFromCenter = Math.abs(bookLevel - targetCenter);
        if (targetHalf > 0 && distanceFromCenter <= targetHalf * 0.5) {
          score += 1;
          matchReasons.push(
            focusMode === 'consolidation'
              ? 'consolidation level'
              : focusMode === 'challenge'
                ? 'challenge level'
                : 'ideal level match'
          );
        }
      }
    }

    return { ...book, score, matchReasons: [...new Set(matchReasons)] };
  });

  scoredBooks.sort((a, b) => b.score - a.score);
  const topBooks = scoredBooks.slice(0, limit);

  // Resolve genre names for display.
  const allGenreIds = [...new Set(topBooks.flatMap((b) => parseGenreIds(b.genre_ids)))];
  const genreNameMap = {};
  if (allGenreIds.length > 0) {
    const placeholders = allGenreIds.map(() => '?').join(',');
    const genresResult = await db
      .prepare(`SELECT id, name FROM genres WHERE id IN (${placeholders})`)
      .bind(...allGenreIds)
      .all();
    for (const row of genresResult.results || []) {
      genreNameMap[row.id] = row.name;
    }
  }

  const formattedBooks = topBooks.map((book) => {
    const genreIds = parseGenreIds(book.genre_ids);
    const genres = genreIds.filter((id) => genreNameMap[id]).map((id) => genreNameMap[id]);

    let matchReason = 'Matches your reading level';
    if (book.matchReasons.includes('favorite genre')) {
      const matchingGenre = genres.find((g) => preferences.favoriteGenreNames.includes(g));
      matchReason = `Matches favorite genre: ${matchingGenre || genres[0] || 'General'}`;
    } else if (book.matchReasons.includes('matches reading history')) {
      matchReason = "Similar to books you've enjoyed";
    }

    return {
      id: book.id,
      title: book.title,
      author: book.author,
      readingLevel: book.reading_level,
      ageRange: book.age_range,
      description: book.description,
      isbn: book.isbn,
      pageCount: book.page_count,
      seriesName: book.series_name,
      seriesNumber: book.series_number,
      publicationYear: book.publication_year,
      genres,
      matchReason,
    };
  });

  return {
    books: formattedBooks,
    studentProfile: {
      readingLevel: student.readingLevel,
      readingLevelMin: student.readingLevelMin,
      readingLevelMax: student.readingLevelMax,
      favoriteGenres: preferences.favoriteGenreNames,
      inferredGenres: inferredGenres.map((g) => g.name),
      booksRead: profile.booksReadCount,
    },
  };
}
