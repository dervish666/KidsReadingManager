# Fill Info Button Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the "Fill Info" dropdown menu with two buttons: "Fill Missing" (auto-fill gaps, no review) and "Refresh All" (diff review before applying).

**Architecture:** The unified metadata API (`bookMetadataApi.js`) already has `getBookDetails()` and `findGenresForBook()` which together return author, description, cover, and genres for a single book. We'll add a new `batchFetchAllMetadata()` function that calls both per book and returns a unified result. The BookManager component replaces ~18 state variables and 3 results dialogs with 2 simpler state groups and 1 review dialog.

**Tech Stack:** React 19, Material-UI v7, existing bookMetadataApi.js providers (OpenLibrary / Google Books)

---

### Task 1: Add `batchFetchAllMetadata` to bookMetadataApi.js

**Files:**
- Create: `src/__tests__/unit/bookMetadataApiBatch.test.js`
- Modify: `src/utils/bookMetadataApi.js`

This new function fetches all metadata (author, description, genres) for a list of books in a single pass. It calls `getBookDetails()` for description/cover and `findAuthorForBook()` for author and `findGenresForBook()` for genres, returning a unified result per book.

**Step 1: Write the test file**

Create `src/__tests__/unit/bookMetadataApiBatch.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { batchFetchAllMetadata } from '../../utils/bookMetadataApi';

// Mock the underlying provider modules
vi.mock('../../utils/openLibraryApi', () => ({
  checkOpenLibraryAvailability: vi.fn().mockResolvedValue(true),
  resetOpenLibraryAvailabilityCache: vi.fn(),
  getOpenLibraryStatus: vi.fn().mockReturnValue({ available: true }),
  getBookDetails: vi.fn(),
  findAuthorForBook: vi.fn(),
  findGenresForBook: vi.fn(),
  // Stubs for other exports the module re-exports
  searchBooksByTitle: vi.fn(),
  findTopAuthorCandidatesForBook: vi.fn(),
  batchFindMissingAuthors: vi.fn(),
  batchFindMissingDescriptions: vi.fn(),
  batchFindMissingGenres: vi.fn(),
  getCoverUrl: vi.fn(),
}));

vi.mock('../../utils/googleBooksApi', () => ({
  checkGoogleBooksAvailability: vi.fn(),
  resetGoogleBooksAvailabilityCache: vi.fn(),
  getGoogleBooksStatus: vi.fn(),
  getBookDetails: vi.fn(),
  findAuthorForBook: vi.fn(),
  findGenresForBook: vi.fn(),
  searchBooksByTitle: vi.fn(),
  searchBooks: vi.fn(),
  findTopAuthorCandidatesForBook: vi.fn(),
  batchFindMissingAuthors: vi.fn(),
  batchFindMissingDescriptions: vi.fn(),
  batchFindMissingGenres: vi.fn(),
  getCoverUrl: vi.fn(),
}));

const openLibrary = await import('../../utils/openLibraryApi');

const defaultSettings = {}; // defaults to openlibrary provider

describe('batchFetchAllMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty book list', async () => {
    const results = await batchFetchAllMetadata([], defaultSettings);
    expect(results).toEqual([]);
  });

  it('fetches author, description and genres for a book', async () => {
    openLibrary.findAuthorForBook.mockResolvedValue('J.K. Rowling');
    openLibrary.getBookDetails.mockResolvedValue({
      description: 'A boy wizard story',
      coverUrl: 'http://covers.example.com/123-M.jpg',
    });
    openLibrary.findGenresForBook.mockResolvedValue(['Fantasy', 'Children']);

    const books = [{ id: '1', title: 'Harry Potter', author: null, description: null, genreIds: [] }];
    const results = await batchFetchAllMetadata(books, defaultSettings);

    expect(results).toHaveLength(1);
    expect(results[0].book.id).toBe('1');
    expect(results[0].foundAuthor).toBe('J.K. Rowling');
    expect(results[0].foundDescription).toBe('A boy wizard story');
    expect(results[0].foundGenres).toEqual(['Fantasy', 'Children']);
  });

  it('calls onProgress callback with current/total/book', async () => {
    openLibrary.findAuthorForBook.mockResolvedValue('Author A');
    openLibrary.getBookDetails.mockResolvedValue({ description: 'Desc' });
    openLibrary.findGenresForBook.mockResolvedValue(['Fiction']);

    const books = [
      { id: '1', title: 'Book 1', author: null, description: null, genreIds: [] },
      { id: '2', title: 'Book 2', author: null, description: null, genreIds: [] },
    ];
    const onProgress = vi.fn();

    await batchFetchAllMetadata(books, defaultSettings, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      current: 1,
      total: 2,
      book: 'Book 1',
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      current: 2,
      total: 2,
      book: 'Book 2',
    }));
  });

  it('handles API errors gracefully per book', async () => {
    openLibrary.findAuthorForBook.mockRejectedValue(new Error('Network error'));
    openLibrary.getBookDetails.mockRejectedValue(new Error('Network error'));
    openLibrary.findGenresForBook.mockRejectedValue(new Error('Network error'));

    const books = [{ id: '1', title: 'Bad Book', author: null, description: null, genreIds: [] }];
    const results = await batchFetchAllMetadata(books, defaultSettings);

    expect(results).toHaveLength(1);
    expect(results[0].foundAuthor).toBeNull();
    expect(results[0].foundDescription).toBeNull();
    expect(results[0].foundGenres).toBeNull();
    expect(results[0].error).toBeTruthy();
  });

  it('returns null for fields where provider returns nothing', async () => {
    openLibrary.findAuthorForBook.mockResolvedValue(null);
    openLibrary.getBookDetails.mockResolvedValue(null);
    openLibrary.findGenresForBook.mockResolvedValue(null);

    const books = [{ id: '1', title: 'Obscure Book', author: null, description: null, genreIds: [] }];
    const results = await batchFetchAllMetadata(books, defaultSettings);

    expect(results[0].foundAuthor).toBeNull();
    expect(results[0].foundDescription).toBeNull();
    expect(results[0].foundGenres).toBeNull();
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/unit/bookMetadataApiBatch.test.js`
Expected: FAIL — `batchFetchAllMetadata` is not exported from bookMetadataApi

**Step 3: Implement `batchFetchAllMetadata` in bookMetadataApi.js**

Add to the end of `src/utils/bookMetadataApi.js` (before the last line):

```js
/**
 * Batch fetch all metadata (author, description, genres) for a list of books.
 * Makes one lookup pass per book, calling getBookDetails + findAuthorForBook + findGenresForBook.
 * @param {Array} books - Array of book objects
 * @param {Object} settings - Application settings object
 * @param {Function} onProgress - Optional progress callback ({current, total, book})
 * @returns {Promise<Array>} Array of {book, foundAuthor, foundDescription, foundGenres, error}
 */
export async function batchFetchAllMetadata(books, settings, onProgress = null) {
  if (!books || books.length === 0) return [];

  const results = [];

  for (let i = 0; i < books.length; i++) {
    const book = books[i];

    try {
      // Small delay to be respectful to the API
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Fetch all metadata in parallel for this book
      const [authorResult, detailsResult, genresResult] = await Promise.allSettled([
        findAuthorForBook(book.title, settings),
        getBookDetails(book.title, book.author || null, settings),
        findGenresForBook(book.title, book.author || null, settings),
      ]);

      const foundAuthor = authorResult.status === 'fulfilled' ? authorResult.value : null;
      const details = detailsResult.status === 'fulfilled' ? detailsResult.value : null;
      const foundGenres = genresResult.status === 'fulfilled' ? genresResult.value : null;

      results.push({
        book,
        foundAuthor: foundAuthor || null,
        foundDescription: details?.description || null,
        foundGenres: foundGenres || null,
      });
    } catch (error) {
      results.push({
        book,
        foundAuthor: null,
        foundDescription: null,
        foundGenres: null,
        error: error.message,
      });
    }

    if (onProgress) {
      const last = results[results.length - 1];
      onProgress({
        current: i + 1,
        total: books.length,
        book: book.title,
        ...last,
      });
    }
  }

  return results;
}
```

**Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/unit/bookMetadataApiBatch.test.js`
Expected: PASS

**Step 5: Run the full test suite**

Run: `npm test`
Expected: All existing tests still pass

**Step 6: Commit**

```bash
git add src/utils/bookMetadataApi.js src/__tests__/unit/bookMetadataApiBatch.test.js
git commit -m "feat: add batchFetchAllMetadata to bookMetadataApi"
```

---

### Task 2: Replace BookManager state and remove old Fill Info code

**Files:**
- Modify: `src/components/books/BookManager.js`

This task removes all the old author/description/genre lookup state, handlers, and dialogs. It replaces them with two new state groups for "Fill Missing" and "Refresh All".

**Step 1: Remove old state variables**

In `BookManager.js`, remove these state declarations (lines ~84-100):

```js
// REMOVE all of these:
const [isLookingUpAuthors, setIsLookingUpAuthors] = useState(false);
const [authorLookupProgress, setAuthorLookupProgress] = useState(...)
const [authorLookupResults, setAuthorLookupResults] = useState([]);
const [showAuthorResults, setShowAuthorResults] = useState(false);
const [includeUnknownAuthors, setIncludeUnknownAuthors] = useState(true);
const [isLookingUpDescriptions, setIsLookingUpDescriptions] = useState(false);
const [descriptionLookupProgress, setDescriptionLookupProgress] = useState(...)
const [descriptionLookupResults, setDescriptionLookupResults] = useState([]);
const [showDescriptionResults, setShowDescriptionResults] = useState(false);
const [isLookingUpGenres, setIsLookingUpGenres] = useState(false);
const [genreLookupProgress, setGenreLookupProgress] = useState(...)
const [genreLookupResults, setGenreLookupResults] = useState([]);
const [showGenreResults, setShowGenreResults] = useState(false);
const [aiFillMenuAnchor, setAiFillMenuAnchor] = useState(null);
```

**Step 2: Remove old handler functions**

Remove these functions entirely:
- `handleFillMissingAuthors` (~lines 568-646)
- `handleApplyAuthorUpdates` (~lines 648-701)
- `handleCancelAuthorResults` (~lines 703-706)
- `getBooksWithoutAuthors` (~lines 708-715)
- `getBooksWithoutDescriptions` (~lines 717-723)
- `getBooksWithoutGenres` (~lines 725-736)
- `handleFillMissingDescriptions` (~lines 739-809)
- `handleApplyDescriptionUpdates` (~lines 811-856)
- `handleCancelDescriptionResults` (~lines 858-861)
- `handleFillMissingGenres` (~lines 864-933)
- `handleApplyGenreUpdates` (~lines 936-1032)
- `handleCancelGenreResults` (~lines 1034-1037)

**Step 3: Remove old imports that are no longer needed**

From the bookMetadataApi import, remove:
- `batchFindMissingAuthors`
- `batchFindMissingDescriptions`
- `batchFindMissingGenres`

Add:
- `batchFetchAllMetadata`

From MUI icon imports, remove:
- `PersonSearchIcon`
- `DescriptionIcon`
- `CategoryIcon`

Add:
- `SyncIcon` (from `@mui/icons-material/Sync`)

From MUI imports, the `Divider` import can stay (used elsewhere potentially). Remove `Checkbox` and `FormControlLabel` if only used by the "Include Unknown authors" toggle — check if used elsewhere first.

**Step 4: Remove old JSX sections**

Remove these JSX blocks:
1. The "Fill Info" `<Menu>` dropdown and its `<Button>` trigger (~lines 1244-1303)
2. Author Lookup Progress bar (~lines 1378-1393)
3. Description Lookup Progress bar (~lines 1395-1411)
4. Genre Lookup Progress bar (~lines 1414-1429)
5. Author Lookup Results Dialog (~lines 1908-2075)
6. Description Lookup Results Dialog (~lines 2077-2138)
7. Genre Lookup Results Dialog (~lines 2140-2203)

**Step 5: Add new state variables**

```js
// Fill Missing state
const [isFilling, setIsFilling] = useState(false);
const [fillProgress, setFillProgress] = useState({ current: 0, total: 0, book: '' });

// Refresh All state
const [isRefreshing, setIsRefreshing] = useState(false);
const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0, book: '' });
const [refreshResults, setRefreshResults] = useState([]);
const [showRefreshReview, setShowRefreshReview] = useState(false);
```

**Step 6: Verify the component still renders (no runtime errors)**

Run: `npm run build`
Expected: Build succeeds (there will be missing handler references — that's OK, we'll add them in Task 3)

**Step 7: Commit**

```bash
git add src/components/books/BookManager.js
git commit -m "refactor: remove old Fill Info state, handlers, and dialogs"
```

---

### Task 3: Implement "Fill Missing" handler and button

**Files:**
- Modify: `src/components/books/BookManager.js`

**Step 1: Add the `handleFillMissing` function**

Add after the existing handler functions (e.g. after `handleCancelEdit`):

```js
// Unified "Fill Missing" — fills all gaps (author, description, genres) in one pass
const handleFillMissing = async () => {
  // Find books with any missing data
  const booksWithGaps = books.filter(book => {
    const authorMissing = !book.author || book.author.trim().toLowerCase() === 'unknown' || !book.author.trim();
    const descriptionMissing = !book.description || !book.description.trim();
    const genresMissing = !book.genreIds || book.genreIds.length === 0;
    return authorMissing || descriptionMissing || genresMissing;
  });

  if (booksWithGaps.length === 0) {
    setSnackbar({ open: true, message: 'All books already have complete metadata!', severity: 'info' });
    return;
  }

  const configValidation = validateProviderConfig(settings);
  if (!configValidation.valid) {
    setSnackbar({ open: true, message: configValidation.error, severity: 'error' });
    return;
  }

  const providerName = getProviderDisplayName(settings);
  const isAvailable = await checkAvailability(settings, 3000);
  if (!isAvailable) {
    setSnackbar({ open: true, message: `${providerName} is currently unavailable. Please try again later.`, severity: 'error' });
    return;
  }

  setIsFilling(true);
  setFillProgress({ current: 0, total: booksWithGaps.length, book: '' });

  try {
    const results = await batchFetchAllMetadata(booksWithGaps, settings, (progress) => {
      setFillProgress(progress);
    });

    // Auto-apply: only fill fields that are currently missing
    let authorsUpdated = 0, descriptionsUpdated = 0, genresUpdated = 0, errorCount = 0;

    // Build genre name -> ID map
    const genreNameToId = {};
    for (const genre of genres) {
      genreNameToId[genre.name.toLowerCase()] = genre.id;
    }

    for (const result of results) {
      const book = result.book;
      const updates = {};
      let hasUpdate = false;

      // Fill author if missing
      const authorMissing = !book.author || book.author.trim().toLowerCase() === 'unknown' || !book.author.trim();
      if (authorMissing && result.foundAuthor) {
        updates.author = result.foundAuthor;
        hasUpdate = true;
        authorsUpdated++;
      }

      // Fill description if missing
      if ((!book.description || !book.description.trim()) && result.foundDescription) {
        updates.description = result.foundDescription;
        hasUpdate = true;
        descriptionsUpdated++;
      }

      // Fill genres if missing
      if ((!book.genreIds || book.genreIds.length === 0) && result.foundGenres && result.foundGenres.length > 0) {
        // Create missing genres first
        for (const genreName of result.foundGenres) {
          if (!genreNameToId[genreName.toLowerCase()]) {
            try {
              const response = await fetchWithAuth('/api/genres', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: genreName }),
              });
              if (response.ok) {
                const newGenre = await response.json();
                genreNameToId[genreName.toLowerCase()] = newGenre.id;
              }
            } catch (e) { /* continue */ }
          }
        }

        const genreIds = result.foundGenres
          .map(name => genreNameToId[name.toLowerCase()])
          .filter(Boolean);

        if (genreIds.length > 0) {
          updates.genreIds = genreIds;
          hasUpdate = true;
          genresUpdated++;
        }
      }

      if (hasUpdate) {
        try {
          const response = await fetchWithAuth(`/api/books/${book.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...book, ...updates }),
          });
          if (!response.ok) errorCount++;
        } catch (e) {
          errorCount++;
        }
      }
    }

    await reloadDataFromServer();

    const parts = [];
    if (authorsUpdated > 0) parts.push(`${authorsUpdated} authors`);
    if (descriptionsUpdated > 0) parts.push(`${descriptionsUpdated} descriptions`);
    if (genresUpdated > 0) parts.push(`${genresUpdated} genres`);

    const totalUpdated = authorsUpdated + descriptionsUpdated + genresUpdated;
    const message = totalUpdated > 0
      ? `Updated ${totalUpdated} fields (${parts.join(', ')})${errorCount > 0 ? `, ${errorCount} errors` : ''}`
      : 'No new metadata found for books with gaps';

    setSnackbar({ open: true, message, severity: totalUpdated > 0 ? 'success' : 'warning' });
  } catch (error) {
    setSnackbar({ open: true, message: `Fill missing failed: ${error.message}`, severity: 'error' });
  } finally {
    setIsFilling(false);
  }
};
```

**Step 2: Add the "Fill Missing" button in the toolbar**

Replace the old Fill Info `<Button>` and `<Menu>` block with:

```jsx
{/* Fill Missing Button */}
<Button
  variant="outlined"
  color="secondary"
  startIcon={isFilling ? <CircularProgress size={16} /> : <AutoFixHighIcon />}
  onClick={handleFillMissing}
  disabled={books.length === 0 || isFilling || isRefreshing}
  size="small"
>
  Fill Missing
</Button>
```

**Step 3: Add a single unified progress bar**

Replace the three old progress bar sections with one:

```jsx
{/* Metadata Lookup Progress */}
{(isFilling || isRefreshing) && (
  <Box sx={{ mt: 2 }}>
    <Typography variant="body2" gutterBottom>
      {isFilling ? 'Filling missing data' : 'Refreshing all books'}: {(isFilling ? fillProgress : refreshProgress).current}/{(isFilling ? fillProgress : refreshProgress).total}
    </Typography>
    <Typography variant="body2" color="text.secondary" gutterBottom>
      Current: {(isFilling ? fillProgress : refreshProgress).book}
    </Typography>
    <LinearProgress
      variant="determinate"
      value={(() => {
        const p = isFilling ? fillProgress : refreshProgress;
        return p.total > 0 ? (p.current / p.total) * 100 : 0;
      })()}
      sx={{ mb: 1 }}
    />
  </Box>
)}
```

**Step 4: Verify it builds**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/components/books/BookManager.js
git commit -m "feat: add Fill Missing button with unified metadata lookup"
```

---

### Task 4: Implement "Refresh All" handler, button, and diff review dialog

**Files:**
- Modify: `src/components/books/BookManager.js`

**Step 1: Add the `handleRefreshAll` function**

```js
// "Refresh All" — fetches fresh metadata for ALL books, shows diff review
const handleRefreshAll = async () => {
  if (books.length === 0) {
    setSnackbar({ open: true, message: 'No books to refresh', severity: 'info' });
    return;
  }

  const configValidation = validateProviderConfig(settings);
  if (!configValidation.valid) {
    setSnackbar({ open: true, message: configValidation.error, severity: 'error' });
    return;
  }

  const providerName = getProviderDisplayName(settings);
  const isAvailable = await checkAvailability(settings, 3000);
  if (!isAvailable) {
    setSnackbar({ open: true, message: `${providerName} is currently unavailable. Please try again later.`, severity: 'error' });
    return;
  }

  setIsRefreshing(true);
  setRefreshProgress({ current: 0, total: books.length, book: '' });

  try {
    const results = await batchFetchAllMetadata(books, settings, (progress) => {
      setRefreshProgress(progress);
    });

    // Build diff: compare fetched vs existing, only show changes
    const diffs = [];
    for (const result of results) {
      const book = result.book;
      const changes = [];

      // Author diff
      const currentAuthor = (book.author || '').trim();
      const newAuthor = (result.foundAuthor || '').trim();
      if (newAuthor && newAuthor.toLowerCase() !== currentAuthor.toLowerCase()) {
        changes.push({ field: 'author', oldValue: currentAuthor || '(empty)', newValue: newAuthor, checked: true });
      }

      // Description diff
      const currentDesc = (book.description || '').trim();
      const newDesc = (result.foundDescription || '').trim();
      if (newDesc && newDesc !== currentDesc) {
        changes.push({ field: 'description', oldValue: currentDesc || '(empty)', newValue: newDesc, checked: true });
      }

      // Genres diff
      const currentGenreIds = book.genreIds || [];
      if (result.foundGenres && result.foundGenres.length > 0) {
        const currentGenreNames = currentGenreIds
          .map(id => genres.find(g => g.id === id)?.name?.toLowerCase())
          .filter(Boolean);
        const newGenreNames = result.foundGenres.map(g => g.toLowerCase());
        const hasNewGenres = newGenreNames.some(g => !currentGenreNames.includes(g));
        if (hasNewGenres) {
          changes.push({
            field: 'genres',
            oldValue: currentGenreIds.length > 0
              ? currentGenreIds.map(id => genres.find(g => g.id === id)?.name || 'Unknown').join(', ')
              : '(none)',
            newValue: result.foundGenres.join(', '),
            newGenres: result.foundGenres,
            checked: true
          });
        }
      }

      if (changes.length > 0) {
        diffs.push({ book, changes });
      }
    }

    setRefreshResults(diffs);
    setIsRefreshing(false);
    setShowRefreshReview(true);

    if (diffs.length === 0) {
      setSnackbar({ open: true, message: 'All books are already up to date!', severity: 'info' });
    }
  } catch (error) {
    setIsRefreshing(false);
    setSnackbar({ open: true, message: `Refresh failed: ${error.message}`, severity: 'error' });
  }
};
```

**Step 2: Add the `handleApplyRefreshUpdates` function**

```js
const handleApplyRefreshUpdates = async () => {
  let updateCount = 0;
  let errorCount = 0;

  // Build genre name -> ID map
  const genreNameToId = {};
  for (const genre of genres) {
    genreNameToId[genre.name.toLowerCase()] = genre.id;
  }

  for (const diff of refreshResults) {
    const checkedChanges = diff.changes.filter(c => c.checked);
    if (checkedChanges.length === 0) continue;

    const updates = { ...diff.book };

    for (const change of checkedChanges) {
      if (change.field === 'author') {
        updates.author = change.newValue;
      } else if (change.field === 'description') {
        updates.description = change.newValue;
      } else if (change.field === 'genres' && change.newGenres) {
        // Create missing genres
        for (const genreName of change.newGenres) {
          if (!genreNameToId[genreName.toLowerCase()]) {
            try {
              const response = await fetchWithAuth('/api/genres', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: genreName }),
              });
              if (response.ok) {
                const newGenre = await response.json();
                genreNameToId[genreName.toLowerCase()] = newGenre.id;
              }
            } catch (e) { /* continue */ }
          }
        }
        const genreIds = change.newGenres
          .map(name => genreNameToId[name.toLowerCase()])
          .filter(Boolean);
        if (genreIds.length > 0) {
          updates.genreIds = genreIds;
        }
      }
    }

    try {
      const response = await fetchWithAuth(`/api/books/${diff.book.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (response.ok) updateCount++;
      else errorCount++;
    } catch (e) {
      errorCount++;
    }
  }

  await reloadDataFromServer();
  setShowRefreshReview(false);
  setRefreshResults([]);

  setSnackbar({
    open: true,
    message: `Applied changes to ${updateCount} books${errorCount > 0 ? `, ${errorCount} errors` : ''}`,
    severity: errorCount > 0 ? 'warning' : 'success'
  });
};

const handleToggleRefreshChange = (bookIndex, changeIndex) => {
  setRefreshResults(prev => prev.map((diff, bi) => {
    if (bi !== bookIndex) return diff;
    return {
      ...diff,
      changes: diff.changes.map((change, ci) => {
        if (ci !== changeIndex) return change;
        return { ...change, checked: !change.checked };
      })
    };
  }));
};
```

**Step 3: Add the "Refresh All" button in the toolbar**

Add next to the "Fill Missing" button:

```jsx
{/* Refresh All Button */}
<Button
  variant="outlined"
  startIcon={isRefreshing ? <CircularProgress size={16} /> : <SyncIcon />}
  onClick={handleRefreshAll}
  disabled={books.length === 0 || isFilling || isRefreshing}
  size="small"
>
  Refresh All
</Button>
```

**Step 4: Add the diff review dialog**

Replace all three old results dialogs with one:

```jsx
{/* Refresh All Review Dialog */}
<Dialog open={showRefreshReview} onClose={() => { setShowRefreshReview(false); setRefreshResults([]); }} fullWidth maxWidth="md">
  <DialogTitle>Review Proposed Changes</DialogTitle>
  <DialogContent>
    <DialogContentText sx={{ mb: 2 }}>
      Found changes for {refreshResults.length} books. Toggle individual changes on/off, then click Apply.
    </DialogContentText>

    {refreshResults.length === 0 ? (
      <Typography color="text.secondary">No changes found — all books are up to date.</Typography>
    ) : (
      <List>
        {refreshResults.map((diff, bookIndex) => (
          <ListItem key={diff.book.id} divider alignItems="flex-start" sx={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <BookCover title={diff.book.title} author={diff.book.author} width={36} height={50} />
              <Box>
                <Typography variant="subtitle2">{diff.book.title}</Typography>
                {diff.book.author && (
                  <Typography variant="caption" color="text.secondary">by {diff.book.author}</Typography>
                )}
              </Box>
            </Box>
            {diff.changes.map((change, changeIndex) => (
              <Box
                key={change.field}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  ml: 2,
                  mb: 0.5,
                  opacity: change.checked ? 1 : 0.5,
                  cursor: 'pointer',
                }}
                onClick={() => handleToggleRefreshChange(bookIndex, changeIndex)}
              >
                <Checkbox
                  size="small"
                  checked={change.checked}
                  sx={{ p: 0.25 }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                    {change.field}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <Typography
                      variant="body2"
                      sx={{
                        textDecoration: 'line-through',
                        color: 'error.main',
                        maxWidth: '45%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: change.field === 'description' ? 'normal' : 'nowrap',
                      }}
                    >
                      {change.oldValue}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">→</Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'success.main',
                        maxWidth: '45%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: change.field === 'description' ? 'normal' : 'nowrap',
                      }}
                    >
                      {change.newValue}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            ))}
          </ListItem>
        ))}
      </List>
    )}
  </DialogContent>
  <DialogActions>
    <Button onClick={() => { setShowRefreshReview(false); setRefreshResults([]); }}>Cancel</Button>
    <Button
      onClick={handleApplyRefreshUpdates}
      variant="contained"
      color="primary"
      disabled={refreshResults.every(d => d.changes.every(c => !c.checked))}
    >
      Apply Selected Changes ({refreshResults.reduce((sum, d) => sum + d.changes.filter(c => c.checked).length, 0)})
    </Button>
  </DialogActions>
</Dialog>
```

**Step 5: Verify it builds**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 7: Commit**

```bash
git add src/components/books/BookManager.js
git commit -m "feat: add Refresh All button with diff review dialog"
```

---

### Task 5: Clean up unused imports and verify

**Files:**
- Modify: `src/components/books/BookManager.js`

**Step 1: Audit imports**

Review the top of BookManager.js and remove any imports that are no longer used after the refactor:

- Remove `PersonSearchIcon`, `DescriptionIcon`, `CategoryIcon` if not used elsewhere
- Remove `batchFindMissingAuthors`, `batchFindMissingDescriptions`, `batchFindMissingGenres` from the bookMetadataApi import
- Remove `FormControlLabel` if only used by the removed "Include Unknown authors" toggle
- Ensure `SyncIcon` is imported
- Ensure `batchFetchAllMetadata` is imported
- Ensure `Checkbox` stays imported (used by the diff review dialog)

**Step 2: Verify `handleCancelEdit` doesn't reference removed state**

Check that `handleCancelEdit` doesn't reference `setEditBookCoverUrl` — if it does, this was a pre-existing issue with a state variable that doesn't exist. Remove the reference if found.

**Step 3: Build and test**

Run: `npm run build && npm test`
Expected: Build succeeds and all tests pass

**Step 4: Commit**

```bash
git add src/components/books/BookManager.js
git commit -m "refactor: clean up unused imports after Fill Info redesign"
```

---

### Task 6: Manual testing and session notes

**Step 1: Start the dev server**

Run: `npm run start:dev`

**Step 2: Manual test checklist**

1. Navigate to the Books page
2. Verify "Fill Missing" and "Refresh All" buttons are visible
3. Verify old "Fill Info" dropdown is gone
4. Click "Fill Missing" with some books missing data — verify progress bar shows, data fills, snackbar reports results
5. Click "Refresh All" — verify progress bar shows, then diff review dialog appears with old→new values
6. Toggle some changes off, click Apply — verify only checked changes are applied
7. Cancel the refresh dialog — verify nothing is saved
8. Test with no books — both buttons should be disabled
9. Test with all data complete — "Fill Missing" should show "All books already have complete metadata!"

**Step 3: Write session notes**

Update `~/notes/TallyReading.md` with session summary.

**Step 4: Commit any final fixes**

If any issues found during manual testing, fix and commit.
