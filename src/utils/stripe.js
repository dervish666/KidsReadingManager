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
