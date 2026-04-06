# Demo Environment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a zero-signup demo to the landing page so prospective schools can try Tally with realistic data that resets hourly.

**Architecture:** A dedicated `POST /api/auth/demo` endpoint issues a teacher-scoped JWT for the Learnalot School org. A bundled data snapshot is restored hourly via cron. The frontend adds a "Try the demo" button to the landing page — no special demo mode, the app behaves identically to a real teacher session.

**Tech Stack:** Cloudflare Workers (Hono), D1, existing JWT auth, React 19, MUI v7.

**Spec:** `docs/superpowers/specs/2026-04-06-demo-environment-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/data/demoSnapshot.js` | Exported JS module containing all Learnalot demo data as arrays of row objects |
| Create | `src/services/demoReset.js` | `resetDemoData(db, orgId)` — delete + re-insert logic, FK-safe order, batch chunking |
| Create | `scripts/export-demo-snapshot.js` | One-time script to export Learnalot data from remote D1 into `demoSnapshot.js` |
| Create | `src/__tests__/unit/demoReset.test.js` | Tests for reset logic (delete order, batch chunking, snapshot insertion) |
| Create | `src/__tests__/unit/demoAuth.test.js` | Tests for demo auth endpoint (token shape, rate limiting, no refresh token) |
| Modify | `src/routes/auth.js` | Add `POST /demo` endpoint |
| Modify | `src/utils/constants.js` | Add `/api/auth/demo` to `PUBLIC_PATHS` |
| Modify | `src/worker.js` | Add public path bypass, register hourly cron, add demo AI rate limit |
| Modify | `wrangler.toml` | Add `0 * * * *` cron expression |
| Modify | `src/contexts/AuthContext.js` | Redirect demo users to `/` on auth expiry instead of login |
| Modify | `src/components/LandingPage.js` | Add "Try the demo" button |

---

## Chunk 1: Backend — Demo Auth Endpoint

### Task 1: Add `/api/auth/demo` to public paths

**Files:**
- Modify: `src/utils/constants.js:11-26`

- [ ] **Step 1: Write the failing test**

In `src/__tests__/unit/demoAuth.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { PUBLIC_PATHS } from '../../utils/constants.js';

describe('demo auth public path', () => {
  it('includes /api/auth/demo in PUBLIC_PATHS', () => {
    expect(PUBLIC_PATHS).toContain('/api/auth/demo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/demoAuth.test.js`
Expected: FAIL — `/api/auth/demo` not in array

- [ ] **Step 3: Add the public path**

In `src/utils/constants.js`, add `'/api/auth/demo'` to the `PUBLIC_PATHS` array (after `/api/webhooks/stripe`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/demoAuth.test.js`
Expected: PASS

- [ ] **Step 5: Add public path bypass in worker.js**

In `src/worker.js`, the tenant middleware bypass at line ~213 already checks `PUBLIC_PATHS.includes(url.pathname)`, so adding to `PUBLIC_PATHS` covers both locations. Verify by reading the middleware chain — no additional change needed in `worker.js` for the bypass.

Note: Rate limiting is already handled — `authRouter.use('*', authRateLimit())` at `src/routes/auth.js:27` applies 10 req/min to all auth routes including the new `/demo` route. No additional rate limiting needed.

- [ ] **Step 6: Commit**

```bash
git add src/utils/constants.js src/__tests__/unit/demoAuth.test.js
git commit -m "feat(demo): add /api/auth/demo to public paths"
```

### Task 2: Create the demo auth endpoint

**Files:**
- Modify: `src/routes/auth.js`
- Test: `src/__tests__/unit/demoAuth.test.js`

The endpoint creates a JWT for the demo teacher user. It looks up the demo user by `auth_provider = 'demo'` in the Learnalot org, then issues a 1-hour access token with `authProvider: 'demo'` in the payload. No refresh token.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/unit/demoAuth.test.js`:

```js
describe('POST /api/auth/demo', () => {
  it('returns an access token with demo authProvider and 1-hour TTL', () => {
    // Validates the endpoint contract:
    // - Returns { accessToken, user }
    // - user.authProvider === 'demo'
    // - No refreshToken in response
    // - No Set-Cookie header (no refresh cookie)
    // Full integration test — verify manually during deployment (Task 11)
  });
});
```

- [ ] **Step 2: Implement the demo endpoint**

In `src/routes/auth.js`, add after the existing imports:

```js
const DEMO_AUTH_PROVIDER = 'demo';
const DEMO_TOKEN_TTL = 60 * 60 * 1000; // 1 hour in ms
```

Add the route handler before the register route:

```js
/**
 * POST /api/auth/demo
 * Issue a demo JWT for the Learnalot School demo teacher.
 * No credentials required. Rate limited. No refresh token.
 */
authRouter.post('/demo', async (c) => {
  const db = getDB(c.env);

  // Find the demo user
  const demoUser = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.auth_provider,
              o.id as org_id, o.name as org_name, o.slug as org_slug
       FROM users u
       JOIN organizations o ON u.organization_id = o.id
       WHERE u.auth_provider = ? AND u.is_active = 1 AND o.is_active = 1
       LIMIT 1`
    )
    .bind(DEMO_AUTH_PROVIDER)
    .first();

  if (!demoUser) {
    return c.json({ error: 'Demo not available' }, 503);
  }

  const payload = createJWTPayload(
    {
      id: demoUser.id,
      email: demoUser.email,
      name: demoUser.name,
      role: demoUser.role,
      authProvider: DEMO_AUTH_PROVIDER,
    },
    {
      id: demoUser.org_id,
      name: demoUser.org_name,
      slug: demoUser.org_slug,
    }
  );

  const accessToken = await createAccessToken(payload, c.env.JWT_SECRET, DEMO_TOKEN_TTL);

  return c.json({
    accessToken,
    user: {
      id: demoUser.id,
      email: demoUser.email,
      name: demoUser.name,
      role: demoUser.role,
      authProvider: DEMO_AUTH_PROVIDER,
      organization: {
        id: demoUser.org_id,
        name: demoUser.org_name,
        slug: demoUser.org_slug,
      },
    },
  });
});
```

- [ ] **Step 3: Run all auth tests**

Run: `npx vitest run src/__tests__/unit/demoAuth.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/routes/auth.js src/__tests__/unit/demoAuth.test.js
git commit -m "feat(demo): add POST /api/auth/demo endpoint"
```

### Task 3: Add demo AI recommendation rate limit

**Files:**
- Modify: `src/routes/books.js`

The existing `costRateLimit(10)` on `/api/books/ai-suggestions` allows 10 requests/min per user. For demo users, cap at 3 per hour instead.

- [ ] **Step 1: Add demo-specific guard in the ai-suggestions handler**

In `src/routes/books.js`, inside the `GET /ai-suggestions` handler (after the `requireReadonly()` check), add at the top of the try block:

```js
// Demo users: hard cap of 3 AI requests per hour
if (c.get('user')?.authProvider === 'demo') {
  const db = c.env.READING_MANAGER_DB;
  const userId = c.get('userId');
  const count = await db
    .prepare(
      `SELECT COUNT(*) as count FROM rate_limits
       WHERE key = ? AND endpoint = '/api/books/ai-suggestions-demo'
       AND created_at > datetime('now', '-3600 seconds')`
    )
    .bind(userId)
    .first();

  if ((count?.count || 0) >= 3) {
    return c.json({
      error: 'Demo is limited to 3 AI recommendation requests. Sign up for unlimited access!',
      code: 'DEMO_AI_LIMIT',
    }, 429);
  }

  // Record this demo AI request (rate_limits requires an id column)
  await db
    .prepare(
      `INSERT INTO rate_limits (id, key, endpoint, created_at)
       VALUES (?, ?, '/api/books/ai-suggestions-demo', datetime('now'))`
    )
    .bind(crypto.randomUUID(), userId)
    .run();
}
```

- [ ] **Step 2: Run existing book tests to check for regressions**

Run: `npx vitest run src/__tests__/ --testNamePattern="ai-suggestions|books"`
Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
git add src/routes/books.js
git commit -m "feat(demo): cap AI recommendations to 3/hour for demo users"
```

---

## Chunk 2: Data Snapshot & Reset

### Task 4: Create the snapshot export script

**Files:**
- Create: `scripts/export-demo-snapshot.js`

One-time script run locally. Queries all Learnalot org data from remote D1 and writes `src/data/demoSnapshot.js`.

- [ ] **Step 1: Identify the Learnalot org ID**

Run: `npx wrangler d1 execute reading-manager-db --remote --command "SELECT id, name, slug FROM organizations WHERE name LIKE '%Learnalot%' AND is_active = 1"`

Note the org ID for use in the script.

- [ ] **Step 2: Write the export script**

Create `scripts/export-demo-snapshot.js`. This script:
- Queries each org-scoped table for the Learnalot org
- Creates a dedicated demo teacher user record (not exported from DB)
- Sets `user_tour_completions` to empty (so tours auto-start)
- Writes output to `src/data/demoSnapshot.js` as a JS module with named exports `DEMO_ORG_ID` and `SNAPSHOT`

Use `child_process.execFileSync` (not `execSync`) to run wrangler commands — avoids shell injection per project conventions:

```js
import { execFileSync } from 'child_process';

function query(sql) {
  const result = JSON.parse(
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'reading-manager-db', '--remote', '--command', sql, '--json'], { encoding: 'utf-8' })
  );
  return result[0]?.results || [];
}
```

Tables to export: `students`, `classes`, `class_assignments`, `reading_sessions`, `student_preferences`, `org_book_selections`, `org_settings`, `term_dates`.

- [ ] **Step 3: Run the export script**

Run: `node scripts/export-demo-snapshot.js`
Expected: `src/data/demoSnapshot.js` created with data. Check file size is under ~500KB. If too large, trim `reading_sessions` to last 3 months.

- [ ] **Step 4: Commit**

```bash
git add scripts/export-demo-snapshot.js src/data/demoSnapshot.js
git commit -m "feat(demo): add snapshot export script and initial Learnalot data"
```

### Task 5: Create the demo reset service

**Files:**
- Create: `src/services/demoReset.js`
- Create: `src/__tests__/unit/demoReset.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/unit/demoReset.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetDemoData } from '../../services/demoReset.js';

vi.mock('../../data/demoSnapshot.js', () => ({
  DEMO_ORG_ID: 'test-org-id',
  SNAPSHOT: {
    students: [{ id: 's1', organization_id: 'test-org-id', name: 'Alice' }],
    classes: [{ id: 'c1', organization_id: 'test-org-id', name: 'Year 3' }],
    class_assignments: [{ student_id: 's1', class_id: 'c1' }],
    reading_sessions: [{ id: 'rs1', organization_id: 'test-org-id', student_id: 's1' }],
    student_preferences: [],
    org_book_selections: [{ organization_id: 'test-org-id', book_id: 'b1' }],
    org_settings: [],
    term_dates: [],
    users: [{ id: 'u1', organization_id: 'test-org-id', name: 'Demo Teacher' }],
    user_tour_completions: [],
    support_tickets: [],
    support_ticket_notes: [],
  },
}));

describe('resetDemoData', () => {
  let db;
  let batchCalls;

  beforeEach(() => {
    batchCalls = [];
    db = {
      prepare: vi.fn((sql) => ({
        bind: vi.fn(() => ({
          run: vi.fn(),
          first: vi.fn(),
          all: vi.fn(() => ({ results: [] })),
        })),
      })),
      batch: vi.fn((stmts) => {
        batchCalls.push(stmts.length);
        return Promise.resolve(stmts.map(() => ({ success: true })));
      }),
    };
  });

  it('calls db.batch for delete and insert phases', async () => {
    await resetDemoData(db);
    expect(db.batch).toHaveBeenCalled();
    expect(batchCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('respects the 100-statement batch limit', async () => {
    await resetDemoData(db);
    for (const count of batchCalls) {
      expect(count).toBeLessThanOrEqual(100);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/demoReset.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the reset service**

Create `src/services/demoReset.js`:

- Imports `DEMO_ORG_ID` and `SNAPSHOT` from `../data/demoSnapshot.js`
- `DELETE_ORDER` array: tables in FK-safe delete order, each with a WHERE clause scoped by `organization_id` (or subquery for child tables like `student_preferences`, `class_assignments`, `support_ticket_notes`, `refresh_tokens`, `password_reset_tokens`, `user_tour_completions`, `rate_limits`)
- `INSERT_ORDER` array: tables in FK-safe insert order (parents first)
- `buildInsert(db, table, row)`: builds a prepared INSERT from row keys/values
- `batchExec(db, statements)`: chunks statements into groups of 100 and calls `db.batch()`
- `resetDemoData(db)`: Phase 1 deletes, Phase 2 inserts. Console logs progress.

Full table list for DELETE_ORDER:
1. `support_ticket_notes` (FK to support_tickets)
2. `support_tickets`
3. `reading_sessions`
4. `student_preferences` (FK to students)
5. `class_assignments` (FK to students)
6. `students`
7. `classes`
8. `org_book_selections`
9. `org_settings`
10. `term_dates`
11. `refresh_tokens` (FK to users, demo only)
12. `password_reset_tokens` (FK to users, demo only)
13. `user_tour_completions` (FK to users)
14. `users` — **critical**: WHERE clause must be `organization_id = ? AND auth_provider = 'demo'`, NOT just `organization_id = ?`, to avoid deleting real admin/teacher accounts in the Learnalot org
15. `audit_log`
16. `rate_limits` (demo user keys)
17. `login_attempts` (demo user entries)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/unit/demoReset.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/demoReset.js src/__tests__/unit/demoReset.test.js
git commit -m "feat(demo): add demo reset service with FK-safe delete/insert"
```

### Task 6: Wire up the hourly cron

**Files:**
- Modify: `wrangler.toml:72-73`
- Modify: `src/worker.js` (scheduled handler, imports)

- [ ] **Step 1: Add the cron expression to wrangler.toml**

In `wrangler.toml`, change the crons line to:

```toml
crons = ["*/1 * * * *", "0 * * * *", "0 2 * * *", "0 3 * * *"]
```

Update the comment above:

```toml
# Cron triggers for scheduled tasks
# Every minute - Background metadata enrichment (exits immediately if no job)
# Every hour (minute 0) - Demo environment data reset
# 2:00 AM UTC - Recalculate all student streaks + GDPR cleanup
# 3:00 AM UTC - Wonde daily delta sync
```

- [ ] **Step 2: Add import and cron handler in worker.js**

Add import near top of `src/worker.js` (with the other service imports):

```js
import { resetDemoData } from './services/demoReset.js';
```

In the `scheduled` handler, add a new block for `0 * * * *` (after the metadata enrichment block, before the closing of the function):

```js
// Demo environment reset — every hour on the hour
if (event.cron === '0 * * * *') {
  try {
    await resetDemoData(db);
    console.log('[Cron] Demo environment reset complete');
  } catch (error) {
    console.error('[Cron] Demo reset failed:', error.message);
  }
}
```

Note: `0 * * * *` also matches at 2am and 3am when the streaks/Wonde crons fire. The demo reset is idempotent so this is fine.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add wrangler.toml src/worker.js
git commit -m "feat(demo): wire up hourly cron for demo data reset"
```

---

## Chunk 3: Frontend — Demo Button & Auth Redirect

### Task 7: Handle demo auth expiry redirect

**Files:**
- Modify: `src/contexts/AuthContext.js:345-356`

When a demo user's token expires, skip the refresh attempt (no refresh cookie exists) and don't show the "Authentication required" error message — the user lands naturally on the landing page.

- [ ] **Step 1: Modify the 401 handler in fetchWithAuth**

In `src/contexts/AuthContext.js`, replace the 401 handling block (around line 345-356):

```js
if (response.status === 401) {
  if (authMode === 'multitenant' && retryCount === 0) {
    if (user?.authProvider !== 'demo') {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return fetchWithAuth(url, options, retryCount + 1);
      }
    }
  }

  clearAuthState();
  if (user?.authProvider !== 'demo') {
    setApiError('Authentication required. Please log in.');
  }
  throw new Error('Unauthorized');
}
```

The `user` state variable is already in the `fetchWithAuth` dependency array.

- [ ] **Step 2: Run auth-related tests**

Run: `npx vitest run src/__tests__/ --testNamePattern="auth|Auth"`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/contexts/AuthContext.js
git commit -m "feat(demo): skip refresh and error message for demo session expiry"
```

### Task 8: Add "Try the demo" button to landing page

**Files:**
- Modify: `src/components/LandingPage.js`

- [ ] **Step 1: Add demo state and handler**

In `src/components/LandingPage.js`, add state near the top of the component:

```js
const [demoLoading, setDemoLoading] = useState(false);

const handleTryDemo = async () => {
  setDemoLoading(true);
  try {
    const response = await fetch('/api/auth/demo', { method: 'POST' });
    if (!response.ok) throw new Error('Demo unavailable');
    const data = await response.json();
    localStorage.setItem('krm_auth_token', data.accessToken);
    localStorage.setItem('krm_user', JSON.stringify(data.user));
    window.location.href = '/';
  } catch {
    setDemoLoading(false);
  }
};
```

Note: Uses the literal localStorage key strings matching `AUTH_STORAGE_KEY = 'krm_auth_token'` and `USER_STORAGE_KEY = 'krm_user'` from `src/contexts/AuthContext.js:16-17`. LandingPage doesn't import AuthContext (renders when unauthenticated).

- [ ] **Step 2: Replace the hero CTA buttons**

In the hero actions div (around line 151), replace the existing buttons:

```jsx
<div className="lp-hero-actions">
  <button
    className="lp-btn lp-btn-primary"
    onClick={handleTryDemo}
    disabled={demoLoading}
  >
    {demoLoading ? 'Loading demo...' : 'Try the demo'}
    {!demoLoading && <ChevronRight />}
  </button>
  <a href="#features" className="lp-btn lp-btn-outline">
    Learn more
  </a>
</div>
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add src/components/LandingPage.js
git commit -m "feat(demo): add 'Try the demo' button to landing page hero"
```

---

## Chunk 4: Integration & Deployment

### Task 9: Set up demo data in production

Manual steps — run these commands before deploying.

- [ ] **Step 1: Get the Learnalot org ID**

Run: `npx wrangler d1 execute reading-manager-db --remote --command "SELECT id, name, slug, subscription_status FROM organizations WHERE name LIKE '%Learnalot%' AND is_active = 1"`

- [ ] **Step 2: Insert the demo teacher user**

Replace `LEARNALOT_ORG_ID` with the actual ID:

Run: `npx wrangler d1 execute reading-manager-db --remote --command "INSERT INTO users (id, organization_id, email, name, role, auth_provider, password_hash, is_active, created_at, updated_at) VALUES ('demo-teacher-001', 'LEARNALOT_ORG_ID', 'demo@tallyreading.uk', 'Demo Teacher', 'teacher', 'demo', '', 1, datetime('now'), datetime('now'))"`

- [ ] **Step 3: Ensure subscription status allows access**

If needed: `UPDATE organizations SET subscription_status = 'active' WHERE id = 'LEARNALOT_ORG_ID'`

- [ ] **Step 4: Verify no Wonde credentials on Learnalot**

Run: `npx wrangler d1 execute reading-manager-db --remote --command "SELECT wonde_school_id, wonde_school_token FROM organizations WHERE id = 'LEARNALOT_ORG_ID'"`

Expected: Both NULL. Clear if not.

### Task 10: Export snapshot and finalize

- [ ] **Step 1: Update org ID in export script and run**

Edit `scripts/export-demo-snapshot.js`, set `DEMO_ORG_ID` to the real value, then run:

Run: `node scripts/export-demo-snapshot.js`

- [ ] **Step 2: Verify snapshot**

Check file size (<500KB), spot-check students/classes/sessions look right, demo teacher user exists in `users` array.

- [ ] **Step 3: Commit**

```bash
git add scripts/export-demo-snapshot.js src/data/demoSnapshot.js
git commit -m "feat(demo): export Learnalot snapshot data"
```

### Task 11: Deploy and verify

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 2: Build and deploy**

Run: `npm run go`
Expected: Deployment succeeds

- [ ] **Step 3: Manual verification checklist**

1. Visit tallyreading.uk → click "Try the demo"
2. Lands on Students page with Learnalot students
3. Onboarding tour auto-starts
4. Home Reading → Quick Entry works, can log a session
5. Stats → data shows
6. Recommendations → AI suggestions load (up to 3 times)
7. Clear localStorage → lands on landing page without error
8. After next hour mark → logged session is gone (data reset)
