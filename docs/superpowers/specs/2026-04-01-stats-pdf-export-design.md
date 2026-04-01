# Stats PDF Export

## Context

School admins need a printable reading summary to present at governors' meetings or share with staff. The data already exists in the stats page — this feature generates a polished PDF from it.

## Design

### Content

A one-to-two page PDF report containing:

**Header section:**
- School name (from organization context)
- Report period (selected term name, or "All Time")
- Date range (e.g. "1 Sep 2025 — 31 Mar 2026")
- Generated date

**Summary metrics (row of 4):**
- Total students
- Total sessions
- Average sessions per student
- Students never read

**Activity breakdown (2-column):**
- Home vs School reading counts
- This week vs last week activity

**Reading by day of week:**
- 7-column bar representation with day labels and counts

**Streak highlights (row of 4):**
- Active streaks count
- Best current streak
- All-time best streak
- Average streak length

**Top readers (top 5):**
- Name, current streak (days)

**Most read books (top 5):**
- Title, session count

**Needs attention:**
- List of students with status "never", "overdue", or "attention"
- Name and last read date (or "Never")

### Styling

Warm brand aesthetic matching the app — cream background tones, sage green accents, Nunito headings. Not a generic white PDF. Rounded section cards with subtle borders. The Tally Reading logo at the top.

### Technology

Client-side PDF generation using `jsPDF`. The library is lightweight (~300KB), runs entirely in the browser, and doesn't require server-side rendering. No new API endpoints needed — all data comes from the existing `/api/students/stats` response and the local student list already in DataContext.

The PDF generation logic lives in a utility module, not in a React component. The stats page calls it with the data it already has.

### File structure

```
src/utils/statsExport.js     — generateStatsPDF(data) function
```

### Integration

The existing "Export Data" button on the stats page header becomes a split button or dropdown with two options:
- "Export PDF Report" (new) — generates the branded PDF
- "Export Data (JSON)" (existing `exportToJson`)

Alternatively, replace the current "Export Data" button with "Download Report" since the JSON export is really a backup/migration tool, not a stats feature. The JSON export can stay accessible from the Settings/Data Management page where it also exists.

### Data flow

```
ReadingStats.js (has stats, activeStudents, enrichedTopStreaks, etc.)
  → calls generateStatsPDF({
      schoolName,
      periodLabel,
      dateRange,
      stats,           // from /api/students/stats
      topStreaks,       // enrichedTopStreaks (with names)
      needsAttention,  // from getNeedsAttentionStudents()
    })
  → jsPDF generates PDF in browser
  → triggers download: "tally-reading-report-{school}-{date}.pdf"
```

### What's NOT included

- No charts/graphs in the PDF (jsPDF can't easily render canvas charts; the data tables are more useful for print)
- No per-student detail pages (this is a summary report)
- No server-side generation
- No email delivery

## Testing

- Unit test `generateStatsPDF` with mock data — verify it returns a valid PDF blob without throwing
- Manual verification of PDF layout and styling
