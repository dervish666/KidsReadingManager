/**
 * Kids Reading Manager - Cloudflare Worker
 *
 * This file serves both the API and frontend from a single Worker.
 * - API requests (/api/*) are handled by Hono routes
 * - Static frontend assets are handled by Cloudflare Workers Sites
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

// Import middleware
import { errorHandler } from './middleware/errorHandler';

// Create Hono app for the API
const app = new Hono();

// Apply middleware
app.use('/api/*', logger());
app.use('/api/*', prettyJSON());
app.use('/api/*', cors());
app.use('/api/*', errorHandler());

// Mount API routes - all under /api path
app.route('/api/students', studentsRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/data', dataRouter);
app.route('/api/classes', classesRouter);
app.route('/api/books', booksRouter);

// API health check
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    message: 'Kids Reading Manager API is running',
    version: '1.0.2',
    environment: c.env.ENVIRONMENT || 'unknown'
  });
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