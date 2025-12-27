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
import { studentsRouter } from './routes/students';
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
app.use('/api/*', cors());

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
    '/api/login'
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

// Error handler
app.onError((err, c) => {
  console.error(`Error: ${err.message}`);
  return c.json({
    status: 'error',
    message: err.message || 'Internal Server Error'
  }, err.status || 500);
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
};
