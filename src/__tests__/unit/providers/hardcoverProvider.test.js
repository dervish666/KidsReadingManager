import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/helpers.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchMetadata } from '../../../services/providers/hardcoverProvider';
import { fetchWithTimeout } from '../../../utils/helpers.js';

describe('hardcoverProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns metadata with series data from Hardcover', async () => {
    // Search response
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            search: {
              results: JSON.stringify({
                hits: [
                  {
                    document: { id: 42, title: 'The Gruffalo', author_names: ['Julia Donaldson'] },
                  },
                ],
              }),
            },
          },
        }),
    });

    // Book details response
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            books: [
              {
                id: 42,
                title: 'The Gruffalo',
                description: 'A mouse walks through the woods.',
                pages: 32,
                release_year: 1999,
                cached_contributors: JSON.stringify([{ author: { name: 'Julia Donaldson' } }]),
                cached_tags: JSON.stringify([{ tag: 'childrens' }, { tag: 'picture-books' }]),
                cached_image: 'https://hardcover.app/covers/gruffalo.jpg',
                book_series: [{ position: '1', series: { name: 'Gruffalo Series' } }],
                editions: [{ isbn_13: '9780142403877', isbn_10: null, pages: 32 }],
              },
            ],
          },
        }),
    });

    const result = await fetchMetadata(
      { title: 'The Gruffalo', author: 'Julia Donaldson' },
      'test-api-key'
    );

    expect(result.author).toBe('Julia Donaldson');
    expect(result.description).toBe('A mouse walks through the woods.');
    expect(result.isbn).toBe('9780142403877');
    expect(result.publicationYear).toBe(1999);
    expect(result.pageCount).toBe(32);
    expect(result.seriesName).toBe('Gruffalo Series');
    expect(result.seriesNumber).toBe(1);
    expect(result.coverUrl).toBe('https://hardcover.app/covers/gruffalo.jpg');
  });

  it('returns empty result without API key', async () => {
    const result = await fetchMetadata({ title: 'Test' }, null);
    expect(result.author).toBeNull();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('sets rateLimited flag on 429', async () => {
    fetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 429 });
    const result = await fetchMetadata({ title: 'Test' }, 'key');
    expect(result.rateLimited).toBe(true);
  });
});
