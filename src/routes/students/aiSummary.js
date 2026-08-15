/**
 * Stats AI summary route.
 *
 *   POST /stats/ai-summary — turn the figures on the Stats page into a short
 *                            narrative briefing for a headteacher.
 *
 * Admin/owner only: this is a leadership tool, and it spends real money on a
 * provider call. `requireReadonly()` (used by GET /stats) would let a
 * view-only account drain the org's monthly AI budget.
 *
 * The client POSTs the figures it is currently displaying rather than the
 * server recomputing them. That is deliberate — two of the numbers on screen
 * (the reading-band spread and the needs-attention count) are derived in the
 * browser from `UIContext.getReadingStatus` and have no server endpoint, and
 * more importantly a summary that quotes different totals from the page it
 * sits on would be worse than no summary at all.
 *
 * That makes the body untrusted input, so it goes through
 * `sanitiseStatsPayload` before anything reaches a prompt — an allow-list that
 * coerces every number and drops everything it does not recognise. See the
 * privacy note at the top of services/statsSummaryService.js.
 */

import { Hono } from 'hono';
import { requireAdmin } from '../../middleware/tenant.js';
import { getDB, isMultiTenantMode } from '../../utils/routeHelpers.js';
import { badRequestError } from '../../middleware/errorHandler.js';
import { resolveAiConfig, buildFailoverChain } from '../../utils/aiProviderResolver.js';
import { checkAIBudget, recordAICall, getMonthlyLimit } from '../../utils/aiCostCap.js';
import { redactKeyMaterial } from '../../services/aiService.js';
import { buildCalendarContext } from '../../utils/schoolCalendar.js';
import { getTodayDate } from '../../utils/helpers.js';
import {
  sanitiseStatsPayload,
  hasTooLittleData,
  tooLittleDataReason,
  generateStatsSummaryWithFailover,
  MIN_COHORT_SIZE,
  STATS_SUMMARY_PROMPT_VERSION,
} from '../../services/statsSummaryService.js';

const aiSummaryRouter = new Hono();

const CACHE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Where the school sits in its own year, and what "today" is. Read server-side
 * rather than taken from the request: the calendar is the thing that decides
 * whether a quiet fortnight is a crisis or a summer holiday, so it must not be
 * something the caller can assert.
 *
 * All academic years are loaded, not just the current one. `term_dates` is
 * queried elsewhere via a current-academic-year filter, and that helper rolls
 * over on 1 August — so in August a school that has not yet entered next year's
 * dates would look like it had no calendar at all, precisely when knowing it is
 * the summer holiday matters most.
 */
async function loadCalendar(db, organizationId) {
  // Org timezone, same source and shape as students/stats.js. A school just
  // over a date boundary should get the same "today" the figures were built for.
  let timezone = 'UTC';
  try {
    const tzRow = await db
      .prepare(
        `SELECT setting_value FROM org_settings WHERE organization_id = ? AND setting_key = 'timezone'`
      )
      .bind(organizationId)
      .first();
    if (tzRow?.setting_value) {
      let parsed;
      try {
        parsed = JSON.parse(tzRow.setting_value);
      } catch {
        parsed = tzRow.setting_value;
      }
      if (typeof parsed === 'string' && parsed.length > 0) timezone = parsed;
    }
  } catch {
    /* use UTC */
  }

  const todayLocal = getTodayDate(timezone);
  try {
    const rows = await db
      .prepare(
        `SELECT academic_year, term_name, start_date, end_date
         FROM term_dates WHERE organization_id = ? ORDER BY start_date`
      )
      .bind(organizationId)
      .all();
    return buildCalendarContext(rows.results || [], todayLocal);
  } catch (error) {
    // A calendar we cannot read is reported as absent, not as "in term" —
    // the prompt then tells the model it cannot judge holidays, rather than
    // silently letting it assume school is running.
    console.warn('[stats-summary] term dates unreadable:', error?.message);
    return buildCalendarContext([], todayLocal);
  }
}

/**
 * Cache key is a hash of the *sanitised payload itself*, so the figures
 * changing is the invalidation — no TTL guesswork, and clicking the button
 * twice on an unchanged page is free. Org id is included so two schools with
 * coincidentally identical numbers never share a summary.
 *
 * The calendar is in the key too. Without it, a school on a long holiday has
 * byte-identical figures from one week to the next (nothing is being logged),
 * so day 20 of the break would be served the summary written on day 3.
 */
async function summaryCacheKey(organizationId, safe, calendar) {
  const normalised = JSON.stringify({
    organizationId,
    promptVersion: STATS_SUMMARY_PROMPT_VERSION,
    payload: safe,
    calendar: {
      today: calendar?.today ?? null,
      status: calendar?.status ?? null,
      schoolDaysInLast14: calendar?.schoolDaysInLast14 ?? null,
    },
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalised));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `stats-summary:${hex}`;
}

/** Fail-open: a cache miss and a cache outage are both just "generate it". */
async function readCache(env, key) {
  if (!env.RECOMMENDATIONS_CACHE) return null;
  try {
    const raw = await env.RECOMMENDATIONS_CACHE.get(key);
    return raw ? { ...JSON.parse(raw), cached: true } : null;
  } catch (error) {
    console.warn('[stats-summary] cache read failed:', error?.message);
    return null;
  }
}

async function writeCache(env, key, value) {
  if (!env.RECOMMENDATIONS_CACHE) return;
  try {
    await env.RECOMMENDATIONS_CACHE.put(key, JSON.stringify(value), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch (error) {
    console.warn('[stats-summary] cache write failed:', error?.message);
  }
}

aiSummaryRouter.post('/stats/ai-summary', requireAdmin(), async (c) => {
  if (!isMultiTenantMode(c)) {
    throw badRequestError('Multi-tenant mode required for AI summaries');
  }

  const db = getDB(c.env);
  const organizationId = c.get('organizationId');
  if (!organizationId || !db) {
    throw badRequestError('Multi-tenant mode required for AI summaries');
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    throw badRequestError('A JSON body of stats figures is required');
  }

  // School name and timezone come from the org row, never the request body.
  const org = await db
    .prepare(`SELECT name FROM organizations WHERE id = ?`)
    .bind(organizationId)
    .first();

  const safe = sanitiseStatsPayload(body?.stats, { schoolName: org?.name });

  // Refuse before spending anything, and before any provider sees the figures.
  // Two cases: nothing to describe (an empty table is an invitation to invent a
  // trend), and a cohort small enough that "aggregate" figures would describe
  // individual children.
  if (hasTooLittleData(safe)) {
    const reason = tooLittleDataReason(safe);
    return c.json({
      summary: {
        headline:
          reason === 'cohort_too_small'
            ? `Too few pupils in view to summarise (${safe.totalStudents}).`
            : 'Not enough reading has been logged yet to summarise.',
        highlights: [],
        watchOuts: [],
        suggestedActions: [
          reason === 'cohort_too_small'
            ? `Summaries need at least ${MIN_COHORT_SIZE} pupils in view, so the figures describe a group rather than one child. Widen the class filter and try again.`
            : 'Log a few reading sessions, then come back — the summary needs some activity to describe.',
        ],
        notes: [],
      },
      scope: safe.scope,
      code: reason === 'cohort_too_small' ? 'COHORT_TOO_SMALL' : 'NO_ACTIVITY',
      generated: false,
      cached: false,
    });
  }

  // Entitlement runs BEFORE the cache read, deliberately. A cache hit is still
  // delivery of an AI-generated product, so an org whose add-on was switched
  // off (or whose key was removed) must stop getting them immediately rather
  // than for another 24 hours.
  const aiConfig = await resolveAiConfig({
    db,
    env: c.env,
    organizationId,
    notEntitledMessage: 'AI summaries are not enabled for this organisation.',
  });

  const calendar = await loadCalendar(db, organizationId);
  const cacheKey = await summaryCacheKey(organizationId, safe, calendar);
  // `regenerate` skips the read but still writes, so the "Write it again"
  // button can escape a bad reply. Without it the key — a hash of the figures —
  // would return the identical bad reply for 24 hours.
  if (!body?.regenerate) {
    const cached = await readCache(c.env, cacheKey);
    if (cached) {
      return c.json({ ...cached, scope: safe.scope, generated: true });
    }
  }

  // Shares the org's monthly AI bucket with book recommendations — one budget
  // per school, not one per feature. Same response shape as the
  // recommendations route so the client can special-case the code.
  const budget = await checkAIBudget(db, organizationId, getMonthlyLimit(c.env));
  if (!budget.allowed) {
    return c.json(
      {
        error: `Monthly AI limit reached (${budget.used}/${budget.limit} calls for ${budget.period}). It resets at the start of next month, or contact support to raise the limit.`,
        code: 'AI_BUDGET_EXCEEDED',
        used: budget.used,
        limit: budget.limit,
        period: budget.period,
      },
      429
    );
  }

  const aiConfigs = await buildFailoverChain({ db, env: c.env, primary: aiConfig });

  let result;
  try {
    result = await generateStatsSummaryWithFailover(safe, aiConfigs, null, calendar);
  } catch (error) {
    // The aggregate error text concatenates each provider's own message, and
    // upstream auth errors echo masked key fragments — redact before it reaches
    // Sentry Logs via consoleLoggingIntegration.
    console.error('[stats-summary] all providers failed:', redactKeyMaterial(error?.message));
    // Returned, not thrown: errorHandler sanitises every 5xx body to
    // "Internal Server Error", so a thrown serverError() would discard this
    // message. 503 also tells the client it is worth retrying.
    return c.json(
      {
        error: 'Could not generate a summary just now. Please try again shortly.',
        code: 'AI_PROVIDERS_UNAVAILABLE',
      },
      503
    );
  }

  // Record the spend before responding, and awaited rather than fire-and-forget,
  // so the count is durable before the client can click again. This narrows the
  // check/record window but does not close it — D1 gives no transaction across
  // the SELECT above and this UPSERT, so genuinely simultaneous requests can
  // both pass a check at the limit. costRateLimit(5) in worker.js is what bounds
  // the overshoot; the monthly cap is a budget, not a hard ceiling.
  await recordAICall(db, organizationId);

  const { provider, degraded, ...summary } = result;
  const payload = { summary, provider, degraded: Boolean(degraded) };
  // Never cache a degraded reply. It is a provider hiccup, not a fact about
  // these figures, and the key is a hash of the figures — so caching it would
  // pin the mistake in place for 24h for everyone who views the same scope.
  if (!degraded) {
    await writeCache(c.env, cacheKey, payload);
  }

  return c.json({ ...payload, scope: safe.scope, generated: true, cached: false });
});

export { aiSummaryRouter };
