import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';

// Import services
import {
  getStudents,
  getStudentById,
  saveStudent,
  deleteStudent,
  addStudents
} from '../services/kvService';

// Import utilities
import { validateStudent, validateBulkImport } from '../utils/validation';
import { notFoundError, badRequestError } from '../middleware/errorHandler';
import { updateLastReadDate } from '../utils/helpers';

// Create router
const studentsRouter = new Hono();

/**
 * GET /api/students
 * Get all students
 */
studentsRouter.get('/', async (c) => {
  const students = await getStudents(c.env);
  return c.json(students);
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
  
  // Create new student
  const newStudent = {
    id: body.id || uuidv4(),
    name: body.name,
    lastReadDate: body.lastReadDate || null,
    readingSessions: body.readingSessions || []
  };
  
  // Save student
  const savedStudent = await saveStudent(c.env, newStudent);
  
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
  
  // Check if student exists
  const existingStudent = await getStudentById(c.env, id);
  if (!existingStudent) {
    throw notFoundError(`Student with ID ${id} not found`);
  }
  
  // Update student
  const updatedStudent = {
    ...existingStudent,
    ...body,
    id // Ensure ID doesn't change
  };
  
  // Save updated student
  const savedStudent = await saveStudent(c.env, updatedStudent);
  
  return c.json(savedStudent);
});

/**
 * DELETE /api/students/:id
 * Delete a student
 */
studentsRouter.delete('/:id', async (c) => {
  const { id } = c.req.param();
  
  // Delete student
  const success = await deleteStudent(c.env, id);
  
  if (!success) {
    throw notFoundError(`Student with ID ${id} not found`);
  }
  
  return c.json({ message: 'Student deleted successfully' });
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
  
  // Prepare students with IDs and default values
  const newStudents = body.map(student => ({
    id: student.id || uuidv4(),
    name: student.name,
    lastReadDate: student.lastReadDate || null,
    readingSessions: student.readingSessions || []
  }));
  
  // Add students
  const savedStudents = await addStudents(c.env, newStudents);
  
  return c.json(savedStudents, 201);
});

export { studentsRouter };