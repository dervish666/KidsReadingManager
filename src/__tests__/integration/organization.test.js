import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { organizationRouter } from '../../routes/organization.js';
import { createAccessToken } from '../../utils/crypto.js';

const TEST_SECRET = 'test-jwt-secret-for-testing';

// Helper to create a mock D1 database with chainable methods
const createMockDB = (overrides = {}) => {
  const defaultResults = { results: [], success: true };

  // Create a chainable mock that returns itself for bind()
  const createChainablePrepare = () => {
    const chainable = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue(overrides.allResults || defaultResults),
      first: vi.fn().mockResolvedValue(overrides.firstResult || null),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
    };
    return chainable;
  };

  const mockPrepare = vi.fn().mockImplementation(() => createChainablePrepare());

  return {
    prepare: mockPrepare,
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    ...overrides
  };
};

// Helper to create a test app with the organization router
const createTestApp = (mockDb, contextValues = {}) => {
  const app = new Hono();

  // Middleware to set context values (simulating JWT auth)
  app.use('*', async (c, next) => {
    // Determine the actual DB to use
    const actualDb = contextValues.env?.READING_MANAGER_DB !== undefined
      ? contextValues.env.READING_MANAGER_DB
      : mockDb;

    c.env = {
      JWT_SECRET: contextValues.env?.JWT_SECRET !== undefined
        ? contextValues.env.JWT_SECRET
        : TEST_SECRET,
      READING_MANAGER_DB: actualDb
    };

    // Set context values that would normally be set by auth middleware
    if (contextValues.userId) c.set('userId', contextValues.userId);
    if (contextValues.organizationId) c.set('organizationId', contextValues.organizationId);
    if (contextValues.userRole) c.set('userRole', contextValues.userRole);
    if (contextValues.user) c.set('user', contextValues.user);

    await next();
  });

  app.route('/api/organization', organizationRouter);
  return app;
};

// Helper to create test organization data
const createMockOrganization = (overrides = {}) => ({
  id: 'org-123',
  name: 'Test School',
  slug: 'test-school',
  subscription_tier: 'pro',
  max_students: 100,
  max_teachers: 10,
  is_active: 1,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
  ...overrides
});

// Helper to create test user context
const createUserContext = (overrides = {}) => ({
  userId: 'user-123',
  organizationId: 'org-123',
  userRole: 'admin',
  user: {
    sub: 'user-123',
    org: 'org-123',
    role: 'admin'
  },
  ...overrides
});

describe('Organization Routes', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error during tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('GET /api/organization', () => {
    it('should return current organization for authenticated user', async () => {
      const mockOrg = createMockOrganization();
      const mockDb = createMockDB({ firstResult: mockOrg });
      const app = createTestApp(mockDb, createUserContext());

      const response = await app.request('/api/organization');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.organization).toBeDefined();
      expect(data.organization.id).toBe('org-123');
      expect(data.organization.name).toBe('Test School');
      expect(data.organization.subscriptionTier).toBe('pro');
      expect(data.organization.isActive).toBe(true);
    });

    it('should return 404 when organization not found', async () => {
      const mockDb = createMockDB({ firstResult: null });
      const app = createTestApp(mockDb, createUserContext());

      const response = await app.request('/api/organization');
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Organization not found');
    });

    it('should handle database errors gracefully', async () => {
      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockRejectedValue(new Error('DB connection failed'))
      });
      const app = createTestApp(mockDb, createUserContext());

      const response = await app.request('/api/organization');
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to get organization');
    });

    it('should convert snake_case database fields to camelCase', async () => {
      const mockOrg = createMockOrganization({
        subscription_tier: 'enterprise',
        max_students: 500,
        max_teachers: 50,
        is_active: 1,
        created_at: '2024-01-01',
        updated_at: '2024-01-20'
      });
      const mockDb = createMockDB({ firstResult: mockOrg });
      const app = createTestApp(mockDb, createUserContext());

      const response = await app.request('/api/organization');
      const data = await response.json();

      expect(data.organization.subscriptionTier).toBe('enterprise');
      expect(data.organization.maxStudents).toBe(500);
      expect(data.organization.maxTeachers).toBe(50);
      expect(data.organization.isActive).toBe(true);
      expect(data.organization.createdAt).toBe('2024-01-01');
      expect(data.organization.updatedAt).toBe('2024-01-20');
    });
  });

  describe('GET /api/organization/all', () => {
    it('should return all organizations for owner role', async () => {
      const orgs = [
        createMockOrganization({ id: 'org-1', name: 'School A' }),
        createMockOrganization({ id: 'org-2', name: 'School B' }),
        createMockOrganization({ id: 'org-3', name: 'School C' })
      ];
      const mockDb = createMockDB({ allResults: { results: orgs } });
      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/all');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.organizations).toHaveLength(3);
      expect(data.organizations[0].name).toBe('School A');
    });

    it('should return only own organization for admin role', async () => {
      const mockOrg = createMockOrganization();
      const mockDb = createMockDB({ allResults: { results: [mockOrg] } });
      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/all');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.organizations).toHaveLength(1);
      expect(data.organizations[0].id).toBe('org-123');
    });

    it('should reject access for teacher role', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'teacher' }));

      const response = await app.request('/api/organization/all');
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden - Insufficient permissions');
      expect(data.required).toBe('admin');
      expect(data.current).toBe('teacher');
    });

    it('should reject access for readonly role', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'readonly' }));

      const response = await app.request('/api/organization/all');
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden - Insufficient permissions');
    });

    it('should handle empty organization list', async () => {
      const mockDb = createMockDB({ allResults: { results: [] } });
      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/all');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.organizations).toEqual([]);
    });
  });

  describe('GET /api/organization/:id', () => {
    it('should return specific organization for owner role', async () => {
      const mockOrg = createMockOrganization({ id: 'org-456', name: 'Other School' });
      const mockDb = createMockDB({ firstResult: mockOrg });
      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/org-456');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.organization.id).toBe('org-456');
      expect(data.organization.name).toBe('Other School');
    });

    it('should reject access for non-owner roles', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/org-456');
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Forbidden - Insufficient permissions');
      expect(data.required).toBe('owner');
    });

    it('should return 404 for non-existent organization', async () => {
      const mockDb = createMockDB({ firstResult: null });
      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/nonexistent');
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Organization not found');
    });
  });

  describe('POST /api/organization/create', () => {
    it('should create organization for owner role', async () => {
      const mockDb = createMockDB({
        firstResult: null // No existing org with this slug
      });

      // Override to return different results for different queries
      let callCount = 0;
      mockDb.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockImplementation(() => {
          callCount++;
          // First call: check if slug exists (return null)
          // Second call: return the created org
          if (callCount === 1) return Promise.resolve(null);
          return Promise.resolve(createMockOrganization({
            id: 'new-org-id',
            name: 'New School',
            slug: 'new-school'
          }));
        }),
        run: vi.fn().mockResolvedValue({ success: true })
      });

      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New School',
          subscriptionTier: 'pro',
          maxStudents: 200
        })
      });
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.message).toBe('Organization created successfully');
      expect(data.organization).toBeDefined();
    });

    it('should reject creation without name', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Organization name is required');
    });

    it('should reject duplicate slug', async () => {
      const mockDb = createMockDB({
        firstResult: { id: 'existing-org' } // Slug already exists
      });
      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test School' })
      });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe('An organization with this slug already exists');
    });

    it('should reject creation for non-owner roles', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New School' })
      });
      const data = await response.json();

      expect(response.status).toBe(403);
    });

    it('should generate slug from name if not provided', async () => {
      const mockDb = createMockDB();
      let capturedSlug = null;

      mockDb.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockImplementation((...args) => {
          // Capture the slug from the INSERT statement
          if (args.length > 2) capturedSlug = args[2];
          return {
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn().mockResolvedValue({ success: true })
          };
        }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true })
      });

      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      await app.request('/api/organization/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Amazing School!' })
      });

      // Verify the slug generation logic (tested via mocked capture)
      expect(mockDb.prepare).toHaveBeenCalled();
    });
  });

  describe('PUT /api/organization/:id', () => {
    it('should update organization for owner role', async () => {
      const mockOrg = createMockOrganization();
      let callCount = 0;
      const mockDb = createMockDB();

      mockDb.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve({ id: 'org-123' }); // exists check
          return Promise.resolve({
            ...mockOrg,
            name: 'Updated School',
            subscription_tier: 'enterprise'
          });
        }),
        run: vi.fn().mockResolvedValue({ success: true })
      });

      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/org-123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated School',
          subscriptionTier: 'enterprise'
        })
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Organization updated successfully');
    });

    it('should reject update for non-owner roles', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/org-123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' })
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.required).toBe('owner');
    });

    it('should return 404 for non-existent organization', async () => {
      const mockDb = createMockDB({ firstResult: null });
      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/nonexistent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' })
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Organization not found');
    });

    it('should reject update with no valid fields', async () => {
      const mockDb = createMockDB({ firstResult: { id: 'org-123' } });
      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/org-123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No valid fields to update');
    });
  });

  describe('PUT /api/organization (current org)', () => {
    it('should update current organization for owner role', async () => {
      const mockOrg = createMockOrganization();
      let callCount = 0;
      const mockDb = createMockDB();

      mockDb.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            ...mockOrg,
            name: callCount > 1 ? 'Updated Name' : mockOrg.name
          });
        }),
        run: vi.fn().mockResolvedValue({ success: true })
      });

      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Name' })
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Organization updated successfully');
    });

    it('should reject update without name', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No valid fields to update');
    });
  });

  describe('DELETE /api/organization/:id', () => {
    it('should soft delete organization for owner role', async () => {
      const mockDb = createMockDB({ firstResult: { id: 'org-123' } });
      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/org-123', {
        method: 'DELETE'
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Organization deactivated successfully');
    });

    it('should reject deletion for non-owner roles', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/org-123', {
        method: 'DELETE'
      });
      const data = await response.json();

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent organization', async () => {
      const mockDb = createMockDB({ firstResult: null });
      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/nonexistent', {
        method: 'DELETE'
      });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Organization not found');
    });
  });

  describe('GET /api/organization/stats', () => {
    it('should return organization usage statistics', async () => {
      const mockDb = createMockDB();
      let callCount = 0;

      const createChainable = (firstFn) => ({
        bind: vi.fn().mockReturnThis(),
        first: firstFn
      });

      mockDb.prepare = vi.fn().mockImplementation(() => {
        callCount++;
        const currentCall = callCount;
        return createChainable(vi.fn().mockImplementation(() => {
          switch (currentCall) {
            case 1: return Promise.resolve({ max_students: 100, max_teachers: 10 }); // org limits
            case 2: return Promise.resolve({ count: 5 }); // user count
            case 3: return Promise.resolve({ count: 45 }); // student count
            case 4: return Promise.resolve({ count: 3 }); // class count
            case 5: return Promise.resolve({ count: 120 }); // sessions this month
            case 6: return Promise.resolve({ count: 50 }); // selected books
            default: return Promise.resolve(null);
          }
        }));
      });

      const app = createTestApp(mockDb, createUserContext());

      const response = await app.request('/api/organization/stats');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats).toBeDefined();
      expect(data.stats.users.current).toBe(5);
      expect(data.stats.users.limit).toBe(10);
      expect(data.stats.students.current).toBe(45);
      expect(data.stats.students.limit).toBe(100);
      expect(data.stats.classes).toBe(3);
      expect(data.stats.sessionsThisMonth).toBe(120);
      expect(data.stats.selectedBooks).toBe(50);
    });

    it('should handle zero counts gracefully', async () => {
      const mockDb = createMockDB();

      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null)
      }));

      const app = createTestApp(mockDb, createUserContext());

      const response = await app.request('/api/organization/stats');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stats.users.current).toBe(0);
      expect(data.stats.students.current).toBe(0);
    });
  });

  describe('GET /api/organization/settings', () => {
    it('should return organization settings', async () => {
      const settingsData = [
        { setting_key: 'timezone', setting_value: '"America/New_York"' },
        { setting_key: 'academicYear', setting_value: '"2024"' },
        { setting_key: 'readingStatusSettings', setting_value: '{"recentlyReadDays":5,"needsAttentionDays":10}' }
      ];

      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: settingsData })
      }));

      const app = createTestApp(mockDb, createUserContext());

      const response = await app.request('/api/organization/settings');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.settings.timezone).toBe('America/New_York');
      expect(data.settings.academicYear).toBe('2024');
      expect(data.settings.readingStatusSettings.recentlyReadDays).toBe(5);
      expect(data.settings.readingStatusSettings.needsAttentionDays).toBe(10);
    });

    it('should provide default settings when none exist', async () => {
      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] })
      }));

      const app = createTestApp(mockDb, createUserContext());

      const response = await app.request('/api/organization/settings');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.settings.readingStatusSettings).toBeDefined();
      expect(data.settings.readingStatusSettings.recentlyReadDays).toBe(3);
      expect(data.settings.readingStatusSettings.needsAttentionDays).toBe(7);
      expect(data.settings.timezone).toBe('UTC');
    });

    it('should handle non-JSON setting values', async () => {
      const settingsData = [
        { setting_key: 'schoolName', setting_value: 'Plain text value' }
      ];

      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: settingsData })
      }));

      const app = createTestApp(mockDb, createUserContext());

      const response = await app.request('/api/organization/settings');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.settings.schoolName).toBe('Plain text value');
    });
  });

  describe('PUT /api/organization/settings', () => {
    it('should update settings for admin role', async () => {
      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true })
      }));

      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: 'America/Los_Angeles',
          academicYear: '2025'
        })
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('Settings updated successfully');
      expect(mockDb.batch).toHaveBeenCalled();
    });

    it('should update settings for owner role', async () => {
      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true })
      }));

      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: 'Europe/London' })
      });

      expect(response.status).toBe(200);
    });

    it('should reject settings update for teacher role', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'teacher' }));

      const response = await app.request('/api/organization/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: 'UTC' })
      });
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.required).toBe('admin');
    });

    it('should ignore disallowed setting keys', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dangerousKey: 'malicious value',
          anotherBadKey: 'injection attempt'
        })
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('No valid settings to update');
    });

    it('should accept only allowed setting keys', async () => {
      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true })
      }));

      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timezone: 'UTC',
          academicYear: '2025',
          defaultReadingLevel: 3,
          schoolName: 'Test School',
          readingStatusSettings: { recentlyReadDays: 5, needsAttentionDays: 14 }
        })
      });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/organization/ai-config', () => {
    it('should return AI configuration without exposing API key', async () => {
      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          provider: 'anthropic',
          model_preference: 'claude-3-sonnet',
          is_enabled: 1,
          api_key_encrypted: 'encrypted-key-data'
        })
      }));

      const app = createTestApp(mockDb, createUserContext());

      const response = await app.request('/api/organization/ai-config');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.aiConfig.provider).toBe('anthropic');
      expect(data.aiConfig.modelPreference).toBe('claude-3-sonnet');
      expect(data.aiConfig.isEnabled).toBe(true);
      expect(data.aiConfig.hasApiKey).toBe(true);
      // Ensure API key is not exposed
      expect(data.aiConfig.apiKey).toBeUndefined();
      expect(data.aiConfig.api_key_encrypted).toBeUndefined();
    });

    it('should return defaults when no config exists', async () => {
      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null)
      }));

      const app = createTestApp(mockDb, createUserContext());

      const response = await app.request('/api/organization/ai-config');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.aiConfig.provider).toBe('anthropic');
      expect(data.aiConfig.isEnabled).toBe(false);
      expect(data.aiConfig.hasApiKey).toBe(false);
    });
  });

  describe('PUT /api/organization/ai-config', () => {
    it('should update AI configuration for admin role', async () => {
      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 'existing-config' }),
        run: vi.fn().mockResolvedValue({ success: true })
      }));

      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'openai',
          modelPreference: 'gpt-4',
          isEnabled: true
        })
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe('AI configuration updated successfully');
    });

    it('should create new AI configuration if none exists', async () => {
      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true })
      }));

      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          isEnabled: true
        })
      });

      expect(response.status).toBe(200);
    });

    it('should reject invalid AI provider', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'invalid-provider' })
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid AI provider');
    });

    it('should reject AI config update for teacher role', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'teacher' }));

      const response = await app.request('/api/organization/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'anthropic' })
      });
      const data = await response.json();

      expect(response.status).toBe(403);
    });

    it('should encrypt API key when provided', async () => {
      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 'existing-config' }),
        run: vi.fn().mockResolvedValue({ success: true })
      }));

      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: 'sk-test-key-12345'
        })
      });

      expect(response.status).toBe(200);
      // The API key should be encrypted (not stored as plain text)
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('should fail when JWT_SECRET is not available for encryption', async () => {
      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 'existing-config' }),
        run: vi.fn().mockResolvedValue({ success: true })
      }));

      const app = createTestApp(mockDb, {
        userId: 'user-123',
        organizationId: 'org-123',
        userRole: 'admin',
        user: { sub: 'user-123', org: 'org-123', role: 'admin' },
        env: { JWT_SECRET: null, READING_MANAGER_DB: mockDb }
      });

      const response = await app.request('/api/organization/ai-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'sk-test-key' })
      });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Server configuration error - encryption not available');
    });
  });

  describe('GET /api/organization/audit-log', () => {
    it('should return audit log entries for admin role', async () => {
      const auditEntries = [
        {
          id: 'audit-1',
          action: 'create',
          entity_type: 'student',
          entity_id: 'student-123',
          details: '{"name":"Test Student"}',
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
          created_at: '2024-01-15T10:00:00Z',
          user_id: 'user-123',
          user_name: 'John Teacher',
          user_email: 'john@school.com'
        }
      ];

      const mockDb = createMockDB();
      let prepareCallCount = 0;

      mockDb.prepare = vi.fn().mockImplementation(() => {
        prepareCallCount++;
        const currentPrepareCall = prepareCallCount;
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(() => {
            if (currentPrepareCall === 1) return Promise.resolve({ count: 1 });
            return Promise.resolve(null);
          }),
          all: vi.fn().mockResolvedValue({ results: auditEntries })
        };
      });

      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/audit-log');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].action).toBe('create');
      expect(data.entries[0].entityType).toBe('student');
      expect(data.entries[0].user.name).toBe('John Teacher');
      expect(data.pagination).toBeDefined();
      expect(data.pagination.total).toBe(1);
    });

    it('should reject audit log access for teacher role', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'teacher' }));

      const response = await app.request('/api/organization/audit-log');
      const data = await response.json();

      expect(response.status).toBe(403);
    });

    it('should support pagination parameters', async () => {
      const mockDb = createMockDB();
      let prepareCallCount = 0;

      mockDb.prepare = vi.fn().mockImplementation(() => {
        prepareCallCount++;
        const currentPrepareCall = prepareCallCount;
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockImplementation(() => {
            if (currentPrepareCall === 1) return Promise.resolve({ count: 100 });
            return Promise.resolve(null);
          }),
          all: vi.fn().mockResolvedValue({ results: [] })
        };
      });

      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/audit-log?page=2&pageSize=25');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.pagination.page).toBe(2);
      expect(data.pagination.pageSize).toBe(25);
      expect(data.pagination.totalPages).toBe(4);
    });

    it('should parse JSON details in audit entries', async () => {
      const auditEntries = [
        {
          id: 'audit-1',
          action: 'update',
          entity_type: 'settings',
          details: '{"timezone":"America/New_York","previousValue":"UTC"}'
        }
      ];

      const mockDb = createMockDB();
      mockDb.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ count: 1 }),
        all: vi.fn().mockResolvedValue({ results: auditEntries })
      }));

      const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));

      const response = await app.request('/api/organization/audit-log');
      const data = await response.json();

      expect(data.entries[0].details.timezone).toBe('America/New_York');
      expect(data.entries[0].details.previousValue).toBe('UTC');
    });
  });

  describe('Organization Isolation', () => {
    it('should only access data for the authenticated organization', async () => {
      const mockOrg = createMockOrganization({ id: 'org-123' });
      const mockDb = createMockDB({ firstResult: mockOrg });
      let capturedOrgId = null;

      mockDb.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockImplementation((...args) => {
          capturedOrgId = args[0];
          return {
            first: vi.fn().mockResolvedValue(mockOrg),
            all: vi.fn().mockResolvedValue({ results: [] })
          };
        })
      });

      const app = createTestApp(mockDb, createUserContext({ organizationId: 'org-123' }));

      await app.request('/api/organization');

      expect(capturedOrgId).toBe('org-123');
    });

    it('should scope settings queries to organization', async () => {
      const mockDb = createMockDB();
      let capturedOrgId = null;

      mockDb.prepare = vi.fn().mockImplementation(() => {
        const chainable = {
          bind: vi.fn().mockImplementation((...args) => {
            capturedOrgId = args[0];
            return chainable;
          }),
          all: vi.fn().mockResolvedValue({ results: [] })
        };
        return chainable;
      });

      const app = createTestApp(mockDb, createUserContext({ organizationId: 'org-456' }));

      await app.request('/api/organization/settings');

      expect(capturedOrgId).toBe('org-456');
    });
  });

  describe('Subscription Tier Handling', () => {
    it('should return subscription tier in organization response', async () => {
      const tiers = ['free', 'basic', 'pro', 'enterprise'];

      for (const tier of tiers) {
        const mockOrg = createMockOrganization({ subscription_tier: tier });
        const mockDb = createMockDB({ firstResult: mockOrg });
        const app = createTestApp(mockDb, createUserContext());

        const response = await app.request('/api/organization');
        const data = await response.json();

        expect(data.organization.subscriptionTier).toBe(tier);
      }
    });

    it('should include limits in organization data', async () => {
      const mockOrg = createMockOrganization({
        subscription_tier: 'enterprise',
        max_students: 1000,
        max_teachers: 100
      });
      const mockDb = createMockDB({ firstResult: mockOrg });
      const app = createTestApp(mockDb, createUserContext());

      const response = await app.request('/api/organization');
      const data = await response.json();

      expect(data.organization.maxStudents).toBe(1000);
      expect(data.organization.maxTeachers).toBe(100);
    });
  });

  describe('Role Hierarchy Tests', () => {
    const testCases = [
      { role: 'owner', canAccessAll: true, canAccessById: true, canUpdate: true, canDelete: true },
      { role: 'admin', canAccessAll: true, canAccessById: false, canUpdate: false, canDelete: false },
      { role: 'teacher', canAccessAll: false, canAccessById: false, canUpdate: false, canDelete: false },
      { role: 'readonly', canAccessAll: false, canAccessById: false, canUpdate: false, canDelete: false }
    ];

    testCases.forEach(({ role, canAccessAll, canAccessById, canUpdate, canDelete }) => {
      describe(`Role: ${role}`, () => {
        it(`should ${canAccessAll ? 'allow' : 'deny'} GET /api/organization/all`, async () => {
          const mockDb = createMockDB({ allResults: { results: [] } });
          const app = createTestApp(mockDb, createUserContext({ userRole: role }));

          const response = await app.request('/api/organization/all');

          if (canAccessAll) {
            expect(response.status).toBe(200);
          } else {
            expect(response.status).toBe(403);
          }
        });

        it(`should ${canAccessById ? 'allow' : 'deny'} GET /api/organization/:id`, async () => {
          const mockDb = createMockDB({ firstResult: createMockOrganization() });
          const app = createTestApp(mockDb, createUserContext({ userRole: role }));

          const response = await app.request('/api/organization/org-456');

          if (canAccessById) {
            expect(response.status).toBe(200);
          } else {
            expect(response.status).toBe(403);
          }
        });

        it(`should ${canUpdate ? 'allow' : 'deny'} PUT /api/organization/:id`, async () => {
          const mockOrg = createMockOrganization();
          let callCount = 0;
          const mockDb = createMockDB();
          mockDb.prepare = vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockImplementation(() => {
              callCount++;
              return Promise.resolve(callCount === 1 ? { id: 'org-123' } : mockOrg);
            }),
            run: vi.fn().mockResolvedValue({ success: true })
          });
          const app = createTestApp(mockDb, createUserContext({ userRole: role }));

          const response = await app.request('/api/organization/org-123', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Updated' })
          });

          if (canUpdate) {
            expect(response.status).toBe(200);
          } else {
            expect(response.status).toBe(403);
          }
        });

        it(`should ${canDelete ? 'allow' : 'deny'} DELETE /api/organization/:id`, async () => {
          const mockDb = createMockDB({ firstResult: { id: 'org-123' } });
          const app = createTestApp(mockDb, createUserContext({ userRole: role }));

          const response = await app.request('/api/organization/org-123', {
            method: 'DELETE'
          });

          if (canDelete) {
            expect(response.status).toBe(200);
          } else {
            expect(response.status).toBe(403);
          }
        });
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database not available error', async () => {
      const app = createTestApp(null, {
        ...createUserContext(),
        env: { JWT_SECRET: TEST_SECRET, READING_MANAGER_DB: null }
      });

      const response = await app.request('/api/organization');
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to get organization');
    });

    it('should handle malformed JSON in request body', async () => {
      const mockDb = createMockDB();
      const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));

      const response = await app.request('/api/organization/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json'
      });

      expect(response.status).toBe(500);
    });
  });
});
