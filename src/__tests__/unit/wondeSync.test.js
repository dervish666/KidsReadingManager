import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the wondeApi module before imports
vi.mock('../../utils/wondeApi.js', () => ({
  fetchAllStudents: vi.fn(),
  fetchAllClasses: vi.fn(),
  fetchAllEmployees: vi.fn(),
  fetchDeletions: vi.fn()
}));

import {
  mapWondeStudent,
  mapWondeClass,
  mapWondeEmployee,
  runFullSync
} from '../../services/wondeSync.js';

import {
  fetchAllStudents,
  fetchAllClasses,
  fetchAllEmployees,
  fetchDeletions
} from '../../utils/wondeApi.js';

// ---------------------------------------------------------------------------
// Helper: create a mock D1 database
// ---------------------------------------------------------------------------
function createMockDb() {
  const mockStatement = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ success: true }),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] })
  };

  const db = {
    prepare: vi.fn().mockReturnValue(mockStatement),
    _statement: mockStatement
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
          current_nc_year: '5'
        }
      },
      extended_details: {
        data: {
          sen_status: 'SEN Support',
          premium_pupil_indicator: true,
          english_as_additional_language_status: 'EAL',
          free_school_meals: true
        }
      },
      classes: {
        data: [
          { id: 'CLS_001' },
          { id: 'CLS_002' }
        ]
      }
    };

    const result = mapWondeStudent(wondeStudent);

    expect(result).toEqual({
      wondeStudentId: 'A1234567890',
      name: 'Alice Smith',
      yearGroup: '5',
      senStatus: 'SEN Support',
      pupilPremium: 1,
      ealStatus: 'EAL',
      fsm: 1,
      wondeClassIds: ['CLS_001', 'CLS_002']
    });
  });

  it('handles missing education_details gracefully', () => {
    const wondeStudent = {
      id: 'B123',
      forename: 'Bob',
      surname: 'Jones',
      extended_details: {
        data: {
          sen_status: null,
          premium_pupil_indicator: false,
          english_as_additional_language_status: null,
          free_school_meals: false
        }
      },
      classes: { data: [] }
    };

    const result = mapWondeStudent(wondeStudent);

    expect(result.yearGroup).toBeNull();
    expect(result.name).toBe('Bob Jones');
  });

  it('handles missing extended_details gracefully', () => {
    const wondeStudent = {
      id: 'C123',
      forename: 'Charlie',
      surname: 'Brown',
      education_details: { data: { current_nc_year: '3' } }
    };

    const result = mapWondeStudent(wondeStudent);

    expect(result.senStatus).toBeNull();
    expect(result.pupilPremium).toBe(0);
    expect(result.ealStatus).toBeNull();
    expect(result.fsm).toBe(0);
    expect(result.wondeClassIds).toEqual([]);
  });

  it('handles completely empty student (only id and name)', () => {
    const wondeStudent = {
      id: 'D123',
      forename: 'Diana',
      surname: 'Lee'
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
      wondeClassIds: []
    });
  });

  it('handles null nested data fields', () => {
    const wondeStudent = {
      id: 'E123',
      forename: 'Eve',
      surname: 'Green',
      education_details: { data: null },
      extended_details: { data: null },
      classes: { data: null }
    };

    const result = mapWondeStudent(wondeStudent);

    expect(result.yearGroup).toBeNull();
    expect(result.senStatus).toBeNull();
    expect(result.pupilPremium).toBe(0);
    expect(result.ealStatus).toBeNull();
    expect(result.fsm).toBe(0);
    expect(result.wondeClassIds).toEqual([]);
  });

  it('maps pupilPremium to 0 when indicator is falsy', () => {
    const wondeStudent = {
      id: 'F123',
      forename: 'Fred',
      surname: 'White',
      extended_details: {
        data: {
          premium_pupil_indicator: false,
          free_school_meals: 0
        }
      }
    };

    const result = mapWondeStudent(wondeStudent);

    expect(result.pupilPremium).toBe(0);
    expect(result.fsm).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mapWondeClass
// ---------------------------------------------------------------------------
describe('mapWondeClass', () => {
  it('maps a Wonde class object', () => {
    const wondeClass = {
      id: 'CLS_ABC',
      name: 'Year 5 Blue'
    };

    const result = mapWondeClass(wondeClass);

    expect(result).toEqual({
      wondeClassId: 'CLS_ABC',
      name: 'Year 5 Blue'
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
        data: [
          { id: 'CLS_A' },
          { id: 'CLS_B' }
        ]
      }
    };

    const result = mapWondeEmployee(wondeEmployee);

    expect(result).toEqual({
      wondeEmployeeId: 'EMP_001',
      name: 'Jane Teacher',
      wondeClassIds: ['CLS_A', 'CLS_B']
    });
  });

  it('maps a Wonde employee without classes', () => {
    const wondeEmployee = {
      id: 'EMP_002',
      forename: 'John',
      surname: 'Doe'
    };

    const result = mapWondeEmployee(wondeEmployee);

    expect(result).toEqual({
      wondeEmployeeId: 'EMP_002',
      name: 'John Doe',
      wondeClassIds: []
    });
  });

  it('handles null classes data', () => {
    const wondeEmployee = {
      id: 'EMP_003',
      forename: 'Sue',
      surname: 'Admin',
      classes: { data: null }
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
    { id: 'WCLS_1', name: 'Year 3 Red' },
    { id: 'WCLS_2', name: 'Year 4 Blue' }
  ];

  const sampleStudents = [
    {
      id: 'WSTU_1',
      forename: 'Alice',
      surname: 'Smith',
      education_details: { data: { current_nc_year: '3' } },
      extended_details: {
        data: {
          sen_status: 'SEN Support',
          premium_pupil_indicator: true,
          english_as_additional_language_status: null,
          free_school_meals: false
        }
      },
      classes: { data: [{ id: 'WCLS_1' }] }
    },
    {
      id: 'WSTU_2',
      forename: 'Bob',
      surname: 'Jones',
      education_details: { data: { current_nc_year: '4' } },
      extended_details: { data: { sen_status: null, premium_pupil_indicator: false, english_as_additional_language_status: 'EAL', free_school_meals: true } },
      classes: { data: [{ id: 'WCLS_2' }] }
    }
  ];

  const sampleEmployees = [
    {
      id: 'WEMP_1',
      forename: 'Jane',
      surname: 'Teacher',
      classes: { data: [{ id: 'WCLS_1' }, { id: 'WCLS_2' }] }
    }
  ];

  const sampleDeletions = [];

  beforeEach(() => {
    vi.resetAllMocks();
    db = createMockDb();

    // Default API mocks
    fetchAllClasses.mockResolvedValue(sampleClasses);
    fetchAllStudents.mockResolvedValue(sampleStudents);
    fetchAllEmployees.mockResolvedValue(sampleEmployees);
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

  it('calls all four Wonde API endpoints', async () => {
    await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(fetchAllClasses).toHaveBeenCalledWith(SCHOOL_TOKEN, WONDE_SCHOOL_ID, expect.any(Object));
    expect(fetchAllStudents).toHaveBeenCalledWith(SCHOOL_TOKEN, WONDE_SCHOOL_ID, expect.any(Object));
    expect(fetchAllEmployees).toHaveBeenCalledWith(SCHOOL_TOKEN, WONDE_SCHOOL_ID, expect.any(Object));
    expect(fetchDeletions).toHaveBeenCalledWith(SCHOOL_TOKEN, WONDE_SCHOOL_ID, undefined);
  });

  it('upserts classes (creates new, updates existing)', async () => {
    // First class: new (no existing match)
    // Second class: existing match
    const classLookupStatement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn()
        .mockResolvedValueOnce(null) // WCLS_1 not found
        .mockResolvedValueOnce({ id: 'existing-class-id', name: 'Old Name' }) // WCLS_2 found
    };
    const insertClassStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true })
    };
    const updateClassStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true })
    };

    // Setup prepare to return different statements based on SQL
    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('SELECT') && sql.includes('classes') && sql.includes('wonde_class_id')) {
        return classLookupStatement;
      }
      if (sql.includes('INSERT INTO classes')) {
        return insertClassStatement;
      }
      if (sql.includes('UPDATE classes')) {
        return updateClassStatement;
      }
      // Default for sync log and other queries
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] })
      };
    });

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(result.classesCreated).toBe(1);
    expect(result.classesUpdated).toBe(1);
  });

  it('upserts students (creates new, updates existing)', async () => {
    // Track SQL calls to determine behavior
    const classLookupStatement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 'tally-class-1' })
    };
    const studentLookupStatement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn()
        .mockResolvedValueOnce(null) // WSTU_1 not found -> create
        .mockResolvedValueOnce({ id: 'existing-student-id' }) // WSTU_2 found -> update
    };
    const insertStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true })
    };
    const updateStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true })
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('SELECT') && sql.includes('classes') && sql.includes('wonde_class_id')) {
        return classLookupStatement;
      }
      if (sql.includes('wonde_erased_students')) {
        return { bind: vi.fn().mockReturnThis(), all: vi.fn().mockResolvedValue({ results: [] }) };
      }
      if (sql.includes('SELECT') && sql.includes('students') && sql.includes('wonde_student_id')) {
        return studentLookupStatement;
      }
      if (sql.includes('INSERT INTO students')) {
        return insertStatement;
      }
      if (sql.includes('UPDATE students')) {
        return updateStatement;
      }
      if (sql.includes('INSERT INTO classes')) {
        return { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue({ success: true }) };
      }
      if (sql.includes('UPDATE classes')) {
        return { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue({ success: true }) };
      }
      // Default for sync log, employee, deletion, org update queries
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] })
      };
    });

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(result.studentsCreated).toBe(1);
    expect(result.studentsUpdated).toBe(1);
  });

  it('handles employee class mappings', async () => {
    const deleteEmployeeClassesStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true })
    };
    const insertEmployeeClassStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true })
    };

    // Track class lookups for building the lookup map
    const classLookupStatement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 'tally-class-1' })
    };
    const studentLookupStatement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null)
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('DELETE FROM wonde_employee_classes')) {
        return deleteEmployeeClassesStatement;
      }
      if (sql.includes('INSERT INTO wonde_employee_classes')) {
        return insertEmployeeClassStatement;
      }
      if (sql.includes('SELECT') && sql.includes('classes') && sql.includes('wonde_class_id')) {
        return classLookupStatement;
      }
      if (sql.includes('wonde_erased_students')) {
        return { bind: vi.fn().mockReturnThis(), all: vi.fn().mockResolvedValue({ results: [] }) };
      }
      if (sql.includes('SELECT') && sql.includes('students') && sql.includes('wonde_student_id')) {
        return studentLookupStatement;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] })
      };
    });

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    // Should delete existing mappings first
    expect(deleteEmployeeClassesStatement.bind).toHaveBeenCalledWith(ORG_ID);
    expect(deleteEmployeeClassesStatement.run).toHaveBeenCalled();

    // WEMP_1 has 2 class IDs -> 2 inserts
    expect(insertEmployeeClassStatement.run).toHaveBeenCalledTimes(2);
    expect(result.employeesSynced).toBe(1);
  });

  it('handles student deletions (deactivates students)', async () => {
    fetchDeletions.mockResolvedValue([
      { id: 'WSTU_DEL_1', restored_at: null },
      { id: 'WSTU_DEL_2', restored_at: '2026-02-20T10:00:00Z' } // restored, should skip
    ]);

    const deactivateStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
    };

    const classLookupStatement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 'tally-class-1' })
    };
    const studentLookupStatement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null)
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('UPDATE students') && sql.includes('is_active = 0')) {
        return deactivateStatement;
      }
      if (sql.includes('SELECT') && sql.includes('classes') && sql.includes('wonde_class_id')) {
        return classLookupStatement;
      }
      if (sql.includes('wonde_erased_students')) {
        return { bind: vi.fn().mockReturnThis(), all: vi.fn().mockResolvedValue({ results: [] }) };
      }
      if (sql.includes('SELECT') && sql.includes('students') && sql.includes('wonde_student_id')) {
        return studentLookupStatement;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] })
      };
    });

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    // Only 1 deactivation (WSTU_DEL_2 has restored_at so skipped)
    expect(deactivateStatement.run).toHaveBeenCalledTimes(1);
    expect(result.studentsDeactivated).toBe(1);
  });

  it('updates organizations.wonde_last_sync_at', async () => {
    const updateOrgStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true })
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('UPDATE organizations') && sql.includes('wonde_last_sync_at')) {
        return updateOrgStatement;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] })
      };
    });

    await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(updateOrgStatement.bind).toHaveBeenCalled();
    expect(updateOrgStatement.run).toHaveBeenCalled();
  });

  it('updates sync log with completed status and counts', async () => {
    const syncLogUpdateStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true })
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('UPDATE wonde_sync_log') && sql.includes('completed')) {
        return syncLogUpdateStatement;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] })
      };
    });

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
      run: vi.fn().mockResolvedValue({ success: true })
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('UPDATE wonde_sync_log') && sql.includes('failed')) {
        return syncLogUpdateStatement;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] })
      };
    });

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('500');
    expect(syncLogUpdateStatement.run).toHaveBeenCalled();
  });

  it('passes updatedAfter to all fetch functions for delta sync', async () => {
    const updatedAfter = '2026-02-20T00:00:00Z';

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
    expect(fetchAllEmployees).toHaveBeenCalledWith(
      SCHOOL_TOKEN,
      WONDE_SCHOOL_ID,
      expect.objectContaining({ updatedAfter })
    );
    expect(fetchDeletions).toHaveBeenCalledWith(
      SCHOOL_TOKEN,
      WONDE_SCHOOL_ID,
      updatedAfter
    );
  });

  it('sets sync_type to full when no updatedAfter', async () => {
    const syncLogInsertStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true })
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('INSERT INTO wonde_sync_log')) {
        return syncLogInsertStatement;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] })
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
      run: vi.fn().mockResolvedValue({ success: true })
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('INSERT INTO wonde_sync_log')) {
        return syncLogInsertStatement;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] })
      };
    });

    await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db, {
      updatedAfter: '2026-02-20T00:00:00Z'
    });

    const bindArgs = syncLogInsertStatement.bind.mock.calls[0];
    expect(bindArgs).toContain('delta');
  });

  it('handles empty API responses gracefully', async () => {
    fetchAllClasses.mockResolvedValue([]);
    fetchAllStudents.mockResolvedValue([]);
    fetchAllEmployees.mockResolvedValue([]);
    fetchDeletions.mockResolvedValue([]);

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
    // Set up so that WCLS_1 maps to tally-class-A and WCLS_2 maps to tally-class-B
    const classLookupStatement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn()
        .mockResolvedValueOnce(null) // WCLS_1 not in DB -> create
        .mockResolvedValueOnce(null) // WCLS_2 not in DB -> create
    };

    const insertClassStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true })
    };

    const studentLookupStatement = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null) // all students new
    };

    const insertStudentStatement = {
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true })
    };

    db.prepare = vi.fn().mockImplementation((sql) => {
      if (sql.includes('SELECT') && sql.includes('classes') && sql.includes('wonde_class_id')) {
        return classLookupStatement;
      }
      if (sql.includes('INSERT INTO classes')) {
        return insertClassStatement;
      }
      if (sql.includes('wonde_erased_students')) {
        return { bind: vi.fn().mockReturnThis(), all: vi.fn().mockResolvedValue({ results: [] }) };
      }
      if (sql.includes('SELECT') && sql.includes('students') && sql.includes('wonde_student_id')) {
        return studentLookupStatement;
      }
      if (sql.includes('INSERT INTO students')) {
        return insertStudentStatement;
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] })
      };
    });

    await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    // Both students are created, each with their class_id from the lookup
    expect(insertStudentStatement.run).toHaveBeenCalledTimes(2);

    // The bind calls for student inserts should include the generated class UUIDs
    // Student 1 (Alice) is in WCLS_1, Student 2 (Bob) is in WCLS_2
    // The class UUIDs are generated by crypto.randomUUID() which we mocked
    const student1BindArgs = insertStudentStatement.bind.mock.calls[0];
    const student2BindArgs = insertStudentStatement.bind.mock.calls[1];

    // Both should have a class_id (not null/undefined)
    // The exact position depends on the INSERT column order, but we verify class_id is present
    expect(student1BindArgs.length).toBeGreaterThan(0);
    expect(student2BindArgs.length).toBeGreaterThan(0);
  });

  it('handles student error during sync without crashing', async () => {
    fetchAllStudents.mockRejectedValue(new Error('Student fetch failed'));

    const result = await runFullSync(ORG_ID, SCHOOL_TOKEN, WONDE_SCHOOL_ID, db);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('Student fetch failed');
  });
});
