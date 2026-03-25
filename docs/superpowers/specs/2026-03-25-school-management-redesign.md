# School Management Redesign

## Context

The SchoolManagement component was originally a simple CRUD form+table for a handful of schools. Since adding Wonde integration, billing status, contact/address fields, sync buttons, and trial actions, the layout is overcrowded. The system also needs to scale to thousands of schools, which the current "load everything" approach can't handle.

## Design

### Layout: Table + Side Drawer

**Table (main view)** — full-width, searchable, paginated data table.

- **Columns**: School name, Source (Wonde/Manual chip), Billing status (chip), Last Sync (relative timestamp), Town
- **Sorting**: clickable column headers, default sort by name ascending
- **Pagination**: server-side, 50 rows per page, prev/next with page numbers
- **Search**: text input searching name and town, debounced (300ms), server-side
- **Filters** (dropdowns):
  - Source: All / Wonde / Manual
  - Billing: All / Active / Trialing / Past Due / Cancelled / No Subscription
  - Sync: All / Synced recently / Stale (7+ days) / Never synced
  - Status: All / Has Errors
- **Error highlighting**: rows with problems (sync failure, stale sync, past due billing) get a subtle tinted background and ⚠ indicator
- **Add School button**: opens the drawer in edit mode with blank fields
- **Loading**: table body shows a skeleton loader (MUI Skeleton rows) while fetching. Filter dropdowns and search remain interactive during load so users can queue up filter changes.

**Filter/pagination interaction rules:**
- Changing any filter or search text resets pagination to page 1.
- If the user is on a page beyond the new total (e.g. was on page 5, filters reduce to 3 pages), clamp to the last available page.

**Drawer (detail view)** — MUI Drawer, slides from the right when a table row is clicked. Width: 420px on desktop.

- **Read mode (default)**:
  - Header: school name, status chips (source + billing), close button
  - Action buttons: Edit, Sync Now (if Wonde school)
  - Contact card: contact email, billing email, phone (label:value grid)
  - Address card: formatted address block
  - Billing card: status, plan name, AI add-on status (`ai_addon_active` field), "Open Billing Portal" button (calls existing `POST /api/billing/portal` endpoint). For schools with no subscription, shows a "Start Trial" button instead (calls existing `POST /api/billing/setup` with `{plan: 'monthly', organizationId}`; on success, refetches table data and stays in read mode with updated billing status).
  - Wonde card (only shown if `wondeSchoolId` exists): school ID, token status ("✓ Set" or "⚠ Not set"), last sync timestamp, student count and class count (derived from `COUNT(*)` on `students` and `classes` tables for the org — fetched as part of the organization query via subquery)
  - Deactivate button at bottom (danger zone, separated by divider)

- **Edit mode** (after clicking Edit, or when adding a new school):
  - Header changes to "Edit School" / "Add School"
  - Fields become text inputs: name*, contact email, billing email, phone, address line 1, address line 2, town, postcode
  - Wonde token field (password input, only shown if school has `wondeSchoolId`). Shows "Token is set" placeholder if `hasWondeToken` is true, empty otherwise. A non-empty value on save triggers `POST /api/wonde/token` as a separate call after the org PUT. After save completes, the table refetches and the drawer updates to reflect changes (e.g. `hasWondeToken` becoming true).
  - Sticky Save/Cancel bar at bottom
  - Cancel returns to read mode (or closes drawer if adding)

- **Delete/deactivate**: confirmation dialog triggered from the Deactivate button within the drawer. Shows Wonde re-provisioning warning if applicable.

**Drawer-table interaction:**
- Changing filters or search closes the drawer (the selected school may no longer be in the result set).
- Changing pagination page keeps the drawer open if the selected school is still visible; closes it otherwise.
- After a successful edit/create/delete/sync action in the drawer, the table refetches the current page to reflect changes.

### Responsive Behaviour

This is an owner-only admin view, primarily used on desktop. Minimal mobile optimisation:

- **Tablet (< 1024px)**: drawer overlays the table at full width (temporary drawer mode) rather than pushing content.
- **Mobile (< 600px)**: hide Town column from table. Drawer opens fullscreen. Filter dropdowns collapse into a single "Filters" button that opens a popover/menu.

### Error States

Schools can have errors surfaced in both the table and drawer:

| Error | Table indicator | Drawer detail |
|-------|----------------|---------------|
| Sync failure (most recent `wonde_sync_log` entry has `status = 'error'`) | Red-tinted row, ⚠ next to name | Error message in Wonde card |
| Billing past due | Orange "Past Due" chip | Overdue info in Billing card |
| Missing config (no Wonde token when `wondeSchoolId` set) | Subtle warning indicator | "⚠ Not set" in Wonde card |
| Stale sync (7+ days) | "14 days ago ⚠" in Last Sync column | Highlighted in Wonde card |

**Error computation**: the backend computes a boolean `hasErrors` flag per organization based on: `subscription_status = 'past_due'`, `wonde_last_sync_at` older than 7 days (when `wonde_school_id` is set), `wonde_school_id` set but no encrypted token, or most recent `wonde_sync_log` entry for the org has `status = 'error'`. The `hasErrors` query parameter filters to only these schools. The ⚠ indicators in the table are rendered by the frontend based on the same fields returned in the organization object. Manual schools (no `wonde_school_id`) are excluded from sync-related error checks.

### Relative Timestamps

The backend returns raw ISO timestamps (`wondeLastSyncAt`). The frontend renders relative display:
- < 1 hour: "X minutes ago"
- < 24 hours: "X hours ago"
- < 30 days: "X days ago"
- Older: formatted date

The ⚠ stale indicator is frontend-computed: shown when `wondeLastSyncAt` is more than 7 days ago and `wondeSchoolId` is set.

### API Changes

**Modified endpoint: `GET /api/organization/all`**

Add server-side pagination, search, sorting, and filtering. The endpoint keeps `requireAdmin()` — it already differentiates by role: owners see all organizations, admins see only their own. The pagination/filter params are only meaningful for owners (admins always get a single result). The SchoolManagement tab is only visible to owners in the frontend.

```
GET /api/organization/all?page=1&pageSize=50&search=oakwood&source=wonde&billing=past_due&syncStatus=stale&hasErrors=true&sort=name&order=asc
```

Query parameters:
- `page` (int, default 1)
- `pageSize` (int, default 50, max 100)
- `search` (string, searches name and town with LIKE)
- `source` (enum: `wonde` | `manual`) — `wonde` = `wonde_school_id IS NOT NULL`, `manual` = `wonde_school_id IS NULL`
- `billing` (enum: `active` | `trialing` | `past_due` | `cancelled` | `none`) — matches `subscription_status` column, `none` = NULL or `'none'`
- `syncStatus` (enum: `recent` | `stale` | `never`) — `recent` = last sync within 7 days, `stale` = last sync > 7 days ago, `never` = `wonde_last_sync_at IS NULL` AND `wonde_school_id IS NOT NULL`
- `hasErrors` (boolean) — composite filter: `subscription_status = 'past_due'` OR (stale sync) OR (missing Wonde token when school ID set)
- `sort` (enum: `name` | `billing` | `lastSync` | `town`, default `name`) — maps to SQL columns: `name`, `subscription_status`, `wonde_last_sync_at`, `town`
- `order` (enum: `asc` | `desc`, default `asc`)

Response adds pagination metadata:
```json
{
  "organizations": [...],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "total": 1247,
    "totalPages": 25
  }
}
```

**Existing endpoints unchanged**: `POST /api/organization/create`, `PUT /api/organization/:id`, `DELETE /api/organization/:id`, `POST /api/wonde/sync/:id`, `POST /api/wonde/token`, `POST /api/billing/setup`.

### Component Architecture

The current monolithic `SchoolManagement.js` (543 lines) splits into:

- **`SchoolManagement.js`** — container: manages state (schools, pagination, filters, selected school, drawer mode), fetches data, passes props down. Handles all API calls and success/error feedback.
- **`SchoolTable.js`** — table with toolbar, filter dropdowns, search input, pagination controls, row click handler. Receives `schools`, `pagination`, `filters`, `sort`, `loading` as props; fires callbacks for filter/sort/page/row-click changes.
- **`SchoolDrawer.js`** — MUI Drawer component that renders either `SchoolReadView` or `SchoolEditForm` based on `drawerMode`. Contains the deactivate confirmation dialog.
- **`SchoolReadView.js`** — read-only detail cards (contact, address, billing, wonde). Receives school object and action callbacks (edit, sync, startTrial, deactivate).
- **`SchoolEditForm.js`** — edit form with inputs and save/cancel. Receives initial form data and save/cancel callbacks.

All new files in `src/components/schools/`.

### State Management

All state stays local to `SchoolManagement.js` — no AppContext changes needed. Key state:

- `schools` — current page of schools from API
- `pagination` — `{ page, pageSize, total, totalPages }`
- `filters` — `{ search, source, billing, syncStatus, hasErrors }`
- `sort` — `{ field, order }`
- `selectedSchool` — currently selected school object (null = drawer closed)
- `drawerMode` — `'read'` | `'edit'` | `'add'`
- `formData` — edit form state
- `loading` — boolean, true during table data fetch
- `error` / `success` — alert messages (auto-dismiss success after 5 seconds)

### Design Alignment

Follows the project's "Cozy Bookshelf" aesthetic:
- Cream/sage colour palette for chips and highlights
- Warm `#fafaf7` card backgrounds in drawer
- Rounded corners, soft shadows
- 44px+ touch targets for action buttons
- Error states use warm reds/oranges, not harsh primary colours
