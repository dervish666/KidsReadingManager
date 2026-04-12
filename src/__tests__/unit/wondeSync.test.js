import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the wondeApi module before imports
vi.mock('../../utils/wondeApi.js', () => ({
  fetchAllStudents: vi.fn(),
  fetchAllClasses: vi.fn(),
  fetchDeletions: vi.fn(),
}));

// Mock classAssignments module
vi.mock('../../utils/classAssignments.js', () => ({
  syncUserClassAssignments: vi.fn().mockResolvedValue(0),
}));

import {
  mapWondeStudent,
  mapWondeClass,
  mapWondeEmployee,
  runFullSync,
} from '../../services/wondeSync.js';

import { fetchAllStudents, fetchAllClasses, fetchDeletions } from '../../utils/wondeApi.js';

import { syncUserClassAssignments } from '../../utils/classAssignments.js';

// ---------------------------------------------------------------------------
// Helper: create a mock D1 database
// ---------------------------------------------------------------------------
function createMockDb() {
  const mockStatement = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
  };

  const db = {
    prepare: vi.fn().mockReturnValue(mockStatement),
    batch: vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]),
    _statement: mockStatement,
  };

  return db;
}

// ---------------------------------------------------------------------------
// mapWondeStudent
// ---------------------------------------------------------------------------
describe('mapWondeStudent', () => {
  it('maps a fully populated Wonde student object', () => {
    const wondeStudent = {
      id: 'A1234567890',
      forename: 'Alice',
      surname: 'Smith',
      education_details: {
        data: {
          current_nc_year: '5',
        },
      },
      extended_details: {
        data: {
          sen_status: 'K',
          pupil_premium: true,
          eal_status: 'E',
          free_school_meals: true,
        },
      },
      classes: {
        data: [{ id: 'CLS_001' }, { id: 'CLS_002' }],
      },
    };

    const result = mapWondeStudent(wondeStudent);

    expect(result).toEqual({
      wondeStudentId: 'A1234567890',
      name: 'Alice Smith',
      yearGroup: '5',
      senStatus: 'K',
      pupilPremium: 1,
      ealStatus: 'E',
      fsm: 1,
      dateOfBirth: null,
      gender: null,
      firstLanguage: null,
      ealDetailedStatus: null,
      wondeClassIds: ['CLS_001', 'CLS_002'],
    });
  });

  it('handles missing education_details and extended_details gracefully', () => {
    const wondeStudent = {
      id: 'B123',
      forename: 'Bob',
      surname: 'Jones',
      classes: { data: [] },
    };

    const result = mapWondeStudent(wondeStudent);

    expect(result.yearGroup).toBeNull();
    expect(result.name).toBe('Bob Jones');
    expect(result.senStatus).toBeNull();
    expect(result.pupilPremium).toBe(0);
    expect(result.ealStatus).toBeNull();
    expect(result.fsm).toBe(0);
  });

  it('handles missing classes gracefully', () => {
    const wondeStudent = {
      id: 'C123',
      forename: 'Charlie',
      surname: 'Brown',
      education_details: { data: { current_nc_year: '3' } },
    };

    const result = mapWondeStudent(wondeStudent);

    expect(result.wondeClassIds).toEqual([]);
    expect(result.yearGroup).toBe('3');
  });

  it('handles completely empty student (only id and name)', () => {
    const wondeStudent = {
      id: 'D123',
      forename: 'Diana',
      surname: 'Lee',
    };

    const result = mapWondeStudent(wondeStudent);

    expect(result).toEqual({
      wondeStudentId: 'D123',
      name: 'Diana Lee',
      yearGroup: null,
      senStatus: null,
      pupilPremium: 0,
      ealStatus: null,
      fsm: 0,
      dateOfBirth: null,
      gender: null,
      firstLanguage: null,
      ealDetailedStatus: null,
      wondeClassIds: [],
    });
  });

  it('handles null nested data fields', () => {
    const wondeStudent = {
      id: 'E123',
      forename: 'Eve',
      surname: 'Green',
      education_details: { data: null },
      extended_details: { data: null },
      classes: { data: null },
    };

    const result = mapWondeStudent(wondeStudent);

    expect(result.yearGroup).toBeNull();
    expect(result.senStatus).toBeNull();
    expect(result.pupilPremium).toBe(0);
    expect(result.ealStatus).toBeNull();
    expect(result.fsm).toBe(0);
    expect(result.wondeClassIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mapWondeClass
// ---------------------------------------------------------------------------
describe('mapWondeClass', () => {
  it('maps a Wonde class object', () => {
    const wondeClass = {
      id: 'CLS_ABC',
      name: 'Year 5 Blue',
    };

    const result = mapWondeClass(wondeClass);

    expect(result).toEqual({
      wondeClassId: 'CLS_ABC',
      name: 'Year 5 Blue',
    });
  });
});

// ---------------------------------------------------------------------------
// mapWondeEmployee
// ---------------------------------------------------------------------------
describe('mapWondeEmployee', () => {
  it('maps a Wonde employee with classes', () => {
    const wondeEmployee = {
      id: 'EMP_001',
      forename: 'Jane',
      surname: 'Teacher',
      classes: {
        data: [{ id: 'CLS_A' }, { id: 'CLS_B' }],
      },
    };

    const result = mapWondeEmployee(wondeEmployee);

    expect(result).toEqual({
      wondeEmployeeId: 'EMP_001',
      name: 'Jane Teacher',
      wondeClassIds: ['CLS_A', 'CLS_B'],
    });
  });

  it('maps a Wonde employee without classes', () => {
    const wondeEmployee = {
      id: 'EMP_002',
      forename: 'John',
      surname: 'Doe',
    };

    const result = mapWondeEmployee(wondeEmployee);

    expect(result).toEqual({
      wondeEmployeeId: 'EMP_002',
      name: 'John Doe',
      wondeClassIds: [],
    });
  });

  it('handles null classes data', () => {
    const wondeEmployee = {
      id: 'EMP_003',
      forename: 'Sue',
      surname: 'Admin',
      classes: { data: null },
    };

    const result = mapWondeEmployee(wondeEmployee);
    expect(result.wondeClassIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// runFullSync
// ---------------------------------------------------------------------------
describe('runFullSync', () => {
  let db;
  const ORG_ID = 'org-123';
  const SCHOOL_TOKEN = 'school-token-abc';
  const WONDE_SCHOOL_ID = 'SCHOOL_X';

  // Sample Wonde API data
  const sampleClasses = [
    {
      id: 'WCLS_1',
      name: 'Year 3 Red',
      employees: { data: [{ id: 'WEMP_1', forename: 'Jane', surname: 'Teacher' }] },
    },
    {
      id: 'WCLS_2',
      name: 'Year 4 Blue',
      employees: { data: [{ id: 'WEMP_1', forename: 'Jane', surname: 'Teacher' }] },
    },
  ];

  const sampleStudents = [
    {
      id: 'WSTU_1',
      forename: 'Alice',
      surname: 'Smith',
      education_details: { data: { current_nc_year: '3' } },
      classes: { data: [{ id: 'WCLS_1' }] },
    },
    {
      id: 'WSTU_2',
      forename: 'Bob',
      surname: 'Jones',
      education_details: { data: { current_nc_year: '4' } },
      classes: { data: [{ id: 'WCLS_2' }] },
    },
  ];

  const sampleDeletions = [];

  beforeEach(() => {
    vi.resetAllMocks();
    db = createMockDb();

    // Default API mocks
    fetchAllClasses.mockResolvedValue(sampleClasses);
    fetchAllStudents.mockResolvedValue(sampleStudents);
    fetchDeletions.mockResolvedValue(sampleDeletions);

    // Mock crypto.randomUUID
    let uuidCounter = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      uuidCounter++;
      return `uuid-${uuidCounter}`;
    });
  });

  it('creates a sync log entry with status running', async () => {
    await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    // First db.prepare call should be the sync log INSERT
    const firstPrepareCall = db.prepare.mock.calls[0][0];
    expect(firstPrepareCall).toMatch(/INSERT INTO wonde_sync_log/i);
    expect(firstPrepareCall).toMatch(/running/i);
  });

  it('calls all three Wonde API endpoints', async () => {
    // Batch-fetch for existing classes returns empty
    db.prepare = vi.fn().mockImplementation((sql) => ({
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue({ results: [] }),
    }));
    db.batch = vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]);

    await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(fetchAllClasses).toHaveBeenCalledWith(SCHOOL_TOKEN, WONDE_SCHOOL_ID, expect.any(Object));
    expect(fetchAllStudents).toHaveBeenCalledWith(
      SCHOOL_TOKEN,
      WONDE_SCHOOL_ID,
      expect.any(Object)
    );
    expect(fetchDeletions).toHaveBeenCalledWith(SCHOOL_TOKEN, WONDE_SCHOOL_ID, undefined);
  });

  it('upserts classes (creates new, updates existing)', async () => {
    // Existing classes batch-fetch returns one match for WCLS_2
    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('SELECT') && sql.includes('classes') && sql.includes('organization_id')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: [{ wonde_class_id: 'WCLS_2', id: 'existing-class-id', name: 'Old Name' }],
          }),
        };
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });
    db.batch = vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]);

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(result.classesCreated).toBe(1);
    expect(result.classesUpdated).toBe(1);
  });

  it('upserts students (creates new, updates existing)', async () => {
    // Existing students batch-fetch: WSTU_2 exists
    db.prepare = vi.fn().mockImplementation((sql) => {
      if (
        sql.includes('SELECT') &&
        sql.includes('classes') &&
        sql.includes('organization_id') &&
        !sql.includes('wonde_class_id')
      ) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        };
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });

    // db.batch is called multiple times:
    // 1. Class upserts (no classes match -> all created)
    // 2. Student + erased batch-fetch
    // 3. Student upserts
    // 4. Employee inserts
    db.batch = vi
      .fn()
      .mockResolvedValueOnce([{ success: true }]) // class upserts
      .mockResolvedValueOnce([
        // student + erased batch-fetch
        { results: [{ wonde_student_id: 'WSTU_2', id: 'existing-student-id' }], success: true },
        { results: [], success: true },
      ])
      .mockResolvedValueOnce([{ success: true }]) // student upserts
      .mockResolvedValue([{ success: true }]); // remaining batches

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(result.studentsCreated).toBe(1);
    expect(result.studentsUpdated).toBe(1);
  });

  it('handles employee class mappings', async () => {
    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('DELETE FROM wonde_employee_classes')) {
        return {
          bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({ success: true }) }),
        };
      }
      if (sql.includes('INSERT INTO wonde_employee_classes')) {
        return { bind: vi.fn().mockReturnThis() };
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });
    db.batch = vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]);

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    // DELETE runs standalone, then INSERTs are batched separately
    const deleteCall = db.prepare.mock.calls.find((call) =>
      call[0].includes('DELETE FROM wonde_employee_classes')
    );
    expect(deleteCall).toBeDefined();
    expect(result.employeesSynced).toBe(1);
  });

  it('handles student deletions (deactivates students)', async () => {
    fetchDeletions.mockResolvedValue([
      { id: 'WSTU_DEL_1', restored_at: null },
      { id: 'WSTU_DEL_2', restored_at: '2026-02-20T10:00:00Z' }, // restored, should skip
    ]);

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('UPDATE students') && sql.includes('is_active = 0')) {
        return { bind: vi.fn().mockReturnThis() };
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });
    db.batch = vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]);

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    // Only 1 deactivation (WSTU_DEL_2 has restored_at so skipped)
    // Deactivations are now batched via db.batch()
    expect(result.studentsDeactivated).toBe(1);
  });

  it('updates organizations.wonde_last_sync_at', async () => {
    const updateOrgStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('UPDATE organizations') && sql.includes('wonde_last_sync_at')) {
        return updateOrgStatement;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });
    db.batch = vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]);

    await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(updateOrgStatement.bind).toHaveBeenCalled();
    expect(updateOrgStatement.run).toHaveBeenCalled();
  });

  it('updates sync log with completed status and counts', async () => {
    const syncLogUpdateStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('UPDATE wonde_sync_log') && sql.includes('completed')) {
        return syncLogUpdateStatement;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });
    db.batch = vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]);

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(result.status).toBe('completed');
    expect(syncLogUpdateStatement.run).toHaveBeenCalled();
  });

  it('returns result object with correct shape', async () => {
    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('syncId');
    expect(result).toHaveProperty('studentsCreated');
    expect(result).toHaveProperty('studentsUpdated');
    expect(result).toHaveProperty('studentsDeactivated');
    expect(result).toHaveProperty('classesCreated');
    expect(result).toHaveProperty('classesUpdated');
    expect(result).toHaveProperty('employeesSynced');
  });

  it('handles API error with failed status and error message', async () => {
    fetchAllClasses.mockRejectedValue(new Error('Wonde API error: 500 Internal Server Error'));

    const syncLogUpdateStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('UPDATE wonde_sync_log') && sql.includes('failed')) {
        return syncLogUpdateStatement;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('500');
    expect(syncLogUpdateStatement.run).toHaveBeenCalled();
  });

  it('passes updatedAfter to all fetch functions for delta sync', async () => {
    const updatedAfter = '2026-02-20T00:00:00Z';
    db.batch = vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]);

    await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db, { updatedAfter });

    expect(fetchAllClasses).toHaveBeenCalledWith(
      SCHOOL_TOKEN,
      WONDE_SCHOOL_ID,
      expect.objectContaining({ updatedAfter })
    );
    expect(fetchAllStudents).toHaveBeenCalledWith(
      SCHOOL_TOKEN,
      WONDE_SCHOOL_ID,
      expect.objectContaining({ updatedAfter })
    );
    expect(fetchDeletions).toHaveBeenCalledWith(SCHOOL_TOKEN, WONDE_SCHOOL_ID, updatedAfter);
  });

  it('sets sync_type to full when no updatedAfter', async () => {
    const syncLogInsertStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('INSERT INTO wonde_sync_log')) {
        return syncLogInsertStatement;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });

    await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    // The bind call should include 'full' as sync type
    const bindArgs = syncLogInsertStatement.bind.mock.calls[0];
    expect(bindArgs).toContain('full');
  });

  it('sets sync_type to delta when updatedAfter is provided', async () => {
    const syncLogInsertStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('INSERT INTO wonde_sync_log')) {
        return syncLogInsertStatement;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });

    await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db, {
      updatedAfter: '2026-02-20T00:00:00Z',
    });

    const bindArgs = syncLogInsertStatement.bind.mock.calls[0];
    expect(bindArgs).toContain('delta');
  });

  it('handles empty API responses gracefully', async () => {
    fetchAllClasses.mockResolvedValue([]);
    fetchAllStudents.mockResolvedValue([]);
    fetchDeletions.mockResolvedValue([]);
    db.batch = vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]);

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(result.status).toBe('completed');
    expect(result.classesCreated).toBe(0);
    expect(result.classesUpdated).toBe(0);
    expect(result.studentsCreated).toBe(0);
    expect(result.studentsUpdated).toBe(0);
    expect(result.studentsDeactivated).toBe(0);
    expect(result.employeesSynced).toBe(0);
  });

  it('assigns class_id from first wondeClassId via lookup map', async () => {
    // Existing classes batch-fetch returns empty (all classes will be created)
    db.prepare = vi.fn().mockImplementation((sql) => ({
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue({ results: [] }),
    }));

    // Track the student INSERT statements passed to db.batch
    const batchCalls = [];
    db.batch = vi.fn().mockImplementation((statements) => {
      batchCalls.push(statements);
      return Promise.resolve((statements || []).map(() => ({ results: [], success: true })));
    });

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    // Both students should be created (no existing matches)
    expect(result.studentsCreated).toBe(2);
    expect(result.classesCreated).toBe(2);
  });

  it('handles student error during sync without crashing', async () => {
    fetchAllStudents.mockRejectedValue(new Error('Student fetch failed'));
    db.batch = vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]);

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('Student fetch failed');
  });

  it('refreshes class_assignments for users with wonde_employee_id after employee sync', async () => {
    const usersWithWondeResults = [
      { id: 'user-1', wonde_employee_id: 'WEMP_1' },
      { id: 'user-2', wonde_employee_id: 'WEMP_2' },
    ];

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('SELECT id, wonde_employee_id FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: usersWithWondeResults }),
        };
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });
    db.batch = vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]);

    syncUserClassAssignments.mockResolvedValue(2);

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(result.status).toBe('completed');
    expect(syncUserClassAssignments).toHaveBeenCalledTimes(2);
    expect(syncUserClassAssignments).toHaveBeenCalledWith(db, 'user-1', 'WEMP_1', ORG_ID);
    expect(syncUserClassAssignments).toHaveBeenCalledWith(db, 'user-2', 'WEMP_2', ORG_ID);
  });

  it('queries users with wonde_employee_id during sync', async () => {
    const preparedStatements = [];
    db.prepare = vi.fn().mockImplementation((sql) => {
      preparedStatements.push(sql);
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });
    db.batch = vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]);

    await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    const userQuery = preparedStatements.find(
      (sql) =>
        sql.includes('SELECT id, wonde_employee_id FROM users') &&
        sql.includes('wonde_employee_id IS NOT NULL') &&
        sql.includes('is_active = 1')
    );
    expect(userQuery).toBeDefined();
  });

  it('continues sync even if syncUserClassAssignments throws for one user', async () => {
    const usersWithWondeResults = [
      { id: 'user-fail', wonde_employee_id: 'WEMP_FAIL' },
      { id: 'user-ok', wonde_employee_id: 'WEMP_OK' },
    ];

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('SELECT id, wonde_employee_id FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: usersWithWondeResults }),
        };
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });
    db.batch = vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]);

    syncUserClassAssignments
      .mockRejectedValueOnce(new Error('DB constraint error'))
      .mockResolvedValueOnce(1);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    // Sync should still complete successfully
    expect(result.status).toBe('completed');
    // Both users should have been attempted
    expect(syncUserClassAssignments).toHaveBeenCalledTimes(2);
    // Warning should have been logged for the failed user
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('user-fail'),
      expect.stringContaining('DB constraint error')
    );

    warnSpy.mockRestore();
  });

  it('skips class assignment refresh when no users have wonde_employee_id', async () => {
    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('SELECT id, wonde_employee_id FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        };
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    });
    db.batch = vi.fn().mockResolvedValue([
      { results: [], success: true },
      { results: [], success: true },
    ]);

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(result.status).toBe('completed');
    expect(syncUserClassAssignments).not.toHaveBeenCalled();
  });
});
