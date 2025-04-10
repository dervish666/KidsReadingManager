# Cloudflare Worker Implementation Plan

This document provides a detailed implementation plan for the Cloudflare Worker that will serve as the backend API for the Kids Reading Manager application.

## Core Worker Implementation

### Entry Point (`src/index.js`)

```javascript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { studentRoutes } from './routes/students';
import { settingsRoutes } from './routes/settings';
import { dataRoutes } from './routes/data';
import { errorHandler } from './middleware/errorHandler';

// Create the main Hono app
const app = new Hono();

// Apply middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use('*', cors({
  origin: ['https://kids-reading-manager.pages.dev', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
}));

// Apply routes
app.route('/api/students', studentRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/data', dataRoutes);

// Add error handler
app.onError(errorHandler);

// Add a health check endpoint
app.get('/health', (c) => c.json({ status: 'ok' }));

// Export the Hono app as the default export
export default app;
```

### KV Service (`src/services/kvService.js`)

```javascript
/**
 * Service for interacting with Cloudflare KV storage
 */
export class KVService {
  constructor(env) {
    this.kv = env.READING_MANAGER_KV;
    this.dataKey = 'app_data';
  }

  /**
   * Get the entire application data
   */
  async getData() {
    const data = await this.kv.get(this.dataKey, 'json');
    if (!data) {
      // Initialize with default data if not exists
      const defaultData = {
        students: [],
        settings: {
          readingStatusSettings: {
            recentlyReadDays: 14,
            needsAttentionDays: 21
          }
        },
        metadata: {
          lastUpdated: new Date().toISOString(),
          version: '1.0'
        }
      };
      await this.setData(defaultData);
      return defaultData;
    }
    return data;
  }

  /**
   * Set the entire application data
   */
  async setData(data) {
    // Update metadata
    data.metadata = {
      ...data.metadata,
      lastUpdated: new Date().toISOString()
    };
    
    await this.kv.put(this.dataKey, JSON.stringify(data));
    return data;
  }

  /**
   * Get all students
   */
  async getStudents() {
    const data = await this.getData();
    return data.students || [];
  }

  /**
   * Get a student by ID
   */
  async getStudent(id) {
    const data = await this.getData();
    return data.students.find(student => student.id === id);
  }

  /**
   * Add a new student
   */
  async addStudent(student) {
    const data = await this.getData();
    data.students.push(student);
    await this.setData(data);
    return student;
  }

  /**
   * Update a student
   */
  async updateStudent(id, updatedStudent) {
    const data = await this.getData();
    const index = data.students.findIndex(student => student.id === id);
    
    if (index === -1) {
      throw new Error('Student not found');
    }
    
    data.students[index] = updatedStudent;
    await this.setData(data);
    return updatedStudent;
  }

  /**
   * Delete a student
   */
  async deleteStudent(id) {
    const data = await this.getData();
    const initialLength = data.students.length;
    data.students = data.students.filter(student => student.id !== id);
    
    if (data.students.length === initialLength) {
      throw new Error('Student not found');
    }
    
    await this.setData(data);
    return { success: true };
  }

  /**
   * Add multiple students
   */
  async addStudents(students) {
    const data = await this.getData();
    data.students = [...data.students, ...students];
    await this.setData(data);
    return students;
  }

  /**
   * Get settings
   */
  async getSettings() {
    const data = await this.getData();
    return data.settings || {
      readingStatusSettings: {
        recentlyReadDays: 14,
        needsAttentionDays: 21
      }
    };
  }

  /**
   * Update settings
   */
  async updateSettings(settings) {
    const data = await this.getData();
    data.settings = { ...data.settings, ...settings };
    await this.setData(data);
    return data.settings;
  }
}
```

### Student Routes (`src/routes/students.js`)

```javascript
import { Hono } from 'hono';
import { KVService } from '../services/kvService';
import { validateStudent } from '../utils/validation';

const studentRoutes = new Hono();

// Get all students
studentRoutes.get('/', async (c) => {
  const kvService = new KVService(c.env);
  const students = await kvService.getStudents();
  return c.json(students);
});

// Get a student by ID
studentRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const kvService = new KVService(c.env);
  const student = await kvService.getStudent(id);
  
  if (!student) {
    return c.json({ error: 'Student not found' }, 404);
  }
  
  return c.json(student);
});

// Create a new student
studentRoutes.post('/', async (c) => {
  const body = await c.req.json();
  
  // Validate student data
  const validationError = validateStudent(body);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }
  
  const kvService = new KVService(c.env);
  const newStudent = await kvService.addStudent(body);
  return c.json(newStudent, 201);
});

// Update a student
studentRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  // Validate student data
  const validationError = validateStudent(body);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }
  
  const kvService = new KVService(c.env);
  
  try {
    const updatedStudent = await kvService.updateStudent(id, body);
    return c.json(updatedStudent);
  } catch (error) {
    return c.json({ error: error.message }, 404);
  }
});

// Delete a student
studentRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const kvService = new KVService(c.env);
  
  try {
    await kvService.deleteStudent(id);
    return c.json({ message: 'Student deleted successfully' });
  } catch (error) {
    return c.json({ error: error.message }, 404);
  }
});

// Bulk import students
studentRoutes.post('/bulk', async (c) => {
  const body = await c.req.json();
  
  if (!Array.isArray(body)) {
    return c.json({ error: 'Request body must be an array of students' }, 400);
  }
  
  // Validate each student
  for (const student of body) {
    const validationError = validateStudent(student);
    if (validationError) {
      return c.json({ error: `Invalid student data: ${validationError}` }, 400);
    }
  }
  
  const kvService = new KVService(c.env);
  const newStudents = await kvService.addStudents(body);
  return c.json(newStudents, 201);
});

export { studentRoutes };
```

### Settings Routes (`src/routes/settings.js`)

```javascript
import { Hono } from 'hono';
import { KVService } from '../services/kvService';
import { validateSettings } from '../utils/validation';

const settingsRoutes = new Hono();

// Get settings
settingsRoutes.get('/', async (c) => {
  const kvService = new KVService(c.env);
  const settings = await kvService.getSettings();
  return c.json(settings);
});

// Update settings
settingsRoutes.post('/', async (c) => {
  const body = await c.req.json();
  
  // Validate settings
  const validationError = validateSettings(body);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }
  
  const kvService = new KVService(c.env);
  const updatedSettings = await kvService.updateSettings(body);
  return c.json(updatedSettings);
});

export { settingsRoutes };
```

### Data Routes (`src/routes/data.js`)

```javascript
import { Hono } from 'hono';
import { KVService } from '../services/kvService';
import { validateData } from '../utils/validation';

const dataRoutes = new Hono();

// Get all data
dataRoutes.get('/', async (c) => {
  const kvService = new KVService(c.env);
  const data = await kvService.getData();
  
  // Add export metadata
  data.exportDate = new Date().toISOString();
  data.version = '1.1';
  
  return c.json(data);
});

// Import data
dataRoutes.post('/', async (c) => {
  const body = await c.req.json();
  
  // Validate data
  const validationError = validateData(body);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }
  
  const kvService = new KVService(c.env);
  await kvService.setData(body);
  
  return c.json({
    message: 'Data imported successfully',
    count: body.students?.length || 0
  });
});

export { dataRoutes };
```

### Validation Utilities (`src/utils/validation.js`)

```javascript
/**
 * Validate student data
 */
export function validateStudent(student) {
  if (!student) {
    return 'Student data is required';
  }
  
  if (!student.id) {
    return 'Student ID is required';
  }
  
  if (!student.name) {
    return 'Student name is required';
  }
  
  if (student.readingSessions && !Array.isArray(student.readingSessions)) {
    return 'Reading sessions must be an array';
  }
  
  return null; // No validation error
}

/**
 * Validate settings data
 */
export function validateSettings(settings) {
  if (!settings) {
    return 'Settings data is required';
  }
  
  if (settings.readingStatusSettings) {
    const { recentlyReadDays, needsAttentionDays } = settings.readingStatusSettings;
    
    if (recentlyReadDays !== undefined && (typeof recentlyReadDays !== 'number' || recentlyReadDays < 0)) {
      return 'recentlyReadDays must be a non-negative number';
    }
    
    if (needsAttentionDays !== undefined && (typeof needsAttentionDays !== 'number' || needsAttentionDays < 0)) {
      return 'needsAttentionDays must be a non-negative number';
    }
    
    if (recentlyReadDays !== undefined && needsAttentionDays !== undefined && recentlyReadDays >= needsAttentionDays) {
      return 'recentlyReadDays must be less than needsAttentionDays';
    }
  }
  
  return null; // No validation error
}

/**
 * Validate import data
 */
export function validateData(data) {
  if (!data) {
    return 'Data is required';
  }
  
  if (!data.students || !Array.isArray(data.students)) {
    return 'Data must contain a students array';
  }
  
  // Validate each student
  for (const student of data.students) {
    const studentError = validateStudent(student);
    if (studentError) {
      return `Invalid student data: ${studentError}`;
    }
  }
  
  // Validate settings if present
  if (data.settings) {
    const settingsError = validateSettings(data.settings);
    if (settingsError) {
      return `Invalid settings data: ${settingsError}`;
    }
  }
  
  return null; // No validation error
}
```

### Error Handler (`src/middleware/errorHandler.js`)

```javascript
/**
 * Global error handler for the Hono app
 */
export function errorHandler(err, c) {
  console.error('Error:', err);
  
  // Return a JSON response with the error
  return c.json({
    error: err.message || 'An unexpected error occurred',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  }, err.status || 500);
}
```

## Wrangler Configuration

### `wrangler.toml`

```toml
name = "kids-reading-manager-api"
main = "src/index.js"
compatibility_date = "2023-01-01"

# KV Namespace binding
kv_namespaces = [
  { binding = "READING_MANAGER_KV", id = "YOUR_KV_NAMESPACE_ID" }
]

# Environment variables
[vars]
NODE_ENV = "production"

# Development environment
[env.dev]
kv_namespaces = [
  { binding = "READING_MANAGER_KV", id = "YOUR_DEV_KV_NAMESPACE_ID" }
]
[env.dev.vars]
NODE_ENV = "development"

# Routes
[routes]
pattern = "/api/*"
zone_name = "your-domain.com"
```

## Migration Script

### `scripts/migration.js`

```javascript
/**
 * Script to migrate data from the existing system to Cloudflare KV
 * 
 * Usage:
 * wrangler kv:namespace:create "READING_MANAGER_KV"
 * node scripts/migration.js --source=exported-data.json --namespace=YOUR_KV_NAMESPACE_ID
 */

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const args = require('minimist')(process.argv.slice(2));

// Get command line arguments
const sourceFile = args.source;
const namespaceId = args.namespace;

if (!sourceFile || !namespaceId) {
  console.error('Usage: node migration.js --source=exported-data.json --namespace=YOUR_KV_NAMESPACE_ID');
  process.exit(1);
}

// Read the source data file
try {
  const data = JSON.parse(fs.readFileSync(path.resolve(sourceFile), 'utf8'));
  
  // Add metadata
  data.metadata = {
    lastUpdated: new Date().toISOString(),
    version: '1.0',
    migratedFrom: 'legacy-system',
    migrationDate: new Date().toISOString()
  };
  
  // Write the data to a temporary file
  const tempFile = path.resolve('./temp-migration-data.json');
  fs.writeFileSync(tempFile, JSON.stringify(data));
  
  // Use wrangler to put the data in KV
  console.log('Uploading data to Cloudflare KV...');
  execSync(`wrangler kv:key put --binding=READING_MANAGER_KV "app_data" --path=${tempFile} --namespace-id=${namespaceId}`);
  
  // Clean up the temporary file
  fs.unlinkSync(tempFile);
  
  console.log('Migration completed successfully!');
  console.log(`Migrated ${data.students.length} students to Cloudflare KV.`);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
```

## Frontend Integration

To integrate the React frontend with the Cloudflare Worker API, update the API URL in the frontend code:

### `src/contexts/AppContext.js` (Changes)

```javascript
// API URL - update to point to Cloudflare Worker
const API_URL = 'https://kids-reading-manager-api.your-domain.workers.dev/api';
```

## Deployment Instructions

1. **Create KV Namespace**:
   ```bash
   wrangler kv:namespace create "READING_MANAGER_KV"
   ```

2. **Update `wrangler.toml`** with the KV namespace ID.

3. **Deploy the Worker**:
   ```bash
   wrangler deploy
   ```

4. **Migrate Data**:
   - Export data from the existing system
   - Run the migration script:
     ```bash
     node scripts/migration.js --source=exported-data.json --namespace=YOUR_KV_NAMESPACE_ID
     ```

5. **Deploy the Frontend to Cloudflare Pages**:
   - Connect your GitHub repository to Cloudflare Pages
   - Configure the build settings:
     - Build command: `npm run build`
     - Build output directory: `build`
   - Set environment variables:
     - `REACT_APP_API_URL`: Your Worker URL

6. **Test the Deployment**:
   - Verify API endpoints are working
   - Test frontend functionality
   - Validate data migration

## Performance Optimization Strategies

1. **Caching**:
   - Use Cloudflare's cache API to cache frequently accessed data
   - Implement client-side caching for static assets

2. **Reduce KV Operations**:
   - Batch updates when possible
   - Implement optimistic UI updates to reduce perceived latency

3. **Worker Optimization**:
   - Minimize dependencies to reduce bundle size
   - Use efficient data structures and algorithms
   - Avoid unnecessary computations in request handlers

## Monitoring and Debugging

1. **Logging**:
   - Use structured logging in the Worker
   - Set up log drains to external logging services

2. **Error Tracking**:
   - Implement error reporting to a service like Sentry
   - Add detailed error context for easier debugging

3. **Performance Monitoring**:
   - Use Cloudflare's analytics to monitor Worker performance
   - Set up custom metrics for application-specific monitoring