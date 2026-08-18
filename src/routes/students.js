/**
 * Students entry router.
 *
 * The student surface area is split across files in `src/routes/students/` —
 * core CRUD (`core.js`), reading sessions (`sessions.js`), stats (`stats.js`),
 * the AI summary (`aiSummary.js`), streaks (`streak.js`), bulk import
 * (`bulk.js`) and GDPR (`gdpr.js`). This file only composes them.
 *
 * Order of mounting matters: the sub-routers carry literal paths
 * (`/sessions`, `/stats`, `/recalculate-streaks`, `/bulk`, `/:id/erase`,
 * `/:id/export`) that must match before core's bare `/:id` handlers. Hono's
 * trie prefers static routes over params, but mounting them first keeps the
 * precedence explicit and trivially auditable.
 *
 * The cron-time `recalculateAllStreaks` lives in `students/streak.js` and is
 * re-exported here because src/worker.js imports it from this path.
 */

import { Hono } from 'hono';

import { sessionsRouter } from './students/sessions.js';
import { statsRouter } from './students/stats.js';
import { aiSummaryRouter } from './students/aiSummary.js';
import { streakRouter, recalculateAllStreaks } from './students/streak.js';
import { bulkRouter } from './students/bulk.js';
import { gdprRouter } from './students/gdpr.js';
import { coreRouter } from './students/core.js';

const studentsRouter = new Hono();

studentsRouter.route('/', sessionsRouter);
studentsRouter.route('/', statsRouter);
studentsRouter.route('/', aiSummaryRouter);
studentsRouter.route('/', streakRouter);
studentsRouter.route('/', bulkRouter);
studentsRouter.route('/', gdprRouter);
studentsRouter.route('/', coreRouter);

export { studentsRouter, recalculateAllStreaks };
