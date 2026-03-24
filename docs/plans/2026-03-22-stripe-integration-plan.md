# Tally Reading — Stripe Integration: Implementation Guide

A step-by-step guide to implement Stripe Billing. Each phase is a self-contained unit you can ship independently.

All code follows the project's existing conventions: plain JavaScript (no TypeScript), Hono framework patterns, `c.env.READING_MANAGER_DB` for D1, `c.get('organizationId')` for tenant scoping, `fetchWithAuth` for frontend API calls, and `rowTo*()` mappers for snake_case→camelCase conversion.

## Stripe Sandbox IDs (Test Mode)

```
Product:       prod_UCvZyedcrGgH1c    (Tally Reading — base subscription)
Monthly:       price_1TEVis5Ht78WeYZ8u5Qy8Mq5   (£100/month)
Termly:        price_1TEVit5Ht78WeYZ8BDIt3jTr    (£300/4 months)
Annual:        price_1TEViu5Ht78WeYZ8UvnZzvuH    (£1,000/year)
Test Customer: cus_UCvbY8a253GdOQ     (Cheddar Grove Primary School)

AI Add-on:     prod_UD1oaSmU351Gt4    (AI Recommendations API Key)
               price_1TEbkYFvBYcaukPXPNfBZrre   (£20/month)
```

## Design Decisions

### One tier, one add-on

There is a single subscription tier — all features are included. The existing `subscription_tier` column in the `organizations` table is legacy and unused; a future migration can drop it.

The only upsell is an **AI API key** add-on (£20/month). This is modelled as a second line item on the Stripe subscription. Schools can add or remove it at any time. Locally we track this with an `ai_addon_active` boolean, synced from Stripe via webhooks.

### Stripe is the source of truth

Billing state is owned by Stripe. The local database caches subscription status, plan, and period dates — all populated exclusively by webhook events. The `subscription_plan` column ('monthly', 'termly', 'annual') is derived from the Stripe Price ID on the subscription, not set manually.

The billing routes read from the local cache for fast responses. If a discrepancy is suspected, the admin can check the Stripe dashboard directly (linked from the owner billing dashboard).

### Invoice-based billing (not card-first)

UK schools typically pay via BACS transfer or purchase orders, not credit cards. This plan uses `collection_method: 'send_invoice'` with Net 30 payment terms. Combined with a 30-day trial, schools get ~60 days before payment is due. If this is too generous, reduce `trial_period_days` or `days_until_due`.

### Explicit customer creation (not auto-triggered)

Stripe customers are NOT created automatically on login. Instead, an admin clicks "Start Trial" or the owner manually provisions billing. This avoids creating Stripe records for test users, demo accounts, and staff logins.

---

## Phase 1: Database Migration

**File**: `migrations/0038_billing_fields.sql`

```sql
-- Remove legacy subscription tier (replaced by Stripe billing)
-- D1 doesn't support DROP COLUMN, so we null it out and stop reading it.
-- The column itself is harmless and can stay until a table rebuild.
UPDATE organizations SET subscription_tier = NULL WHERE subscription_tier IS NOT NULL;

-- Add billing fields to organizations
ALTER TABLE organizations ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE organizations ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE organizations ADD COLUMN subscription_status TEXT DEFAULT 'none';
ALTER TABLE organizations ADD COLUMN subscription_plan TEXT;       -- 'monthly'/'termly'/'annual', synced from Stripe
ALTER TABLE organizations ADD COLUMN ai_addon_active INTEGER DEFAULT 0;  -- whether AI add-on is on the subscription
ALTER TABLE organizations ADD COLUMN trial_ends_at TEXT;
ALTER TABLE organizations ADD COLUMN current_period_end TEXT;
ALTER TABLE organizations ADD COLUMN billing_email TEXT;

-- Index for webhook lookups by stripe_customer_id
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer
  ON organizations(stripe_customer_id);

-- Audit trail for webhook events (deduplication + debugging)
CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT NOT NULL UNIQUE,
  data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS idx_billing_events_organization
  ON billing_events(organization_id);
```

**Deploy**:
```bash
npx wrangler d1 migrations apply reading-manager-db --local    # Test locally first
npx wrangler d1 migrations apply reading-manager-db --remote   # Production
```

---

## Phase 2: Update Row Mapper

**File**: `src/utils/rowMappers.js` — update `rowToOrganization`:

```js
export const rowToOrganization = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    subscriptionTier: row.subscription_tier,  // legacy — unused, kept for backward compat
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    wondeSchoolId: row.wonde_school_id || null,
    hasWondeToken: Boolean(row.wonde_school_token),
    wondeLastSyncAt: row.wonde_last_sync_at || null,
    myloginOrgId: row.mylogin_org_id || null,
    consentGivenAt: row.consent_given_at || null,
    consentVersion: row.consent_version || null,
    consentGivenBy: row.consent_given_by || null,
    // Billing fields (synced from Stripe via webhooks)
    stripeCustomerId: row.stripe_customer_id || null,
    stripeSubscriptionId: row.stripe_subscription_id || null,
    subscriptionStatus: row.subscription_status || 'none',
    subscriptionPlan: row.subscription_plan || null,
    aiAddonActive: Boolean(row.ai_addon_active),
    trialEndsAt: row.trial_ends_at || null,
    currentPeriodEnd: row.current_period_end || null,
    billingEmail: row.billing_email || null,
  };
};
```

**Note**: Sensitive fields like `stripeCustomerId` and `stripeSubscriptionId` are included in the mapper but should be excluded from responses to non-admin users. The billing routes (Phase 6) handle this by returning only the fields needed. If the organization endpoint (`GET /api/organization`) also returns these, consider filtering them out for teacher/readonly roles.

---

## Phase 3: Environment Variables

**File**: `wrangler.toml` — add to `[vars]` section:

```toml
STRIPE_MONTHLY_PRICE_ID = "price_1TEVis5Ht78WeYZ8u5Qy8Mq5"
STRIPE_TERMLY_PRICE_ID = "price_1TEVit5Ht78WeYZ8BDIt3jTr"
STRIPE_ANNUAL_PRICE_ID = "price_1TEViu5Ht78WeYZ8UvnZzvuH"
STRIPE_AI_ADDON_PRICE_ID = "price_1TEbkYFvBYcaukPXPNfBZrre"
```

**Secrets** (via `wrangler secret put`):

```bash
wrangler secret put STRIPE_SECRET_KEY
# paste sk_test_... for sandbox, sk_live_... for production

wrangler secret put STRIPE_WEBHOOK_SECRET
# paste whsec_... from Stripe webhook endpoint config
```

---

## Phase 4: Stripe Client Helper

**Install**: `npm install stripe`

**File**: `src/utils/stripe.js`

```js
import Stripe from 'stripe';

/**
 * Create a Stripe client for the current request.
 * Uses fetch-based HTTP client for Cloudflare Workers compatibility.
 */
export function getStripe(env) {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/**
 * Map plan name to Stripe Price ID.
 * @param {string} plan - 'monthly', 'termly', or 'annual'
 * @param {object} env - Cloudflare Worker env bindings
 * @returns {string} Stripe Price ID
 */
export function getPriceId(plan, env) {
  const map = {
    monthly: env.STRIPE_MONTHLY_PRICE_ID,
    termly: env.STRIPE_TERMLY_PRICE_ID,
    annual: env.STRIPE_ANNUAL_PRICE_ID,
  };
  const priceId = map[plan];
  if (!priceId) {
    throw new Error(`Unknown billing plan: ${plan}`);
  }
  return priceId;
}

/**
 * Reverse-map a Stripe Price ID back to a plan name.
 * Used by webhook handlers to keep subscription_plan in sync.
 * @param {string} priceId - Stripe Price ID
 * @param {object} env - Cloudflare Worker env bindings
 * @returns {string|null} Plan name or null if not recognised
 */
export function getPlanFromPriceId(priceId, env) {
  if (priceId === env.STRIPE_MONTHLY_PRICE_ID) return 'monthly';
  if (priceId === env.STRIPE_TERMLY_PRICE_ID) return 'termly';
  if (priceId === env.STRIPE_ANNUAL_PRICE_ID) return 'annual';
  return null;
}

/**
 * Check whether a subscription includes the AI add-on.
 * Looks through all line items for the AI add-on price.
 * @param {object} subscription - Stripe Subscription object (with items expanded)
 * @param {object} env - Cloudflare Worker env bindings
 * @returns {boolean}
 */
export function hasAiAddon(subscription, env) {
  if (!env.STRIPE_AI_ADDON_PRICE_ID) return false;
  return (subscription.items?.data || []).some(
    (item) => item.price?.id === env.STRIPE_AI_ADDON_PRICE_ID
  );
}
```

**Note on API version**: Check the [Stripe API changelog](https://docs.stripe.com/upgrades#api-versions) for the latest stable version before implementation. Pin to a specific version to avoid breaking changes.

---

## Phase 5: Webhook Endpoint

This is the most critical piece — it keeps your DB in sync with Stripe. Build and test this before anything else.

**File**: `src/routes/stripeWebhook.js`

```js
/**
 * Stripe Webhook Handler
 *
 * Receives events from Stripe and updates organization billing state.
 * Uses signature verification for auth (not JWT — this is a public endpoint).
 * Deduplicates events via billing_events table.
 */

import { Hono } from 'hono';
import { getStripe, getPlanFromPriceId, hasAiAddon } from '../utils/stripe.js';
import { generateId } from '../utils/helpers.js';

const stripeWebhookRouter = new Hono();

stripeWebhookRouter.post('/', async (c) => {
  const stripe = getStripe(c.env);
  const db = c.env.READING_MANAGER_DB;

  if (!db) {
    console.error('[Stripe Webhook] Database not available');
    return c.json({ error: 'Service unavailable' }, 503);
  }

  // Get raw body for signature verification (must be unparsed text)
  const body = await c.req.text();
  const signature = c.req.header('stripe-signature');

  if (!signature) {
    return c.json({ error: 'Missing stripe-signature header' }, 400);
  }

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return c.json({ error: 'Invalid signature' }, 400);
  }

  // Deduplicate: check if we've already processed this event
  const existing = await db
    .prepare('SELECT id FROM billing_events WHERE stripe_event_id = ?')
    .bind(event.id)
    .first();

  if (existing) {
    return c.json({ received: true, status: 'already_processed' });
  }

  // Extract customer ID from the event data
  const obj = event.data.object;
  const customerId =
    typeof obj.customer === 'string' ? obj.customer : obj.customer?.id || null;

  // Look up the organization (needed for audit trail and updates)
  let orgRecord = null;
  if (customerId) {
    orgRecord = await db
      .prepare('SELECT id FROM organizations WHERE stripe_customer_id = ? AND is_active = 1')
      .bind(customerId)
      .first();
  }

  // Record the event BEFORE processing (so retries don't reprocess partial work)
  if (orgRecord) {
    await db
      .prepare(
        `INSERT INTO billing_events (id, organization_id, event_type, stripe_event_id, data, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
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

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        if (!customerId || !orgRecord) break;

        // Derive plan from the base price (first non-addon item)
        let plan = null;
        for (const item of obj.items?.data || []) {
          const p = getPlanFromPriceId(item.price?.id, c.env);
          if (p) { plan = p; break; }
        }

        // Check if AI add-on is present
        const aiAddon = hasAiAddon(obj, c.env);

        const updates = [
          'stripe_subscription_id = ?',
          'subscription_status = ?',
          'current_period_end = ?',
          'trial_ends_at = ?',
          'ai_addon_active = ?',
        ];
        const params = [
          obj.id,
          obj.status,
          new Date(obj.current_period_end * 1000).toISOString(),
          obj.trial_end ? new Date(obj.trial_end * 1000).toISOString() : null,
          aiAddon ? 1 : 0,
        ];

        // Only update plan if we can resolve it
        if (plan) {
          updates.push('subscription_plan = ?');
          params.push(plan);
        }

        params.push(customerId); // for WHERE clause

        await db
          .prepare(
            `UPDATE organizations SET ${updates.join(', ')}
             WHERE stripe_customer_id = ? AND is_active = 1`
          )
          .bind(...params)
          .run();
        break;
      }

      case 'customer.subscription.deleted': {
        if (!customerId) break;
        await db
          .prepare(
            `UPDATE organizations SET subscription_status = 'cancelled'
             WHERE stripe_customer_id = ? AND is_active = 1`
          )
          .bind(customerId)
          .run();
        break;
      }

      case 'invoice.paid': {
        if (!customerId) break;
        await db
          .prepare(
            `UPDATE organizations SET subscription_status = 'active'
             WHERE stripe_customer_id = ? AND is_active = 1`
          )
          .bind(customerId)
          .run();
        break;
      }

      case 'invoice.payment_failed': {
        if (!customerId) break;
        await db
          .prepare(
            `UPDATE organizations SET subscription_status = 'past_due'
             WHERE stripe_customer_id = ? AND is_active = 1`
          )
          .bind(customerId)
          .run();
        break;
      }

      case 'customer.subscription.trial_will_end': {
        // Fires 3 days before trial ends
        // TODO: Send reminder email to school admin
        console.log(`[Stripe Webhook] Trial ending soon for subscription ${obj.id}`);
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    // Event already recorded in billing_events, so retries will be deduped.
    // Log the error but return 200 to prevent Stripe infinite retries.
    console.error(`[Stripe Webhook] Error processing ${event.type}:`, err);
  }

  return c.json({ received: true });
});

export default stripeWebhookRouter;
```

### Register the route and public path

**File**: `src/worker.js` — add import and route:

```js
// Add to imports at top:
import stripeWebhookRouter from './routes/stripeWebhook.js';

// Add with other app.route() calls (after line 228):
app.route('/api/webhooks/stripe', stripeWebhookRouter);
```

**File**: `src/utils/constants.js` — add to `PUBLIC_PATHS`:

```js
export const PUBLIC_PATHS = [
  // ... existing paths ...
  '/api/webhooks/wonde',
  '/api/webhooks/stripe',   // <-- add this
];
```

**Test with Stripe CLI**:

```bash
# Install: brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to localhost:8787/api/webhooks/stripe
# In another terminal:
stripe trigger customer.subscription.created
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
```

---

## Phase 6: Billing Routes (Customer Setup, Status, Portal)

**File**: `src/routes/billing.js`

```js
/**
 * Billing Routes
 *
 * Manages Stripe customer creation, subscription setup,
 * billing status, customer portal access, and plan changes.
 */

import { Hono } from 'hono';
import { requireAdmin, requireOwner } from '../middleware/tenant.js';
import { generateId } from '../utils/helpers.js';
import { getStripe, getPriceId } from '../utils/stripe.js';

export const billingRouter = new Hono();

// ── Helper: build subscription line items ─────────────────────────────────

function buildLineItems(plan, includeAiAddon, env) {
  const items = [{ price: getPriceId(plan, env) }];
  if (includeAiAddon && env.STRIPE_AI_ADDON_PRICE_ID) {
    items.push({ price: env.STRIPE_AI_ADDON_PRICE_ID });
  }
  return items;
}

/**
 * POST /api/billing/setup
 * Create Stripe customer and start a trial subscription.
 * Called explicitly by admin (not auto-triggered on login).
 * Requires: admin role
 */
billingRouter.post('/setup', requireAdmin(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  const organizationId = c.get('organizationId');
  const stripe = getStripe(c.env);

  // Fetch org to check if already set up
  const org = await db
    .prepare('SELECT * FROM organizations WHERE id = ? AND is_active = 1')
    .bind(organizationId)
    .first();

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  if (org.stripe_customer_id) {
    return c.json({ error: 'Billing already configured for this organization' }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const plan = body.plan || 'monthly';
  const includeAiAddon = Boolean(body.includeAiAddon);
  const billingEmail = typeof body.billingEmail === 'string' ? body.billingEmail.trim() : null;

  // Validate plan
  try {
    getPriceId(plan, c.env);
  } catch {
    return c.json({ error: 'Invalid plan. Must be monthly, termly, or annual.' }, 400);
  }

  // Determine billing email: explicit input > admin user's email
  let email = billingEmail;
  if (!email) {
    const adminUser = await db
      .prepare('SELECT email FROM users WHERE id = ? AND is_active = 1')
      .bind(c.get('userId'))
      .first();
    email = adminUser?.email;
  }

  // 1. Create Stripe Customer
  const customer = await stripe.customers.create({
    name: org.name,
    email: email || undefined,
    metadata: {
      organization_id: org.id,
      wonde_school_id: org.wonde_school_id || '',
    },
  });

  // 2. Create Subscription with trial (base plan + optional AI add-on)
  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: buildLineItems(plan, includeAiAddon, c.env),
    trial_period_days: 30,
    collection_method: 'send_invoice',
    days_until_due: 30,
    metadata: {
      organization_id: org.id,
    },
  });

  // 3. Update organization record
  await db
    .prepare(
      `UPDATE organizations SET
        stripe_customer_id = ?,
        stripe_subscription_id = ?,
        subscription_status = 'trialing',
        subscription_plan = ?,
        trial_ends_at = ?,
        billing_email = ?,
        updated_at = datetime('now')
      WHERE id = ?`
    )
    .bind(
      customer.id,
      subscription.id,
      plan,
      new Date(subscription.trial_end * 1000).toISOString(),
      email || null,
      org.id
    )
    .run();

  return c.json({
    status: 'trialing',
    plan,
    trialEndsAt: new Date(subscription.trial_end * 1000).toISOString(),
  });
});

/**
 * GET /api/billing/status
 * Returns current billing status for the organization.
 * Requires: admin role (teachers don't need billing details)
 */
billingRouter.get('/status', requireAdmin(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  const organizationId = c.get('organizationId');

  const org = await db
    .prepare(
      `SELECT subscription_status, subscription_plan, trial_ends_at,
              current_period_end, billing_email
       FROM organizations WHERE id = ? AND is_active = 1`
    )
    .bind(organizationId)
    .first();

  if (!org) {
    return c.json({ error: 'Organization not found' }, 404);
  }

  const now = new Date();
  let daysRemaining = null;

  if (org.subscription_status === 'trialing' && org.trial_ends_at) {
    const trialEnd = new Date(org.trial_ends_at);
    daysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  return c.json({
    status: org.subscription_status || 'none',
    plan: org.subscription_plan || null,
    trialEndsAt: org.trial_ends_at || null,
    currentPeriodEnd: org.current_period_end || null,
    billingEmail: org.billing_email || null,
    daysRemaining,
  });
});

/**
 * POST /api/billing/portal
 * Creates a Stripe Customer Portal session and returns the URL.
 * Schools use this to manage payment methods, view invoices, etc.
 * Requires: admin role
 */
billingRouter.post('/portal', requireAdmin(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  const organizationId = c.get('organizationId');

  const org = await db
    .prepare('SELECT stripe_customer_id FROM organizations WHERE id = ? AND is_active = 1')
    .bind(organizationId)
    .first();

  if (!org?.stripe_customer_id) {
    return c.json({ error: 'Billing not configured for this organization' }, 400);
  }

  const stripe = getStripe(c.env);

  // Use request origin for return URL (works across dev/staging/production)
  const origin = new URL(c.req.url).origin;

  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${origin}/settings`,
  });

  return c.json({ url: session.url });
});

/**
 * POST /api/billing/change-plan
 * Switch between monthly/termly/annual billing.
 * Requires: admin role
 */
billingRouter.post('/change-plan', requireAdmin(), async (c) => {
  const db = c.env.READING_MANAGER_DB;
  const organizationId = c.get('organizationId');

  const org = await db
    .prepare(
      'SELECT stripe_subscription_id FROM organizations WHERE id = ? AND is_active = 1'
    )
    .bind(organizationId)
    .first();

  if (!org?.stripe_subscription_id) {
    return c.json({ error: 'No active subscription' }, 400);
  }

  const body = await c.req.json().catch(() => null);
  if (!body?.plan) {
    return c.json({ error: 'plan is required' }, 400);
  }

  let priceId;
  try {
    priceId = getPriceId(body.plan, c.env);
  } catch {
    return c.json({ error: 'Invalid plan. Must be monthly, termly, or annual.' }, 400);
  }

  const stripe = getStripe(c.env);

  // Get current subscription to find the item ID
  const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
  const itemId = subscription.items.data[0]?.id;

  if (!itemId) {
    return c.json({ error: 'Subscription has no items' }, 500);
  }

  // Update the subscription to the new price
  await stripe.subscriptions.update(org.stripe_subscription_id, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: 'create_prorations',
  });

  // Update local record (webhook will also update, but this is faster for UX)
  await db
    .prepare(
      "UPDATE organizations SET subscription_plan = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .bind(body.plan, organizationId)
    .run();

  return c.json({ plan: body.plan, status: 'updated' });
});
```

### Register the route

**File**: `src/worker.js` — add import and route:

```js
// Add to imports:
import { billingRouter } from './routes/billing.js';

// Add with other app.route() calls:
app.route('/api/billing', billingRouter);
```

---

## Phase 7: Access Control Middleware (Optional)

**Important**: This phase gates ALL API access behind a subscription check. Only add this when you're confident the billing flow works end-to-end. During development, skip this phase.

The cleanest approach is to add the check inside `tenantMiddleware()` in `src/middleware/tenant.js`, since it already has the org context. Alternatively, add a separate middleware in `src/worker.js`.

**File**: `src/worker.js` — add AFTER the tenant middleware block (after line 200):

```js
// Billing access control (add when ready to enforce subscriptions)
app.use('/api/*', async (c, next) => {
  const url = new URL(c.req.url);

  // Skip billing check for public, auth, billing, and webhook routes
  if (
    PUBLIC_PATHS.includes(url.pathname) ||
    url.pathname.startsWith('/api/covers/') ||
    url.pathname.startsWith('/api/auth/') ||
    url.pathname.startsWith('/api/billing/') ||
    url.pathname.startsWith('/api/webhooks/') ||
    url.pathname.startsWith('/api/health')
  ) {
    return next();
  }

  // Only enforce in multi-tenant mode
  if (!c.env.JWT_SECRET || !c.get('organizationId')) {
    return next();
  }

  // Owner role bypasses billing checks
  if (c.get('userRole') === 'owner') {
    return next();
  }

  const db = c.env.READING_MANAGER_DB;
  if (!db) return next();

  const org = await db
    .prepare('SELECT subscription_status, current_period_end FROM organizations WHERE id = ? AND is_active = 1')
    .bind(c.get('organizationId'))
    .first();

  if (!org) return next();

  const status = org.subscription_status;

  // Allow trialing, active, and orgs without billing setup yet
  if (status === 'trialing' || status === 'active' || status === 'none' || !status) {
    return next();
  }

  // Past due: allow read-only access for a 14-day grace period
  if (status === 'past_due') {
    const gracePeriodMs = 14 * 24 * 60 * 60 * 1000;
    const periodEnd = org.current_period_end ? new Date(org.current_period_end) : new Date();
    const graceEnd = new Date(periodEnd.getTime() + gracePeriodMs);

    if (new Date() < graceEnd) {
      if (c.req.method === 'GET') {
        return next();
      }
      return c.json(
        { error: 'subscription_past_due', message: 'Your subscription is overdue. Read-only access.' },
        402
      );
    }
  }

  // Cancelled or grace period expired
  return c.json(
    { error: 'subscription_required', message: 'An active subscription is required.' },
    402
  );
});
```

---

## Phase 8: Frontend — Billing Status Banner

**File**: `src/components/BillingBanner.js`

```js
import { useState, useEffect, useContext } from 'react';
import { Alert, AlertTitle, Button } from '@mui/material';
import { AppContext } from '../contexts/AppContext';

export default function BillingBanner() {
  const { fetchWithAuth, user } = useContext(AppContext);
  const [billing, setBilling] = useState(null);

  useEffect(() => {
    // Only fetch for admin+ roles
    if (!user || (user.role !== 'admin' && user.role !== 'owner')) return;

    fetchWithAuth('/api/billing/status')
      .then((r) => r.json())
      .then(setBilling)
      .catch(() => {});
  }, [fetchWithAuth, user]);

  if (!billing || billing.status === 'active' || billing.status === 'none') {
    return null;
  }

  const handleManageBilling = async () => {
    try {
      const res = await fetchWithAuth('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch {
      // Silently fail — user can retry
    }
  };

  if (billing.status === 'trialing') {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        <AlertTitle>Free Trial</AlertTitle>
        You have {billing.daysRemaining} day{billing.daysRemaining !== 1 ? 's' : ''} remaining
        on your free trial.
        <Button size="small" onClick={handleManageBilling} sx={{ ml: 2 }}>
          Set up billing
        </Button>
      </Alert>
    );
  }

  if (billing.status === 'past_due') {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        <AlertTitle>Payment Overdue</AlertTitle>
        Your subscription payment is overdue. Please update your payment details to avoid losing
        access.
        <Button size="small" color="warning" onClick={handleManageBilling} sx={{ ml: 2 }}>
          Update payment
        </Button>
      </Alert>
    );
  }

  if (billing.status === 'cancelled') {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        <AlertTitle>Subscription Cancelled</AlertTitle>
        Your subscription has been cancelled. Please contact support to reactivate.
      </Alert>
    );
  }

  return null;
}
```

**Add to layout** — in `src/App.js`, inside the authenticated layout area:

```js
import BillingBanner from './components/BillingBanner';

// Inside the layout, above the main content:
<BillingBanner />
```

---

## Phase 9: Owner Billing Dashboard

**File**: `src/components/BillingDashboard.js`

```js
import { useState, useEffect, useContext } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableRow,
  Chip, IconButton, ToggleButtonGroup, ToggleButton, Box,
} from '@mui/material';
import { OpenInNew } from '@mui/icons-material';
import { AppContext } from '../contexts/AppContext';

const STATUS_COLOURS = {
  trialing: 'info',
  active: 'success',
  past_due: 'warning',
  cancelled: 'error',
  none: 'default',
};

export default function BillingDashboard() {
  const { fetchWithAuth } = useContext(AppContext);
  const [orgs, setOrgs] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchWithAuth('/api/billing/schools')
      .then((r) => r.json())
      .then((data) => setOrgs(data.schools || []))
      .catch(() => {});
  }, [fetchWithAuth]);

  const filtered =
    filter === 'all' ? orgs : orgs.filter((o) => o.subscriptionStatus === filter);

  // Determine Stripe dashboard base URL (test vs live)
  // In production, remove '/test' from the URL
  const stripeBase = 'https://dashboard.stripe.com/test';

  return (
    <>
      <Box sx={{ mb: 2 }}>
        <ToggleButtonGroup
          value={filter}
          exclusive
          onChange={(e, v) => v && setFilter(v)}
          size="small"
        >
          <ToggleButton value="all">All ({orgs.length})</ToggleButton>
          <ToggleButton value="trialing">Trialing</ToggleButton>
          <ToggleButton value="active">Active</ToggleButton>
          <ToggleButton value="past_due">Past Due</ToggleButton>
          <ToggleButton value="cancelled">Cancelled</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>School</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Plan</TableCell>
            <TableCell>AI</TableCell>
            <TableCell>Next Date</TableCell>
            <TableCell>Stripe</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filtered.map((org) => (
            <TableRow key={org.id}>
              <TableCell>{org.name}</TableCell>
              <TableCell>
                <Chip
                  label={org.subscriptionStatus || 'none'}
                  color={STATUS_COLOURS[org.subscriptionStatus] || 'default'}
                  size="small"
                />
              </TableCell>
              <TableCell>{org.subscriptionPlan || '\u2014'}</TableCell>
              <TableCell>
                {org.aiAddonActive && (
                  <Chip label="AI" color="secondary" size="small" variant="outlined" />
                )}
              </TableCell>
              <TableCell>
                {org.subscriptionStatus === 'trialing' && org.trialEndsAt
                  ? `Trial ends ${new Date(org.trialEndsAt).toLocaleDateString()}`
                  : org.currentPeriodEnd
                    ? new Date(org.currentPeriodEnd).toLocaleDateString()
                    : '\u2014'}
              </TableCell>
              <TableCell>
                {org.stripeCustomerId && (
                  <IconButton
                    size="small"
                    href={`${stripeBase}/customers/${org.stripeCustomerId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <OpenInNew fontSize="small" />
                  </IconButton>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
```

### Owner-only billing API endpoint

**File**: `src/routes/billing.js` — add to the existing billingRouter:

```js
/**
 * GET /api/billing/schools
 * List all organizations with billing status.
 * Requires: owner role
 */
billingRouter.get('/schools', requireOwner(), async (c) => {
  const db = c.env.READING_MANAGER_DB;

  const result = await db
    .prepare(
      `SELECT id, name, stripe_customer_id, stripe_subscription_id,
              subscription_status, subscription_plan, ai_addon_active,
              trial_ends_at, current_period_end, billing_email
       FROM organizations
       WHERE is_active = 1
       ORDER BY
         CASE subscription_status
           WHEN 'past_due' THEN 1
           WHEN 'trialing' THEN 2
           WHEN 'active' THEN 3
           WHEN 'cancelled' THEN 4
           ELSE 5
         END`
    )
    .all();

  // Use rowToOrganization for consistent camelCase mapping
  // but only return billing-relevant fields
  const schools = (result.results || []).map((row) => ({
    id: row.id,
    name: row.name,
    stripeCustomerId: row.stripe_customer_id || null,
    subscriptionStatus: row.subscription_status || 'none',
    subscriptionPlan: row.subscription_plan || null,
    aiAddonActive: Boolean(row.ai_addon_active),
    trialEndsAt: row.trial_ends_at || null,
    currentPeriodEnd: row.current_period_end || null,
    billingEmail: row.billing_email || null,
  }));

  return c.json({ schools });
});
```

---

## Phase 10: Stripe Dashboard Configuration

Do these manually in the Stripe Dashboard (test mode first, then live):

1. **Webhook endpoint**: Developers → Webhooks → Add endpoint
   - URL: `https://tallyreading.uk/api/webhooks/stripe`
   - Events to listen for:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `customer.subscription.trial_will_end`
     - `invoice.paid`
     - `invoice.payment_failed`

2. **Customer Portal**: Settings → Billing → Customer portal
   - Enable: Invoice history, Payment method management
   - Disable: Subscription cancellation (handle manually via support)

3. **Invoice settings**: Settings → Billing → Invoices
   - Default payment terms: Net 30
   - Auto-reminders: 7 days, 14 days, 28 days after invoice sent
   - Enable bank transfer (BACS) as payment method

4. **Business details**: Settings → Business details
   - Add your business name, address (required for valid UK invoices)

---

## Implementation Order & Checklist

Work through these in order. Each phase can be tested independently.

```
[ ] Phase 1:  Database migration (0038) — nulls legacy subscription_tier, adds billing columns
[ ] Phase 2:  Update rowToOrganization mapper + remove tier from SchoolManagement.js
[ ] Phase 3:  Environment variables + secrets (including AI add-on price ID)
[ ] Phase 4:  Stripe client helper (src/utils/stripe.js)
[ ] Phase 10: Stripe Dashboard config (webhook endpoint) — do this early so you can test
[ ] Phase 5:  Webhook endpoint — test with Stripe CLI
[ ] Phase 6:  Billing routes (setup, status, portal, change-plan)
[ ] Phase 8:  Billing banner component
[ ] Phase 9:  Owner billing dashboard
[ ] Phase 7:  Access control middleware (add last, when billing flow is solid)
[ ] AI add-on: Gate AI recommendation routes, add upgrade prompt on recommendations page
[ ] End-to-end test with Stripe test clocks
```

**Stripe test clocks** let you simulate time passing — create a test clock, attach a customer, advance time past the trial end, and verify your webhook handler processes the resulting invoice correctly. Essential for testing the trial → active → past_due flow without waiting 30 days.

---

## Key Decisions to Make Before Going Live

1. **Trial-to-paid messaging**: What email should schools receive when their trial ends? Stripe can send auto-emails, or handle it via the `trial_will_end` webhook.
2. **Cancellation flow**: Should schools self-cancel via the portal, or must they contact support?
3. **Existing test schools**: Set Cheddar Grove's `subscription_status` to `active` manually so they're not affected during development.
4. **Live mode**: When ready, create the same product/prices in Stripe live mode, swap secrets (`wrangler secret put STRIPE_SECRET_KEY` with the live key), update price IDs in `wrangler.toml`, and configure the live webhook endpoint.
5. **AI add-on gating**: When `ai_addon_active` is false and the school hasn't configured their own API key, the AI recommendations page shows library-based recommendations as normal. Below those, a prompt to add the AI add-on for £20/month. Schools can also configure their own key in AI Settings to skip the charge.
6. **Remove `subscription_tier` from UI**: Strip the tier dropdown from `SchoolManagement.js` (lines 255–256, 369–381 and related `formData` usage). The `rowToOrganization` mapper keeps the field for backward compat but it's no longer written or displayed. The column is nulled in the migration.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `migrations/0038_billing_fields.sql` | **New** — billing columns + billing_events table |
| `src/utils/rowMappers.js` | **Edit** — add billing fields to `rowToOrganization` |
| `src/utils/stripe.js` | **New** — Stripe client factory + price ID helpers |
| `src/utils/constants.js` | **Edit** — add `/api/webhooks/stripe` to `PUBLIC_PATHS` |
| `src/routes/stripeWebhook.js` | **New** — webhook handler |
| `src/routes/billing.js` | **New** — billing CRUD routes |
| `src/worker.js` | **Edit** — import + register billing and webhook routers, optional billing middleware |
| `src/components/BillingBanner.js` | **New** — trial/overdue/cancelled banner |
| `src/components/BillingDashboard.js` | **New** — owner billing overview |
| `src/App.js` | **Edit** — add BillingBanner to layout |
| `src/components/SchoolManagement.js` | **Edit** — remove subscription tier dropdown and display |
| `wrangler.toml` | **Edit** — add price ID vars (including AI add-on) |
| `package.json` | **Edit** — `npm install stripe` |
