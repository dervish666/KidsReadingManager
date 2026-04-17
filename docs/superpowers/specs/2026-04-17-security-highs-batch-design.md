# Security Highs Batch — Design (H5, H6, H11)

**Date:** 2026-04-17
**Source report:** `audit-plans/security-pentest-report-2026-04-17.md`
**Scope:** Three Highs that represent real exploit paths — Wonde webhook trust, enrich endpoint tenant scope, Stripe webhook error-retry. Everything else in the pen-test report (H7, H9, H10, H12, all Ms, Ls) deferred.
**Target version:** v3.52.0
**Branch:** `security/high-batch` from `main` at v3.51.0 + the replica-lag note commit.

---

## Context

v3.51.0 shipped the four Criticals plus H8. This round closes the three Highs where the fix is self-contained and the risk is real: a leaked Wonde secret creating tenants bound to any school_id (H5); any admin mutating the shared book catalog across org boundaries (H6); Stripe subscription state drifting silently after a D1 write failure (H11).

Scope was deliberately tightened from the pen-test's "This week" list to exclude:
- **H7** Hardcover GraphQL proxy guard — upstream validation catches the bypass today; defense-in-depth only.
- **H9** Login rate-limit layering / Turnstile — larger design, depends on a product decision about Turnstile, separate PR.
- **H10** JWT `alg` assertion — latent risk, not currently exploitable.
- **H12** Register slug `ReferenceError` — dead-code path since C1 disabled registration.

---

## Fix-by-fix design

### H5 — Fail-hard Wonde school verification

**Problem:** `src/routes/webhooks.js:51-152` — the `schoolApproved` handler trusts the body's `school_id` and `school_token` without server-side verification. It calls `fetchSchoolDetails` at line 74 but catches failure and proceeds to create the org anyway (line 76-80). If `WONDE_WEBHOOK_SECRET` leaks (logs, env snapshot, ops handoff), an attacker POSTs a crafted `schoolApproved` payload and gets a fresh tenant bound to any `wonde_school_id` they choose.

**Root cause reframing:** the pen-test recommends HMAC signatures. Wonde's published documentation (`https://docs.wonde.com/docs/api/sync/`) does not describe any webhook signing mechanism — shared secret via query string or header is what the platform offers. So the realistic fix is to make the existing server-side verification authoritative rather than advisory.

**Fix:**
- In the `schoolApproved` branch of `src/routes/webhooks.js`, restructure the `fetchSchoolDetails` call:
  - If it throws OR returns null OR the returned `school_id` does not match the body's `school_id` → respond `400` with `{ error: 'Could not verify school with Wonde' }`, do **not** create or update the organization.
  - If it succeeds and matches → proceed as today.
- The existing "create with null contact fields" fallback path is deleted. For a leaked-secret attack, the attacker must also supply a valid `school_token` paired with the claimed `school_id` — which is equivalent to already having Wonde access, so nothing new is compromised.
- Other payload types (`accessRevoked`, `accessDeclined`, `schoolMigration`) unchanged — they operate on existing orgs via `wonde_school_id` lookup, so they don't create new trust surface.

**Tests (new file `src/__tests__/integration/webhooks.test.js`):**
- Valid secret + `fetchSchoolDetails` returns matching school details → org created (`201`).
- Valid secret + `fetchSchoolDetails` throws → `400`, no org `INSERT` issued.
- Valid secret + `fetchSchoolDetails` returns details with mismatched `school_id` → `400`, no org `INSERT`.
- Invalid secret → `401` (existing behaviour, regression guard).

**Rollout:** No migration. Env var already in place. Pure handler logic change.

### H6 — Enrich endpoint tenant scope

**Problem:** `src/routes/books.js:1319` — `POST /api/books/:id/enrich` loads the target book with `SELECT * FROM books WHERE id = ?` and no tenant check. Any admin at any org can enrich any book in the global catalog, burning external API quota, overwriting R2 covers other orgs depend on, and mutating shared metadata.

**Fix:**
- Change the book lookup to join `org_book_selections`:
  ```js
  const book = await db
    .prepare(
      `SELECT b.* FROM books b
       INNER JOIN org_book_selections obs ON b.id = obs.book_id
       WHERE b.id = ? AND obs.organization_id = ? AND obs.is_available = 1`
    )
    .bind(id, organizationId)
    .first();
  ```
- Bind `organizationId` from `c.get('organizationId')`.
- Response when the book isn't selected by the caller's org: reuse the existing `notFoundError('Book not found')` — indistinguishable from a genuinely missing book, so no tenant leak via timing or error shape.

**Tests (extend `src/__tests__/integration/books.test.js`):**
- Admin at org A enriches a book only in org B → `404`, no external API calls made, no R2 write.
- Admin at org A enriches a book selected by org A → `200`, enrichment runs as today.
- Regression: existing enrich happy-path test stays green (update its mock to include the join).

**Rollout:** No migration. Pure query change. Deployment risk: low — any org that had a book genuinely available will still see it.

### H11 — Stripe webhook `processed` flag

**Problem:** `src/routes/stripeWebhook.js:74-89, 230-234` — the webhook inserts into `billing_events` **before** the state-mutation switch. If the subsequent `UPDATE organizations SET subscription_status = ...` throws, the outer catch logs and returns 200 (line 233). The billing_events row persists with no indication the state wasn't applied, the dedup check on the next retry matches, and the subscription drifts silently.

**Fix:**

**Migration** (`migrations/0051_billing_events_processed.sql`):

```sql
-- H11: Track whether a billing event's state mutation actually committed.
-- Before this migration, billing_events was inserted before the mutation ran,
-- so a failed UPDATE would leave the event "processed" without the intended
-- side-effects. Adding a processed flag lets the dedup check distinguish
-- "we saw this event" from "we applied this event".
ALTER TABLE billing_events ADD COLUMN processed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE billing_events ADD COLUMN processed_at TEXT;

-- Backfill: every existing row is assumed to have completed under the old
-- flow. Without this, the first webhook after deploy would see 0 matches
-- for any historic event and would re-process from scratch on retry.
UPDATE billing_events SET processed = 1, processed_at = created_at WHERE processed = 0;

-- New dedup index covers (stripe_event_id, processed) lookups.
CREATE INDEX IF NOT EXISTS idx_billing_events_stripe_event_processed
  ON billing_events(stripe_event_id, processed);
```

**Handler changes** (`src/routes/stripeWebhook.js`):

1. Signature verification — unchanged.
2. Dedup check — filter on `processed = 1`:
   ```js
   const existing = await db
     .prepare('SELECT id FROM billing_events WHERE stripe_event_id = ? AND processed = 1')
     .bind(event.id)
     .first();
   if (existing) return c.json({ received: true, status: 'already_processed' });
   ```
3. Record the event with `INSERT OR IGNORE` (a previous failed attempt might have inserted a `processed=0` row already):
   ```js
   const eventRowId = generateId();
   await db
     .prepare(
       `INSERT OR IGNORE INTO billing_events (id, organization_id, event_type, stripe_event_id, data, created_at, processed)
        VALUES (?, ?, ?, ?, ?, datetime('now'), 0)`
     )
     .bind(eventRowId, orgRecord?.id || null, event.type, event.id, JSON.stringify({...}))
     .run();
   ```
4. Run the state mutation switch inside `try`.
5. **On success:**
   ```js
   await db
     .prepare(
       `UPDATE billing_events SET processed = 1, processed_at = datetime('now') WHERE stripe_event_id = ?`
     )
     .bind(event.id)
     .run();
   return c.json({ received: true });
   ```
6. **On failure:** log, return `500` so Stripe retries:
   ```js
   } catch (err) {
     console.error(`[Stripe Webhook] Error processing ${event.type}:`, err);
     return c.json({ error: 'Webhook processing failed, retry expected' }, 500);
   }
   ```

**Tests (extend `src/__tests__/integration/stripeWebhook.test.js` if it exists, else create):**
- Happy path: new event → row inserted with `processed=0` → UPDATE mutation succeeds → `processed=1` UPDATE fires → `200`.
- Failure path: state UPDATE throws → row stays at `processed=0` → handler returns `500`, message body indicates retry expected.
- Retry after failure: second delivery of same `stripe_event_id` → dedup `WHERE processed = 1` returns none → `INSERT OR IGNORE` no-ops → state mutation retried → on second success, `processed=1`.
- Already-processed: second delivery after success → dedup matches → early exit `200` with `status: 'already_processed'`.

**Rollout risk:** The migration backfills all existing rows to `processed=1`. New retries from Stripe on events that were previously "silently swallowed" will not re-process — because those old rows are now marked processed. If the team wants to force-retry specific historic events, they can manually `UPDATE billing_events SET processed = 0 WHERE stripe_event_id IN (...)` and Stripe's resend feature will re-trigger them.

## Non-goals

- Any H-series finding not in {H5, H6, H11}.
- Any M- or L-series finding.
- Fixing the `rateLimit` D1 replica-lag issue (separate follow-up).
- Adding Wonde HMAC — not supported by Wonde.
- Turnstile integration.
- Removing `run_worker_first = ["/api/*"]` (required for the eventual full header rollout but larger refactor).

## Deployment & verification

- PR to `main` after all three fixes land green on CI.
- Deploy via `npm run go` — will apply migration 0051 before deploy.
- Post-deploy smoke:
  - **H5:** craft a `schoolApproved` POST with a valid secret but bogus `school_token` → expect `400` (verification failure). Do this on a staging Wonde school to avoid accidental prod org creation.
  - **H6:** `curl -X POST https://tallyreading.uk/api/books/<book-not-in-my-org>/enrich -H 'Authorization: Bearer <admin-token>'` → expect `404`.
  - **H11:** Stripe CLI or webhook test event → confirm `billing_events.processed = 1` after success in D1. Forced-failure simulation (e.g. temporarily break the UPDATE via a non-existent column) → confirm 500 return and `processed = 0`.
- Rollback: revert the PR and redeploy. Migration cannot be dropped (D1 has no DDL rollback), but `processed` column is ignorable by the pre-v3.52.0 handler — safe to leave in place.

## Follow-ups (still open after this PR)

- H7 GraphQL operation allowlist
- H9 Login rate-limit layering + Turnstile (product decision required)
- H10 JWT `alg` assertion
- H12 Register slug `ReferenceError` cleanup (low urgency)
- Remove `run_worker_first = ["/api/*"]`
- `rateLimit` D1 replica-lag (new finding from v3.51.0 smoke test)
- All M- and L-series
