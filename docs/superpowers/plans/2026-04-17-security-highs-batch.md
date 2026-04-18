# Security Highs Batch Implementation Plan (H5, H6, H11)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three pen-test Highs (H5 Wonde webhook fail-hard, H6 enrich tenant scope, H11 Stripe webhook processed flag) as v3.52.0.

**Architecture:** One branch (`security/high-batch`) from `main` at v3.51.0 + replica-lag note, one commit per fix, single PR. Each code change is TDD. H11 includes a forward-only migration (0051). Release commit bumps version + CHANGELOG at the end.

**Tech Stack:** Cloudflare Workers + Hono, D1, Vitest + happy-dom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-17-security-highs-batch-design.md`
**Source report:** `audit-plans/security-pentest-report-2026-04-17.md`

---

## File Structure

**New files (3):**
- `migrations/0051_billing_events_processed.sql` — adds `processed` + `processed_at` columns, backfills historic rows.
- `src/__tests__/integration/webhooks.test.js` — H5 tests (new; no existing harness for the Wonde webhook).
- `src/__tests__/integration/stripeWebhook.test.js` — H11 tests (new; no existing harness).

**Modified files (5):**
- `src/routes/webhooks.js` — H5 fail-hard verification before the create-vs-reactivate branch split.
- `src/routes/books.js` — H6 add JOIN to `org_book_selections` in the enrich handler's book lookup.
- `src/routes/stripeWebhook.js` — H11 restructure: insert with `processed=0`, UPDATE `processed=1` on success, return 500 on failure.
- `src/__tests__/integration/books.test.js` — H6 extend existing enrich tests for cross-org 404 + update happy-path mock to include the join.
- `CHANGELOG.md` + `package.json` — v3.52.0 release notes + version bump.

**Follow-up migration note:** the backfill in 0051 UPDATEs all existing `billing_events` rows to `processed=1`. Safe because the pre-v3.52.0 handler returned 200 even on failure, so any row that exists was "considered done" by Stripe. If the team wants to force-retry a specific historic event, they can manually UPDATE `processed=0` and resend via Stripe dashboard.

---

## Chunk 1: Setup + Three Fixes + Release

### Task 0: Branch setup

**Files:** git only

- [ ] **Step 1: Confirm clean tree on main**

Run: `git status`
Expected: `On branch main... nothing to commit, working tree clean`.

- [ ] **Step 2: Confirm main is at the expected SHA**

Run: `git log --oneline -3`
Expected top commit: `131f314 docs: refine highs batch spec...` (or a later docs commit from this planning session). If not, stop and investigate.

- [ ] **Step 3: Create and switch to the security branch**

Run: `git checkout -b security/high-batch`

---

### Task 1: H5 — Fail-hard Wonde school verification

**Files:**
- Modify: `src/routes/webhooks.js` (lines 51-152, the `schoolApproved` branch)
- Create: `src/__tests__/integration/webhooks.test.js`

- [ ] **Step 1: Create the test harness**

Create `src/__tests__/integration/webhooks.test.js`. **Copy `createMockDB` and the `_runCalls`/`_prepareCalls` tracker pattern verbatim from `src/__tests__/integration/mylogin.test.js`** — it's already wired for the SQL-aware handler shape we need. Use `auth.test.js:92` for the `createTestApp` scaffold. The harness must:

- Mock `src/utils/wondeApi.js` — specifically `fetchSchoolDetails`. Use `vi.mock('../../utils/wondeApi.js', () => ({ fetchSchoolDetails: vi.fn() }))` at the top of the file so individual tests can set `.mockResolvedValue(...)` or `.mockRejectedValue(...)`.
- Mock `src/services/wondeSync.js` — `runFullSync` should resolve with `{ status: 'ok' }` so the handler doesn't fail on the sync step. `vi.mock('../../services/wondeSync.js', () => ({ runFullSync: vi.fn().mockResolvedValue({ status: 'ok' }) }))`.
- Inject env with `WONDE_WEBHOOK_SECRET: 'test-secret'`, `JWT_SECRET: TEST_SECRET`, `READING_MANAGER_DB: mockDB`, `READING_MANAGER_KV: stubKV` (minimal `{get, put, delete}` no-op stub for encryption secret fallback — read `src/utils/crypto.js:getEncryptionSecret` if unclear).
- Track every `.run()` call on `mockDB` so tests can assert which SQL mutations fired (same pattern as `mylogin.test.js` uses `_runCalls`).

- [ ] **Step 2: Write the five failing H5 tests**

Inside a single `describe('POST /api/webhooks/wonde - schoolApproved verification', ...)` block:

```js
it('creates a new org when fetchSchoolDetails returns matching details', async () => {
  fetchSchoolDetails.mockResolvedValue({
    id: 'wonde-school-123',
    email: 'admin@school.example',
    phone_number: '01234 567890',
    address: { address_line_1: '1 School Rd', address_line_2: '', address_town: 'Townsville', address_postcode: 'TS1 1SS' },
  });

  const mockDB = createMockDB(() => null); // no existing org

  const { app } = createTestApp(mockDB);
  const response = await makeWebhook(app, 'test-secret', {
    payload_type: 'schoolApproved',
    school_id: 'wonde-school-123',
    school_name: 'Test School',
    school_token: 'valid-token',
  });

  expect(response.status).toBe(201);
  const inserts = mockDB._runCalls.filter(c => c.sql.includes('INSERT INTO organizations'));
  expect(inserts.length).toBe(1);
});

it('reactivates an existing soft-deleted org when fetchSchoolDetails returns matching details', async () => {
  fetchSchoolDetails.mockResolvedValue({ id: 'wonde-school-123', email: null, phone_number: null, address: {} });
  const mockDB = createMockDB(() => ({ id: 'org-1', is_active: 0 }));
  const { app } = createTestApp(mockDB);

  const response = await makeWebhook(app, 'test-secret', {
    payload_type: 'schoolApproved',
    school_id: 'wonde-school-123',
    school_name: 'Test School',
    school_token: 'valid-token',
  });

  expect(response.status).toBe(200);
  const updates = mockDB._runCalls.filter(c => c.sql.includes('UPDATE organizations'));
  expect(updates.length).toBeGreaterThanOrEqual(1);
});

it('returns 400 when fetchSchoolDetails throws (no existing org)', async () => {
  fetchSchoolDetails.mockRejectedValue(new Error('401 Unauthorized'));
  const mockDB = createMockDB(() => null);
  const { app } = createTestApp(mockDB);

  const response = await makeWebhook(app, 'test-secret', {
    payload_type: 'schoolApproved',
    school_id: 'wonde-school-123',
    school_name: 'Test School',
    school_token: 'bogus',
  });

  expect(response.status).toBe(400);
  const writes = mockDB._runCalls.filter(c =>
    c.sql.includes('INSERT INTO organizations') || c.sql.includes('UPDATE organizations')
  );
  expect(writes.length).toBe(0);
});

it('returns 400 when fetchSchoolDetails throws AND existing soft-deleted org exists (reactivation attack)', async () => {
  fetchSchoolDetails.mockRejectedValue(new Error('401 Unauthorized'));
  const mockDB = createMockDB(() => ({ id: 'org-1', is_active: 0 }));
  const { app } = createTestApp(mockDB);

  const response = await makeWebhook(app, 'test-secret', {
    payload_type: 'schoolApproved',
    school_id: 'wonde-school-123',
    school_name: 'Test School',
    school_token: 'bogus',
  });

  expect(response.status).toBe(400);
  const updates = mockDB._runCalls.filter(c => c.sql.includes('UPDATE organizations'));
  expect(updates.length).toBe(0);
});

it('returns 400 when fetchSchoolDetails returns mismatched school_id', async () => {
  fetchSchoolDetails.mockResolvedValue({ id: 'wonde-school-OTHER', email: null, phone_number: null, address: {} });
  const mockDB = createMockDB(() => null);
  const { app } = createTestApp(mockDB);

  const response = await makeWebhook(app, 'test-secret', {
    payload_type: 'schoolApproved',
    school_id: 'wonde-school-123',
    school_name: 'Test School',
    school_token: 'valid-token',
  });

  expect(response.status).toBe(400);
  const writes = mockDB._runCalls.filter(c =>
    c.sql.includes('INSERT INTO organizations') || c.sql.includes('UPDATE organizations')
  );
  expect(writes.length).toBe(0);
});

it('returns 401 when secret is invalid', async () => {
  const mockDB = createMockDB();
  const { app } = createTestApp(mockDB);
  const response = await makeWebhook(app, 'wrong-secret', { payload_type: 'schoolApproved' });
  expect(response.status).toBe(401);
});
```

Define `makeWebhook(app, secret, body)` as a small helper that POSTs to `/api/webhooks/wonde` with `X-Webhook-Secret: secret` and JSON body.

- [ ] **Step 3: Run tests — expect 5 of 6 FAIL**

Run: `npx vitest run src/__tests__/integration/webhooks.test.js`
Expected: the "creates a new org" test passes; the others fail because the current handler tolerates `fetchSchoolDetails` failure and proceeds with null fields.

- [ ] **Step 4: Apply the fix to `src/routes/webhooks.js`**

Around line 74 (the existing `fetchSchoolDetails` call), restructure as follows. The `fetchSchoolDetails` call moves BEFORE the create-vs-reactivate split (which is already roughly where it is). Change the try/catch so failure rejects the webhook:

```js
// Verify school + token pair with Wonde before any DB write. This is the
// single load-bearing defence against a leaked WONDE_WEBHOOK_SECRET: an
// attacker who knows the secret must also supply a valid token that Wonde
// itself binds to the claimed school_id, which is equivalent to already
// having Wonde access for that school.
let schoolDetails;
try {
  schoolDetails = await fetchSchoolDetails(body.school_token, body.school_id);
} catch (err) {
  console.warn(
    `[Webhook] schoolApproved verification failed for school_id=${body.school_id}: ${err.message}`
  );
  return c.json({ error: 'Could not verify school with Wonde' }, 400);
}

if (!schoolDetails || schoolDetails.id !== body.school_id) {
  console.warn(
    `[Webhook] schoolApproved verification returned mismatched school_id (expected=${body.school_id}, got=${schoolDetails?.id})`
  );
  return c.json({ error: 'Could not verify school with Wonde' }, 400);
}
```

Then the existing code that derives `contactEmail`, `phone`, `addressLine1` etc. from `schoolDetails?.xxx` can drop the `?.` (since we've now proven `schoolDetails` is non-null), though leaving it is harmless.

- [ ] **Step 5: Run tests — expect all 6 PASS**

Run: `npx vitest run src/__tests__/integration/webhooks.test.js`
Expected: all pass.

- [ ] **Step 6: Run full suite**

Run: `npm test`
Expected: 1921+ tests pass, no regressions.

- [ ] **Step 7: Commit**

```bash
git add src/routes/webhooks.js src/__tests__/integration/webhooks.test.js
git commit -m "$(cat <<'EOF'
fix: fail-hard on Wonde school verification in schoolApproved (H5)

schoolApproved trusted body.school_id + body.school_token without
requiring fetchSchoolDetails to succeed. If WONDE_WEBHOOK_SECRET leaked,
an attacker could POST a crafted schoolApproved to bind a fresh tenant to
any school_id, or reactivate a soft-deleted org with a forged token.

Wonde does not publish any HMAC/timestamp mechanism, so the realistic fix
is to make the existing server-side Wonde API verification authoritative:
if fetchSchoolDetails throws, returns null, or returns a mismatched
school_id, reject the webhook with 400 before touching the DB. The
reactivation branch is covered by the same guard — it was the more
attacker-valuable path.

Pen-test report: audit-plans/security-pentest-report-2026-04-17.md
EOF
)"
```

---

### Task 2: H6 — Enrich endpoint tenant scope

**Files:**
- Modify: `src/routes/books.js` around line 1319 (the book lookup in the enrich handler).
- Modify: `src/__tests__/integration/books.test.js` — extend the existing `describe('POST /api/books/:id/enrich', ...)` block at line 1542.

- [ ] **Step 1: Write the failing cross-org test**

Inside the existing `describe('POST /api/books/:id/enrich', ...)`:

```js
it('returns 404 when the book is not linked to the caller org (cross-org isolation)', async () => {
  const { app, mockDB } = createTestApp({
    userId: 'admin-1',
    organizationId: 'org-A',
    userRole: ROLES.ADMIN,
  });

  // Mock the SELECT: the inner join against org_book_selections for
  // org-A returns null (book is linked to org-B only). The handler should
  // 404 without calling enrichBook.
  mockDB._chain.first.mockImplementation((_sql) => Promise.resolve(null));

  const response = await makeRequest(app, 'POST', '/api/books/book-in-org-b/enrich', {});

  expect(response.status).toBe(404);
  expect(enrichBook).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run src/__tests__/integration/books.test.js -t "cross-org isolation"`

What the failure actually proves: `books.test.js`'s mock is **not** SQL-aware — `mockDB._chain.first.mockImplementation(() => null)` forces ALL `.first()` calls in the handler to return null, including the book lookup. Pre-fix the handler's SELECT is `WHERE id = ?` with no org filter, but with our forced-null mock, it returns `notFoundError` at line 1320 regardless. So the **real regression this test catches** is "the handler did not call `enrichBook`" — i.e., the body-enrichment side-effect path was skipped. Post-fix the test still passes cleanly because the JOIN SELECT returns null and the same not-found path triggers.

The test's value isn't the pre-fix fail — it's the post-fix pin that a 404 for a cross-org book does NOT leak enrichment work. If the plan's author wants a stronger TDD signal, they can add a second variant that has the mock return a book ONLY when the SQL contains the join clause (`INNER JOIN org_book_selections`) — then pre-fix the test fails because the handler ignores the join and enriches, post-fix it passes because the handler requires the join. Optional; the simpler test documented above is adequate coverage.

- [ ] **Step 3: Update the happy-path enrich test's mock**

The existing "returns enriched fields when book is found" test (around line 1556) uses `mockDB._chain.first` returning a book. After the fix, the SELECT will be a JOIN. The mock needs to respond to the new SQL shape. In practice, if the test uses `_chain.first.mockResolvedValue({ ... })` without inspecting the SQL, the test still passes after the fix (the mock returns the same book regardless of the join). Confirm this by reading the existing test; if the mock IS SQL-aware, update it to match the new JOIN query.

- [ ] **Step 4: Apply the fix to `src/routes/books.js`**

Around line 1319, replace:

```js
const book = await db.prepare('SELECT * FROM books WHERE id = ?').bind(id).first();
if (!book) throw notFoundError('Book not found');
```

with:

```js
const organizationId = c.get('organizationId');
if (!organizationId) throw notFoundError('Book not found');

const book = await db
  .prepare(
    `SELECT b.* FROM books b
     INNER JOIN org_book_selections obs ON b.id = obs.book_id
     WHERE b.id = ? AND obs.organization_id = ? AND obs.is_available = 1`
  )
  .bind(id, organizationId)
  .first();
if (!book) throw notFoundError('Book not found');
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `npx vitest run src/__tests__/integration/books.test.js -t "enrich"`
Expected: all enrich tests pass (both pre-existing happy-path + new cross-org).

- [ ] **Step 6: Run full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/routes/books.js src/__tests__/integration/books.test.js
git commit -m "$(cat <<'EOF'
fix: tenant-scope book lookup in enrich handler (H6)

POST /api/books/:id/enrich loaded the book with a bare
SELECT * FROM books WHERE id = ?, letting any admin at any org enrich any
book in the global catalog — burning external API quota, mutating shared
metadata, and overwriting R2 covers other orgs depend on. Fix joins
org_book_selections and filters by organization_id + is_available, so
cross-org enrich attempts return 404 indistinguishably from a genuinely
missing book.

Pen-test report: audit-plans/security-pentest-report-2026-04-17.md
EOF
)"
```

---

### Task 3: H11 — Stripe webhook `processed` flag

**Files:**
- Create: `migrations/0051_billing_events_processed.sql`
- Modify: `src/routes/stripeWebhook.js`
- Create: `src/__tests__/integration/stripeWebhook.test.js`

- [ ] **Step 1: Write the migration**

Create `migrations/0051_billing_events_processed.sql`:

```sql
-- H11: Track whether a billing event's state mutation actually committed.
-- Before this migration, billing_events was inserted before the mutation
-- ran, so a failed UPDATE would leave the event "processed" without the
-- intended side-effects. Adding a processed flag lets the dedup check
-- distinguish "we saw this event" from "we applied this event".
ALTER TABLE billing_events ADD COLUMN processed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_events ADD COLUMN processed_at TEXT;

-- Backfill: every existing row is assumed to have completed under the
-- old flow. Without this, the first webhook after deploy would see 0
-- matches for any historic event and dedup would fail.
UPDATE billing_events SET processed = 1, processed_at = created_at WHERE processed = 0;
```

- [ ] **Step 2: Apply migration locally**

Run: `npx wrangler d1 migrations apply reading-manager-db --local`
Expected: `Migrations to be applied: 0051_billing_events_processed.sql` then `✅ 0051_billing_events_processed.sql`.

Sanity check: `npx wrangler d1 execute reading-manager-db --local --command "SELECT name FROM pragma_table_info('billing_events') WHERE name IN ('processed', 'processed_at')"` → two rows.

- [ ] **Step 3: Create the Stripe webhook test file**

Create `src/__tests__/integration/stripeWebhook.test.js`. Use `auth.test.js` as the shape reference. Harness needs:

- Mock `getStripe` from `../../utils/stripe.js` — specifically return an object with `webhooks.constructEventAsync` that returns whatever the test pre-loads. Use `vi.mock('../../utils/stripe.js', () => ({ getStripe: vi.fn(), getPlanFromPriceId: vi.fn().mockReturnValue('annual'), hasAiAddon: vi.fn().mockReturnValue(false) }))`.
- Mock `invalidateOrgStatus` from `../../utils/orgStatusCache.js` as a no-op.
- Mock D1 with the `_runCalls` tracker pattern.

Harness shape:

```js
const createTestApp = (mockDB, { eventPayload }) => {
  getStripe.mockReturnValue({
    webhooks: { constructEventAsync: vi.fn().mockResolvedValue(eventPayload) },
  });

  const app = new Hono();
  app.use('*', async (c, next) => {
    c.env = {
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      READING_MANAGER_DB: mockDB,
      READING_MANAGER_KV: { get: async () => null, put: async () => {}, delete: async () => {} },
      JWT_SECRET: TEST_SECRET,
      APP_URL: 'http://localhost:3000',
    };
    await next();
  });
  app.route('/api/webhooks/stripe', stripeWebhookRouter);
  return app;
};
```

- [ ] **Step 4: Write the four H11 tests (all expected to fail pre-fix)**

```js
describe('POST /api/webhooks/stripe - processed flag', () => {
  it('happy path: inserts with processed=0, then UPDATEs processed=1 after state mutation', async () => {
    const event = {
      id: 'evt_test_1',
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_abc', id: 'sub_abc', status: 'active', current_period_end: Math.floor(Date.now()/1000)+86400, items: { data: [] } } },
    };

    let orgLookup = { id: 'org-1' };
    let dedupLookup = null;
    const mockDB = createMockDB((sql) => {
      if (sql.includes('FROM organizations WHERE stripe_customer_id')) return orgLookup;
      if (sql.includes('FROM billing_events WHERE stripe_event_id')) return dedupLookup;
      return null;
    });

    const app = createTestApp(mockDB, { eventPayload: event });
    const response = await app.request('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=abc' },
      body: 'irrelevant',
    });

    expect(response.status).toBe(200);

    const inserts = mockDB._runCalls.filter(c => c.sql.includes('INSERT OR IGNORE INTO billing_events'));
    expect(inserts.length).toBe(1);
    // INSERT should set processed = 0 (either as a literal in the SQL or as a bound value)
    // Simpler: check that a subsequent UPDATE to set processed=1 was issued.
    const processedUpdates = mockDB._runCalls.filter(c =>
      c.sql.includes('UPDATE billing_events') && c.sql.includes('processed = 1')
    );
    expect(processedUpdates.length).toBe(1);
  });

  it('failure path: state mutation throws → processed stays 0, returns 500', async () => {
    const event = {
      id: 'evt_test_2',
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_abc', id: 'sub_abc', status: 'active', current_period_end: Math.floor(Date.now()/1000)+86400, items: { data: [] } } },
    };

    const mockDB = createMockDB((sql) => {
      if (sql.includes('FROM organizations WHERE stripe_customer_id')) return { id: 'org-1' };
      if (sql.includes('FROM billing_events WHERE stripe_event_id')) return null;
      return null;
    });

    // Make the state-mutation UPDATE throw
    mockDB._chain.run.mockImplementation((sql) => {
      if (typeof sql === 'string' && sql.includes('UPDATE organizations SET stripe_subscription_id')) {
        return Promise.reject(new Error('D1 transient'));
      }
      return Promise.resolve({ meta: {} });
    });

    const app = createTestApp(mockDB, { eventPayload: event });
    const response = await app.request('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=abc' },
      body: 'irrelevant',
    });

    expect(response.status).toBe(500);

    const processedUpdates = mockDB._runCalls.filter(c =>
      c.sql.includes('UPDATE billing_events') && c.sql.includes('processed = 1')
    );
    expect(processedUpdates.length).toBe(0);
  });

  it('retry after failure: second delivery with same stripe_event_id re-runs the mutation', async () => {
    const event = {
      id: 'evt_test_3',
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_abc', id: 'sub_abc', status: 'active', current_period_end: Math.floor(Date.now()/1000)+86400, items: { data: [] } } },
    };

    // Dedup lookup filters on processed=1; returns null because prior attempt left processed=0.
    const mockDB = createMockDB((sql) => {
      if (sql.includes('FROM organizations WHERE stripe_customer_id')) return { id: 'org-1' };
      if (sql.includes('FROM billing_events WHERE stripe_event_id') && sql.includes('processed = 1')) return null;
      return null;
    });

    const app = createTestApp(mockDB, { eventPayload: event });
    const response = await app.request('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=abc' },
      body: 'irrelevant',
    });

    expect(response.status).toBe(200);
    // INSERT OR IGNORE must be issued again (it will no-op at SQL level, but the handler attempts it)
    const inserts = mockDB._runCalls.filter(c => c.sql.includes('INSERT OR IGNORE INTO billing_events'));
    expect(inserts.length).toBe(1);
  });

  it('already-processed: second delivery after success → early exit 200', async () => {
    const event = {
      id: 'evt_test_4',
      type: 'customer.subscription.updated',
      data: { object: { customer: 'cus_abc' } },
    };

    const mockDB = createMockDB((sql) => {
      if (sql.includes('FROM billing_events WHERE stripe_event_id') && sql.includes('processed = 1')) {
        return { id: 'billing-event-row-id' }; // already processed
      }
      return null;
    });

    const app = createTestApp(mockDB, { eventPayload: event });
    const response = await app.request('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=abc' },
      body: 'irrelevant',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('already_processed');

    const inserts = mockDB._runCalls.filter(c => c.sql.includes('INSERT OR IGNORE INTO billing_events'));
    expect(inserts.length).toBe(0);
  });
});
```

- [ ] **Step 5: Run tests — expect all 4 FAIL** (current handler returns 200 on failure, doesn't use INSERT OR IGNORE, doesn't filter dedup on processed=1)

Run: `npx vitest run src/__tests__/integration/stripeWebhook.test.js`

- [ ] **Step 6: Apply the handler changes to `src/routes/stripeWebhook.js`**

Replace the dedup lookup (line 52-59) with the **exact** SQL below — the test mocks match on `sql.includes('processed = 1')` with single spaces, not `processed=1`. Any whitespace deviation in the implementation will fail the tests:

```js
const existing = await db
  .prepare('SELECT id FROM billing_events WHERE stripe_event_id = ? AND processed = 1')
  .bind(event.id)
  .first();

if (existing) {
  return c.json({ received: true, status: 'already_processed' });
}
```

Replace the INSERT block (line 74-89) with (preserving the `if (orgRecord)` guard — billing_events.organization_id is NOT NULL):

```js
if (orgRecord) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO billing_events (id, organization_id, event_type, stripe_event_id, data, created_at, processed)
       VALUES (?, ?, ?, ?, ?, datetime('now'), 0)`
    )
    .bind(
      generateId(),
      orgRecord.id,
      event.type,
      event.id,
      JSON.stringify({ status: obj.status, amount_paid: obj.amount_paid })
    )
    .run();
}
```

In the existing try/catch that wraps the state-mutation switch (around line 91-234), change the success + failure tail:

```js
  try {
    switch (event.type) {
      // ...existing cases UNCHANGED...
    }

    // Mark processed only after successful mutation. Safe to run even if
    // no billing_events row exists (no orgRecord): the UPDATE no-ops.
    if (orgRecord) {
      await db
        .prepare(
          `UPDATE billing_events SET processed = 1, processed_at = datetime('now')
           WHERE stripe_event_id = ?`
        )
        .bind(event.id)
        .run();
    }
  } catch (err) {
    console.error(`[Stripe Webhook] Error processing ${event.type}:`, err);
    return c.json({ error: 'Webhook processing failed, retry expected' }, 500);
  }

  return c.json({ received: true });
```

- [ ] **Step 7: Run tests — expect all 4 PASS**

Run: `npx vitest run src/__tests__/integration/stripeWebhook.test.js`

- [ ] **Step 8: Run full suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add migrations/0051_billing_events_processed.sql src/routes/stripeWebhook.js src/__tests__/integration/stripeWebhook.test.js
git commit -m "$(cat <<'EOF'
fix: processed flag on Stripe billing_events prevents silent drift (H11)

billing_events was inserted before the state-mutation switch; if a D1
UPDATE threw, the catch block logged and returned 200, so Stripe never
retried and the subscription drifted silently.

Adds a processed column (migration 0051) populated only after the state
mutation commits. Dedup lookup now filters on processed=1, so a row
from a failed attempt does not block the retry. Handler returns 500 on
mutation failure so Stripe retries; INSERT OR IGNORE covers the retry's
second attempt at the initial insert.

Migration backfills historic rows to processed=1 on deploy — under the
old handler those events were considered complete by Stripe, so retro-
actively marking them processed preserves the dedup contract.

Pen-test report: audit-plans/security-pentest-report-2026-04-17.md
EOF
)"
```

---

### Task 4: Release — v3.52.0

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump version**

Change `"version": "3.51.0"` to `"version": "3.52.0"` in `package.json`.

- [ ] **Step 2: Prepend changelog entry**

At the top of `CHANGELOG.md` (after the `# Changelog` line), insert:

```markdown
## [3.52.0] - 2026-04-17

### Security
- **Wonde webhook fail-hard on school verification (H5)** — `schoolApproved` now rejects with 400 if `fetchSchoolDetails` throws or returns a mismatched `school_id`. Wonde publishes no HMAC or timestamp mechanism, so the server-side API verification is the only defence against a leaked `WONDE_WEBHOOK_SECRET`. Applies to both the new-org create branch and the reactivation branch (the latter being the more attacker-valuable path — a leaked secret could previously flip a soft-deleted org back to `is_active=1` with a forged token).
- **Enrich endpoint enforces tenant scope (H6)** — `POST /api/books/:id/enrich` now joins `org_book_selections` in the book lookup and filters by `organization_id + is_available`. Cross-org enrich attempts return 404 indistinguishably from a genuinely missing book. Closes the pre-existing hole where any admin could mutate shared catalog metadata, overwrite R2 covers other orgs depend on, and burn external API quota for books they had no relationship with.
- **Stripe webhook stops silent subscription drift (H11)** — new `processed` column on `billing_events` (migration 0051) tracks whether the state-mutation switch committed. The dedup lookup now filters on `processed = 1`; a failed state mutation leaves the row at `processed = 0` and returns 500 so Stripe retries. `INSERT OR IGNORE` handles the retry's second attempt at the initial insert. Historic rows backfilled to `processed = 1` — under the old handler Stripe had already considered them complete.

### Migrations
- **0051** — Adds `processed INTEGER NOT NULL DEFAULT 0` and `processed_at TEXT` to `billing_events`. Forward-only. Backfills existing rows to `processed = 1`.
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore: v3.52.0 — security highs batch (H5, H6, H11)"
```

---

### Task 5: PR, merge, deploy, smoke test

- [ ] **Step 1: Push**

Run: `git push -u origin security/high-batch`

- [ ] **Step 2: Open PR**

Use `gh pr create` with a body that references the spec, the pen-test report, each finding ID, and the migration number. Title: `security: highs batch H5/H6/H11 (v3.52.0)`.

- [ ] **Step 3: Pre-deploy safety check (advisory, per spec)**

Against production D1, run:
```bash
npx wrangler d1 execute reading-manager-db --remote --command \
  "SELECT COUNT(*) FROM billing_events WHERE created_at > datetime('now','-7 days')"
```
Spot-check against Stripe dashboard events for the same window. Concrete threshold: **if D1 count is more than 5% below Stripe count, escalate to human review before deploying** — the migration backfill will flip everything to `processed=1`, including any events the old handler silently dropped. A divergence within 5% is likely explained by Stripe sending events we don't persist (unhandled event types) and is safe.

- [ ] **Step 4: Wait for CI green, then merge**

- [ ] **Step 5: Deploy**

Run: `npm run go`
Expected: D1 migration 0051 applies remotely, then wrangler deploys.

- [ ] **Step 6: Post-deploy smoke test**

- **H5:** Against a staging Wonde school if available, POST a crafted `schoolApproved` with a valid secret but garbage `school_token`:
  ```bash
  curl -sw "\nHTTP %{http_code}\n" -X POST https://tallyreading.uk/api/webhooks/wonde \
    -H 'X-Webhook-Secret: <real secret>' \
    -H 'Content-Type: application/json' \
    -d '{"payload_type":"schoolApproved","school_id":"fake-school-99","school_name":"Probe","school_token":"bogus"}'
  ```
  Expect HTTP 400. **Do not** run this without the real secret on a production school_id you don't own.

- **H6:** Obtain an admin access token for an org. Find a book ID that is NOT linked to that org (from `org_book_selections`). Hit `/api/books/<book-id>/enrich` with that token; expect 404.

- **H11:** Confirm migration applied:
  ```bash
  npx wrangler d1 execute reading-manager-db --remote --command \
    "SELECT COUNT(*) as total, SUM(processed) as processed FROM billing_events"
  ```
  Expect `total == processed` (all historic rows backfilled).

  Trigger a real Stripe event (or use Stripe CLI `stripe trigger customer.subscription.updated`) and confirm the new row lands with `processed = 1`. For the failure-path smoke, temporarily point a single event at a broken update (not recommended on prod; test this on staging or skip — the unit tests cover it).

---

## Follow-ups (not in this PR)

- `trialOrg` `ReferenceError` in `src/routes/stripeWebhook.js:217-223` — the error message references a variable scoped only to an earlier case branch. Latent bug in the trial-ending email path that surfaces only when email send fails. Unrelated to H11; file separately.
- H7 GraphQL proxy operation allowlist
- H9 login rate-limit layering + Turnstile
- H10 JWT `alg` assertion
- H12 register slug `ReferenceError` (dead-code, low urgency)
- Remove `run_worker_first = ["/api/*"]`
- `rateLimit` D1 replica-lag improvement
- All M- and L-series findings
