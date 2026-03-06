# Unified Reading Register Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate the two-table Home Reading page (register + history) into a single unified table with multi-day columns, keeping all recording and history functionality.

**Architecture:** Replace the single-day register table and separate ClassReadingHistoryTable with one unified table. The table shows date range columns (default: this week) with the selected date highlighted. Date range presets, daily totals footer, and all recording interactions (select student, status buttons, clear entry) are preserved. Drag-and-drop reordering is removed entirely.

**Tech Stack:** React 19, Material-UI v7, Vitest

---

### Task 1: Remove drag-and-drop from HomeReadingRegister

Remove all @dnd-kit code, the SortableStudentRow component, and localStorage student ordering. Replace with a simple TableRow.

**Files:**
- Modify: `src/components/sessions/HomeReadingRegister.js`

**Step 1: Remove imports and DnD-related code**

Remove these imports (lines 29-53):
```js
// DELETE these imports:
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

Also remove these unused icon imports that only the old register table used:
```js
// DELETE:
import RemoveIcon from '@mui/icons-material/Remove';
import PersonOffIcon from '@mui/icons-material/PersonOff';
```

**Step 2: Delete the SortableStudentRow component**

Delete the entire `SortableStudentRow` component (lines 91-206).

**Step 3: Delete DnD state and helpers**

Delete from the component body:
- `STUDENT_ORDER_KEY` constant (line 69)
- `loadStudentOrder` function (lines 72-79)
- `saveStudentOrder` function (lines 82-88)
- `studentOrderMap` state and `setStudentOrderMap` (line 261)
- `sensors` useSensors hook (lines 268-277)
- `handleDragEnd` callback (lines 345-366)
- `handleResetOrder` callback (lines 369-379)

**Step 4: Simplify classStudents to remove custom ordering**

Replace the `classStudents` useMemo (lines 313-335) with:
```js
const classStudents = useMemo(() => {
  if (!effectiveClassId) return [];
  return students
    .filter(s => s.classId === effectiveClassId)
    .sort((a, b) => a.name.localeCompare(b.name));
}, [students, effectiveClassId]);
```

**Step 5: Remove DnD wrapper from table body**

In the JSX, remove the `DndContext`, `SortableContext` wrappers and the "Reset Order" button (lines 909-922, 941-983). The `<TableBody>` should directly contain the student rows.

**Step 6: Run tests to see what breaks**

Run: `npx vitest run src/__tests__/components/HomeReadingRegister.test.jsx`

Expected: Tests referencing `SortableStudentRow`, drag-and-drop, `localStorage` order, and "Reset Order" will fail. Tests for ClassReadingHistoryTable mock will still pass. The "Current Book" column header test and book display tests will still pass (we remove that column in Task 3).

**Step 7: Commit**

```bash
git add src/components/sessions/HomeReadingRegister.js
git commit -m "refactor: remove drag-and-drop reordering from HomeReadingRegister"
```

---

### Task 2: Add date range state and controls to HomeReadingRegister

Absorb the date range presets and date generation logic from ClassReadingHistoryTable into HomeReadingRegister.

**Files:**
- Modify: `src/components/sessions/HomeReadingRegister.js`

**Step 1: Add date range imports and helpers**

Add `FormControl`, `InputLabel`, `Select`, `MenuItem` to the MUI imports.

Add these helper functions (copy from `ClassReadingHistoryTable.js` lines 32-106, but keep the existing `getYesterday`, `formatDateDisplay`, `getWeekInfo` helpers that HomeReadingRegister already has):

```js
const DATE_PRESETS = {
  THIS_WEEK: 'this_week',
  LAST_WEEK: 'last_week',
  LAST_MONTH: 'last_month',
  CUSTOM: 'custom'
};

const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEndOfWeek = (date) => {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

const getStartOfMonth = (date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEndOfMonth = (date) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
};

const formatDateISO = (date) => {
  return date.toISOString().split('T')[0];
};

const formatDateHeader = (date) => {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    day: dayNames[date.getDay()],
    date: date.getDate()
  };
};

const getDateRange = (start, end) => {
  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};
```

**Step 2: Add date range state**

Add to the component state:
```js
const [datePreset, setDatePreset] = useState(DATE_PRESETS.THIS_WEEK);
const [customStartDate, setCustomStartDate] = useState('');
const [customEndDate, setCustomEndDate] = useState('');
```

**Step 3: Add date range useMemos**

Add these (copied from ClassReadingHistoryTable lines 118-159):
```js
const { startDate, endDate } = useMemo(() => {
  const today = new Date();
  switch (datePreset) {
    case DATE_PRESETS.THIS_WEEK:
      return { startDate: getStartOfWeek(today), endDate: getEndOfWeek(today) };
    case DATE_PRESETS.LAST_WEEK: {
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      return { startDate: getStartOfWeek(lastWeek), endDate: getEndOfWeek(lastWeek) };
    }
    case DATE_PRESETS.LAST_MONTH: {
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      return { startDate: getStartOfMonth(lastMonth), endDate: getEndOfMonth(lastMonth) };
    }
    case DATE_PRESETS.CUSTOM:
      return {
        startDate: customStartDate ? new Date(customStartDate) : getStartOfWeek(today),
        endDate: customEndDate ? new Date(customEndDate) : getEndOfWeek(today)
      };
    default:
      return { startDate: getStartOfWeek(today), endDate: getEndOfWeek(today) };
  }
}, [datePreset, customStartDate, customEndDate]);

const dates = useMemo(() => getDateRange(startDate, endDate), [startDate, endDate]);
```

**Step 4: Add date preset controls to the Right Column**

Replace the right-column Paper content (currently: date picker, search, date chip) with:
```jsx
<Paper sx={{ p: 2, flex: isMobile ? 'none' : 1 }}>
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
    {/* Date Picker */}
    <TextField
      label="Date"
      type="date"
      value={selectedDate}
      onChange={(e) => setSelectedDate(e.target.value)}
      InputLabelProps={{ shrink: true }}
      fullWidth
      inputProps={{ 'aria-label': 'Select date for reading session' }}
    />

    {/* Date Range Preset */}
    <FormControl size="small" fullWidth>
      <InputLabel id="date-preset-label">Date Range</InputLabel>
      <Select
        labelId="date-preset-label"
        value={datePreset}
        label="Date Range"
        onChange={(e) => {
          const newPreset = e.target.value;
          setDatePreset(newPreset);
          if (newPreset === DATE_PRESETS.CUSTOM) {
            const today = new Date();
            setCustomStartDate(formatDateISO(getStartOfWeek(today)));
            setCustomEndDate(formatDateISO(getEndOfWeek(today)));
          }
        }}
      >
        <MenuItem value={DATE_PRESETS.THIS_WEEK}>This Week</MenuItem>
        <MenuItem value={DATE_PRESETS.LAST_WEEK}>Last Week</MenuItem>
        <MenuItem value={DATE_PRESETS.LAST_MONTH}>Last Month</MenuItem>
        <MenuItem value={DATE_PRESETS.CUSTOM}>Custom</MenuItem>
      </Select>
    </FormControl>

    {datePreset === DATE_PRESETS.CUSTOM && (
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          label="Start"
          type="date"
          value={customStartDate}
          onChange={(e) => setCustomStartDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          size="small"
          sx={{ flex: 1 }}
        />
        <TextField
          label="End"
          type="date"
          value={customEndDate}
          onChange={(e) => setCustomEndDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          size="small"
          sx={{ flex: 1 }}
        />
      </Box>
    )}

    {/* Search */}
    <TextField
      placeholder="Search student..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      fullWidth
      inputProps={{ 'aria-label': 'Search for a student by name' }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon fontSize="small" />
          </InputAdornment>
        )
      }}
    />
  </Box>
</Paper>
```

**Step 5: Commit**

```bash
git add src/components/sessions/HomeReadingRegister.js
git commit -m "feat: add date range presets to HomeReadingRegister"
```

---

### Task 3: Replace the register table with the unified multi-day table

Replace the single-day status column table with multi-day date columns. Remove the Current Book column. Add clickable date headers. Keep Clear column and student selection.

**Files:**
- Modify: `src/components/sessions/HomeReadingRegister.js`

**Step 1: Add a getStudentTotalInRange helper**

Add this function inside the component (similar to ClassReadingHistoryTable line 216-228):
```js
const getStudentTotalInRange = useCallback((student) => {
  let total = 0;
  dates.forEach(date => {
    const dateStr = formatDateISO(date);
    const { status, count } = getStudentReadingStatus(student, dateStr);
    if (status === READING_STATUS.READ) {
      total += 1;
    } else if (status === READING_STATUS.MULTIPLE) {
      total += count;
    }
  });
  return total;
}, [dates, getStudentReadingStatus]);
```

**Step 2: Add a renderDateStatusCell function**

This renders a status cell for any date, not just the selected date. It needs to handle clicking to select the student:
```js
const renderDateStatusCell = (student, date) => {
  const dateStr = formatDateISO(date);
  const { status, count } = getStudentReadingStatus(student, dateStr);
  const isSelectedDate = selectedDate === dateStr;
  const isSelected = selectedStudent?.id === student.id;

  const cellStyle = {
    cursor: 'pointer',
    textAlign: 'center',
    fontWeight: 'bold',
    fontSize: isMobile ? '0.75rem' : '1rem',
    padding: isMobile ? '4px 2px' : '8px 4px',
    minWidth: isMobile ? 30 : 40,
    transition: 'background-color 0.2s',
    outline: isSelectedDate ? '2px solid' : 'none',
    outlineColor: 'primary.main',
    outlineOffset: '-2px',
  };

  let bgColor = 'transparent';
  let color = 'grey.400';
  let content = '-';

  switch (status) {
    case READING_STATUS.READ:
      bgColor = 'success.light';
      color = 'success.dark';
      content = '✓';
      break;
    case READING_STATUS.MULTIPLE:
      bgColor = 'success.main';
      color = 'white';
      content = count;
      break;
    case READING_STATUS.ABSENT:
      bgColor = 'warning.light';
      color = 'warning.dark';
      content = 'A';
      break;
    case READING_STATUS.NO_RECORD:
      bgColor = 'grey.200';
      color = 'grey.600';
      content = '•';
      break;
    default:
      break;
  }

  if (isSelected && isSelectedDate) {
    bgColor = 'primary.light';
  }

  return (
    <TableCell
      key={dateStr}
      sx={{ ...cellStyle, backgroundColor: bgColor, color }}
      onClick={() => {
        setSelectedDate(dateStr);
        setSelectedStudent(student);
      }}
    >
      {content}
    </TableCell>
  );
};
```

**Step 3: Replace the table JSX**

Replace the entire `<Paper sx={{ mb: 2 }}>` register table section (lines 907-986) with:

```jsx
<Paper sx={{ mb: 2 }}>
  <TableContainer sx={{ maxHeight: { xs: 'clamp(250px, calc(100vh - 360px), 600px)', sm: 'clamp(300px, calc(100vh - 320px), 800px)' } }}>
    <Table stickyHeader size="small">
      <TableHead>
        <TableRow>
          <TableCell
            sx={{
              fontWeight: 'bold',
              minWidth: isMobile ? 80 : 140,
              position: 'sticky',
              left: 0,
              backgroundColor: 'background.paper',
              zIndex: 3
            }}
          >
            Name
          </TableCell>
          {dates.map((date, index) => {
            const { day, date: dayNum } = formatDateHeader(date);
            const dateStr = formatDateISO(date);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isSelectedDate = selectedDate === dateStr;
            return (
              <TableCell
                key={index}
                sx={{
                  fontWeight: 'bold',
                  textAlign: 'center',
                  minWidth: isMobile ? 30 : 40,
                  padding: isMobile ? '4px 2px' : '8px 4px',
                  backgroundColor: isSelectedDate ? 'primary.main' : (isWeekend ? 'grey.100' : 'background.paper'),
                  color: isSelectedDate ? 'primary.contrastText' : 'text.primary',
                  cursor: 'pointer',
                  '@media (hover: hover) and (pointer: fine)': {
                    '&:hover': {
                      backgroundColor: isSelectedDate ? 'primary.dark' : 'action.hover'
                    },
                  },
                  transition: 'background-color 0.2s ease-in-out'
                }}
                onClick={() => setSelectedDate(dateStr)}
              >
                <Tooltip title={date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}>
                  <Box>
                    <Typography variant="caption" display="block" sx={{ fontSize: isMobile ? '0.6rem' : '0.7rem' }}>
                      {day}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: isMobile ? '0.75rem' : '0.85rem' }}>
                      {dayNum}
                    </Typography>
                  </Box>
                </Tooltip>
              </TableCell>
            );
          })}
          <TableCell sx={{ fontWeight: 'bold', textAlign: 'center', minWidth: isMobile ? 40 : 50, backgroundColor: 'primary.light', color: 'primary.contrastText' }}>
            Total
          </TableCell>
          <TableCell sx={{ fontWeight: 'bold', textAlign: 'center', minWidth: 40 }}>
            Clear
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {filteredStudents.map(student => {
          const isSelected = selectedStudent?.id === student.id;
          const { status } = getStudentReadingStatus(student, selectedDate);
          const hasEntry = status !== READING_STATUS.NONE;

          return (
            <TableRow
              key={student.id}
              hover
              selected={isSelected}
              sx={{
                cursor: 'pointer',
                '&.Mui-selected': { backgroundColor: 'primary.light' }
              }}
            >
              <TableCell
                sx={{
                  fontWeight: isSelected ? 'bold' : 500,
                  fontSize: isMobile ? '0.75rem' : '0.875rem',
                  position: 'sticky',
                  left: 0,
                  backgroundColor: isSelected ? 'primary.light' : 'background.paper',
                  zIndex: 1
                }}
                onClick={() => setSelectedStudent(student)}
              >
                {student.name}
              </TableCell>
              {dates.map(date => renderDateStatusCell(student, date))}
              <TableCell
                sx={{
                  textAlign: 'center',
                  fontWeight: 'bold',
                  backgroundColor: 'primary.light',
                  color: 'primary.contrastText',
                  fontSize: isMobile ? '0.8rem' : '0.9rem'
                }}
              >
                {getStudentTotalInRange(student)}
              </TableCell>
              <TableCell sx={{ textAlign: 'center', padding: '4px' }}>
                {hasEntry && (
                  <Tooltip title="Clear entry">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearEntry(student);
                      }}
                      sx={{
                        color: 'error.main',
                        minWidth: 44,
                        minHeight: 44,
                        '@media (hover: hover) and (pointer: fine)': {
                          '&:hover': { backgroundColor: 'error.light' },
                        },
                        '&:active': { backgroundColor: 'rgba(193, 126, 126, 0.2)' }
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          );
        })}
        {filteredStudents.length === 0 && (
          <TableRow>
            <TableCell colSpan={dates.length + 3} sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                {searchQuery ? 'No students match your search' : 'No students in this class'}
              </Typography>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  </TableContainer>
</Paper>
```

**Step 4: Remove the old renderStatusCell function**

Delete the old `renderStatusCell` function (lines 614-703) since it's replaced by `renderDateStatusCell`.

**Step 5: Remove the old getStudentTotalSessions function**

Delete `getStudentTotalSessions` (lines 708-723) since it's replaced by `getStudentTotalInRange`.

**Step 6: Remove the ClassReadingHistoryTable import and usage**

Delete the import (line 57):
```js
import ClassReadingHistoryTable from './ClassReadingHistoryTable';
```

Delete the usage in JSX (lines 1055-1060):
```jsx
<ClassReadingHistoryTable
  students={classStudents}
  books={books}
  selectedDate={selectedDate}
  onDateChange={setSelectedDate}
/>
```

**Step 7: Remove the date chip from the controls**

The date chip below the search field (lines 895-902) is no longer needed since the selected date is visually highlighted in the table headers. Remove it.

**Step 8: Commit**

```bash
git add src/components/sessions/HomeReadingRegister.js
git commit -m "feat: replace register and history tables with unified multi-day table"
```

---

### Task 4: Add daily totals footer row

Add a totals row at the bottom of the unified table, matching the ClassReadingHistoryTable's daily totals with tooltip breakdown.

**Files:**
- Modify: `src/components/sessions/HomeReadingRegister.js`

**Step 1: Add dailyTotals useMemo**

Add this inside the component, after the `dates` memo:
```js
const dailyTotals = useMemo(() => {
  return dates.map(date => {
    const dateStr = formatDateISO(date);
    let read = 0, multiple = 0, absent = 0, noRecord = 0, notEntered = 0, totalSessions = 0;

    classStudents.forEach(student => {
      const { status, count } = getStudentReadingStatus(student, dateStr);
      switch (status) {
        case READING_STATUS.READ:
          read++;
          totalSessions += 1;
          break;
        case READING_STATUS.MULTIPLE:
          multiple++;
          totalSessions += count;
          break;
        case READING_STATUS.ABSENT:
          absent++;
          break;
        case READING_STATUS.NO_RECORD:
          noRecord++;
          break;
        default:
          notEntered++;
      }
    });

    return { read, multiple, absent, noRecord, notEntered, totalSessions };
  });
}, [dates, classStudents, getStudentReadingStatus]);
```

**Step 2: Add the footer row to TableBody**

Insert this after the empty-state row and before the closing `</TableBody>`:
```jsx
{filteredStudents.length > 0 && (
  <TableRow sx={{ backgroundColor: 'grey.50' }}>
    <TableCell
      sx={{
        fontWeight: 'bold',
        position: 'sticky',
        left: 0,
        backgroundColor: 'grey.50',
        zIndex: 3,
        borderTop: '2px solid',
        borderColor: 'grey.300',
        fontSize: isMobile ? '0.75rem' : '0.875rem'
      }}
    >
      Daily Totals
    </TableCell>
    {dailyTotals.map((totals, index) => {
      const isWeekend = dates[index].getDay() === 0 || dates[index].getDay() === 6;
      return (
        <TableCell
          key={index}
          sx={{
            textAlign: 'center',
            fontWeight: 'bold',
            padding: isMobile ? '4px 2px' : '8px 4px',
            backgroundColor: isWeekend ? 'grey.100' : 'grey.50',
            borderTop: '2px solid',
            borderColor: 'grey.300',
            fontSize: isMobile ? '0.7rem' : '0.8rem'
          }}
        >
          {totals.totalSessions > 0 && (
            <Tooltip title={`${totals.read} read, ${totals.multiple} multiple, ${totals.absent} absent, ${totals.noRecord} no record, ${totals.notEntered} not entered`}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                  {totals.totalSessions}
                </Typography>
                {totals.read > 0 && (
                  <Typography variant="caption" sx={{ color: 'success.dark', fontSize: '0.6rem' }}>
                    {totals.read}✓
                  </Typography>
                )}
                {totals.multiple > 0 && (
                  <Typography variant="caption" sx={{ color: 'success.dark', fontSize: '0.6rem' }}>
                    +{totals.multiple}
                  </Typography>
                )}
              </Box>
            </Tooltip>
          )}
        </TableCell>
      );
    })}
    <TableCell
      sx={{
        textAlign: 'center',
        fontWeight: 'bold',
        backgroundColor: 'primary.light',
        color: 'primary.contrastText',
        borderTop: '2px solid',
        borderColor: 'grey.300',
        fontSize: isMobile ? '0.8rem' : '0.9rem'
      }}
    >
      {dailyTotals.reduce((sum, day) => sum + day.totalSessions, 0)}
    </TableCell>
    <TableCell sx={{ borderTop: '2px solid', borderColor: 'grey.300', backgroundColor: 'grey.50' }} />
  </TableRow>
)}
```

**Step 3: Add legend below the summary chips**

Add this after the summary chips `</Paper>`, before the dialogs:
```jsx
<Box sx={{
  display: 'flex',
  flexWrap: 'wrap',
  gap: 2,
  mt: 2,
  justifyContent: 'center',
  fontSize: '0.75rem'
}}>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
    <Box sx={{ width: 20, height: 20, backgroundColor: 'success.light', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'success.dark', fontWeight: 'bold', fontSize: '0.7rem' }}>✓</Box>
    <Typography variant="caption">Read</Typography>
  </Box>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
    <Box sx={{ width: 20, height: 20, backgroundColor: 'success.main', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold', fontSize: '0.7rem' }}>2</Box>
    <Typography variant="caption">Multiple</Typography>
  </Box>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
    <Box sx={{ width: 20, height: 20, backgroundColor: 'warning.light', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'warning.dark', fontWeight: 'bold', fontSize: '0.7rem' }}>A</Box>
    <Typography variant="caption">Absent</Typography>
  </Box>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
    <Box sx={{ width: 20, height: 20, backgroundColor: 'grey.200', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'grey.600', fontWeight: 'bold', fontSize: '0.7rem' }}>•</Box>
    <Typography variant="caption">No Record</Typography>
  </Box>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
    <Box sx={{ width: 20, height: 20, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'grey.300', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'grey.400', fontWeight: 'bold', fontSize: '0.7rem' }}>-</Box>
    <Typography variant="caption">Not Entered</Typography>
  </Box>
</Box>
```

**Step 4: Commit**

```bash
git add src/components/sessions/HomeReadingRegister.js
git commit -m "feat: add daily totals footer row and legend to unified register"
```

---

### Task 5: Update tests

Update the test file to match the new unified table structure. Remove DnD mocks and tests, remove Current Book tests, update table header assertions, add date column tests.

**Files:**
- Modify: `src/__tests__/components/HomeReadingRegister.test.jsx`

**Step 1: Remove DnD mocks**

Delete these mock blocks (lines 28-71):
```js
// DELETE: Mock @dnd-kit/core (lines 28-41)
// DELETE: Mock @dnd-kit/sortable (lines 43-62)
// DELETE: Mock @dnd-kit/utilities (lines 64-71)
```

**Step 2: Remove ClassReadingHistoryTable mock**

Delete lines 88-95:
```js
// DELETE: Mock the ClassReadingHistoryTable component
```

**Step 3: Remove localStorage mock**

Delete lines 14-26 (the `localStorageMock` setup and `Object.defineProperty`).

**Step 4: Remove DnD-related beforeEach cleanup**

In `beforeEach` (line 178), remove `window.__dndOnDragEnd = null;`.

**Step 5: Remove the "Drag and Drop Student Reordering" describe block**

Delete the entire describe block (lines 795-853).

**Step 6: Remove the ClassReadingHistoryTable render test**

Delete the test "should render ClassReadingHistoryTable component" (lines 221-226).

**Step 7: Update "Student Grid Display" tests**

The "should display current book for students" test (lines 363-369) should be removed — the Current Book column no longer exists in the table.

The "should display table headers correctly" test (lines 381-389) should be updated to check for date column headers instead of "Current Book":
```js
it('should display table headers correctly', () => {
  const context = createMockContext({ globalClassFilter: 'class-1' });
  render(<HomeReadingRegister />, { wrapper: createWrapper(context) });

  expect(screen.getByText('Name')).toBeInTheDocument();
  expect(screen.getByText('Total')).toBeInTheDocument();
  expect(screen.getByText('Clear')).toBeInTheDocument();
  // Date columns should be present (day abbreviations)
  // At least one day of the week should be visible
  const dayAbbreviations = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const foundDays = dayAbbreviations.filter(day => screen.queryByText(day));
  expect(foundDays.length).toBeGreaterThan(0);
});
```

**Step 8: Update colSpan in empty state test if needed**

The "No students in this class" empty row had `colSpan={5}`. In the new table it should be `colSpan={dates.length + 3}`. This is already handled in the component code from Task 3 — the test just checks for the text, so no test change needed.

**Step 9: Run tests**

Run: `npx vitest run src/__tests__/components/HomeReadingRegister.test.jsx`

Expected: All tests pass. Some tests may need additional adjustments based on the new table structure (e.g., status cell queries may return more results since there are now multiple date columns per student).

**Step 10: Fix any remaining test failures**

Likely adjustments:
- Status display tests (checkmark, count, absent, dot) may find more matching cells. Use `getAllByText` and check `length > 0` or target specific cells.
- The `within(table).getByText('✓')` may need to become `getAllByText('✓')` if the student has check marks on multiple dates.

**Step 11: Commit**

```bash
git add src/__tests__/components/HomeReadingRegister.test.jsx
git commit -m "test: update HomeReadingRegister tests for unified table"
```

---

### Task 6: Delete ClassReadingHistoryTable and remove @dnd-kit

Clean up the now-unused component and dependencies.

**Files:**
- Delete: `src/components/sessions/ClassReadingHistoryTable.js`
- Modify: `package.json` (remove @dnd-kit dependencies)

**Step 1: Delete ClassReadingHistoryTable**

```bash
rm src/components/sessions/ClassReadingHistoryTable.js
```

**Step 2: Remove @dnd-kit from package.json**

```bash
npm uninstall @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Step 3: Verify no remaining references**

Search for any remaining imports of ClassReadingHistoryTable or @dnd-kit in src/:
```bash
grep -r "ClassReadingHistoryTable\|@dnd-kit" src/
```

Expected: No results.

**Step 4: Run full test suite**

Run: `npm test`

Expected: All tests pass. No test file references ClassReadingHistoryTable directly (it was mocked in HomeReadingRegister tests which we already cleaned up).

**Step 5: Verify build**

Run: `npm run build`

Expected: Build succeeds with no missing import errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove ClassReadingHistoryTable and @dnd-kit dependencies"
```

---

### Task 7: Update documentation

Update CLAUDE.md file map and structure YAML to reflect the changes.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/structure/components.yaml`

**Step 1: Update CLAUDE.md file map**

Remove the `ClassReadingHistoryTable` entry:
```
src/components/sessions/ClassReadingHistoryTable.js - Class reading history table
```

Update the `HomeReadingRegister` description:
```
src/components/sessions/HomeReadingRegister.js - Unified reading register with multi-day history columns
```

Update the "Home Reading Register" section description to remove references to drag-and-drop and @dnd-kit:
```
### Home Reading Register

Quick entry grid for class-wide reading: status buttons (read/multiple/absent/no record), student book persistence, multi-day history with date range presets, daily totals, bulk session creation. See `src/components/sessions/HomeReadingRegister.js`.
```

**Step 2: Update .claude/structure/components.yaml**

Update the HomeReadingRegister entry to remove @dnd-kit reference and add date range info. Remove the ClassReadingHistoryTable entry.

**Step 3: Commit**

```bash
git add CLAUDE.md .claude/structure/components.yaml
git commit -m "docs: update structure index for unified reading register"
```
