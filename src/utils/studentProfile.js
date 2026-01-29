/**
 * Student Profile Builder
 * Builds a comprehensive reading profile for a student including:
 * - Basic info (name, level, age)
 * - Explicit preferences (favorite genres, likes, dislikes)
 * - Inferred preferences (genres from reading history)
 * - Reading history (recent reads, all read book IDs)
 */

/**
 * Build a comprehensive student reading profile
 * @param {string} studentId - The student's ID
 * @param {string} organizationId - The organization's ID
 * @param {Object} db - D1 database binding
 * @returns {Promise<Object|null>} Student profile or null if not found
 */
export async function buildStudentReadingProfile(studentId, organizationId, db) {
  // 1. Get student basic info
  const student = await db.prepare(`
    SELECT id, name, reading_level, age_range, likes, dislikes, notes
    FROM students
    WHERE id = ? AND organization_id = ?
  `).bind(studentId, organizationId).first();

  if (!student) {
    return null;
  }

  // 2. Get explicit preferences (favorite genres from student_preferences table)
  const preferencesResult = await db.prepare(`
    SELECT sp.genre_id, g.name as genre_name, sp.preference_type
    FROM student_preferences sp
    LEFT JOIN genres g ON sp.genre_id = g.id
    WHERE sp.student_id = ?
  `).bind(studentId).all();

  const favoriteGenreIds = [];
  const favoriteGenreNames = [];

  for (const row of (preferencesResult.results || [])) {
    if (row.preference_type === 'favorite') {
      favoriteGenreIds.push(row.genre_id);
      if (row.genre_name) {
        favoriteGenreNames.push(row.genre_name);
      }
    }
  }

  // 3. Get reading history with book details
  const sessionsResult = await db.prepare(`
    SELECT DISTINCT rs.book_id, b.title, b.author, b.genre_ids, rs.session_date
    FROM reading_sessions rs
    LEFT JOIN books b ON rs.book_id = b.id
    WHERE rs.student_id = ? AND rs.book_id IS NOT NULL
    ORDER BY rs.session_date DESC
  `).bind(studentId).all();

  const sessions = sessionsResult.results || [];
  const readBookIds = sessions.map(s => s.book_id).filter(Boolean);

  // Recent reads (last 5 with titles)
  const recentReads = sessions
    .filter(s => s.title)
    .slice(0, 5)
    .map(s => ({
      title: s.title,
      author: s.author
    }));

  // 4. Infer favorite genres from reading history
  const genreCounts = {};
  for (const session of sessions) {
    if (session.genre_ids) {
      let genreIds = [];
      try {
        // genre_ids is stored as a JSON array string like '["genre-1","genre-2"]'
        genreIds = JSON.parse(session.genre_ids);
        if (!Array.isArray(genreIds)) {
          genreIds = [];
        }
      } catch {
        // Fallback for legacy comma-separated format
        genreIds = session.genre_ids.split(',').map(g => g.trim()).filter(Boolean);
      }
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
    const genreNamesResult = await db.prepare(`
      SELECT id, name FROM genres WHERE id IN (${placeholders})
    `).bind(...genreIds).all();

    const genreNameMap = {};
    for (const row of (genreNamesResult.results || [])) {
      genreNameMap[row.id] = row.name;
    }

    // Only include genres that have a valid name (filter out invalid IDs like book UUIDs)
    inferredGenres = sortedGenres
      .filter(([id]) => genreNameMap[id])
      .map(([id, count]) => ({
        id,
        name: genreNameMap[id],
        count
      }));
  }

  // Parse likes/dislikes from JSON strings
  let likes = [];
  let dislikes = [];

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
      name: student.name,
      readingLevel: student.reading_level || null,
      ageRange: student.age_range || null,
      notes: student.notes
    },
    preferences: {
      favoriteGenreIds,
      favoriteGenreNames,
      likes,
      dislikes
    },
    inferredGenres,
    recentReads,
    readBookIds,
    booksReadCount: readBookIds.length
  };
}
