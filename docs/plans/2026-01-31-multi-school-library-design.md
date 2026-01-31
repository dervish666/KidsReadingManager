# Multi-School Library Import Design

## Overview

Enable schools to import their own book libraries via CSV while deduplicating books under the hood. Each school sees only their own library, but storage is shared to avoid duplicate book records.

## Data Model

**No schema changes required.** The existing structure supports this:

- `books` table: shared storage for all book records
- `org_book_selections` table: links organizations to books (the "tag" that gives a school access)
- `v_org_available_books` view: queries a school's available books

When a school imports a book:
- If it exists → create `org_book_selections` row linking school to existing book
- If it doesn't exist → create new book + `org_book_selections` row

Schools only see books where they have an `org_book_selections` entry.

## Import Flow

### CSV Format

Required columns:
- `title` - Book title
- `author` - Author name

Optional columns:
- `reading_level` - Reading level designation

### Matching Strategy

1. **Exact match**: Normalized title + author match
   - Normalization: lowercase, trim whitespace, remove punctuation, collapse spaces
   - Auto-link to existing book

2. **Fuzzy match**: Title similarity > 85% AND author similarity > 85%
   - Show user for confirmation
   - Side-by-side comparison of imported vs existing

3. **No match**: Create new book record

### Metadata Conflicts

When a match exists but metadata differs (e.g., different reading level):
- Surface to user: "We have this book. Update reading level from 'Level 3' to 'Level 4'?"
- User can accept or reject each update

## User Interface

### Entry Point

Existing "Import Books" button on the Books page.

### Import Wizard Steps

1. **Upload**: Drag/drop or file picker for CSV. Show expected format example.

2. **Column Mapping**: Auto-detect columns, let user confirm/adjust mappings.

3. **Review Results**: Four categories displayed:
   - Matched (X books) - Auto-linked, no action needed
   - Possible matches (X books) - Fuzzy matches requiring confirmation
   - New books (X books) - Will be created fresh
   - Metadata differences (X books) - Matches with different data, user decides

4. **Confirm**: Summary of actions, then execute import.

### Review Screen Details

- Collapsible sections for each category
- Possible matches: side-by-side comparison
- Conflicts: show diff of metadata fields
- Checkboxes to accept/reject individual items
- "Accept all" / "Reject all" bulk operations

### Post-Import

- Success message: "Added 47 new books, linked 312 existing, updated 8"
- Books immediately visible in library

## API Endpoints

### Preview Import

```
POST /api/books/import/preview
Content-Type: multipart/form-data

Body: CSV file

Response: {
  matched: [...],
  possibleMatches: [...],
  newBooks: [...],
  conflicts: [...]
}
```

### Confirm Import

```
POST /api/books/import/confirm

Body: {
  matched: ["book-id-1", "book-id-2"],
  possibleMatches: [
    { importRow: 5, existingBookId: "book-id-3", accept: true }
  ],
  newBooks: [
    { title: "...", author: "...", readingLevel: "..." }
  ],
  conflicts: [
    { bookId: "book-id-4", updateReadingLevel: true }
  ]
}

Response: {
  added: 47,
  linked: 312,
  updated: 8,
  failed: []
}
```

## Technical Details

### Matching Implementation

- Normalize strings: lowercase, trim, remove punctuation, collapse whitespace
- Fuzzy matching: Levenshtein distance or trigram similarity
- Keep lightweight for Cloudflare Workers - no heavy NLP libraries
- Matching happens on backend to avoid exposing full catalog to client

### Performance

- ~500 books per school: in-memory matching is fast enough
- If catalog grows (10k+): add index on normalized title/author
- CSV parsing: client-side to reduce payload to API

## Edge Cases

### CSV Validation
- Required columns missing → Error with helpful message
- Empty rows → Skip silently
- Malformed CSV → Error with line number

### Duplicates in Import
- Detect duplicate rows within uploaded CSV
- Show warning: "Row 5 and Row 23 appear to be the same book"

### Already in Library
- Book already in school's library → Skip with note "Already in your library"

### Large Imports
- Progress indicator for imports over 100 books
- Process in batches to avoid timeouts

### Partial Failure
- Complete successful imports even if some fail
- Show summary: "Imported 95 of 100 books. 5 failed: [list]"

## Migration

Existing books (~500) need to be assigned to the current organization:

```sql
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
