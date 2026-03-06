# Term Dates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow schools to define six half-term periods per academic year and filter stats by half-term.

**Architecture:** New `term_dates` table with per-org, per-year rows. New `termDatesRouter` for GET/PUT. Term dates UI added to Settings.js. Stats page gets a half-term dropdown that filters all session data.

**Tech Stack:** D1 SQL, Hono routes, React (MUI components), Vitest

**Design doc:** `docs/plans/2026-03-06-term-dates-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `migrations/0033_term_dates.sql`

**Step 1: Create migration file**

```sql
-- Migration 0033: Term Dates
-- Per-organization half-term date ranges for academic year reporting

CREATE TABLE IF NOT EXISTS term_dates (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    term_name TEXT NOT NULL,
    term_order INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    updated_by TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE(organization_id, academic_year, term_order)
);

CREATE INDEX IF NOT EXISTS idx_term_dates_org_year ON term_dates(organization_id, academic_year);
```

**Step 2: Apply locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration applied successfully

**Step 3: Commit**

```
git add migrations/0033_term_dates.sql
git commit -m "feat: add term_dates migration (0033)"
```

---

### Task 2: Term Dates API Route — Tests

**Files:**
- Create: `src/__tests__/integration/termDates.test.js`

**Step 1: Write integration tests**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock tenant middleware helpers
vi.mock('../../middleware/tenant', () => ({
  requireAdmin: () => (c, next) => next(),
  requireReadonly: () => (c, next) => next(),
  auditLog: () => (c, next) => next(),
}));

vi.mock('../../utils/routeHelpers', () => ({
  getDB: (env) => env.READING_MANAGER_DB,
  isMultiTenantMode: () => true,
}));

const { termDatesRouter } = await import('../../routes/termDates');
const { Hono } = await import('hono');

function createApp(dbMock, orgId = 'org-1') {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.env = { READING_MANAGER_DB: dbMock, JWT_SECRET: 'test' };
    c.set('organizationId', orgId);
    c.set('userId', 'user-1');
    c.set('userRole', 'admin');
    await next();
  });
  app.route('/api/term-dates', termDatesRouter);
  return app;
}

function mockDb(results = []) {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue({ results }),
    run: vi.fn().mockResolvedValue({}),
  };
  return {
    prepare: vi.fn().mockReturnValue(stmt),
    batch: vi.fn().mockResolvedValue([]),
    _stmt: stmt,
  };
}

describe('Term Dates API', () => {
  describe('GET /api/term-dates', () => {
    it('should return empty array when no term dates exist', async () => {
      const db = mockDb([]);
      const app = createApp(db);
      const res = await app.request('/api/term-dates?year=2025/26');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ academicYear: '2025/26', terms: [] });
    });

    it('should return term dates for the given year', async () => {
      const db = mockDb([
        { term_name: 'Autumn 1', term_order: 1, start_date: '2025-09-03', end_date: '2025-10-24' },
        { term_name: 'Autumn 2', term_order: 2, start_date: '2025-11-03', end_date: '2025-12-19' },
      ]);
      const app = createApp(db);
      const res = await app.request('/api/term-dates?year=2025/26');
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.terms).toHaveLength(2);
      expect(data.terms[0].termName).toBe('Autumn 1');
      expect(data.terms[0].startDate).toBe('2025-09-03');
    });

    it('should default to current academic year when no year param given', async () => {
      const db = mockDb([]);
      const app = createApp(db);
      const res = await app.request('/api/term-dates');
      expect(res.status).toBe(200);
      const data = await res.json();
      // academicYear should be a string like '2025/26'
      expect(data.academicYear).toMatch(/^\d{4}\/\d{2}$/);
    });
  });

  describe('PUT /api/term-dates', () => {
    it('should save all 6 term dates', async () => {
      const db = mockDb();
      const app = createApp(db);
      const terms = [
        { termName: 'Autumn 1', termOrder: 1, startDate: '2025-09-03', endDate: '2025-10-24' },
        { termName: 'Autumn 2', termOrder: 2, startDate: '2025-11-03', endDate: '2025-12-19' },
        { termName: 'Spring 1', termOrder: 3, startDate: '2026-01-05', endDate: '2026-02-13' },
        { termName: 'Spring 2', termOrder: 4, startDate: '2026-02-23', endDate: '2026-03-27' },
        { termName: 'Summer 1', termOrder: 5, startDate: '2026-04-13', endDate: '2026-05-22' },
        { termName: 'Summer 2', termOrder: 6, startDate: '2026-06-01', endDate: '2026-07-17' },
      ];
      const res = await app.request('/api/term-dates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academicYear: '2025/26', terms }),
      });
      expect(res.status).toBe(200);
      // Should call db.batch with DELETE + 6 INSERTs
      expect(db.batch).toHaveBeenCalled();
      const batchArgs = db.batch.mock.calls[0][0];
      expect(batchArgs).toHaveLength(7); // 1 DELETE + 6 INSERTs
    });

    it('should reject if academicYear is missing', async () => {
      const db = mockDb();
      const app = createApp(db);
      const res = await app.request('/api/term-dates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms: [] }),
      });
      expect(res.status).toBe(400);
    });

    it('should reject if terms have overlapping dates', async () => {
      const db = mockDb();
      const app = createApp(db);
      const terms = [
        { termName: 'Autumn 1', termOrder: 1, startDate: '2025-09-03', endDate: '2025-11-10' },
        { termName: 'Autumn 2', termOrder: 2, startDate: '2025-11-03', endDate: '2025-12-19' },
      ];
      const res = await app.request('/api/term-dates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academicYear: '2025/26', terms }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/overlap/i);
    });

    it('should reject if startDate is after endDate', async () => {
      const db = mockDb();
      const app = createApp(db);
      const terms = [
        { termName: 'Autumn 1', termOrder: 1, startDate: '2025-10-24', endDate: '2025-09-03' },
      ];
      const res = await app.request('/api/term-dates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academicYear: '2025/26', terms }),
      });
      expect(res.status).toBe(400);
    });

    it('should accept partial terms (not all 6 required)', async () => {
      const db = mockDb();
      const app = createApp(db);
      const terms = [
        { termName: 'Autumn 1', termOrder: 1, startDate: '2025-09-03', endDate: '2025-10-24' },
      ];
      const res = await app.request('/api/term-dates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ academicYear: '2025/26', terms }),
      });
      expect(res.status).toBe(200);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/integration/termDates.test.js`
Expected: FAIL — `../../routes/termDates` does not exist

**Step 3: Commit**

```
git add src/__tests__/integration/termDates.test.js
git commit -m "test: add term dates API integration tests"
```

---

### Task 3: Term Dates API Route — Implementation

**Files:**
- Create: `src/routes/termDates.js`
- Modify: `src/worker.js:225` (add route registration)

**Step 1: Create the route handler**

```js
import { Hono } from 'hono';
import { requireAdmin, requireReadonly } from '../middleware/tenant';
import { getDB } from '../utils/routeHelpers';
import { badRequestError } from '../middleware/errorHandler';

const termDatesRouter = new Hono();

const TERM_NAMES = ['Autumn 1', 'Autumn 2', 'Spring 1', 'Spring 2', 'Summer 1', 'Summer 2'];

function getCurrentAcademicYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // Academic year starts in August (month 7)
  if (month >= 7) {
    return `${year}/${String(year + 1).slice(2)}`;
  }
  return `${year - 1}/${String(year).slice(2)}`;
}

/**
 * GET /api/term-dates?year=2025/26
 * Returns term dates for the organization's academic year
 */
termDatesRouter.get('/', requireReadonly(), async (c) => {
  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const academicYear = c.req.query('year') || getCurrentAcademicYear();

  const result = await db.prepare(
    `SELECT term_name, term_order, start_date, end_date
     FROM term_dates
     WHERE organization_id = ? AND academic_year = ?
     ORDER BY term_order`
  ).bind(organizationId, academicYear).all();

  const terms = (result.results || []).map(row => ({
    termName: row.term_name,
    termOrder: row.term_order,
    startDate: row.start_date,
    endDate: row.end_date,
  }));

  return c.json({ academicYear, terms });
});

/**
 * PUT /api/term-dates
 * Upsert term dates for an academic year (batch replace)
 */
termDatesRouter.put('/', requireAdmin(), async (c) => {
  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  const userId = c.get('userId');
  const body = await c.req.json();

  const { academicYear, terms } = body;

  if (!academicYear || typeof academicYear !== 'string' || !/^\d{4}\/\d{2}$/.test(academicYear)) {
    throw badRequestError('academicYear is required and must be in format YYYY/YY (e.g. 2025/26)');
  }

  if (!Array.isArray(terms)) {
    throw badRequestError('terms must be an array');
  }

  // Validate each term
  for (const term of terms) {
    if (!term.termName || !term.startDate || !term.endDate || term.termOrder == null) {
      throw badRequestError('Each term requires termName, termOrder, startDate, and endDate');
    }
    if (term.termOrder < 1 || term.termOrder > 6) {
      throw badRequestError('termOrder must be between 1 and 6');
    }
    if (!TERM_NAMES.includes(term.termName)) {
      throw badRequestError(`termName must be one of: ${TERM_NAMES.join(', ')}`);
    }
    if (term.startDate >= term.endDate) {
      throw badRequestError(`Start date must be before end date for ${term.termName}`);
    }
  }

  // Check for overlapping dates (sort by start date, then check adjacent pairs)
  const sorted = [...terms].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startDate <= sorted[i - 1].endDate) {
      throw badRequestError(`Term dates overlap: ${sorted[i - 1].termName} and ${sorted[i].termName}`);
    }
  }

  // Batch: DELETE existing + INSERT new
  const deleteStmt = db.prepare(
    `DELETE FROM term_dates WHERE organization_id = ? AND academic_year = ?`
  ).bind(organizationId, academicYear);

  const insertStmts = terms.map(term =>
    db.prepare(
      `INSERT INTO term_dates (id, organization_id, academic_year, term_name, term_order, start_date, end_date, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      organizationId,
      academicYear,
      term.termName,
      term.termOrder,
      term.startDate,
      term.endDate,
      userId
    )
  );

  await db.batch([deleteStmt, ...insertStmts]);

  return c.json({ academicYear, terms: terms.map(t => ({
    termName: t.termName,
    termOrder: t.termOrder,
    startDate: t.startDate,
    endDate: t.endDate,
  }))});
});

export { termDatesRouter };
```

**Step 2: Register route in worker.js**

Add after line 225 (`app.route('/api/support', supportRouter);`):

```js
import { termDatesRouter } from './routes/termDates.js';
```
(at the top, with other imports)

```js
app.route('/api/term-dates', termDatesRouter);
```
(after the support route registration)

**Step 3: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/integration/termDates.test.js`
Expected: All 7 tests PASS

**Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass (no regressions)

**Step 5: Commit**

```
git add src/routes/termDates.js src/worker.js
git commit -m "feat: add term dates API (GET/PUT /api/term-dates)"
```

---

### Task 4: Term Dates Section in Settings UI

**Files:**
- Modify: `src/components/Settings.js`

**Step 1: Add term dates management section**

Insert a new section after the Streak Settings `<Divider>` (line 276) and before the Save/Reset buttons (line 278). The term dates section has its own save button since it uses a different API endpoint.

Add these imports at the top of Settings.js:
```js
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
```

Add to the existing `useAppContext` destructuring:
```js
const { readingStatusSettings, settings, updateSettings, fetchWithAuth, canManageSettings } = useAppContext();
```

Add these state variables after the existing state declarations:
```js
const TERM_NAMES = ['Autumn 1', 'Autumn 2', 'Spring 1', 'Spring 2', 'Summer 1', 'Summer 2'];

const getCurrentAcademicYear = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 7) return `${year}/${String(year + 1).slice(2)}`;
  return `${year - 1}/${String(year).slice(2)}`;
};

const getAcademicYearOptions = () => {
  const current = getCurrentAcademicYear();
  const startYear = parseInt(current.split('/')[0]);
  return [
    `${startYear - 1}/${String(startYear).slice(2)}`,
    current,
    `${startYear + 1}/${String(startYear + 2).slice(2)}`,
  ];
};

const [selectedYear, setSelectedYear] = useState(getCurrentAcademicYear());
const [termDates, setTermDates] = useState(
  TERM_NAMES.map((name, i) => ({ termName: name, termOrder: i + 1, startDate: '', endDate: '' }))
);
const [termDatesLoading, setTermDatesLoading] = useState(false);
const [termDatesSaving, setTermDatesSaving] = useState(false);
```

Add a `useEffect` to fetch term dates when the selected year changes (add `useEffect` to the React import):
```js
useEffect(() => {
  const fetchTermDates = async () => {
    setTermDatesLoading(true);
    try {
      const res = await fetchWithAuth(`/api/term-dates?year=${encodeURIComponent(selectedYear)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.terms && data.terms.length > 0) {
          // Merge fetched terms with defaults (fill in any missing)
          const merged = TERM_NAMES.map((name, i) => {
            const found = data.terms.find(t => t.termOrder === i + 1);
            return found || { termName: name, termOrder: i + 1, startDate: '', endDate: '' };
          });
          setTermDates(merged);
        } else {
          setTermDates(TERM_NAMES.map((name, i) => ({ termName: name, termOrder: i + 1, startDate: '', endDate: '' })));
        }
      }
    } catch {
      // silently fail — empty dates shown
    } finally {
      setTermDatesLoading(false);
    }
  };
  fetchTermDates();
}, [selectedYear, fetchWithAuth]);
```

Add a handler for saving term dates:
```js
const handleSaveTermDates = async () => {
  // Only save terms that have both dates filled in
  const filledTerms = termDates.filter(t => t.startDate && t.endDate);

  // Validate: startDate < endDate
  for (const t of filledTerms) {
    if (t.startDate >= t.endDate) {
      setSnackbar({ open: true, message: `Start date must be before end date for ${t.termName}`, severity: 'error' });
      return;
    }
  }

  // Validate: no overlaps
  const sorted = [...filledTerms].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startDate <= sorted[i - 1].endDate) {
      setSnackbar({ open: true, message: `Term dates overlap: ${sorted[i - 1].termName} and ${sorted[i].termName}`, severity: 'error' });
      return;
    }
  }

  setTermDatesSaving(true);
  try {
    const res = await fetchWithAuth('/api/term-dates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ academicYear: selectedYear, terms: filledTerms }),
    });
    if (res.ok) {
      setSnackbar({ open: true, message: 'Term dates saved', severity: 'success' });
    } else {
      const data = await res.json();
      setSnackbar({ open: true, message: data.error || 'Failed to save term dates', severity: 'error' });
    }
  } catch (error) {
    setSnackbar({ open: true, message: `Error: ${error.message}`, severity: 'error' });
  } finally {
    setTermDatesSaving(false);
  }
};

const handleTermDateChange = (index, field, value) => {
  setTermDates(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
};
```

Add the JSX section (after the streak Divider, before the Save/Reset buttons):

```jsx
{/* Term Dates Section */}
{canManageSettings && (
  <>
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <CalendarMonthIcon sx={{ color: '#0EA5E9' }} />
        <Typography variant="subtitle1">
          Term Dates
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" paragraph>
        Set the half-term dates for your school's academic year. These dates enable half-term filtering on the statistics page.
      </Typography>

      <FormControl sx={{ minWidth: 200, mb: 2 }}>
        <InputLabel id="academic-year-label">Academic Year</InputLabel>
        <Select
          labelId="academic-year-label"
          value={selectedYear}
          label="Academic Year"
          onChange={(e) => setSelectedYear(e.target.value)}
        >
          {getAcademicYearOptions().map(year => (
            <MenuItem key={year} value={year}>{year}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {termDatesLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {termDates.map((term, index) => (
            <Box key={term.termOrder} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 90 }}>
                {term.termName}
              </Typography>
              <TextField
                type="date"
                label="Start"
                value={term.startDate}
                onChange={(e) => handleTermDateChange(index, 'startDate', e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 160 }}
              />
              <TextField
                type="date"
                label="End"
                value={term.endDate}
                onChange={(e) => handleTermDateChange(index, 'endDate', e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 160 }}
              />
            </Box>
          ))}
        </Box>
      )}

      <Button
        variant="outlined"
        startIcon={termDatesSaving ? <CircularProgress size={16} /> : <SaveIcon />}
        onClick={handleSaveTermDates}
        disabled={termDatesSaving || termDatesLoading}
        sx={{ mt: 2 }}
      >
        {termDatesSaving ? 'Saving...' : 'Save Term Dates'}
      </Button>
    </Box>

    <Divider sx={{ my: 3 }} />
  </>
)}
```

Add `CircularProgress` to the MUI imports at the top of the file.

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Commit**

```
git add src/components/Settings.js
git commit -m "feat: add term dates management UI to Settings"
```

---

### Task 5: Stats Page — Half-Term Filter

**Files:**
- Modify: `src/components/stats/ReadingStats.js`

**Step 1: Add term date fetching and dropdown**

Add these imports:
```js
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material';
```

Add state and fetch logic inside the component (after existing state):
```js
const [termDates, setTermDates] = useState([]);
const [selectedTerm, setSelectedTerm] = useState('all');

useEffect(() => {
  const fetchTermDates = async () => {
    try {
      const res = await fetchWithAuth('/api/term-dates');
      if (res.ok) {
        const data = await res.json();
        setTermDates(data.terms || []);
      }
    } catch {
      // silently fail — no filter shown
    }
  };
  fetchTermDates();
}, [fetchWithAuth]);
```

**Step 2: Add date range from selected term**

Add a memo to compute the active date filter:
```js
const termDateRange = useMemo(() => {
  if (selectedTerm === 'all') return null;
  const term = termDates.find(t => t.termOrder === selectedTerm);
  if (!term) return null;
  return { start: term.startDate, end: term.endDate };
}, [selectedTerm, termDates]);
```

**Step 3: Filter sessions in the stats useMemo**

In the `stats` useMemo (line 70), add `termDateRange` to the dependency array. Inside the `activeStudents.forEach` loop, where it processes `student.readingSessions`, add a filter:

Replace (line 145):
```js
(student.readingSessions || []).forEach(session => {
```

With:
```js
const sessions = termDateRange
  ? (student.readingSessions || []).filter(s => s.date >= termDateRange.start && s.date <= termDateRange.end)
  : (student.readingSessions || []);
sessions.forEach(session => {
```

Also update the totalSessions and sessionCount calculation (lines 137-138):
```js
const sessions = termDateRange
  ? (student.readingSessions || []).filter(s => s.date >= termDateRange.start && s.date <= termDateRange.end)
  : (student.readingSessions || []);
const sessionCount = sessions.length;
totalSessions += sessionCount;
```

And update the second `.forEach` to use the already-filtered `sessions` variable (remove the duplicate filter).

Update the `stats` useMemo deps to include `termDateRange`.

**Step 4: Add the dropdown to the header bar**

In the header Box (line 869), add the dropdown between the title and Export button. Replace the existing header Box:

```jsx
<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
  <Typography variant="h4" component="h1" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#4A4A4A' }}>
    Reading Statistics
  </Typography>
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
    {termDates.length > 0 && (
      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel id="term-filter-label">Period</InputLabel>
        <Select
          labelId="term-filter-label"
          value={selectedTerm}
          label="Period"
          onChange={(e) => setSelectedTerm(e.target.value)}
        >
          <MenuItem value="all">All Time</MenuItem>
          {termDates.map(term => (
            <MenuItem key={term.termOrder} value={term.termOrder}>
              {term.termName}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    )}
    <Button
      variant="outlined"
      startIcon={<DownloadIcon />}
      onClick={handleExport}
      sx={{
        borderRadius: 3,
        fontWeight: 600,
        borderWidth: 2,
        '&:hover': { borderWidth: 2 }
      }}
    >
      Export Data
    </Button>
  </Box>
</Box>
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds

**Step 6: Commit**

```
git add src/components/stats/ReadingStats.js
git commit -m "feat: add half-term filter dropdown to stats page"
```

---

### Task 6: Update Structure Index

**Files:**
- Modify: `CLAUDE.md` (file map — add `src/routes/termDates.js` entry)
- Modify: `.claude/structure/routes.yaml` (add termDates route details)

**Step 1: Update CLAUDE.md file map**

Add after the `src/routes/support.js` line:
```
src/routes/termDates.js - GET/PUT term dates per organization and academic year
```

**Step 2: Update routes.yaml**

Add the termDates router entry.

**Step 3: Commit**

```
git add CLAUDE.md .claude/structure/routes.yaml
git commit -m "docs: update structure index for term dates"
```

---

### Task 7: Run Full Test Suite & Build Verification

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass

**Step 2: Build**

Run: `npm run build`
Expected: Build succeeds with no errors

**Step 3: Verify locally (manual)**

Run: `npm run start:dev`
- Navigate to Settings > Application Settings
- Scroll to Term Dates section
- Set dates for 2025/26
- Navigate to Stats page
- Verify half-term dropdown appears
- Select a half-term — stats should filter

---
