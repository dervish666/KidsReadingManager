# Assessment Slider — Design Spec

**Date:** 2026-03-20
**Scope:** Replace the three-button AssessmentSelector with a 1–10 slider, migrate existing data, make assessment optional for home reading entries.

## Summary

The current AssessmentSelector uses three buttons (Needing Help / Moderate Help / Independent) mapped to string values (`'struggling'`, `'needs-help'`, `'independent'`). This change replaces it with a 1–10 integer slider on the SessionForm (Reading page) and removes assessment entirely from home reading entries on the HomeReadingRegister.

## Database Migration (0037)

SQLite cannot ALTER COLUMN, so the migration recreates `reading_sessions`:

1. Create `reading_sessions_new` with `assessment INTEGER` (nullable)
2. Copy data, converting strings: `struggling` → 2, `needs-help` → 5, `independent` → 9, anything else → 5
3. Set assessment to NULL for home reading entries (notes containing `[ABSENT]`, `[NO_RECORD]`, or `[COUNT:`)
4. Drop old table, rename new table
5. Recreate indexes on the new table

The column allows NULL — home reading entries won't have an assessment.

## Backend Changes

### Validation (`src/utils/validation.js`)

Add `isValidAssessment(value)`: returns true if value is null/undefined OR an integer 1–10.

### Routes (`src/routes/students.js`)

- POST/PUT session endpoints: accept `assessment` as integer or null. If provided, validate 1–10. If omitted or null, store NULL.
- No other route changes needed.

### Data Provider (`src/data/d1Provider.js`)

No structural changes — `assessment` is read/written as-is. The value is now an integer or null instead of a string.

## Frontend Changes

### AssessmentSelector Component (`src/components/sessions/AssessmentSelector.js`)

Complete rewrite. New interface:

```
Props:
  value: number | null     — current assessment (1–10 or null for unset)
  onChange: (number) => void — called when user sets/changes value
```

UI:
- MUI Slider, range 1–10, integer steps
- Marks at each integer
- End labels: "Needing Help" (left), "Independent" (right)
- Unset state (value=null): track greyed out, no thumb visible, prompt text "Tap to set reading level"
- Single tap anywhere on track sets the value, drag to adjust
- Compact single-row layout

Removed props: `direction` (no longer needed, slider is always horizontal)

### SessionForm (`src/components/sessions/SessionForm.js`)

- `assessment` state initialises to `null` (was `'independent'`)
- Submit validation: require assessment to be set (not null) before saving
- After save, reset assessment to `null`
- Slider replaces AssessmentSelector in Row 3

### HomeReadingRegister (`src/components/sessions/HomeReadingRegister.js`)

- Remove all `assessment: 'independent'` from `handleRecordReading` — send `assessment: null` or omit it
- Update `formatAssessment()`: handle numbers (display as "N/10") and null (display nothing)
- Update `getAssessmentColor()`: map number ranges to colours (1–3 error, 4–6 warning, 7–10 success) and null returns 'default'

### QuickEntry (`src/components/sessions/QuickEntry.js`)

QuickEntry is for school reading sessions with priority students. It uses `AssessmentSelector` and defaults to `'independent'`. Changes:
- Replace `AssessmentSelector` with the new slider version
- `assessment` state initialises to `null` (was `'independent'`)
- On navigation (next/previous), reset assessment to `null`
- Submit validation: require assessment to be set before saving

### StudentSessions (`src/components/sessions/StudentSessions.js`)

The edit session dialog (lines 515–527) uses a `<Select>` dropdown with hardcoded string assessment values. Changes:
- Replace the `<Select>` dropdown with the new `AssessmentSelector` slider component
- `editAssessment` state handles integer values and null
- For home reading sessions (location='home'), hide the assessment field entirely or show it as disabled/null

### Display — `formatAssessmentDisplay()` in `src/utils/helpers.js`

This function (lines 142–153) maps old string values to display labels. Rewrite to:
- Accept numbers: return `"N/10"` (e.g. `"7/10"`)
- Accept null: return `null` or empty string
- Remove old string cases (no longer needed post-migration)

### Display — general

Anywhere assessment is shown:
- Numbers display as "N/10" (e.g. "7/10")
- Null displays as nothing / no chip
- Old string values won't exist post-migration

### Backend Validation Detail

`isValidAssessment(value)` in `src/utils/validation.js`:
- Returns `true` if value is `null`, `undefined`, or an integer from 1 to 10 inclusive
- Returns `false` for strings, floats, or numbers outside 1–10
- Routes: if assessment is provided but invalid, return 400 Bad Request with clear error message

## Data Migration Mapping

| Old Value (string) | New Value (integer) |
|---|---|
| `'struggling'` | 2 |
| `'needs-help'` | 5 |
| `'independent'` | 9 |
| any other string | 5 |
| NULL (already null) | NULL |
| home reading entries | NULL |

## Files Changed

1. `migrations/0037_assessment_to_integer.sql` — schema migration
2. `src/utils/validation.js` — add `isValidAssessment()`
3. `src/utils/helpers.js` — rewrite `formatAssessmentDisplay()` for integers
4. `src/routes/students.js` — accept integer/null assessment, validate with 400 on bad input
5. `src/components/sessions/AssessmentSelector.js` — rewrite as slider
6. `src/components/sessions/SessionForm.js` — null default, validation, reset
7. `src/components/sessions/HomeReadingRegister.js` — remove assessment, update formatters
8. `src/components/sessions/QuickEntry.js` — use new slider, null default, require before save
9. `src/components/sessions/StudentSessions.js` — replace edit dialog dropdown with slider
