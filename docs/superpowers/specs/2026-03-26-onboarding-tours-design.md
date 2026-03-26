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

When a user completes or skips a tour, the row is upserted. On page load, the frontend checks: does a completion row exist for this `tour_id` at the current version? If not, auto-show the tour.

### API

New route file: `src/routes/tours.js`

- `GET /api/tours/status` — Returns all completed tours for the authenticated user: `[{tourId, version}]`. Called once on login alongside existing settings fetch.
- `POST /api/tours/:tourId/complete` — Marks a tour as completed. Body: `{version}`. Upserts `user_tour_completions`.

Both endpoints are scoped to the authenticated user (no org filtering needed — it's per-user). Requires `READONLY` or above (any authenticated user).

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

**Visual:** 40px circle, frosted glass background, `ExploreOutlined` icon in sage green. Positioned fixed, bottom-right, above the 80px bottom nav (approximately `bottom: 96px, right: 16px`).

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
      { target: '<selector>', title: '...', content: '...' },
      // ...
    ]
  },
  // ...
};
```

Each step has: `target` (CSS selector for the element to highlight), `title`, `content`, and optional `placement` (tooltip position relative to target).

### `src/components/tour/useTour.js`

Custom hook called by each page component:

```js
useTour('students');
```

**Behaviour:**
- On mount, checks `completedTours` from context against `TOURS['students'].version`
- If not completed at current version → calls `startTour('students')` after a short delay (500ms, to let the page render targets)
- Returns `{ startTour, isTourAvailable }` for the TourButton to use

This keeps page components clean — they add one hook call and nothing else.

## Tour Content (v1)

### Students Page (`students`)

| Step | Target | Title | Content |
|------|--------|-------|---------|
| 1 | Status filter chips | Filter by Status | Filter students by reading status. Red means not read recently, orange needs attention, green is on track. |
| 2 | Search bar | Search Students | Search for any student by name to find them quickly. |
| 3 | Priority students list | Priority List | Tap a student here to bump them to the top of your list — great for tracking who needs attention today. |
| 4 | Student row | Student Details | Tap any student to see their reading history, edit their profile, and adjust their preferences. |

### Session Form (`session-form`)

| Step | Target | Title | Content |
|------|--------|-------|---------|
| 1 | Student selector | Pick a Student | Choose a student to record a reading session. Recently accessed students are starred. |
| 2 | Book autocomplete | Find a Book | Search your school's book library, or type a new title to add it. |
| 3 | Location toggle | Reading Location | Mark whether this was a school or home reading session. |
| 4 | Assessment selector | Rate the Reading | Rate how the student read — this tracks their progress over time. |
| 5 | Save button | Save Session | Save the session. You can always come back and edit or add notes. |

### Home Reading Register (`home-reading`)

| Step | Target | Title | Content |
|------|--------|-------|---------|
| 1 | Date range presets | Choose Dates | Choose a date range — This Week is great for daily check-ins. |
| 2 | Register table | The Register | Each cell is a student and date. Tap to record their reading for that day. |
| 3 | Status buttons | Record Reading | Mark as Read, Multiple sessions, Absent, or No Record. Quick taps for the whole class. |
| 4 | Daily totals footer | Daily Totals | See at a glance how many students read each day. |

### Reading Stats (`stats`)

| Step | Target | Title | Content |
|------|--------|-------|---------|
| 1 | Summary cards | Key Numbers | Your key numbers: total students, sessions, averages, and who hasn't read yet. |
| 2 | This Week's Activity card | Weekly Trend | See if reading is trending up or down compared to last week. |
| 3 | Tabs | Explore More | Switch between Overview, Streaks, Books, and more for deeper insights. |

## Integration Points

### App.js

Wrap the main app content with `<TourProvider>` inside the existing `<AppContext.Provider>`. TourProvider needs access to `completedTours` and `markTourComplete` from AppContext.

### Page Components

Each page component adds one line:

```js
const { tourButtonProps } = useTour('students');
// ... render <TourButton {...tourButtonProps} /> in the page
```

### Worker Routes (src/worker.js)

Register tour routes: `app.route('/api/tours', toursRoute)`. These are authenticated routes (not public).

### Database Migration

New migration file: `migrations/XXXX_user_tour_completions.sql`

## Dependencies

- **react-joyride** (npm) — guided tour library, ~15KB gzipped. Handles element highlighting, scroll-to-target, overlay, tooltip positioning, and step management.

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
