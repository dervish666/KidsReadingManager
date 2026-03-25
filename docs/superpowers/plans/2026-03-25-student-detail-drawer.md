# Student Detail Drawer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-dialog student detail UX (StudentSessions + StudentProfile) with a unified slide-in drawer showing student details, preferences, and a session timeline.

**Architecture:** A right-anchored MUI Drawer orchestrates four sub-components: a header bar, a read-only sidebar, an edit form, and a session timeline. On mobile, the split layout collapses into tabs. The drawer fetches the full student record (including preferences and sessions) via `GET /api/students/:id` on open.

**Tech Stack:** React 19, Material-UI v7, Vitest + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-03-25-student-detail-drawer-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/components/students/StudentDetailDrawer.js` | Drawer shell: header bar, mode switching (read/edit), layout orchestration, data fetching |
| `src/components/students/StudentReadView.js` | Read-only sidebar: genres, likes, dislikes, stats cards |
| `src/components/students/StudentEditForm.js` | Edit form: name, class, reading level, genres, likes/dislikes, AI opt-out. Reusable by BookRecommendations. |
| `src/components/students/StudentTimeline.js` | Compact vertical session timeline with expand/collapse, edit/delete actions |
| `src/utils/calculateAge.js` | Shared utility: `calculateAge(dateOfBirth)` → number |
| `src/__tests__/unit/calculateAge.test.js` | Tests for age calculation utility |
| `src/__tests__/components/StudentTimeline.test.jsx` | Tests for timeline rendering, expand/collapse, empty/loading states |
| `src/__tests__/components/StudentDetailDrawer.test.jsx` | Tests for drawer orchestration, mode switching, data fetching |

### Modified Files

| File | Changes |
|------|---------|
| `src/components/students/StudentTable.js` | Remove Actions column + PsychologyIcon. Row click opens `StudentDetailDrawer` instead of `StudentSessions`. Remove `StudentSessions` and `StudentProfile` imports. |
| `src/components/students/StudentCard.js` | Remove PsychologyIcon button. Card click opens `StudentDetailDrawer` instead of `StudentSessions`. Remove `StudentSessions` and `StudentProfile` imports. |
| `src/components/BookRecommendations.js` | Replace `StudentProfile` import with `StudentEditForm` wrapped in a Dialog (preserves existing modal UX for editing preferences from the recommendations page). |

### Files to Remove (after integration)

| File | Reason |
|------|--------|
| `src/components/sessions/StudentSessions.js` | Fully replaced by `StudentDetailDrawer` + `StudentTimeline` |
| `src/components/students/StudentProfile.js` | Fully replaced by `StudentDetailDrawer` + `StudentEditForm` |

---

## Chunk 1: Foundation (utility + timeline component)

### Task 1: Create `calculateAge` utility

**Files:**
- Create: `src/utils/calculateAge.js`
- Create: `src/__tests__/unit/calculateAge.test.js`

- [ ] **Step 1: Write the test file**

```js
// src/__tests__/unit/calculateAge.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateAge } from '../../utils/calculateAge.js';

describe('calculateAge', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns age in years for a past date', () => {
    vi.setSystemTime(new Date('2026-03-25'));
    expect(calculateAge('2014-06-15')).toBe(11);
  });

  it('returns age correctly on birthday', () => {
    vi.setSystemTime(new Date('2026-03-25'));
    expect(calculateAge('2014-03-25')).toBe(12);
  });

  it('returns age correctly day before birthday', () => {
    vi.setSystemTime(new Date('2026-03-24'));
    expect(calculateAge('2014-03-25')).toBe(11);
  });

  it('returns null for null/undefined input', () => {
    expect(calculateAge(null)).toBeNull();
    expect(calculateAge(undefined)).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(calculateAge('not-a-date')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/calculateAge.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```js
// src/utils/calculateAge.js
/**
 * Calculate age in years from a date of birth string.
 * Returns null if dateOfBirth is falsy or invalid.
 */
export function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/calculateAge.test.js`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/calculateAge.js src/__tests__/unit/calculateAge.test.js
git commit -m "feat: add calculateAge utility for student demographics"
```

---

### Task 2: Create `StudentTimeline` component

**Files:**
- Create: `src/components/students/StudentTimeline.js`
- Create: `src/__tests__/components/StudentTimeline.test.jsx`
- Reference: `src/components/sessions/StudentSessions.js` (for session card structure, edit/delete dialogs)
- Reference: `src/components/sessions/AssessmentSelector.js` (reused in edit dialog)
- Reference: `src/components/sessions/BookAutocomplete.js` (reused in edit dialog)

- [ ] **Step 1: Write the test file**

```jsx
// src/__tests__/components/StudentTimeline.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StudentTimeline from '../../components/students/StudentTimeline';

// Mock AppContext
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => ({
    books: [
      { id: 'book-1', title: 'The Hobbit', author: 'J.R.R. Tolkien' },
      { id: 'book-2', title: 'Percy Jackson', author: 'Rick Riordan' },
    ],
    editReadingSession: vi.fn(),
    deleteReadingSession: vi.fn(),
  }),
}));

const mockSessions = [
  { id: 's1', date: '2026-03-24', bookId: 'book-1', assessment: 7, location: 'school', notes: 'Good session' },
  { id: 's2', date: '2026-03-22', bookId: 'book-2', assessment: 4, location: 'home', notes: '' },
  { id: 's3', date: '2026-03-18', bookId: 'book-1', assessment: 2, location: 'school', notes: 'Struggled' },
];

describe('StudentTimeline', () => {
  it('renders loading state', () => {
    render(<StudentTimeline sessions={[]} loading={true} studentId="s1" onSessionChange={vi.fn()} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders empty state when no sessions', () => {
    render(<StudentTimeline sessions={[]} loading={false} studentId="s1" onSessionChange={vi.fn()} />);
    expect(screen.getByText(/no reading sessions/i)).toBeInTheDocument();
  });

  it('renders session rows with date, book title, and assessment', () => {
    render(<StudentTimeline sessions={mockSessions} loading={false} studentId="s1" onSessionChange={vi.fn()} />);
    expect(screen.getByText('The Hobbit')).toBeInTheDocument();
    expect(screen.getByText('Percy Jackson')).toBeInTheDocument();
    expect(screen.getByText('7/10')).toBeInTheDocument();
    expect(screen.getByText('4/10')).toBeInTheDocument();
  });

  it('expands a session row on click to show details', () => {
    render(<StudentTimeline sessions={mockSessions} loading={false} studentId="s1" onSessionChange={vi.fn()} />);
    // Notes should not be visible initially
    expect(screen.queryByText('Good session')).not.toBeInTheDocument();
    // Click the first session row
    fireEvent.click(screen.getByText('The Hobbit'));
    // Notes should now be visible
    expect(screen.getByText('Good session')).toBeInTheDocument();
  });

  it('filters out absent/no_record sessions', () => {
    const sessionsWithAbsent = [
      ...mockSessions,
      { id: 's4', date: '2026-03-20', bookId: null, assessment: null, notes: '[ABSENT]', location: null },
    ];
    render(<StudentTimeline sessions={sessionsWithAbsent} loading={false} studentId="s1" onSessionChange={vi.fn()} />);
    // Should render 3 sessions, not 4
    expect(screen.getAllByText(/\/10/)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/StudentTimeline.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the `StudentTimeline` component**

Build `src/components/students/StudentTimeline.js` with:
- Props: `sessions`, `loading`, `studentId`, `onSessionChange`
- Filter out absent/no-record entries, sort newest first
- Render vertical timeline with dot markers (green for recent 7 days, beige for older)
- Each row: date (short format), book title (from `books` via AppContext), assessment pill (green/amber/red)
- Click to expand: shows location, notes, edit and delete `IconButton`s
- Edit click opens a `Dialog` with: date field, `BookAutocomplete`, location radio, `AssessmentSelector`, notes field — same fields as current `StudentSessions` edit dialog
- Delete click opens a confirmation `Dialog`
- On successful edit/delete, call `onSessionChange()` so the parent can refresh
- Loading state: centred `CircularProgress`
- Empty state: "No reading sessions recorded yet"
- Keyboard accessible: session rows focusable with `tabIndex={0}`, expandable via Enter/Space, expanded rows have `aria-expanded`

Reference `src/components/sessions/StudentSessions.js` lines 386-466 for the session card layout and lines 468-560 for the edit/delete dialog structure. Port the logic, adapting the layout from cards to compact timeline rows.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/StudentTimeline.test.jsx`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/students/StudentTimeline.js src/__tests__/components/StudentTimeline.test.jsx
git commit -m "feat: add StudentTimeline component with expand/collapse and edit/delete"
```

---

### Task 3: Create `StudentReadView` component

**Files:**
- Create: `src/components/students/StudentReadView.js`
- Reference: `src/components/students/StudentProfile.js` lines 436-541 (reading preferences tab, for genre/likes/dislikes display)

- [ ] **Step 1: Write the component**

Build `src/components/students/StudentReadView.js` with:
- Props: `student` (full student record with `preferences`), `sessions` (for stats)
- Four stacked cards, each in a `Box` with `bgcolor: '#fafaf7'`, `border: '1px solid'`, `borderColor: 'divider'`, `borderRadius: '8px'`, `p: 2`:
  1. **Genres** — label "Favourite Genres", render `Chip` for each genre name (look up from `genres` via AppContext). Show "None set" `Typography` in muted text if empty.
  2. **Likes** — label "Likes", render `Chip` for each item in `student.preferences.likes`. "None set" if empty.
  3. **Dislikes** — label "Dislikes", same pattern. "None set" if empty.
  4. **Stats** — Total sessions: `sessions.length`. Last read: formatted date from `student.lastReadDate`. Best streak: `student.longestStreak` days.
- If `!student.preferences` or all preference arrays are empty AND no stats to show, render a single friendly empty state: `Typography` "No reading preferences yet" with a muted subtext "Use the Edit button to set reading preferences."
- No interactivity — purely presentational

- [ ] **Step 2: Verify it renders without errors**

Run: `npm test -- --run` (full suite, ensure no regressions)
Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/students/StudentReadView.js
git commit -m "feat: add StudentReadView component for read-only preferences sidebar"
```

---

### Task 4: Create `StudentEditForm` component

**Files:**
- Create: `src/components/students/StudentEditForm.js`
- Reference: `src/components/students/StudentProfile.js` (entire file — this extracts the form logic)

- [ ] **Step 1: Write the component**

Build `src/components/students/StudentEditForm.js` with:
- Props: `student`, `onSave`, `onCancel`, `saving`
- Extracts the form logic from `StudentProfile.js`:
  - State: `name`, `classId`, `readingLevelMin`, `readingLevelMax`, `selectedGenres`, `likes`, `dislikes`, `aiOptOut`
  - Initialize from `student` prop on mount and when `student` changes
  - Name `TextField` (required, validation)
  - Class `Select` dropdown (from `classes` via AppContext)
  - `ReadingLevelRangeInput` component
  - Genre multi-select with "Add New Genre" button and inline add dialog
  - Likes/Dislikes: `BookAutocomplete` to add, `Chip` with `onDelete` to remove. Pass `priorityBookIds` from student's sessions (fetch via `student.readingSessions`).
  - AI Opt-Out `Switch` toggle with status box styling (green enabled / red disabled)
  - Does NOT include Save/Cancel buttons — those live in the parent `StudentDetailDrawer` header. Instead, exposes form data via `onSave(formData)` callback.
- On `onCancel`: reset all state to the student's original values
- Export a `ref`-based API or use callback pattern so the parent can trigger save. Simplest: pass `onSave` which the parent calls, and the form validates + returns the data.

Actually, simpler approach: the form calls `onSave(formData)` when the parent's Save button is clicked. Use a ref forwarded to the form that exposes `getFormData()` and `validate()` methods, OR simply lift save logic into the parent. Follow whichever pattern is simpler — the key is that Save/Cancel buttons are in the drawer header, not in this component.

Recommended pattern: `StudentEditForm` manages its own state internally. Parent passes `onSave(data)` and `onCancel()`. The form has a `handleSave` that validates, builds the data object, and calls `onSave(data)`. Parent renders a Save button that fires `formRef.current.save()`. Use `useImperativeHandle` with `forwardRef`:

```js
const StudentEditForm = forwardRef(({ student, onSave, onCancel }, ref) => {
  // ... state ...
  useImperativeHandle(ref, () => ({
    save: () => { /* validate, call onSave(data) */ },
    cancel: () => { /* reset state, call onCancel() */ },
  }));
  // ... render form fields ...
});
```

Reference `src/components/students/StudentProfile.js` lines 56-165 for state management and lines 304-431 for the form fields. Port the genre handling (lines 205-253) and like/dislike handling (lines 209-233).

- [ ] **Step 2: Verify it renders without errors**

Run: `npm test -- --run`
Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/students/StudentEditForm.js
git commit -m "feat: add StudentEditForm component extracted from StudentProfile"
```

---

## Chunk 2: Drawer shell + integration

### Task 5: Create `StudentDetailDrawer` component

**Files:**
- Create: `src/components/students/StudentDetailDrawer.js`
- Create: `src/__tests__/components/StudentDetailDrawer.test.jsx`
- Reference: `src/components/schools/SchoolDrawer.js` (drawer pattern)
- Reference: `src/utils/calculateAge.js` (age chips)

- [ ] **Step 1: Write the test file**

```jsx
// src/__tests__/components/StudentDetailDrawer.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import StudentDetailDrawer from '../../components/students/StudentDetailDrawer';

// Mock AppContext
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => ({
    classes: [{ id: 'c1', name: '8A/Gg' }],
    genres: [{ id: 'g1', name: 'Fantasy' }],
    books: [],
    fetchWithAuth: vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 's1',
        name: 'Aaron Orange',
        classId: 'c1',
        dateOfBirth: '2014-06-15',
        gender: 'MALE',
        firstLanguage: 'English',
        ealDetailedStatus: 'Not applicable',
        currentStreak: 5,
        longestStreak: 12,
        lastReadDate: '2026-03-24',
        readingLevelMin: 3.2,
        readingLevelMax: 5.8,
        totalSessionCount: 14,
        preferences: { favoriteGenreIds: ['g1'], likes: ['The Hobbit'], dislikes: [] },
        readingSessions: [
          { id: 'sess1', date: '2026-03-24', bookId: 'b1', assessment: 7, location: 'school', notes: '' },
        ],
      }),
    }),
    updateStudent: vi.fn(),
    editReadingSession: vi.fn(),
    deleteReadingSession: vi.fn(),
  }),
}));

const mockStudent = {
  id: 's1',
  name: 'Aaron Orange',
  classId: 'c1',
  currentStreak: 5,
  dateOfBirth: '2014-06-15',
  gender: 'MALE',
};

describe('StudentDetailDrawer', () => {
  it('renders student name in header when open', async () => {
    render(<StudentDetailDrawer open={true} student={mockStudent} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Aaron Orange')).toBeInTheDocument();
    });
  });

  it('renders demographic chips', async () => {
    render(<StudentDetailDrawer open={true} student={mockStudent} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/years/)).toBeInTheDocument();
      expect(screen.getByText(/Male/)).toBeInTheDocument();
    });
  });

  it('does not render when closed', () => {
    render(<StudentDetailDrawer open={false} student={mockStudent} onClose={vi.fn()} />);
    expect(screen.queryByText('Aaron Orange')).not.toBeInTheDocument();
  });

  it('fetches full student data on open', async () => {
    const { useAppContext } = await import('../../contexts/AppContext');
    render(<StudentDetailDrawer open={true} student={mockStudent} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(useAppContext().fetchWithAuth).toHaveBeenCalledWith('/api/students/s1');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/StudentDetailDrawer.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the `StudentDetailDrawer` component**

Build `src/components/students/StudentDetailDrawer.js` with:

**Props:** `open`, `student` (from AppContext list — used as initial/fallback), `onClose`

**State:**
- `fullStudent` — fetched via `GET /api/students/:id` (includes preferences + sessions)
- `loading` — true while fetching
- `mode` — `'read'` or `'edit'`
- `saving` — true while saving edits
- `mobileTab` — `0` (Details) or `1` (Sessions), for mobile view

**State** also includes:
- `error` — error message if fetch fails, displayed as an `Alert` in the content area

**Data fetching:**
- On open (when `open` transitions to `true` and `student?.id` exists), fetch `GET /api/students/:id` via `fetchWithAuth`. Set `fullStudent` from response, `loading` to false.
- Use an `AbortController` in the fetch effect. On cleanup (drawer close or student change), abort the in-flight request to prevent stale data or state updates on unmounted components.
- If fetch fails, set `error` state and show an `Alert severity="error"` in the content area: "Could not load student details. Please close and try again."
- Extract `sessions` from `fullStudent.readingSessions` (or `[]`)
- `onSessionChange` callback: re-fetch `GET /api/students/:id/sessions`, update sessions in local state
- Reset `fullStudent`, `loading`, `error`, `mode` when the drawer closes

**Layout (desktop, `md` and up):**
```
┌─────────────────────────────────────────────┐
│ Header Bar (full width)                     │
│  Name  Class  StreakBadge        [Edit] [X] │
│  [age] [gender] [level] [lang] [eal]       │
├──────────────┬──────────────────────────────┤
│ Sidebar 30%  │  Timeline 70%               │
│ (ReadView    │  (StudentTimeline)           │
│  or EditForm)│                              │
└──────────────┴──────────────────────────────┘
```

**Layout (mobile, below `md`):**
- Full-screen drawer
- Tabs at top: "Details" | "Sessions"
- Details tab: header info stacked + `StudentReadView` (or `StudentEditForm` in edit mode)
- Sessions tab: `StudentTimeline` full width

**Header bar:**
- `Typography variant="h6"` for student name
- Class name `Chip` (look up from `classes` via AppContext)
- `StreakBadge` if `currentStreak > 0`
- If `processingRestricted`: red "Restricted" `Chip` (bg `#FDE8E8`, color `#C53030`), hide Edit button
- Second row: demographic chips using `calculateAge()` for age. Only render chips where data exists. Chip colours per spec palette.
- Right: Edit button (`variant="outlined"`) or Save + Cancel when in edit mode. Close `IconButton`.

**Edit mode:**
- Toggle `mode` to `'edit'` when Edit clicked
- Left sidebar switches from `StudentReadView` to `StudentEditForm` (via ref)
- Save: call `formRef.current.save()` → gets form data → call `updateStudent()` from AppContext → call `fetchWithAuth PUT /api/students/:id` for AI opt-out if changed → set `mode` back to `'read'` → refresh `fullStudent`
- Cancel: call `formRef.current.cancel()` → set `mode` back to `'read'`

**Drawer props:**
```js
<Drawer
  anchor="right"
  variant="temporary"
  open={open}
  onClose={onClose}
  PaperProps={{
    sx: { width: { xs: '100%', sm: '100%', md: 800, lg: 900 } }
  }}
>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/StudentDetailDrawer.test.jsx`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/students/StudentDetailDrawer.js src/__tests__/components/StudentDetailDrawer.test.jsx
git commit -m "feat: add StudentDetailDrawer with header, sidebar, and timeline"
```

---

### Task 6: Integrate drawer into `StudentTable`

**Files:**
- Modify: `src/components/students/StudentTable.js`
- Modify: `src/__tests__/components/StudentTable.test.jsx`

- [ ] **Step 1: Update imports**

In `src/components/students/StudentTable.js`:
- Remove: `import StudentSessions from '../sessions/StudentSessions';`
- Remove: `import StudentProfile from './StudentProfile';`
- Remove: `import PsychologyIcon from '@mui/icons-material/Psychology';`
- Add: `import StudentDetailDrawer from './StudentDetailDrawer';`

- [ ] **Step 2: Remove old state and handlers, add drawer state**

Remove:
- `openSessionsDialog` state and setter
- `openPreferencesDialog` state and setter
- `handlePreferencesClick` function

Replace with single drawer state:
```js
const [drawerOpen, setDrawerOpen] = useState(false);

const handleRowClick = (student) => {
  setSelectedStudent(student);
  setDrawerOpen(true);
};
```

- [ ] **Step 3: Remove the Actions column from the table**

Remove the `<TableCell>Actions</TableCell>` header (the one with `width: 80`).
Remove the `<TableCell>` containing the `PsychologyIcon` `IconButton` from each row.
The "mark as reading today" book icon stays (it's in the Student name cell). The `Snackbar` at the bottom stays too.

- [ ] **Step 4: Replace dialogs with drawer**

Remove the `<StudentSessions>` and `<StudentProfile>` components at the bottom of the JSX.

Replace with:
```jsx
<StudentDetailDrawer
  open={drawerOpen}
  student={selectedStudent}
  onClose={() => {
    setDrawerOpen(false);
    setSelectedStudent(null);
  }}
/>
```

- [ ] **Step 5: Update existing tests**

In `src/__tests__/components/StudentTable.test.jsx`:

Replace the `StudentSessions` mock (lines 16-25) and `StudentProfile` mock (lines 27-36) with a single `StudentDetailDrawer` mock:
```jsx
vi.mock('../../components/students/StudentDetailDrawer', () => ({
  default: ({ open, onClose, student }) => (
    open ? (
      <div data-testid="student-detail-drawer" role="dialog">
        <span data-testid="drawer-student-name">{student?.name}</span>
        <button onClick={onClose}>Close Drawer</button>
      </div>
    ) : null
  )
}));
```

Update the affected test sections:
- **"Initial Render"**: Remove `expect(screen.getByText('Actions'))` assertion (line 166). Update column header count assertions.
- **"Student Row Click"** section: Change assertions from `student-sessions-dialog` to `student-detail-drawer`, and from `sessions-student-name` to `drawer-student-name`. Update close button text to `'Close Drawer'`.
- **"Student Profile Button"** section: Delete this entire `describe` block — the profile button no longer exists.
- **"Mark as Reading Today"** section: Change `student-sessions-dialog` reference to `student-detail-drawer` in the "should not open sessions dialog" test.
- **"Accessibility - ARIA Labels on Icon Buttons"**: Remove the 3 tests that check for `view profile for` aria labels (lines 631-641). Keep the "mark as reading today" button tests.
- **"Table Structure"**: Update comment about 5 columns to 4, adjust `columnHeaders` count assertion.

- [ ] **Step 6: Run tests and verify**

Run: `npm test -- --run`
Expected: All tests pass including updated `StudentTable.test.jsx`

- [ ] **Step 7: Commit**

```bash
git add src/components/students/StudentTable.js src/__tests__/components/StudentTable.test.jsx
git commit -m "feat: replace session/profile dialogs with StudentDetailDrawer in table"
```

---

### Task 7: Integrate drawer into `StudentCard`

**Files:**
- Modify: `src/components/students/StudentCard.js`

- [ ] **Step 1: Update imports and state**

In `src/components/students/StudentCard.js`:
- Remove: `import StudentSessions from '../sessions/StudentSessions';`
- Remove: `import StudentProfile from './StudentProfile';`
- Remove: `import PsychologyIcon from '@mui/icons-material/Psychology';`
- Add: `import StudentDetailDrawer from './StudentDetailDrawer';`
- Replace `openSessionsDialog` and `openPreferencesDialog` state with single `drawerOpen` state

- [ ] **Step 2: Remove PsychologyIcon button from card action**

In the `CardHeader action` prop, remove the `<Tooltip title="Student Profile"><IconButton>` block. Keep the `StreakBadge` and status dot.

- [ ] **Step 3: Update click handler and replace dialogs**

Change `CardActionArea onClick` to set `drawerOpen(true)`.

Replace `<StudentSessions>` and `<StudentProfile>` at the bottom with:
```jsx
<StudentDetailDrawer
  open={drawerOpen}
  student={student}
  onClose={() => setDrawerOpen(false)}
/>
```

- [ ] **Step 4: Run tests and verify**

Run: `npm test -- --run`
Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/students/StudentCard.js
git commit -m "feat: replace session/profile dialogs with StudentDetailDrawer in card"
```

---

### Task 8: Update `BookRecommendations` to use `StudentEditForm`

**Files:**
- Modify: `src/components/BookRecommendations.js`
- Modify: `src/__tests__/components/BookRecommendations.test.jsx`

- [ ] **Step 1: Replace StudentProfile import and add new imports**

In `src/components/BookRecommendations.js`:

Replace:
```js
import StudentProfile from './students/StudentProfile';
```
With:
```js
import StudentEditForm from './students/StudentEditForm';
```

Add to MUI imports (check which are already imported, only add missing):
- `Dialog`, `DialogTitle`, `DialogContent`, `DialogActions` from `@mui/material`
- `Close as CloseIcon` from `@mui/icons-material`
- `useRef` from `react`
- `useMediaQuery` from `@mui/material/useMediaQuery`
- `useTheme` from `@mui/material/styles`

Add `updateStudent` to the `useAppContext()` destructure.

Add near the top of the component:
```js
const theme = useTheme();
const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
const editFormRef = useRef(null);
```

Note: `triggerLibrarySearch` is a local function already defined in `BookRecommendations.js`, not an import. The `studentProfile` state variable (lowercase) is unrelated — it stores AI profile data, not the component being replaced.

- [ ] **Step 2: Replace the StudentProfile usage (around line 891)**

The current code renders `<StudentProfile open={preferencesOpen} onClose={...} student={selectedStudent} />`.

Replace with a `Dialog` wrapping `StudentEditForm`:
```jsx
<Dialog
  open={preferencesOpen}
  onClose={() => setPreferencesOpen(false)}
  fullWidth
  maxWidth="md"
  fullScreen={fullScreen}
>
  <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <Typography variant="h6">{selectedStudent?.name} — Reading Preferences</Typography>
    <IconButton onClick={() => setPreferencesOpen(false)}><CloseIcon /></IconButton>
  </DialogTitle>
  <DialogContent dividers>
    <StudentEditForm
      ref={editFormRef}
      student={selectedStudent}
      onSave={async (data) => {
        await updateStudent(selectedStudent.id, data);
        setPreferencesOpen(false);
        if (selectedStudentId) {
          await triggerLibrarySearch(selectedStudentId);
        }
      }}
      onCancel={() => setPreferencesOpen(false)}
    />
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setPreferencesOpen(false)}>Cancel</Button>
    <Button onClick={() => editFormRef.current?.save()} variant="contained">Save</Button>
  </DialogActions>
</Dialog>
```

- [ ] **Step 3: Update existing tests**

In `src/__tests__/components/BookRecommendations.test.jsx`:

Replace the `StudentProfile` mock (lines 15-24) with a `StudentEditForm` mock:
```jsx
vi.mock('../../components/students/StudentEditForm', () => ({
  default: React.forwardRef(({ student, onSave, onCancel }, ref) => (
    <div data-testid="student-edit-form">
      <span>Edit Form: {student?.name}</span>
    </div>
  ))
}));
```

Search for any assertions referencing `student-profile-modal` test ID and update to match the new Dialog structure (look for the dialog role or the `student-edit-form` test ID instead).

- [ ] **Step 4: Run tests and verify**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/BookRecommendations.js src/__tests__/components/BookRecommendations.test.jsx
git commit -m "feat: replace StudentProfile with StudentEditForm in BookRecommendations"
```

---

## Chunk 3: Cleanup + manual testing

### Task 9: Remove old components

**Files:**
- Remove: `src/components/sessions/StudentSessions.js`
- Remove: `src/components/students/StudentProfile.js`

- [ ] **Step 1: Verify no remaining imports**

Run: `grep -r "StudentSessions\|StudentProfile" src/ --include="*.js" --include="*.jsx" -l`

Expected: Only the two files being deleted should appear. Test files should have been updated in Tasks 6 and 8. If any other files reference these components, fix them first.

- [ ] **Step 2: Delete the files**

```bash
rm src/components/sessions/StudentSessions.js
rm src/components/students/StudentProfile.js
```

- [ ] **Step 3: Run full test suite**

Run: `npm test -- --run`
Expected: All tests pass. If any tests import the removed components, delete or update those tests.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove StudentSessions and StudentProfile (replaced by drawer)"
```

---

### Task 10: Manual testing checklist

- [ ] **Step 1: Start dev server**

Run: `npm run start:dev`

- [ ] **Step 2: Test student table flow**

1. Navigate to Students page
2. Verify Actions column is gone from the table
3. Click a student row → drawer slides in from right
4. Verify header shows: name, class chip, streak badge (if any), demographic chips
5. Verify left sidebar shows: genres, likes, dislikes, stats
6. Verify right panel shows: session timeline with dates, book titles, assessment pills
7. Click a session row → verify it expands to show location, notes, edit/delete buttons
8. Click Edit in session → verify edit dialog opens over drawer
9. Close drawer → verify it slides out and focus returns to the table

- [ ] **Step 3: Test edit mode**

1. Open drawer for a student
2. Click Edit button in header
3. Verify left sidebar switches to edit form (name, class, reading level, genres, likes, dislikes, AI toggle)
4. Verify timeline stays visible on the right
5. Make a change, click Save → verify it saves and returns to read-only view
6. Click Edit, make a change, click Cancel → verify changes are discarded

- [ ] **Step 4: Test mobile view**

1. Resize browser to < 900px width (or use device emulation)
2. Click a student → verify full-screen drawer with tabs
3. Verify "Details" tab shows header info + preferences
4. Verify "Sessions" tab shows full-width timeline
5. Verify Edit mode works in tabbed layout

- [ ] **Step 5: Test edge cases**

1. Open drawer for a student with no sessions → verify empty state
2. Open drawer for a student with no preferences → verify "No reading preferences yet" message
3. Open drawer for a student with `processingRestricted` → verify "Restricted" chip and no Edit button
4. Test BookRecommendations page → verify editing preferences still works via the dialog

- [ ] **Step 6: Build check**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 7: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
