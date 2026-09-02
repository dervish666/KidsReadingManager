/**
 * The one place that says which models Tally is allowed to run.
 *
 * Every AI feature here (book recommendations, the stats summary) is a small
 * JSON-in, JSON-out job. It does not need a frontier model, and the cost gap
 * is not small: at the time of writing Anthropic's cheapest tier is $1/$5 per
 * million tokens and its most capable is $10/$50. Most schools run on the
 * platform key, which is the owner's money, so an expensive pick in a picker
 * is an expensive pick on Sam's card.
 *
 * So the rule is: only the provider's low-cost tier is ever offered or run.
 * Both ends enforce it. `filterCheapModels` trims every live model list
 * before a picker sees it, and `clampToCheapModel` is applied in
 * `resolveAiConfig` so a stored preference that pre-dates this rule, or a
 * hand-edited row, still cannot spend at frontier rates.
 *
 * The tier is matched by id pattern rather than a fixed list so a new model
 * in the same family (the next Haiku, the next nano) is allowed the day it
 * ships, without a deploy. Widen a pattern here and nowhere else.
 */

const CHEAP_MODEL_PATTERN = {
  anthropic: /haiku/i,
  openai: /(^|[-.])(nano|mini)([-.]|$)/i,
  google: /flash/i,
};

/** Used when a preference is missing or was clamped. Mirrors aiService's own defaults. */
export const CHEAP_DEFAULT_MODEL = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5.4-nano',
  google: 'gemini-2.5-flash',
};

/**
 * @param {string} provider - 'anthropic' | 'openai' | 'google'
 * @param {string|null|undefined} modelId
 * @returns {boolean} true when the id belongs to the provider's low-cost tier
 */
export function isCheapModel(provider, modelId) {
  const pattern = CHEAP_MODEL_PATTERN[provider];
  if (!pattern || !modelId) return false;
  return pattern.test(modelId);
}

/**
 * Trim a live model list to the low-cost tier. Order is preserved.
 *
 * @param {string} provider
 * @param {Array<{id: string, name?: string}>|null} models
 * @returns {Array<{id: string, name?: string}>|null} same shape; null passes through
 */
export function filterCheapModels(provider, models) {
  if (!Array.isArray(models)) return models;
  return models.filter((m) => isCheapModel(provider, m?.id));
}

/**
 * Return a model that is safe to run. A null/undefined preference becomes the
 * cheap default (the same one aiService would pick); a preference outside the
 * tier is replaced by it and reported so the caller can log it.
 *
 * @param {string} provider
 * @param {string|null|undefined} model
 * @returns {{model: string|null, clamped: boolean}}
 */
export function clampToCheapModel(provider, model) {
  if (!model) return { model: CHEAP_DEFAULT_MODEL[provider] || null, clamped: false };
  if (isCheapModel(provider, model)) return { model, clamped: false };
  return { model: CHEAP_DEFAULT_MODEL[provider] || null, clamped: true };
}
