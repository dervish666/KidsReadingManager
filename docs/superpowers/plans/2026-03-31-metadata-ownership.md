# Metadata Ownership Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralise book metadata management from per-school to owner-managed with a cascading multi-provider engine, server-side batch processing, and simplified school admin view.

**Architecture:** New `metadata` route with job-based enrichment. A cascade engine calls Hardcover → Google Books → OpenLibrary server-side, merging best results per book. Frontend polls a batch endpoint that processes N books per call with resume capability via D1 job state. Owner configures providers and triggers global enrichment; school admins get a simplified "Fill Missing" button.

**Tech Stack:** Hono routes, D1 database, R2 storage, Vitest, React/MUI

**Spec:** `docs/superpowers/specs/2026-03-31-metadata-ownership-design.md`

---

## Chunk 1: Database Migration & Provider Adapters

### Task 1: Database Migration

**Files:**
- Create: `migrations/0042_metadata_ownership.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- migrations/0042_metadata_ownership.sql

-- Global metadata configuration (single row, owner-managed)
CREATE TABLE IF NOT EXISTS metadata_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  provider_chain TEXT NOT NULL DEFAULT '["hardcover","googlebooks","openlibrary"]',
  hardcover_api_key_encrypted TEXT,
  google_books_api_key_encrypted TEXT,
  rate_limit_delay_ms INTEGER NOT NULL DEFAULT 1500,
  batch_size INTEGER NOT NULL DEFAULT 10,
  fetch_covers INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Seed default config row
INSERT OR IGNORE INTO metadata_config (id) VALUES ('default');

-- Enrichment job tracking
CREATE TABLE IF NOT EXISTS metadata_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  job_type TEXT NOT NULL CHECK (job_type IN ('fill_missing', 'refresh_all')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
  total_books INTEGER NOT NULL DEFAULT 0,
  processed_books INTEGER NOT NULL DEFAULT 0,
  enriched_books INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_book_id TEXT,
  include_covers INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metadata_jobs_org ON metadata_jobs(organization_id);

-- Per-book enrichment history
CREATE TABLE IF NOT EXISTS book_metadata_log (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  fields_updated TEXT,
  cover_url TEXT,
  enriched_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metadata_log_book_id ON book_metadata_log(book_id);
```

- [ ] **Step 2: Apply migration locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration applies successfully, tables created.

- [ ] **Step 3: Verify tables exist**

Run: `npx wrangler d1 execute reading-manager-db --local --command "SELECT * FROM metadata_config"`
Expected: One row with id='default' and default values.

- [ ] **Step 4: Commit**

```bash
git add migrations/0042_metadata_ownership.sql
git commit -m "feat: add metadata_config, metadata_jobs, book_metadata_log tables (migration 0042)"
```

---

### Task 2: OpenLibrary Provider Adapter

**Files:**
- Create: `src/services/providers/openLibraryProvider.js`
- Test: `src/__tests__/unit/providers/openLibraryProvider.test.js`

This adapter calls OpenLibrary server-side to fetch metadata for a single book. It uses `fetchWithTimeout` from `src/utils/helpers.js` — the same utility the existing cover system uses.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/unit/providers/openLibraryProvider.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetchWithTimeout before importing the module
vi.mock('../../../utils/helpers.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchMetadata } from '../../../services/providers/openLibraryProvider';
import { fetchWithTimeout } from '../../../utils/helpers.js';

describe('openLibraryProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns metadata from search results', async () => {
    // Search endpoint returns a match
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        docs: [{
          title: 'The Gruffalo',
          author_name: ['Julia Donaldson'],
          first_publish_year: 1999,
          isbn: ['9780142403877'],
          cover_i: 6281982,
          number_of_pages_median: 32,
          subject: ['Children\'s fiction', 'Animals', 'Monsters'],
        }],
      }),
    });

    // Works endpoint returns description
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        description: { value: 'A mouse walks through the woods.' },
      }),
    });

    const result = await fetchMetadata({ title: 'The Gruffalo', author: 'Julia Donaldson' });

    expect(result.author).toBe('Julia Donaldson');
    expect(result.isbn).toBe('9780142403877');
    expect(result.publicationYear).toBe(1999);
    expect(result.pageCount).toBe(32);
    expect(result.description).toBe('A mouse walks through the woods.');
    expect(result.genres).toEqual(['Children\'s fiction', 'Animals', 'Monsters']);
    expect(result.coverUrl).toContain('6281982');
  });

  it('returns empty result when no match found', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ docs: [] }),
    });

    const result = await fetchMetadata({ title: 'Nonexistent Book XYZ123' });

    expect(result.author).toBeNull();
    expect(result.description).toBeNull();
  });

  it('returns empty result on network error', async () => {
    fetchWithTimeout.mockRejectedValueOnce(new Error('timeout'));

    const result = await fetchMetadata({ title: 'The Gruffalo' });

    expect(result.author).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/providers/openLibraryProvider.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/services/providers/openLibraryProvider.js`:

```javascript
/**
 * OpenLibrary server-side provider adapter.
 * Fetches book metadata from OpenLibrary Search + Works APIs.
 * No API key required.
 */
import { fetchWithTimeout } from '../../utils/helpers.js';

const SEARCH_URL = 'https://openlibrary.org/search.json';
const COVERS_URL = 'https://covers.openlibrary.org/b';
const TIMEOUT = 5000;

/**
 * @param {{ title: string, author?: string, isbn?: string }} book
 * @returns {Promise<{ author, description, genres, isbn, pageCount, publicationYear, seriesName, seriesNumber, coverUrl }>}
 */
export async function fetchMetadata(book) {
  const empty = {
    author: null, description: null, genres: null, isbn: null,
    pageCount: null, publicationYear: null, seriesName: null,
    seriesNumber: null, coverUrl: null,
  };

  try {
    // 1. Search by ISBN first (most precise), fall back to title+author
    const params = new URLSearchParams({
      limit: '5',
      fields: 'key,title,author_name,first_publish_year,isbn,cover_i,number_of_pages_median,subject',
    });

    if (book.isbn) {
      params.set('isbn', book.isbn);
    } else {
      params.set('title', book.title);
      if (book.author) params.set('author', book.author);
    }

    const searchRes = await fetchWithTimeout(
      `${SEARCH_URL}?${params}`,
      { headers: { 'User-Agent': 'TallyReading/1.0 (educational-app)' } },
      TIMEOUT,
    );

    if (!searchRes.ok) return empty;
    const searchData = await searchRes.json();
    const doc = searchData.docs?.[0];
    if (!doc) return empty;

    // 2. Extract structured fields from search result
    const result = { ...empty };
    result.author = doc.author_name?.[0] || null;
    result.publicationYear = doc.first_publish_year || null;
    result.pageCount = doc.number_of_pages_median || null;
    result.genres = doc.subject?.slice(0, 5) || null;

    // Pick the first ISBN-13 (13 digits) or first ISBN
    if (doc.isbn?.length) {
      result.isbn = doc.isbn.find((i) => i.length === 13) || doc.isbn[0];
    }

    // Cover URL from cover ID
    if (doc.cover_i) {
      result.coverUrl = `${COVERS_URL}/id/${doc.cover_i}-M.jpg`;
    }

    // 3. Fetch description from Works API (search doesn't include it)
    if (doc.key) {
      try {
        const worksRes = await fetchWithTimeout(
          `https://openlibrary.org${doc.key}.json`,
          { headers: { 'User-Agent': 'TallyReading/1.0 (educational-app)' } },
          TIMEOUT,
        );
        if (worksRes.ok) {
          const worksData = await worksRes.json();
          const desc = worksData.description;
          result.description = typeof desc === 'string' ? desc : desc?.value || null;
        }
      } catch {
        // Description fetch failed — continue with what we have
      }
    }

    return result;
  } catch {
    return empty;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/providers/openLibraryProvider.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/providers/openLibraryProvider.js src/__tests__/unit/providers/openLibraryProvider.test.js
git commit -m "feat: add OpenLibrary server-side provider adapter with tests"
```

---

### Task 3: Google Books Provider Adapter

**Files:**
- Create: `src/services/providers/googleBooksProvider.js`
- Test: `src/__tests__/unit/providers/googleBooksProvider.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/unit/providers/googleBooksProvider.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/helpers.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchMetadata } from '../../../services/providers/googleBooksProvider';
import { fetchWithTimeout } from '../../../utils/helpers.js';

describe('googleBooksProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns metadata from Google Books API', async () => {
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        items: [{
          volumeInfo: {
            title: 'The Gruffalo',
            authors: ['Julia Donaldson'],
            description: 'A mouse walks through the woods.',
            publishedDate: '1999-03-23',
            pageCount: 32,
            categories: ['Juvenile Fiction'],
            industryIdentifiers: [
              { type: 'ISBN_13', identifier: '9780142403877' },
            ],
            imageLinks: { thumbnail: 'https://books.google.com/cover.jpg' },
          },
        }],
      }),
    });

    const result = await fetchMetadata(
      { title: 'The Gruffalo', author: 'Julia Donaldson' },
      'test-api-key',
    );

    expect(result.author).toBe('Julia Donaldson');
    expect(result.description).toBe('A mouse walks through the woods.');
    expect(result.isbn).toBe('9780142403877');
    expect(result.publicationYear).toBe(1999);
    expect(result.pageCount).toBe(32);
    expect(result.genres).toEqual(['Juvenile Fiction']);
    expect(result.coverUrl).toBe('https://books.google.com/cover.jpg');
  });

  it('returns empty result without API key', async () => {
    const result = await fetchMetadata({ title: 'Test' }, null);
    expect(result.author).toBeNull();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('returns empty result on 429', async () => {
    fetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 429 });
    const result = await fetchMetadata({ title: 'Test' }, 'key');
    expect(result.author).toBeNull();
    expect(result.rateLimited).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/providers/googleBooksProvider.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/services/providers/googleBooksProvider.js`:

```javascript
/**
 * Google Books server-side provider adapter.
 * Requires API key from metadata_config.
 */
import { fetchWithTimeout } from '../../utils/helpers.js';

const VOLUMES_URL = 'https://www.googleapis.com/books/v1/volumes';
const TIMEOUT = 5000;

/**
 * @param {{ title: string, author?: string, isbn?: string }} book
 * @param {string|null} apiKey - Google Books API key
 * @returns {Promise<{ author, description, genres, isbn, pageCount, publicationYear, seriesName, seriesNumber, coverUrl, rateLimited? }>}
 */
export async function fetchMetadata(book, apiKey) {
  const empty = {
    author: null, description: null, genres: null, isbn: null,
    pageCount: null, publicationYear: null, seriesName: null,
    seriesNumber: null, coverUrl: null,
  };

  if (!apiKey) return empty;

  try {
    // Build query: prefer ISBN, fall back to title+author
    let q;
    if (book.isbn) {
      q = `isbn:${book.isbn}`;
    } else {
      q = `intitle:${book.title.trim()}`;
      if (book.author) q += `+inauthor:${book.author.trim()}`;
    }

    const params = new URLSearchParams({
      q,
      maxResults: '5',
      key: apiKey,
    });

    const res = await fetchWithTimeout(`${VOLUMES_URL}?${params}`, {}, TIMEOUT);

    if (!res.ok) {
      if (res.status === 429) return { ...empty, rateLimited: true };
      return empty;
    }

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return empty;

    const vol = item.volumeInfo;
    const result = { ...empty };

    result.author = vol.authors?.[0] || null;
    result.description = vol.description || null;
    result.pageCount = vol.pageCount || null;
    result.genres = vol.categories?.slice(0, 5) || null;

    // Publication year from date string
    if (vol.publishedDate) {
      const year = parseInt(vol.publishedDate.substring(0, 4), 10);
      if (!isNaN(year)) result.publicationYear = year;
    }

    // ISBN: prefer ISBN_13
    const ids = vol.industryIdentifiers || [];
    const isbn13 = ids.find((i) => i.type === 'ISBN_13');
    const isbn10 = ids.find((i) => i.type === 'ISBN_10');
    result.isbn = isbn13?.identifier || isbn10?.identifier || null;

    // Cover URL — upgrade to higher res by removing edge=curl and zoom
    if (vol.imageLinks?.thumbnail) {
      result.coverUrl = vol.imageLinks.thumbnail.replace('&edge=curl', '').replace('zoom=1', 'zoom=2');
    }

    return result;
  } catch {
    return empty;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/providers/googleBooksProvider.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/providers/googleBooksProvider.js src/__tests__/unit/providers/googleBooksProvider.test.js
git commit -m "feat: add Google Books server-side provider adapter with tests"
```

---

### Task 4: Hardcover Provider Adapter

**Files:**
- Create: `src/services/providers/hardcoverProvider.js`
- Test: `src/__tests__/unit/providers/hardcoverProvider.test.js`

The existing client-side `hardcoverApi.js` routes through a proxy at `/api/hardcover/graphql`. The server-side adapter calls Hardcover's API directly at `https://api.hardcover.app/v1/graphql` with the centrally-stored API key.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/unit/providers/hardcoverProvider.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/helpers.js', () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchMetadata } from '../../../services/providers/hardcoverProvider';
import { fetchWithTimeout } from '../../../utils/helpers.js';

describe('hardcoverProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns metadata with series data from Hardcover', async () => {
    // Search response
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          search: {
            results: JSON.stringify({
              hits: [{ document: { id: 42, title: 'The Gruffalo', author_names: ['Julia Donaldson'] } }],
            }),
          },
        },
      }),
    });

    // Book details response
    fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          books: [{
            id: 42,
            title: 'The Gruffalo',
            description: 'A mouse walks through the woods.',
            pages: 32,
            release_year: 1999,
            cached_contributors: JSON.stringify([{ author: { name: 'Julia Donaldson' } }]),
            cached_tags: JSON.stringify([{ tag: 'childrens' }, { tag: 'picture-books' }]),
            cached_image: 'https://hardcover.app/covers/gruffalo.jpg',
            book_series: [{ position: '1', series: { name: 'Gruffalo Series' } }],
            editions: [{ isbn_13: '9780142403877', isbn_10: null, pages: 32 }],
          }],
        },
      }),
    });

    const result = await fetchMetadata(
      { title: 'The Gruffalo', author: 'Julia Donaldson' },
      'test-api-key',
    );

    expect(result.author).toBe('Julia Donaldson');
    expect(result.description).toBe('A mouse walks through the woods.');
    expect(result.isbn).toBe('9780142403877');
    expect(result.publicationYear).toBe(1999);
    expect(result.pageCount).toBe(32);
    expect(result.seriesName).toBe('Gruffalo Series');
    expect(result.seriesNumber).toBe(1);
    expect(result.coverUrl).toBe('https://hardcover.app/covers/gruffalo.jpg');
  });

  it('returns empty result without API key', async () => {
    const result = await fetchMetadata({ title: 'Test' }, null);
    expect(result.author).toBeNull();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('sets rateLimited flag on 429', async () => {
    fetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 429 });
    const result = await fetchMetadata({ title: 'Test' }, 'key');
    expect(result.rateLimited).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/providers/hardcoverProvider.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/services/providers/hardcoverProvider.js`:

```javascript
/**
 * Hardcover server-side provider adapter.
 * Calls Hardcover GraphQL API directly with centrally-stored API key.
 * Best source for series data.
 */
import { fetchWithTimeout } from '../../utils/helpers.js';

const GRAPHQL_URL = 'https://api.hardcover.app/v1/graphql';
const TIMEOUT = 8000;

const SEARCH_QUERY = `
  query SearchBooks($q: String!, $perPage: Int!) {
    search(query: $q, query_type: "Book", per_page: $perPage) {
      results
    }
  }
`;

const DETAILS_QUERY = `
  query BookDetails($id: Int!) {
    books(where: {id: {_eq: $id}}) {
      id title description pages release_year
      cached_contributors cached_tags cached_image
      book_series(order_by: {featured: desc}) {
        position series { name }
      }
      editions(limit: 1, order_by: {users_count: desc}) {
        isbn_13 isbn_10 pages release_date
      }
    }
  }
`;

async function graphql(query, variables, apiKey) {
  return fetchWithTimeout(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  }, TIMEOUT);
}

/**
 * @param {{ title: string, author?: string, isbn?: string }} book
 * @param {string|null} apiKey
 * @returns {Promise<{ author, description, genres, isbn, pageCount, publicationYear, seriesName, seriesNumber, coverUrl, rateLimited? }>}
 */
export async function fetchMetadata(book, apiKey) {
  const empty = {
    author: null, description: null, genres: null, isbn: null,
    pageCount: null, publicationYear: null, seriesName: null,
    seriesNumber: null, coverUrl: null,
  };

  if (!apiKey) return empty;

  try {
    // 1. Search for the book
    const searchQ = book.author ? `${book.title} ${book.author}` : book.title;
    const searchRes = await graphql(SEARCH_QUERY, { q: searchQ, perPage: 5 }, apiKey);

    if (!searchRes.ok) {
      if (searchRes.status === 429) return { ...empty, rateLimited: true };
      return empty;
    }

    const searchData = await searchRes.json();

    // Check for rate limit in GraphQL errors
    if (searchData.errors?.some((e) => /rate.?limit|too many/i.test(e.message))) {
      return { ...empty, rateLimited: true };
    }

    const resultsStr = searchData.data?.search?.results;
    if (!resultsStr) return empty;

    const parsed = typeof resultsStr === 'string' ? JSON.parse(resultsStr) : resultsStr;
    const hit = parsed.hits?.[0]?.document;
    if (!hit?.id) return empty;

    // 2. Fetch full details
    const detailsRes = await graphql(DETAILS_QUERY, { id: hit.id }, apiKey);
    if (!detailsRes.ok) {
      if (detailsRes.status === 429) return { ...empty, rateLimited: true };
      return empty;
    }

    const detailsData = await detailsRes.json();
    if (detailsData.errors?.some((e) => /rate.?limit|too many/i.test(e.message))) {
      return { ...empty, rateLimited: true };
    }

    const b = detailsData.data?.books?.[0];
    if (!b) return empty;

    const result = { ...empty };

    // Author from cached_contributors
    try {
      const contributors = typeof b.cached_contributors === 'string'
        ? JSON.parse(b.cached_contributors)
        : b.cached_contributors;
      result.author = contributors?.[0]?.author?.name || null;
    } catch { /* ignore */ }

    result.description = b.description || null;
    result.pageCount = b.pages || b.editions?.[0]?.pages || null;
    result.publicationYear = b.release_year || null;
    result.coverUrl = b.cached_image || null;

    // Genres from cached_tags
    try {
      const tags = typeof b.cached_tags === 'string' ? JSON.parse(b.cached_tags) : b.cached_tags;
      result.genres = tags?.slice(0, 5).map((t) => t.tag || t) || null;
    } catch { /* ignore */ }

    // ISBN from edition
    const edition = b.editions?.[0];
    result.isbn = edition?.isbn_13 || edition?.isbn_10 || null;

    // Series data
    const primarySeries = b.book_series?.[0];
    if (primarySeries?.series?.name) {
      result.seriesName = primarySeries.series.name;
      const pos = Number(primarySeries.position);
      result.seriesNumber = isNaN(pos) ? null : pos;
    }

    return result;
  } catch {
    return empty;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/providers/hardcoverProvider.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/providers/hardcoverProvider.js src/__tests__/unit/providers/hardcoverProvider.test.js
git commit -m "feat: add Hardcover server-side provider adapter with tests"
```

---

## Chunk 2: Cascade Engine

### Task 5: Metadata Service — Cascade Engine

**Files:**
- Create: `src/services/metadataService.js`
- Test: `src/__tests__/unit/metadataService.test.js`

The cascade engine is the core of the system. It takes a book and a config, calls each provider in order, and merges the results. It also handles genre creation and cover fetching.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/unit/metadataService.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/providers/openLibraryProvider', () => ({
  fetchMetadata: vi.fn(),
}));
vi.mock('../../services/providers/googleBooksProvider', () => ({
  fetchMetadata: vi.fn(),
}));
vi.mock('../../services/providers/hardcoverProvider', () => ({
  fetchMetadata: vi.fn(),
}));

import { enrichBook } from '../../services/metadataService';
import { fetchMetadata as olFetch } from '../../services/providers/openLibraryProvider';
import { fetchMetadata as gbFetch } from '../../services/providers/googleBooksProvider';
import { fetchMetadata as hcFetch } from '../../services/providers/hardcoverProvider';

const baseConfig = {
  providerChain: ['hardcover', 'googlebooks', 'openlibrary'],
  hardcoverApiKey: 'hc-key',
  googleBooksApiKey: 'gb-key',
  fetchCovers: false,
};

describe('metadataService.enrichBook', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('merges results from multiple providers (first non-empty wins)', async () => {
    // Hardcover returns author + series but no description
    hcFetch.mockResolvedValueOnce({
      author: 'Julia Donaldson', description: null, genres: null,
      isbn: null, pageCount: null, publicationYear: null,
      seriesName: 'Gruffalo Series', seriesNumber: 1, coverUrl: null,
    });

    // Google Books returns description + ISBN but no series
    gbFetch.mockResolvedValueOnce({
      author: 'J. Donaldson', description: 'A mouse walks through the woods.',
      genres: ['Juvenile Fiction'], isbn: '9780142403877', pageCount: 32,
      publicationYear: 1999, seriesName: null, seriesNumber: null, coverUrl: null,
    });

    // OpenLibrary not called because all fields are filled after Google Books

    const result = await enrichBook(
      { id: 'book1', title: 'The Gruffalo', author: '' },
      baseConfig,
    );

    // Author from Hardcover (first provider), description from Google Books
    expect(result.merged.author).toBe('Julia Donaldson');
    expect(result.merged.description).toBe('A mouse walks through the woods.');
    expect(result.merged.seriesName).toBe('Gruffalo Series');
    expect(result.merged.isbn).toBe('9780142403877');
    expect(result.log).toHaveLength(2); // Two providers contributed
    expect(olFetch).not.toHaveBeenCalled(); // Short-circuited
  });

  it('falls through to next provider when first returns empty', async () => {
    hcFetch.mockResolvedValueOnce({
      author: null, description: null, genres: null, isbn: null,
      pageCount: null, publicationYear: null, seriesName: null,
      seriesNumber: null, coverUrl: null,
    });

    gbFetch.mockResolvedValueOnce({
      author: null, description: null, genres: null, isbn: null,
      pageCount: null, publicationYear: null, seriesName: null,
      seriesNumber: null, coverUrl: null,
    });

    olFetch.mockResolvedValueOnce({
      author: 'Julia Donaldson', description: 'A story.', genres: null,
      isbn: null, pageCount: null, publicationYear: 1999,
      seriesName: null, seriesNumber: null, coverUrl: null,
    });

    const result = await enrichBook(
      { id: 'book1', title: 'The Gruffalo' },
      baseConfig,
    );

    expect(result.merged.author).toBe('Julia Donaldson');
    expect(result.merged.publicationYear).toBe(1999);
    expect(olFetch).toHaveBeenCalled();
  });

  it('skips providers not in the chain', async () => {
    olFetch.mockResolvedValueOnce({
      author: 'Julia Donaldson', description: 'A story.', genres: null,
      isbn: null, pageCount: 32, publicationYear: 1999,
      seriesName: null, seriesNumber: null, coverUrl: null,
    });

    const result = await enrichBook(
      { id: 'book1', title: 'The Gruffalo' },
      { ...baseConfig, providerChain: ['openlibrary'] },
    );

    expect(result.merged.author).toBe('Julia Donaldson');
    expect(hcFetch).not.toHaveBeenCalled();
    expect(gbFetch).not.toHaveBeenCalled();
  });

  it('tracks which provider supplied which fields in the log', async () => {
    hcFetch.mockResolvedValueOnce({
      author: 'Julia Donaldson', description: null, genres: null,
      isbn: null, pageCount: null, publicationYear: null,
      seriesName: 'Gruffalo Series', seriesNumber: 1, coverUrl: null,
    });

    gbFetch.mockResolvedValueOnce({
      author: 'J. Donaldson', description: 'A story.', genres: ['Fiction'],
      isbn: '9780142403877', pageCount: 32, publicationYear: 1999,
      seriesName: null, seriesNumber: null, coverUrl: null,
    });

    const result = await enrichBook(
      { id: 'book1', title: 'The Gruffalo' },
      baseConfig,
    );

    const hcLog = result.log.find((l) => l.provider === 'hardcover');
    expect(hcLog.fields).toContain('author');
    expect(hcLog.fields).toContain('seriesName');

    const gbLog = result.log.find((l) => l.provider === 'googlebooks');
    expect(gbLog.fields).toContain('description');
    expect(gbLog.fields).toContain('isbn');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/metadataService.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `src/services/metadataService.js`:

```javascript
/**
 * Metadata cascade engine.
 * Calls providers in configured order, merges best-of results per field.
 */
import { fetchMetadata as openLibraryFetch } from './providers/openLibraryProvider.js';
import { fetchMetadata as googleBooksFetch } from './providers/googleBooksProvider.js';
import { fetchMetadata as hardcoverFetch } from './providers/hardcoverProvider.js';

const PROVIDERS = {
  openlibrary: { fetch: openLibraryFetch, needsKey: false },
  googlebooks: { fetch: googleBooksFetch, needsKey: true, keyField: 'googleBooksApiKey' },
  hardcover: { fetch: hardcoverFetch, needsKey: true, keyField: 'hardcoverApiKey' },
};

const MERGE_FIELDS = [
  'author', 'description', 'genres', 'isbn',
  'pageCount', 'publicationYear', 'seriesName', 'seriesNumber', 'coverUrl',
];

/**
 * Enrich a single book by calling providers in cascade order.
 *
 * @param {{ id: string, title: string, author?: string, isbn?: string }} book
 * @param {{ providerChain: string[], hardcoverApiKey?: string, googleBooksApiKey?: string, fetchCovers: boolean }} config
 * @returns {Promise<{ merged: object, log: Array<{ provider: string, fields: string[] }>, rateLimited: string[] }>}
 */
export async function enrichBook(book, config) {
  const merged = {};
  const log = [];
  const rateLimited = [];

  for (const providerName of config.providerChain) {
    const provider = PROVIDERS[providerName];
    if (!provider) continue;

    // Skip providers that need a key if none is configured
    if (provider.needsKey && !config[provider.keyField]) continue;

    // Call the provider
    const apiKey = provider.needsKey ? config[provider.keyField] : undefined;
    const result = await provider.fetch(book, apiKey);

    if (result.rateLimited) {
      rateLimited.push(providerName);
      continue;
    }

    // Merge: first non-empty value wins per field
    const fieldsFromThisProvider = [];
    for (const field of MERGE_FIELDS) {
      if (merged[field] != null) continue; // Already filled by earlier provider
      const value = result[field];
      if (value == null) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (typeof value === 'string' && !value.trim()) continue;

      merged[field] = value;
      fieldsFromThisProvider.push(field);
    }

    if (fieldsFromThisProvider.length > 0) {
      log.push({ provider: providerName, fields: fieldsFromThisProvider });
    }

    // Short-circuit if all fields are populated
    const allFilled = MERGE_FIELDS.every((f) => merged[f] != null);
    if (allFilled) break;
  }

  return { merged, log, rateLimited };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/metadataService.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/metadataService.js src/__tests__/unit/metadataService.test.js
git commit -m "feat: add metadata cascade engine with merge-best-of and provider logging"
```

---

## Chunk 3: API Endpoints

### Task 6: Metadata Config Endpoints (Owner Only)

**Files:**
- Create: `src/routes/metadata.js`
- Modify: `src/worker.js` (add route registration)

These endpoints let the owner read and update the cascade configuration (provider chain, API keys, rate limits, batch size, covers toggle).

- [ ] **Step 1: Write the route file with config endpoints**

Create `src/routes/metadata.js`:

```javascript
import { Hono } from 'hono';
import { requireOwner, requireAdmin, auditLog } from '../middleware/tenant';
import { badRequestError } from '../middleware/errorHandler';
import { encryptSensitiveData, decryptSensitiveData } from '../utils/crypto';
import { requireDB } from '../utils/routeHelpers';
import { enrichBook, processBatch } from '../services/metadataService';

const metadataRouter = new Hono();

// --- Helpers ---

async function getConfig(db) {
  const row = await db.prepare('SELECT * FROM metadata_config WHERE id = ?').bind('default').first();
  if (!row) return null;
  return {
    providerChain: JSON.parse(row.provider_chain),
    hasHardcoverApiKey: Boolean(row.hardcover_api_key_encrypted),
    hasGoogleBooksApiKey: Boolean(row.google_books_api_key_encrypted),
    rateLimitDelayMs: row.rate_limit_delay_ms,
    batchSize: row.batch_size,
    fetchCovers: Boolean(row.fetch_covers),
  };
}

async function getConfigWithKeys(db, jwtSecret) {
  const row = await db.prepare('SELECT * FROM metadata_config WHERE id = ?').bind('default').first();
  if (!row) return null;

  let hardcoverApiKey = null;
  let googleBooksApiKey = null;

  if (row.hardcover_api_key_encrypted && jwtSecret) {
    try { hardcoverApiKey = await decryptSensitiveData(row.hardcover_api_key_encrypted, jwtSecret); }
    catch { /* plaintext or corrupt — ignore */ }
  }
  if (row.google_books_api_key_encrypted && jwtSecret) {
    try { googleBooksApiKey = await decryptSensitiveData(row.google_books_api_key_encrypted, jwtSecret); }
    catch { /* plaintext or corrupt — ignore */ }
  }

  return {
    providerChain: JSON.parse(row.provider_chain),
    hardcoverApiKey,
    googleBooksApiKey,
    rateLimitDelayMs: row.rate_limit_delay_ms,
    batchSize: row.batch_size,
    fetchCovers: Boolean(row.fetch_covers),
  };
}

// --- Config Endpoints (Owner Only) ---

/**
 * GET /api/metadata/config
 * Read cascade configuration (API keys redacted to booleans).
 */
metadataRouter.get('/config', requireOwner(), async (c) => {
  const db = requireDB(c.env);
  const config = await getConfig(db);
  return c.json(config || {});
});

/**
 * PUT /api/metadata/config
 * Update cascade configuration.
 */
metadataRouter.put('/config', requireOwner(), auditLog('update', 'metadata_config'), async (c) => {
  const db = requireDB(c.env);
  const body = await c.req.json();
  const jwtSecret = c.env.JWT_SECRET;
  const userId = c.get('userId');

  // Validate provider chain if provided
  if (body.providerChain !== undefined) {
    const validProviders = ['hardcover', 'googlebooks', 'openlibrary'];
    if (!Array.isArray(body.providerChain) || !body.providerChain.every((p) => validProviders.includes(p))) {
      throw badRequestError('Invalid provider chain');
    }
  }

  if (body.rateLimitDelayMs !== undefined) {
    const delay = parseInt(body.rateLimitDelayMs, 10);
    if (isNaN(delay) || delay < 500 || delay > 5000) throw badRequestError('rateLimitDelayMs must be 500-5000');
  }

  if (body.batchSize !== undefined) {
    const size = parseInt(body.batchSize, 10);
    if (isNaN(size) || size < 5 || size > 50) throw badRequestError('batchSize must be 5-50');
  }

  // Encrypt API keys if provided
  let hardcoverEncrypted = undefined;
  if (body.hardcoverApiKey !== undefined && jwtSecret) {
    hardcoverEncrypted = body.hardcoverApiKey
      ? await encryptSensitiveData(body.hardcoverApiKey, jwtSecret)
      : null;
  }

  let googleEncrypted = undefined;
  if (body.googleBooksApiKey !== undefined && jwtSecret) {
    googleEncrypted = body.googleBooksApiKey
      ? await encryptSensitiveData(body.googleBooksApiKey, jwtSecret)
      : null;
  }

  // UPSERT: INSERT ... ON CONFLICT DO UPDATE (spec requires this pattern)
  // Read current values first so we only overwrite what was sent
  const current = await db.prepare('SELECT * FROM metadata_config WHERE id = ?').bind('default').first();

  await db.prepare(`
    INSERT INTO metadata_config (id, provider_chain, hardcover_api_key_encrypted, google_books_api_key_encrypted,
      rate_limit_delay_ms, batch_size, fetch_covers, updated_by, updated_at)
    VALUES ('default', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      provider_chain = excluded.provider_chain,
      hardcover_api_key_encrypted = excluded.hardcover_api_key_encrypted,
      google_books_api_key_encrypted = excluded.google_books_api_key_encrypted,
      rate_limit_delay_ms = excluded.rate_limit_delay_ms,
      batch_size = excluded.batch_size,
      fetch_covers = excluded.fetch_covers,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).bind(
    body.providerChain !== undefined ? JSON.stringify(body.providerChain) : (current?.provider_chain || '["hardcover","googlebooks","openlibrary"]'),
    hardcoverEncrypted !== undefined ? hardcoverEncrypted : (current?.hardcover_api_key_encrypted || null),
    googleEncrypted !== undefined ? googleEncrypted : (current?.google_books_api_key_encrypted || null),
    body.rateLimitDelayMs !== undefined ? parseInt(body.rateLimitDelayMs, 10) : (current?.rate_limit_delay_ms || 1500),
    body.batchSize !== undefined ? parseInt(body.batchSize, 10) : (current?.batch_size || 10),
    body.fetchCovers !== undefined ? (body.fetchCovers ? 1 : 0) : (current?.fetch_covers ?? 1),
    userId,
  ).run();

  const config = await getConfig(db);
  return c.json(config);
});

export { metadataRouter, getConfigWithKeys };
```

- [ ] **Step 2: Register the route in worker.js**

Add to imports in `src/worker.js` (near other route imports, around line 21):
```javascript
import { metadataRouter } from './routes/metadata';
```

Add to route registration (after the tours route, around line 235):
```javascript
app.route('/api/metadata', metadataRouter);
```

- [ ] **Step 3: Run existing tests to verify no breakage**

Run: `npx vitest run`
Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/metadata.js src/worker.js
git commit -m "feat: add metadata config endpoints (GET/PUT /api/metadata/config)"
```

---

### Task 7: Metadata Status Endpoint (Admin+)

**Files:**
- Modify: `src/routes/metadata.js`

This endpoint powers the school admin's status line ("1,847 of 1,920 enriched").

- [ ] **Step 1: Add the status endpoint**

Add to `src/routes/metadata.js`, after the PUT `/config` handler:

```javascript
/**
 * GET /api/metadata/status
 * Enrichment status for caller's org.
 * Returns enriched/total counts and last job info.
 */
metadataRouter.get('/status', requireAdmin(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');

  // Count total books linked to this org
  const totalRow = await db.prepare(
    'SELECT COUNT(*) as count FROM org_book_selections WHERE organization_id = ? AND is_available = 1'
  ).bind(organizationId).first();

  // Count books with "complete enough" metadata (author + description + isbn all non-empty)
  const enrichedRow = await db.prepare(`
    SELECT COUNT(*) as count FROM books b
    INNER JOIN org_book_selections obs ON b.id = obs.book_id
    WHERE obs.organization_id = ? AND obs.is_available = 1
      AND b.author IS NOT NULL AND b.author != '' AND LOWER(b.author) != 'unknown'
      AND b.description IS NOT NULL AND b.description != ''
      AND b.isbn IS NOT NULL AND b.isbn != ''
  `).bind(organizationId).first();

  // Last completed job for this org (or global)
  const lastJob = await db.prepare(`
    SELECT created_at, enriched_books, processed_books FROM metadata_jobs
    WHERE (organization_id = ? OR organization_id IS NULL)
      AND status = 'completed'
    ORDER BY created_at DESC LIMIT 1
  `).bind(organizationId).first();

  // Active job for this org
  const activeJob = await db.prepare(`
    SELECT id FROM metadata_jobs
    WHERE (organization_id = ? OR organization_id IS NULL)
      AND status IN ('pending', 'running')
    ORDER BY created_at DESC LIMIT 1
  `).bind(organizationId).first();

  return c.json({
    totalBooks: totalRow?.count || 0,
    enrichedBooks: enrichedRow?.count || 0,
    lastJobDate: lastJob?.created_at || null,
    activeJobId: activeJob?.id || null,
  });
});
```

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/routes/metadata.js
git commit -m "feat: add GET /api/metadata/status endpoint for admin enrichment status"
```

---

### Task 8: Jobs List Endpoint

**Files:**
- Modify: `src/routes/metadata.js`

- [ ] **Step 1: Add jobs list endpoint**

Add to `src/routes/metadata.js`:

```javascript
/**
 * GET /api/metadata/jobs
 * List recent enrichment jobs.
 * Owner sees all; admin sees own org only.
 */
metadataRouter.get('/jobs', requireAdmin(), async (c) => {
  const db = requireDB(c.env);
  const userRole = c.get('userRole');
  const organizationId = c.get('organizationId');

  let query, bindings;
  if (userRole === 'owner') {
    query = `SELECT * FROM metadata_jobs ORDER BY created_at DESC LIMIT 20`;
    bindings = [];
  } else {
    query = `SELECT * FROM metadata_jobs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 20`;
    bindings = [organizationId];
  }

  const result = bindings.length
    ? await db.prepare(query).bind(...bindings).all()
    : await db.prepare(query).all();

  const jobs = (result.results || []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    jobType: row.job_type,
    status: row.status,
    totalBooks: row.total_books,
    processedBooks: row.processed_books,
    enrichedBooks: row.enriched_books,
    errorCount: row.error_count,
    includeCovers: Boolean(row.include_covers),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return c.json({ jobs });
});

/**
 * DELETE /api/metadata/jobs/:id
 * Cancel a running job (set status to paused).
 * Owner can cancel any job. Admin can only cancel jobs for their own org.
 */
metadataRouter.delete('/jobs/:id', requireAdmin(), async (c) => {
  const db = requireDB(c.env);
  const { id } = c.req.param();
  const userRole = c.get('userRole');
  const organizationId = c.get('organizationId');

  // Admin: verify job belongs to their org
  if (userRole !== 'owner') {
    const job = await db.prepare('SELECT organization_id FROM metadata_jobs WHERE id = ?').bind(id).first();
    if (!job || job.organization_id !== organizationId) {
      return c.json({ error: 'Job not found' }, 404);
    }
  }

  await db.prepare(
    "UPDATE metadata_jobs SET status = 'paused', updated_at = datetime('now') WHERE id = ? AND status IN ('pending', 'running')"
  ).bind(id).run();

  return c.json({ success: true });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/metadata.js
git commit -m "feat: add jobs list and cancel endpoints"
```

---

### Task 9: Enrich Endpoint — Job Creation & Batch Processing

**Files:**
- Modify: `src/routes/metadata.js`
- Test: `src/__tests__/unit/metadataEnrich.test.js`

This is the main endpoint that creates jobs and processes batches. It's the most complex piece — handles job creation (no `jobId`), batch processing (with `jobId`), concurrency guards, admin restrictions, genre creation, cover fetching, and progress tracking.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/unit/metadataEnrich.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the batch processing helper directly rather than HTTP integration.
// This validates the core logic: book selection, enrichment, DB updates, progress.
import { processBatch } from '../../services/metadataService';

vi.mock('../../services/providers/openLibraryProvider', () => ({
  fetchMetadata: vi.fn(),
}));
vi.mock('../../services/providers/googleBooksProvider', () => ({
  fetchMetadata: vi.fn(),
}));
vi.mock('../../services/providers/hardcoverProvider', () => ({
  fetchMetadata: vi.fn(),
}));

import { fetchMetadata as olFetch } from '../../services/providers/openLibraryProvider';

describe('metadataService.processBatch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('processes books and returns progress', async () => {
    olFetch.mockResolvedValue({
      author: 'Julia Donaldson', description: 'A story.', genres: ['Fiction'],
      isbn: '9780142403877', pageCount: 32, publicationYear: 1999,
      seriesName: null, seriesNumber: null, coverUrl: null,
    });

    const books = [
      { id: 'b1', title: 'Book 1', author: '', description: '' },
      { id: 'b2', title: 'Book 2', author: '', description: '' },
    ];

    const config = {
      providerChain: ['openlibrary'],
      rateLimitDelayMs: 0, // No delay in tests
      fetchCovers: false,
    };

    const results = [];
    const progress = await processBatch(books, config, {
      onBookResult: (bookId, merged, log) => results.push({ bookId, merged, log }),
      delayMs: 0,
    });

    expect(results).toHaveLength(2);
    expect(results[0].merged.author).toBe('Julia Donaldson');
    expect(progress.processedBooks).toBe(2);
    expect(progress.enrichedBooks).toBe(2);
  });

  it('handles rate limiting by recording the error', async () => {
    olFetch.mockResolvedValue({
      author: null, description: null, genres: null, isbn: null,
      pageCount: null, publicationYear: null, seriesName: null,
      seriesNumber: null, coverUrl: null, rateLimited: true,
    });

    const books = [{ id: 'b1', title: 'Book 1' }];

    const config = {
      providerChain: ['openlibrary'],
      rateLimitDelayMs: 0,
      fetchCovers: false,
    };

    const results = [];
    const progress = await processBatch(books, config, {
      onBookResult: (bookId, merged, log) => results.push({ bookId, merged }),
      delayMs: 0,
    });

    expect(progress.processedBooks).toBe(1);
    expect(progress.enrichedBooks).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/metadataEnrich.test.js`
Expected: FAIL — `processBatch` not exported

- [ ] **Step 3: Add `processBatch` to metadataService.js**

Add to `src/services/metadataService.js`:

```javascript
/**
 * Process a batch of books through the cascade engine.
 *
 * @param {Array<{ id, title, author?, isbn? }>} books
 * @param {object} config - Cascade config with providerChain, API keys, etc.
 * @param {{ onBookResult: Function, delayMs?: number }} options
 * @returns {Promise<{ processedBooks: number, enrichedBooks: number, errorCount: number, rateLimitedProviders: string[], lastBookId: string|null }>}
 */
export async function processBatch(books, config, options = {}) {
  const { onBookResult, delayMs } = options;
  let processedBooks = 0;
  let enrichedBooks = 0;
  let errorCount = 0;
  const rateLimitedProviders = new Set();
  const consecutiveRateLimits = {}; // provider -> count
  let lastBookId = null;
  let currentDelay = delayMs ?? config.rateLimitDelayMs ?? 1500;
  const startTime = Date.now();

  // Build a mutable copy of the provider chain so we can skip rate-limited providers
  const activeChain = [...config.providerChain];

  for (const book of books) {
    // Safety: stop batch if we're approaching 25 seconds wall-clock
    if (Date.now() - startTime > 25000) break;

    try {
      // Pass the active chain (may have providers removed due to rate limiting)
      const effectiveConfig = { ...config, providerChain: activeChain };
      const result = await enrichBook(book, effectiveConfig);

      // Track rate-limited providers and adapt
      for (const p of result.rateLimited) {
        rateLimitedProviders.add(p);
        consecutiveRateLimits[p] = (consecutiveRateLimits[p] || 0) + 1;

        // Double delay on any rate limit (capped at 5000ms)
        currentDelay = Math.min(currentDelay * 2, 5000);

        // Skip provider entirely after 2 consecutive rate limits
        if (consecutiveRateLimits[p] >= 2) {
          const idx = activeChain.indexOf(p);
          if (idx !== -1) activeChain.splice(idx, 1);
        }
      }

      // Reset consecutive count for providers that succeeded
      for (const p of activeChain) {
        if (!result.rateLimited.includes(p)) {
          consecutiveRateLimits[p] = 0;
        }
      }

      // Check if any fields were actually populated
      const hasUpdates = Object.values(result.merged).some((v) =>
        v != null && (!Array.isArray(v) || v.length > 0)
      );

      if (hasUpdates) {
        enrichedBooks++;
      }

      if (onBookResult) {
        onBookResult(book.id, result.merged, result.log);
      }
    } catch {
      errorCount++;
    }

    processedBooks++;
    lastBookId = book.id;

    // Delay between books (skip for last book)
    if (currentDelay > 0 && processedBooks < books.length) {
      await new Promise((r) => setTimeout(r, currentDelay));
    }
  }

  return {
    processedBooks,
    enrichedBooks,
    errorCount,
    rateLimitedProviders: [...rateLimitedProviders],
    lastBookId,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/metadataEnrich.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/metadataService.js src/__tests__/unit/metadataEnrich.test.js
git commit -m "feat: add processBatch to cascade engine with wall-clock safety"
```

- [ ] **Step 6: Add the enrich endpoint to metadata.js**

Add to `src/routes/metadata.js`, before the `export`:

```javascript
/**
 * POST /api/metadata/enrich
 * Create or advance an enrichment job.
 * Owner: any org or all orgs, fill_missing or refresh_all.
 * Admin: own org only, fill_missing only.
 */
metadataRouter.post('/enrich', requireAdmin(), async (c) => {
  const db = requireDB(c.env);
  const userRole = c.get('userRole');
  const callerOrgId = c.get('organizationId');
  const userId = c.get('userId');
  const jwtSecret = c.env.JWT_SECRET;
  const body = await c.req.json();

  // --- Permission enforcement ---
  let organizationId = body.organizationId || null;
  let jobType = body.jobType || 'fill_missing';
  const includeCovers = body.includeCovers !== false;

  if (userRole !== 'owner') {
    // Admin: force own org, force fill_missing
    organizationId = callerOrgId;
    if (jobType !== 'fill_missing') {
      return c.json({ error: 'Only fill_missing is available for admin users' }, 403);
    }
  }

  // --- Concurrency guard: only one running job at a time ---
  const runningJob = await db.prepare(
    "SELECT id FROM metadata_jobs WHERE status IN ('pending', 'running') LIMIT 1"
  ).first();

  if (runningJob && runningJob.id !== body.jobId) {
    // Redact job ID for admins (may belong to a different org)
    const responseJobId = userRole === 'owner' ? runningJob.id : undefined;
    return c.json({ error: 'Another enrichment job is already running', activeJobId: responseJobId }, 409);
  }

  // --- Job creation (no jobId) ---
  if (!body.jobId) {
    // Count eligible books
    let countQuery, countBindings;
    if (jobType === 'fill_missing') {
      if (organizationId) {
        countQuery = `
          SELECT COUNT(*) as count FROM books b
          INNER JOIN org_book_selections obs ON b.id = obs.book_id
          WHERE obs.organization_id = ? AND obs.is_available = 1
            AND (b.author IS NULL OR b.author = '' OR LOWER(b.author) = 'unknown'
              OR b.description IS NULL OR b.description = ''
              OR b.isbn IS NULL OR b.isbn = ''
              OR b.page_count IS NULL
              OR b.publication_year IS NULL
              OR b.series_name IS NULL
              OR b.genre_ids IS NULL OR b.genre_ids = '' OR b.genre_ids = '[]')
        `;
        countBindings = [organizationId];
      } else {
        countQuery = `
          SELECT COUNT(*) as count FROM books
          WHERE author IS NULL OR author = '' OR LOWER(author) = 'unknown'
            OR description IS NULL OR description = ''
            OR isbn IS NULL OR isbn = ''
            OR page_count IS NULL
            OR publication_year IS NULL
            OR series_name IS NULL
        `;
        countBindings = [];
      }
    } else {
      // refresh_all
      if (organizationId) {
        countQuery = `
          SELECT COUNT(*) as count FROM books b
          INNER JOIN org_book_selections obs ON b.id = obs.book_id
          WHERE obs.organization_id = ? AND obs.is_available = 1
        `;
        countBindings = [organizationId];
      } else {
        countQuery = 'SELECT COUNT(*) as count FROM books';
        countBindings = [];
      }
    }

    const countRow = countBindings.length
      ? await db.prepare(countQuery).bind(...countBindings).first()
      : await db.prepare(countQuery).first();

    const totalBooks = countRow?.count || 0;
    const jobId = crypto.randomUUID();

    await db.prepare(`
      INSERT INTO metadata_jobs (id, organization_id, job_type, status, total_books, include_covers, created_by)
      VALUES (?, ?, ?, 'pending', ?, ?, ?)
    `).bind(jobId, organizationId, jobType, totalBooks, includeCovers ? 1 : 0, userId).run();

    return c.json({
      jobId,
      status: 'pending',
      totalBooks,
      processedBooks: 0,
      enrichedBooks: 0,
      errorCount: 0,
      currentBook: null,
      done: totalBooks === 0,
    });
  }

  // --- Batch processing (with jobId) ---
  const job = await db.prepare('SELECT * FROM metadata_jobs WHERE id = ?').bind(body.jobId).first();
  if (!job) return c.json({ error: 'Job not found' }, 404);
  if (job.status === 'paused' || job.status === 'completed' || job.status === 'failed') {
    return c.json({ error: `Job is ${job.status}` }, 400);
  }

  // Load config with decrypted keys
  const config = await getConfigWithKeys(db, jwtSecret);
  if (!config) return c.json({ error: 'Metadata configuration not found' }, 500);
  config.fetchCovers = job.include_covers && config.fetchCovers;

  // Fetch next batch of books
  let booksQuery, booksBindings;
  const cursor = job.last_book_id || '';

  if (job.job_type === 'fill_missing') {
    if (job.organization_id) {
      booksQuery = `
        SELECT b.id, b.title, b.author, b.isbn, b.description, b.page_count, b.publication_year, b.series_name
        FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND obs.is_available = 1
          AND b.id > ?
          AND (b.author IS NULL OR b.author = '' OR LOWER(b.author) = 'unknown'
            OR b.description IS NULL OR b.description = ''
            OR b.isbn IS NULL OR b.isbn = ''
            OR b.page_count IS NULL
            OR b.publication_year IS NULL
            OR b.series_name IS NULL)
        ORDER BY b.id LIMIT ?
      `;
      booksBindings = [job.organization_id, cursor, config.batchSize];
    } else {
      booksQuery = `
        SELECT id, title, author, isbn, description, page_count, publication_year, series_name FROM books
        WHERE id > ?
          AND (author IS NULL OR author = '' OR LOWER(author) = 'unknown'
            OR description IS NULL OR description = ''
            OR isbn IS NULL OR isbn = ''
            OR page_count IS NULL
            OR publication_year IS NULL
            OR series_name IS NULL
            OR genre_ids IS NULL OR genre_ids = '' OR genre_ids = '[]')
        ORDER BY id LIMIT ?
      `;
      booksBindings = [cursor, config.batchSize];
    }
  } else {
    // refresh_all
    if (job.organization_id) {
      booksQuery = `
        SELECT b.id, b.title, b.author, b.isbn FROM books b
        INNER JOIN org_book_selections obs ON b.id = obs.book_id
        WHERE obs.organization_id = ? AND obs.is_available = 1 AND b.id > ?
        ORDER BY b.id LIMIT ?
      `;
      booksBindings = [job.organization_id, cursor, config.batchSize];
    } else {
      booksQuery = `SELECT id, title, author, isbn FROM books WHERE id > ? ORDER BY id LIMIT ?`;
      booksBindings = [cursor, config.batchSize];
    }
  }

  const booksResult = await db.prepare(booksQuery).bind(...booksBindings).all();
  const books = (booksResult.results || []).map((row) => ({
    id: row.id, title: row.title, author: row.author || '', isbn: row.isbn || '',
  }));

  // No more books — job complete
  if (books.length === 0) {
    await db.prepare(
      "UPDATE metadata_jobs SET status = 'completed', updated_at = datetime('now') WHERE id = ?"
    ).bind(job.id).run();

    return c.json({
      jobId: job.id,
      status: 'completed',
      totalBooks: job.total_books,
      processedBooks: job.processed_books,
      enrichedBooks: job.enriched_books,
      errorCount: job.error_count,
      currentBook: null,
      done: true,
    });
  }

  // Mark job as running
  if (job.status === 'pending') {
    await db.prepare(
      "UPDATE metadata_jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?"
    ).bind(job.id).run();
  }

  // Process the batch
  const bookUpdates = [];
  const logEntries = [];
  let currentBook = '';

  const progress = await processBatch(books, config, {
    delayMs: config.rateLimitDelayMs,
    onBookResult: (bookId, merged, log) => {
      currentBook = books.find((b) => b.id === bookId)?.title || '';
      if (Object.values(merged).some((v) => v != null)) {
        bookUpdates.push({ bookId, merged });
      }
      for (const entry of log) {
        logEntries.push({ bookId, provider: entry.provider, fields: entry.fields, coverUrl: merged.coverUrl });
      }
    },
  });

  // --- Genre name-to-ID mapping ---
  // Providers return genre names (e.g. ["Fiction", "Animals"]).
  // The books table stores genre IDs (UUIDs) in genre_ids as JSON.
  // We need to resolve names to IDs, creating new genres as needed.
  // Genres are global (not org-scoped in the genres table).
  const genreNameToId = {};
  const existingGenres = await db.prepare('SELECT id, name FROM genres').all();
  for (const g of existingGenres.results || []) {
    genreNameToId[g.name.toLowerCase()] = g.id;
  }

  // Resolve genre names to IDs for each book, creating missing genres
  const genreCreateStatements = [];
  for (const { merged } of bookUpdates) {
    if (!merged.genres?.length) continue;
    const genreIds = [];
    for (const name of merged.genres) {
      const key = name.toLowerCase();
      if (!genreNameToId[key]) {
        const newId = crypto.randomUUID();
        genreNameToId[key] = newId;
        genreCreateStatements.push(
          db.prepare('INSERT OR IGNORE INTO genres (id, name) VALUES (?, ?)').bind(newId, name)
        );
      }
      genreIds.push(genreNameToId[key]);
    }
    // Replace genre names with resolved IDs
    merged.genreIds = genreIds;
  }

  // Create new genres first (in batches of 100)
  for (let i = 0; i < genreCreateStatements.length; i += 100) {
    await db.batch(genreCreateStatements.slice(i, i + 100));
  }

  // --- Apply book updates and metadata log ---
  const statements = [];

  for (const { bookId, merged } of bookUpdates) {
    if (job.job_type === 'fill_missing') {
      // Only update fields that are currently empty
      const conditionalSets = [];
      const conditionalParams = [];

      if (merged.author) {
        conditionalSets.push("author = CASE WHEN author IS NULL OR author = '' OR LOWER(author) = 'unknown' THEN ? ELSE author END");
        conditionalParams.push(merged.author);
      }
      if (merged.description) {
        conditionalSets.push("description = CASE WHEN description IS NULL OR description = '' THEN ? ELSE description END");
        conditionalParams.push(merged.description);
      }
      if (merged.isbn) {
        conditionalSets.push("isbn = CASE WHEN isbn IS NULL OR isbn = '' THEN ? ELSE isbn END");
        conditionalParams.push(merged.isbn);
      }
      if (merged.pageCount) {
        conditionalSets.push("page_count = CASE WHEN page_count IS NULL THEN ? ELSE page_count END");
        conditionalParams.push(merged.pageCount);
      }
      if (merged.publicationYear) {
        conditionalSets.push("publication_year = CASE WHEN publication_year IS NULL THEN ? ELSE publication_year END");
        conditionalParams.push(merged.publicationYear);
      }
      if (merged.seriesName) {
        conditionalSets.push("series_name = CASE WHEN series_name IS NULL OR series_name = '' THEN ? ELSE series_name END");
        conditionalParams.push(merged.seriesName);
      }
      if (merged.seriesNumber != null) {
        conditionalSets.push("series_number = CASE WHEN series_number IS NULL THEN ? ELSE series_number END");
        conditionalParams.push(merged.seriesNumber);
      }
      if (merged.genreIds?.length) {
        conditionalSets.push("genre_ids = CASE WHEN genre_ids IS NULL OR genre_ids = '' OR genre_ids = '[]' THEN ? ELSE genre_ids END");
        conditionalParams.push(JSON.stringify(merged.genreIds));
      }

      if (conditionalSets.length > 0) {
        conditionalSets.push("updated_at = datetime('now')");
        conditionalParams.push(bookId);
        statements.push(
          db.prepare(`UPDATE books SET ${conditionalSets.join(', ')} WHERE id = ?`).bind(...conditionalParams)
        );
      }
    } else {
      // refresh_all: overwrite all fields
      const setClauses = [];
      const params = [];

      if (merged.author) { setClauses.push('author = ?'); params.push(merged.author); }
      if (merged.description) { setClauses.push('description = ?'); params.push(merged.description); }
      if (merged.isbn) { setClauses.push('isbn = ?'); params.push(merged.isbn); }
      if (merged.pageCount) { setClauses.push('page_count = ?'); params.push(merged.pageCount); }
      if (merged.publicationYear) { setClauses.push('publication_year = ?'); params.push(merged.publicationYear); }
      if (merged.seriesName) { setClauses.push('series_name = ?'); params.push(merged.seriesName); }
      if (merged.seriesNumber != null) { setClauses.push('series_number = ?'); params.push(merged.seriesNumber); }
      if (merged.genreIds?.length) { setClauses.push('genre_ids = ?'); params.push(JSON.stringify(merged.genreIds)); }

      if (setClauses.length > 0) {
        setClauses.push("updated_at = datetime('now')");
        params.push(bookId);
        statements.push(
          db.prepare(`UPDATE books SET ${setClauses.join(', ')} WHERE id = ?`).bind(...params)
        );
      }
    }
  }

  // Log entries
  for (const entry of logEntries) {
    statements.push(
      db.prepare(
        'INSERT INTO book_metadata_log (id, book_id, provider, fields_updated, cover_url) VALUES (?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), entry.bookId, entry.provider, JSON.stringify(entry.fields), entry.coverUrl || null)
    );
  }

  // Update job progress
  const newProcessed = job.processed_books + progress.processedBooks;
  const newEnriched = job.enriched_books + progress.enrichedBooks;
  const newErrors = job.error_count + progress.errorCount;

  statements.push(
    db.prepare(`
      UPDATE metadata_jobs
      SET processed_books = ?, enriched_books = ?, error_count = ?, last_book_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(newProcessed, newEnriched, newErrors, progress.lastBookId, job.id)
  );

  // Execute all statements in batches of 100 (D1 limit)
  for (let i = 0; i < statements.length; i += 100) {
    await db.batch(statements.slice(i, i + 100));
  }

  // Handle cover fetching via waitUntil (non-blocking)
  if (config.fetchCovers && c.env.BOOK_COVERS && c.executionCtx?.waitUntil) {
    const coverPromises = bookUpdates
      .filter(({ merged }) => merged.coverUrl && merged.isbn)
      .map(async ({ merged }) => {
        try {
          const res = await fetch(merged.coverUrl, {
            headers: { 'User-Agent': 'TallyReading/1.0 (educational-app)' },
          });
          if (res.ok) {
            const imageData = await res.arrayBuffer();
            if (imageData.byteLength > 1000) {
              const r2Key = `isbn/${merged.isbn}-M.jpg`;
              await c.env.BOOK_COVERS.put(r2Key, imageData, {
                httpMetadata: { contentType: res.headers.get('Content-Type') || 'image/jpeg' },
              });
            }
          }
        } catch { /* cover fetch failed — non-critical */ }
      });

    c.executionCtx.waitUntil(Promise.allSettled(coverPromises));
  }

  return c.json({
    jobId: job.id,
    status: 'running',
    totalBooks: job.total_books,
    processedBooks: newProcessed,
    enrichedBooks: newEnriched,
    errorCount: newErrors,
    currentBook,
    done: false,
  });
});
```

- [ ] **Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/routes/metadata.js
git commit -m "feat: add POST /api/metadata/enrich endpoint with job creation and batch processing"
```

---

## Chunk 4: Frontend — Owner View

### Task 10: Owner Metadata Management Component

**Files:**
- Create: `src/components/MetadataManagement.js`

This is the full owner view: provider config + global enrichment + job history. It replaces the BookMetadataSettings tab for owners.

- [ ] **Step 1: Create the component**

Create `src/components/MetadataManagement.js`. This component has three sections:

1. **Provider Configuration** — drag-to-reorder provider chain, API key fields, rate limit slider, batch size, fetch covers toggle, save button
2. **Global Enrichment** — school dropdown, Fill Missing / Refresh All buttons, live progress bar, stop button
3. **Job History** — table of recent jobs

The component calls:
- `GET /api/metadata/config` on mount to load config
- `PUT /api/metadata/config` on save
- `POST /api/metadata/enrich` to create and advance jobs (in a loop)
- `GET /api/metadata/jobs` on mount to load history
- `DELETE /api/metadata/jobs/:id` to cancel
- `GET /api/organization/all?pageSize=100` to populate school dropdown

Use `fetchWithAuth` from `useAuth()`. Use `useData()` for nothing — this component is self-contained.

Implementation note: For drag-to-reorder, use a simple MUI List with Up/Down arrow IconButtons rather than a drag library — keeps it lightweight. Each provider row shows name, status indicator (key configured / no key / not needed), and move buttons.

The progress loop: after creating a job (first POST returns `jobId`), call POST repeatedly with that `jobId` every time the previous response returns. Stop when `done: true` or on error. Use a `useRef` for the abort controller.

This component is large (~400-500 lines) but has clear internal sections. Write it as a single file — it's all one page and the sections don't warrant separate components.

- [ ] **Step 2: Verify the component renders**

Run: `npm start` and navigate to Settings. Confirm the new tab appears for the owner role. Test: save config, start enrichment, verify progress polling works.

- [ ] **Step 3: Commit**

```bash
git add src/components/MetadataManagement.js
git commit -m "feat: add MetadataManagement component (owner view)"
```

---

### Task 11: Simplify BookMetadataSettings for School Admins

**Files:**
- Modify: `src/components/BookMetadataSettings.js`

Strip the component to: status line + Fill Missing button + progress bar. Remove all provider config, API key fields, batch settings, Refresh All, and review dialog.

- [ ] **Step 1: Rewrite BookMetadataSettings**

Replace the entire content of `src/components/BookMetadataSettings.js` with the simplified version. The component should:

1. On mount: call `GET /api/metadata/status` to get `{ totalBooks, enrichedBooks, lastJobDate, activeJobId }`
2. Show status line: "1,847 of 1,920 books enriched · Last run: 2 days ago"
3. If `activeJobId` exists on mount: resume polling that job
4. "Fill Missing" button: calls `POST /api/metadata/enrich` with `{ jobType: 'fill_missing' }` (no org needed — backend auto-sets)
5. Progress bar while running (same polling pattern as owner view)
6. Stop button calls `DELETE /api/metadata/jobs/:id` (admin can cancel their own org's jobs)

Remove all imports of `METADATA_PROVIDERS`, `batchFetchAllMetadata`, `checkAvailability`, `getProviderDisplayName`, `getMetadataConfig`, `validateProviderConfig` from `bookMetadataApi.js`.

Remove imports of `BookCover` (was used in refresh review dialog).

Keep the MUI imports that are still needed (Box, Typography, Paper, Button, Alert, CircularProgress, LinearProgress, Snackbar).

- [ ] **Step 2: Verify the component renders**

Run: `npm start` and log in as a school admin. Navigate to Settings > Book Metadata. Confirm simplified view appears with status line and Fill Missing button.

- [ ] **Step 3: Commit**

```bash
git add src/components/BookMetadataSettings.js
git commit -m "feat: simplify BookMetadataSettings to status + Fill Missing for school admins"
```

---

### Task 12: Update SettingsPage Tab Visibility

**Files:**
- Modify: `src/components/SettingsPage.js`

- [ ] **Step 1: Update tab configuration**

In `src/components/SettingsPage.js`, modify the `tabs` useMemo to:
- Import `MetadataManagement` at the top of the file
- Show "Book Metadata" tab with `MetadataManagement` component for owners
- Show "Book Metadata" tab with `BookMetadataSettings` component for admins (canManageUsers but not owner)
- Hide the tab entirely for teachers/readonly

Current code (line 38-66) builds `allTabs` array. Change the Book Metadata entry:

```javascript
// Replace the unconditional Book Metadata tab:
//   { label: 'Book Metadata', icon: <MenuBookIcon />, component: <BookMetadataSettings /> },
// With conditional:
if (isOwner) {
  allTabs.push({ label: 'Book Metadata', icon: <MenuBookIcon />, component: <MetadataManagement /> });
} else if (canManageUsers) {
  allTabs.push({ label: 'Book Metadata', icon: <MenuBookIcon />, component: <BookMetadataSettings /> });
}
```

Also add the import at the top:
```javascript
import MetadataManagement from './MetadataManagement';
```

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run`
Expected: All tests pass. If any SettingsPage tests reference the Book Metadata tab, they may need the mock updated.

- [ ] **Step 3: Commit**

```bash
git add src/components/SettingsPage.js
git commit -m "feat: conditional Book Metadata tab — owner gets MetadataManagement, admin gets simplified view"
```

---

## Chunk 5: Backend Cleanup & Final Integration

### Task 13: Remove bookMetadata from Settings Route

**Files:**
- Modify: `src/routes/settings.js`

- [ ] **Step 1: Remove bookMetadata handling from GET /api/settings**

In `src/routes/settings.js`, remove the decrypt/redact block for `bookMetadata` from the GET handler (lines 94-105). The `bookMetadata` key may still exist in some orgs' `org_settings` — it's harmless but we should stop actively processing it.

- [ ] **Step 2: Remove bookMetadata handling from POST /api/settings**

Remove `'bookMetadata'` from the `allowedKeys` array (line 147). Remove the entire `if (key === 'bookMetadata' ...)` block that handles preserve/encrypt logic (lines 160-184). Remove the decrypt/redact block from the POST response (lines 231-240).

- [ ] **Step 3: Remove helper functions**

Remove `BOOK_METADATA_SECRET_KEYS`, `encryptBookMetadataKeys`, `decryptBookMetadataKeys` functions (lines 16-50). Remove the import of `encryptSensitiveData, decryptSensitiveData` from crypto.js if no longer used elsewhere in this file — check if the AI settings POST handler (`upsertAiConfig`) still uses `encryptSensitiveData`. It does (line 352), so keep the import.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/settings.js
git commit -m "refactor: remove bookMetadata handling from settings route (moved to /api/metadata)"
```

---

### Task 14: Update Tests

**Files:**
- Modify: `src/__tests__/unit/BookMetadataSettings.test.js` (if it exists)
- Modify: any test files that mock bookMetadata in settings

- [ ] **Step 1: Check for existing BookMetadataSettings tests**

Run: `find src/__tests__ -name "*etadata*" -o -name "*ookMeta*"` to find any existing test files.

- [ ] **Step 2: Update or remove tests as needed**

If tests exist for the old BookMetadataSettings (provider config, refresh all, etc.), remove those test cases. Add basic tests for the new simplified component if the test file exists.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/
git commit -m "test: update tests for metadata ownership changes"
```

---

### Task 15: Update CLAUDE.md and Structure Index

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/structure/routes.yaml` (if exists)
- Modify: `.claude/structure/utils-services.yaml` (if exists)
- Modify: `.claude/structure/components.yaml` (if exists)

- [ ] **Step 1: Add new files to CLAUDE.md File Map**

Add entries for:
```
src/routes/metadata.js - GET/PUT metadata config, GET status, GET/DELETE jobs, POST enrich
src/services/metadataService.js - Cascade engine (enrichBook, processBatch)
src/services/providers/openLibraryProvider.js - OpenLibrary server-side adapter
src/services/providers/googleBooksProvider.js - Google Books server-side adapter
src/services/providers/hardcoverProvider.js - Hardcover server-side adapter
src/components/MetadataManagement.js - Owner metadata config + global enrichment + job history
```

Update the BookMetadataSettings entry:
```
src/components/BookMetadataSettings.js - Simplified admin view: enrichment status + Fill Missing
```

- [ ] **Step 2: Update structure YAML files**

Add entries for the new route, service, and provider files in the relevant structure YAML files.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md .claude/structure/
git commit -m "docs: update CLAUDE.md and structure index for metadata ownership"
```

---

### Task 16: Manual Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Apply migration to remote D1 (when ready to deploy)**

Run: `npx wrangler d1 migrations apply reading-manager-db --remote`

- [ ] **Step 4: Deploy**

Run: `npm run go`

- [ ] **Step 5: Re-enter API keys via owner UI**

After deploy, navigate to Settings > Book Metadata (as owner). Enter Hardcover and Google Books API keys. Save. Verify config persists.

- [ ] **Step 6: Test enrichment**

Select a school from the dropdown. Click "Fill Missing". Watch the progress bar. Verify books are updated in the database. Check R2 for cached covers.
