import { Hono } from 'hono';

// Import services
import {
  getSettings,
  updateSettings
} from '../services/kvService';

// Import utilities
import { validateSettings } from '../utils/validation';
import { badRequestError } from '../middleware/errorHandler';

// Create router
const settingsRouter = new Hono();

/**
 * GET /api/settings
 * Get application settings
 */
settingsRouter.get('/', async (c) => {
  const settings = await getSettings(c.env);
  return c.json(settings);
});

/**
 * POST /api/settings
 * Update application settings
 */
settingsRouter.post('/', async (c) => {
  const body = await c.req.json();
  
  // Validate settings
  const validation = validateSettings(body);
  if (!validation.isValid) {
    throw badRequestError(validation.errors.join(', '));
  }
  
  // Update settings
  const updatedSettings = await updateSettings(c.env, body);
  
  return c.json(updatedSettings);
});

export { settingsRouter };