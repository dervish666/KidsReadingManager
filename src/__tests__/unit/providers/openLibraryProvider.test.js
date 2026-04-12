import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetchWithTimeout before importing the module
vi.mock('../../../utils/helpers.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchMetadata } from '../../../services/providers/openLibraryProvider';
import { fetchWithTimeout } from '../../../utils/helpers.js';

describe('openLibraryProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns metadata from search results', async () => {
    // Search endpoint returns a match
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          docs: [
            {
              key: '/works/OL123W',
              title: 'The Gruffalo',
              author_name: ['Julia Donaldson'],
              first_publish_year: 1999,
              isbn: ['9780142403877'],
              cover_i: 6281982,
              number_of_pages_median: 32,
              subject: ["Children's fiction", 'Animals', 'Monsters'],
            },
          ],
        }),
    });

    // Works endpoint returns description
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          description: { value: 'A mouse walks through the woods.' },
        }),
    });

    const result = await fetchMetadata({ title: 'The Gruffalo', author: 'Julia Donaldson' });

    expect(result.author).toBe('Julia Donaldson');
    expect(result.isbn).toBe('9780142403877');
    expect(result.publicationYear).toBe(1999);
    expect(result.pageCount).toBe(32);
    expect(result.description).toBe('A mouse walks through the woods.');
    expect(result.genres).toEqual(["Children's fiction", 'Animals', 'Monsters']);
    expect(result.coverUrl).toContain('6281982');
  });

  it('returns empty result when no match found', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ docs: [] }),
    });

    const result = await fetchMetadata({ title: 'Nonexistent Book XYZ123' });

    expect(result.author).toBeNull();
    expect(result.description).toBeNull();
  });

  it('returns empty result on network error', async () => {
    fetchWithTimeout.mockRejectedValueOnce(new Error('timeout'));

    const result = await fetchMetadata({ title: 'The Gruffalo' });

    expect(result.author).toBeNull();
  });
});
