import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../utils/isbnLookup.js', () => ({ lookupISBN: vi.fn() }));

import { booksRouter } from '../../routes/books.js';
import { lookupISBN } from '../../utils/isbnLookup.js';

const TEST_SECRET = 'test-jwt-secret-for-testing';

const createMockDB = (overrides = {}) => {
  const prepareChain = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue(overrides.allResults || { results: [], success: true }),
    first: vi.fn().mockResolvedValue(overrides.firstResult || null),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
  };
  return {
    prepare: vi.fn().mockReturnValue(prepareChain),
    batch: vi
      .fn()
      .mockImplementation((stmts) =>
        Promise.resolve(stmts.map(() => ({ success: true, results: [], meta: { changes: 1 } })))
      ),
    _chain: prepareChain,
    ...overrides,
  };
};

const createTestApp = (contextValues = {}, dbOverrides = {}) => {
  const app = new Hono();
  const mockDB = createMockDB(dbOverrides);

  app.onError((error, c) =>
    c.json({ status: 'error', message: error.message }, error.status || 500)
  );

  app.use('*', async (c, next) => {
    c.env = { JWT_SECRET: TEST_SECRET, READING_MANAGER_DB: mockDB };
    if (contextValues.organizationId) c.set('organizationId', contextValues.organizationId);
    if (contextValues.userRole) c.set('userRole', contextValues.userRole);
    if (contextValues.userId) c.set('userId', contextValues.userId);
    await next();
  });

  app.route('/api/books', booksRouter);
  return { app, mockDB };
};

describe('Book deduplication API', () => {
  let consoleErrorSpy;
  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => consoleErrorSpy.mockRestore());

  // ── Owner gating ──────────────────────────────────────────────────────────
  describe('owner-only gate', () => {
    it('rejects non-owner on GET /duplicates', async () => {
      const { app } = createTestApp({ organizationId: 'org-1', userRole: 'teacher' });
      const res = await app.request('/api/books/duplicates');
      expect(res.status).toBe(403);
    });

    it('rejects non-owner on POST /merge', async () => {
      const { app } = createTestApp({ organizationId: 'org-1', userRole: 'admin' });
      const res = await app.request('/api/books/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalId: 'a', duplicateIds: ['b'] }),
      });
      expect(res.status).toBe(403);
    });
  });

  // ── Detection ─────────────────────────────────────────────────────────────
  describe('GET /api/books/duplicates', () => {
    it('returns clusters for books that share an ISBN', async () => {
      const sharedIsbnBooks = [
        {
          id: 'b1',
          title: 'The BFG',
          author: 'Roald Dahl',
          isbn: '978-0-14-031647-5',
          created_at: '2024-01-01',
        },
        {
          id: 'b2',
          title: 'The B.F.G.',
          author: 'Roald Dahl',
          isbn: '9780140316475',
          created_at: '2024-02-01',
        },
      ];
      const { app, mockDB } = createTestApp({ userRole: 'owner' });
      mockDB.prepare.mockImplementation((sql) => ({
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({
          results:
            sql.includes('reading_sessions') || sql.includes('org_book_selections')
              ? []
              : sql.includes('isbn IS NOT NULL')
                ? sharedIsbnBooks
                : [],
        }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      }));

      const res = await app.request('/api/books/duplicates');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.totalClusters).toBe(1);
      expect(data.clusters[0].books).toHaveLength(2);
      // Both have an ISBN → tie broken by oldest created_at (b1).
      expect(data.clusters[0].suggestedCanonicalId).toBe('b1');
    });

    it('returns an empty result set when nothing is duplicated', async () => {
      const { app } = createTestApp({ userRole: 'owner' });
      const res = await app.request('/api/books/duplicates');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ clusters: [], totalClusters: 0, totalDuplicateBooks: 0 });
    });
  });

  // ── Merge validation ──────────────────────────────────────────────────────
  describe('POST /api/books/merge — validation', () => {
    const merge = (body) => {
      const { app } = createTestApp({ userRole: 'owner', userId: 'u1' });
      return app.request('/api/books/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    };

    it('rejects a missing canonicalId', async () => {
      expect((await merge({ duplicateIds: ['b'] })).status).toBe(400);
    });
    it('rejects empty duplicateIds', async () => {
      expect((await merge({ canonicalId: 'a', duplicateIds: [] })).status).toBe(400);
    });
    it('rejects canonicalId appearing in duplicateIds', async () => {
      expect((await merge({ canonicalId: 'a', duplicateIds: ['a', 'b'] })).status).toBe(400);
    });
  });

  // ── Merge happy path ──────────────────────────────────────────────────────
  describe('POST /api/books/merge — execution', () => {
    it('merges duplicates atomically and reports a summary', async () => {
      const books = [
        { id: 'keep', title: 'Matilda', author: 'Roald Dahl', isbn: '123', description: 'A story' },
        { id: 'dup', title: 'Matilda', author: 'Roald Dahl', isbn: '123', description: '' },
      ];
      const { app, mockDB } = createTestApp(
        { userRole: 'owner', userId: 'u1' },
        { allResults: { results: books } }
      );

      const res = await app.request('/api/books/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalId: 'keep', duplicateIds: ['dup'] }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.canonicalId).toBe('keep');
      expect(data.booksMerged).toBe(1);
      expect(data.sessionsRepointed).toBe(1);
      // The whole merge runs in a single atomic batch.
      expect(mockDB.batch).toHaveBeenCalledTimes(1);
      const statements = mockDB.batch.mock.calls[0][0];
      // repoint sessions + current_book, move + delete selections, union genres,
      // delete metadata log, delete books = 7 base statements.
      expect(statements.length).toBeGreaterThanOrEqual(7);
    });

    it('404s when the canonical book does not exist', async () => {
      const { app } = createTestApp(
        { userRole: 'owner', userId: 'u1' },
        { allResults: { results: [{ id: 'dup', title: 'X' }] } }
      );
      const res = await app.request('/api/books/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalId: 'keep', duplicateIds: ['dup'] }),
      });
      expect(res.status).toBe(404);
    });
  });

  // ── ISBN verification ───────────────────────────────────────────────────
  describe('POST /api/books/verify-isbns', () => {
    it('rejects non-owner', async () => {
      const { app } = createTestApp({ userRole: 'teacher' });
      const res = await app.request('/api/books/verify-isbns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbns: ['9780140316476'] }),
      });
      expect(res.status).toBe(403);
    });

    it('resolves ISBNs to titles, de-duplicates, and reports found/not-found', async () => {
      lookupISBN.mockImplementation(async (isbn) =>
        isbn === '9780140316476' ? { isbn, title: 'Matilda', author: 'Roald Dahl' } : null
      );
      const { app } = createTestApp({ userRole: 'owner' });
      const res = await app.request('/api/books/verify-isbns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // first two are the same ISBN (hyphenated) → de-duped to one lookup
        body: JSON.stringify({ isbns: ['9780140316476', '978-0-14-031647-6', '9780143120858'] }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.results).toHaveLength(2);
      expect(data.results.find((r) => r.isbn === '9780140316476')).toMatchObject({
        found: true,
        title: 'Matilda',
        author: 'Roald Dahl',
      });
      expect(data.results.find((r) => r.isbn === '9780143120858')).toMatchObject({
        found: false,
        title: null,
      });
      // The invalid/short entries never reach the lookup.
      expect(lookupISBN).toHaveBeenCalledTimes(2);
    });

    it('ignores invalid ISBNs (bad check digit / wrong length)', async () => {
      lookupISBN.mockResolvedValue(null);
      const { app } = createTestApp({ userRole: 'owner' });
      const res = await app.request('/api/books/verify-isbns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbns: ['111', 'not-an-isbn', '9780140316470'] }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.results).toEqual([]);
      expect(lookupISBN).not.toHaveBeenCalled();
    });
  });
});
