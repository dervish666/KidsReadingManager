# Onboarding Tours Design

**Date**: 2026-03-26
**Status**: Draft

## Summary

Per-page guided tours that auto-show on a teacher's first visit to each page, highlighting 3-5 key UI elements with sequential tooltips. A persistent replay button (compass icon) lets users retrigger tours at any time — useful when iPads are shared between staff.

## Goals

- Help teachers understand each page on their first visit without external documentation
- Keep tours brief (3-5 steps) so they don't interrupt workflow
- Support iPad sharing — any user can replay a tour via the button
- Track completion server-side per user so tours don't repeat across devices
- Support versioning so tours can be re-shown when features change significantly

## Non-Goals

- Readonly users (v2)
- Book Recommendations, Book Library, Settings page tours (v2)
- Multi-step onboarding wizards or welcome screens
- Admin-specific tour content (pages self-scope by role — admins see admin pages, teachers don't)

## Architecture

### Data Model

One new table:

```sql
CREATE TABLE user_tour_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tour_id TEXT NOT NULL,
  tour_version INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, tour_id)
);
```

When a user completes or skips a tour, upsert the row using `INSERT INTO user_tour_completions (user_id, tour_id, tour_version, completed_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, tour_id) DO UPDATE SET tour_version = excluded.tour_version, completed_at = excluded.completed_at`. This handles version bumps — when a tour version increases, re-completion overwrites the old row.

### API

New route file: `src/routes/tours.js`

- `GET /api/tours/status` — Returns all completed tours for the authenticated user: `[{tourId, version}]`. Called once during initial auth setup (in the `useEffect` that runs after token validation), not in `reloadDataFromServer()` — tour status doesn't need re-fetching during org switching or data imports.
- `POST /api/tours/:tourId/complete` — Marks a tour as completed. Body: `{version}`. Upserts `user_tour_completions`.

Both endpoints are scoped to the authenticated user (no org filtering needed — it's per-user). Requires `READONLY` or above (any authenticated user).

**Row mapper:** Add `rowToTourCompletion` to `src/utils/rowMappers.js` to convert `snake_case` DB columns (`tour_id`, `tour_version`, `completed_at`) to `camelCase` response fields (`tourId`, `version`, `completedAt`). The `GET` response shape is `[{tourId: string, version: number}]`.

### Frontend State

Add to `AppContext`:

- `completedTours` — `Map<string, number>` mapping `tourId` to completed `version`
- `markTourComplete(tourId, version)` — calls `POST /api/tours/:tourId/complete`, updates local state

Fetched once during the existing auth initialization flow.

## Component Architecture

### `src/components/tour/TourProvider.js`

Wraps the app inside `AppContext`. Provides tour context to all children.

**Responsibilities:**
- Holds react-joyride instance and current tour state (`running`, `stepIndex`, `currentTourId`)
- Exposes `startTour(tourId)` and `isTourAvailable(tourId)` via `TourContext`
- Renders the react-joyride `<Joyride>` component with custom tooltip
- Handles joyride callbacks: step change, tour complete, tour skipped → calls `markTourComplete`

**Custom tooltip component:** Glassmorphism style matching the app's cozy aesthetic:
- Frosted glass background (`rgba(255, 254, 249, 0.92)`, `backdrop-filter: blur(20px)`)
- Sage green title text (`#6B8E6B`)
- Warm gray body text (`#7A7A7A`)
- Progress dots (active dot is elongated pill, sage green)
- Back button (sage tint background), Next button (sage gradient), Skip link (gray text)
- 16px border radius, subtle warm shadow
- Min touch target 48px on all buttons

### `src/components/tour/TourButton.js`

Floating replay button, rendered per-page.

**Visual:** 40px circle, frosted glass background, `ExploreOutlined` icon in sage green. Positioned fixed, bottom-right, above the 80px bottom nav. Bottom offset must account for `env(safe-area-inset-bottom)` to avoid overlap on iPhones with home indicators: `bottom: calc(96px + env(safe-area-inset-bottom, 0px))`, `right: 16px`.

**Behaviour:**
- Gentle pulse animation when the page's tour hasn't been completed (first visit, or version bumped)
- Static (no pulse) after tour completion
- On tap: calls `startTour(tourId)` to replay the tour
- Only renders on pages that have a defined tour

### `src/components/tour/tourSteps.js`

Pure data file. Exports tour definitions:

```js
export const TOURS = {
  'students': {
    version: 1,
    steps: [
      { target: '[data-tour="students-priority-list"]', title: '...', content: '...' },
      // ...
    ]
  },
  // ...
};
```

Each step has: `target` (CSS selector using `data-tour` attributes), `title`, `content`, and optional `placement` (tooltip position relative to target).

**Tour target convention:** Add `data-tour="<tourId>-<step-name>"` attributes to target elements in each page component. This keeps tour selectors decoupled from component structure and avoids reliance on fragile CSS class or DOM position selectors. See the Tour Content section below for the full mapping of `data-tour` attributes to component files.

### `src/components/tour/useTour.js`

Custom hook called by each page component:

```js
useTour('students');
```

**Behaviour:**
- On mount, checks `completedTours` from context against `TOURS['students'].version`
- If not completed at current version → calls `startTour('students')` after a short delay (500ms, to let the page render targets)
- **Empty state guard:** Does not auto-start if the page is in an empty/loading state (e.g., Students page with no students shows an empty state and none of the tour target elements exist). The hook accepts an optional `ready` boolean that page components can pass to indicate tour targets are in the DOM. Defaults to `true` for pages that always render their targets.
- Returns `{ startTour, isTourAvailable, tourButtonProps }` for the page to use

Page components call the hook and render the button:

```js
const { tourButtonProps } = useTour('students', { ready: students.length > 0 });
// ... render <TourButton {...tourButtonProps} /> in the page
```

This keeps page components clean — one hook call and one button render.

## Tour Content (v1)

### Students Page (`students`)

Steps ordered top-to-bottom matching the visual layout. Add `data-tour` attrs in `src/components/students/StudentList.js`.

| Step | `data-tour` attribute | Target element | Title | Content |
|------|----------------------|----------------|-------|---------|
| 1 | `students-priority-list` | `PrioritizedStudentsList` container | Priority List | Tap a student here to bump them to the top of your list — great for tracking who needs attention today. |
| 2 | `students-search` | Search TextField (`aria-label="Search students"`) | Search Students | Search for any student by name to find them quickly. |
| 3 | `students-status-filters` | Box wrapping all status filter Chips | Filter by Status | Filter students by reading status. Red means not read recently, orange needs attention, green is on track. |
| 4 | `students-row` | First `TableRow` in StudentTable body (or first `StudentCard`) | Student Details | Tap any student to see their reading history, edit their profile, and adjust their preferences. |

**Empty state:** Pass `ready={students.length > 0}` to `useTour` — when no students exist, tour targets don't render.

### Session Form (`session-form`)

Add `data-tour` attrs in `src/components/sessions/SessionForm.js`.

| Step | `data-tour` attribute | Target element | Title | Content |
|------|----------------------|----------------|-------|---------|
| 1 | `session-student-select` | Student Select (`id="student-select"`) | Pick a Student | Choose a student to record a reading session. Recently accessed students are marked for quick access. |
| 2 | `session-book-select` | BookAutocomplete container | Find a Book | Search your school's book library, or type a new title to add it. |
| 3 | `session-location` | ToggleButtonGroup (School/Home) | Reading Location | Mark whether this was a school or home reading session. |
| 4 | `session-assessment` | AssessmentSelector container | Rate the Reading | Rate how the student read — this tracks their progress over time. |
| 5 | `session-save` | Save button (`type="submit"`) | Save Session | Save the session. You can always come back and edit or add notes. |

### Home Reading Register (`home-reading`)

Add `data-tour` attrs in `src/components/sessions/HomeReadingRegister.js`.

| Step | `data-tour` attribute | Target element | Title | Content |
|------|----------------------|----------------|-------|---------|
| 1 | `register-date-range` | Date preset FormControl/Select | Choose Dates | Choose a date range — This Week is great for daily check-ins. |
| 2 | `register-table` | Main Table element | The Register | Each cell is a student and date. Tap to record their reading for that day. |
| 3 | `register-totals` | TableFooter / daily totals row | Daily Totals | See at a glance how many students read each day. |

Note: The status buttons (Read/Multiple/Absent/No Record) only render when a student is selected, so they can't be a tour target on first visit. The table step (#2) covers the interaction concept. Status buttons could be added as a contextual tip in v2.

### Reading Stats (`stats`)

Add `data-tour` attrs in `src/components/stats/ReadingStats.js`.

The Tabs component renders above the tab content. Summary cards and weekly activity are inside the Overview tab content, so they only exist when `currentTab === 0`. Since the tour auto-starts on first visit (which defaults to Overview tab), this is safe. React-joyride's `scrollToFirstStep` ensures visibility.

| Step | `data-tour` attribute | Target element | Title | Content |
|------|----------------------|----------------|-------|---------|
| 1 | `stats-tabs` | Tabs component (Overview/Streaks/Books/etc.) | Different Views | Switch between Overview, Streaks, Books, and more for deeper insights. |
| 2 | `stats-summary-cards` | Grid container holding the 4 summary cards (inside Overview tab) | Key Numbers | Your key numbers: total students, sessions, averages, and who hasn't read yet. |
| 3 | `stats-weekly-activity` | This Week's Activity Card (inside Overview tab) | Weekly Trend | See if reading is trending up or down compared to last week. |

Note: Steps 2-3 depend on the Overview tab being active. The tour starts on first visit which defaults to Overview. If the user replays the tour from a different tab, `TourProvider` should switch to the Overview tab before starting (or the tour should only target the always-visible Tabs element).

## Integration Points

### App.js

Wrap the main app content with `<TourProvider>` inside the existing `<AppContext.Provider>`. TourProvider needs access to `completedTours` and `markTourComplete` from AppContext.

### Page Components

Each page component adds the hook and button:

```js
const { tourButtonProps } = useTour('students', { ready: students.length > 0 });
// ... render <TourButton {...tourButtonProps} /> in the page
```

### Worker Routes (src/worker.js)

Register tour routes: `app.route('/api/tours', toursRoute)`. These are authenticated routes (not public).

### Database Migration

New migration file: `migrations/0041_user_tour_completions.sql`

## Dependencies

- **react-joyride** (npm) — guided tour library, ~15KB gzipped. Handles element highlighting, scroll-to-target, overlay, tooltip positioning, and step management. Should be lazy-loaded inside `TourProvider` using dynamic `import()` — the `<Joyride>` component is only rendered when a tour is actively running, so the module can be loaded on demand when `startTour` is called. This keeps react-joyride out of the initial bundle.

## Visual Design Summary

- **Tooltip**: Glassmorphism — frosted glass background, sage green title, warm gray body, progress dots, Back/Next/Skip controls with 48px+ touch targets
- **Overlay**: Semi-transparent backdrop dimming non-highlighted areas
- **Tour button**: 40px circle, frosted glass, `ExploreOutlined` compass icon in sage green, gentle pulse animation when tour is unseen, fixed bottom-right above nav
- **Progress**: Elongated pill dot for current step, small circles for others

## Future Work (v2)

- Tours for Book Recommendations, Book Library, Settings pages
- Readonly user tours
- "What's New" mechanism for feature announcements (could reuse tour infrastructure)
- Hide Add Student / Bulk Import buttons for Wonde-connected schools (separate bug fix)
