# Book Covers for Recommendations Design

## Overview

Add book cover images to both library and AI recommendation tiles. Library tiles also get description text. Covers are fetched client-side from OpenLibrary using title/author search.

## Background

Currently, recommendation tiles show book metadata (title, author, level) but no visual covers. Adding covers improves the browsing experience and helps teachers/students quickly identify books.

## Cover Fetching Strategy

**API:** OpenLibrary search endpoint
```
https://openlibrary.org/search.json?title={title}&author={author}&limit=1
```

Response includes `cover_i` field used to construct cover URLs:
```
https://covers.openlibrary.org/b/id/{cover_i}-M.jpg
```

**Size options:** -S (small), -M (medium), -L (large) - use -M for tiles.

**Client-Side Implementation:**
- `useBookCover(title, author)` hook
- Returns: `{ coverUrl, isLoading, error }`
- Caches results in React context to avoid repeated API calls
- Uses localStorage for persistence across sessions
- Lazy loads covers (only fetch when tile is visible/rendered)

**Rate Limiting:**
- Debounce requests when many tiles render simultaneously
- Queue requests with small delay between each
- OpenLibrary is free but requests courtesy throttling

**Fallback (no cover found):**
- Styled placeholder with colored background
- Color derived from first letter of title (consistent per book)
- Generic book icon + truncated title text

## UI Layout

**Library Recommendation Tiles:**
```
┌─────────────────────────────────────────┐
│ ┌───────┐  Title                        │
│ │ Cover │  by Author                    │
│ │  img  │  ★ 4.2 · Level 5.3           │
│ │       │                               │
│ └───────┘  Description text truncated   │
│            to 2-3 lines with ellipsis...│
│                                         │
│  [Add to Reading List]                  │
└─────────────────────────────────────────┘
```

**AI Recommendation Tiles:**
```
┌─────────────────────────────────────────┐
│ ┌───────┐  Title                        │
│ │ Cover │  by Author                    │
│ │  img  │  Level 5.3                    │
│ │       │                               │
│ └───────┘  "AI reasoning text about     │
│            why this book suits the      │
│            student..."                  │
│                                         │
│  [Find in Library]  [Add Manually]      │
└─────────────────────────────────────────┘
```

## Implementation Areas

**New Files:**
- `src/hooks/useBookCover.js` - Cover fetching hook with caching
- `src/contexts/BookCoverContext.js` - Shared cache context
- `src/components/BookCoverPlaceholder.js` - Fallback component

**Modified Files:**
- `src/components/BookRecommendations.js` - Add covers to AI recommendation tiles
- Library recommendation component (identify exact file) - Add covers and descriptions

**Cache Structure (localStorage):**
```javascript
{
  "bookCovers": {
    "the-hobbit|tolkien": {
      "coverUrl": "https://covers.openlibrary.org/b/id/12345-M.jpg",
      "fetchedAt": 1706500000000
    }
  }
}
```

Cache entries expire after 7 days to catch updated covers.

## Future Enhancements

**ISBN Storage (separate task):**
- Add `isbn` column to books table
- Fetch ISBN during book metadata lookup (OpenLibrary/Google Books)
- Use ISBN for more reliable cover lookup: `https://covers.openlibrary.org/b/isbn/{isbn}-M.jpg`

**Server-Side Caching (if needed for scale):**
- KV for cover URL cache (small, fast)
- R2 for actual image caching (if rate limited by OpenLibrary)
- Worker endpoint to proxy/cache cover requests

## Validation

- Covers display correctly for books found in OpenLibrary
- Placeholder displays gracefully when cover not found
- No console errors from failed cover fetches
- Cached covers load instantly on repeat views
- Tiles maintain consistent layout with/without covers
- Description text truncates properly on library tiles
