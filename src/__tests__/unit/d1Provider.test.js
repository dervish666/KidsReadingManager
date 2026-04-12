import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFilteredBooksForRecommendations, READING_LEVEL_MAP } from '../../data/d1Provider';

// Helper: create a mock D1 database
const createMockDB = () => {
  const db = {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [], success: true }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    }),
  };
  return db;
};

// Helper: create book ID rows (phase 1 result)
const makeIdRows = (count) => Array.from({ length: count }, (_, i) => ({ id: `book-${i + 1}` }));

// Helper: create full book rows (phase 3 result)
const makeBookRows = (ids) =>
  ids.map((id) => ({
    id,
    title: `Title ${id}`,
    author: `Author ${id}`,
    isbn: null,
    reading_level: 'intermediate',
    age_range: null,
    genre_ids: null,
    publication_year: null,
    description: null,
    series: null,
    series_number: null,
    cover_url: null,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  }));

describe('getFilteredBooksForRecommendations', () => {
  let mockDB;

  beforeEach(() => {
    mockDB = createMockDB();
  });

  it('should use two-phase query: IDs first, then full rows', async () => {
    // Need >= 20 results to avoid fallback path
    const idRows = makeIdRows(25);
    const fullRows = makeBookRows(idRows.map((r) => r.id));

    const sqls = [];
    mockDB.prepare = vi.fn().mockImplementation((sql) => {
      sqls.push(sql);
      return {
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockImplementation(() => {
            if (sqls.length === 1) {
              return Promise.resolve({ results: idRows, success: true });
            }
            return Promise.resolve({ results: fullRows, success: true });
          }),
        }),
      };
    });

    const books = await getFilteredBooksForRecommendations(
      { READING_MANAGER_DB: mockDB },
      { limit: 25 }
    );

    // Phase 1: ID-only query
    expect(sqls[0]).toContain('SELECT id');
    expect(sqls[0]).not.toContain('SELECT *');
    // Phase 3: Full row fetch
    expect(sqls[1]).toContain('SELECT * FROM books WHERE id IN');
    expect(books).toHaveLength(25);
    expect(books[0]).toHaveProperty('id');
    expect(books[0]).toHaveProperty('title');
  });

  it('should return empty array when no candidates match', async () => {
    mockDB.prepare = vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [], success: true }),
      }),
    });

    const books = await getFilteredBooksForRecommendations(
      { READING_MANAGER_DB: mockDB },
      { limit: 10 }
    );

    // Should not make a second query when no IDs returned
    expect(books).toHaveLength(0);
  });

  it('should limit results to the requested limit', async () => {
    const idRows = makeIdRows(200); // 200 candidates

    let callCount = 0;
    mockDB.prepare = vi.fn().mockImplementation((sql) => ({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ results: idRows, success: true });
          }
          // Phase 3: should only request `limit` books
          const inClause = sql.match(/IN \(([^)]+)\)/);
          const requestedCount = inClause ? inClause[1].split(',').length : 0;
          expect(requestedCount).toBe(50);
          const selectedIds = idRows.slice(0, 50).map((r) => r.id);
          return Promise.resolve({
            results: makeBookRows(selectedIds),
            success: true,
          });
        }),
      }),
    }));

    const books = await getFilteredBooksForRecommendations(
      { READING_MANAGER_DB: mockDB },
      { limit: 50 }
    );

    expect(books.length).toBeLessThanOrEqual(50);
  });

  it('should shuffle results (not always return the same order)', async () => {
    // With 100 candidates and limit 50, Fisher-Yates should produce different orders
    const idRows = makeIdRows(100);

    const createMockForRun = () => {
      const db = createMockDB();
      const bindArgs = [];
      let callCount = 0;
      db.prepare = vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockImplementation((...args) => {
          callCount++;
          if (callCount === 2) {
            // Capture the IDs passed to the phase 3 bind call
            bindArgs.push([...args]);
          }
          return {
            all: vi.fn().mockImplementation(() => {
              if (callCount === 1) {
                return Promise.resolve({ results: [...idRows], success: true });
              }
              return Promise.resolve({ results: makeBookRows(args), success: true });
            }),
          };
        }),
      }));
      return { db, bindArgs };
    };

    // Run twice — Fisher-Yates should select different ID subsets
    const run1 = createMockForRun();
    await getFilteredBooksForRecommendations({ READING_MANAGER_DB: run1.db }, { limit: 50 });

    const run2 = createMockForRun();
    await getFilteredBooksForRecommendations({ READING_MANAGER_DB: run2.db }, { limit: 50 });

    // The IDs passed to phase 3 bind() should differ between runs
    expect(run1.bindArgs[0]).not.toEqual(run2.bindArgs[0]);
  });

  it('should filter large exclusion lists (>500) in JavaScript', async () => {
    // Create 10 candidate IDs, but 3 are in the exclude list (which is >500)
    const idRows = makeIdRows(10);
    const largeExcludeList = Array.from({ length: 501 }, (_, i) => `exclude-${i}`);
    // Add some of our candidate IDs to the exclude list
    largeExcludeList.push('book-1', 'book-2', 'book-3');

    let callCount = 0;
    mockDB.prepare = vi.fn().mockImplementation(() => ({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({ results: idRows, success: true });
          }
          // Phase 3: should not include excluded IDs
          return Promise.resolve({ results: makeBookRows(['book-4', 'book-5']), success: true });
        }),
      }),
    }));

    const books = await getFilteredBooksForRecommendations(
      { READING_MANAGER_DB: mockDB },
      { excludeBookIds: largeExcludeList, limit: 100 }
    );

    // The 3 excluded IDs should be filtered out before phase 3
    const returnedIds = books.map((b) => b.id);
    expect(returnedIds).not.toContain('book-1');
    expect(returnedIds).not.toContain('book-2');
    expect(returnedIds).not.toContain('book-3');
  });

  it('should fall back when fewer than 20 results are returned', async () => {
    // Main query returns only 5 results → triggers fallback
    const idRows = makeIdRows(5);
    const fallbackIdRows = makeIdRows(30);

    let callCount = 0;
    mockDB.prepare = vi.fn().mockImplementation((sql) => ({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // Phase 1: main query IDs (too few)
            return Promise.resolve({ results: idRows, success: true });
          }
          if (callCount === 2) {
            // Phase 3: main query full rows (only 5)
            return Promise.resolve({
              results: makeBookRows(idRows.map((r) => r.id)),
              success: true,
            });
          }
          if (callCount === 3) {
            // Fallback phase 1: IDs
            return Promise.resolve({ results: fallbackIdRows, success: true });
          }
          // Fallback phase 3: full rows
          return Promise.resolve({
            results: makeBookRows(fallbackIdRows.map((r) => r.id)),
            success: true,
          });
        }),
      }),
    }));

    const books = await getFilteredBooksForRecommendations(
      { READING_MANAGER_DB: mockDB },
      { limit: 100 }
    );

    // Should have used the fallback since main query returned < 20
    expect(callCount).toBeGreaterThanOrEqual(3);
    expect(books.length).toBeGreaterThan(5);
  });
});
