/**
 * Authentication Routes
 * Handles user registration, login, token refresh, and password reset
 *
 * The auth surface area is split across files in `src/routes/auth/` for
 * readability — registration/mode/demo (`register.js`), the JWT session
 * lifecycle (`session.js`) and password management (`password.js`) each get
 * their own module, with shared helpers in `_shared.js`. This file is the
 * composition root: it applies the auth-wide rate limit and mounts the
 * sub-routers. All paths are static and distinct, so mount order carries no
 * routing significance.
 *
 * `parseCookies` lives in `auth/_shared.js` and is re-exported here so
 * existing importers (mylogin.js) keep working.
 */

import { Hono } from 'hono';
import { authRateLimit, rateLimit, SCHOOL_BURST_LIMIT } from '../middleware/tenant.js';
import { registerRouter } from './auth/register.js';
import { sessionRouter } from './auth/session.js';
import { passwordRouter } from './auth/password.js';

export { parseCookies } from './auth/_shared.js';

export const authRouter = new Hono();

// Rate limits are applied per endpoint. This was once a blanket
// `authRouter.use('*', authRateLimit())`, which capped every auth path at 10
// requests/minute keyed on IP — and an entire school shares one NAT'd IP.
//
// Counters are per path (rateLimit buckets on `c.req.path`), so the budgets
// below are independent of each other. The blanket version still broke three
// things, all silently, all on exactly the "everyone sign in now" INSET morning
// this product is sold for:
//
//   - the 11th page load in a minute 429'd GET /mode, and the SPA reads a
//     non-ok /mode as "SSO is off" and hides the MyLogin button, leaving
//     email/password that SSO users do not have;
//   - the 11th token refresh in a minute threw a teacher back to the login
//     screen mid-lesson as "session expired";
//   - `use('*')` on a router mounted at /api/auth also matches
//     /api/auth/mylogin/* (verified against Hono's matcher), so the 11th SSO
//     login itself 429'd. mylogin.js now sets its own budgets.
//
// Credential-guessing endpoints keep the strict budget. Do not loosen these:
// this limiter is the brute-force defence on /login, and FAIL_CLOSED_PATHS in
// tenant.js deliberately 503s them if the rate_limits table is unreachable.
const CREDENTIAL_PATHS = [
  '/login',
  '/register',
  '/demo',
  '/forgot-password',
  '/reset-password',
  '/password',
];
for (const path of CREDENTIAL_PATHS) {
  authRouter.use(path, authRateLimit());
}

// Session traffic, which a staffroom generates in bursts from one IP. Still
// capped against abuse, but far above what a school produces in a minute.
// None of these accept a guessable credential.
const SESSION_PATHS = ['/mode', '/refresh', '/logout', '/me'];
for (const path of SESSION_PATHS) {
  authRouter.use(path, rateLimit(SCHOOL_BURST_LIMIT, 60000));
}

authRouter.route('/', registerRouter);
authRouter.route('/', sessionRouter);
authRouter.route('/', passwordRouter);
