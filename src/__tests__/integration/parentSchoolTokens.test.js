import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { parentRouter } from '../../routes/parent.js';
import { ROLES } from '../../utils/crypto.js';

const ORG = 'org-1';

/**
 * Mock D1 that answers `all()` from a handler keyed on the SQL, so a test can
 * say what the token query returns without caring about bind order.
 */
const createMockDB = ({ allBySql = () => ({ results: [] }) } = {}) => {
  const batched = [];
  const db = {
    prepare: vi.fn((sql) => ({
      bind: vi.fn((...args) => ({
        all: vi.fn(async () => allBySql(sql, args)),
        first: vi.fn(async () => null),
        run: vi.fn(async () => ({ success: true })),
        _sql: sql,
        _args: args,
      })),
    })),
    batch: vi.fn(async (statements) => {
      batched.push(statements);
      return statements.map(() => ({ success: true }));
    }),
    _batched: batched,
  };
  return db;
};

const createApp = (db, { userRole = ROLES.TEACHER } = {}) => {
  const app = new Hono();
  app.onError((err, c) => c.json({ message: err.message }, err.status || 500));
  app.use('*', async (c, next) => {
    c.env = { READING_MANAGER_DB: db, JWT_SECRET: 'test-secret' };
    c.set('organizationId', ORG);
    c.set('userId', 'user-1');
    c.set('userRole', userRole);
    await next();
  });
  app.route('/api/parent', parentRouter);
  return app;
};

describe('GET /api/parent/school/tokens', () => {
  let db;

  const rows = [
    {
      tokenId: 't1',
      token: 'aaa',
      studentId: 's1',
      studentName: 'Ada Lovelace',
      classId: 'c1',
      className: '5D',
    },
    {
      tokenId: 't2',
      token: 'bbb',
      studentId: 's2',
      studentName: 'Bo Diddley',
      classId: 'c1',
      className: '5D',
    },
    {
      tokenId: 't3',
      token: 'ccc',
      studentId: 's3',
      studentName: 'Cy Twombly',
      classId: 'c2',
      className: '6A',
    },
    // Pupil whose class was retired by a Wonde sync, or who never had one
    {
      tokenId: 't4',
      token: 'ddd',
      studentId: 's4',
      studentName: 'Di Nursery',
      classId: null,
      className: null,
    },
  ];

  beforeEach(() => {
    db = createMockDB({
      allBySql: (sql) => (sql.includes('parent_access_tokens pat') ? { results: rows } : {}),
    });
  });

  it('groups tokens by class and keeps the SQL order', async () => {
    const res = await createApp(db).request('/api/parent/school/tokens');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.classes.map((c) => c.className)).toEqual(['5D', '6A', 'No class']);
    expect(body.classes[0].tokens.map((t) => t.token)).toEqual(['aaa', 'bbb']);
    expect(body.classes[2].classId).toBeNull();
  });

  it('sends only first names to the print sheet', async () => {
    const res = await createApp(db).request('/api/parent/school/tokens');
    const body = await res.json();
    const names = body.classes.flatMap((c) => c.tokens.map((t) => t.studentFirstName));
    expect(names).toEqual(['Ada', 'Bo', 'Cy', 'Di']);
  });

  it('scopes the query to the caller organisation and academic year', async () => {
    await createApp(db).request('/api/parent/school/tokens');
    const sql = db.prepare.mock.calls
      .map((c) => c[0])
      .find((s) => s.includes('parent_access_tokens pat'));
    expect(sql).toContain('pat.organization_id = ?');
    expect(sql).toContain('pat.academic_year = ?');
    expect(sql).toContain('pat.revoked_at IS NULL');
    expect(sql).toContain('s.is_active = 1');
    // Unassigned pupils sort last, so the odds-and-ends page is at the back.
    expect(sql).toContain('ORDER BY (c.name IS NULL) ASC');
  });

  it('refuses a readonly user', async () => {
    const res = await createApp(db, { userRole: ROLES.READONLY }).request(
      '/api/parent/school/tokens'
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/parent/school/generate', () => {
  it('creates one token per pupil that lacks one, chunked for D1', async () => {
    const pupils = Array.from({ length: 120 }, (_, i) => ({ id: `s${i}` }));
    const db = createMockDB({
      allBySql: (sql) => (sql.includes('FROM students s') ? { results: pupils } : {}),
    });

    const res = await createApp(db).request('/api/parent/school/generate', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ generated: 120 });

    // 120 inserts at 50 per batch — D1 rejects batches over 100 statements.
    expect(db._batched.map((b) => b.length)).toEqual([50, 50, 20]);
  });

  it('writes nothing when every pupil already has a token', async () => {
    const db = createMockDB({ allBySql: () => ({ results: [] }) });
    const res = await createApp(db).request('/api/parent/school/generate', { method: 'POST' });

    expect(await res.json()).toEqual({ generated: 0 });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('refuses a readonly user', async () => {
    const db = createMockDB();
    const res = await createApp(db, { userRole: ROLES.READONLY }).request(
      '/api/parent/school/generate',
      { method: 'POST' }
    );
    expect(res.status).toBe(403);
    expect(db.batch).not.toHaveBeenCalled();
  });
});
