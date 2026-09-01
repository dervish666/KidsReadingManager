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
/**
 * Teacher-facing prefixes under `/api/parent/`.
 *
 * Everything under `/api/parent/` is public by default — the token in the URL
 * *is* the auth for the parent portal — so each teacher-facing prefix has to be
 * named here to get JWT auth and an `organizationId` instead.
 *
 * This lived in two places: `src/worker.js` and the auth middleware in
 * `src/middleware/tenant.js`. Adding `/api/parent/school/` to only the first
 * (v3.126.0) meant the auth middleware waved the request through with no user,
 * `requireTeacher()` answered 401, and the client took that for an expired
 * session and logged the teacher out mid-print. One list, imported twice.
 */
export const TEACHER_PARENT_PREFIXES = [
  '/api/parent/generate/',
  '/api/parent/token/',
  '/api/parent/class/',
  '/api/parent/school/',
  '/api/parent/tokens/',
];

/**
 * True for the token-authenticated parent-portal routes that bypass JWT auth.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isPublicParentRoute(pathname) {
  return (
    pathname.startsWith('/api/parent/') &&
    !TEACHER_PARENT_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export const PUBLIC_PATHS = [
  '/api/auth/mode',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/health',
  '/api/signup',
  '/api/auth/mylogin/login',
  '/api/auth/mylogin/callback',
  '/api/webhooks/wonde',
  '/api/webhooks/stripe',
  '/api/auth/demo',
  '/api/contact',
];
