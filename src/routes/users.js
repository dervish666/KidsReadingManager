/**
 * Users entry router.
 *
 * The user surface area is split across files in `src/routes/users/` —
 * core CRUD + password reset (`core.js`), GDPR endpoints (`gdpr.js`) and
 * class assignment (`classes.js`). This file only composes them.
 *
 * Order of mounting matters: the sub-routers carry the `/:id/erase`,
 * `/:id/export`, and `/:id/classes` paths that need to be matched
 * before core's bare `/:id` handlers. Hono's trie prefers static
 * routes over params, but mounting them first keeps the precedence
 * explicit and trivially auditable.
 */

import { Hono } from 'hono';

import { gdprRouter } from './users/gdpr.js';
import { classesRouter } from './users/classes.js';
import { coreRouter } from './users/core.js';

export const usersRouter = new Hono();

usersRouter.route('/', gdprRouter);
usersRouter.route('/', classesRouter);
usersRouter.route('/', coreRouter);
