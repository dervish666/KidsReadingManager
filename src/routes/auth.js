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
import { authRateLimit } from '../middleware/tenant.js';
import { registerRouter } from './auth/register.js';
import { sessionRouter } from './auth/session.js';
import { passwordRouter } from './auth/password.js';

export { parseCookies } from './auth/_shared.js';

export const authRouter = new Hono();

// Apply stricter rate limiting to all auth endpoints
// This provides an additional layer of protection beyond account lockout
authRouter.use('*', authRateLimit());

authRouter.route('/', registerRouter);
authRouter.route('/', sessionRouter);
authRouter.route('/', passwordRouter);
