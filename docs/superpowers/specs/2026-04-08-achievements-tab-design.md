# Achievements Tab — Stats Page

**Date:** 2026-04-08
**Status:** Approved

## Summary

Add an "Achievements" tab to the Reading Statistics page showing class-wide badge progress. Non-competitive, aggregate view with expandable drill-down to see per-student progress toward each badge.

## Design Principles

- **No competition** — no leaderboards, no ranking students against each other. Badges are personal progress markers.
- **Aggregate first** — teachers see class-wide completion rates at a glance.
- **Drill-down on demand** — expand any badge to see which students have/haven't earned it and how close they are.

## Backend: New API Endpoint

### `GET /api/badges/summary`

Role guard: `requireReadonly()` (matches other read-only stats endpoints).

Tenant isolation: Filter students by `c.get('organizationId')` and `is_active = 1`. For class-filtered queries, verify the class belongs to the same organization. When `classId` is omitted or `'all'`, exclude students from disabled classes (`c.disabled = 0`).

Query params:
- `classId` (optional) — `'all'` (default), a specific class ID, or `'unassigned'`. Validated before use in queries.
- (No term date filtering — badges are cumulative all-time achievements)

Returns:
```json
{
  "totalStudents": 28,
  "studentsWithBadges": 14,
  "totalBadgesEarned": 42,
  "badges": [
    {
      "badgeId": "bookworm_bronze",
      "earnedCount": 12,
      "students": [
        { "id": "...", "name": "Amy", "earned": true, "earnedAt": "2026-04-08" },
        { "id": "...", "name": "Ben", "earned": false, "current": 3, "target": 8 }
      ]
    }
  ]
}
```

Implementation: Query all active students (with class/org filters), then batch-fetch their `student_reading_stats` rows and `student_badges` rows. Badge definitions (name, tier, icon, description, category, isSecret) are known client-side from `badgeDefinitions.js`, so the API only returns IDs and progress data.

Progress calculation: For students who haven't earned a badge, the endpoint computes `current`/`target` using the student's `student_reading_stats` row and `year_group` (for key-stage-dependent thresholds). Uses the `progress()` functions from `badgeDefinitions.js` server-side. For `series_finisher` (which needs `authorBookCounts` context not in stats), return `{ current: 0, target: 3 }` as fallback — exact progress for this badge requires per-student session queries that are too expensive for a summary endpoint.

Secret badges: Included in the response only for students who have earned them. Unearned secret badges are excluded entirely (no progress shown).

## Frontend: AchievementsTab Component

### Location

`src/components/stats/AchievementsTab.js`

### Tab Registration

Added to `ReadingStats.js` as the 6th tab with a `EmojiNature` (leaf) icon and label "Achievements".

### Loading, Error, and Empty States

Follows existing tab patterns:
- **No students**: Show standard "No data available yet" Paper (same as other tabs)
- **Loading**: Show skeleton loading state via `renderStatsLoading()` pattern
- **API error**: Show "Unable to load achievements" with retry button
- **No badges earned**: "No badges earned yet. As students read and log sessions, achievements will appear here."

### Layout

**Top summary cards** (same 4-card grid pattern as OverviewTab):
- Total badges earned (across filtered class/all)
- Students with badges (count)
- Badge completion rate (students with badges / total students, as percentage)
- Class garden stage — uses total badges earned across class mapped to thresholds: 0–5 Seedling, 6–20 Sprout, 21–50 Bloom, 51+ Full Garden

**Badge cards grouped by category:**

Category grouping maps code categories to display groups:
1. **Milestones** — `milestone` + `milestone_batch` (First Finish, Series Finisher)
2. **Volume** — `volume` (Bookworm tiers, Time Traveller tiers)
3. **Consistency** — `consistency_realtime` + `consistency_batch` (Steady Reader, Week Warrior, Monthly Marvel)
4. **Exploration** — `exploration` (Genre Explorer tiers, Fiction & Fact)
5. **Secret** — `secret` (only shown if any student has earned one)

Each category is a section heading. Within each category, one card per badge definition:

**Badge card (collapsed):**
- Left: BadgeIcon (reuse existing component) + badge name + tier chip
- Center: "12 of 28 students" text
- Right: progress bar showing earned fraction
- Click/expand arrow to drill down

**Badge card (expanded):**
- Student list below the summary, sorted: earned students first (by date), then unearned sorted by progress descending (closest to earning first)
- Each earned student: name + green "Earned" chip + date
- Each unearned student: name + mini progress bar + "3 of 8 books" label
- For key-stage-dependent badges, targets shown are per-student (based on their year group)

### Data Flow

1. `ReadingStats.js` passes `globalClassFilter` to `AchievementsTab`
2. `AchievementsTab` calls `fetchWithAuth('GET /api/badges/summary?classId=...')` on mount and when filter changes (direct fetch, not via DataContext)
3. Badge definitions (names, icons, descriptions, categories) merged client-side from `badgeDefinitions.js`
4. No term date filtering (achievements are cumulative)

### Styling

Follow existing tab patterns:
- Cards use `borderRadius: 3`, warm shadow (`4px 4px 12px rgba(139, 115, 85, 0.08)`)
- Progress bars use the garden green gradient (`#86A86B` → `#A0C484`)
- Category headings use `subtitle1` with Nunito font
- Earned chips use the existing sage green (`#86A86B`)
- Expand/collapse uses MUI `Accordion` or `Collapse` with smooth transition

## Files Changed

| File | Change |
|------|--------|
| `src/routes/badges.js` | Add `GET /summary` endpoint |
| `src/components/stats/AchievementsTab.js` | New component |
| `src/components/stats/ReadingStats.js` | Add 6th tab, import AchievementsTab |

## Not In Scope

- PDF export of achievements (can be added later to `generateStatsPDF`)
- Per-student achievement view within this tab (already exists in student detail drawer)
- Badge notifications or celebration animations (already handled by `BadgeCelebration`)
- Tour step integration (can be added later)
