# School Management Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic SchoolManagement component (form+table) with a scalable table+drawer layout supporting server-side pagination, search, filtering, and sorting for thousands of schools.

**Architecture:** Backend-first approach. Extend `GET /api/organization/all` with pagination/filter/sort/search query params, add student/class count subqueries, and add a `hasErrors` computed flag. Then replace the frontend component with a split architecture: container (state + API), table (toolbar + data grid + pagination), drawer (read view + edit form). The old `SchoolManagement.js` is replaced entirely.

**Tech Stack:** React 19, MUI v7 (Table, Drawer, Chip, Skeleton, TextField, Select), Hono (backend), D1 SQL (pagination, LIKE search, subqueries)

**Spec:** `docs/superpowers/specs/2026-03-25-school-management-redesign.md`

---

## Chunk 1: Backend — Paginated Organization Endpoint

### Task 1: Write tests for paginated GET /api/organization/all

**Files:**
- Modify: `src/__tests__/integration/organization.test.js`

- [ ] **Step 1: Add pagination test cases**

Add a new `describe` block after the existing `GET /api/organization/all` tests. These tests verify the new query parameters. Use the existing `createTestApp` and `createMockDB` helpers.

Note: The owner path issues two `db.prepare()` calls (count query via `.first()`, then data query via `.all()`). The mock must return a fresh chainable per call but track which call is which. Use `mockImplementation` with a call counter.

```js
// Helper to create a mock DB that handles count + data queries for the owner path
const createPaginatedMockDB = ({ count = 0, rows = [] } = {}) => {
  let callIndex = 0;
  const mockDb = createMockDB();
  mockDb.prepare = vi.fn().mockImplementation(() => {
    const idx = callIndex++;
    return {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(idx === 0 ? { count } : null),
      all: vi.fn().mockResolvedValue({ results: idx === 1 ? rows : [], success: true }),
      run: vi.fn().mockResolvedValue({ success: true }),
    };
  });
  return mockDb;
};

describe('GET /api/organization/all (pagination & filters)', () => {
  it('should return pagination metadata with defaults', async () => {
    const mockDb = createPaginatedMockDB({
      count: 1,
      rows: [createMockOrganization()],
    });

    const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));
    const res = await app.request('/api/organization/all');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.organizations).toBeDefined();
    expect(data.pagination).toBeDefined();
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.pageSize).toBe(50);
    expect(data.pagination.total).toBe(1);
  });

  it('should respect page and pageSize params', async () => {
    const mockDb = createPaginatedMockDB({ count: 120, rows: [] });

    const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));
    const res = await app.request('/api/organization/all?page=3&pageSize=25');
    const data = await res.json();

    expect(data.pagination.page).toBe(3);
    expect(data.pagination.pageSize).toBe(25);
    expect(data.pagination.total).toBe(120);
    expect(data.pagination.totalPages).toBe(5);
  });

  it('should clamp pageSize to max 100', async () => {
    const mockDb = createPaginatedMockDB({ count: 0, rows: [] });

    const app = createTestApp(mockDb, createUserContext({ userRole: 'owner' }));
    const res = await app.request('/api/organization/all?pageSize=500');
    const data = await res.json();

    expect(data.pagination.pageSize).toBe(100);
  });

  it('should still work for admin role (single org, no pagination needed)', async () => {
    // Admin path uses a single prepare().bind().all() call, not count+data
    const mockDb = createMockDB({
      allResults: { results: [createMockOrganization()], success: true },
    });

    const app = createTestApp(mockDb, createUserContext({ userRole: 'admin' }));
    const res = await app.request('/api/organization/all');
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.organizations).toBeDefined();
    expect(data.pagination).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/integration/organization.test.js --testNamePattern="pagination"`
Expected: FAIL — current endpoint returns `{ organizations }` without `pagination` field

### Task 2: Implement paginated GET /api/organization/all

**Files:**
- Modify: `src/routes/organization.js` (the `GET /all` handler, lines 52–91)
- Modify: `src/utils/rowMappers.js` (add `studentCount` / `classCount` to `rowToOrganization`)

- [ ] **Step 3: Update rowToOrganization to map new count fields**

In `src/utils/rowMappers.js`, add two optional fields at the end of `rowToOrganization`:

```js
    billingEmail: row.billing_email || null,
    // Counts (only present when joined via subquery)
    studentCount: row.student_count ?? null,
    classCount: row.class_count ?? null,
    // Sync error (only present when joined via subquery)
    lastSyncError: row.last_sync_error || null,
  };
```

- [ ] **Step 4: Rewrite the GET /all handler with pagination, search, filters, sorting**

Replace the `GET /all` handler in `src/routes/organization.js` (lines 52–91) with the new implementation. The admin path stays simple (single org, wrapped in pagination format). The owner path builds a dynamic SQL query.

```js
organizationRouter.get('/all', requireAdmin(), async (c) => {
  try {
    const db = getDB(c.env);
    const userRole = c.get('userRole');
    const organizationId = c.get('organizationId');

    // Admin: return just their own org, wrapped in pagination format
    if (userRole !== 'owner') {
      const result = await db
        .prepare('SELECT * FROM organizations WHERE id = ? AND is_active = 1')
        .bind(organizationId)
        .all();
      const organizations = (result.results || []).map(rowToOrganization);
      return c.json({
        organizations,
        pagination: { page: 1, pageSize: 50, total: organizations.length, totalPages: 1 },
      });
    }

    // Owner: full pagination, search, filters, sorting
    const page = Math.max(parseInt(c.req.query('page')) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(c.req.query('pageSize')) || 50, 1), 100);
    const search = c.req.query('search') || '';
    const source = c.req.query('source') || '';
    const billing = c.req.query('billing') || '';
    const syncStatus = c.req.query('syncStatus') || '';
    const hasErrors = c.req.query('hasErrors') === 'true';

    const sortField = c.req.query('sort') || 'name';
    const sortOrder = c.req.query('order') === 'desc' ? 'DESC' : 'ASC';

    const sortMap = {
      name: 'o.name',
      billing: 'o.subscription_status',
      lastSync: 'o.wonde_last_sync_at',
      town: 'o.town',
    };
    const orderByCol = sortMap[sortField] || 'o.name';

    // Build WHERE clauses
    const conditions = ['o.is_active = 1'];
    const params = [];

    if (search) {
      conditions.push('(o.name LIKE ? OR o.town LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (source === 'wonde') {
      conditions.push('o.wonde_school_id IS NOT NULL');
    } else if (source === 'manual') {
      conditions.push('o.wonde_school_id IS NULL');
    }

    if (billing === 'none') {
      conditions.push("(o.subscription_status IS NULL OR o.subscription_status = 'none')");
    } else if (['active', 'trialing', 'past_due', 'cancelled'].includes(billing)) {
      conditions.push('o.subscription_status = ?');
      params.push(billing);
    }

    if (syncStatus === 'recent') {
      conditions.push("o.wonde_school_id IS NOT NULL AND o.wonde_last_sync_at > datetime('now', '-7 days')");
    } else if (syncStatus === 'stale') {
      conditions.push("o.wonde_school_id IS NOT NULL AND o.wonde_last_sync_at <= datetime('now', '-7 days')");
    } else if (syncStatus === 'never') {
      conditions.push('o.wonde_school_id IS NOT NULL AND o.wonde_last_sync_at IS NULL');
    }

    if (hasErrors) {
      conditions.push(`(
        o.subscription_status = 'past_due'
        OR (o.wonde_school_id IS NOT NULL AND o.wonde_last_sync_at <= datetime('now', '-7 days'))
        OR (o.wonde_school_id IS NOT NULL AND o.wonde_school_token IS NULL)
        OR EXISTS (
          SELECT 1 FROM wonde_sync_log wsl
          WHERE wsl.organization_id = o.id AND wsl.status = 'error'
          AND wsl.started_at = (
            SELECT MAX(wsl2.started_at) FROM wonde_sync_log wsl2
            WHERE wsl2.organization_id = o.id
          )
        )
      )`);
    }

    const whereClause = conditions.join(' AND ');

    // Count query
    const countResult = await db
      .prepare(`SELECT COUNT(*) as count FROM organizations o WHERE ${whereClause}`)
      .bind(...params)
      .first();
    const total = countResult?.count || 0;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    // Data query with subqueries for counts and last sync error
    const dataQuery = `
      SELECT o.*,
        (SELECT COUNT(*) FROM students s WHERE s.organization_id = o.id AND s.is_active = 1) as student_count,
        (SELECT COUNT(*) FROM classes c WHERE c.organization_id = o.id AND c.is_active = 1) as class_count,
        (SELECT wsl.error_message FROM wonde_sync_log wsl
         WHERE wsl.organization_id = o.id
         ORDER BY wsl.started_at DESC LIMIT 1) as last_sync_error
      FROM organizations o
      WHERE ${whereClause}
      ORDER BY ${orderByCol} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const result = await db
      .prepare(dataQuery)
      .bind(...params, pageSize, offset)
      .all();

    const organizations = (result.results || []).map(rowToOrganization);

    return c.json({
      organizations,
      pagination: { page, pageSize, total, totalPages },
    });
  } catch (error) {
    if (error.status) throw error;
    console.error('List organizations error:', error);
    return c.json({ error: 'Failed to list organizations' }, 500);
  }
});
```

- [ ] **Step 5: Run the pagination tests**

Run: `npx vitest run src/__tests__/integration/organization.test.js --testNamePattern="pagination"`
Expected: PASS

- [ ] **Step 6: Run the full organization test suite to check for regressions**

Run: `npx vitest run src/__tests__/integration/organization.test.js`
Expected: All tests PASS. The existing `GET /api/organization/all` tests may need updating to expect the new `pagination` field in the response.

- [ ] **Step 7: Fix any failing existing tests**

The existing tests for `GET /api/organization/all` expect `{ organizations: [...] }` without `pagination`. The admin path now wraps results in pagination format too. Find all existing tests that call `/api/organization/all` and update their assertions:

- Add `expect(data.pagination).toBeDefined()` where the response structure is checked
- Tests that check `data.organizations` should still pass since the field name hasn't changed
- The owner tests use mock DB that returns via `.all()` — ensure the mock returns the expected structure for the new code path (owner path now calls `.first()` for count then `.all()` for data; admin path calls `.prepare().bind().all()` once)

- [ ] **Step 8: Commit**

```bash
git add src/routes/organization.js src/utils/rowMappers.js src/__tests__/integration/organization.test.js
git commit -m "feat: add pagination, search, filters, sorting to GET /api/organization/all"
```

---

## Chunk 2: Frontend — SchoolTable Component

### Task 3: Create SchoolTable component

**Files:**
- Create: `src/components/schools/SchoolTable.js`

- [ ] **Step 9: Create the schools directory**

Run: `mkdir -p src/components/schools`

- [ ] **Step 10: Write SchoolTable.js**

This component renders the full-width table with toolbar (search, filters, Add button), sortable column headers, data rows with chips and error indicators, and pagination controls. It receives all data and callbacks as props — no API calls.

Props:
- `schools` — array of org objects
- `pagination` — `{ page, pageSize, total, totalPages }`
- `filters` — `{ search, source, billing, syncStatus, hasErrors }`
- `sort` — `{ field, order }`
- `loading` — boolean
- `onFilterChange(newFilters)` — called when any filter or search changes
- `onSortChange(newSort)` — called when a column header is clicked
- `onPageChange(newPage)` — called when pagination changes
- `onRowClick(school)` — called when a row is clicked
- `onAddClick()` — called when Add School button is clicked

Key implementation details:
- Search input uses `onChange` with the raw value; debouncing is handled by the parent
- Filter dropdowns are MUI `Select` with `FormControl`
- Column headers show sort direction arrow when active
- Rows render: school name (with ⚠ if `lastSyncError` and `wondeSchoolId`), Source chip (Wonde green / Manual grey), Billing chip (color-coded), Last Sync (relative timestamp with ⚠ if stale), Town
- Error rows get `sx={{ bgcolor: '#fff8f6' }}`
- Skeleton rows shown when `loading` is true (5 rows of `<Skeleton variant="text" />` in each cell)
- Pagination: "Showing X–Y of Z schools" text + prev/next buttons using MUI `TablePagination`
- Empty state: "No schools found" message

Relative timestamp helper (inline in the file):
```js
const formatRelativeTime = (isoDate) => {
  if (!isoDate) return '—';
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
};

const isSyncStale = (school) =>
  school.wondeSchoolId && school.wondeLastSyncAt &&
  Date.now() - new Date(school.wondeLastSyncAt).getTime() > 7 * 24 * 60 * 60 * 1000;

const hasSchoolErrors = (school) =>
  school.subscriptionStatus === 'past_due' ||
  isSyncStale(school) ||
  (school.wondeSchoolId && !school.hasWondeToken) ||
  (school.wondeSchoolId && school.lastSyncError);
```

- [ ] **Step 11: Commit**

```bash
git add src/components/schools/SchoolTable.js
git commit -m "feat: add SchoolTable component with search, filters, sorting, pagination"
```

---

## Chunk 3: Frontend — Drawer Components

### Task 4: Create SchoolReadView component

**Files:**
- Create: `src/components/schools/SchoolReadView.js`

- [ ] **Step 12: Write SchoolReadView.js**

Read-only detail cards for a selected school. Receives:
- `school` — the organization object
- `onEdit()` — switches to edit mode
- `onSync()` — triggers Wonde sync
- `onStartTrial()` — starts billing trial
- `onOpenPortal()` — opens Stripe billing portal
- `onDeactivate()` — opens deactivate confirmation

Layout (all using `Box` and `Typography`, not `Paper` — the drawer provides the container):
- **Header**: school name (h5), chips row (Source + Billing status), close handled by parent
- **Actions row**: Edit button, Sync Now button (only if `wondeSchoolId`)
- **Contact card** (`Box` with `bgcolor: '#fafaf7'`, `borderRadius: 2`, `p: 2`, `mb: 2`): label:value grid for contactEmail, billingEmail, phone. Show "—" for empty values.
- **Address card**: formatted block — addressLine1, addressLine2, town, postcode. Omit empty lines.
- **Billing card**: subscriptionStatus (with colour), subscriptionPlan, aiAddonActive ("Enabled"/"Not enabled"), trialEndsAt if trialing, "Open Billing Portal" button or "Start Trial" button (if no subscription).
- **Wonde card** (only if `wondeSchoolId`): wondeSchoolId (monospace), token status ("✓ Set" green / "⚠ Not set" orange), wondeLastSyncAt (formatted), studentCount, classCount. If `lastSyncError`, show an `Alert severity="error"` with the error message.
- **Deactivate section**: divider, then outline red button "Deactivate School"

- [ ] **Step 13: Commit**

```bash
git add src/components/schools/SchoolReadView.js
git commit -m "feat: add SchoolReadView component for drawer read mode"
```

### Task 5: Create SchoolEditForm component

**Files:**
- Create: `src/components/schools/SchoolEditForm.js`

- [ ] **Step 14: Write SchoolEditForm.js**

Edit form for school details. Receives:
- `school` — the school being edited (null for add mode)
- `onSave(formData)` — called with form values
- `onCancel()` — returns to read mode or closes drawer
- `loading` — boolean, disables form during save

Local state: `formData` initialised from `school` prop (or empty for add mode).

Form fields: name (required), contactEmail, billingEmail, phone, addressLine1, addressLine2, town + postcode (side by side), wondeSchoolToken (only if `school?.wondeSchoolId`).

Sticky save/cancel bar at bottom using `Box` with `position: 'sticky'`, `bottom: 0`, `bgcolor: 'background.paper'`, `borderTop`.

- [ ] **Step 15: Commit**

```bash
git add src/components/schools/SchoolEditForm.js
git commit -m "feat: add SchoolEditForm component for drawer edit mode"
```

### Task 6: Create SchoolDrawer component

**Files:**
- Create: `src/components/schools/SchoolDrawer.js`

- [ ] **Step 16: Write SchoolDrawer.js**

MUI `Drawer` wrapper. Receives:
- `open` — boolean
- `school` — selected school (null for add)
- `mode` — `'read'` | `'edit'` | `'add'`
- `loading` — boolean
- `onClose()` — closes drawer
- `onEdit()` — switches to edit mode
- `onSave(formData)` — saves form
- `onCancel()` — cancels edit (returns to read or closes)
- `onSync()` — Wonde sync
- `onStartTrial()` — start trial
- `onOpenPortal()` — billing portal
- `onDeactivate()` — deactivate school

Implementation:
- MUI `Drawer` with `anchor="right"`, `variant="temporary"` (overlay on all sizes for simplicity — can refine responsive behaviour later)
- `PaperProps: { sx: { width: { xs: '100%', sm: 420 } } }`
- Header with school name and close IconButton (X icon)
- Renders `SchoolReadView` when mode is `'read'`, `SchoolEditForm` when mode is `'edit'` or `'add'`
- Contains the deactivate `Dialog` (confirmation with Wonde warning)
- Scrollable content area with padding

- [ ] **Step 17: Commit**

```bash
git add src/components/schools/SchoolDrawer.js
git commit -m "feat: add SchoolDrawer component wrapping read/edit views"
```

---

## Chunk 4: Frontend — Container + Integration

### Task 7: Rewrite SchoolManagement.js as container

**Files:**
- Modify: `src/components/SchoolManagement.js` (full rewrite)
- Modify: `src/components/SettingsPage.js` (update import path)

- [ ] **Step 18: Rewrite SchoolManagement.js**

Replace the entire file. The new component is a state container that:
- Manages all state: `schools`, `pagination`, `filters`, `sort`, `selectedSchool`, `drawerMode`, `formData`, `loading`, `error`, `success`
- Fetches data via `fetchWithAuth('/api/organization/all?...')` with query params built from state
- Debounces search input (300ms) using a `useRef` timer
- Handles all API actions: create, update, delete, sync, start trial, billing portal
- Passes props down to `SchoolTable` and `SchoolDrawer`

Key behaviour:
- `fetchSchools()` builds query string from current `filters`, `sort`, `pagination.page`, `pagination.pageSize`, calls API, sets state
- `useEffect` calls `fetchSchools()` when `filters`, `sort`, or `pagination.page` change (but search is debounced — the raw `searchInput` state updates immediately, a `useEffect` with a 300ms timer updates `filters.search`)
- Filter/search changes reset page to 1 and close the drawer
- Page changes keep drawer open
- After successful actions (create/update/delete/sync/trial), call `fetchSchools()` to refresh
- Success messages auto-dismiss after 5 seconds via `setTimeout` in a `useEffect`
- Error/success alerts rendered above the table

Imports:
```js
import SchoolTable from './schools/SchoolTable';
import SchoolDrawer from './schools/SchoolDrawer';
```

- [ ] **Step 19: Update SettingsPage.js import**

The import path stays the same since `SchoolManagement.js` hasn't moved — but verify the import is still `import SchoolManagement from './SchoolManagement'`. No change needed unless we move the file.

- [ ] **Step 20: Commit**

```bash
git add src/components/SchoolManagement.js
git commit -m "feat: rewrite SchoolManagement as table+drawer container"
```

### Task 8: Manual smoke test

- [ ] **Step 21: Start dev server and test**

Run: `npm run start:dev`

Verify in browser (as owner user):
1. Settings → School Management tab loads, shows table with schools
2. Search filters the table (debounced)
3. Filter dropdowns work (source, billing, sync status, errors)
4. Column headers sort on click
5. Pagination works (if enough schools)
6. Clicking a row opens the drawer in read mode with all cards
7. Clicking Edit in drawer switches to edit mode with form
8. Save updates the school and returns to read mode
9. Cancel returns to read mode without saving
10. Add School button opens drawer in edit mode
11. Create School saves and shows in table
12. Sync Now triggers Wonde sync
13. Start Trial / Open Billing Portal work
14. Deactivate School shows confirmation and works

- [ ] **Step 22: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 23: Run build**

Run: `npm run build`
Expected: Clean build, no warnings

- [ ] **Step 24: Commit any fixes from smoke testing**

```bash
git add -A
git commit -m "fix: smoke test fixes for school management redesign"
```

### Task 9: Update CLAUDE.md file map

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 25: Update the file map in CLAUDE.md**

In the `### File Map` section, replace the `SchoolManagement.js` entry and add the new files:

```
src/components/SchoolManagement.js - School management container (state, API calls, table+drawer orchestration)

src/components/schools/SchoolTable.js - School data table with search, filters, sorting, pagination
src/components/schools/SchoolDrawer.js - Side drawer wrapper (read/edit/add modes, deactivate dialog)
src/components/schools/SchoolReadView.js - Read-only school detail cards (contact, address, billing, wonde)
src/components/schools/SchoolEditForm.js - School edit form with save/cancel
```

- [ ] **Step 26: Update the structure detail YAML if it exists**

Check if `.claude/structure/components.yaml` exists and update accordingly.

- [ ] **Step 27: Final commit**

```bash
git add CLAUDE.md .claude/structure/components.yaml
git commit -m "docs: update file map for school management redesign"
```
