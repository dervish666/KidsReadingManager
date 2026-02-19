# ISBN Barcode Scanning & Book Enrichment Design

## Overview

Add ISBN barcode scanning to Tally Reading so teachers can point an iPad camera at a book's barcode, auto-fetch metadata from OpenLibrary, and add it to their school library. Also expand the book data model with ISBN, page count, series info, and publication year.

## Data Model Changes

New columns on `books` table (migration 0022):

| Column | Type | Notes |
|--------|------|-------|
| `isbn` | TEXT | ISBN-13 preferred, ISBN-10 converted on input. Nullable. Unique index (where not null). |
| `page_count` | INTEGER | Nullable. Populated from OpenLibrary. |
| `series_name` | TEXT | Nullable. e.g., "Harry Potter" |
| `series_number` | INTEGER | Nullable. e.g., 3 |
| `publication_year` | INTEGER | Nullable. Year only. |

ISBN stored as ISBN-13 (normalized). Unique index on `isbn` replaces string-matching for dedup when ISBN is available. FTS5 table unchanged — ISBN lookup uses exact `WHERE isbn = ?`.

## Scanner Library

**html5-qrcode** replaces unused `qr-scanner` dependency.

- Supports EAN-13 (ISBN barcodes), QR, and many other formats
- Works on iPad Safari via WASM fallback (Safari lacks BarcodeDetector API)
- Handles getUserMedia, viewfinder UI, frame decoding
- Requires `playsinline` attribute for iOS video elements

## Camera UX Flow

1. User taps scan button -> modal opens with live camera viewfinder (rear camera default)
2. User points iPad at barcode -> library detects EAN-13 -> fires success callback
3. Modal auto-closes -> ISBN sent to `GET /api/books/isbn/:isbn`
4. If book exists in library (ISBN match): show it, offer to select
5. If not in library: show OpenLibrary metadata preview, offer to add
6. If OpenLibrary has no match: show raw ISBN, let teacher enter details manually

## Scanner Entry Points

- **Books page toolbar**: Scan button -> scans -> creates/finds book in library
- **BookAutocomplete** (session form): Scan icon next to book field -> scans -> selects/creates book
- **Home Reading Register**: Scan button per student row -> scans -> assigns book

All entry points use the same reusable `<BarcodeScanner>` and `<ScanBookFlow>` components.

## OpenLibrary ISBN Lookup

**Backend handler** (`src/utils/isbnLookup.js`), called from Worker side:

1. Check D1 for existing book with that ISBN
2. If not found, call `https://openlibrary.org/isbn/{isbn}.json`
3. Fetch author name from `/authors/{key}.json` (separate call)
4. Extract: title, author, page_count, publication_year, cover_id, series_name, series_number
5. Cache in KV: successful lookups 30-day TTL, failed lookups 24-hour TTL

**ISBN normalization**: Accept ISBN-10 and ISBN-13. Convert ISBN-10 to ISBN-13 using standard check-digit algorithm before storing.

## API Changes

### New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/books/isbn/:isbn` | Look up by ISBN: local DB first, then OpenLibrary |
| POST | `/api/books/scan` | Scan handler: lookup + optional create + org link |

### Modified Endpoints

- `POST /api/books`, `PUT /api/books/:id` — accept isbn, pageCount, seriesName, seriesNumber, publicationYear
- `POST /api/books/bulk` — accept new fields
- `POST /api/books/import/preview` — ISBN column detection, ISBN-based dedup
- `GET /api/books`, search endpoints — return new fields

## Frontend Components

### New

- `src/components/books/BarcodeScanner.js` — Modal with html5-qrcode viewfinder, onScan/onClose callbacks, permission error handling
- `src/components/books/ScanBookFlow.js` — Orchestrates scan -> lookup -> confirm/edit -> save. Shows preview card with metadata. Reusable across all entry points.

### Modified

- `BookAutocomplete.js` — scan icon button
- `HomeReadingRegister.js` — scan button per row
- Books page toolbar — scan button
- `AddBookModal.js` — new fields (ISBN, page count, series, year) + scan button
- `BookImportWizard.js` — ISBN column auto-detection
- `d1Provider.js` — rowToBook()/bookToRow() with new columns
- `kvProvider.js` / `jsonProvider.js` — new fields for backward compat
- `AppContext.js` — findOrCreateBook() checks ISBN first
