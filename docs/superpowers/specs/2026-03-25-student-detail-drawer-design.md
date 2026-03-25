# Student Detail Drawer — Design Spec

## Summary

Replace the current two-dialog student detail experience (StudentSessions + StudentProfile) with a single slide-in drawer. Clicking a student row opens a right-anchored drawer with a full-width header bar, a preferences sidebar, and a session timeline — providing a unified, glanceable view of each pupil.

## Problem

The current student detail UX has several issues:

1. **Two separate modals** — clicking a row opens sessions; a tiny action button opens the profile. Users don't discover the profile easily.
2. **Demographic fields are buried** — age, gender, language, and EAL status (recently added from Wonde sync) are hidden inside the profile modal's settings tab.
3. **No unified view** — teachers can't see student details and reading history at the same time.
4. **Delete student action is exposed** — risky for Wonde-synced schools where the student would just reappear on next sync.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Container | Slide-in drawer (right-anchored) | Consistent with SchoolDrawer pattern; keeps student list visible |
| Layout | Full-width header + split below (30/70) | Maximises timeline space; horizontal chips are scannable |
| Primary use case | Read-only glance, then sessions | Teachers want to see the pupil at a glance, then work with sessions |
| Mobile behaviour | Tabbed (Details / Sessions) | Preserves full-width usability on iPad/mobile |
| Edit mode | Replaces sidebar content; timeline stays visible | Secondary action, shouldn't dominate the view |
| Delete student | Removed entirely | Dangerous for Wonde schools; comes back on next sync anyway |
| Session display | Compact vertical timeline, click to expand | Combines timeline's visual pattern-spotting with compact row density |

## Structure

### Drawer Container

- MUI `Drawer` component, `anchor="right"`
- Width: responsive — `{ xs: '100%', sm: '100%', md: 800, lg: 900 }`. On screens below `md`, the drawer is full-screen.
- Three zones: header bar, left sidebar (30%), right timeline panel (70%)
- On mobile/tablet (below `md`): full-screen with two tabs — "Details" and "Sessions"
- Focus management: MUI Drawer's built-in focus trap handles accessibility. On close, focus returns to the triggering student row.

### Header Bar (Full Width)

Read-only summary spanning the drawer width.

**Left side:**
- Student name (`Typography variant="h6"`, bold)
- Class name as a subtle chip
- `StreakBadge` component (only if `currentStreak > 0`)

**Second row — demographic chips** (only rendered when data exists):
- Age (calculated from `dateOfBirth`) — e.g. "12 years"
- Gender — e.g. "Male"
- Reading level range — e.g. "Level 3.2–5.8" (blue-tinted chip)
- First language (only if not English) — e.g. "First Language: Polish"
- EAL status (only if not "Not applicable") — e.g. "EAL: New to English" (amber chip)

**Right side:**
- "Edit" button (outlined, sage green)
- Close (X) icon button

**Processing restricted indicator:** If `student.processingRestricted` is true, show a prominent "Restricted" chip (red background, matching existing `StudentCard` styling) in the header's first row, next to the class chip. In this state, the Edit button is hidden — restricted students' data should not be modified.

**Chip palette:**
- Sage green (`#E5F0E5` / `#6B8E6B`) — standard info (age, gender)
- Blue tint (`#E8EAF6` / `#3949AB`) — reading level (academic metric)
- Amber (`#FFF3E0` / `#E65100`) — EAL-related flags
- Demographics are always read-only (sourced from Wonde)

### Left Sidebar (~30%) — Preferences & Stats

Read-only summary cards stacked vertically, each with warm white background and subtle border:

1. **Genres card** — "Favourite Genres" label + genre name chips. "None set" if empty.
2. **Likes card** — Book titles the student enjoys, as chips or simple list. "None set" if empty.
3. **Dislikes card** — Same format for avoided books.
4. **Stats card** — Total sessions count, last read date, best streak.

**Empty state:** If no preferences are set (common for newly synced Wonde students), show a single friendly message: "No reading preferences yet" with a subtle pointer toward the Edit button.

### Right Panel (~70%) — Session Timeline

Scrollable, independent of sidebar and header.

**Timeline structure:**
- Vertical line on the left (warm beige `#d4c9b8`)
- Dot markers at each session:
  - Sage green dots for recent sessions (within streak/recent threshold)
  - Beige dots for older sessions
- Each session row (compact, one line):
  - Date (short format: "24 Mar")
  - Book title
  - Assessment score as coloured pill: green (7–10), amber (4–6), red (1–3)
- **Click to expand** a session row to reveal:
  - Location (school/home)
  - Notes
  - Edit and delete action buttons for that session
- **Session edit/delete:** Clicking edit opens a sub-dialog (MUI Dialog on top of the Drawer), matching the SchoolDrawer pattern which uses confirmation dialogs over the drawer. The existing edit dialog fields (date, book, location, assessment, notes) and delete confirmation dialog are preserved.

**Sorting:** Newest first. Absent/no-record entries filtered out (preserving current behaviour).

**Loading state:** While sessions are being fetched, show a centred `CircularProgress` spinner in the timeline panel.

**Empty state:** "No reading sessions recorded yet" — centred message.

### Edit Mode

Triggered by the "Edit" button in the header.

**Header transforms:**
- "Edit" button replaced by "Save" (filled) + "Cancel" (text) buttons
- Demographic chips remain read-only

**Left sidebar replaced with editable form:**
- Name (`TextField`)
- Class (`Select` dropdown)
- Reading Level Range (`ReadingLevelRangeInput` component)
- Favourite Genres (multi-select with "Add New Genre")
- Likes / Dislikes (`BookAutocomplete` to add, chips with delete × to remove)
- AI Opt-Out toggle (at bottom)

**Right panel (timeline) stays visible and unchanged** — browse sessions while editing.

**Mobile edit mode:** The "Details" tab shows the edit form. "Sessions" tab remains accessible.

**Cancel:** Discards changes, returns to read-only view.
**Save:** Persists all changes, returns to read-only view.

## Components Affected

### New Components
- `StudentDetailDrawer` — the main drawer component orchestrating header, sidebar, timeline, and edit mode
- `StudentTimeline` — the compact vertical timeline for sessions (extracted for clarity)

### New Sub-Components (following SchoolDrawer pattern)
- `StudentReadView` — read-only sidebar content (genres, likes, dislikes, stats cards)
- `StudentEditForm` — edit mode sidebar content (name, class, reading level, genres, likes/dislikes, AI opt-out)

### Modified Components
- `StudentTable` — remove Actions column and `PsychologyIcon` button; row click opens drawer instead of StudentSessions dialog. The "mark as reading today" book icon in each row is preserved as-is (it's in the Student name cell, not the Actions column).
- `StudentCard` — remove `PsychologyIcon` button; card click opens drawer instead of StudentSessions dialog
- `BookRecommendations` — currently imports `StudentProfile` for editing reading preferences. Replace with opening the `StudentDetailDrawer` in edit mode, or extract the edit form into a shared component that both can use.

### Removed Functionality
- Student delete action (from StudentSessions dialog header)
- Actions column in StudentTable
- `PsychologyIcon` overlay button in StudentCard

### Preserved Components (reused inside drawer)
- `StreakBadge` — in header
- `ReadingLevelRangeInput` — in edit mode
- `BookAutocomplete` — in edit mode for likes/dislikes
- `AssessmentSelector` — in session edit sub-dialog

### Components That May Become Unused
- `StudentSessions` — fully replaced by the drawer. Check if anything else imports it; if not, remove.
- `StudentProfile` — fully replaced by the drawer's edit mode. Same — check imports, then remove.

## Data Requirements

No new API endpoints needed. The drawer uses existing endpoints:

- **On drawer open, single fetch:**
  - `GET /api/students/:id` — fetches full student record including `preferences` (genre preferences, likes, dislikes) and `readingSessions`. The student list from AppContext does NOT include preferences or sessions. Use this response for all displayed data (stats, preferences, streak, sessions), falling back to the AppContext snapshot only while loading.
- **After session edit/delete:** re-fetch `GET /api/students/:id/sessions` to refresh the timeline without re-fetching the full student record.
- **On save (edit mode):** call `updateStudent()` from AppContext to keep the student list in sync, then refresh the drawer's local data.
- `PUT /api/students/:id` — for save in edit mode (same as current)
- `PUT /api/students/:id/ai-opt-out` — for AI toggle (same as current)
- `PUT /api/students/:id/sessions/:sessionId` — for editing sessions
- `DELETE /api/students/:id/sessions/:sessionId` — for deleting sessions

## Mobile Behaviour

- **Breakpoint:** `theme.breakpoints.down('md')`
- **Full-screen drawer** with two tabs at the top:
  - **Details tab:** Header content (name, demographics, streak) + preferences/stats — all stacked vertically
  - **Sessions tab:** Full-width session timeline
- In edit mode: Details tab shows the edit form
- Tab state preserved when switching between read-only and edit mode
