# Multi-School Library Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable schools to import their own book libraries via CSV with transparent deduplication, where each school sees only their books.

**Architecture:** Enhance existing `/api/books/bulk` endpoint to support organization-scoped imports with matching/deduplication. Frontend wizard handles CSV parsing, column mapping, and match review. No schema changes needed - uses existing `org_book_selections` table.

**Tech Stack:** Hono (backend), React/MUI (frontend), D1 SQL database, Vitest for testing

---

## Task 1: Migration - Assign Existing Books to Organization

**Files:**
- Create: `migrations/0012_assign_books_to_org.sql`

**Step 1: Write the migration SQL**

```sql
-- Migration 0012: Assign all existing books to organization
-- This links all current books to the specified organization via org_book_selections

INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
SELECT
  lower(hex(randomblob(16))),
  'b1191a0e-d1b5-4f6b-bf7e-9454d53da417',
  id,
  1,
  datetime('now')
FROM books
WHERE NOT EXISTS (
  SELECT 1 FROM org_book_selections
  WHERE book_id = books.id
  AND organization_id = 'b1191a0e-d1b5-4f6b-bf7e-9454d53da417'
);
```

**Step 2: Run migration locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration completes successfully

**Step 3: Commit**

```bash
git add migrations/0012_assign_books_to_org.sql
git commit -m "feat: migration to assign existing books to organization"
```

---

## Task 2: Backend - Add String Matching Utilities

**Files:**
- Create: `src/utils/stringMatching.js`
- Test: `src/__tests__/unit/stringMatching.test.js`

**Step 1: Write the failing tests**

```javascript
import { describe, it, expect } from 'vitest';
import { normalizeString, calculateSimilarity, isExactMatch, isFuzzyMatch } from '../../utils/stringMatching.js';

describe('stringMatching utilities', () => {
  describe('normalizeString', () => {
    it('should lowercase and trim', () => {
      expect(normalizeString('  The BFG  ')).toBe('the bfg');
    });

    it('should remove punctuation', () => {
      expect(normalizeString("The B.F.G.'s Adventure!")).toBe('the bfgs adventure');
    });

    it('should collapse whitespace', () => {
      expect(normalizeString('The   Big   Book')).toBe('the big book');
    });

    it('should handle empty/null input', () => {
      expect(normalizeString('')).toBe('');
      expect(normalizeString(null)).toBe('');
      expect(normalizeString(undefined)).toBe('');
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(calculateSimilarity('hello', 'hello')).toBe(1);
    });

    it('should return 0 for completely different strings', () => {
      expect(calculateSimilarity('abc', 'xyz')).toBeLessThan(0.5);
    });

    it('should return high similarity for similar strings', () => {
      expect(calculateSimilarity('the hobbit', 'the hobit')).toBeGreaterThan(0.85);
    });
  });

  describe('isExactMatch', () => {
    it('should match normalized strings', () => {
      expect(isExactMatch('The BFG', 'the bfg')).toBe(true);
      expect(isExactMatch('The B.F.G.', 'THE BFG')).toBe(true);
    });

    it('should not match different titles', () => {
      expect(isExactMatch('The BFG', 'The Hobbit')).toBe(false);
    });
  });

  describe('isFuzzyMatch', () => {
    it('should match similar title and author', () => {
      expect(isFuzzyMatch(
        { title: 'The Hobit', author: 'Tolkien' },
        { title: 'The Hobbit', author: 'J.R.R. Tolkien' }
      )).toBe(true);
    });

    it('should not match different books', () => {
      expect(isFuzzyMatch(
        { title: 'The BFG', author: 'Roald Dahl' },
        { title: 'The Hobbit', author: 'J.R.R. Tolkien' }
      )).toBe(false);
    });

    it('should match with missing author on one side', () => {
      expect(isFuzzyMatch(
        { title: 'The Hobbit', author: null },
        { title: 'The Hobbit', author: 'Tolkien' }
      )).toBe(true);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/stringMatching.test.js`
Expected: FAIL - module not found

**Step 3: Write the implementation**

```javascript
/**
 * String matching utilities for book import deduplication
 */

/**
 * Normalize a string for comparison
 * - Lowercase
 * - Trim whitespace
 * - Remove punctuation
 * - Collapse multiple spaces
 */
export const normalizeString = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
};

/**
 * Calculate Levenshtein distance between two strings
 */
const levenshteinDistance = (a, b) => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
};

/**
 * Calculate similarity ratio (0-1) between two strings
 */
export const calculateSimilarity = (a, b) => {
  const normalA = normalizeString(a);
  const normalB = normalizeString(b);

  if (normalA === normalB) return 1;
  if (!normalA || !normalB) return 0;

  const maxLength = Math.max(normalA.length, normalB.length);
  const distance = levenshteinDistance(normalA, normalB);

  return 1 - (distance / maxLength);
};

/**
 * Check if two strings are an exact match after normalization
 */
export const isExactMatch = (a, b) => {
  return normalizeString(a) === normalizeString(b);
};

/**
 * Check if two books are a fuzzy match
 * Requires title similarity > 85% AND (author similarity > 85% OR one author missing)
 */
export const isFuzzyMatch = (bookA, bookB, threshold = 0.85) => {
  const titleSimilarity = calculateSimilarity(bookA.title, bookB.title);

  if (titleSimilarity < threshold) return false;

  // If one or both authors are missing, match on title alone
  const authorA = normalizeString(bookA.author);
  const authorB = normalizeString(bookB.author);

  if (!authorA || !authorB) return true;

  const authorSimilarity = calculateSimilarity(bookA.author, bookB.author);
  return authorSimilarity >= threshold;
};
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/stringMatching.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/stringMatching.js src/__tests__/unit/stringMatching.test.js
git commit -m "feat: add string matching utilities for book import"
```

---

## Task 3: Backend - Import Preview Endpoint

**Files:**
- Modify: `src/routes/books.js`
- Test: `src/__tests__/integration/bookImport.test.js`

**Step 1: Write the failing tests**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { booksRouter } from '../../routes/books.js';

const TEST_SECRET = 'test-jwt-secret-for-testing';

const createMockDB = (overrides = {}) => {
  const prepareChain = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue(overrides.allResults || { results: [], success: true }),
    first: vi.fn().mockResolvedValue(overrides.firstResult || null),
    run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
  };

  return {
    prepare: vi.fn().mockReturnValue(prepareChain),
    batch: vi.fn().mockResolvedValue([{ success: true }]),
    _chain: prepareChain,
    ...overrides
  };
};

const createTestApp = (contextValues = {}, dbOverrides = {}) => {
  const app = new Hono();
  const mockDB = createMockDB(dbOverrides);

  app.onError((error, c) => {
    const status = error.status || 500;
    return c.json({ status: 'error', message: error.message }, status);
  });

  app.use('*', async (c, next) => {
    c.env = { JWT_SECRET: TEST_SECRET, READING_MANAGER_DB: mockDB };
    if (contextValues.organizationId) c.set('organizationId', contextValues.organizationId);
    if (contextValues.userRole) c.set('userRole', contextValues.userRole);
    await next();
  });

  app.route('/api/books', booksRouter);
  return { app, mockDB };
};

describe('Book Import API', () => {
  describe('POST /api/books/import/preview', () => {
    it('should categorize books into matched, fuzzy, new, and conflicts', async () => {
      const existingBooks = [
        { id: 'book-1', title: 'The BFG', author: 'Roald Dahl', reading_level: '3.0' },
        { id: 'book-2', title: 'Matilda', author: 'Roald Dahl', reading_level: '4.0' }
      ];

      const { app, mockDB } = createTestApp(
        { organizationId: 'org-123', userRole: 'teacher' },
        { allResults: { results: existingBooks } }
      );

      const importBooks = [
        { title: 'The BFG', author: 'Roald Dahl', readingLevel: '3.0' }, // exact match
        { title: 'The Hobit', author: 'Tolkien' }, // fuzzy match (typo)
        { title: 'New Book', author: 'New Author' }, // new
        { title: 'Matilda', author: 'Roald Dahl', readingLevel: '5.0' } // conflict (different level)
      ];

      const res = await app.request('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: importBooks })
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.matched).toHaveLength(1);
      expect(data.matched[0].importedBook.title).toBe('The BFG');

      expect(data.newBooks).toHaveLength(2); // New Book + fuzzy non-match

      expect(data.conflicts).toHaveLength(1);
      expect(data.conflicts[0].importedBook.title).toBe('Matilda');
      expect(data.conflicts[0].existingBook.reading_level).toBe('4.0');
      expect(data.conflicts[0].importedBook.readingLevel).toBe('5.0');
    });

    it('should detect books already in organization library', async () => {
      const existingBooks = [
        { id: 'book-1', title: 'The BFG', author: 'Roald Dahl' }
      ];
      const orgSelections = [
        { book_id: 'book-1', organization_id: 'org-123' }
      ];

      const { app, mockDB } = createTestApp(
        { organizationId: 'org-123', userRole: 'teacher' },
        { allResults: { results: existingBooks } }
      );

      // Mock the org_book_selections check
      mockDB.prepare.mockImplementation((sql) => {
        const chain = {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: sql.includes('org_book_selections') ? orgSelections : existingBooks
          }),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue({ success: true })
        };
        return chain;
      });

      const res = await app.request('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: [{ title: 'The BFG', author: 'Roald Dahl' }] })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.alreadyInLibrary).toHaveLength(1);
    });

    it('should require authentication', async () => {
      const { app } = createTestApp({}, {});

      const res = await app.request('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books: [] })
      });

      expect(res.status).toBe(403);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/integration/bookImport.test.js`
Expected: FAIL - endpoint not found

**Step 3: Add the import preview endpoint to books.js**

Add after the existing `/bulk` endpoint in `src/routes/books.js`:

```javascript
import { normalizeString, isExactMatch, isFuzzyMatch } from '../utils/stringMatching.js';

/**
 * POST /api/books/import/preview
 * Preview import results: categorize books into matched, fuzzy matches, new, and conflicts
 *
 * Request body: { books: [{ title, author, readingLevel }] }
 * Response: { matched, possibleMatches, newBooks, conflicts, alreadyInLibrary }
 */
booksRouter.post('/import/preview', requireTeacher(), async (c) => {
  const { books: importBooks } = await c.req.json();
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  if (!Array.isArray(importBooks) || importBooks.length === 0) {
    throw badRequestError('Request must contain an array of books');
  }

  if (!organizationId || !db) {
    throw badRequestError('Multi-tenant mode required for import preview');
  }

  // Get all existing books
  const allBooksResult = await db.prepare('SELECT * FROM books').all();
  const existingBooks = allBooksResult.results || [];

  // Get books already in this organization's library
  const orgBooksResult = await db.prepare(
    'SELECT book_id FROM org_book_selections WHERE organization_id = ? AND is_available = 1'
  ).bind(organizationId).all();
  const orgBookIds = new Set((orgBooksResult.results || []).map(r => r.book_id));

  // Categorize imports
  const matched = [];
  const possibleMatches = [];
  const newBooks = [];
  const conflicts = [];
  const alreadyInLibrary = [];

  for (const importedBook of importBooks) {
    if (!importedBook.title || !importedBook.title.trim()) continue;

    // Check for exact match
    const exactMatch = existingBooks.find(existing =>
      isExactMatch(existing.title, importedBook.title) &&
      (!importedBook.author || !existing.author || isExactMatch(existing.author, importedBook.author))
    );

    if (exactMatch) {
      // Check if already in this org's library
      if (orgBookIds.has(exactMatch.id)) {
        alreadyInLibrary.push({ importedBook, existingBook: exactMatch });
        continue;
      }

      // Check for metadata conflicts
      const hasConflict = importedBook.readingLevel &&
                          exactMatch.reading_level &&
                          importedBook.readingLevel !== exactMatch.reading_level;

      if (hasConflict) {
        conflicts.push({ importedBook, existingBook: exactMatch });
      } else {
        matched.push({ importedBook, existingBook: exactMatch });
      }
      continue;
    }

    // Check for fuzzy match
    const fuzzyMatch = existingBooks.find(existing =>
      isFuzzyMatch(
        { title: importedBook.title, author: importedBook.author },
        { title: existing.title, author: existing.author }
      )
    );

    if (fuzzyMatch) {
      possibleMatches.push({ importedBook, existingBook: fuzzyMatch });
    } else {
      newBooks.push({ importedBook });
    }
  }

  return c.json({
    matched,
    possibleMatches,
    newBooks,
    conflicts,
    alreadyInLibrary,
    summary: {
      total: importBooks.length,
      matched: matched.length,
      possibleMatches: possibleMatches.length,
      newBooks: newBooks.length,
      conflicts: conflicts.length,
      alreadyInLibrary: alreadyInLibrary.length
    }
  });
});
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/integration/bookImport.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/books.js src/__tests__/integration/bookImport.test.js
git commit -m "feat: add import preview endpoint with deduplication"
```

---

## Task 4: Backend - Import Confirm Endpoint

**Files:**
- Modify: `src/routes/books.js`
- Modify: `src/__tests__/integration/bookImport.test.js`

**Step 1: Add tests for confirm endpoint**

Add to `src/__tests__/integration/bookImport.test.js`:

```javascript
describe('POST /api/books/import/confirm', () => {
  it('should link matched books to organization', async () => {
    const { app, mockDB } = createTestApp(
      { organizationId: 'org-123', userRole: 'teacher' },
      {}
    );

    const res = await app.request('/api/books/import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matched: [{ existingBookId: 'book-1' }, { existingBookId: 'book-2' }],
        newBooks: [],
        conflicts: []
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.linked).toBe(2);
  });

  it('should create new books and link to organization', async () => {
    const { app, mockDB } = createTestApp(
      { organizationId: 'org-123', userRole: 'teacher' },
      {}
    );

    const res = await app.request('/api/books/import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matched: [],
        newBooks: [
          { title: 'New Book 1', author: 'Author 1' },
          { title: 'New Book 2', author: 'Author 2', readingLevel: '3.0' }
        ],
        conflicts: []
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.created).toBe(2);
  });

  it('should update books when conflicts are accepted', async () => {
    const { app, mockDB } = createTestApp(
      { organizationId: 'org-123', userRole: 'teacher' },
      {}
    );

    const res = await app.request('/api/books/import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matched: [],
        newBooks: [],
        conflicts: [
          { existingBookId: 'book-1', updateReadingLevel: true, newReadingLevel: '5.0' }
        ]
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updated).toBe(1);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/integration/bookImport.test.js`
Expected: FAIL - endpoint not found

**Step 3: Add the confirm endpoint**

Add to `src/routes/books.js`:

```javascript
/**
 * POST /api/books/import/confirm
 * Execute the import based on user's decisions from preview
 *
 * Request body: {
 *   matched: [{ existingBookId }],
 *   newBooks: [{ title, author, readingLevel }],
 *   conflicts: [{ existingBookId, updateReadingLevel, newReadingLevel }]
 * }
 */
booksRouter.post('/import/confirm', requireTeacher(), async (c) => {
  const { matched = [], newBooks = [], conflicts = [] } = await c.req.json();
  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  if (!organizationId || !db) {
    throw badRequestError('Multi-tenant mode required for import');
  }

  let linked = 0;
  let created = 0;
  let updated = 0;
  const errors = [];

  // 1. Link matched books to organization
  for (const match of matched) {
    try {
      await db.prepare(`
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
        ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
      `).bind(crypto.randomUUID(), organizationId, match.existingBookId).run();
      linked++;
    } catch (error) {
      errors.push({ type: 'link', bookId: match.existingBookId, error: error.message });
    }
  }

  // 2. Create new books and link to organization
  for (const book of newBooks) {
    try {
      const bookId = crypto.randomUUID();

      // Insert book
      await db.prepare(`
        INSERT INTO books (id, title, author, reading_level, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(bookId, book.title, book.author || null, book.readingLevel || null).run();

      // Link to organization
      await db.prepare(`
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
      `).bind(crypto.randomUUID(), organizationId, bookId).run();

      created++;
    } catch (error) {
      errors.push({ type: 'create', title: book.title, error: error.message });
    }
  }

  // 3. Handle conflicts (update books if requested)
  for (const conflict of conflicts) {
    try {
      if (conflict.updateReadingLevel) {
        await db.prepare(`
          UPDATE books SET reading_level = ?, updated_at = datetime('now') WHERE id = ?
        `).bind(conflict.newReadingLevel, conflict.existingBookId).run();
        updated++;
      }

      // Link to organization
      await db.prepare(`
        INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
        ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
      `).bind(crypto.randomUUID(), organizationId, conflict.existingBookId).run();
      linked++;
    } catch (error) {
      errors.push({ type: 'conflict', bookId: conflict.existingBookId, error: error.message });
    }
  }

  return c.json({
    linked,
    created,
    updated,
    errors: errors.length > 0 ? errors : undefined,
    success: errors.length === 0
  });
});
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/integration/bookImport.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/books.js src/__tests__/integration/bookImport.test.js
git commit -m "feat: add import confirm endpoint"
```

---

## Task 5: Frontend - CSV Parser with Column Mapping

**Files:**
- Create: `src/utils/csvParser.js`
- Test: `src/__tests__/unit/csvParser.test.js`

**Step 1: Write the failing tests**

```javascript
import { describe, it, expect } from 'vitest';
import { parseCSV, detectColumnMapping, mapCSVToBooks } from '../../utils/csvParser.js';

describe('CSV Parser', () => {
  describe('parseCSV', () => {
    it('should parse simple CSV', () => {
      const csv = 'Title,Author\nThe BFG,Roald Dahl\nMatilda,Roald Dahl';
      const result = parseCSV(csv);

      expect(result.headers).toEqual(['Title', 'Author']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(['The BFG', 'Roald Dahl']);
    });

    it('should handle quoted fields with commas', () => {
      const csv = 'Title,Author\n"Hello, World",Author Name';
      const result = parseCSV(csv);

      expect(result.rows[0][0]).toBe('Hello, World');
    });

    it('should handle escaped quotes', () => {
      const csv = 'Title,Author\n"The ""Big"" Book",Author';
      const result = parseCSV(csv);

      expect(result.rows[0][0]).toBe('The "Big" Book');
    });
  });

  describe('detectColumnMapping', () => {
    it('should auto-detect standard column names', () => {
      const headers = ['Title', 'Author', 'Reading Level'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.title).toBe(0);
      expect(mapping.author).toBe(1);
      expect(mapping.readingLevel).toBe(2);
    });

    it('should handle variations in column names', () => {
      const headers = ['Book Title', 'Author Name', 'Level'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.title).toBe(0);
      expect(mapping.author).toBe(1);
      expect(mapping.readingLevel).toBe(2);
    });

    it('should return null for unmapped columns', () => {
      const headers = ['Title', 'ISBN'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.title).toBe(0);
      expect(mapping.author).toBeNull();
      expect(mapping.readingLevel).toBeNull();
    });
  });

  describe('mapCSVToBooks', () => {
    it('should convert CSV rows to book objects', () => {
      const rows = [
        ['The BFG', 'Roald Dahl', '3.0'],
        ['Matilda', 'Roald Dahl', '4.0']
      ];
      const mapping = { title: 0, author: 1, readingLevel: 2 };

      const books = mapCSVToBooks(rows, mapping);

      expect(books).toHaveLength(2);
      expect(books[0]).toEqual({
        title: 'The BFG',
        author: 'Roald Dahl',
        readingLevel: '3.0'
      });
    });

    it('should skip rows without title', () => {
      const rows = [
        ['The BFG', 'Roald Dahl'],
        ['', 'Some Author'],
        ['Matilda', 'Roald Dahl']
      ];
      const mapping = { title: 0, author: 1 };

      const books = mapCSVToBooks(rows, mapping);
      expect(books).toHaveLength(2);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/csvParser.test.js`
Expected: FAIL - module not found

**Step 3: Write the implementation**

```javascript
/**
 * CSV Parser utilities for book import
 */

/**
 * Parse CSV text into headers and rows
 */
export const parseCSV = (csvText) => {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 1) {
    throw new Error('CSV file is empty');
  }

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(line => parseCSVLine(line)).filter(row => row.length > 0);

  return { headers, rows };
};

/**
 * Parse a single CSV line, handling quotes and commas
 */
const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
};

/**
 * Auto-detect column mapping from headers
 */
export const detectColumnMapping = (headers) => {
  const normalized = headers.map(h => h.toLowerCase().trim());

  const titlePatterns = ['title', 'book title', 'book name', 'name'];
  const authorPatterns = ['author', 'author name', 'writer', 'by'];
  const levelPatterns = ['reading level', 'level', 'reading_level', 'readinglevel', 'grade level'];

  const findIndex = (patterns) => {
    for (const pattern of patterns) {
      const idx = normalized.findIndex(h => h.includes(pattern) || pattern.includes(h));
      if (idx !== -1) return idx;
    }
    return null;
  };

  return {
    title: findIndex(titlePatterns),
    author: findIndex(authorPatterns),
    readingLevel: findIndex(levelPatterns)
  };
};

/**
 * Convert CSV rows to book objects using column mapping
 */
export const mapCSVToBooks = (rows, mapping) => {
  return rows
    .map(row => {
      const title = mapping.title !== null ? row[mapping.title]?.trim() : null;
      if (!title) return null;

      return {
        title,
        author: mapping.author !== null ? row[mapping.author]?.trim() || null : null,
        readingLevel: mapping.readingLevel !== null ? row[mapping.readingLevel]?.trim() || null : null
      };
    })
    .filter(book => book !== null);
};
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/csvParser.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/csvParser.js src/__tests__/unit/csvParser.test.js
git commit -m "feat: add CSV parser with column mapping for book import"
```

---

## Task 6: Frontend - Import Wizard Component

**Files:**
- Create: `src/components/books/BookImportWizard.js`

**Step 1: Create the wizard component**

```javascript
import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  Box,
  Typography,
  LinearProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  Chip,
  Divider,
  Paper
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useAppContext } from '../../contexts/AppContext';
import { parseCSV, detectColumnMapping, mapCSVToBooks } from '../../utils/csvParser';

const steps = ['Upload CSV', 'Map Columns', 'Review Matches', 'Confirm Import'];

const BookImportWizard = ({ open, onClose }) => {
  const { fetchWithAuth, reloadDataFromServer } = useAppContext();
  const [activeStep, setActiveStep] = useState(0);
  const [csvData, setCsvData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({ title: null, author: null, readingLevel: null });
  const [previewResults, setPreviewResults] = useState(null);
  const [selectedConflicts, setSelectedConflicts] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [importResult, setImportResult] = useState(null);

  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseCSV(e.target.result);
        const autoMapping = detectColumnMapping(parsed.headers);
        setCsvData(parsed);
        setColumnMapping(autoMapping);
        setError(null);
        setActiveStep(1);
      } catch (err) {
        setError(`Failed to parse CSV: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleMappingChange = (field, value) => {
    setColumnMapping(prev => ({ ...prev, [field]: value === '' ? null : parseInt(value) }));
  };

  const handlePreview = async () => {
    if (columnMapping.title === null) {
      setError('Title column is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const books = mapCSVToBooks(csvData.rows, columnMapping);

      const response = await fetchWithAuth('/api/books/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ books })
      });

      if (!response.ok) throw new Error('Preview failed');

      const results = await response.json();
      setPreviewResults(results);
      setActiveStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        matched: previewResults.matched.map(m => ({ existingBookId: m.existingBook.id })),
        newBooks: previewResults.newBooks.map(n => n.importedBook),
        conflicts: previewResults.conflicts
          .filter(c => selectedConflicts[c.existingBook.id])
          .map(c => ({
            existingBookId: c.existingBook.id,
            updateReadingLevel: true,
            newReadingLevel: c.importedBook.readingLevel
          }))
      };

      // Also link conflicts that weren't updated
      const unupdatedConflicts = previewResults.conflicts
        .filter(c => !selectedConflicts[c.existingBook.id])
        .map(c => ({ existingBookId: c.existingBook.id }));
      payload.matched.push(...unupdatedConflicts);

      const response = await fetchWithAuth('/api/books/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error('Import failed');

      const result = await response.json();
      setImportResult(result);
      setActiveStep(3);
      await reloadDataFromServer();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setActiveStep(0);
    setCsvData(null);
    setColumnMapping({ title: null, author: null, readingLevel: null });
    setPreviewResults(null);
    setSelectedConflicts({});
    setError(null);
    setImportResult(null);
    onClose();
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0: // Upload
        return (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id="csv-upload"
            />
            <label htmlFor="csv-upload">
              <Button
                variant="outlined"
                component="span"
                startIcon={<UploadFileIcon />}
                size="large"
              >
                Select CSV File
              </Button>
            </label>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Expected columns: Title, Author (optional), Reading Level (optional)
            </Typography>
          </Box>
        );

      case 1: // Column Mapping
        return (
          <Box sx={{ py: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Map your CSV columns to book fields:
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              {['title', 'author', 'readingLevel'].map((field) => (
                <FormControl key={field} fullWidth size="small">
                  <InputLabel>{field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}</InputLabel>
                  <Select
                    value={columnMapping[field] ?? ''}
                    label={field}
                    onChange={(e) => handleMappingChange(field, e.target.value)}
                  >
                    <MenuItem value="">Not mapped</MenuItem>
                    {csvData?.headers.map((header, idx) => (
                      <MenuItem key={idx} value={idx}>{header}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ))}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Preview: {csvData?.rows.length} books found in CSV
            </Typography>
          </Box>
        );

      case 2: // Review
        return (
          <Box sx={{ py: 2 }}>
            {previewResults && (
              <>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  <Chip label={`${previewResults.matched.length} matched`} color="success" />
                  <Chip label={`${previewResults.newBooks.length} new`} color="primary" />
                  <Chip label={`${previewResults.conflicts.length} conflicts`} color="warning" />
                  <Chip label={`${previewResults.alreadyInLibrary.length} already in library`} color="default" />
                </Box>

                {previewResults.conflicts.length > 0 && (
                  <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Metadata Conflicts - Update these books?
                    </Typography>
                    <List dense>
                      {previewResults.conflicts.map((conflict) => (
                        <ListItem key={conflict.existingBook.id} dense>
                          <Checkbox
                            checked={!!selectedConflicts[conflict.existingBook.id]}
                            onChange={(e) => setSelectedConflicts(prev => ({
                              ...prev,
                              [conflict.existingBook.id]: e.target.checked
                            }))}
                          />
                          <ListItemText
                            primary={conflict.existingBook.title}
                            secondary={`Level: ${conflict.existingBook.reading_level} → ${conflict.importedBook.readingLevel}`}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Paper>
                )}
              </>
            )}
          </Box>
        );

      case 3: // Complete
        return (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="success.main" gutterBottom>
              Import Complete!
            </Typography>
            {importResult && (
              <Box sx={{ mt: 2 }}>
                <Typography>Linked: {importResult.linked} books</Typography>
                <Typography>Created: {importResult.created} books</Typography>
                <Typography>Updated: {importResult.updated} books</Typography>
              </Box>
            )}
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import Books</DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {isLoading && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {renderStepContent()}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>
          {activeStep === 3 ? 'Done' : 'Cancel'}
        </Button>
        {activeStep === 1 && (
          <Button onClick={handlePreview} variant="contained" disabled={isLoading}>
            Preview Import
          </Button>
        )}
        {activeStep === 2 && (
          <Button onClick={handleConfirmImport} variant="contained" color="primary" disabled={isLoading}>
            Confirm Import
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BookImportWizard;
```

**Step 2: Commit**

```bash
git add src/components/books/BookImportWizard.js
git commit -m "feat: add BookImportWizard component"
```

---

## Task 7: Frontend - Integrate Wizard into BookManager

**Files:**
- Modify: `src/components/books/BookManager.js`

**Step 1: Import and add wizard to BookManager**

At the top of the file, add import:

```javascript
import BookImportWizard from './BookImportWizard';
```

In the component state section, add:

```javascript
const [showImportWizard, setShowImportWizard] = useState(false);
```

In the Import/Export menu, modify the Import Books menu item:

```javascript
<MenuItem
  onClick={() => {
    setImportExportMenuAnchor(null);
    setShowImportWizard(true);
  }}
>
  <UploadIcon fontSize="small" sx={{ mr: 1 }} />
  Import Books
</MenuItem>
```

Before the closing `</Paper>` tag, add:

```javascript
<BookImportWizard
  open={showImportWizard}
  onClose={() => setShowImportWizard(false)}
/>
```

**Step 2: Run the app to verify**

Run: `npm run start:dev`
Expected: Import wizard opens when clicking "Import Books"

**Step 3: Commit**

```bash
git add src/components/books/BookManager.js
git commit -m "feat: integrate import wizard into BookManager"
```

---

## Task 8: Run Full Test Suite

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Fix any failing tests**

If tests fail, debug and fix.

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address test failures"
```

---

## Task 9: Manual Testing

**Step 1: Create test CSV file**

Create a file `test-books.csv`:
```csv
Title,Author,Reading Level
The BFG,Roald Dahl,3.0
Matilda,Roald Dahl,4.0
Charlie and the Chocolate Factory,Roald Dahl,3.5
New Test Book,Test Author,2.0
```

**Step 2: Test import flow**

1. Navigate to Books page
2. Click Import/Export → Import Books
3. Upload the CSV
4. Verify column mapping is auto-detected
5. Click Preview Import
6. Verify categorization (matched, new, conflicts)
7. Click Confirm Import
8. Verify books appear in library

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: complete manual testing of import flow"
```
