# ISBN Barcode Scanning & Book Enrichment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ISBN barcode scanning so teachers can scan a book's barcode on iPad, auto-fetch metadata from OpenLibrary, and add it to their school library. Also expand the book schema with ISBN, page count, series info, and publication year.

**Architecture:** New D1 columns via migration, backend ISBN lookup utility calling OpenLibrary API with KV caching, html5-qrcode library for camera-based barcode scanning in a reusable React component, integrated into BookManager, BookAutocomplete, and HomeReadingRegister.

**Tech Stack:** html5-qrcode (EAN-13 scanning), OpenLibrary ISBN API, Cloudflare D1 + KV, React/MUI

**Design doc:** `docs/plans/2026-02-19-isbn-scanning-design.md`

---

## Task 1: Database Migration — Add Book Metadata Columns

**Files:**
- Create: `migrations/0022_add_book_metadata_columns.sql`

**Step 1: Write the migration**

```sql
-- Add ISBN and enrichment columns to books table
-- All columns nullable for backward compatibility with existing books

ALTER TABLE books ADD COLUMN isbn TEXT;
ALTER TABLE books ADD COLUMN page_count INTEGER;
ALTER TABLE books ADD COLUMN series_name TEXT;
ALTER TABLE books ADD COLUMN series_number INTEGER;
ALTER TABLE books ADD COLUMN publication_year INTEGER;

-- Unique index on ISBN (where not null) for fast lookup and dedup
CREATE UNIQUE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn) WHERE isbn IS NOT NULL;
```

**Step 2: Test locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration applies successfully, no errors.

**Step 3: Commit**

```bash
git add migrations/0022_add_book_metadata_columns.sql
git commit -m "feat: add isbn, page_count, series, publication_year columns to books"
```

---

## Task 2: ISBN Validation Utility

**Files:**
- Create: `src/utils/isbn.js`
- Create: `src/__tests__/unit/isbn.test.js`

**Step 1: Write the failing tests**

```javascript
import { describe, it, expect } from 'vitest';
import { validateISBN, normalizeISBN, isbn10ToIsbn13 } from '../../utils/isbn';

describe('ISBN utilities', () => {
  describe('validateISBN', () => {
    it('accepts valid ISBN-13', () => {
      expect(validateISBN('9780141036144')).toBe(true); // 1984
    });

    it('accepts valid ISBN-13 with hyphens', () => {
      expect(validateISBN('978-0-14-103614-4')).toBe(true);
    });

    it('accepts valid ISBN-10', () => {
      expect(validateISBN('0141036141')).toBe(true); // 1984
    });

    it('accepts ISBN-10 with X check digit', () => {
      expect(validateISBN('080442957X')).toBe(true);
    });

    it('rejects invalid ISBN', () => {
      expect(validateISBN('1234567890')).toBe(false);
    });

    it('rejects empty/null', () => {
      expect(validateISBN('')).toBe(false);
      expect(validateISBN(null)).toBe(false);
      expect(validateISBN(undefined)).toBe(false);
    });

    it('rejects wrong length', () => {
      expect(validateISBN('12345')).toBe(false);
    });
  });

  describe('normalizeISBN', () => {
    it('strips hyphens and spaces', () => {
      expect(normalizeISBN('978-0-14-103614-4')).toBe('9780141036144');
    });

    it('converts ISBN-10 to ISBN-13', () => {
      expect(normalizeISBN('0141036141')).toBe('9780141036144');
    });

    it('passes through valid ISBN-13 unchanged', () => {
      expect(normalizeISBN('9780141036144')).toBe('9780141036144');
    });

    it('returns null for invalid ISBN', () => {
      expect(normalizeISBN('invalid')).toBeNull();
    });
  });

  describe('isbn10ToIsbn13', () => {
    it('converts ISBN-10 to ISBN-13', () => {
      expect(isbn10ToIsbn13('0141036141')).toBe('9780141036144');
    });

    it('handles X check digit in ISBN-10', () => {
      expect(isbn10ToIsbn13('080442957X')).toBe('9780804429573');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/isbn.test.js`
Expected: FAIL — module not found

**Step 3: Implement the ISBN utilities**

```javascript
/**
 * ISBN validation, normalization, and conversion utilities
 */

/**
 * Validate an ISBN-10 check digit
 */
const validateISBN10 = (isbn) => {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(isbn[i], 10) * (10 - i);
  }
  const check = isbn[9].toUpperCase();
  sum += check === 'X' ? 10 : parseInt(check, 10);
  return sum % 11 === 0;
};

/**
 * Validate an ISBN-13 check digit
 */
const validateISBN13 = (isbn) => {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(isbn[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(isbn[12], 10);
};

/**
 * Convert ISBN-10 to ISBN-13
 */
export const isbn10ToIsbn13 = (isbn10) => {
  const stripped = isbn10.replace(/[-\s]/g, '');
  if (stripped.length !== 10) return null;

  const base = '978' + stripped.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return base + check;
};

/**
 * Validate an ISBN string (10 or 13 digit)
 */
export const validateISBN = (isbn) => {
  if (!isbn || typeof isbn !== 'string') return false;

  const stripped = isbn.replace(/[-\s]/g, '');

  if (stripped.length === 13 && /^\d{13}$/.test(stripped)) {
    return validateISBN13(stripped);
  }

  if (stripped.length === 10 && /^\d{9}[\dXx]$/.test(stripped)) {
    return validateISBN10(stripped);
  }

  return false;
};

/**
 * Normalize ISBN to ISBN-13 format (no hyphens).
 * Returns null if invalid.
 */
export const normalizeISBN = (isbn) => {
  if (!validateISBN(isbn)) return null;

  const stripped = isbn.replace(/[-\s]/g, '');

  if (stripped.length === 10) {
    return isbn10ToIsbn13(stripped);
  }

  return stripped;
};
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/isbn.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/utils/isbn.js src/__tests__/unit/isbn.test.js
git commit -m "feat: add ISBN validation and normalization utilities"
```

---

## Task 3: Data Provider Updates — D1, KV, JSON

**Files:**
- Modify: `src/data/d1Provider.js` (lines 27-40 `rowToBook`, lines 47-57 `bookToRow`, lines 133-160 `addBook`, lines 169-203 `updateBook`)
- Modify: `src/data/kvProvider.js` (no code changes needed — KV stores full JS objects)
- Modify: `src/data/jsonProvider.js` (no code changes needed — JSON stores full objects)

Only D1 provider needs changes because it has explicit column mappings. KV and JSON providers store/retrieve whole objects, so new fields pass through automatically.

**Step 1: Update `rowToBook()` in d1Provider.js (line 27)**

Add after the `description` line (before `createdAt`):

```javascript
    isbn: row.isbn || null,
    pageCount: row.page_count || null,
    seriesName: row.series_name || null,
    seriesNumber: row.series_number || null,
    publicationYear: row.publication_year || null,
```

**Step 2: Update `bookToRow()` in d1Provider.js (line 47)**

Add after the `description` line:

```javascript
    isbn: book.isbn || null,
    page_count: book.pageCount || null,
    series_name: book.seriesName || null,
    series_number: book.seriesNumber || null,
    publication_year: book.publicationYear || null,
```

**Step 3: Update `addBook()` in d1Provider.js (line 133)**

Replace the INSERT statement and bind call with:

```javascript
    await db.prepare(`
      INSERT INTO books (id, title, author, genre_ids, reading_level, age_range, description, isbn, page_count, series_name, series_number, publication_year)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      row.id,
      row.title,
      row.author,
      row.genre_ids,
      row.reading_level,
      row.age_range,
      row.description,
      row.isbn,
      row.page_count,
      row.series_name,
      row.series_number,
      row.publication_year
    ).run();
```

**Step 4: Update `updateBook()` in d1Provider.js (line 169)**

Replace the UPDATE statement and bind call with:

```javascript
    await db.prepare(`
      UPDATE books
      SET title = ?, author = ?, genre_ids = ?, reading_level = ?, age_range = ?, description = ?,
          isbn = ?, page_count = ?, series_name = ?, series_number = ?, publication_year = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      row.title,
      row.author,
      row.genre_ids,
      row.reading_level,
      row.age_range,
      row.description,
      row.isbn,
      row.page_count,
      row.series_name,
      row.series_number,
      row.publication_year,
      id
    ).run();
```

**Step 5: Run existing tests to verify nothing breaks**

Run: `npm test`
Expected: All existing tests PASS

**Step 6: Commit**

```bash
git add src/data/d1Provider.js
git commit -m "feat: add isbn, page_count, series, publication_year to D1 provider"
```

---

## Task 4: API Route Updates — Accept and Return New Fields

**Files:**
- Modify: `src/routes/books.js` (POST at line 558, PUT at line 587, GET at line 37, bulk at line 675)

**Step 1: Update POST /api/books (line 558)**

In the `newBook` object construction, add after `description`:

```javascript
    isbn: bookData.isbn || null,
    pageCount: bookData.pageCount || null,
    seriesName: bookData.seriesName || null,
    seriesNumber: bookData.seriesNumber || null,
    publicationYear: bookData.publicationYear || null,
```

**Step 2: Update PUT /api/books/:id (line 587)**

In the `updatedBook` merge object, add after the `description` line:

```javascript
    isbn: bookData.isbn !== undefined ? bookData.isbn : existingBook.isbn,
    pageCount: bookData.pageCount !== undefined ? bookData.pageCount : existingBook.pageCount,
    seriesName: bookData.seriesName !== undefined ? bookData.seriesName : existingBook.seriesName,
    seriesNumber: bookData.seriesNumber !== undefined ? bookData.seriesNumber : existingBook.seriesNumber,
    publicationYear: bookData.publicationYear !== undefined ? bookData.publicationYear : existingBook.publicationYear,
```

**Step 3: Update GET /api/books (line 37)**

In the inline row-to-object mapping (around line 55), add the new fields:

```javascript
        isbn: b.isbn, pageCount: b.page_count,
        seriesName: b.series_name, seriesNumber: b.series_number,
        publicationYear: b.publication_year,
```

**Step 4: Update POST /api/books/bulk (line 675)**

In the `validBooks` map function, add after `description`:

```javascript
      isbn: book.isbn || null,
      pageCount: book.pageCount || null,
      seriesName: book.seriesName || null,
      seriesNumber: book.seriesNumber || null,
      publicationYear: book.publicationYear || null,
```

**Step 5: Run tests**

Run: `npm test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/routes/books.js
git commit -m "feat: accept and return new book metadata fields in API routes"
```

---

## Task 5: OpenLibrary ISBN Lookup Utility

**Files:**
- Create: `src/utils/isbnLookup.js`
- Create: `src/__tests__/unit/isbnLookup.test.js`

**Step 1: Write the failing tests**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookupISBN, parseOpenLibraryBook } from '../../utils/isbnLookup';

describe('parseOpenLibraryBook', () => {
  it('extracts title, page count, and publication year', () => {
    const olData = {
      title: 'Nineteen Eighty-Four',
      number_of_pages: 328,
      publish_date: 'June 8, 1949',
      covers: [12345],
      series: ['Penguin Modern Classics'],
    };
    const result = parseOpenLibraryBook(olData);
    expect(result.title).toBe('Nineteen Eighty-Four');
    expect(result.pageCount).toBe(328);
    expect(result.publicationYear).toBe(1949);
    expect(result.coverId).toBe(12345);
  });

  it('handles missing fields gracefully', () => {
    const olData = { title: 'Unknown Book' };
    const result = parseOpenLibraryBook(olData);
    expect(result.title).toBe('Unknown Book');
    expect(result.pageCount).toBeNull();
    expect(result.publicationYear).toBeNull();
    expect(result.coverId).toBeNull();
    expect(result.seriesName).toBeNull();
  });

  it('parses year-only publish_date', () => {
    const olData = { title: 'Test', publish_date: '2020' };
    expect(parseOpenLibraryBook(olData).publicationYear).toBe(2020);
  });

  it('parses "Month Year" publish_date', () => {
    const olData = { title: 'Test', publish_date: 'January 2015' };
    expect(parseOpenLibraryBook(olData).publicationYear).toBe(2015);
  });
});

describe('lookupISBN', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for invalid ISBN', async () => {
    const result = await lookupISBN('invalid', {});
    expect(result).toBeNull();
  });

  it('calls OpenLibrary API with normalized ISBN', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          title: 'Test Book',
          authors: [{ key: '/authors/OL123A' }],
          number_of_pages: 200,
          publish_date: '2020',
          covers: [999],
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ name: 'Test Author' })
      });

    globalThis.fetch = mockFetch;

    const result = await lookupISBN('9780141036144', {});
    expect(result).not.toBeNull();
    expect(result.title).toBe('Test Book');
    expect(result.author).toBe('Test Author');
    expect(result.pageCount).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://openlibrary.org/isbn/9780141036144.json',
      expect.any(Object)
    );
  });

  it('returns null when OpenLibrary returns 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    const result = await lookupISBN('9780141036144', {});
    expect(result).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/isbnLookup.test.js`
Expected: FAIL — module not found

**Step 3: Implement the lookup utility**

```javascript
/**
 * OpenLibrary ISBN lookup utility
 * Runs on the Worker side (backend) for caching and rate-limit control.
 */

import { normalizeISBN } from './isbn.js';

/**
 * Parse OpenLibrary publish_date into a year integer.
 * Handles formats: "2020", "January 2015", "June 8, 1949"
 */
const parsePublishYear = (publishDate) => {
  if (!publishDate) return null;
  const match = publishDate.match(/\b(\d{4})\b/);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Extract structured book data from OpenLibrary ISBN response.
 */
export const parseOpenLibraryBook = (olData) => {
  return {
    title: olData.title || null,
    pageCount: olData.number_of_pages || null,
    publicationYear: parsePublishYear(olData.publish_date),
    coverId: olData.covers?.[0] || null,
    seriesName: Array.isArray(olData.series) ? olData.series[0] : (olData.series || null),
    seriesNumber: olData.volume_number ? parseInt(olData.volume_number, 10) : null,
  };
};

/**
 * Fetch author name from OpenLibrary author key.
 */
const fetchAuthorName = async (authorKey) => {
  try {
    const resp = await fetch(`https://openlibrary.org${authorKey}.json`, {
      headers: { 'User-Agent': 'TallyReading/1.0 (https://tallyreading.uk)' }
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.name || null;
  } catch {
    return null;
  }
};

/**
 * Look up a book by ISBN via OpenLibrary.
 * Returns enriched book metadata or null if not found.
 *
 * @param {string} isbn - ISBN-10 or ISBN-13
 * @param {object} env - Worker env (for KV cache access)
 * @returns {object|null} Book metadata
 */
export const lookupISBN = async (isbn, env) => {
  const normalized = normalizeISBN(isbn);
  if (!normalized) return null;

  // Check KV cache
  const cacheKey = `isbn:${normalized}`;
  if (env.RECOMMENDATIONS_CACHE) {
    try {
      const cached = await env.RECOMMENDATIONS_CACHE.get(cacheKey, 'json');
      if (cached) return cached.notFound ? null : cached;
    } catch { /* cache miss */ }
  }

  try {
    const resp = await fetch(`https://openlibrary.org/isbn/${normalized}.json`, {
      headers: { 'User-Agent': 'TallyReading/1.0 (https://tallyreading.uk)' }
    });

    if (!resp.ok) {
      // Cache the miss to avoid repeated lookups
      if (env.RECOMMENDATIONS_CACHE) {
        await env.RECOMMENDATIONS_CACHE.put(cacheKey, JSON.stringify({ notFound: true }), { expirationTtl: 86400 });
      }
      return null;
    }

    const olData = await resp.json();
    const parsed = parseOpenLibraryBook(olData);

    // Fetch author name (separate API call)
    let author = null;
    if (olData.authors?.length > 0) {
      author = await fetchAuthorName(olData.authors[0].key);
    }

    const result = {
      isbn: normalized,
      title: parsed.title,
      author,
      pageCount: parsed.pageCount,
      publicationYear: parsed.publicationYear,
      seriesName: parsed.seriesName,
      seriesNumber: parsed.seriesNumber,
      coverId: parsed.coverId,
      coverSource: parsed.coverId ? 'openlibrary' : null,
    };

    // Cache successful lookup (30 days)
    if (env.RECOMMENDATIONS_CACHE) {
      await env.RECOMMENDATIONS_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 2592000 });
    }

    return result;
  } catch {
    return null;
  }
};
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/isbnLookup.test.js`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/utils/isbnLookup.js src/__tests__/unit/isbnLookup.test.js
git commit -m "feat: add OpenLibrary ISBN lookup with KV caching"
```

---

## Task 6: ISBN Lookup API Endpoint

**Files:**
- Modify: `src/routes/books.js`

**Step 1: Add the ISBN lookup endpoint**

Add this before the existing `POST /` route (around line 555) in `src/routes/books.js`:

```javascript
// ISBN lookup — check local DB first, then OpenLibrary
booksRouter.get('/isbn/:isbn', requireTeacher(), async (c) => {
  const { isbn } = c.req.param();
  const { normalizeISBN } = await import('../utils/isbn.js');
  const normalized = normalizeISBN(isbn);

  if (!normalized) {
    throw badRequestError('Invalid ISBN format');
  }

  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  // Check if book exists locally by ISBN
  if (db) {
    const existing = await db.prepare(
      'SELECT b.* FROM books b WHERE b.isbn = ?'
    ).bind(normalized).first();

    if (existing) {
      // Check if it's in this org's library
      let inLibrary = false;
      if (organizationId) {
        const orgLink = await db.prepare(
          'SELECT 1 FROM org_book_selections WHERE organization_id = ? AND book_id = ? AND is_available = 1'
        ).bind(organizationId, existing.id).first();
        inLibrary = !!orgLink;
      }

      const { rowToBook } = await import('../data/d1Provider.js');
      return c.json({
        source: 'local',
        inLibrary,
        book: rowToBook(existing)
      });
    }
  }

  // Not found locally — look up on OpenLibrary
  const { lookupISBN } = await import('../utils/isbnLookup.js');
  const result = await lookupISBN(normalized, c.env);

  if (!result) {
    return c.json({ source: 'not_found', isbn: normalized, book: null });
  }

  return c.json({
    source: 'openlibrary',
    inLibrary: false,
    book: result
  });
});

// Scan result handler — lookup + optional create + org link
booksRouter.post('/scan', requireTeacher(), async (c) => {
  const { isbn, confirm } = await c.req.json();
  const { normalizeISBN } = await import('../utils/isbn.js');
  const normalized = normalizeISBN(isbn);

  if (!normalized) {
    throw badRequestError('Invalid ISBN format');
  }

  const organizationId = c.get('organizationId');
  const db = c.env.READING_MANAGER_DB;

  // Check if book exists locally
  if (db) {
    const existing = await db.prepare('SELECT * FROM books WHERE isbn = ?').bind(normalized).first();

    if (existing) {
      // Link to org if not already linked
      if (organizationId) {
        await db.prepare(`
          INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
          VALUES (?, ?, ?, 1, datetime('now'))
          ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
        `).bind(crypto.randomUUID(), organizationId, existing.id).run();
      }

      const { rowToBook } = await import('../data/d1Provider.js');
      return c.json({ action: 'linked', book: rowToBook(existing) });
    }
  }

  // Look up on OpenLibrary
  const { lookupISBN } = await import('../utils/isbnLookup.js');
  const metadata = await lookupISBN(normalized, c.env);

  if (!confirm) {
    // Preview mode — return metadata for confirmation
    return c.json({
      action: 'preview',
      book: metadata || { isbn: normalized }
    });
  }

  // Confirm mode — create book and link to org
  const newBook = {
    id: crypto.randomUUID(),
    title: metadata?.title || 'Unknown Book',
    author: metadata?.author || null,
    isbn: normalized,
    pageCount: metadata?.pageCount || null,
    seriesName: metadata?.seriesName || null,
    seriesNumber: metadata?.seriesNumber || null,
    publicationYear: metadata?.publicationYear || null,
    genreIds: [],
    readingLevel: null,
    ageRange: null,
    description: null,
  };

  const provider = await createProvider(c.env);
  const savedBook = await provider.addBook(newBook);

  // Link to organization
  if (organizationId && db) {
    await db.prepare(`
      INSERT INTO org_book_selections (id, organization_id, book_id, is_available, created_at)
      VALUES (?, ?, ?, 1, datetime('now'))
      ON CONFLICT (organization_id, book_id) DO UPDATE SET is_available = 1, updated_at = datetime('now')
    `).bind(crypto.randomUUID(), organizationId, savedBook.id).run();
  }

  return c.json({ action: 'created', book: savedBook }, 201);
});
```

**Important:** These routes must be registered BEFORE the `/:id` route in `books.js`, otherwise `/isbn/:isbn` and `/scan` will be caught by `/:id` as path params. Verify the route ordering.

**Step 2: Export `rowToBook` from d1Provider.js**

Check if `rowToBook` is already exported. If not, add it to the module's exports so the ISBN route can use it. Alternatively, use the provider's `getBookById` after finding the row.

**Step 3: Run tests**

Run: `npm test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add src/routes/books.js src/data/d1Provider.js
git commit -m "feat: add ISBN lookup and scan API endpoints"
```

---

## Task 7: Install html5-qrcode and Remove qr-scanner

**Files:**
- Modify: `package.json`

**Step 1: Swap dependencies**

```bash
npm uninstall qr-scanner && npm install html5-qrcode
```

**Step 2: Verify no code references qr-scanner**

Search the codebase for `qr-scanner` imports. There should be none (the dependency was unused).

**Step 3: Verify build works**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: replace unused qr-scanner with html5-qrcode for ISBN scanning"
```

---

## Task 8: BarcodeScanner Component

**Files:**
- Create: `src/components/books/BarcodeScanner.js`

**Step 1: Create the scanner modal component**

```javascript
import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert
} from '@mui/material';
import { Html5Qrcode } from 'html5-qrcode';

const BarcodeScanner = ({ open, onScan, onClose }) => {
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!open) return;

    let html5QrCode = null;

    const startScanner = async () => {
      try {
        setError(null);
        setScanning(true);

        html5QrCode = new Html5Qrcode('barcode-scanner-region');
        html5QrCodeRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' }, // Rear camera
          {
            fps: 10,
            qrbox: { width: 300, height: 150 }, // Landscape box for barcodes
            formatsToSupport: [0] // 0 = EAN_13 in html5-qrcode
          },
          (decodedText) => {
            // Success — stop scanning and return result
            html5QrCode.stop().catch(() => {});
            setScanning(false);
            onScan(decodedText);
          },
          () => {} // Ignore scan failures (expected while aiming)
        );
      } catch (err) {
        setScanning(false);
        if (err.toString().includes('NotAllowedError') || err.toString().includes('Permission')) {
          setError('Camera permission denied. Please allow camera access in your browser settings and try again.');
        } else if (err.toString().includes('NotFoundError')) {
          setError('No camera found. Please ensure your device has a camera.');
        } else {
          setError(`Could not start camera: ${err.message || err}`);
        }
      }
    };

    // Small delay to ensure DOM element is rendered
    const timeout = setTimeout(startScanner, 100);

    return () => {
      clearTimeout(timeout);
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {});
        html5QrCodeRef.current = null;
      }
    };
  }, [open, onScan]);

  const handleClose = () => {
    if (html5QrCodeRef.current) {
      html5QrCodeRef.current.stop().catch(() => {});
      html5QrCodeRef.current = null;
    }
    setScanning(false);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Scan Book Barcode</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Point your camera at the book's ISBN barcode
          </Typography>
        )}
        <Box
          id="barcode-scanner-region"
          ref={scannerRef}
          sx={{
            width: '100%',
            minHeight: 300,
            bgcolor: 'black',
            borderRadius: 1,
            overflow: 'hidden'
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};

export default BarcodeScanner;
```

**Note:** The `formatsToSupport` value may need adjustment based on html5-qrcode's actual enum values. Check the library docs during implementation — the enum for EAN-13 may be `Html5QrcodeSupportedFormats.EAN_13` instead of a raw `0`.

**Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/books/BarcodeScanner.js
git commit -m "feat: add BarcodeScanner component with html5-qrcode"
```

---

## Task 9: ScanBookFlow Component

**Files:**
- Create: `src/components/books/ScanBookFlow.js`

**Step 1: Create the scan orchestration component**

This component handles the full flow: scan → lookup → preview → confirm/select.

```javascript
import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import BarcodeScanner from './BarcodeScanner';
import BookCover from '../BookCover';
import { useAppContext } from '../../contexts/AppContext';

const ScanBookFlow = ({ open, onClose, onBookSelected }) => {
  const { fetchWithAuth, reloadDataFromServer } = useAppContext();
  const [step, setStep] = useState('scanning'); // scanning | loading | preview | error
  const [scannerOpen, setScannerOpen] = useState(true);
  const [bookData, setBookData] = useState(null);
  const [lookupResult, setLookupResult] = useState(null); // { source, inLibrary, book }
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleScan = useCallback(async (isbn) => {
    setScannerOpen(false);
    setStep('loading');
    setError(null);

    try {
      const response = await fetchWithAuth(`/api/books/isbn/${encodeURIComponent(isbn)}`);
      if (!response.ok) {
        throw new Error('Lookup failed');
      }
      const result = await response.json();
      setLookupResult(result);
      setBookData(result.book);
      setStep('preview');
    } catch (err) {
      setError(`Failed to look up ISBN: ${err.message}`);
      setStep('error');
    }
  }, [fetchWithAuth]);

  const handleAddToLibrary = async () => {
    if (!lookupResult?.book) return;
    setIsSaving(true);

    try {
      const response = await fetchWithAuth('/api/books/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isbn: bookData.isbn,
          confirm: true
        })
      });

      if (!response.ok) {
        throw new Error('Failed to add book');
      }

      const result = await response.json();
      await reloadDataFromServer();

      if (onBookSelected) {
        onBookSelected(result.book);
      }
      handleClose();
    } catch (err) {
      setError(`Failed to add book: ${err.message}`);
      setIsSaving(false);
    }
  };

  const handleSelectExisting = () => {
    if (onBookSelected && bookData) {
      onBookSelected(bookData);
    }
    handleClose();
  };

  const handleScanAgain = () => {
    setStep('scanning');
    setScannerOpen(true);
    setBookData(null);
    setLookupResult(null);
    setError(null);
  };

  const handleClose = () => {
    setStep('scanning');
    setScannerOpen(false);
    setBookData(null);
    setLookupResult(null);
    setError(null);
    setIsSaving(false);
    onClose();
  };

  // Scanner phase
  if (step === 'scanning' && scannerOpen) {
    return (
      <BarcodeScanner
        open={open}
        onScan={handleScan}
        onClose={handleClose}
      />
    );
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {step === 'loading' && 'Looking up book...'}
        {step === 'preview' && 'Book Found'}
        {step === 'error' && 'Scan Result'}
      </DialogTitle>
      <DialogContent>
        {step === 'loading' && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {step === 'error' && (
          <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>
        )}

        {step === 'preview' && bookData && (
          <Box>
            {lookupResult?.source === 'local' && lookupResult?.inLibrary && (
              <Alert severity="info" sx={{ mb: 2 }}>
                This book is already in your library
              </Alert>
            )}
            {lookupResult?.source === 'local' && !lookupResult?.inLibrary && (
              <Alert severity="info" sx={{ mb: 2 }}>
                This book exists but isn't in your school's library yet
              </Alert>
            )}
            {lookupResult?.source === 'not_found' && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Book not found. ISBN: {bookData.isbn}
              </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              {bookData.title && (
                <Box sx={{ width: 80, flexShrink: 0 }}>
                  <BookCover book={bookData} size="M" />
                </Box>
              )}
              <Box>
                <Typography variant="h6">{bookData.title || 'Unknown Book'}</Typography>
                {bookData.author && (
                  <Typography variant="body2" color="text.secondary">
                    by {bookData.author}
                  </Typography>
                )}
                <Divider sx={{ my: 1 }} />
                {bookData.isbn && (
                  <Typography variant="caption" display="block">ISBN: {bookData.isbn}</Typography>
                )}
                {bookData.pageCount && (
                  <Typography variant="caption" display="block">{bookData.pageCount} pages</Typography>
                )}
                {bookData.publicationYear && (
                  <Typography variant="caption" display="block">Published: {bookData.publicationYear}</Typography>
                )}
                {bookData.seriesName && (
                  <Typography variant="caption" display="block">
                    Series: {bookData.seriesName}{bookData.seriesNumber ? ` (#${bookData.seriesNumber})` : ''}
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleScanAgain}>Scan Again</Button>
        {step === 'preview' && lookupResult?.source === 'local' && lookupResult?.inLibrary && (
          <Button variant="contained" onClick={handleSelectExisting}>
            Select This Book
          </Button>
        )}
        {step === 'preview' && lookupResult?.source !== 'not_found' && !(lookupResult?.source === 'local' && lookupResult?.inLibrary) && (
          <Button
            variant="contained"
            onClick={handleAddToLibrary}
            disabled={isSaving}
          >
            {isSaving ? 'Adding...' : 'Add to Library'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ScanBookFlow;
```

**Step 2: Verify it builds**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/books/ScanBookFlow.js
git commit -m "feat: add ScanBookFlow component for scan-lookup-confirm flow"
```

---

## Task 10: Integrate Scanner into BookManager (Books Page)

**Files:**
- Modify: `src/components/books/BookManager.js`

**Step 1: Add scan button and import**

At the top of BookManager.js, add the import:

```javascript
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import ScanBookFlow from './ScanBookFlow';
```

**Step 2: Add state for scanner**

In the state declarations (around line 63), add:

```javascript
const [scannerOpen, setScannerOpen] = useState(false);
```

**Step 3: Add scan button to the toolbar**

Find the existing toolbar area where the Import/Add buttons are. Add a scan button next to them:

```javascript
<Button
  variant="outlined"
  startIcon={<QrCodeScannerIcon />}
  onClick={() => setScannerOpen(true)}
>
  Scan ISBN
</Button>
```

**Step 4: Add the ScanBookFlow component**

At the end of the JSX (before the final closing tags), add:

```javascript
<ScanBookFlow
  open={scannerOpen}
  onClose={() => setScannerOpen(false)}
  onBookSelected={(book) => {
    setScannerOpen(false);
    reloadDataFromServer();
    setSnackbar({ open: true, message: `Added "${book.title}" to library`, severity: 'success' });
  }}
/>
```

**Step 5: Verify it builds**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/components/books/BookManager.js
git commit -m "feat: add ISBN scan button to BookManager toolbar"
```

---

## Task 11: Integrate Scanner into BookAutocomplete

**Files:**
- Modify: `src/components/sessions/BookAutocomplete.js`

**Step 1: Add imports**

```javascript
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import { IconButton, InputAdornment } from '@mui/material';
import ScanBookFlow from '../books/ScanBookFlow';
```

**Step 2: Add scanner state**

In the component (after line 23), add:

```javascript
const [scanOpen, setScanOpen] = useState(false);
```

**Step 3: Add scan icon to the text field**

In the `renderInput` prop of the Autocomplete (line 218), add an `InputProps` end adornment:

```javascript
renderInput={(params) => (
  <TextField
    {...params}
    label={label}
    placeholder={isCreating ? 'Creating book...' : placeholder}
    fullWidth
    InputProps={{
      ...params.InputProps,
      endAdornment: (
        <>
          {params.InputProps.endAdornment}
          <InputAdornment position="end">
            <IconButton
              onClick={() => setScanOpen(true)}
              size="small"
              title="Scan ISBN barcode"
            >
              <QrCodeScannerIcon />
            </IconButton>
          </InputAdornment>
        </>
      ),
    }}
    helperText={
      isCreating
        ? 'Creating new book...'
        : inputValue && !selectedBook && inputValue.length > 0
          ? 'Type @author to specify author, or choose "Add" to quickly create this book'
          : ''
    }
  />
)}
```

**Step 4: Add ScanBookFlow component and handler**

After the `AddBookModal` at the end of the JSX (around line 291), add:

```javascript
<ScanBookFlow
  open={scanOpen}
  onClose={() => setScanOpen(false)}
  onBookSelected={(book) => {
    setScanOpen(false);
    setSelectedBook(book);
    setInputValue(`${book.title}${book.author ? ` by ${book.author}` : ''}`);
    if (onChange) onChange(book);
    if (onBookCreated) onBookCreated(book);
  }}
/>
```

**Step 5: Verify it builds**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/components/sessions/BookAutocomplete.js
git commit -m "feat: add scan ISBN button to BookAutocomplete"
```

---

## Task 12: Integrate Scanner into HomeReadingRegister

**Files:**
- Modify: `src/components/sessions/HomeReadingRegister.js`

**Step 1: Add imports**

```javascript
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import ScanBookFlow from '../books/ScanBookFlow';
```

**Step 2: Add scanner state**

Add in the component state area:

```javascript
const [scanOpen, setScanOpen] = useState(false);
```

**Step 3: Add scan button next to BookAutocomplete**

Find the Book Selection area (line 747-757). Wrap the BookAutocomplete in a flex container with a scan button:

```javascript
<Box sx={{ mb: 2 }}>
  <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
    <Box sx={{ flex: 1 }}>
      <BookAutocomplete
        value={getStudentLastBook(selectedStudent.id)}
        onChange={handleBookChange}
        label="Current Book"
        placeholder="Select or search for book..."
      />
    </Box>
    <IconButton
      onClick={() => setScanOpen(true)}
      color="primary"
      title="Scan ISBN barcode"
      sx={{ mt: 1 }}
    >
      <QrCodeScannerIcon />
    </IconButton>
  </Box>
  <Typography variant="caption" color="text.secondary">
    Book will be saved and synced across devices
  </Typography>
</Box>
```

**Step 4: Add ScanBookFlow component**

At the end of the JSX, add:

```javascript
<ScanBookFlow
  open={scanOpen}
  onClose={() => setScanOpen(false)}
  onBookSelected={(book) => {
    setScanOpen(false);
    handleBookChange(book);
  }}
/>
```

**Step 5: Verify it builds**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/components/sessions/HomeReadingRegister.js
git commit -m "feat: add scan ISBN button to HomeReadingRegister"
```

---

## Task 13: Add ISBN to CSV Import Column Detection

**Files:**
- Modify: `src/utils/csvParser.js` (line 53, `detectColumnMapping`)
- Modify: `src/utils/csvParser.js` (line 78, `mapCSVToBooks`)

**Step 1: Update `detectColumnMapping` (line 53)**

Add ISBN patterns and update the return:

```javascript
export const detectColumnMapping = (headers) => {
  const normalized = headers.map(h => h.toLowerCase().trim());

  const titlePatterns = ['title', 'book title', 'book name', 'name'];
  const authorPatterns = ['author', 'author name', 'writer', 'by'];
  const levelPatterns = ['reading level', 'level', 'reading_level', 'readinglevel', 'grade level'];
  const isbnPatterns = ['isbn', 'isbn13', 'isbn-13', 'isbn10', 'isbn-10'];

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
    readingLevel: findIndex(levelPatterns),
    isbn: findIndex(isbnPatterns)
  };
};
```

**Step 2: Update `mapCSVToBooks` (line 78)**

Add ISBN to the mapped book object:

```javascript
export const mapCSVToBooks = (rows, mapping) => {
  return rows
    .map(row => {
      const title = mapping.title !== null ? row[mapping.title]?.trim() : null;
      if (!title) return null;

      return {
        title,
        author: mapping.author !== null ? row[mapping.author]?.trim() || null : null,
        readingLevel: mapping.readingLevel !== null ? row[mapping.readingLevel]?.trim() || null : null,
        isbn: mapping.isbn !== null ? row[mapping.isbn]?.trim() || null : null
      };
    })
    .filter(Boolean);
};
```

**Step 3: Update BookImportWizard column mapping state (line 37)**

Change the initial `columnMapping` state to include isbn:

```javascript
const [columnMapping, setColumnMapping] = useState({ title: null, author: null, readingLevel: null, isbn: null });
```

**Step 4: Update import/preview to use ISBN for exact-match dedup**

In `src/routes/books.js`, in the `import/preview` endpoint (around line 759), update the matching logic to check ISBN first before falling back to title/author string matching. When a book has an ISBN, match on `WHERE isbn = ?` instead of fuzzy title matching.

**Step 5: Run tests**

Run: `npm test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/utils/csvParser.js src/components/books/BookImportWizard.js src/routes/books.js
git commit -m "feat: add ISBN column detection to CSV import with ISBN-based dedup"
```

---

## Task 14: Update AddBookModal with New Fields

**Files:**
- Modify: `src/components/books/AddBookModal.js`

**Step 1: Add ISBN and metadata fields**

Add state for new fields after the existing `author` state (line 19):

```javascript
const [isbn, setIsbn] = useState('');
const [pageCount, setPageCount] = useState('');
const [seriesName, setSeriesName] = useState('');
const [seriesNumber, setSeriesNumber] = useState('');
const [publicationYear, setPublicationYear] = useState('');
```

**Step 2: Update the reset effect**

In the `useEffect` (line 24), reset new fields:

```javascript
setIsbn('');
setPageCount('');
setSeriesName('');
setSeriesNumber('');
setPublicationYear('');
```

**Step 3: Update handleSubmit**

Replace the `findOrCreateBook` call with a direct API call that includes all fields, or update `findOrCreateBook` in AppContext to accept an options object. The simpler approach is to use `fetchWithAuth` directly:

```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  if (!title.trim()) {
    setError('Please enter a book title.');
    return;
  }

  setIsSubmitting(true);
  setError('');

  try {
    const bookData = {
      title: title.trim(),
      author: author.trim() || null,
      isbn: isbn.trim() || null,
      pageCount: pageCount ? parseInt(pageCount, 10) : null,
      seriesName: seriesName.trim() || null,
      seriesNumber: seriesNumber ? parseInt(seriesNumber, 10) : null,
      publicationYear: publicationYear ? parseInt(publicationYear, 10) : null,
    };

    const book = await findOrCreateBook(bookData.title, bookData.author);

    if (!book || !book.id) {
      throw new Error('Book creation failed');
    }

    if (onBookCreated) onBookCreated(book);
    if (onClose) onClose();
  } catch (err) {
    console.error('Error creating book from AddBookModal:', err);
    setError('Failed to create book. Please try again.');
    setIsSubmitting(false);
  }
};
```

**Step 4: Add form fields in the JSX**

After the Author TextField, add:

```javascript
<TextField
  label="ISBN (Optional)"
  fullWidth
  margin="normal"
  value={isbn}
  onChange={(e) => setIsbn(e.target.value)}
  disabled={isSubmitting}
  placeholder="e.g., 978-0-14-103614-4"
/>
<Box sx={{ display: 'flex', gap: 1 }}>
  <TextField
    label="Pages"
    type="number"
    margin="normal"
    value={pageCount}
    onChange={(e) => setPageCount(e.target.value)}
    disabled={isSubmitting}
    sx={{ flex: 1 }}
  />
  <TextField
    label="Year"
    type="number"
    margin="normal"
    value={publicationYear}
    onChange={(e) => setPublicationYear(e.target.value)}
    disabled={isSubmitting}
    sx={{ flex: 1 }}
  />
</Box>
<Box sx={{ display: 'flex', gap: 1 }}>
  <TextField
    label="Series Name"
    margin="normal"
    value={seriesName}
    onChange={(e) => setSeriesName(e.target.value)}
    disabled={isSubmitting}
    sx={{ flex: 2 }}
  />
  <TextField
    label="#"
    type="number"
    margin="normal"
    value={seriesNumber}
    onChange={(e) => setSeriesNumber(e.target.value)}
    disabled={isSubmitting}
    sx={{ flex: 1 }}
  />
</Box>
```

**Step 5: Verify it builds**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/components/books/AddBookModal.js
git commit -m "feat: add ISBN, page count, series, year fields to AddBookModal"
```

---

## Task 15: End-to-End Manual Testing & Polish

**Files:** Various (bug fixes found during testing)

**Step 1: Start local dev environment**

Run: `npm run start:dev`

**Step 2: Test the full scan flow**

1. Go to Books page → click "Scan ISBN" → verify camera opens
2. Scan a real book barcode → verify OpenLibrary lookup works
3. Confirm adding book → verify it appears in library
4. Scan same book again → verify "already in library" message

**Step 3: Test BookAutocomplete scanner**

1. Go to reading session form → click scan icon → verify camera opens
2. Scan a book → verify it selects the book in the autocomplete

**Step 4: Test HomeReadingRegister scanner**

1. Open Home Reading Register → select student → click scan icon
2. Scan a book → verify it assigns the book to that student

**Step 5: Test CSV import with ISBN column**

1. Create a CSV with title, author, isbn columns
2. Import via BookImportWizard → verify ISBN column is auto-detected
3. Verify ISBN-based dedup works (import same ISBN twice)

**Step 6: Test AddBookModal new fields**

1. Click "Add Book" → verify ISBN, pages, year, series fields appear
2. Create a book with all fields → verify they're saved and displayed

**Step 7: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 8: Build for production**

Run: `npm run build`
Expected: Build succeeds

**Step 9: Final commit**

Commit any bug fixes or polish found during manual testing.

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | DB migration (5 columns + unique ISBN index) | `migrations/0022_*.sql` |
| 2 | ISBN validation utilities + tests | `src/utils/isbn.js` |
| 3 | D1 provider updates (rowToBook, bookToRow, addBook, updateBook) | `src/data/d1Provider.js` |
| 4 | API route updates (POST, PUT, GET, bulk) | `src/routes/books.js` |
| 5 | OpenLibrary ISBN lookup + tests | `src/utils/isbnLookup.js` |
| 6 | ISBN lookup & scan API endpoints | `src/routes/books.js` |
| 7 | Swap qr-scanner → html5-qrcode | `package.json` |
| 8 | BarcodeScanner component (camera modal) | `src/components/books/BarcodeScanner.js` |
| 9 | ScanBookFlow component (scan→lookup→confirm) | `src/components/books/ScanBookFlow.js` |
| 10 | Integrate scanner into BookManager | `src/components/books/BookManager.js` |
| 11 | Integrate scanner into BookAutocomplete | `src/components/sessions/BookAutocomplete.js` |
| 12 | Integrate scanner into HomeReadingRegister | `src/components/sessions/HomeReadingRegister.js` |
| 13 | ISBN column in CSV import | `src/utils/csvParser.js` |
| 14 | New fields in AddBookModal | `src/components/books/AddBookModal.js` |
| 15 | E2E manual testing & polish | Various |
