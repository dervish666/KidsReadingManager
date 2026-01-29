import { Hono } from 'hono';
import { generateId } from '../utils/helpers';

// Import services (legacy KV mode)
import {
  getGenres as getGenresKV,
  getGenreById as getGenreByIdKV,
  saveGenre as saveGenreKV,
  deleteGenre as deleteGenreKV
} from '../services/kvService';

// Import utilities
import { notFoundError, badRequestError } from '../middleware/errorHandler';
import { permissions } from '../utils/crypto';

// Import middleware
import { requireReadonly, requireAdmin } from '../middleware/tenant.js';

// Create router
const genresRouter = new Hono();

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
 * Convert database row to genre object (snake_case to camelCase)
 */
const rowToGenre = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isPredefined: Boolean(row.is_predefined),
    createdAt: row.created_at
  };
};

/**
 * GET /api/genres
 * Get all genres (global - shared across all organizations)
 *
 * Requires authentication (at least readonly access)
 */
genresRouter.get('/', requireReadonly(), async (c) => {
  // Multi-tenant mode: use D1 (genres are global)
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    
    const result = await db.prepare(`
      SELECT * FROM genres ORDER BY is_predefined DESC, name ASC
    `).all();
    
    const genres = (result.results || []).map(rowToGenre);
    return c.json(genres);
  }
  
  // Legacy mode: use KV
  const genres = await getGenresKV(c.env);
  return c.json(genres);
});

/**
 * GET /api/genres/:id
 * Get a genre by ID
 *
 * Requires authentication (at least readonly access)
 */
genresRouter.get('/:id', requireReadonly(), async (c) => {
  const { id } = c.req.param();
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    
    const genre = await db.prepare(`
      SELECT * FROM genres WHERE id = ?
    `).bind(id).first();
    
    if (!genre) {
      throw notFoundError(`Genre with ID ${id} not found`);
    }
    
    return c.json(rowToGenre(genre));
  }
  
  // Legacy mode: use KV
  const genre = await getGenreByIdKV(c.env, id);
  
  if (!genre) {
    throw notFoundError(`Genre with ID ${id} not found`);
  }
  
  return c.json(genre);
});

/**
 * POST /api/genres
 * Add a new genre (admin only in multi-tenant mode)
 *
 * Requires authentication (at least admin access)
 */
genresRouter.post('/', requireAdmin(), async (c) => {
  const body = await c.req.json();
  
  // Validate genre data
  if (!body.name) {
    throw badRequestError('Genre name is required');
  }
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    
    // Check permission - only admins can create genres
    const userRole = c.get('userRole');
    if (!permissions.canManageSettings(userRole)) {
      return c.json({ error: 'Permission denied' }, 403);
    }
    
    const genreId = body.id || generateId();
    
    // Check if genre name already exists
    const existing = await db.prepare(`
      SELECT id FROM genres WHERE LOWER(name) = LOWER(?)
    `).bind(body.name).first();
    
    if (existing) {
      throw badRequestError('A genre with this name already exists');
    }
    
    await db.prepare(`
      INSERT INTO genres (id, name, description, is_predefined)
      VALUES (?, ?, ?, ?)
    `).bind(
      genreId,
      body.name,
      body.description || null,
      body.isPredefined ? 1 : 0
    ).run();
    
    // Fetch the created genre
    const genre = await db.prepare(`
      SELECT * FROM genres WHERE id = ?
    `).bind(genreId).first();
    
    return c.json(rowToGenre(genre), 201);
  }
  
  // Legacy mode: use KV
  const newGenre = {
    id: body.id || generateId(),
    name: body.name,
    isPredefined: body.isPredefined || false,
  };
  
  const savedGenre = await saveGenreKV(c.env, newGenre);
  return c.json(savedGenre, 201);
});

/**
 * PUT /api/genres/:id
 * Update a genre (admin only in multi-tenant mode)
 *
 * Requires authentication (at least admin access)
 */
genresRouter.put('/:id', requireAdmin(), async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json();
  
  // Validate genre data
  if (!body.name) {
    throw badRequestError('Genre name is required');
  }
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    
    // Check permission - only admins can update genres
    const userRole = c.get('userRole');
    if (!permissions.canManageSettings(userRole)) {
      return c.json({ error: 'Permission denied' }, 403);
    }
    
    // Check if genre exists
    const existing = await db.prepare(`
      SELECT * FROM genres WHERE id = ?
    `).bind(id).first();
    
    if (!existing) {
      throw notFoundError(`Genre with ID ${id} not found`);
    }
    
    // Check if new name conflicts with another genre
    const nameConflict = await db.prepare(`
      SELECT id FROM genres WHERE LOWER(name) = LOWER(?) AND id != ?
    `).bind(body.name, id).first();
    
    if (nameConflict) {
      throw badRequestError('A genre with this name already exists');
    }
    
    // Update genre
    await db.prepare(`
      UPDATE genres SET name = ?, description = ? WHERE id = ?
    `).bind(
      body.name,
      body.description || null,
      id
    ).run();
    
    // Fetch updated genre
    const genre = await db.prepare(`
      SELECT * FROM genres WHERE id = ?
    `).bind(id).first();
    
    return c.json(rowToGenre(genre));
  }
  
  // Legacy mode: use KV
  const existingGenre = await getGenreByIdKV(c.env, id);
  if (!existingGenre) {
    throw notFoundError(`Genre with ID ${id} not found`);
  }
  
  const updatedGenre = {
    ...existingGenre,
    name: body.name,
    isPredefined: body.isPredefined !== undefined ? body.isPredefined : existingGenre.isPredefined,
  };
  
  const savedGenre = await saveGenreKV(c.env, updatedGenre);
  return c.json(savedGenre);
});

/**
 * DELETE /api/genres/:id
 * Delete a genre (admin only, cannot delete predefined genres)
 *
 * Requires authentication (at least admin access)
 */
genresRouter.delete('/:id', requireAdmin(), async (c) => {
  const { id } = c.req.param();
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    
    // Check permission - only admins can delete genres
    const userRole = c.get('userRole');
    if (!permissions.canManageSettings(userRole)) {
      return c.json({ error: 'Permission denied' }, 403);
    }
    
    // Check if genre exists
    const existing = await db.prepare(`
      SELECT * FROM genres WHERE id = ?
    `).bind(id).first();
    
    if (!existing) {
      throw notFoundError(`Genre with ID ${id} not found`);
    }
    
    // Cannot delete predefined genres
    if (existing.is_predefined) {
      throw badRequestError('Cannot delete predefined genres');
    }
    
    // Delete genre (cascade will handle book_genres)
    await db.prepare(`
      DELETE FROM genres WHERE id = ?
    `).bind(id).run();
    
    return c.json({ message: 'Genre deleted successfully' });
  }
  
  // Legacy mode: use KV
  const success = await deleteGenreKV(c.env, id);
  
  if (!success) {
    throw notFoundError(`Genre with ID ${id} not found`);
  }
  
  return c.json({ message: 'Genre deleted successfully' });
});

export { genresRouter };
