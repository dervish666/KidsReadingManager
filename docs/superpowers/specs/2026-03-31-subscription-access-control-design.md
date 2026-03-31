# Subscription Access Control (Phase 7)

## Context

Stripe billing is live since v3.25.0. The webhook handler syncs `subscription_status` on the `organizations` table (`trialing`, `active`, `past_due`, `cancelled`). Schools without billing have `NULL` or `none`. However, no middleware actually enforces access based on this status — a cancelled school has identical access to an active one. The `BillingBanner` component shows warnings, but they're purely cosmetic.

## Goals

1. Schools with `past_due` subscriptions get read-only access (GET allowed, writes blocked).
2. Schools with `cancelled` subscriptions are fully blocked from the app.
3. Billing routes remain open so schools can fix payment or reactivate.
4. Owner role is always exempt — full access regardless of subscription status, including when switching into a cancelled org via `X-Organization-Id`. This is intentional: the owner needs to manage school data for support purposes.
5. Schools without billing (`NULL`/`none`) and schools with `trialing`/`active` status are unaffected.

## Non-Goals

- No separate grace-period timer. Stripe drives the `past_due` → `cancelled` lifecycle via its dunning configuration.
- No gating of `none` status. New schools (post-Wonde onboarding, pre-trial) get full access.
- No AI add-on gating in this phase (separate TODO).

## Design

### Backend: `subscriptionGate()` middleware

A new middleware function in `src/middleware/tenant.js`.

**Placement in `worker.js`**: After the tenant middleware block (which already verifies the org exists and is active). This ensures `organizationId` and `userRole` are available in context.

**Data access**: `tenantMiddleware()` already queries the `organizations` table to check `is_active`. We extend that query to also `SELECT subscription_status`, and stash it on the Hono context via `c.set('subscriptionStatus', ...)`. The gate middleware reads it from context — no additional DB query.

**Decision flow** — uses an allowlist for permitted statuses, so any unmapped Stripe status (e.g. `canceled`, `unpaid`, `incomplete_expired`, `paused`) defaults to blocked:

```
subscriptionGate():
  1. Skip if owner role
  2. Skip if exempt path (see list below)
  3. Read subscriptionStatus from context
  4. If in allowed set [NULL, 'none', 'trialing', 'active'] → pass
  5. If 'past_due' and method is GET or HEAD → pass
  6. If 'past_due' and any other method (POST/PUT/PATCH/DELETE) → 403
  7. Everything else (cancelled, unknown) → 403
```

**Exempt paths** — a dedicated list separate from `PUBLIC_PATHS` (which controls JWT auth bypass). The subscription gate's exempt list covers routes that must remain accessible for billing recovery and authentication:

- `/api/auth/*` — login, refresh, logout, SSO
- `/api/billing/*` — status check, portal access, setup, plan change
- `/api/support` (POST only) — so cancelled/past-due schools can submit support tickets
- `/api/billing/subscription-status` — lightweight status check for all roles (see below)

Routes that are already public (no JWT required) never reach the subscription gate, so they don't need listing here: `/api/covers/*`, `/api/webhooks/*`, `/api/health`, `/api/signup`.

**Error responses**:

```json
// past_due, write attempt
{
  "error": "Your subscription payment is overdue. The app is in read-only mode until payment is resolved.",
  "code": "SUBSCRIPTION_PAST_DUE"
}

// cancelled or unknown status
{
  "error": "Your subscription has been cancelled. Please contact support or reactivate via the billing portal.",
  "code": "SUBSCRIPTION_CANCELLED"
}
```

Both return HTTP 403. The `code` field lets the frontend distinguish subscription issues from permission issues.

### Frontend: Intercept and display

**Proactive subscription status check**:

Add a lightweight `GET /api/billing/subscription-status` endpoint (under the `/api/billing/*` exempt prefix, requires only authentication — no role restriction). Returns `{ status: 'active' | 'past_due' | 'cancelled' | 'none' | 'trialing' }`. Called once on auth load for all roles, so the frontend knows the subscription state before any writes are attempted. This replaces the reactive-only approach of discovering blocks via failed requests.

The existing `GET /api/billing/status` endpoint stays as-is (admin-only, returns full billing details). The new endpoint is minimal — just the gate-relevant status.

**`fetchWithAuth` in `AuthContext.js`**:

When a 403 response contains a JSON body with `code` equal to `SUBSCRIPTION_PAST_DUE` or `SUBSCRIPTION_CANCELLED`, update `subscriptionBlock` state. This is the fallback mechanism — the proactive check should catch most cases, but this handles race conditions and status changes mid-session.

**Cancelled: `SubscriptionBlockedScreen` component**:

A new full-screen component rendered in `App.js` when `subscriptionBlock === 'cancelled'`. Replaces the entire app UI (similar to how the login screen gates unauthenticated users).

Content varies by role:

- **Admin users**: Tally Reading logo, "Subscription Cancelled" heading, brief message, "Manage Billing" button (opens Stripe portal via `POST /api/billing/portal`), "Contact Support" link, "Log Out" button.
- **Teacher/readonly users**: Tally Reading logo, "Subscription Cancelled" heading, message asking them to contact their school administrator, "Contact Support" link, "Log Out" button. No billing portal button (they lack admin permission to use it).

Styled warmly per the design system — cream background, sage accents, not a harsh error page.

**Past Due: read-only mode**:

- The existing `BillingBanner` already shows a warning for `past_due`. No change needed there.
- Expose `isReadOnly` from AuthContext (derived from `subscriptionBlock === 'past_due'`).
- Components that perform writes should check `isReadOnly` and disable save/submit buttons. Rather than auditing every component now, the primary guard is the API — if a write is attempted, it returns 403 and `fetchWithAuth` can show a toast/snackbar explaining why.
- Add a global handler: when `fetchWithAuth` receives a `SUBSCRIPTION_PAST_DUE` code, show a snackbar: "Your account is in read-only mode — payment is overdue."

This means even if a button isn't disabled, the write fails gracefully with a clear message. Individual button disabling can be added incrementally.

**Data portability for cancelled schools**: Cancelled schools are fully blocked from the app UI. If a school needs their data exported (GDPR Article 20), the owner handles it on their behalf — the owner is exempt from the gate and can access any org's data. The `SubscriptionBlockedScreen` "Contact Support" link directs schools to request data exports. No self-serve export endpoint is needed in this phase.

### Changes to existing code

**`src/middleware/tenant.js`**:
- `tenantMiddleware()`: extend the org query from `SELECT id, is_active` to `SELECT id, is_active, subscription_status`. Set `c.set('subscriptionStatus', org.subscription_status || 'none')`.
- Add `subscriptionGate()` export.

**`src/worker.js`**:
- Import `subscriptionGate` from tenant middleware.
- Add a new `app.use('/api/*', ...)` block after the tenant middleware block that calls `subscriptionGate()`, with the exempt-path skip logic.

**New endpoint: `GET /api/billing/subscription-status`**:
- Returns `{ status }` for the authenticated user's org. No role restriction. Exempt from subscription gate (covered by `/api/billing/*` prefix).
- Lives in `src/routes/billing.js`.

**Stripe status normalization**: The existing webhook handler writes `obj.status` directly from Stripe (American spelling `canceled`) for `subscription.updated`, but hard-codes `'cancelled'` (British spelling) for `subscription.deleted`. Normalize the webhook handler to always write `'cancelled'` for consistency. The allowlist approach already handles both spellings safely, but normalization prevents confusion in direct DB queries and admin tooling.

**`src/contexts/AuthContext.js`**:
- Add `subscriptionBlock` state (`null`, `'past_due'`, `'cancelled'`).
- Add `isReadOnly` derived value.
- Fetch `GET /api/billing/subscription-status` on auth load (all roles).
- In `fetchWithAuth`, detect 403 + subscription codes and update state (fallback).
- Expose `subscriptionBlock` and `isReadOnly` in context value.

**`src/App.js`**:
- When `subscriptionBlock === 'cancelled'`, render `SubscriptionBlockedScreen` instead of the main app.

**New file: `src/components/SubscriptionBlockedScreen.js`**:
- Full-screen blocked UI for cancelled subscriptions, role-aware content.

**`src/components/BillingBanner.js`**:
- No changes needed — it already handles `past_due` and `cancelled` display. The `SubscriptionBlockedScreen` takes over for cancelled, so the banner's cancelled state becomes unreachable (which is fine).

## Testing

- Unit test `subscriptionGate()` middleware with mocked context for each status × method × role combination, including unmapped statuses (`unpaid`, `incomplete_expired`, etc.).
- Unit test: verify owner bypasses gate for all statuses, including when switching orgs.
- Unit test: verify exempt paths (auth, billing, support POST) pass through for all statuses.
- Unit test: verify non-GET methods (POST, PUT, PATCH, DELETE) are blocked for `past_due`.
- Frontend: test that `SubscriptionBlockedScreen` renders when `subscriptionBlock === 'cancelled'`, with role-appropriate content (admin vs teacher).
- Frontend: test that `fetchWithAuth` sets `subscriptionBlock` on 403 with subscription codes.
- Frontend: test proactive subscription status fetch on auth load.
