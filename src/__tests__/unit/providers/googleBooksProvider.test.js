import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/helpers.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchMetadata } from '../../../services/providers/googleBooksProvider';
import { fetchWithTimeout } from '../../../utils/helpers.js';

describe('googleBooksProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns metadata from Google Books API', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        items: [{
          volumeInfo: {
            title: 'The Gruffalo',
            authors: ['Julia Donaldson'],
            description: 'A mouse walks through the woods.',
            publishedDate: '1999-03-23',
            pageCount: 32,
            categories: ['Juvenile Fiction'],
            industryIdentifiers: [
              { type: 'ISBN_13', identifier: '9780142403877' },
            ],
            imageLinks: { thumbnail: 'https://books.google.com/cover.jpg' },
          },
        }],
      }),
    });

    const result = await fetchMetadata(
      { title: 'The Gruffalo', author: 'Julia Donaldson' },
      'test-api-key',
    );

    expect(result.author).toBe('Julia Donaldson');
    expect(result.description).toBe('A mouse walks through the woods.');
    expect(result.isbn).toBe('9780142403877');
    expect(result.publicationYear).toBe(1999);
    expect(result.pageCount).toBe(32);
    expect(result.genres).toEqual(['Juvenile Fiction']);
    expect(result.coverUrl).toBe('https://books.google.com/cover.jpg');
  });

  it('returns empty result without API key', async () => {
    const result = await fetchMetadata({ title: 'Test' }, null);
    expect(result.author).toBeNull();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('returns empty result on 429', async () => {
    fetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 429 });
    const result = await fetchMetadata({ title: 'Test' }, 'key');
    expect(result.author).toBeNull();
    expect(result.rateLimited).toBe(true);
  });
});
