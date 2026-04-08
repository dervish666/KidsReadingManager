# Collaborative Class Goals Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add collaborative class-level reading goals (sessions, genres, books) with auto-generation, display mode for classroom projection, and confetti celebrations — the anti-competition counterpart to the individual badge system.

**Architecture:** New `class_goals` table with denormalized `current` counters updated on session CRUD (same pattern as `student_reading_stats`). Goals auto-created per half-term when first accessed. `ClassGoalsDisplay` fullscreen overlay for interactive whiteboards with 30-second auto-refresh. Confetti on goal completion via session response `completedGoals` array (same pattern as `newBadges`).

**Tech Stack:** D1 (migration), Hono routes, React 19 + MUI v7, existing `GardenHeader` SVG component, Vitest

**Spec:** `docs/superpowers/specs/2026-04-08-class-goals-design.md`

---

## Chunk 1: Data Layer

### Task 1: Database Migration

**Files:**
- Create: `migrations/0048_class_goals.sql`

- [ ] **Step 1: Write migration file**

```sql
-- Migration 0048: Collaborative Class Goals
-- ==========================================
-- Per-class reading goals with denormalized progress counters.
-- Goals span one half-term and auto-generate when first accessed.

CREATE TABLE IF NOT EXISTS class_goals (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    metric TEXT NOT NULL,
    target INTEGER NOT NULL,
    current INTEGER DEFAULT 0,
    term TEXT,
    achieved_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_class_goals_class ON class_goals(class_id);
CREATE INDEX IF NOT EXISTS idx_class_goals_org ON class_goals(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_class_goals_unique ON class_goals(class_id, metric, term);
```

- [ ] **Step 2: Apply migration locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration 0048 applied successfully.

- [ ] **Step 3: Verify table exists**

Run: `npx wrangler d1 execute reading-manager-db --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='class_goals'"`
Expected: `class_goals` returned.

- [ ] **Step 4: Commit**

```bash
git add migrations/0048_class_goals.sql
git commit -m "feat(class-goals): add class_goals table (migration 0048)"
```

---

### Task 2: Row Mapper

**Files:**
- Modify: `src/utils/rowMappers.js` (append before end)
- Test: `src/__tests__/unit/rowMappers.classGoal.test.js`

- [ ] **Step 1: Write failing test**

```javascript
import { describe, it, expect } from 'vitest';
import { rowToClassGoal } from '../../utils/rowMappers.js';

describe('rowToClassGoal', () => {
  it('maps snake_case DB row to camelCase object', () => {
    const row = {
      id: 'g1',
      organization_id: 'org1',
      class_id: 'c1',
      metric: 'sessions',
      target: 500,
      current: 204,
      term: 'Spring 1 2025/26',
      achieved_at: null,
      created_at: '2026-04-01T00:00:00Z',
    };
    const result = rowToClassGoal(row);
    expect(result).toEqual({
      id: 'g1',
      organizationId: 'org1',
      classId: 'c1',
      metric: 'sessions',
      target: 500,
      current: 204,
      term: 'Spring 1 2025/26',
      achievedAt: null,
      createdAt: '2026-04-01T00:00:00Z',
    });
  });

  it('returns null for null input', () => {
    expect(rowToClassGoal(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/rowMappers.classGoal.test.js`
Expected: FAIL — `rowToClassGoal is not a function`

- [ ] **Step 3: Implement row mapper**

Add to `src/utils/rowMappers.js` before the closing exports:

```javascript
export const rowToClassGoal = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    classId: row.class_id,
    metric: row.metric,
    target: row.target,
    current: row.current,
    term: row.term,
    achievedAt: row.achieved_at,
    createdAt: row.created_at,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/rowMappers.classGoal.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/rowMappers.js src/__tests__/unit/rowMappers.classGoal.test.js
git commit -m "feat(class-goals): add rowToClassGoal mapper"
```

---

### Task 3: Class Goals Engine — Term Resolution & Recalculation

**Files:**
- Create: `src/utils/classGoalsEngine.js`
- Test: `src/__tests__/unit/classGoalsEngine.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
import { describe, it, expect, vi } from 'vitest';
import {
  resolveCurrentTerm,
  recalculateClassGoalProgress,
  getAutoGeneratedTargets,
} from '../../utils/classGoalsEngine.js';

describe('resolveCurrentTerm', () => {
  it('returns matching half-term from term_dates', () => {
    const termDates = [
      { term_name: 'Autumn 1', start_date: '2025-09-01', end_date: '2025-10-25', academic_year: '2025/26' },
      { term_name: 'Spring 1', start_date: '2026-01-05', end_date: '2026-02-14', academic_year: '2025/26' },
      { term_name: 'Spring 2', start_date: '2026-02-24', end_date: '2026-04-10', academic_year: '2025/26' },
    ];
    const result = resolveCurrentTerm(termDates, '2026-03-15');
    expect(result).toEqual({ term: 'Spring 2 2025/26', startDate: '2026-02-24', endDate: '2026-04-10' });
  });

  it('falls back to calendar quarter when no term_dates match', () => {
    const result = resolveCurrentTerm([], '2026-04-08');
    expect(result.term).toMatch(/^Q2 2026$/);
  });
});

describe('getAutoGeneratedTargets', () => {
  it('generates targets based on class size', () => {
    const targets = getAutoGeneratedTargets(26);
    expect(targets).toEqual({
      sessions: 520,
      genres: 10,
      books: 104,
    });
  });

  it('uses minimum of 1 for tiny classes', () => {
    const targets = getAutoGeneratedTargets(0);
    expect(targets.sessions).toBe(0);
    expect(targets.genres).toBe(10);
    expect(targets.books).toBe(0);
  });
});

describe('recalculateClassGoalProgress', () => {
  it('calculates sessions excluding marker sessions', async () => {
    const mockDb = {
      prepare: vi.fn((sql) => ({
        bind: vi.fn(() => ({
          first: vi.fn(() => {
            if (sql.includes('COUNT') && sql.includes('reading_sessions') && !sql.includes('book_id')) {
              return { count: 42 };
            }
            if (sql.includes('COUNT') && sql.includes('book_id')) {
              return { count: 15 };
            }
            if (sql.includes('COUNT') && sql.includes('json_each')) {
              return { count: 8 };
            }
            return null;
          }),
          all: vi.fn(() => {
            if (sql.includes('class_goals')) {
              return {
                results: [
                  { id: 'g1', metric: 'sessions', target: 500, current: 0, achieved_at: null },
                  { id: 'g2', metric: 'books', target: 100, current: 0, achieved_at: null },
                  { id: 'g3', metric: 'genres', target: 10, current: 0, achieved_at: null },
                ],
              };
            }
            return { results: [] };
          }),
          run: vi.fn(),
        })),
      })),
      batch: vi.fn((stmts) => stmts.map(() => ({ success: true }))),
    };

    await recalculateClassGoalProgress(mockDb, 'c1', 'org1', '2026-01-01', '2026-04-10');
    // Verify UPDATE was called with correct values
    const batchCalls = mockDb.batch.mock.calls;
    expect(batchCalls.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/classGoalsEngine.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement class goals engine**

Create `src/utils/classGoalsEngine.js`:

```javascript
/**
 * Class Goals Engine
 *
 * Term resolution, auto-generation defaults, and progress recalculation
 * for collaborative class reading goals.
 */

/**
 * Resolve the current half-term from term_dates rows.
 * Falls back to calendar quarter if no match.
 */
export function resolveCurrentTerm(termDates, today) {
  const dateStr = today || new Date().toISOString().split('T')[0];

  for (const td of termDates) {
    if (dateStr >= td.start_date && dateStr <= td.end_date) {
      return {
        term: `${td.term_name} ${td.academic_year}`,
        startDate: td.start_date,
        endDate: td.end_date,
      };
    }
  }

  // Fallback: calendar quarter
  const d = new Date(dateStr);
  const quarter = Math.ceil((d.getMonth() + 1) / 3);
  const year = d.getFullYear();
  const quarterStart = new Date(year, (quarter - 1) * 3, 1);
  const quarterEnd = new Date(year, quarter * 3, 0);
  return {
    term: `Q${quarter} ${year}`,
    startDate: quarterStart.toISOString().split('T')[0],
    endDate: quarterEnd.toISOString().split('T')[0],
  };
}

/**
 * Auto-generation defaults based on class size.
 */
export function getAutoGeneratedTargets(classSize) {
  return {
    sessions: classSize * 20,
    genres: 10,
    books: classSize * 4,
  };
}

/**
 * Recalculate current progress for all goals of a class within a date range.
 * Called by nightly cron and on-demand for drift correction.
 */
export async function recalculateClassGoalProgress(db, classId, orgId, startDate, endDate, term) {
  // Fetch goals for this specific term only (avoids updating historical goals)
  const goalsResult = await db
    .prepare('SELECT id, metric, target, current, achieved_at FROM class_goals WHERE class_id = ? AND organization_id = ? AND term = ?')
    .bind(classId, orgId, term)
    .all();

  const goals = goalsResult.results || [];
  if (goals.length === 0) return;

  // Calculate each metric
  const counts = {};

  // Sessions: exclude marker sessions
  const sessionsResult = await db
    .prepare(`
      SELECT COUNT(DISTINCT rs.id) as count
      FROM reading_sessions rs
      JOIN students s ON rs.student_id = s.id
      WHERE s.class_id = ? AND s.organization_id = ?
        AND rs.session_date >= ? AND rs.session_date <= ?
        AND (rs.notes IS NULL OR (rs.notes NOT LIKE '%[ABSENT]%' AND rs.notes NOT LIKE '%[NO_RECORD]%'))
    `)
    .bind(classId, orgId, startDate, endDate)
    .first();
  counts.sessions = sessionsResult?.count || 0;

  // Books: distinct book_id
  const booksResult = await db
    .prepare(`
      SELECT COUNT(DISTINCT rs.book_id) as count
      FROM reading_sessions rs
      JOIN students s ON rs.student_id = s.id
      WHERE s.class_id = ? AND s.organization_id = ?
        AND rs.session_date >= ? AND rs.session_date <= ?
        AND rs.book_id IS NOT NULL
    `)
    .bind(classId, orgId, startDate, endDate)
    .first();
  counts.books = booksResult?.count || 0;

  // Genres: distinct genres via json_each
  const genresResult = await db
    .prepare(`
      SELECT COUNT(DISTINCT je.value) as count
      FROM reading_sessions rs
      JOIN students s ON rs.student_id = s.id
      JOIN books b ON rs.book_id = b.id
      , json_each(b.genre_ids) je
      WHERE s.class_id = ? AND s.organization_id = ?
        AND rs.session_date >= ? AND rs.session_date <= ?
        AND b.genre_ids IS NOT NULL
    `)
    .bind(classId, orgId, startDate, endDate)
    .first();
  counts.genres = genresResult?.count || 0;

  // Build UPDATE statements
  const updates = goals.map((goal) => {
    const newCurrent = counts[goal.metric] || 0;
    const nowAchieved = newCurrent >= goal.target && !goal.achieved_at;
    const achievedAt = nowAchieved ? new Date().toISOString() : goal.achieved_at;

    return db
      .prepare('UPDATE class_goals SET current = ?, achieved_at = ? WHERE id = ?')
      .bind(newCurrent, achievedAt, goal.id);
  });

  if (updates.length > 0) {
    await db.batch(updates);
  }
}

/**
 * Increment class goal progress after a session is created.
 * Returns array of newly completed goals (for completedGoals response).
 */
export async function updateClassGoalOnSession(db, studentId, orgId) {
  // Get the student's class
  const student = await db
    .prepare('SELECT class_id FROM students WHERE id = ? AND organization_id = ?')
    .bind(studentId, orgId)
    .first();

  if (!student?.class_id) return [];

  // Get term dates for this org
  const termDatesResult = await db
    .prepare(`
      SELECT term_name, start_date, end_date, academic_year
      FROM term_dates
      WHERE organization_id = ?
      ORDER BY start_date
    `)
    .bind(orgId)
    .all();

  const { term, startDate, endDate } = resolveCurrentTerm(
    termDatesResult.results || [],
    new Date().toISOString().split('T')[0]
  );

  // Get goals for this class and term
  const goalsResult = await db
    .prepare('SELECT id, metric, target, current, achieved_at FROM class_goals WHERE class_id = ? AND term = ?')
    .bind(student.class_id, term)
    .all();

  const goals = goalsResult.results || [];
  if (goals.length === 0) return [];

  // Recalculate from source data (accurate, avoids increment drift)
  await recalculateClassGoalProgress(db, student.class_id, orgId, startDate, endDate, term);

  // Re-read goals to check for newly completed
  const updatedGoals = await db
    .prepare('SELECT id, metric, target, current, achieved_at FROM class_goals WHERE class_id = ? AND term = ?')
    .bind(student.class_id, term)
    .all();

  // Find goals that just crossed the threshold
  const completedGoals = [];
  for (const updated of updatedGoals.results || []) {
    const original = goals.find((g) => g.id === updated.id);
    if (original && !original.achieved_at && updated.achieved_at) {
      completedGoals.push({
        metric: updated.metric,
        target: updated.target,
        current: updated.current,
      });
    }
  }

  return completedGoals;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/classGoalsEngine.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/classGoalsEngine.js src/__tests__/unit/classGoalsEngine.test.js
git commit -m "feat(class-goals): add class goals engine with term resolution and recalculation"
```

---

## Chunk 2: API Layer

### Task 4: Class Goals Routes

**Files:**
- Create: `src/routes/classGoals.js`
- Test: `src/__tests__/integration/classGoals.test.js`

- [ ] **Step 1: Write failing integration tests**

Follow the mock DB pattern from `src/__tests__/integration/badges.test.js` — `prepare→bind→all/first/run` chain with SQL-conditional returns. Each test should:

```javascript
import { describe, it, expect, vi } from 'vitest';

describe('Class Goals API', () => {
  it('GET auto-creates default goals when none exist', async () => {
    // Mock: term_dates returns Spring 1, class_goals returns empty, students COUNT returns 26
    // Mock: INSERT calls tracked, re-read returns 3 goals
    // Assert: response has 3 goals with correct auto-generated targets (520, 10, 104)
    // Assert: gardenStage === 'seedling', goalsCompleted === 0
  });

  it('GET returns existing goals with correct garden stage', async () => {
    // Mock: class_goals returns 3 goals, 1 with achieved_at set
    // Assert: goalsCompleted === 1, gardenStage === 'sprout'
  });

  it('PUT updates goal targets', async () => {
    // Mock: UPDATE called with new target values
    // Assert: response reflects new targets
  });

  it('PUT clears achieved_at when target raised above current', async () => {
    // Mock: goal has current=10, target=10, achieved_at set
    // Call PUT with target=15
    // Assert: UPDATE SQL includes CASE WHEN logic, achieved_at becomes NULL
  });

  it('PUT validates metric names and target values', async () => {
    // Call with invalid metric → 400
    // Call with target=0 → 400
  });
});
```

Use the exact mock DB pattern from `src/__tests__/integration/badges.test.js` for the `prepare→bind→all/first/run` chain.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/integration/classGoals.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement class goals routes**

Create `src/routes/classGoals.js`:

```javascript
import { Hono } from 'hono';
import { requireTeacher } from '../middleware/tenant.js';
import { rowToClassGoal } from '../utils/rowMappers.js';
import {
  resolveCurrentTerm,
  getAutoGeneratedTargets,
} from '../utils/classGoalsEngine.js';
import { generateId } from '../utils/helpers.js';

const classGoalsRouter = new Hono();

/**
 * GET /api/classes/:classId/goals
 * Returns goals for the current half-term. Auto-creates defaults if none exist.
 */
classGoalsRouter.get('/:classId/goals', requireTeacher(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  const organizationId = c.get('organizationId');
  const classId = c.req.param('classId');

  // Resolve current term
  const termDatesResult = await db
    .prepare(
      'SELECT term_name, start_date, end_date, academic_year FROM term_dates WHERE organization_id = ? ORDER BY start_date'
    )
    .bind(organizationId)
    .all();

  const today = new Date().toISOString().split('T')[0];
  const { term } = resolveCurrentTerm(termDatesResult.results || [], today);

  // Check for existing goals
  let goalsResult = await db
    .prepare('SELECT * FROM class_goals WHERE class_id = ? AND term = ? AND organization_id = ?')
    .bind(classId, term, organizationId)
    .all();

  // Auto-create if none exist
  if (!goalsResult.results || goalsResult.results.length === 0) {
    const classSize = await db
      .prepare('SELECT COUNT(*) as count FROM students WHERE class_id = ? AND organization_id = ?')
      .bind(classId, organizationId)
      .first();

    const targets = getAutoGeneratedTargets(classSize?.count || 0);
    const inserts = Object.entries(targets).map(([metric, target]) =>
      db
        .prepare(
          'INSERT INTO class_goals (id, organization_id, class_id, metric, target, current, term) VALUES (?, ?, ?, ?, ?, 0, ?)'
        )
        .bind(generateId(), organizationId, classId, metric, target, term)
    );

    await db.batch(inserts);

    goalsResult = await db
      .prepare('SELECT * FROM class_goals WHERE class_id = ? AND term = ? AND organization_id = ?')
      .bind(classId, term, organizationId)
      .all();
  }

  const goals = (goalsResult.results || []).map(rowToClassGoal);
  const goalsCompleted = goals.filter((g) => g.achievedAt).length;

  const STAGES = ['seedling', 'sprout', 'bloom', 'full_garden'];
  const gardenStage = STAGES[Math.min(goalsCompleted, 3)];

  return c.json({ goals, term, gardenStage, goalsCompleted });
});

/**
 * PUT /api/classes/:classId/goals
 * Update goal targets. Clears achieved_at if target raised above current.
 */
classGoalsRouter.put('/:classId/goals', requireTeacher(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  const organizationId = c.get('organizationId');
  const classId = c.req.param('classId');
  const { goals } = await c.req.json();

  if (!Array.isArray(goals)) {
    return c.json({ error: 'goals must be an array' }, 400);
  }

  const updates = [];
  for (const { metric, target } of goals) {
    if (!['sessions', 'genres', 'books'].includes(metric) || typeof target !== 'number' || target < 1) {
      return c.json({ error: `Invalid goal: metric=${metric}, target=${target}` }, 400);
    }

    // Check if target was raised above current on an achieved goal
    updates.push(
      db
        .prepare(
          `UPDATE class_goals
           SET target = ?,
               achieved_at = CASE WHEN ? > current THEN NULL ELSE achieved_at END
           WHERE class_id = ? AND metric = ? AND organization_id = ?`
        )
        .bind(target, target, classId, metric, organizationId)
    );
  }

  await db.batch(updates);

  // Return updated goals
  const goalsResult = await db
    .prepare('SELECT * FROM class_goals WHERE class_id = ? AND organization_id = ?')
    .bind(classId, organizationId)
    .all();

  const updatedGoals = (goalsResult.results || []).map(rowToClassGoal);
  const goalsCompleted = updatedGoals.filter((g) => g.achievedAt).length;
  const STAGES = ['seedling', 'sprout', 'bloom', 'full_garden'];

  return c.json({
    goals: updatedGoals,
    gardenStage: STAGES[Math.min(goalsCompleted, 3)],
    goalsCompleted,
  });
});

export default classGoalsRouter;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/integration/classGoals.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/classGoals.js src/__tests__/integration/classGoals.test.js
git commit -m "feat(class-goals): add GET/PUT class goals routes with auto-generation"
```

---

### Task 5: Add Goal Routes to Existing Classes Router

**Files:**
- Modify: `src/routes/classes.js`

Rather than creating a separate router (which would conflict with the existing `classesRouter` on `/api/classes`), add the goals endpoints directly to the existing `src/routes/classes.js`. This follows the codebase pattern where related routes share a single router.

- [ ] **Step 1: Add imports to classes.js**

At the top of `src/routes/classes.js`, add:

```javascript
import { rowToClassGoal } from '../utils/rowMappers.js';
import { resolveCurrentTerm, getAutoGeneratedTargets } from '../utils/classGoalsEngine.js';
import { generateId } from '../utils/helpers.js';
```

- [ ] **Step 2: Add GET and PUT goals handlers**

Add the route handlers from `src/routes/classGoals.js` (Task 4) directly into `src/routes/classes.js` as `classesRouter.get('/:id/goals', ...)` and `classesRouter.put('/:id/goals', ...)`. Use `c.req.param('id')` (not `classId`) to match the existing pattern.

Delete `src/routes/classGoals.js` — it is no longer needed.

- [ ] **Step 3: Commit**

```bash
git add src/routes/classes.js
git rm src/routes/classGoals.js 2>/dev/null || true
git commit -m "feat(class-goals): add goal routes to existing classes router"
```

---

### Task 6: Integrate Goal Updates into Session Handlers

**Files:**
- Modify: `src/routes/students.js`

- [ ] **Step 1: Add import**

Add at the top of `src/routes/students.js` alongside the badge import:

```javascript
import { updateClassGoalOnSession } from '../utils/classGoalsEngine.js';
```

- [ ] **Step 2: Add goal update to session CREATE handler**

In the POST session handler, after the badge evaluation block (after `evaluateRealTime` call, around line 1396), add:

```javascript
// Update class goals
const completedGoals = isMarkerSession
  ? []
  : await updateClassGoalOnSession(db, id, organizationId);
```

Add `completedGoals` to the response object (around line 1424):

```javascript
return c.json({
  id: session.id,
  // ... existing fields ...
  newBadges,
  completedGoals,
}, 201);
```

- [ ] **Step 3: Add goal update to session UPDATE handler**

Same pattern in the PUT handler — after badge evaluation, add `updateClassGoalOnSession` call. Add `completedGoals` to response. Note: the existing PUT handler does NOT check `isMarkerSession` for badges — follow the same pattern (always recalculate, since markers may be edited to/from real sessions).

- [ ] **Step 4: Add goal update to session DELETE handler**

In the DELETE handler, after badge/stats recalculation, add:

```javascript
// Recalculate class goals (counters may decrease, never completes goals)
await updateClassGoalOnSession(db, id, organizationId);
```

DELETE does NOT include `completedGoals` in response (counters only decrease on delete).

- [ ] **Step 5: Commit**

```bash
git add src/routes/students.js
git commit -m "feat(class-goals): integrate goal updates into session CRUD handlers"
```

---

### Task 7: Add Class Goals to Nightly Cron

**Files:**
- Modify: `src/worker.js`

- [ ] **Step 1: Add class goals recalculation to 2:30 AM cron**

In `src/worker.js`, inside the `30 2 * * *` cron handler, after the badge evaluation loop (around line 660), add:

```javascript
// ── Class goals drift correction ──────────────────────────────────
try {
  const { recalculateClassGoalProgress, resolveCurrentTerm } = await import(
    './utils/classGoalsEngine.js'
  );

  let totalClassesProcessed = 0;

  for (const org of orgs.results || []) {
    const classes = await db
      .prepare('SELECT id FROM classes WHERE organization_id = ? AND is_active = 1')
      .bind(org.id)
      .all();

    // Resolve term for this org
    const termDatesResult = await db
      .prepare('SELECT term_name, start_date, end_date, academic_year FROM term_dates WHERE organization_id = ? ORDER BY start_date')
      .bind(org.id)
      .all();

    const today = new Date().toISOString().split('T')[0];
    const { term, startDate, endDate } = resolveCurrentTerm(termDatesResult.results || [], today);

    for (const cls of (classes.results || [])) {
      try {
        await recalculateClassGoalProgress(db, cls.id, org.id, startDate, endDate, term);
        totalClassesProcessed++;
      } catch (err) {
        console.error(`[Cron] Class goal recalc error for class ${cls.id}:`, err.message);
      }
    }
  }

  console.log(`[Cron] Class goals recalculated: ${totalClassesProcessed} classes`);
} catch (error) {
  console.error('[Cron] Class goals recalculation failed:', error.message);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/worker.js
git commit -m "feat(class-goals): add class goals drift correction to nightly cron"
```

---

### Task 8: Infrastructure — orgPurge and demoReset

**Files:**
- Modify: `src/services/orgPurge.js`
- Modify: `src/services/demoReset.js`

- [ ] **Step 1: Add class_goals to orgPurge DELETE_ORDER**

In `src/services/orgPurge.js`, add after the `class_assignments` entry and before `students`:

```javascript
{
  table: 'class_goals',
  where: `class_id IN (SELECT id FROM classes WHERE organization_id = ?)`,
},
```

- [ ] **Step 2: Add class_goals to demoReset DELETE_TABLES**

In `src/services/demoReset.js`, add to the DELETE_TABLES array (after `class_assignments`, before `students`):

```javascript
{
  table: 'class_goals',
  where: `class_id IN (SELECT id FROM classes WHERE organization_id = '${DEMO_ORG_ID}')`,
},
```

No demo snapshot data needed — goals will auto-generate on first access.

- [ ] **Step 3: Commit**

```bash
git add src/services/orgPurge.js src/services/demoReset.js
git commit -m "feat(class-goals): add class_goals to orgPurge and demoReset"
```

---

## Chunk 3: Frontend — AchievementsTab & Editor

### Task 9: Modify GardenHeader to Accept Stage Prop

**Files:**
- Modify: `src/components/badges/GardenHeader.js`

- [ ] **Step 1: Add optional `stage` and `label` props**

Update the component signature and stage resolution:

```javascript
export default function GardenHeader({ badgeCount = 0, studentName = '', stage: stageProp, label }) {
  const stage = stageProp
    ? STAGES.find((s) => s.name.toLowerCase().replace(' ', '_') === stageProp) || STAGES[0]
    : getStage(badgeCount);
  const SvgComponent = SVG_COMPONENTS[stage.name];

  const subtitle = label || (studentName ? `${studentName}'s Reading Garden` : 'Reading Garden');
```

Update the subtitle Typography to use the `subtitle` variable instead of the inline expression.

- [ ] **Step 2: Commit**

```bash
git add src/components/badges/GardenHeader.js
git commit -m "feat(class-goals): add stage and label props to GardenHeader"
```

---

### Task 10: Add Class Goals Section to AchievementsTab

**Files:**
- Modify: `src/components/stats/AchievementsTab.js`

- [ ] **Step 1: Add class goals data fetching**

Add a second `useEffect` to fetch class goals alongside badge data:

```javascript
const [classGoals, setClassGoals] = useState(null);

useEffect(() => {
  if (!globalClassFilter || globalClassFilter === 'all' || globalClassFilter === 'unassigned') {
    setClassGoals(null);
    return;
  }
  fetchWithAuth(`/api/classes/${globalClassFilter}/goals`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then(setClassGoals)
    .catch(() => setClassGoals(null));
}, [globalClassFilter, fetchWithAuth]);
```

- [ ] **Step 2: Add Class Goals UI section**

Before the existing badge category accordions, render the class goals section:

```jsx
{classGoals && (
  <ClassGoalsSection
    classGoals={classGoals}
    onEdit={() => setShowGoalEditor(true)}
    onDisplay={() => setShowDisplay(true)}
  />
)}
```

Create the `ClassGoalsSection` as an inline component or extract to a separate helper within the file. It renders:
- Section header with "Edit Goals" and "Display Mode" buttons
- Three progress bars (sessions, genres, books) with `current / target`
- GardenHeader with `stage={classGoals.gardenStage}` and `label="{className}'s Reading Garden"`
- "Goal reached!" chip on completed goals

- [ ] **Step 3: Add state for editor and display modals**

```javascript
const [showGoalEditor, setShowGoalEditor] = useState(false);
const [showDisplay, setShowDisplay] = useState(false);
```

Render the modals:

```jsx
<ClassGoalsEditor
  open={showGoalEditor}
  onClose={() => setShowGoalEditor(false)}
  classId={globalClassFilter}
  goals={classGoals?.goals || []}
  onSave={(updated) => { setClassGoals(updated); setShowGoalEditor(false); }}
  fetchWithAuth={fetchWithAuth}
/>
<ClassGoalsDisplay
  open={showDisplay}
  onClose={() => setShowDisplay(false)}
  classId={globalClassFilter}
  fetchWithAuth={fetchWithAuth}
/>
```

- [ ] **Step 4: Show prompt when "All Classes" is selected**

When `globalClassFilter` is `'all'` or `'unassigned'`, show:

```jsx
<Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
  Select a class to view class goals.
</Typography>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/stats/AchievementsTab.js
git commit -m "feat(class-goals): add class goals section to AchievementsTab"
```

---

### Task 11: ClassGoalsEditor Modal

**Files:**
- Create: `src/components/goals/ClassGoalsEditor.js`

- [ ] **Step 1: Create the editor component**

MUI Dialog with three TextField number inputs (sessions, genres, books targets). Pre-populated from `goals` prop. "Reset to defaults" link. Save calls `PUT /api/classes/:classId/goals` via `fetchWithAuth`. Standard Dialog with cancel/save buttons.

```jsx
import { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box, Link, Typography } from '@mui/material';

export default function ClassGoalsEditor({ open, onClose, classId, goals, onSave, fetchWithAuth }) {
  const [targets, setTargets] = useState(() => {
    const map = {};
    goals.forEach((g) => { map[g.metric] = g.target; });
    return map;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetchWithAuth(`/api/classes/${classId}/goals`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goals: Object.entries(targets).map(([metric, target]) => ({ metric, target: Number(target) })),
        }),
      });
      if (response.ok) {
        const data = await response.json();
        onSave(data);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit Class Goals</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField label="Reading Sessions Target" type="number" value={targets.sessions || ''} onChange={(e) => setTargets((t) => ({ ...t, sessions: e.target.value }))} inputProps={{ min: 1 }} />
          <TextField label="Genres Explored Target" type="number" value={targets.genres || ''} onChange={(e) => setTargets((t) => ({ ...t, genres: e.target.value }))} inputProps={{ min: 1 }} />
          <TextField label="Unique Books Target" type="number" value={targets.books || ''} onChange={(e) => setTargets((t) => ({ ...t, books: e.target.value }))} inputProps={{ min: 1 }} />
          <Link
            component="button"
            variant="body2"
            onClick={() => {
              // Fetch class size and reset to auto-generated defaults
              fetchWithAuth(`/api/classes/${classId}/students`)
                .then((r) => r.ok ? r.json() : [])
                .then((students) => {
                  const size = Array.isArray(students) ? students.length : 0;
                  setTargets({ sessions: size * 20, genres: 10, books: size * 4 });
                });
            }}
          >
            Reset to defaults
          </Link>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/goals/ClassGoalsEditor.js
git commit -m "feat(class-goals): add ClassGoalsEditor modal"
```

---

## Chunk 4: Frontend — Display Mode & Celebrations

### Task 12: ClassGoalsDisplay Fullscreen Overlay

**Files:**
- Create: `src/components/goals/ClassGoalsDisplay.js`

- [ ] **Step 1: Create the display component**

Fullscreen MUI Dialog with dark theme. Large progress bars, GardenHeader at 2x scale, confetti on recently achieved goals. Auto-refreshes every 30 seconds. Closes on Escape.

Key elements:
- Dark background gradient (`#2D2A24` → `#3D3427`)
- Class name header + term label
- `GardenHeader` with `stage` and `label` props
- Three large progress bars with 24px numbers
- "Goal reached!" badges on completed goals
- Confetti animation (CSS keyframes, no external library — match `BadgeCelebration` approach)
- `useEffect` with 30-second `setInterval` to re-fetch data
- `fullScreen` prop on MUI Dialog

- [ ] **Step 2: Commit**

```bash
git add src/components/goals/ClassGoalsDisplay.js
git commit -m "feat(class-goals): add ClassGoalsDisplay fullscreen overlay with auto-refresh"
```

---

### Task 13: Goal Completion Celebrations in Session Forms

**Files:**
- Modify: `src/components/sessions/SessionForm.js`
- Modify: `src/components/sessions/HomeReadingRegister.js`

- [ ] **Step 1: Handle completedGoals in SessionForm**

In `SessionForm.js`, after the existing `BadgeCelebration` handling, add state for completed goals:

```javascript
const [completedGoals, setCompletedGoals] = useState([]);
```

In the save handler, after extracting `newBadges` from the response, also extract `completedGoals`:

```javascript
if (result.completedGoals?.length) {
  // Queue — shown after BadgeCelebration dismisses (or immediately if no badges)
  setPendingGoalCelebration(result.completedGoals);
}
```

Wire the sequencing: if `BadgeCelebration` is showing, set `completedGoals` only when it closes:

```javascript
const [pendingGoalCelebration, setPendingGoalCelebration] = useState(null);
const [completedGoals, setCompletedGoals] = useState([]);

// In BadgeCelebration onClose:
const handleBadgeCelebrationClose = () => {
  setNewBadges([]);
  if (pendingGoalCelebration) {
    setCompletedGoals(pendingGoalCelebration);
    setPendingGoalCelebration(null);
  }
};

// If no badges but goals completed, show immediately:
useEffect(() => {
  if (pendingGoalCelebration && newBadges.length === 0) {
    setCompletedGoals(pendingGoalCelebration);
    setPendingGoalCelebration(null);
  }
}, [pendingGoalCelebration, newBadges]);
```

Add the celebration Snackbar:

```jsx
<Snackbar
  open={completedGoals.length > 0}
  autoHideDuration={5000}
  onClose={() => setCompletedGoals([])}
  message={completedGoals[0] ? `Your class just hit ${completedGoals[0].target} ${completedGoals[0].metric}!` : ''}
/>
```

- [ ] **Step 2: Handle completedGoals in HomeReadingRegister**

Same pattern — accumulate `completedGoals` from bulk session saves, show a single toast after the batch completes. Same Snackbar approach.

- [ ] **Step 3: Commit**

```bash
git add src/components/sessions/SessionForm.js src/components/sessions/HomeReadingRegister.js
git commit -m "feat(class-goals): add goal completion celebrations in session forms"
```

---

### Task 14: Update CLAUDE.md and Structure Files

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/structure/routes.yaml`
- Modify: `.claude/structure/components.yaml`
- Modify: `.claude/structure/utils-services.yaml`

- [ ] **Step 1: Add new files to CLAUDE.md file map**

Add these entries:

```
src/routes/classGoals.js - GET/PUT class goals, auto-generation, term resolution
src/utils/classGoalsEngine.js - Term resolution, auto-generation defaults, progress recalculation
src/components/goals/ClassGoalsEditor.js - Teacher modal for editing class goal targets
src/components/goals/ClassGoalsDisplay.js - Fullscreen classroom projection view with garden and confetti
```

- [ ] **Step 2: Update structure YAML files**

Add route, component, and utility entries to the relevant YAML files.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md .claude/structure/
git commit -m "docs: add class goals files to CLAUDE.md and structure YAML"
```

---

### Task 15: Run Full Test Suite and Deploy

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass (existing + new class goals tests).

- [ ] **Step 2: Build, migrate, and deploy**

Run: `npm run go`
Expected: Build + remote migration + deploy succeeds. (`npm run go` runs build, applies remote D1 migrations, and deploys to Cloudflare in one command.)

- [ ] **Step 3: Commit version bump**

```bash
git commit -m "feat: collaborative class goals with display mode (v3.43.0)"
```
