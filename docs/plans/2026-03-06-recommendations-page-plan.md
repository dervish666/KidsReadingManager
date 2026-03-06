# Recommendations Page Visual Refresh — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Visually refresh the BookRecommendations page with a warm empty state, priority student quick-picks, auto-search on selection, compact student profile bar, and larger book cards with prominent reasoning.

**Architecture:** All changes are within `src/components/BookRecommendations.js`. No new files, APIs, or dependencies. Uses existing `AppContext` fields (`prioritizedStudents`, `getReadingStatus`, `markStudentAsPriorityHandled`) and existing MUI theme. Tests in `src/__tests__/components/BookRecommendations.test.jsx`.

**Tech Stack:** React 19, MUI v7, Vitest, @testing-library/react

**Design doc:** `docs/plans/2026-03-06-recommendations-page-design.md`

---

### Task 1: Add priority students and getReadingStatus to component

Pull `prioritizedStudents`, `getReadingStatus`, and `markStudentAsPriorityHandled` from AppContext. Add `useMediaQuery` and `useTheme` imports. Wire up a `handleQuickPick` callback that sets the student, populates books read, and triggers library search. This task is pure wiring — no visual changes yet.

**Files:**
- Modify: `src/components/BookRecommendations.js`
- Modify: `src/__tests__/components/BookRecommendations.test.jsx`

**Step 1: Update the test mock context**

In `createMockContext`, add the new AppContext fields so tests don't break when the component starts consuming them:

```js
// Add to createMockContext defaults (after globalClassFilter):
prioritizedStudents: [
  {
    id: 'student-1',
    name: 'Alice Smith',
    classId: 'class-1',
    readingSessions: [
      { id: 'session-1', bookId: 'book-1', date: '2024-06-01', assessment: 'independent' }
    ],
    lastReadDate: '2024-06-01'
  },
  {
    id: 'student-2',
    name: 'Bob Jones',
    classId: 'class-1',
    readingSessions: [],
    lastReadDate: null
  }
],
getReadingStatus: vi.fn().mockReturnValue('needsAttention'),
markStudentAsPriorityHandled: vi.fn(),
```

**Step 2: Run existing tests to confirm no breakage**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx`
Expected: All existing tests PASS (new context fields are additive)

**Step 3: Update component to destructure new context fields**

In `BookRecommendations.js`, update the `useAppContext()` destructuring to include `prioritizedStudents`, `getReadingStatus`, `markStudentAsPriorityHandled`. Add imports for `useTheme`, `useMediaQuery`, `Collapse`, `IconButton`. Remove unused imports as needed later.

```js
const {
  students, classes, books, apiError, fetchWithAuth, globalClassFilter,
  prioritizedStudents, getReadingStatus, markStudentAsPriorityHandled
} = useAppContext();

const theme = useTheme();
const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
```

**Step 4: Extract library search into a reusable function**

Refactor: extract the body of `handleLibrarySearch` into a function `triggerLibrarySearch(studentId)` that can be called from both the existing flow and the quick-pick handler. The existing `handleLibrarySearch` becomes a wrapper that calls `triggerLibrarySearch(selectedStudentId)`.

Add `handleQuickPick(studentId)`:

```js
const handleQuickPick = async (studentId) => {
  // Set the student (same logic as handleStudentChange)
  setSelectedStudentId(studentId);
  const student = students.find(s => s.id === studentId);
  if (student && student.readingSessions) {
    const uniqueBooks = new Map();
    student.readingSessions.forEach(session => {
      if (session.bookId) {
        uniqueBooks.set(session.bookId, {
          id: session.bookId,
          bookId: session.bookId,
          dateRead: session.date,
          assessment: session.assessment
        });
      }
    });
    setBooksRead(Array.from(uniqueBooks.values()));
  } else {
    setBooksRead([]);
  }
  setRecommendations([]);
  setStudentProfile(null);
  setResultType(null);
  setError(null);

  if (markStudentAsPriorityHandled) {
    markStudentAsPriorityHandled(studentId);
  }

  // Auto-trigger library search
  await triggerLibrarySearch(studentId);
};
```

**Step 5: Run tests**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx`
Expected: All existing tests PASS

**Step 6: Commit**

```
git add src/components/BookRecommendations.js src/__tests__/components/BookRecommendations.test.jsx
git commit -m "feat(recommendations): wire up priority students and auto-search"
```

---

### Task 2: Add inline SVG illustration and empty state

Create the warm empty state with an inline SVG book illustration and the "Select a student..." prompt text. This replaces the bare dropdown view.

**Files:**
- Modify: `src/components/BookRecommendations.js`
- Modify: `src/__tests__/components/BookRecommendations.test.jsx`

**Step 1: Write a test for the empty state illustration**

```js
it('should display empty state illustration when no student selected', async () => {
  const mockContext = createMockContext({
    fetchWithAuth: createMockFetch()
  });
  render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

  await waitFor(() => {
    expect(screen.getByTestId('empty-state-illustration')).toBeInTheDocument();
    expect(screen.getByText(/select a student to find their next great read/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx --testNamePattern="empty state illustration"`
Expected: FAIL

**Step 3: Add the BookIllustration inline SVG and empty state JSX**

Above the `BookRecommendations` component, add an inline SVG component:

```jsx
const BookIllustration = () => (
  <svg
    data-testid="empty-state-illustration"
    width="200"
    height="160"
    viewBox="0 0 200 160"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Open book */}
    <path d="M40 120 L100 105 L160 120 L160 50 L100 35 L40 50 Z" fill="#8AAD8A" opacity="0.15" />
    <path d="M40 120 L100 105 L100 35 L40 50 Z" fill="#6B8E6B" opacity="0.25" />
    <path d="M100 105 L160 120 L160 50 L100 35 Z" fill="#8AAD8A" opacity="0.2" />
    {/* Spine */}
    <line x1="100" y1="35" x2="100" y2="105" stroke="#557055" strokeWidth="2" opacity="0.4" />
    {/* Pages lines left */}
    <line x1="55" y1="58" x2="92" y2="48" stroke="#6B8E6B" strokeWidth="1.5" opacity="0.2" />
    <line x1="55" y1="68" x2="92" y2="58" stroke="#6B8E6B" strokeWidth="1.5" opacity="0.2" />
    <line x1="55" y1="78" x2="92" y2="68" stroke="#6B8E6B" strokeWidth="1.5" opacity="0.2" />
    <line x1="55" y1="88" x2="85" y2="80" stroke="#6B8E6B" strokeWidth="1.5" opacity="0.2" />
    {/* Pages lines right */}
    <line x1="108" y1="48" x2="148" y2="58" stroke="#8AAD8A" strokeWidth="1.5" opacity="0.2" />
    <line x1="108" y1="58" x2="148" y2="68" stroke="#8AAD8A" strokeWidth="1.5" opacity="0.2" />
    <line x1="108" y1="68" x2="148" y2="78" stroke="#8AAD8A" strokeWidth="1.5" opacity="0.2" />
    <line x1="108" y1="78" x2="140" y2="85" stroke="#8AAD8A" strokeWidth="1.5" opacity="0.2" />
    {/* Sparkles */}
    <circle cx="75" cy="28" r="3" fill="#D4A574" opacity="0.6" />
    <circle cx="130" cy="20" r="2" fill="#8B7355" opacity="0.4" />
    <circle cx="110" cy="15" r="2.5" fill="#D4A574" opacity="0.5" />
    <circle cx="85" cy="12" r="1.5" fill="#8AAD8A" opacity="0.5" />
    <circle cx="145" cy="30" r="2" fill="#6B8E6B" opacity="0.4" />
    {/* Star sparkles */}
    <path d="M60 22 L62 18 L64 22 L68 20 L64 24 L62 28 L60 24 L56 20 Z" fill="#D4A574" opacity="0.5" />
    <path d="M140 10 L141 7 L142 10 L145 9 L142 11 L141 14 L140 11 L137 9 Z" fill="#8B7355" opacity="0.4" />
  </svg>
);
```

In the JSX, wrap the student selector and add the empty state above it. When `!selectedStudentId`, render:

```jsx
{!selectedStudentId && (
  <Box sx={{ textAlign: 'center', py: 4 }}>
    <BookIllustration />
    <Typography
      variant="h6"
      color="text.secondary"
      sx={{ mt: 2, fontFamily: '"Nunito", sans-serif', fontWeight: 600 }}
    >
      Select a student to find their next great read
    </Typography>
  </Box>
)}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx --testNamePattern="empty state illustration"`
Expected: PASS

**Step 5: Run all tests**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx`
Expected: All PASS

**Step 6: Commit**

```
git add src/components/BookRecommendations.js src/__tests__/components/BookRecommendations.test.jsx
git commit -m "feat(recommendations): add empty state with book illustration"
```

---

### Task 3: Add priority student quick-pick cards

Below the illustration (when no student is selected), render priority student quick-pick cards. Clicking one selects the student and auto-triggers library search.

**Files:**
- Modify: `src/components/BookRecommendations.js`
- Modify: `src/__tests__/components/BookRecommendations.test.jsx`

**Step 1: Write tests for quick-pick cards**

```js
it('should display priority student quick-pick cards when no student selected', async () => {
  const mockContext = createMockContext({
    fetchWithAuth: createMockFetch()
  });
  render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

  await waitFor(() => {
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });
});

it('should select student and trigger library search when quick-pick card is clicked', async () => {
  const mockFetch = createMockFetch();
  const mockContext = createMockContext({
    fetchWithAuth: mockFetch
  });
  render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

  await waitFor(() => {
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  fireEvent.click(screen.getByText('Alice Smith'));

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books/library-search?studentId=student-1')
    );
  });
});

it('should hide quick-pick cards when no priority students exist', async () => {
  const mockContext = createMockContext({
    fetchWithAuth: createMockFetch(),
    prioritizedStudents: []
  });
  render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

  await waitFor(() => {
    expect(screen.queryByText('Priority Students')).not.toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx --testNamePattern="quick-pick"`
Expected: FAIL

**Step 3: Add quick-pick cards JSX**

Inside the `!selectedStudentId` empty state block, after the illustration text, add:

```jsx
{prioritizedStudents?.length > 0 && (
  <Box sx={{ mt: 4, textAlign: 'left' }}>
    <Typography
      variant="subtitle1"
      sx={{ mb: 2, fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: 'text.primary' }}
    >
      Priority Students
    </Typography>
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: {
        xs: 'repeat(2, 1fr)',
        sm: 'repeat(3, 1fr)',
        md: 'repeat(4, 1fr)'
      },
      gap: 2,
      ...(isMobile && {
        display: 'flex',
        overflowX: 'auto',
        gap: 2,
        pb: 1,
        '& > *': { minWidth: 160, flexShrink: 0 }
      })
    }}>
      {prioritizedStudents.slice(0, 6).map((student) => {
        const status = getReadingStatus(student);
        const statusColor = status === 'notRead'
          ? theme.palette.status.notRead
          : status === 'needsAttention'
            ? theme.palette.status.needsAttention
            : theme.palette.status.recentlyRead;
        const lastRead = student.lastReadDate
          ? `Last read ${Math.ceil(Math.abs(new Date() - new Date(student.lastReadDate)) / (1000 * 60 * 60 * 24))} days ago`
          : 'Never read';

        return (
          <Card
            key={student.id}
            onClick={() => handleQuickPick(student.id)}
            sx={{
              cursor: 'pointer',
              p: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Box sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: statusColor,
              flexShrink: 0
            }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 700, fontFamily: '"Nunito", sans-serif' }}
                noWrap
              >
                {student.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {lastRead}
              </Typography>
            </Box>
          </Card>
        );
      })}
    </Box>
  </Box>
)}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx --testNamePattern="quick-pick"`
Expected: PASS

**Step 5: Run all tests**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx`
Expected: All PASS

**Step 6: Commit**

```
git add src/components/BookRecommendations.js src/__tests__/components/BookRecommendations.test.jsx
git commit -m "feat(recommendations): add priority student quick-pick cards"
```

---

### Task 4: Auto-search on student selection and loading skeleton

Change `handleStudentChange` to automatically trigger library search after selecting a student. Replace the CircularProgress spinner with a card-shaped loading skeleton. Remove the "Find in Library" button (it's now automatic). Keep the AI button for now (it moves in a later task).

**Files:**
- Modify: `src/components/BookRecommendations.js`
- Modify: `src/__tests__/components/BookRecommendations.test.jsx`

**Step 1: Write test for auto-search on selection**

```js
it('should auto-trigger library search when student is selected from dropdown', async () => {
  const user = userEvent.setup();
  const mockFetch = createMockFetch();
  const mockContext = createMockContext({
    fetchWithAuth: mockFetch
  });
  render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

  await waitFor(() => {
    expect(screen.getByLabelText('Student')).toBeInTheDocument();
  });

  // Open dropdown and select student
  await user.click(screen.getByLabelText('Student'));
  await user.click(screen.getByText('Alice Smith (2 books read)'));

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/books/library-search?studentId=student-1')
    );
  });
});
```

**Step 2: Write test for loading skeleton**

```js
it('should show loading skeleton while searching', async () => {
  const user = userEvent.setup();
  let resolveSearch;
  const mockFetch = vi.fn().mockImplementation((url) => {
    if (url === '/api/settings/ai') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ hasApiKey: true, provider: 'anthropic' })
      });
    }
    if (url.startsWith('/api/books/library-search')) {
      return new Promise((resolve) => {
        resolveSearch = resolve;
      });
    }
  });
  const mockContext = createMockContext({ fetchWithAuth: mockFetch });
  render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

  await waitFor(() => {
    expect(screen.getByLabelText('Student')).toBeInTheDocument();
  });

  await user.click(screen.getByLabelText('Student'));
  await user.click(screen.getByText('Alice Smith (2 books read)'));

  await waitFor(() => {
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  // Resolve the search
  resolveSearch({
    ok: true,
    json: () => Promise.resolve({
      studentProfile: { readingLevel: 2.5, favoriteGenres: [] },
      books: []
    })
  });

  await waitFor(() => {
    expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx --testNamePattern="auto-trigger|loading skeleton"`
Expected: FAIL

**Step 4: Implement auto-search and skeleton**

1. In `handleStudentChange`, after the profile fetch block, call `triggerLibrarySearch(studentId)` at the end (when `studentId` is truthy).

2. Replace the loading CircularProgress in the results area with a skeleton:

```jsx
{(libraryLoading || aiLoading) && (
  <Box data-testid="loading-skeleton" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
    {[1, 2, 3, 4].map((i) => (
      <Card key={i} sx={{ p: 2, display: 'flex', gap: 2 }}>
        <Box sx={{
          width: isMobile ? 100 : 120,
          height: isMobile ? 150 : 180,
          borderRadius: 1,
          bgcolor: 'rgba(139, 115, 85, 0.08)',
          animation: 'pulse 1.5s ease-in-out infinite',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 0.4 },
            '50%': { opacity: 0.8 },
          },
        }} />
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, py: 1 }}>
          <Box sx={{ width: '70%', height: 20, borderRadius: 1, bgcolor: 'rgba(139, 115, 85, 0.08)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          <Box sx={{ width: '40%', height: 16, borderRadius: 1, bgcolor: 'rgba(139, 115, 85, 0.06)', animation: 'pulse 1.5s ease-in-out 0.2s infinite' }} />
          <Box sx={{ width: '90%', height: 14, borderRadius: 1, bgcolor: 'rgba(139, 115, 85, 0.05)', animation: 'pulse 1.5s ease-in-out 0.4s infinite', mt: 'auto' }} />
        </Box>
      </Card>
    ))}
  </Box>
)}
```

3. Remove the "Find in Library" button from the two-button area. Keep the AI button for now.

**Step 5: Update existing tests that relied on the Find in Library button**

Tests in the "Get Library Matches Button" describe block now need updating. The button-click tests should be changed to test auto-search behaviour instead. Tests that check the button text "Find in Library" should be removed or updated. Tests that check the library-search API is called should verify it's called on student selection.

Review each failing test — if it tests "clicking Find in Library triggers search", update it to test "selecting student triggers search". If it tests "Find in Library button is visible", remove it.

**Step 6: Run all tests**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx`
Expected: All PASS

**Step 7: Commit**

```
git add src/components/BookRecommendations.js src/__tests__/components/BookRecommendations.test.jsx
git commit -m "feat(recommendations): auto-search on student selection with loading skeleton"
```

---

### Task 5: Compact student profile bar with collapsible details

Replace the current two-column student info Paper with a compact horizontal bar. Move books-read and likes/dislikes into a collapsible section.

**Files:**
- Modify: `src/components/BookRecommendations.js`
- Modify: `src/__tests__/components/BookRecommendations.test.jsx`

**Step 1: Write test for compact profile bar**

```js
it('should display compact student profile bar after selection', async () => {
  const user = userEvent.setup();
  const mockFetch = createMockFetch();
  const mockContext = createMockContext({ fetchWithAuth: mockFetch });
  render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

  await waitFor(() => expect(screen.getByLabelText('Student')).toBeInTheDocument());
  await user.click(screen.getByLabelText('Student'));
  await user.click(screen.getByText('Alice Smith (2 books read)'));

  await waitFor(() => {
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Class 1A')).toBeInTheDocument();
  });
});

it('should toggle reading history details on click', async () => {
  const user = userEvent.setup();
  const mockFetch = createMockFetch();
  const mockContext = createMockContext({ fetchWithAuth: mockFetch });
  render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

  await waitFor(() => expect(screen.getByLabelText('Student')).toBeInTheDocument());
  await user.click(screen.getByLabelText('Student'));
  await user.click(screen.getByText('Alice Smith (2 books read)'));

  // Details should be collapsed by default
  await waitFor(() => {
    expect(screen.queryByText(/Books Read/)).not.toBeVisible();
  });

  // Click toggle to expand
  fireEvent.click(screen.getByLabelText('Show reading history'));

  await waitFor(() => {
    expect(screen.getByText(/Books Read/)).toBeVisible();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx --testNamePattern="compact student profile|toggle reading history"`
Expected: FAIL

**Step 3: Implement compact profile bar**

Add `showDetails` state: `const [showDetails, setShowDetails] = useState(false);`

Reset `showDetails` to false in `handleStudentChange` and `handleQuickPick`.

Replace the current `selectedStudent` Paper block with:

```jsx
{selectedStudent && (
  <Paper sx={{ p: 2, mb: 3 }}>
    {/* Compact bar */}
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      flexWrap: 'wrap'
    }}>
      <PersonIcon color="primary" />
      <Typography variant="h6" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700 }}>
        {selectedStudent.name}
      </Typography>
      {selectedClass && (
        <Chip label={selectedClass.name} size="small" color="primary" />
      )}
      {(studentProfile?.readingLevelMin != null && studentProfile?.readingLevelMax != null) ? (
        <Chip label={`Level: ${studentProfile.readingLevelMin} - ${studentProfile.readingLevelMax}`} size="small" variant="outlined" />
      ) : studentProfile?.readingLevel && (
        <Chip label={`Level: ${studentProfile.readingLevel}`} size="small" variant="outlined" />
      )}
      {studentProfile?.favoriteGenres?.map((genre, i) => (
        <Chip key={i} label={genre} size="small" color="error" variant="outlined" />
      ))}

      {/* Focus mode - moved here from button area */}
      <FormControl size="small" sx={{ minWidth: 130, ml: 'auto' }}>
        <InputLabel id="focus-mode-label">Focus</InputLabel>
        <Select
          labelId="focus-mode-label"
          id="focus-mode-select"
          value={focusMode}
          onChange={(e) => setFocusMode(e.target.value)}
          label="Focus"
          disabled={libraryLoading || aiLoading}
        >
          <MenuItem value="balanced">Balanced</MenuItem>
          <MenuItem value="consolidation">Consolidation</MenuItem>
          <MenuItem value="challenge">Challenge</MenuItem>
        </Select>
      </FormControl>

      <IconButton
        size="small"
        onClick={() => setPreferencesOpen(true)}
        aria-label="Edit preferences"
        sx={{ color: 'primary.main' }}
      >
        <EditIcon />
      </IconButton>

      <IconButton
        size="small"
        onClick={() => setShowDetails(!showDetails)}
        aria-label={showDetails ? 'Hide reading history' : 'Show reading history'}
        sx={{ color: 'text.secondary' }}
      >
        {showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
      </IconButton>
    </Box>

    {/* Collapsible details */}
    <Collapse in={showDetails}>
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
        gap: 2,
        mt: 2,
        pt: 2,
        borderTop: '1px solid',
        borderColor: 'divider'
      }}>
        {/* Left: Books read (existing code) */}
        {/* Right: Genres, likes, dislikes (existing code) */}
      </Box>
    </Collapse>
  </Paper>
)}
```

Add imports for `ExpandLessIcon`, `ExpandMoreIcon`, `Collapse` at the top.

**Step 4: Update existing profile tests**

Existing tests in "Student Profile Display" that look for profile elements may need updating — some now require expanding the collapsible first. Update tests that check for "Books Read", likes, dislikes to click the expand toggle first.

**Step 5: Run all tests**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx`
Expected: All PASS

**Step 6: Commit**

```
git add src/components/BookRecommendations.js src/__tests__/components/BookRecommendations.test.jsx
git commit -m "feat(recommendations): compact student profile bar with collapsible details"
```

---

### Task 6: Redesign book result cards

Larger covers, prominent reasoning with pull-quote styling, "In library" badge on cover, better spacing.

**Files:**
- Modify: `src/components/BookRecommendations.js`
- Modify: `src/__tests__/components/BookRecommendations.test.jsx`

**Step 1: Write test for larger book covers**

```js
it('should render book covers at larger size', async () => {
  const user = userEvent.setup();
  const mockFetch = createMockFetch();
  const mockContext = createMockContext({ fetchWithAuth: mockFetch });
  render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

  await waitFor(() => expect(screen.getByLabelText('Student')).toBeInTheDocument());
  await user.click(screen.getByLabelText('Student'));
  await user.click(screen.getByText('Alice Smith (2 books read)'));

  await waitFor(() => {
    const covers = screen.getAllByTestId('book-cover');
    expect(covers.length).toBeGreaterThan(0);
    // Verify the cover has the larger dimensions
    expect(covers[0]).toHaveStyle({ width: '120px', height: '180px' });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx --testNamePattern="larger book covers"`
Expected: FAIL (current covers are 80x120)

**Step 3: Update the book cards JSX**

Replace the recommendations grid with redesigned cards:

```jsx
{recommendations.length > 0 && (
  <Box>
    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {resultType === 'library' ? <BookIcon /> : <SmartToyIcon />}
      {resultType === 'library' ? 'Books from Your Library' : 'AI Suggestions'}
      <Chip label={`${recommendations.length} results`} size="small" />
    </Typography>

    {isCachedResult && resultType === 'ai' && (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Chip label="Cached result" color="info" size="small" variant="outlined" />
        <Button size="small" onClick={handleRefreshAiSuggestions} disabled={aiLoading}>
          Get fresh suggestions
        </Button>
      </Box>
    )}

    <Grid container spacing={2}>
      {recommendations.map((book, index) => (
        <Grid item xs={12} md={6} key={book.id || index}>
          <Card sx={{ p: 0 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box sx={{ display: 'flex', gap: 2.5 }}>
                {/* Cover with optional badge */}
                <Box sx={{ position: 'relative', flexShrink: 0 }}>
                  <BookCover
                    title={book.title}
                    author={book.author}
                    width={isMobile ? 100 : 120}
                    height={isMobile ? 150 : 180}
                  />
                  {resultType === 'ai' && book.inLibrary && (
                    <Chip
                      icon={<CheckCircleIcon />}
                      label="In library"
                      size="small"
                      color="success"
                      sx={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        fontSize: '0.7rem',
                        height: 24,
                      }}
                    />
                  )}
                </Box>

                {/* Content */}
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <Typography
                    variant="h6"
                    sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, wordBreak: 'break-word', lineHeight: 1.3 }}
                  >
                    {book.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    by {book.author}
                  </Typography>

                  {/* Metadata chips */}
                  <Stack direction="row" spacing={0.5} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
                    <Chip label={book.readingLevel || book.level} size="small" variant="outlined" sx={{ fontSize: '0.75rem', height: 24 }} />
                    {book.ageRange && <Chip label={book.ageRange} size="small" variant="outlined" sx={{ fontSize: '0.75rem', height: 24 }} />}
                    {resultType === 'library' && book.genres?.map((genre, i) => (
                      <Chip key={i} label={genre} size="small" variant="outlined" color="primary" sx={{ fontSize: '0.75rem', height: 24 }} />
                    ))}
                  </Stack>

                  {/* Description */}
                  {resultType === 'library' && book.description && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        mb: 1
                      }}
                    >
                      {book.description}
                    </Typography>
                  )}

                  {/* Reasoning - pull quote style */}
                  <Box sx={{
                    borderLeft: '3px solid',
                    borderColor: 'primary.light',
                    bgcolor: 'rgba(107, 142, 107, 0.06)',
                    pl: 1.5,
                    py: 0.75,
                    borderRadius: '0 8px 8px 0',
                    mt: 'auto'
                  }}>
                    <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.primary' }}>
                      {resultType === 'library' ? book.matchReason : book.reason}
                    </Typography>
                  </Box>

                  {/* Where to find */}
                  {resultType === 'ai' && book.whereToFind && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                      {book.whereToFind}
                    </Typography>
                  )}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  </Box>
)}
```

**Step 4: Run all tests**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx`
Expected: All PASS (the "In your library" chip test may need minor update since the label changed from "In your library" to "In library" — check and update if needed)

**Step 5: Commit**

```
git add src/components/BookRecommendations.js src/__tests__/components/BookRecommendations.test.jsx
git commit -m "feat(recommendations): redesign book cards with larger covers and pull-quote reasoning"
```

---

### Task 7: AI suggestions banner and cleanup

Replace the AI Suggestions button with a post-results banner. Remove the old two-button area entirely. Clean up unused imports and dead code.

**Files:**
- Modify: `src/components/BookRecommendations.js`
- Modify: `src/__tests__/components/BookRecommendations.test.jsx`

**Step 1: Write test for AI banner**

```js
it('should show AI suggestion banner after library results load', async () => {
  const user = userEvent.setup();
  const mockFetch = createMockFetch();
  const mockContext = createMockContext({ fetchWithAuth: mockFetch });
  render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

  await waitFor(() => expect(screen.getByLabelText('Student')).toBeInTheDocument());
  await user.click(screen.getByLabelText('Student'));
  await user.click(screen.getByText('Alice Smith (2 books read)'));

  await waitFor(() => {
    expect(screen.getByText(/want personalised picks/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ask ai/i })).toBeInTheDocument();
  });
});

it('should not show AI banner when AI is not configured', async () => {
  const user = userEvent.setup();
  const mockFetch = createMockFetch({
    aiConfig: { hasApiKey: false, provider: null }
  });
  const mockContext = createMockContext({ fetchWithAuth: mockFetch });
  render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

  await waitFor(() => expect(screen.getByLabelText('Student')).toBeInTheDocument());
  await user.click(screen.getByLabelText('Student'));
  await user.click(screen.getByText('Alice Smith (2 books read)'));

  await waitFor(() => {
    expect(screen.queryByText(/want personalised picks/i)).not.toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx --testNamePattern="AI suggestion banner|AI banner"`
Expected: FAIL

**Step 3: Implement AI banner**

After the results grid (and after the empty-results instruction text), add:

```jsx
{/* AI suggestion banner - shown after library results, when AI is configured */}
{resultType === 'library' && !libraryLoading && hasActiveAI && selectedStudentId && (
  <Paper sx={{
    p: 2,
    mt: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 1,
    bgcolor: 'rgba(107, 142, 107, 0.06)',
    border: '1px solid rgba(107, 142, 107, 0.15)'
  }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <SmartToyIcon sx={{ color: 'primary.main' }} />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        Want personalised picks?
      </Typography>
      <Chip
        label={getProviderDisplayName(activeProvider)}
        size="small"
        variant="outlined"
        sx={{ fontSize: '0.7rem' }}
      />
    </Box>
    <Button
      variant="contained"
      size="small"
      onClick={() => handleAiSuggestions()}
      disabled={aiLoading}
      startIcon={aiLoading ? <CircularProgress size={16} color="inherit" /> : <SmartToyIcon />}
    >
      {aiLoading ? 'Generating...' : 'Ask AI'}
    </Button>
  </Paper>
)}
```

Remove the old `{/* Two Buttons Area */}` block entirely.

Remove the old `{/* No recommendations yet */}` Paper that said "Click Find in Library..." — replace with a simpler message or remove entirely (the empty state + auto-search makes it redundant).

**Step 4: Update existing AI button tests**

Tests in "Get AI Suggestions Button" that look for "AI Suggestions" button text now need updating to look for "Ask AI". Tests that click the old button need to select a student first (to trigger library results) and then find the banner button.

Remove tests for the "Find in Library" button being visible/disabled (it no longer exists).

**Step 5: Clean up unused imports**

Remove any MUI imports that are no longer used in the component (check which icons/components were removed).

**Step 6: Run all tests**

Run: `npx vitest run src/__tests__/components/BookRecommendations.test.jsx`
Expected: All PASS

**Step 7: Run full test suite**

Run: `npm test`
Expected: All tests PASS across the entire project

**Step 8: Commit**

```
git add src/components/BookRecommendations.js src/__tests__/components/BookRecommendations.test.jsx
git commit -m "feat(recommendations): replace AI button with post-results banner"
```

---

### Task 8: Final polish and visual verification

Run the app locally and verify the visual changes look good. Fix any spacing, alignment, or colour issues.

**Files:**
- Modify: `src/components/BookRecommendations.js` (if needed)

**Step 1: Build and verify no errors**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 2: Run full test suite one final time**

Run: `npm test`
Expected: All tests PASS

**Step 3: Update structure index**

Update `CLAUDE.md` file map description for `BookRecommendations.js` if the description needs changing, and update `.claude/structure/components.yaml` if the component's props or exports changed (they shouldn't have).

**Step 4: Commit any final tweaks**

```
git add -A
git commit -m "feat(recommendations): visual polish and cleanup"
```
