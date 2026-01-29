import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

// Mock the email module BEFORE importing the router
vi.mock('../../utils/email.js', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ success: true })
}));

// Mock hashPassword to avoid crypto operations in tests
vi.mock('../../utils/crypto.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    hashPassword: vi.fn().mockResolvedValue('mocked-hash:mocked-hash')
  };
});

// Now import the router after mocks are set up
const { usersRouter } = await import('../../routes/users.js');
const { ROLES } = await import('../../utils/crypto.js');

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
 * Create a Hono app with the users router mounted and middleware mocked
 */
const createTestApp = (contextValues = {}, dbOverrides = {}) => {
  const app = new Hono();
  const mockDB = createMockDB(dbOverrides);

  // Middleware to inject context values (simulates auth middleware)
  app.use('*', async (c, next) => {
    c.env = {
      JWT_SECRET: TEST_SECRET,
      READING_MANAGER_DB: mockDB,
      APP_URL: 'http://localhost:3000',
      ...contextValues.env
    };

    // Set context values that would normally come from auth middleware
    if (contextValues.userId) c.set('userId', contextValues.userId);
    if (contextValues.organizationId) c.set('organizationId', contextValues.organizationId);
    if (contextValues.userRole) c.set('userRole', contextValues.userRole);
    if (contextValues.user) c.set('user', contextValues.user);

    await next();
  });

  app.route('/api/users', usersRouter);

  return { app, mockDB };
};

/**
 * Helper to make requests with proper headers
 */
const makeRequest = async (app, method, path, body = null, token = null) => {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    }
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  return app.request(path, options);
};

describe('Users API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/users', () => {
    describe('Permission checks', () => {
      it('should reject requests from teachers (requires admin)', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        const response = await makeRequest(app, 'GET', '/api/users');
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toContain('Insufficient permissions');
        expect(data.required).toBe('admin');
      });

      it('should reject requests from readonly users (requires admin)', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.READONLY
        });

        const response = await makeRequest(app, 'GET', '/api/users');
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toContain('Insufficient permissions');
      });

      it('should allow requests from admins', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        }, {
          allResults: {
            results: [
              {
                id: 'user-1',
                organization_id: 'org-456',
                organization_name: 'Test Org',
                email: 'test@example.com',
                name: 'Test User',
                role: 'teacher',
                is_active: 1,
                last_login_at: null,
                created_at: '2024-01-01',
                updated_at: '2024-01-01'
              }
            ],
            success: true
          }
        });

        const response = await makeRequest(app, 'GET', '/api/users');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.users).toBeDefined();
        expect(Array.isArray(data.users)).toBe(true);
      });

      it('should allow requests from owners', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.OWNER
        }, {
          allResults: { results: [], success: true }
        });

        const response = await makeRequest(app, 'GET', '/api/users');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.users).toBeDefined();
      });
    });

    describe('Organization scoping', () => {
      it('should scope query to organization for admins', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        }, {
          allResults: { results: [], success: true }
        });

        await makeRequest(app, 'GET', '/api/users');

        // Admin query should include organization_id filter
        const prepareCall = mockDB.prepare.mock.calls[0][0];
        expect(prepareCall).toContain('organization_id = ?');
      });

      it('should return users from all organizations for owners', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.OWNER
        }, {
          allResults: { results: [], success: true }
        });

        await makeRequest(app, 'GET', '/api/users');

        // Owner query should NOT have organization_id filter
        const prepareCall = mockDB.prepare.mock.calls[0][0];
        expect(prepareCall).not.toContain('WHERE u.organization_id = ?');
      });
    });

    describe('Response format', () => {
      it('should transform database rows to camelCase', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        }, {
          allResults: {
            results: [
              {
                id: 'user-1',
                organization_id: 'org-456',
                organization_name: 'Test Org',
                email: 'test@example.com',
                name: 'Test User',
                role: 'teacher',
                is_active: 1,
                last_login_at: '2024-01-15T10:00:00Z',
                created_at: '2024-01-01',
                updated_at: '2024-01-01'
              }
            ],
            success: true
          }
        });

        const response = await makeRequest(app, 'GET', '/api/users');
        const data = await response.json();

        expect(data.users[0]).toEqual({
          id: 'user-1',
          organizationId: 'org-456',
          organizationName: 'Test Org',
          email: 'test@example.com',
          name: 'Test User',
          role: 'teacher',
          isActive: true,
          lastLoginAt: '2024-01-15T10:00:00Z',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01'
        });
      });

      it('should convert is_active to boolean', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        }, {
          allResults: {
            results: [
              { id: 'u1', is_active: 1 },
              { id: 'u2', is_active: 0 }
            ],
            success: true
          }
        });

        const response = await makeRequest(app, 'GET', '/api/users');
        const data = await response.json();

        expect(data.users[0].isActive).toBe(true);
        expect(data.users[1].isActive).toBe(false);
      });
    });
  });

  describe('GET /api/users/:id', () => {
    it('should allow users to view their own profile', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'user-123',
        organizationId: 'org-456',
        userRole: ROLES.TEACHER
      }, {
        firstResult: {
          id: 'user-123',
          organization_id: 'org-456',
          email: 'teacher@example.com',
          name: 'Teacher User',
          role: 'teacher',
          is_active: 1,
          created_at: '2024-01-01'
        }
      });

      const response = await makeRequest(app, 'GET', '/api/users/user-123');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user).toBeDefined();
      expect(data.user.id).toBe('user-123');
    });

    it('should allow admins to view any user in their organization', async () => {
      const { app } = createTestApp({
        userId: 'admin-user',
        organizationId: 'org-456',
        userRole: ROLES.ADMIN
      }, {
        firstResult: {
          id: 'other-user',
          organization_id: 'org-456',
          email: 'other@example.com',
          name: 'Other User',
          role: 'teacher',
          is_active: 1
        }
      });

      const response = await makeRequest(app, 'GET', '/api/users/other-user');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user.id).toBe('other-user');
    });

    it('should reject non-admins viewing other users', async () => {
      const { app } = createTestApp({
        userId: 'teacher-user',
        organizationId: 'org-456',
        userRole: ROLES.TEACHER
      });

      const response = await makeRequest(app, 'GET', '/api/users/other-user');
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden');
    });

    it('should return 404 for non-existent user', async () => {
      const { app } = createTestApp({
        userId: 'admin-user',
        organizationId: 'org-456',
        userRole: ROLES.ADMIN
      }, {
        firstResult: null
      });

      const response = await makeRequest(app, 'GET', '/api/users/non-existent');
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('User not found');
    });
  });

  describe('POST /api/users', () => {
    describe('Permission checks', () => {
      it('should reject requests from teachers', async () => {
        const { app } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        const response = await makeRequest(app, 'POST', '/api/users', {
          email: 'new@example.com',
          name: 'New User',
          role: 'teacher'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toContain('Insufficient permissions');
      });

      it('should allow admins to create users', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-user',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        // Mock the chain of queries
        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(null); // No existing user
          if (callIndex === 2) return Promise.resolve({ name: 'Test Org', max_teachers: 10 }); // Organization
          if (callIndex === 3) return Promise.resolve({ count: 2 }); // User count
          return Promise.resolve(null);
        });

        const response = await makeRequest(app, 'POST', '/api/users', {
          email: 'new@example.com',
          name: 'New User',
          role: 'teacher'
        });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.user).toBeDefined();
        expect(data.user.email).toBe('new@example.com');
      });
    });

    describe('Input validation', () => {
      it('should reject missing required fields', async () => {
        const { app } = createTestApp({
          userId: 'admin-user',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        const response = await makeRequest(app, 'POST', '/api/users', {
          email: 'test@example.com'
          // missing name and role
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('Missing required fields');
        expect(data.required).toContain('name');
        expect(data.required).toContain('role');
      });

      it('should reject invalid email format', async () => {
        const { app } = createTestApp({
          userId: 'admin-user',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        const response = await makeRequest(app, 'POST', '/api/users', {
          email: 'invalid-email',
          name: 'Test User',
          role: 'teacher'
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('Invalid email format');
      });

      it('should reject invalid role', async () => {
        const { app } = createTestApp({
          userId: 'admin-user',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        const response = await makeRequest(app, 'POST', '/api/users', {
          email: 'test@example.com',
          name: 'Test User',
          role: 'superuser'
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('Invalid role');
        expect(data.validRoles).toEqual(['admin', 'teacher', 'readonly']);
      });
    });

    describe('Email uniqueness', () => {
      it('should reject duplicate email', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-user',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({ id: 'existing-user' });

        const response = await makeRequest(app, 'POST', '/api/users', {
          email: 'existing@example.com',
          name: 'New User',
          role: 'teacher'
        });
        const data = await response.json();

        expect(response.status).toBe(409);
        expect(data.error).toBe('Email already registered');
      });
    });

    describe('Role restrictions', () => {
      it('should prevent admins from creating admin users', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-user',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(null); // No existing user

        const response = await makeRequest(app, 'POST', '/api/users', {
          email: 'newadmin@example.com',
          name: 'New Admin',
          role: 'admin'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Only owners can create admin users');
      });

      it('should allow owners to create admin users', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'owner-user',
          organizationId: 'org-456',
          userRole: ROLES.OWNER
        });

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(null); // No existing user
          if (callIndex === 2) return Promise.resolve({ name: 'Test Org', max_teachers: 10 }); // Organization
          if (callIndex === 3) return Promise.resolve({ count: 2 }); // User count
          return Promise.resolve(null);
        });

        const response = await makeRequest(app, 'POST', '/api/users', {
          email: 'newadmin@example.com',
          name: 'New Admin',
          role: 'admin'
        });
        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.user.role).toBe('admin');
      });
    });

    describe('Organization limits', () => {
      it('should reject when organization reaches user limit', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-user',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(null); // No existing user
          if (callIndex === 2) return Promise.resolve({ name: 'Test Org', max_teachers: 5 }); // Organization with limit
          if (callIndex === 3) return Promise.resolve({ count: 5 }); // At max capacity
          return Promise.resolve(null);
        });

        const response = await makeRequest(app, 'POST', '/api/users', {
          email: 'new@example.com',
          name: 'New User',
          role: 'teacher'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Organization has reached maximum user limit');
        expect(data.limit).toBe(5);
      });
    });

    describe('Cross-organization creation', () => {
      it('should prevent admins from creating users in other organizations', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-user',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'POST', '/api/users', {
          email: 'new@example.com',
          name: 'New User',
          role: 'teacher',
          organizationId: 'other-org-789'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Only owners can create users in other organizations');
      });

      it('should allow owners to create users in other organizations', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'owner-user',
          organizationId: 'org-456',
          userRole: ROLES.OWNER
        });

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve(null); // No existing user
          if (callIndex === 2) return Promise.resolve({ name: 'Other Org', max_teachers: 10 }); // Target organization
          if (callIndex === 3) return Promise.resolve({ count: 2 }); // User count
          return Promise.resolve(null);
        });

        const response = await makeRequest(app, 'POST', '/api/users', {
          email: 'new@example.com',
          name: 'New User',
          role: 'teacher',
          organizationId: 'other-org-789'
        });
        const data = await response.json();

        expect(response.status).toBe(201);
      });
    });
  });

  describe('PUT /api/users/:id', () => {
    describe('Self-update', () => {
      it('should allow users to update their own name', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve({
            id: 'user-123',
            organization_id: 'org-456',
            role: 'teacher',
            is_active: 1
          });
          // Return updated user
          return Promise.resolve({
            id: 'user-123',
            organization_id: 'org-456',
            organization_name: 'Test Org',
            name: 'Updated Name',
            role: 'teacher',
            is_active: 1
          });
        });

        const response = await makeRequest(app, 'PUT', '/api/users/user-123', {
          name: 'Updated Name'
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.message).toBe('User updated successfully');
      });

      it('should prevent non-admins from updating their own role', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'user-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'user-123',
          organization_id: 'org-456',
          role: 'teacher'
        });

        const response = await makeRequest(app, 'PUT', '/api/users/user-123', {
          role: 'admin'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('You can only update your own name');
      });

      it('should prevent users from deactivating themselves', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'admin-123',
          organization_id: 'org-456',
          role: 'admin'
        });

        const response = await makeRequest(app, 'PUT', '/api/users/admin-123', {
          isActive: false
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('Cannot deactivate your own account');
      });
    });

    describe('Admin updates', () => {
      it('should allow admins to update other users', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve({
            id: 'other-user',
            organization_id: 'org-456',
            role: 'teacher',
            is_active: 1
          });
          return Promise.resolve({
            id: 'other-user',
            organization_id: 'org-456',
            organization_name: 'Test Org',
            name: 'Updated',
            role: 'readonly',
            is_active: 1
          });
        });

        const response = await makeRequest(app, 'PUT', '/api/users/other-user', {
          name: 'Updated',
          role: 'readonly'
        });
        const data = await response.json();

        expect(response.status).toBe(200);
      });

      it('should prevent non-owners from changing roles to admin', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-user',
          organization_id: 'org-456',
          role: 'teacher'
        });

        const response = await makeRequest(app, 'PUT', '/api/users/other-user', {
          role: 'admin'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Only owners can modify admin roles');
      });

      it('should prevent non-owners from demoting admins', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-admin',
          organization_id: 'org-456',
          role: 'admin'
        });

        const response = await makeRequest(app, 'PUT', '/api/users/other-admin', {
          role: 'teacher'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Only owners can modify admin roles');
      });
    });

    describe('Owner-specific operations', () => {
      it('should allow owners to change admin roles', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'owner-123',
          organizationId: 'org-456',
          userRole: ROLES.OWNER
        });

        let callIndex = 0;
        mockDB._chain.first.mockImplementation(() => {
          callIndex++;
          if (callIndex === 1) return Promise.resolve({
            id: 'teacher-user',
            organization_id: 'org-456',
            role: 'teacher'
          });
          return Promise.resolve({
            id: 'teacher-user',
            organization_id: 'org-456',
            organization_name: 'Test Org',
            role: 'admin',
            is_active: 1
          });
        });

        const response = await makeRequest(app, 'PUT', '/api/users/teacher-user', {
          role: 'admin'
        });
        const data = await response.json();

        expect(response.status).toBe(200);
      });

      it('should prevent changing owner role', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'owner-123',
          organizationId: 'org-456',
          userRole: ROLES.OWNER
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'owner-user',
          organization_id: 'org-456',
          role: 'owner'
        });

        const response = await makeRequest(app, 'PUT', '/api/users/owner-user', {
          role: 'admin'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Cannot change owner role');
      });

      it('should prevent deactivating the owner', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'owner-user',
          organization_id: 'org-456',
          role: 'owner'
        });

        const response = await makeRequest(app, 'PUT', '/api/users/owner-user', {
          isActive: false
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('Cannot deactivate the organization owner');
      });
    });

    describe('Validation', () => {
      it('should return 404 for non-existent user', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'PUT', '/api/users/non-existent', {
          name: 'New Name'
        });
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.error).toBe('User not found');
      });

      it('should reject invalid role values', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'owner-123',
          organizationId: 'org-456',
          userRole: ROLES.OWNER
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-user',
          organization_id: 'org-456',
          role: 'teacher'
        });

        const response = await makeRequest(app, 'PUT', '/api/users/other-user', {
          role: 'superadmin'
        });
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('Invalid role');
      });

      it('should reject empty update', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-user',
          organization_id: 'org-456',
          role: 'teacher'
        });

        const response = await makeRequest(app, 'PUT', '/api/users/other-user', {});
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('No valid fields to update');
      });
    });

    describe('Non-admin restrictions', () => {
      it('should reject non-admins updating other users', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'teacher-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-user',
          organization_id: 'org-456',
          role: 'teacher'
        });

        const response = await makeRequest(app, 'PUT', '/api/users/other-user', {
          name: 'New Name'
        });
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toBe('Forbidden');
      });
    });
  });

  describe('DELETE /api/users/:id', () => {
    describe('Permission checks', () => {
      it('should reject requests from teachers', async () => {
        const { app } = createTestApp({
          userId: 'teacher-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        const response = await makeRequest(app, 'DELETE', '/api/users/other-user');
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toContain('Insufficient permissions');
      });

      it('should allow admins to delete users', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-user',
          organization_id: 'org-456',
          role: 'teacher',
          is_active: 1
        });

        const response = await makeRequest(app, 'DELETE', '/api/users/other-user');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.message).toBe('User deactivated successfully');
      });
    });

    describe('Soft delete behavior', () => {
      it('should soft delete by setting is_active to 0', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-user',
          organization_id: 'org-456',
          role: 'teacher'
        });

        await makeRequest(app, 'DELETE', '/api/users/other-user');

        // Check that the update query sets is_active = 0
        const updateCall = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('UPDATE users SET is_active = 0')
        );
        expect(updateCall).toBeDefined();
      });

      it('should revoke refresh tokens on delete', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-user',
          organization_id: 'org-456',
          role: 'teacher'
        });

        await makeRequest(app, 'DELETE', '/api/users/other-user');

        // Check that refresh tokens are revoked
        const revokeCall = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('UPDATE refresh_tokens SET revoked_at')
        );
        expect(revokeCall).toBeDefined();
      });
    });

    describe('Protection rules', () => {
      it('should prevent deleting yourself', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'admin-123',
          organization_id: 'org-456',
          role: 'admin'
        });

        const response = await makeRequest(app, 'DELETE', '/api/users/admin-123');
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('Cannot delete your own account');
      });

      it('should prevent deleting the owner', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'owner-user',
          organization_id: 'org-456',
          role: 'owner'
        });

        const response = await makeRequest(app, 'DELETE', '/api/users/owner-user');
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.error).toBe('Cannot delete the organization owner');
      });

      it('should return 404 for non-existent user', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'DELETE', '/api/users/non-existent');
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.error).toBe('User not found');
      });
    });

    describe('Organization scoping', () => {
      it('should only delete users in the same organization', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        // User from different organization
        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'DELETE', '/api/users/other-org-user');
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.error).toBe('User not found');
      });
    });
  });

  describe('POST /api/users/:id/reset-password', () => {
    describe('Permission checks', () => {
      it('should reject requests from teachers', async () => {
        const { app } = createTestApp({
          userId: 'teacher-123',
          organizationId: 'org-456',
          userRole: ROLES.TEACHER
        });

        const response = await makeRequest(app, 'POST', '/api/users/other-user/reset-password');
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.error).toContain('Insufficient permissions');
      });

      it('should allow admins to reset passwords', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-user',
          organization_id: 'org-456',
          organization_name: 'Test Org',
          email: 'other@example.com',
          name: 'Other User',
          role: 'teacher'
        });

        const response = await makeRequest(app, 'POST', '/api/users/other-user/reset-password');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.message).toContain('Password reset successfully');
      });
    });

    describe('Password reset behavior', () => {
      it('should update password hash', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-user',
          organization_id: 'org-456',
          organization_name: 'Test Org',
          email: 'other@example.com',
          name: 'Other User'
        });

        await makeRequest(app, 'POST', '/api/users/other-user/reset-password');

        // Check that password was updated
        const updateCall = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('UPDATE users SET password_hash')
        );
        expect(updateCall).toBeDefined();
      });

      it('should revoke all refresh tokens', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-user',
          organization_id: 'org-456',
          organization_name: 'Test Org',
          email: 'other@example.com',
          name: 'Other User'
        });

        await makeRequest(app, 'POST', '/api/users/other-user/reset-password');

        // Check that refresh tokens are revoked
        const revokeCall = mockDB.prepare.mock.calls.find(call =>
          call[0].includes('UPDATE refresh_tokens SET revoked_at')
        );
        expect(revokeCall).toBeDefined();
      });

      it('should send welcome email with new password', async () => {
        const emailModule = await import('../../utils/email.js');
        const { sendWelcomeEmail } = emailModule;

        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-user',
          organization_id: 'org-456',
          organization_name: 'Test Org',
          email: 'other@example.com',
          name: 'Other User'
        });

        await makeRequest(app, 'POST', '/api/users/other-user/reset-password');

        expect(sendWelcomeEmail).toHaveBeenCalled();
        expect(sendWelcomeEmail).toHaveBeenCalledWith(
          expect.anything(),
          'other@example.com',
          'Other User',
          'Test Org',
          expect.any(String), // temporary password
          expect.any(String)  // base URL
        );
      });

      it('should indicate email status in response', async () => {
        const emailModule = await import('../../utils/email.js');
        emailModule.sendWelcomeEmail.mockResolvedValueOnce({ success: true });

        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-user',
          organization_id: 'org-456',
          organization_name: 'Test Org',
          email: 'other@example.com',
          name: 'Other User'
        });

        const response = await makeRequest(app, 'POST', '/api/users/other-user/reset-password');
        const data = await response.json();

        expect(data.emailSent).toBe(true);
      });

      it('should handle email send failure gracefully', async () => {
        const emailModule = await import('../../utils/email.js');
        emailModule.sendWelcomeEmail.mockResolvedValueOnce({ success: false, error: 'SMTP error' });

        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue({
          id: 'other-user',
          organization_id: 'org-456',
          organization_name: 'Test Org',
          email: 'other@example.com',
          name: 'Other User'
        });

        const response = await makeRequest(app, 'POST', '/api/users/other-user/reset-password');
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.emailSent).toBe(false);
        expect(data.message).toContain('email notification could not be sent');
      });
    });

    describe('Validation', () => {
      it('should return 404 for non-existent user', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'POST', '/api/users/non-existent/reset-password');
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.error).toBe('User not found');
      });
    });

    describe('Organization scoping', () => {
      it('should only reset passwords for users in the same organization', async () => {
        const { app, mockDB } = createTestApp({
          userId: 'admin-123',
          organizationId: 'org-456',
          userRole: ROLES.ADMIN
        });

        // User from different organization - query returns null
        mockDB._chain.first.mockResolvedValue(null);

        const response = await makeRequest(app, 'POST', '/api/users/other-org-user/reset-password');
        const data = await response.json();

        expect(response.status).toBe(404);
        expect(data.error).toBe('User not found');
      });
    });
  });

  describe('Error handling', () => {
    it('should return 500 for database errors on list', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'admin-123',
        organizationId: 'org-456',
        userRole: ROLES.ADMIN
      });

      mockDB._chain.all.mockRejectedValue(new Error('Database connection failed'));

      const response = await makeRequest(app, 'GET', '/api/users');
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to list users');
    });

    it('should return 500 for database errors on create', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'admin-123',
        organizationId: 'org-456',
        userRole: ROLES.ADMIN
      });

      mockDB._chain.first.mockRejectedValue(new Error('Database error'));

      const response = await makeRequest(app, 'POST', '/api/users', {
        email: 'test@example.com',
        name: 'Test',
        role: 'teacher'
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to create user');
    });

    it('should return 500 for database errors on update', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'admin-123',
        organizationId: 'org-456',
        userRole: ROLES.ADMIN
      });

      mockDB._chain.first.mockRejectedValue(new Error('Database error'));

      const response = await makeRequest(app, 'PUT', '/api/users/some-user', {
        name: 'Updated'
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to update user');
    });

    it('should return 500 for database errors on delete', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'admin-123',
        organizationId: 'org-456',
        userRole: ROLES.ADMIN
      });

      mockDB._chain.first.mockRejectedValue(new Error('Database error'));

      const response = await makeRequest(app, 'DELETE', '/api/users/some-user');
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to delete user');
    });

    it('should return 500 for database errors on password reset', async () => {
      const { app, mockDB } = createTestApp({
        userId: 'admin-123',
        organizationId: 'org-456',
        userRole: ROLES.ADMIN
      });

      mockDB._chain.first.mockRejectedValue(new Error('Database error'));

      const response = await makeRequest(app, 'POST', '/api/users/some-user/reset-password');
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to reset password');
    });
  });
});
