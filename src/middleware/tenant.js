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

/**
 * Resource ownership middleware
 * Ensures the requested resource belongs to the user's organization
 * 
 * @param {string} tableName - Database table name
 * @param {string} idParam - URL parameter name for resource ID (default: 'id')
 * @returns {Function} Hono middleware
 */
export function requireOrgOwnership(tableName, idParam = 'id') {
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
 * Rate limiting middleware (simple in-memory implementation)
 * For production, consider using Cloudflare's built-in rate limiting
 * 
 * @param {number} maxRequests - Maximum requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Hono middleware
 */
export function rateLimit(maxRequests = 100, windowMs = 60000) {
  // Note: This is a simple implementation that won't work across Workers
  // For production, use Cloudflare Rate Limiting or Durable Objects
  const requests = new Map();

  return async (c, next) => {
    const key = c.get('userId') || c.req.header('cf-connecting-ip') || 'anonymous';
    const now = Date.now();

    // Clean old entries
    for (const [k, v] of requests.entries()) {
      if (now - v.timestamp > windowMs) {
        requests.delete(k);
      }
    }

    // Check rate limit
    const entry = requests.get(key);
    if (entry) {
      if (now - entry.timestamp < windowMs && entry.count >= maxRequests) {
        return c.json({ 
          error: 'Too many requests',
          retryAfter: Math.ceil((entry.timestamp + windowMs - now) / 1000)
        }, 429);
      }

      if (now - entry.timestamp < windowMs) {
        entry.count++;
      } else {
        entry.timestamp = now;
        entry.count = 1;
      }
    } else {
      requests.set(key, { timestamp: now, count: 1 });
    }

    return next();
  };
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
