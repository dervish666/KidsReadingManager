import { Hono } from 'hono';
import { generateId } from '../utils/helpers';

// Import services (legacy KV mode)
import {
  getStudents as getStudentsKV,
  getStudentById as getStudentByIdKV,
  saveStudent as saveStudentKV,
  deleteStudent as deleteStudentKV,
  addStudents as addStudentsKV
} from '../services/kvService';

// Import utilities
import { validateStudent, validateBulkImport } from '../utils/validation';
import { notFoundError, badRequestError } from '../middleware/errorHandler';
import { requireRole } from '../middleware/tenant';
import { permissions } from '../utils/crypto';

// Create router
const studentsRouter = new Hono();

/**
 * Helper to get D1 database
 */
const getDB = (env) => {
  if (!env || !env.READING_MANAGER_DB) {
    return null;
  }
  return env.READING_MANAGER_DB;
};

/**
 * Check if multi-tenant mode is enabled
 */
const isMultiTenantMode = (c) => {
  return Boolean(c.env.JWT_SECRET && c.get('organizationId'));
};

/**
 * Convert database row to student object (snake_case to camelCase)
 */
const rowToStudent = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    classId: row.class_id,
    lastReadDate: row.last_read_date,
    likes: row.likes ? JSON.parse(row.likes) : [],
    dislikes: row.dislikes ? JSON.parse(row.dislikes) : [],
    readingLevel: row.reading_level,
    notes: row.notes,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentBookId: row.current_book_id || null,
    currentBookTitle: row.current_book_title || null,
    currentBookAuthor: row.current_book_author || null,
    readingSessions: [], // Default empty array, will be populated separately if needed
    preferences: {
      favoriteGenreIds: [],
      likes: [],
      dislikes: []
    }
  };
};

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
 * GET /api/students
 * Get all students
 */
studentsRouter.get('/', async (c) => {
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    const result = await db.prepare(`
      SELECT s.*, c.name as class_name, b.title as current_book_title, b.author as current_book_author
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN books b ON s.current_book_id = b.id
      WHERE s.organization_id = ? AND s.is_active = 1
      ORDER BY s.name ASC
    `).bind(organizationId).all();
    
    const students = (result.results || []).map(row => ({
      ...rowToStudent(row),
      className: row.class_name
    }));
    
    // Fetch reading sessions and preferences for each student
    for (const student of students) {
      const sessions = await db.prepare(`
        SELECT rs.*, b.title as book_title, b.author as book_author
        FROM reading_sessions rs
        LEFT JOIN books b ON rs.book_id = b.id
        WHERE rs.student_id = ?
        ORDER BY rs.session_date DESC
      `).bind(student.id).all();
      
      student.readingSessions = (sessions.results || []).map(s => ({
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
      
      // Fetch student preferences
      student.preferences = await fetchStudentPreferences(db, student.id);
      // Also include likes/dislikes from the students table in preferences
      student.preferences.likes = student.likes || [];
      student.preferences.dislikes = student.dislikes || [];
    }
    
    return c.json(students);
  }
  
  // Legacy mode: use KV
  const students = await getStudentsKV(c.env);
  return c.json(students);
});

/**
 * GET /api/students/:id
 * Get a single student by ID
 */
studentsRouter.get('/:id', async (c) => {
  const { id } = c.req.param();
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    const student = await db.prepare(`
      SELECT s.*, c.name as class_name, b.title as current_book_title, b.author as current_book_author
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN books b ON s.current_book_id = b.id
      WHERE s.id = ? AND s.organization_id = ? AND s.is_active = 1
    `).bind(id, organizationId).first();
    
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
studentsRouter.post('/', async (c) => {
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
      return c.json({ error: 'Permission denied' }, 403);
    }
    
    const studentId = body.id || generateId();
    
    await db.prepare(`
      INSERT INTO students (id, organization_id, name, class_id, reading_level, likes, dislikes, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      studentId,
      organizationId,
      body.name,
      body.classId || null,
      body.readingLevel || null,
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
    dislikes: body.dislikes || []
  };
  
  const savedStudent = await saveStudentKV(c.env, newStudent);
  return c.json(savedStudent, 201);
});

/**
 * PUT /api/students/:id
 * Update a student
 */
studentsRouter.put('/:id', async (c) => {
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
      return c.json({ error: 'Permission denied' }, 403);
    }
    
    // Check if student exists and belongs to organization
    const existing = await db.prepare(`
      SELECT id FROM students WHERE id = ? AND organization_id = ? AND is_active = 1
    `).bind(id, organizationId).first();
    
    if (!existing) {
      throw notFoundError(`Student with ID ${id} not found`);
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
        reading_level = ?,
        likes = ?,
        dislikes = ?,
        notes = ?,
        updated_at = datetime("now")
      WHERE id = ? AND organization_id = ?
    `).bind(
      body.name,
      body.classId || null,
      body.readingLevel || null,
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
studentsRouter.delete('/:id', async (c) => {
  const { id } = c.req.param();
  
  // Multi-tenant mode: use D1 (soft delete)
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    // Check permission
    const userRole = c.get('userRole');
    if (!permissions.canManageStudents(userRole)) {
      return c.json({ error: 'Permission denied' }, 403);
    }
    
    // Check if student exists
    const existing = await db.prepare(`
      SELECT id FROM students WHERE id = ? AND organization_id = ? AND is_active = 1
    `).bind(id, organizationId).first();
    
    if (!existing) {
      throw notFoundError(`Student with ID ${id} not found`);
    }
    
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
studentsRouter.put('/:id/current-book', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();

  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    // Check if student exists and belongs to organization
    const existing = await db.prepare(`
      SELECT id FROM students WHERE id = ? AND organization_id = ? AND is_active = 1
    `).bind(id, organizationId).first();

    if (!existing) {
      throw notFoundError(`Student with ID ${id} not found`);
    }

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
studentsRouter.post('/bulk', async (c) => {
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
      return c.json({ error: 'Permission denied' }, 403);
    }
    
    // Prepare batch insert (D1 batch limit is 100)
    const students = body.map(student => ({
      id: student.id || generateId(),
      name: student.name,
      classId: student.classId || null,
      readingLevel: student.readingLevel || null,
      likes: student.likes || [],
      dislikes: student.dislikes || []
    }));
    
    // Insert in batches of 100
    const batchSize = 100;
    const savedStudents = [];
    
    for (let i = 0; i < students.length; i += batchSize) {
      const batch = students.slice(i, i + batchSize);
      const statements = batch.map(student => {
        return db.prepare(`
          INSERT INTO students (id, organization_id, name, class_id, reading_level, likes, dislikes, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          student.id,
          organizationId,
          student.name,
          student.classId,
          student.readingLevel,
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
    dislikes: student.dislikes || []
  }));
  
  const savedStudents = await addStudentsKV(c.env, newStudents);
  return c.json(savedStudents, 201);
});

/**
 * POST /api/students/:id/sessions
 * Add a reading session to a student
 */
studentsRouter.post('/:id/sessions', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');
    
    // Check if student exists and belongs to organization
    const student = await db.prepare(`
      SELECT id FROM students WHERE id = ? AND organization_id = ? AND is_active = 1
    `).bind(id, organizationId).first();
    
    if (!student) {
      throw notFoundError(`Student with ID ${id} not found`);
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
      body.pagesRead || null,
      body.duration || null,
      body.assessment || null,
      body.notes || null,
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
studentsRouter.delete('/:id/sessions/:sessionId', async (c) => {
  const { id, sessionId } = c.req.param();
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    // Check if student exists and belongs to organization
    const student = await db.prepare(`
      SELECT id FROM students WHERE id = ? AND organization_id = ? AND is_active = 1
    `).bind(id, organizationId).first();
    
    if (!student) {
      throw notFoundError(`Student with ID ${id} not found`);
    }
    
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
studentsRouter.put('/:id/sessions/:sessionId', async (c) => {
  const { id, sessionId } = c.req.param();
  const body = await c.req.json();
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    // Check if student exists and belongs to organization
    const student = await db.prepare(`
      SELECT id FROM students WHERE id = ? AND organization_id = ? AND is_active = 1
    `).bind(id, organizationId).first();
    
    if (!student) {
      throw notFoundError(`Student with ID ${id} not found`);
    }
    
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
      body.bookId || null,
      body.bookTitle || null,
      body.bookAuthor || null,
      body.pagesRead || null,
      body.duration || null,
      body.assessment || null,
      body.notes || null,
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

export { studentsRouter };
