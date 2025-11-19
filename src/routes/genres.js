import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';

// Import services
import {
  getGenres,
  getGenreById,
  saveGenre,
  deleteGenre
} from '../services/kvService';

// Import utilities
import { notFoundError, badRequestError } from '../middleware/errorHandler';

// Create router
const genresRouter = new Hono();

/**
 * GET /api/genres
 * Get all genres
 */
genresRouter.get('/', async (c) => {
  const genres = await getGenres(c.env);
  return c.json(genres);
});

/**
 * GET /api/genres/:id
 * Get a genre by ID
 */
genresRouter.get('/:id', async (c) => {
  const { id } = c.req.param();
  const genre = await getGenreById(c.env, id);
  
  if (!genre) {
    throw notFoundError(`Genre with ID ${id} not found`);
  }
  
  return c.json(genre);
});

/**
 * POST /api/genres
 * Add a new genre
 */
genresRouter.post('/', async (c) => {
  const body = await c.req.json();
  
  // Validate genre data
  if (!body.name) {
    throw badRequestError('Genre name is required');
  }
  
  // Create new genre
  const newGenre = {
    id: body.id || uuidv4(),
    name: body.name,
    isPredefined: body.isPredefined || false,
  };
  
  // Save genre
  const savedGenre = await saveGenre(c.env, newGenre);
  
  return c.json(savedGenre, 201);
});

/**
 * PUT /api/genres/:id
 * Update a genre
 */
genresRouter.put('/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  
  // Validate genre data
  if (!body.name) {
    throw badRequestError('Genre name is required');
  }
  
  // Check if genre exists
  const existingGenre = await getGenreById(c.env, id);
  if (!existingGenre) {
    throw notFoundError(`Genre with ID ${id} not found`);
  }
  
  // Update genre
  const updatedGenre = {
    ...existingGenre,
    name: body.name,
    isPredefined: body.isPredefined !== undefined ? body.isPredefined : existingGenre.isPredefined,
  };
  
  // Save updated genre
  const savedGenre = await saveGenre(c.env, updatedGenre);
  
  return c.json(savedGenre);
});

/**
 * DELETE /api/genres/:id
 * Delete a genre
 */
genresRouter.delete('/:id', async (c) => {
  const { id } = c.req.param();
  
  // Delete genre
  const success = await deleteGenre(c.env, id);
  
  if (!success) {
    throw notFoundError(`Genre with ID ${id} not found`);
  }
  
  return c.json({ message: 'Genre deleted successfully' });
});

export { genresRouter };