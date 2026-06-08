import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the batch processing helper directly rather than HTTP integration.
// This validates the core logic: book selection, enrichment, DB updates, progress.
import { processBatch, processJobBatch } from '../../services/metadataService';

vi.mock('../../services/providers/openLibraryProvider', () => ({
  fetchMetadata: vi.fn(),
}));
vi.mock('../../services/providers/googleBooksProvider', () => ({
  fetchMetadata: vi.fn(),
}));
vi.mock('../../services/providers/hardcoverProvider', () => ({
  fetchMetadata: vi.fn(),
}));

import { fetchMetadata as olFetch } from '../../services/providers/openLibraryProvider';

describe('metadataService.processBatch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('processes books and returns progress', async () => {
    olFetch.mockResolvedValue({
      author: 'Julia Donaldson',
      description: 'A story.',
      genres: ['Fiction'],
      isbn: '9780142403877',
      pageCount: 32,
      publicationYear: 1999,
      seriesName: null,
      seriesNumber: null,
      coverUrl: null,
    });

    const books = [
      { id: 'b1', title: 'Book 1', author: '', description: '' },
      { id: 'b2', title: 'Book 2', author: '', description: '' },
    ];

    const config = {
      providerChain: ['openlibrary'],
      rateLimitDelayMs: 0, // No delay in tests
      fetchCovers: false,
    };

    const results = [];
    const progress = await processBatch(books, config, {
      onBookResult: (bookId, merged, log) => results.push({ bookId, merged, log }),
      delayMs: 0,
    });

    expect(results).toHaveLength(2);
    expect(results[0].merged.author).toBe('Julia Donaldson');
    expect(progress.processedBooks).toBe(2);
    expect(progress.enrichedBooks).toBe(2);
  });

  it('handles rate limiting by recording the error', async () => {
    olFetch.mockResolvedValue({
      author: null,
      description: null,
      genres: null,
      isbn: null,
      pageCount: null,
      publicationYear: null,
      seriesName: null,
      seriesNumber: null,
      coverUrl: null,
      rateLimited: true,
    });

    const books = [{ id: 'b1', title: 'Book 1' }];

    const config = {
      providerChain: ['openlibrary'],
      rateLimitDelayMs: 0,
      fetchCovers: false,
    };

    const results = [];
    const progress = await processBatch(books, config, {
      onBookResult: (bookId, merged, _log) => results.push({ bookId, merged }),
      delayMs: 0,
    });

    expect(progress.processedBooks).toBe(1);
    expect(progress.enrichedBooks).toBe(0);
  });
});

describe('metadataService.processJobBatch — ISBN de-collision', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // Minimal stateful D1 mock: dispatches SELECTs on their SQL, captures batches.
  function makeMockDb({ books, genres = [], collisionRows = [] }) {
    const batches = [];
    const mkStmt = (sql, params = []) => ({
      sql,
      params,
      bind: (...p) => mkStmt(sql, p),
      async all() {
        if (/FROM books WHERE id >/.test(sql)) return { results: books };
        if (/FROM genres/.test(sql)) return { results: genres };
        if (/FROM books WHERE isbn IN/.test(sql)) return { results: collisionRows };
        return { results: [] };
      },
      async first() {
        return null;
      },
      async run() {
        return { success: true };
      },
    });
    const db = {
      prepare: (sql) => mkStmt(sql),
      async batch(stmts) {
        batches.push(stmts);
        return stmts.map(() => ({ success: true }));
      },
    };
    return { db, batches };
  }

  const findUpdate = (batches, bookId) =>
    batches
      .flat()
      .find((s) => /^UPDATE books SET/.test(s.sql) && s.params[s.params.length - 1] === bookId);

  it('drops an enriched ISBN already owned by another book, keeping other fields', async () => {
    // a: free ISBN 111 · b: ISBN 999 already owned by book z · c: 111 again (intra-batch dup of a)
    olFetch.mockImplementation((book) => {
      const isbnByBook = { a: '111', b: '999', c: '111' };
      return Promise.resolve({
        author: `Author ${book.id}`,
        description: null,
        genres: null,
        isbn: isbnByBook[book.id],
        pageCount: null,
        publicationYear: null,
        seriesName: null,
        seriesNumber: null,
        coverUrl: null,
      });
    });

    const { db, batches } = makeMockDb({
      books: [
        { id: 'a', title: 'A', author: '', isbn: '' },
        { id: 'b', title: 'B', author: '', isbn: '' },
        { id: 'c', title: 'C', author: '', isbn: '' },
      ],
      collisionRows: [{ id: 'z', isbn: '999' }], // 999 already taken in the catalog
    });

    const job = {
      id: 'job1',
      job_type: 'refresh_all',
      status: 'running',
      organization_id: null,
      processed_books: 0,
      enriched_books: 0,
      error_count: 0,
      last_book_id: null,
      provider_stats: null,
      include_covers: 0,
    };
    const config = { providerChain: ['openlibrary'], rateLimitDelayMs: 0, fetchCovers: false };

    const result = await processJobBatch(db, job, config, {});

    expect(result.processedBooks).toBe(3);

    // a keeps its free ISBN
    const updA = findUpdate(batches, 'a');
    expect(updA.sql).toMatch(/isbn = \?/);
    expect(updA.params).toContain('111');

    // b: collision with existing book z → ISBN dropped, author still written
    const updB = findUpdate(batches, 'b');
    expect(updB.sql).not.toMatch(/isbn = \?/);
    expect(updB.sql).toMatch(/author = \?/);
    expect(updB.params).not.toContain('999');

    // c: intra-batch dup of a's 111 → ISBN dropped, author still written
    const updC = findUpdate(batches, 'c');
    expect(updC.sql).not.toMatch(/isbn = \?/);
    expect(updC.sql).toMatch(/author = \?/);
  });
});
