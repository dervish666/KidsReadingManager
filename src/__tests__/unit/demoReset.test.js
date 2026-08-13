import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetDemoData } from '../../services/demoReset.js';

vi.mock('../../data/demoSnapshot.js', () => ({
  DEMO_ORG_ID: 'test-org-id',
  SNAPSHOT: {
    students: [
      { id: 's1', organization_id: 'test-org-id', name: 'Alice' },
      { id: 's2', organization_id: 'test-org-id', name: 'Bob' },
    ],
    classes: [{ id: 'c1', organization_id: 'test-org-id', name: 'Year 3' }],
    class_assignments: [{ student_id: 's1', class_id: 'c1' }],
    reading_sessions: [{ id: 'rs1', organization_id: 'test-org-id', student_id: 's1' }],
    student_preferences: [],
    org_book_selections: [{ organization_id: 'test-org-id', book_id: 'b1' }],
    org_settings: [],
    term_dates: [],
    users: [{ id: 'u1', organization_id: 'test-org-id', name: 'Demo Teacher' }],
    user_tour_completions: [],
    support_tickets: [],
    support_ticket_notes: [],
  },
}));

describe('resetDemoData', () => {
  let db;
  let batchCalls;

  beforeEach(() => {
    batchCalls = [];
    db = {
      prepare: vi.fn((_sql) => ({
        bind: vi.fn(() => ({
          run: vi.fn(),
          first: vi.fn(),
          all: vi.fn(() => ({ results: [] })),
        })),
      })),
      batch: vi.fn((stmts) => {
        batchCalls.push(stmts.length);
        return Promise.resolve(stmts.map(() => ({ success: true })));
      }),
    };
  });

  it('calls db.batch for delete and insert phases', async () => {
    await resetDemoData(db);
    expect(db.batch).toHaveBeenCalled();
    expect(batchCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('respects the 100-statement batch limit', async () => {
    await resetDemoData(db);
    for (const count of batchCalls) {
      expect(count).toBeLessThanOrEqual(100);
    }
  });

  it('deletes before inserting (first batch is deletes)', async () => {
    const prepareCalls = [];
    db.prepare = vi.fn((sql) => {
      prepareCalls.push(sql);
      return {
        bind: vi.fn(() => ({
          run: vi.fn(),
          first: vi.fn(),
          all: vi.fn(() => ({ results: [] })),
        })),
      };
    });

    await resetDemoData(db);

    // First prepared statements should be DELETEs
    const firstDelete = prepareCalls.findIndex((sql) => sql.includes('DELETE'));
    const firstInsert = prepareCalls.findIndex((sql) => sql.includes('INSERT'));
    expect(firstDelete).toBeLessThan(firstInsert);
  });

  it('only deletes demo auth_provider users, not all org users', async () => {
    const prepareCalls = [];
    db.prepare = vi.fn((sql) => {
      prepareCalls.push(sql);
      return {
        bind: vi.fn(() => ({
          run: vi.fn(),
          first: vi.fn(),
          all: vi.fn(() => ({ results: [] })),
        })),
      };
    });

    await resetDemoData(db);

    const userDelete = prepareCalls.find((sql) => sql.includes('DELETE') && sql.includes('users'));
    expect(userDelete).toBeDefined();
    expect(userDelete).toContain("auth_provider = 'demo'");
  });

  it('deletes student_recommendations, which has no ON DELETE CASCADE to students', async () => {
    const prepareCalls = [];
    db.prepare = vi.fn((sql) => {
      prepareCalls.push(sql);
      return {
        bind: vi.fn(() => ({
          run: vi.fn(),
          first: vi.fn(),
          all: vi.fn(() => ({ results: [] })),
        })),
        all: vi.fn(() => ({ results: [] })),
      };
    });

    await resetDemoData(db);

    const recDelete = prepareCalls.findIndex(
      (sql) => sql.includes('DELETE') && sql.includes('student_recommendations')
    );
    const studentDelete = prepareCalls.findIndex((sql) =>
      sql.includes('DELETE FROM students WHERE')
    );
    expect(recDelete).toBeGreaterThanOrEqual(0);
    expect(recDelete).toBeLessThan(studentDelete);
  });
});

// ---------------------------------------------------------------------------
// Resilience to catalogue drift
//
// The snapshot names rows in GLOBAL tables (books, genres) that the demo org
// does not own, so an owner deleting a book leaves the reset failing the same
// FK forever. These cover the guard that skips those rows instead.
// ---------------------------------------------------------------------------
describe('resetDemoData — catalogue drift', () => {
  function makeDb({ bookIds = ['b1'], genreIds = [], batchImpl = null, failRun = null } = {}) {
    const inserted = [];
    const prepared = [];

    const db = {
      prepare: vi.fn((sql) => {
        prepared.push(sql);
        return {
          // loadReferencedIds calls .all() straight off prepare(), no bind
          all: vi.fn(async () => ({
            results: sql.includes('FROM books')
              ? bookIds.map((id) => ({ id }))
              : sql.includes('FROM genres')
                ? genreIds.map((id) => ({ id }))
                : [],
          })),
          bind: vi.fn((...args) => {
            if (sql.startsWith('INSERT OR IGNORE')) inserted.push({ sql, args });
            return {
              run: vi.fn(async () => {
                if (failRun && failRun(sql)) {
                  throw new Error('D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT');
                }
                return { success: true };
              }),
              first: vi.fn(async () => null),
              all: vi.fn(async () => ({ results: [] })),
              _sql: sql,
            };
          }),
        };
      }),
      batch: vi.fn(batchImpl || (async (stmts) => stmts.map(() => ({ success: true })))),
    };

    return { db, inserted, prepared };
  }

  it('skips snapshot rows whose book has left the catalogue, and keeps the rest', async () => {
    // b1 is still in the catalogue; the reading_sessions row references it too
    const { db, inserted } = makeDb({ bookIds: ['b1'] });

    const result = await resetDemoData(db);

    expect(result.skippedRows).toBe(0);
    expect(inserted.some((i) => i.sql.includes('org_book_selections'))).toBe(true);
  });

  it('drops the row when its book is gone rather than failing the FK', async () => {
    const { db, inserted } = makeDb({ bookIds: ['someone-elses-book'] });

    const result = await resetDemoData(db);

    // The one org_book_selections row references b1, which no longer exists
    expect(result.skippedRows).toBe(1);
    expect(inserted.some((i) => i.sql.includes('org_book_selections'))).toBe(false);
    // Students are untouched by the guard
    expect(inserted.some((i) => i.sql.includes('INTO students'))).toBe(true);
  });

  it('inserts unfiltered when the referenced table cannot be read', async () => {
    const { db, inserted } = makeDb();
    const original = db.prepare;
    db.prepare = vi.fn((sql) => {
      if (sql.includes('FROM books')) {
        return {
          all: vi.fn(async () => {
            throw new Error('D1_ERROR: Network connection lost');
          }),
        };
      }
      return original(sql);
    });

    const result = await resetDemoData(db);

    // Failing to read the catalogue must not empty the demo library
    expect(result.skippedRows).toBe(0);
    expect(inserted.some((i) => i.sql.includes('org_book_selections'))).toBe(true);
  });

  it('does not fingerprint a reset whose rows failed to insert', async () => {
    const kv = { get: vi.fn(async () => null), put: vi.fn(async () => {}) };
    const { db } = makeDb({
      bookIds: ['b1'],
      // The chunk fails AND the row-by-row retry fails, so the rows are lost
      batchImpl: async (stmts) => {
        if (stmts.some((s) => s._sql?.includes('INTO students'))) {
          throw new Error('D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT');
        }
        return stmts.map(() => ({ success: true }));
      },
      failRun: (sql) => sql.includes('INTO students'),
    });

    const result = await resetDemoData(db, kv);

    expect(result.failures).toBeGreaterThan(0);
    // A demo missing its students must not become the baseline the next hour
    // compares against — leaving the key unwritten means the next run resets.
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('does not burn retries on a constraint failure', async () => {
    let studentBatchAttempts = 0;
    const { db } = makeDb({
      bookIds: ['b1'],
      batchImpl: async (stmts) => {
        if (stmts.some((s) => s._sql?.includes('INTO students'))) {
          studentBatchAttempts++;
          throw new Error('D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT');
        }
        return stmts.map(() => ({ success: true }));
      },
    });

    await resetDemoData(db);

    // Deterministic failure: one attempt, then straight to row-by-row. Retrying
    // cost ~1.75s per failing chunk and could never have succeeded.
    expect(studentBatchAttempts).toBe(1);
  });

  it('fingerprints a reset whose only losses are stale catalogue rows', async () => {
    const kv = { get: vi.fn(async () => null), put: vi.fn(async () => {}) };
    const { db } = makeDb({ bookIds: [] });

    const result = await resetDemoData(db, kv);

    expect(result.skippedRows).toBeGreaterThan(0);
    expect(result.failures).toBe(0);
    // Stable, expected drift — still a clean demo, so the skip logic stays armed
    expect(kv.put).toHaveBeenCalled();
  });
});
