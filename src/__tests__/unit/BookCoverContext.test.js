import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { BookCoverProvider, useBookCoverCache } from '../../contexts/BookCoverContext';

// Helper component to test the hook
function TestConsumer({ title, author, onResult }) {
  const { getCachedCover, setCachedCover, isCached } = useBookCoverCache();

  React.useEffect(() => {
    if (onResult) {
      onResult({ getCachedCover, setCachedCover, isCached });
    }
  }, [getCachedCover, setCachedCover, isCached, onResult]);

  const cached = getCachedCover(title, author);
  const isBookCached = isCached(title, author);

  return (
    <div>
      <span data-testid="cached-cover">{cached || 'null'}</span>
      <span data-testid="is-cached">{isBookCached ? 'true' : 'false'}</span>
    </div>
  );
}

describe('BookCoverContext', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('BookCoverProvider', () => {
    it('should provide cache functions to children', () => {
      let capturedFunctions = null;

      render(
        <BookCoverProvider>
          <TestConsumer
            title="Test Book"
            author="Test Author"
            onResult={(fns) => {
              capturedFunctions = fns;
            }}
          />
        </BookCoverProvider>
      );

      expect(capturedFunctions).not.toBeNull();
      expect(typeof capturedFunctions.getCachedCover).toBe('function');
      expect(typeof capturedFunctions.setCachedCover).toBe('function');
      expect(typeof capturedFunctions.isCached).toBe('function');
    });

    it('should throw error when useBookCoverCache is used outside provider', () => {
      // Suppress console.error for this test since we expect an error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestConsumer title="Test" author="Author" />);
      }).toThrow('useBookCoverCache must be used within a BookCoverProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('getCachedCover and setCachedCover', () => {
    it('should return null for uncached books', () => {
      render(
        <BookCoverProvider>
          <TestConsumer title="Uncached Book" author="Unknown Author" />
        </BookCoverProvider>
      );

      expect(screen.getByTestId('cached-cover').textContent).toBe('null');
    });

    it('should cache and retrieve cover URLs', () => {
      let functions = null;

      const { rerender } = render(
        <BookCoverProvider>
          <TestConsumer
            title="Harry Potter"
            author="J.K. Rowling"
            onResult={(fns) => {
              functions = fns;
            }}
          />
        </BookCoverProvider>
      );

      // Initially should be null
      expect(screen.getByTestId('cached-cover').textContent).toBe('null');

      // Set the cache
      act(() => {
        functions.setCachedCover('Harry Potter', 'J.K. Rowling', 'https://example.com/cover.jpg');
      });

      // Force re-render to get updated values
      rerender(
        <BookCoverProvider>
          <TestConsumer title="Harry Potter" author="J.K. Rowling" />
        </BookCoverProvider>
      );

      expect(screen.getByTestId('cached-cover').textContent).toBe('https://example.com/cover.jpg');
    });

    it('should normalize title and author to lowercase for cache key', () => {
      let functions = null;

      render(
        <BookCoverProvider>
          <TestConsumer
            title="Test Book"
            author="Test Author"
            onResult={(fns) => {
              functions = fns;
            }}
          />
        </BookCoverProvider>
      );

      // Set cache with uppercase
      act(() => {
        functions.setCachedCover('TEST BOOK', 'TEST AUTHOR', 'https://example.com/cover1.jpg');
      });

      // Get cache with lowercase - should find the same entry
      const cachedUrl = functions.getCachedCover('test book', 'test author');
      expect(cachedUrl).toBe('https://example.com/cover1.jpg');

      // Get cache with mixed case - should also find it
      const cachedUrl2 = functions.getCachedCover('Test Book', 'Test Author');
      expect(cachedUrl2).toBe('https://example.com/cover1.jpg');
    });
  });

  describe('isCached', () => {
    it('should return false for uncached books', () => {
      render(
        <BookCoverProvider>
          <TestConsumer title="Not Cached" author="Unknown" />
        </BookCoverProvider>
      );

      expect(screen.getByTestId('is-cached').textContent).toBe('false');
    });

    it('should return true for cached books', () => {
      let functions = null;

      const { rerender } = render(
        <BookCoverProvider>
          <TestConsumer
            title="Cached Book"
            author="Known Author"
            onResult={(fns) => {
              functions = fns;
            }}
          />
        </BookCoverProvider>
      );

      // Initially should not be cached
      expect(screen.getByTestId('is-cached').textContent).toBe('false');

      // Cache it
      act(() => {
        functions.setCachedCover('Cached Book', 'Known Author', 'https://example.com/cached.jpg');
      });

      // Force re-render
      rerender(
        <BookCoverProvider>
          <TestConsumer title="Cached Book" author="Known Author" />
        </BookCoverProvider>
      );

      expect(screen.getByTestId('is-cached').textContent).toBe('true');
    });
  });

  describe('localStorage persistence', () => {
    it('should persist cache to localStorage', () => {
      let functions = null;

      render(
        <BookCoverProvider>
          <TestConsumer
            title="Persistent Book"
            author="Persistent Author"
            onResult={(fns) => {
              functions = fns;
            }}
          />
        </BookCoverProvider>
      );

      act(() => {
        functions.setCachedCover('Persistent Book', 'Persistent Author', 'https://example.com/persistent.jpg');
      });

      // Check localStorage
      const stored = localStorage.getItem('bookCovers');
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored);
      const key = 'persistent book|persistent author';
      expect(parsed[key]).toBeDefined();
      expect(parsed[key].coverUrl).toBe('https://example.com/persistent.jpg');
      expect(parsed[key].fetchedAt).toBeDefined();
    });

    it('should load cache from localStorage on mount', () => {
      // Pre-populate localStorage
      const cacheData = {
        'preloaded book|preloaded author': {
          coverUrl: 'https://example.com/preloaded.jpg',
          fetchedAt: Date.now(),
        },
      };
      localStorage.setItem('bookCovers', JSON.stringify(cacheData));

      render(
        <BookCoverProvider>
          <TestConsumer title="Preloaded Book" author="Preloaded Author" />
        </BookCoverProvider>
      );

      expect(screen.getByTestId('cached-cover').textContent).toBe('https://example.com/preloaded.jpg');
      expect(screen.getByTestId('is-cached').textContent).toBe('true');
    });

    it('should handle localStorage errors gracefully', () => {
      // Mock localStorage.setItem to throw an error
      const originalSetItem = localStorage.setItem.bind(localStorage);
      localStorage.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError');
      });

      let functions = null;

      // Should not throw
      expect(() => {
        render(
          <BookCoverProvider>
            <TestConsumer
              title="Error Test"
              author="Error Author"
              onResult={(fns) => {
                functions = fns;
              }}
            />
          </BookCoverProvider>
        );
      }).not.toThrow();

      // setCachedCover should not throw even when localStorage fails
      expect(() => {
        act(() => {
          functions.setCachedCover('Error Test', 'Error Author', 'https://example.com/error.jpg');
        });
      }).not.toThrow();

      // Restore localStorage
      localStorage.setItem = originalSetItem;
    });

    it('should handle malformed localStorage data gracefully', () => {
      // Set invalid JSON in localStorage
      localStorage.setItem('bookCovers', 'not valid json');

      // Should not throw
      expect(() => {
        render(
          <BookCoverProvider>
            <TestConsumer title="Test" author="Author" />
          </BookCoverProvider>
        );
      }).not.toThrow();

      // Should return null for uncached book
      expect(screen.getByTestId('cached-cover').textContent).toBe('null');
    });
  });

  describe('cache expiration', () => {
    it('should expire entries older than 7 days on load', () => {
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const eightDaysAgo = now - (sevenDaysMs + 1000); // Just over 7 days ago
      const threeDaysAgo = now - (3 * 24 * 60 * 60 * 1000);

      // Pre-populate localStorage with expired and non-expired entries
      const cacheData = {
        'expired book|expired author': {
          coverUrl: 'https://example.com/expired.jpg',
          fetchedAt: eightDaysAgo,
        },
        'fresh book|fresh author': {
          coverUrl: 'https://example.com/fresh.jpg',
          fetchedAt: threeDaysAgo,
        },
      };
      localStorage.setItem('bookCovers', JSON.stringify(cacheData));

      // Set fake time to now
      vi.setSystemTime(now);

      render(
        <BookCoverProvider>
          <TestConsumer title="Fresh Book" author="Fresh Author" />
        </BookCoverProvider>
      );

      // Fresh entry should still exist
      expect(screen.getByTestId('cached-cover').textContent).toBe('https://example.com/fresh.jpg');

      // Check that expired entry was removed from localStorage
      const stored = localStorage.getItem('bookCovers');
      const parsed = JSON.parse(stored);
      expect(parsed['expired book|expired author']).toBeUndefined();
      expect(parsed['fresh book|fresh author']).toBeDefined();
    });
  });

  describe('cache key format', () => {
    it('should use "title|author" format for cache keys', () => {
      let functions = null;

      render(
        <BookCoverProvider>
          <TestConsumer
            title="My Book"
            author="Some Author"
            onResult={(fns) => {
              functions = fns;
            }}
          />
        </BookCoverProvider>
      );

      act(() => {
        functions.setCachedCover('My Book', 'Some Author', 'https://example.com/mybook.jpg');
      });

      const stored = localStorage.getItem('bookCovers');
      const parsed = JSON.parse(stored);

      // Key should be lowercase "title|author"
      expect(parsed['my book|some author']).toBeDefined();
    });

    it('should handle empty author', () => {
      let functions = null;

      render(
        <BookCoverProvider>
          <TestConsumer
            title="No Author Book"
            author=""
            onResult={(fns) => {
              functions = fns;
            }}
          />
        </BookCoverProvider>
      );

      act(() => {
        functions.setCachedCover('No Author Book', '', 'https://example.com/noauthor.jpg');
      });

      const cached = functions.getCachedCover('No Author Book', '');
      expect(cached).toBe('https://example.com/noauthor.jpg');

      const stored = localStorage.getItem('bookCovers');
      const parsed = JSON.parse(stored);
      expect(parsed['no author book|']).toBeDefined();
    });

    it('should handle null author', () => {
      let functions = null;

      render(
        <BookCoverProvider>
          <TestConsumer
            title="Null Author Book"
            author={null}
            onResult={(fns) => {
              functions = fns;
            }}
          />
        </BookCoverProvider>
      );

      act(() => {
        functions.setCachedCover('Null Author Book', null, 'https://example.com/nullauthor.jpg');
      });

      const cached = functions.getCachedCover('Null Author Book', null);
      expect(cached).toBe('https://example.com/nullauthor.jpg');
    });
  });
});
