import { Hono } from 'hono';
import { generateId } from '../utils/helpers';

// Import services (legacy KV mode)
import {
  getClasses as getClassesKV,
  getClassById as getClassByIdKV,
  saveClass as saveClassKV,
  deleteClass as deleteClassKV
} from '../services/kvService';

// Import utilities
import { notFoundError, badRequestError } from '../middleware/errorHandler';
import { permissions } from '../utils/crypto';

// Create router
const classesRouter = new Hono();

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
 * Convert database row to class object (snake_case to camelCase)
 */
const rowToClass = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    teacherName: row.teacher_name,
    academicYear: row.academic_year,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

/**
 * GET /api/classes
 * Get all classes
 */
classesRouter.get('/', async (c) => {
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    const result = await db.prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.is_active = 1) as student_count
      FROM classes c
      WHERE c.organization_id = ? AND c.is_active = 1
      ORDER BY c.name ASC
    `).bind(organizationId).all();
    
    const classes = (result.results || []).map(row => ({
      ...rowToClass(row),
      studentCount: row.student_count
    }));
    
    return c.json(classes);
  }
  
  // Legacy mode: use KV
  const classes = await getClassesKV(c.env);
  return c.json(classes);
});

/**
 * GET /api/classes/:id
 * Get a class by ID
 */
classesRouter.get('/:id', async (c) => {
  const { id } = c.req.param();
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    const cls = await db.prepare(`
      SELECT c.*, 
        (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id AND s.is_active = 1) as student_count
      FROM classes c
      WHERE c.id = ? AND c.organization_id = ? AND c.is_active = 1
    `).bind(id, organizationId).first();
    
    if (!cls) {
      throw notFoundError(`Class with ID ${id} not found`);
    }
    
    return c.json({
      ...rowToClass(cls),
      studentCount: cls.student_count
    });
  }
  
  // Legacy mode: use KV
  const cls = await getClassByIdKV(c.env, id);
  
  if (!cls) {
    throw notFoundError(`Class with ID ${id} not found`);
  }
  
  return c.json(cls);
});

/**
 * GET /api/classes/:id/students
 * Get all students in a class
 */
classesRouter.get('/:id/students', async (c) => {
  const { id } = c.req.param();
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    // Verify class exists and belongs to organization
    const cls = await db.prepare(`
      SELECT id FROM classes WHERE id = ? AND organization_id = ? AND is_active = 1
    `).bind(id, organizationId).first();
    
    if (!cls) {
      throw notFoundError(`Class with ID ${id} not found`);
    }
    
    const result = await db.prepare(`
      SELECT * FROM students WHERE class_id = ? AND is_active = 1 ORDER BY name ASC
    `).bind(id).all();
    
    const students = (result.results || []).map(row => ({
      id: row.id,
      name: row.name,
      classId: row.class_id,
      lastReadDate: row.last_read_date,
      readingLevel: row.reading_level,
      likes: row.likes ? JSON.parse(row.likes) : [],
      dislikes: row.dislikes ? JSON.parse(row.dislikes) : []
    }));
    
    return c.json(students);
  }
  
  // Legacy mode: not directly supported, return empty
  return c.json([]);
});

/**
 * POST /api/classes
 * Add a new class
 */
classesRouter.post('/', async (c) => {
  const body = await c.req.json();
  
  // Validate class data
  if (!body.name) {
    throw badRequestError('Class name is required');
  }
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');
    
    // Check permission
    const user = c.get('user');
    if (!permissions.canManageClasses(user.role)) {
      return c.json({ error: 'Permission denied' }, 403);
    }
    
    const classId = body.id || generateId();
    
    await db.prepare(`
      INSERT INTO classes (id, organization_id, name, teacher_name, academic_year, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      classId,
      organizationId,
      body.name,
      body.teacherName || null,
      body.academicYear || new Date().getFullYear().toString(),
      userId
    ).run();
    
    // Fetch the created class
    const cls = await db.prepare(`
      SELECT * FROM classes WHERE id = ?
    `).bind(classId).first();
    
    return c.json(rowToClass(cls), 201);
  }
  
  // Legacy mode: use KV
  const newClass = {
    id: body.id || generateId(),
    name: body.name,
    teacherName: body.teacherName || '',
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  const savedClass = await saveClassKV(c.env, newClass);
  return c.json(savedClass, 201);
});

/**
 * PUT /api/classes/:id
 * Update a class
 */
classesRouter.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  
  // Validate class data
  if (!body.name) {
    throw badRequestError('Class name is required');
  }
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    // Check permission
    const user = c.get('user');
    if (!permissions.canManageClasses(user.role)) {
      return c.json({ error: 'Permission denied' }, 403);
    }
    
    // Check if class exists and belongs to organization
    const existing = await db.prepare(`
      SELECT id FROM classes WHERE id = ? AND organization_id = ? AND is_active = 1
    `).bind(id, organizationId).first();
    
    if (!existing) {
      throw notFoundError(`Class with ID ${id} not found`);
    }
    
    // Update class
    await db.prepare(`
      UPDATE classes SET
        name = ?,
        teacher_name = ?,
        academic_year = ?,
        updated_at = datetime("now")
      WHERE id = ? AND organization_id = ?
    `).bind(
      body.name,
      body.teacherName || null,
      body.academicYear || null,
      id,
      organizationId
    ).run();
    
    // Fetch updated class
    const cls = await db.prepare(`
      SELECT * FROM classes WHERE id = ?
    `).bind(id).first();
    
    return c.json(rowToClass(cls));
  }
  
  // Legacy mode: use KV
  const existingClass = await getClassByIdKV(c.env, id);
  if (!existingClass) {
    throw notFoundError(`Class with ID ${id} not found`);
  }
  
  const updatedClass = {
    ...existingClass,
    name: body.name,
    teacherName: body.teacherName || existingClass.teacherName || '',
    updatedAt: new Date().toISOString()
  };
  
  const savedClass = await saveClassKV(c.env, updatedClass);
  return c.json(savedClass);
});

/**
 * DELETE /api/classes/:id
 * Delete a class (soft delete in multi-tenant mode)
 */
classesRouter.delete('/:id', async (c) => {
  const { id } = c.req.param();
  
  // Multi-tenant mode: use D1 (soft delete)
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    // Check permission
    const user = c.get('user');
    if (!permissions.canManageClasses(user.role)) {
      return c.json({ error: 'Permission denied' }, 403);
    }
    
    // Check if class exists
    const existing = await db.prepare(`
      SELECT id FROM classes WHERE id = ? AND organization_id = ? AND is_active = 1
    `).bind(id, organizationId).first();
    
    if (!existing) {
      throw notFoundError(`Class with ID ${id} not found`);
    }
    
    // Soft delete - also unassign students from this class
    await db.batch([
      db.prepare(`UPDATE classes SET is_active = 0, updated_at = datetime("now") WHERE id = ?`).bind(id),
      db.prepare(`UPDATE students SET class_id = NULL, updated_at = datetime("now") WHERE class_id = ?`).bind(id)
    ]);
    
    return c.json({ message: 'Class deleted successfully' });
  }
  
  // Legacy mode: use KV
  const success = await deleteClassKV(c.env, id);
  
  if (!success) {
    throw notFoundError(`Class with ID ${id} not found`);
  }
  
  return c.json({ message: 'Class deleted successfully' });
});

export { classesRouter };
