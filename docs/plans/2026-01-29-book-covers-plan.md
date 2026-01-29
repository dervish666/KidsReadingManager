# Book Covers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add book cover images to recommendation tiles, with client-side fetching from OpenLibrary and localStorage caching.

**Architecture:** Create a React hook (`useBookCover`) that searches OpenLibrary by title/author, caches results in context and localStorage. A placeholder component handles missing covers. Both library and AI recommendation tiles in `BookRecommendations.js` are updated to display covers.

**Tech Stack:** React hooks, Context API, OpenLibrary Search API, localStorage, MUI components

---

## Task 1: Create BookCoverPlaceholder Component

**Files:**
- Create: `src/components/BookCoverPlaceholder.js`
- Test: `src/__tests__/unit/BookCoverPlaceholder.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BookCoverPlaceholder from '../../components/BookCoverPlaceholder';

describe('BookCoverPlaceholder', () => {
  it('renders with book title', () => {
    render(<BookCoverPlaceholder title="The Hobbit" />);
    expect(screen.getByText(/hobbit/i)).toBeInTheDocument();
  });

  it('generates consistent color based on title', () => {
    const { container: container1 } = render(<BookCoverPlaceholder title="Test Book" />);
    const { container: container2 } = render(<BookCoverPlaceholder title="Test Book" />);

    const bg1 = container1.querySelector('[data-testid="placeholder-bg"]').style.backgroundColor;
    const bg2 = container2.querySelector('[data-testid="placeholder-bg"]').style.backgroundColor;
    expect(bg1).toBe(bg2);
  });

  it('shows book icon', () => {
    render(<BookCoverPlaceholder title="Any Book" />);
    expect(screen.getByTestId('book-icon')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/BookCoverPlaceholder.test.js`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

```javascript
import React from 'react';
import { Box, Typography } from '@mui/material';
import MenuBookIcon from '@mui/icons-material/MenuBook';

// Generate a consistent color from a string
const stringToColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const colors = [
    '#e57373', '#f06292', '#ba68c8', '#9575cd',
    '#7986cb', '#64b5f6', '#4fc3f7', '#4dd0e1',
    '#4db6ac', '#81c784', '#aed581', '#dce775',
    '#fff176', '#ffd54f', '#ffb74d', '#ff8a65'
  ];

  return colors[Math.abs(hash) % colors.length];
};

const BookCoverPlaceholder = ({ title, width = 80, height = 120 }) => {
  const bgColor = stringToColor(title || 'Unknown');
  const displayTitle = (title || 'Unknown').slice(0, 30);

  return (
    <Box
      data-testid="placeholder-bg"
      sx={{
        width,
        height,
        backgroundColor: bgColor,
        borderRadius: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        p: 1,
        boxShadow: 1
      }}
      style={{ backgroundColor: bgColor }}
    >
      <MenuBookIcon
        data-testid="book-icon"
        sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 32, mb: 0.5 }}
      />
      <Typography
        variant="caption"
        sx={{
          color: 'rgba(255,255,255,0.9)',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          lineHeight: 1.2,
          fontSize: '0.65rem'
        }}
      >
        {displayTitle}
      </Typography>
    </Box>
  );
};

export default BookCoverPlaceholder;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/BookCoverPlaceholder.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/BookCoverPlaceholder.js src/__tests__/unit/BookCoverPlaceholder.test.js
git commit -m "feat: add BookCoverPlaceholder component for books without covers"
```

---

## Task 2: Create BookCoverContext for Caching

**Files:**
- Create: `src/contexts/BookCoverContext.js`
- Test: `src/__tests__/unit/BookCoverContext.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BookCoverProvider, useBookCoverCache } from '../../contexts/BookCoverContext';

describe('BookCoverContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('provides cache functions', () => {
    const wrapper = ({ children }) => <BookCoverProvider>{children}</BookCoverProvider>;
    const { result } = renderHook(() => useBookCoverCache(), { wrapper });

    expect(result.current.getCachedCover).toBeDefined();
    expect(result.current.setCachedCover).toBeDefined();
  });

  it('caches and retrieves cover URLs', () => {
    const wrapper = ({ children }) => <BookCoverProvider>{children}</BookCoverProvider>;
    const { result } = renderHook(() => useBookCoverCache(), { wrapper });

    act(() => {
      result.current.setCachedCover('The Hobbit', 'Tolkien', 'https://example.com/cover.jpg');
    });

    const cached = result.current.getCachedCover('The Hobbit', 'Tolkien');
    expect(cached).toBe('https://example.com/cover.jpg');
  });

  it('returns null for uncached books', () => {
    const wrapper = ({ children }) => <BookCoverProvider>{children}</BookCoverProvider>;
    const { result } = renderHook(() => useBookCoverCache(), { wrapper });

    const cached = result.current.getCachedCover('Unknown Book', 'Unknown Author');
    expect(cached).toBeNull();
  });

  it('persists to localStorage', () => {
    const wrapper = ({ children }) => <BookCoverProvider>{children}</BookCoverProvider>;
    const { result } = renderHook(() => useBookCoverCache(), { wrapper });

    act(() => {
      result.current.setCachedCover('Test Book', 'Test Author', 'https://example.com/test.jpg');
    });

    const stored = JSON.parse(localStorage.getItem('bookCovers'));
    expect(stored).toBeDefined();
    expect(stored['test book|test author']).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/BookCoverContext.test.js`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

```javascript
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const BookCoverContext = createContext(null);

const CACHE_KEY = 'bookCovers';
const CACHE_EXPIRY_DAYS = 7;

const generateKey = (title, author) => {
  const normalizedTitle = (title || '').toLowerCase().trim();
  const normalizedAuthor = (author || '').toLowerCase().trim();
  return `${normalizedTitle}|${normalizedAuthor}`;
};

export const BookCoverProvider = ({ children }) => {
  const [cache, setCache] = useState(() => {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Clean expired entries
        const now = Date.now();
        const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        const cleaned = {};
        for (const [key, entry] of Object.entries(parsed)) {
          if (entry.fetchedAt && (now - entry.fetchedAt) < expiryMs) {
            cleaned[key] = entry;
          }
        }
        return cleaned;
      }
    } catch (e) {
      // Invalid cache, start fresh
    }
    return {};
  });

  // Persist to localStorage when cache changes
  useEffect(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      // localStorage might be full or unavailable
    }
  }, [cache]);

  const getCachedCover = useCallback((title, author) => {
    const key = generateKey(title, author);
    const entry = cache[key];
    if (entry && entry.coverUrl) {
      return entry.coverUrl;
    }
    return null;
  }, [cache]);

  const setCachedCover = useCallback((title, author, coverUrl) => {
    const key = generateKey(title, author);
    setCache(prev => ({
      ...prev,
      [key]: {
        coverUrl,
        fetchedAt: Date.now()
      }
    }));
  }, []);

  const isCached = useCallback((title, author) => {
    const key = generateKey(title, author);
    return key in cache;
  }, [cache]);

  return (
    <BookCoverContext.Provider value={{ getCachedCover, setCachedCover, isCached }}>
      {children}
    </BookCoverContext.Provider>
  );
};

export const useBookCoverCache = () => {
  const context = useContext(BookCoverContext);
  if (!context) {
    throw new Error('useBookCoverCache must be used within BookCoverProvider');
  }
  return context;
};

export default BookCoverContext;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/BookCoverContext.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/contexts/BookCoverContext.js src/__tests__/unit/BookCoverContext.test.js
git commit -m "feat: add BookCoverContext for client-side cover caching"
```

---

## Task 3: Create useBookCover Hook

**Files:**
- Create: `src/hooks/useBookCover.js`
- Test: `src/__tests__/unit/useBookCover.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { BookCoverProvider } from '../../contexts/BookCoverContext';
import useBookCover from '../../hooks/useBookCover';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useBookCover', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }) => <BookCoverProvider>{children}</BookCoverProvider>;

  it('returns loading state initially', () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docs: [] })
    });

    const { result } = renderHook(() => useBookCover('The Hobbit', 'Tolkien'), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.coverUrl).toBeNull();
  });

  it('fetches cover from OpenLibrary', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        docs: [{ cover_i: 12345 }]
      })
    });

    const { result } = renderHook(() => useBookCover('The Hobbit', 'Tolkien'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.coverUrl).toBe('https://covers.openlibrary.org/b/id/12345-M.jpg');
  });

  it('returns null when no cover found', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docs: [] })
    });

    const { result } = renderHook(() => useBookCover('Unknown Book', 'Unknown'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.coverUrl).toBeNull();
  });

  it('uses cached value on subsequent calls', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        docs: [{ cover_i: 99999 }]
      })
    });

    const { result, rerender } = renderHook(() => useBookCover('Cached Book', 'Author'), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Rerender - should use cache
    rerender();

    expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, not 2
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/useBookCover.test.js`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

```javascript
import { useState, useEffect } from 'react';
import { useBookCoverCache } from '../contexts/BookCoverContext';

const OPENLIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json';
const OPENLIBRARY_COVER_URL = 'https://covers.openlibrary.org/b/id';

const useBookCover = (title, author) => {
  const { getCachedCover, setCachedCover, isCached } = useBookCoverCache();
  const [coverUrl, setCoverUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!title) {
      setIsLoading(false);
      return;
    }

    // Check cache first
    const cached = getCachedCover(title, author);
    if (cached !== null || isCached(title, author)) {
      setCoverUrl(cached);
      setIsLoading(false);
      return;
    }

    const fetchCover = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          title: title,
          limit: '1',
          fields: 'cover_i'
        });

        if (author) {
          params.set('author', author);
        }

        const response = await fetch(`${OPENLIBRARY_SEARCH_URL}?${params}`);

        if (!response.ok) {
          throw new Error(`OpenLibrary API error: ${response.status}`);
        }

        const data = await response.json();

        let foundCoverUrl = null;
        if (data.docs && data.docs.length > 0 && data.docs[0].cover_i) {
          foundCoverUrl = `${OPENLIBRARY_COVER_URL}/${data.docs[0].cover_i}-M.jpg`;
        }

        // Cache the result (even if null, to avoid re-fetching)
        setCachedCover(title, author, foundCoverUrl);
        setCoverUrl(foundCoverUrl);
      } catch (err) {
        setError(err.message);
        // Cache null to avoid retrying failed lookups immediately
        setCachedCover(title, author, null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCover();
  }, [title, author, getCachedCover, setCachedCover, isCached]);

  return { coverUrl, isLoading, error };
};

export default useBookCover;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/useBookCover.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/hooks/useBookCover.js src/__tests__/unit/useBookCover.test.js
git commit -m "feat: add useBookCover hook for fetching covers from OpenLibrary"
```

---

## Task 4: Create BookCover Component (combines hook + placeholder)

**Files:**
- Create: `src/components/BookCover.js`
- Test: `src/__tests__/unit/BookCover.test.js`

**Step 1: Write the failing test**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BookCoverProvider } from '../../contexts/BookCoverContext';
import BookCover from '../../components/BookCover';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('BookCover', () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch.mockReset();
  });

  const wrapper = ({ children }) => <BookCoverProvider>{children}</BookCoverProvider>;

  it('shows placeholder while loading', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    render(
      <BookCoverProvider>
        <BookCover title="Loading Book" author="Author" />
      </BookCoverProvider>
    );

    expect(screen.getByTestId('book-icon')).toBeInTheDocument();
  });

  it('shows cover image when found', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        docs: [{ cover_i: 12345 }]
      })
    });

    render(
      <BookCoverProvider>
        <BookCover title="The Hobbit" author="Tolkien" />
      </BookCoverProvider>
    );

    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'https://covers.openlibrary.org/b/id/12345-M.jpg');
    });
  });

  it('shows placeholder when no cover found', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ docs: [] })
    });

    render(
      <BookCoverProvider>
        <BookCover title="No Cover Book" author="Author" />
      </BookCoverProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('book-icon')).toBeInTheDocument();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/BookCover.test.js`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

```javascript
import React from 'react';
import { Box } from '@mui/material';
import useBookCover from '../hooks/useBookCover';
import BookCoverPlaceholder from './BookCoverPlaceholder';

const BookCover = ({ title, author, width = 80, height = 120 }) => {
  const { coverUrl, isLoading } = useBookCover(title, author);

  // Show placeholder while loading or if no cover found
  if (isLoading || !coverUrl) {
    return <BookCoverPlaceholder title={title} width={width} height={height} />;
  }

  return (
    <Box
      component="img"
      src={coverUrl}
      alt={`Cover of ${title}`}
      sx={{
        width,
        height,
        objectFit: 'cover',
        borderRadius: 1,
        boxShadow: 1
      }}
      onError={(e) => {
        // If image fails to load, hide it (placeholder will show)
        e.target.style.display = 'none';
      }}
    />
  );
};

export default BookCover;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/BookCover.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/BookCover.js src/__tests__/unit/BookCover.test.js
git commit -m "feat: add BookCover component combining hook and placeholder"
```

---

## Task 5: Add BookCoverProvider to App

**Files:**
- Modify: `src/App.js`

**Step 1: Read current App.js structure**

Locate where providers are wrapped and add BookCoverProvider.

**Step 2: Add BookCoverProvider import and wrap**

Add import:
```javascript
import { BookCoverProvider } from './contexts/BookCoverContext';
```

Wrap the app content with `<BookCoverProvider>` inside existing providers.

**Step 3: Run all tests to ensure no regressions**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/App.js
git commit -m "feat: add BookCoverProvider to app for global cover caching"
```

---

## Task 6: Update BookRecommendations - Add Covers to Tiles

**Files:**
- Modify: `src/components/BookRecommendations.js`
- Test: `src/__tests__/integration/BookRecommendations.test.js` (update existing)

**Step 1: Update the recommendation Card layout**

In the results Grid (around line 492-544), update each Card to include:
- BookCover component on the left
- Existing content on the right
- Description for library results

New card structure:
```jsx
<Card>
  <CardContent>
    <Box sx={{ display: 'flex', gap: 2 }}>
      {/* Cover */}
      <BookCover title={book.title} author={book.author} width={80} height={120} />

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Typography variant="h6" component="div">
            {book.title}
          </Typography>
          {/* In Library chip for AI results */}
        </Box>
        <Typography color="text.secondary" gutterBottom>
          by {book.author}
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <Chip label={book.readingLevel || book.level} size="small" variant="outlined" />
        </Stack>

        {/* Description for library results */}
        {resultType === 'library' && book.description && (
          <Typography variant="body2" color="text.secondary" sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            mb: 1
          }}>
            {book.description}
          </Typography>
        )}

        {/* Match reason or AI reasoning */}
        <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
          {resultType === 'library' ? book.matchReason : book.reason}
        </Typography>
      </Box>
    </Box>
  </CardContent>
</Card>
```

**Step 2: Add imports**

```javascript
import BookCover from './BookCover';
```

**Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/components/BookRecommendations.js
git commit -m "feat: add book covers and descriptions to recommendation tiles"
```

---

## Task 7: Add Integration Test for Covers in Recommendations

**Files:**
- Modify: `src/__tests__/integration/BookRecommendations.test.js`

**Step 1: Add test for cover rendering**

```javascript
it('displays book covers in library recommendations', async () => {
  // ... setup mock for library search that returns books

  // Click Find in Library button
  // Wait for results
  // Assert BookCover component renders for each result
});

it('displays book covers in AI recommendations', async () => {
  // ... setup mock for AI suggestions

  // Click AI Suggestions button
  // Wait for results
  // Assert BookCover component renders for each result
});
```

**Step 2: Run integration tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/__tests__/integration/BookRecommendations.test.js
git commit -m "test: add integration tests for book covers in recommendations"
```

---

## Task 8: Final Testing and Polish

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Manual testing checklist**

- [ ] Library recommendations show covers
- [ ] AI recommendations show covers
- [ ] Placeholder shows for books without covers
- [ ] Cached covers load instantly on revisit
- [ ] localStorage persists covers across page refresh
- [ ] Tiles maintain consistent layout with/without covers

**Step 3: Final commit if any polish needed**

```bash
git add -A
git commit -m "chore: polish book covers implementation"
```

---

## Summary

| Task | Component | Purpose |
|------|-----------|---------|
| 1 | BookCoverPlaceholder | Fallback for missing covers |
| 2 | BookCoverContext | Cache management with localStorage |
| 3 | useBookCover hook | OpenLibrary API integration |
| 4 | BookCover | Combined component |
| 5 | App.js | Provider setup |
| 6 | BookRecommendations | UI integration |
| 7 | Integration tests | Coverage |
| 8 | Final testing | Quality assurance |
