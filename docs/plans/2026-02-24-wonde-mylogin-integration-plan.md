# Wonde + MyLogin Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate Wonde data sync API and MyLogin OAuth2 SSO so schools are pre-provisioned via webhooks and teachers/students authenticate via MyLogin, receiving standard Tally JWTs.

**Architecture:** Schools approve access on Wonde → `schoolApproved` webhook creates organization + triggers full data sync (students, classes, employees). Teachers/students log in via MyLogin OAuth2 → callback matches Wonde IDs → auto-creates Tally user → issues standard JWT. Daily cron runs delta sync. Email/password login preserved for owner/fallback.

**Tech Stack:** Cloudflare Workers (Hono), D1 database, KV storage (OAuth state), AES-GCM encryption (school tokens), MyLogin OAuth2 Authorization Code flow, Wonde REST API with pagination.

**Design doc:** `docs/plans/2026-02-24-wonde-mylogin-integration-design.md`

---

## Task 1: Database Migration

**Files:**
- Create: `migrations/0024_wonde_mylogin_integration.sql`

**Step 1: Write the migration SQL**

```sql
-- Migration 0024: Add Wonde and MyLogin integration columns
-- Adds columns for Wonde data sync and MyLogin SSO to existing tables,
-- plus new tables for sync tracking and employee-class mapping.

-- Organizations: Wonde school linkage
ALTER TABLE organizations ADD COLUMN wonde_school_id TEXT;
ALTER TABLE organizations ADD COLUMN wonde_school_token TEXT;
ALTER TABLE organizations ADD COLUMN wonde_last_sync_at TEXT;
ALTER TABLE organizations ADD COLUMN mylogin_org_id TEXT;

-- Users: MyLogin SSO linkage
ALTER TABLE users ADD COLUMN mylogin_id TEXT;
ALTER TABLE users ADD COLUMN wonde_employee_id TEXT;
ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local';

-- Create unique index on mylogin_id (nullable, only enforced when not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mylogin_id ON users(mylogin_id) WHERE mylogin_id IS NOT NULL;

-- Students: Wonde student linkage + extended data
ALTER TABLE students ADD COLUMN wonde_student_id TEXT;
ALTER TABLE students ADD COLUMN sen_status TEXT;
ALTER TABLE students ADD COLUMN pupil_premium INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN eal_status TEXT;
ALTER TABLE students ADD COLUMN fsm INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN year_group TEXT;

-- Classes: Wonde class linkage
ALTER TABLE classes ADD COLUMN wonde_class_id TEXT;

-- Sync tracking table
CREATE TABLE IF NOT EXISTS wonde_sync_log (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    sync_type TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    students_created INTEGER DEFAULT 0,
    students_updated INTEGER DEFAULT 0,
    students_deactivated INTEGER DEFAULT 0,
    classes_created INTEGER DEFAULT 0,
    classes_updated INTEGER DEFAULT 0,
    employees_synced INTEGER DEFAULT 0,
    error_message TEXT,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- Employee-class mapping (populated during Wonde sync, used at first MyLogin login)
CREATE TABLE IF NOT EXISTS wonde_employee_classes (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    wonde_employee_id TEXT NOT NULL,
    wonde_class_id TEXT NOT NULL,
    employee_name TEXT,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- Indexes for sync performance
CREATE INDEX IF NOT EXISTS idx_students_wonde_id ON students(wonde_student_id) WHERE wonde_student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classes_wonde_id ON classes(wonde_class_id) WHERE wonde_class_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orgs_wonde_school ON organizations(wonde_school_id) WHERE wonde_school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employee_classes_org ON wonde_employee_classes(organization_id);
CREATE INDEX IF NOT EXISTS idx_employee_classes_employee ON wonde_employee_classes(wonde_employee_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_org ON wonde_sync_log(organization_id);
```

**Step 2: Apply migration locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration applied successfully

**Step 3: Commit**

```bash
git add migrations/0024_wonde_mylogin_integration.sql
git commit -m "feat: add database migration for Wonde and MyLogin integration"
```

---

## Task 2: Wonde API Client

**Files:**
- Create: `src/utils/wondeApi.js`
- Create: `src/__tests__/unit/wondeApi.test.js`

This is the low-level HTTP client for communicating with the Wonde API. All functions handle pagination automatically.

**Step 1: Write failing tests for `wondeRequest` (core HTTP function)**

Test file: `src/__tests__/unit/wondeApi.test.js`

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  wondeRequest,
  fetchAllStudents,
  fetchAllClasses,
  fetchAllEmployees,
  fetchDeletions,
} from '../../utils/wondeApi.js';

describe('wondeApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('wondeRequest', () => {
    it('makes authenticated GET request with Bearer token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'A1' }], meta: { pagination: { more: false } } }),
      });

      const result = await wondeRequest('/schools/S1/students', 'test-token');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.wonde.com/v1.0/schools/S1/students',
        expect.objectContaining({
          headers: { 'Authorization': 'Bearer test-token' },
        })
      );
      expect(result).toEqual([{ id: 'A1' }]);
    });

    it('handles pagination by following next URLs', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ id: 'A1' }],
            meta: { pagination: { more: true, next: 'https://api.wonde.com/v1.0/schools/S1/students?page=2' } },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ id: 'A2' }],
            meta: { pagination: { more: false } },
          }),
        });

      const result = await wondeRequest('/schools/S1/students', 'test-token');
      expect(result).toEqual([{ id: 'A1' }, { id: 'A2' }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('appends query parameters to URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [], meta: { pagination: { more: false } } }),
      });

      await wondeRequest('/schools/S1/students', 'test-token', {
        include: 'education_details,classes',
        per_page: '200',
      });

      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('include=education_details%2Cclasses');
      expect(calledUrl).toContain('per_page=200');
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(wondeRequest('/schools/S1/students', 'test-token'))
        .rejects.toThrow('Wonde API error: 401 Unauthorized');
    });

    it('throws on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(wondeRequest('/schools/S1/students', 'test-token'))
        .rejects.toThrow('Network error');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/wondeApi.test.js`
Expected: FAIL — module not found

**Step 3: Implement `wondeRequest`**

File: `src/utils/wondeApi.js`

```javascript
const WONDE_BASE_URL = 'https://api.wonde.com/v1.0';

/**
 * Make an authenticated request to the Wonde API with automatic pagination.
 * @param {string} path - API path (e.g. '/schools/{id}/students')
 * @param {string} token - School API token (Bearer)
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>} - All data items across all pages
 */
export async function wondeRequest(path, token, params = {}) {
  const allData = [];
  let url = `${WONDE_BASE_URL}${path}`;

  // Add query params to first request
  if (Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  while (url) {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Wonde API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    if (json.data) {
      allData.push(...json.data);
    }

    // Follow pagination
    const pagination = json.meta?.pagination;
    url = (pagination?.more && pagination?.next) ? pagination.next : null;
  }

  return allData;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/wondeApi.test.js`
Expected: PASS (5 tests)

**Step 5: Write failing tests for `fetchAllStudents`, `fetchAllClasses`, `fetchAllEmployees`, `fetchDeletions`**

Add to the test file:

```javascript
describe('fetchAllStudents', () => {
  it('calls correct endpoint with includes', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'A1', forename: 'Ruth', surname: 'Bennett' }],
        meta: { pagination: { more: false } },
      }),
    });

    const result = await fetchAllStudents('token', 'S1');
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/schools/S1/students');
    expect(calledUrl).toContain('include=education_details');
    expect(calledUrl).toContain('extended_details');
    expect(calledUrl).toContain('classes');
    expect(calledUrl).toContain('year');
    expect(result).toHaveLength(1);
  });

  it('passes updated_after for delta sync', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], meta: { pagination: { more: false } } }),
    });

    await fetchAllStudents('token', 'S1', { updatedAfter: '2026-02-24' });
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('updated_after=2026-02-24');
  });
});

describe('fetchAllClasses', () => {
  it('calls correct endpoint with includes and has_students filter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'C1', name: '6A' }],
        meta: { pagination: { more: false } },
      }),
    });

    const result = await fetchAllClasses('token', 'S1');
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/schools/S1/classes');
    expect(calledUrl).toContain('include=students%2Cemployees');
    expect(calledUrl).toContain('has_students');
    expect(result).toHaveLength(1);
  });
});

describe('fetchAllEmployees', () => {
  it('calls correct endpoint with class filter', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'E1', forename: 'Sally', surname: 'Smith' }],
        meta: { pagination: { more: false } },
      }),
    });

    const result = await fetchAllEmployees('token', 'S1');
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/schools/S1/employees');
    expect(calledUrl).toContain('has_class');
    expect(result).toHaveLength(1);
  });
});

describe('fetchDeletions', () => {
  it('calls deletions endpoint with type and updated_after', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'A1', type: 'student' }],
        meta: { pagination: { more: false } },
      }),
    });

    const result = await fetchDeletions('token', 'S1', '2026-02-20');
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/schools/S1/deletions');
    expect(calledUrl).toContain('type=student');
    expect(calledUrl).toContain('updated_after=2026-02-20');
    expect(result).toHaveLength(1);
  });
});
```

**Step 6: Implement the convenience functions**

Add to `src/utils/wondeApi.js`:

```javascript
export async function fetchAllStudents(token, schoolId, options = {}) {
  const params = {
    include: 'education_details,extended_details,classes,year',
    per_page: '200',
  };
  if (options.updatedAfter) {
    params.updated_after = options.updatedAfter;
  }
  return wondeRequest(`/schools/${schoolId}/students`, token, params);
}

export async function fetchAllClasses(token, schoolId, options = {}) {
  const params = {
    include: 'students,employees',
    has_students: 'true',
    per_page: '200',
  };
  if (options.updatedAfter) {
    params.updated_after = options.updatedAfter;
  }
  return wondeRequest(`/schools/${schoolId}/classes`, token, params);
}

export async function fetchAllEmployees(token, schoolId, options = {}) {
  const params = {
    include: 'classes,employment_details',
    has_class: 'true',
    per_page: '200',
  };
  if (options.updatedAfter) {
    params.updated_after = options.updatedAfter;
  }
  return wondeRequest(`/schools/${schoolId}/employees`, token, params);
}

export async function fetchDeletions(token, schoolId, updatedAfter) {
  const params = { type: 'student' };
  if (updatedAfter) {
    params.updated_after = updatedAfter;
  }
  return wondeRequest(`/schools/${schoolId}/deletions`, token, params);
}
```

**Step 7: Run all tests**

Run: `npx vitest run src/__tests__/unit/wondeApi.test.js`
Expected: PASS (all tests)

**Step 8: Commit**

```bash
git add src/utils/wondeApi.js src/__tests__/unit/wondeApi.test.js
git commit -m "feat: add Wonde API client with pagination support"
```

---

## Task 3: Wonde Sync Service

**Files:**
- Create: `src/services/wondeSync.js`
- Create: `src/__tests__/unit/wondeSync.test.js`

This service orchestrates syncing Wonde data into D1 tables. It uses the `wondeApi.js` client and handles data mapping, batching, and sync logging.

**Step 1: Write failing tests for data mapping helpers**

File: `src/__tests__/unit/wondeSync.test.js`

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/wondeApi.js', () => ({
  fetchAllStudents: vi.fn(),
  fetchAllClasses: vi.fn(),
  fetchAllEmployees: vi.fn(),
  fetchDeletions: vi.fn(),
}));

import {
  mapWondeStudent,
  mapWondeClass,
  mapWondeEmployee,
  runFullSync,
} from '../../services/wondeSync.js';

describe('wondeSync', () => {
  describe('mapWondeStudent', () => {
    it('maps Wonde student to Tally student fields', () => {
      const wondeStudent = {
        id: 'A123',
        forename: 'Ruth',
        surname: 'Bennett',
        education_details: {
          data: { current_nc_year: '6' }
        },
        extended_details: {
          data: {
            sen_status: 'K',
            premium_pupil_indicator: true,
            english_as_additional_language_status: 'Fluent',
            free_school_meals: false,
          }
        },
        classes: {
          data: [{ id: 'C1' }, { id: 'C2' }]
        },
      };

      const result = mapWondeStudent(wondeStudent);

      expect(result).toEqual({
        wondeStudentId: 'A123',
        name: 'Ruth Bennett',
        yearGroup: '6',
        senStatus: 'K',
        pupilPremium: 1,
        ealStatus: 'Fluent',
        fsm: 0,
        wondeClassIds: ['C1', 'C2'],
      });
    });

    it('handles missing nested data gracefully', () => {
      const wondeStudent = {
        id: 'A456',
        forename: 'Tom',
        surname: 'Jones',
      };

      const result = mapWondeStudent(wondeStudent);

      expect(result).toEqual({
        wondeStudentId: 'A456',
        name: 'Tom Jones',
        yearGroup: null,
        senStatus: null,
        pupilPremium: 0,
        ealStatus: null,
        fsm: 0,
        wondeClassIds: [],
      });
    });
  });

  describe('mapWondeClass', () => {
    it('maps Wonde class to Tally class fields', () => {
      const wondeClass = {
        id: 'C1',
        name: '6A',
        code: '6A',
        description: 'Year 6 Class A',
      };

      const result = mapWondeClass(wondeClass);

      expect(result).toEqual({
        wondeClassId: 'C1',
        name: '6A',
      });
    });
  });

  describe('mapWondeEmployee', () => {
    it('maps Wonde employee to name and class IDs', () => {
      const wondeEmployee = {
        id: 'E1',
        forename: 'Sally',
        surname: 'Smith',
        classes: {
          data: [{ id: 'C1' }, { id: 'C3' }]
        },
      };

      const result = mapWondeEmployee(wondeEmployee);

      expect(result).toEqual({
        wondeEmployeeId: 'E1',
        name: 'Sally Smith',
        wondeClassIds: ['C1', 'C3'],
      });
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/wondeSync.test.js`
Expected: FAIL — module not found

**Step 3: Implement data mapping helpers**

File: `src/services/wondeSync.js`

```javascript
import { fetchAllStudents, fetchAllClasses, fetchAllEmployees, fetchDeletions } from '../utils/wondeApi.js';

/**
 * Map a Wonde student object to Tally student fields.
 */
export function mapWondeStudent(wondeStudent) {
  const educationDetails = wondeStudent.education_details?.data;
  const extendedDetails = wondeStudent.extended_details?.data;
  const classes = wondeStudent.classes?.data || [];

  return {
    wondeStudentId: wondeStudent.id,
    name: `${wondeStudent.forename} ${wondeStudent.surname}`,
    yearGroup: educationDetails?.current_nc_year || null,
    senStatus: extendedDetails?.sen_status || null,
    pupilPremium: extendedDetails?.premium_pupil_indicator ? 1 : 0,
    ealStatus: extendedDetails?.english_as_additional_language_status || null,
    fsm: extendedDetails?.free_school_meals ? 1 : 0,
    wondeClassIds: classes.map(c => c.id),
  };
}

/**
 * Map a Wonde class object to Tally class fields.
 */
export function mapWondeClass(wondeClass) {
  return {
    wondeClassId: wondeClass.id,
    name: wondeClass.name,
  };
}

/**
 * Map a Wonde employee object to name and class IDs.
 */
export function mapWondeEmployee(wondeEmployee) {
  const classes = wondeEmployee.classes?.data || [];
  return {
    wondeEmployeeId: wondeEmployee.id,
    name: `${wondeEmployee.forename} ${wondeEmployee.surname}`,
    wondeClassIds: classes.map(c => c.id),
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/wondeSync.test.js`
Expected: PASS

**Step 5: Write failing tests for `runFullSync`**

Add to test file — mock DB with `prepare().bind().run()` chain:

```javascript
describe('runFullSync', () => {
  let mockDb;

  beforeEach(() => {
    const { fetchAllStudents, fetchAllClasses, fetchAllEmployees, fetchDeletions } = require('../../utils/wondeApi.js');
    fetchAllClasses.mockResolvedValue([
      { id: 'C1', name: '6A', code: '6A' },
    ]);
    fetchAllStudents.mockResolvedValue([
      {
        id: 'ST1', forename: 'Ruth', surname: 'Bennett',
        education_details: { data: { current_nc_year: '6' } },
        extended_details: { data: { sen_status: null, premium_pupil_indicator: false, english_as_additional_language_status: null, free_school_meals: false } },
        classes: { data: [{ id: 'C1' }] },
      },
    ]);
    fetchAllEmployees.mockResolvedValue([
      { id: 'E1', forename: 'Sally', surname: 'Smith', classes: { data: [{ id: 'C1' }] } },
    ]);
    fetchDeletions.mockResolvedValue([]);

    mockDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          run: vi.fn(() => ({ success: true })),
          first: vi.fn(() => null),
          all: vi.fn(() => ({ results: [] })),
        })),
      })),
      batch: vi.fn(() => []),
    };
  });

  it('creates sync log entry with running status', async () => {
    await runFullSync('org-1', 'school-token', 'S1', mockDb);

    // First prepare call should be the sync log INSERT
    const firstCall = mockDb.prepare.mock.calls[0][0];
    expect(firstCall).toContain('INSERT INTO wonde_sync_log');
  });

  it('processes classes, students, employees, and deletions', async () => {
    const result = await runFullSync('org-1', 'school-token', 'S1', mockDb);

    const { fetchAllClasses, fetchAllStudents, fetchAllEmployees, fetchDeletions } = require('../../utils/wondeApi.js');
    expect(fetchAllClasses).toHaveBeenCalledWith('school-token', 'S1', {});
    expect(fetchAllStudents).toHaveBeenCalledWith('school-token', 'S1', {});
    expect(fetchAllEmployees).toHaveBeenCalledWith('school-token', 'S1', {});
    expect(fetchDeletions).toHaveBeenCalledWith('school-token', 'S1', undefined);

    expect(result.status).toBe('completed');
  });

  it('returns error status on failure', async () => {
    const { fetchAllClasses } = require('../../utils/wondeApi.js');
    fetchAllClasses.mockRejectedValue(new Error('API down'));

    const result = await runFullSync('org-1', 'school-token', 'S1', mockDb);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('API down');
  });
});
```

**Step 6: Implement `runFullSync`**

Add to `src/services/wondeSync.js`:

```javascript
/**
 * Generate a random ID (same pattern as rest of codebase).
 */
function generateId() {
  return crypto.randomUUID();
}

/**
 * Chunk an array into batches of a given size.
 */
function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Run a full sync of Wonde data into D1 for a single organization.
 * @param {string} orgId - Tally organization ID
 * @param {string} schoolToken - Decrypted Wonde school token
 * @param {string} wondeSchoolId - Wonde school ID
 * @param {Object} db - D1 database binding
 * @param {Object} options - { updatedAfter } for delta sync
 * @returns {Object} Sync result with counts and status
 */
export async function runFullSync(orgId, schoolToken, wondeSchoolId, db, options = {}) {
  const syncId = generateId();
  const startedAt = new Date().toISOString();
  const counts = {
    studentsCreated: 0, studentsUpdated: 0, studentsDeactivated: 0,
    classesCreated: 0, classesUpdated: 0, employeesSynced: 0,
  };

  // Create sync log entry
  await db.prepare(
    `INSERT INTO wonde_sync_log (id, organization_id, sync_type, status, started_at)
     VALUES (?, ?, ?, 'running', ?)`
  ).bind(syncId, orgId, options.updatedAfter ? 'delta' : 'full', startedAt).run();

  try {
    const fetchOptions = options.updatedAfter ? { updatedAfter: options.updatedAfter } : {};

    // 1. Sync classes
    const wondeClasses = await fetchAllClasses(schoolToken, wondeSchoolId, fetchOptions);
    for (const wc of wondeClasses) {
      const mapped = mapWondeClass(wc);
      const existing = await db.prepare(
        'SELECT id FROM classes WHERE organization_id = ? AND wonde_class_id = ?'
      ).bind(orgId, mapped.wondeClassId).first();

      if (existing) {
        await db.prepare(
          'UPDATE classes SET name = ?, updated_at = datetime("now") WHERE id = ?'
        ).bind(mapped.name, existing.id).run();
        counts.classesUpdated++;
      } else {
        const classId = generateId();
        await db.prepare(
          `INSERT INTO classes (id, organization_id, name, wonde_class_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))`
        ).bind(classId, orgId, mapped.name, mapped.wondeClassId).run();
        counts.classesCreated++;
      }
    }

    // Build class ID lookup (wonde_class_id → tally class id)
    const classLookup = {};
    const allClasses = await db.prepare(
      'SELECT id, wonde_class_id FROM classes WHERE organization_id = ? AND wonde_class_id IS NOT NULL'
    ).bind(orgId).all();
    for (const c of (allClasses.results || [])) {
      classLookup[c.wonde_class_id] = c.id;
    }

    // 2. Sync students
    const wondeStudents = await fetchAllStudents(schoolToken, wondeSchoolId, fetchOptions);
    for (const ws of wondeStudents) {
      const mapped = mapWondeStudent(ws);
      // Use first class as primary class_id
      const primaryClassId = mapped.wondeClassIds.length > 0
        ? (classLookup[mapped.wondeClassIds[0]] || null)
        : null;

      const existing = await db.prepare(
        'SELECT id FROM students WHERE organization_id = ? AND wonde_student_id = ?'
      ).bind(orgId, mapped.wondeStudentId).first();

      if (existing) {
        await db.prepare(
          `UPDATE students SET name = ?, class_id = ?, year_group = ?, sen_status = ?,
           pupil_premium = ?, eal_status = ?, fsm = ?, is_active = 1, updated_at = datetime("now")
           WHERE id = ?`
        ).bind(
          mapped.name, primaryClassId, mapped.yearGroup, mapped.senStatus,
          mapped.pupilPremium, mapped.ealStatus, mapped.fsm, existing.id
        ).run();
        counts.studentsUpdated++;
      } else {
        const studentId = generateId();
        await db.prepare(
          `INSERT INTO students (id, organization_id, name, class_id, wonde_student_id, year_group,
           sen_status, pupil_premium, eal_status, fsm, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime("now"), datetime("now"))`
        ).bind(
          studentId, orgId, mapped.name, primaryClassId, mapped.wondeStudentId,
          mapped.yearGroup, mapped.senStatus, mapped.pupilPremium, mapped.ealStatus, mapped.fsm
        ).run();
        counts.studentsCreated++;
      }
    }

    // 3. Sync employees (store in mapping table, not as users)
    const wondeEmployees = await fetchAllEmployees(schoolToken, wondeSchoolId, fetchOptions);

    // Clear existing employee-class mappings for this org (full rebuild)
    if (!options.updatedAfter) {
      await db.prepare('DELETE FROM wonde_employee_classes WHERE organization_id = ?').bind(orgId).run();
    }

    for (const we of wondeEmployees) {
      const mapped = mapWondeEmployee(we);
      for (const wondeClassId of mapped.wondeClassIds) {
        await db.prepare(
          `INSERT OR REPLACE INTO wonde_employee_classes (id, organization_id, wonde_employee_id, wonde_class_id, employee_name)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(generateId(), orgId, mapped.wondeEmployeeId, wondeClassId, mapped.name).run();
      }
      counts.employeesSynced++;
    }

    // 4. Process deletions (soft-delete students)
    const deletions = await fetchDeletions(schoolToken, wondeSchoolId, options.updatedAfter);
    for (const del of deletions) {
      if (del.type === 'student' && !del.restored_at) {
        await db.prepare(
          'UPDATE students SET is_active = 0, updated_at = datetime("now") WHERE organization_id = ? AND wonde_student_id = ?'
        ).bind(orgId, del.id).run();
        counts.studentsDeactivated++;
      }
    }

    // Update org last sync time
    await db.prepare(
      'UPDATE organizations SET wonde_last_sync_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), orgId).run();

    // Update sync log
    await db.prepare(
      `UPDATE wonde_sync_log SET status = 'completed', completed_at = datetime("now"),
       students_created = ?, students_updated = ?, students_deactivated = ?,
       classes_created = ?, classes_updated = ?, employees_synced = ?
       WHERE id = ?`
    ).bind(
      counts.studentsCreated, counts.studentsUpdated, counts.studentsDeactivated,
      counts.classesCreated, counts.classesUpdated, counts.employeesSynced, syncId
    ).run();

    return { status: 'completed', syncId, ...counts };

  } catch (error) {
    // Update sync log with error
    await db.prepare(
      `UPDATE wonde_sync_log SET status = 'failed', completed_at = datetime("now"), error_message = ? WHERE id = ?`
    ).bind(error.message, syncId).run();

    return { status: 'failed', syncId, errorMessage: error.message, ...counts };
  }
}
```

**Step 7: Run all tests**

Run: `npx vitest run src/__tests__/unit/wondeSync.test.js`
Expected: PASS

**Step 8: Commit**

```bash
git add src/services/wondeSync.js src/__tests__/unit/wondeSync.test.js
git commit -m "feat: add Wonde sync service with data mapping and full sync"
```

---

## Task 4: Wonde Webhook Handler

**Files:**
- Create: `src/routes/webhooks.js`
- Create: `src/__tests__/unit/webhooks.test.js`

**Step 1: Write failing tests**

File: `src/__tests__/unit/webhooks.test.js`

Test the webhook handler for `schoolApproved`, `accessRevoked`, and `accessDeclined` events. Mock `encryptSensitiveData` and `runFullSync`. Verify that:
- `schoolApproved` creates an organization, encrypts the token, and triggers sync
- `accessRevoked` soft-deletes the organization
- `accessDeclined` soft-deletes the organization
- Unknown payload types return 200 (acknowledged but ignored)
- Missing required fields return 400

**Step 2: Run tests to verify they fail**

**Step 3: Implement webhook router**

File: `src/routes/webhooks.js`

```javascript
import { Hono } from 'hono';
import { encryptSensitiveData } from '../utils/crypto.js';
import { runFullSync } from '../services/wondeSync.js';

const webhooksRouter = new Hono();

webhooksRouter.post('/wonde', async (c) => {
  const body = await c.req.json();
  const db = c.env.READING_MANAGER_DB;

  if (!body.payload_type) {
    return c.json({ error: 'Missing payload_type' }, 400);
  }

  switch (body.payload_type) {
    case 'schoolApproved': {
      if (!body.school_id || !body.school_name || !body.school_token) {
        return c.json({ error: 'Missing required fields for schoolApproved' }, 400);
      }

      // Generate org ID and slug
      const orgId = crypto.randomUUID();
      const slug = body.school_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      // Encrypt school token
      const encryptedToken = await encryptSensitiveData(body.school_token, c.env.JWT_SECRET);

      // Create organization
      await db.prepare(
        `INSERT INTO organizations (id, name, slug, wonde_school_id, wonde_school_token, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, datetime("now"), datetime("now"))`
      ).bind(orgId, body.school_name, slug, body.school_id, encryptedToken).run();

      // Trigger full sync in background
      const syncPromise = runFullSync(orgId, body.school_token, body.school_id, db);
      if (c.executionCtx?.waitUntil) {
        c.executionCtx.waitUntil(syncPromise);
      } else {
        await syncPromise;
      }

      console.log(`[Webhook] School approved: ${body.school_name} (${body.school_id})`);
      return c.json({ success: true, organizationId: orgId });
    }

    case 'accessRevoked':
    case 'accessDeclined': {
      if (!body.school_id) {
        return c.json({ error: 'Missing school_id' }, 400);
      }

      const org = await db.prepare(
        'SELECT id FROM organizations WHERE wonde_school_id = ?'
      ).bind(body.school_id).first();

      if (org) {
        await db.prepare(
          'UPDATE organizations SET is_active = 0, updated_at = datetime("now") WHERE id = ?'
        ).bind(org.id).run();

        const reason = body.revoke_reason || body.decline_reason || 'No reason provided';
        console.log(`[Webhook] Access ${body.payload_type}: ${body.school_name} - ${reason}`);
      }

      return c.json({ success: true });
    }

    case 'schoolMigration': {
      console.log(`[Webhook] School migration: ${body.school_name} from ${body.migrate_from} to ${body.migrate_to}`);
      return c.json({ success: true });
    }

    default:
      return c.json({ success: true, message: 'Unknown payload type acknowledged' });
  }
});

export default webhooksRouter;
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add src/routes/webhooks.js src/__tests__/unit/webhooks.test.js
git commit -m "feat: add Wonde webhook handler for school onboarding"
```

---

## Task 5: MyLogin OAuth Routes

**Files:**
- Create: `src/routes/mylogin.js`
- Create: `src/__tests__/unit/mylogin.test.js`

This is the core SSO integration. Three endpoints: login initiation, OAuth callback, and logout.

**Step 1: Write failing tests for OAuth state management and callback**

Tests should cover:
- Login endpoint generates state, stores in KV, redirects to MyLogin
- Callback verifies state, exchanges code for token, fetches user, creates/finds Tally user, issues JWT
- Callback rejects invalid state
- Callback handles missing organization gracefully
- Role mapping: admin→admin, employee→teacher, student→readonly
- Existing user login (update last_login_at, don't create duplicate)
- Logout endpoint returns MyLogin logout URL

**Step 2: Run tests to verify they fail**

**Step 3: Implement MyLogin OAuth router**

File: `src/routes/mylogin.js`

Key implementation notes:
- **Login**: Store state in KV (`READING_MANAGER_KV`) with 5-min TTL, redirect to MyLogin authorize URL
- **Callback**: Verify state from KV (then delete it). Exchange code via POST to `https://app.mylogin.com/oauth/token` with Basic Auth header `base64(client_id:client_secret)`. Fetch user from `https://app.mylogin.com/api/user` with Bearer token. Match org by `wonde_school_id`. Match or create user by `mylogin_id`. Use `createJWTPayload`, `createAccessToken`, `createRefreshToken` from `src/utils/crypto.js` (same as `src/routes/auth.js:359-396`). Set httpOnly refresh cookie (same pattern as `src/routes/auth.js:384-396`). Redirect to `/?auth=callback`.
- **Logout**: Revoke refresh token (same as `src/routes/auth.js:565-605`). Return `{ logoutUrl }`.

Role mapping function:
```javascript
function mapMyLoginTypeToRole(type) {
  switch (type) {
    case 'admin': return 'admin';
    case 'employee': return 'teacher';
    case 'student': return 'readonly';
    default: return 'readonly';
  }
}
```

For new teacher users: after creating the user, look up `wonde_employee_classes` for their `wonde_employee_id` to find which classes they teach.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add src/routes/mylogin.js src/__tests__/unit/mylogin.test.js
git commit -m "feat: add MyLogin OAuth2 SSO routes (login, callback, logout)"
```

---

## Task 6: Wire New Routes into Worker

**Files:**
- Modify: `src/worker.js:189-206` (add route mounts)
- Modify: `src/worker.js:159-170` (add public paths for tenant middleware)
- Modify: `src/worker.js:314-340` (extend cron handler)
- Modify: `src/middleware/tenant.js:23-33` (add public paths for JWT middleware)

**Step 1: Add imports and route mounts to `src/worker.js`**

After existing imports (around line 20), add:
```javascript
import myloginRouter from './routes/mylogin.js';
import webhooksRouter from './routes/webhooks.js';
```

After line 206 (`app.route('/api/hardcover', hardcoverRouter)`), add:
```javascript
app.route('/api/auth/mylogin', myloginRouter);
app.route('/api/webhooks', webhooksRouter);
```

**Step 2: Add public paths to tenant middleware bypass in `src/worker.js:159-170`**

Add to the `publicPaths` array:
```javascript
'/api/auth/mylogin/login',
'/api/auth/mylogin/callback',
'/api/webhooks/wonde',
```

**Step 3: Add public paths to JWT middleware in `src/middleware/tenant.js:23-33`**

Add to the `publicPaths` array:
```javascript
'/api/auth/mylogin/login',
'/api/auth/mylogin/callback',
'/api/webhooks/wonde',
```

**Step 4: Extend cron handler in `src/worker.js:314-340`**

Import `runFullSync` and `decryptSensitiveData` at top. Inside the `scheduled` handler, after streak recalculation (after line 336), add Wonde delta sync:

```javascript
// Wonde delta sync (runs daily after streak recalculation)
try {
  const wondeOrgs = await db.prepare(
    'SELECT id, wonde_school_id, wonde_school_token, wonde_last_sync_at FROM organizations WHERE wonde_school_id IS NOT NULL AND is_active = 1'
  ).bind().all();

  for (const org of (wondeOrgs.results || [])) {
    try {
      const schoolToken = await decryptSensitiveData(org.wonde_school_token, env.JWT_SECRET);
      await runFullSync(org.id, schoolToken, org.wonde_school_id, db, {
        updatedAfter: org.wonde_last_sync_at,
      });
      console.log(`[Cron] Wonde sync complete for org ${org.id}`);
    } catch (err) {
      console.error(`[Cron] Wonde sync failed for org ${org.id}:`, err.message);
    }
  }
} catch (error) {
  console.error('[Cron] Wonde sync query failed:', error.message);
}
```

**Step 5: Add Wonde sync admin endpoint**

Create file `src/routes/wondeAdmin.js` with `POST /sync` endpoint (requires admin role). Mount as `app.route('/api/wonde', wondeAdminRouter)` in worker.js.

**Step 6: Update `wrangler.toml` cron triggers**

Change line 53 from:
```toml
crons = ["0 2 * * *"]
```
to:
```toml
crons = ["0 2 * * *", "0 3 * * *"]
```

**Step 7: Run existing test suite to check for regressions**

Run: `npm test`
Expected: All existing tests pass

**Step 8: Commit**

```bash
git add src/worker.js src/middleware/tenant.js src/routes/wondeAdmin.js wrangler.toml
git commit -m "feat: wire Wonde/MyLogin routes into worker, extend cron for daily sync"
```

---

## Task 7: Frontend — MyLogin SSO Button on Login Page

**Files:**
- Modify: `src/components/Login.js:242-294` (add MyLogin button after existing form)

**Step 1: Add MyLogin SSO button below the email/password form**

In `renderMultiTenantForm()`, after the existing form and the "Forgot password" link section (after line ~312), add a divider and MyLogin button:

```jsx
{/* SSO Divider */}
<Box sx={{ display: 'flex', alignItems: 'center', my: 3 }}>
  <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(0,0,0,0.12)' }} />
  <Typography variant="body2" sx={{ px: 2, color: '#999' }}>or</Typography>
  <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(0,0,0,0.12)' }} />
</Box>

{/* MyLogin SSO Button */}
<Button
  fullWidth
  variant="outlined"
  size="large"
  onClick={() => { window.location.href = '/api/auth/mylogin/login'; }}
  sx={{
    height: 52,
    borderRadius: '12px',
    borderColor: '#00D37F',
    color: '#333',
    fontSize: '1rem',
    fontWeight: 600,
    textTransform: 'none',
    '&:hover': {
      borderColor: '#00B36B',
      backgroundColor: 'rgba(0, 211, 127, 0.05)',
    },
  }}
>
  Sign in with MyLogin
</Button>
```

**Step 2: Run build to verify**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/Login.js
git commit -m "feat: add MyLogin SSO button to login page"
```

---

## Task 8: Frontend — OAuth Callback Handling and SSO Logout

**Files:**
- Modify: `src/contexts/AppContext.js:149-190` (detect `?auth=callback` on mount)
- Modify: `src/contexts/AppContext.js:544-575` (SSO-aware logout)

**Step 1: Add OAuth callback detection**

In `AppContext.js`, in the auth mode detection `useEffect` (around line 149), after detecting auth mode, add callback handling:

```javascript
// Check for OAuth SSO callback
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('auth') && urlParams.get('auth') === 'callback') {
  // Remove query param from URL (clean up)
  window.history.replaceState({}, '', window.location.pathname);
  // Complete SSO login by refreshing token (callback set httpOnly cookie)
  try {
    const newToken = await refreshAccessToken();
    if (newToken) {
      // Fetch user info from the new token
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setAuthToken(data.accessToken);
        window.localStorage.setItem(AUTH_STORAGE_KEY, data.accessToken);
        if (data.user) {
          setUser(data.user);
          window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
        }
      }
    }
  } catch (err) {
    console.error('SSO callback error:', err);
  }
}
```

**Step 2: Update logout for SSO users**

In the `logout` function (around line 544), modify the multitenant branch:

```javascript
if (authMode === 'multitenant') {
  const isMyLoginUser = user?.authProvider === 'mylogin';

  if (isMyLoginUser) {
    // SSO logout: revoke token and get MyLogin logout URL
    const response = await fetch(`${API_URL}/auth/mylogin/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      credentials: 'include',
    });
    const data = await response.json();
    clearAuthState();
    if (data.logoutUrl) {
      window.location.href = data.logoutUrl;
      return;
    }
  } else {
    // Standard logout
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      credentials: 'include',
    });
  }
}
```

**Step 3: Ensure `auth_provider` / `authProvider` is included in JWT payload and user state**

In `src/utils/crypto.js:257-266`, add `authProvider` to `createJWTPayload`:
```javascript
export function createJWTPayload(user, organization) {
  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    org: organization.id,
    orgSlug: organization.slug,
    role: user.role,
    authProvider: user.authProvider || 'local',
  };
}
```

In `src/routes/auth.js`, where `userForPayload` is constructed (around line 366), the existing email/password path already doesn't set `authProvider`, so it defaults to `'local'`. The MyLogin callback in `src/routes/mylogin.js` will set `authProvider: 'mylogin'`.

The `/api/auth/refresh` endpoint needs to include `authProvider` in its user response. Check `src/routes/auth.js` refresh handler (around line 512) and add `auth_provider` to the user SELECT and include it in the response as `authProvider`.

**Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/contexts/AppContext.js src/utils/crypto.js src/routes/auth.js
git commit -m "feat: add OAuth callback handling and SSO-aware logout in frontend"
```

---

## Task 9: Admin Sync UI in Settings

**Files:**
- Modify: Settings component (likely `src/components/settings/DataManagement.js` or similar)

**Step 1: Add "Wonde Sync" section to settings for admin users**

Add a "School Data Sync" card visible to admin+ users when the organization has a `wonde_school_id`. Contains:
- Last sync timestamp display
- "Sync Now" button that calls `POST /api/wonde/sync`
- Sync results summary (students created/updated/deactivated, classes created/updated)
- Loading spinner during sync

**Step 2: Run build, verify**

**Step 3: Commit**

```bash
git add src/components/settings/DataManagement.js
git commit -m "feat: add Wonde sync controls to admin settings page"
```

---

## Task 10: Integration Test — Full Flow

**Files:**
- Create: `src/__tests__/integration/wondeIntegration.test.js`

**Step 1: Write integration test covering the full flow**

Test the complete happy path with mocked external APIs:
1. Webhook receives `schoolApproved` → organization created, token encrypted
2. Wonde sync runs → students, classes, employee mappings created
3. MyLogin OAuth callback → user created with correct role, JWT issued
4. Subsequent login → existing user found, no duplicate

**Step 2: Run test**

Run: `npx vitest run src/__tests__/integration/wondeIntegration.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add src/__tests__/integration/wondeIntegration.test.js
git commit -m "test: add integration test for full Wonde/MyLogin flow"
```

---

## Task 11: Configuration and Documentation

**Files:**
- Modify: `wrangler.toml` (environment variables documentation)
- Modify: `CLAUDE.md` (update architecture docs)

**Step 1: Document new environment variables needed**

In `wrangler.toml`, add comments documenting the new vars (actual values set via Cloudflare dashboard secrets):
```toml
# MyLogin OAuth2 SSO (set via `wrangler secret put`)
# MYLOGIN_CLIENT_ID - OAuth client ID from MyLogin developer portal
# MYLOGIN_CLIENT_SECRET - OAuth client secret
# MYLOGIN_REDIRECT_URI - https://tallyreading.uk/api/auth/mylogin/callback
# WONDE_API_TOKEN - App-level Wonde API token
```

**Step 2: Update CLAUDE.md with Wonde integration details**

Add a new section covering:
- Wonde data sync architecture
- MyLogin OAuth flow
- New routes, services, and tables
- Cron schedule update
- New environment variables

**Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add wrangler.toml CLAUDE.md
git commit -m "docs: update configuration and architecture docs for Wonde/MyLogin integration"
```

---

## Task 12: Apply Remote Migration and Deploy

**Step 1: Apply migration to production D1**

Run: `npx wrangler d1 migrations apply reading-manager-db --remote`

**Step 2: Set secrets via Cloudflare dashboard or CLI**

```bash
wrangler secret put MYLOGIN_CLIENT_ID
wrangler secret put MYLOGIN_CLIENT_SECRET
wrangler secret put MYLOGIN_REDIRECT_URI
wrangler secret put WONDE_API_TOKEN
```

**Step 3: Deploy**

Run: `npm run go`

**Step 4: Configure MyLogin developer portal**

- Set redirect URI to `https://tallyreading.uk/api/auth/mylogin/callback`
- Test with Furlong School test accounts in development mode

**Step 5: Configure Wonde dashboard**

- Set webhook URL to `https://tallyreading.uk/api/webhooks/wonde`
- Enable automatic school token generation

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: Wonde + MyLogin integration v1.0 complete"
```
