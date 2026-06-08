import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetchWithTimeout before importing the module
vi.mock('../../../utils/helpers.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchMetadata } from '../../../services/providers/bookInfoProvider';
import { fetchWithTimeout } from '../../../utils/helpers.js';

const okJson = (data) => ({ ok: true, status: 200, json: () => Promise.resolve(data) });

// A representative /work/{id} response (trimmed Goodreads-schema shape).
const harryPotterWork = {
  ForeignId: 4640799,
  Title: "Harry Potter and the Philosopher's Stone",
  Genres: ['Fantasy', 'Fiction', 'Young Adult', 'Audiobook', 'Childrens'],
  ReleaseDate: '1997-06-26 07:00:00',
  Authors: [{ ForeignId: 1077326, Name: 'J.K. Rowling' }],
  Series: [
    {
      ForeignId: 45175,
      Title: 'Harry Potter',
      LinkItems: [{ ForeignWorkId: 4640799, PositionInSeries: '1', SeriesPosition: 1 }],
    },
  ],
  Books: [
    {
      Isbn13: '9780439554930',
      NumPages: 309,
      ImageUrl: 'https://m.media-amazon.com/images/example/3.jpg',
      Description: 'Harry Potter has never even heard of Hogwarts...',
      ReleaseDate: '2003-11-01 08:00:00',
    },
  ],
};

describe('bookInfoProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('maps a search → work lookup into the provider field shape', async () => {
    fetchWithTimeout
      .mockResolvedValueOnce(okJson([{ bookId: 42844155, workId: 4640799 }])) // /search
      .mockResolvedValueOnce(okJson(harryPotterWork)); // /work/4640799

    const result = await fetchMetadata({
      title: "Harry Potter and the Philosopher's Stone",
      author: 'J.K. Rowling',
    });

    expect(result.author).toBe('J.K. Rowling');
    expect(result.isbn).toBe('9780439554930');
    expect(result.pageCount).toBe(309);
    expect(result.publicationYear).toBe(1997); // work first-published, not the 2003 edition
    expect(result.seriesName).toBe('Harry Potter');
    expect(result.seriesNumber).toBe(1);
    expect(result.coverUrl).toContain('media-amazon');
    expect(result.description).toContain('Hogwarts');
    // Shelf noise ("Audiobook") filtered; genres capped.
    expect(result.genres).toContain('Fantasy');
    expect(result.genres).not.toContain('Audiobook');
  });

  it('prefers the edition matching the book ISBN', async () => {
    const work = {
      ...harryPotterWork,
      Books: [
        { Isbn13: '9999999999999', NumPages: 100, ImageUrl: 'x' },
        { Isbn13: '9780439554930', NumPages: 309, ImageUrl: 'y' },
      ],
    };
    fetchWithTimeout
      .mockResolvedValueOnce(okJson([{ workId: 4640799 }]))
      .mockResolvedValueOnce(okJson(work));

    const result = await fetchMetadata({
      title: "Harry Potter and the Philosopher's Stone",
      isbn: '9780439554930',
    });

    expect(result.isbn).toBe('9780439554930');
    expect(result.pageCount).toBe(309);
  });

  it('rejects a work whose title does not match the query', async () => {
    fetchWithTimeout
      .mockResolvedValueOnce(okJson([{ workId: 1 }]))
      .mockResolvedValueOnce(
        okJson({ ...harryPotterWork, Title: 'Completely Unrelated Cookbook' })
      );

    const result = await fetchMetadata({ title: 'The Gruffalo', author: 'Julia Donaldson' });

    expect(result.author).toBeNull();
    expect(result.isbn).toBeNull();
  });

  it('flags rate limiting so the cascade can back off', async () => {
    fetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 429 });

    const result = await fetchMetadata({ title: 'Anything' });

    expect(result.rateLimited).toBe(true);
  });

  it('returns empty when there are no search hits', async () => {
    fetchWithTimeout.mockResolvedValueOnce(okJson([]));

    const result = await fetchMetadata({ title: 'Nonexistent Book XYZ123' });

    expect(result.author).toBeNull();
    expect(result.description).toBeNull();
  });

  it('uses a custom base URL when provided', async () => {
    fetchWithTimeout
      .mockResolvedValueOnce(okJson([{ workId: 4640799 }]))
      .mockResolvedValueOnce(okJson(harryPotterWork));

    await fetchMetadata(
      { title: "Harry Potter and the Philosopher's Stone" },
      'https://books.mylab.home/'
    );

    expect(fetchWithTimeout.mock.calls[0][0]).toContain('https://books.mylab.home/search');
    // Trailing slash trimmed — no double slash before the path.
    expect(fetchWithTimeout.mock.calls[1][0]).toBe('https://books.mylab.home/work/4640799');
  });

  it('returns empty on network error', async () => {
    fetchWithTimeout.mockRejectedValueOnce(new Error('timeout'));

    const result = await fetchMetadata({ title: 'Anything' });

    expect(result.author).toBeNull();
  });

  it('accepts an options object with baseUrl (back-compat with string form)', async () => {
    fetchWithTimeout
      .mockResolvedValueOnce(okJson([{ workId: 4640799 }]))
      .mockResolvedValueOnce(okJson(harryPotterWork));

    await fetchMetadata(
      { title: "Harry Potter and the Philosopher's Stone" },
      { baseUrl: 'https://books.mylab.home/' }
    );

    expect(fetchWithTimeout.mock.calls[0][0]).toContain('https://books.mylab.home/search');
    expect(fetchWithTimeout.mock.calls[1][0]).toBe('https://books.mylab.home/work/4640799');
  });

  it('sends Cloudflare Access service-token headers when both halves are set', async () => {
    fetchWithTimeout
      .mockResolvedValueOnce(okJson([{ workId: 4640799 }]))
      .mockResolvedValueOnce(okJson(harryPotterWork));

    await fetchMetadata(
      { title: "Harry Potter and the Philosopher's Stone" },
      {
        baseUrl: 'https://bookinfo.tallyreading.uk',
        accessClientId: 'client-id.access',
        accessClientSecret: 'super-secret',
      }
    );

    // Both the /search and /work calls must carry the Access headers.
    for (const call of fetchWithTimeout.mock.calls) {
      const headers = call[1]?.headers || {};
      expect(headers['CF-Access-Client-Id']).toBe('client-id.access');
      expect(headers['CF-Access-Client-Secret']).toBe('super-secret');
    }
  });

  it('omits Access headers when only one half is provided', async () => {
    fetchWithTimeout
      .mockResolvedValueOnce(okJson([{ workId: 4640799 }]))
      .mockResolvedValueOnce(okJson(harryPotterWork));

    await fetchMetadata(
      { title: "Harry Potter and the Philosopher's Stone" },
      { baseUrl: 'https://bookinfo.tallyreading.uk', accessClientId: 'client-id.access' }
    );

    const headers = fetchWithTimeout.mock.calls[0][1]?.headers || {};
    expect(headers['CF-Access-Client-Id']).toBeUndefined();
    expect(headers['CF-Access-Client-Secret']).toBeUndefined();
  });
});
