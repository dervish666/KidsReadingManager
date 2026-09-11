/**
 * Pupils' own books: a book a child brings from home is linked to the org
 * with org_book_selections.is_available = 0 so sessions can be logged
 * against it, but it stays out of the library (and so out of every
 * recommendation query, which filters is_available = 1).
 */
import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../utils/crypto.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    decryptSensitiveData: vi.fn().mockResolvedValue('decrypted-api-key'),
  };
});
vi.mock('../../routes/metadata.js', () => ({ getConfigWithKeys: vi.fn() }));
vi.mock('../../services/metadataService.js', () => ({ enrichBook: vi.fn() }));
vi.mock('../../utils/isbnLookup.js', () => ({ lookupISBN: vi.fn().mockResolvedValue(null) }));

const { booksRouter } = await import('../../routes/books.js');
const { rowToBook } = await import('../../utils/rowMappers.js');

const createMockDB = () => {
  const chain = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue({ results: [], success: true }),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
  };
  return {
    prepare: vi.fn().mockReturnValue(chain),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    _chain: chain,
  };
};

const createTestApp = (role = 'teacher') => {
  const app = new Hono();
  const mockDB = createMockDB();
  app.onError((error, c) => c.json({ message: error.message }, error.status || 500));
  app.use('*', async (c, next) => {
    c.env = { JWT_SECRET: 'test-secret', READING_MANAGER_DB: mockDB };
    c.set('userId', 'user-1');
    c.set('organizationId', 'org-1');
    c.set('userRole', role);
    c.set('user', { sub: 'user-1', org: 'org-1', role });
    await next();
  });
  app.route('/api/books', booksRouter);
  return { app, mockDB };
};

const request = (app, method, path, body) =>
  app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

/** SQL + bind args of the first prepared statement matching `pattern`. */
const findStatement = (mockDB, pattern) => {
  const idx = mockDB.prepare.mock.calls.findIndex(([sql]) => pattern.test(sql));
  if (idx === -1) return null;
  return { sql: mockDB.prepare.mock.calls[idx][0], args: mockDB._chain.bind.mock.calls[idx] };
};

const bookRow = (overrides = {}) => ({
  id: 'book-1',
  title: 'Dog Man',
  author: 'Dav Pilkey',
  genre_ids: '[]',
  reading_level: '2.5',
  isbn: '9781338236576',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...overrides,
});

describe('rowToBook ownership flag', () => {
  it('maps is_available = 0 to fromHome', () => {
    expect(rowToBook(bookRow({ is_available: 0 })).fromHome).toBe(true);
    expect(rowToBook(bookRow({ is_available: 1 })).fromHome).toBe(false);
  });

  it('is false when the query did not select the column', () => {
    expect(rowToBook(bookRow()).fromHome).toBe(false);
  });
});

describe('GET /api/books?all=true', () => {
  it('includes pupils’ own books and flags them in the minimal list', async () => {
    const { app, mockDB } = createTestApp();
    mockDB._chain.all.mockResolvedValue({
      results: [
        { id: 'b1', title: 'Library Book', author: 'A', is_available: 1 },
        { id: 'b2', title: 'Home Book', author: 'B', is_available: 0 },
      ],
    });

    const res = await request(app, 'GET', '/api/books?all=true&fields=minimal');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([
      { id: 'b1', title: 'Library Book', author: 'A', fromHome: false },
      { id: 'b2', title: 'Home Book', author: 'B', fromHome: true },
    ]);
    const { sql } = findStatement(mockDB, /FROM books b/);
    expect(sql).not.toContain('is_available = 1');
  });
});

describe('POST /api/books', () => {
  it('links to the library by default', async () => {
    const { app, mockDB } = createTestApp();
    const res = await request(app, 'POST', '/api/books', { title: 'New Book' });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.fromHome).toBe(false);
    const { args } = findStatement(mockDB, /INSERT OR IGNORE INTO org_book_selections/);
    expect(args[3]).toBe(1);
  });

  it('links as a pupil’s own copy when fromHome is true', async () => {
    const { app, mockDB } = createTestApp();
    const res = await request(app, 'POST', '/api/books', { title: 'Home Book', fromHome: true });
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.fromHome).toBe(true);
    const { args } = findStatement(mockDB, /INSERT OR IGNORE INTO org_book_selections/);
    expect(args[3]).toBe(0);
  });

  it('treats a non-boolean fromHome as a library book', async () => {
    const { app, mockDB } = createTestApp();
    await request(app, 'POST', '/api/books', { title: 'Odd', fromHome: 'yes' });
    const { args } = findStatement(mockDB, /INSERT OR IGNORE INTO org_book_selections/);
    expect(args[3]).toBe(1);
  });
});

describe('PUT /api/books/:id/ownership', () => {
  it('rejects readonly users', async () => {
    const { app } = createTestApp('readonly');
    const res = await request(app, 'PUT', '/api/books/book-1/ownership', { fromHome: false });
    expect(res.status).toBe(403);
  });

  it('requires a boolean fromHome', async () => {
    const { app } = createTestApp();
    const res = await request(app, 'PUT', '/api/books/book-1/ownership', { fromHome: 'no' });
    expect(res.status).toBe(400);
  });

  it('404s when the book is not linked to this org', async () => {
    const { app, mockDB } = createTestApp();
    mockDB._chain.run.mockResolvedValue({ success: true, meta: { changes: 0 } });
    const res = await request(app, 'PUT', '/api/books/book-1/ownership', { fromHome: false });
    expect(res.status).toBe(404);
  });

  it('moves a home copy into the library and returns the updated book', async () => {
    const { app, mockDB } = createTestApp();
    mockDB._chain.first.mockResolvedValue(bookRow({ is_available: 1 }));

    const res = await request(app, 'PUT', '/api/books/book-1/ownership', { fromHome: false });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.id).toBe('book-1');
    expect(data.fromHome).toBe(false);
    const { sql, args } = findStatement(mockDB, /UPDATE org_book_selections SET is_available/);
    expect(sql).toContain('WHERE organization_id = ? AND book_id = ?');
    expect(args).toEqual([1, 'org-1', 'book-1']);
  });

  it('can move a library book back to a pupil’s own copy', async () => {
    const { app, mockDB } = createTestApp();
    mockDB._chain.first.mockResolvedValue(bookRow({ is_available: 0 }));

    const res = await request(app, 'PUT', '/api/books/book-1/ownership', { fromHome: true });
    const data = await res.json();

    expect(data.fromHome).toBe(true);
    const { args } = findStatement(mockDB, /UPDATE org_book_selections SET is_available/);
    expect(args[0]).toBe(0);
  });
});

describe('GET /api/books/isbn/:isbn', () => {
  it('reports a known home copy as fromHome, not inLibrary', async () => {
    const { app, mockDB } = createTestApp();
    mockDB._chain.first
      .mockResolvedValueOnce(bookRow()) // books lookup by ISBN
      .mockResolvedValueOnce({ is_available: 0 }); // org link

    const res = await request(app, 'GET', '/api/books/isbn/9781338236576');
    const data = await res.json();

    expect(data.source).toBe('local');
    expect(data.inLibrary).toBe(false);
    expect(data.fromHome).toBe(true);
  });

  it('reports a library book as inLibrary', async () => {
    const { app, mockDB } = createTestApp();
    mockDB._chain.first.mockResolvedValueOnce(bookRow()).mockResolvedValueOnce({ is_available: 1 });

    const data = await (await request(app, 'GET', '/api/books/isbn/9781338236576')).json();
    expect(data.inLibrary).toBe(true);
    expect(data.fromHome).toBe(false);
  });

  it('reports an unlinked book as neither', async () => {
    const { app, mockDB } = createTestApp();
    mockDB._chain.first.mockResolvedValueOnce(bookRow()).mockResolvedValueOnce(null);

    const data = await (await request(app, 'GET', '/api/books/isbn/9781338236576')).json();
    expect(data.inLibrary).toBe(false);
    expect(data.fromHome).toBe(false);
  });
});

describe('POST /api/books/scan', () => {
  it('links an existing book as a pupil’s own copy without demoting a library copy', async () => {
    const { app, mockDB } = createTestApp();
    mockDB._chain.first
      .mockResolvedValueOnce(bookRow()) // existing book by ISBN
      .mockResolvedValueOnce({ is_available: 0 }); // RETURNING after upsert

    const res = await request(app, 'POST', '/api/books/scan', {
      isbn: '9781338236576',
      confirm: true,
      fromHome: true,
    });
    const data = await res.json();

    expect(data.action).toBe('linked');
    expect(data.book.fromHome).toBe(true);
    const { sql, args } = findStatement(mockDB, /INSERT INTO org_book_selections/);
    expect(args[3]).toBe(0);
    // Library wins on conflict: a school that already holds the book keeps it.
    expect(sql).toContain('MAX(org_book_selections.is_available, excluded.is_available)');
  });

  it('reports the library copy when a home scan hits a book the school holds', async () => {
    const { app, mockDB } = createTestApp();
    mockDB._chain.first.mockResolvedValueOnce(bookRow()).mockResolvedValueOnce({ is_available: 1 });

    const data = await (
      await request(app, 'POST', '/api/books/scan', {
        isbn: '9781338236576',
        confirm: true,
        fromHome: true,
      })
    ).json();
    expect(data.book.fromHome).toBe(false);
  });

  it('adds to the library by default', async () => {
    const { app, mockDB } = createTestApp();
    mockDB._chain.first.mockResolvedValueOnce(bookRow()).mockResolvedValueOnce({ is_available: 1 });

    const data = await (
      await request(app, 'POST', '/api/books/scan', { isbn: '9781338236576', confirm: true })
    ).json();
    expect(data.book.fromHome).toBe(false);
    const { args } = findStatement(mockDB, /INSERT INTO org_book_selections/);
    expect(args[3]).toBe(1);
  });
});
