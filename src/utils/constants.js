/**
 * Shared constants used across the application.
 * Single source of truth for values referenced in multiple locations.
 */

/**
 * API paths that bypass JWT authentication and tenant middleware.
 * Each path must be explicitly listed — no wildcard prefixes.
 * Note: /api/covers/* uses a startsWith check separately.
 */
export const PUBLIC_PATHS = [
  '/api/auth/mode',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/health',
  '/api/login',    // Legacy endpoint for backward compatibility
  '/api/logout',
  '/api/signup',
  '/api/auth/mylogin/login',
  '/api/auth/mylogin/callback',
  '/api/webhooks/wonde',
  '/api/webhooks/stripe',
  '/api/auth/demo',
];
