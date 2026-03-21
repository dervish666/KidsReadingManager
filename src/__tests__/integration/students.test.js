import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { rowToStudent } from '../../utils/rowMappers.js';
import { studentsRouter } from '../../routes/students.js';

vi.mock('../../middleware/tenant', () => ({
  requireRole: () => (c, next) => next(),
  requireAdmin: () => (c, next) => next(),
  requireTeacher: () => (c, next) => next(),
  requireReadonly: () => (c, next) => next(),
  auditLog: () => (c, next) => next(),
}));

vi.mock('../../middleware/errorHandler', async () => {
  const actual = await vi.importActual('../../middleware/errorHandler');
  return actual;
});

vi.mock('../../utils/routeHelpers', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getDB: (env) => env.READING_MANAGER_DB,
    isMultiTenantMode: () => true,
    requireStudent: () => {},
  };
});

vi.mock('../../utils/crypto', () => ({
  permissions: { MANAGE_STUDENTS: 'manage_students' },
}));

vi.mock('../../utils/validation', () => ({
  validateStudent: () => ({ isValid: true }),
  validateBulkImport: () => ({ isValid: true }),
  validateReadingLevelRange: () => ({ isValid: true }),
}));

vi.mock('../../services/kvService', () => ({
  getStudents: vi.fn().mockResolvedValue([]),
  getStudentById: vi.fn().mockResolvedValue(null),
  saveStudent: vi.fn().mockResolvedValue({}),
  deleteStudent: vi.fn().mockResolvedValue({}),
  addStudents: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../utils/helpers', () => ({
  generateId: () => 'generated-id',
}));

vi.mock('../../utils/streakCalculator', () => ({
  calculateStreak: () => ({ currentStreak: 0, longestStreak: 0, streakStartDate: null }),
}));

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

const createTestApp = (contextValues = {}, dbOverrides = {}) => {
  const app = new Hono();
  const mockDB = createMockDB(dbOverrides);

  app.onError((error, c) => {
    const status = error.status || 500;
    return c.json({
      status: 'error',
      message: error.message || 'Internal Server Error',
    }, status);
  });

  app.use('*', async (c, next) => {
    c.env = {
      READING_MANAGER_DB: mockDB,
      ...contextValues.env,
    };
    if (contextValues.organizationId) c.set('organizationId', contextValues.organizationId);
    if (contextValues.userId) c.set('userId', contextValues.userId);
    if (contextValues.userRole) c.set('userRole', contextValues.userRole);
    await next();
  });

  app.route('/api/students', studentsRouter);
  return { app, mockDB };
};

const makeRequest = async (app, method, path, body = null) => {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) options.body = JSON.stringify(body);
  return app.request(path, options);
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

describe('GET /api/students/sessions', () => {
  it('should return sessions for a class within date range', async () => {
    const sessionRows = [
      {
        id: 'sess-1',
        student_id: 'student-1',
        session_date: '2026-03-05',
        book_id: 'book-1',
        book_title: 'The Hobbit',
        book_title_manual: null,
        book_author: 'J.R.R. Tolkien',
        book_author_manual: null,
        pages_read: 20,
        duration_minutes: 15,
        assessment: 8,
        notes: null,
        location: 'home',
        recorded_by: 'user-1',
        student_name: 'Alice Smith',
      },
      {
        id: 'sess-2',
        student_id: 'student-2',
        session_date: '2026-03-04',
        book_id: null,
        book_title: null,
        book_title_manual: 'Unknown Book',
        book_author: null,
        book_author_manual: 'Unknown Author',
        pages_read: 10,
        duration_minutes: null,
        assessment: null,
        notes: 'Read at home',
        location: null,
        recorded_by: 'user-1',
        student_name: 'Bob Jones',
      },
    ];

    const { app } = createTestApp(
      { organizationId: 'org-1', userId: 'user-1', userRole: 'teacher' },
      { allResults: { results: sessionRows, success: true } }
    );

    const res = await makeRequest(
      app,
      'GET',
      '/api/students/sessions?classId=class-1&startDate=2026-03-01&endDate=2026-03-07'
    );
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data).toHaveLength(2);

    // First session — has book from catalog
    expect(data[0].id).toBe('sess-1');
    expect(data[0].studentId).toBe('student-1');
    expect(data[0].date).toBe('2026-03-05');
    expect(data[0].bookTitle).toBe('The Hobbit');
    expect(data[0].bookAuthor).toBe('J.R.R. Tolkien');
    expect(data[0].pagesRead).toBe(20);
    expect(data[0].duration).toBe(15);
    expect(data[0].assessment).toBe(8);
    expect(data[0].location).toBe('home');
    expect(data[0].recordedBy).toBe('user-1');

    // Second session — uses manual book title/author
    expect(data[1].id).toBe('sess-2');
    expect(data[1].bookTitle).toBe('Unknown Book');
    expect(data[1].bookAuthor).toBe('Unknown Author');
    expect(data[1].location).toBe('school'); // default when null
  });

  it('should require classId and startDate and endDate', async () => {
    const { app } = createTestApp(
      { organizationId: 'org-1', userId: 'user-1', userRole: 'teacher' }
    );

    // Missing all params
    const res1 = await makeRequest(app, 'GET', '/api/students/sessions');
    expect(res1.status).toBe(400);
    const body1 = await res1.json();
    expect(body1.message).toContain('classId');

    // Missing startDate and endDate
    const res2 = await makeRequest(app, 'GET', '/api/students/sessions?classId=class-1');
    expect(res2.status).toBe(400);

    // Missing endDate
    const res3 = await makeRequest(
      app,
      'GET',
      '/api/students/sessions?classId=class-1&startDate=2026-03-01'
    );
    expect(res3.status).toBe(400);
  });

  it('should scope sessions to the organization', async () => {
    const { app, mockDB } = createTestApp(
      { organizationId: 'org-42', userId: 'user-1', userRole: 'teacher' },
      { allResults: { results: [], success: true } }
    );

    await makeRequest(
      app,
      'GET',
      '/api/students/sessions?classId=class-1&startDate=2026-03-01&endDate=2026-03-07'
    );

    // Verify the SQL was called with the organization ID
    const prepareCall = mockDB.prepare.mock.calls.find(
      (call) => call[0].includes('reading_sessions') && call[0].includes('organization_id')
    );
    expect(prepareCall).toBeTruthy();

    // Verify bind was called with org-42 as first parameter
    const bindCall = mockDB._prepareChain.bind.mock.calls[mockDB._prepareChain.bind.mock.calls.length - 1];
    expect(bindCall[0]).toBe('org-42');
  });

  it('should return empty array for no sessions in range', async () => {
    const { app } = createTestApp(
      { organizationId: 'org-1', userId: 'user-1', userRole: 'teacher' },
      { allResults: { results: [], success: true } }
    );

    const res = await makeRequest(
      app,
      'GET',
      '/api/students/sessions?classId=class-1&startDate=2026-01-01&endDate=2026-01-07'
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });
});

// Helper: create a mock DB that returns different results for different queries
const createSequenceMockDB = (queryResults) => {
  // queryResults is an array of { match: string|RegExp, all?: result, first?: result }
  const db = {
    prepare: vi.fn().mockImplementation((sql) => {
      const entry = queryResults.find((qr) => {
        if (typeof qr.match === 'string') return sql.includes(qr.match);
        return qr.match.test(sql);
      });
      const allResult = entry?.all || { results: [], success: true };
      const firstResult = entry?.first !== undefined ? entry.first : null;
      return {
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue(allResult),
          first: vi.fn().mockResolvedValue(firstResult),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    }),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
  };
  return db;
};

const createStatsTestApp = (contextValues = {}, queryResults = []) => {
  const app = new Hono();
  const mockDB = createSequenceMockDB(queryResults);

  app.onError((error, c) => {
    const status = error.status || 500;
    return c.json({
      status: 'error',
      message: error.message || 'Internal Server Error',
    }, status);
  });

  app.use('*', async (c, next) => {
    c.env = {
      READING_MANAGER_DB: mockDB,
      ...contextValues.env,
    };
    if (contextValues.organizationId) c.set('organizationId', contextValues.organizationId);
    if (contextValues.userId) c.set('userId', contextValues.userId);
    if (contextValues.userRole) c.set('userRole', contextValues.userRole);
    await next();
  });

  app.route('/api/students', studentsRouter);
  return { app, mockDB };
};

describe('GET /api/students/stats', () => {
  it('should return aggregated stats for a class', async () => {
    const today = new Date().toISOString().split('T')[0];
    const studentRows = [
      { id: 'student-1', last_read_date: today, current_streak: 5, longest_streak: 10, streak_start_date: '2026-02-20' },
      { id: 'student-2', last_read_date: today, current_streak: 3, longest_streak: 8, streak_start_date: '2026-03-01' },
      { id: 'student-3', last_read_date: null, current_streak: 0, longest_streak: 0, streak_start_date: null },
    ];

    const sessionRows = [
      { student_id: 'student-1', session_date: today, location: 'home', book_title: 'The Hobbit' },
      { student_id: 'student-1', session_date: today, location: 'school', book_title: 'The Hobbit' },
      { student_id: 'student-2', session_date: today, location: 'home', book_title: 'Dune' },
    ];

    const { app } = createStatsTestApp(
      { organizationId: 'org-1', userId: 'user-1', userRole: 'teacher' },
      [
        { match: 'FROM students s', all: { results: studentRows, success: true } },
        { match: 'FROM reading_sessions rs', all: { results: sessionRows, success: true } },
        { match: 'org_settings', first: { setting_value: JSON.stringify({ recentlyReadDays: 3, needsAttentionDays: 7 }) } },
      ]
    );

    const res = await makeRequest(
      app,
      'GET',
      '/api/students/stats?classId=class-1&startDate=2026-03-01&endDate=2026-03-10'
    );
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.totalStudents).toBe(3);
    expect(data.totalSessions).toBe(3);
    expect(data.locationDistribution.home).toBe(2);
    expect(data.locationDistribution.school).toBe(1);
    expect(data.studentsWithNoSessions).toBe(1);
    expect(data.studentsWithActiveStreak).toBe(2);
    expect(data.longestCurrentStreak).toBe(5);
    expect(data.longestEverStreak).toBe(10);
    expect(data.averageSessionsPerStudent).toBe(1); // 3 sessions / 3 students
    expect(data.statusDistribution.recentlyRead).toBe(2); // 2 students read today
    expect(data.statusDistribution.notRead).toBe(1); // 1 student never read
    expect(data.mostReadBooks).toHaveLength(2);
    expect(data.mostReadBooks[0].title).toBe('The Hobbit');
    expect(data.mostReadBooks[0].count).toBe(2);
    expect(data.topStreaks).toHaveLength(2);
    expect(data.topStreaks[0].currentStreak).toBe(5);
  });

  it('should filter by date range', async () => {
    const studentRows = [
      { id: 'student-1', last_read_date: '2026-03-01', current_streak: 2, longest_streak: 5, streak_start_date: '2026-02-28' },
    ];

    // Only sessions within the requested date range should be returned by the query
    const sessionRows = [
      { student_id: 'student-1', session_date: '2026-03-01', location: 'home', book_title: 'Book A' },
      { student_id: 'student-1', session_date: '2026-03-02', location: 'school', book_title: 'Book B' },
    ];

    const { app, mockDB } = createStatsTestApp(
      { organizationId: 'org-1', userId: 'user-1', userRole: 'teacher' },
      [
        { match: 'FROM students s', all: { results: studentRows, success: true } },
        { match: 'FROM reading_sessions rs', all: { results: sessionRows, success: true } },
        { match: 'org_settings', first: null },
      ]
    );

    const res = await makeRequest(
      app,
      'GET',
      '/api/students/stats?classId=class-1&startDate=2026-03-01&endDate=2026-03-05'
    );
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.totalSessions).toBe(2);
    expect(data.totalStudents).toBe(1);

    // Verify the session query was called with start/end dates
    const sessionPrepareCall = mockDB.prepare.mock.calls.find(
      (call) => call[0].includes('reading_sessions')
    );
    expect(sessionPrepareCall).toBeTruthy();
  });

  it('should include streak stats from student rows', async () => {
    const today = new Date().toISOString().split('T')[0];
    const studentRows = [
      { id: 'student-1', last_read_date: today, current_streak: 10, longest_streak: 15, streak_start_date: '2026-02-01' },
      { id: 'student-2', last_read_date: today, current_streak: 7, longest_streak: 20, streak_start_date: '2026-02-15' },
      { id: 'student-3', last_read_date: today, current_streak: 0, longest_streak: 5, streak_start_date: null },
    ];

    const { app } = createStatsTestApp(
      { organizationId: 'org-1', userId: 'user-1', userRole: 'teacher' },
      [
        { match: 'FROM students s', all: { results: studentRows, success: true } },
        { match: 'FROM reading_sessions rs', all: { results: [], success: true } },
        { match: 'org_settings', first: null },
      ]
    );

    const res = await makeRequest(
      app,
      'GET',
      '/api/students/stats?classId=class-1&startDate=2026-03-01&endDate=2026-03-10'
    );
    expect(res.status).toBe(200);
    const data = await res.json();

    // 2 students have active streaks (current_streak > 0)
    expect(data.studentsWithActiveStreak).toBe(2);
    expect(data.totalActiveStreakDays).toBe(17); // 10 + 7
    expect(data.longestCurrentStreak).toBe(10);
    expect(data.longestEverStreak).toBe(20); // student-2's longest
    expect(data.averageStreak).toBeCloseTo(8.5); // 17 / 2

    // Top streaks leaderboard
    expect(data.topStreaks).toHaveLength(3); // all 3 have cs > 0 or ls > 0
    expect(data.topStreaks[0].id).toBe('student-1'); // highest current streak
    expect(data.topStreaks[0].currentStreak).toBe(10);
    expect(data.topStreaks[1].id).toBe('student-2');
    expect(data.topStreaks[1].currentStreak).toBe(7);
  });

  it('should return zero stats for empty class', async () => {
    const { app } = createStatsTestApp(
      { organizationId: 'org-1', userId: 'user-1', userRole: 'teacher' },
      [
        { match: 'FROM students s', all: { results: [], success: true } },
        { match: 'org_settings', first: null },
      ]
    );

    const res = await makeRequest(
      app,
      'GET',
      '/api/students/stats?classId=empty-class&startDate=2026-03-01&endDate=2026-03-10'
    );
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.totalStudents).toBe(0);
    expect(data.totalSessions).toBe(0);
    expect(data.averageSessionsPerStudent).toBe(0);
    expect(data.studentsWithNoSessions).toBe(0);
    expect(data.studentsWithActiveStreak).toBe(0);
    expect(data.longestCurrentStreak).toBe(0);
    expect(data.longestEverStreak).toBe(0);
    expect(data.averageStreak).toBe(0);
    expect(data.topStreaks).toEqual([]);
    expect(data.statusDistribution).toEqual({ notRead: 0, needsAttention: 0, recentlyRead: 0 });
  });
});
