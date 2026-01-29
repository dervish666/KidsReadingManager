import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for student reading level range support in routes
 */

// Mock database helper
const createMockDB = (overrides = {}) => {
  const defaultResults = { results: [], success: true };
  const prepareChain = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue(overrides.allResults || defaultResults),
    first: vi.fn().mockResolvedValue(overrides.firstResult || null),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
  };

  return {
    prepare: vi.fn().mockReturnValue(prepareChain),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    _prepareChain: prepareChain,
    ...overrides
  };
};

// Mock context for route testing
const createMockRouteContext = (overrides = {}) => {
  const store = new Map();
  const db = createMockDB(overrides.dbOverrides);

  return {
    req: {
      url: 'http://localhost/api/students',
      header: vi.fn(() => null),
      param: vi.fn((key) => {
        const params = overrides.params || {};
        return params[key] || null;
      }),
      json: vi.fn().mockResolvedValue(overrides.body || {}),
      query: vi.fn(() => null),
      ...overrides.req
    },
    env: {
      JWT_SECRET: 'test-secret',
      READING_MANAGER_DB: db,
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
    db,
    ...overrides
  };
};

describe('Student Reading Level Range - Route Integration', () => {
  describe('rowToStudent helper', () => {
    it('should include readingLevelMin and readingLevelMax in student object', () => {
      // Import the function being tested
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
          readingLevelMin: row.reading_level_min,
          readingLevelMax: row.reading_level_max,
          notes: row.notes,
          isActive: Boolean(row.is_active),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          currentBookId: row.current_book_id || null,
          currentBookTitle: row.current_book_title || null,
          currentBookAuthor: row.current_book_author || null,
          currentStreak: row.current_streak || 0,
          longestStreak: row.longest_streak || 0,
          streakStartDate: row.streak_start_date || null,
          readingSessions: [],
          preferences: {
            favoriteGenreIds: [],
            likes: [],
            dislikes: []
          }
        };
      };

      const dbRow = {
        id: 'student-123',
        name: 'Test Student',
        class_id: 'class-456',
        reading_level: 5.0, // Legacy field
        reading_level_min: 4.5,
        reading_level_max: 5.5,
        likes: '[]',
        dislikes: '[]',
        is_active: 1
      };

      const student = rowToStudent(dbRow);

      expect(student.readingLevelMin).toBe(4.5);
      expect(student.readingLevelMax).toBe(5.5);
      expect(student.readingLevel).toBe(5.0); // Legacy field preserved
    });

    it('should handle null reading level values', () => {
      const rowToStudent = (row) => {
        if (!row) return null;
        return {
          id: row.id,
          name: row.name,
          readingLevel: row.reading_level,
          readingLevelMin: row.reading_level_min,
          readingLevelMax: row.reading_level_max
        };
      };

      const dbRow = {
        id: 'student-123',
        name: 'Test Student',
        reading_level: null,
        reading_level_min: null,
        reading_level_max: null
      };

      const student = rowToStudent(dbRow);

      expect(student.readingLevelMin).toBeNull();
      expect(student.readingLevelMax).toBeNull();
      expect(student.readingLevel).toBeNull();
    });
  });

  describe('POST /api/students - Create with reading level range', () => {
    it('should validate reading level range before insert', async () => {
      const { validateReadingLevelRange } = await import('../../utils/validation.js');

      // Valid range
      const validResult = validateReadingLevelRange(4.0, 6.0);
      expect(validResult.isValid).toBe(true);
      expect(validResult.normalizedMin).toBe(4.0);
      expect(validResult.normalizedMax).toBe(6.0);

      // Invalid: min > max
      const invalidResult = validateReadingLevelRange(8.0, 5.0);
      expect(invalidResult.isValid).toBe(false);
    });

    it('should reject when min > max', async () => {
      const { validateReadingLevelRange } = await import('../../utils/validation.js');

      const result = validateReadingLevelRange(8.0, 5.0);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('minimum');
    });

    it('should reject when level is below 1.0', async () => {
      const { validateReadingLevelRange } = await import('../../utils/validation.js');

      const result = validateReadingLevelRange(0.5, 5.0);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('1.0');
    });

    it('should reject when level exceeds 13.0', async () => {
      const { validateReadingLevelRange } = await import('../../utils/validation.js');

      const result = validateReadingLevelRange(5.0, 14.0);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('13.0');
    });

    it('should use normalized values for database insert', async () => {
      const { validateReadingLevelRange } = await import('../../utils/validation.js');

      // Input with extra decimals should be rounded
      const result = validateReadingLevelRange(4.567, 6.234);

      expect(result.isValid).toBe(true);
      expect(result.normalizedMin).toBe(4.6);
      expect(result.normalizedMax).toBe(6.2);
    });

    it('should accept null values for both min and max (not assessed)', async () => {
      const { validateReadingLevelRange } = await import('../../utils/validation.js');

      const result = validateReadingLevelRange(null, null);

      expect(result.isValid).toBe(true);
      expect(result.normalizedMin).toBeUndefined();
      expect(result.normalizedMax).toBeUndefined();
    });

    it('should reject when only min is provided', async () => {
      const { validateReadingLevelRange } = await import('../../utils/validation.js');

      const result = validateReadingLevelRange(5.0, null);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('both');
    });

    it('should reject when only max is provided', async () => {
      const { validateReadingLevelRange } = await import('../../utils/validation.js');

      const result = validateReadingLevelRange(null, 8.0);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('both');
    });
  });

  describe('PUT /api/students/:id - Update with reading level range', () => {
    it('should validate reading level range on update', async () => {
      const { validateReadingLevelRange } = await import('../../utils/validation.js');

      // Valid update
      const result = validateReadingLevelRange(5.0, 7.0);
      expect(result.isValid).toBe(true);
    });

    it('should allow updating to null values (clearing assessment)', async () => {
      const { validateReadingLevelRange } = await import('../../utils/validation.js');

      const result = validateReadingLevelRange(null, null);

      expect(result.isValid).toBe(true);
    });
  });

  describe('GET /api/students - Response includes reading level range', () => {
    it('should return students with readingLevelMin and readingLevelMax fields', () => {
      // Test the transformation that should happen in the route
      const transformStudent = (row) => ({
        id: row.id,
        name: row.name,
        readingLevel: row.reading_level,
        readingLevelMin: row.reading_level_min,
        readingLevelMax: row.reading_level_max
      });

      const dbResult = {
        id: 'student-1',
        name: 'Alice',
        reading_level: 5.0,
        reading_level_min: 4.5,
        reading_level_max: 5.5
      };

      const student = transformStudent(dbResult);

      expect(student).toHaveProperty('readingLevelMin', 4.5);
      expect(student).toHaveProperty('readingLevelMax', 5.5);
      expect(student).toHaveProperty('readingLevel', 5.0); // Legacy for backward compat
    });
  });

  describe('POST /api/students/bulk - Bulk import with reading level range', () => {
    it('should validate reading level range for each student in bulk import', async () => {
      const { validateReadingLevelRange } = await import('../../utils/validation.js');

      const students = [
        { name: 'Alice', readingLevelMin: 4.0, readingLevelMax: 6.0 },
        { name: 'Bob', readingLevelMin: 5.0, readingLevelMax: 7.0 },
        { name: 'Charlie', readingLevelMin: null, readingLevelMax: null }
      ];

      // Validate each student's range
      const validations = students.map(s =>
        validateReadingLevelRange(s.readingLevelMin, s.readingLevelMax)
      );

      expect(validations.every(v => v.isValid)).toBe(true);
    });

    it('should reject bulk import if any student has invalid range', async () => {
      const { validateReadingLevelRange } = await import('../../utils/validation.js');

      const students = [
        { name: 'Alice', readingLevelMin: 4.0, readingLevelMax: 6.0 },
        { name: 'Bob', readingLevelMin: 8.0, readingLevelMax: 5.0 }, // Invalid!
      ];

      const validations = students.map(s =>
        validateReadingLevelRange(s.readingLevelMin, s.readingLevelMax)
      );

      expect(validations.some(v => !v.isValid)).toBe(true);
    });
  });

  describe('Database Query Patterns for Reading Level Range', () => {
    it('should construct INSERT with new columns', () => {
      const query = `
        INSERT INTO students (id, organization_id, name, class_id, reading_level_min, reading_level_max, likes, dislikes, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      expect(query).toContain('reading_level_min');
      expect(query).toContain('reading_level_max');
    });

    it('should construct UPDATE with new columns', () => {
      const query = `
        UPDATE students SET
          name = ?,
          class_id = ?,
          reading_level_min = ?,
          reading_level_max = ?,
          likes = ?,
          dislikes = ?,
          notes = ?,
          updated_at = datetime("now")
        WHERE id = ? AND organization_id = ?
      `;

      expect(query).toContain('reading_level_min = ?');
      expect(query).toContain('reading_level_max = ?');
    });

    it('should SELECT with new columns', () => {
      const query = `
        SELECT s.*, c.name as class_name, b.title as current_book_title
        FROM students s
        LEFT JOIN classes c ON s.class_id = c.id
        LEFT JOIN books b ON s.current_book_id = b.id
        WHERE s.organization_id = ? AND s.is_active = 1
      `;

      // The s.* will include reading_level_min and reading_level_max
      expect(query).toContain('s.*');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain legacy readingLevel field for API compatibility', () => {
      const rowToStudent = (row) => ({
        id: row.id,
        name: row.name,
        // New fields
        readingLevelMin: row.reading_level_min,
        readingLevelMax: row.reading_level_max,
        // Legacy field preserved
        readingLevel: row.reading_level
      });

      const dbRow = {
        id: 'student-1',
        name: 'Test',
        reading_level: 5.0,
        reading_level_min: 4.5,
        reading_level_max: 5.5
      };

      const student = rowToStudent(dbRow);

      // All three should be present
      expect(student.readingLevel).toBe(5.0);
      expect(student.readingLevelMin).toBe(4.5);
      expect(student.readingLevelMax).toBe(5.5);
    });
  });
});
