import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

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

vi.mock('../../utils/helpers', () => ({
  generateId: () => 'generated-id',
  csvRow: (values) => values.join(','),
}));

import { gdprRouter } from '../../routes/students/gdpr.js';

const buildMockDB = ({ student, sessionCount = 0, prefCount = 0, badgeCount = 0 }) => {
  const sqlMatches = (sql, fragment) => sql.includes(fragment);
  const prepare = vi.fn((sql) => {
    return {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockImplementation(() => {
        if (sqlMatches(sql, 'FROM students')) return Promise.resolve(student);
        if (sqlMatches(sql, 'FROM reading_sessions')) {
          return Promise.resolve({ count: sessionCount });
        }
        if (sqlMatches(sql, 'FROM student_preferences')) {
          return Promise.resolve({ count: prefCount });
        }
        if (sqlMatches(sql, 'FROM student_badges')) {
          return Promise.resolve({ count: badgeCount });
        }
        return Promise.resolve(null);
      }),
      _sql: sql,
    };
  });
  const batchStatements = [];
  const batch = vi.fn().mockImplementation((stmts) => {
    for (const stmt of stmts) batchStatements.push(stmt._sql);
    return Promise.resolve([{ success: true }]);
  });
  return { prepare, batch, _batchStatements: batchStatements };
};

const buildApp = (mockDB) => {
  const app = new Hono();
  app.onError((error, c) =>
    c.json({ status: 'error', message: error.message }, error.status || 500)
  );
  app.use('*', async (c, next) => {
    c.env = { READING_MANAGER_DB: mockDB, JWT_SECRET: 'test-secret' };
    c.set('organizationId', 'org-1');
    c.set('userId', 'user-1');
    c.set('userRole', 'admin');
    await next();
  });
  app.route('/api/students', gdprRouter);
  return app;
};

describe('DELETE /api/students/:id/erase — Article 17 erasure completeness', () => {
  it('issues explicit DELETE for student_badges and student_reading_stats', async () => {
    const mockDB = buildMockDB({
      student: { id: 'student-1', name: 'Alice', wonde_student_id: null },
      sessionCount: 7,
      prefCount: 1,
      badgeCount: 4,
    });
    const app = buildApp(mockDB);

    const res = await app.request('/api/students/student-1/erase', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/erased successfully/i);
    expect(body.erased.readingSessions).toBe(7);
    expect(body.erased.preferences).toBe(1);
    expect(body.erased.badges).toBe(4);
    expect(body.erased.readingStats).toBe(1);

    // The batch must include explicit deletes for both new tables — defence-in-depth
    // against FK CASCADE not being enforced on D1
    expect(mockDB.batch).toHaveBeenCalledOnce();
    const batchedSql = mockDB._batchStatements;
    expect(batchedSql.some((s) => /DELETE FROM student_badges WHERE student_id/.test(s))).toBe(
      true
    );
    expect(
      batchedSql.some((s) => /DELETE FROM student_reading_stats WHERE student_id/.test(s))
    ).toBe(true);

    // Existing erasure semantics still hold
    expect(batchedSql.some((s) => /DELETE FROM reading_sessions/.test(s))).toBe(true);
    expect(batchedSql.some((s) => /DELETE FROM student_preferences/.test(s))).toBe(true);
    expect(batchedSql.some((s) => /DELETE FROM students WHERE id/.test(s))).toBe(true);
  });

  it('orders the batch with all child-row deletes before the student delete', async () => {
    const mockDB = buildMockDB({
      student: { id: 'student-1', name: 'Alice', wonde_student_id: null },
    });
    const app = buildApp(mockDB);

    await app.request('/api/students/student-1/erase', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });

    const sql = mockDB._batchStatements;
    const indexOf = (frag) => sql.findIndex((s) => s.includes(frag));

    const sessionsIdx = indexOf('DELETE FROM reading_sessions');
    const prefsIdx = indexOf('DELETE FROM student_preferences');
    const badgesIdx = indexOf('DELETE FROM student_badges');
    const statsIdx = indexOf('DELETE FROM student_reading_stats');
    const studentIdx = indexOf('DELETE FROM students WHERE id');

    // All child deletes must precede the parent delete
    expect(sessionsIdx).toBeLessThan(studentIdx);
    expect(prefsIdx).toBeLessThan(studentIdx);
    expect(badgesIdx).toBeLessThan(studentIdx);
    expect(statsIdx).toBeLessThan(studentIdx);
  });

  it('rejects without confirm flag', async () => {
    const mockDB = buildMockDB({
      student: { id: 'student-1', name: 'Alice', wonde_student_id: null },
    });
    const app = buildApp(mockDB);

    const res = await app.request('/api/students/student-1/erase', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect(mockDB.batch).not.toHaveBeenCalled();
  });
});
