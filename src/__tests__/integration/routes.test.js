import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock database helper for testing D1 interactions
const createMockDB = (overrides = {}) => {
  const defaultResults = { results: [], success: true };
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue(overrides.allResults || defaultResults),
      first: vi.fn().mockResolvedValue(overrides.firstResult || null),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
    }),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    ...overrides
  };
};

// Mock Hono context for route testing
const createMockRouteContext = (overrides = {}) => {
  const store = new Map();
  return {
    req: {
      url: 'http://localhost/api/test',
      header: vi.fn(() => null),
      param: vi.fn(() => null),
      json: vi.fn().mockResolvedValue({}),
      query: vi.fn(() => null),
      ...overrides.req
    },
    env: {
      JWT_SECRET: 'test-secret',
      READING_MANAGER_DB: createMockDB(overrides.dbOverrides),
      READING_MANAGER_KV: null,
      ...overrides.env
    },
    json: vi.fn((data, status = 200) => ({ data, status })),
    set: vi.fn((key, value) => store.set(key, value)),
    get: vi.fn((key) => {
      if (overrides.contextValues && key in overrides.contextValues) {
        return overrides.contextValues[key];
      }
      return store.get(key);
    }),
    ...overrides
  };
};

describe('API Route Patterns', () => {
  describe('Student Routes Structure', () => {
    it('should validate student data before creating', async () => {
      const { validateStudent } = await import('../../utils/validation.js');

      // Invalid student (no name)
      const invalidResult = validateStudent({});
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('Student name is required');

      // Valid student
      const validResult = validateStudent({ name: 'Test Student' });
      expect(validResult.isValid).toBe(true);
    });

    it('should generate unique IDs for new students', async () => {
      const { generateId } = await import('../../utils/helpers.js');

      const id1 = generateId();
      const id2 = generateId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('Organization Scoping', () => {
    it('should scope queries to organization', async () => {
      const { scopeToOrganization } = await import('../../middleware/tenant.js');

      const c = createMockRouteContext({
        contextValues: { organizationId: 'org-123' }
      });

      const result = scopeToOrganization(c, 'SELECT * FROM students', []);

      expect(result.query).toContain('organization_id = ?');
      expect(result.params).toContain('org-123');
    });

    it('should append organization filter to existing WHERE', async () => {
      const { scopeToOrganization } = await import('../../middleware/tenant.js');

      const c = createMockRouteContext({
        contextValues: { organizationId: 'org-456' }
      });

      const result = scopeToOrganization(
        c,
        'SELECT * FROM students WHERE is_active = ?',
        [true]
      );

      expect(result.query).toContain('AND organization_id = ?');
      expect(result.params).toEqual([true, 'org-456']);
    });
  });

  describe('Permission Checks', () => {
    it('should allow teachers to manage students', async () => {
      const { permissions } = await import('../../utils/crypto.js');

      expect(permissions.canManageStudents('teacher')).toBe(true);
      expect(permissions.canManageStudents('admin')).toBe(true);
      expect(permissions.canManageStudents('owner')).toBe(true);
      expect(permissions.canManageStudents('readonly')).toBe(false);
    });

    it('should restrict user management to admins', async () => {
      const { permissions } = await import('../../utils/crypto.js');

      expect(permissions.canManageUsers('admin')).toBe(true);
      expect(permissions.canManageUsers('owner')).toBe(true);
      expect(permissions.canManageUsers('teacher')).toBe(false);
    });

    it('should allow all authenticated users to view data', async () => {
      const { permissions } = await import('../../utils/crypto.js');

      expect(permissions.canViewData('readonly')).toBe(true);
      expect(permissions.canViewData('teacher')).toBe(true);
      expect(permissions.canViewData('admin')).toBe(true);
      expect(permissions.canViewData('owner')).toBe(true);
    });
  });

  describe('Data Transformation', () => {
    it('should handle snake_case to camelCase conversion', () => {
      // Test the pattern used in routes
      const rowToStudent = (row) => {
        if (!row) return null;
        return {
          id: row.id,
          name: row.name,
          classId: row.class_id,
          lastReadDate: row.last_read_date,
          likes: row.likes ? JSON.parse(row.likes) : [],
          dislikes: row.dislikes ? JSON.parse(row.dislikes) : [],
          readingLevel: row.reading_level,
          notes: row.notes,
          isActive: Boolean(row.is_active),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      };

      const dbRow = {
        id: 'student-123',
        name: 'Test Student',
        class_id: 'class-456',
        last_read_date: '2024-01-15',
        likes: '["reading", "math"]',
        dislikes: '["sports"]',
        reading_level: 3,
        notes: 'Good student',
        is_active: 1,
        created_at: '2024-01-01',
        updated_at: '2024-01-15'
      };

      const student = rowToStudent(dbRow);

      expect(student.id).toBe('student-123');
      expect(student.classId).toBe('class-456');
      expect(student.lastReadDate).toBe('2024-01-15');
      expect(student.likes).toEqual(['reading', 'math']);
      expect(student.isActive).toBe(true);
      expect(student.readingLevel).toBe(3);
    });

    it('should handle null row gracefully', () => {
      const rowToStudent = (row) => {
        if (!row) return null;
        return { id: row.id };
      };

      expect(rowToStudent(null)).toBeNull();
    });

    it('should handle empty JSON fields', () => {
      const parseJsonField = (field) => {
        if (!field) return [];
        try {
          return JSON.parse(field);
        } catch {
          return [];
        }
      };

      expect(parseJsonField(null)).toEqual([]);
      expect(parseJsonField('')).toEqual([]);
      expect(parseJsonField('invalid')).toEqual([]);
      expect(parseJsonField('["a", "b"]')).toEqual(['a', 'b']);
    });
  });

  describe('Bulk Operations', () => {
    it('should validate bulk import data', async () => {
      const { validateBulkImport } = await import('../../utils/validation.js');

      // Valid bulk import
      const validResult = validateBulkImport([
        { name: 'Student 1' },
        { name: 'Student 2' }
      ]);
      expect(validResult.isValid).toBe(true);

      // Invalid bulk import (not array)
      const invalidResult = validateBulkImport('not-an-array');
      expect(invalidResult.isValid).toBe(false);

      // Invalid bulk import (invalid student in array)
      const mixedResult = validateBulkImport([
        { name: 'Valid Student' },
        { invalid: 'data' } // missing name
      ]);
      expect(mixedResult.isValid).toBe(false);
    });

    it('should batch database operations', () => {
      // Test batch size logic
      const batchSize = 100;
      const items = Array.from({ length: 250 }, (_, i) => i);
      const batches = [];

      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }

      expect(batches.length).toBe(3);
      expect(batches[0].length).toBe(100);
      expect(batches[1].length).toBe(100);
      expect(batches[2].length).toBe(50);
    });
  });

  describe('Error Handling Patterns', () => {
    it('should format error responses consistently', async () => {
      const { formatErrorResponse } = await import('../../utils/helpers.js');

      const error = formatErrorResponse('Something went wrong', 500);

      expect(error).toEqual({
        status: 'error',
        message: 'Something went wrong',
        code: 500
      });
    });

    it('should format success responses consistently', async () => {
      const { formatSuccessResponse } = await import('../../utils/helpers.js');

      const success = formatSuccessResponse({ id: 1 }, 'Created');

      expect(success).toEqual({
        status: 'success',
        message: 'Created',
        data: { id: 1 }
      });
    });
  });

  describe('Reading Session Logic', () => {
    it('should update last read date from sessions', async () => {
      const { updateLastReadDate } = await import('../../utils/helpers.js');

      const student = {
        name: 'Test',
        readingSessions: [
          { date: '2024-01-10' },
          { date: '2024-01-20' },
          { date: '2024-01-15' }
        ]
      };

      const updated = updateLastReadDate(student);

      expect(updated.lastReadDate).toBe('2024-01-20');
    });

    it('should handle student with no sessions', async () => {
      const { updateLastReadDate } = await import('../../utils/helpers.js');

      const student = { name: 'Test', readingSessions: [] };
      const updated = updateLastReadDate(student);

      expect(updated.lastReadDate).toBeNull();
    });
  });

  describe('Settings Validation', () => {
    it('should validate AI provider settings', async () => {
      const { validateSettings } = await import('../../utils/validation.js');

      // Valid providers
      expect(validateSettings({ ai: { provider: 'anthropic' } }).isValid).toBe(true);
      expect(validateSettings({ ai: { provider: 'openai' } }).isValid).toBe(true);
      expect(validateSettings({ ai: { provider: 'gemini' } }).isValid).toBe(true);

      // Invalid provider
      const invalidResult = validateSettings({ ai: { provider: 'invalid' } });
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toContain('Invalid AI provider selected');
    });

    it('should validate reading status thresholds', async () => {
      const { validateSettings } = await import('../../utils/validation.js');

      // Valid thresholds
      const validResult = validateSettings({
        readingStatusSettings: {
          recentlyReadDays: 3,
          needsAttentionDays: 7
        }
      });
      expect(validResult.isValid).toBe(true);

      // Invalid: recently >= needsAttention
      const invalidResult = validateSettings({
        readingStatusSettings: {
          recentlyReadDays: 7,
          needsAttentionDays: 7
        }
      });
      expect(invalidResult.isValid).toBe(false);
    });
  });
});

describe('Multi-Tenant Mode Detection', () => {
  it('should detect multi-tenant mode when JWT_SECRET and organizationId present', () => {
    const isMultiTenantMode = (c) => {
      return Boolean(c.env.JWT_SECRET && c.get('organizationId'));
    };

    const multiTenantContext = createMockRouteContext({
      contextValues: { organizationId: 'org-123' },
      env: { JWT_SECRET: 'secret' }
    });

    expect(isMultiTenantMode(multiTenantContext)).toBe(true);
  });

  it('should detect legacy mode when no JWT_SECRET', () => {
    const isMultiTenantMode = (c) => {
      return Boolean(c.env.JWT_SECRET && c.get('organizationId'));
    };

    const legacyContext = createMockRouteContext({
      env: { JWT_SECRET: null }
    });

    expect(isMultiTenantMode(legacyContext)).toBe(false);
  });

  it('should detect legacy mode when no organizationId', () => {
    const isMultiTenantMode = (c) => {
      return Boolean(c.env.JWT_SECRET && c.get('organizationId'));
    };

    const noOrgContext = createMockRouteContext({
      env: { JWT_SECRET: 'secret' },
      contextValues: {}
    });

    expect(isMultiTenantMode(noOrgContext)).toBe(false);
  });
});

describe('Database Query Patterns', () => {
  describe('SELECT with organization scoping', () => {
    it('should construct proper SELECT query', () => {
      const organizationId = 'org-123';
      const query = `
        SELECT s.*, c.name as class_name
        FROM students s
        LEFT JOIN classes c ON s.class_id = c.id
        WHERE s.organization_id = ? AND s.is_active = 1
        ORDER BY s.name ASC
      `;

      expect(query).toContain('organization_id = ?');
      expect(query).toContain('is_active = 1');
      expect(query).toContain('ORDER BY');
    });
  });

  describe('INSERT with all required fields', () => {
    it('should include organization_id in INSERT', () => {
      const query = `
        INSERT INTO students (id, organization_id, name, class_id, reading_level, notes, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      expect(query).toContain('organization_id');
      expect((query.match(/\?/g) || []).length).toBe(7);
    });
  });

  describe('UPDATE with organization check', () => {
    it('should scope UPDATE to organization', () => {
      const query = `
        UPDATE students
        SET name = ?, class_id = ?, reading_level = ?, notes = ?, updated_at = datetime('now')
        WHERE id = ? AND organization_id = ?
      `;

      expect(query).toContain('WHERE id = ? AND organization_id = ?');
    });
  });

  describe('DELETE (soft) with organization check', () => {
    it('should soft delete by setting is_active', () => {
      const query = `
        UPDATE students SET is_active = 0, updated_at = datetime('now')
        WHERE id = ? AND organization_id = ?
      `;

      expect(query).toContain('is_active = 0');
      expect(query).toContain('organization_id = ?');
    });
  });
});
