# Organization Hard Delete Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cascade hard-delete all org-scoped data when a school's subscription expires (90-day grace) or on demand for Article 17 erasure requests.

**Architecture:** Single shared function `hardDeleteOrganization(db, orgId)` in `src/services/orgPurge.js` deletes across 26 tables in FK-safe order, then anonymises the org row. Called by both the 2 AM cron (automated) and a new `DELETE /api/organization/:id/purge` endpoint (manual).

**Tech Stack:** Cloudflare Workers, D1 (SQLite), Hono framework, Vitest

**Spec:** `docs/superpowers/specs/2026-04-08-org-hard-delete-design.md`

---

## Chunk 1: Migration + Core Function

### Task 1: Database migration

**Files:**
- Create: `migrations/0047_org_purge_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add purge tracking and legal hold columns to organizations
ALTER TABLE organizations ADD COLUMN purged_at TEXT;
ALTER TABLE organizations ADD COLUMN legal_hold INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Apply locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration applied successfully

- [ ] **Step 3: Commit**

```bash
git add migrations/0047_org_purge_columns.sql
git commit -m "feat(gdpr): add purged_at and legal_hold columns to organizations"
```

---

### Task 2: Write failing tests for hardDeleteOrganization

**Files:**
- Create: `src/__tests__/unit/orgPurge.test.js`

The test file mocks D1 using the same `createMockDB` pattern as `src/__tests__/integration/organization.test.js`. Tests verify:

1. Happy path: all 26 DELETEs are issued, org row is anonymised, data_rights_log entry created, summary returned
2. Legal hold: throws 409 when `legal_hold = 1`
3. Already purged: throws 409 when `purged_at` is set
4. Org not found: throws 404
5. Per-table resilience: a failing table is logged in `errors` array but doesn't abort the rest

- [ ] **Step 1: Write the test file**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hardDeleteOrganization } from '../../services/orgPurge.js';

const TEST_ORG_ID = 'org-to-purge';
const PURGE_LOG_ID = 'purge-log-entry-id';

// Track all SQL statements executed
const createTrackingDB = (orgRow = {}) => {
  const statements = [];
  const db = {
    prepare: vi.fn().mockImplementation((sql) => {
      const stmt = {
        sql,
        bind: vi.fn().mockImplementation((...args) => {
          statements.push({ sql, args });
          return stmt;
        }),
        first: vi.fn().mockImplementation(() => {
          // Return org row for the initial SELECT
          if (sql.includes('SELECT') && sql.includes('FROM organizations')) {
            return Promise.resolve({
              id: TEST_ORG_ID,
              name: 'Test School',
              legal_hold: 0,
              purged_at: null,
              ...orgRow,
            });
          }
          // Return a generated ID for the data_rights_log INSERT
          if (sql.includes('INSERT INTO data_rights_log')) {
            return Promise.resolve({ id: PURGE_LOG_ID });
          }
          return Promise.resolve(null);
        }),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
      };
      return stmt;
    }),
  };
  return { db, statements };
};

describe('hardDeleteOrganization', () => {
  it('deletes all 26 org-scoped tables in order and anonymises the org row', async () => {
    const { db, statements } = createTrackingDB();
    const result = await hardDeleteOrganization(db, TEST_ORG_ID);

    // Should have: 1 SELECT org + 1 INSERT log + 26 DELETEs + 1 UPDATE anonymise
    expect(result.orgId).toBe(TEST_ORG_ID);
    expect(result.errors).toEqual([]);

    // Verify the data_rights_log INSERT happened before any DELETEs
    const insertIdx = statements.findIndex((s) => s.sql.includes('INSERT INTO data_rights_log'));
    const firstDeleteIdx = statements.findIndex((s) => s.sql.includes('DELETE FROM'));
    expect(insertIdx).toBeGreaterThan(-1);
    expect(firstDeleteIdx).toBeGreaterThan(insertIdx);

    // Verify the anonymise UPDATE is last
    const updateIdx = statements.findIndex(
      (s) => s.sql.includes('UPDATE organizations') && s.sql.includes('purged_at')
    );
    expect(updateIdx).toBe(statements.length - 1);

    // Verify specific table order: support_ticket_notes first, users last before anonymise
    const deleteStatements = statements.filter((s) => s.sql.includes('DELETE FROM'));
    expect(deleteStatements[0].sql).toContain('support_ticket_notes');
    expect(deleteStatements[deleteStatements.length - 1].sql).toContain('DELETE FROM users');
    expect(deleteStatements.length).toBe(26);
  });

  it('throws 404 when org does not exist', async () => {
    const { db } = createTrackingDB();
    // Override first() to return null for the org lookup
    db.prepare.mockImplementation((sql) => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({ success: true }),
    }));

    await expect(hardDeleteOrganization(db, 'nonexistent')).rejects.toThrow();
    await expect(hardDeleteOrganization(db, 'nonexistent')).rejects.toMatchObject({ status: 404 });
  });

  it('throws 409 when org has legal_hold = 1', async () => {
    const { db } = createTrackingDB({ legal_hold: 1 });

    await expect(hardDeleteOrganization(db, TEST_ORG_ID)).rejects.toThrow(
      'Organisation is under legal hold and cannot be purged'
    );
    await expect(hardDeleteOrganization(db, TEST_ORG_ID)).rejects.toMatchObject({ status: 409 });
  });

  it('throws 409 when org is already purged', async () => {
    const { db } = createTrackingDB({ purged_at: '2026-01-01T00:00:00Z' });

    await expect(hardDeleteOrganization(db, TEST_ORG_ID)).rejects.toThrow(
      'Organisation has already been purged'
    );
    await expect(hardDeleteOrganization(db, TEST_ORG_ID)).rejects.toMatchObject({ status: 409 });
  });

  it('collects per-table errors without aborting', async () => {
    const { db } = createTrackingDB();
    let deleteCount = 0;
    db.prepare.mockImplementation((sql) => {
      const stmt = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockImplementation(() => {
          if (sql.includes('SELECT') && sql.includes('FROM organizations')) {
            return Promise.resolve({
              id: TEST_ORG_ID,
              name: 'Test School',
              legal_hold: 0,
              purged_at: null,
            });
          }
          if (sql.includes('INSERT INTO data_rights_log')) {
            return Promise.resolve({ id: PURGE_LOG_ID });
          }
          return Promise.resolve(null);
        }),
        run: vi.fn().mockImplementation(() => {
          // Fail on the 3rd DELETE (student_badges)
          if (sql.includes('DELETE FROM') && deleteCount++ === 2) {
            return Promise.reject(new Error('table student_badges missing'));
          }
          return Promise.resolve({ success: true, meta: { changes: 1 } });
        }),
      };
      return stmt;
    });

    const result = await hardDeleteOrganization(db, TEST_ORG_ID);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('student_badges');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/orgPurge.test.js`
Expected: FAIL — `Cannot find module '../../services/orgPurge.js'`

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/unit/orgPurge.test.js
git commit -m "test(gdpr): add failing tests for hardDeleteOrganization"
```

---

### Task 3: Implement hardDeleteOrganization

**Files:**
- Create: `src/services/orgPurge.js`

- [ ] **Step 1: Write the implementation**

```js
/**
 * Organization Hard Delete (Data Retention Purge)
 *
 * Cascade-deletes all org-scoped data across 26 tables in FK-safe order,
 * then anonymises the organizations row as a tombstone.
 *
 * Used by: nightly cron (automated, 90 days after deactivation)
 *          DELETE /api/organization/:id/purge (manual Article 17 requests)
 */

import { createError } from '../middleware/errorHandler.js';

// FK-safe delete order: children before parents.
// Each entry: { table, where } — where clause uses ? for orgId binding.
// Tables without direct organization_id use subqueries via parent tables.
const DELETE_ORDER = [
  {
    table: 'support_ticket_notes',
    where: `ticket_id IN (SELECT id FROM support_tickets WHERE organization_id = ?)`,
  },
  { table: 'support_tickets', where: `organization_id = ?` },
  { table: 'student_badges', where: `organization_id = ?` },
  { table: 'student_reading_stats', where: `organization_id = ?` },
  {
    table: 'reading_sessions',
    where: `student_id IN (SELECT id FROM students WHERE organization_id = ?)`,
  },
  {
    table: 'student_preferences',
    where: `student_id IN (SELECT id FROM students WHERE organization_id = ?)`,
  },
  {
    table: 'class_assignments',
    where: `class_id IN (SELECT id FROM classes WHERE organization_id = ?)`,
  },
  { table: 'students', where: `organization_id = ?` },
  { table: 'classes', where: `organization_id = ?` },
  { table: 'org_book_selections', where: `organization_id = ?` },
  { table: 'org_settings', where: `organization_id = ?` },
  { table: 'org_ai_config', where: `organization_id = ?` },
  { table: 'term_dates', where: `organization_id = ?` },
  { table: 'billing_events', where: `organization_id = ?` },
  { table: 'metadata_jobs', where: `organization_id = ?` },
  { table: 'wonde_sync_log', where: `organization_id = ?` },
  { table: 'wonde_employee_classes', where: `organization_id = ?` },
  { table: 'wonde_erased_students', where: `organization_id = ?` },
  // data_rights_log is handled separately (excludes the purge log entry)
  {
    table: 'refresh_tokens',
    where: `user_id IN (SELECT id FROM users WHERE organization_id = ?)`,
  },
  {
    table: 'password_reset_tokens',
    where: `user_id IN (SELECT id FROM users WHERE organization_id = ?)`,
  },
  {
    table: 'user_tour_completions',
    where: `user_id IN (SELECT id FROM users WHERE organization_id = ?)`,
  },
  {
    table: 'login_attempts',
    where: `email IN (SELECT email FROM users WHERE organization_id = ?)`,
  },
  {
    table: 'rate_limits',
    where: `key IN (SELECT id FROM users WHERE organization_id = ?)`,
  },
  { table: 'audit_log', where: `organization_id = ?` },
  { table: 'users', where: `organization_id = ?` },
];

/**
 * Cascade hard-delete all data for an organization, then anonymise the org row.
 *
 * @param {object} db - D1 database binding
 * @param {string} orgId - Organization ID to purge
 * @returns {Promise<{orgId: string, tablesProcessed: number, errors: string[]}>}
 */
export async function hardDeleteOrganization(db, orgId) {
  // 1. Load and validate the org
  const org = await db
    .prepare('SELECT id, name, legal_hold, purged_at FROM organizations WHERE id = ?')
    .bind(orgId)
    .first();

  if (!org) {
    throw createError('Organization not found', 404);
  }
  if (org.legal_hold) {
    throw createError('Organisation is under legal hold and cannot be purged', 409);
  }
  if (org.purged_at) {
    throw createError('Organisation has already been purged', 409);
  }

  // 2. Log the purge action to data_rights_log before any deletes
  const purgeLogId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO data_rights_log (id, organization_id, request_type, subject_type, subject_id, status, completed_at, notes)
       VALUES (?, ?, 'erasure', 'organization', ?, 'completed', datetime('now'), 'Full organization data purge')`
    )
    .bind(purgeLogId, orgId, orgId)
    .run();

  // 3. Delete all org-scoped data in FK-safe order
  const errors = [];
  let tablesProcessed = 0;

  for (const { table, where } of DELETE_ORDER) {
    try {
      await db.prepare(`DELETE FROM ${table} WHERE ${where}`).bind(orgId).run();
      tablesProcessed++;
    } catch (error) {
      console.error(`[OrgPurge] ${table} failed: ${error.message}`);
      errors.push(`${table}: ${error.message}`);
    }
  }

  // 4. Delete old data_rights_log entries, excluding the purge entry we just created
  try {
    await db
      .prepare('DELETE FROM data_rights_log WHERE organization_id = ? AND id != ?')
      .bind(orgId, purgeLogId)
      .run();
    tablesProcessed++;
  } catch (error) {
    console.error(`[OrgPurge] data_rights_log failed: ${error.message}`);
    errors.push(`data_rights_log: ${error.message}`);
  }

  // 5. Anonymise the organizations row (tombstone)
  await db
    .prepare(
      `UPDATE organizations SET
        name = 'Deleted Organisation',
        contact_email = NULL,
        billing_email = NULL,
        phone = NULL,
        address_line_1 = NULL,
        address_line_2 = NULL,
        town = NULL,
        postcode = NULL,
        wonde_school_id = NULL,
        wonde_school_token = NULL,
        mylogin_org_id = NULL,
        stripe_customer_id = NULL,
        stripe_subscription_id = NULL,
        consent_given_by = NULL,
        purged_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?`
    )
    .bind(orgId)
    .run();

  console.log(
    `[OrgPurge] Purged org ${orgId}: ${tablesProcessed} tables, ${errors.length} errors`
  );

  return { orgId, tablesProcessed, errors };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/orgPurge.test.js`
Expected: All 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/services/orgPurge.js
git commit -m "feat(gdpr): implement hardDeleteOrganization cascade purge"
```

---

## Chunk 2: API Endpoint + Cron Update

### Task 4: Write failing tests for the purge endpoint

**Files:**
- Modify: `src/__tests__/unit/orgPurge.test.js`

Add a second `describe` block for the API endpoint, using the same Hono test app pattern as `src/__tests__/integration/organization.test.js`.

- [ ] **Step 1: Add endpoint tests to the test file**

Append to `src/__tests__/unit/orgPurge.test.js`:

```js
import { Hono } from 'hono';
import { organizationRouter } from '../../routes/organization.js';

const TEST_SECRET = 'test-jwt-secret-for-testing';

const createPurgeTestApp = (mockDb, contextValues = {}) => {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.env = { JWT_SECRET: TEST_SECRET, READING_MANAGER_DB: mockDb };
    c.set('userId', contextValues.userId || 'owner-1');
    c.set('organizationId', contextValues.organizationId || 'owner-org');
    c.set('userRole', contextValues.userRole || 'owner');
    c.set('user', contextValues.user || { id: 'owner-1', role: 'owner' });
    await next();
  });
  app.onError((error, c) => {
    const status = error.status || 500;
    return c.json({ error: error.message }, status);
  });
  app.route('/api/organization', organizationRouter);
  return app;
};

describe('DELETE /api/organization/:id/purge', () => {
  it('returns 400 when confirm name does not match', async () => {
    const db = {
      prepare: vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          id: TEST_ORG_ID,
          name: 'Actual School Name',
          legal_hold: 0,
          purged_at: null,
        }),
        run: vi.fn().mockResolvedValue({ success: true }),
      })),
    };
    const app = createPurgeTestApp(db);
    const res = await app.request(`/api/organization/${TEST_ORG_ID}/purge`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'Wrong Name' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 409 when org has legal hold', async () => {
    const db = {
      prepare: vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          id: TEST_ORG_ID,
          name: 'Test School',
          legal_hold: 1,
          purged_at: null,
        }),
        run: vi.fn().mockResolvedValue({ success: true }),
      })),
    };
    const app = createPurgeTestApp(db);
    const res = await app.request(`/api/organization/${TEST_ORG_ID}/purge`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'Test School' }),
    });
    expect(res.status).toBe(409);
  });

  it('returns 409 when org is already purged', async () => {
    const db = {
      prepare: vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          id: TEST_ORG_ID,
          name: 'Deleted Organisation',
          legal_hold: 0,
          purged_at: '2026-01-01T00:00:00Z',
        }),
        run: vi.fn().mockResolvedValue({ success: true }),
      })),
    };
    const app = createPurgeTestApp(db);
    const res = await app.request(`/api/organization/${TEST_ORG_ID}/purge`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'Deleted Organisation' }),
    });
    expect(res.status).toBe(409);
  });

  it('returns 200 with summary on successful purge', async () => {
    const db = {
      prepare: vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({
          id: TEST_ORG_ID,
          name: 'Test School',
          legal_hold: 0,
          purged_at: null,
        }),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
      })),
    };
    const app = createPurgeTestApp(db);
    const res = await app.request(`/api/organization/${TEST_ORG_ID}/purge`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'Test School' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orgId).toBe(TEST_ORG_ID);
    expect(body.errors).toEqual([]);
  });
});
```

Note: The `import { Hono }` and `import { organizationRouter }` should go at the top of the file alongside the existing imports. The `createPurgeTestApp` helper and endpoint `describe` block go after the existing `hardDeleteOrganization` tests.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/__tests__/unit/orgPurge.test.js`
Expected: New endpoint tests FAIL (no purge route registered yet). Existing tests still PASS.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/unit/orgPurge.test.js
git commit -m "test(gdpr): add failing tests for purge API endpoint"
```

---

### Task 5: Implement the purge endpoint

**Files:**
- Modify: `src/routes/organization.js` — add the `DELETE /:id/purge` route

The endpoint goes BEFORE the existing `DELETE /:id` route (Hono matches routes in order, and `/:id/purge` must match before `/:id` catches it).

- [ ] **Step 1: Add the purge endpoint**

In `src/routes/organization.js`, add the import at the top:

```js
import { hardDeleteOrganization } from '../services/orgPurge.js';
```

Then add the endpoint before the existing `DELETE /:id` route (before line 822):

```js
/**
 * DELETE /api/organization/:id/purge
 * Permanently delete all org data (Article 17 erasure)
 * Requires: owner role, body { confirm: "<org name>" }
 */
organizationRouter.delete('/:id/purge', requireOwner(), auditLog('purge', 'organization'), async (c) => {
  const db = getDB(c.env);
  const orgId = c.req.param('id');

  // Load org to check name confirmation
  const org = await db
    .prepare('SELECT id, name, legal_hold, purged_at FROM organizations WHERE id = ?')
    .bind(orgId)
    .first();

  if (!org) {
    throw notFoundError('Organization not found');
  }

  const body = await c.req.json();
  const confirmName = (body.confirm || '').trim().toLowerCase();
  const orgName = (org.name || '').trim().toLowerCase();

  if (confirmName !== orgName) {
    throw badRequestError('Confirmation name does not match the organization name');
  }

  // hardDeleteOrganization handles legal_hold and purged_at checks (throws 409)
  const result = await hardDeleteOrganization(db, orgId);
  return c.json(result);
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/orgPurge.test.js`
Expected: All tests PASS

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 4: Commit**

```bash
git add src/routes/organization.js src/services/orgPurge.js
git commit -m "feat(gdpr): add DELETE /api/organization/:id/purge endpoint"
```

---

### Task 6: Update the cron to use hardDeleteOrganization

**Files:**
- Modify: `src/worker.js` — replace lines 569-600 (the naive org delete block)

- [ ] **Step 1: Add the import**

At the top of `src/worker.js`, alongside the other service imports:

```js
import { hardDeleteOrganization } from './services/orgPurge.js';
```

- [ ] **Step 2: Replace the existing org hard-delete block**

Replace the block from `const staleOrgs = await db` through the closing `}` of the `if (orgsDeleted > 0)` block (lines 569-600) with:

```js
              // Cascade purge orgs past 90-day retention (replaces naive single-row delete)
              const staleOrgs = await db
                .prepare(
                  `SELECT id FROM organizations WHERE is_active = 0 AND updated_at < datetime('now', '-90 days') AND legal_hold = 0 AND purged_at IS NULL`
                )
                .bind()
                .all();

              for (const org of staleOrgs.results || []) {
                try {
                  const result = await hardDeleteOrganization(db, org.id);
                  console.log(
                    `[Cron] Purged org ${org.id}: ${result.tablesProcessed} tables, ${result.errors.length} errors`
                  );
                } catch (error) {
                  console.error(`[Cron] Failed to purge org ${org.id}:`, error.message);
                }
              }
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: No regressions

- [ ] **Step 4: Commit**

```bash
git add src/worker.js
git commit -m "feat(gdpr): replace naive org delete with cascade purge in cron"
```

---

## Chunk 3: Documentation + Retention Policy Update

### Task 7: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add orgPurge.js to the file map**

In the services section of the file map, add:

```
src/services/orgPurge.js - Cascade hard-delete all org data (26 tables FK-safe), anonymise org row
```

- [ ] **Step 2: Update the organization.js route description**

Change the `src/routes/organization.js` line to:

```
src/routes/organization.js - GET/POST/PUT/DELETE org settings, AI config, audit log, purge (Article 17)
```

- [ ] **Step 3: Update Key Tables section**

In the `organizations` entry, add note about `legal_hold` and `purged_at` columns.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add orgPurge service and purge endpoint to CLAUDE.md"
```

---

### Task 8: Update retention policy

**Files:**
- Modify: `docs/gdpr/05-data-retention-policy.md`

- [ ] **Step 1: Move items from Remaining to Completed in Section 8**

Move "Organisation-level hard delete endpoint" and "Audit log hard delete job" from Phase 1 Remaining to the Completed list. Update the implementation gaps table in Section 2.2 to mark these as implemented.

Also fix the stale `reading_streaks` table reference in Section 2.1 — streaks are columns on `students`, not a separate table.

- [ ] **Step 2: Commit**

```bash
git add docs/gdpr/05-data-retention-policy.md
git commit -m "docs(gdpr): mark org hard delete and audit log purge as implemented"
```
