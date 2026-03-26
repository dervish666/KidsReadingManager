# Onboarding Tours Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-page guided tours that auto-show on first visit, with server-side completion tracking and a replay button.

**Architecture:** Backend stores tour completion per user in D1 via a simple REST API. Frontend uses react-joyride (lazy-loaded) wrapped in a TourProvider context, with a `useTour` hook that each page calls. Tour step definitions live in a pure data file.

**Tech Stack:** React 19, react-joyride, MUI v7, Hono (Cloudflare Workers), D1 (SQLite), Vitest

**Spec:** `docs/superpowers/specs/2026-03-26-onboarding-tours-design.md`

---

## Chunk 1: Backend (Database, API, State)

### Task 1: Database Migration

**Files:**
- Create: `migrations/0041_user_tour_completions.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- migrations/0041_user_tour_completions.sql
CREATE TABLE IF NOT EXISTS user_tour_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tour_id TEXT NOT NULL,
  tour_version INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, tour_id)
);
```

- [ ] **Step 2: Apply migration locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration 0041 applied successfully.

- [ ] **Step 3: Commit**

```bash
git add migrations/0041_user_tour_completions.sql
git commit -m "feat: add user_tour_completions table (migration 0041)"
```

---

### Task 2: Row Mapper

**Files:**
- Modify: `src/utils/rowMappers.js` (add after last mapper, ~line 200)

- [ ] **Step 1: Write the test**

Create `src/__tests__/unit/rowMappers.tour.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { rowToTourCompletion } from '../../utils/rowMappers';

describe('rowToTourCompletion', () => {
  it('returns null for null/undefined input', () => {
    expect(rowToTourCompletion(null)).toBeNull();
    expect(rowToTourCompletion(undefined)).toBeNull();
  });

  it('maps snake_case DB row to camelCase object', () => {
    const row = {
      id: 1,
      user_id: 42,
      tour_id: 'students',
      tour_version: 2,
      completed_at: '2026-03-26T12:00:00Z',
    };
    expect(rowToTourCompletion(row)).toEqual({
      id: 1,
      userId: 42,
      tourId: 'students',
      version: 2,
      completedAt: '2026-03-26T12:00:00Z',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/rowMappers.tour.test.js`
Expected: FAIL — `rowToTourCompletion` is not exported.

- [ ] **Step 3: Implement the mapper**

Add to the end of `src/utils/rowMappers.js`:

```js
export const rowToTourCompletion = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    tourId: row.tour_id,
    version: row.tour_version,
    completedAt: row.completed_at,
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/rowMappers.tour.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/rowMappers.js src/__tests__/unit/rowMappers.tour.test.js
git commit -m "feat: add rowToTourCompletion mapper"
```

---

### Task 3: Tours API Route

**Files:**
- Create: `src/routes/tours.js`
- Test: `src/__tests__/unit/tours.route.test.js`

- [ ] **Step 1: Write tests for GET /api/tours/status**

Create `src/__tests__/unit/tours.route.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { toursRouter } from '../../routes/tours';

// Stub middleware to inject userId and userRole into context (bypasses real auth)
const mockDb = {
  prepare: vi.fn().mockReturnThis(),
  bind: vi.fn().mockReturnThis(),
  all: vi.fn().mockResolvedValue({ results: [] }),
  run: vi.fn().mockResolvedValue({ success: true }),
};

const createApp = () => {
  const app = new Hono();
  // Inject auth context and DB binding before routes
  app.use('*', async (c, next) => {
    c.set('userId', 1);
    c.set('userRole', 'teacher');
    c.env = { READING_MANAGER_DB: mockDb };
    await next();
  });
  app.route('/api/tours', toursRouter);
  return app;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.prepare.mockReturnThis();
  mockDb.bind.mockReturnThis();
  mockDb.all.mockResolvedValue({ results: [] });
  mockDb.run.mockResolvedValue({ success: true });
});

describe('GET /api/tours/status', () => {
  it('returns empty array when no tours completed', async () => {
    const app = createApp();
    const res = await app.request('/api/tours/status');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it('returns completed tours with tourId and version', async () => {
    mockDb.all.mockResolvedValue({
      results: [
        { id: 1, user_id: 1, tour_id: 'students', tour_version: 1, completed_at: '2026-03-26T12:00:00Z' },
        { id: 2, user_id: 1, tour_id: 'stats', tour_version: 1, completed_at: '2026-03-26T13:00:00Z' },
      ],
    });

    const app = createApp();
    const res = await app.request('/api/tours/status');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([
      { tourId: 'students', version: 1 },
      { tourId: 'stats', version: 1 },
    ]);
  });
});

describe('POST /api/tours/:tourId/complete', () => {
  it('returns 400 if version is missing', async () => {
    const app = createApp();
    const res = await app.request('/api/tours/students/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 if version is not a number', async () => {
    const app = createApp();
    const res = await app.request('/api/tours/students/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 'abc' }),
    });
    expect(res.status).toBe(400);
  });

  it('upserts completion and returns success', async () => {
    const app = createApp();
    const res = await app.request('/api/tours/students/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1 }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ success: true, tourId: 'students', version: 1 });
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_tour_completions'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/tours.route.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tours route**

Create `src/routes/tours.js`:

```js
import { Hono } from 'hono';
import { requireReadonly } from '../middleware/tenant';

const tours = new Hono();

// GET /status - returns all completed tours for the authenticated user
tours.get('/status', requireReadonly(), async (c) => {
  const userId = c.get('userId');
  const db = c.env.READING_MANAGER_DB;

  const { results } = await db
    .prepare('SELECT * FROM user_tour_completions WHERE user_id = ?')
    .bind(userId)
    .all();

  const completions = results.map((row) => ({
    tourId: row.tour_id,
    version: row.tour_version,
  }));
  return c.json(completions);
});

// POST /:tourId/complete - marks a tour as completed
tours.post('/:tourId/complete', requireReadonly(), async (c) => {
  const userId = c.get('userId');
  const tourId = c.req.param('tourId');
  const db = c.env.READING_MANAGER_DB;

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { version } = body;
  if (typeof version !== 'number' || version < 1) {
    return c.json({ error: 'version (number) is required' }, 400);
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO user_tour_completions (user_id, tour_id, tour_version, completed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, tour_id)
       DO UPDATE SET tour_version = excluded.tour_version, completed_at = excluded.completed_at`
    )
    .bind(userId, tourId, version, now)
    .run();

  return c.json({ success: true, tourId, version });
});

export { tours as toursRouter };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/tours.route.test.js`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Register the route in worker.js**

In `src/worker.js`, add the import near line 21-40 with the other route imports:

```js
import { toursRouter } from './routes/tours';
```

Add the route registration near line 233 (after the last `app.route` call, before the health check):

```js
app.route('/api/tours', toursRouter);
```

- [ ] **Step 6: Commit**

```bash
git add src/routes/tours.js src/__tests__/unit/tours.route.test.js src/worker.js
git commit -m "feat: add tours API (GET status, POST complete)"
```

---

### Task 4: AppContext — Tour State & Fetch

**Files:**
- Modify: `src/contexts/AppContext.js`

- [ ] **Step 1: Add state variable**

Near line 106 (after `settings` state), add:

```js
const [completedTours, setCompletedTours] = useState({});
```

- [ ] **Step 2: Add fetchTourStatus function**

Near the other fetch functions (around `reloadDataFromServer`), add:

```js
const fetchTourStatus = useCallback(async () => {
  try {
    const response = await fetchWithAuth('/api/tours/status');
    if (response.ok) {
      const tours = await response.json();
      const tourMap = {};
      tours.forEach((t) => {
        tourMap[t.tourId] = t.version;
      });
      setCompletedTours(tourMap);
    }
  } catch (err) {
    console.error('Failed to fetch tour status:', err);
  }
}, [fetchWithAuth]);
```

- [ ] **Step 3: Add markTourComplete function**

```js
const markTourComplete = useCallback(async (tourId, version) => {
  try {
    const response = await fetchWithAuth(`/api/tours/${tourId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version }),
    });
    if (response.ok) {
      setCompletedTours((prev) => ({ ...prev, [tourId]: version }));
    }
  } catch (err) {
    console.error('Failed to mark tour complete:', err);
  }
}, [fetchWithAuth]);
```

- [ ] **Step 4: Call fetchTourStatus in auth init useEffect**

In the auth initialization `useEffect` (~line 791), make two changes:
1. Add `fetchTourStatus()` call after `reloadDataFromServer()`
2. Add `fetchTourStatus` to the dependency array

```js
useEffect(() => {
  if (authToken) {
    if (!hasLoadedData.current) {
      hasLoadedData.current = true;
      reloadDataFromServer();
      fetchTourStatus(); // Add this line
    }
  } else {
    hasLoadedData.current = false;
    setLoading(false);
  }
}, [authToken, reloadDataFromServer, fetchTourStatus]); // Add fetchTourStatus to deps
```

- [ ] **Step 5: Add to context value**

In the `useMemo` that assembles the context value (~line 1740), add to the value object:

```js
completedTours,
markTourComplete,
```

Also add `completedTours` and `markTourComplete` to the useMemo dependency array.

- [ ] **Step 6: Run existing tests to check for regressions**

Run: `npx vitest run`
Expected: All existing tests pass. The new state and functions are additive — no existing behavior changes.

- [ ] **Step 7: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds. This catches any import errors or missing dependencies in the context changes.

- [ ] **Step 8: Commit**

```bash
git add src/contexts/AppContext.js
git commit -m "feat: add tour completion state and API calls to AppContext"
```

---

## Chunk 2: Tour Infrastructure (Components & Hook)

### Task 5: Install react-joyride

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the dependency**

Run: `npm install react-joyride`

- [ ] **Step 2: Verify installation**

Run: `npm ls react-joyride`
Expected: Shows react-joyride version in tree.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-joyride dependency"
```

---

### Task 6: Tour Step Definitions

**Files:**
- Create: `src/components/tour/tourSteps.js`
- Test: `src/__tests__/unit/tourSteps.test.js`

- [ ] **Step 1: Write the test**

Create `src/__tests__/unit/tourSteps.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { TOURS } from '../../components/tour/tourSteps';

describe('TOURS', () => {
  it('defines tours for all v1 pages', () => {
    expect(TOURS).toHaveProperty('students');
    expect(TOURS).toHaveProperty('session-form');
    expect(TOURS).toHaveProperty('home-reading');
    expect(TOURS).toHaveProperty('stats');
  });

  it('each tour has a version and non-empty steps array', () => {
    Object.entries(TOURS).forEach(([tourId, tour]) => {
      expect(tour.version).toBeGreaterThan(0);
      expect(tour.steps.length).toBeGreaterThan(0);
      expect(tour.steps.length).toBeLessThanOrEqual(5);
    });
  });

  it('each step has target, title, and content', () => {
    Object.entries(TOURS).forEach(([tourId, tour]) => {
      tour.steps.forEach((step, i) => {
        expect(step.target, `${tourId} step ${i} missing target`).toBeTruthy();
        expect(step.title, `${tourId} step ${i} missing title`).toBeTruthy();
        expect(step.content, `${tourId} step ${i} missing content`).toBeTruthy();
        expect(step.target).toMatch(/^\[data-tour="/);
      });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/tourSteps.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the tour steps file**

Create `src/components/tour/tourSteps.js`:

```js
export const TOURS = {
  students: {
    version: 1,
    steps: [
      {
        target: '[data-tour="students-priority-list"]',
        title: 'Priority List',
        content:
          'Tap a student here to bump them to the top of your list — great for tracking who needs attention today.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="students-search"]',
        title: 'Search Students',
        content: 'Search for any student by name to find them quickly.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="students-status-filters"]',
        title: 'Filter by Status',
        content:
          'Filter students by reading status. Red means not read recently, orange needs attention, green is on track.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="students-row"]',
        title: 'Student Details',
        content:
          'Tap any student to see their reading history, edit their profile, and adjust their preferences.',
        placement: 'top',
      },
    ],
  },
  'session-form': {
    version: 1,
    steps: [
      {
        target: '[data-tour="session-student-select"]',
        title: 'Pick a Student',
        content:
          'Choose a student to record a reading session. Recently accessed students are marked for quick access.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="session-book-select"]',
        title: 'Find a Book',
        content: "Search your school's book library, or type a new title to add it.",
        placement: 'bottom',
      },
      {
        target: '[data-tour="session-location"]',
        title: 'Reading Location',
        content: 'Mark whether this was a school or home reading session.',
        placement: 'top',
      },
      {
        target: '[data-tour="session-assessment"]',
        title: 'Rate the Reading',
        content: 'Rate how the student read — this tracks their progress over time.',
        placement: 'top',
      },
      {
        target: '[data-tour="session-save"]',
        title: 'Save Session',
        content: 'Save the session. You can always come back and edit or add notes.',
        placement: 'top',
      },
    ],
  },
  'home-reading': {
    version: 1,
    steps: [
      {
        target: '[data-tour="register-date-range"]',
        title: 'Choose Dates',
        content: 'Choose a date range — This Week is great for daily check-ins.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="register-table"]',
        title: 'The Register',
        content: 'Each cell is a student and date. Tap to record their reading for that day.',
        placement: 'top',
      },
      {
        target: '[data-tour="register-totals"]',
        title: 'Daily Totals',
        content: 'See at a glance how many students read each day.',
        placement: 'top',
      },
    ],
  },
  stats: {
    version: 1,
    steps: [
      {
        target: '[data-tour="stats-tabs"]',
        title: 'Different Views',
        content: 'Switch between Overview, Streaks, Books, and more for deeper insights.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="stats-summary-cards"]',
        title: 'Key Numbers',
        content:
          "Your key numbers: total students, sessions, averages, and who hasn't read yet.",
        placement: 'bottom',
      },
      {
        target: '[data-tour="stats-weekly-activity"]',
        title: 'Weekly Trend',
        content: 'See if reading is trending up or down compared to last week.',
        placement: 'top',
      },
    ],
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/tourSteps.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/tour/tourSteps.js src/__tests__/unit/tourSteps.test.js
git commit -m "feat: add tour step definitions for v1 pages"
```

---

### Task 7: Custom Tooltip Component

**Files:**
- Create: `src/components/tour/TourTooltip.js`

- [ ] **Step 1: Create the custom tooltip**

This is the react-joyride custom tooltip component. It receives props from joyride and renders the glassmorphism-styled tooltip.

Create `src/components/tour/TourTooltip.js`:

```js
import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';

const TourTooltip = ({ continuous, index, step, size, backProps, closeProps, primaryProps, skipProps, tooltipProps }) => {
  const isFirst = index === 0;
  const isLast = index === size - 1;

  return (
    <Box
      {...tooltipProps}
      sx={{
        width: 320,
        maxWidth: 'calc(100vw - 32px)',
        borderRadius: '16px',
        background: 'rgba(255, 254, 249, 0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(139, 115, 85, 0.15)',
        boxShadow: '0 12px 40px rgba(139, 115, 85, 0.12), 0 2px 8px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2.5, pt: 2, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography
          sx={{
            fontFamily: '"Nunito", sans-serif',
            fontWeight: 800,
            fontSize: '1rem',
            color: '#6B8E6B',
          }}
        >
          {step.title}
        </Typography>
        <IconButton {...closeProps} sx={{ color: '#7A7A7A', ml: 1, minWidth: 48, minHeight: 48 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Body */}
      <Box sx={{ px: 2.5, pb: 2 }}>
        <Typography sx={{ fontSize: '0.9rem', lineHeight: 1.5, color: '#7A7A7A' }}>
          {step.content}
        </Typography>
      </Box>

      {/* Footer */}
      <Box sx={{ px: 2.5, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Progress dots */}
        <Box sx={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {Array.from({ length: size }, (_, i) => (
            <Box
              key={i}
              sx={{
                height: 8,
                borderRadius: i === index ? '4px' : '50%',
                width: i === index ? 20 : 8,
                background: i === index ? '#6B8E6B' : 'rgba(107, 142, 107, 0.25)',
                transition: 'all 0.2s ease',
              }}
            />
          ))}
        </Box>

        {/* Buttons */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          {!isFirst && (
            <Button
              {...backProps}
              size="small"
              sx={{
                minHeight: 48,
                borderRadius: '10px',
                background: 'rgba(107, 142, 107, 0.1)',
                color: '#6B8E6B',
                fontWeight: 700,
                textTransform: 'none',
                fontSize: '0.85rem',
                boxShadow: 'none',
                '&:hover': { background: 'rgba(107, 142, 107, 0.18)', boxShadow: 'none' },
              }}
            >
              Back
            </Button>
          )}
          {isFirst && !isLast && (
            <Button
              {...skipProps}
              size="small"
              sx={{
                minHeight: 48,
                color: '#7A7A7A',
                fontWeight: 700,
                textTransform: 'none',
                fontSize: '0.85rem',
                boxShadow: 'none',
                '&:hover': { background: 'transparent', boxShadow: 'none' },
              }}
            >
              Skip
            </Button>
          )}
          <Button
            {...primaryProps}
            size="small"
            sx={{
              minHeight: 48,
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
              color: '#ffffff',
              fontWeight: 700,
              textTransform: 'none',
              fontSize: '0.85rem',
              boxShadow: '0 4px 12px rgba(107, 142, 107, 0.25)',
              '&:hover': {
                boxShadow: '0 6px 20px rgba(107, 142, 107, 0.3)',
              },
            }}
          >
            {isLast ? 'Done' : 'Next'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default TourTooltip;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tour/TourTooltip.js
git commit -m "feat: add glassmorphism tour tooltip component"
```

---

### Task 8: TourButton Component

**Files:**
- Create: `src/components/tour/TourButton.js`

- [ ] **Step 1: Create the TourButton**

Create `src/components/tour/TourButton.js`:

```js
import React from 'react';
import IconButton from '@mui/material/IconButton';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import { keyframes } from '@mui/material/styles';

const gentlePulse = keyframes`
  0%, 100% { box-shadow: 0 2px 8px rgba(139, 115, 85, 0.1); }
  50% { box-shadow: 0 2px 8px rgba(139, 115, 85, 0.1), 0 0 0 8px rgba(107, 142, 107, 0.1); }
`;

const TourButton = ({ onClick, shouldPulse = false }) => {
  return (
    <IconButton
      onClick={onClick}
      aria-label="Page tour"
      sx={{
        position: 'fixed',
        bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        right: 16,
        zIndex: 1050,
        width: 40,
        height: 40,
        background: 'rgba(255, 254, 249, 0.95)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: '1px solid rgba(107, 142, 107, 0.2)',
        boxShadow: '0 2px 8px rgba(139, 115, 85, 0.1)',
        color: '#6B8E6B',
        animation: shouldPulse ? `${gentlePulse} 2s ease-in-out infinite` : 'none',
        '&:hover': {
          background: 'rgba(255, 254, 249, 1)',
          border: '1px solid rgba(107, 142, 107, 0.35)',
        },
      }}
    >
      <ExploreOutlinedIcon sx={{ fontSize: 22 }} />
    </IconButton>
  );
};

export default TourButton;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tour/TourButton.js
git commit -m "feat: add floating tour replay button component"
```

---

### Task 9: TourProvider Component

**Files:**
- Create: `src/components/tour/TourProvider.js`

- [ ] **Step 1: Create the TourProvider**

This component manages tour state and lazy-loads react-joyride. It provides `startTour` and `isTourAvailable` via context.

Create `src/components/tour/TourProvider.js`:

```js
import React, { createContext, useContext, useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { TOURS } from './tourSteps';
import TourTooltip from './TourTooltip';

const Joyride = lazy(() => import('react-joyride'));

const TourContext = createContext(null);

export const useTourContext = () => useContext(TourContext);

const TourProvider = ({ children }) => {
  const { completedTours, markTourComplete } = useAppContext();
  const [currentTourId, setCurrentTourId] = useState(null);
  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [joyrideLoaded, setJoyrideLoaded] = useState(false);

  const currentTour = currentTourId ? TOURS[currentTourId] : null;
  const steps = currentTour
    ? currentTour.steps.map((step) => ({
        ...step,
        disableBeacon: true,
      }))
    : [];

  const startTour = useCallback((tourId) => {
    if (!TOURS[tourId]) return;
    setCurrentTourId(tourId);
    setStepIndex(0);
    setRunning(true);
    setJoyrideLoaded(true);
  }, []);

  const isTourAvailable = useCallback((tourId) => {
    return !!TOURS[tourId];
  }, []);

  const isTourCompleted = useCallback(
    (tourId) => {
      const tour = TOURS[tourId];
      if (!tour) return true;
      return completedTours[tourId] >= tour.version;
    },
    [completedTours]
  );

  const handleJoyrideCallback = useCallback(
    (data) => {
      const { status, type, index } = data;

      if (type === 'step:after') {
        setStepIndex(index + 1);
      }

      if (status === 'finished' || status === 'skipped') {
        setRunning(false);
        setCurrentTourId(null);
        if (currentTour) {
          markTourComplete(currentTourId, currentTour.version);
        }
      }
    },
    [currentTourId, currentTour, markTourComplete]
  );

  const value = {
    startTour,
    isTourAvailable,
    isTourCompleted,
    running,
    currentTourId,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
      {joyrideLoaded && (
        <Suspense fallback={null}>
          <Joyride
            steps={steps}
            run={running}
            stepIndex={stepIndex}
            continuous
            showSkipButton
            scrollToFirstStep
            disableOverlayClose
            spotlightClicks={false}
            tooltipComponent={TourTooltip}
            callback={handleJoyrideCallback}
            styles={{
              options: {
                zIndex: 1200,
                overlayColor: 'rgba(74, 74, 74, 0.45)',
              },
              spotlight: {
                borderRadius: 12,
              },
            }}
            floaterProps={{
              disableAnimation: true,
            }}
          />
        </Suspense>
      )}
    </TourContext.Provider>
  );
};

export default TourProvider;
```

- [ ] **Step 2: Verify build succeeds**

Run: `npm run build`
Expected: Build succeeds. This catches import errors (e.g., `useAppContext` export name, react-joyride lazy import).

- [ ] **Step 3: Commit**

```bash
git add src/components/tour/TourProvider.js
git commit -m "feat: add TourProvider with lazy-loaded react-joyride"
```

---

### Task 10: useTour Hook

**Files:**
- Create: `src/components/tour/useTour.js`
- Test: `src/__tests__/unit/useTour.test.js`

- [ ] **Step 1: Write the test**

Create `src/__tests__/unit/useTour.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock TourProvider context
const mockStartTour = vi.fn();
const mockIsTourAvailable = vi.fn().mockReturnValue(true);
const mockIsTourCompleted = vi.fn().mockReturnValue(false);

vi.mock('../../components/tour/TourProvider', () => ({
  useTourContext: () => ({
    startTour: mockStartTour,
    isTourAvailable: mockIsTourAvailable,
    isTourCompleted: mockIsTourCompleted,
    running: false,
    currentTourId: null,
  }),
}));

import { useTour } from '../../components/tour/useTour';

describe('useTour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns tourButtonProps with onClick and shouldPulse', () => {
    const { result } = renderHook(() => useTour('students'));
    expect(result.current.tourButtonProps).toBeDefined();
    expect(result.current.tourButtonProps.onClick).toBeInstanceOf(Function);
    expect(typeof result.current.tourButtonProps.shouldPulse).toBe('boolean');
  });

  it('sets shouldPulse to true when tour not completed', () => {
    mockIsTourCompleted.mockReturnValue(false);
    const { result } = renderHook(() => useTour('students'));
    expect(result.current.tourButtonProps.shouldPulse).toBe(true);
  });

  it('sets shouldPulse to false when tour completed', () => {
    mockIsTourCompleted.mockReturnValue(true);
    const { result } = renderHook(() => useTour('students'));
    expect(result.current.tourButtonProps.shouldPulse).toBe(false);
  });

  it('does not auto-start when ready is false', () => {
    mockIsTourCompleted.mockReturnValue(false);
    renderHook(() => useTour('students', { ready: false }));
    // startTour should not be called even after delay
    expect(mockStartTour).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/useTour.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the useTour hook**

Create `src/components/tour/useTour.js`:

```js
import { useEffect, useCallback, useRef } from 'react';
import { useTourContext } from './TourProvider';

export const useTour = (tourId, { ready = true } = {}) => {
  const { startTour, isTourAvailable, isTourCompleted, running, currentTourId } = useTourContext();
  const hasAutoStarted = useRef(false);

  const isCompleted = isTourCompleted(tourId);
  const isAvailable = isTourAvailable(tourId);

  // Auto-start tour on first visit if not completed
  useEffect(() => {
    if (!ready || isCompleted || !isAvailable || hasAutoStarted.current || running) return;

    hasAutoStarted.current = true;
    const timer = setTimeout(() => {
      startTour(tourId);
    }, 500);

    return () => clearTimeout(timer);
  }, [ready, isCompleted, isAvailable, running, startTour, tourId]);

  const handleStartTour = useCallback(() => {
    startTour(tourId);
  }, [startTour, tourId]);

  return {
    startTour: handleStartTour,
    isTourAvailable: isAvailable,
    tourButtonProps: {
      onClick: handleStartTour,
      shouldPulse: !isCompleted && isAvailable,
    },
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/useTour.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/tour/useTour.js src/__tests__/unit/useTour.test.js
git commit -m "feat: add useTour hook with auto-start and ready guard"
```

---

## Chunk 3: Page Integration

### Task 11: Wrap App with TourProvider

**Files:**
- Modify: `src/App.js`

- [ ] **Step 1: Import TourProvider**

Near the top of `src/App.js`, add the import:

```js
import TourProvider from './components/tour/TourProvider';
```

- [ ] **Step 2: Wrap content with TourProvider**

Inside the `AppContent` component (or wherever the main content renders inside `AppProvider`), wrap the content with `<TourProvider>`. It must be inside `AppProvider` (needs AppContext) but can wrap everything else:

Find the section around lines 322-330 where `<BookCoverProvider>` wraps `<AppContent />`, and add TourProvider inside BookCoverProvider (or alongside it):

```jsx
<AppProvider>
  <BookCoverProvider>
    <TourProvider>
      <AppContent />
    </TourProvider>
  </BookCoverProvider>
</AppProvider>
```

- [ ] **Step 3: Run build to check for errors**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.js
git commit -m "feat: wrap app with TourProvider"
```

---

### Task 12: Add data-tour Attributes to StudentList

**Files:**
- Modify: `src/components/students/StudentList.js`
- Modify: `src/components/students/StudentTable.js` (or `StudentCard.js`) — for the first-row `data-tour` attribute

- [ ] **Step 1: Add data-tour attributes**

Add `data-tour` attributes to the four tour target elements:

1. On the `PrioritizedStudentsList` container element (~line 311):
   ```jsx
   <Box data-tour="students-priority-list">
     <PrioritizedStudentsList ... />
   </Box>
   ```
   Or add `data-tour="students-priority-list"` as a prop to the wrapping element if PrioritizedStudentsList is already wrapped.

2. On the search TextField (~line 322, the element with `aria-label="Search students"`):
   Add `data-tour="students-search"` to the TextField or its wrapping Box.

3. On the Box wrapping the status filter Chips (~line 359):
   Add `data-tour="students-status-filters"` to the Box containing the Chip components.

4. On the first student row: In `StudentTable.js` (or `StudentCard.js` for card view), pass the index to each row/card and conditionally add the attribute on the first item:
   ```jsx
   <TableRow data-tour={index === 0 ? 'students-row' : undefined} ...>
   ```
   The parent `StudentList.js` already passes the student array — the child component just needs to use the index.

- [ ] **Step 2: Add useTour hook and TourButton**

Import and use the hook and button:

```js
import { useTour } from '../tour/useTour';
import TourButton from '../tour/TourButton';
```

Inside the component, near the top:

```js
const { tourButtonProps } = useTour('students', { ready: students.length > 0 });
```

Render the TourButton at the end of the component's return:

```jsx
<TourButton {...tourButtonProps} />
```

- [ ] **Step 3: Test manually**

Run: `npm run start:dev`
Open the app, navigate to Students page. The tour should auto-start if it hasn't been completed. The compass button should appear bottom-right.

- [ ] **Step 4: Commit**

```bash
git add src/components/students/StudentList.js src/components/students/StudentTable.js src/components/students/StudentCard.js
git commit -m "feat: add tour integration to StudentList page"
```

---

### Task 13: Add data-tour Attributes to SessionForm

**Files:**
- Modify: `src/components/sessions/SessionForm.js`

- [ ] **Step 1: Add data-tour attributes**

1. On the Student Select element (`id="student-select"`):
   Add `data-tour="session-student-select"` to the FormControl or wrapping Box.

2. On the BookAutocomplete container:
   Add `data-tour="session-book-select"` to the wrapping element around BookAutocomplete.

3. On the ToggleButtonGroup (School/Home):
   Add `data-tour="session-location"` to the ToggleButtonGroup or its wrapper.

4. On the AssessmentSelector container:
   Add `data-tour="session-assessment"` to the wrapping element.

5. On the Save button (`type="submit"`):
   Add `data-tour="session-save"` to the Button element.

- [ ] **Step 2: Add useTour hook and TourButton**

```js
import { useTour } from '../tour/useTour';
import TourButton from '../tour/TourButton';
```

```js
const { tourButtonProps } = useTour('session-form');
```

Render `<TourButton {...tourButtonProps} />` in the return.

- [ ] **Step 3: Test manually**

Navigate to the Session Form page. Tour should auto-start on first visit. Verify each step highlights the correct element.

- [ ] **Step 4: Commit**

```bash
git add src/components/sessions/SessionForm.js
git commit -m "feat: add tour integration to SessionForm page"
```

---

### Task 14: Add data-tour Attributes to HomeReadingRegister

**Files:**
- Modify: `src/components/sessions/HomeReadingRegister.js`

- [ ] **Step 1: Add data-tour attributes**

1. On the date preset FormControl/Select:
   Add `data-tour="register-date-range"` to the date range control.

2. On the main Table element:
   Add `data-tour="register-table"` to the Table or its wrapping TableContainer.

3. On the TableFooter / daily totals row:
   Add `data-tour="register-totals"` to the footer element.

- [ ] **Step 2: Add useTour hook and TourButton**

```js
import { useTour } from '../tour/useTour';
import TourButton from '../tour/TourButton';
```

```js
const { tourButtonProps } = useTour('home-reading');
```

Render `<TourButton {...tourButtonProps} />` in the return.

- [ ] **Step 3: Test manually**

Navigate to Home Reading Register. Verify the 3-step tour highlights date range, table, and totals footer correctly.

- [ ] **Step 4: Commit**

```bash
git add src/components/sessions/HomeReadingRegister.js
git commit -m "feat: add tour integration to HomeReadingRegister page"
```

---

### Task 15: Add data-tour Attributes to ReadingStats

**Files:**
- Modify: `src/components/stats/ReadingStats.js`

- [ ] **Step 1: Add data-tour attributes**

1. On the Tabs component:
   Add `data-tour="stats-tabs"` to the Tabs element or its wrapper.

2. On the Grid container holding the 4 summary cards (inside Overview tab):
   Add `data-tour="stats-summary-cards"` to the Grid.

3. On the This Week's Activity Card:
   Add `data-tour="stats-weekly-activity"` to the Card element.

- [ ] **Step 2: Add useTour hook and TourButton with tab-switch logic**

```js
import { useTour } from '../tour/useTour';
import TourButton from '../tour/TourButton';
```

The stats tour needs the Overview tab active for steps 2-3. Auto-start on first visit is safe (defaults to Overview tab). For replay via the button, switch tabs first:

```js
const { tourButtonProps } = useTour('stats');

// Override onClick to switch to Overview tab before starting tour.
// Auto-start (first visit) is safe because ReadingStats defaults to tab 0 on mount.
const statsTourButtonProps = {
  ...tourButtonProps,
  onClick: () => {
    setCurrentTab(0); // Switch to Overview tab
    setTimeout(() => tourButtonProps.onClick(), 100); // Start after tab renders
  },
};
```

Render `<TourButton {...statsTourButtonProps} />` in the return.

- [ ] **Step 3: Test manually**

Navigate to Reading Stats. Verify the tour shows tabs first, then scrolls to summary cards, then weekly activity. Test replay from a non-Overview tab to verify it switches.

- [ ] **Step 4: Commit**

```bash
git add src/components/stats/ReadingStats.js
git commit -m "feat: add tour integration to ReadingStats page"
```

---

### Task 16: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Manual end-to-end test**

Run: `npm run start:dev`

Test the full flow:
1. Open app → Students page tour auto-starts
2. Complete the tour → compass button stops pulsing
3. Navigate to Session Form → tour auto-starts
4. Navigate to Home Reading → tour auto-starts
5. Navigate to Stats → tour auto-starts
6. Go back to Students → tour does NOT auto-start (already completed)
7. Tap compass button on Students → tour replays
8. Refresh the page → tours don't replay (server-side tracking)

- [ ] **Step 4: Commit any fixes from testing**

Review `git status` and stage only the files you changed:

```bash
git status
git add <specific files changed during testing>
git commit -m "fix: tour integration adjustments from manual testing"
```

Skip this step if no fixes were needed.

- [ ] **Step 5: Update CLAUDE.md file map**

Add the new files to the file map in `CLAUDE.md`:

```
src/routes/tours.js - GET/POST tour completion tracking per user
src/components/tour/TourProvider.js - Tour context provider with lazy-loaded react-joyride
src/components/tour/TourButton.js - Floating compass replay button
src/components/tour/TourTooltip.js - Glassmorphism custom tooltip for tour steps
src/components/tour/tourSteps.js - Tour step definitions per page (targets, titles, content)
src/components/tour/useTour.js - Hook for auto-start, ready guard, and button props
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add tour components to CLAUDE.md file map"
```
