import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  jwtAuthMiddleware,
  tenantMiddleware,
  requireRole,
  requireOwner,
  requireAdmin,
  requireTeacher,
  requireReadonly,
  requireOrgOwnership,
  scopeToOrganization
} from '../../middleware/tenant.js';
import { createAccessToken } from '../../utils/crypto.js';

const TEST_SECRET = 'test-jwt-secret-for-testing';

// Helper to create mock Hono context
const createMockContext = (overrides = {}) => {
  const store = new Map();
  return {
    req: {
      url: 'http://localhost/api/test',
      header: vi.fn(() => null),
      param: vi.fn(() => null),
      ...overrides.req
    },
    env: {
      JWT_SECRET: TEST_SECRET,
      READING_MANAGER_DB: null,
      ...overrides.env
    },
    json: vi.fn((data, status) => ({ data, status })),
    set: vi.fn((key, value) => store.set(key, value)),
    get: vi.fn((key) => store.get(key)),
    res: { status: 200 },
    ...overrides
  };
};

describe('jwtAuthMiddleware', () => {
  describe('public endpoints', () => {
    const publicPaths = [
      '/api/auth/mode',
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/refresh',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
      '/api/health',
      '/api/login'
    ];

    publicPaths.forEach(path => {
      it(`should allow unauthenticated access to ${path}`, async () => {
        const c = createMockContext({
          req: { url: `http://localhost${path}`, header: vi.fn(() => null) }
        });
        const next = vi.fn().mockResolvedValue('next');
        const middleware = jwtAuthMiddleware();

        await middleware(c, next);

        expect(next).toHaveBeenCalled();
        expect(c.json).not.toHaveBeenCalled();
      });
    });
  });

  describe('protected endpoints', () => {
    it('should reject request without JWT_SECRET configured', async () => {
      const c = createMockContext({
        env: { JWT_SECRET: null }
      });
      const next = vi.fn();
      const middleware = jwtAuthMiddleware();

      await middleware(c, next);

      expect(c.json).toHaveBeenCalledWith(
        { error: 'Server authentication not configured' },
        500
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request without Authorization header', async () => {
      const c = createMockContext();
      const next = vi.fn();
      const middleware = jwtAuthMiddleware();

      await middleware(c, next);

      expect(c.json).toHaveBeenCalledWith(
        { error: 'Unauthorized - No token provided' },
        401
      );
    });

    it('should reject non-Bearer auth scheme', async () => {
      const c = createMockContext({
        req: { url: 'http://localhost/api/test', header: vi.fn(() => 'Basic abc') }
      });
      const next = vi.fn();
      const middleware = jwtAuthMiddleware();

      await middleware(c, next);

      expect(c.json).toHaveBeenCalledWith(
        { error: 'Unauthorized - No token provided' },
        401
      );
    });

    it('should reject empty Bearer token', async () => {
      const c = createMockContext({
        req: { url: 'http://localhost/api/test', header: vi.fn(() => 'Bearer ') }
      });
      const next = vi.fn();
      const middleware = jwtAuthMiddleware();

      await middleware(c, next);

      expect(c.json).toHaveBeenCalledWith(
        { error: 'Unauthorized - Empty token' },
        401
      );
    });

    it('should reject invalid JWT token', async () => {
      const c = createMockContext({
        req: { url: 'http://localhost/api/test', header: vi.fn(() => 'Bearer invalid.token.here') }
      });
      const next = vi.fn();
      const middleware = jwtAuthMiddleware();

      await middleware(c, next);

      expect(c.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Unauthorized') }),
        401
      );
    });

    it('should accept valid JWT token and set context', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        org: 'org-456',
        role: 'teacher'
      };
      const token = await createAccessToken(payload, TEST_SECRET);

      const c = createMockContext({
        req: { url: 'http://localhost/api/test', header: vi.fn(() => `Bearer ${token}`) }
      });
      const next = vi.fn().mockResolvedValue('next');
      const middleware = jwtAuthMiddleware();

      await middleware(c, next);

      expect(next).toHaveBeenCalled();
      expect(c.set).toHaveBeenCalledWith('user', expect.objectContaining({ sub: 'user-123' }));
      expect(c.set).toHaveBeenCalledWith('userId', 'user-123');
      expect(c.set).toHaveBeenCalledWith('organizationId', 'org-456');
      expect(c.set).toHaveBeenCalledWith('userRole', 'teacher');
    });

    it('should reject expired JWT token', async () => {
      const payload = { sub: 'user-123', org: 'org-456', role: 'teacher' };
      const token = await createAccessToken(payload, TEST_SECRET, -1000); // expired

      const c = createMockContext({
        req: { url: 'http://localhost/api/test', header: vi.fn(() => `Bearer ${token}`) }
      });
      const next = vi.fn();
      const middleware = jwtAuthMiddleware();

      await middleware(c, next);

      expect(c.json).toHaveBeenCalledWith(
        { error: 'Unauthorized - Token expired' },
        401
      );
    });
  });
});

describe('tenantMiddleware', () => {
  it('should reject request without organization context', async () => {
    const c = createMockContext();
    c.get = vi.fn(() => null);
    const next = vi.fn();
    const middleware = tenantMiddleware();

    await middleware(c, next);

    expect(c.json).toHaveBeenCalledWith(
      { error: 'Organization context required' },
      403
    );
  });

  it('should reject user without org in payload', async () => {
    const c = createMockContext();
    c.get = vi.fn((key) => {
      if (key === 'user') return { sub: 'user-123' }; // no org
      return null;
    });
    const next = vi.fn();
    const middleware = tenantMiddleware();

    await middleware(c, next);

    expect(c.json).toHaveBeenCalledWith(
      { error: 'Organization context required' },
      403
    );
  });

  it('should proceed when user has valid org', async () => {
    const c = createMockContext();
    c.get = vi.fn((key) => {
      if (key === 'user') return { sub: 'user-123', org: 'org-456' };
      return null;
    });
    const next = vi.fn().mockResolvedValue('next');
    const middleware = tenantMiddleware();

    await middleware(c, next);

    expect(next).toHaveBeenCalled();
  });

  it('should check organization exists in database when DB available', async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 'org-456', is_active: true })
    };

    const c = createMockContext({
      env: { JWT_SECRET: TEST_SECRET, READING_MANAGER_DB: mockDb }
    });
    c.get = vi.fn((key) => {
      if (key === 'user') return { sub: 'user-123', org: 'org-456' };
      return null;
    });
    const next = vi.fn().mockResolvedValue('next');
    const middleware = tenantMiddleware();

    await middleware(c, next);

    expect(mockDb.prepare).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should reject inactive organization', async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 'org-456', is_active: false })
    };

    const c = createMockContext({
      env: { JWT_SECRET: TEST_SECRET, READING_MANAGER_DB: mockDb }
    });
    c.get = vi.fn((key) => {
      if (key === 'user') return { sub: 'user-123', org: 'org-456' };
      return null;
    });
    const next = vi.fn();
    const middleware = tenantMiddleware();

    await middleware(c, next);

    expect(c.json).toHaveBeenCalledWith(
      { error: 'Organization is inactive' },
      403
    );
  });

  it('should reject when organization not found', async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null)
    };

    const c = createMockContext({
      env: { JWT_SECRET: TEST_SECRET, READING_MANAGER_DB: mockDb }
    });
    c.get = vi.fn((key) => {
      if (key === 'user') return { sub: 'user-123', org: 'org-456' };
      return null;
    });
    const next = vi.fn();
    const middleware = tenantMiddleware();

    await middleware(c, next);

    expect(c.json).toHaveBeenCalledWith(
      { error: 'Organization not found' },
      404
    );
  });
});

describe('requireRole', () => {
  it('should reject when no role found', async () => {
    const c = createMockContext();
    c.get = vi.fn(() => null);
    const next = vi.fn();
    const middleware = requireRole('teacher');

    await middleware(c, next);

    expect(c.json).toHaveBeenCalledWith(
      { error: 'Unauthorized - No role found' },
      401
    );
  });

  it('should reject insufficient permissions', async () => {
    const c = createMockContext();
    c.get = vi.fn((key) => key === 'userRole' ? 'teacher' : null);
    const next = vi.fn();
    const middleware = requireRole('admin');

    await middleware(c, next);

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Forbidden - Insufficient permissions',
        required: 'admin',
        current: 'teacher'
      }),
      403
    );
  });

  it('should allow sufficient permissions', async () => {
    const c = createMockContext();
    c.get = vi.fn((key) => key === 'userRole' ? 'admin' : null);
    const next = vi.fn().mockResolvedValue('next');
    const middleware = requireRole('teacher');

    await middleware(c, next);

    expect(next).toHaveBeenCalled();
  });

  it('should allow exact role match', async () => {
    const c = createMockContext();
    c.get = vi.fn((key) => key === 'userRole' ? 'teacher' : null);
    const next = vi.fn().mockResolvedValue('next');
    const middleware = requireRole('teacher');

    await middleware(c, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('convenience role middleware', () => {
  it('requireOwner requires owner role', async () => {
    const c = createMockContext();
    c.get = vi.fn((key) => key === 'userRole' ? 'admin' : null);
    const next = vi.fn();

    await requireOwner()(c, next);

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({ required: 'owner' }),
      403
    );
  });

  it('requireAdmin requires admin role', async () => {
    const c = createMockContext();
    c.get = vi.fn((key) => key === 'userRole' ? 'teacher' : null);
    const next = vi.fn();

    await requireAdmin()(c, next);

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({ required: 'admin' }),
      403
    );
  });

  it('requireTeacher requires teacher role', async () => {
    const c = createMockContext();
    c.get = vi.fn((key) => key === 'userRole' ? 'readonly' : null);
    const next = vi.fn();

    await requireTeacher()(c, next);

    expect(c.json).toHaveBeenCalledWith(
      expect.objectContaining({ required: 'teacher' }),
      403
    );
  });

  it('requireReadonly allows all authenticated roles', async () => {
    const c = createMockContext();
    c.get = vi.fn((key) => key === 'userRole' ? 'readonly' : null);
    const next = vi.fn().mockResolvedValue('next');

    await requireReadonly()(c, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('requireOrgOwnership', () => {
  it('should proceed when no resource ID in params', async () => {
    const c = createMockContext({
      req: { url: 'http://localhost/api/test', param: vi.fn(() => null) }
    });
    c.get = vi.fn(() => 'org-123');
    const next = vi.fn().mockResolvedValue('next');
    const middleware = requireOrgOwnership('students');

    await middleware(c, next);

    expect(next).toHaveBeenCalled();
  });

  it('should proceed when no database available', async () => {
    const c = createMockContext({
      req: { url: 'http://localhost/api/test', param: vi.fn(() => 'resource-123') },
      env: { READING_MANAGER_DB: null }
    });
    c.get = vi.fn(() => 'org-123');
    const next = vi.fn().mockResolvedValue('next');
    const middleware = requireOrgOwnership('students');

    await middleware(c, next);

    expect(next).toHaveBeenCalled();
  });

  it('should reject when resource not found', async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null)
    };

    const c = createMockContext({
      req: { url: 'http://localhost/api/test', param: vi.fn(() => 'resource-123') },
      env: { READING_MANAGER_DB: mockDb }
    });
    c.get = vi.fn(() => 'org-123');
    const next = vi.fn();
    const middleware = requireOrgOwnership('students');

    await middleware(c, next);

    expect(c.json).toHaveBeenCalledWith(
      { error: 'Resource not found' },
      404
    );
  });

  it('should reject when resource belongs to different org', async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ organization_id: 'other-org' })
    };

    const c = createMockContext({
      req: { url: 'http://localhost/api/test', param: vi.fn(() => 'resource-123') },
      env: { READING_MANAGER_DB: mockDb }
    });
    c.get = vi.fn(() => 'org-123');
    const next = vi.fn();
    const middleware = requireOrgOwnership('students');

    await middleware(c, next);

    expect(c.json).toHaveBeenCalledWith(
      { error: 'Forbidden - Resource belongs to another organization' },
      403
    );
  });

  it('should allow access when resource belongs to same org', async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ organization_id: 'org-123' })
    };

    const c = createMockContext({
      req: { url: 'http://localhost/api/test', param: vi.fn(() => 'resource-123') },
      env: { READING_MANAGER_DB: mockDb }
    });
    c.get = vi.fn(() => 'org-123');
    const next = vi.fn().mockResolvedValue('next');
    const middleware = requireOrgOwnership('students');

    await middleware(c, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('scopeToOrganization', () => {
  it('should add WHERE clause to query without WHERE', () => {
    const c = createMockContext();
    c.get = vi.fn(() => 'org-123');

    const result = scopeToOrganization(c, 'SELECT * FROM students', []);

    expect(result.query).toBe('SELECT * FROM students WHERE organization_id = ?');
    expect(result.params).toEqual(['org-123']);
  });

  it('should add AND clause to query with existing WHERE', () => {
    const c = createMockContext();
    c.get = vi.fn(() => 'org-123');

    const result = scopeToOrganization(c, 'SELECT * FROM students WHERE active = true', ['param1']);

    expect(result.query).toBe('SELECT * FROM students WHERE active = true AND organization_id = ?');
    expect(result.params).toEqual(['param1', 'org-123']);
  });

  it('should handle case-insensitive WHERE detection', () => {
    const c = createMockContext();
    c.get = vi.fn(() => 'org-123');

    const result = scopeToOrganization(c, 'SELECT * FROM students WHERE id = ?', ['id-1']);

    expect(result.query).toContain('AND organization_id');
  });
});
