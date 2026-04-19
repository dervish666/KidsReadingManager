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

// Legacy price IDs for existing subscribers (old pricing structures)
const LEGACY_MONTHLY_PRICE = 'price_1TEYdAFvBYcaukPXJ0EaqNNX';
const LEGACY_TERMLY_PRICE = 'price_1TEYd9FvBYcaukPXZPZ2lUjI';
const LEGACY_ANNUAL_PRICE = 'price_1TEYd8FvBYcaukPXwLnIiDdp';
const LEGACY_ANNUAL_FLAT_PRICE = 'price_1TJaLFFvBYcaukPXYXQmb5K7'; // £199/yr flat
const LEGACY_AI_ADDON_PRICE = 'price_1TEbkYFvBYcaukPXPNfBZrre';

/**
 * Get the annual plan Stripe Price ID.
 * @param {object} env - Cloudflare Worker env bindings
 * @returns {string} Stripe Price ID
 */
export function getPriceId(env) {
  return env.STRIPE_ANNUAL_PRICE_ID;
}

/**
 * Reverse-map a Stripe Price ID back to a plan name.
 * Recognises both current and legacy price IDs so webhooks
 * continue to work for existing subscribers on old plans.
 * @param {string} priceId - Stripe Price ID
 * @param {object} env - Cloudflare Worker env bindings
 * @returns {string|null} Plan name or null if not recognised
 */
export function getPlanFromPriceId(priceId, env) {
  if (priceId === env.STRIPE_ANNUAL_PRICE_ID) return 'annual';
  if (priceId === LEGACY_ANNUAL_FLAT_PRICE) return 'annual';
  if (priceId === LEGACY_ANNUAL_PRICE) return 'annual';
  if (priceId === LEGACY_MONTHLY_PRICE) return 'monthly';
  if (priceId === LEGACY_TERMLY_PRICE) return 'termly';
  return null;
}

/**
 * Check whether a subscription includes the AI add-on.
 * Recognises both current and legacy AI add-on price IDs.
 * @param {object} subscription - Stripe Subscription object (with items expanded)
 * @param {object} env - Cloudflare Worker env bindings
 * @returns {boolean}
 */
export function hasAiAddon(subscription, env) {
  const addonPrices = [env.STRIPE_AI_ADDON_PRICE_ID, LEGACY_AI_ADDON_PRICE].filter(Boolean);
  return (subscription.items?.data || []).some((item) => addonPrices.includes(item.price?.id));
}
