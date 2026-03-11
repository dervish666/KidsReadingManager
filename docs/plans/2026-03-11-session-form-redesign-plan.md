# Session Form Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign SessionForm from a two-column Grid layout to a single-column compact flow optimized for iPad, eliminating wasted whitespace and unnecessary scrolling.

**Architecture:** Replace Grid-based two-column layout with stacked Box rows. Move book metadata editing into a Popover. Convert location to a ToggleButtonGroup. Collapse notes behind an icon. Remove Previous Sessions section entirely.

**Tech Stack:** React 19, Material-UI v7 (Box, ToggleButtonGroup, Popover, IconButton), existing component APIs.

**Design doc:** `docs/plans/2026-03-11-session-form-redesign-design.md`

---

### Task 1: Remove Previous Sessions section

Remove the entire "Previous Sessions for {name}" section from SessionForm. The StudentInfoCard already shows "Last read: X days ago" which is sufficient context.

**Files:**
- Modify: `src/components/sessions/SessionForm.js:642-731` (remove Previous Sessions JSX)
- Modify: `src/components/sessions/SessionForm.js:43-59` (remove getBookInfo helper)
- Modify: `src/components/sessions/SessionForm.js:76-83` (remove recentSessions state + fetch)
- Modify: `src/__tests__/components/SessionForm.test.jsx:886-921` (remove Previous Sessions tests)

**Step 1: Remove Previous Sessions code from SessionForm**

In `SessionForm.js`:
1. Delete the `getBookInfo` helper function (lines 43-59) — only used by Previous Sessions
2. Delete `recentSessions` state and `fetchRecentSessions` callback (lines 76-87)
3. Remove the `fetchRecentSessions(selectedStudentId)` call from the submit success handler (line 270)
4. Delete the entire `{selectedStudent && (...)}` block after the `</form>` tag (lines 642-732) — this is the Previous Sessions section
5. Remove unused imports: `Card`, `CardContent`, `Divider`

**Step 2: Remove Previous Sessions tests**

In `SessionForm.test.jsx`:
1. Delete the entire `describe('Previous Sessions Display', ...)` block (lines 886-921)
2. Delete the test `'should display previous sessions after selecting student'` from the Student Selection describe block (lines 279-292)

**Step 3: Run tests**

Run: `npx vitest run src/__tests__/components/SessionForm.test.jsx`
Expected: All remaining tests pass.

**Step 4: Commit**

```bash
git add src/components/sessions/SessionForm.js src/__tests__/components/SessionForm.test.jsx
git commit -m "refactor: remove Previous Sessions section from SessionForm"
```

---

### Task 2: Convert StudentInfoCard to inline chip bar

Replace the card-style StudentInfoCard with a compact inline summary that sits next to the student dropdown. Instead of a Box with padding/borders, render a single line of text chips.

**Files:**
- Modify: `src/components/sessions/StudentInfoCard.js` (rewrite to inline format)

**Step 1: Rewrite StudentInfoCard**

Replace the entire component render with an inline chip bar:

```jsx
import React, { useState, useEffect } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import { useAppContext } from '../../contexts/AppContext';

const StudentInfoCard = ({ student }) => {
  const { fetchWithAuth } = useAppContext();
  const [recentSessions, setRecentSessions] = useState([]);

  useEffect(() => {
    if (!student?.id) {
      setRecentSessions([]);
      return;
    }
    fetchWithAuth(`/api/students/${student.id}/sessions?limit=5`)
      .then(r => r.ok ? r.json() : [])
      .then(setRecentSessions)
      .catch(() => setRecentSessions([]));
  }, [student?.id, fetchWithAuth]);

  if (!student) return null;

  const { name, readingLevelMin, readingLevelMax, currentStreak, lastReadDate, totalSessionCount = 0 } = student;

  const formatLastRead = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sessionDate = new Date(date);
    sessionDate.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - sessionDate) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return '1 week ago';
    return `${Math.floor(diffDays / 7)} weeks ago`;
  };

  const formatLevel = () => {
    if (readingLevelMin == null && readingLevelMax == null) return null;
    if (readingLevelMin === readingLevelMax) return `Level ${readingLevelMin}`;
    if (readingLevelMin == null) return `Level ≤${readingLevelMax}`;
    if (readingLevelMax == null) return `Level ${readingLevelMin}+`;
    return `Level ${readingLevelMin}-${readingLevelMax}`;
  };

  const levelText = formatLevel();
  const lastReadText = formatLastRead(lastReadDate);
  const hasHistory = totalSessionCount > 0 || recentSessions.length > 0;

  if (!hasHistory && !levelText) {
    return (
      <Typography
        role="region"
        aria-label={`Reading information for ${name || 'student'}`}
        variant="body2"
        color="text.secondary"
        sx={{ fontStyle: 'italic', py: 0.5 }}
      >
        No reading history yet
      </Typography>
    );
  }

  return (
    <Box
      role="region"
      aria-label={`Reading information for ${name || 'student'}`}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', py: 0.5 }}
    >
      {lastReadText && (
        <Chip
          label={`Last read: ${lastReadText}`}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.8rem', borderColor: 'rgba(0,0,0,0.12)' }}
        />
      )}
      {currentStreak > 0 && (
        <Chip
          icon={<WhatshotIcon sx={{ fontSize: 14, color: '#F59E0B !important' }} />}
          label={`${currentStreak} day${currentStreak !== 1 ? 's' : ''}`}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.8rem', borderColor: 'rgba(0,0,0,0.12)' }}
        />
      )}
      {levelText && (
        <Chip
          label={levelText}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.8rem', borderColor: 'rgba(0,0,0,0.12)' }}
        />
      )}
    </Box>
  );
};

export default StudentInfoCard;
```

Key changes:
- Removed recent books display (not needed in compact mode)
- Box with card styling → inline flex with Chip components
- Empty state → single-line italic text instead of bordered box
- Still fetches sessions for `hasHistory` check, but doesn't display book titles

**Step 2: Run tests**

Run: `npx vitest run src/__tests__/components/SessionForm.test.jsx`
Expected: All tests pass (StudentInfoCard is rendered within SessionForm but tests don't directly assert on its internal structure beyond presence).

**Step 3: Commit**

```bash
git add src/components/sessions/StudentInfoCard.js
git commit -m "refactor: convert StudentInfoCard to inline chip bar"
```

---

### Task 3: Extract book details into a Popover

Move the book metadata editing panel (author, reading level, age range, genres, Reset/Get Details/Update buttons) from inline in the form into a MUI Popover that opens when a pencil edit icon is clicked. The main form shows a compact book display: small cover + title + author text + Change button + edit icon.

**Files:**
- Modify: `src/components/sessions/SessionForm.js` (replace book details panel with compact display + Popover)
- Modify: `src/__tests__/components/SessionForm.test.jsx` (update book detail tests to open popover first)

**Step 1: Update SessionForm imports**

Add `Popover` and `EditIcon` imports, remove unused `Chip` import:

```jsx
import {
  Box, Typography, TextField, Button, FormControl, InputLabel, Select, MenuItem,
  Paper, Alert, Snackbar, Popover, Chip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
```

Remove Grid import entirely (will be replaced by Box).

**Step 2: Add popover state**

Add after the existing state declarations:

```jsx
const [bookEditAnchor, setBookEditAnchor] = useState(null);
const bookEditOpen = Boolean(bookEditAnchor);
```

**Step 3: Replace the book details section in JSX**

Replace the entire `{/* Book and Location - Two Columns */}` Grid section (lines 416-589) with a compact book row. The book row shows:
- When no book selected: BookAutocomplete inline
- When book selected: compact display (cover + title + change/edit buttons) with BookAutocomplete hidden

Compact book display when book is selected:
```jsx
{selectedBookId ? (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
    <Box sx={{ flexShrink: 0 }}>
      <BookCover
        title={books.find(b => b.id === selectedBookId)?.title || ''}
        author={bookAuthor || null}
        width={40}
        height={60}
      />
    </Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="body1" sx={{ fontWeight: 600, color: '#4A4A4A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {books.find(b => b.id === selectedBookId)?.title}
      </Typography>
      {bookAuthor && (
        <Typography variant="body2" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          by {bookAuthor}
        </Typography>
      )}
    </Box>
    <Button
      size="small"
      variant="outlined"
      onClick={() => { handleBookChange(null); }}
      sx={{ borderRadius: 3, flexShrink: 0 }}
    >
      Change
    </Button>
    <IconButton
      size="small"
      onClick={(e) => setBookEditAnchor(e.currentTarget)}
      aria-label="Edit book details"
      sx={{ flexShrink: 0 }}
    >
      <EditIcon fontSize="small" />
    </IconButton>
  </Box>
) : (
  <BookAutocomplete
    value={books.find(book => book.id === selectedBookId) || null}
    onChange={handleBookChange}
    onBookCreated={handleBookChange}
    onBookCreationStart={handleBookCreationStart}
  />
)}
```

Book metadata Popover (add right after the compact display, inside the same parent Box):
```jsx
<Popover
  open={bookEditOpen}
  anchorEl={bookEditAnchor}
  onClose={() => setBookEditAnchor(null)}
  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
  slotProps={{ paper: { sx: { p: 3, borderRadius: 4, maxWidth: 400, width: '90vw' } } }}
>
  <Typography variant="subtitle2" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: '#4A4A4A' }}>
    Edit Book Details
  </Typography>
  {/* Same fields as before: Author, Reading Level, Age Range, Genres, Reset/Get Details/Update buttons */}
  {/* ... copy the fields from the old book details panel ... */}
</Popover>
```

**Step 4: Update book detail tests**

Tests that assert on book detail elements (`getByLabelText('Author')`, `getByRole('button', { name: /get details/i })`, etc.) need to:
1. First select a book (existing step)
2. Then click the edit icon button to open the popover
3. Then assert on the popover contents

Add a helper to the test file:
```jsx
const openBookEditPopover = async (user) => {
  const editButton = screen.getByRole('button', { name: /edit book details/i });
  await user.click(editButton);
};
```

Update each test in these describe blocks:
- `'Book Autocomplete'` — tests that check for `'Selected Book Details'` heading should instead check for compact display elements. The `'should populate book details fields'` test needs to open popover first.
- `'Get Book Details Button'` — all tests need `openBookEditPopover(user)` after selecting a book
- `'Update Book Button'` — all tests need `openBookEditPopover(user)` after selecting a book
- `'Reset Button'` — needs `openBookEditPopover(user)` after selecting a book
- `'Genre Selection'` — needs `openBookEditPopover(user)` after selecting a book
- `'Settings Integration'` — tests that click Get Details need `openBookEditPopover(user)` first

Update the `'should show book details panel when a book is selected'` test to check for the compact display instead:
```jsx
it('should show compact book display when a book is selected', async () => {
  // ... select book ...
  // Check compact display shows title and author
  expect(screen.getByText('The Cat in the Hat')).toBeInTheDocument();
  expect(screen.getByText(/by dr\. seuss/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /change/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /edit book details/i })).toBeInTheDocument();
});
```

**Step 5: Run tests**

Run: `npx vitest run src/__tests__/components/SessionForm.test.jsx`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/components/sessions/SessionForm.js src/__tests__/components/SessionForm.test.jsx
git commit -m "refactor: move book metadata editing into Popover behind edit icon"
```

---

### Task 4: Flatten SessionForm to single-column layout

Replace the Grid-based two-column layout with a single-column Box stack. Remove all Grid containers and items. Put student dropdown + StudentInfoCard on one row.

**Files:**
- Modify: `src/components/sessions/SessionForm.js` (replace Grid with Box layout)

**Step 1: Remove Grid import, replace layout**

Remove `Grid` from imports. Replace the entire `<form>` content with a single-column flow using Box with `display: 'flex', flexDirection: 'column', gap: 2.5`:

```jsx
<form onSubmit={handleSubmit}>
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
    {/* Row 1: Student + Info */}
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <FormControl sx={{ flex: 1, minWidth: 200 }}>
        {/* Student Select — same as current */}
      </FormControl>
      {selectedStudent && <StudentInfoCard student={selectedStudent} />}
    </Box>

    {/* Row 2: Book */}
    <Box>
      {/* Compact book display or BookAutocomplete (from Task 3) */}
    </Box>

    {/* Row 3: Location + Assessment (Task 5 will refine) */}
    {/* Row 4: Notes (Task 6 will refine) + Save */}

    {/* Save Button */}
    <Button type="submit" variant="contained" ...>
      Save Reading Session
    </Button>
  </Box>
</form>
```

**Step 2: Run tests**

Run: `npx vitest run src/__tests__/components/SessionForm.test.jsx`
Expected: All tests pass (behavioral tests don't depend on Grid structure).

**Step 3: Commit**

```bash
git add src/components/sessions/SessionForm.js
git commit -m "refactor: flatten SessionForm to single-column Box layout"
```

---

### Task 5: Convert location to ToggleButtonGroup and combine with assessment row

Replace the RadioGroup location selector with a compact MUI ToggleButtonGroup. Put location and assessment side-by-side on one row.

**Files:**
- Modify: `src/components/sessions/SessionForm.js` (location + assessment row)
- Modify: `src/__tests__/components/SessionForm.test.jsx` (update location tests)

**Step 1: Update imports**

Add `ToggleButton, ToggleButtonGroup` to MUI imports. Remove `RadioGroup, Radio, FormControlLabel, FormLabel` if no longer used.

**Step 2: Replace location JSX**

Replace the location FormControl/RadioGroup block with:

```jsx
<Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
  {/* Location Toggle */}
  <ToggleButtonGroup
    value={selectedLocation}
    exclusive
    onChange={(e, val) => { if (val !== null) setSelectedLocation(val); }}
    size="small"
    sx={{ flexShrink: 0 }}
  >
    <ToggleButton value="school" aria-label="School"
      sx={{ px: 2, borderRadius: '8px 0 0 8px', textTransform: 'none',
        '&.Mui-selected': { bgcolor: '#6B8E6B', color: '#fff', '&:hover': { bgcolor: '#5A7D5A' } }
      }}
    >
      School
    </ToggleButton>
    <ToggleButton value="home" aria-label="Home"
      sx={{ px: 2, borderRadius: '0 8px 8px 0', textTransform: 'none',
        '&.Mui-selected': { bgcolor: '#6B8E6B', color: '#fff', '&:hover': { bgcolor: '#5A7D5A' } }
      }}
    >
      Home
    </ToggleButton>
  </ToggleButtonGroup>

  {/* Assessment — horizontal, takes remaining space */}
  <Box sx={{ flex: 1, minWidth: 250 }}>
    <AssessmentSelector value={assessment} onChange={handleAssessmentChange} direction="row" />
  </Box>
</Box>
```

Remove `handleLocationChange` function — replaced by inline handler.

**Step 3: Update location tests**

The test `'should allow changing location to home'` currently uses `screen.getByLabelText('Home')` for a radio button. Update to use the ToggleButton:

```jsx
it('should allow changing location to home', async () => {
  const context = createMockContext();
  const user = userEvent.setup();
  render(<SessionForm />, { wrapper: createWrapper(context) });

  const homeButton = screen.getByRole('button', { name: /home/i });
  await user.click(homeButton);

  expect(homeButton).toHaveAttribute('aria-pressed', 'true');
});
```

Update the `'should render with school as default location'` test:
```jsx
it('should render with school as default location', async () => {
  const context = createMockContext();
  render(<SessionForm />, { wrapper: createWrapper(context) });

  const schoolButton = screen.getByRole('button', { name: /^school$/i });
  expect(schoolButton).toHaveAttribute('aria-pressed', 'true');
});
```

Update `'should include home location in submission'` test to click ToggleButton instead of radio:
```jsx
const homeButton = screen.getByRole('button', { name: /home/i });
await user.click(homeButton);
```

Update `'should render the form with all required elements'` — remove `expect(screen.getByText('Location'))` assertion (no longer a separate FormLabel), replace with check for toggle buttons.

**Step 4: Run tests**

Run: `npx vitest run src/__tests__/components/SessionForm.test.jsx`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/components/sessions/SessionForm.js src/__tests__/components/SessionForm.test.jsx
git commit -m "refactor: replace location radio with ToggleButtonGroup, combine with assessment row"
```

---

### Task 6: Convert notes to icon button + popover

Replace the prominent SessionNotes component with a small notes icon button that opens a Popover containing the text field. This keeps notes accessible but removes it from the main visual flow.

**Files:**
- Modify: `src/components/sessions/SessionForm.js` (replace SessionNotes with icon + popover)

**Step 1: Add notes popover state and icon**

Add state:
```jsx
const [notesAnchor, setNotesAnchor] = useState(null);
const notesOpen = Boolean(notesAnchor);
```

Replace the SessionNotes usage with:
```jsx
<Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
  <Tooltip title={notes ? `Notes: ${notes.substring(0, 40)}...` : 'Add notes'}>
    <IconButton
      onClick={(e) => setNotesAnchor(e.currentTarget)}
      aria-label="Add notes"
      sx={{
        color: notes ? '#6B8E6B' : 'text.secondary',
        border: notes ? '2px solid #6B8E6B' : '1px solid rgba(0,0,0,0.12)',
        borderRadius: 2,
        px: 1.5,
      }}
    >
      <NotesIcon fontSize="small" />
      {notes && (
        <Typography variant="caption" sx={{ ml: 0.5, fontWeight: 600, color: '#6B8E6B' }}>
          Notes
        </Typography>
      )}
    </IconButton>
  </Tooltip>

  {/* Save button can go here inline, or below */}
</Box>

<Popover
  open={notesOpen}
  anchorEl={notesAnchor}
  onClose={() => setNotesAnchor(null)}
  anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
  transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
  slotProps={{ paper: { sx: { p: 2, borderRadius: 4, width: 350, maxWidth: '90vw' } } }}
>
  <SessionNotes value={notes} onChange={handleNotesChange} defaultExpanded />
</Popover>
```

Add `NotesIcon` import:
```jsx
import NotesIcon from '@mui/icons-material/Notes';
import Tooltip from '@mui/material/Tooltip';
```

**Step 2: Update SessionNotes to accept defaultExpanded prop**

In `SessionNotes.js`, change the initial state:
```jsx
const [expanded, setExpanded] = useState(defaultExpanded || false);
```

And update the component signature:
```jsx
const SessionNotes = ({ value, onChange, defaultExpanded = false }) => {
```

**Step 3: Run tests**

Run: `npx vitest run src/__tests__/components/SessionForm.test.jsx`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add src/components/sessions/SessionForm.js src/components/sessions/SessionNotes.js
git commit -m "refactor: collapse notes behind icon button with popover"
```

---

### Task 7: Final layout polish and cleanup

Fine-tune spacing, ensure the notes icon sits on the same row as the save button or assessment row, remove any dead code, and verify the complete form fits on an iPad screen.

**Files:**
- Modify: `src/components/sessions/SessionForm.js` (final spacing/layout adjustments)
- Modify: `src/__tests__/components/SessionForm.test.jsx` (any remaining test fixes)

**Step 1: Arrange final layout**

The final form structure should be:

```jsx
<form onSubmit={handleSubmit}>
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
    {/* Row 1: Student dropdown + inline info chips */}
    {/* Row 2: Book (compact display or autocomplete) */}
    {/* Row 3: Location toggle + Assessment buttons */}
    {/* Row 4: Notes icon + Save button */}
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {/* Notes icon button */}
      {/* Save button — flex: 1, takes remaining space */}
      <Button type="submit" variant="contained" sx={{ flex: 1, height: 48, ... }}>
        Save Reading Session
      </Button>
    </Box>
  </Box>
</form>
```

**Step 2: Remove dead imports and code**

Check for and remove:
- Any unused imports (Grid, RadioGroup, Radio, FormControlLabel, FormLabel, Divider, Card, CardContent)
- `handleLocationChange` if not already removed
- `getBookInfo` helper if not already removed
- `recentSessions` state if not already removed
- Any commented-out code

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass across all files.

**Step 4: Visual verification**

Run: `npm start`
Check in browser at iPad resolution (768×1024):
- Entire form visible without scrolling
- Student dropdown + info chips on one line
- Book compact display shows correctly
- Book edit popover opens/closes properly
- Location toggle + assessment buttons fit on one row
- Notes icon opens popover correctly
- Save button is prominent and accessible

**Step 5: Commit**

```bash
git add src/components/sessions/SessionForm.js src/components/sessions/SessionNotes.js src/components/sessions/StudentInfoCard.js src/__tests__/components/SessionForm.test.jsx
git commit -m "feat: session form iPad-optimized single-column layout (v3.16.0)"
```
