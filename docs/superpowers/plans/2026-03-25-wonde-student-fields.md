# Wonde Student Fields Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync date_of_birth, gender, first_language, and eal_detailed_status from Wonde, display on student profile, and include in AI recommendation context.

**Architecture:** Database-first. Add 4 columns via migration, update the Wonde sync mapper and upsert SQL, update the row mapper, add to AI profile builder (age only, not raw DOB), and add a read-only details section to the StudentProfile component.

**Tech Stack:** D1 SQL (migration), Hono (backend), React 19 + MUI v7 (frontend)

**Spec:** `docs/superpowers/specs/2026-03-25-wonde-student-fields-design.md`

---

## Chunk 1: Backend — Migration, Sync, Mapper

### Task 1: Database migration

**Files:**
- Create: `migrations/0040_student_demographics.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add demographic fields synced from Wonde
ALTER TABLE students ADD COLUMN date_of_birth TEXT;
ALTER TABLE students ADD COLUMN gender TEXT;
ALTER TABLE students ADD COLUMN first_language TEXT;
ALTER TABLE students ADD COLUMN eal_detailed_status TEXT;
```

- [ ] **Step 2: Apply migration locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration applied successfully

- [ ] **Step 3: Commit**

```bash
git add migrations/0040_student_demographics.sql
git commit -m "feat: add student demographic columns (DOB, gender, language, EAL)"
```

### Task 2: Update Wonde sync mapper and upsert SQL

**Files:**
- Modify: `src/services/wondeSync.js`

- [ ] **Step 4: Update mapWondeStudent() to extract new fields**

In `src/services/wondeSync.js`, the `mapWondeStudent()` function (lines 29-44) needs 4 new fields. Add after line 41 (`fsm: ...`):

```js
    dateOfBirth: wondeStudent.date_of_birth?.date
      ? wondeStudent.date_of_birth.date.split(' ')[0]
      : null,
    gender: wondeStudent.gender || null,
    firstLanguage: extendedData?.first_language || extendedData?.home_language || null,
    ealDetailedStatus: extendedData?.english_as_additional_language_status || null,
```

The `date_of_birth.date` from Wonde is `"2016-09-29 00:00:00.000000"` — `.split(' ')[0]` extracts `"2016-09-29"`.

- [ ] **Step 5: Update the UPDATE statement in student upsert (around line 224)**

Current SQL (lines 223-232):
```sql
UPDATE students SET name = ?, class_id = ?, year_group = ?,
 sen_status = ?, pupil_premium = ?, eal_status = ?, fsm = ?,
 is_active = 1, updated_at = datetime('now')
 WHERE id = ?
```

Change to:
```sql
UPDATE students SET name = ?, class_id = ?, year_group = ?,
 sen_status = ?, pupil_premium = ?, eal_status = ?, fsm = ?,
 date_of_birth = ?, gender = ?, first_language = ?, eal_detailed_status = ?,
 is_active = 1, updated_at = datetime('now')
 WHERE id = ?
```

Update the `.bind()` call (lines 228-231) to add the 4 new params before `existingId`:
```js
.bind(
  mapped.name, classId, mapped.yearGroup,
  mapped.senStatus, mapped.pupilPremium, mapped.ealStatus, mapped.fsm,
  mapped.dateOfBirth, mapped.gender, mapped.firstLanguage, mapped.ealDetailedStatus,
  existingId
)
```

- [ ] **Step 6: Update the INSERT statement in student upsert (around line 238)**

Current SQL (lines 238-242):
```sql
INSERT INTO students (id, organization_id, name, class_id, wonde_student_id,
 year_group, sen_status, pupil_premium, eal_status, fsm,
 is_active, created_at, updated_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
```

Change to:
```sql
INSERT INTO students (id, organization_id, name, class_id, wonde_student_id,
 year_group, sen_status, pupil_premium, eal_status, fsm,
 date_of_birth, gender, first_language, eal_detailed_status,
 is_active, created_at, updated_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
```

Update the `.bind()` call (lines 243-246) to add the 4 new params:
```js
.bind(
  studentId, orgId, mapped.name, classId, mapped.wondeStudentId,
  mapped.yearGroup, mapped.senStatus, mapped.pupilPremium,
  mapped.ealStatus, mapped.fsm,
  mapped.dateOfBirth, mapped.gender, mapped.firstLanguage, mapped.ealDetailedStatus
)
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/__tests__/integration/`
Expected: All tests pass (no existing tests exercise the sync upsert SQL directly with mock D1)

- [ ] **Step 8: Commit**

```bash
git add src/services/wondeSync.js
git commit -m "feat: sync DOB, gender, language, EAL status from Wonde"
```

### Task 3: Update row mapper

**Files:**
- Modify: `src/utils/rowMappers.js`

- [ ] **Step 9: Add 4 new fields to rowToStudent()**

In `src/utils/rowMappers.js`, `rowToStudent` (lines 40-70), add after line 68 (`aiOptOut: Boolean(row.ai_opt_out),`):

```js
    dateOfBirth: row.date_of_birth || null,
    gender: row.gender || null,
    firstLanguage: row.first_language || null,
    ealDetailedStatus: row.eal_detailed_status || null,
```

- [ ] **Step 10: Commit**

```bash
git add src/utils/rowMappers.js
git commit -m "feat: add demographic fields to rowToStudent mapper"
```

---

## Chunk 2: AI Profile + Frontend

### Task 4: Add demographics to AI recommendation context

**Files:**
- Modify: `src/utils/studentProfile.js`

- [ ] **Step 11: Update the SQL query to fetch new columns**

In `buildStudentReadingProfile()` (line 21-25), change the SELECT:

From:
```sql
SELECT id, name, reading_level, reading_level_min, reading_level_max, age_range, likes, dislikes, notes
FROM students
WHERE id = ? AND organization_id = ?
```

To:
```sql
SELECT id, name, reading_level, reading_level_min, reading_level_max, age_range, likes, dislikes, notes,
       date_of_birth, gender, first_language, eal_detailed_status
FROM students
WHERE id = ? AND organization_id = ?
```

- [ ] **Step 12: Add demographics to the returned profile object**

In the return object (lines 128-147), add new fields to the `student` section (after `notes: student.notes` on line 135):

```js
    student: {
      id: student.id,
      readingLevel: student.reading_level || null,
      readingLevelMin: student.reading_level_min ?? null,
      readingLevelMax: student.reading_level_max ?? null,
      ageRange: student.age_range || null,
      notes: student.notes,
      age: student.date_of_birth
        ? Math.floor((Date.now() - new Date(student.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null,
      gender: student.gender || null,
      firstLanguage: student.first_language || null,
      ealDetailedStatus: student.eal_detailed_status || null,
    },
```

Note: `age` is calculated from DOB as integer years. The raw `date_of_birth` is NOT included — only the derived age — for privacy compliance.

- [ ] **Step 13: Run tests**

Run: `npx vitest run src/__tests__/integration/books.test.js`
Expected: The books integration test that exercises `buildStudentReadingProfile` should still pass. The test checks for `readingLevel` and other existing fields — the new fields are additive.

- [ ] **Step 14: Commit**

```bash
git add src/utils/studentProfile.js
git commit -m "feat: add age, gender, language to AI recommendation profile"
```

### Task 5: Display demographics on StudentProfile component

**Files:**
- Modify: `src/components/students/StudentProfile.js`

- [ ] **Step 15: Add a read-only demographics section to the Student Settings tab**

In `src/components/students/StudentProfile.js`, after the Name TextField (around line 315) and before the Class FormControl (around line 317), add a read-only demographics section. Only show it if the student has any demographic data populated.

```jsx
{/* Demographics (read-only, from Wonde sync) */}
{(student.dateOfBirth || student.gender || student.firstLanguage || student.ealDetailedStatus) && (
  <Box sx={{
    p: 2,
    borderRadius: '8px',
    bgcolor: '#fafaf7',
    border: '1px solid',
    borderColor: 'divider',
  }}>
    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
      Student Details
    </Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', fontSize: '0.875rem' }}>
      {student.dateOfBirth && (
        <>
          <Typography variant="body2" color="text.secondary">Age</Typography>
          <Typography variant="body2">
            {Math.floor((Date.now() - new Date(student.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} years old
          </Typography>
        </>
      )}
      {student.gender && (
        <>
          <Typography variant="body2" color="text.secondary">Gender</Typography>
          <Typography variant="body2">
            {student.gender.charAt(0).toUpperCase() + student.gender.slice(1).toLowerCase()}
          </Typography>
        </>
      )}
      {student.firstLanguage && (
        <>
          <Typography variant="body2" color="text.secondary">First Language</Typography>
          <Typography variant="body2">{student.firstLanguage}</Typography>
        </>
      )}
      {student.ealDetailedStatus && student.ealDetailedStatus !== 'Not applicable' && (
        <>
          <Typography variant="body2" color="text.secondary">EAL Status</Typography>
          <Typography variant="body2">{student.ealDetailedStatus}</Typography>
        </>
      )}
    </Box>
  </Box>
)}
```

The `student` object comes from AppContext and includes the new fields from `rowToStudent`. No additional API call needed.

- [ ] **Step 16: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 17: Run build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 18: Commit**

```bash
git add src/components/students/StudentProfile.js
git commit -m "feat: display student demographics on profile (age, gender, language, EAL)"
```

### Task 6: Update docs

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 19: Update CLAUDE.md**

In the `### Key Tables` section, update the `students` description to mention the new columns. Find the line:
```
- `students` - Organization-scoped, has `reading_level_min`/`reading_level_max` range
```
Change to:
```
- `students` - Organization-scoped, has `reading_level_min`/`reading_level_max` range, demographics from Wonde (`date_of_birth`, `gender`, `first_language`, `eal_detailed_status`)
```

Also in the `### Wonde + MyLogin Integration` section, find the line starting with `**Key tables**: ... New columns on ... `students``. Add the 4 new columns to the students column list.

- [ ] **Step 20: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with student demographic columns"
```
