# Class Auto-Assignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-assign teachers to their Wonde-synced classes and auto-filter the UI to their class on login.

**Architecture:** Create the missing `class_assignments` table, add a shared helper to sync assignments from `wonde_employee_classes`, call it on every SSO login and after Wonde sync, include assigned class IDs in the JWT payload, and auto-set the frontend class filter on login.

**Tech Stack:** Cloudflare Workers, Hono, D1 (SQLite), React 19, Vitest

---

### Task 1: Migration — Create `class_assignments` table

**Files:**
- Create: `migrations/0030_class_assignments.sql`

**Step 1: Write the migration SQL**

```sql
-- Class assignments: links users to classes (populated from Wonde employee-class data)
CREATE TABLE IF NOT EXISTS class_assignments (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(class_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_class_assignments_user ON class_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_class_assignments_class ON class_assignments(class_id);
```

**Step 2: Verify migration applies locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: Migration 0030 applied successfully.

**Step 3: Commit**

```bash
git add migrations/0030_class_assignments.sql
git commit -m "feat: add class_assignments migration (0030)"
```

---

### Task 2: Shared helper — `syncUserClassAssignments`

**Files:**
- Create: `src/utils/classAssignments.js`
- Create: `src/__tests__/unit/classAssignments.test.js`

**Step 1: Write the failing tests**

Test file: `src/__tests__/unit/classAssignments.test.js`

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncUserClassAssignments } from '../../utils/classAssignments.js';

// Helper to create a mock D1 database
function createMockDB() {
  const boundStatement = {
    run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
  };
  const db = {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue(boundStatement),
    }),
    batch: vi.fn().mockResolvedValue([]),
  };
  return { db, boundStatement };
}

describe('syncUserClassAssignments', () => {
  it('does nothing if user has no wonde_employee_id', async () => {
    const { db } = createMockDB();
    await syncUserClassAssignments(db, 'user-1', null, 'org-1');
    // Should not query wonde_employee_classes
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('deletes existing assignments and re-creates from wonde data', async () => {
    const db = {
      prepare: vi.fn(),
      batch: vi.fn().mockResolvedValue([]),
    };

    // Call 1: DELETE existing class_assignments for user
    const deleteStmt = { bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({}) }) };
    // Call 2: SELECT from wonde_employee_classes JOIN classes
    const selectStmt = {
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [
            { class_id: 'class-1' },
            { class_id: 'class-2' },
          ]
        })
      })
    };
    // Calls 3+4: INSERT class_assignments (one per class)
    const insertStmt = { bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({}) }) };

    db.prepare.mockReturnValueOnce(deleteStmt)   // DELETE
              .mockReturnValueOnce(selectStmt)    // SELECT
              .mockReturnValue(insertStmt);       // INSERTs

    const count = await syncUserClassAssignments(db, 'user-1', 'wonde-emp-1', 'org-1');

    expect(count).toBe(2);

    // Verify DELETE was called for this user
    expect(db.prepare.mock.calls[0][0]).toContain('DELETE');
    expect(deleteStmt.bind).toHaveBeenCalledWith('user-1');

    // Verify SELECT joined wonde_employee_classes with classes
    expect(db.prepare.mock.calls[1][0]).toContain('wonde_employee_classes');
    expect(db.prepare.mock.calls[1][0]).toContain('classes');
    expect(selectStmt.bind).toHaveBeenCalledWith('org-1', 'wonde-emp-1');
  });

  it('returns 0 when wonde has no class mappings', async () => {
    const db = {
      prepare: vi.fn(),
    };

    const deleteStmt = { bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({}) }) };
    const selectStmt = {
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results: [] })
      })
    };

    db.prepare.mockReturnValueOnce(deleteStmt)
              .mockReturnValueOnce(selectStmt);

    const count = await syncUserClassAssignments(db, 'user-1', 'wonde-emp-1', 'org-1');
    expect(count).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/classAssignments.test.js`
Expected: FAIL — module not found

**Step 3: Write the implementation**

File: `src/utils/classAssignments.js`

```js
/**
 * Sync class assignments for a user from wonde_employee_classes.
 *
 * Deletes existing class_assignments for the user, then re-creates
 * them by joining wonde_employee_classes with classes to resolve
 * wonde_class_id → tally class_id.
 *
 * @param {Object} db - D1 database binding
 * @param {string} userId - Tally user ID
 * @param {string|null} wondeEmployeeId - Wonde employee ID (null = no-op)
 * @param {string} orgId - Organization ID
 * @returns {Promise<number>} Number of classes assigned
 */
export async function syncUserClassAssignments(db, userId, wondeEmployeeId, orgId) {
  if (!wondeEmployeeId) return 0;

  // 1. Delete existing assignments for this user
  await db.prepare(
    'DELETE FROM class_assignments WHERE user_id = ?'
  ).bind(userId).run();

  // 2. Find matching tally classes from wonde employee-class data
  const { results } = await db.prepare(
    `SELECT c.id AS class_id
     FROM wonde_employee_classes wec
     JOIN classes c ON c.wonde_class_id = wec.wonde_class_id AND c.organization_id = wec.organization_id
     WHERE wec.organization_id = ? AND wec.wonde_employee_id = ?`
  ).bind(orgId, wondeEmployeeId).all();

  if (!results || results.length === 0) return 0;

  // 3. Insert new assignments
  for (const row of results) {
    await db.prepare(
      'INSERT OR IGNORE INTO class_assignments (id, class_id, user_id, created_at) VALUES (?, ?, ?, datetime("now"))'
    ).bind(crypto.randomUUID(), row.class_id, userId).run();
  }

  return results.length;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/classAssignments.test.js`
Expected: 3/3 PASS

**Step 5: Commit**

```bash
git add src/utils/classAssignments.js src/__tests__/unit/classAssignments.test.js
git commit -m "feat: add syncUserClassAssignments helper"
```

---

### Task 3: Fix MyLogin callback — sync assignments on every login

**Files:**
- Modify: `src/routes/mylogin.js`
- Modify: `src/__tests__/unit/mylogin.test.js` (add test)

**Step 1: Write the failing test**

Add to the MyLogin callback describe block in `src/__tests__/unit/mylogin.test.js`:

```js
it('syncs class assignments for existing teacher on login', async () => {
  // Set up env with an existing teacher user who has a wonde_employee_id
  // Mock the class assignment queries
  // Verify DELETE + SELECT + INSERT are called for class_assignments
});
```

The test should verify that when an existing teacher logs in, `syncUserClassAssignments` is called with the correct arguments. Use the existing mock pattern in the test file.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/mylogin.test.js`
Expected: FAIL

**Step 3: Modify `src/routes/mylogin.js`**

1. Add import at top:
```js
import { syncUserClassAssignments } from '../utils/classAssignments.js';
```

2. After the existing user UPDATE (line 232) and after new user INSERT (line 251), add class assignment sync for **all** logins (both existing and new users). Replace the existing new-user-only class assignment block (lines 253-284) with a single call after the if/else:

```js
// After the if (existingUser) { ... } else { ... } block, before step 7:

// Sync class assignments for teachers (runs for both new and existing users)
if ((existingUser ? existingUser.role : role) === 'teacher' && wondeEmployeeId) {
  try {
    const assignedCount = await syncUserClassAssignments(db, userId, wondeEmployeeId, org.id);
    if (assignedCount > 0) {
      console.log(`[MyLogin] Synced ${assignedCount} class assignment(s) for ${name}`);
    }
  } catch (err) {
    console.warn('[MyLogin] Could not sync class assignments:', err.message);
  }
}
```

3. Remove the old new-user-only class assignment code (lines 253-284).

**Step 4: Run all MyLogin tests**

Run: `npx vitest run src/__tests__/unit/mylogin.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/routes/mylogin.js src/__tests__/unit/mylogin.test.js
git commit -m "feat: sync class assignments on every SSO login"
```

---

### Task 4: Add class assignment refresh to Wonde sync

**Files:**
- Modify: `src/services/wondeSync.js`
- Modify: `src/__tests__/integration/wondeSync.test.js` or `src/__tests__/unit/wondeSync.test.js` (whichever exists)

**Step 1: Write the failing test**

Add a test that verifies after the employee-class sync step, `class_assignments` is updated for users that have `wonde_employee_id` set.

```js
it('refreshes class_assignments after employee-class sync', async () => {
  // Set up DB with a user who has wonde_employee_id
  // Run sync
  // Verify class_assignments was populated
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/` (match the test file)
Expected: FAIL

**Step 3: Modify `src/services/wondeSync.js`**

1. Add import at top:
```js
import { syncUserClassAssignments } from '../utils/classAssignments.js';
```

2. After the employee-class INSERT batch (after line 279), add Step 4b:

```js
    // -----------------------------------------------------------------------
    // Step 4b: Refresh class_assignments for users with wonde_employee_ids
    // -----------------------------------------------------------------------
    const usersWithWonde = await db.prepare(
      'SELECT id, wonde_employee_id FROM users WHERE organization_id = ? AND wonde_employee_id IS NOT NULL AND is_active = 1'
    ).bind(orgId).all();

    for (const u of (usersWithWonde.results || [])) {
      try {
        await syncUserClassAssignments(db, u.id, u.wonde_employee_id, orgId);
      } catch (err) {
        console.warn(`[WondeSync] Could not sync class assignments for user ${u.id}:`, err.message);
      }
    }
```

**Step 4: Run tests**

Run: `npx vitest run src/__tests__/` (match the test file)
Expected: PASS

**Step 5: Commit**

```bash
git add src/services/wondeSync.js src/__tests__/...
git commit -m "feat: refresh class_assignments during Wonde sync"
```

---

### Task 5: Include `assignedClassIds` in JWT payload

**Files:**
- Modify: `src/routes/mylogin.js` (query class_assignments before creating JWT)
- Modify: `src/routes/auth.js` (login and refresh endpoints)
- Modify: `src/utils/crypto.js` (`createJWTPayload` to accept optional `assignedClassIds`)

**Step 1: Write failing tests**

Add tests to verify the JWT payload includes `assignedClassIds` when class_assignments exist.

**Step 2: Run tests to verify they fail**

**Step 3: Modify `createJWTPayload` in `src/utils/crypto.js`**

```js
export function createJWTPayload(user, organization) {
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    org: organization.id,
    orgSlug: organization.slug,
    role: user.role,
    authProvider: user.authProvider || 'local',
  };
  if (user.assignedClassIds && user.assignedClassIds.length > 0) {
    payload.assignedClassIds = user.assignedClassIds;
  }
  return payload;
}
```

**Step 4: Add class assignment lookup to `src/routes/mylogin.js`**

Before creating the JWT payload (before line 290), query class_assignments:

```js
// Look up assigned class IDs for the JWT payload
let assignedClassIds = [];
try {
  const assignments = await db.prepare(
    'SELECT class_id FROM class_assignments WHERE user_id = ?'
  ).bind(userId).all();
  assignedClassIds = (assignments.results || []).map(r => r.class_id);
} catch { /* table may not exist in legacy envs */ }
```

Then include in the user object passed to `createJWTPayload`:

```js
const userForPayload = {
  id: userId,
  email,
  name,
  role: existingUser ? existingUser.role : role,
  authProvider: 'mylogin',
  assignedClassIds,
};
```

**Step 5: Add class assignment lookup to `src/routes/auth.js` refresh endpoint**

In the refresh token handler (around line 494), after building the user object, look up assignments:

```js
// Look up assigned class IDs
let assignedClassIds = [];
try {
  const assignments = await db.prepare(
    'SELECT class_id FROM class_assignments WHERE user_id = ?'
  ).bind(storedToken.user_id).all();
  assignedClassIds = (assignments.results || []).map(r => r.class_id);
} catch { /* table may not exist */ }

const user = {
  id: storedToken.user_id,
  email: storedToken.email,
  name: storedToken.name,
  role: storedToken.role,
  authProvider: storedToken.auth_provider || 'local',
  assignedClassIds,
};
```

Also add `assignedClassIds` to the response body `user` object (around line 528-536):

```js
return c.json({
  accessToken,
  user: {
    id: storedToken.user_id,
    email: storedToken.email,
    name: storedToken.name,
    role: storedToken.role,
    authProvider: storedToken.auth_provider || 'local',
    assignedClassIds,
  },
  organization: { ... }
});
```

**Step 6: Add to login endpoint too**

In the login handler (around line 354), same pattern — query class_assignments for the user and include in payload.

**Step 7: Run all tests**

Run: `npx vitest run`
Expected: All PASS

**Step 8: Commit**

```bash
git add src/utils/crypto.js src/routes/mylogin.js src/routes/auth.js src/__tests__/...
git commit -m "feat: include assignedClassIds in JWT payload"
```

---

### Task 6: Frontend — auto-set globalClassFilter on login

**Files:**
- Modify: `src/contexts/AppContext.js`

**Step 1: Write failing test**

Add test in a new or existing AppContext test file that verifies when a user with `assignedClassIds` authenticates via SSO callback, `globalClassFilter` is set to the first assigned class (sorted alphabetically by class name).

**Step 2: Run test to verify it fails**

**Step 3: Modify `src/contexts/AppContext.js`**

In the SSO callback handler (around line 205-238), after setting the user, auto-set the class filter:

```js
if (data.user) {
  setUser(data.user);
  // ... existing localStorage code ...

  // Auto-set class filter on fresh SSO login
  if (data.user.assignedClassIds && data.user.assignedClassIds.length > 0) {
    // We'll set the filter after classes are loaded — store intent
    try {
      window.sessionStorage.setItem('pendingClassAutoFilter', JSON.stringify(data.user.assignedClassIds));
    } catch { /* ignore */ }
  }
}
```

Then in the classes fetch effect (wherever `setClasses` is called after fetching), add auto-filter resolution:

```js
// After classes are loaded, check for pending auto-filter from SSO login
try {
  const pending = window.sessionStorage.getItem('pendingClassAutoFilter');
  if (pending) {
    window.sessionStorage.removeItem('pendingClassAutoFilter');
    const assignedIds = JSON.parse(pending);
    // Find the first assigned class alphabetically by name
    const assignedClasses = fetchedClasses
      .filter(c => assignedIds.includes(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (assignedClasses.length > 0) {
      setGlobalClassFilter(assignedClasses[0].id);
    }
  }
} catch { /* ignore */ }
```

This approach:
- Only triggers on fresh SSO login (not page refresh — sessionStorage `pendingClassAutoFilter` is set only during SSO callback)
- Waits for classes to load before resolving which class to select
- Picks first class alphabetically

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/contexts/AppContext.js src/__tests__/...
git commit -m "feat: auto-set class filter on SSO login"
```

---

### Task 7: Final verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass, 0 failures.

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with exit 0.

**Step 3: Verify git status is clean**

Run: `git status`
Expected: On branch, nothing to commit.
