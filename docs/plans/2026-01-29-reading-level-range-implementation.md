# Reading Level Range Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace single reading level with min-max range (1.0-13.0) to match AR assessment results.

**Architecture:** Database migration adds two REAL columns, migrates existing data with ±0.5 buffer, then removes old column. Backend validation ensures min ≤ max. Frontend replaces dropdown with two number inputs. AI recommendations add focus mode selector (Consolidation/Challenge/Balanced) with AR level explanation in prompt.

**Tech Stack:** D1 SQLite, Hono routes, React + MUI components, Vitest testing

---

## Task 1: Database Migration - Add New Columns

**Files:**
- Create: `migrations/0015_reading_level_range.sql`

**Step 1: Write the migration SQL**

Create the migration file with new columns and data migration:

```sql
-- Add new reading level range columns
ALTER TABLE students ADD COLUMN reading_level_min REAL;
ALTER TABLE students ADD COLUMN reading_level_max REAL;

-- Create index for range queries
CREATE INDEX IF NOT EXISTS idx_students_reading_level_range
ON students(reading_level_min, reading_level_max);

-- Migrate existing data: X becomes (X-0.5, X+0.5)
-- Handle edge case: values below 1.5 get min clamped to 1.0
UPDATE students
SET
  reading_level_min = CASE
    WHEN reading_level IS NOT NULL AND CAST(reading_level AS REAL) > 0
    THEN MAX(1.0, CAST(reading_level AS REAL) - 0.5)
    ELSE NULL
  END,
  reading_level_max = CASE
    WHEN reading_level IS NOT NULL AND CAST(reading_level AS REAL) > 0
    THEN MIN(13.0, CAST(reading_level AS REAL) + 0.5)
    ELSE NULL
  END
WHERE reading_level IS NOT NULL
  AND reading_level != ''
  AND CAST(reading_level AS REAL) > 0;

-- Drop old column and index (SQLite requires table recreation)
-- For now, leave reading_level in place for rollback safety
-- Will be removed in a future cleanup migration

-- Drop the old single-level index
DROP INDEX IF EXISTS idx_students_reading_level;
```

**Step 2: Test migration locally**

Run:
```bash
cd "/Users/dervish/CascadeProjects/KidsReadingManager redux/.worktrees/reading-level-range"
npx wrangler d1 migrations apply reading-manager-db --local
```

Expected: Migration applies successfully

**Step 3: Commit**

```bash
git add migrations/0015_reading_level_range.sql
git commit -m "feat(db): add reading_level_min and reading_level_max columns

Migrate existing single reading_level values to range with ±0.5 buffer.
Edge cases clamp min to 1.0 and max to 13.0."
```

---

## Task 2: Backend Validation - Add Range Validation

**Files:**
- Modify: `src/utils/validation.js`
- Modify: `src/__tests__/unit/validation.test.js`

**Step 1: Write failing tests for reading level range validation**

Add to `src/__tests__/unit/validation.test.js`:

```javascript
describe('validateReadingLevelRange', () => {
  it('should return valid for null min and max', () => {
    const result = validateReadingLevelRange(null, null);
    expect(result.isValid).toBe(true);
  });

  it('should return valid for undefined min and max', () => {
    const result = validateReadingLevelRange(undefined, undefined);
    expect(result.isValid).toBe(true);
  });

  it('should return valid for valid range', () => {
    const result = validateReadingLevelRange(5.2, 8.7);
    expect(result.isValid).toBe(true);
  });

  it('should return valid when min equals max', () => {
    const result = validateReadingLevelRange(6.0, 6.0);
    expect(result.isValid).toBe(true);
  });

  it('should return invalid when min > max', () => {
    const result = validateReadingLevelRange(8.0, 5.0);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('minimum');
  });

  it('should return invalid when min < 1.0', () => {
    const result = validateReadingLevelRange(0.5, 5.0);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('1.0');
  });

  it('should return invalid when max > 13.0', () => {
    const result = validateReadingLevelRange(5.0, 15.0);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('13.0');
  });

  it('should return invalid when only min is provided', () => {
    const result = validateReadingLevelRange(5.0, null);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('both');
  });

  it('should return invalid when only max is provided', () => {
    const result = validateReadingLevelRange(null, 8.0);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('both');
  });

  it('should handle string numbers by converting them', () => {
    const result = validateReadingLevelRange('5.2', '8.7');
    expect(result.isValid).toBe(true);
  });

  it('should round to one decimal place', () => {
    const result = validateReadingLevelRange(5.234, 8.789);
    expect(result.isValid).toBe(true);
    expect(result.normalizedMin).toBe(5.2);
    expect(result.normalizedMax).toBe(8.8);
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- --testNamePattern="validateReadingLevelRange"
```

Expected: FAIL - function not defined

**Step 3: Implement validateReadingLevelRange**

Add to `src/utils/validation.js`:

```javascript
/**
 * Validates reading level range (min and max values)
 * @param {number|string|null} min - Minimum reading level
 * @param {number|string|null} max - Maximum reading level
 * @returns {{isValid: boolean, error?: string, normalizedMin?: number, normalizedMax?: number}}
 */
export function validateReadingLevelRange(min, max) {
  // Both null/undefined is valid (not assessed)
  if ((min === null || min === undefined) && (max === null || max === undefined)) {
    return { isValid: true };
  }

  // If one is set, both must be set
  if ((min === null || min === undefined) !== (max === null || max === undefined)) {
    return { isValid: false, error: 'Reading level range requires both minimum and maximum values' };
  }

  // Convert to numbers and round to 1 decimal place
  const minNum = Math.round(parseFloat(min) * 10) / 10;
  const maxNum = Math.round(parseFloat(max) * 10) / 10;

  // Check for valid numbers
  if (isNaN(minNum) || isNaN(maxNum)) {
    return { isValid: false, error: 'Reading level values must be valid numbers' };
  }

  // Check range bounds (1.0 to 13.0)
  if (minNum < 1.0 || maxNum < 1.0) {
    return { isValid: false, error: 'Reading level must be at least 1.0' };
  }
  if (minNum > 13.0 || maxNum > 13.0) {
    return { isValid: false, error: 'Reading level must not exceed 13.0' };
  }

  // Check min <= max
  if (minNum > maxNum) {
    return { isValid: false, error: 'Reading level minimum cannot be greater than maximum' };
  }

  return { isValid: true, normalizedMin: minNum, normalizedMax: maxNum };
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
npm test -- --testNamePattern="validateReadingLevelRange"
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/utils/validation.js src/__tests__/unit/validation.test.js
git commit -m "feat(validation): add validateReadingLevelRange function

Validates min/max reading levels: both required if either set,
range 1.0-13.0, min <= max, normalizes to one decimal place."
```

---

## Task 3: Backend Routes - Update Student CRUD

**Files:**
- Modify: `src/routes/students.js`
- Modify: `src/__tests__/integration/students.test.js` (create if doesn't exist, or add to existing)

**Step 1: Write failing tests for student CRUD with range fields**

Create or add to `src/__tests__/integration/students.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import studentsRoutes from '../../routes/students.js';

// Mock database helper
const createMockDb = (results = {}) => ({
  prepare: vi.fn(() => ({
    bind: vi.fn(() => ({
      all: vi.fn().mockResolvedValue({ results: results.all || [] }),
      first: vi.fn().mockResolvedValue(results.first || null),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
    })),
  })),
  batch: vi.fn().mockResolvedValue([{ success: true }]),
});

describe('Students API - Reading Level Range', () => {
  let app;
  let mockDb;

  beforeEach(() => {
    mockDb = createMockDb();
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('organizationId', 'org-123');
      c.set('userId', 'user-123');
      c.set('userRole', 'admin');
      c.env = { READING_MANAGER_DB: mockDb };
      await next();
    });
    app.route('/api', studentsRoutes);
  });

  describe('POST /api/students', () => {
    it('should create student with reading level range', async () => {
      const res = await app.request('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Student',
          readingLevelMin: 5.2,
          readingLevelMax: 8.7,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.student.readingLevelMin).toBe(5.2);
      expect(body.student.readingLevelMax).toBe(8.7);
    });

    it('should reject when min > max', async () => {
      const res = await app.request('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Student',
          readingLevelMin: 8.0,
          readingLevelMax: 5.0,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject when level out of range', async () => {
      const res = await app.request('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Student',
          readingLevelMin: 0.5,
          readingLevelMax: 5.0,
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/students/:id', () => {
    it('should update student reading level range', async () => {
      mockDb = createMockDb({
        first: { id: 'student-1', organization_id: 'org-123', name: 'Test' },
      });

      // Recreate app with new mock
      app = new Hono();
      app.use('*', async (c, next) => {
        c.set('organizationId', 'org-123');
        c.set('userId', 'user-123');
        c.set('userRole', 'admin');
        c.env = { READING_MANAGER_DB: mockDb };
        await next();
      });
      app.route('/api', studentsRoutes);

      const res = await app.request('/api/students/student-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Student',
          readingLevelMin: 6.0,
          readingLevelMax: 10.5,
        }),
      });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/students', () => {
    it('should return students with reading level range fields', async () => {
      mockDb = createMockDb({
        all: [{
          id: 'student-1',
          organization_id: 'org-123',
          name: 'Test Student',
          reading_level_min: 5.2,
          reading_level_max: 8.7,
        }],
      });

      app = new Hono();
      app.use('*', async (c, next) => {
        c.set('organizationId', 'org-123');
        c.set('userId', 'user-123');
        c.set('userRole', 'admin');
        c.env = { READING_MANAGER_DB: mockDb };
        await next();
      });
      app.route('/api', studentsRoutes);

      const res = await app.request('/api/students');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.students[0].readingLevelMin).toBe(5.2);
      expect(body.students[0].readingLevelMax).toBe(8.7);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- --testNamePattern="Reading Level Range"
```

Expected: FAIL - readingLevelMin/Max not handled

**Step 3: Update rowToStudent helper**

In `src/routes/students.js`, modify the `rowToStudent` function (around line 43-71):

```javascript
const rowToStudent = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    classId: row.class_id,
    className: row.class_name,
    name: row.name,
    readingLevelMin: row.reading_level_min,
    readingLevelMax: row.reading_level_max,
    // Keep legacy field for backward compatibility during transition
    readingLevel: row.reading_level,
    ageRange: row.age_range,
    notes: row.notes,
    likes: row.likes,
    dislikes: row.dislikes,
    currentBook: row.current_book,
    currentBookId: row.current_book_id,
    lastReadDate: row.last_read_date,
    streak: row.streak,
    totalSessions: row.total_sessions,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};
```

**Step 4: Update POST /api/students route**

Modify the create endpoint (around line 403-416) to use range fields:

```javascript
// Add import at top of file
import { validateReadingLevelRange } from '../utils/validation.js';

// In POST handler, add validation before insert:
const rangeValidation = validateReadingLevelRange(body.readingLevelMin, body.readingLevelMax);
if (!rangeValidation.isValid) {
  return c.json({ error: rangeValidation.error }, 400);
}

// Update INSERT statement to use new fields:
const result = await db.prepare(`
  INSERT INTO students (
    id, organization_id, class_id, name,
    reading_level_min, reading_level_max,
    age_range, notes, likes, dislikes, current_book, current_book_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).bind(
  studentId,
  organizationId,
  body.classId || null,
  body.name,
  rangeValidation.normalizedMin ?? null,
  rangeValidation.normalizedMax ?? null,
  body.ageRange || null,
  body.notes || null,
  body.likes || null,
  body.dislikes || null,
  body.currentBook || null,
  body.currentBookId || null
).run();
```

**Step 5: Update PUT /api/students/:id route**

Modify the update endpoint (around line 491-510):

```javascript
// Add range validation
const rangeValidation = validateReadingLevelRange(body.readingLevelMin, body.readingLevelMax);
if (!rangeValidation.isValid) {
  return c.json({ error: rangeValidation.error }, 400);
}

// Update UPDATE statement:
const result = await db.prepare(`
  UPDATE students SET
    class_id = ?,
    name = ?,
    reading_level_min = ?,
    reading_level_max = ?,
    age_range = ?,
    notes = ?,
    likes = ?,
    dislikes = ?,
    current_book = ?,
    current_book_id = ?,
    updated_at = datetime('now')
  WHERE id = ? AND organization_id = ?
`).bind(
  body.classId || null,
  body.name,
  rangeValidation.normalizedMin ?? null,
  rangeValidation.normalizedMax ?? null,
  body.ageRange || null,
  body.notes || null,
  body.likes || null,
  body.dislikes || null,
  body.currentBook || null,
  body.currentBookId || null,
  studentId,
  organizationId
).run();
```

**Step 6: Update GET queries to select new fields**

Update SELECT statements to include `reading_level_min` and `reading_level_max`.

**Step 7: Run tests to verify they pass**

Run:
```bash
npm test -- --testNamePattern="Reading Level Range"
```

Expected: All tests PASS

**Step 8: Run full test suite**

Run:
```bash
npm test
```

Expected: All 1030+ tests PASS

**Step 9: Commit**

```bash
git add src/routes/students.js src/__tests__/integration/students.test.js
git commit -m "feat(api): update student CRUD for reading level range

- Add readingLevelMin and readingLevelMax to student model
- Validate range on create and update
- Update rowToStudent helper for new fields"
```

---

## Task 4: Frontend - Reading Level Range Input Component

**Files:**
- Create: `src/components/students/ReadingLevelRangeInput.js`
- Create: `src/__tests__/components/ReadingLevelRangeInput.test.jsx`

**Step 1: Write failing tests for the component**

Create `src/__tests__/components/ReadingLevelRangeInput.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReadingLevelRangeInput from '../../components/students/ReadingLevelRangeInput';

describe('ReadingLevelRangeInput', () => {
  it('should render two number inputs', () => {
    render(<ReadingLevelRangeInput min={null} max={null} onChange={() => {}} />);

    expect(screen.getByLabelText(/min/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max/i)).toBeInTheDocument();
  });

  it('should display current values', () => {
    render(<ReadingLevelRangeInput min={5.2} max={8.7} onChange={() => {}} />);

    expect(screen.getByLabelText(/min/i)).toHaveValue(5.2);
    expect(screen.getByLabelText(/max/i)).toHaveValue(8.7);
  });

  it('should call onChange when min is updated', () => {
    const onChange = vi.fn();
    render(<ReadingLevelRangeInput min={5.0} max={8.0} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/min/i), { target: { value: '6.0' } });

    expect(onChange).toHaveBeenCalledWith({ min: 6.0, max: 8.0 });
  });

  it('should call onChange when max is updated', () => {
    const onChange = vi.fn();
    render(<ReadingLevelRangeInput min={5.0} max={8.0} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/max/i), { target: { value: '10.0' } });

    expect(onChange).toHaveBeenCalledWith({ min: 5.0, max: 10.0 });
  });

  it('should show error when min > max', () => {
    render(<ReadingLevelRangeInput min={8.0} max={5.0} onChange={() => {}} />);

    expect(screen.getByText(/minimum cannot be greater/i)).toBeInTheDocument();
  });

  it('should render visual range bar', () => {
    render(<ReadingLevelRangeInput min={5.0} max={8.0} onChange={() => {}} />);

    expect(screen.getByTestId('reading-level-range-bar')).toBeInTheDocument();
  });

  it('should handle empty values as null', () => {
    const onChange = vi.fn();
    render(<ReadingLevelRangeInput min={5.0} max={8.0} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/min/i), { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith({ min: null, max: 8.0 });
  });

  it('should show "Not assessed" label when both values are null', () => {
    render(<ReadingLevelRangeInput min={null} max={null} onChange={() => {}} />);

    expect(screen.getByText(/not assessed/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- --testNamePattern="ReadingLevelRangeInput"
```

Expected: FAIL - component not found

**Step 3: Implement the component**

Create `src/components/students/ReadingLevelRangeInput.js`:

```jsx
import React from 'react';
import { Box, TextField, Typography, LinearProgress } from '@mui/material';

/**
 * Reading level range input with visual bar
 * @param {Object} props
 * @param {number|null} props.min - Minimum reading level (1.0-13.0)
 * @param {number|null} props.max - Maximum reading level (1.0-13.0)
 * @param {Function} props.onChange - Called with {min, max} when values change
 * @param {boolean} props.disabled - Whether inputs are disabled
 */
export default function ReadingLevelRangeInput({ min, max, onChange, disabled = false }) {
  const handleMinChange = (e) => {
    const value = e.target.value === '' ? null : parseFloat(e.target.value);
    onChange({ min: value, max });
  };

  const handleMaxChange = (e) => {
    const value = e.target.value === '' ? null : parseFloat(e.target.value);
    onChange({ min, max: value });
  };

  const hasError = min !== null && max !== null && min > max;
  const isNotAssessed = min === null && max === null;

  // Calculate visual bar position (percentage of 1-13 range)
  const minPercent = min !== null ? ((min - 1) / 12) * 100 : 0;
  const maxPercent = max !== null ? ((max - 1) / 12) * 100 : 0;
  const rangeWidth = max !== null && min !== null ? maxPercent - minPercent : 0;

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
        <TextField
          label="Min Level"
          type="number"
          inputProps={{
            min: 1.0,
            max: 13.0,
            step: 0.1,
            'aria-label': 'Minimum reading level'
          }}
          value={min ?? ''}
          onChange={handleMinChange}
          disabled={disabled}
          size="small"
          sx={{ width: 120 }}
          error={hasError}
        />
        <TextField
          label="Max Level"
          type="number"
          inputProps={{
            min: 1.0,
            max: 13.0,
            step: 0.1,
            'aria-label': 'Maximum reading level'
          }}
          value={max ?? ''}
          onChange={handleMaxChange}
          disabled={disabled}
          size="small"
          sx={{ width: 120 }}
          error={hasError}
        />
      </Box>

      {hasError && (
        <Typography color="error" variant="caption" sx={{ mb: 1, display: 'block' }}>
          Minimum cannot be greater than maximum
        </Typography>
      )}

      {isNotAssessed ? (
        <Typography variant="caption" color="text.secondary">
          Not assessed
        </Typography>
      ) : (
        <Box data-testid="reading-level-range-bar" sx={{ position: 'relative', mt: 1 }}>
          {/* Scale labels */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">1.0</Typography>
            <Typography variant="caption" color="text.secondary">13.0</Typography>
          </Box>

          {/* Background bar */}
          <Box
            sx={{
              height: 8,
              bgcolor: 'grey.200',
              borderRadius: 1,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Filled range */}
            {!hasError && min !== null && max !== null && (
              <Box
                sx={{
                  position: 'absolute',
                  left: `${minPercent}%`,
                  width: `${rangeWidth}%`,
                  height: '100%',
                  bgcolor: 'primary.main',
                  borderRadius: 1,
                }}
              />
            )}
          </Box>

          {/* Range display */}
          {min !== null && max !== null && !hasError && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Range: {min.toFixed(1)} - {max.toFixed(1)}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
npm test -- --testNamePattern="ReadingLevelRangeInput"
```

Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/components/students/ReadingLevelRangeInput.js src/__tests__/components/ReadingLevelRangeInput.test.jsx
git commit -m "feat(ui): add ReadingLevelRangeInput component

Two number inputs for min/max reading level with visual range bar.
Shows validation error when min > max, displays 'Not assessed' when empty."
```

---

## Task 5: Frontend - Update StudentProfile to Use Range Input

**Files:**
- Modify: `src/components/students/StudentProfile.js`
- Modify: `src/__tests__/components/StudentProfile.test.jsx` (if exists)

**Step 1: Update imports and state**

In `src/components/students/StudentProfile.js`:

```jsx
// Add import
import ReadingLevelRangeInput from './ReadingLevelRangeInput';

// Replace reading level state (around line 62):
// OLD: const [readingLevel, setReadingLevel] = useState('');
// NEW:
const [readingLevelMin, setReadingLevelMin] = useState(null);
const [readingLevelMax, setReadingLevelMax] = useState(null);
```

**Step 2: Update initialization from student prop**

Around line 94, update to use new fields:

```jsx
// OLD: setReadingLevel(student.readingLevel || '');
// NEW:
setReadingLevelMin(student.readingLevelMin ?? null);
setReadingLevelMax(student.readingLevelMax ?? null);
```

**Step 3: Replace the dropdown with ReadingLevelRangeInput**

Replace lines 310-336 (the FormControl with Select) with:

```jsx
<ReadingLevelRangeInput
  min={readingLevelMin}
  max={readingLevelMax}
  onChange={({ min, max }) => {
    setReadingLevelMin(min);
    setReadingLevelMax(max);
  }}
  disabled={!isEditing}
/>
```

**Step 4: Update the save/submit handler**

Around line 137, update to send new fields:

```jsx
// In updateStudent call:
const updatedStudent = {
  ...student,
  name,
  classId,
  readingLevelMin,
  readingLevelMax,
  ageRange,
  notes,
  likes,
  dislikes,
  // ... other fields
};
```

**Step 5: Remove old constants**

Remove the NUMERIC_LEVELS and TEXT_LEVELS constants (around lines 42-43) as they're no longer needed.

**Step 6: Update formatReadingLevel helper**

Replace the helper (lines 223-227) to format range:

```jsx
const formatReadingLevel = (min, max) => {
  if (min === null && max === null) return 'Not assessed';
  if (min === null || max === null) return 'Incomplete';
  return `${min.toFixed(1)} - ${max.toFixed(1)}`;
};
```

**Step 7: Run tests**

Run:
```bash
npm test
```

Expected: All tests PASS (may need to update StudentProfile tests if they exist)

**Step 8: Commit**

```bash
git add src/components/students/StudentProfile.js
git commit -m "feat(ui): replace reading level dropdown with range input

Use ReadingLevelRangeInput component for min/max level entry.
Remove old numeric/text level constants and dropdown."
```

---

## Task 6: Library Filtering - Use Student Range

**Files:**
- Modify: `src/routes/books.js`
- Modify: `src/__tests__/integration/librarySearch.test.js`

**Step 1: Write failing tests for range-based filtering**

Add to `src/__tests__/integration/librarySearch.test.js`:

```javascript
describe('Library Search - Reading Level Range', () => {
  it('should filter books within student range', async () => {
    // Student with range 5.0-8.0 should see books with levels 5.0-8.0
    const mockStudent = {
      id: 'student-1',
      reading_level_min: 5.0,
      reading_level_max: 8.0,
    };

    // Setup mock to return student with range
    // Assert SQL query uses BETWEEN for range filtering
  });

  it('should include unleveled books in results', async () => {
    // Books without reading_level should still appear
  });

  it('should return all books when student has no range set', async () => {
    // Student with null min/max should see all books
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- --testNamePattern="Reading Level Range"
```

**Step 3: Update library search filtering logic**

In `src/routes/books.js`, replace lines 128-152 with:

```javascript
// Filter by reading level range if student has one set
const minLevel = student.reading_level_min ?? student.readingLevelMin;
const maxLevel = student.reading_level_max ?? student.readingLevelMax;

if (minLevel !== null && maxLevel !== null) {
  // Filter books where book level falls within student's range
  // Include books with no reading level (don't exclude unleveled books)
  query += ` AND (b.reading_level IS NULL OR (
    CAST(b.reading_level AS REAL) >= ? AND CAST(b.reading_level AS REAL) <= ?
  ))`;
  params.push(minLevel, maxLevel);
}
// If no range set, don't filter by level (return all books)
```

**Step 4: Update student query to fetch range fields**

Update the student SELECT query to include `reading_level_min` and `reading_level_max`.

**Step 5: Run tests to verify they pass**

Run:
```bash
npm test -- --testNamePattern="Library Search"
```

Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/routes/books.js src/__tests__/integration/librarySearch.test.js
git commit -m "feat(library): filter books by student reading level range

Books are now filtered to match student's min-max range.
Unleveled books are always included in results."
```

---

## Task 7: AI Recommendations - Add Focus Mode

**Files:**
- Modify: `src/services/aiService.js`
- Modify: `src/__tests__/unit/aiService.test.js`
- Modify: `src/components/BookRecommendations.js`
- Modify: `src/__tests__/components/BookRecommendations.test.jsx`

**Step 1: Write failing tests for focus mode in prompt**

Add to `src/__tests__/unit/aiService.test.js`:

```javascript
describe('buildBroadSuggestionsPrompt - Focus Mode', () => {
  it('should include AR level explanation in prompt', () => {
    const student = {
      name: 'Test',
      readingLevelMin: 5.2,
      readingLevelMax: 8.7,
    };

    const prompt = buildBroadSuggestionsPrompt(student, [], 'balanced');

    expect(prompt).toContain('Accelerated Reader');
    expect(prompt).toContain('1.0');
    expect(prompt).toContain('13.0');
  });

  it('should include consolidation guidance when focus is consolidation', () => {
    const student = {
      name: 'Test',
      readingLevelMin: 5.0,
      readingLevelMax: 9.0,
    };

    const prompt = buildBroadSuggestionsPrompt(student, [], 'consolidation');

    expect(prompt).toContain('lower end');
    expect(prompt).toContain('fluency');
    expect(prompt).toContain('confidence');
  });

  it('should include challenge guidance when focus is challenge', () => {
    const student = {
      name: 'Test',
      readingLevelMin: 5.0,
      readingLevelMax: 9.0,
    };

    const prompt = buildBroadSuggestionsPrompt(student, [], 'challenge');

    expect(prompt).toContain('upper end');
    expect(prompt).toContain('stretch');
  });

  it('should include balanced guidance when focus is balanced', () => {
    const student = {
      name: 'Test',
      readingLevelMin: 5.0,
      readingLevelMax: 9.0,
    };

    const prompt = buildBroadSuggestionsPrompt(student, [], 'balanced');

    expect(prompt).toContain('mix across');
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
npm test -- --testNamePattern="Focus Mode"
```

**Step 3: Update buildBroadSuggestionsPrompt**

In `src/services/aiService.js`, update the prompt builder (around line 278-342):

```javascript
export function buildBroadSuggestionsPrompt(student, readingHistory, focusMode = 'balanced') {
  // ... existing code for gathering preferences ...

  // Build reading level context with AR explanation
  let readingLevelContext = '';
  if (student.readingLevelMin !== null && student.readingLevelMax !== null) {
    const min = student.readingLevelMin;
    const max = student.readingLevelMax;
    const midpoint = (min + max) / 2;

    readingLevelContext = `
READING ABILITY:
This student's reading ability is assessed using Accelerated Reader (AR) levels, which range from 1.0 (early first readers) to 13.0 (adult-level complexity). Their assessed range is ${min.toFixed(1)} to ${max.toFixed(1)} - they read confidently at the lower end and can stretch to the upper end with engagement.

Use these levels as a guide for book difficulty rather than looking for exact AR level matches.
`;

    // Add focus mode guidance
    if (focusMode === 'consolidation') {
      readingLevelContext += `
TEACHER'S REQUEST: Consolidation
Recommend books appropriate for the lower end of their range (around ${min.toFixed(1)}-${midpoint.toFixed(1)} AR level difficulty) to build fluency and confidence.
`;
    } else if (focusMode === 'challenge') {
      readingLevelContext += `
TEACHER'S REQUEST: Challenge
Recommend books appropriate for the upper end of their range (around ${midpoint.toFixed(1)}-${max.toFixed(1)} AR level difficulty) to stretch their abilities.
`;
    } else {
      readingLevelContext += `
TEACHER'S REQUEST: Balanced
Recommend a mix across their ability range from ${min.toFixed(1)} to ${max.toFixed(1)}.
`;
    }
  } else {
    readingLevelContext = `
READING ABILITY:
Reading level not assessed. Recommend age-appropriate books based on other factors.
`;
  }

  return `You are an expert children's librarian recommending books for a young reader.

STUDENT PROFILE:
- Name: ${student.name}
- Age Range: ${student.ageRange || 'Not specified'}
${readingLevelContext}
// ... rest of existing prompt ...
`;
}
```

**Step 4: Update generateBroadSuggestions to accept focusMode**

Update the function signature and pass focusMode to prompt builder.

**Step 5: Run tests to verify they pass**

Run:
```bash
npm test -- --testNamePattern="Focus Mode"
```

**Step 6: Add focus mode UI to BookRecommendations**

In `src/components/BookRecommendations.js`, add a toggle/select before the recommend button:

```jsx
const [focusMode, setFocusMode] = useState('balanced');

// In the UI, add:
<FormControl size="small" sx={{ minWidth: 150, mr: 2 }}>
  <InputLabel>Focus</InputLabel>
  <Select
    value={focusMode}
    onChange={(e) => setFocusMode(e.target.value)}
    label="Focus"
  >
    <MenuItem value="balanced">Balanced</MenuItem>
    <MenuItem value="consolidation">Consolidation</MenuItem>
    <MenuItem value="challenge">Challenge</MenuItem>
  </Select>
</FormControl>
```

**Step 7: Pass focusMode to API call**

Update the recommendation API call to include focusMode parameter.

**Step 8: Run full test suite**

Run:
```bash
npm test
```

Expected: All tests PASS

**Step 9: Commit**

```bash
git add src/services/aiService.js src/__tests__/unit/aiService.test.js src/components/BookRecommendations.js src/__tests__/components/BookRecommendations.test.jsx
git commit -m "feat(ai): add focus mode for reading recommendations

Teachers can choose Consolidation (lower range), Challenge (upper range),
or Balanced. Prompt explains AR levels 1.0-13.0 for AI context."
```

---

## Task 8: Update Student Profile Builder

**Files:**
- Modify: `src/utils/studentProfile.js`
- Modify: `src/__tests__/unit/studentProfile.test.js`

**Step 1: Write failing test**

Add to student profile tests:

```javascript
it('should include readingLevelMin and readingLevelMax in profile', async () => {
  const profile = await buildStudentReadingProfile(db, studentId, orgId);

  expect(profile.student).toHaveProperty('readingLevelMin');
  expect(profile.student).toHaveProperty('readingLevelMax');
});
```

**Step 2: Update the query and return object**

In `src/utils/studentProfile.js` (lines 19-23), update SELECT:

```javascript
const student = await db.prepare(`
  SELECT id, name, reading_level_min, reading_level_max, age_range, likes, dislikes, notes
  FROM students
  WHERE id = ? AND organization_id = ?
`).bind(studentId, organizationId).first();
```

Update the return object (lines 136-142):

```javascript
return {
  student: {
    id: student.id,
    name: student.name,
    readingLevelMin: student.reading_level_min ?? null,
    readingLevelMax: student.reading_level_max ?? null,
    ageRange: student.age_range || null,
    notes: student.notes
  },
  // ... rest
}
```

**Step 3: Run tests**

Run:
```bash
npm test
```

**Step 4: Commit**

```bash
git add src/utils/studentProfile.js src/__tests__/unit/studentProfile.test.js
git commit -m "feat(profile): include reading level range in student profile

Update buildStudentReadingProfile to return readingLevelMin and readingLevelMax."
```

---

## Task 9: Final Integration Testing

**Files:**
- All modified files

**Step 1: Run full test suite**

Run:
```bash
npm test
```

Expected: All tests PASS

**Step 2: Manual testing checklist**

Start local dev server:
```bash
npm run start:dev
```

Test these scenarios:
- [ ] Create new student with reading level range
- [ ] Edit existing student's range
- [ ] View student with range displayed correctly
- [ ] Library filters books by student's range
- [ ] AI recommendations include focus mode selector
- [ ] Focus mode changes affect recommendations

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final integration testing complete"
```

---

## Summary

This implementation plan covers:

1. **Database**: New columns `reading_level_min` and `reading_level_max` with data migration
2. **Validation**: `validateReadingLevelRange()` function for 1.0-13.0 range checking
3. **Backend**: Updated student CRUD routes
4. **Frontend**: New `ReadingLevelRangeInput` component with visual bar
5. **StudentProfile**: Updated to use range input instead of dropdown
6. **Library**: Filtering uses student's min-max range
7. **AI**: Focus mode selector (Consolidation/Challenge/Balanced) with AR level explanation
8. **Profile Builder**: Updated to include new fields

Each task is self-contained with TDD approach and frequent commits.
