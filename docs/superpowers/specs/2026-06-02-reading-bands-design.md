# Reading Bands — Design Spec

**Date:** 2026-06-02
**Status:** Approved in brainstorming, pending spec review
**Author:** Sam + Claude

## Summary

A **Reading Band** is a gamified *volume* rank shown on each student, climbing a
fixed colour ladder (Lilac → … → Free Reader) as the child logs reading. It is the
digital successor to the physical colour bands schools used to hand out.

Key properties, as agreed:

- **Auto-computed from reads logged this academic year** — not a teacher-assessed
  difficulty level. (Difficulty/ability is already covered by the existing AR
  reading-level range, `reading_level_min`/`max`; bands are deliberately separate.)
- **~20 reads per band**, configurable per school (`reads_per_band`, default 20).
- **Per academic year**: only reads dated on/after the academic-year start
  (default 1 September) count. The count "resets" each September simply because the
  window moves — nothing is deleted; prior years remain in `reading_sessions`.
- **Display-only**: appears as a coloured chip/progress on the student profile,
  student card/table, and parent portal. It does **not** influence book
  recommendations (AR levels continue to do that).
- **Celebrates moving up** — the emotional core of the feature. Celebration fires
  for whoever logs the qualifying read, and the **parent is always told on next
  open** even if a teacher's log caused the climb.

### Non-goals (v1)

- Not school-configurable ladder colours/names (fixed 16-band ladder in v1).
- Not feeding recommendations, gating books, or replacing AR levels.
- No band-up email/push notification (in-app celebration only).
- No teacher "while you were away" deferred celebration (immediate-on-log only for
  staff; the deferred mechanism is parent-only as requested).

## Domain model

### The ladder (fixed, v1)

An ordered list of 16 bands. With `reads_per_band = 20` the read thresholds are the
band index × 20:

| Idx | Band | Reads (≥) | | Idx | Band | Reads (≥) |
|----|------|-----|---|----|------|-----|
| 0 | Lilac | 0 | | 8 | Purple | 160 |
| 1 | Pink | 20 | | 9 | Gold | 180 |
| 2 | Red | 40 | | 10 | White | 200 |
| 3 | Yellow | 60 | | 11 | Lime | 220 |
| 4 | Blue | 80 | | 12 | Brown | 240 |
| 5 | Green | 100 | | 13 | Grey | 260 |
| 6 | Orange | 120 | | 14 | Dark Blue | 280 |
| 7 | Turquoise | 140 | | 15 | Free Reader | 300 |

- The ladder (band names + display colours) lives as a constant in a new
  `src/utils/readingBandDefinitions.js`, mirroring how `src/utils/badgeDefinitions.js`
  holds badge metadata.
- Top band ("Free Reader", index 15) is a **cap** — reads beyond 300 keep the child
  at Free Reader; no looping or overflow.
- Thresholds are derived as `index * reads_per_band`, so changing `reads_per_band`
  re-spaces the whole ladder without changing the colour list.

### What counts as a "read"

A qualifying read is a `reading_sessions` row for the student where:

- `session_date >= academicYearStart` (default the 1 September on/before today), AND
- it is not an absent/no-record marker.

Per-row contribution:

| Home-reading status | Encoding in `notes` | Counts as |
|---|---|---|
| Read | (no marker) | 1 |
| Multiple | `[COUNT:n]` | n |
| Absent | `[ABSENT]` | 0 |
| No record | `[NO_RECORD]` | 0 |

- Both `location = 'school'` and `location = 'home'` sessions count (home reading is
  exactly what we want to reward).
- A plain teacher/session-form session with no marker counts as 1.

> Implementation note: the `[COUNT:n]`, `[ABSENT]`, `[NO_RECORD]` markers are the
> existing convention (see `migrations/0037_assessment_to_integer.sql` and
> `src/components/sessions/homeReadingUtils.js`). The band counter must parse them the
> same way. A single SQL aggregate can compute the count:
> `SUM(CASE WHEN notes LIKE '%[ABSENT]%' OR notes LIKE '%[NO_RECORD]%' THEN 0
>          WHEN notes LIKE '%[COUNT:%' THEN <parsed n> ELSE 1 END)`.
> Because SQLite can't easily parse `n` inline, compute the base count in SQL and add
> the multiple-extras, or fetch the in-year marker rows and reduce in JS (volumes are
> small per student). Final approach chosen during implementation; both are acceptable.

## Data storage

### `students` (new columns — additive migration)

| Column | Type | Purpose |
|---|---|---|
| `band_reads_count` | INTEGER DEFAULT 0 | Qualifying reads in the current academic year |
| `current_band` | INTEGER DEFAULT 0 | Band index (0–15), derived from the count |
| `band_year_start` | TEXT | The academic-year-start date the count was computed against (e.g. `2025-09-01`) — used to detect a stale window and lazily reset |

### `organization_settings` (new column)

| Column | Type | Purpose |
|---|---|---|
| `reads_per_band` | INTEGER DEFAULT 20 | School-configurable threshold |

### `parent_access_tokens` (new column)

| Column | Type | Purpose |
|---|---|---|
| `parent_last_seen_band` | INTEGER DEFAULT 0 | Highest band index the parent has already been shown a celebration for |

`current_band` is the single source of truth for "where the child is now."
`parent_last_seen_band` is purely parent-view state for deferred celebration.

## Compute & update flow

### Pure engine — `src/utils/readingBandEngine.js`

Mirrors `src/utils/streakCalculator.js`. Pure, unit-testable functions:

- `computeBand(readsCount, readsPerBand, ladderLength=16)` → band index
  (`min(floor(readsCount / readsPerBand), ladderLength - 1)`).
- `academicYearStart(today, startMonth=9, startDay=1)` → ISO date of the 1 Sep
  on/before `today`.
- `bandForStudent({ readsCount, readsPerBand })` → `{ index, name, color, nextAt, toNext }`
  for display (next threshold + reads remaining; `toNext = null` at the cap).

### On session write — `src/routes/students/sessions.js`

At the same point `updateStudentStreak` runs today (session create, edit, delete):

1. Determine `academicYearStart` for "now".
2. Recompute `band_reads_count` for the student over the current window (single
   indexed aggregate using `idx_sessions_student_date`).
3. `newBand = computeBand(count, readsPerBand)`.
4. Persist `band_reads_count`, `current_band = newBand`, `band_year_start`.
5. If `newBand > oldBand`, include a `bandUp: { from, to, name, color }` object in the
   session-create response (alongside the existing badge-unlock payload).

`reads_per_band` is read via a small KV-cached org-settings getter, the same way
`getOrgStreakSettings` caches streak settings in `src/routes/students/_shared.js`.

### Lazy academic-year reset

No cron. A helper `ensureCurrentBand(student, env)` is called from the read paths
(student list/detail, parent portal) and the write path. If
`student.band_year_start` is older than the current `academicYearStart`, it recomputes
the count for the new window and persists — so the band auto-resets on the first
read or view in the new year, with no scheduled job.

### Edits & deletes

Band is always recomputed from the current count, so deleting/correcting sessions can
lower the count and the band can drop. **Celebrations only fire on an increase**;
drops are silent.

## Celebration

Reuses the existing `src/components/badges/BadgeCelebration.js` dialog and the
session-save response plumbing (which already carries badge unlocks) — no new dialog.

- **Teacher / staff (immediate):** when a register/SessionForm save returns
  `bandUp`, show the celebration for that student right away.
- **Parent (state-based, covers both cases):** the parent portal GET
  (`src/routes/parent.js`) calls `ensureCurrentBand`, then compares
  `current_band` vs `parent_last_seen_band`:
  - if `current_band > parent_last_seen_band`, return a `bandUp` payload (from
    `parent_last_seen_band` → `current_band`) **and** advance
    `parent_last_seen_band = current_band`.
  - `src/components/parent/ParentPortal.js` shows the celebration on load.
  - This single compare-on-load path handles both "the parent just logged the read
    that pushed the child up" and "a teacher's logs pushed the child up since the
    parent last looked."

## UI surfaces (all read-only)

| Surface | File | Treatment |
|---|---|---|
| Student profile / drawer | `src/components/students/StudentReadView.js` | Band chip + progress bar ("47 reads · 13 to Yellow") |
| Student card | `src/components/students/StudentCard.js` | Small colour band chip |
| Student table | `src/components/students/StudentTable.js` | Band column; optional "sort by band" |
| Parent portal | `src/components/parent/ParentPortal.js` | Prominent band + "N more reads to <next>" + celebration on climb |

A small shared `<ReadingBandChip>` / `<ReadingBandProgress>` component pair renders
the chip and progress consistently across surfaces, taking band metadata from
`readingBandDefinitions.js`.

## Settings

Add **Reads per band** (and, if desired, the academic-year start month/day) to the
existing reading settings UI (`src/components/Settings.js`, persisted via
`organization_settings`). Default 20. Changing it re-spaces the ladder; existing
`current_band` values recompute lazily on next read/write.

## Backfill (one-time, at deploy)

A migration/script step derives, for each existing student:

- `band_reads_count` = qualifying reads in the current academic year,
- `current_band` = `computeBand(...)`,
- `band_year_start` = current academic-year start.

And sets each active `parent_access_tokens.parent_last_seen_band = current_band` for
the student, so existing parents are **not** spammed with a celebration for a band the
child already holds. (New climbs after deploy celebrate normally.)

## Data flow (summary)

```
session create/edit/delete (teacher or parent)
        │
        ▼
ensureCurrentBand → recompute in-year count → computeBand → persist students.{band_reads_count,current_band,band_year_start}
        │
        ├─ staff log: if newBand>oldBand → bandUp in response → BadgeCelebration
        │
        ▼
parent portal GET → ensureCurrentBand → if current_band > parent_last_seen_band
        → bandUp payload + advance parent_last_seen_band → BadgeCelebration on load
```

## Testing

**Unit — `readingBandEngine`:**
- `computeBand`: 0 reads → Lilac; exactly 20 → Pink; 47 @ 20 → Red; 300 → Free Reader;
  10 000 → still Free Reader (cap); `reads_per_band = 5` re-spaces correctly.
- "What counts as a read": read=1, `[COUNT:3]`=3, `[ABSENT]`/`[NO_RECORD]`=0; home and
  school both count.
- `academicYearStart`: dates in Aug vs Sep resolve to the correct 1 Sep boundary.

**Integration:**
- Session round-trip: logging reads across a threshold returns `bandUp`; logging below
  it does not; deleting reads lowers the band without a celebration.
- Lazy reset: a student with `band_year_start` in a prior year recomputes to the new
  window on next read/view.
- Parent deferred celebration: `current_band > parent_last_seen_band` on portal load
  returns `bandUp` and advances the marker; a second load does not re-celebrate.

## Files touched (estimate)

- **New:** `src/utils/readingBandDefinitions.js`, `src/utils/readingBandEngine.js`,
  `src/components/students/ReadingBandChip.js` (+ progress), migration
  `migrations/0059_reading_bands.sql`, tests.
- **Edited:** `src/routes/students/sessions.js`, `src/routes/students/_shared.js`
  (settings getter), `src/routes/parent.js`, `src/data/d1Provider.js` +
  `src/utils/rowMappers.js` (`rowToStudent` mapping for new columns),
  `src/components/students/{StudentReadView,StudentCard,StudentTable}.js`,
  `src/components/parent/ParentPortal.js`, `src/components/Settings.js`.

## Open questions (none blocking)

- Academic-year start: ship a fixed 1 Sep default; optionally source it from the
  existing `term_dates` table later.
- Whether the student table gets a "sort by band" control in v1 or later.
