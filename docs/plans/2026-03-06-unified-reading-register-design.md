# Unified Reading Register Design

Date: 2026-03-06

## Problem

The Home Reading page has two separate tables:
1. A register table (single-day view with name, status, clear, total, current book)
2. A reading history table (multi-day grid with date range presets and daily totals)

With 30 pupils, scrolling through ~60 rows is too much. Teachers primarily work through the register top-to-bottom recording each student's status — the history is secondary reference.

## Design

Consolidate both tables into a single unified table that is register-first with embedded history.

### Table Structure

| Name | Mon | Tue | Wed | Thu | Fri | Total | Clear |
|------|-----|-----|-----|-----|-----|-------|-------|
| Student A | check | - | 2 | - | **-** | 3 | x |
| ... | | | | | | | |
| **Daily Totals** | 12 | 8 | 15 | - | - | 35 | |

**Columns:**
- **Name** — sticky left column, clickable to select student for recording in the input panel
- **Date columns** — one per day in the selected range. Default: current week (Mon-Sun). Same color-coded status cells (check=green, number=dark green, A=amber, dot=grey, dash=empty). The selected date column is visually highlighted. Clicking a date header changes the selected date.
- **Total** — sum of reading sessions in the visible date range
- **Clear** — button to clear the selected date's entry (only visible when entry exists)

**Daily Totals footer row** — shows total sessions per day with breakdown tooltip (X read, X multiple, X absent, X no record, X not entered). Preserved from the current history table.

### Controls Above the Table

Two-column layout (same as current):

**Left — Input Panel:**
- "Recording for: Student Name" header
- Book autocomplete + ISBN scan button
- Quick input buttons (check, 2+, A, dot)
- Caption: "Book will be saved and synced across devices"

**Right — Date & Search:**
- Date picker (selects active recording date)
- Date range preset dropdown (This Week / Last Week / Last Month / Custom)
- Custom start/end date fields (shown when Custom selected)
- Student search field
- Date range display chip

### Below the Table

- Summary chips for the selected date (Total Students, Read, Multiple, Absent, No Record, Not Entered, Total Sessions)
- Legend (check=Read, number=Multiple, A=Absent, dot=No Record, dash=Not Entered)

### Removed

- **Drag-and-drop reordering** — broken, removed entirely. Students sorted alphabetically.
- **Current Book column** — removed from table; visible only in the input panel when a student is selected.
- **ClassReadingHistoryTable component** — absorbed into the unified table. Component file can be deleted.

### Interactions

- Click a student name -> selects them in the input panel for recording
- Click a date column header -> changes the selected recording date
- Click a status cell -> selects that student (same as clicking name)
- Click Clear button -> clears home reading entry for that student on the selected date
- Date range preset changes -> table columns update to show that range
- Search filters the student rows (disables custom ordering)

### Mobile Considerations

- Sticky name column on horizontal scroll
- Condensed date headers (day abbreviation + date number)
- Input panel collapsible on mobile
- Smaller font sizes and padding on mobile (matching current history table approach)
