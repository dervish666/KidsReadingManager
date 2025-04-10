import { Hono } from 'hono';

// Import services
import {
  getData,
  replaceData
} from '../services/kvService';

// Import utilities
import { validateDataImport } from '../utils/validation';
import { badRequestError, serverError } from '../middleware/errorHandler';

// Create router
const dataRouter = new Hono();

/**
 * GET /api/data
 * Get all application data (for export)
 */
dataRouter.get('/', async (c) => {
  try {
    const data = await getData(c.env);
    
    // Add export metadata
    const exportData = {
      ...data,
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    };
    
    return c.json(exportData);
  } catch (error) {
    console.error('Error exporting data:', error);
    throw serverError('Failed to export data');
  }
});

/**
 * POST /api/data
 * Replace all application data (for import)
 */
dataRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    
    // Validate import data
    const validation = validateDataImport(body);
    if (!validation.isValid) {
      throw badRequestError(validation.errors.join(', '));
    }
    
    // Prepare data for import
    const importData = {
      students: body.students || [],
      settings: body.settings || {
        readingStatusSettings: {
          recentlyReadDays: 7,
          needsAttentionDays: 14
        }
      },
      metadata: {
        lastUpdated: new Date().toISOString(),
        importDate: new Date().toISOString(),
        version: '1.0.0'
      }
    };
    
    // Replace data
    await replaceData(c.env, importData);
    
    return c.json({
      message: 'Data imported successfully',
      count: importData.students.length
    });
  } catch (error) {
    console.error('Error importing data:', error);
    if (error.status) {
      throw error; // Re-throw validation errors
    }
    throw serverError('Failed to import data');
  }
});

export { dataRouter };