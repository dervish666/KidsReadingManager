# Hardcover API Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Hardcover as a third book metadata provider with waterfall fallback to OpenLibrary, including series data support across the full metadata pipeline.

**Architecture:** New `hardcoverApi.js` module implements the same interface as `openLibraryApi.js`/`googleBooksApi.js`. `bookMetadataApi.js` gains a third provider branch with waterfall (Hardcover → OpenLibrary fallback). Series fields (`foundSeriesName`/`foundSeriesNumber`) are added to `batchFetchAllMetadata` results and wired through BookManager's Fill Missing and Refresh All flows. Settings UI gets a Hardcover option with API key field.

**Tech Stack:** Hardcover GraphQL API (`https://api.hardcover.app/v1/graphql`), fetch, existing React/MUI settings components.

**Design doc:** `docs/plans/2026-02-23-hardcover-integration-design.md`

---

### Task 1: Hardcover API Client — GraphQL Helper + Availability Check

**Files:**
- Create: `src/utils/hardcoverApi.js`
- Create: `src/__tests__/unit/hardcoverApi.test.js`

**Step 1: Write failing tests for the GraphQL helper and availability check**

In `src/__tests__/unit/hardcoverApi.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import {
  checkHardcoverAvailability,
  resetHardcoverAvailabilityCache,
  getHardcoverStatus,
} from '../../utils/hardcoverApi';

describe('hardcoverApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHardcoverAvailabilityCache();
  });

  describe('checkHardcoverAvailability', () => {
    it('returns true when API responds with valid data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __typename: 'query_root' } }),
      });
      const result = await checkHardcoverAvailability('test-key');
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.hardcover.app/v1/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ authorization: 'test-key' }),
        })
      );
    });

    it('returns false when API returns errors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ errors: [{ message: 'Unauthorized' }] }),
      });
      const result = await checkHardcoverAvailability('bad-key');
      expect(result).toBe(false);
    });

    it('returns false when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const result = await checkHardcoverAvailability('test-key');
      expect(result).toBe(false);
    });

    it('caches result for 60 seconds', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __typename: 'query_root' } }),
      });
      await checkHardcoverAvailability('test-key');
      await checkHardcoverAvailability('test-key');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getHardcoverStatus', () => {
    it('returns null available when unchecked', () => {
      const status = getHardcoverStatus();
      expect(status.available).toBeNull();
    });

    it('returns status after check', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { __typename: 'query_root' } }),
      });
      await checkHardcoverAvailability('test-key');
      const status = getHardcoverStatus();
      expect(status.available).toBe(true);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/hardcoverApi.test.js`
Expected: FAIL — module not found

**Step 3: Implement the GraphQL helper and availability functions**

Create `src/utils/hardcoverApi.js`:

```js
/**
 * Hardcover API Integration
 * Provides functions to search for books and retrieve metadata from Hardcover's
 * GraphQL API (https://api.hardcover.app/v1/graphql)
 */

const HARDCOVER_API_URL = 'https://api.hardcover.app/v1/graphql';

// Cache for availability status
let hardcoverAvailable = null;
let lastAvailabilityCheck = 0;
const AVAILABILITY_CHECK_INTERVAL = 60000;

/**
 * Execute a GraphQL query against Hardcover's API
 * @param {string} query - GraphQL query string
 * @param {Object} variables - Query variables
 * @param {string} apiKey - Hardcover API key
 * @returns {Promise<Object>} The data field from the GraphQL response
 */
async function hardcoverQuery(query, variables, apiKey) {
  const response = await fetch(HARDCOVER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'authorization': apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Hardcover API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors) {
    throw new Error(json.errors[0].message);
  }
  return json.data;
}

/**
 * Check if Hardcover API is available
 * @param {string} apiKey - Hardcover API key
 * @param {number} timeout - Timeout in ms (default: 3000)
 * @returns {Promise<boolean>}
 */
export async function checkHardcoverAvailability(apiKey, timeout = 3000) {
  const now = Date.now();

  if (hardcoverAvailable !== null && (now - lastAvailabilityCheck) < AVAILABILITY_CHECK_INTERVAL) {
    return hardcoverAvailable;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(HARDCOVER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authorization': apiKey,
      },
      body: JSON.stringify({ query: '{ __typename }' }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      hardcoverAvailable = false;
      lastAvailabilityCheck = now;
      return false;
    }

    const json = await response.json();
    hardcoverAvailable = !json.errors;
    lastAvailabilityCheck = now;
    return hardcoverAvailable;
  } catch (error) {
    console.log('Hardcover availability check failed:', error.message);
    hardcoverAvailable = false;
    lastAvailabilityCheck = now;
    return false;
  }
}

export function resetHardcoverAvailabilityCache() {
  hardcoverAvailable = null;
  lastAvailabilityCheck = 0;
}

export function getHardcoverStatus() {
  const now = Date.now();
  return {
    available: hardcoverAvailable,
    lastCheck: lastAvailabilityCheck,
    stale: hardcoverAvailable !== null && (now - lastAvailabilityCheck) >= AVAILABILITY_CHECK_INTERVAL,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/hardcoverApi.test.js`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add src/utils/hardcoverApi.js src/__tests__/unit/hardcoverApi.test.js
git commit -m "feat: add Hardcover GraphQL client and availability check"
```

---

### Task 2: Hardcover Search and Author Lookup

**Files:**
- Modify: `src/utils/hardcoverApi.js`
- Modify: `src/__tests__/unit/hardcoverApi.test.js`

**Step 1: Write failing tests for search and author lookup**

Append to the test file — tests for `searchBooksByTitle` and `findAuthorForBook`. The search query uses Hardcover's `search(query, query_type: "Book")` and returns book IDs + results. Then `findAuthorForBook` calls search, picks the best match from `cached_contributors`.

Key mock response shape:
```js
const mockSearchResponse = {
  data: {
    search: {
      results: JSON.stringify([
        {
          document: {
            id: 123,
            title: 'Charlie and the Chocolate Factory',
            author_names: ['Roald Dahl'],
            isbns: ['9780142410318'],
            series_names: ['Charlie Bucket'],
          }
        }
      ])
    }
  }
};
```

Tests:
- `searchBooksByTitle` returns formatted results array
- `searchBooksByTitle` returns empty array when no results
- `findAuthorForBook` returns author from best match
- `findAuthorForBook` returns null when no match
- `findTopAuthorCandidatesForBook` returns array of candidates

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/hardcoverApi.test.js`
Expected: FAIL — functions not exported

**Step 3: Implement search and author functions**

Add to `hardcoverApi.js`:

```js
/**
 * Search for books by title
 * @param {string} title - Book title
 * @param {string} apiKey - Hardcover API key
 * @param {number} limit - Max results (default: 5)
 * @returns {Promise<Array>}
 */
export async function searchBooksByTitle(title, apiKey, limit = 5) {
  const query = `
    query SearchBooks($q: String!, $perPage: Int!) {
      search(query: $q, query_type: "Book", per_page: $perPage) {
        results
      }
    }
  `;

  const data = await hardcoverQuery(query, { q: title.trim(), perPage: limit }, apiKey);
  const results = JSON.parse(data.search.results || '[]');

  return results.map(r => ({
    id: r.document.id,
    title: r.document.title,
    author: r.document.author_names?.[0] || null,
    isbns: r.document.isbns || [],
    seriesNames: r.document.series_names || [],
  }));
}
```

For `findAuthorForBook`: call `searchBooksByTitle`, use `findBestTitleMatch` (copy the similarity logic from OpenLibrary — or import a shared utility), return the author from the best match.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/hardcoverApi.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/hardcoverApi.js src/__tests__/unit/hardcoverApi.test.js
git commit -m "feat: add Hardcover book search and author lookup"
```

---

### Task 3: Hardcover Book Details with Series Data

**Files:**
- Modify: `src/utils/hardcoverApi.js`
- Modify: `src/__tests__/unit/hardcoverApi.test.js`

This is the most important task — the two-step lookup that gets full book details including series.

**Step 1: Write failing tests**

Tests for `getBookDetails(title, author, apiKey)`:

- Returns full details (description, isbn, pageCount, publicationYear, seriesName, seriesNumber, coverUrl) from a matched book
- Returns series data from `book_series` → `series.name` + `position`
- Returns null when no match found
- Handles books with no series (seriesName/seriesNumber are null)
- Handles books with multiple series entries (picks `featured` one)
- Uses `editions.isbn_13` for ISBN when available
- Falls back to `editions.isbn_10` when no ISBN-13

Mock response for detail query:
```js
const mockBookDetailResponse = {
  data: {
    books: [{
      id: 123,
      title: 'Charlie and the Chocolate Factory',
      description: 'A wonderful story...',
      pages: 176,
      release_year: 1964,
      cached_contributors: { Author: [{ author: { name: 'Roald Dahl' } }] },
      cached_tags: { Genre: ['Fiction', "Children's"] },
      book_series: [{
        position: 1,
        featured: true,
        series: { name: 'Charlie Bucket' }
      }],
      editions: [{
        isbn_13: '9780142410318',
        isbn_10: '0142410314',
        page_count: 176,
        release_date: '2007-08-16'
      }],
      cached_image: { url: 'https://hardcover.app/images/books/123.jpg' }
    }]
  }
};
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/hardcoverApi.test.js`

**Step 3: Implement getBookDetails**

Two-step process:
1. Search for the book by title (and author if available) using the search query
2. Fetch full details by book ID with nested `book_series`, `editions`, `cached_contributors`, `cached_tags`

```js
export async function getBookDetails(title, author, apiKey) {
  // Step 1: Search
  const searchResults = await searchBooksByTitle(
    author ? `${title} ${author}` : title,
    apiKey,
    5
  );
  if (!searchResults || searchResults.length === 0) return null;

  // Find best title match
  const bestMatch = findBestTitleMatch(title, searchResults);
  if (!bestMatch) return null;

  // Step 2: Fetch full details by ID
  const detailQuery = `
    query BookDetails($id: Int!) {
      books(where: {id: {_eq: $id}}) {
        id title description pages release_year
        cached_contributors cached_tags cached_image
        book_series(order_by: {featured: desc}) {
          position details featured
          series { name }
        }
        editions(limit: 1, order_by: {users_count: desc}) {
          isbn_13 isbn_10 page_count release_date
        }
      }
    }
  `;

  const data = await hardcoverQuery(detailQuery, { id: bestMatch.id }, apiKey);
  const book = data.books?.[0];
  if (!book) return null;

  // Extract series from featured book_series entry (or first entry)
  const primarySeries = book.book_series?.[0] || null;
  const seriesName = primarySeries?.series?.name || null;
  const seriesNumber = primarySeries?.position != null
    ? (Number.isNaN(Number(primarySeries.position)) ? null : Number(primarySeries.position))
    : null;

  // Extract ISBN from edition
  const edition = book.editions?.[0];
  const isbn = edition?.isbn_13 || edition?.isbn_10 || null;

  // Extract description, truncate
  let description = book.description || null;
  if (description && description.length > 500) {
    description = description.substring(0, 500) + '...';
  }

  // Extract cover URL
  const coverUrl = book.cached_image?.url || null;

  return {
    coverUrl,
    description,
    isbn,
    pageCount: edition?.page_count || book.pages || null,
    publicationYear: book.release_year || null,
    seriesName,
    seriesNumber,
    hardcoverId: book.id,
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/hardcoverApi.test.js`

**Step 5: Commit**

```bash
git add src/utils/hardcoverApi.js src/__tests__/unit/hardcoverApi.test.js
git commit -m "feat: add Hardcover book details with series data"
```

---

### Task 4: Hardcover Genre Lookup and Batch Functions

**Files:**
- Modify: `src/utils/hardcoverApi.js`
- Modify: `src/__tests__/unit/hardcoverApi.test.js`

**Step 1: Write failing tests**

Tests for:
- `findGenresForBook(title, author, apiKey)` — extracts from `cached_tags.Genre`
- `getCoverUrl(bookData)` — returns `cached_image.url` or `coverUrl`
- `batchFindMissingAuthors(books, apiKey, onProgress)` — iterates with 1000ms delay
- `batchFindMissingDescriptions(books, apiKey, onProgress)` — same pattern
- `batchFindMissingGenres(books, apiKey, onProgress)` — same pattern

The batch functions follow the exact same pattern as OpenLibrary/Google Books batch functions: filter books needing data, iterate with delays, call the single-book function, return results with onProgress.

**Step 2: Run tests to verify they fail**

**Step 3: Implement genre lookup and batch functions**

`findGenresForBook`: search + detail fetch, extract `cached_tags.Genre` array. Apply same genre keyword filtering as OpenLibrary if needed, or return raw genres.

Batch functions: follow same pattern as `openLibraryApi.js` lines 343-419 (batchFindMissingAuthors) but with 1000ms delay to respect Hardcover's 60 req/min limit.

**Step 4: Run tests to verify they pass**

**Step 5: Commit**

```bash
git add src/utils/hardcoverApi.js src/__tests__/unit/hardcoverApi.test.js
git commit -m "feat: add Hardcover genre lookup and batch operations"
```

---

### Task 5: Wire Hardcover into bookMetadataApi.js

**Files:**
- Modify: `src/utils/bookMetadataApi.js`
- Modify: `src/__tests__/unit/bookMetadataApiBatch.test.js`

**Step 1: Write failing tests**

Add to existing test file (`bookMetadataApiBatch.test.js`):

1. Mock `hardcoverApi` module alongside existing OpenLibrary/Google mocks
2. Test: with `provider: 'hardcover'` + `hardcoverApiKey`, `batchFetchAllMetadata` calls Hardcover functions
3. Test: result includes `foundSeriesName` and `foundSeriesNumber`
4. Test: waterfall — when Hardcover `getBookDetails` returns null, falls back to OpenLibrary `getBookDetails`
5. Test: waterfall — when Hardcover `findAuthorForBook` throws, falls back to OpenLibrary
6. Test: error when Hardcover selected but no API key

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/bookMetadataApiBatch.test.js`

**Step 3: Implement changes to bookMetadataApi.js**

Changes:
1. `import * as hardcover from './hardcoverApi';`
2. Add `HARDCOVER: 'hardcover'` to `METADATA_PROVIDERS`
3. `getMetadataConfig()`: add `hardcoverApiKey: bookMetadata.hardcoverApiKey || null`
4. Add Hardcover branch (with waterfall fallback) to every provider-switching function:
   - `checkAvailability`
   - `resetAvailabilityCache`
   - `getProviderStatus`
   - `getProviderDisplayName` (returns `'Hardcover'`)
   - `searchBooksByTitle`
   - `findAuthorForBook` — try Hardcover, if null try OpenLibrary
   - `findTopAuthorCandidatesForBook`
   - `getBookDetails` — try Hardcover, if null try OpenLibrary
   - `findGenresForBook` — try Hardcover, if null try OpenLibrary
   - `batchFindMissingAuthors/Descriptions/Genres`
   - `getCoverUrl`
   - `providerRequiresApiKey` — returns true for Hardcover
   - `validateProviderConfig` — check `hardcoverApiKey` present
5. `batchFetchAllMetadata()`: add `foundSeriesName` and `foundSeriesNumber` to results:

```js
// After line 347 (existing foundPublicationYear):
foundSeriesName: details?.seriesName || null,
foundSeriesNumber: details?.seriesNumber != null ? details.seriesNumber : null,
```

And in the error case (after line 357):
```js
foundSeriesName: null,
foundSeriesNumber: null,
```

**Waterfall pattern** (in each function):
```js
if (config.provider === METADATA_PROVIDERS.HARDCOVER) {
  if (!config.hardcoverApiKey) {
    throw new Error('Hardcover API key is not configured. Please add it in Settings.');
  }
  try {
    const result = await hardcover.getBookDetails(title, author, config.hardcoverApiKey);
    if (result) return result;
  } catch (e) {
    console.warn('Hardcover lookup failed, falling back to OpenLibrary:', e.message);
  }
  // Waterfall to OpenLibrary
  return openLibrary.getBookDetails(title, author);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/bookMetadataApiBatch.test.js`

Also run all existing tests to ensure no regressions:
Run: `npx vitest run`

**Step 5: Commit**

```bash
git add src/utils/bookMetadataApi.js src/__tests__/unit/bookMetadataApiBatch.test.js
git commit -m "feat: add Hardcover as metadata provider with waterfall fallback and series fields"
```

---

### Task 6: Wire Series Fields into BookManager Fill Missing

**Files:**
- Modify: `src/components/books/BookManager.js:549-703` (handleFillMissing)

**Step 1: Write failing test**

In `src/__tests__/components/BookManager.test.jsx`, add a test that verifies when `batchFetchAllMetadata` returns `foundSeriesName`/`foundSeriesNumber`, the Fill Missing flow includes them in the update. Check: the snackbar message includes "series" in the parts list.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/BookManager.test.jsx`

**Step 3: Implement series support in handleFillMissing**

In `BookManager.js`, `handleFillMissing` (around line 549):

1. Add `seriesNameMissing` to gap detection (line 556):
```js
const seriesNameMissing = !book.seriesName;
```
Add to the filter condition (line 559):
```js
return authorMissing || descriptionMissing || genresMissing || isbnMissing || pageCountMissing || publicationYearMissing || seriesNameMissing;
```

2. Add counter variable (near line 591):
```js
let seriesUpdated = 0;
```

3. Add series fill logic (after line 666, the publicationYear block):
```js
// Fill series if missing
if (!book.seriesName && result.foundSeriesName) {
  updates.seriesName = result.foundSeriesName;
  if (result.foundSeriesNumber != null) {
    updates.seriesNumber = result.foundSeriesNumber;
  }
  hasUpdate = true;
  seriesUpdated++;
}
```

4. Add to summary parts (after line 690):
```js
if (seriesUpdated > 0) parts.push(`${seriesUpdated} series`);
```

5. Add to totalUpdated calculation (line 692):
```js
const totalUpdated = authorsUpdated + descriptionsUpdated + genresUpdated + isbnsUpdated + pageCountsUpdated + yearsUpdated + seriesUpdated;
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/components/BookManager.test.jsx`

**Step 5: Commit**

```bash
git add src/components/books/BookManager.js src/__tests__/components/BookManager.test.jsx
git commit -m "feat: wire series fields into Fill Missing metadata flow"
```

---

### Task 7: Wire Series Fields into BookManager Refresh All

**Files:**
- Modify: `src/components/books/BookManager.js:705-895` (handleRefreshAll, handleApplyRefreshUpdates)

**Step 1: Write failing test**

Test that Refresh All shows series name and series number in the diff review when fetched data differs from current.

**Step 2: Run test to verify it fails**

**Step 3: Implement series support in Refresh All**

1. In `handleRefreshAll` diff building (after line 787, the publicationYear block), add:
```js
// Series name diff
if (result.foundSeriesName && result.foundSeriesName !== book.seriesName) {
  changes.push({ field: 'seriesName', oldValue: book.seriesName || '(empty)', newValue: result.foundSeriesName, checked: true });
}

// Series number diff
if (result.foundSeriesNumber != null && result.foundSeriesNumber !== book.seriesNumber) {
  changes.push({ field: 'seriesNumber', oldValue: book.seriesNumber != null ? String(book.seriesNumber) : '(empty)', newValue: String(result.foundSeriesNumber), checked: true });
}
```

2. In `handleApplyRefreshUpdates` (after line 833), add:
```js
} else if (change.field === 'seriesName') {
  updates.seriesName = change.newValue;
} else if (change.field === 'seriesNumber') {
  updates.seriesNumber = parseInt(change.newValue, 10);
```

3. In the field label map (line 1739), add series entries:
```js
{{ author: 'Author', description: 'Description', genres: 'Genres', isbn: 'ISBN', pageCount: 'Pages', publicationYear: 'Year', seriesName: 'Series', seriesNumber: 'Series #' }[change.field] || change.field}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/components/BookManager.test.jsx`

**Step 5: Commit**

```bash
git add src/components/books/BookManager.js src/__tests__/components/BookManager.test.jsx
git commit -m "feat: wire series fields into Refresh All metadata flow"
```

---

### Task 8: Update Settings UI for Hardcover Provider

**Files:**
- Modify: `src/components/BookMetadataSettings.js`

**Step 1: Write failing test (optional — this is a UI change)**

If there's a test file for BookMetadataSettings, add a test that the Hardcover option appears in the dropdown and shows the API key field when selected.

**Step 2: Implement Settings UI changes**

In `BookMetadataSettings.js`:

1. Add state for Hardcover API key (line 24):
```js
const [hardcoverApiKey, setHardcoverApiKey] = useState('');
```

2. Load from settings (line 32):
```js
setHardcoverApiKey(settings.bookMetadata.hardcoverApiKey || '');
```

3. Include in save payload (line 43):
```js
bookMetadata: {
  provider,
  googleBooksApiKey,
  hardcoverApiKey
}
```

4. Add condition for showing Hardcover API key field (line 71):
```js
const showHardcoverApiKeyField = provider === METADATA_PROVIDERS.HARDCOVER;
const isHardcoverWithoutKey = provider === METADATA_PROVIDERS.HARDCOVER && !hardcoverApiKey.trim();
```

5. Add MenuItem for Hardcover (after line 121):
```jsx
<MenuItem value={METADATA_PROVIDERS.HARDCOVER}>
  Hardcover (Requires API key, best series data)
</MenuItem>
```

6. Add Hardcover API key field (after the Google Books key field, line 136):
```jsx
{showHardcoverApiKeyField && (
  <TextField
    fullWidth
    label="Hardcover API Key"
    type="password"
    value={hardcoverApiKey}
    onChange={(e) => setHardcoverApiKey(e.target.value)}
    helperText="Get your API key from hardcover.app/account/api"
    sx={{ mb: 3 }}
    error={isHardcoverWithoutKey}
  />
)}
```

7. Add Hardcover description in the provider comparison box (after line 147):
```jsx
<Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
  <strong>Hardcover:</strong> Curated community database with excellent series data. Requires API key (free). Falls back to Open Library when no match found.
</Typography>
```

8. Update disabled condition on Save button (line 154):
```js
disabled={isSaving || isGoogleBooksWithoutKey || isHardcoverWithoutKey}
```

9. Add warning Alert for missing Hardcover key (after line 105):
```jsx
{isHardcoverWithoutKey && (
  <Alert severity="warning" sx={{ mb: 3 }}>
    Hardcover requires an API key. Please enter your API key below or switch to Open Library.
  </Alert>
)}
```

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/components/BookMetadataSettings.js
git commit -m "feat: add Hardcover option to metadata provider settings UI"
```

---

### Task 9: Add Series Fields to OpenLibrary/Google Books getBookDetails (Best-Effort)

**Files:**
- Modify: `src/utils/openLibraryApi.js:422-507` (getBookDetails)
- Modify: `src/utils/googleBooksApi.js:273-334` (getBookDetails)

**Step 1: Write failing tests**

Test that `getBookDetails` return objects include `seriesName: null` and `seriesNumber: null` fields (so the unified API always has these fields regardless of provider).

**Step 2: Run tests to verify they fail**

**Step 3: Implement**

In `openLibraryApi.js`, `getBookDetails` return (line 493), add:
```js
seriesName: null,
seriesNumber: null,
```
OpenLibrary search API doesn't return series reliably, so these stay null. (The `isbnLookup.js` ISBN-specific flow already handles OL series from the edition API — that's separate.)

In `googleBooksApi.js`, `getBookDetails` return (line 316), add:
```js
seriesName: null,
seriesNumber: null,
```
Google Books' `seriesInfo` is rarely populated and the field structure is undocumented — not worth parsing.

This ensures `batchFetchAllMetadata` can always read `details?.seriesName` without `undefined`.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run`

**Step 5: Commit**

```bash
git add src/utils/openLibraryApi.js src/utils/googleBooksApi.js
git commit -m "feat: add seriesName/seriesNumber fields to all provider getBookDetails returns"
```

---

### Task 10: Full Integration Test and Final Verification

**Files:**
- All changed files

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (should be ~1420+ tests)

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Manual smoke test (optional)**

Start dev server: `npm run start:dev`
1. Go to Settings → Book Metadata → select Hardcover, enter API key, save
2. Go to Books → Refresh All → verify series data appears in diff dialog
3. Go to Books → Fill Missing → verify series gaps get filled
4. Switch back to OpenLibrary → verify it still works

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "feat: Hardcover API integration — full metadata provider with series support"
```
