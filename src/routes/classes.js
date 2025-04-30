import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';

// Import services
import {
  getClasses,
  getClassById,
  saveClass,
  deleteClass
} from '../services/kvService';

// Import utilities
import { notFoundError, badRequestError } from '../middleware/errorHandler';

// Create router
const classesRouter = new Hono();

/**
 * GET /api/classes
 * Get all classes
 */
classesRouter.get('/', async (c) => {
  const classes = await getClasses(c.env);
  return c.json(classes);
});

/**
 * GET /api/classes/:id
 * Get a class by ID
 */
classesRouter.get('/:id', async (c) => {
  const { id } = c.req.param();
  const cls = await getClassById(c.env, id);
  
  if (!cls) {
    throw notFoundError(`Class with ID ${id} not found`);
  }
  
  return c.json(cls);
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
  
  // Create new class
  const newClass = {
    id: body.id || uuidv4(),
    name: body.name,
    teacherName: body.teacherName || '',
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // Save class
  const savedClass = await saveClass(c.env, newClass);
  
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
  
  // Check if class exists
  const existingClass = await getClassById(c.env, id);
  if (!existingClass) {
    throw notFoundError(`Class with ID ${id} not found`);
  }
  
  // Update class
  const updatedClass = {
    ...existingClass,
    name: body.name,
    teacherName: body.teacherName || existingClass.teacherName || '',
    updatedAt: new Date().toISOString()
  };
  
  // Save updated class
  const savedClass = await saveClass(c.env, updatedClass);
  
  return c.json(savedClass);
});

/**
 * DELETE /api/classes/:id
 * Delete a class
 */
classesRouter.delete('/:id', async (c) => {
  const { id } = c.req.param();
  
  // Delete class
  const success = await deleteClass(c.env, id);
  
  if (!success) {
    throw notFoundError(`Class with ID ${id} not found`);
  }
  
  return c.json({ message: 'Class deleted successfully' });
});

export { classesRouter };