import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { booksRouter } from '../../routes/books.js';

const TEST_SECRET = 'test-jwt-secret-for-testing';

const createMockDB = (overrides = {}) => {
  const prepareChain = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue(overrides.allResults || { results: [], success: true }),
    first: vi.fn().mockResolvedValue(overrides.firstResult || null),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
  };

  return {
    prepare: vi.fn().mockReturnValue(prepareChain),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    _chain: prepareChain,
    ...overrides
  };
};

const createTestApp = (contextValues = {}, dbOverrides = {}) => {
  const app = new Hono();
  const mockDB = createMockDB(dbOverrides);

  app.onError((error, c) => {
    const status = error.status || 500;
    return c.json({ status: 'error', message: error.message }, status);
  });

  app.use('*', async (c, next) => {
    c.env = { JWT_SECRET: TEST_SECRET, READING_MANAGER_DB: mockDB };
    if (contextValues.organizationId) c.set('organizationId', contextValues.organizationId);
    if (contextValues.userRole) c.set('userRole', contextValues.userRole);
    await next();
  });

  app.route('/api/books', booksRouter);
  return { app, mockDB };
};

describe('Book Import API', () => {
  let consoleErrorSpy;
  let consoleLogSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console output during tests
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('POST /api/books/import/preview', () => {
    it('should categorize books into matched, fuzzy, new, and conflicts', async () => {
      const existingBooks = [
        { id: 'book-1', title: 'The BFG', author: 'Roald Dahl', reading_level: '3.0' },
        { id: 'book-2', title: 'Matilda', author: 'Roald Dahl', reading_level: '4.0' },
        { id: 'book-3', title: 'The Hobbit', author: 'J.R.R. Tolkien', reading_level: null }
      ];

      const { app, mockDB } = createTestApp(
        { organizationId: 'org-123', userRole: 'teacher' },
        { allResults: { results: existingBooks } }
      );

      // Mock the org_book_selections check to return empty (no books in library yet)
      mockDB.prepare.mockImplementation((sql) => {
        const chain = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: sql.includes('org_book_selections') ? [] : existingBooks
          }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true })
        };
        return chain;
      });

      const importBooks = [
        { title: 'The BFG', author: 'Roald Dahl', readingLevel: '3.0' }, // exact match
        { title: 'The Hobit', author: 'Tolkien' }, // fuzzy match (typo in title, short author)
        { title: 'New Book', author: 'New Author' }, // new
        { title: 'Matilda', author: 'Roald Dahl', readingLevel: '5.0' } // conflict (different level)
      ];

      const res = await app.request('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: importBooks })
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.matched).toHaveLength(1);
      expect(data.matched[0].importedBook.title).toBe('The BFG');

      expect(data.possibleMatches).toHaveLength(1);
      expect(data.possibleMatches[0].importedBook.title).toBe('The Hobit');
      expect(data.possibleMatches[0].existingBook.title).toBe('The Hobbit');

      expect(data.newBooks).toHaveLength(1);
      expect(data.newBooks[0].importedBook.title).toBe('New Book');

      expect(data.conflicts).toHaveLength(1);
      expect(data.conflicts[0].importedBook.title).toBe('Matilda');
      expect(data.conflicts[0].existingBook.reading_level).toBe('4.0');
      expect(data.conflicts[0].importedBook.readingLevel).toBe('5.0');
    });

    it('should detect books already in organization library', async () => {
      const existingBooks = [
        { id: 'book-1', title: 'The BFG', author: 'Roald Dahl' }
      ];
      const orgSelections = [
        { book_id: 'book-1', organization_id: 'org-123' }
      ];

      const { app, mockDB } = createTestApp(
        { organizationId: 'org-123', userRole: 'teacher' },
        { allResults: { results: existingBooks } }
      );

      // Mock the org_book_selections check
      mockDB.prepare.mockImplementation((sql) => {
        const chain = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: sql.includes('org_book_selections') ? orgSelections : existingBooks
          }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true })
        };
        return chain;
      });

      const res = await app.request('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: [{ title: 'The BFG', author: 'Roald Dahl' }] })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.alreadyInLibrary).toHaveLength(1);
      expect(data.alreadyInLibrary[0].importedBook.title).toBe('The BFG');
    });

    it('should require authentication', async () => {
      const { app } = createTestApp({}, {});

      const res = await app.request('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: [] })
      });

      // 401 for unauthenticated (no userRole), 403 for wrong role
      expect(res.status).toBe(401);
    });

    it('should reject readonly users', async () => {
      const { app } = createTestApp(
        { organizationId: 'org-123', userRole: 'readonly' },
        {}
      );

      const res = await app.request('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: [{ title: 'Test' }] })
      });

      expect(res.status).toBe(403);
    });

    it('should require array of books in request body', async () => {
      const { app, mockDB } = createTestApp(
        { organizationId: 'org-123', userRole: 'teacher' },
        {}
      );

      const res = await app.request('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: 'not an array' })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('array');
    });

    it('should skip books without titles', async () => {
      const existingBooks = [];

      const { app, mockDB } = createTestApp(
        { organizationId: 'org-123', userRole: 'teacher' },
        { allResults: { results: existingBooks } }
      );

      mockDB.prepare.mockImplementation((sql) => {
        const chain = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true })
        };
        return chain;
      });

      const res = await app.request('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: [
          { title: '', author: 'Author' }, // empty title
          { author: 'Author Only' }, // no title
          { title: '   ', author: 'Whitespace' }, // whitespace title
          { title: 'Valid Book', author: 'Valid Author' } // valid
        ]})
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.newBooks).toHaveLength(1);
      expect(data.newBooks[0].importedBook.title).toBe('Valid Book');
    });

    it('should return summary statistics', async () => {
      const existingBooks = [
        { id: 'book-1', title: 'Existing Book', author: 'Author', reading_level: '3.0' }
      ];

      const { app, mockDB } = createTestApp(
        { organizationId: 'org-123', userRole: 'teacher' },
        { allResults: { results: existingBooks } }
      );

      mockDB.prepare.mockImplementation((sql) => {
        const chain = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: sql.includes('org_book_selections') ? [] : existingBooks
          }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true })
        };
        return chain;
      });

      const res = await app.request('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: [
          { title: 'Existing Book', author: 'Author', readingLevel: '3.0' }, // matched
          { title: 'New Book' } // new
        ]})
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.summary).toBeDefined();
      expect(data.summary.total).toBe(2);
      expect(data.summary.matched).toBe(1);
      expect(data.summary.newBooks).toBe(1);
    });

    it('should allow admins to use the endpoint', async () => {
      const { app, mockDB } = createTestApp(
        { organizationId: 'org-123', userRole: 'admin' },
        { allResults: { results: [] } }
      );

      mockDB.prepare.mockImplementation((sql) => {
        const chain = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true })
        };
        return chain;
      });

      const res = await app.request('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: [{ title: 'Test Book' }] })
      });

      expect(res.status).toBe(200);
    });

    it('should require multi-tenant mode', async () => {
      const { app } = createTestApp(
        { userRole: 'teacher' }, // no organizationId
        {}
      );

      const res = await app.request('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: [{ title: 'Test' }] })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toContain('Multi-tenant mode required');
    });
  });
});
