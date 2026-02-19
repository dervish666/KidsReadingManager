import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseOpenLibraryBook, lookupISBN } from '../../utils/isbnLookup.js';

// Helper to create a mock KV namespace
const createMockKV = () => {
  const store = {};
  return {
    get: vi.fn(async (key, type) => store[key] ? JSON.parse(store[key]) : null),
    put: vi.fn(async (key, value) => { store[key] = value; }),
  };
};

describe('parseOpenLibraryBook', () => {
  it('should extract title, page count, publication year, and cover ID', () => {
    const olData = {
      title: 'The Hobbit',
      number_of_pages: 310,
      publish_date: '2020',
      covers: [12345678],
    };
    const result = parseOpenLibraryBook(olData);
    expect(result.title).toBe('The Hobbit');
    expect(result.pageCount).toBe(310);
    expect(result.publicationYear).toBe(2020);
    expect(result.coverId).toBe(12345678);
  });

  it('should return null for missing fields gracefully', () => {
    const olData = {
      title: 'Minimal Book',
    };
    const result = parseOpenLibraryBook(olData);
    expect(result.title).toBe('Minimal Book');
    expect(result.pageCount).toBeNull();
    expect(result.publicationYear).toBeNull();
    expect(result.coverId).toBeNull();
    expect(result.seriesName).toBeNull();
    expect(result.seriesNumber).toBeNull();
  });

  it('should parse year-only publish_date: "2020"', () => {
    const olData = { title: 'Test', publish_date: '2020' };
    const result = parseOpenLibraryBook(olData);
    expect(result.publicationYear).toBe(2020);
  });

  it('should parse "Month Year" publish_date: "January 2015"', () => {
    const olData = { title: 'Test', publish_date: 'January 2015' };
    const result = parseOpenLibraryBook(olData);
    expect(result.publicationYear).toBe(2015);
  });

  it('should parse "Month Day, Year" publish_date: "June 8, 1949"', () => {
    const olData = { title: 'Test', publish_date: 'June 8, 1949' };
    const result = parseOpenLibraryBook(olData);
    expect(result.publicationYear).toBe(1949);
  });

  it('should handle series as an array (take first element)', () => {
    const olData = {
      title: 'Test',
      series: ['Harry Potter', 'Wizarding World'],
    };
    const result = parseOpenLibraryBook(olData);
    expect(result.seriesName).toBe('Harry Potter');
  });

  it('should handle series as a string', () => {
    const olData = {
      title: 'Test',
      series: 'Discworld',
    };
    const result = parseOpenLibraryBook(olData);
    expect(result.seriesName).toBe('Discworld');
  });

  it('should parse volume_number to integer', () => {
    const olData = {
      title: 'Test',
      volume_number: '3',
    };
    const result = parseOpenLibraryBook(olData);
    expect(result.seriesNumber).toBe(3);
  });

  it('should return null for missing volume_number', () => {
    const olData = { title: 'Test' };
    const result = parseOpenLibraryBook(olData);
    expect(result.seriesNumber).toBeNull();
  });

  it('should return null for non-parseable volume_number', () => {
    const olData = { title: 'Test', volume_number: 'N/A' };
    const result = parseOpenLibraryBook(olData);
    expect(result.seriesNumber).toBeNull();
  });

  it('should handle empty covers array', () => {
    const olData = { title: 'Test', covers: [] };
    const result = parseOpenLibraryBook(olData);
    expect(result.coverId).toBeNull();
  });
});

describe('lookupISBN', () => {
  let originalFetch;
  let mockKV;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockKV = createMockKV();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const createEnv = (kv) => ({
    RECOMMENDATIONS_CACHE: kv || mockKV,
  });

  it('should return null for an invalid ISBN', async () => {
    const result = await lookupISBN('invalid-isbn', createEnv());
    expect(result).toBeNull();
    // Should not hit fetch at all
    expect(mockKV.get).not.toHaveBeenCalled();
  });

  it('should call OpenLibrary with normalized ISBN and correct User-Agent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Test Book',
        authors: [{ key: '/authors/OL123A' }],
      }),
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'Test Author' }),
    });

    // Use a valid ISBN-10 that normalizes to ISBN-13
    await lookupISBN('0141036141', createEnv());

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://openlibrary.org/isbn/9780141036144.json',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'TallyReading/1.0 (https://tallyreading.uk)',
        }),
      })
    );
  });

  it('should fetch author name from authors endpoint', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'The Hobbit',
          authors: [{ key: '/authors/OL26320A' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'J.R.R. Tolkien' }),
      });

    const result = await lookupISBN('9780261103344', createEnv());

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://openlibrary.org/authors/OL26320A.json',
      expect.objectContaining({
        headers: expect.objectContaining({
          'User-Agent': 'TallyReading/1.0 (https://tallyreading.uk)',
        }),
      })
    );
    expect(result.author).toBe('J.R.R. Tolkien');
  });

  it('should return null when OpenLibrary returns 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await lookupISBN('9780261103344', createEnv());
    expect(result).toBeNull();
  });

  it('should handle missing authors array gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        title: 'Orphan Book',
        // no authors field
      }),
    });

    const result = await lookupISBN('9780261103344', createEnv());
    expect(result).not.toBeNull();
    expect(result.author).toBeNull();
    expect(result.title).toBe('Orphan Book');
  });

  it('should cache successful lookups in KV', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Cached Book',
          number_of_pages: 200,
        }),
      });

    await lookupISBN('9780261103344', createEnv());

    expect(mockKV.put).toHaveBeenCalledWith(
      'isbn:9780261103344',
      expect.any(String),
      { expirationTtl: 2592000 }
    );

    // Verify the cached value is a valid JSON of the result
    const cachedValue = JSON.parse(mockKV.put.mock.calls[0][1]);
    expect(cachedValue.title).toBe('Cached Book');
    expect(cachedValue.pageCount).toBe(200);
  });

  it('should cache failed lookups in KV with 24-hour TTL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    await lookupISBN('9780261103344', createEnv());

    expect(mockKV.put).toHaveBeenCalledWith(
      'isbn:9780261103344',
      JSON.stringify({ notFound: true }),
      { expirationTtl: 86400 }
    );
  });

  it('should return cached result without fetching', async () => {
    globalThis.fetch = vi.fn();

    // Pre-populate KV cache
    const cachedResult = {
      isbn: '9780261103344',
      title: 'From Cache',
      author: 'Cached Author',
      pageCount: 100,
      publicationYear: 2020,
      seriesName: null,
      seriesNumber: null,
      coverId: null,
      coverSource: 'openlibrary',
    };
    mockKV.get.mockResolvedValueOnce(cachedResult);

    const result = await lookupISBN('9780261103344', createEnv());

    expect(result).toEqual(cachedResult);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('should return null for cached {notFound: true}', async () => {
    globalThis.fetch = vi.fn();

    mockKV.get.mockResolvedValueOnce({ notFound: true });

    const result = await lookupISBN('9780261103344', createEnv());

    expect(result).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('should handle KV cache errors gracefully and still fetch', async () => {
    const brokenKV = {
      get: vi.fn().mockRejectedValue(new Error('KV unavailable')),
      put: vi.fn().mockRejectedValue(new Error('KV unavailable')),
    };

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Fallback Book',
        }),
      });

    const result = await lookupISBN('9780261103344', createEnv(brokenKV));
    expect(result).not.toBeNull();
    expect(result.title).toBe('Fallback Book');
  });

  it('should handle author fetch failure gracefully', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Author Fail Book',
          authors: [{ key: '/authors/OL999A' }],
        }),
      })
      .mockRejectedValueOnce(new Error('Network error'));

    const result = await lookupISBN('9780261103344', createEnv());
    expect(result).not.toBeNull();
    expect(result.author).toBeNull();
    expect(result.title).toBe('Author Fail Book');
  });

  it('should construct the result object with all expected fields', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'Complete Book',
          number_of_pages: 350,
          publish_date: 'March 2018',
          covers: [9876543],
          series: ['Epic Series'],
          volume_number: '2',
          authors: [{ key: '/authors/OL555A' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'Famous Author' }),
      });

    const result = await lookupISBN('9780261103344', createEnv());

    expect(result).toEqual({
      isbn: '9780261103344',
      title: 'Complete Book',
      author: 'Famous Author',
      pageCount: 350,
      publicationYear: 2018,
      seriesName: 'Epic Series',
      seriesNumber: 2,
      coverId: 9876543,
      coverSource: 'openlibrary',
    });
  });
});
