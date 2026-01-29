import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { genresRouter } from '../../routes/genres.js';

const TEST_SECRET = 'test-jwt-secret-for-testing';

/**
 * Create a mock D1 database for testing
 */
const createMockDB = (overrides = {}) => {
  const prepareChain = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue(overrides.allResults || { results: [], success: true }),
    first: vi.fn().mockResolvedValue(overrides.firstResult || null),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
  };

  return {
    prepare: vi.fn().mockReturnValue(prepareChain),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    _chain: prepareChain,
    ...overrides
  };
};

/**
 * Create a Hono app with the genres router mounted and middleware mocked
 */
const createTestApp = (contextValues = {}, dbOverrides = {}) => {
  const app = new Hono();
  const mockDB = createMockDB(dbOverrides);

  // Add global error handler using Hono's onError
  app.onError((error, c) => {
    const status = error.status || 500;
    return c.json({
      status: 'error',
      message: error.message || 'Internal Server Error',
      path: c.req.path
    }, status);
  });

  // Middleware to inject context values (simulates auth middleware)
  app.use('*', async (c, next) => {
    c.env = {
      JWT_SECRET: TEST_SECRET,
      READING_MANAGER_DB: mockDB,
      ...contextValues.env
    };

    // Set context values that would normally come from auth middleware
    if (contextValues.userId) c.set('userId', contextValues.userId);
    if (contextValues.organizationId) c.set('organizationId', contextValues.organizationId);
    if (contextValues.userRole) c.set('userRole', contextValues.userRole);
    if (contextValues.user) c.set('user', contextValues.user);

    await next();
  });

  app.route('/api/genres', genresRouter);

  return { app, mockDB };
};

/**
 * Helper to make requests with proper headers
 */
const makeRequest = async (app, method, path, body = null) => {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return app.request(path, options);
};

/**
 * Create mock genre data
 */
const createMockGenre = (overrides = {}) => ({
  id: 'genre-123',
  name: 'Fantasy',
  description: 'Fantasy books with magical elements',
  is_predefined: 0,
  created_at: '2024-01-01T00:00:00Z',
  ...overrides
});

/**
 * Create test user context
 */
const createUserContext = (overrides = {}) => ({
  userId: 'user-123',
  organizationId: 'org-456',
  userRole: 'admin',
  user: {
    sub: 'user-123',
    org: 'org-456',
    role: 'admin'
  },
  ...overrides
});

describe('Genres API Routes', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error during tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('GET /api/genres', () => {
    describe('Permission checks', () => {
      it('should allow requests from readonly users', async () => {
        const genres = [
          createMockGenre({ id: 'genre-1', name: 'Fantasy', is_predefined: 1 }),
          createMockGenre({ id: 'genre-2', name: 'Science Fiction', is_predefined: 1 }),
          createMockGenre({ id: 'genre-3', name: 'Custom Genre', is_predefined: 0 })
        ];

        const { app, mockDB } = createTestApp(
          createUserContext({ userRole: 'readonly' }),
          { allResults: { results: genres, success: true } }
        );

        const response = await makeRequest(app, 'GET', '/api/genres');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(Array.isArray(data)).toBe(true);
        expect(data).toHaveLength(3);
      });

      it('should allow requests from teachers', async () => {
        const { app } = createTestApp(
          createUserContext({ userRole: 'teacher' }),
          { allResults: { results: [], success: true } }
        );

        const response = await makeRequest(app, 'GET', '/api/genres');

        expect(response.status).toBe(200);
      });

      it('should allow requests from admins', async () => {
        const { app } = createTestApp(
          createUserContext({ userRole: 'admin' }),
          { allResults: { results: [], success: true } }
        );

        const response = await makeRequest(app, 'GET', '/api/genres');

        expect(response.status).toBe(200);
      });

      it('should allow requests from owners', async () => {
        const { app } = createTestApp(
          createUserContext({ userRole: 'owner' }),
          { allResults: { results: [], success: true } }
        );

        const response = await makeRequest(app, 'GET', '/api/genres');

        expect(response.status).toBe(200);
      });
    });

    describe('Response format', () => {
      it('should transform database rows to camelCase', async () => {
        const genres = [
          createMockGenre({
            id: 'genre-1',
            name: 'Fantasy',
            description: 'Magical worlds',
            is_predefined: 1,
            created_at: '2024-01-01T00:00:00Z'
          })
        ];

        const { app } = createTestApp(
          createUserContext({ userRole: 'readonly' }),
          { allResults: { results: genres, success: true } }
        );

        const response = await makeRequest(app, 'GET', '/api/genres');
        const data = await response.json();

        expect(data[0]).toEqual({
          id: 'genre-1',
          name: 'Fantasy',
          description: 'Magical worlds',
          isPredefined: true,
          createdAt: '2024-01-01T00:00:00Z'
        });
      });

      it('should convert is_predefined to boolean', async () => {
        const genres = [
          createMockGenre({ id: 'g1', is_predefined: 1 }),
          createMockGenre({ id: 'g2', is_predefined: 0 })
        ];

        const { app } = createTestApp(
          createUserContext({ userRole: 'readonly' }),
          { allResults: { results: genres, success: true } }
        );

        const response = await makeRequest(app, 'GET', '/api/genres');
        const data = await response.json();

        expect(data[0].isPredefined).toBe(true);
        expect(data[1].isPredefined).toBe(false);
      });

      it('should return genres sorted by predefined first, then by name', async () => {
        const { app, mockDB } = createTestApp(
          createUserContext({ userRole: 'readonly' }),
          { allResults: { results: [], success: true } }
        );

        await makeRequest(app, 'GET', '/api/genres');

        const prepareCall = mockDB.prepare.mock.calls[0][0];
        expect(prepareCall).toContain('ORDER BY is_predefined DESC, name ASC');
      });
    });

    describe('Global genre access', () => {
      it('should not scope genres by organization (genres are global)', async () => {
        const { app, mockDB } = createTestApp(
          createUserContext({ userRole: 'readonly' }),
          { allResults: { results: [], success: true } }
        );

        await makeRequest(app, 'GET', '/api/genres');

        // Verify the query does NOT contain organization_id filter
        const prepareCall = mockDB.prepare.mock.calls[0][0];
        expect(prepareCall).not.toContain('organization_id');
      });
    });
  });

  describe('GET /api/genres/:id', () => {
    describe('Permission checks', () => {
      it('should allow readonly users to get a specific genre', async () => {
        const genre = createMockGenre({ id: 'genre-123', name: 'Fantasy' });

        const { app } = createTestApp(
          createUserContext({ userRole: 'readonly' }),
          { firstResult: genre }
        );

        const response = await makeRequest(app, 'GET', '/api/genres/genre-123');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.id).toBe('genre-123');
        expect(data.name).toBe('Fantasy');
      });

      it('should allow teachers to get a specific genre', async () => {
        const genre = createMockGenre({ id: 'genre-123' });

        const { app } = createTestApp(
          createUserContext({ userRole: 'teacher' }),
          { firstResult: genre }
        );

        const response = await makeRequest(app, 'GET', '/api/genres/genre-123');

        expect(response.status).toBe(200);
      });
    });

    describe('Response format', () => {
      it('should transform database row to camelCase', async () => {
        const genre = createMockGenre({
          id: 'genre-123',
          name: 'Mystery',
          description: 'Detective stories',
          is_predefined: 1,
          created_at: '2024-01-15T00:00:00Z'
        });

        const { app } = createTestApp(
          createUserContext({ userRole: 'readonly' }),
          { firstResult: genre }
        );

        const response = await makeRequest(app, 'GET', '/api/genres/genre-123');
        const data = await response.json();

        expect(data).toEqual({
          id: 'genre-123',
          name: 'Mystery',
          description: 'Detective stories',
          isPredefined: true,
          createdAt: '2024-01-15T00:00:00Z'
        });
      });
    });

    describe('Error handling', () => {
      it('should return 404 for non-existent genre', async () => {
        const { app } = createTestApp(
          createUserContext({ userRole: 'readonly' }),
          { firstResult: null }
        );

        const response = await makeRequest(app, 'GET', '/api/genres/non-existent');
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toContain('Genre with ID non-existent not found');
      });
    });
  });

  describe('POST /api/genres', () => {
    describe('Permission checks', () => {
      it('should reject requests from readonly users', async () => {
        const { app } = createTestApp(createUserContext({ userRole: 'readonly' }));

        const response = await makeRequest(app, 'POST', '/api/genres', {
          name: 'New Genre'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toContain('Insufficient permissions');
        expect(data.required).toBe('admin');
      });

      it('should reject requests from teachers', async () => {
        const { app } = createTestApp(createUserContext({ userRole: 'teacher' }));

        const response = await makeRequest(app, 'POST', '/api/genres', {
          name: 'New Genre'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toContain('Insufficient permissions');
        expect(data.required).toBe('admin');
      });

      it('should allow requests from admins', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(null); // No existing genre with same name
          return Promise.resolve(createMockGenre({ id: 'new-genre-id', name: 'New Genre' })); // Created genre
        });

        const response = await makeRequest(app, 'POST', '/api/genres', {
          name: 'New Genre',
          description: 'A new custom genre'
        });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.name).toBe('New Genre');
      });

      it('should allow requests from owners', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'owner' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(null);
          return Promise.resolve(createMockGenre({ id: 'new-genre-id', name: 'Owner Genre' }));
        });

        const response = await makeRequest(app, 'POST', '/api/genres', {
          name: 'Owner Genre'
        });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.name).toBe('Owner Genre');
      });
    });

    describe('Input validation', () => {
      it('should reject missing genre name', async () => {
        const { app } = createTestApp(createUserContext({ userRole: 'admin' }));

        const response = await makeRequest(app, 'POST', '/api/genres', {});
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toBe('Genre name is required');
      });

      it('should reject empty genre name', async () => {
        const { app } = createTestApp(createUserContext({ userRole: 'admin' }));

        const response = await makeRequest(app, 'POST', '/api/genres', {
          name: ''
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toBe('Genre name is required');
      });
    });

    describe('Genre uniqueness validation', () => {
      it('should reject duplicate genre name (case insensitive)', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        // First query returns existing genre
        mockDB._chain.first.mockResolvedValue({ id: 'existing-genre' });

        const response = await makeRequest(app, 'POST', '/api/genres', {
          name: 'Fantasy'
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toBe('A genre with this name already exists');
      });

      it('should check for existing genre with case-insensitive comparison', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        mockDB._chain.first.mockResolvedValue({ id: 'existing-genre' });

        await makeRequest(app, 'POST', '/api/genres', { name: 'FANTASY' });

        const prepareCall = mockDB.prepare.mock.calls[0][0];
        expect(prepareCall).toContain('LOWER(name) = LOWER(?)');
      });
    });

    describe('Genre creation', () => {
      it('should create genre with provided ID', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(null);
          return Promise.resolve(createMockGenre({ id: 'custom-id', name: 'Test Genre' }));
        });

        const response = await makeRequest(app, 'POST', '/api/genres', {
          id: 'custom-id',
          name: 'Test Genre'
        });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.id).toBe('custom-id');
      });

      it('should generate ID if not provided', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(null);
          return Promise.resolve(createMockGenre({ id: 'generated-id', name: 'Test Genre' }));
        });

        const response = await makeRequest(app, 'POST', '/api/genres', {
          name: 'Test Genre'
        });

        expect(response.status).toBe(201);

        // Verify INSERT was called with ID
        const insertCall = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('INSERT INTO genres')
        );
        expect(insertCall).toBeDefined();
      });

      it('should create genre with description', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(null);
          return Promise.resolve(createMockGenre({
            name: 'Adventure',
            description: 'Action-packed stories'
          }));
        });

        const response = await makeRequest(app, 'POST', '/api/genres', {
          name: 'Adventure',
          description: 'Action-packed stories'
        });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.description).toBe('Action-packed stories');
      });

      it('should create genre without description', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(null);
          return Promise.resolve(createMockGenre({
            name: 'Horror',
            description: null
          }));
        });

        const response = await makeRequest(app, 'POST', '/api/genres', {
          name: 'Horror'
        });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.description).toBeNull();
      });

      it('should allow creating predefined genres (for system use)', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(null);
          return Promise.resolve(createMockGenre({
            name: 'Romance',
            is_predefined: 1
          }));
        });

        const response = await makeRequest(app, 'POST', '/api/genres', {
          name: 'Romance',
          isPredefined: true
        });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.isPredefined).toBe(true);
      });

      it('should default isPredefined to false', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(null);
          return Promise.resolve(createMockGenre({
            name: 'Custom',
            is_predefined: 0
          }));
        });

        const response = await makeRequest(app, 'POST', '/api/genres', {
          name: 'Custom'
        });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.isPredefined).toBe(false);
      });
    });
  });

  describe('PUT /api/genres/:id', () => {
    describe('Permission checks', () => {
      it('should reject requests from readonly users', async () => {
        const { app } = createTestApp(createUserContext({ userRole: 'readonly' }));

        const response = await makeRequest(app, 'PUT', '/api/genres/genre-123', {
          name: 'Updated Genre'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toContain('Insufficient permissions');
        expect(data.required).toBe('admin');
      });

      it('should reject requests from teachers', async () => {
        const { app } = createTestApp(createUserContext({ userRole: 'teacher' }));

        const response = await makeRequest(app, 'PUT', '/api/genres/genre-123', {
          name: 'Updated Genre'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toContain('Insufficient permissions');
      });

      it('should allow requests from admins', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(createMockGenre()); // Genre exists
          if (callIndex === 2) return Promise.resolve(null); // No name conflict
          return Promise.resolve(createMockGenre({ name: 'Updated Genre' })); // Updated genre
        });

        const response = await makeRequest(app, 'PUT', '/api/genres/genre-123', {
          name: 'Updated Genre'
        });

        expect(response.status).toBe(200);
      });

      it('should allow requests from owners', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'owner' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(createMockGenre());
          if (callIndex === 2) return Promise.resolve(null);
          return Promise.resolve(createMockGenre({ name: 'Owner Update' }));
        });

        const response = await makeRequest(app, 'PUT', '/api/genres/genre-123', {
          name: 'Owner Update'
        });

        expect(response.status).toBe(200);
      });
    });

    describe('Input validation', () => {
      it('should reject missing genre name', async () => {
        const { app } = createTestApp(createUserContext({ userRole: 'admin' }));

        const response = await makeRequest(app, 'PUT', '/api/genres/genre-123', {});
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toBe('Genre name is required');
      });

      it('should reject empty genre name', async () => {
        const { app } = createTestApp(createUserContext({ userRole: 'admin' }));

        const response = await makeRequest(app, 'PUT', '/api/genres/genre-123', {
          name: ''
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toBe('Genre name is required');
      });
    });

    describe('Genre existence check', () => {
      it('should return 404 for non-existent genre', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'PUT', '/api/genres/non-existent', {
          name: 'Updated Name'
        });
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toContain('Genre with ID non-existent not found');
      });
    });

    describe('Genre uniqueness validation', () => {
      it('should reject update if new name conflicts with existing genre', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(createMockGenre({ id: 'genre-123' })); // Genre exists
          return Promise.resolve({ id: 'other-genre' }); // Name conflict
        });

        const response = await makeRequest(app, 'PUT', '/api/genres/genre-123', {
          name: 'Existing Genre Name'
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toBe('A genre with this name already exists');
      });

      it('should allow update if name stays the same', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(createMockGenre({ id: 'genre-123', name: 'Fantasy' }));
          if (callIndex === 2) return Promise.resolve(null); // No conflict (same genre)
          return Promise.resolve(createMockGenre({ id: 'genre-123', name: 'Fantasy', description: 'Updated description' }));
        });

        const response = await makeRequest(app, 'PUT', '/api/genres/genre-123', {
          name: 'Fantasy',
          description: 'Updated description'
        });

        expect(response.status).toBe(200);
      });

      it('should exclude current genre when checking for name conflicts', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(createMockGenre({ id: 'genre-123' }));
          if (callIndex === 2) return Promise.resolve(null);
          return Promise.resolve(createMockGenre());
        });

        await makeRequest(app, 'PUT', '/api/genres/genre-123', { name: 'New Name' });

        // Find the query that checks for name conflicts
        const conflictQuery = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('LOWER(name) = LOWER(?)') && call[0].includes('id != ?')
        );
        expect(conflictQuery).toBeDefined();
      });
    });

    describe('Genre update', () => {
      it('should update genre name', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(createMockGenre({ name: 'Old Name' }));
          if (callIndex === 2) return Promise.resolve(null);
          return Promise.resolve(createMockGenre({ name: 'New Name' }));
        });

        const response = await makeRequest(app, 'PUT', '/api/genres/genre-123', {
          name: 'New Name'
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.name).toBe('New Name');
      });

      it('should update genre description', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(createMockGenre());
          if (callIndex === 2) return Promise.resolve(null);
          return Promise.resolve(createMockGenre({ description: 'New description' }));
        });

        const response = await makeRequest(app, 'PUT', '/api/genres/genre-123', {
          name: 'Fantasy',
          description: 'New description'
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.description).toBe('New description');
      });

      it('should clear description when set to null', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(createMockGenre({ description: 'Old description' }));
          if (callIndex === 2) return Promise.resolve(null);
          return Promise.resolve(createMockGenre({ description: null }));
        });

        const response = await makeRequest(app, 'PUT', '/api/genres/genre-123', {
          name: 'Fantasy',
          description: null
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.description).toBeNull();
      });
    });
  });

  describe('DELETE /api/genres/:id', () => {
    describe('Permission checks', () => {
      it('should reject requests from readonly users', async () => {
        const { app } = createTestApp(createUserContext({ userRole: 'readonly' }));

        const response = await makeRequest(app, 'DELETE', '/api/genres/genre-123');
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toContain('Insufficient permissions');
        expect(data.required).toBe('admin');
      });

      it('should reject requests from teachers', async () => {
        const { app } = createTestApp(createUserContext({ userRole: 'teacher' }));

        const response = await makeRequest(app, 'DELETE', '/api/genres/genre-123');
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toContain('Insufficient permissions');
      });

      it('should allow requests from admins', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        mockDB._chain.first.mockResolvedValue(createMockGenre({ is_predefined: 0 }));

        const response = await makeRequest(app, 'DELETE', '/api/genres/genre-123');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.message).toBe('Genre deleted successfully');
      });

      it('should allow requests from owners', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'owner' }));

        mockDB._chain.first.mockResolvedValue(createMockGenre({ is_predefined: 0 }));

        const response = await makeRequest(app, 'DELETE', '/api/genres/genre-123');

        expect(response.status).toBe(200);
      });
    });

    describe('Genre existence check', () => {
      it('should return 404 for non-existent genre', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'DELETE', '/api/genres/non-existent');
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toContain('Genre with ID non-existent not found');
      });
    });

    describe('Predefined genre protection', () => {
      it('should reject deletion of predefined genres', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        mockDB._chain.first.mockResolvedValue(createMockGenre({
          id: 'genre-123',
          name: 'Fantasy',
          is_predefined: 1
        }));

        const response = await makeRequest(app, 'DELETE', '/api/genres/genre-123');
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toBe('Cannot delete predefined genres');
      });

      it('should allow deletion of custom genres', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        mockDB._chain.first.mockResolvedValue(createMockGenre({
          id: 'genre-123',
          name: 'Custom Genre',
          is_predefined: 0
        }));

        const response = await makeRequest(app, 'DELETE', '/api/genres/genre-123');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.message).toBe('Genre deleted successfully');
      });
    });

    describe('Genre deletion', () => {
      it('should delete genre from database', async () => {
        const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

        mockDB._chain.first.mockResolvedValue(createMockGenre({ is_predefined: 0 }));

        await makeRequest(app, 'DELETE', '/api/genres/genre-123');

        // Verify DELETE query was executed
        const deleteCall = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('DELETE FROM genres WHERE id = ?')
        );
        expect(deleteCall).toBeDefined();
      });
    });
  });

  describe('Role Hierarchy Tests', () => {
    const endpoints = [
      { method: 'GET', path: '/api/genres', minRole: 'readonly' },
      { method: 'GET', path: '/api/genres/genre-123', minRole: 'readonly' },
      { method: 'POST', path: '/api/genres', minRole: 'admin', body: { name: 'Test' } },
      { method: 'PUT', path: '/api/genres/genre-123', minRole: 'admin', body: { name: 'Test' } },
      { method: 'DELETE', path: '/api/genres/genre-123', minRole: 'admin' }
    ];

    const roles = ['readonly', 'teacher', 'admin', 'owner'];
    const roleHierarchy = { readonly: 0, teacher: 1, admin: 2, owner: 3 };

    endpoints.forEach(({ method, path, minRole, body }) => {
      const minRoleLevel = roleHierarchy[minRole];

      roles.forEach(role => {
        const roleLevel = roleHierarchy[role];
        const shouldAllow = roleLevel >= minRoleLevel;

        it(`${method} ${path} - should ${shouldAllow ? 'allow' : 'deny'} ${role}`, async () => {
          const { app, mockDB } = createTestApp(createUserContext({ userRole: role }));

          // Mock successful responses for allowed requests
          if (shouldAllow) {
            if (method === 'GET' && path.includes(':id')) {
              mockDB._chain.first.mockResolvedValue(createMockGenre());
            } else if (method === 'GET') {
              mockDB._chain.all.mockResolvedValue({ results: [], success: true });
            } else if (method === 'POST') {
              let callIndex = 0;
              mockDB._chain.first.mockImplementation(() => {
                callIndex++;
                if (callIndex === 1) return Promise.resolve(null);
                return Promise.resolve(createMockGenre());
              });
            } else if (method === 'PUT') {
              let callIndex = 0;
              mockDB._chain.first.mockImplementation(() => {
                callIndex++;
                if (callIndex === 1) return Promise.resolve(createMockGenre());
                if (callIndex === 2) return Promise.resolve(null);
                return Promise.resolve(createMockGenre());
              });
            } else if (method === 'DELETE') {
              mockDB._chain.first.mockResolvedValue(createMockGenre({ is_predefined: 0 }));
            }
          }

          const response = await makeRequest(app, method, path.replace(':id', 'genre-123'), body);

          if (shouldAllow) {
            expect(response.status).not.toBe(403);
          } else {
            expect(response.status).toBe(403);
          }
        });
      });
    });
  });

  describe('Multi-tenant mode detection', () => {
    it('should use D1 database when JWT_SECRET and organizationId are present', async () => {
      const { app, mockDB } = createTestApp(
        createUserContext({ userRole: 'readonly' }),
        { allResults: { results: [], success: true } }
      );

      await makeRequest(app, 'GET', '/api/genres');

      // D1 queries use prepare()
      expect(mockDB.prepare).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors on list', async () => {
      const { app, mockDB } = createTestApp(createUserContext({ userRole: 'readonly' }));

      mockDB._chain.all.mockRejectedValue(new Error('Database connection failed'));

      const response = await makeRequest(app, 'GET', '/api/genres');

      expect(response.status).toBe(500);
    });

    it('should handle database errors on get by ID', async () => {
      const { app, mockDB } = createTestApp(createUserContext({ userRole: 'readonly' }));

      mockDB._chain.first.mockRejectedValue(new Error('Database error'));

      const response = await makeRequest(app, 'GET', '/api/genres/genre-123');

      expect(response.status).toBe(500);
    });

    it('should handle database errors on create', async () => {
      const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

      mockDB._chain.first.mockResolvedValue(null);
      mockDB._chain.run.mockRejectedValue(new Error('Insert failed'));

      const response = await makeRequest(app, 'POST', '/api/genres', {
        name: 'Test Genre'
      });

      expect(response.status).toBe(500);
    });

    it('should handle database errors on update', async () => {
      const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

      let callIndex = 0;
      mockDB._chain.first.mockImplementation(() => {
        callIndex++;
        if (callIndex === 1) return Promise.resolve(createMockGenre());
        return Promise.resolve(null);
      });
      mockDB._chain.run.mockRejectedValue(new Error('Update failed'));

      const response = await makeRequest(app, 'PUT', '/api/genres/genre-123', {
        name: 'Updated Name'
      });

      expect(response.status).toBe(500);
    });

    it('should handle database errors on delete', async () => {
      const { app, mockDB } = createTestApp(createUserContext({ userRole: 'admin' }));

      mockDB._chain.first.mockResolvedValue(createMockGenre({ is_predefined: 0 }));
      mockDB._chain.run.mockRejectedValue(new Error('Delete failed'));

      const response = await makeRequest(app, 'DELETE', '/api/genres/genre-123');

      expect(response.status).toBe(500);
    });
  });
});
