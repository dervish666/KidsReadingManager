# ReadingStats Component Split

## Context

`src/components/stats/ReadingStats.js` is 1,284 lines. It contains four tab renderers (`renderOverviewTab`, `renderNeedsAttentionTab`, `renderFrequencyTab`, `renderStreaksTab`) that are already self-contained functions. Extracting each into its own file makes the code easier to work with and reason about.

## Design

### File structure after split

```
src/components/stats/
├── ReadingStats.js          (~300 lines — orchestrator)
├── OverviewTab.js           (~460 lines — summary cards, top streaks, charts)
├── NeedsAttentionTab.js     (~70 lines — filtered student list)
├── FrequencyTab.js          (~70 lines — session count sort + chart)
└── StreaksTab.js             (~270 lines — streak cards, active/no-streak lists)
```

Existing chart components (`ReadingTimelineChart`, `ReadingFrequencyChart`, `DaysSinceReadingChart`) are not affected.

### ReadingStats.js (orchestrator)

Keeps all state and data fetching:
- `currentTab`, `selectedTerm`, `termDates`, `recalculating`, `stats`
- Term date fetching effect, stats fetching effect
- `activeStudents` memo
- Helper functions: `getStudentsBySessionCount()`, `getStudentsWithStreaks()`, `getNeedsAttentionStudents()`, `enrichedTopStreaks`
- `handleTabChange`, `handleExport`, `handleRecalculateStreaks`
- `renderStatsLoading()` (small, used by main render)
- Header layout (title, term filter, export button)
- Tab bar navigation
- Renders the active tab component, passing pre-computed data as props

### OverviewTab

Props: `stats`, `enrichedTopStreaks`, `activeStudents`, `termDateRange`

Renders: summary metric cards (total sessions, unique readers, avg sessions, reading rate), top streaks list, ReadingTimelineChart, DaysSinceReadingChart.

### NeedsAttentionTab

Props: `students` (pre-filtered by `getNeedsAttentionStudents()`)

Renders: list of students needing attention with days-since-reading and status indicators.

### FrequencyTab

Props: `students` (pre-sorted by `getStudentsBySessionCount()`)

Renders: sorted student list with session counts, ReadingFrequencyChart.

### StreaksTab

Props: `stats`, `studentsWithStreaks` (from `getStudentsWithStreaks()`), `studentsNoStreak`, `recalculating`, `onRecalculate`

Renders: streak summary cards (longest, average, active count), active streaks list, no-streak list, recalculate button.

## Constraints

- Pure extraction — rendered output is identical before and after.
- No API changes, no context changes, no new hooks.
- Tab components are pure renderers — they receive data as props, no context access or data fetching.
- All existing tests continue to pass without modification (they test ReadingStats as a whole).

## Testing

Existing ReadingStats tests cover the integrated behaviour and should pass unchanged. No new tests needed for this refactoring — the components are simple prop-to-render functions.
