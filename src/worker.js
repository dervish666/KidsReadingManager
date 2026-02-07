/**
 * Kids Reading Manager - Cloudflare Worker
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

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware, handleLogin } from './middleware/auth';
import { jwtAuthMiddleware, tenantMiddleware } from './middleware/tenant';

// Create Hono app for the API
const app = new Hono();

// Apply middleware
app.use('/api/*', logger());
app.use('/api/*', prettyJSON());

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
  allowHeaders: ['Content-Type', 'Authorization'],
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
  const publicPaths = [
    '/api/auth/mode',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/health',
    '/api/login',
    '/api/logout'
  ];

  if (publicPaths.includes(url.pathname)) {
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

// API health check (public)
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    message: 'Kids Reading Manager API is running',
    version: '2.0.0',
    environment: c.env.ENVIRONMENT || 'unknown',
    features: {
      multiTenant: Boolean(c.env.JWT_SECRET),
      legacyAuth: Boolean(c.env.WORKER_ADMIN_PASSWORD && !c.env.JWT_SECRET)
    }
  });
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

    // Otherwise, serve static assets using Workers Sites
    // The `env.ASSETS` binding is automatically configured by [site] in wrangler.toml
    try {
      return await env.ASSETS.fetch(request);
    } catch (e) {
      // If env.ASSETS.fetch() throws an error (e.g., asset not found),
      // let Hono handle it, potentially returning a 404 or other response.
      // This might be useful if you want Hono to handle SPA routing fallbacks,
      // although Workers Sites with single_page_app = true usually handles this.
      // For now, we'll re-throw or return a generic error.
      // Consider if Hono should handle 404s for non-asset paths.
      console.error(`ASSETS fetch failed: ${e.message}`);
      // Re-throwing the error might be appropriate, or return a custom 404
      // return new Response('Not Found', { status: 404 });
      // Let's try passing to Hono to see if it has a fallback (it likely won't match anything)
      // return app.fetch(request, env, ctx);
      // Safest default: return a standard 404
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

    try {
      const db = env.READING_MANAGER_DB;
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
  },
};
