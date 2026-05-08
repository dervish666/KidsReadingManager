/**
 * Per-organization AI cost cap.
 *
 * Bounds monthly AI-recommendation spend. Today the only ceiling on
 * authenticated users is the generic 10 req/min `costRateLimit` —
 * sustained legitimate or hostile usage at that rate will run up real
 * Anthropic / OpenAI / Google token spend against a per-pupil-priced
 * product where unit revenue is far less than at-rate spend.
 *
 * Implementation is intentionally simple: a monthly call-counter per
 * org. Token-level accounting (split prompt vs completion tokens, model
 * tier weighting) can be added later without schema change.
 *
 * Usage flow in the route:
 *   const limit = getMonthlyLimit(c.env);
 *   const budget = await checkAIBudget(db, orgId, limit);
 *   if (!budget.allowed) return 429;
 *   const result = await generateBroadSuggestions(...);
 *   await recordAICall(db, orgId);  // post-success only
 */

/**
 * Default monthly call cap per organization. Overridable via
 * AI_MONTHLY_CALL_LIMIT env var. 500 calls/month is a generous ceiling
 * for a single school; the typical pattern is a teacher requesting
 * recommendations for ~5 students per week × 4 weeks = ~20 calls/month.
 * Anything above 500 is either a bug, a stress event, or abuse.
 */
export const DEFAULT_MONTHLY_CALL_LIMIT = 500;

/**
 * Resolve the active monthly limit. Reads `AI_MONTHLY_CALL_LIMIT` from the
 * Worker env if present and parseable; falls back to the default.
 *
 * @param {Object} env - Cloudflare Worker env bindings
 * @returns {number}
 */
export function getMonthlyLimit(env) {
  const raw = env?.AI_MONTHLY_CALL_LIMIT;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_MONTHLY_CALL_LIMIT;
  const parsed = parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_MONTHLY_CALL_LIMIT;
}

/**
 * Get the current monthly bucket key in 'YYYY-MM' UTC format.
 * @param {Date} [now] - Override clock (for tests)
 */
export function getCurrentPeriod(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Check the current month's AI budget for an org. Read-only.
 *
 * Returns `{ allowed, used, limit, period }`. Caller should reject 429
 * with a clear message when `allowed: false`. Failures during the read
 * fail-open — we'd rather over-bill on a freak D1 outage than block all
 * AI for every org. Sentry breadcrumb on read failure for observability.
 *
 * @param {Object} db - D1 binding
 * @param {string} orgId - Organization id
 * @param {number} limit - Monthly call ceiling
 * @returns {Promise<{allowed: boolean, used: number, limit: number, period: string}>}
 */
export async function checkAIBudget(db, orgId, limit) {
  const period = getCurrentPeriod();
  try {
    const row = await db
      .prepare(
        'SELECT call_count FROM organization_ai_usage WHERE organization_id = ? AND period_start = ?'
      )
      .bind(orgId, period)
      .first();
    const used = row?.call_count ?? 0;
    return { allowed: used < limit, used, limit, period };
  } catch (err) {
    console.error('[aiCostCap] budget read failed; failing open:', err.message);
    return { allowed: true, used: 0, limit, period };
  }
}

/**
 * Increment the current month's call counter for an org. Idempotent at
 * the SQL level (UPSERT). Fail-open on write errors — we don't want to
 * 5xx an otherwise-successful AI request because the accounting step
 * faltered. Sentry breadcrumb on failure.
 *
 * @param {Object} db - D1 binding
 * @param {string} orgId - Organization id
 * @returns {Promise<void>}
 */
export async function recordAICall(db, orgId) {
  const period = getCurrentPeriod();
  try {
    await db
      .prepare(
        `INSERT INTO organization_ai_usage (organization_id, period_start, call_count, last_call_at)
         VALUES (?, ?, 1, datetime('now'))
         ON CONFLICT(organization_id, period_start) DO UPDATE SET
           call_count = call_count + 1,
           last_call_at = datetime('now')`
      )
      .bind(orgId, period)
      .run();
  } catch (err) {
    console.error('[aiCostCap] usage write failed:', err.message);
  }
}
