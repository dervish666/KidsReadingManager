import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/providers/openLibraryProvider', () => ({
  fetchMetadata: vi.fn(),
}));
vi.mock('../../services/providers/googleBooksProvider', () => ({
  fetchMetadata: vi.fn(),
}));
vi.mock('../../services/providers/hardcoverProvider', () => ({
  fetchMetadata: vi.fn(),
}));

import { enrichBook } from '../../services/metadataService';
import { fetchMetadata as olFetch } from '../../services/providers/openLibraryProvider';
import { fetchMetadata as gbFetch } from '../../services/providers/googleBooksProvider';
import { fetchMetadata as hcFetch } from '../../services/providers/hardcoverProvider';

const baseConfig = {
  providerChain: ['hardcover', 'googlebooks', 'openlibrary'],
  hardcoverApiKey: 'hc-key',
  googleBooksApiKey: 'gb-key',
  fetchCovers: false,
};

describe('metadataService.enrichBook', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('merges results from multiple providers (first non-empty wins)', async () => {
    // Hardcover returns author + series but no description
    hcFetch.mockResolvedValueOnce({
      author: 'Julia Donaldson',
      description: null,
      genres: null,
      isbn: null,
      pageCount: null,
      publicationYear: null,
      seriesName: 'Gruffalo Series',
      seriesNumber: 1,
      coverUrl: null,
    });

    // Google Books returns description + ISBN but no series
    gbFetch.mockResolvedValueOnce({
      author: 'J. Donaldson',
      description: 'A mouse walks through the woods.',
      genres: ['Juvenile Fiction'],
      isbn: '9780142403877',
      pageCount: 32,
      publicationYear: 1999,
      seriesName: null,
      seriesNumber: null,
      coverUrl: null,
    });

    // OpenLibrary not called because all fields are filled after Google Books

    const result = await enrichBook({ id: 'book1', title: 'The Gruffalo', author: '' }, baseConfig);

    // Author from Hardcover (first provider), description from Google Books
    expect(result.merged.author).toBe('Julia Donaldson');
    expect(result.merged.description).toBe('A mouse walks through the woods.');
    expect(result.merged.seriesName).toBe('Gruffalo Series');
    expect(result.merged.isbn).toBe('9780142403877');
    expect(result.log).toHaveLength(2); // Two providers contributed
    expect(olFetch).not.toHaveBeenCalled(); // Short-circuited
  });

  it('falls through to next provider when first returns empty', async () => {
    hcFetch.mockResolvedValueOnce({
      author: null,
      description: null,
      genres: null,
      isbn: null,
      pageCount: null,
      publicationYear: null,
      seriesName: null,
      seriesNumber: null,
      coverUrl: null,
    });

    gbFetch.mockResolvedValueOnce({
      author: null,
      description: null,
      genres: null,
      isbn: null,
      pageCount: null,
      publicationYear: null,
      seriesName: null,
      seriesNumber: null,
      coverUrl: null,
    });

    olFetch.mockResolvedValueOnce({
      author: 'Julia Donaldson',
      description: 'A story.',
      genres: null,
      isbn: null,
      pageCount: null,
      publicationYear: 1999,
      seriesName: null,
      seriesNumber: null,
      coverUrl: null,
    });

    const result = await enrichBook({ id: 'book1', title: 'The Gruffalo' }, baseConfig);

    expect(result.merged.author).toBe('Julia Donaldson');
    expect(result.merged.publicationYear).toBe(1999);
    expect(olFetch).toHaveBeenCalled();
  });

  it('skips providers not in the chain', async () => {
    olFetch.mockResolvedValueOnce({
      author: 'Julia Donaldson',
      description: 'A story.',
      genres: null,
      isbn: null,
      pageCount: 32,
      publicationYear: 1999,
      seriesName: null,
      seriesNumber: null,
      coverUrl: null,
    });

    const result = await enrichBook(
      { id: 'book1', title: 'The Gruffalo' },
      { ...baseConfig, providerChain: ['openlibrary'] }
    );

    expect(result.merged.author).toBe('Julia Donaldson');
    expect(hcFetch).not.toHaveBeenCalled();
    expect(gbFetch).not.toHaveBeenCalled();
  });

  it('tracks which provider supplied which fields in the log', async () => {
    hcFetch.mockResolvedValueOnce({
      author: 'Julia Donaldson',
      description: null,
      genres: null,
      isbn: null,
      pageCount: null,
      publicationYear: null,
      seriesName: 'Gruffalo Series',
      seriesNumber: 1,
      coverUrl: null,
    });

    gbFetch.mockResolvedValueOnce({
      author: 'J. Donaldson',
      description: 'A story.',
      genres: ['Fiction'],
      isbn: '9780142403877',
      pageCount: 32,
      publicationYear: 1999,
      seriesName: null,
      seriesNumber: null,
      coverUrl: null,
    });

    const result = await enrichBook({ id: 'book1', title: 'The Gruffalo' }, baseConfig);

    const hcLog = result.log.find((l) => l.provider === 'hardcover');
    expect(hcLog.fields).toContain('author');
    expect(hcLog.fields).toContain('seriesName');

    const gbLog = result.log.find((l) => l.provider === 'googlebooks');
    expect(gbLog.fields).toContain('description');
    expect(gbLog.fields).toContain('isbn');
  });

  it('drops wrong-typed field values so a provider cannot poison the write', async () => {
    // Hardcover-style misshape: coverUrl is an object (its raw cached_image),
    // seriesNumber is a non-numeric string, a genre entry is an object.
    hcFetch.mockResolvedValueOnce({
      author: 'Julia Donaldson',
      description: null,
      genres: ['Picture Books', { tag: 'objectish' }],
      isbn: null,
      pageCount: null,
      publicationYear: null,
      seriesName: 'Gruffalo Series',
      seriesNumber: 'not-a-number',
      coverUrl: { url: 'https://example.com/c.jpg', color: '#abc' },
    });
    gbFetch.mockResolvedValueOnce({
      author: null,
      description: 'A story.',
      genres: null,
      isbn: '9780142403877',
      pageCount: 32,
      publicationYear: 1999,
      seriesName: null,
      seriesNumber: null,
      coverUrl: null,
    });

    const result = await enrichBook(
      { id: 'book1', title: 'The Gruffalo' },
      { ...baseConfig, fetchCovers: true }
    );

    // Object coverUrl dropped — never reaches merged (would break D1 .bind())
    expect(result.merged.coverUrl == null).toBe(true);
    // Non-numeric seriesNumber dropped; valid string fields kept
    expect(result.merged.seriesNumber == null).toBe(true);
    expect(result.merged.author).toBe('Julia Donaldson');
    expect(result.merged.seriesName).toBe('Gruffalo Series');
    // Genres filtered to the string entry only
    expect(result.merged.genres).toEqual(['Picture Books']);
    // Every retained value is a D1-bindable primitive (or string[])
    for (const [field, value] of Object.entries(result.merged)) {
      if (field === 'genres') {
        expect(value.every((g) => typeof g === 'string')).toBe(true);
      } else {
        expect(['string', 'number'].includes(typeof value)).toBe(true);
      }
    }
  });
});
