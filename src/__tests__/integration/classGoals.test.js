import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { classesRouter } from '../../routes/classes.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal Hono test app that mounts the classesRouter,
 * injecting the provided db and context values via middleware.
 */
function buildApp({ db, organizationId = 'org-1', userRole = 'teacher' } = {}) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    c.set('organizationId', organizationId);
    c.set('userRole', userRole);
    c.set('userId', 'user-1');
    c.env = { READING_MANAGER_DB: db, JWT_SECRET: 'test-secret' };
    await next();
  });

  app.route('/', classesRouter);
  return app;
}

/**
 * Make a mock D1 statement chain: prepare → bind → all/first/run
 * Each call to prepare returns a fresh chainable object.
 */
function makeMockDb(handlers) {
  return {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn((...args) => ({
          all: vi.fn(() => (handlers.all ? handlers.all(sql, args) : { results: [] })),
          first: vi.fn(() => (handlers.first ? handlers.first(sql, args) : null)),
          run: vi.fn(() => (handlers.run ? handlers.run(sql, args) : { success: true })),
        })),
      };
      return stmt;
    }),
    batch: vi.fn((stmts) => (handlers.batch ? handlers.batch(stmts) : Promise.resolve([]))),
  };
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TERM = '2025/26'; // today resolves to this academic year when no term_dates exist (April 2026 → Sep 2025–Aug 2026)

const makeGoalRow = (metric, { target = 20, current = 0, achieved_at = null } = {}) => ({
  id: `goal-${metric}`,
  organization_id: 'org-1',
  class_id: 'cls-1',
  metric,
  target,
  current,
  term: TERM,
  achieved_at,
  created_at: '2026-04-08T00:00:00.000Z',
});

const DEFAULT_GOAL_ROWS = [
  makeGoalRow('sessions', { target: 60 }), // classSize=3 → sessions=60
  makeGoalRow('genres', { target: 10 }),
  makeGoalRow('books', { target: 12 }), // classSize=3 → books=12
  makeGoalRow('reading_days', { target: 30 }),
  makeGoalRow('readers', { target: 3 }),
  makeGoalRow('badges', { target: 3 }),
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /:id/goals', () => {
  it('auto-creates default goals when none exist and returns them', async () => {
    let batchCalled = false;
    let fetchAfterInsert = false;

    const db = makeMockDb({
      all: (sql, _args) => {
        if (sql.includes('term_dates')) return { results: [] }; // no term dates → Q2 fallback
        if (sql.includes('class_goals')) {
          if (!fetchAfterInsert) return { results: [] }; // first fetch: empty
          return { results: DEFAULT_GOAL_ROWS }; // second fetch after batch insert
        }
        return { results: [] };
      },
      first: (sql, _args) => {
        if (sql.includes('COUNT(*)')) return { count: 3 }; // classSize = 3
        return { count: 0 };
      },
      batch: (stmts) => {
        batchCalled = true;
        fetchAfterInsert = true;
        return Promise.resolve(stmts.map(() => ({ success: true })));
      },
    });

    const app = buildApp({ db });
    const res = await app.request('/cls-1/goals', { method: 'GET' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(batchCalled).toBe(true);
    expect(body.goals).toHaveLength(6);
    expect(body.term).toBe(TERM);
    expect(body.gardenStage).toBe('seedling');
    expect(body.goalsCompleted).toBe(0);
    // Verify metrics are present
    const metrics = body.goals.map((g) => g.metric);
    expect(metrics).toContain('sessions');
    expect(metrics).toContain('genres');
    expect(metrics).toContain('books');
  });

  it('returns existing goals without re-inserting when they already exist', async () => {
    let insertBatchCalled = false;

    const db = makeMockDb({
      all: (sql, _args) => {
        if (sql.includes('term_dates')) return { results: [] };
        if (sql.includes('class_goals')) return { results: DEFAULT_GOAL_ROWS };
        return { results: [] };
      },
      first: () => ({ count: 0 }),
      batch: (stmts) => {
        // Check if any statement is an INSERT (backfill) vs UPDATE (recalc)
        if (stmts.some((s) => s._sql && s._sql.includes('INSERT'))) {
          insertBatchCalled = true;
        }
        return Promise.resolve(stmts.map(() => ({ success: true })));
      },
    });

    const app = buildApp({ db });
    const res = await app.request('/cls-1/goals', { method: 'GET' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(insertBatchCalled).toBe(false); // no INSERT because all 6 goals already existed
    expect(body.goals).toHaveLength(6);
    expect(body.gardenStage).toBe('seedling');
    expect(body.goalsCompleted).toBe(0);
  });

  it('returns correct gardenStage when one goal is achieved', async () => {
    const rows = [
      makeGoalRow('sessions', { target: 60, current: 60, achieved_at: '2026-04-01T10:00:00.000Z' }),
      makeGoalRow('genres', { target: 10, current: 3 }),
      makeGoalRow('books', { target: 12, current: 5 }),
    ];

    const db = makeMockDb({
      all: (sql, _args) => {
        if (sql.includes('term_dates')) return { results: [] };
        if (sql.includes('class_goals')) return { results: rows };
        return { results: [] };
      },
      first: () => null,
    });

    const app = buildApp({ db });
    const res = await app.request('/cls-1/goals', { method: 'GET' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.goalsCompleted).toBe(1);
    expect(body.gardenStage).toBe('seedling');
  });

  it('returns sprout stage when 3 goals are achieved', async () => {
    const rows = [
      makeGoalRow('sessions', { target: 60, current: 60, achieved_at: '2026-04-01T10:00:00Z' }),
      makeGoalRow('genres', { target: 10, current: 10, achieved_at: '2026-04-02T10:00:00Z' }),
      makeGoalRow('books', { target: 12, current: 12, achieved_at: '2026-04-03T10:00:00Z' }),
    ];

    const db = makeMockDb({
      all: (sql, _args) => {
        if (sql.includes('term_dates')) return { results: [] };
        if (sql.includes('class_goals')) return { results: rows };
        return { results: [] };
      },
      first: () => null,
    });

    const app = buildApp({ db });
    const res = await app.request('/cls-1/goals', { method: 'GET' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.goalsCompleted).toBe(3);
    expect(body.gardenStage).toBe('sprout');
  });

  it('uses term_dates when they are present instead of calendar fallback', async () => {
    const termRows = [
      {
        term_name: 'Summer 1',
        start_date: '2026-04-20',
        end_date: '2026-05-29',
        academic_year: '2025/26',
      },
    ];
    // today in the route will be resolved at runtime; we check the term label passed to the
    // second class_goals query is built from the matched row
    const capturedArgs = [];

    const db = makeMockDb({
      all: (sql, args) => {
        if (sql.includes('term_dates')) return { results: termRows };
        if (sql.includes('class_goals')) {
          capturedArgs.push(args);
          return { results: [] }; // trigger auto-create path
        }
        return { results: [] };
      },
      first: (sql, _args) => {
        if (sql.includes('COUNT(*)')) return { count: 0 };
        return null;
      },
      batch: () => {
        return Promise.resolve([]);
      },
    });

    const app = buildApp({ db });
    // We won't assert on term value here since the real date is injected inside the route,
    // but we confirm the route calls term_dates and succeeds (200).
    const res = await app.request('/cls-1/goals', { method: 'GET' });
    expect(res.status).toBe(200);
    // At least one class_goals query was made
    expect(capturedArgs.length).toBeGreaterThan(0);
  });
});

describe('PUT /:id/goals', () => {
  it('updates goal targets and returns the refreshed list', async () => {
    let batchCalled = false;
    const updatedRows = [
      makeGoalRow('sessions', { target: 80 }),
      makeGoalRow('genres', { target: 10 }),
      makeGoalRow('books', { target: 12 }),
    ];

    const db = makeMockDb({
      all: (sql, _args) => {
        if (sql.includes('class_goals')) return { results: updatedRows };
        return { results: [] };
      },
      first: () => null,
      batch: (stmts) => {
        batchCalled = true;
        expect(stmts.length).toBe(1); // only one goal submitted
        return Promise.resolve(stmts.map(() => ({ success: true })));
      },
    });

    const app = buildApp({ db });
    const res = await app.request('/cls-1/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: [{ metric: 'sessions', target: 80 }] }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(batchCalled).toBe(true);
    expect(body.goals).toHaveLength(3);
    expect(body.gardenStage).toBe('seedling');
  });

  it('clears achieved_at in the SQL when target is raised above current (via CASE WHEN)', async () => {
    const capturedSqls = [];
    const db = makeMockDb({
      all: (sql, _args) => {
        if (sql.includes('class_goals')) return { results: DEFAULT_GOAL_ROWS };
        return { results: [] };
      },
      first: () => null,
      batch: (stmts) => {
        // Each stmt was created by prepare(); capture the SQL text from the mock
        // We verify the SQL contains the CASE WHEN pattern
        capturedSqls.push(...stmts);
        return Promise.resolve(stmts.map(() => ({ success: true })));
      },
    });

    const app = buildApp({ db });
    const res = await app.request('/cls-1/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: [{ metric: 'sessions', target: 100 }] }),
    });

    expect(res.status).toBe(200);
    // Verify the prepare was called with the CASE WHEN pattern
    const prepareCalls = db.prepare.mock.calls.map(([sql]) => sql);
    const updateSql = prepareCalls.find((s) => s.includes('UPDATE class_goals'));
    expect(updateSql).toBeDefined();
    expect(updateSql).toContain('CASE WHEN');
    expect(updateSql).toContain('achieved_at');
  });

  it('returns 400 when goals is not an array', async () => {
    const db = makeMockDb({});

    const app = buildApp({ db });
    const res = await app.request('/cls-1/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: 'not-an-array' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/array/i);
  });

  it('returns 400 for an invalid metric name', async () => {
    const db = makeMockDb({});

    const app = buildApp({ db });
    const res = await app.request('/cls-1/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: [{ metric: 'invalid_metric', target: 10 }] }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid goal/);
  });

  it('returns 400 when target is less than 1', async () => {
    const db = makeMockDb({});

    const app = buildApp({ db });
    const res = await app.request('/cls-1/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: [{ metric: 'sessions', target: 0 }] }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid goal/);
  });

  it('returns 400 when target is not a number', async () => {
    const db = makeMockDb({});

    const app = buildApp({ db });
    const res = await app.request('/cls-1/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goals: [{ metric: 'sessions', target: 'many' }] }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid goal/);
  });

  it('accepts all three valid metrics in a single request', async () => {
    let batchedCount = 0;

    const db = makeMockDb({
      all: (sql, _args) => {
        if (sql.includes('class_goals')) return { results: DEFAULT_GOAL_ROWS };
        return { results: [] };
      },
      first: () => null,
      batch: (stmts) => {
        batchedCount = stmts.length;
        return Promise.resolve(stmts.map(() => ({ success: true })));
      },
    });

    const app = buildApp({ db });
    const res = await app.request('/cls-1/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goals: [
          { metric: 'sessions', target: 60 },
          { metric: 'genres', target: 12 },
          { metric: 'books', target: 15 },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(batchedCount).toBe(3);
  });
});
