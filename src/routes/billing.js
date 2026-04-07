/**
 * Billing Routes
 *
 * Manages Stripe customer creation, subscription setup,
 * billing status, customer portal access, and plan changes.
 */

import { Hono } from 'hono';
import { requireAdmin, requireOwner } from '../middleware/tenant.js';
import { getStripe, getPriceId } from '../utils/stripe.js';

export const billingRouter = new Hono();

// ── Helper: build subscription line items ─────────────────────────────────

function buildLineItems(includeAiAddon, env) {
  const items = [{ price: getPriceId(env) }];
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
  const userRole = c.get('userRole');

  // Allow owners to provision billing for any org via body.organizationId
  const body = await c.req.json().catch(() => ({}));
  const organizationId = (userRole === 'owner' && body.organizationId)
    ? body.organizationId
    : c.get('organizationId');

  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: 'Stripe is not configured' }, 503);
  }

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

  const plan = 'annual';
  const includeAiAddon = Boolean(body.includeAiAddon);
  const billingEmail = typeof body.billingEmail === 'string' ? body.billingEmail.trim() : null;

  // Determine billing email: explicit input > org billing_email > org contact_email > admin user's email
  let email = billingEmail;
  if (!email) email = org.billing_email;
  if (!email) email = org.contact_email;
  if (!email) {
    const adminUser = await db
      .prepare('SELECT email FROM users WHERE id = ? AND is_active = 1')
      .bind(c.get('userId'))
      .first();
    email = adminUser?.email;
  }

  try {
    // 1. Create Stripe Customer with address for invoicing
    const customerData = {
      name: org.name,
      email: email || undefined,
      metadata: {
        organization_id: org.id,
        wonde_school_id: org.wonde_school_id || '',
      },
    };

    // Add address if available (for UK invoice compliance)
    if (org.address_line_1) {
      customerData.address = {
        line1: org.address_line_1,
        line2: org.address_line_2 || undefined,
        city: org.town || undefined,
        postal_code: org.postcode || undefined,
        country: 'GB',
      };
    }

    if (org.phone) {
      customerData.phone = org.phone;
    }

    const customer = await stripe.customers.create(customerData);

    // 2. Create Subscription with trial (base plan + optional AI add-on)
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: buildLineItems(includeAiAddon, c.env),
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
  } catch (err) {
    console.error('[Billing] Setup failed:', err.message);
    return c.json({ error: `Billing setup failed: ${err.message}` }, 500);
  }
});

/**
 * GET /api/billing/subscription-status
 * Lightweight subscription status check for all authenticated users.
 * No role restriction — used by frontend to detect subscription blocks proactively.
 * Exempt from subscription gate (falls under /api/billing/* prefix).
 */
billingRouter.get('/subscription-status', async (c) => {
  const db = c.env.READING_MANAGER_DB;
  const organizationId = c.get('organizationId');

  const org = await db
    .prepare('SELECT subscription_status FROM organizations WHERE id = ?')
    .bind(organizationId)
    .first();

  return c.json({ status: org?.subscription_status || 'none' });
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
    daysRemaining = Math.max(
      0,
      Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    );
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
 * Migrate existing subscribers to the current annual plan.
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

  const priceId = getPriceId(c.env);
  const stripe = getStripe(c.env);

  // Get current subscription to find the item ID
  const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
  const itemId = subscription.items.data[0]?.id;

  if (!itemId) {
    return c.json({ error: 'Subscription has no items' }, 500);
  }

  // Update the subscription to the current annual price
  await stripe.subscriptions.update(org.stripe_subscription_id, {
    items: [{ id: itemId, price: priceId }],
    proration_behavior: 'create_prorations',
  });

  // Update local record (webhook will also update, but this is faster for UX)
  await db
    .prepare(
      "UPDATE organizations SET subscription_plan = 'annual', updated_at = datetime('now') WHERE id = ?"
    )
    .bind(organizationId)
    .run();

  return c.json({ plan: 'annual', status: 'updated' });
});

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
