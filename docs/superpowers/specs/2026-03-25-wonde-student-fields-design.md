# Wonde Student Fields: DOB, Gender, Language, EAL Status

## Context

The Wonde API provides student demographic fields that we don't currently sync. Adding date of birth, gender, first language, and detailed EAL status improves AI recommendation quality and gives teachers useful context in the student profile.

## Design

### Database Migration

New migration adds 4 columns to `students`:

```sql
ALTER TABLE students ADD COLUMN date_of_birth TEXT;
ALTER TABLE students ADD COLUMN gender TEXT;
ALTER TABLE students ADD COLUMN first_language TEXT;
ALTER TABLE students ADD COLUMN eal_detailed_status TEXT;
```

All nullable — manual (non-Wonde) students won't have these populated. The existing `eal_status` boolean column is retained; `eal_detailed_status` is the richer Wonde string.

### Wonde Sync

In `mapWondeStudent()` in `src/services/wondeSync.js`, extract from the Wonde student object:

- `student.date_of_birth.date` → parse to `YYYY-MM-DD` string (Wonde returns `{ date: "2016-09-29 00:00:00.000000", timezone_type: 3, timezone: "Europe/London" }`)
- `student.gender` → store as-is (`"FEMALE"`, `"MALE"`, or null)
- `extendedData.first_language` → store as-is (e.g. `"ENG"`, `"POL"`), fall back to `extendedData.home_language` if `first_language` is null
- `extendedData.english_as_additional_language_status` → store as `eal_detailed_status` (values: `"Not applicable"`, `"Competent"`, `"Early Acquisition"`, `"New to English"`, `"Developing Competence"`, `"Fluent"`)

The student upsert SQL in `wondeSync.js` needs the 4 new columns added to both INSERT and UPDATE statements.

### Row Mapper

`rowToStudent` in `src/utils/rowMappers.js` adds:

```js
dateOfBirth: row.date_of_birth || null,
gender: row.gender || null,
firstLanguage: row.first_language || null,
ealDetailedStatus: row.eal_detailed_status || null,
```

### AI Recommendation Context

`buildStudentReadingProfile()` in `src/utils/studentProfile.js` adds to the student context object:

- `age` — calculated from `dateOfBirth` as integer years (e.g. `8`), not the raw date (privacy: DOB is PII, age is not)
- `gender` — as-is from the student record
- `firstLanguage` — as-is
- `ealDetailedStatus` — as-is

These are included in the AI prompt context so recommendations can factor in age-appropriate content, gender diversity in suggestions, and language support needs.

### Frontend — StudentProfile Component

In `src/components/students/StudentProfile.js`, add a details section showing:

- **Age**: calculated from DOB, displayed as "X years old". Not shown if DOB is null.
- **Gender**: displayed as-is with first letter capitalised (e.g. "Female"). Not shown if null.
- **First Language**: displayed as-is. Not shown if null.
- **EAL Status**: the detailed status string. Not shown if null or "Not applicable".

These are read-only fields (populated by Wonde sync, not editable by teachers).

### Privacy

- Raw `date_of_birth` is stored in the database but **never sent to AI services** — only the calculated age integer is included in the AI recommendation context
- This aligns with the existing privacy policy: "No pupil names, dates of birth, or other identifying information are sent to AI services"
- Gender, first language, and EAL status are non-identifying demographic categories, safe for AI context
