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

/**
 * Normalize Stripe subscription status to consistent British spelling.
 * Stripe uses 'canceled' (American); we store 'cancelled' (British).
 */
export function normalizeSubscriptionStatus(status) {
  if (status === 'canceled') return 'cancelled';
  return status;
}

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
          if (p) {
            plan = p;
            break;
          }
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
          normalizeSubscriptionStatus(obj.status),
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
