import { Hono } from 'hono';
import { generateId } from '../utils/helpers';
import { calculateStreak } from '../utils/streakCalculator';

// Import services (legacy KV mode)
import {
  getStudents as getStudentsKV,
  getStudentById as getStudentByIdKV,
  saveStudent as saveStudentKV,
  deleteStudent as deleteStudentKV,
  addStudents as addStudentsKV
} from '../services/kvService';

// Import utilities
import { validateStudent, validateBulkImport, validateReadingLevelRange } from '../utils/validation';
import { notFoundError, badRequestError, forbiddenError } from '../middleware/errorHandler';
import { requireRole, requireAdmin, requireTeacher, requireReadonly, auditLog } from '../middleware/tenant';
import { permissions } from '../utils/crypto';
import { getDB, isMultiTenantMode, safeJsonParse, requireStudent } from '../utils/routeHelpers';
import { rowToStudent } from '../utils/rowMappers';

// Create router
const studentsRouter = new Hono();

/**
 * Fetch student preferences from student_preferences table
 */
const fetchStudentPreferences = async (db, studentId) => {
  const result = await db.prepare(`
    SELECT sp.genre_id, sp.preference_type, g.name as genre_name
    FROM student_preferences sp
    LEFT JOIN genres g ON sp.genre_id = g.id
    WHERE sp.student_id = ?
  `).bind(studentId).all();
  
  const preferences = {
    favoriteGenreIds: [],
    likes: [],
    dislikes: []
  };
  
  for (const row of (result.results || [])) {
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
 * Save student preferences to student_preferences table
 */
const saveStudentPreferences = async (db, studentId, preferences) => {
  if (!preferences) return;
  
  // Delete existing preferences for this student
  await db.prepare(`
    DELETE FROM student_preferences WHERE student_id = ?
  `).bind(studentId).run();
  
  const statements = [];
  
  // Add favorite genre preferences
  if (preferences.favoriteGenreIds && Array.isArray(preferences.favoriteGenreIds)) {
    for (const genreId of preferences.favoriteGenreIds) {
      statements.push(
        db.prepare(`
          INSERT INTO student_preferences (id, student_id, genre_id, preference_type)
          VALUES (?, ?, ?, 'favorite')
        `).bind(generateId(), studentId, genreId)
      );
    }
  }
  
  // Note: likes and dislikes in the preferences object are book titles (strings),
  // not genre IDs. We'll store them in the students table likes/dislikes columns instead.
  // The student_preferences table is specifically for genre preferences.
  
  // Execute batch if there are statements
  if (statements.length > 0) {
    // D1 batch limit is 100
    const batchSize = 100;
    for (let i = 0; i < statements.length; i += batchSize) {
      const batch = statements.slice(i, i + batchSize);
      await db.batch(batch);
    }
  }
};

/**
 * Get streak settings (gracePeriodDays + timezone) for an organization.
 * Uses KV cache with 1-hour TTL to avoid hitting D1 on every request.
 * Falls back to D1 batch query if KV is unavailable or cache misses.
 */
const getOrgStreakSettings = async (db, organizationId, env) => {
  const cacheKey = `org-streak-settings:${organizationId}`;
  const KV = env?.READING_MANAGER_KV;

  // Try KV cache first
  if (KV) {
    try {
      const cached = await KV.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // KV read failed — fall through to D1
    }
  }

  // Fetch both settings in a single D1 batch
  const [gracePeriodResult, timezoneResult] = await db.batch([
    db.prepare(`SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'streakGracePeriodDays'`).bind(organizationId),
    db.prepare(`SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'timezone'`).bind(organizationId),
  ]);

  let gracePeriodDays = 1;
  if (gracePeriodResult.results?.[0]?.setting_value) {
    try { gracePeriodDays = parseInt(JSON.parse(gracePeriodResult.results[0].setting_value), 10); } catch { /* use default */ }
  }

  let timezone = 'UTC';
  if (timezoneResult.results?.[0]?.setting_value) {
    try { timezone = JSON.parse(timezoneResult.results[0].setting_value); } catch { timezone = timezoneResult.results[0].setting_value; }
  }

  const settings = { gracePeriodDays, timezone };

  // Cache in KV for 1 hour
  if (KV) {
    try {
      await KV.put(cacheKey, JSON.stringify(settings), { expirationTtl: 3600 });
    } catch {
      // KV write failed — non-critical
    }
  }

  return settings;
};

/**
 * Recalculate and update streak for a student based on their reading sessions
 */
const updateStudentStreak = async (db, studentId, organizationId) => {
  // Fetch all sessions for the student, excluding absent/no_record entries
  const sessions = await db.prepare(`
    SELECT session_date as date FROM reading_sessions
    WHERE student_id = ?
      AND (notes IS NULL OR (notes NOT LIKE '%[ABSENT]%' AND notes NOT LIKE '%[NO_RECORD]%'))
    ORDER BY session_date DESC
  `).bind(studentId).all();

  // Get organization settings (from cache or D1)
  const { gracePeriodDays, timezone } = await getOrgStreakSettings(db, organizationId, {});

  // Calculate streak
  const streakData = calculateStreak(sessions.results || [], {
    gracePeriodDays,
    timezone
  });

  // Update student record
  await db.prepare(`
    UPDATE students SET
      current_streak = ?,
      longest_streak = ?,
      streak_start_date = ?,
      updated_at = datetime("now")
    WHERE id = ?
  `).bind(
    streakData.currentStreak,
    streakData.longestStreak,
    streakData.streakStartDate,
    studentId
  ).run();

  return streakData;
};

/**
 * GET /api/students
 * Get all students
 */
studentsRouter.get('/', requireReadonly(), async (c) => {
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const result = await db.prepare(`
      SELECT s.*, c.name as class_name, b.title as current_book_title, b.author as current_book_author,
        (SELECT COUNT(*) FROM reading_sessions rs WHERE rs.student_id = s.id) as total_session_count
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN books b ON s.current_book_id = b.id
      WHERE s.organization_id = ? AND s.is_active = 1
      ORDER BY s.name ASC
    `).bind(organizationId).all();

    const students = (result.results || []).map(row => ({
      ...rowToStudent(row),
      className: row.class_name,
      totalSessionCount: row.total_session_count || 0
    }));

    return c.json(students);
  }
  
  // Legacy mode: use KV
  const students = await getStudentsKV(c.env);
  return c.json(students);
});

/**
 * GET /api/students/sessions
 * Get reading sessions for a class within a date range.
 * Query params: classId, startDate, endDate (all required)
 */
studentsRouter.get('/sessions', requireReadonly(), async (c) => {
  if (!isMultiTenantMode(c)) {
    return c.json([]);
  }
  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const { classId, startDate, endDate } = c.req.query();

  if (!classId || !startDate || !endDate) {
    throw badRequestError('classId, startDate, and endDate are required');
  }

  const result = await db.prepare(`
    SELECT rs.*, s.name as student_name,
           b.title as book_title, b.author as book_author
    FROM reading_sessions rs
    INNER JOIN students s ON rs.student_id = s.id
    LEFT JOIN books b ON rs.book_id = b.id
    WHERE s.organization_id = ? AND s.class_id = ? AND s.is_active = 1
      AND rs.session_date >= ? AND rs.session_date <= ?
    ORDER BY rs.session_date DESC
  `).bind(organizationId, classId, startDate, endDate).all();

  const sessions = (result.results || []).map(s => ({
    id: s.id,
    studentId: s.student_id,
    date: s.session_date,
    bookId: s.book_id,
    bookTitle: s.book_title || s.book_title_manual,
    bookAuthor: s.book_author || s.book_author_manual,
    pagesRead: s.pages_read,
    duration: s.duration_minutes,
    assessment: s.assessment,
    notes: s.notes,
    location: s.location || 'school',
    recordedBy: s.recorded_by
  }));

  return c.json(sessions);
});

/**
 * GET /api/students/:id
 * Get a single student by ID
 */
studentsRouter.get('/:id', requireReadonly(), async (c) => {
  const { id } = c.req.param();

  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    // Get org settings (KV cached) and student in parallel
    const [streakSettings, studentResult] = await Promise.all([
      getOrgStreakSettings(db, organizationId, c.env),
      db.prepare(`
        SELECT s.*, c.name as class_name, b.title as current_book_title, b.author as current_book_author
        FROM students s
        LEFT JOIN classes c ON s.class_id = c.id
        LEFT JOIN books b ON s.current_book_id = b.id
        WHERE s.id = ? AND s.organization_id = ? AND s.is_active = 1
      `).bind(id, organizationId).first(),
    ]);
    const { gracePeriodDays, timezone } = streakSettings;
    const student = studentResult;

    if (!student) {
      throw notFoundError(`Student with ID ${id} not found`);
    }

    const result = rowToStudent(student);
    result.className = student.class_name;

    // Fetch reading sessions
    const sessions = await db.prepare(`
      SELECT rs.*, b.title as book_title, b.author as book_author
      FROM reading_sessions rs
      LEFT JOIN books b ON rs.book_id = b.id
      WHERE rs.student_id = ?
      ORDER BY rs.session_date DESC
    `).bind(id).all();

    result.readingSessions = (sessions.results || []).map(s => ({
      id: s.id,
      date: s.session_date,
      bookTitle: s.book_title || s.book_title_manual,
      bookAuthor: s.book_author || s.book_author_manual,
      bookId: s.book_id,
      pagesRead: s.pages_read,
      duration: s.duration_minutes,
      assessment: s.assessment,
      notes: s.notes,
      location: s.location || 'school',
      recordedBy: s.recorded_by
    }));

    // Recalculate streak on-the-fly from sessions (exclude absent/no_record, ensures accuracy)
    const streakData = calculateStreak(
      result.readingSessions
        .filter(s => !s.notes?.includes('[ABSENT]') && !s.notes?.includes('[NO_RECORD]'))
        .map(s => ({ date: s.date })),
      { gracePeriodDays, timezone }
    );
    result.currentStreak = streakData.currentStreak;
    result.longestStreak = Math.max(streakData.longestStreak, result.longestStreak); // Keep historical longest
    result.streakStartDate = streakData.streakStartDate;

    // Fetch student preferences
    result.preferences = await fetchStudentPreferences(db, id);
    // Also include likes/dislikes from the students table in preferences
    result.preferences.likes = result.likes || [];
    result.preferences.dislikes = result.dislikes || [];

    return c.json(result);
  }
  
  // Legacy mode: use KV
  const student = await getStudentByIdKV(c.env, id);
  if (!student) {
    throw notFoundError(`Student with ID ${id} not found`);
  }
  return c.json(student);
});

/**
 * POST /api/students
 * Add a new student
 */
studentsRouter.post('/', auditLog('create', 'student'), async (c) => {
  const body = await c.req.json();

  // Validate student data
  const validation = validateStudent(body);
  if (!validation.isValid) {
    throw badRequestError(validation.errors.join(', '));
  }

  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');

    // Check permission
    const userRole = c.get('userRole');
    if (!permissions.canManageStudents(userRole)) {
      throw forbiddenError();
    }

    // Validate reading level range
    const rangeValidation = validateReadingLevelRange(body.readingLevelMin, body.readingLevelMax);
    if (!rangeValidation.isValid) {
      throw badRequestError(rangeValidation.errors[0]);
    }

    const studentId = body.id || generateId();

    await db.prepare(`
      INSERT INTO students (id, organization_id, name, class_id, reading_level_min, reading_level_max, likes, dislikes, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      studentId,
      organizationId,
      body.name,
      body.classId || null,
      rangeValidation.normalizedMin ?? null,
      rangeValidation.normalizedMax ?? null,
      JSON.stringify(body.likes || []),
      JSON.stringify(body.dislikes || []),
      body.notes || null,
      userId
    ).run();

    // Fetch the created student
    const student = await db.prepare(`
      SELECT * FROM students WHERE id = ?
    `).bind(studentId).first();

    return c.json(rowToStudent(student), 201);
  }

  // Legacy mode: use KV
  const newStudent = {
    id: body.id || generateId(),
    name: body.name,
    classId: body.classId || null,
    lastReadDate: body.lastReadDate || null,
    readingSessions: body.readingSessions || [],
    likes: body.likes || [],
    dislikes: body.dislikes || [],
    readingLevelMin: body.readingLevelMin || null,
    readingLevelMax: body.readingLevelMax || null
  };

  const savedStudent = await saveStudentKV(c.env, newStudent);
  return c.json(savedStudent, 201);
});

/**
 * PUT /api/students/:id
 * Update a student
 */
studentsRouter.put('/:id', auditLog('update', 'student'), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  // Validate student data
  const validation = validateStudent(body);
  if (!validation.isValid) {
    throw badRequestError(validation.errors.join(', '));
  }

  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');

    // Check permission
    const userRole = c.get('userRole');
    if (!permissions.canManageStudents(userRole)) {
      throw forbiddenError();
    }

    // Check if student exists and belongs to organization
    await requireStudent(db, id, organizationId);

    // Validate reading level range
    const rangeValidation = validateReadingLevelRange(body.readingLevelMin, body.readingLevelMax);
    if (!rangeValidation.isValid) {
      throw badRequestError(rangeValidation.errors[0]);
    }

    // Extract likes/dislikes from preferences if provided
    let likes = body.likes || [];
    let dislikes = body.dislikes || [];

    if (body.preferences) {
      // If preferences object is provided, use its likes/dislikes
      if (body.preferences.likes && Array.isArray(body.preferences.likes)) {
        likes = body.preferences.likes;
      }
      if (body.preferences.dislikes && Array.isArray(body.preferences.dislikes)) {
        dislikes = body.preferences.dislikes;
      }
    }

    // Update student
    await db.prepare(`
      UPDATE students SET
        name = ?,
        class_id = ?,
        reading_level_min = ?,
        reading_level_max = ?,
        likes = ?,
        dislikes = ?,
        notes = ?,
        updated_at = datetime("now")
      WHERE id = ? AND organization_id = ?
    `).bind(
      body.name,
      body.classId || null,
      rangeValidation.normalizedMin ?? null,
      rangeValidation.normalizedMax ?? null,
      JSON.stringify(likes),
      JSON.stringify(dislikes),
      body.notes || null,
      id,
      organizationId
    ).run();

    // Save student preferences (favorite genres) to student_preferences table
    if (body.preferences) {
      await saveStudentPreferences(db, id, body.preferences);
    }

    // Fetch updated student
    const student = await db.prepare(`
      SELECT * FROM students WHERE id = ?
    `).bind(id).first();

    const result = rowToStudent(student);

    // Fetch and include preferences in response
    result.preferences = await fetchStudentPreferences(db, id);
    result.preferences.likes = likes;
    result.preferences.dislikes = dislikes;

    return c.json(result);
  }

  // Legacy mode: use KV
  const existingStudent = await getStudentByIdKV(c.env, id);
  if (!existingStudent) {
    throw notFoundError(`Student with ID ${id} not found`);
  }

  const updatedStudent = {
    ...existingStudent,
    ...body,
    id // Ensure ID doesn't change
  };

  const savedStudent = await saveStudentKV(c.env, updatedStudent);
  return c.json(savedStudent);
});

/**
 * DELETE /api/students/:id
 * Delete a student (soft delete in multi-tenant mode)
 */
studentsRouter.delete('/:id', auditLog('delete', 'student'), async (c) => {
  const { id } = c.req.param();
  
  // Multi-tenant mode: use D1 (soft delete)
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    // Check permission
    const userRole = c.get('userRole');
    if (!permissions.canManageStudents(userRole)) {
      throw forbiddenError();
    }
    
    await requireStudent(db, id, organizationId);
    
    // Soft delete
    await db.prepare(`
      UPDATE students SET is_active = 0, updated_at = datetime("now") WHERE id = ?
    `).bind(id).run();
    
    return c.json({ message: 'Student deleted successfully' });
  }
  
  // Legacy mode: use KV
  const success = await deleteStudentKV(c.env, id);
  
  if (!success) {
    throw notFoundError(`Student with ID ${id} not found`);
  }
  
  return c.json({ message: 'Student deleted successfully' });
});

/**
 * PUT /api/students/:id/current-book
 * Update a student's current book
 */
studentsRouter.put('/:id/current-book', requireTeacher(), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    await requireStudent(db, id, organizationId);

    // Update current book (bookId can be null to clear)
    await db.prepare(`
      UPDATE students SET current_book_id = ?, updated_at = datetime("now")
      WHERE id = ?
    `).bind(body.bookId || null, id).run();

    // Fetch updated student with book info
    const student = await db.prepare(`
      SELECT s.*, b.title as current_book_title, b.author as current_book_author
      FROM students s
      LEFT JOIN books b ON s.current_book_id = b.id
      WHERE s.id = ?
    `).bind(id).first();

    return c.json({
      currentBookId: student.current_book_id,
      currentBookTitle: student.current_book_title,
      currentBookAuthor: student.current_book_author
    });
  }

  // Legacy mode: not supported (localStorage handles it)
  return c.json({ error: 'Current book tracking requires multi-tenant mode' }, 400);
});

/**
 * POST /api/students/bulk
 * Bulk import students
 */
studentsRouter.post('/bulk', auditLog('import', 'student'), async (c) => {
  const body = await c.req.json();

  // Validate bulk import data
  const validation = validateBulkImport(body);
  if (!validation.isValid) {
    throw badRequestError(validation.errors.join(', '));
  }

  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');

    // Check permission
    const userRole = c.get('userRole');
    if (!permissions.canManageStudents(userRole)) {
      throw forbiddenError();
    }

    // Validate reading level range for each student
    for (let i = 0; i < body.length; i++) {
      const student = body[i];
      const rangeValidation = validateReadingLevelRange(student.readingLevelMin, student.readingLevelMax);
      if (!rangeValidation.isValid) {
        throw badRequestError(`Student at index ${i}: ${rangeValidation.errors[0]}`);
      }
    }

    // Prepare batch insert (D1 batch limit is 100)
    const students = body.map(student => {
      const rangeValidation = validateReadingLevelRange(student.readingLevelMin, student.readingLevelMax);
      return {
        id: student.id || generateId(),
        name: student.name,
        classId: student.classId || null,
        readingLevelMin: rangeValidation.normalizedMin ?? null,
        readingLevelMax: rangeValidation.normalizedMax ?? null,
        likes: student.likes || [],
        dislikes: student.dislikes || []
      };
    });

    // Insert in batches of 100
    const batchSize = 100;
    const savedStudents = [];

    for (let i = 0; i < students.length; i += batchSize) {
      const batch = students.slice(i, i + batchSize);
      const statements = batch.map(student => {
        return db.prepare(`
          INSERT INTO students (id, organization_id, name, class_id, reading_level_min, reading_level_max, likes, dislikes, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          student.id,
          organizationId,
          student.name,
          student.classId,
          student.readingLevelMin,
          student.readingLevelMax,
          JSON.stringify(student.likes),
          JSON.stringify(student.dislikes),
          userId
        );
      });

      await db.batch(statements);
      savedStudents.push(...batch);
    }

    return c.json(savedStudents, 201);
  }

  // Legacy mode: use KV
  const newStudents = body.map(student => ({
    id: student.id || generateId(),
    name: student.name,
    classId: student.classId || null,
    lastReadDate: student.lastReadDate || null,
    readingSessions: student.readingSessions || [],
    likes: student.likes || [],
    dislikes: student.dislikes || [],
    readingLevelMin: student.readingLevelMin || null,
    readingLevelMax: student.readingLevelMax || null
  }));

  const savedStudents = await addStudentsKV(c.env, newStudents);
  return c.json(savedStudents, 201);
});

/**
 * POST /api/students/:id/sessions
 * Add a reading session to a student
 */
studentsRouter.post('/:id/sessions', requireTeacher(), auditLog('create', 'session'), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  // Validate reading session input
  if (body.pagesRead !== undefined && body.pagesRead !== null) {
    const pages = Number(body.pagesRead);
    if (!Number.isFinite(pages) || pages < 0 || pages > 10000) {
      throw badRequestError('pagesRead must be a number between 0 and 10000');
    }
    body.pagesRead = pages;
  }
  if (body.duration !== undefined && body.duration !== null) {
    const dur = Number(body.duration);
    if (!Number.isFinite(dur) || dur < 0 || dur > 1440) {
      throw badRequestError('duration must be a number between 0 and 1440 minutes');
    }
    body.duration = dur;
  }
  if (body.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date) || isNaN(Date.parse(body.date))) {
      throw badRequestError('date must be a valid YYYY-MM-DD format');
    }
  }
  if (body.notes && body.notes.length > 2000) {
    throw badRequestError('notes must be 2000 characters or fewer');
  }
  const validAssessments = [null, undefined, '', 'independent', 'guided', 'struggled', 'read_aloud', 'not_assessed'];
  if (body.assessment && !validAssessments.includes(body.assessment)) {
    throw badRequestError('Invalid assessment value');
  }
  const validLocations = [null, undefined, '', 'school', 'home', 'library', 'other'];
  if (body.location && !validLocations.includes(body.location)) {
    throw badRequestError('Invalid location value');
  }

  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');
    
    // Check if student exists and belongs to organization
    const student = await db.prepare(`
      SELECT id, processing_restricted FROM students WHERE id = ? AND organization_id = ? AND is_active = 1
    `).bind(id, organizationId).first();

    if (!student) {
      throw notFoundError(`Student with ID ${id} not found`);
    }

    // GDPR Article 18: block session creation for restricted students
    if (student.processing_restricted) {
      return c.json({ error: 'Processing is restricted for this student. No new sessions can be recorded.' }, 403);
    }

    const sessionId = generateId();

    await db.prepare(`
      INSERT INTO reading_sessions (
        id, student_id, session_date, book_id, book_title_manual, book_author_manual,
        pages_read, duration_minutes, assessment, notes, location, recorded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      sessionId,
      id,
      body.date || new Date().toISOString().split('T')[0],
      body.bookId || null,
      body.bookTitle || null,
      body.bookAuthor || null,
      body.pagesRead ?? null,
      body.duration ?? null,
      body.assessment ?? null,
      body.notes ?? null,
      body.location || 'school',
      userId
    ).run();

    // Update student's current book if a book was provided
    if (body.bookId) {
      await db.prepare(`
        UPDATE students SET current_book_id = ?, updated_at = datetime("now")
        WHERE id = ?
      `).bind(body.bookId, id).run();
    }

    // Update student's reading streak
    const streakData = await updateStudentStreak(db, id, organizationId);

    // Fetch the created session
    const session = await db.prepare(`
      SELECT rs.*, b.title as book_title, b.author as book_author
      FROM reading_sessions rs
      LEFT JOIN books b ON rs.book_id = b.id
      WHERE rs.id = ?
    `).bind(sessionId).first();

    return c.json({
      id: session.id,
      date: session.session_date,
      bookTitle: session.book_title || session.book_title_manual,
      bookAuthor: session.book_author || session.book_author_manual,
      bookId: session.book_id,
      pagesRead: session.pages_read,
      duration: session.duration_minutes,
      assessment: session.assessment,
      notes: session.notes,
      location: session.location || 'school',
      recordedBy: session.recorded_by
    }, 201);
  }
  
  // Legacy mode: use KV
  const student = await getStudentByIdKV(c.env, id);
  if (!student) {
    throw notFoundError(`Student with ID ${id} not found`);
  }

  const newSession = {
    id: generateId(),
    date: body.date || new Date().toISOString().split('T')[0],
    bookTitle: body.bookTitle,
    bookAuthor: body.bookAuthor,
    bookId: body.bookId,
    pagesRead: body.pagesRead,
    duration: body.duration,
    assessment: body.assessment,
    notes: body.notes,
    location: body.location || 'school'
  };

  student.readingSessions = student.readingSessions || [];
  student.readingSessions.unshift(newSession);
  student.lastReadDate = newSession.date;

  await saveStudentKV(c.env, student);

  return c.json(newSession, 201);
});

/**
 * DELETE /api/students/:id/sessions/:sessionId
 * Delete a reading session
 */
studentsRouter.delete('/:id/sessions/:sessionId', requireTeacher(), auditLog('delete', 'session'), async (c) => {
  const { id, sessionId } = c.req.param();
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    await requireStudent(db, id, organizationId);
    
    // Check if session exists
    const session = await db.prepare(`
      SELECT id FROM reading_sessions WHERE id = ? AND student_id = ?
    `).bind(sessionId, id).first();
    
    if (!session) {
      throw notFoundError(`Session with ID ${sessionId} not found`);
    }
    
    // Delete session
    await db.prepare(`
      DELETE FROM reading_sessions WHERE id = ?
    `).bind(sessionId).run();

    // Recalculate student's reading streak after deletion
    await updateStudentStreak(db, id, organizationId);

    return c.json({ message: 'Session deleted successfully' });
  }

  // Legacy mode: use KV
  const student = await getStudentByIdKV(c.env, id);
  if (!student) {
    throw notFoundError(`Student with ID ${id} not found`);
  }
  
  const sessionIndex = student.readingSessions?.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1 || sessionIndex === undefined) {
    throw notFoundError(`Session with ID ${sessionId} not found`);
  }
  
  student.readingSessions.splice(sessionIndex, 1);
  
  // Update lastReadDate if needed
  if (student.readingSessions.length > 0) {
    student.lastReadDate = student.readingSessions[0].date;
  } else {
    student.lastReadDate = null;
  }
  
  await saveStudentKV(c.env, student);
  
  return c.json({ message: 'Session deleted successfully' });
});

/**
 * PUT /api/students/:id/sessions/:sessionId
 * Update a reading session
 */
studentsRouter.put('/:id/sessions/:sessionId', requireTeacher(), async (c) => {
  const { id, sessionId } = c.req.param();
  const body = await c.req.json();
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    await requireStudent(db, id, organizationId);
    
    // Check if session exists
    const existingSession = await db.prepare(`
      SELECT id FROM reading_sessions WHERE id = ? AND student_id = ?
    `).bind(sessionId, id).first();
    
    if (!existingSession) {
      throw notFoundError(`Session with ID ${sessionId} not found`);
    }
    
    // Update session
    await db.prepare(`
      UPDATE reading_sessions SET
        session_date = ?,
        book_id = ?,
        book_title_manual = ?,
        book_author_manual = ?,
        pages_read = ?,
        duration_minutes = ?,
        assessment = ?,
        notes = ?
      WHERE id = ?
    `).bind(
      body.date || new Date().toISOString().split('T')[0],
      body.bookId ?? null,
      body.bookTitle ?? null,
      body.bookAuthor ?? null,
      body.pagesRead ?? null,
      body.duration ?? null,
      body.assessment ?? null,
      body.notes ?? null,
      sessionId
    ).run();
    
    // Fetch the updated session
    const session = await db.prepare(`
      SELECT rs.*, b.title as book_title, b.author as book_author
      FROM reading_sessions rs
      LEFT JOIN books b ON rs.book_id = b.id
      WHERE rs.id = ?
    `).bind(sessionId).first();
    
    return c.json({
      id: session.id,
      date: session.session_date,
      bookTitle: session.book_title || session.book_title_manual,
      bookAuthor: session.book_author || session.book_author_manual,
      bookId: session.book_id,
      pagesRead: session.pages_read,
      duration: session.duration_minutes,
      assessment: session.assessment,
      notes: session.notes
    });
  }
  
  // Legacy mode: use KV
  const student = await getStudentByIdKV(c.env, id);
  if (!student) {
    throw notFoundError(`Student with ID ${id} not found`);
  }
  
  const sessionIndex = student.readingSessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) {
    throw notFoundError(`Session with ID ${sessionId} not found`);
  }
  
  // Update the session
  student.readingSessions[sessionIndex] = {
    ...student.readingSessions[sessionIndex],
    ...body,
    id: sessionId // Ensure ID doesn't change
  };
  
  await saveStudentKV(c.env, student);
  
  return c.json(student.readingSessions[sessionIndex]);
});

/**
 * GET /api/students/:id/streak
 * Get streak details for a student
 */
studentsRouter.get('/:id/streak', requireReadonly(), async (c) => {
  const { id } = c.req.param();

  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    // Check if student exists and belongs to organization
    const student = await db.prepare(`
      SELECT id, current_streak, longest_streak, streak_start_date
      FROM students WHERE id = ? AND organization_id = ? AND is_active = 1
    `).bind(id, organizationId).first();

    if (!student) {
      throw notFoundError(`Student with ID ${id} not found`);
    }

    // Get the last read date from sessions
    const lastSession = await db.prepare(`
      SELECT session_date FROM reading_sessions
      WHERE student_id = ?
      ORDER BY session_date DESC
      LIMIT 1
    `).bind(id).first();

    return c.json({
      currentStreak: student.current_streak || 0,
      longestStreak: student.longest_streak || 0,
      streakStartDate: student.streak_start_date || null,
      lastReadDate: lastSession?.session_date || null
    });
  }

  // Legacy mode: calculate from sessions
  const student = await getStudentByIdKV(c.env, id);
  if (!student) {
    throw notFoundError(`Student with ID ${id} not found`);
  }

  const streakData = calculateStreak(student.readingSessions || [], {
    gracePeriodDays: 1 // Default for legacy mode
  });

  return c.json(streakData);
});

/**
 * POST /api/students/recalculate-streaks
 * Recalculate streaks for all students (admin only)
 */
studentsRouter.post('/recalculate-streaks', async (c) => {
  // Multi-tenant mode only
  if (!isMultiTenantMode(c)) {
    return c.json({ error: 'This endpoint requires multi-tenant mode' }, 400);
  }

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');

  // Check permission - admin or owner only
  const userRole = c.get('userRole');
  if (!permissions.canManageSettings(userRole)) {
    throw forbiddenError();
  }

  // Get all active students for this organization
  const students = await db.prepare(`
    SELECT id FROM students WHERE organization_id = ? AND is_active = 1
  `).bind(organizationId).all();

  const results = {
    total: students.results?.length || 0,
    updated: 0,
    errors: []
  };

  // Recalculate streak for each student
  for (const student of (students.results || [])) {
    try {
      await updateStudentStreak(db, student.id, organizationId);
      results.updated++;
    } catch (error) {
      results.errors.push({ studentId: student.id, error: error.message });
    }
  }

  return c.json(results);
});

/**
 * DELETE /api/students/:id/erase
 * GDPR Article 17 — Hard delete a student and all associated data
 * Requires: admin role, { confirm: true } in request body
 */
studentsRouter.delete('/:id/erase', requireAdmin(), auditLog('erase', 'student'), async (c) => {
  const { id } = c.req.param();

  if (!isMultiTenantMode(c)) {
    return c.json({ error: 'Erasure requires multi-tenant mode' }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  if (!body.confirm) {
    return c.json({ error: 'Erasure requires { "confirm": true } in request body' }, 400);
  }

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const userId = c.get('userId');

  // Fetch the student (include inactive — erasure applies regardless)
  const student = await db.prepare(`
    SELECT id, name, wonde_student_id FROM students
    WHERE id = ? AND organization_id = ?
  `).bind(id, organizationId).first();

  if (!student) {
    return c.json({ error: 'Student not found' }, 404);
  }

  // Count records that will be deleted (for the response summary)
  const sessionCount = await db.prepare(
    'SELECT COUNT(*) as count FROM reading_sessions WHERE student_id = ?'
  ).bind(id).first();
  const prefCount = await db.prepare(
    'SELECT COUNT(*) as count FROM student_preferences WHERE student_id = ?'
  ).bind(id).first();

  // Log the erasure request in data_rights_log BEFORE deleting
  const rightsLogId = generateId();
  const statements = [
    db.prepare(`
      INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, requested_by, status, completed_at)
      VALUES (?, ?, 'erasure', 'student', ?, ?, 'completed', datetime('now'))
    `).bind(rightsLogId, organizationId, id, userId),

    // Delete in FK order: sessions → preferences → student
    db.prepare('DELETE FROM reading_sessions WHERE student_id = ?').bind(id),
    db.prepare('DELETE FROM student_preferences WHERE student_id = ?').bind(id),
    db.prepare('DELETE FROM students WHERE id = ?').bind(id),

    // Anonymise audit log entries that reference this student
    db.prepare(`
      UPDATE audit_log SET entity_id = 'erased', details = NULL
      WHERE entity_type = 'student' AND entity_id = ? AND organization_id = ?
    `).bind(id, organizationId),
  ];

  // If this was a Wonde-synced student, add to exclusion list
  if (student.wonde_student_id) {
    statements.push(
      db.prepare(`
        INSERT INTO wonde_erased_students (id, organization_id, wonde_student_id)
        VALUES (?, ?, ?)
      `).bind(generateId(), organizationId, student.wonde_student_id)
    );
  }

  await db.batch(statements);

  return c.json({
    message: 'Student data erased successfully',
    erased: {
      readingSessions: sessionCount.count,
      preferences: prefCount.count,
      studentRecord: 1,
      auditEntriesAnonymised: true,
      wondeExcluded: Boolean(student.wonde_student_id)
    }
  });
});

/**
 * PUT /api/students/:id/restrict
 * GDPR Article 18 — Toggle processing restriction on a student
 * Body: { restricted: true/false }
 * Requires: admin role
 */
studentsRouter.put('/:id/restrict', requireAdmin(), auditLog('restrict', 'student'), async (c) => {
  if (!isMultiTenantMode(c)) {
    return c.json({ error: 'Restriction requires multi-tenant mode' }, 400);
  }

  const { id } = c.req.param();
  const body = await c.req.json();
  const restricted = Boolean(body.restricted);

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const userId = c.get('userId');

  // Check student exists and belongs to organization
  const student = await db.prepare(`
    SELECT id, processing_restricted FROM students WHERE id = ? AND organization_id = ?
  `).bind(id, organizationId).first();

  if (!student) {
    return c.json({ error: 'Student not found' }, 404);
  }

  // Update the restriction flag
  await db.batch([
    db.prepare(`
      UPDATE students SET processing_restricted = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(restricted ? 1 : 0, id),

    // Log in data_rights_log
    db.prepare(`
      INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, requested_by, status, completed_at, notes)
      VALUES (?, ?, 'restriction', 'student', ?, ?, 'completed', datetime('now'), ?)
    `).bind(
      generateId(), organizationId, id, userId,
      restricted ? 'Processing restricted' : 'Processing restriction lifted'
    ),
  ]);

  return c.json({
    message: restricted ? 'Processing restricted for student' : 'Processing restriction lifted',
    processingRestricted: restricted
  });
});

/**
 * PUT /api/students/:id/ai-opt-out
 * Toggle per-student AI opt-out
 * Body: { optOut: true/false }
 * Requires: teacher role (teachers manage their students' preferences)
 */
studentsRouter.put('/:id/ai-opt-out', async (c) => {
  if (!isMultiTenantMode(c)) {
    return c.json({ error: 'AI opt-out requires multi-tenant mode' }, 400);
  }

  const { id } = c.req.param();
  const body = await c.req.json();
  const optOut = Boolean(body.optOut);

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');

  // Check permission
  const userRole = c.get('userRole');
  if (!permissions.canManageStudents(userRole)) {
    throw forbiddenError();
  }

  await requireStudent(db, id, organizationId);

  await db.prepare(`
    UPDATE students SET ai_opt_out = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(optOut ? 1 : 0, id).run();

  return c.json({
    message: optOut ? 'AI recommendations disabled for student' : 'AI recommendations enabled for student',
    aiOptOut: optOut
  });
});

/**
 * GET /api/students/:id/export
 * GDPR Article 15 — Subject Access Request export
 * Returns all personal data held on a student in JSON or CSV format
 * Requires: admin role
 */
studentsRouter.get('/:id/export', requireAdmin(), async (c) => {
  if (!isMultiTenantMode(c)) {
    return c.json({ error: 'Export requires multi-tenant mode' }, 400);
  }

  const { id } = c.req.param();
  const format = (c.req.query('format') || 'json').toLowerCase();

  if (!['json', 'csv'].includes(format)) {
    return c.json({ error: 'Unsupported format. Use ?format=json or ?format=csv' }, 400);
  }

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const userId = c.get('userId');

  // Fetch student (include inactive — SAR applies regardless of status)
  const student = await db.prepare(`
    SELECT s.*, c.name as class_name, b.title as current_book_title, b.author as current_book_author
    FROM students s
    LEFT JOIN classes c ON s.class_id = c.id
    LEFT JOIN books b ON s.current_book_id = b.id
    WHERE s.id = ? AND s.organization_id = ?
  `).bind(id, organizationId).first();

  if (!student) {
    return c.json({ error: 'Student not found' }, 404);
  }

  // Fetch organization name for metadata
  const org = await db.prepare(
    'SELECT name FROM organizations WHERE id = ?'
  ).bind(organizationId).first();

  // Fetch reading sessions with book details
  const sessions = await db.prepare(`
    SELECT rs.*, b.title as book_title, b.author as book_author, u.name as recorded_by_name
    FROM reading_sessions rs
    LEFT JOIN books b ON rs.book_id = b.id
    LEFT JOIN users u ON rs.recorded_by = u.id
    WHERE rs.student_id = ?
    ORDER BY rs.session_date DESC
  `).bind(id).all();

  // Fetch genre preferences
  const preferences = await db.prepare(`
    SELECT sp.preference_type, g.name as genre_name
    FROM student_preferences sp
    LEFT JOIN genres g ON sp.genre_id = g.id
    WHERE sp.student_id = ?
  `).bind(id).all();

  // Fetch audit log entries referencing this student
  const auditEntries = await db.prepare(`
    SELECT action, entity_type, details, created_at
    FROM audit_log
    WHERE entity_type = 'student' AND entity_id = ? AND organization_id = ?
    ORDER BY created_at DESC
  `).bind(id, organizationId).all();

  // Log the SAR in data_rights_log
  await db.prepare(`
    INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, requested_by, status, completed_at)
    VALUES (?, ?, 'access', 'student', ?, ?, 'completed', datetime('now'))
  `).bind(generateId(), organizationId, id, userId).run();

  // Build the export payload
  const exportData = {
    metadata: {
      exportDate: new Date().toISOString(),
      exportFormat: 'GDPR Article 15 Subject Access Request',
      organization: org?.name || organizationId,
      dataController: 'Scratch IT LTD'
    },
    student: {
      name: student.name,
      class: student.class_name || null,
      yearGroup: student.year_group || null,
      readingLevelMin: student.reading_level_min,
      readingLevelMax: student.reading_level_max,
      senStatus: student.sen_status || null,
      pupilPremium: Boolean(student.pupil_premium),
      ealStatus: student.eal_status || null,
      freeSchoolMeals: Boolean(student.fsm),
      notes: student.notes || null,
      currentBook: student.current_book_title || null,
      currentBookAuthor: student.current_book_author || null,
      processingRestricted: Boolean(student.processing_restricted),
      aiOptOut: Boolean(student.ai_opt_out),
      isActive: Boolean(student.is_active),
      createdAt: student.created_at,
      updatedAt: student.updated_at
    },
    preferences: (preferences.results || []).map(p => ({
      type: p.preference_type,
      genre: p.genre_name
    })),
    readingSessions: (sessions.results || []).map(s => ({
      date: s.session_date,
      bookTitle: s.book_title || s.book_title_manual || null,
      bookAuthor: s.book_author || s.book_author_manual || null,
      pagesRead: s.pages_read,
      durationMinutes: s.duration_minutes,
      assessment: s.assessment,
      notes: s.notes,
      location: s.location || 'school',
      recordedBy: s.recorded_by_name || null
    })),
    auditTrail: (auditEntries.results || []).map(a => ({
      action: a.action,
      entityType: a.entity_type,
      details: a.details ? safeJsonParse(a.details, a.details) : null,
      timestamp: a.created_at
    }))
  };

  if (format === 'csv') {
    const lines = [];
    // Metadata header
    lines.push(`# GDPR Article 15 Subject Access Request`);
    lines.push(`# Export Date: ${exportData.metadata.exportDate}`);
    lines.push(`# Organization: ${exportData.metadata.organization}`);
    lines.push(`# Data Controller: ${exportData.metadata.dataController}`);
    lines.push('');

    // Student profile section
    lines.push('## Student Profile');
    lines.push('Name,Class,Year Group,Reading Level Min,Reading Level Max,SEN Status,Pupil Premium,EAL Status,Free School Meals,Notes,Current Book,AI Opt-Out,Processing Restricted,Active,Created,Updated');
    const s = exportData.student;
    lines.push(csvRow([
      s.name, s.class, s.yearGroup, s.readingLevelMin, s.readingLevelMax,
      s.senStatus, s.pupilPremium, s.ealStatus, s.freeSchoolMeals,
      s.notes, s.currentBook, s.aiOptOut, s.processingRestricted,
      s.isActive, s.createdAt, s.updatedAt
    ]));
    lines.push('');

    // Preferences section
    if (exportData.preferences.length > 0) {
      lines.push('## Genre Preferences');
      lines.push('Type,Genre');
      for (const p of exportData.preferences) {
        lines.push(csvRow([p.type, p.genre]));
      }
      lines.push('');
    }

    // Reading sessions section
    lines.push('## Reading Sessions');
    lines.push('Date,Book Title,Book Author,Pages Read,Duration (mins),Assessment,Notes,Location,Recorded By');
    for (const rs of exportData.readingSessions) {
      lines.push(csvRow([
        rs.date, rs.bookTitle, rs.bookAuthor, rs.pagesRead,
        rs.durationMinutes, rs.assessment, rs.notes, rs.location, rs.recordedBy
      ]));
    }

    const csv = lines.join('\n');
    const filename = `student-export-${student.name.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.csv`;

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  }

  // JSON format (default)
  const filename = `student-export-${student.name.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().split('T')[0]}.json`;
  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
});

/**
 * CSV helper: escape a value and wrap in quotes if needed
 */
function csvRow(values) {
  return values.map(v => {
    if (v === null || v === undefined) return '';
    const str = String(v);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }).join(',');
}

/**
 * Process an array in batches with limited concurrency.
 * @param {Array} items - Items to process
 * @param {number} concurrency - Max concurrent promises
 * @param {Function} fn - Async function to call for each item
 * @returns {Promise<Array>} Results from Promise.allSettled for each batch
 */
async function processInBatches(items, concurrency, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Recalculate streaks for all students across all organizations.
 * Optimised for cron: fetches org settings once per org, processes students
 * in concurrent batches of 10 to stay within the 30s Worker CPU limit.
 * @param {D1Database} db - The D1 database instance
 * @returns {Object} Results summary { total, updated, errors, organizations }
 */
const recalculateAllStreaks = async (db) => {
  const results = {
    total: 0,
    updated: 0,
    errors: [],
    organizations: 0
  };

  // Get all active organizations
  const orgs = await db.prepare(
    `SELECT id FROM organizations WHERE is_active = 1`
  ).all();

  results.organizations = orgs.results?.length || 0;

  // Process each organization sequentially (settings differ per org)
  for (const org of (orgs.results || [])) {
    const organizationId = org.id;

    // Fetch org streak settings ONCE per org (not per student)
    let orgSettings;
    try {
      orgSettings = await getOrgStreakSettings(db, organizationId, {});
    } catch {
      orgSettings = { gracePeriodDays: 1, timezone: 'UTC' };
    }

    // Get all active students for this organization
    const students = await db.prepare(
      `SELECT id FROM students WHERE organization_id = ? AND is_active = 1`
    ).bind(organizationId).all();

    const studentList = students.results || [];
    results.total += studentList.length;

    // Process students in concurrent batches of 10
    const batchResults = await processInBatches(studentList, 10, async (student) => {
      // Inline streak update: fetch sessions, calculate, update — avoids
      // re-fetching org settings per student
      const sessions = await db.prepare(`
        SELECT session_date as date FROM reading_sessions
        WHERE student_id = ?
          AND (notes IS NULL OR (notes NOT LIKE '%[ABSENT]%' AND notes NOT LIKE '%[NO_RECORD]%'))
        ORDER BY session_date DESC
      `).bind(student.id).all();

      const streakData = calculateStreak(sessions.results || [], orgSettings);

      await db.prepare(`
        UPDATE students SET
          current_streak = ?,
          longest_streak = ?,
          streak_start_date = ?,
          updated_at = datetime("now")
        WHERE id = ?
      `).bind(
        streakData.currentStreak,
        streakData.longestStreak,
        streakData.streakStartDate,
        student.id
      ).run();
    });

    // Collect errors from settled promises
    for (let i = 0; i < batchResults.length; i++) {
      if (batchResults[i].status === 'fulfilled') {
        results.updated++;
      } else {
        results.errors.push({
          organizationId,
          studentId: studentList[i].id,
          error: batchResults[i].reason?.message || 'Unknown error'
        });
      }
    }
  }

  return results;
};

export { studentsRouter, recalculateAllStreaks };
