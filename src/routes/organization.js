/**
 * Organization entry router.
 *
 * The organization surface area is split across files in
 * `src/routes/organization/` — core CRUD plus stats (`core.js`) and
 * compliance: audit log, DPA consent, purge (`compliance.js`). This file
 * only composes them.
 *
 * Order of mounting matters: compliance carries literal paths
 * (`/audit-log`, `/dpa-consent`) that must match before core's `/:id`
 * handlers. Hono's trie prefers static routes over params, but mounting
 * them first keeps the precedence explicit and trivially auditable.
 */

import { Hono } from 'hono';

import { complianceRouter } from './organization/compliance.js';
import { coreRouter } from './organization/core.js';

export const organizationRouter = new Hono();

organizationRouter.route('/', complianceRouter);
organizationRouter.route('/', coreRouter);
