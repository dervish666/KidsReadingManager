# Codebase Audit Report — Tally Reading (Wonde Integration Focus)

## Date: 2026-03-04
## Scope: Wonde/MyLogin integration, sync service, webhooks, admin routes, related frontend, cross-cutting consistency

## Executive Summary

The Wonde + MyLogin integration is well-architected overall. The OAuth2 flow is solid with CSRF protection, the sync service handles batching and pagination correctly, webhook authentication uses constant-time comparison, and the GDPR-erasure guard in the sync is a strong design decision.

However, the audit identified **14 findings** across security, performance, code quality, and incomplete features. The most impactful issues are: (1) an unused API call fetching all employees on every sync despite the data being sourced from classes instead, (2) `classAssignments.js` doing N+1 individual INSERT queries instead of batching, (3) the `wondeAdmin.js` routes using inline role checks instead of the existing `requireAdmin`/`requireOwner` middleware, and (4) several migration columns (`sen_status`, `pupil_premium`, `eal_status`, `fsm`) that are never populated or mapped.

No critical security vulnerabilities were found. The token encryption, auth flows, and tenant isolation are solid.

---

## Findings by Category

### 1. Performance

#### P1. Unused `fetchAllEmployees` API call in sync — **High**

**File:** `src/services/wondeSync.js:181-183`

`wondeEmployees` is fetched via `Promise.all` alongside students and deletions, but is never referenced after destructuring. The employee-class mapping (Step 4, lines 256-278) correctly builds from `wondeClasses` (which includes employees data via the `?include=employees` parameter). This wastes an entire paginated API call on every sync.

```js
// Current — wondeEmployees is fetched but never used
const [wondeStudents, wondeEmployees, deletions] = await Promise.all([
  fetchAllStudents(schoolToken, wondeSchoolId, fetchOptions),
  fetchAllEmployees(schoolToken, wondeSchoolId, fetchOptions),  // ← wasted API call
  fetchDeletions(schoolToken, wondeSchoolId, options.updatedAfter)
]);
```

**Fix:** Remove `fetchAllEmployees` from the `Promise.all` and the import. Remove `fetchAllEmployees` from `wondeApi.js` imports. Update the destructuring accordingly.

```js
const [wondeStudents, deletions] = await Promise.all([
  fetchAllStudents(schoolToken, wondeSchoolId, fetchOptions),
  fetchDeletions(schoolToken, wondeSchoolId, options.updatedAfter)
]);
```

#### P2. N+1 INSERT queries in `classAssignments.js` — **Medium**

**File:** `src/utils/classAssignments.js:33-37`

Each class assignment is inserted with a separate `db.prepare().bind().run()` call. For a teacher with 10 classes, this is 10 individual SQL round-trips. Should use `db.batch()`.

```js
// Current — N individual INSERT statements
for (const row of results) {
  await db.prepare(
    'INSERT OR IGNORE INTO class_assignments ...'
  ).bind(crypto.randomUUID(), row.class_id, userId).run();
}
```

**Fix:** Collect statements and batch them:

```js
const statements = results.map(row =>
  db.prepare('INSERT OR IGNORE INTO class_assignments (id, class_id, user_id, created_at) VALUES (?, ?, ?, datetime("now"))')
    .bind(crypto.randomUUID(), row.class_id, userId)
);
if (statements.length > 0) {
  await db.batch(statements);
}
```

#### P3. Deletions processed one-by-one instead of batched — **Medium**

**File:** `src/services/wondeSync.js:305-317`

Each student deletion is processed with an individual `db.prepare().run()` call. For a school removing 50 students, this is 50 separate queries. Should batch.

```js
// Current — N individual UPDATE statements
for (const del of deletions) {
  if (!del.restored_at) {
    const result = await db.prepare(...).bind(del.id, orgId).run();
    // ...
  }
}
```

**Fix:** Collect non-restored deletion statements and batch in groups of 100:

```js
const deactivateStatements = [];
for (const del of deletions) {
  if (!del.restored_at) {
    deactivateStatements.push(
      db.prepare(`UPDATE students SET is_active = 0, updated_at = datetime('now')
       WHERE wonde_student_id = ? AND organization_id = ?`).bind(del.id, orgId)
    );
  }
}
// Can't easily track individual meta.changes with batch, so count affected rows differently
for (let i = 0; i < deactivateStatements.length; i += 100) {
  await db.batch(deactivateStatements.slice(i, i + 100));
}
counts.studentsDeactivated = deactivateStatements.length;
```

Note: with batch we can't check `meta.changes` per statement, but since we filter by `wonde_student_id + organization_id`, the count will be accurate for practical purposes.

---

### 2. Code Quality & Consistency

#### Q1. Inline role checks instead of middleware in `wondeAdmin.js` — **Medium**

**File:** `src/routes/wondeAdmin.js:10-13, 46-48, 86-89`

All three routes do inline `c.get('userRole')` checks instead of using the existing `requireAdmin()` / `requireOwner()` middleware from `src/middleware/tenant.js`. Every other route file in the codebase uses the middleware pattern.

```js
// Current — inconsistent inline check
wondeAdminRouter.post('/sync', async (c) => {
  const userRole = c.get('userRole');
  if (userRole !== 'admin' && userRole !== 'owner') {
    return c.json({ error: 'Admin access required' }, 403);
  }
  // ...
});
```

**Fix:** Use middleware guards:

```js
import { requireAdmin, requireOwner } from '../middleware/tenant.js';

wondeAdminRouter.post('/sync', requireAdmin(), async (c) => { /* ... */ });
wondeAdminRouter.post('/token', requireOwner(), async (c) => { /* ... */ });
wondeAdminRouter.get('/status', requireAdmin(), async (c) => { /* ... */ });
```

#### Q2. Duplicated `parseCookies` function — **Low**

**Files:** `src/routes/mylogin.js:34-44` and `src/routes/auth.js:424-434`

Identical `parseCookies` function is defined in both files with identical logic. The comment at line 33 acknowledges this: "Defined locally since the same helper in auth.js is not exported."

**Fix:** Export `parseCookies` from `auth.js` and import it in `mylogin.js`. Or move it to a shared utility (e.g., `src/utils/helpers.js`).

#### Q3. `mapWondeStudent` doesn't extract SEN/PP/EAL/FSM data — **Medium**

**File:** `src/services/wondeSync.js:30-40`

The migration (`0024`) added `sen_status`, `pupil_premium`, `eal_status`, `fsm` columns to `students`. The Wonde API includes `extended_details` data. But `mapWondeStudent` doesn't extract these fields, and the sync INSERT/UPDATE statements don't set them. The `rowToStudent` mapper also doesn't include them.

This means these columns exist in the schema but are permanently NULL — dead schema.

**Fix (choose one):**
- **Option A:** Extract and sync these fields from Wonde's extended_details if needed for analytics:
  - Update `mapWondeStudent` to include `senStatus`, `pupilPremium`, `ealStatus`, `fsm`
  - Update INSERT/UPDATE statements in sync to bind these fields
  - Update `rowToStudent` to map them
  - Re-add `extended_details` to the `include` param in `fetchAllStudents` (`wondeApi.js:82`)
- **Option B:** Remove the columns from the schema if they're not needed. Add a migration `ALTER TABLE students DROP COLUMN ...` (note: SQLite doesn't support DROP COLUMN before 3.35.0; D1 uses 3.45+ so it works).

#### Q4. `wondeApi.js` still requests `education_details` include but extended_details was removed — **Low**

**File:** `src/utils/wondeApi.js:82`

The API call includes `education_details,classes,year` — this is correct for current usage. However, the original design also had `extended_details` for SEN/PP/EAL/FSM data. If those columns are being kept (see Q3), `extended_details` should be re-added to the include list.

---

### 3. Data Integrity

#### D1. Cron sync doesn't check for missing `wonde_school_token` — **Medium**

**File:** `src/worker.js:446-460`

The cron handler queries orgs with `wonde_school_id IS NOT NULL` but doesn't filter for `wonde_school_token IS NOT NULL`. If an org has a `wonde_school_id` but no token (e.g., token was never set, or was cleared), `decryptSensitiveData` will throw on `null` input, causing the sync to fail for that org.

```js
// Current — doesn't guard against null token
const wondeOrgs = await db.prepare(
  'SELECT ... FROM organizations WHERE wonde_school_id IS NOT NULL AND is_active = 1'
).bind().all();

for (const org of (wondeOrgs.results || [])) {
  const schoolToken = await decryptSensitiveData(org.wonde_school_token, env.JWT_SECRET);
  // ↑ throws if org.wonde_school_token is null
```

**Fix:** Add `AND wonde_school_token IS NOT NULL` to the query, or guard before decrypt:

```js
'SELECT ... FROM organizations WHERE wonde_school_id IS NOT NULL AND wonde_school_token IS NOT NULL AND is_active = 1'
```

#### D2. OAuth state cleanup not in cron handler — **Low**

**File:** `src/routes/mylogin.js:75-77` and `src/worker.js` (scheduled handler)

Expired `oauth_state` rows are cleaned up probabilistically (~10% of login requests). This is fine for active systems, but if MyLogin SSO goes unused for a while, stale rows accumulate. The cron handler already runs daily GDPR cleanup jobs but doesn't clean `oauth_state`.

**Fix:** Add to the cron handler's GDPR cleanup block:

```js
const expiredStates = await db.prepare(
  `DELETE FROM oauth_state WHERE created_at < datetime('now', '-5 minutes')`
).run();
console.log(`[Cron] Cleaned up ${expiredStates.meta?.changes || 0} expired OAuth states`);
```

#### D3. `wonde_employee_classes` DELETE + INSERT not atomic — **Low**

**File:** `src/services/wondeSync.js:256-285`

The sync DELETEs all `wonde_employee_classes` for the org, then INSERTs new ones. If the sync fails between delete and insert, the mapping table is empty. The employee class data would be restored on next successful sync, but in the interim teachers would lose their class filter assignments if they logged in.

**Fix:** Wrap the DELETE and all INSERTs in a single batch:

```js
const employeeStatements = [
  db.prepare('DELETE FROM wonde_employee_classes WHERE organization_id = ?').bind(orgId)
];
// ... build INSERT statements ...
for (let i = 0; i < employeeStatements.length; i += 100) {
  await db.batch(employeeStatements.slice(i, i + 100));
}
```

(Include the DELETE as the first statement in the first batch.)

---

### 4. Security

#### S1. Webhook school_name used in org creation without sanitisation — **Low**

**File:** `src/routes/webhooks.js:47-76`

The `body.school_name` from the webhook payload is used directly in the org name and slug generation. While D1 parameterised queries prevent SQL injection, if a malicious payload contained HTML/script in the school name, it would be stored and rendered in the frontend SchoolManagement page.

The risk is low because: (1) the webhook is authenticated via shared secret, (2) the data comes from Wonde's own systems which should be sanitised, and (3) React's default JSX escaping prevents XSS in most cases.

**Fix:** Add basic sanitisation:

```js
const schoolName = (body.school_name || '').trim().substring(0, 200);
```

#### S2. MyLogin access token not validated for scope/audience — **Low**

**File:** `src/routes/mylogin.js:168-169`

After token exchange, the MyLogin access token is used directly to fetch the user profile without checking the `token_type` or verifying any audience/scope claims. This is standard for simple OAuth2 flows and MyLogin doesn't document scope validation, so this is low risk but worth noting.

---

### 5. Incomplete Features

#### I1. `schoolMigration` webhook event is log-only — **Low**

**File:** `src/routes/webhooks.js:113-116`

The `schoolMigration` event is logged but takes no action. According to Wonde docs, this event fires when a school changes MIS provider — the school token may change. Consider whether the org's token needs updating.

**Fix:** Document the expected behaviour or add a TODO comment explaining why it's log-only.

#### I2. MyLogin SSO button always visible regardless of server config — **Low**

**File:** `src/components/Login.js:319-341`

The "Sign in with MyLogin" button is always rendered in multi-tenant mode, even when `MYLOGIN_CLIENT_ID` is not configured on the server. Clicking it would redirect to `/api/auth/mylogin/login`, which would fail because the redirect URL to MyLogin can't be constructed without the client ID.

**Fix:** The `/api/auth/mode` endpoint should include a `ssoEnabled` flag that the frontend checks before rendering the SSO button. Add `ssoEnabled: Boolean(c.env.MYLOGIN_CLIENT_ID)` to the mode response and conditionally render the button.

---

## Summary Statistics

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Security | 0 | 0 | 0 | 2 |
| Performance | 0 | 1 | 2 | 0 |
| Code Quality | 0 | 0 | 2 | 2 |
| Data Integrity | 0 | 0 | 1 | 2 |
| Incomplete | 0 | 0 | 0 | 2 |
| **Total** | **0** | **1** | **5** | **8** |

---

## Implementation Plan

### Overview
14 findings, 0 critical. Most fixes are S-M effort. Estimated total: ~3-4 hours.

### Phase 1: High Priority Performance

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 1 | P1: Unused fetchAllEmployees API call | `src/services/wondeSync.js:17-21,181-183` | S | Remove `fetchAllEmployees` from the import and `Promise.all`. Change destructuring from `[wondeStudents, wondeEmployees, deletions]` to `[wondeStudents, deletions]`. The employee-class data is already sourced from `wondeClasses` at line 263-278. |

### Phase 2: Medium Priority (Consistency, Performance, Data Integrity)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 2 | Q1: Inline role checks in wondeAdmin | `src/routes/wondeAdmin.js:1-13,44-48,85-89` | S | Import `requireAdmin, requireOwner` from `../middleware/tenant.js`. Replace inline `userRole` checks with middleware: `/sync` → `requireAdmin()`, `/token` → `requireOwner()`, `/status` → `requireAdmin()`. Remove the 3 inline check blocks. |
| 3 | P2: N+1 INSERTs in classAssignments | `src/utils/classAssignments.js:33-37` | S | Replace the `for` loop with `db.batch()`. Collect prepared statements into an array, then `await db.batch(statements)`. |
| 4 | P3: Un-batched deletions in sync | `src/services/wondeSync.js:305-317` | S | Collect non-restored deletion UPDATE statements into an array, then batch in groups of 100 (same pattern as classes/students). Set `counts.studentsDeactivated` to the array length. |
| 5 | D1: Cron sync missing token NULL check | `src/worker.js:446-448` | S | Add `AND wonde_school_token IS NOT NULL` to the SQL WHERE clause on line 447. |
| 6 | Q3: Dead schema columns (SEN/PP/EAL/FSM) | `src/services/wondeSync.js:30-40`, `src/utils/wondeApi.js:82`, `src/utils/rowMappers.js:34-65` | M | Either (a) populate the columns from Wonde extended_details data by adding to mapWondeStudent, sync INSERT/UPDATE, fetchAllStudents include, and rowToStudent, or (b) document them as "reserved for future use" with a TODO. Decision needed from product side. |
| 7 | I2: SSO button visibility | `src/routes/auth.js` (mode endpoint), `src/components/Login.js:319-341` | M | Add `ssoEnabled: Boolean(c.env.MYLOGIN_CLIENT_ID)` to the `/api/auth/mode` response. In `Login.js`, conditionally render the SSO divider and button only when `ssoEnabled` is true (pass through AppContext). |

### Phase 3: Low Priority (Cleanup, Hardening)

| # | Finding | Files | Effort | Description |
|---|---------|-------|--------|-------------|
| 8 | Q2: Duplicate parseCookies | `src/routes/mylogin.js:34-44`, `src/routes/auth.js:424-434` | S | Export `parseCookies` from `auth.js`. In `mylogin.js`, replace the local definition with `import { parseCookies } from './auth.js'`. |
| 9 | D2: OAuth state cron cleanup | `src/worker.js` (scheduled handler, after line 375) | S | Add `DELETE FROM oauth_state WHERE created_at < datetime('now', '-5 minutes')` to the GDPR cleanup block. |
| 10 | D3: Employee-class DELETE/INSERT atomicity | `src/services/wondeSync.js:256-285` | S | Include the DELETE statement as the first element in the `employeeStatements` array, so it's part of the first batch. |
| 11 | S1: Webhook school_name sanitisation | `src/routes/webhooks.js:47` | S | Add `.trim().substring(0, 200)` to `body.school_name` before use in INSERT and slug generation. |
| 12 | I1: Document schoolMigration behaviour | `src/routes/webhooks.js:113-116` | S | Add a comment explaining the expected behaviour and whether token refresh is needed. |
| 13 | S2: MyLogin token type check | `src/routes/mylogin.js:168-169` | S | Add `if (tokenData.token_type?.toLowerCase() !== 'bearer') { return c.redirect(...error) }` check after token exchange. |
| 14 | Q4: extended_details include decision | `src/utils/wondeApi.js:82` | S | Dependent on Q3 decision — if populating SEN/PP/EAL/FSM, re-add `extended_details` to the include param. |

### Dependencies & Ordering Notes

- **#6 and #14 are linked** — deciding whether to populate or drop the SEN/PP/EAL/FSM columns determines whether `extended_details` needs re-adding to the Wonde API include.
- **#1 should be done first** — it eliminates unnecessary API calls on every sync, immediate performance win.
- **#2-5 are independent** and can be done in parallel.
- **#8** (parseCookies dedup) may need a minor test update if tests mock the local function.
- **#7** (SSO button visibility) touches both backend and frontend, best done as a single change.

### Quick Wins (S effort, Medium+ priority)

1. **#1** — Remove unused `fetchAllEmployees` (S effort, High priority)
2. **#2** — Use middleware guards in wondeAdmin (S effort, Medium)
3. **#3** — Batch classAssignment INSERTs (S effort, Medium)
4. **#5** — Add NULL check to cron query (S effort, Medium)
