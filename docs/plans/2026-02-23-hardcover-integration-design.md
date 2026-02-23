# Hardcover API Integration Design

**Date**: 2026-02-23
**Status**: Approved

## Problem

The "Refresh All" metadata flow (`bookMetadataApi.js` -> `openLibraryApi.js`/`googleBooksApi.js`) does not fetch series data. The `series_name` and `series_number` DB columns (migration 0022) are only populated via the ISBN scan flow (`isbnLookup.js`), which reads OpenLibrary's edition-level `series` field — but OpenLibrary's search API doesn't reliably expose series info.

Hardcover has rich, curated series data with a `book_series` junction table linking books to series with position numbers.

## Solution

Add Hardcover as a third metadata provider in the existing provider abstraction. When selected, it's tried first for each book; if no match is found, falls back to OpenLibrary (free, no key needed).

## Hardcover API Details

- **Endpoint**: `https://api.hardcover.app/v1/graphql` (Hasura-based)
- **Auth**: `authorization: <api_key>` header (key from user's Hardcover account settings)
- **Rate limit**: 60 requests/minute, 30s timeout per query
- **Search**: `search(query: "...", query_type: "Book")` returns `{ results, ids }`
  - Searchable fields: `title, isbns, series_names, author_names, alternative_titles`
- **Book details**: `books(where: {id: {_eq: N}})` returns full book with relationships
- **Series**: via `book_series { position, details, series { name, is_completed, books_count } }`
- **Editions**: `editions { isbn_13, isbn_10, page_count, release_date }`
- **Contributors**: `cached_contributors` (JSON with author/translator info)
- **Genres**: `cached_tags` (JSON with Genre key)

## Architecture

### New File: `src/utils/hardcoverApi.js`

Implements the same interface as OpenLibrary/Google Books providers:

```
searchBooksByTitle(title, apiKey, limit)     -> [{title, author, coverUrl, ...}]
findAuthorForBook(title, apiKey)             -> "Author Name" | null
getBookDetails(title, author, apiKey)        -> {description, isbn, pageCount, publicationYear, seriesName, seriesNumber, coverUrl} | null
findGenresForBook(title, author, apiKey)     -> ["Genre1", "Genre2"] | null
findTopAuthorCandidatesForBook(title, apiKey, limit) -> [{name, sourceTitle, similarity, coverUrl}]
batchFindMissingAuthors(books, apiKey, onProgress)
batchFindMissingDescriptions(books, apiKey, onProgress)
batchFindMissingGenres(books, apiKey, onProgress)
checkHardcoverAvailability(apiKey, timeout)  -> boolean
resetHardcoverAvailabilityCache()
getHardcoverStatus()                         -> {available, lastCheck, stale}
getCoverUrl(bookData)                        -> string | null
```

**Internal helper — GraphQL client:**

```js
async function hardcoverQuery(query, variables, apiKey) {
  const response = await fetch('https://api.hardcover.app/v1/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'authorization': apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data;
}
```

**Two-step lookup pattern for `getBookDetails`:**

1. Search: `search(query: "Title Author", query_type: "Book", per_page: 5)` -> get book IDs
2. Detail fetch: `books(where: {id: {_eq: bestMatchId}})` with nested:
   - `book_series { position, details, featured, series { name } }`
   - `editions(limit: 1, order_by: {users_count: desc}) { isbn_13, isbn_10, page_count, release_date }`
   - `cached_contributors` for author
   - `cached_tags` for genres
   - `description`, `pages`, `release_date`, `release_year`

**Title matching**: Hardcover search returns results sorted by relevance. Apply the same fuzzy title similarity check used in `openLibraryApi.js` to pick the best match from results.

**Rate limiting**: 1000ms delay between books in batch operations (stricter than OL/Google since Hardcover is 60/min vs essentially unlimited).

### Changes to `src/utils/bookMetadataApi.js`

1. Add import: `import * as hardcover from './hardcoverApi';`
2. Add to `METADATA_PROVIDERS`: `HARDCOVER: 'hardcover'`
3. `getMetadataConfig()`: read `bookMetadata.hardcoverApiKey`
4. Add Hardcover branches to all provider-switching functions
5. `batchFetchAllMetadata()`: add `foundSeriesName` and `foundSeriesNumber` to results
6. **Waterfall logic**: When Hardcover is selected, wrap each lookup in a try-catch. If Hardcover returns null/throws, retry with OpenLibrary:

```js
// In getBookDetails (and similar functions):
if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
  if (!config.hardcoverApiKey) {
    throw new Error('Hardcover API key is not configured.');
  }
  const result = await hardcover.getBookDetails(title, author, config.hardcoverApiKey);
  if (result) return result;
  // Waterfall to OpenLibrary
  return openLibrary.getBookDetails(title, author);
}
```

### Changes to `src/components/books/BookManager.js`

1. `handleFillMissing`: detect missing `seriesName` as a gap, apply `foundSeriesName`/`foundSeriesNumber`
2. `handleRefreshAll`: show series name/number in diff review dialog with per-field checkboxes
3. `handleApplyRefreshUpdates`: map `seriesName`/`seriesNumber` to book update payload

### Settings UI Changes

In the metadata provider settings (likely in a Settings component):
- Add "Hardcover" as a third radio/select option
- Show API key text field when Hardcover is selected
- Store as `bookMetadata.hardcoverApiKey` in organization settings

### Existing Provider Enhancement

Also add `seriesName`/`seriesNumber` to the return from `openLibraryApi.getBookDetails()` and `googleBooksApi.getBookDetails()` where the data is available:
- **OpenLibrary**: Use the work API (`/works/{id}.json`) which sometimes has series info — but it's unreliable
- **Google Books**: `volumeInfo.seriesInfo` field exists but is rarely populated

This ensures the `batchFetchAllMetadata` pipeline can carry series data regardless of provider.

## Data Flow

```
Settings: provider = "hardcover", hardcoverApiKey = "abc123"
                    |
BookManager.handleRefreshAll()
                    |
bookMetadataApi.batchFetchAllMetadata(books, settings)
                    |
    for each book (1000ms delay):
        |
    bookMetadataApi.getBookDetails(title, author, settings)
        |
    hardcoverApi.getBookDetails(title, author, apiKey)
        |-- search(query: "Title Author", query_type: "Book")
        |-- books(where: {id: {_eq: matchId}}) { book_series, editions, ... }
        |-- returns: {description, isbn, pageCount, publicationYear, seriesName, seriesNumber}
        |
    if null -> openLibrary.getBookDetails(title, author)  [waterfall]
        |
    result: {foundAuthor, foundDescription, foundGenres, foundIsbn,
             foundPageCount, foundPublicationYear, foundSeriesName, foundSeriesNumber}
                    |
BookManager: show diff dialog -> user reviews -> apply updates
                    |
PUT /api/books/:id  { seriesName, seriesNumber, ... }
                    |
d1Provider.updateBook() -> SQL UPDATE books SET series_name=?, series_number=?
```

## Testing Strategy

1. **Unit tests** for `hardcoverApi.js`: mock `fetch`, test GraphQL query construction, response parsing, error handling, title matching, rate limiting
2. **Unit tests** for waterfall logic in `bookMetadataApi.js`: Hardcover returns null -> falls back to OpenLibrary
3. **Unit tests** for `BookManager.js`: series fields appear in fill/refresh flows
4. **Integration test**: mock Hardcover API responses, verify end-to-end metadata enrichment

## Files Changed

| File | Change |
|------|--------|
| `src/utils/hardcoverApi.js` | **NEW** — Hardcover GraphQL API provider |
| `src/utils/bookMetadataApi.js` | Add Hardcover as third provider + waterfall + series fields |
| `src/utils/openLibraryApi.js` | Add seriesName/seriesNumber to getBookDetails return (best-effort) |
| `src/utils/googleBooksApi.js` | Add seriesName/seriesNumber to getBookDetails return (best-effort) |
| `src/components/books/BookManager.js` | Handle series fields in fill/refresh flows |
| Settings component (TBD) | Add Hardcover provider option + API key field |
| `src/__tests__/unit/hardcoverApi.test.js` | **NEW** — Tests for Hardcover provider |
| `src/__tests__/unit/bookMetadataApi*.test.js` | Update for Hardcover + waterfall + series |

## Risks & Mitigations

- **Hardcover rate limit (60/min)**: 1000ms delay between books + graceful 429 handling with backoff
- **Hardcover downtime**: Waterfall to OpenLibrary ensures degraded but functional experience
- **GraphQL complexity**: Keep queries simple, avoid deeply nested joins; Hardcover has 30s timeout
- **Series matching accuracy**: Hardcover's search is title-based; may return wrong series for common titles. Use `featured_book_series` (the primary series) when available
- **API key exposure**: Stored in org settings (same as Google Books key), transmitted over HTTPS only
