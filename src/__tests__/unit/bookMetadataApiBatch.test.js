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

import { batchFetchAllMetadata } from '../../utils/bookMetadataApi';
import * as openLibrary from '../../utils/openLibraryApi';

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
});
