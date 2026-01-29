import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { classesRouter } from '../../routes/classes.js';
import { ROLES } from '../../utils/crypto.js';

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
 * Create a Hono app with the classes router mounted and middleware mocked
 */
const createTestApp = (contextValues = {}, dbOverrides = {}) => {
  const app = new Hono();
  const mockDB = createMockDB(dbOverrides);

  // Use Hono's built-in error handler (catches thrown errors from route handlers)
  app.onError((err, c) => {
    const status = err.status || 500;
    return c.json({
      status: 'error',
      message: err.message || 'Internal Server Error',
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

  app.route('/api/classes', classesRouter);

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
 * Helper to create test class data
 */
const createMockClass = (overrides = {}) => ({
  id: 'class-123',
  name: 'Year 3 Blue',
  teacher_name: 'Mrs Smith',
  academic_year: '2024',
  is_active: 1,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
  student_count: 25,
  ...overrides
});

/**
 * Helper to create test student data
 */
const createMockStudent = (overrides = {}) => ({
  id: 'student-123',
  name: 'John Smith',
  class_id: 'class-123',
  reading_level: 3,
  last_read_date: '2024-01-15',
  likes: '["adventure","mystery"]',
  dislikes: '["horror"]',
  is_active: 1,
  ...overrides
});

describe('Classes API Routes', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console output during tests
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('GET /api/classes', () => {
    describe('Permission checks', () => {
      it('should allow teachers to list classes', async () => {
        const classes = [
          createMockClass({ id: 'class-1', name: 'Year 3 Blue', student_count: 25 }),
          createMockClass({ id: 'class-2', name: 'Year 4 Red', student_count: 28 })
        ];

        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          allResults: { results: classes, success: true }
        });

        const response = await makeRequest(app, 'GET', '/api/classes');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(Array.isArray(data)).toBe(true);
        expect(data).toHaveLength(2);
      });

      it('should allow admins to list classes', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        }, {
          allResults: { results: [createMockClass()], success: true }
        });

        const response = await makeRequest(app, 'GET', '/api/classes');

        expect(response.status).toBe(200);
      });

      it('should allow readonly users to list classes', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.READONLY
        }, {
          allResults: { results: [], success: true }
        });

        const response = await makeRequest(app, 'GET', '/api/classes');

        expect(response.status).toBe(200);
      });

      it('should allow owners to list classes', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.OWNER
        }, {
          allResults: { results: [], success: true }
        });

        const response = await makeRequest(app, 'GET', '/api/classes');

        expect(response.status).toBe(200);
      });
    });

    describe('Organization scoping', () => {
      it('should scope query to organization', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          allResults: { results: [], success: true }
        });

        await makeRequest(app, 'GET', '/api/classes');

        // Verify the query includes organization_id
        const prepareCall = mockDB.prepare.mock.calls[0][0];
        expect(prepareCall).toContain('organization_id = ?');
        expect(mockDB._chain.bind).toHaveBeenCalledWith('org-456');
      });

      it('should only return active classes', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          allResults: { results: [], success: true }
        });

        await makeRequest(app, 'GET', '/api/classes');

        // Verify the query filters for active classes
        const prepareCall = mockDB.prepare.mock.calls[0][0];
        expect(prepareCall).toContain('is_active = 1');
      });
    });

    describe('Response format', () => {
      it('should transform database rows to camelCase', async () => {
        const classes = [createMockClass({
          teacher_name: 'Mrs Jones',
          academic_year: '2025',
          is_active: 1,
          created_at: '2024-01-01',
          updated_at: '2024-01-20',
          student_count: 30
        })];

        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          allResults: { results: classes, success: true }
        });

        const response = await makeRequest(app, 'GET', '/api/classes');
        const data = await response.json();

        expect(data[0].teacherName).toBe('Mrs Jones');
        expect(data[0].academicYear).toBe('2025');
        expect(data[0].isActive).toBe(true);
        expect(data[0].createdAt).toBe('2024-01-01');
        expect(data[0].updatedAt).toBe('2024-01-20');
        expect(data[0].studentCount).toBe(30);
      });

      it('should convert is_active to boolean', async () => {
        const classes = [
          createMockClass({ id: 'c1', is_active: 1 }),
          createMockClass({ id: 'c2', is_active: 0 })
        ];

        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          allResults: { results: classes, success: true }
        });

        const response = await makeRequest(app, 'GET', '/api/classes');
        const data = await response.json();

        expect(data[0].isActive).toBe(true);
        expect(data[1].isActive).toBe(false);
      });

      it('should include student count in response', async () => {
        const classes = [
          createMockClass({ id: 'c1', student_count: 25 }),
          createMockClass({ id: 'c2', student_count: 0 })
        ];

        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          allResults: { results: classes, success: true }
        });

        const response = await makeRequest(app, 'GET', '/api/classes');
        const data = await response.json();

        expect(data[0].studentCount).toBe(25);
        expect(data[1].studentCount).toBe(0);
      });

      it('should return empty array when no classes exist', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          allResults: { results: [], success: true }
        });

        const response = await makeRequest(app, 'GET', '/api/classes');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual([]);
      });
    });
  });

  describe('GET /api/classes/:id', () => {
    describe('Permission checks', () => {
      it('should allow teachers to view a class', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          firstResult: createMockClass()
        });

        const response = await makeRequest(app, 'GET', '/api/classes/class-123');

        expect(response.status).toBe(200);
      });

      it('should allow readonly users to view a class', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.READONLY
        }, {
          firstResult: createMockClass()
        });

        const response = await makeRequest(app, 'GET', '/api/classes/class-123');

        expect(response.status).toBe(200);
      });
    });

    describe('Organization scoping', () => {
      it('should return 404 for class in different organization', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        // Class exists but belongs to different org - query returns null
        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'GET', '/api/classes/class-other-org');
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toContain('not found');
      });

      it('should scope query to organization and check is_active', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          firstResult: createMockClass()
        });

        await makeRequest(app, 'GET', '/api/classes/class-123');

        const prepareCall = mockDB.prepare.mock.calls[0][0];
        expect(prepareCall).toContain('organization_id = ?');
        expect(prepareCall).toContain('is_active = 1');
      });
    });

    describe('Response format', () => {
      it('should transform database row to camelCase', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          firstResult: createMockClass({
            teacher_name: 'Mr Brown',
            academic_year: '2024',
            student_count: 22
          })
        });

        const response = await makeRequest(app, 'GET', '/api/classes/class-123');
        const data = await response.json();

        expect(data.teacherName).toBe('Mr Brown');
        expect(data.academicYear).toBe('2024');
        expect(data.studentCount).toBe(22);
      });

      it('should include student count in response', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          firstResult: createMockClass({ student_count: 30 })
        });

        const response = await makeRequest(app, 'GET', '/api/classes/class-123');
        const data = await response.json();

        expect(data.studentCount).toBe(30);
      });
    });

    describe('Not found handling', () => {
      it('should return 404 for non-existent class', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        }, {
          firstResult: null
        });

        const response = await makeRequest(app, 'GET', '/api/classes/nonexistent');
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toContain('not found');
      });

      it('should return 404 for soft-deleted class', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        // Soft-deleted class won't be found due to is_active = 1 filter
        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'GET', '/api/classes/deleted-class');
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toContain('not found');
      });
    });
  });

  describe('GET /api/classes/:id/students', () => {
    describe('Permission checks', () => {
      it('should allow teachers to view students in a class', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        // First query: verify class exists
        // Second query: get students
        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve({ id: 'class-123' }); // class exists
          return Promise.resolve(null);
        });
        mockDB._chain.all.mockResolvedValue({
          results: [createMockStudent()],
          success: true
        });

        const response = await makeRequest(app, 'GET', '/api/classes/class-123/students');

        expect(response.status).toBe(200);
      });

      it('should allow readonly users to view students in a class', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.READONLY
        });

        mockDB._chain.first.mockResolvedValue({ id: 'class-123' });
        mockDB._chain.all.mockResolvedValue({ results: [], success: true });

        const response = await makeRequest(app, 'GET', '/api/classes/class-123/students');

        expect(response.status).toBe(200);
      });
    });

    describe('Class validation', () => {
      it('should return 404 when class does not exist', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'GET', '/api/classes/nonexistent/students');
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toContain('not found');
      });

      it('should return 404 when class belongs to different organization', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'GET', '/api/classes/other-org-class/students');
        const data = await response.json();

        expect(response.status).toBe(404);
      });
    });

    describe('Response format', () => {
      it('should transform student rows to camelCase', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        mockDB._chain.first.mockResolvedValue({ id: 'class-123' });
        mockDB._chain.all.mockResolvedValue({
          results: [createMockStudent({
            class_id: 'class-123',
            last_read_date: '2024-01-20',
            reading_level: 5
          })],
          success: true
        });

        const response = await makeRequest(app, 'GET', '/api/classes/class-123/students');
        const data = await response.json();

        expect(data[0].classId).toBe('class-123');
        expect(data[0].lastReadDate).toBe('2024-01-20');
        expect(data[0].readingLevel).toBe(5);
      });

      it('should parse JSON likes and dislikes', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        mockDB._chain.first.mockResolvedValue({ id: 'class-123' });
        mockDB._chain.all.mockResolvedValue({
          results: [createMockStudent({
            likes: '["adventure","science fiction"]',
            dislikes: '["romance"]'
          })],
          success: true
        });

        const response = await makeRequest(app, 'GET', '/api/classes/class-123/students');
        const data = await response.json();

        expect(data[0].likes).toEqual(['adventure', 'science fiction']);
        expect(data[0].dislikes).toEqual(['romance']);
      });

      it('should handle null likes and dislikes', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        mockDB._chain.first.mockResolvedValue({ id: 'class-123' });
        mockDB._chain.all.mockResolvedValue({
          results: [createMockStudent({
            likes: null,
            dislikes: null
          })],
          success: true
        });

        const response = await makeRequest(app, 'GET', '/api/classes/class-123/students');
        const data = await response.json();

        expect(data[0].likes).toEqual([]);
        expect(data[0].dislikes).toEqual([]);
      });

      it('should return empty array when class has no students', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        mockDB._chain.first.mockResolvedValue({ id: 'class-123' });
        mockDB._chain.all.mockResolvedValue({ results: [], success: true });

        const response = await makeRequest(app, 'GET', '/api/classes/class-123/students');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toEqual([]);
      });

      it('should only return active students', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        mockDB._chain.first.mockResolvedValue({ id: 'class-123' });

        await makeRequest(app, 'GET', '/api/classes/class-123/students');

        // Check that the students query filters for is_active = 1
        const studentQueryCall = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('FROM students')
        );
        expect(studentQueryCall[0]).toContain('is_active = 1');
      });
    });
  });

  describe('POST /api/classes', () => {
    describe('Permission checks', () => {
      it('should reject requests from teachers (requires admin)', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        const response = await makeRequest(app, 'POST', '/api/classes', {
          name: 'New Class'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Permission denied');
      });

      it('should reject requests from readonly users', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.READONLY
        });

        const response = await makeRequest(app, 'POST', '/api/classes', {
          name: 'New Class'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Permission denied');
      });

      it('should allow admins to create classes', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        // Mock the created class
        mockDB._chain.first.mockResolvedValue(createMockClass({
          id: 'new-class-id',
          name: 'New Class'
        }));

        const response = await makeRequest(app, 'POST', '/api/classes', {
          name: 'New Class',
          teacherName: 'Mr Test'
        });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.name).toBe('New Class');
      });

      it('should allow owners to create classes', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'owner-123',
          organizationId: 'org-456',
          userRole: ROLES.OWNER
        });

        mockDB._chain.first.mockResolvedValue(createMockClass({
          id: 'new-class-id',
          name: 'Owner Class'
        }));

        const response = await makeRequest(app, 'POST', '/api/classes', {
          name: 'Owner Class'
        });

        expect(response.status).toBe(201);
      });
    });

    describe('Input validation', () => {
      it('should reject missing class name', async () => {
        const { app } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        const response = await makeRequest(app, 'POST', '/api/classes', {});
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toContain('name is required');
      });

      it('should reject empty class name', async () => {
        const { app } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        const response = await makeRequest(app, 'POST', '/api/classes', {
          name: ''
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toContain('name is required');
      });
    });

    describe('Organization scoping', () => {
      it('should create class in the correct organization', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(createMockClass());

        await makeRequest(app, 'POST', '/api/classes', {
          name: 'New Class'
        });

        // Check that the INSERT includes organization_id
        const insertCall = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('INSERT INTO classes')
        );
        expect(insertCall).toBeDefined();
        expect(mockDB._chain.bind).toHaveBeenCalledWith(
          expect.any(String), // id
          'org-456',          // organization_id
          'New Class',        // name
          null,               // teacher_name
          expect.any(String), // academic_year
          'admin-123'         // created_by
        );
      });

      it('should record created_by user ID', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(createMockClass());

        await makeRequest(app, 'POST', '/api/classes', {
          name: 'New Class'
        });

        // Verify created_by is set to the current user
        const insertCall = mockDB._chain.bind.mock.calls[0];
        expect(insertCall[5]).toBe('admin-123');
      });
    });

    describe('Response format', () => {
      it('should return 201 status on success', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(createMockClass());

        const response = await makeRequest(app, 'POST', '/api/classes', {
          name: 'New Class'
        });

        expect(response.status).toBe(201);
      });

      it('should return the created class in camelCase', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(createMockClass({
          teacher_name: 'Mrs Test',
          academic_year: '2025'
        }));

        const response = await makeRequest(app, 'POST', '/api/classes', {
          name: 'New Class',
          teacherName: 'Mrs Test',
          academicYear: '2025'
        });
        const data = await response.json();

        expect(data.teacherName).toBe('Mrs Test');
        expect(data.academicYear).toBe('2025');
      });

      it('should use current year as default academic year', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(createMockClass());

        await makeRequest(app, 'POST', '/api/classes', {
          name: 'New Class'
        });

        const bindArgs = mockDB._chain.bind.mock.calls[0];
        const academicYear = bindArgs[4];
        expect(academicYear).toBe(new Date().getFullYear().toString());
      });
    });

    describe('Optional fields', () => {
      it('should handle optional teacherName', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(createMockClass({ teacher_name: null }));

        const response = await makeRequest(app, 'POST', '/api/classes', {
          name: 'No Teacher Class'
        });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.teacherName).toBeNull();
      });

      it('should use provided ID if given', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(createMockClass({ id: 'custom-id' }));

        await makeRequest(app, 'POST', '/api/classes', {
          id: 'custom-id',
          name: 'Custom ID Class'
        });

        const bindArgs = mockDB._chain.bind.mock.calls[0];
        expect(bindArgs[0]).toBe('custom-id');
      });
    });
  });

  describe('PUT /api/classes/:id', () => {
    describe('Permission checks', () => {
      it('should reject requests from teachers (requires admin)', async () => {
        const { app } = createTestApp({
          userId: 'teacher-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        const response = await makeRequest(app, 'PUT', '/api/classes/class-123', {
          name: 'Updated Class'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Permission denied');
      });

      it('should reject requests from readonly users', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.READONLY
        });

        const response = await makeRequest(app, 'PUT', '/api/classes/class-123', {
          name: 'Updated Class'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Permission denied');
      });

      it('should allow admins to update classes', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve({ id: 'class-123' }); // exists check
          return Promise.resolve(createMockClass({ name: 'Updated Class' }));
        });

        const response = await makeRequest(app, 'PUT', '/api/classes/class-123', {
          name: 'Updated Class'
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.name).toBe('Updated Class');
      });

      it('should allow owners to update classes', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'owner-123',
          organizationId: 'org-456',
          userRole: ROLES.OWNER
        });

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve({ id: 'class-123' });
          return Promise.resolve(createMockClass({ name: 'Owner Updated' }));
        });

        const response = await makeRequest(app, 'PUT', '/api/classes/class-123', {
          name: 'Owner Updated'
        });

        expect(response.status).toBe(200);
      });
    });

    describe('Input validation', () => {
      it('should reject missing class name', async () => {
        const { app } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        const response = await makeRequest(app, 'PUT', '/api/classes/class-123', {});
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toContain('name is required');
      });

      it('should reject empty class name', async () => {
        const { app } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        const response = await makeRequest(app, 'PUT', '/api/classes/class-123', {
          name: ''
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toContain('name is required');
      });
    });

    describe('Organization scoping', () => {
      it('should return 404 for class in different organization', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        // Class not found (belongs to different org)
        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'PUT', '/api/classes/other-org-class', {
          name: 'Updated Class'
        });
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toContain('not found');
      });

      it('should verify class exists and belongs to organization before update', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve({ id: 'class-123' });
          return Promise.resolve(createMockClass());
        });

        await makeRequest(app, 'PUT', '/api/classes/class-123', {
          name: 'Updated Class'
        });

        // Verify the existence check includes organization_id
        const existsCheckCall = mockDB.prepare.mock.calls[0][0];
        expect(existsCheckCall).toContain('organization_id = ?');
        expect(existsCheckCall).toContain('is_active = 1');
      });
    });

    describe('Not found handling', () => {
      it('should return 404 for non-existent class', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'PUT', '/api/classes/nonexistent', {
          name: 'Updated Class'
        });
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toContain('not found');
      });

      it('should return 404 for soft-deleted class', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        // Soft-deleted class won't be found due to is_active = 1 filter
        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'PUT', '/api/classes/deleted-class', {
          name: 'Updated Class'
        });
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toContain('not found');
      });
    });

    describe('Response format', () => {
      it('should return the updated class in camelCase', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve({ id: 'class-123' });
          return Promise.resolve(createMockClass({
            name: 'Updated Name',
            teacher_name: 'New Teacher',
            academic_year: '2025'
          }));
        });

        const response = await makeRequest(app, 'PUT', '/api/classes/class-123', {
          name: 'Updated Name',
          teacherName: 'New Teacher',
          academicYear: '2025'
        });
        const data = await response.json();

        expect(data.name).toBe('Updated Name');
        expect(data.teacherName).toBe('New Teacher');
        expect(data.academicYear).toBe('2025');
      });
    });

    describe('Field updates', () => {
      it('should update all provided fields', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve({ id: 'class-123' });
          return Promise.resolve(createMockClass());
        });

        await makeRequest(app, 'PUT', '/api/classes/class-123', {
          name: 'New Name',
          teacherName: 'New Teacher',
          academicYear: '2026'
        });

        // Verify UPDATE query was called with correct values
        const updateCall = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('UPDATE classes')
        );
        expect(updateCall).toBeDefined();
        expect(mockDB._chain.bind).toHaveBeenCalledWith(
          'New Name',
          'New Teacher',
          '2026',
          'class-123',
          'org-456'
        );
      });

      it('should allow clearing teacherName', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve({ id: 'class-123' });
          return Promise.resolve(createMockClass({ teacher_name: null }));
        });

        const response = await makeRequest(app, 'PUT', '/api/classes/class-123', {
          name: 'Class Name',
          teacherName: ''
        });
        const data = await response.json();

        expect(response.status).toBe(200);
      });
    });
  });

  describe('DELETE /api/classes/:id', () => {
    describe('Permission checks', () => {
      it('should reject requests from teachers (requires admin)', async () => {
        const { app } = createTestApp({
          userId: 'teacher-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        const response = await makeRequest(app, 'DELETE', '/api/classes/class-123');
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Permission denied');
      });

      it('should reject requests from readonly users', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.READONLY
        });

        const response = await makeRequest(app, 'DELETE', '/api/classes/class-123');
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Permission denied');
      });

      it('should allow admins to delete classes', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({ id: 'class-123' });

        const response = await makeRequest(app, 'DELETE', '/api/classes/class-123');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.message).toContain('deleted');
      });

      it('should allow owners to delete classes', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'owner-123',
          organizationId: 'org-456',
          userRole: ROLES.OWNER
        });

        mockDB._chain.first.mockResolvedValue({ id: 'class-123' });

        const response = await makeRequest(app, 'DELETE', '/api/classes/class-123');

        expect(response.status).toBe(200);
      });
    });

    describe('Organization scoping', () => {
      it('should return 404 for class in different organization', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'DELETE', '/api/classes/other-org-class');
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toContain('not found');
      });

      it('should verify class belongs to organization before delete', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({ id: 'class-123' });

        await makeRequest(app, 'DELETE', '/api/classes/class-123');

        // Verify the existence check includes organization_id
        const existsCheckCall = mockDB.prepare.mock.calls[0][0];
        expect(existsCheckCall).toContain('organization_id = ?');
      });
    });

    describe('Soft delete behavior', () => {
      it('should soft delete by setting is_active to 0', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({ id: 'class-123' });

        await makeRequest(app, 'DELETE', '/api/classes/class-123');

        // Verify batch was called (for soft delete and student unassignment)
        expect(mockDB.batch).toHaveBeenCalled();
        const batchCalls = mockDB.batch.mock.calls[0][0];
        expect(batchCalls.length).toBeGreaterThanOrEqual(1);
      });

      it('should unassign students from deleted class', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({ id: 'class-123' });

        await makeRequest(app, 'DELETE', '/api/classes/class-123');

        // Verify batch includes student unassignment
        expect(mockDB.batch).toHaveBeenCalled();

        // Check that prepare was called with student update
        const studentUpdateCall = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('UPDATE students')
        );
        expect(studentUpdateCall).toBeDefined();
        expect(studentUpdateCall[0]).toContain('class_id = NULL');
      });

      it('should update timestamps on soft delete', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({ id: 'class-123' });

        await makeRequest(app, 'DELETE', '/api/classes/class-123');

        // Verify the soft delete query updates updated_at
        const softDeleteCall = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('UPDATE classes SET is_active = 0')
        );
        expect(softDeleteCall[0]).toContain('updated_at');
      });
    });

    describe('Not found handling', () => {
      it('should return 404 for non-existent class', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'DELETE', '/api/classes/nonexistent');
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toContain('not found');
      });

      it('should return 404 for already soft-deleted class', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        // Already deleted (is_active = 0) won't be found
        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'DELETE', '/api/classes/already-deleted');
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.message).toContain('not found');
      });
    });

    describe('Response format', () => {
      it('should return success message on delete', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({ id: 'class-123' });

        const response = await makeRequest(app, 'DELETE', '/api/classes/class-123');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.message).toBe('Class deleted successfully');
      });
    });
  });

  describe('Role Hierarchy Tests', () => {
    const roles = [ROLES.OWNER, ROLES.ADMIN, ROLES.TEACHER, ROLES.READONLY];

    describe('Read operations (GET)', () => {
      roles.forEach(role => {
        it(`should allow ${role} to list classes`, async () => {
          const { app } = createTestApp({
            userId: 'user-123',
            organizationId: 'org-456',
            userRole: role
          }, {
            allResults: { results: [], success: true }
          });

          const response = await makeRequest(app, 'GET', '/api/classes');

          expect(response.status).toBe(200);
        });

        it(`should allow ${role} to view a single class`, async () => {
          const { app } = createTestApp({
            userId: 'user-123',
            organizationId: 'org-456',
            userRole: role
          }, {
            firstResult: createMockClass()
          });

          const response = await makeRequest(app, 'GET', '/api/classes/class-123');

          expect(response.status).toBe(200);
        });
      });
    });

    describe('Write operations (POST, PUT, DELETE)', () => {
      const writeRoles = [
        { role: ROLES.OWNER, canWrite: true },
        { role: ROLES.ADMIN, canWrite: true },
        { role: ROLES.TEACHER, canWrite: false },
        { role: ROLES.READONLY, canWrite: false }
      ];

      writeRoles.forEach(({ role, canWrite }) => {
        it(`should ${canWrite ? 'allow' : 'deny'} ${role} to create classes`, async () => {
          const { app, mockDB } = createTestApp({
            userId: 'user-123',
            organizationId: 'org-456',
            userRole: role
          });

          mockDB._chain.first.mockResolvedValue(createMockClass());

          const response = await makeRequest(app, 'POST', '/api/classes', {
            name: 'New Class'
          });

          if (canWrite) {
            expect(response.status).toBe(201);
          } else {
            expect(response.status).toBe(403);
          }
        });

        it(`should ${canWrite ? 'allow' : 'deny'} ${role} to update classes`, async () => {
          const { app, mockDB } = createTestApp({
            userId: 'user-123',
            organizationId: 'org-456',
            userRole: role
          });

          let callIndex = 0;
          mockDB._chain.first.mockImplementation(() => {
            callIndex++;
            if (callIndex === 1) return Promise.resolve({ id: 'class-123' });
            return Promise.resolve(createMockClass());
          });

          const response = await makeRequest(app, 'PUT', '/api/classes/class-123', {
            name: 'Updated Class'
          });

          if (canWrite) {
            expect(response.status).toBe(200);
          } else {
            expect(response.status).toBe(403);
          }
        });

        it(`should ${canWrite ? 'allow' : 'deny'} ${role} to delete classes`, async () => {
          const { app, mockDB } = createTestApp({
            userId: 'user-123',
            organizationId: 'org-456',
            userRole: role
          });

          mockDB._chain.first.mockResolvedValue({ id: 'class-123' });

          const response = await makeRequest(app, 'DELETE', '/api/classes/class-123');

          if (canWrite) {
            expect(response.status).toBe(200);
          } else {
            expect(response.status).toBe(403);
          }
        });
      });
    });
  });

  describe('Student Count Accuracy', () => {
    it('should count only active students in class list', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'org-456',
        userRole: ROLES.TEACHER
      }, {
        allResults: {
          results: [createMockClass({ student_count: 20 })],
          success: true
        }
      });

      await makeRequest(app, 'GET', '/api/classes');

      // Verify the student count subquery filters for active students
      const prepareCall = mockDB.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('s.is_active = 1');
    });

    it('should count only active students in single class view', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'org-456',
        userRole: ROLES.TEACHER
      }, {
        firstResult: createMockClass({ student_count: 15 })
      });

      await makeRequest(app, 'GET', '/api/classes/class-123');

      // Verify the student count subquery filters for active students
      const prepareCall = mockDB.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('s.is_active = 1');
    });

    it('should return 0 student count for empty class', async () => {
      const { app } = createTestApp({
        userId: 'user-123',
        organizationId: 'org-456',
        userRole: ROLES.TEACHER
      }, {
        firstResult: createMockClass({ student_count: 0 })
      });

      const response = await makeRequest(app, 'GET', '/api/classes/class-123');
      const data = await response.json();

      expect(data.studentCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors on list', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'org-456',
        userRole: ROLES.TEACHER
      });

      mockDB._chain.all.mockRejectedValue(new Error('Database connection failed'));

      const response = await makeRequest(app, 'GET', '/api/classes');

      expect(response.status).toBe(500);
    });

    it('should handle database errors on single class fetch', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'org-456',
        userRole: ROLES.TEACHER
      });

      mockDB._chain.first.mockRejectedValue(new Error('Database error'));

      const response = await makeRequest(app, 'GET', '/api/classes/class-123');

      expect(response.status).toBe(500);
    });

    it('should handle database errors on create', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'admin-123',
        organizationId: 'org-456',
        userRole: ROLES.ADMIN
      });

      mockDB._chain.run.mockRejectedValue(new Error('Insert failed'));

      const response = await makeRequest(app, 'POST', '/api/classes', {
        name: 'New Class'
      });

      expect(response.status).toBe(500);
    });

    it('should handle database errors on update', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'admin-123',
        organizationId: 'org-456',
        userRole: ROLES.ADMIN
      });

      mockDB._chain.first.mockResolvedValueOnce({ id: 'class-123' });
      mockDB._chain.run.mockRejectedValue(new Error('Update failed'));

      const response = await makeRequest(app, 'PUT', '/api/classes/class-123', {
        name: 'Updated Class'
      });

      expect(response.status).toBe(500);
    });

    it('should handle database errors on delete', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'admin-123',
        organizationId: 'org-456',
        userRole: ROLES.ADMIN
      });

      mockDB._chain.first.mockResolvedValue({ id: 'class-123' });
      mockDB.batch.mockRejectedValue(new Error('Batch failed'));

      const response = await makeRequest(app, 'DELETE', '/api/classes/class-123');

      expect(response.status).toBe(500);
    });
  });
});
