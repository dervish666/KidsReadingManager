import { Hono } from 'hono';

// Import services (legacy KV mode)
import {
  getSettings as getSettingsKV,
  updateSettings as updateSettingsKV
} from '../services/kvService';

// Import utilities
import { validateSettings } from '../utils/validation';
import { badRequestError } from '../middleware/errorHandler';
import { permissions, encryptSensitiveData, decryptSensitiveData } from '../utils/crypto';

// Create router
const settingsRouter = new Hono();

/**
 * Helper to get D1 database
 */
const getDB = (env) => {
  if (!env || !env.READING_MANAGER_DB) {
    return null;
  }
  return env.READING_MANAGER_DB;
};

/**
 * Check if multi-tenant mode is enabled
 */
const isMultiTenantMode = (c) => {
  return Boolean(c.env.JWT_SECRET && c.get('organizationId'));
};

/**
 * Default settings
 */
const defaultSettings = {
  readingStatusSettings: {
    recentlyReadDays: 3,
    needsAttentionDays: 7
  },
  timezone: 'UTC',
  academicYear: new Date().getFullYear().toString()
};

/**
 * GET /api/settings
 * Get application settings
 */
settingsRouter.get('/', async (c) => {
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    
    const result = await db.prepare(`
      SELECT setting_key, setting_value FROM org_settings WHERE organization_id = ?
    `).bind(organizationId).all();
    
    // Convert to object
    const settings = { ...defaultSettings };
    for (const row of result.results || []) {
      try {
        settings[row.setting_key] = JSON.parse(row.setting_value);
      } catch {
        settings[row.setting_key] = row.setting_value;
      }
    }
    
    return c.json(settings);
  }
  
  // Legacy mode: use KV
  const settings = await getSettingsKV(c.env);
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
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');
    
    // Check permission
    const userRole = c.get('userRole');
    if (!permissions.canManageSettings(userRole)) {
      return c.json({ error: 'Permission denied' }, 403);
    }
    
    // Validate settings keys
    const allowedKeys = [
      'readingStatusSettings',
      'timezone',
      'academicYear',
      'defaultReadingLevel',
      'schoolName',
      'bookMetadata'
    ];
    
    const updates = [];
    for (const [key, value] of Object.entries(body)) {
      if (!allowedKeys.includes(key)) {
        continue;
      }
      
      const settingValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      updates.push({ key, value: settingValue });
    }
    
    if (updates.length === 0) {
      return c.json({ error: 'No valid settings to update' }, 400);
    }
    
    // Upsert settings
    const statements = updates.map(({ key, value }) => {
      return db.prepare(`
        INSERT INTO org_settings (id, organization_id, setting_key, setting_value, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, setting_key) 
        DO UPDATE SET setting_value = ?, updated_by = ?, updated_at = datetime("now")
      `).bind(
        crypto.randomUUID(),
        organizationId,
        key,
        value,
        userId,
        value,
        userId
      );
    });
    
    await db.batch(statements);
    
    // Fetch updated settings
    const result = await db.prepare(`
      SELECT setting_key, setting_value FROM org_settings WHERE organization_id = ?
    `).bind(organizationId).all();
    
    const settings = { ...defaultSettings };
    for (const row of result.results || []) {
      try {
        settings[row.setting_key] = JSON.parse(row.setting_value);
      } catch {
        settings[row.setting_key] = row.setting_value;
      }
    }
    
    return c.json(settings);
  }
  
  // Legacy mode: use KV
  const updatedSettings = await updateSettingsKV(c.env, body);
  return c.json(updatedSettings);
});

/**
 * GET /api/settings/ai
 * Get AI configuration (without exposing API key)
 */
settingsRouter.get('/ai', async (c) => {
  // Check environment-level API keys (available as fallback)
  const envKeys = {
    anthropic: Boolean(c.env.ANTHROPIC_API_KEY),
    openai: Boolean(c.env.OPENAI_API_KEY),
    google: Boolean(c.env.GOOGLE_API_KEY)
  };

  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');

    const config = await db.prepare(`
      SELECT provider, model_preference, is_enabled, api_key_encrypted FROM org_ai_config WHERE organization_id = ?
    `).bind(organizationId).first();

    const activeProvider = config?.provider || 'anthropic';
    const hasOrgKey = Boolean(config?.api_key_encrypted);

    return c.json({
      provider: activeProvider,
      modelPreference: config?.model_preference || null,
      isEnabled: Boolean(config?.is_enabled),
      hasApiKey: hasOrgKey,
      // Show which providers have keys configured (org-level or env-level)
      availableProviders: {
        anthropic: hasOrgKey && activeProvider === 'anthropic' ? true : envKeys.anthropic,
        openai: hasOrgKey && activeProvider === 'openai' ? true : envKeys.openai,
        google: hasOrgKey && activeProvider === 'google' ? true : envKeys.google
      },
      // Indicate the source of the active key
      keySource: hasOrgKey ? 'organization' : (envKeys[activeProvider] ? 'environment' : 'none')
    });
  }

  // Legacy mode: check environment variables
  const hasAnyKey = envKeys.anthropic || envKeys.openai || envKeys.google;
  const activeProvider = envKeys.anthropic ? 'anthropic' : (envKeys.openai ? 'openai' : (envKeys.google ? 'google' : 'anthropic'));

  return c.json({
    provider: activeProvider,
    modelPreference: null,
    isEnabled: hasAnyKey,
    hasApiKey: envKeys[activeProvider],
    availableProviders: envKeys,
    keySource: hasAnyKey ? 'environment' : 'none'
  });
});

/**
 * POST /api/settings/ai
 * Update AI configuration
 */
settingsRouter.post('/ai', async (c) => {
  const body = await c.req.json();
  
  // Multi-tenant mode: use D1
  if (isMultiTenantMode(c)) {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userId = c.get('userId');
    
    // Check permission
    const userRole = c.get('userRole');
    if (!permissions.canManageSettings(userRole)) {
      return c.json({ error: 'Permission denied' }, 403);
    }
    
    const { provider, apiKey, modelPreference, isEnabled } = body;
    
    // Validate provider
    const validProviders = ['anthropic', 'openai', 'google'];
    if (provider && !validProviders.includes(provider)) {
      throw badRequestError('Invalid AI provider');
    }
    
    // Check if config exists
    const existing = await db.prepare(`
      SELECT id FROM org_ai_config WHERE organization_id = ?
    `).bind(organizationId).first();
    
    if (existing) {
      // Update existing config
      const updates = [];
      const params = [];

      if (provider !== undefined) {
        updates.push('provider = ?');
        params.push(provider);
      }

      if (apiKey !== undefined) {
        // Encrypt the API key before storing
        const jwtSecret = c.env.JWT_SECRET;
        if (!jwtSecret) {
          return c.json({ error: 'Server configuration error - encryption not available' }, 500);
        }
        const encryptedApiKey = await encryptSensitiveData(apiKey, jwtSecret);
        updates.push('api_key_encrypted = ?');
        params.push(encryptedApiKey);
      }
      
      if (modelPreference !== undefined) {
        updates.push('model_preference = ?');
        params.push(modelPreference);
      }
      
      if (isEnabled !== undefined) {
        updates.push('is_enabled = ?');
        params.push(isEnabled ? 1 : 0);
      }
      
      if (updates.length > 0) {
        updates.push('updated_by = ?');
        params.push(userId);
        updates.push('updated_at = datetime("now")');
        params.push(organizationId);
        
        await db.prepare(`
          UPDATE org_ai_config SET ${updates.join(', ')} WHERE organization_id = ?
        `).bind(...params).run();
      }
    } else {
      // Create new config
      let encryptedApiKey = null;
      if (apiKey) {
        const jwtSecret = c.env.JWT_SECRET;
        if (!jwtSecret) {
          return c.json({ error: 'Server configuration error - encryption not available' }, 500);
        }
        encryptedApiKey = await encryptSensitiveData(apiKey, jwtSecret);
      }

      await db.prepare(`
        INSERT INTO org_ai_config (id, organization_id, provider, api_key_encrypted, model_preference, is_enabled, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        organizationId,
        provider || 'anthropic',
        encryptedApiKey,
        modelPreference || null,
        isEnabled ? 1 : 0,
        userId
      ).run();
    }
    
    // Fetch updated config
    const config = await db.prepare(`
      SELECT provider, model_preference, is_enabled, api_key_encrypted FROM org_ai_config WHERE organization_id = ?
    `).bind(organizationId).first();

    // Check environment-level API keys (available as fallback)
    const envKeys = {
      anthropic: Boolean(c.env.ANTHROPIC_API_KEY),
      openai: Boolean(c.env.OPENAI_API_KEY),
      google: Boolean(c.env.GOOGLE_API_KEY)
    };

    const activeProvider = config?.provider || 'anthropic';
    const hasOrgKey = Boolean(config?.api_key_encrypted);

    return c.json({
      provider: activeProvider,
      modelPreference: config?.model_preference || null,
      isEnabled: Boolean(config?.is_enabled),
      hasApiKey: hasOrgKey,
      availableProviders: {
        anthropic: hasOrgKey && activeProvider === 'anthropic' ? true : envKeys.anthropic,
        openai: hasOrgKey && activeProvider === 'openai' ? true : envKeys.openai,
        google: hasOrgKey && activeProvider === 'google' ? true : envKeys.google
      },
      keySource: hasOrgKey ? 'organization' : (envKeys[activeProvider] ? 'environment' : 'none')
    });
  }

  // Legacy mode: AI config is managed via environment variables
  return c.json({
    error: 'AI configuration is managed via environment variables in legacy mode',
    message: 'Set ANTHROPIC_API_KEY in your environment'
  }, 400);
});

export { settingsRouter };
