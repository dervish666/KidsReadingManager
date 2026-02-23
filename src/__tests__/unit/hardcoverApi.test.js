import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkHardcoverAvailability,
  resetHardcoverAvailabilityCache,
  getHardcoverStatus,
  searchBooksByTitle,
  findAuthorForBook,
  findTopAuthorCandidatesForBook,
  getBookDetails
} from '../../utils/hardcoverApi.js';

describe('hardcoverApi', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    resetHardcoverAvailabilityCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  describe('checkHardcoverAvailability', () => {
    it('returns true on valid response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __typename: 'query_root' } })
      });

      const result = await checkHardcoverAvailability('test-api-key');

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.hardcover.app/v1/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            authorization: 'test-api-key'
          }),
          body: expect.any(String),
          signal: expect.any(AbortSignal)
        })
      );

      // Verify the body contains the introspection query
      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.query).toContain('__typename');
    });

    it('returns false on GraphQL errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          errors: [{ message: 'Unauthorized' }]
        })
      });

      const result = await checkHardcoverAvailability('bad-api-key');

      expect(result).toBe(false);
    });

    it('returns false on fetch throw', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await checkHardcoverAvailability('test-api-key');

      expect(result).toBe(false);
    });

    it('returns false when no API key provided', async () => {
      global.fetch = vi.fn();

      const result = await checkHardcoverAvailability(null);

      expect(result).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('caches result for 60 seconds (second call does not re-fetch)', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __typename: 'query_root' } })
      });

      const result1 = await checkHardcoverAvailability('test-api-key');
      expect(result1).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Advance time by 30 seconds (within cache window)
      vi.advanceTimersByTime(30000);

      const result2 = await checkHardcoverAvailability('test-api-key');
      expect(result2).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1, no re-fetch

      // Advance time past 60 seconds total
      vi.advanceTimersByTime(31000);

      const result3 = await checkHardcoverAvailability('test-api-key');
      expect(result3).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2); // Now re-fetched
    });

    it('returns false on HTTP error response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const result = await checkHardcoverAvailability('test-api-key');

      expect(result).toBe(false);
    });
  });

  describe('getHardcoverStatus', () => {
    it('returns null available before first check', () => {
      const status = getHardcoverStatus();

      expect(status.available).toBeNull();
      expect(status.lastCheck).toBe(0);
      expect(status.stale).toBe(true);
    });

    it('returns status after successful check', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __typename: 'query_root' } })
      });

      vi.setSystemTime(new Date('2026-02-23T12:00:00Z'));
      await checkHardcoverAvailability('test-api-key');

      const status = getHardcoverStatus();

      expect(status.available).toBe(true);
      expect(status.lastCheck).toBe(Date.now());
      expect(status.stale).toBe(false);
    });

    it('reports stale after 60 seconds', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __typename: 'query_root' } })
      });

      await checkHardcoverAvailability('test-api-key');

      // Advance past the 60-second cache window
      vi.advanceTimersByTime(61000);

      const status = getHardcoverStatus();

      expect(status.available).toBe(true); // Still has last known value
      expect(status.stale).toBe(true);
    });

    it('returns false available after failed check', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await checkHardcoverAvailability('test-api-key');

      const status = getHardcoverStatus();

      expect(status.available).toBe(false);
      expect(status.stale).toBe(false);
    });
  });

  describe('resetHardcoverAvailabilityCache', () => {
    it('clears the cache so next check re-fetches', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __typename: 'query_root' } })
      });

      await checkHardcoverAvailability('test-api-key');
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Reset the cache
      resetHardcoverAvailabilityCache();

      // Verify status is cleared
      const status = getHardcoverStatus();
      expect(status.available).toBeNull();
      expect(status.lastCheck).toBe(0);

      // Next check should re-fetch
      await checkHardcoverAvailability('test-api-key');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('searchBooksByTitle', () => {
    it('returns formatted results from Hardcover search', async () => {
      const mockResults = JSON.stringify([
        {
          document: {
            id: 101,
            title: 'Percy Jackson and the Lightning Thief',
            author_names: ['Rick Riordan'],
            isbns: ['9780141346809'],
            series_names: ['Percy Jackson']
          }
        },
        {
          document: {
            id: 102,
            title: 'Percy Jackson and the Sea of Monsters',
            author_names: ['Rick Riordan'],
            isbns: ['9780141346830'],
            series_names: ['Percy Jackson']
          }
        }
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: {
            search: { results: mockResults }
          }
        })
      });

      const results = await searchBooksByTitle('Percy Jackson', 'test-api-key');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 101,
        title: 'Percy Jackson and the Lightning Thief',
        author: 'Rick Riordan',
        isbns: ['9780141346809'],
        seriesNames: ['Percy Jackson']
      });
      expect(results[1]).toEqual({
        id: 102,
        title: 'Percy Jackson and the Sea of Monsters',
        author: 'Rick Riordan',
        isbns: ['9780141346830'],
        seriesNames: ['Percy Jackson']
      });

      // Verify the GraphQL query was sent correctly
      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.query).toContain('search');
      expect(body.query).toContain('query_type');
      expect(body.variables.q).toBe('Percy Jackson');
      expect(body.variables.perPage).toBe(5);
    });

    it('passes custom limit as perPage', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: '[]' } }
        })
      });

      await searchBooksByTitle('Test', 'test-api-key', 10);

      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.variables.perPage).toBe(10);
    });

    it('returns empty array when results are empty', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: '[]' } }
        })
      });

      const results = await searchBooksByTitle('Nonexistent Book', 'test-api-key');

      expect(results).toEqual([]);
    });

    it('handles missing author_names gracefully', async () => {
      const mockResults = JSON.stringify([
        {
          document: {
            id: 200,
            title: 'Orphan Book',
            author_names: [],
            isbns: ['9781234567890'],
            series_names: []
          }
        }
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: mockResults } }
        })
      });

      const results = await searchBooksByTitle('Orphan Book', 'test-api-key');

      expect(results).toHaveLength(1);
      expect(results[0].author).toBeNull();
    });

    it('handles malformed JSON in results field', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: 'not valid json{{{' } }
        })
      });

      const results = await searchBooksByTitle('Broken', 'test-api-key');

      expect(results).toEqual([]);
    });

    it('handles null results field', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: null } }
        })
      });

      const results = await searchBooksByTitle('Null', 'test-api-key');

      expect(results).toEqual([]);
    });

    it('throws when title is missing', async () => {
      await expect(searchBooksByTitle('', 'test-api-key'))
        .rejects.toThrow('Title is required');
      await expect(searchBooksByTitle(null, 'test-api-key'))
        .rejects.toThrow('Title is required');
    });

    it('throws when API key is missing', async () => {
      await expect(searchBooksByTitle('Test', ''))
        .rejects.toThrow('API key is required');
      await expect(searchBooksByTitle('Test', null))
        .rejects.toThrow('API key is required');
    });

    it('handles multiple authors by taking the first', async () => {
      const mockResults = JSON.stringify([
        {
          document: {
            id: 300,
            title: 'Collaborative Work',
            author_names: ['Author One', 'Author Two'],
            isbns: [],
            series_names: []
          }
        }
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: mockResults } }
        })
      });

      const results = await searchBooksByTitle('Collaborative Work', 'test-api-key');

      expect(results[0].author).toBe('Author One');
    });

    it('handles missing document fields gracefully', async () => {
      const mockResults = JSON.stringify([
        {
          document: {
            id: 400,
            title: 'Minimal Book'
            // No author_names, isbns, or series_names
          }
        }
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: mockResults } }
        })
      });

      const results = await searchBooksByTitle('Minimal Book', 'test-api-key');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 400,
        title: 'Minimal Book',
        author: null,
        isbns: [],
        seriesNames: []
      });
    });
  });

  describe('findAuthorForBook', () => {
    it('returns the best matching author', async () => {
      const mockResults = JSON.stringify([
        {
          document: {
            id: 501,
            title: 'The Hobbit',
            author_names: ['J.R.R. Tolkien'],
            isbns: ['9780261103344'],
            series_names: []
          }
        },
        {
          document: {
            id: 502,
            title: 'The Hobbit: An Unexpected Journey',
            author_names: ['Brian Sibley'],
            isbns: [],
            series_names: []
          }
        }
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: mockResults } }
        })
      });

      const author = await findAuthorForBook('The Hobbit', 'test-api-key');

      expect(author).toBe('J.R.R. Tolkien');
    });

    it('returns null when no results found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: '[]' } }
        })
      });

      const author = await findAuthorForBook('ZZZXXX Nonexistent', 'test-api-key');

      expect(author).toBeNull();
    });

    it('returns null when no results have sufficient similarity', async () => {
      const mockResults = JSON.stringify([
        {
          document: {
            id: 601,
            title: 'Completely Different Title',
            author_names: ['Some Author'],
            isbns: [],
            series_names: []
          }
        }
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: mockResults } }
        })
      });

      const author = await findAuthorForBook('The Hobbit', 'test-api-key');

      expect(author).toBeNull();
    });

    it('returns null when results have no authors', async () => {
      const mockResults = JSON.stringify([
        {
          document: {
            id: 701,
            title: 'The Hobbit',
            author_names: [],
            isbns: [],
            series_names: []
          }
        }
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: mockResults } }
        })
      });

      const author = await findAuthorForBook('The Hobbit', 'test-api-key');

      expect(author).toBeNull();
    });

    it('returns null on API error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const author = await findAuthorForBook('The Hobbit', 'test-api-key');

      expect(author).toBeNull();
    });

    it('prefers exact title match over partial match', async () => {
      const mockResults = JSON.stringify([
        {
          document: {
            id: 801,
            title: 'Wonder',
            author_names: ['R.J. Palacio'],
            isbns: [],
            series_names: []
          }
        },
        {
          document: {
            id: 802,
            title: 'Wonderstruck',
            author_names: ['Brian Selznick'],
            isbns: [],
            series_names: []
          }
        }
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: mockResults } }
        })
      });

      const author = await findAuthorForBook('Wonder', 'test-api-key');

      expect(author).toBe('R.J. Palacio');
    });
  });

  describe('findTopAuthorCandidatesForBook', () => {
    it('returns top N candidates sorted by similarity', async () => {
      const mockResults = JSON.stringify([
        {
          document: {
            id: 901,
            title: 'Harry Potter and the Philosophers Stone',
            author_names: ['J.K. Rowling'],
            isbns: ['9780747532743'],
            series_names: ['Harry Potter']
          }
        },
        {
          document: {
            id: 902,
            title: 'Harry Potter and the Chamber of Secrets',
            author_names: ['J.K. Rowling'],
            isbns: ['9780747538486'],
            series_names: ['Harry Potter']
          }
        },
        {
          document: {
            id: 903,
            title: 'Harry: A Biography',
            author_names: ['Angela Levin'],
            isbns: [],
            series_names: []
          }
        }
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: mockResults } }
        })
      });

      const candidates = await findTopAuthorCandidatesForBook(
        'Harry Potter and the Philosophers Stone',
        'test-api-key',
        3
      );

      expect(candidates.length).toBeGreaterThanOrEqual(1);

      // Best match should be J.K. Rowling
      expect(candidates[0].name).toBe('J.K. Rowling');
      expect(candidates[0].sourceTitle).toBe('Harry Potter and the Philosophers Stone');
      expect(candidates[0].similarity).toBeGreaterThan(0.5);

      // Each candidate should have the expected shape
      for (const c of candidates) {
        expect(c).toHaveProperty('name');
        expect(c).toHaveProperty('sourceTitle');
        expect(c).toHaveProperty('similarity');
        expect(c).toHaveProperty('coverUrl');
      }
    });

    it('deduplicates authors across results', async () => {
      const mockResults = JSON.stringify([
        {
          document: {
            id: 1001,
            title: 'Diary of a Wimpy Kid',
            author_names: ['Jeff Kinney'],
            isbns: ['9780141324906'],
            series_names: ['Diary of a Wimpy Kid']
          }
        },
        {
          document: {
            id: 1002,
            title: 'Diary of a Wimpy Kid: Rodrick Rules',
            author_names: ['Jeff Kinney'],
            isbns: ['9780141324920'],
            series_names: ['Diary of a Wimpy Kid']
          }
        }
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: mockResults } }
        })
      });

      const candidates = await findTopAuthorCandidatesForBook(
        'Diary of a Wimpy Kid',
        'test-api-key',
        3
      );

      // Should only have one unique author despite multiple results
      const authorNames = candidates.map(c => c.name);
      expect(new Set(authorNames).size).toBe(authorNames.length);
      expect(candidates[0].name).toBe('Jeff Kinney');
    });

    it('returns empty array when no results', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: '[]' } }
        })
      });

      const candidates = await findTopAuthorCandidatesForBook(
        'ZZZXXX Nonexistent',
        'test-api-key'
      );

      expect(candidates).toEqual([]);
    });

    it('returns empty array on API error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const candidates = await findTopAuthorCandidatesForBook(
        'Test Book',
        'test-api-key'
      );

      expect(candidates).toEqual([]);
    });

    it('filters out results below similarity threshold', async () => {
      const mockResults = JSON.stringify([
        {
          document: {
            id: 1101,
            title: 'Totally Unrelated Book About Cooking',
            author_names: ['Chef Someone'],
            isbns: [],
            series_names: []
          }
        }
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: mockResults } }
        })
      });

      const candidates = await findTopAuthorCandidatesForBook(
        'Harry Potter',
        'test-api-key'
      );

      expect(candidates).toEqual([]);
    });

    it('respects the limit parameter', async () => {
      const mockResults = JSON.stringify([
        {
          document: {
            id: 1201,
            title: 'Magic Tree House',
            author_names: ['Mary Pope Osborne'],
            isbns: [],
            series_names: ['Magic Tree House']
          }
        },
        {
          document: {
            id: 1202,
            title: 'Magic Tree House: Dinosaurs Before Dark',
            author_names: ['Mary Pope Osborne', 'Sal Murdocca'],
            isbns: [],
            series_names: ['Magic Tree House']
          }
        },
        {
          document: {
            id: 1203,
            title: 'The Magic Treehouse',
            author_names: ['Different Author'],
            isbns: [],
            series_names: []
          }
        }
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: mockResults } }
        })
      });

      const candidates = await findTopAuthorCandidatesForBook(
        'Magic Tree House',
        'test-api-key',
        1
      );

      expect(candidates.length).toBeLessThanOrEqual(1);
    });

    it('skips results with no author names', async () => {
      const mockResults = JSON.stringify([
        {
          document: {
            id: 1301,
            title: 'The Gruffalo',
            author_names: [],
            isbns: [],
            series_names: []
          }
        },
        {
          document: {
            id: 1302,
            title: 'The Gruffalo',
            author_names: ['Julia Donaldson'],
            isbns: ['9781509804757'],
            series_names: []
          }
        }
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: mockResults } }
        })
      });

      const candidates = await findTopAuthorCandidatesForBook(
        'The Gruffalo',
        'test-api-key'
      );

      expect(candidates.length).toBeGreaterThanOrEqual(1);
      expect(candidates[0].name).toBe('Julia Donaldson');
    });
  });

  describe('getBookDetails', () => {
    // Helper: creates a mock fetch that returns different responses for
    // the search query vs. the book-detail query based on the GraphQL
    // operation/query text in the request body.
    function createMockFetch(searchResults, detailBooks) {
      return vi.fn(async (url, options) => {
        const body = JSON.parse(options.body);
        if (body.query.includes('search')) {
          // Search query — return stringified search results
          return {
            ok: true,
            json: () => Promise.resolve({
              data: {
                search: {
                  results: JSON.stringify(
                    searchResults.map(r => ({ document: r }))
                  )
                }
              }
            })
          };
        }
        // Book detail query
        return {
          ok: true,
          json: () => Promise.resolve({
            data: { books: detailBooks }
          })
        };
      });
    }

    it('returns full details from matched book', async () => {
      const searchResults = [
        {
          id: 42,
          title: 'The BFG',
          author_names: ['Roald Dahl'],
          isbns: ['9780141346137'],
          series_names: []
        }
      ];

      const detailBooks = [
        {
          id: 42,
          title: 'The BFG',
          description: 'A little girl meets a Big Friendly Giant.',
          pages: 208,
          release_year: 1982,
          cached_contributors: { Author: [{ author: { name: 'Roald Dahl' } }] },
          cached_tags: { Genre: ['Fiction', "Children's"] },
          cached_image: { url: 'https://hardcover.app/images/bfg.jpg' },
          book_series: [
            {
              position: 1.0,
              details: null,
              featured: true,
              series: { name: 'Roald Dahl Collection' }
            }
          ],
          editions: [
            {
              isbn_13: '9780141346137',
              isbn_10: '0141346132',
              page_count: 210,
              release_date: '2007-08-01'
            }
          ]
        }
      ];

      global.fetch = createMockFetch(searchResults, detailBooks);

      const result = await getBookDetails('The BFG', 'Roald Dahl', 'test-api-key');

      expect(result).not.toBeNull();
      expect(result.hardcoverId).toBe(42);
      expect(result.coverUrl).toBe('https://hardcover.app/images/bfg.jpg');
      expect(result.description).toBe('A little girl meets a Big Friendly Giant.');
      expect(result.isbn).toBe('9780141346137');
      expect(result.pageCount).toBe(210);
      expect(result.publicationYear).toBe(1982);
      expect(result.seriesName).toBe('Roald Dahl Collection');
      expect(result.seriesNumber).toBe(1.0);
    });

    it('returns series data correctly from book_series', async () => {
      const searchResults = [
        {
          id: 100,
          title: 'Harry Potter and the Philosophers Stone',
          author_names: ['J.K. Rowling'],
          isbns: [],
          series_names: ['Harry Potter']
        }
      ];

      const detailBooks = [
        {
          id: 100,
          title: 'Harry Potter and the Philosophers Stone',
          description: 'A boy discovers he is a wizard.',
          pages: 332,
          release_year: 1997,
          cached_contributors: {},
          cached_tags: {},
          cached_image: null,
          book_series: [
            {
              position: 1.0,
              details: null,
              featured: true,
              series: { name: 'Harry Potter' }
            }
          ],
          editions: []
        }
      ];

      global.fetch = createMockFetch(searchResults, detailBooks);

      const result = await getBookDetails(
        'Harry Potter and the Philosophers Stone',
        null,
        'test-api-key'
      );

      expect(result).not.toBeNull();
      expect(result.seriesName).toBe('Harry Potter');
      expect(result.seriesNumber).toBe(1.0);
    });

    it('returns null when search finds no match', async () => {
      // Return empty search results
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          data: { search: { results: '[]' } }
        })
      });

      const result = await getBookDetails('ZZZZZ Nonexistent Book', null, 'test-api-key');

      expect(result).toBeNull();
    });

    it('returns null when book detail query returns empty', async () => {
      const searchResults = [
        {
          id: 999,
          title: 'Ghost Book',
          author_names: ['Ghost Author'],
          isbns: [],
          series_names: []
        }
      ];

      // Detail query returns empty books array
      global.fetch = createMockFetch(searchResults, []);

      const result = await getBookDetails('Ghost Book', null, 'test-api-key');

      expect(result).toBeNull();
    });

    it('handles books with no series', async () => {
      const searchResults = [
        {
          id: 50,
          title: 'Charlotte\'s Web',
          author_names: ['E.B. White'],
          isbns: [],
          series_names: []
        }
      ];

      const detailBooks = [
        {
          id: 50,
          title: 'Charlotte\'s Web',
          description: 'A story about a pig and a spider.',
          pages: 184,
          release_year: 1952,
          cached_contributors: {},
          cached_tags: {},
          cached_image: { url: 'https://hardcover.app/images/cw.jpg' },
          book_series: [],
          editions: [
            { isbn_13: '9780064400558', isbn_10: null, page_count: 184, release_date: null }
          ]
        }
      ];

      global.fetch = createMockFetch(searchResults, detailBooks);

      const result = await getBookDetails('Charlotte\'s Web', null, 'test-api-key');

      expect(result).not.toBeNull();
      expect(result.seriesName).toBeNull();
      expect(result.seriesNumber).toBeNull();
    });

    it('handles books with multiple series entries (picks featured/first one)', async () => {
      const searchResults = [
        {
          id: 60,
          title: 'Crossover Book',
          author_names: ['Multi Author'],
          isbns: [],
          series_names: ['Series A', 'Series B']
        }
      ];

      const detailBooks = [
        {
          id: 60,
          title: 'Crossover Book',
          description: 'Appears in two series.',
          pages: 300,
          release_year: 2020,
          cached_contributors: {},
          cached_tags: {},
          cached_image: null,
          book_series: [
            {
              position: 3.0,
              details: null,
              featured: true,
              series: { name: 'Primary Series' }
            },
            {
              position: 7.0,
              details: null,
              featured: false,
              series: { name: 'Secondary Series' }
            }
          ],
          editions: []
        }
      ];

      global.fetch = createMockFetch(searchResults, detailBooks);

      const result = await getBookDetails('Crossover Book', null, 'test-api-key');

      expect(result).not.toBeNull();
      // Should pick the first entry (featured=true, ordered by featured desc)
      expect(result.seriesName).toBe('Primary Series');
      expect(result.seriesNumber).toBe(3.0);
    });

    it('uses editions.isbn_13 for ISBN when available', async () => {
      const searchResults = [
        {
          id: 70,
          title: 'ISBN-13 Book',
          author_names: ['Author A'],
          isbns: [],
          series_names: []
        }
      ];

      const detailBooks = [
        {
          id: 70,
          title: 'ISBN-13 Book',
          description: 'A book with ISBN-13.',
          pages: 100,
          release_year: 2010,
          cached_contributors: {},
          cached_tags: {},
          cached_image: null,
          book_series: [],
          editions: [
            {
              isbn_13: '9781234567890',
              isbn_10: '1234567890',
              page_count: 100,
              release_date: null
            }
          ]
        }
      ];

      global.fetch = createMockFetch(searchResults, detailBooks);

      const result = await getBookDetails('ISBN-13 Book', null, 'test-api-key');

      expect(result).not.toBeNull();
      expect(result.isbn).toBe('9781234567890');
    });

    it('falls back to editions.isbn_10 when no ISBN-13', async () => {
      const searchResults = [
        {
          id: 71,
          title: 'ISBN-10 Only Book',
          author_names: ['Author B'],
          isbns: [],
          series_names: []
        }
      ];

      const detailBooks = [
        {
          id: 71,
          title: 'ISBN-10 Only Book',
          description: 'Only has ISBN-10.',
          pages: 150,
          release_year: 2005,
          cached_contributors: {},
          cached_tags: {},
          cached_image: null,
          book_series: [],
          editions: [
            {
              isbn_13: null,
              isbn_10: '0987654321',
              page_count: 150,
              release_date: null
            }
          ]
        }
      ];

      global.fetch = createMockFetch(searchResults, detailBooks);

      const result = await getBookDetails('ISBN-10 Only Book', null, 'test-api-key');

      expect(result).not.toBeNull();
      expect(result.isbn).toBe('0987654321');
    });

    it('truncates long descriptions to 500 chars + "..."', async () => {
      const longDescription = 'A'.repeat(600);

      const searchResults = [
        {
          id: 80,
          title: 'Long Description Book',
          author_names: ['Verbose Author'],
          isbns: [],
          series_names: []
        }
      ];

      const detailBooks = [
        {
          id: 80,
          title: 'Long Description Book',
          description: longDescription,
          pages: 500,
          release_year: 2023,
          cached_contributors: {},
          cached_tags: {},
          cached_image: null,
          book_series: [],
          editions: []
        }
      ];

      global.fetch = createMockFetch(searchResults, detailBooks);

      const result = await getBookDetails('Long Description Book', null, 'test-api-key');

      expect(result).not.toBeNull();
      expect(result.description.length).toBe(503); // 500 + '...'
      expect(result.description).toBe('A'.repeat(500) + '...');
    });

    it('handles missing cached_image and missing editions', async () => {
      const searchResults = [
        {
          id: 90,
          title: 'Minimal Book',
          author_names: ['Minimal Author'],
          isbns: [],
          series_names: []
        }
      ];

      const detailBooks = [
        {
          id: 90,
          title: 'Minimal Book',
          description: 'Short.',
          pages: 50,
          release_year: null,
          cached_contributors: {},
          cached_tags: {},
          cached_image: null,
          book_series: [],
          editions: []
        }
      ];

      global.fetch = createMockFetch(searchResults, detailBooks);

      const result = await getBookDetails('Minimal Book', null, 'test-api-key');

      expect(result).not.toBeNull();
      expect(result.coverUrl).toBeNull();
      expect(result.isbn).toBeNull();
      expect(result.pageCount).toBe(50); // falls back to book.pages
      expect(result.publicationYear).toBeNull();
      expect(result.seriesName).toBeNull();
      expect(result.seriesNumber).toBeNull();
    });
  });
});
