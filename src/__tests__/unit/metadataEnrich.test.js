import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the batch processing helper directly rather than HTTP integration.
// This validates the core logic: book selection, enrichment, DB updates, progress.
import { processBatch } from '../../services/metadataService';

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
