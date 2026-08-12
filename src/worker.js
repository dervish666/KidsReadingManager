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

import * as Sentry from '@sentry/cloudflare';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
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
import { contactRouter } from './routes/contact.js';
import { termDatesRouter } from './routes/termDates.js';
import { toursRouter } from './routes/tours.js';
import { metadataRouter, getConfigWithKeys } from './routes/metadata.js';
import badgesRouter from './routes/badges.js';
import { parentRouter } from './routes/parent.js';
import { processJobBatch } from './services/metadataService.js';
import stripeWebhookRouter from './routes/stripeWebhook.js';
import { billingRouter } from './routes/billing.js';
import { runFullSync } from './services/wondeSync.js';
import { resetDemoData } from './services/demoReset.js';
import { hardDeleteOrganization } from './services/orgPurge.js';
import { studentEraseStatements, STUDENT_ERASE_STATEMENT_COUNT } from './utils/studentErase.js';
import { D1_BATCH_LIMIT } from './utils/d1Batch.js';
import { decryptSensitiveData, getEncryptionSecret } from './utils/crypto.js';
import { recordCronSuccess, checkCronFreshness } from './utils/cronWatchdog.js';

// Import middleware
import { errorHandler, onError } from './middleware/errorHandler';
import { authMiddleware, handleLogin } from './middleware/auth';
import {
  jwtAuthMiddleware,
  tenantMiddleware,
  subscriptionGate,
  costRateLimit,
} from './middleware/tenant';
import { PUBLIC_PATHS } from './utils/constants.js';
import packageJson from '../package.json';

// Single source of truth for the version — read from package.json so /api/health
// never drifts from the released version again.
const APP_VERSION = packageJson.version;

// Create Hono app for the API
const app = new Hono();

// Apply middleware
app.use('/api/*', async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const { method } = c.req;
  const url = new URL(c.req.url);
  console.log(`  <-- ${method} ${url.pathname} ${c.res.status} ${ms}ms`);
});
app.use('/api/*', bodyLimit({ maxSize: 1024 * 1024 })); // 1MB max request body

// CORS configuration with explicit origin whitelist
app.use(
  '/api/*',
  cors({
    origin: (origin, c) => {
      // Allow requests with no origin (e.g., same-origin, mobile apps, curl)
      if (!origin) return null;

      // In development, allow localhost origins
      if (c.env.ENVIRONMENT === 'development') {
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          return origin;
        }
      }

      // Parse allowed origins from environment variable (comma-separated)
      // Example: ALLOWED_ORIGINS=https://app.example.com,https://www.example.com
      const allowedOrigins = c.env.ALLOWED_ORIGINS
        ? c.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
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
    credentials: true,
  })
);

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
    return c.json(
      {
        error: 'Server misconfigured: MYLOGIN_CLIENT_SECRET required when MYLOGIN_CLIENT_ID is set',
      },
      500
    );
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

// NOTE: there used to be a middleware here running `PRAGMA foreign_keys = ON`
// on every /api/* request, on the belief that D1 needed it per connection. It
// was removed because it never did anything:
//
//   * D1 enforces foreign keys by default. `PRAGMA foreign_keys` returns 1 on
//     both the local and production databases, and an INSERT violating
//     reading_sessions.student_id is rejected with SQLITE_CONSTRAINT_FOREIGNKEY
//     without any PRAGMA having been run first.
//   * More fundamentally, D1 gives no connection affinity between separate
//     prepared statements, so a PRAGMA issued as its own statement could not
//     have applied to the queries that followed it even if it were needed.
//
// It cost one D1 round-trip on every authenticated API request. If you are
// here because something looks like an FK problem, the fix is not to put this
// back — see docs/gdpr/03-dpia.md.

// Public parent routes use token-in-URL auth; teacher-facing parent routes need JWT
function isPublicParentRoute(pathname) {
  return (
    pathname.startsWith('/api/parent/') &&
    !pathname.startsWith('/api/parent/generate/') &&
    !pathname.startsWith('/api/parent/token/') &&
    !pathname.startsWith('/api/parent/class/') &&
    !pathname.startsWith('/api/parent/tokens/')
  );
}

// Apply tenant middleware for multi-tenant mode (only if JWT auth is enabled)
app.use('/api/*', async (c, next) => {
  // Skip tenant middleware for public endpoints
  const url = new URL(c.req.url);

  if (
    PUBLIC_PATHS.includes(url.pathname) ||
    url.pathname.startsWith('/api/covers/') ||
    isPublicParentRoute(url.pathname)
  ) {
    return next();
  }

  // Only apply tenant middleware if JWT auth is enabled
  if (c.env.JWT_SECRET && c.get('user')) {
    return tenantMiddleware()(c, next);
  }

  return next();
});

// Apply subscription access control (must be after tenant middleware sets subscriptionStatus)
app.use('/api/*', async (c, next) => {
  // Skip for public endpoints (they bypass auth entirely and never reach here with user context)
  const url = new URL(c.req.url);
  if (
    PUBLIC_PATHS.includes(url.pathname) ||
    url.pathname.startsWith('/api/covers/') ||
    isPublicParentRoute(url.pathname)
  ) {
    return next();
  }

  // Only apply if JWT auth is enabled and user is authenticated
  if (c.env.JWT_SECRET && c.get('user')) {
    return subscriptionGate()(c, next);
  }

  return next();
});

// ============================================================================
// Cost-sensitive endpoint rate limiting (AI APIs, external proxies)
// ============================================================================
app.use('/api/books/ai-suggestions', costRateLimit(10)); // 10/min — calls Anthropic/OpenAI/Google
// The foreground poller drives this endpoint once per batch (a batch is already
// capped at ~5 books / 20s server-side), so it legitimately fires several times
// a minute. 60/min (~1/s) bounds abuse without throttling a normal run; the
// poller also backs off on 429.
app.use('/api/metadata/enrich', costRateLimit(60));
app.use('/api/hardcover/graphql', costRateLimit(30)); // 30/min — proxied to Hardcover API

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
app.route('/api/contact', contactRouter);
app.route('/api/term-dates', termDatesRouter);
app.route('/api/webhooks/stripe', stripeWebhookRouter);
app.route('/api/billing', billingRouter);
app.route('/api/tours', toursRouter);
app.route('/api/metadata', metadataRouter);
app.route('/api/badges', badgesRouter);
app.route('/api/parent', parentRouter);

// API health check (public)
app.get('/api/health', async (c) => {
  const health = {
    status: 'ok',
    version: APP_VERSION,
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
    return c.json(
      {
        error: 'Please use /api/auth/login for authentication',
        redirect: '/api/auth/login',
      },
      400
    );
  }

  // Otherwise use legacy login
  return handleLogin(c);
});

// Legacy logout endpoint (for backward compatibility)
// In legacy mode, logout just clears client-side token - no server-side action needed
app.post('/api/logout', async (c) => {
  // If JWT_SECRET is configured, redirect to new auth
  if (c.env.JWT_SECRET) {
    return c.json(
      {
        error: 'Please use /api/auth/logout for logout',
        redirect: '/api/auth/logout',
      },
      400
    );
  }

  // Legacy mode: No server-side session to invalidate
  // Client just clears the token from localStorage
  return c.json({ message: 'Logged out successfully' });
});

// Error handler
// Handler-thrown errors (badRequestError & co) land here, not in the
// errorHandler middleware — see the note in middleware/errorHandler.js.
// The shared handler includes both `error` and `message` fields so clients
// reading either keep working.
app.onError(onError);

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

// Export the main fetch handler for the Worker, wrapped with Sentry
export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
    // `ENVIRONMENT` comes from [vars] in wrangler.toml ("production"); the dev
    // deploy overrides it. Without this, prod and dev errors share one stream.
    environment: env.ENVIRONMENT || 'development',
    // Read from the BUNDLED package.json version (APP_VERSION const above), not
    // from a deploy-time --var. It used to be `env.APP_VERSION || 'dev'`, which
    // silently degraded to 'dev' whenever the Worker was published by anything
    // other than `npm run deploy` — Cloudflare Workers Builds does a bare
    // version_upload and carries no --var, so every production event since at
    // least April 2026 was tagged tally-reading@dev while source maps uploaded
    // under tally-reading@<version>. Nothing symbolicated. The bundled constant
    // cannot be dropped by a deploy path. env still wins if explicitly set.
    release: `tally-reading@${env.APP_VERSION || APP_VERSION}`,
    tracesSampleRate: 0.1,
    enableLogs: true,
    // 'log' excluded — the cron handlers log progress on every run and would
    // otherwise ship thousands of routine lines a day as Sentry logs.
    integrations: [Sentry.consoleLoggingIntegration({ levels: ['warn', 'error'] })],
  }),
  {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);

      // Route API requests to Hono app
      if (url.pathname.startsWith('/api/')) {
        const start = Date.now();
        const response = await app.fetch(request, env, ctx);
        Sentry.metrics.distribution('api.response_time', Date.now() - start, {
          unit: 'millisecond',
          tags: { method: request.method, status: String(response.status) },
        });
        Sentry.metrics.count('api.request', 1, {
          tags: { method: request.method, status: String(response.status) },
        });
        return response;
      }

      // Serve static assets (SPA fallback handled by not_found_handling in wrangler.toml)
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        const response = new Response(assetResponse.body, assetResponse);
        response.headers.set('X-Frame-Options', 'DENY');
        response.headers.set('X-Content-Type-Options', 'nosniff');
        response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        response.headers.set(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://covers.openlibrary.org https://*.r2.dev; connect-src 'self' https://*.ingest.de.sentry.io; worker-src 'self' blob:; frame-ancestors 'none'"
        );
        const path = new URL(request.url).pathname;
        if (/\.[a-f0-9]{8}\.(js|css)$/.test(path)) {
          response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (path === '/' || path.endsWith('.html')) {
          response.headers.set('Cache-Control', 'no-cache, must-revalidate, public');
        }
        return response;
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
      // Everything is wrapped so the Sentry flush in the `finally` runs even
      // when a job throws — the nightly crons rethrow on failure, and without
      // this that exception could be lost with the cancelled waitUntil.
      try {
        return await runScheduledTask(event, env, ctx);
      } finally {
        try {
          await Sentry.flush(3000);
        } catch (flushErr) {
          console.error('[Cron] Sentry flush failed:', flushErr?.message);
        }
      }
    },
  }
);

/**
 * Cron body, extracted so the `scheduled` wrapper above can guarantee a flush.
 */
async function runScheduledTask(event, env, ctx) {
  // Tag every cron event with the trigger that produced it. `withSentry` wraps
  // the handler in withIsolationScope, so the SDK's own auto-capture inherits
  // this — which matters because the only other cron tagging (the
  // metadata-enrichment catch below) is unreachable when the probe query itself
  // throws. Without this, a D1 error from a cron arrives untagged and
  // indistinguishable from a request-path error.
  Sentry.setTag('cron', event.cron);
  console.log(`[Cron] Scheduled task triggered (${event.cron}) at ${new Date().toISOString()}`);

  // Only run if multi-tenant mode is enabled (D1 database required)
  if (!env.JWT_SECRET || !env.READING_MANAGER_DB) {
    console.log('[Cron] Skipping scheduled task - multi-tenant mode not enabled');
    return;
  }

  const db = env.READING_MANAGER_DB;

  // Streaks + GDPR at 2 AM UTC
  if (event.cron === '0 2 * * *') {
    // No Sentry cron monitor: the free plan allows exactly one and it's
    // spent on demo-environment-reset. Absence is detected by the watchdog
    // (src/utils/cronWatchdog.js) via the recordCronSuccess call below;
    // failures still surface because the throws below propagate.
    const jobStart = Date.now();
    try {
      const results = await recalculateAllStreaks(db);

      console.log(`[Cron] Streak recalculation complete:`, {
        organizations: results.organizations,
        studentsProcessed: results.total,
        studentsUpdated: results.updated,
        errors: results.errors.length,
      });

      if (results.errors.length > 0) {
        console.error('[Cron] Streak recalculation errors:', results.errors.slice(0, 10));
      }
    } catch (error) {
      console.error('[Cron] Streak recalculation failed:', error.message);
      throw error;
    }

    // GDPR data retention cleanup jobs
    try {
      const expiredRefresh = await db
        .prepare(
          `DELETE FROM refresh_tokens WHERE expires_at < datetime('now') OR revoked_at IS NOT NULL`
        )
        .run();
      console.log(
        `[Cron] Cleaned up ${expiredRefresh.meta?.changes || 0} expired/revoked refresh tokens`
      );

      const expiredReset = await db
        .prepare(
          `DELETE FROM password_reset_tokens WHERE expires_at < datetime('now') OR used_at IS NOT NULL`
        )
        .run();
      console.log(
        `[Cron] Cleaned up ${expiredReset.meta?.changes || 0} expired/used password reset tokens`
      );

      const oldLogins = await db
        .prepare(`DELETE FROM login_attempts WHERE created_at < datetime('now', '-30 days')`)
        .run();
      console.log(
        `[Cron] Cleaned up ${oldLogins.meta?.changes || 0} login attempts older than 30 days`
      );

      const oldTickerEvents = await db
        .prepare(`DELETE FROM ticker_events WHERE created_at < datetime('now', '-2 days')`)
        .run();
      console.log(
        `[Cron] Cleaned up ${oldTickerEvents.meta?.changes || 0} ticker events older than 2 days`
      );

      const anonAudit = await db
        .prepare(
          `UPDATE audit_log SET ip_address = 'anonymised', user_agent = 'anonymised' WHERE created_at < datetime('now', '-90 days') AND ip_address != 'anonymised' AND ip_address IS NOT NULL`
        )
        .run();
      console.log(
        `[Cron] Anonymised ${anonAudit.meta?.changes || 0} audit log entries older than 90 days`
      );

      const oldAudit = await db
        .prepare(`DELETE FROM audit_log WHERE created_at < datetime('now', '-730 days')`)
        .run();
      if (oldAudit.meta?.changes > 0) {
        console.log(`[Cron] Deleted ${oldAudit.meta.changes} audit log entries older than 2 years`);
      }

      const oldRateLimits = await db
        .prepare(`DELETE FROM rate_limits WHERE created_at < datetime('now', '-1 hour')`)
        .run();
      console.log(`[Cron] Cleaned up ${oldRateLimits.meta?.changes || 0} stale rate limit records`);

      const expiredStates = await db
        .prepare(`DELETE FROM oauth_state WHERE created_at < datetime('now', '-5 minutes')`)
        .run();
      if (expiredStates.meta?.changes > 0) {
        console.log(`[Cron] Cleaned up ${expiredStates.meta.changes} expired OAuth states`);
      }
    } catch (error) {
      console.error('[Cron] GDPR data retention cleanup failed:', error.message);
      throw error;
    }

    // Auto hard-delete soft-deleted records after 90-day retention period
    try {
      const staleStudents = await db
        .prepare(
          `SELECT id FROM students WHERE is_active = 0 AND updated_at < datetime('now', '-90 days')`
        )
        .bind()
        .all();

      const studentIds = (staleStudents.results || []).map((s) => s.id);
      if (studentIds.length > 0) {
        // Same statement set as the interactive Article 17 erase —
        // chunk sized so chunk × statements stays under D1's
        // 100-statement batch limit.
        const STUDENT_CHUNK = Math.floor(D1_BATCH_LIMIT / STUDENT_ERASE_STATEMENT_COUNT);
        for (let i = 0; i < studentIds.length; i += STUDENT_CHUNK) {
          const chunk = studentIds.slice(i, i + STUDENT_CHUNK);
          const statements = chunk.flatMap((id) => studentEraseStatements(db, id));
          await db.batch(statements);
        }
        console.log(
          `[Cron] Hard-deleted ${studentIds.length} soft-deleted students past 90-day retention`
        );
      }

      const staleUsers = await db
        .prepare(
          `SELECT id FROM users WHERE is_active = 0 AND updated_at < datetime('now', '-90 days')`
        )
        .bind()
        .all();

      const userIds = (staleUsers.results || []).map((u) => u.id);
      if (userIds.length > 0) {
        const USER_CHUNK = 33;
        for (let i = 0; i < userIds.length; i += USER_CHUNK) {
          const chunk = userIds.slice(i, i + USER_CHUNK);
          const statements = chunk.flatMap((id) => [
            db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').bind(id),
            db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(id),
            db.prepare('DELETE FROM users WHERE id = ?').bind(id),
          ]);
          await db.batch(statements);
        }
        console.log(
          `[Cron] Hard-deleted ${userIds.length} soft-deleted users past 90-day retention`
        );
      }

      // Cascade purge orgs past 90-day retention
      const staleOrgs = await db
        .prepare(
          `SELECT id FROM organizations WHERE is_active = 0 AND updated_at < datetime('now', '-90 days') AND legal_hold = 0 AND purged_at IS NULL`
        )
        .bind()
        .all();

      for (const org of staleOrgs.results || []) {
        try {
          const result = await hardDeleteOrganization(db, org.id, env);
          console.log(
            `[Cron] Purged org ${org.id}: ${result.tablesProcessed} tables, ${result.errors.length} errors`
          );
        } catch (error) {
          console.error(`[Cron] Failed to purge org ${org.id}:`, error.message);
        }
      }
    } catch (error) {
      console.error('[Cron] Retention auto-deletion failed:', error.message);
      throw error;
    }

    await recordCronSuccess(db, 'streaks-and-gdpr-cleanup', Date.now() - jobStart);
  }

  // Badge evaluation at 2:30 AM UTC (after streaks are recalculated)
  if (event.cron === '30 2 * * *') {
    // Absence detected by the watchdog, not a Sentry monitor — see the note
    // on the 02:00 job above.
    const jobStart = Date.now();
    try {
      const { processBadgesForOrg, refreshWindowStats } = await import('./utils/badgeEngine.js');

      // Get all active organizations + their resume cursor + watermark.
      // last_badge_cursor is non-null when a previous run exhausted the
      // CPU budget mid-org; we resume after that cursor.
      // last_badge_watermark is the start of the last COMPLETED run for
      // the org — only students with a session created after it get the
      // full stats recalc (PERF-M2).
      const orgs = await db
        .prepare(
          'SELECT id, last_badge_cursor, last_badge_watermark FROM organizations WHERE is_active = 1 ORDER BY id'
        )
        .bind()
        .all();

      let totalStudents = 0;
      let totalNewBadges = 0;
      let orgsProcessed = 0;
      let orgsSkipped = 0;
      // Scheduled Workers have a 30s CPU limit; bail before we breach it
      // so the cleanup logic still runs. The deadline is shared across
      // org iteration AND per-student inner-loop bailout — see
      // processBadgesForOrg() which checks Date.now() > deadlineMs
      // before each student.
      const BUDGET_MS = 22_000;
      const cronStart = Date.now();
      const deadlineMs = cronStart + BUDGET_MS;

      for (const org of orgs.results || []) {
        if (Date.now() > deadlineMs) {
          orgsSkipped = (orgs.results || []).length - orgsProcessed;
          console.warn(
            `[Cron] Badge budget exhausted after ${orgsProcessed} orgs; ${orgsSkipped} deferred to next run`
          );
          break;
        }

        const orgStart = Date.now();
        const cursor = org.last_badge_cursor || null;
        // Captured BEFORE processing in SQLite datetime format, so a
        // session created mid-run lands after the next watermark and is
        // re-picked next night rather than missed.
        const runStart = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const watermark = org.last_badge_watermark || null;
        const result = await processBadgesForOrg(db, org.id, cursor, deadlineMs, watermark);

        totalStudents += result.processedCount;
        totalNewBadges += result.newBadgeCount;

        if (result.exhausted) {
          // Persist cursor so next run resumes after this student — the
          // watermark deliberately does NOT advance until the org
          // completes a full pass.
          await db
            .prepare('UPDATE organizations SET last_badge_cursor = ? WHERE id = ?')
            .bind(result.lastProcessedId, org.id)
            .run();
          console.warn(
            `[Cron] Badge budget exhausted within org ${org.id} after ${result.processedCount} students; cursor saved at ${result.lastProcessedId}`
          );
          break;
        } else {
          orgsProcessed++;
          // Org completed — clear any prior cursor and advance the
          // watermark to this run's start.
          await db
            .prepare(
              'UPDATE organizations SET last_badge_cursor = NULL, last_badge_watermark = ? WHERE id = ?'
            )
            .bind(runStart, org.id)
            .run();

          // Rolling window stats decay with time even for students with
          // no new sessions — refresh them cheaply org-wide (they no
          // longer get the full recalc above).
          try {
            const refreshed = await refreshWindowStats(db, org.id);
            if (refreshed.statsUpdated > 0) {
              console.log(
                `[Cron] Window stats refreshed for org ${org.id}: ${refreshed.statsUpdated}/${refreshed.studentsChecked} students`
              );
            }
          } catch (err) {
            console.error(`[Cron] Window-stat refresh failed for org ${org.id}:`, err.message);
          }

          console.log(
            `[Cron] Badge org ${org.id}: ${result.processedCount} students in ${Date.now() - orgStart}ms${cursor ? ` (resumed from cursor)` : ''}`
          );
        }
      }

      console.log(
        `[Cron] Badge evaluation complete: ${orgsProcessed} orgs (${orgsSkipped} deferred), ${totalStudents} students, ${totalNewBadges} new badges, ${Date.now() - cronStart}ms`
      );

      // ── Class goals drift correction ──────────────────────────────────
      try {
        // resolveAcademicYear, NOT resolveCurrentTerm. This job silently did
        // nothing at all between 2026-04-12 and 2026-08-12: it resolved a
        // calendar term ("Q3 2026") while the only code that ever WRITES a
        // class_goals row — src/routes/classes.js and the two session-triggered
        // paths in classGoalsEngine.js — resolves an academic year ("2025/26").
        // The nightly WHERE term = ? therefore matched zero rows for every
        // class, and recalculateClassGoalProgress early-returned 868 times a
        // night. Production confirms it: class_goals holds only '2025/26' and
        // a few stale 'Q2 2026' rows. The `genres` and `badges` metrics have no
        // other reconciler, so they had drifted for four months.
        const { recalculateClassGoalProgress, resolveAcademicYear } =
          await import('./utils/classGoalsEngine.js');

        let totalClassesProcessed = 0;

        let goalsExhausted = false;
        for (const org of orgs.results || []) {
          if (Date.now() > deadlineMs) {
            goalsExhausted = true;
            break;
          }

          const termDatesResult = await db
            .prepare(
              'SELECT term_name, start_date, end_date, academic_year FROM term_dates WHERE organization_id = ? ORDER BY start_date'
            )
            .bind(org.id)
            .all();

          const today = new Date().toISOString().split('T')[0];
          const { term, startDate, endDate } = resolveAcademicYear(
            termDatesResult.results || [],
            today
          );

          // Drive off class_goals, not classes. Walking every active class meant
          // one query per class per night to discover it had no goals — with the
          // term bug fixed that would now be 868 real recalcs competing for the
          // same 22s budget as badge evaluation.
          const classes = await db
            .prepare(
              'SELECT DISTINCT class_id FROM class_goals WHERE organization_id = ? AND term = ?'
            )
            .bind(org.id, term)
            .all();

          for (const row of classes.results || []) {
            if (Date.now() > deadlineMs) {
              goalsExhausted = true;
              break;
            }
            try {
              await recalculateClassGoalProgress(
                db,
                row.class_id,
                org.id,
                startDate,
                endDate,
                term
              );
              totalClassesProcessed++;
            } catch (err) {
              console.error(
                `[Cron] Class goal recalc error for class ${row.class_id}:`,
                err.message
              );
            }
          }
          if (goalsExhausted) break;
        }

        console.log(
          `[Cron] Class goals recalculated: ${totalClassesProcessed} classes${goalsExhausted ? ' (budget exhausted)' : ''}`
        );
      } catch (error) {
        console.error('[Cron] Class goals recalculation failed:', error.message);
      }
    } catch (error) {
      console.error('[Cron] Badge evaluation failed:', error.message);
      // Rethrow so the failure reaches Sentry. The scheduled handler's
      // instrumentation captures anything that propagates; a catch that
      // only logs would leave a broken run looking like a clean one.
      throw error;
    }

    await recordCronSuccess(db, 'badge-evaluation', Date.now() - jobStart);
  }

  // Wonde sync at 3 AM UTC
  if (event.cron === '0 3 * * *') {
    // Absence detected by the watchdog, not a Sentry monitor — see the note
    // on the 02:00 job above.
    const jobStart = Date.now();
    const wondeOrgs = await db
      .prepare(
        'SELECT id, wonde_school_id, wonde_school_token, wonde_last_sync_at FROM organizations WHERE wonde_school_id IS NOT NULL AND wonde_school_token IS NOT NULL AND is_active = 1'
      )
      .bind()
      .all();

    const orgList = wondeOrgs.results || [];
    const SYNC_CONCURRENCY = 5;
    let failCount = 0;
    for (let i = 0; i < orgList.length; i += SYNC_CONCURRENCY) {
      const batch = orgList.slice(i, i + SYNC_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (org) => {
          const schoolToken = await decryptSensitiveData(
            org.wonde_school_token,
            getEncryptionSecret(env)
          );
          await runFullSync(org.id, schoolToken, org.wonde_school_id, db, {
            updatedAfter: org.wonde_last_sync_at,
            kv: env.READING_MANAGER_KV,
          });
          return org.id;
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          console.log(`[Cron] Wonde sync complete for org ${result.value}`);
        } else {
          failCount++;
          console.error(`[Cron] Wonde sync failed:`, result.reason?.message);
        }
      }
    }

    if (failCount > 0 && failCount === orgList.length) {
      throw new Error(`All ${failCount} Wonde syncs failed`);
    }

    await recordCronSuccess(db, 'wonde-school-sync', Date.now() - jobStart);
  }

  // ── Background metadata enrichment (every minute) ──
  if (event.cron === '*/1 * * * *') {
    let bgJob;
    try {
      bgJob = await db
        .prepare(
          "SELECT * FROM metadata_jobs WHERE background = 1 AND status IN ('pending', 'running') LIMIT 1"
        )
        .first();
    } catch (err) {
      // This probe reads a handful of rows in well under a millisecond, so a
      // failure here is never our query — it's D1 being unreachable. Because
      // the cron fires 1,440 times a day it is the first thing to notice a
      // platform wobble, and captureException made it the thing that paged for
      // one: TALLY-READING-5 logged 58 consecutive per-minute failures on
      // 2026-07-16, each carrying a distinct Cloudflare incident handle
      // (`D1_ERROR: internal error; reference = …`).
      //
      // console.warn, not captureException: consoleLoggingIntegration ships
      // this to Sentry *Logs*, so the evidence is searchable but doesn't open
      // an Issue and doesn't trip the "Worker errors" alert rule. Sustained
      // failure is not swallowed — the heartbeat below stops being recorded and
      // the watchdog reports the absence (src/utils/cronWatchdog.js). That is
      // the split this repo already uses: transient noise is a log, absence is
      // an alert.
      console.warn(`[Cron] Metadata enrichment probe failed (D1 unreachable): ${err?.message}`);
      return;
    }

    // Liveness heartbeat. Gated to 4x/hour rather than 60x — the watchdog only
    // needs to know the cron is alive, and this job's whole point is to be
    // cheap. `event.scheduledTime` is the slot Cloudflare intended, not
    // Date.now(): triggers on this account drift 8-9 minutes, which would make
    // a wall-clock check miss the :00/:15/:30/:45 slots entirely.
    if (new Date(event.scheduledTime).getUTCMinutes() % 15 === 0) {
      await recordCronSuccess(db, 'metadata-enrichment');
    }

    if (bgJob) {
      console.log(
        `[Cron] Background enrichment: job ${bgJob.id}, ${bgJob.processed_books}/${bgJob.total_books} processed`
      );

      const config = await getConfigWithKeys(db, env.JWT_SECRET);
      if (config) {
        config.fetchCovers = bgJob.include_covers && config.fetchCovers;

        // Loop processing batches until the 20s wall-clock cutoff kicks in
        const startTime = Date.now();
        let lastResult;
        try {
          while (Date.now() - startTime < 25000) {
            // Re-read job state to get updated cursor
            const currentJob = await db
              .prepare('SELECT * FROM metadata_jobs WHERE id = ?')
              .bind(bgJob.id)
              .first();

            if (
              !currentJob ||
              currentJob.status === 'completed' ||
              currentJob.status === 'paused' ||
              currentJob.status === 'failed'
            ) {
              break;
            }

            lastResult = await processJobBatch(db, currentJob, config, {
              r2Bucket: env.BOOK_COVERS,
              waitUntil: ctx.waitUntil.bind(ctx),
            });

            if (lastResult.done) break;
          }
        } catch (err) {
          console.error('[Cron] Background enrichment error:', err);
          // No cron monitor on this one: it fires every minute and its
          // normal state is "no job to do", so check-ins would be noise.
          // Capturing the exception is what actually surfaces a broken
          // enrichment run — previously it died silently in the logs.
          Sentry.captureException(err, {
            tags: { cron: 'metadata-enrichment' },
            extra: { jobId: bgJob.id },
          });
          try {
            await db
              .prepare(
                "UPDATE metadata_jobs SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?"
              )
              .bind(String(err?.message || 'Unknown error').slice(0, 500), bgJob.id)
              .run();
          } catch (markErr) {
            // Best effort, but not silent — if we can't even record the
            // failure the job row is left stuck 'running' forever.
            console.error('[Cron] Failed to mark enrichment job failed:', markErr?.message);
          }
        }

        if (lastResult) {
          console.log(
            `[Cron] Background enrichment: ${lastResult.processedBooks}/${bgJob.total_books} processed, ${lastResult.enrichedBooks} enriched, done=${lastResult.done}`
          );
        }
      }
    }
  }

  // Demo environment reset — hourly at 7 past.
  //
  // 7 past, not on the hour: at '0 * * * *' this collided head-on with the
  // 02:00 and 03:00 nightly jobs, so the heaviest write job in the system ran
  // concurrently with the two next-heaviest, twice a night, on one D1 primary.
  //
  // THIS STRING APPEARS IN THREE PLACES AND THEY MUST MATCH: wrangler.toml
  // [triggers], the `event.cron` test below, and `schedule.value` in the
  // withMonitor options. Sentry silently rejects a check-in whose schedule
  // disagrees with the monitor's, and withMonitor reports no error when it
  // does — the monitor just stops working, exactly as documented in
  // docs/sentry.md.
  if (event.cron === '7 * * * *') {
    // Watchdog first, so a slow or failing demo reset can't stop the
    // nightly jobs' absence detection from being reported.
    await checkCronFreshness(db);

    await Sentry.withMonitor(
      'demo-environment-reset',
      async () => {
        try {
          // KV enables hourly change detection — see resetDemoData. Without it
          // the reset is unconditional, which is what it used to be.
          await resetDemoData(env.READING_MANAGER_DB, env.READING_MANAGER_KV);
          console.log('[Cron] Demo environment reset complete');
        } catch (error) {
          console.error('[Cron] Demo reset failed:', error.message);
          // Rethrow so the monitor can go red — a stale demo environment
          // is the first thing a prospective school sees.
          throw error;
        }
      },
      {
        schedule: { type: 'crontab', value: '7 * * * *' },
        timezone: 'Etc/UTC',
        checkinMargin: 15,
        maxRuntime: 15,
      }
    );
  }

  console.log(`[Cron] Scheduled task (${event.cron}) finished at ${new Date().toISOString()}`);
}
