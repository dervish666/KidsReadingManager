# Session Form Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the Record Reading Session form by moving the date to the header, adding a student context card, and pre-selecting the student's current book.

**Architecture:** Frontend-only changes. Student data already includes all needed fields (`readingLevelMin/Max`, `currentStreak`, `currentBookId`, `readingSessions`). Create a new `StudentInfoCard` component and modify `SessionForm` layout.

**Tech Stack:** React 19, MUI components, existing AppContext data

---

### Task 1: Create StudentInfoCard Component

**Files:**
- Create: `src/components/sessions/StudentInfoCard.js`
- Test: `src/__tests__/components/StudentInfoCard.test.jsx`

**Step 1: Write the failing test**

Create test file `src/__tests__/components/StudentInfoCard.test.jsx`:

```jsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StudentInfoCard from '../../components/sessions/StudentInfoCard';

describe('StudentInfoCard', () => {
  const mockStudent = {
    id: 'student-1',
    name: 'Alice',
    readingLevelMin: 12,
    readingLevelMax: 14,
    currentStreak: 5,
    readingSessions: [
      { id: 's1', date: '2026-01-30', bookId: 'b1', bookTitle: 'The BFG' },
      { id: 's2', date: '2026-01-28', bookId: 'b2', bookTitle: 'Charlotte\'s Web' },
      { id: 's3', date: '2026-01-25', bookId: 'b3', bookTitle: 'Matilda' },
    ]
  };

  it('displays reading level range', () => {
    render(<StudentInfoCard student={mockStudent} />);
    expect(screen.getByText(/Level 12-14/)).toBeInTheDocument();
  });

  it('displays current streak', () => {
    render(<StudentInfoCard student={mockStudent} />);
    expect(screen.getByText(/5 days/)).toBeInTheDocument();
  });

  it('displays last read date', () => {
    render(<StudentInfoCard student={mockStudent} />);
    expect(screen.getByText(/Last read:/)).toBeInTheDocument();
  });

  it('displays recent book titles', () => {
    render(<StudentInfoCard student={mockStudent} />);
    expect(screen.getByText('The BFG')).toBeInTheDocument();
    expect(screen.getByText("Charlotte's Web")).toBeInTheDocument();
  });

  it('shows empty state when no sessions', () => {
    const newStudent = { ...mockStudent, readingSessions: [], currentStreak: 0 };
    render(<StudentInfoCard student={newStudent} />);
    expect(screen.getByText(/No reading history/)).toBeInTheDocument();
  });

  it('handles missing reading level gracefully', () => {
    const studentNoLevel = { ...mockStudent, readingLevelMin: null, readingLevelMax: null };
    render(<StudentInfoCard student={studentNoLevel} />);
    expect(screen.queryByText(/Level/)).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/components/StudentInfoCard.test.jsx`
Expected: FAIL with "Cannot find module"

**Step 3: Write the component**

Create `src/components/sessions/StudentInfoCard.js`:

```jsx
import React from 'react';
import { Box, Typography } from '@mui/material';
import WhatshotIcon from '@mui/icons-material/Whatshot';

/**
 * Displays student context information: reading level, streak, last session, recent books
 */
const StudentInfoCard = ({ student }) => {
  if (!student) return null;

  const { readingLevelMin, readingLevelMax, currentStreak, readingSessions = [] } = student;

  // Derive last session date and recent books from sessions (already sorted DESC)
  const lastSession = readingSessions[0];
  const lastReadDate = lastSession?.date;
  const recentBooks = readingSessions
    .filter(s => s.bookTitle)
    .slice(0, 3)
    .map(s => s.bookTitle);

  // Format last read date as relative time
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

  // Format reading level range
  const formatLevel = () => {
    if (readingLevelMin == null && readingLevelMax == null) return null;
    if (readingLevelMin === readingLevelMax) return `Level ${readingLevelMin}`;
    if (readingLevelMin == null) return `Level ≤${readingLevelMax}`;
    if (readingLevelMax == null) return `Level ${readingLevelMin}+`;
    return `Level ${readingLevelMin}-${readingLevelMax}`;
  };

  const levelText = formatLevel();
  const lastReadText = formatLastRead(lastReadDate);
  const hasHistory = readingSessions.length > 0;

  // Empty state
  if (!hasHistory && !levelText) {
    return (
      <Box sx={{
        p: 2,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.5)',
        border: '1px solid rgba(255,255,255,0.6)',
        boxShadow: 'inset 2px 2px 4px rgba(139, 115, 85, 0.1), inset -2px -2px 4px rgba(255, 255, 255, 0.8)',
      }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          No reading history yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      p: 2,
      borderRadius: 4,
      backgroundColor: 'rgba(255,255,255,0.5)',
      border: '1px solid rgba(255,255,255,0.6)',
      boxShadow: 'inset 2px 2px 4px rgba(139, 115, 85, 0.1), inset -2px -2px 4px rgba(255, 255, 255, 0.8)',
    }}>
      {/* Line 1: Level and Streak */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {levelText && (
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#4A4A4A' }}>
            {levelText}
          </Typography>
        )}
        {levelText && currentStreak > 0 && (
          <Typography variant="body2" color="text.secondary">·</Typography>
        )}
        {currentStreak > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <WhatshotIcon sx={{ fontSize: 16, color: '#F59E0B' }} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#F59E0B' }}>
              {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Line 2: Last read date */}
      {lastReadText && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Last read: {lastReadText}
        </Typography>
      )}

      {/* Line 3+: Recent books */}
      {recentBooks.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Recent:
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2, mt: 0.5 }}>
            {recentBooks.map((title, idx) => (
              <Typography
                key={idx}
                component="li"
                variant="body2"
                sx={{ color: '#4A4A4A', fontSize: '0.85rem' }}
              >
                {title}
              </Typography>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default StudentInfoCard;
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/components/StudentInfoCard.test.jsx`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add src/components/sessions/StudentInfoCard.js src/__tests__/components/StudentInfoCard.test.jsx
git commit -m "feat: add StudentInfoCard component for session form context"
```

---

### Task 2: Update SessionForm Layout - Move Date to Header

**Files:**
- Modify: `src/components/sessions/SessionForm.js`

**Step 1: Modify the header to include date picker**

In `SessionForm.js`, replace lines 276-281 (the header Box) with:

```jsx
<Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
  <Typography variant="h4" component="h1" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#4A4A4A' }}>
    Record Reading Session
  </Typography>
  <TextField
    type="date"
    value={date}
    onChange={handleDateChange}
    size="small"
    InputProps={{
      sx: {
        borderRadius: 3,
        backgroundColor: '#EFEBF5',
        boxShadow: 'inset 2px 2px 4px #d9d4e3, inset -2px -2px 4px #ffffff',
        '& fieldset': { border: 'none' },
        '&.Mui-focused': { backgroundColor: '#ffffff', boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.2)' },
        minWidth: 150
      }
    }}
  />
</Box>
```

**Step 2: Remove the old Date field from the form grid**

Remove the entire Grid item for the date field (lines 362-384):

```jsx
{/* DELETE THIS ENTIRE BLOCK */}
<Grid size={{ xs: 12, sm: 6 }}>
  <TextField
    label="Date"
    type="date"
    ...
  />
</Grid>
```

**Step 3: Verify the app still renders**

Run: `npm start` (manual verification in browser)
Expected: Date picker appears in header row, form still functions

**Step 4: Run existing tests**

Run: `npx vitest run src/__tests__/components/SessionForm.test.jsx`
Expected: PASS (tests may need minor updates if they check for date label)

**Step 5: Commit**

```bash
git add src/components/sessions/SessionForm.js
git commit -m "refactor: move date picker to header in SessionForm"
```

---

### Task 3: Update SessionForm Layout - Two-Column with StudentInfoCard

**Files:**
- Modify: `src/components/sessions/SessionForm.js`

**Step 1: Add import for StudentInfoCard**

Add to imports at top of file:

```jsx
import StudentInfoCard from './StudentInfoCard';
```

**Step 2: Restructure the Student dropdown row to two-column layout**

Replace the student selection Grid (around lines 299-361 after previous changes) with:

```jsx
{/* Student Selection Row - Two Columns */}
<Grid container item size={12} spacing={3}>
  {/* Left column: Student dropdown */}
  <Grid size={{ xs: 12, md: 6 }}>
    <FormControl fullWidth>
      <InputLabel id="student-select-label" sx={{ fontFamily: '"DM Sans", sans-serif' }}>Student</InputLabel>
      <Select
        labelId="student-select-label"
        id="student-select"
        value={selectedStudentId}
        label="Student"
        onChange={handleStudentChange}
        sx={{
          borderRadius: 4,
          backgroundColor: '#EFEBF5',
          boxShadow: 'inset 4px 4px 8px #d9d4e3, inset -4px -4px 8px #ffffff',
          '& fieldset': { border: 'none' },
          '&.Mui-focused': { backgroundColor: '#ffffff', boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.2)' },
        }}
      >
        {sortedStudents.length === 0 ? (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              {globalClassFilter && globalClassFilter !== 'all' ? 'No students found in this class' : 'No active students available'}
            </Typography>
          </MenuItem>
        ) : (
          sortedStudents.map((student) => {
            const isRecentlyAccessed = recentlyAccessedStudents.includes(student.id);
            return (
              <MenuItem key={student.id} value={student.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  {isRecentlyAccessed && (
                    <StarIcon sx={{ mr: 1, color: '#F59E0B', fontSize: '1rem' }} />
                  )}
                  <Typography variant="inherit" sx={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 500 }}>
                    {student.name}
                  </Typography>
                  {isRecentlyAccessed && (
                    <Typography variant="caption" sx={{ ml: 'auto', color: '#7A7A7A', fontStyle: 'italic' }}>
                      Recent
                    </Typography>
                  )}
                </Box>
              </MenuItem>
            );
          })
        )}
      </Select>
    </FormControl>
  </Grid>

  {/* Right column: Student Info Card (only shown when student selected) */}
  <Grid size={{ xs: 12, md: 6 }}>
    {selectedStudent && (
      <StudentInfoCard student={selectedStudent} />
    )}
  </Grid>
</Grid>
```

**Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/components/sessions/SessionForm.js
git commit -m "feat: add StudentInfoCard to SessionForm in two-column layout"
```

---

### Task 4: Pre-select Student's Current Book

**Files:**
- Modify: `src/components/sessions/SessionForm.js`

**Step 1: Update handleStudentChange to pre-select current book**

Modify the `handleStudentChange` function:

```jsx
const handleStudentChange = (event) => {
  const studentId = event.target.value;
  setSelectedStudentId(studentId);
  setError('');

  // Pre-select the student's current book if they have one
  const student = students.find(s => s.id === studentId);
  if (student?.currentBookId) {
    const book = books.find(b => b.id === student.currentBookId);
    if (book) {
      handleBookChange(book);
    }
  } else {
    // Clear book selection if student has no current book
    handleBookChange(null);
  }
};
```

**Step 2: Add test for pre-selection behavior**

Add to `src/__tests__/components/SessionForm.test.jsx` (or create if doesn't exist):

```jsx
it('pre-selects student current book when student is selected', async () => {
  // This test verifies that when selecting a student with a currentBookId,
  // the book dropdown gets populated with that book
  const studentWithBook = {
    id: 'student-with-book',
    name: 'Test Student',
    currentBookId: 'book-1',
    readingSessions: []
  };
  const book = { id: 'book-1', title: 'Test Book' };

  // Mock context with student and book
  // ... render with context
  // ... select the student
  // ... verify book dropdown shows 'Test Book'
});
```

**Step 3: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 4: Manual verification**

Run: `npm start`
Expected: Selecting a student with a current book auto-fills the book dropdown

**Step 5: Commit**

```bash
git add src/components/sessions/SessionForm.js
git commit -m "feat: pre-select student's current book when student selected"
```

---

### Task 5: Final Cleanup and Polish

**Files:**
- Modify: `src/components/sessions/SessionForm.js` (if needed)

**Step 1: Verify responsive behavior**

Run app on mobile viewport:
- Date picker should wrap below title on narrow screens
- StudentInfoCard should stack below student dropdown on mobile
- All form elements remain usable

**Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass (1146+ tests)

**Step 3: Visual QA**

Manually test in browser:
- [ ] Date picker in header works
- [ ] StudentInfoCard shows correct data
- [ ] Book pre-selection works
- [ ] Empty states display correctly
- [ ] Mobile layout is usable

**Step 4: Final commit**

If any polish needed:
```bash
git add -A
git commit -m "fix: polish session form redesign"
```

---

## Summary

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | StudentInfoCard component | 2 | 0 |
| 2 | Move date to header | 0 | 1 |
| 3 | Two-column layout with card | 0 | 1 |
| 4 | Book pre-selection | 0 | 1 |
| 5 | Polish and QA | 0 | 0-1 |

**Total: 5 tasks, ~2 new files, 1 main file modified**
