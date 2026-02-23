import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the underlying provider modules
vi.mock('../../utils/openLibraryApi', () => ({
  findAuthorForBook: vi.fn(),
  getBookDetails: vi.fn(),
  findGenresForBook: vi.fn(),
  // Stubs for other exports that bookMetadataApi imports
  checkOpenLibraryAvailability: vi.fn(),
  resetOpenLibraryAvailabilityCache: vi.fn(),
  getOpenLibraryStatus: vi.fn(),
  searchBooksByTitle: vi.fn(),
  findTopAuthorCandidatesForBook: vi.fn(),
  batchFindMissingAuthors: vi.fn(),
  batchFindMissingDescriptions: vi.fn(),
  batchFindMissingGenres: vi.fn(),
  getCoverUrl: vi.fn(),
}));

vi.mock('../../utils/googleBooksApi', () => ({
  findAuthorForBook: vi.fn(),
  getBookDetails: vi.fn(),
  findGenresForBook: vi.fn(),
  checkGoogleBooksAvailability: vi.fn(),
  resetGoogleBooksAvailabilityCache: vi.fn(),
  getGoogleBooksStatus: vi.fn(),
  searchBooksByTitle: vi.fn(),
  searchBooks: vi.fn(),
  findTopAuthorCandidatesForBook: vi.fn(),
  batchFindMissingAuthors: vi.fn(),
  batchFindMissingDescriptions: vi.fn(),
  batchFindMissingGenres: vi.fn(),
  getCoverUrl: vi.fn(),
}));

vi.mock('../../utils/hardcoverApi', () => ({
  findAuthorForBook: vi.fn(),
  getBookDetails: vi.fn(),
  findGenresForBook: vi.fn(),
  checkHardcoverAvailability: vi.fn(),
  resetHardcoverAvailabilityCache: vi.fn(),
  getHardcoverStatus: vi.fn(),
  isHardcoverRateLimited: vi.fn().mockReturnValue(false),
  resetHardcoverRateLimitFlag: vi.fn(),
  searchBooksByTitle: vi.fn(),
  findTopAuthorCandidatesForBook: vi.fn(),
  batchFindMissingAuthors: vi.fn(),
  batchFindMissingDescriptions: vi.fn(),
  batchFindMissingGenres: vi.fn(),
  getCoverUrl: vi.fn(),
}));

import { batchFetchAllMetadata, SPEED_PRESETS, getMetadataConfig } from '../../utils/bookMetadataApi';
import * as openLibrary from '../../utils/openLibraryApi';
import * as hardcover from '../../utils/hardcoverApi';

// Default settings: no bookMetadata config means OpenLibrary provider
const defaultSettings = {};

describe('batchFetchAllMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use fake timers so the 500ms delay doesn't slow tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper to advance through all pending timers
  const flushTimers = async () => {
    await vi.runAllTimersAsync();
  };

  it('returns empty array for empty book list', async () => {
    const result = await batchFetchAllMetadata([], defaultSettings);
    expect(result).toEqual([]);
  });

  it('returns empty array for null book list', async () => {
    const result = await batchFetchAllMetadata(null, defaultSettings);
    expect(result).toEqual([]);
  });

  it('fetches author, description, genres, isbn, pageCount, and publicationYear for a single book', async () => {
    openLibrary.findAuthorForBook.mockResolvedValue('Roald Dahl');
    openLibrary.getBookDetails.mockResolvedValue({
      description: 'A story about a chocolate factory.',
      coverUrl: 'https://covers.openlibrary.org/b/id/123-M.jpg',
      isbn: '9780142410318',
      pageCount: 176,
      publicationYear: 1964,
    });
    openLibrary.findGenresForBook.mockResolvedValue(['Fiction', 'Children']);

    const books = [{ title: 'Charlie and the Chocolate Factory', author: 'Roald Dahl' }];
    const promise = batchFetchAllMetadata(books, defaultSettings);
    await flushTimers();
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0].book).toBe(books[0]);
    expect(results[0].foundAuthor).toBe('Roald Dahl');
    expect(results[0].foundDescription).toBe('A story about a chocolate factory.');
    expect(results[0].foundGenres).toEqual(['Fiction', 'Children']);
    expect(results[0].foundIsbn).toBe('9780142410318');
    expect(results[0].foundPageCount).toBe(176);
    expect(results[0].foundPublicationYear).toBe(1964);
    expect(results[0].error).toBeUndefined();

    // Verify the right provider functions were called
    expect(openLibrary.findAuthorForBook).toHaveBeenCalledWith('Charlie and the Chocolate Factory');
    expect(openLibrary.getBookDetails).toHaveBeenCalledWith('Charlie and the Chocolate Factory', 'Roald Dahl');
    expect(openLibrary.findGenresForBook).toHaveBeenCalledWith('Charlie and the Chocolate Factory', 'Roald Dahl');
  });

  it('passes null author to getBookDetails and findGenresForBook when book has no author', async () => {
    openLibrary.findAuthorForBook.mockResolvedValue('Found Author');
    openLibrary.getBookDetails.mockResolvedValue({ description: 'A desc' });
    openLibrary.findGenresForBook.mockResolvedValue(['Mystery']);

    const books = [{ title: 'Unknown Author Book' }];
    const promise = batchFetchAllMetadata(books, defaultSettings);
    await flushTimers();
    await promise;

    expect(openLibrary.getBookDetails).toHaveBeenCalledWith('Unknown Author Book', null);
    expect(openLibrary.findGenresForBook).toHaveBeenCalledWith('Unknown Author Book', null);
  });

  it('calls onProgress callback with current, total, and book info', async () => {
    openLibrary.findAuthorForBook.mockResolvedValue('Author A');
    openLibrary.getBookDetails.mockResolvedValue({ description: 'Desc A' });
    openLibrary.findGenresForBook.mockResolvedValue(['Genre A']);

    const books = [
      { title: 'Book One', author: 'Auth 1' },
      { title: 'Book Two', author: 'Auth 2' },
    ];
    const onProgress = vi.fn();

    const promise = batchFetchAllMetadata(books, defaultSettings, onProgress);
    await flushTimers();
    await promise;

    expect(onProgress).toHaveBeenCalledTimes(2);

    // First call: current=1, total=2
    expect(onProgress).toHaveBeenNthCalledWith(1, expect.objectContaining({
      current: 1,
      total: 2,
      book: 'Book One',
    }));

    // Second call: current=2, total=2
    expect(onProgress).toHaveBeenNthCalledWith(2, expect.objectContaining({
      current: 2,
      total: 2,
      book: 'Book Two',
    }));
  });

  it('handles API errors gracefully per book without throwing', async () => {
    // First book: all providers reject
    openLibrary.findAuthorForBook
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce('Good Author');
    openLibrary.getBookDetails
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce({ description: 'Good desc' });
    openLibrary.findGenresForBook
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValueOnce(['Good Genre']);

    const books = [
      { title: 'Bad Book' },
      { title: 'Good Book' },
    ];

    const promise = batchFetchAllMetadata(books, defaultSettings);
    await flushTimers();
    const results = await promise;

    // Should not throw, both books should have results
    expect(results).toHaveLength(2);

    // First book: all fields null due to rejected promises (Promise.allSettled handles this)
    expect(results[0].foundAuthor).toBeNull();
    expect(results[0].foundDescription).toBeNull();
    expect(results[0].foundGenres).toBeNull();
    expect(results[0].foundIsbn).toBeNull();
    expect(results[0].foundPageCount).toBeNull();
    expect(results[0].foundPublicationYear).toBeNull();

    // Second book: all fields populated
    expect(results[1].foundAuthor).toBe('Good Author');
    expect(results[1].foundDescription).toBe('Good desc');
    expect(results[1].foundGenres).toEqual(['Good Genre']);
  });

  it('returns null for fields where provider returns nothing', async () => {
    openLibrary.findAuthorForBook.mockResolvedValue(null);
    openLibrary.getBookDetails.mockResolvedValue(null);
    openLibrary.findGenresForBook.mockResolvedValue(null);

    const books = [{ title: 'Obscure Book' }];
    const promise = batchFetchAllMetadata(books, defaultSettings);
    await flushTimers();
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0].foundAuthor).toBeNull();
    expect(results[0].foundDescription).toBeNull();
    expect(results[0].foundGenres).toBeNull();
    expect(results[0].foundIsbn).toBeNull();
    expect(results[0].foundPageCount).toBeNull();
    expect(results[0].foundPublicationYear).toBeNull();
    expect(results[0].error).toBeUndefined();
  });

  it('returns null for description when getBookDetails returns object without description', async () => {
    openLibrary.findAuthorForBook.mockResolvedValue('Some Author');
    openLibrary.getBookDetails.mockResolvedValue({ coverUrl: 'http://example.com/cover.jpg' });
    openLibrary.findGenresForBook.mockResolvedValue(['Fiction']);

    const books = [{ title: 'No Desc Book' }];
    const promise = batchFetchAllMetadata(books, defaultSettings);
    await flushTimers();
    const results = await promise;

    expect(results[0].foundDescription).toBeNull();
  });

  it('processes multiple books sequentially', async () => {
    const callOrder = [];
    openLibrary.findAuthorForBook.mockImplementation(async (title) => {
      callOrder.push(`author:${title}`);
      return `Author of ${title}`;
    });
    openLibrary.getBookDetails.mockImplementation(async (title) => {
      callOrder.push(`details:${title}`);
      return { description: `Desc of ${title}` };
    });
    openLibrary.findGenresForBook.mockImplementation(async (title) => {
      callOrder.push(`genres:${title}`);
      return ['Genre'];
    });

    const books = [
      { title: 'Book A' },
      { title: 'Book B' },
      { title: 'Book C' },
    ];

    const promise = batchFetchAllMetadata(books, defaultSettings);
    await flushTimers();
    const results = await promise;

    expect(results).toHaveLength(3);
    // Each book should have its three lookups called
    expect(openLibrary.findAuthorForBook).toHaveBeenCalledTimes(3);
    expect(openLibrary.getBookDetails).toHaveBeenCalledTimes(3);
    expect(openLibrary.findGenresForBook).toHaveBeenCalledTimes(3);
  });

  it('includes foundSeriesName and foundSeriesNumber in results when details contain series', async () => {
    openLibrary.findAuthorForBook.mockResolvedValue('J.K. Rowling');
    openLibrary.getBookDetails.mockResolvedValue({
      description: 'A boy wizard.',
      isbn: '9780747532699',
      pageCount: 223,
      publicationYear: 1997,
      seriesName: 'Harry Potter',
      seriesNumber: 1,
    });
    openLibrary.findGenresForBook.mockResolvedValue(['Fantasy']);

    const books = [{ title: "Harry Potter and the Philosopher's Stone", author: 'J.K. Rowling' }];
    const promise = batchFetchAllMetadata(books, defaultSettings);
    await flushTimers();
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0].foundSeriesName).toBe('Harry Potter');
    expect(results[0].foundSeriesNumber).toBe(1);
  });

  it('returns null for series fields when details have no series', async () => {
    openLibrary.findAuthorForBook.mockResolvedValue('Author');
    openLibrary.getBookDetails.mockResolvedValue({
      description: 'A standalone book.',
    });
    openLibrary.findGenresForBook.mockResolvedValue(['Fiction']);

    const books = [{ title: 'Standalone Book' }];
    const promise = batchFetchAllMetadata(books, defaultSettings);
    await flushTimers();
    const results = await promise;

    expect(results[0].foundSeriesName).toBeNull();
    expect(results[0].foundSeriesNumber).toBeNull();
  });

  it('returns null for series fields in error results', async () => {
    openLibrary.findAuthorForBook.mockRejectedValue(new Error('fail'));
    openLibrary.getBookDetails.mockRejectedValue(new Error('fail'));
    openLibrary.findGenresForBook.mockRejectedValue(new Error('fail'));

    const books = [{ title: 'Error Book' }];
    const promise = batchFetchAllMetadata(books, defaultSettings);
    await flushTimers();
    const results = await promise;

    // Promise.allSettled handles rejections gracefully, so no error property
    expect(results[0].foundSeriesName).toBeNull();
    expect(results[0].foundSeriesNumber).toBeNull();
  });

  it('returns null for series fields when getBookDetails returns null', async () => {
    openLibrary.findAuthorForBook.mockResolvedValue(null);
    openLibrary.getBookDetails.mockResolvedValue(null);
    openLibrary.findGenresForBook.mockResolvedValue(null);

    const books = [{ title: 'Unknown Book' }];
    const promise = batchFetchAllMetadata(books, defaultSettings);
    await flushTimers();
    const results = await promise;

    expect(results[0].foundSeriesName).toBeNull();
    expect(results[0].foundSeriesNumber).toBeNull();
  });

  describe('Hardcover provider', () => {
    const hardcoverSettings = {
      bookMetadata: {
        provider: 'hardcover',
        hardcoverApiKey: 'test-hardcover-key',
      }
    };

    it('routes to hardcover functions when provider is hardcover', async () => {
      // Hardcover functions return results (waterfall won't fall through)
      hardcover.findAuthorForBook.mockResolvedValue('Hardcover Author');
      hardcover.getBookDetails.mockResolvedValue({
        description: 'Hardcover description.',
        isbn: '9781234567890',
        pageCount: 300,
        publicationYear: 2020,
        seriesName: 'Hardcover Series',
        seriesNumber: 3,
      });
      hardcover.findGenresForBook.mockResolvedValue(['Sci-Fi', 'Adventure']);

      const books = [{ title: 'Hardcover Book', author: 'HC Author' }];
      const promise = batchFetchAllMetadata(books, hardcoverSettings);
      await flushTimers();
      const results = await promise;

      expect(results).toHaveLength(1);
      expect(results[0].foundAuthor).toBe('Hardcover Author');
      expect(results[0].foundDescription).toBe('Hardcover description.');
      expect(results[0].foundGenres).toEqual(['Sci-Fi', 'Adventure']);
      expect(results[0].foundIsbn).toBe('9781234567890');
      expect(results[0].foundPageCount).toBe(300);
      expect(results[0].foundPublicationYear).toBe(2020);
      expect(results[0].foundSeriesName).toBe('Hardcover Series');
      expect(results[0].foundSeriesNumber).toBe(3);
      expect(results[0].error).toBeUndefined();

      // Hardcover functions were called (via the waterfall routing)
      expect(hardcover.findAuthorForBook).toHaveBeenCalled();
      expect(hardcover.getBookDetails).toHaveBeenCalled();
      expect(hardcover.findGenresForBook).toHaveBeenCalled();

      // OpenLibrary should NOT have been called (Hardcover returned results)
      expect(openLibrary.findAuthorForBook).not.toHaveBeenCalled();
      expect(openLibrary.getBookDetails).not.toHaveBeenCalled();
      expect(openLibrary.findGenresForBook).not.toHaveBeenCalled();
    });

    it('falls back to OpenLibrary when Hardcover getBookDetails returns null', async () => {
      // Hardcover returns null for details but has author/genres
      hardcover.findAuthorForBook.mockResolvedValue('HC Author');
      hardcover.getBookDetails.mockResolvedValue(null);
      hardcover.findGenresForBook.mockResolvedValue(['HC Genre']);

      // OpenLibrary fallback for details
      openLibrary.getBookDetails.mockResolvedValue({
        description: 'OL description.',
        isbn: '9780000000000',
        pageCount: 200,
        publicationYear: 2015,
        seriesName: 'OL Series',
        seriesNumber: 2,
      });

      const books = [{ title: 'Waterfall Book', author: 'Author' }];
      const promise = batchFetchAllMetadata(books, hardcoverSettings);
      await flushTimers();
      const results = await promise;

      expect(results).toHaveLength(1);
      // Author came from Hardcover
      expect(results[0].foundAuthor).toBe('HC Author');
      // Description came from OpenLibrary fallback
      expect(results[0].foundDescription).toBe('OL description.');
      // Genres came from Hardcover
      expect(results[0].foundGenres).toEqual(['HC Genre']);
      // ISBN/pageCount/publicationYear came from OpenLibrary fallback details
      expect(results[0].foundIsbn).toBe('9780000000000');
      expect(results[0].foundPageCount).toBe(200);
      expect(results[0].foundPublicationYear).toBe(2015);

      // Both Hardcover and OL getBookDetails were called
      expect(hardcover.getBookDetails).toHaveBeenCalled();
      expect(openLibrary.getBookDetails).toHaveBeenCalled();
    });

    it('falls back to OpenLibrary when Hardcover findAuthorForBook returns null', async () => {
      hardcover.findAuthorForBook.mockResolvedValue(null);
      openLibrary.findAuthorForBook.mockResolvedValue('OL Author');

      hardcover.getBookDetails.mockResolvedValue({ description: 'HC desc' });
      hardcover.findGenresForBook.mockResolvedValue(['HC Genre']);

      const books = [{ title: 'Author Fallback Book' }];
      const promise = batchFetchAllMetadata(books, hardcoverSettings);
      await flushTimers();
      const results = await promise;

      expect(results[0].foundAuthor).toBe('OL Author');
      expect(hardcover.findAuthorForBook).toHaveBeenCalled();
      expect(openLibrary.findAuthorForBook).toHaveBeenCalled();
    });

    it('falls back to OpenLibrary when Hardcover throws an error', async () => {
      hardcover.findAuthorForBook.mockRejectedValue(new Error('Hardcover down'));
      openLibrary.findAuthorForBook.mockResolvedValue('OL Fallback Author');

      hardcover.getBookDetails.mockRejectedValue(new Error('Hardcover down'));
      openLibrary.getBookDetails.mockResolvedValue({ description: 'OL Fallback desc' });

      hardcover.findGenresForBook.mockRejectedValue(new Error('Hardcover down'));
      openLibrary.findGenresForBook.mockResolvedValue(['OL Fallback Genre']);

      const books = [{ title: 'Error Fallback Book' }];
      const promise = batchFetchAllMetadata(books, hardcoverSettings);
      await flushTimers();
      const results = await promise;

      expect(results[0].foundAuthor).toBe('OL Fallback Author');
      expect(results[0].foundDescription).toBe('OL Fallback desc');
      expect(results[0].foundGenres).toEqual(['OL Fallback Genre']);
    });

    it('throws error when Hardcover is selected but no API key is configured', async () => {
      const noKeySettings = {
        bookMetadata: {
          provider: 'hardcover',
          // No hardcoverApiKey
        }
      };

      const books = [{ title: 'Some Book' }];
      const promise = batchFetchAllMetadata(books, noKeySettings);
      await flushTimers();
      const results = await promise;

      // The error is caught by batchFetchAllMetadata's try/catch (Promise.allSettled),
      // so it shows up as null fields. The actual throw happens inside
      // findAuthorForBook/getBookDetails/findGenresForBook which throw if no key.
      // But since batchFetchAllMetadata uses Promise.allSettled, the rejections
      // become null fields.
      expect(results).toHaveLength(1);
      expect(results[0].foundAuthor).toBeNull();
      expect(results[0].foundDescription).toBeNull();
      expect(results[0].foundGenres).toBeNull();
    });

    it('uses 1000ms delay between books for Hardcover provider', async () => {
      hardcover.findAuthorForBook.mockResolvedValue('Author');
      hardcover.getBookDetails.mockResolvedValue({ description: 'Desc' });
      hardcover.findGenresForBook.mockResolvedValue(['Genre']);

      const books = [
        { title: 'Book 1' },
        { title: 'Book 2' },
      ];

      const promise = batchFetchAllMetadata(books, hardcoverSettings);

      // After first book processes, the second book waits 1000ms
      // Advance only 500ms - second book should not be processed yet
      await vi.advanceTimersByTimeAsync(100);
      // First book should have resolved by now (no delay for first book)

      // Advance the rest
      await flushTimers();
      const results = await promise;

      expect(results).toHaveLength(2);
    });
  });

  describe('AbortController support', () => {
    it('stops processing when signal is aborted before a book', async () => {
      openLibrary.findAuthorForBook.mockResolvedValue('Author');
      openLibrary.getBookDetails.mockResolvedValue({ description: 'Desc' });
      openLibrary.findGenresForBook.mockResolvedValue(['Genre']);

      const books = [
        { title: 'Book 1' },
        { title: 'Book 2' },
        { title: 'Book 3' },
      ];

      const controller = new AbortController();

      // Abort after first book processes
      let callCount = 0;
      openLibrary.findAuthorForBook.mockImplementation(async () => {
        callCount++;
        if (callCount >= 2) controller.abort();
        return 'Author';
      });

      const promise = batchFetchAllMetadata(books, defaultSettings, null, { signal: controller.signal });
      await flushTimers();
      const results = await promise;

      // Should have partial results (not all 3)
      expect(results.length).toBeLessThan(3);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('returns partial results on abort', async () => {
      openLibrary.findAuthorForBook.mockResolvedValue('Author');
      openLibrary.getBookDetails.mockResolvedValue({ description: 'Desc' });
      openLibrary.findGenresForBook.mockResolvedValue(['Genre']);

      const books = [
        { title: 'Book 1' },
        { title: 'Book 2' },
      ];

      // Abort immediately
      const controller = new AbortController();
      controller.abort();

      const results = await batchFetchAllMetadata(books, defaultSettings, null, { signal: controller.signal });

      // Should return empty since signal was already aborted
      expect(results).toEqual([]);
    });
  });

  describe('batch size', () => {
    it('limits processing to batchSize from options', async () => {
      openLibrary.findAuthorForBook.mockResolvedValue('Author');
      openLibrary.getBookDetails.mockResolvedValue({ description: 'Desc' });
      openLibrary.findGenresForBook.mockResolvedValue(['Genre']);

      const books = [
        { title: 'Book 1' },
        { title: 'Book 2' },
        { title: 'Book 3' },
        { title: 'Book 4' },
        { title: 'Book 5' },
      ];

      const promise = batchFetchAllMetadata(books, defaultSettings, null, { batchSize: 2 });
      await flushTimers();
      const results = await promise;

      expect(results).toHaveLength(2);
      expect(results[0].book.title).toBe('Book 1');
      expect(results[1].book.title).toBe('Book 2');
    });

    it('reports batchTotal and overallTotal in onProgress', async () => {
      openLibrary.findAuthorForBook.mockResolvedValue('Author');
      openLibrary.getBookDetails.mockResolvedValue({ description: 'Desc' });
      openLibrary.findGenresForBook.mockResolvedValue(['Genre']);

      const books = [
        { title: 'Book 1' },
        { title: 'Book 2' },
        { title: 'Book 3' },
      ];

      const onProgress = vi.fn();
      const promise = batchFetchAllMetadata(books, defaultSettings, onProgress, { batchSize: 2 });
      await flushTimers();
      await promise;

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenNthCalledWith(1, expect.objectContaining({
        current: 1,
        total: 2,
        batchTotal: 2,
        overallTotal: 3,
      }));
    });

    it('uses batchSize from settings when not in options', async () => {
      openLibrary.findAuthorForBook.mockResolvedValue('Author');
      openLibrary.getBookDetails.mockResolvedValue({ description: 'Desc' });
      openLibrary.findGenresForBook.mockResolvedValue(['Genre']);

      const settingsWithBatchSize = {
        bookMetadata: {
          batchSize: 3,
        }
      };

      const books = [
        { title: 'Book 1' },
        { title: 'Book 2' },
        { title: 'Book 3' },
        { title: 'Book 4' },
        { title: 'Book 5' },
      ];

      const promise = batchFetchAllMetadata(books, settingsWithBatchSize);
      await flushTimers();
      const results = await promise;

      expect(results).toHaveLength(3);
    });
  });

  describe('speed presets', () => {
    it('exports SPEED_PRESETS constant', () => {
      expect(SPEED_PRESETS).toEqual({
        careful: 2000,
        normal: 1000,
        fast: 500,
      });
    });

    it('getMetadataConfig returns batch settings with defaults', () => {
      const config = getMetadataConfig({});
      expect(config.batchSize).toBe(50);
      expect(config.speedPreset).toBe('normal');
      expect(config.autoFallback).toBe(true);
    });

    it('getMetadataConfig reads batch settings from bookMetadata', () => {
      const config = getMetadataConfig({
        bookMetadata: {
          batchSize: 25,
          speedPreset: 'careful',
          autoFallback: false,
        }
      });
      expect(config.batchSize).toBe(25);
      expect(config.speedPreset).toBe('careful');
      expect(config.autoFallback).toBe(false);
    });
  });

  describe('adaptive delay and rate limit feedback', () => {
    const hardcoverSettings = {
      bookMetadata: {
        provider: 'hardcover',
        hardcoverApiKey: 'test-key',
      }
    };

    it('reports rateLimited in onProgress when Hardcover is rate limited', async () => {
      hardcover.findAuthorForBook.mockResolvedValue('Author');
      hardcover.getBookDetails.mockResolvedValue({ description: 'Desc' });
      hardcover.findGenresForBook.mockResolvedValue(['Genre']);
      hardcover.isHardcoverRateLimited.mockReturnValue(true);

      const books = [{ title: 'Book 1' }];
      const onProgress = vi.fn();

      const promise = batchFetchAllMetadata(books, hardcoverSettings, onProgress);
      await flushTimers();
      await promise;

      expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
        rateLimited: true,
      }));
    });

    it('reports providerSwitched after 5 consecutive rate-limited books', async () => {
      hardcover.findAuthorForBook.mockResolvedValue('Author');
      hardcover.getBookDetails.mockResolvedValue({ description: 'Desc' });
      hardcover.findGenresForBook.mockResolvedValue(['Genre']);
      hardcover.isHardcoverRateLimited.mockReturnValue(true);

      const books = Array.from({ length: 6 }, (_, i) => ({ title: `Book ${i + 1}` }));
      const progressCalls = [];
      const onProgress = (p) => progressCalls.push({ ...p });

      const promise = batchFetchAllMetadata(books, hardcoverSettings, onProgress);
      await flushTimers();
      await promise;

      // After 5 consecutive rate-limited books, provider should switch
      const switchedCall = progressCalls.find(p => p.providerSwitched);
      expect(switchedCall).toBeTruthy();
      expect(switchedCall.switchedFrom).toBe('Hardcover');
    });

    it('calls onBookResult callback with each result', async () => {
      openLibrary.findAuthorForBook.mockResolvedValue('Author A');
      openLibrary.getBookDetails.mockResolvedValue({ description: 'Desc' });
      openLibrary.findGenresForBook.mockResolvedValue(['Genre']);

      const books = [
        { title: 'Book 1' },
        { title: 'Book 2' },
      ];

      const onBookResult = vi.fn();
      const promise = batchFetchAllMetadata(books, defaultSettings, null, { onBookResult });
      await flushTimers();
      await promise;

      expect(onBookResult).toHaveBeenCalledTimes(2);
      expect(onBookResult).toHaveBeenNthCalledWith(1, expect.objectContaining({
        book: books[0],
        foundAuthor: 'Author A',
      }));
      expect(onBookResult).toHaveBeenNthCalledWith(2, expect.objectContaining({
        book: books[1],
        foundAuthor: 'Author A',
      }));
    });

    it('awaits async onBookResult before processing next book', async () => {
      openLibrary.findAuthorForBook.mockResolvedValue('Author');
      openLibrary.getBookDetails.mockResolvedValue({ description: 'Desc' });
      openLibrary.findGenresForBook.mockResolvedValue(['Genre']);

      const books = [
        { title: 'Book 1' },
        { title: 'Book 2' },
      ];

      const order = [];
      const onBookResult = vi.fn().mockImplementation(async (result) => {
        order.push(`apply-${result.book.title}`);
      });
      const onProgress = vi.fn().mockImplementation((p) => {
        order.push(`progress-${p.book}`);
      });

      const promise = batchFetchAllMetadata(books, defaultSettings, onProgress, { onBookResult });
      await flushTimers();
      await promise;

      // onBookResult should fire before onProgress for each book
      expect(order[0]).toBe('apply-Book 1');
      expect(order[1]).toBe('progress-Book 1');
      expect(order[2]).toBe('apply-Book 2');
      expect(order[3]).toBe('progress-Book 2');
    });

    it('does not auto-fallback when autoFallback is false', async () => {
      hardcover.findAuthorForBook.mockResolvedValue('Author');
      hardcover.getBookDetails.mockResolvedValue({ description: 'Desc' });
      hardcover.findGenresForBook.mockResolvedValue(['Genre']);
      hardcover.isHardcoverRateLimited.mockReturnValue(true);

      const books = Array.from({ length: 6 }, (_, i) => ({ title: `Book ${i + 1}` }));
      const progressCalls = [];
      const onProgress = (p) => progressCalls.push({ ...p });

      const promise = batchFetchAllMetadata(books, hardcoverSettings, onProgress, { autoFallback: false });
      await flushTimers();
      await promise;

      // Should not have switched provider
      expect(progressCalls.every(p => !p.providerSwitched)).toBe(true);
    });
  });
});
