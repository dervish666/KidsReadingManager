# Achievements Tab Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Achievements" tab to the stats page showing class-wide badge progress with expandable per-student drill-down.

**Architecture:** New `GET /api/badges/summary` endpoint returns aggregate badge data per org/class. New `AchievementsTab` React component renders summary cards and expandable badge cards grouped by category. Badge definitions are merged client-side.

**Tech Stack:** Hono (backend), React 19, Material-UI v7, Vitest

**Spec:** `docs/superpowers/specs/2026-04-08-achievements-tab-design.md`

---

## Chunk 1: Backend — Badge Summary Endpoint

### Task 1: Add `GET /api/badges/summary` endpoint

**Files:**
- Modify: `src/routes/badges.js` (add new route handler)
- Create: `src/__tests__/integration/badgeSummary.test.js`

**Key references:**
- `src/utils/badgeDefinitions.js` — `BADGE_DEFINITIONS`, `resolveKeyStage`
- `src/utils/rowMappers.js` — `rowToReadingStats`
- `src/middleware/tenant.js` — `requireReadonly`
- `src/utils/routeHelpers.js` — `requireDB`
- Existing pattern: `GET /api/badges/students/:id` in same file (lines 22-69)

- [ ] **Step 1: Write integration test for the summary endpoint**

Create `src/__tests__/integration/badgeSummary.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { BADGE_DEFINITIONS, resolveKeyStage } from '../../utils/badgeDefinitions.js';

describe('Badge summary endpoint logic', () => {
  it('computes correct aggregate counts', () => {
    const students = [
      { id: 's1', name: 'Amy', year_group: 'Y3' },
      { id: 's2', name: 'Ben', year_group: 'Y3' },
      { id: 's3', name: 'Cal', year_group: 'Y4' },
    ];
    const badges = [
      { student_id: 's1', badge_id: 'first_finish', tier: 'single', earned_at: '2026-04-08' },
      { student_id: 's2', badge_id: 'first_finish', tier: 'single', earned_at: '2026-04-08' },
      { student_id: 's1', badge_id: 'bookworm_bronze', tier: 'bronze', earned_at: '2026-04-08' },
    ];

    const totalStudents = students.length;
    const studentsWithBadges = new Set(badges.map((b) => b.student_id)).size;
    const totalBadgesEarned = badges.length;

    expect(totalStudents).toBe(3);
    expect(studentsWithBadges).toBe(2);
    expect(totalBadgesEarned).toBe(3);
  });

  it('computes per-student progress using badge definitions with key stage', () => {
    const stats = {
      totalBooks: 3,
      totalSessions: 5,
      totalMinutes: 60,
      totalPages: 40,
      genresRead: ['fiction'],
      uniqueAuthorsCount: 2,
      fictionCount: 3,
      nonfictionCount: 0,
      poetryCount: 0,
      daysReadThisWeek: 2,
      daysReadThisTerm: 5,
      daysReadThisMonth: 4,
      weeksWith4PlusDays: 0,
      weeksWithReading: 2,
    };

    const bookwormBronze = BADGE_DEFINITIONS.find((b) => b.id === 'bookworm_bronze');
    const keyStage = resolveKeyStage('Y3'); // LowerKS2
    const progress = bookwormBronze.progress(stats, { keyStage });

    expect(progress.current).toBe(3);
    expect(progress.target).toBe(8); // LowerKS2 threshold
  });

  it('excludes unearned secret badges from progress', () => {
    const secretBadges = BADGE_DEFINITIONS.filter((b) => b.isSecret);
    expect(secretBadges.length).toBeGreaterThan(0);
    const nonSecretBadges = BADGE_DEFINITIONS.filter((b) => !b.isSecret);
    expect(nonSecretBadges.length).toBe(BADGE_DEFINITIONS.length - secretBadges.length);
  });

  it('returns empty response when no students', () => {
    const result = { totalStudents: 0, studentsWithBadges: 0, totalBadgesEarned: 0, badges: [] };
    expect(result.totalStudents).toBe(0);
    expect(result.badges).toEqual([]);
  });

  it('series_finisher returns fallback progress when authorBookCounts missing', () => {
    const seriesFinisher = BADGE_DEFINITIONS.find((b) => b.id === 'series_finisher');
    // When authorBookCounts is not in context, progress should return { current: 0, target: 3 }
    const progress = seriesFinisher.progress({}, { keyStage: 'LowerKS2' });
    expect(progress).toEqual({ current: 0, target: 3 });
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/__tests__/integration/badgeSummary.test.js`
Expected: PASS

- [ ] **Step 3: Implement the summary endpoint**

Add to `src/routes/badges.js`, before the `export default`:

```javascript
/**
 * GET /api/badges/summary
 * Class-wide badge progress: aggregate counts + per-student progress for each badge.
 * Query: ?classId=<id|all|unassigned>
 */
badgesRouter.get('/summary', requireReadonly(), async (c) => {
  const db = requireDB(c.env);
  const organizationId = c.get('organizationId');
  const classId = c.req.query('classId') || 'all';

  // Validate classId when it's a specific class
  if (classId !== 'all' && classId !== 'unassigned') {
    const cls = await db
      .prepare('SELECT id FROM classes WHERE id = ? AND organization_id = ?')
      .bind(classId, organizationId)
      .first();
    if (!cls) return c.json({ error: 'Class not found' }, 404);
  }

  // Build student query with class filter
  let studentSql = `
    SELECT s.id, s.name, s.year_group
    FROM students s
    LEFT JOIN classes c ON s.class_id = c.id
    WHERE s.organization_id = ? AND s.is_active = 1`;
  const binds = [organizationId];

  if (classId === 'unassigned') {
    studentSql += ' AND s.class_id IS NULL';
  } else if (classId !== 'all') {
    studentSql += ' AND s.class_id = ?';
    binds.push(classId);
  } else {
    studentSql += ' AND (s.class_id IS NULL OR c.disabled = 0)';
  }
  studentSql += ' ORDER BY s.name ASC';

  const studentsResult = await db.prepare(studentSql).bind(...binds).all();
  const students = studentsResult.results || [];

  if (students.length === 0) {
    return c.json({ totalStudents: 0, studentsWithBadges: 0, totalBadgesEarned: 0, badges: [] });
  }

  // Use subqueries to avoid D1 bind parameter limits for large student sets
  const studentSubquery = `SELECT id FROM students s
    LEFT JOIN classes c ON s.class_id = c.id
    WHERE s.organization_id = ? AND s.is_active = 1${
      classId === 'unassigned'
        ? ' AND s.class_id IS NULL'
        : classId !== 'all'
          ? ' AND s.class_id = ?'
          : ' AND (s.class_id IS NULL OR c.disabled = 0)'
    }`;
  const subBinds = classId !== 'all' && classId !== 'unassigned'
    ? [organizationId, classId]
    : [organizationId];

  const [badgesResult, statsResult] = await Promise.all([
    db
      .prepare(`SELECT * FROM student_badges WHERE student_id IN (${studentSubquery})`)
      .bind(...subBinds)
      .all(),
    db
      .prepare(`SELECT * FROM student_reading_stats WHERE student_id IN (${studentSubquery})`)
      .bind(...subBinds)
      .all(),
  ]);

  // Index badges and stats by student_id
  const badgesByStudent = {};
  for (const b of badgesResult.results || []) {
    (badgesByStudent[b.student_id] ||= []).push(b);
  }
  const statsByStudent = {};
  for (const s of statsResult.results || []) {
    statsByStudent[s.student_id] = rowToReadingStats(s);
  }

  const studentsWithBadgesSet = new Set(Object.keys(badgesByStudent));
  const totalBadgesEarned = (badgesResult.results || []).length;

  // Build per-badge summary
  const nonSecretDefs = BADGE_DEFINITIONS.filter((b) => !b.isSecret);
  const secretDefs = BADGE_DEFINITIONS.filter((b) => b.isSecret);
  const badgeSummaries = [];

  for (const def of nonSecretDefs) {
    const badgeStudents = students.map((s) => {
      const studentBadges = badgesByStudent[s.id] || [];
      const earned = studentBadges.find((b) => b.badge_id === def.id);
      if (earned) {
        return { id: s.id, name: s.name, earned: true, earnedAt: earned.earned_at };
      }
      // Compute progress — authorBookCounts intentionally omitted (too expensive for summary);
      // series_finisher falls back to { current: 0, target: 3 }
      const stats = statsByStudent[s.id] || {};
      const keyStage = resolveKeyStage(s.year_group);
      const progress = def.progress(stats, { keyStage });
      return { id: s.id, name: s.name, earned: false, current: progress.current, target: progress.target };
    });

    const earnedCount = badgeStudents.filter((s) => s.earned).length;
    badgeSummaries.push({ badgeId: def.id, earnedCount, students: badgeStudents });
  }

  // Secret badges — only include if any student earned them
  for (const def of secretDefs) {
    const earnedStudents = [];
    for (const s of students) {
      const studentBadges = badgesByStudent[s.id] || [];
      const earned = studentBadges.find((b) => b.badge_id === def.id);
      if (earned) {
        earnedStudents.push({ id: s.id, name: s.name, earned: true, earnedAt: earned.earned_at });
      }
    }
    if (earnedStudents.length > 0) {
      badgeSummaries.push({ badgeId: def.id, earnedCount: earnedStudents.length, students: earnedStudents });
    }
  }

  return c.json({
    totalStudents: students.length,
    studentsWithBadges: studentsWithBadgesSet.size,
    totalBadgesEarned,
    badges: badgeSummaries,
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/integration/badgeSummary.test.js src/__tests__/integration/badges.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/badges.js src/__tests__/integration/badgeSummary.test.js
git commit -m "feat: add GET /api/badges/summary endpoint for class-wide badge progress"
```

---

## Chunk 2: Frontend — AchievementsTab Component

### Task 2: Create AchievementsTab component

**Files:**
- Create: `src/components/stats/AchievementsTab.js`

**Key references:**
- `src/components/stats/OverviewTab.js` — summary card grid pattern (lines 16-60)
- `src/components/stats/ReadingStats.js` — fetch pattern with `fetchWithAuth` (lines 159-179)
- `src/components/badges/BadgeIcon.js` — badge rendering (import as-is)
- `src/utils/badgeDefinitions.js` — `BADGE_DEFINITIONS` for metadata merge

- [ ] **Step 1: Create AchievementsTab**

Create `src/components/stats/AchievementsTab.js` with the following structure:

**Imports:**
```javascript
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, LinearProgress,
  Accordion, AccordionSummary, AccordionDetails, Skeleton,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BadgeIcon from '../badges/BadgeIcon';
import { BADGE_DEFINITIONS } from '../../utils/badgeDefinitions';
```

**Constants:**
```javascript
const CATEGORY_GROUPS = [
  { label: 'Milestones', categories: ['milestone', 'milestone_batch'] },
  { label: 'Volume', categories: ['volume'] },
  { label: 'Consistency', categories: ['consistency_realtime', 'consistency_batch'] },
  { label: 'Exploration', categories: ['exploration'] },
  { label: 'Secret', categories: ['secret'] },
];

const CLASS_GARDEN_STAGES = [
  { name: 'Seedling', min: 0, max: 5 },
  { name: 'Sprout', min: 6, max: 20 },
  { name: 'Bloom', min: 21, max: 50 },
  { name: 'Full Garden', min: 51, max: Infinity },
];

function getClassGardenStage(totalBadges) {
  return CLASS_GARDEN_STAGES.find((s) => totalBadges >= s.min && totalBadges <= s.max) || CLASS_GARDEN_STAGES[0];
}
```

**Component state:**
```javascript
export default function AchievementsTab({ fetchWithAuth, globalClassFilter }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
```

**Fetch effect** (matches ReadingStats pattern at lines 159-179):
```javascript
  const loadData = () => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    if (globalClassFilter && globalClassFilter !== 'all') {
      params.set('classId', globalClassFilter);
    }
    fetchWithAuth(`/api/badges/summary?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  };

  useEffect(loadData, [globalClassFilter, fetchWithAuth]);
```

**Badge definition merge** (merge API response with client-side definitions):
```javascript
  const enrichedBadges = useMemo(() => {
    if (!data?.badges) return [];
    return data.badges.map((b) => {
      const def = BADGE_DEFINITIONS.find((d) => d.id === b.badgeId);
      return { ...b, def: def || { name: b.badgeId, tier: 'single', icon: 'bookworm', category: 'milestone' } };
    });
  }, [data]);
```

**Render sections:**

1. Loading state: 4 skeleton cards + 4 skeleton rectangles (same as `renderStatsLoading` in ReadingStats)
2. Error state: Typography "Unable to load achievements" + Button "Retry" calling `loadData()`
3. Summary cards: 4-card grid using same `Card`/`CardContent` pattern as OverviewTab (Total Badges, Students with Badges, Completion Rate %, Garden Stage)
4. Category groups: iterate `CATEGORY_GROUPS`, for each group filter `enrichedBadges` by matching categories, skip group if empty. Render heading + Accordion per badge.
5. Each Accordion summary: `BadgeIcon` (size="small", pass `{ name, tier, icon }` from def), badge name, tier chip if not single, "12 of 28 students" text, `LinearProgress` showing `earnedCount / data.totalStudents`
6. Each Accordion details: list of students sorted earned-first then by progress desc. Earned: name + green Chip "Earned" + date. Unearned: name + mini LinearProgress + "3 of 8" text.

**Styling rules** (match existing patterns):
- Cards: `borderRadius: 3`, `boxShadow: '4px 4px 12px rgba(139, 115, 85, 0.08)'`
- Progress bars: `backgroundColor: '#E8DFD0'`, bar gradient `'linear-gradient(90deg, #86A86B, #A0C484)'`, height 6, borderRadius 1
- Category headings: `variant="subtitle1"`, `fontFamily: '"Nunito", sans-serif'`, `fontWeight: 700`, `color: '#3D3427'`
- Earned chips: `backgroundColor: '#86A86B'`, `color: 'white'`, size="small"
- Accordion: no elevation, border `'1px solid #F0E4CC'`, `borderRadius: '12px !important'`, `mb: 1`

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/components/stats/AchievementsTab.js
git commit -m "feat: add AchievementsTab component with badge progress cards"
```

### Task 3: Register the tab in ReadingStats

**Files:**
- Modify: `src/components/stats/ReadingStats.js`

- [ ] **Step 1: Add imports**

After the existing imports (around line 28), add:
```javascript
import EmojiNatureIcon from '@mui/icons-material/EmojiNature';
import AchievementsTab from './AchievementsTab';
```

- [ ] **Step 2: Add tab**

After the Timeline tab (line 349), add:
```javascript
<Tab icon={<EmojiNatureIcon />} iconPosition="start" label="Achievements" />
```

- [ ] **Step 3: Add tab content**

After the `currentTab === 4` block (around line 421), add:
```javascript
{currentTab === 5 &&
  (students.length === 0 ? (
    <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 4 }}>
      <Typography variant="body1" color="text.secondary">
        No data available yet. Add students and record reading sessions to see statistics.
      </Typography>
    </Paper>
  ) : (
    <AchievementsTab fetchWithAuth={fetchWithAuth} globalClassFilter={globalClassFilter} />
  ))}
```

- [ ] **Step 4: Build and run tests**

Run: `npm run build && npm test`
Expected: Build succeeds, all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/stats/ReadingStats.js
git commit -m "feat: register Achievements tab in stats page"
```

---

## Chunk 3: Smoke Test, CLAUDE.md Update & Deploy

### Task 4: Update CLAUDE.md file map

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update file map**

Add entry for AchievementsTab under the stats components section:
```
src/components/stats/AchievementsTab.js - Achievements tab: class-wide badge progress with expandable per-student drill-down
```

Update the badges route description:
```
src/routes/badges.js - GET/POST badge collection, notify, and class summary endpoints
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add AchievementsTab to file map"
```

### Task 5: Manual smoke test & deploy

- [ ] **Step 1: Start local dev and verify**

Run: `npm run start:dev`

Verify on the Stats page:
- 6th tab "Achievements" with leaf icon appears
- Summary cards show correct counts
- Badge cards grouped by category
- Expanding shows per-student progress
- Class filter dropdown filters correctly
- Empty state works when no badges

- [ ] **Step 2: Deploy**

Run: `npm run go`
