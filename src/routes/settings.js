/**
 * Settings entry router.
 *
 * The settings surface area is split across files in `src/routes/settings/`
 * for readability — org settings CRUD (`org.js`), organization AI config
 * (`ai.js`) and the owner-only platform AI keys (`platform-ai.js`) each get
 * their own module. The provider model-listing helper shared by the two AI
 * modules lives in `settings/_shared.js`.
 *
 * All sub-router paths are static (`/`, `/ai`, `/platform-ai`), so mounting
 * order carries no routing-precedence concerns; sub-routers are mounted in
 * the order their handlers appeared before the split.
 *
 * `upsertAiConfig` lives in `settings/ai.js` and is re-exported here so
 * organization/settings.js's existing dynamic import keeps working.
 */

import { Hono } from 'hono';

import { orgSettingsRouter } from './settings/org.js';
import { aiSettingsRouter, upsertAiConfig } from './settings/ai.js';
import { platformAiRouter } from './settings/platform-ai.js';

// Create router
const settingsRouter = new Hono();

settingsRouter.route('/', orgSettingsRouter);
settingsRouter.route('/', aiSettingsRouter);
settingsRouter.route('/', platformAiRouter);

export { settingsRouter, upsertAiConfig };
