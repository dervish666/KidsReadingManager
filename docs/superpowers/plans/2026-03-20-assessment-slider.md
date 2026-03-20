# Assessment Slider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three-button assessment selector with a 1–10 integer slider, migrate existing data, and remove assessment from home reading entries.

**Architecture:** Database migration converts TEXT assessment to INTEGER (1–10, nullable). Frontend AssessmentSelector rewritten as MUI Slider. Home reading entries stop sending assessment. Backend validation updated for integer range.

**Tech Stack:** SQLite/D1 migration, Hono routes, React/MUI Slider, Vitest

**Spec:** `docs/superpowers/specs/2026-03-20-assessment-slider-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `migrations/0037_assessment_to_integer.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration 0037: Convert assessment from TEXT to INTEGER (1-10 scale)
-- SQLite cannot ALTER COLUMN, so we recreate the table

-- Step 1: Create new table with INTEGER assessment
CREATE TABLE IF NOT EXISTS reading_sessions_new (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    book_id TEXT,
    book_title TEXT,
    session_date TEXT NOT NULL,
    duration_minutes INTEGER,
    pages_read INTEGER,
    assessment INTEGER,
    notes TEXT,
    rating INTEGER,
    recorded_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    book_title_manual TEXT,
    book_author_manual TEXT,
    location TEXT DEFAULT 'school',
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Step 2: Copy data, converting assessment strings to integers
-- Home reading markers get NULL assessment
-- Other values (guided, read_aloud, not_assessed, struggled) map to 5 via ELSE catch-all
INSERT INTO reading_sessions_new
SELECT
    id, student_id, book_id, book_title, session_date,
    duration_minutes, pages_read,
    CASE
        WHEN notes LIKE '%[ABSENT]%' THEN NULL
        WHEN notes LIKE '%[NO_RECORD]%' THEN NULL
        WHEN notes LIKE '%[COUNT:%' THEN NULL
        WHEN assessment = 'struggling' THEN 2
        WHEN assessment = 'needs-help' THEN 5
        WHEN assessment = 'needs_help' THEN 5
        WHEN assessment = 'independent' THEN 9
        WHEN assessment IS NULL THEN NULL
        ELSE 5
    END,
    notes, rating, recorded_by, created_at, updated_at,
    book_title_manual, book_author_manual, location
FROM reading_sessions;

-- Step 3: Drop old table and rename
DROP TABLE reading_sessions;
ALTER TABLE reading_sessions_new RENAME TO reading_sessions;

-- Step 4: Recreate all indexes
CREATE INDEX IF NOT EXISTS idx_sessions_student ON reading_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_date ON reading_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_book ON reading_sessions(book_id);
CREATE INDEX IF NOT EXISTS idx_sessions_recorded_by ON reading_sessions(recorded_by);
CREATE INDEX IF NOT EXISTS idx_sessions_student_date ON reading_sessions(student_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_location ON reading_sessions(location);
CREATE INDEX IF NOT EXISTS idx_sessions_session_date_desc ON reading_sessions(session_date DESC);

-- Step 5: Recreate triggers
CREATE TRIGGER IF NOT EXISTS update_student_last_read_insert
AFTER INSERT ON reading_sessions
BEGIN
    UPDATE students
    SET last_read_date = (
        SELECT MAX(session_date)
        FROM reading_sessions
        WHERE student_id = NEW.student_id
    ),
    updated_at = datetime('now')
    WHERE id = NEW.student_id;
END;

CREATE TRIGGER IF NOT EXISTS update_student_last_read_delete
AFTER DELETE ON reading_sessions
BEGIN
    UPDATE students
    SET last_read_date = (
        SELECT MAX(session_date)
        FROM reading_sessions
        WHERE student_id = OLD.student_id
    ),
    updated_at = datetime('now')
    WHERE id = OLD.student_id;
END;

CREATE TRIGGER IF NOT EXISTS update_student_last_read_update
AFTER UPDATE OF session_date ON reading_sessions
BEGIN
    UPDATE students
    SET last_read_date = (
        SELECT MAX(session_date)
        FROM reading_sessions
        WHERE student_id = NEW.student_id
    ),
    updated_at = datetime('now')
    WHERE id = NEW.student_id;
END;
```

- [ ] **Step 2: Test migration locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration applies successfully

- [ ] **Step 3: Verify data converted correctly**

Run: `npx wrangler d1 execute reading-manager-db --local --command "SELECT assessment, COUNT(*) FROM reading_sessions GROUP BY assessment ORDER BY assessment"`
Expected: Only integer values (2, 5, 9) and NULLs — no string values

- [ ] **Step 4: Commit**

```bash
git add migrations/0037_assessment_to_integer.sql
git commit -m "feat: migrate assessment column from TEXT to INTEGER (1-10 scale)"
```

---

### Task 2: Backend Validation and Route Updates

**Files:**
- Modify: `src/utils/validation.js:88-90`
- Modify: `src/utils/helpers.js:142-153`
- Modify: `src/routes/students.js:971-974, 1188-1191`

- [ ] **Step 1: Write failing test for `isValidAssessment`**

Add to `src/__tests__/unit/validation.test.js`:

```javascript
describe('isValidAssessment', () => {
  it('should accept null', () => {
    expect(isValidAssessment(null)).toBe(true);
  });

  it('should accept undefined', () => {
    expect(isValidAssessment(undefined)).toBe(true);
  });

  it('should accept integers 1-10', () => {
    for (let i = 1; i <= 10; i++) {
      expect(isValidAssessment(i)).toBe(true);
    }
  });

  it('should reject 0', () => {
    expect(isValidAssessment(0)).toBe(false);
  });

  it('should reject 11', () => {
    expect(isValidAssessment(11)).toBe(false);
  });

  it('should reject strings', () => {
    expect(isValidAssessment('independent')).toBe(false);
  });

  it('should reject floats', () => {
    expect(isValidAssessment(5.5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/validation.test.js --testNamePattern="isValidAssessment"`
Expected: FAIL — `isValidAssessment` is not defined

- [ ] **Step 3: Implement `isValidAssessment` in validation.js**

Add to `src/utils/validation.js` and export:

```javascript
/**
 * Validate assessment value (1-10 integer or null/undefined)
 * @param {*} value
 * @returns {boolean}
 */
export function isValidAssessment(value) {
  if (value === null || value === undefined) return true;
  return Number.isInteger(value) && value >= 1 && value <= 10;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/validation.test.js --testNamePattern="isValidAssessment"`
Expected: PASS

- [ ] **Step 5: Update `formatAssessmentDisplay` in helpers.js**

Replace the function at `src/utils/helpers.js:142-153`:

```javascript
/**
 * Format assessment display label from stored value
 * @param {number|null} assessment - Assessment value (1-10 integer or null)
 * @returns {string|null} - Formatted display label (e.g. "7/10") or null
 */
export function formatAssessmentDisplay(assessment) {
  if (assessment === null || assessment === undefined) return null;
  if (typeof assessment === 'number' && assessment >= 1 && assessment <= 10) {
    return `${assessment}/10`;
  }
  return null;
}
```

- [ ] **Step 6: Update helpers.test.js for new assessment format**

Replace the `formatAssessmentDisplay` describe block in `src/__tests__/unit/helpers.test.js:306-326`:

```javascript
describe('formatAssessmentDisplay', () => {
  it('should format integer assessment as N/10', () => {
    expect(formatAssessmentDisplay(7)).toBe('7/10');
  });

  it('should format min assessment', () => {
    expect(formatAssessmentDisplay(1)).toBe('1/10');
  });

  it('should format max assessment', () => {
    expect(formatAssessmentDisplay(10)).toBe('10/10');
  });

  it('should return null for null', () => {
    expect(formatAssessmentDisplay(null)).toBe(null);
  });

  it('should return null for undefined', () => {
    expect(formatAssessmentDisplay(undefined)).toBe(null);
  });
});
```

- [ ] **Step 7: Run helpers tests**

Run: `npx vitest run src/__tests__/unit/helpers.test.js --testNamePattern="formatAssessmentDisplay"`
Expected: PASS

- [ ] **Step 8: Update route validation in students.js**

Replace the assessment validation at `src/routes/students.js:971-974` (POST session):

```javascript
  if (body.assessment !== null && body.assessment !== undefined && body.assessment !== '') {
    const assessmentNum = Number(body.assessment);
    if (!Number.isInteger(assessmentNum) || assessmentNum < 1 || assessmentNum > 10) {
      throw badRequestError('Assessment must be an integer between 1 and 10');
    }
    body.assessment = assessmentNum;
  } else {
    body.assessment = null;
  }
```

Apply the same replacement at `src/routes/students.js:1188-1191` (PUT session).

- [ ] **Step 9: Remove assessment requirement from validateStudent**

The `validateStudent` function in `src/utils/validation.js:88-90` currently requires every session to have an assessment. Assessment is now optional (null for home reading entries), so remove these lines from the function:

```javascript
        if (!session.assessment) {
          errors.push(`Session at index ${index} is missing an assessment`);
        }
```

Then update the test at `src/__tests__/unit/validation.test.js:115-122`. Replace:

```javascript
    it('should reject sessions without assessment', () => {
      const result = validateStudent({
        name: 'John',
        readingSessions: [{ id: '1', date: '2024-01-15' }]
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Session at index 0 is missing an assessment');
    });
```

With:

```javascript
    it('should accept sessions without assessment', () => {
      const result = validateStudent({
        name: 'John',
        readingSessions: [{ id: '1', date: '2024-01-15' }]
      });
      expect(result.isValid).toBe(true);
    });
```

Note: Assessment is validated at the API route level (1-10 integer when provided), not in `validateStudent`. The SessionForm and QuickEntry enforce it in the UI before submission. `validateStudent` is for legacy data import where assessment may be absent.

- [ ] **Step 10: Run all validation and helpers tests**

Run: `npx vitest run src/__tests__/unit/validation.test.js src/__tests__/unit/helpers.test.js`
Expected: All PASS

- [ ] **Step 11: Commit**

```bash
git add src/utils/validation.js src/utils/helpers.js src/routes/students.js src/__tests__/unit/validation.test.js src/__tests__/unit/helpers.test.js
git commit -m "feat: update assessment validation for 1-10 integer scale"
```

---

### Task 3: Rewrite AssessmentSelector Component

**Files:**
- Modify: `src/components/sessions/AssessmentSelector.js` (complete rewrite)

- [ ] **Step 1: Rewrite AssessmentSelector as a slider**

Replace the entire contents of `src/components/sessions/AssessmentSelector.js`:

```javascript
import React from 'react';
import { Box, Slider, Typography } from '@mui/material';

const marks = Array.from({ length: 10 }, (_, i) => ({ value: i + 1 }));

const AssessmentSelector = ({ value, onChange }) => {
  const isUnset = value === null || value === undefined;

  const handleChange = (event, newValue) => {
    onChange(newValue);
  };

  return (
    <Box sx={{ width: '100%', px: 1 }}>
      {isUnset ? (
        <Box
          sx={{
            position: 'relative',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            // Calculate value from click position
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const ratio = x / rect.width;
            const val = Math.round(ratio * 9) + 1;
            onChange(Math.max(1, Math.min(10, val)));
          }}
        >
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              textAlign: 'center',
              color: 'text.secondary',
              mb: 0.5,
              fontStyle: 'italic',
            }}
          >
            Tap to set reading assessment
          </Typography>
          <Slider
            value={5}
            min={1}
            max={10}
            step={1}
            marks={marks}
            disabled
            sx={{
              '& .MuiSlider-thumb': { display: 'none' },
              '& .MuiSlider-track': { bgcolor: 'grey.300' },
              '& .MuiSlider-rail': { bgcolor: 'grey.200' },
              '& .MuiSlider-mark': { bgcolor: 'grey.300' },
              pointerEvents: 'none',
            }}
          />
        </Box>
      ) : (
        <Slider
          value={value}
          onChange={handleChange}
          min={1}
          max={10}
          step={1}
          marks={marks}
          valueLabelDisplay="auto"
          sx={{
            '& .MuiSlider-thumb': {
              width: 24,
              height: 24,
            },
          }}
        />
      )}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: -0.5 }}>
        <Typography variant="caption" color="text.secondary">
          Needing Help
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Independent
        </Typography>
      </Box>
    </Box>
  );
};

export default AssessmentSelector;
```

- [ ] **Step 2: Verify it renders without errors**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/sessions/AssessmentSelector.js
git commit -m "feat: rewrite AssessmentSelector as 1-10 slider"
```

---

### Task 4: Update SessionForm

**Files:**
- Modify: `src/components/sessions/SessionForm.js:43, 249`

- [ ] **Step 1: Change assessment default to null**

At `src/components/sessions/SessionForm.js:43`, change:
```javascript
const [assessment, setAssessment] = useState('independent');
```
to:
```javascript
const [assessment, setAssessment] = useState(null);
```

- [ ] **Step 2: Add submit validation for assessment**

At `src/components/sessions/SessionForm.js`, inside `handleSubmit`, after the student check (after line 230), add:

```javascript
    if (assessment === null) {
      setError('Please set a reading assessment');
      return;
    }
```

- [ ] **Step 3: Change assessment reset after save**

At `src/components/sessions/SessionForm.js:249`, change:
```javascript
      setAssessment('independent');
```
to:
```javascript
      setAssessment(null);
```

- [ ] **Step 4: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/components/sessions/SessionForm.js
git commit -m "feat: SessionForm uses null default assessment with validation"
```

---

### Task 5: Update HomeReadingRegister

**Files:**
- Modify: `src/components/sessions/HomeReadingRegister.js:69-85, 581, 588, 597`

- [ ] **Step 1: Update formatAssessment and getAssessmentColor**

Replace `formatAssessment` at line 69:

```javascript
const formatAssessment = (assessment) => {
  if (assessment === null || assessment === undefined) return null;
  if (typeof assessment === 'number') return `${assessment}/10`;
  return null;
};
```

Replace `getAssessmentColor` at line 78:

```javascript
const getAssessmentColor = (assessment) => {
  if (assessment === null || assessment === undefined) return 'default';
  if (typeof assessment === 'number') {
    if (assessment <= 3) return 'error';
    if (assessment <= 6) return 'warning';
    return 'success';
  }
  return 'default';
};
```

- [ ] **Step 2: Remove hardcoded assessment from handleRecordReading**

In `handleRecordReading`, replace all three `assessment: 'independent'` occurrences (lines 581, 588, 597) with `assessment: null`.

At line 581 (ABSENT):
```javascript
          assessment: null,
```

At line 588 (NO_RECORD):
```javascript
          assessment: null,
```

At line 597 (READ/MULTIPLE):
```javascript
          assessment: null,
```

- [ ] **Step 3: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/components/sessions/HomeReadingRegister.js
git commit -m "feat: remove assessment from home reading entries"
```

---

### Task 6: Update QuickEntry

**Files:**
- Modify: `src/components/sessions/QuickEntry.js:39, 67, 76`

- [ ] **Step 1: Change assessment default to null**

At `src/components/sessions/QuickEntry.js:39`, change:
```javascript
const [assessment, setAssessment] = useState('independent');
```
to:
```javascript
const [assessment, setAssessment] = useState(null);
```

- [ ] **Step 2: Change assessment reset on navigation**

At lines 67 and 76, change both:
```javascript
      setAssessment('independent');
```
to:
```javascript
      setAssessment(null);
```

- [ ] **Step 3: Add submit validation**

In the `handleSave` function (around line 89), after `if (!currentStudent) return;`, add:

```javascript
    if (assessment === null) {
      setSnackbarMessage('Please set a reading assessment');
      setSnackbarOpen(true);
      return;
    }
```

- [ ] **Step 4: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/components/sessions/QuickEntry.js
git commit -m "feat: QuickEntry uses null default assessment with validation"
```

---

### Task 7: Update StudentSessions Edit Dialog

**Files:**
- Modify: `src/components/sessions/StudentSessions.js:515-527`

- [ ] **Step 1: Add AssessmentSelector import**

Check if AssessmentSelector is already imported in StudentSessions.js. If not, add:

```javascript
import AssessmentSelector from './AssessmentSelector';
```

- [ ] **Step 2: Replace Select dropdown with AssessmentSelector**

Replace the assessment Select dropdown at lines 515-527:

```javascript
            <FormControl fullWidth margin="normal">
              <InputLabel id="edit-assessment-label">Assessment</InputLabel>
              <Select
                labelId="edit-assessment-label"
                value={editAssessment}
                label="Assessment"
                onChange={(e) => setEditAssessment(e.target.value)}
              >
                <MenuItem value="struggling">Needing Help</MenuItem>
                <MenuItem value="needs-help">Moderate Help</MenuItem>
                <MenuItem value="independent">Independent</MenuItem>
              </Select>
            </FormControl>
```

With:

```javascript
            <Box sx={{ mt: 2, mb: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Assessment
              </Typography>
              <AssessmentSelector
                value={editAssessment}
                onChange={(val) => setEditAssessment(val)}
              />
            </Box>
```

- [ ] **Step 3: Check editAssessment state initialisation**

Find where `editAssessment` is initialised when the edit dialog opens. Ensure it reads the integer value from the session (or null for home reading entries). The existing code likely does:
```javascript
setEditAssessment(session.assessment)
```
This should work as-is since the database now stores integers.

- [ ] **Step 4: Remove unused Select/MenuItem/InputLabel imports if they were only used for assessment**

Check if `Select`, `MenuItem`, `InputLabel`, and `FormControl` are used elsewhere in StudentSessions.js. If the assessment dropdown was the only usage, remove those imports.

- [ ] **Step 5: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/components/sessions/StudentSessions.js
git commit -m "feat: replace assessment dropdown with slider in session edit dialog"
```

---

### Task 8: Run Full Test Suite and Fix

**Files:**
- Possibly modify: any files with remaining assessment string references

- [ ] **Step 1: Run all unit tests**

Run: `npx vitest run`
Expected: All tests pass. If any fail due to old assessment string values, fix them.

- [ ] **Step 2: Search for remaining string assessment references**

Run a grep for old assessment string values across the codebase to catch anything missed:
- Search for `'struggling'`, `'needs-help'`, `'needs_help'`, `'independent'` in `src/`
- Ignore migration files and this plan/spec

Fix any remaining references.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: clean up remaining assessment string references"
```

---

### Task 9: Deploy Migration

- [ ] **Step 1: Deploy migration to remote D1**

Run: `npx wrangler d1 migrations apply reading-manager-db --remote`
Expected: Migration applies successfully

- [ ] **Step 2: Verify remote data**

Run: `npx wrangler d1 execute reading-manager-db --remote --command "SELECT assessment, COUNT(*) FROM reading_sessions GROUP BY assessment ORDER BY assessment LIMIT 20"`
Expected: Only integer values and NULLs

- [ ] **Step 3: Deploy worker**

Run: `npm run go`
Expected: Build + deploy succeeds
