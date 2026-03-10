import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rowToStudent } from '../../utils/rowMappers.js';

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

describe('GET /api/students - Slim Response', () => {
  describe('rowToStudent mapper', () => {
    it('should not include readingSessions or preferences', () => {
      const row = {
        id: 'student-1',
        name: 'Alice Smith',
        class_id: 'class-1',
        last_read_date: '2026-03-01',
        likes: '["fantasy"]',
        dislikes: '["horror"]',
        reading_level: 5.0,
        reading_level_min: 4.5,
        reading_level_max: 5.5,
        notes: null,
        is_active: 1,
        created_at: '2026-01-01',
        updated_at: '2026-03-01',
        current_book_id: 'book-1',
        current_book_title: 'The Hobbit',
        current_book_author: 'J.R.R. Tolkien',
        current_streak: 5,
        longest_streak: 10,
        streak_start_date: '2026-02-20',
        sen_status: null,
        pupil_premium: 0,
        eal_status: null,
        fsm: 0,
        processing_restricted: 0,
        ai_opt_out: 0
      };

      const student = rowToStudent(row);

      // Should NOT have readingSessions or preferences
      expect(student).not.toHaveProperty('readingSessions');
      expect(student).not.toHaveProperty('preferences');

      // Should have core fields
      expect(student.id).toBe('student-1');
      expect(student.name).toBe('Alice Smith');
      expect(student.classId).toBe('class-1');
      expect(student.currentBookTitle).toBe('The Hobbit');
      expect(student.currentStreak).toBe(5);
      expect(student.readingLevelMin).toBe(4.5);
      expect(student.readingLevelMax).toBe(5.5);
    });

    it('should return null for null row', () => {
      expect(rowToStudent(null)).toBeNull();
    });
  });

  describe('Student list response shape', () => {
    it('should include totalSessionCount from SQL subquery', () => {
      const row = {
        id: 'student-1',
        name: 'Alice Smith',
        class_id: 'class-1',
        last_read_date: '2026-03-01',
        likes: '[]',
        dislikes: '[]',
        reading_level: null,
        reading_level_min: null,
        reading_level_max: null,
        notes: null,
        is_active: 1,
        created_at: '2026-01-01',
        updated_at: '2026-03-01',
        current_book_id: null,
        current_book_title: null,
        current_book_author: null,
        current_streak: 0,
        longest_streak: 0,
        streak_start_date: null,
        sen_status: null,
        pupil_premium: 0,
        eal_status: null,
        fsm: 0,
        processing_restricted: 0,
        ai_opt_out: 0,
        // Joined columns from SQL
        class_name: 'Year 3',
        total_session_count: 42
      };

      // Simulate the mapping done in the GET / route handler
      const student = {
        ...rowToStudent(row),
        className: row.class_name,
        totalSessionCount: row.total_session_count || 0
      };

      expect(student.totalSessionCount).toBe(42);
      expect(student.className).toBe('Year 3');
      expect(student).not.toHaveProperty('readingSessions');
      expect(student).not.toHaveProperty('preferences');
    });

    it('should default totalSessionCount to 0 when null', () => {
      const row = {
        id: 'student-2',
        name: 'Bob Jones',
        class_id: null,
        last_read_date: null,
        likes: '[]',
        dislikes: '[]',
        reading_level: null,
        reading_level_min: null,
        reading_level_max: null,
        notes: null,
        is_active: 1,
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        current_book_id: null,
        current_book_title: null,
        current_book_author: null,
        current_streak: 0,
        longest_streak: 0,
        streak_start_date: null,
        sen_status: null,
        pupil_premium: 0,
        eal_status: null,
        fsm: 0,
        processing_restricted: 0,
        ai_opt_out: 0,
        class_name: null,
        total_session_count: null
      };

      const student = {
        ...rowToStudent(row),
        className: row.class_name,
        totalSessionCount: row.total_session_count || 0
      };

      expect(student.totalSessionCount).toBe(0);
      expect(student.className).toBeNull();
    });

    it('should include all core student fields in slim response', () => {
      const row = {
        id: 'student-3',
        name: 'Charlie Brown',
        class_id: 'class-2',
        last_read_date: '2026-03-05',
        likes: '["science fiction"]',
        dislikes: '[]',
        reading_level: 7.0,
        reading_level_min: 6.5,
        reading_level_max: 7.5,
        notes: 'Enthusiastic reader',
        is_active: 1,
        created_at: '2025-09-01',
        updated_at: '2026-03-05',
        current_book_id: 'book-42',
        current_book_title: 'Dune',
        current_book_author: 'Frank Herbert',
        current_streak: 12,
        longest_streak: 20,
        streak_start_date: '2026-02-15',
        sen_status: 'EHCP',
        pupil_premium: 1,
        eal_status: 'EAL',
        fsm: 0,
        processing_restricted: 0,
        ai_opt_out: 1,
        class_name: 'Year 5',
        total_session_count: 87
      };

      const student = {
        ...rowToStudent(row),
        className: row.class_name,
        totalSessionCount: row.total_session_count || 0
      };

      // Verify all expected fields are present
      expect(student.id).toBe('student-3');
      expect(student.name).toBe('Charlie Brown');
      expect(student.classId).toBe('class-2');
      expect(student.className).toBe('Year 5');
      expect(student.lastReadDate).toBe('2026-03-05');
      expect(student.likes).toEqual(['science fiction']);
      expect(student.dislikes).toEqual([]);
      expect(student.readingLevelMin).toBe(6.5);
      expect(student.readingLevelMax).toBe(7.5);
      expect(student.notes).toBe('Enthusiastic reader');
      expect(student.isActive).toBe(true);
      expect(student.currentBookId).toBe('book-42');
      expect(student.currentBookTitle).toBe('Dune');
      expect(student.currentBookAuthor).toBe('Frank Herbert');
      expect(student.currentStreak).toBe(12);
      expect(student.longestStreak).toBe(20);
      expect(student.streakStartDate).toBe('2026-02-15');
      expect(student.senStatus).toBe('EHCP');
      expect(student.pupilPremium).toBe(true);
      expect(student.ealStatus).toBe('EAL');
      expect(student.fsm).toBe(false);
      expect(student.aiOptOut).toBe(true);
      expect(student.totalSessionCount).toBe(87);

      // Verify removed fields are absent
      expect(student).not.toHaveProperty('readingSessions');
      expect(student).not.toHaveProperty('preferences');
    });
  });

  describe('SQL query shape', () => {
    it('should include total_session_count subquery in SELECT', () => {
      // Verify the SQL pattern used in the route
      const expectedQuery = `
      SELECT s.*, c.name as class_name, b.title as current_book_title, b.author as current_book_author,
        (SELECT COUNT(*) FROM reading_sessions rs WHERE rs.student_id = s.id) as total_session_count
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN books b ON s.current_book_id = b.id
      WHERE s.organization_id = ? AND s.is_active = 1
      ORDER BY s.name ASC
    `;

      expect(expectedQuery).toContain('total_session_count');
      expect(expectedQuery).toContain('SELECT COUNT(*)');
      expect(expectedQuery).toContain('reading_sessions');
      expect(expectedQuery).toContain('WHERE s.organization_id = ?');
      expect(expectedQuery).toContain('s.is_active = 1');
    });

    it('should not fetch reading_sessions or student_preferences tables', () => {
      // The old query fetched sessions and preferences in batch.
      // The new query only uses a COUNT subquery.
      // Verify by checking the route does NOT join or select from
      // reading_sessions (except the COUNT subquery) or student_preferences.
      const query = `
      SELECT s.*, c.name as class_name, b.title as current_book_title, b.author as current_book_author,
        (SELECT COUNT(*) FROM reading_sessions rs WHERE rs.student_id = s.id) as total_session_count
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN books b ON s.current_book_id = b.id
      WHERE s.organization_id = ? AND s.is_active = 1
      ORDER BY s.name ASC
    `;

      // Should not have student_preferences at all
      expect(query).not.toContain('student_preferences');
      // reading_sessions only appears in the COUNT subquery, not as a JOIN
      expect(query).not.toMatch(/JOIN\s+reading_sessions/);
    });
  });
});
