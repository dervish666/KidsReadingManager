# Term Dates Feature — Design

## Overview

Add term date management so schools can define their six half-term periods per academic year. This enables half-term filtering on the stats page for more useful reporting.

## Data Model

New `term_dates` table (migration 0033), scoped per organization and academic year:

```sql
CREATE TABLE IF NOT EXISTS term_dates (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    academic_year TEXT NOT NULL,        -- e.g. '2025/26'
    term_name TEXT NOT NULL,            -- 'Autumn 1', 'Autumn 2', etc.
    term_order INTEGER NOT NULL,        -- 1-6 for sorting
    start_date TEXT NOT NULL,           -- ISO date 'YYYY-MM-DD'
    end_date TEXT NOT NULL,             -- ISO date 'YYYY-MM-DD'
    updated_by TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE(organization_id, academic_year, term_order)
);
```

A dedicated table rather than JSON in `org_settings` because: queryable date ranges for future reporting, clean validation of overlaps, and straightforward CRUD.

## API Endpoints

- `GET /api/term-dates?year=2025/26` — returns all 6 half-terms for the org's academic year (or empty array). `requireReadonly()` (teachers need the dropdown on stats).
- `PUT /api/term-dates` — upserts all 6 half-terms in one batch. Body: `{ academicYear, terms: [{termName, termOrder, startDate, endDate}, ...] }`. `requireAdmin()`.

Both scoped by `organizationId` from tenant middleware.

## Settings UI — Term Dates Section

Added to the existing `Settings.js` component (Application Settings tab), below the streak settings:

- **Academic year selector** — dropdown defaulting to current year (if before August, show previous year; if August onwards, show current).
- **Six rows** — one per half-term (Autumn 1 through Summer 2), each with start date and end date pickers.
- **Save button** — validates no overlaps and all dates are within the academic year, then PUTs the batch.
- **Empty state** — "No term dates set for 2025/26. Set your dates to enable half-term filtering on the stats page."
- **Visibility** — admin and owner roles only (teachers see term dates on the stats dropdown but don't edit them here).

## Stats Page Integration

- **Half-term dropdown** added to the stats page header bar (next to the Export button).
- Options: "All Time" (default) + any half-terms that have dates set.
- When a half-term is selected, the `stats` useMemo filters `student.readingSessions` to only include sessions whose `date` falls within the selected half-term's start/end range.
- The dropdown is populated by fetching term dates from the API (cached in component state).
- If no term dates are set, the dropdown shows but only has "All Time".

## Scope Exclusions

- No term-over-term comparison view (future enhancement).
- No auto-population of dates (schools set them manually).
- No impact on any other functionality (streaks, recommendations, home reading register).
