# Collaborative Class Goals — Design Spec

**Date**: 2026-04-08
**Status**: Approved
**Context**: The individual badge system (v3.42.0) provides per-student achievements. This spec adds collaborative class-level goals as the anti-competition counterpart — the class works together toward shared targets rather than competing individually. Grounded in the safeguards from the badge research: "replace competitive leaderboards with collaborative class goals."

## Summary

Teachers set (or accept auto-generated) class-wide reading targets for sessions, genres explored, and unique books read. Progress is tracked collectively — every student's reading contributes. A "Display Mode" provides a fullscreen, kid-friendly projection view for interactive whiteboards, with confetti celebrations when goals are reached. The class garden evolves through stages as goals are completed.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Goal creation | System auto-generates defaults, teacher can customise | Sensible defaults mean zero config; teacher override respects their knowledge of the class |
| Metrics | Three parallel goals: sessions, genres, books | Multiple metrics give texture; parallel (not combined) avoids frustration from one lagging metric |
| Goal independence | Each metric celebrated independently | Hitting sessions but not genres is still a win worth celebrating |
| UI surface | AchievementsTab + fullscreen display mode | No new nav tab; display mode serves the classroom projection use case |
| Attribution | Class-level only, never individual | Core anti-competition safeguard — "our class did this", not "Alice pushed us over" |
| Garden evolution | Tied to goals completed (0–3) | Separates class garden (goal-driven) from individual garden (badge-driven) |

## Data Model

### New table: `class_goals`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | TEXT PK | Goal ID (generated UUID) |
| `organization_id` | TEXT NOT NULL FK → organizations | Tenant scoping |
| `class_id` | TEXT NOT NULL FK → classes | Which class |
| `metric` | TEXT NOT NULL | `sessions`, `genres`, or `books` |
| `target` | INTEGER NOT NULL | Target value (e.g. 500) |
| `current` | INTEGER DEFAULT 0 | Denormalized progress counter |
| `term` | TEXT | Period label (e.g. "Spring 2026") |
| `achieved_at` | TEXT | NULL until target hit, then ISO timestamp |
| `created_at` | TEXT DEFAULT (datetime('now')) | When the goal was created |

**Indexes**: `idx_class_goals_class` on `(class_id)`, `idx_class_goals_org` on `(organization_id)`.

**Constraints**: One row per `(class_id, metric, term)` — enforced via `UNIQUE(class_id, metric, term)`.

**Update path**: `current` is updated in the same DB transaction as session create/update/delete — same pattern as `student_reading_stats`. When `current >= target` and `achieved_at` is NULL, set `achieved_at` to now.

**Drift correction**: The nightly cron at 2:30 AM recalculates `current` from source data (sessions table, books table, genres table) after badge evaluation. Same pattern as `recalculateStats()`.

### No changes to existing tables

Reads from `students` (class membership), `reading_sessions`, `books` (for unique count and genre IDs via `json_each`), and `term_dates` (for term resolution).

## Term Resolution

The `term` column uses the format `"{half_term} {academic_year}"`, e.g. `"Spring 1 2025/26"`. This maps directly to the `term_dates` table which has `term_name` (`'Autumn 1'`, `'Autumn 2'`, `'Spring 1'`, `'Spring 2'`, `'Summer 1'`, `'Summer 2'`) and `academic_year` (`'2025/26'`).

Goals span a single half-term. The current half-term is resolved by finding the `term_dates` row where today falls between `start_date` and `end_date` for the class's organization. If no term dates are configured, fall back to the current calendar quarter (Q1 = "Q1 2026", etc.).

New goals are auto-created when the GET endpoint detects no goals for the current half-term. When a new half-term starts, the old goals remain as a historical record and fresh goals are generated.

## Auto-Generation Defaults

When `GET /api/classes/:classId/goals` finds no goals for the current half-term, it creates defaults.

**Class size** is `COUNT(*) FROM students WHERE class_id = ? AND organization_id = ?` (all students assigned to the class, regardless of session history).

| Metric | Formula | Example (26 students) |
|--------|---------|----------------------|
| `sessions` | `classSize * 20` | 520 |
| `genres` | `10` (fixed — genre count is school-wide) | 10 |
| `books` | `classSize * 4` | 104 |

## API Design

### New endpoints

All behind existing JWT auth. Minimum role: teacher (via `requireTeacher()`).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/classes/:classId/goals` | Get goals for current term (auto-creates defaults if none exist) |
| `PUT` | `/api/classes/:classId/goals` | Update targets (teacher edits goal values) |

**`GET` response:**
```json
{
  "goals": [
    { "id": "uuid", "metric": "sessions", "target": 520, "current": 204, "achievedAt": null },
    { "id": "uuid", "metric": "genres", "target": 10, "current": 10, "achievedAt": "2026-03-15T14:30:00Z" },
    { "id": "uuid", "metric": "books", "target": 104, "current": 42, "achievedAt": null }
  ],
  "term": "Spring 1 2025/26",
  "gardenStage": "sprout",
  "goalsCompleted": 1
}
```

**`PUT` request body:**
```json
{
  "goals": [
    { "metric": "sessions", "target": 600 },
    { "metric": "genres", "target": 12 },
    { "metric": "books", "target": 120 }
  ]
}
```

### Modified endpoints

**`POST /api/students/:id/sessions`** — After updating `student_reading_stats` and evaluating badges, also update `class_goals.current` for the student's class. If any goal crosses its target (`current >= target` and `achieved_at` was NULL), include `completedGoals` in the response:

```json
{
  "session": { "..." },
  "newBadges": [ "..." ],
  "completedGoals": [
    { "metric": "genres", "target": 10, "current": 10 }
  ]
}
```

`PUT` on sessions — same recalculation, may produce `completedGoals`.

`DELETE` on sessions — recalculates counters (may decrease `current`) but never produces `completedGoals` (counters only go down on delete). If a previously achieved goal's `current` drops below `target`, `achieved_at` is **not** cleared — achievements are permanent once earned, same as individual badges.

**Nightly cron (2:30 AM)** — After badge evaluation, recalculate `class_goals.current` for all active classes from source data. Piggybacks on the existing `30 2 * * *` cron trigger in `wrangler.toml` (no new trigger needed). This corrects any drift from edge cases (e.g. student moved between classes, session deleted directly).

**Class reassignment**: When a student moves between classes, the real-time session handler uses the student's current `class_id` only. The nightly cron corrects the old class's counters during drift recalculation. This avoids complex multi-class updates on every session write.

### Recalculation logic

For a given class and term:

- **`sessions`**: `COUNT(DISTINCT rs.id)` from `reading_sessions` WHERE student is in class AND session date is within term dates. Excludes marker sessions (`[ABSENT]`, `[NO_RECORD]`).
- **`genres`**: `COUNT(DISTINCT je.value)` from `reading_sessions rs` JOIN `books b ON rs.book_id = b.id` cross-join `json_each(b.genre_ids) je` WHERE student is in class AND session date is within term AND `b.genre_ids IS NOT NULL`. Uses SQLite `json_each()` to unnest the JSON array of genre IDs stored in `books.genre_ids`. Counts distinct genres the class has collectively encountered.
- **`books`**: `COUNT(DISTINCT rs.book_id)` from `reading_sessions` WHERE student is in class AND `book_id IS NOT NULL` AND session date is within term.

## Frontend Components

### Modified: `AchievementsTab.js`

Add a "Class Goals" section at the top, above existing badge accordions:

- Three progress bars (sessions, genres, books) with `current / target` labels
- Completed goals show filled bar with green "Goal reached!" chip
- "Edit Goals" button → opens `ClassGoalsEditor` modal
- "Display Mode" button in tab header → opens `ClassGoalsDisplay` overlay
- Class garden stage derived from `goalsCompleted` (0=seedling, 1=sprout, 2=bloom, 3=full garden)

Fetches from `GET /api/classes/:classId/goals` using the global class filter. If class filter is "All Classes", show a message prompting the teacher to select a class.

### New: `ClassGoalsEditor.js`

MUI Dialog with three number inputs:
- Sessions target
- Genres target
- Books target

Pre-populated with current values. "Reset to defaults" link recalculates from class size. Save calls `PUT /api/classes/:classId/goals`.

**Raising a target above an achieved goal**: If the teacher increases a target on a completed goal (e.g. current=10, old target=10, new target=15), `achieved_at` is cleared and the goal returns to in-progress. The garden stage recalculates accordingly. This lets teachers stretch goals mid-term without losing the ability to celebrate hitting the new target.

### New: `ClassGoalsDisplay.js`

Fullscreen MUI Dialog (or portal overlay) with:

- Dark background (`#2D2A24` → `#3D3427` gradient) — high contrast for projectors
- Class name header: "10A/Co1's Reading Journey"
- Term label: "Spring Term 2026"
- Class garden illustration: `GardenHeader` component rendered at 2x scale, stage from `goalsCompleted`
- Three large progress bars with big numbers (18–24px text)
- Completed goals show "Goal reached!" badge
- Close via Escape key or X button
- Confetti animation (reuse whatever approach `BadgeCelebration` uses — no new dependencies) when a goal has `achievedAt` within last 24 hours
- Auto-refreshes data every 30 seconds so progress updates live if another device is logging sessions

No teacher chrome — designed to be projected on an interactive whiteboard with children present.

### Modified: `HomeReadingRegister.js` / `SessionForm.js`

When a session save response includes `completedGoals` (non-empty array):

- Show a celebration banner/toast: "Your class just hit [target] [metric]!" with confetti
- Auto-dismiss after 5 seconds or on click
- If both `newBadges` and `completedGoals` exist, show badge celebration first, then class goal celebration

### Modified: `DataContext.js`

`addReadingSession` already returns the full API response (including `newBadges`). The `completedGoals` field passes through without changes — same pattern.

## Celebration & Garden Evolution

### When a goal is reached

1. **During session recording** — If the session tips a goal over, a banner slides in with confetti: "Your class just hit 500 reading sessions!" Teacher can share the moment live with the class.

2. **In Display Mode** — Confetti animation, progress bar pulses, "Goal reached!" badge appears. If the teacher has display mode projected when a goal completes, the celebration is visible to the whole class.

3. **In AchievementsTab** — Completed goals show filled bar with green chip. No animation (teacher may see it hours later).

### Garden stage progression

| Goals Completed | Stage | Visual |
|----------------|-------|--------|
| 0 | Seedling | Bare soil, single seedling |
| 1 | Sprout | Small plants, butterfly |
| 2 | Bloom | Flowers, small tree, bird |
| 3 (all) | Full Garden | Lush garden with trees, flowers, creatures |

Reuses existing `GardenHeader` component. Currently `GardenHeader` takes `badgeCount` and `studentName` and calculates stage internally. Add an optional `stage` prop that bypasses the internal threshold logic, and an optional `label` prop that overrides the subtitle (e.g. "10A/Co1's Reading Garden" instead of "Alice's Reading Garden"). In display mode, pass a `size="large"` prop or render at 2x scale via CSS transform.

### Anti-competition safeguard

Goal celebrations are always class-level: "Our class reached 500 sessions!" — never "Alice's session pushed us over." No individual attribution in the UI. The goal data has no per-student breakdown; it's aggregate only.

## Testing Strategy

### Unit tests

| File | Coverage |
|------|----------|
| `classGoals.test.js` | Auto-generation defaults (correct formulas for different class sizes). Recalculation logic (sessions excludes markers, books requires non-null book_id, genres counts distinct). Goal completion detection (`achieved_at` set when `current >= target`). |

### Integration tests

| File | Coverage |
|------|----------|
| `classGoalsApi.test.js` | GET auto-creates defaults. PUT updates targets. Session create updates progress. Goal completion returns `completedGoals` in response. Tenant isolation. Drift correction in recalculation. |

### Not tested

Display mode rendering (visual). Confetti animation (decorative). Component tests only if non-trivial logic.

## Infrastructure Integration

### Modified infrastructure files

| File | Change |
|------|--------|
| `src/services/orgPurge.js` | Add `class_goals` to `DELETE_ORDER` array (before `classes`, after `student_badges`) |
| `src/services/demoReset.js` | Add `class_goals` to delete array and optionally seed demo goals for Learnalot |
| `src/worker.js` | Add class goals recalculation after badge evaluation in existing 2:30 AM cron handler |
| `src/utils/rowMappers.js` | Add `rowToClassGoal` mapper |

## Scope Boundary

**In scope**: Goal CRUD, auto-generation, progress tracking, display mode, confetti celebrations, garden evolution, orgPurge/demoReset integration.

**Out of scope** (future): Goal history/archive across terms, class-vs-class comparisons (explicitly avoided — anti-competition), "Class Champion" individual badge (needs further design to avoid singling out students), printable goal certificates.
