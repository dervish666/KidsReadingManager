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
      prepare: vi.fn((sql) => ({
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

    const userDelete = prepareCalls.find(
      (sql) => sql.includes('DELETE') && sql.includes('users')
    );
    expect(userDelete).toBeDefined();
    expect(userDelete).toContain("auth_provider = 'demo'");
  });
});
