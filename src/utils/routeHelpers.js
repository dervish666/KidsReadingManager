/**
 * Shared route helpers - eliminates duplication across route files.
 *
 * getDB()              – returns D1 binding or null (for routes with KV fallback)
 * requireDB()          – returns D1 binding or throws (for routes that require D1)
 * isMultiTenantMode()  – true when JWT auth + org context are present
 * safeJsonParse()      – JSON.parse with fallback value on failure
 */

/**
 * Get D1 database binding, returning null if unavailable.
 * Use this in routes that have a legacy KV/JSON fallback path.
 */
export const getDB = (env) => {
  if (!env || !env.READING_MANAGER_DB) {
    return null;
  }
  return env.READING_MANAGER_DB;
};

/**
 * Get D1 database binding, throwing if unavailable.
 * Use this in routes that require D1 (no legacy fallback).
 */
export const requireDB = (env) => {
  if (!env || !env.READING_MANAGER_DB) {
    throw new Error('Database not available');
  }
  return env.READING_MANAGER_DB;
};

/**
 * Check if multi-tenant mode is enabled (JWT auth + organization context).
 */
export const isMultiTenantMode = (c) => {
  return Boolean(c.env.JWT_SECRET && c.get('organizationId'));
};

/**
 * Safe JSON parse with fallback. Returns fallback on null/undefined input
 * or malformed JSON instead of throwing.
 */
export const safeJsonParse = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

/**
 * Verify a student exists, is active, and belongs to the given organization.
 * Throws notFoundError if not found.
 * @param {Object} db - D1 database binding
 * @param {string} id - Student ID
 * @param {string} organizationId - Organization ID
 * @returns {Promise<Object>} - The row with at least { id }
 */
export const requireStudent = async (db, id, organizationId) => {
  const { notFoundError } = await import('../middleware/errorHandler.js');
  const row = await db
    .prepare('SELECT id FROM students WHERE id = ? AND organization_id = ? AND is_active = 1')
    .bind(id, organizationId)
    .first();
  if (!row) {
    throw notFoundError(`Student with ID ${id} not found`);
  }
  return row;
};
