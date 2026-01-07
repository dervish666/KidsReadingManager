/**
 * Tenant Isolation Middleware
 * Ensures all requests are scoped to the authenticated user's organization
 */

import { verifyAccessToken, hasPermission, ROLES } from '../utils/crypto.js';

/**
 * JWT Authentication Middleware
 * Validates JWT token and extracts user/organization context
 * 
 * Public endpoints (no auth required):
 * - POST /api/auth/login
 * - POST /api/auth/register
 * - POST /api/auth/refresh
 * - POST /api/auth/forgot-password
 * - POST /api/auth/reset-password
 * - GET /api/health
 * 
 * @returns {Function} Hono middleware
 */
export function jwtAuthMiddleware() {
  const publicPaths = [
    '/api/auth/mode',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/health',
    '/api/login' // Legacy endpoint for backward compatibility
  ];

  return async (c, next) => {
    const url = new URL(c.req.url);

    // Allow public endpoints
    if (publicPaths.includes(url.pathname)) {
      return next();
    }

    // Get JWT secret from environment
    const jwtSecret = c.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET not configured');
      return c.json({ error: 'Server authentication not configured' }, 500);
    }

    // Extract token from Authorization header
    const authHeader = c.req.header('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized - No token provided' }, 401);
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return c.json({ error: 'Unauthorized - Empty token' }, 401);
    }

    // Verify token
    const result = await verifyAccessToken(token, jwtSecret);
    if (!result.valid) {
      return c.json({ error: `Unauthorized - ${result.error}` }, 401);
    }

    // Set user context for downstream handlers
    c.set('user', result.payload);
    c.set('userId', result.payload.sub);
    c.set('organizationId', result.payload.org);
    c.set('userRole', result.payload.role);

    return next();
  };
}

/**
 * Tenant Isolation Middleware
 * Ensures organization context is available and valid
 * Must be used after jwtAuthMiddleware
 * 
 * @returns {Function} Hono middleware
 */
export function tenantMiddleware() {
  return async (c, next) => {
    const user = c.get('user');

    if (!user?.org) {
      return c.json({ error: 'Organization context required' }, 403);
    }

    // Verify organization exists and is active
    const db = c.env.READING_MANAGER_DB;
    if (db) {
      try {
        const org = await db.prepare(
          'SELECT id, is_active FROM organizations WHERE id = ?'
        ).bind(user.org).first();

        if (!org) {
          return c.json({ error: 'Organization not found' }, 404);
        }

        if (!org.is_active) {
          return c.json({ error: 'Organization is inactive' }, 403);
        }
      } catch (error) {
        console.error('Error verifying organization:', error);
        // Continue if table doesn't exist yet (migration not applied)
      }
    }

    return next();
  };
}

/**
 * Role-based Access Control Middleware
 * Restricts access based on user role
 * 
 * @param {string} requiredRole - Minimum required role
 * @returns {Function} Hono middleware
 */
export function requireRole(requiredRole) {
  return async (c, next) => {
    const userRole = c.get('userRole');

    if (!userRole) {
      return c.json({ error: 'Unauthorized - No role found' }, 401);
    }

    if (!hasPermission(userRole, requiredRole)) {
      return c.json({ 
        error: 'Forbidden - Insufficient permissions',
        required: requiredRole,
        current: userRole
      }, 403);
    }

    return next();
  };
}

/**
 * Convenience middleware factories for common role requirements
 */
export const requireOwner = () => requireRole(ROLES.OWNER);
export const requireAdmin = () => requireRole(ROLES.ADMIN);
export const requireTeacher = () => requireRole(ROLES.TEACHER);
export const requireReadonly = () => requireRole(ROLES.READONLY);

// Whitelist of valid table names for ownership checks
// This prevents SQL injection via dynamic table names
const ALLOWED_OWNERSHIP_TABLES = new Set([
  'students',
  'classes',
  'reading_sessions',
  'books',
  'organization_book_selections',
  'org_settings',
  'org_ai_config',
  'genres',
  'users'
]);

/**
 * Resource ownership middleware
 * Ensures the requested resource belongs to the user's organization
 *
 * @param {string} tableName - Database table name (must be in whitelist)
 * @param {string} idParam - URL parameter name for resource ID (default: 'id')
 * @returns {Function} Hono middleware
 */
export function requireOrgOwnership(tableName, idParam = 'id') {
  // Validate table name at middleware creation time (not runtime)
  if (!ALLOWED_OWNERSHIP_TABLES.has(tableName)) {
    throw new Error(`Invalid table name for ownership check: ${tableName}. Allowed tables: ${[...ALLOWED_OWNERSHIP_TABLES].join(', ')}`);
  }

  return async (c, next) => {
    const organizationId = c.get('organizationId');
    const resourceId = c.req.param(idParam);

    if (!resourceId) {
      return next(); // No resource ID, let the route handler deal with it
    }

    const db = c.env.READING_MANAGER_DB;
    if (!db) {
      return next(); // No DB, skip check
    }

    try {
      const resource = await db.prepare(
        `SELECT organization_id FROM ${tableName} WHERE id = ?`
      ).bind(resourceId).first();

      if (!resource) {
        return c.json({ error: 'Resource not found' }, 404);
      }

      if (resource.organization_id !== organizationId) {
        return c.json({ error: 'Forbidden - Resource belongs to another organization' }, 403);
      }
    } catch (error) {
      console.error(`Error checking ownership for ${tableName}:`, error);
      // Continue if table doesn't exist yet
    }

    return next();
  };
}

/**
 * Audit logging middleware
 * Logs sensitive operations to the audit_log table
 * 
 * @param {string} action - Action type ('create', 'update', 'delete', etc.)
 * @param {string} entityType - Entity type ('student', 'class', 'session', etc.)
 * @returns {Function} Hono middleware
 */
export function auditLog(action, entityType) {
  return async (c, next) => {
    // Execute the handler first
    await next();

    // Only log successful operations (2xx status)
    const status = c.res.status;
    if (status < 200 || status >= 300) {
      return;
    }

    const db = c.env.READING_MANAGER_DB;
    if (!db) return;

    try {
      const userId = c.get('userId');
      const organizationId = c.get('organizationId');
      const entityId = c.req.param('id') || null;

      // Get request details
      const ipAddress = c.req.header('cf-connecting-ip') || 
                        c.req.header('x-forwarded-for') || 
                        'unknown';
      const userAgent = c.req.header('user-agent') || 'unknown';

      // Generate audit log ID
      const id = crypto.randomUUID();

      await db.prepare(`
        INSERT INTO audit_log (id, organization_id, user_id, action, entity_type, entity_id, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        organizationId,
        userId,
        action,
        entityType,
        entityId,
        ipAddress,
        userAgent
      ).run();
    } catch (error) {
      // Don't fail the request if audit logging fails
      console.error('Audit logging error:', error);
    }
  };
}

/**
 * Rate limiting middleware using D1 database for persistence
 *
 * IMPORTANT: This implementation uses D1 for rate limit tracking, which works
 * across all Cloudflare Worker instances. For high-traffic applications,
 * consider using Cloudflare's built-in Rate Limiting Rules instead:
 * https://developers.cloudflare.com/waf/rate-limiting-rules/
 *
 * @param {number} maxRequests - Maximum requests per window (default: 100)
 * @param {number} windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @returns {Function} Hono middleware
 */
export function rateLimit(maxRequests = 100, windowMs = 60000) {
  return async (c, next) => {
    const db = c.env.READING_MANAGER_DB;

    // If no database, skip rate limiting (graceful degradation)
    if (!db) {
      return next();
    }

    // Use IP address as the rate limit key (or userId if authenticated)
    const ipAddress = c.req.header('cf-connecting-ip') ||
                      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
                      'unknown';
    const userId = c.get('userId');
    const key = userId || `ip:${ipAddress}`;
    const endpoint = c.req.path;

    try {
      const windowSeconds = Math.ceil(windowMs / 1000);

      // Count requests in the current window
      const result = await db.prepare(`
        SELECT COUNT(*) as count FROM rate_limits
        WHERE key = ? AND endpoint = ?
        AND created_at > datetime('now', '-${windowSeconds} seconds')
      `).bind(key, endpoint).first();

      const currentCount = result?.count || 0;

      if (currentCount >= maxRequests) {
        // Rate limit exceeded
        return c.json({
          error: 'Too many requests. Please slow down.',
          retryAfter: windowSeconds
        }, 429);
      }

      // Record this request
      await db.prepare(`
        INSERT INTO rate_limits (id, key, endpoint, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(crypto.randomUUID(), key, endpoint).run();

      // Cleanup old entries (async, don't wait) - only run occasionally
      if (Math.random() < 0.01) { // 1% chance to clean up
        db.prepare(`
          DELETE FROM rate_limits WHERE created_at < datetime('now', '-1 hour')
        `).run().catch(() => {});
      }

    } catch (error) {
      // If rate_limits table doesn't exist or other error, continue without rate limiting
      // This allows the app to function while migration is pending
      console.error('Rate limiting error (continuing without limit):', error.message);
    }

    return next();
  };
}

/**
 * Rate limiting for authentication endpoints (stricter limits)
 * Uses per-IP tracking to prevent brute force attacks
 *
 * @returns {Function} Hono middleware
 */
export function authRateLimit() {
  // 10 requests per minute for auth endpoints
  return rateLimit(10, 60000);
}

/**
 * Helper to get organization-scoped query builder
 * Adds organization_id filter to queries
 * 
 * @param {Object} c - Hono context
 * @param {string} baseQuery - Base SQL query
 * @param {Array} params - Query parameters
 * @returns {{query: string, params: Array}}
 */
export function scopeToOrganization(c, baseQuery, params = []) {
  const organizationId = c.get('organizationId');

  // Check if query already has WHERE clause
  const hasWhere = baseQuery.toLowerCase().includes('where');
  const connector = hasWhere ? ' AND' : ' WHERE';

  return {
    query: `${baseQuery}${connector} organization_id = ?`,
    params: [...params, organizationId]
  };
}
