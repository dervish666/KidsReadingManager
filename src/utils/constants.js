/**
 * Shared constants used across the application.
 * Single source of truth for values referenced in multiple locations.
 */

/**
 * UK academic year starts 1 September (1-indexed month). Shared by the
 * reading-band yearly reset (readingBandEngine), parent-token academic year
 * (routes/parent), and the class-goals year fallback (classGoalsEngine) —
 * these MUST stay in sync or bands, tokens, and goals roll over on
 * different days.
 */
export const ACADEMIC_YEAR_START_MONTH = 9;

/**
 * Year groups an admin can assign to a class (Settings → Manage Classes).
 * Used both as the dropdown options (ClassManager) and the server-side
 * allowlist (routes/classes year-group endpoint). Labels are chosen so the
 * shared year-group parsers (utils/yearGroup) resolve them directly:
 * "Nursery" → ages 3-4 / KS1, "Reception" → 4-5 / KS1, "Year N" → its band.
 */
export const CLASS_YEAR_GROUP_OPTIONS = [
  'Nursery',
  'Reception',
  'Year 1',
  'Year 2',
  'Year 3',
  'Year 4',
  'Year 5',
  'Year 6',
];

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
  '/api/login', // Legacy endpoint for backward compatibility
  '/api/logout',
  '/api/signup',
  '/api/auth/mylogin/login',
  '/api/auth/mylogin/callback',
  '/api/webhooks/wonde',
  '/api/webhooks/stripe',
  '/api/auth/demo',
  '/api/contact',
];
