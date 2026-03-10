/**
 * Tally Reading - Cloudflare Worker
 *
 * This file serves both the API and frontend from a single Worker.
 * - API requests (/api/*) are handled by Hono routes
 * - Static frontend assets are handled by Cloudflare Workers Sites
 * 
 * Multi-tenant SaaS Architecture:
 * - JWT-based authentication with organization context
 * - Tenant isolation via middleware
 * - Role-based access control (owner, admin, teacher, readonly)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { bodyLimit } from 'hono/body-limit';

// Import route handlers
import { studentsRouter, recalculateAllStreaks } from './routes/students';
import { settingsRouter } from './routes/settings';
import { dataRouter } from './routes/data';
import { classesRouter } from './routes/classes';
import { booksRouter } from './routes/books';
import { genresRouter } from './routes/genres';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { organizationRouter } from './routes/organization';
import coversRouter from './routes/covers';
import { signupRouter } from './routes/signup';
import { hardcoverRouter } from './routes/hardcover';
import { myloginRouter } from './routes/mylogin.js';
import webhooksRouter from './routes/webhooks.js';
import wondeAdminRouter from './routes/wondeAdmin.js';
import { supportRouter } from './routes/support.js';
import { termDatesRouter } from './routes/termDates.js';
import { runFullSync } from './services/wondeSync.js';
import { decryptSensitiveData } from './utils/crypto.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware, handleLogin } from './middleware/auth';
import { jwtAuthMiddleware, tenantMiddleware } from './middleware/tenant';
import { PUBLIC_PATHS } from './utils/constants.js';

// Create Hono app for the API
const app = new Hono();

// Apply middleware
app.use('/api/*', logger());
app.use('/api/*', prettyJSON());
app.use('/api/*', bodyLimit({ maxSize: 1024 * 1024 })); // 1MB max request body

// CORS configuration with explicit origin whitelist
app.use('/api/*', cors({
  origin: (origin, c) => {
    // Allow requests with no origin (e.g., same-origin, mobile apps, curl)
    if (!origin) return origin;

    // In development, allow localhost origins
    if (c.env.ENVIRONMENT === 'development') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return origin;
      }
    }

    // Parse allowed origins from environment variable (comma-separated)
    // Example: ALLOWED_ORIGINS=https://app.example.com,https://www.example.com
    const allowedOrigins = c.env.ALLOWED_ORIGINS
      ? c.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
      : [];

    // Always allow the same origin as the worker itself
    const workerOrigin = new URL(c.req.url).origin;
    if (origin === workerOrigin) {
      return origin;
    }

    // Check if origin is in the whitelist
    if (allowedOrigins.includes(origin)) {
      return origin;
    }

    // In production without explicit config, allow same-origin only
    // Return null to reject the request
    return null;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400, // 24 hours
  credentials: true
}));

// Security headers middleware
app.use('/api/*', async (c, next) => {
  await next();

  // Prevent clickjacking
  c.header('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  c.header('X-Content-Type-Options', 'nosniff');

  // Enable XSS filter (legacy browsers)
  c.header('X-XSS-Protection', '1; mode=block');

  // Strict Transport Security (HTTPS only)
  // max-age=31536000 = 1 year
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Referrer Policy - don't leak full URLs
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy for API responses
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");

  // Prevent caching of sensitive API responses
  if (c.req.path.includes('/auth/') || c.req.path.includes('/users/')) {
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    c.header('Pragma', 'no-cache');
  }

  // Allow short client-side caching for global (non-org-scoped) GET data
  if (c.req.method === 'GET' && !c.res.headers.has('Cache-Control')) {
    if (c.req.path.startsWith('/api/genres')) {
      c.header('Cache-Control', 'private, max-age=60, stale-while-revalidate=300');
    }
  }
});

// Error handler (kept last in the chain)
app.use('/api/*', errorHandler());

// ============================================================================
// Authentication Strategy
// ============================================================================
// The app supports two authentication modes:
// 1. Legacy mode: Simple shared password (WORKER_ADMIN_PASSWORD)
// 2. Multi-tenant mode: JWT with email/password (JWT_SECRET configured)
//
// When JWT_SECRET is configured, the new JWT auth is used.
// When only WORKER_ADMIN_PASSWORD is configured, legacy auth is used.
// This allows gradual migration to the new system.
// ============================================================================

// Environment validation — fail fast on missing critical config
app.use('/api/*', async (c, next) => {
  if (!c.env.JWT_SECRET && !c.env.WORKER_ADMIN_PASSWORD) {
    return c.json({ error: 'Server misconfigured: no authentication method available' }, 500);
  }
  if (c.env.MYLOGIN_CLIENT_ID && !c.env.MYLOGIN_CLIENT_SECRET) {
    return c.json({ error: 'Server misconfigured: MYLOGIN_CLIENT_SECRET required when MYLOGIN_CLIENT_ID is set' }, 500);
  }
  return next();
});

// Determine which auth middleware to use based on environment
app.use('/api/*', async (c, next) => {
  // Check if JWT_SECRET is configured (new multi-tenant mode)
  if (c.env.JWT_SECRET) {
    // Use new JWT authentication
    return jwtAuthMiddleware()(c, next);
  } else {
    // Fall back to legacy shared password auth
    return authMiddleware()(c, next);
  }
});

// Enable SQLite foreign key enforcement per request (D1 requires this per connection)
app.use('/api/*', async (c, next) => {
  if (c.env.READING_MANAGER_DB) {
    try {
      await c.env.READING_MANAGER_DB.prepare('PRAGMA foreign_keys = ON').run();
    } catch (e) {
      console.error('Failed to enable foreign keys:', e.message);
    }
  }
  return next();
});

// Apply tenant middleware for multi-tenant mode (only if JWT auth is enabled)
app.use('/api/*', async (c, next) => {
  // Skip tenant middleware for public endpoints
  const url = new URL(c.req.url);

  if (PUBLIC_PATHS.includes(url.pathname) || url.pathname.startsWith('/api/covers/')) {
    return next();
  }

  // Only apply tenant middleware if JWT auth is enabled
  if (c.env.JWT_SECRET && c.get('user')) {
    return tenantMiddleware()(c, next);
  }

  return next();
});

// ============================================================================
// API Routes
// ============================================================================

// Auth routes (new multi-tenant authentication)
app.route('/api/auth', authRouter);

// User management routes (multi-tenant)
app.route('/api/users', usersRouter);

// Organization management routes (multi-tenant)
app.route('/api/organization', organizationRouter);

// Existing routes - all under /api path
app.route('/api/students', studentsRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/data', dataRouter);
app.route('/api/classes', classesRouter);
app.route('/api/books', booksRouter);
app.route('/api/genres', genresRouter);
app.route('/api/covers', coversRouter);
app.route('/api/signup', signupRouter);
app.route('/api/hardcover', hardcoverRouter);
app.route('/api/auth/mylogin', myloginRouter);
app.route('/api/webhooks', webhooksRouter);
app.route('/api/wonde', wondeAdminRouter);
app.route('/api/support', supportRouter);
app.route('/api/term-dates', termDatesRouter);

// API health check (public)
app.get('/api/health', async (c) => {
  const health = {
    status: 'ok',
    message: 'Tally Reading API is running',
    version: '3.10.7',
    environment: c.env.ENVIRONMENT || 'unknown',
    features: {
      multiTenant: Boolean(c.env.JWT_SECRET),
      legacyAuth: Boolean(c.env.WORKER_ADMIN_PASSWORD && !c.env.JWT_SECRET)
    }
  };

  // Verify database connectivity
  if (c.env.READING_MANAGER_DB) {
    try {
      await c.env.READING_MANAGER_DB.prepare('SELECT 1').first();
      health.database = 'connected';
    } catch {
      health.status = 'degraded';
      health.database = 'unreachable';
    }
  }

  return c.json(health);
});

// Legacy login endpoint (for backward compatibility)
// This will be deprecated once all clients migrate to /api/auth/login
app.post('/api/login', async (c) => {
  // If JWT_SECRET is configured, redirect to new auth
  if (c.env.JWT_SECRET) {
    return c.json({
      error: 'Please use /api/auth/login for authentication',
      redirect: '/api/auth/login'
    }, 400);
  }
  
  // Otherwise use legacy login
  return handleLogin(c);
});

// Legacy logout endpoint (for backward compatibility)
// In legacy mode, logout just clears client-side token - no server-side action needed
app.post('/api/logout', async (c) => {
  // If JWT_SECRET is configured, redirect to new auth
  if (c.env.JWT_SECRET) {
    return c.json({
      error: 'Please use /api/auth/logout for logout',
      redirect: '/api/auth/logout'
    }, 400);
  }
  
  // Legacy mode: No server-side session to invalidate
  // Client just clears the token from localStorage
  return c.json({ message: 'Logged out successfully' });
});

// Error handler
app.onError((err, c) => {
  console.error(`Error: ${err.message}`);
  const status = err.status || 500;
  const message = status >= 500
    ? 'Internal Server Error'
    : (err.message || 'An error occurred');

  return c.json({
    status: 'error',
    message
  }, status);
});

/**
 * IMPORTANT: Frontend serving is handled automatically by Cloudflare Workers Sites
 * through the [site] configuration in wrangler.toml with single_page_app = true.
 *
 * We don't need any explicit code here to serve the frontend.
 *
 * Cloudflare Workers Sites will:
 * 1. Try to match requests to static files in the build directory
 * 2. For any paths that don't match a static file or API route, serve index.html
 */

// Export the main fetch handler for the Worker
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route API requests to Hono app
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }

    // Serve static assets (SPA fallback handled by not_found_handling in wrangler.toml)
    try {
      return await env.ASSETS.fetch(request);
    } catch (e) {
      console.error(`ASSETS fetch failed: ${e.message}`);
      return new Response('Not Found', { status: 404 });
    }
  },

  /**
   * Scheduled handler for cron triggers
   * Runs daily to recalculate all student streaks across all organizations
   * This keeps database values accurate for reporting purposes
   */
  async scheduled(event, env, ctx) {
    console.log(`[Cron] Streak recalculation triggered at ${new Date().toISOString()}`);

    // Only run if multi-tenant mode is enabled (D1 database required)
    if (!env.JWT_SECRET || !env.READING_MANAGER_DB) {
      console.log('[Cron] Skipping streak recalculation - multi-tenant mode not enabled');
      return;
    }

    const db = env.READING_MANAGER_DB;

    try {
      const results = await recalculateAllStreaks(db);

      console.log(`[Cron] Streak recalculation complete:`, {
        organizations: results.organizations,
        studentsProcessed: results.total,
        studentsUpdated: results.updated,
        errors: results.errors.length
      });

      if (results.errors.length > 0) {
        console.error('[Cron] Streak recalculation errors:', results.errors.slice(0, 10)); // Log first 10 errors
      }
    } catch (error) {
      console.error('[Cron] Streak recalculation failed:', error.message);
    }

    // GDPR data retention cleanup jobs
    try {
      // Clean up expired refresh tokens
      const expiredRefresh = await db.prepare(
        `DELETE FROM refresh_tokens WHERE expires_at < datetime('now') OR revoked_at IS NOT NULL`
      ).run();
      console.log(`[Cron] Cleaned up ${expiredRefresh.meta?.changes || 0} expired/revoked refresh tokens`);

      // Clean up expired or used password reset tokens
      const expiredReset = await db.prepare(
        `DELETE FROM password_reset_tokens WHERE expires_at < datetime('now') OR used_at IS NOT NULL`
      ).run();
      console.log(`[Cron] Cleaned up ${expiredReset.meta?.changes || 0} expired/used password reset tokens`);

      // Clean up login attempts older than 30 days (contains IP addresses - personal data)
      const oldLogins = await db.prepare(
        `DELETE FROM login_attempts WHERE created_at < datetime('now', '-30 days')`
      ).run();
      console.log(`[Cron] Cleaned up ${oldLogins.meta?.changes || 0} login attempts older than 30 days`);

      // Anonymise IP addresses and user-agents in audit logs older than 90 days
      const anonAudit = await db.prepare(
        `UPDATE audit_log SET ip_address = 'anonymised', user_agent = 'anonymised' WHERE created_at < datetime('now', '-90 days') AND ip_address != 'anonymised' AND ip_address IS NOT NULL`
      ).run();
      console.log(`[Cron] Anonymised ${anonAudit.meta?.changes || 0} audit log entries older than 90 days`);

      // Hard-delete audit log entries older than 1 year (anonymised at 90 days, fully removed at 365)
      const oldAudit = await db.prepare(
        `DELETE FROM audit_log WHERE created_at < datetime('now', '-365 days')`
      ).run();
      if (oldAudit.meta?.changes > 0) {
        console.log(`[Cron] Deleted ${oldAudit.meta.changes} audit log entries older than 1 year`);
      }

      // Clean up stale rate limit records (older than 1 hour)
      const oldRateLimits = await db.prepare(
        `DELETE FROM rate_limits WHERE created_at < datetime('now', '-1 hour')`
      ).run();
      console.log(`[Cron] Cleaned up ${oldRateLimits.meta?.changes || 0} stale rate limit records`);

      // Clean up expired OAuth states (older than 5 minutes)
      const expiredStates = await db.prepare(
        `DELETE FROM oauth_state WHERE created_at < datetime('now', '-5 minutes')`
      ).run();
      if (expiredStates.meta?.changes > 0) {
        console.log(`[Cron] Cleaned up ${expiredStates.meta.changes} expired OAuth states`);
      }
    } catch (error) {
      console.error('[Cron] GDPR data retention cleanup failed:', error.message);
    }

    // Auto hard-delete soft-deleted records after 90-day retention period
    // Uses chunked db.batch() (max 100 statements) instead of per-record sequential deletes
    try {
      // Hard-delete soft-deleted students (cascade: sessions → preferences → student)
      const staleStudents = await db.prepare(
        `SELECT id FROM students WHERE is_active = 0 AND updated_at < datetime('now', '-90 days')`
      ).bind().all();

      const studentIds = (staleStudents.results || []).map(s => s.id);
      if (studentIds.length > 0) {
        // 3 statements per student; chunk at 33 students to stay under 100-statement D1 batch limit
        const STUDENT_CHUNK = 33;
        for (let i = 0; i < studentIds.length; i += STUDENT_CHUNK) {
          const chunk = studentIds.slice(i, i + STUDENT_CHUNK);
          const statements = chunk.flatMap(id => [
            db.prepare('DELETE FROM reading_sessions WHERE student_id = ?').bind(id),
            db.prepare('DELETE FROM student_preferences WHERE student_id = ?').bind(id),
            db.prepare('DELETE FROM students WHERE id = ?').bind(id),
          ]);
          await db.batch(statements);
        }
        console.log(`[Cron] Hard-deleted ${studentIds.length} soft-deleted students past 90-day retention`);
      }

      // Hard-delete soft-deleted users (cascade: refresh_tokens → password_reset_tokens → user)
      const staleUsers = await db.prepare(
        `SELECT id FROM users WHERE is_active = 0 AND updated_at < datetime('now', '-90 days')`
      ).bind().all();

      const userIds = (staleUsers.results || []).map(u => u.id);
      if (userIds.length > 0) {
        // 3 statements per user; chunk at 33 users
        const USER_CHUNK = 33;
        for (let i = 0; i < userIds.length; i += USER_CHUNK) {
          const chunk = userIds.slice(i, i + USER_CHUNK);
          const statements = chunk.flatMap(id => [
            db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').bind(id),
            db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(id),
            db.prepare('DELETE FROM users WHERE id = ?').bind(id),
          ]);
          await db.batch(statements);
        }
        console.log(`[Cron] Hard-deleted ${userIds.length} soft-deleted users past 90-day retention`);
      }

      // Hard-delete inactive organizations (only if no active students or users remain)
      const staleOrgs = await db.prepare(
        `SELECT id FROM organizations WHERE is_active = 0 AND updated_at < datetime('now', '-90 days')`
      ).bind().all();

      let orgsDeleted = 0;
      for (const org of (staleOrgs.results || [])) {
        const activeStudents = await db.prepare(
          'SELECT COUNT(*) as count FROM students WHERE organization_id = ? AND is_active = 1'
        ).bind(org.id).first();
        const activeUsers = await db.prepare(
          'SELECT COUNT(*) as count FROM users WHERE organization_id = ? AND is_active = 1'
        ).bind(org.id).first();

        if ((activeStudents?.count || 0) === 0 && (activeUsers?.count || 0) === 0) {
          await db.prepare('DELETE FROM organizations WHERE id = ?').bind(org.id).run();
          orgsDeleted++;
        }
      }
      if (orgsDeleted > 0) {
        console.log(`[Cron] Hard-deleted ${orgsDeleted} inactive organizations past 90-day retention`);
      }
    } catch (error) {
      console.error('[Cron] Retention auto-deletion failed:', error.message);
    }

    // Wonde daily delta sync — process orgs concurrently (batches of 5)
    try {
      const wondeOrgs = await db.prepare(
        'SELECT id, wonde_school_id, wonde_school_token, wonde_last_sync_at FROM organizations WHERE wonde_school_id IS NOT NULL AND wonde_school_token IS NOT NULL AND is_active = 1'
      ).bind().all();

      const orgList = wondeOrgs.results || [];
      const SYNC_CONCURRENCY = 5;
      for (let i = 0; i < orgList.length; i += SYNC_CONCURRENCY) {
        const batch = orgList.slice(i, i + SYNC_CONCURRENCY);
        const results = await Promise.allSettled(batch.map(async (org) => {
          const schoolToken = await decryptSensitiveData(org.wonde_school_token, env.JWT_SECRET);
          await runFullSync(org.id, schoolToken, org.wonde_school_id, db, {
            updatedAfter: org.wonde_last_sync_at,
          });
          return org.id;
        }));

        for (const result of results) {
          if (result.status === 'fulfilled') {
            console.log(`[Cron] Wonde sync complete for org ${result.value}`);
          } else {
            console.error(`[Cron] Wonde sync failed:`, result.reason?.message);
          }
        }
      }
    } catch (error) {
      console.error('[Cron] Wonde sync query failed:', error.message);
    }
  },
};
