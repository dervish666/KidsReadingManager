/**
 * Bounded retry for transient Cloudflare D1 failures.
 *
 * Some D1 errors are Cloudflare's, not ours. They arrive as an ordinary
 * rejection from `.run()`/`.all()`/`.batch()`, carry no typed code, and are
 * gone by the next attempt:
 *
 *   D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.
 *   D1_ERROR: D1 DB is overloaded. Requests queued for too long.
 *   D1_ERROR: internal error; reference = <handle>
 *
 * On a request path that hardly matters — the user retries. On a nightly cron
 * it costs a whole day, because the next attempt is 24 hours away. One of these
 * on the badge job's first SELECT on 2026-08-21 aborted the run before it
 * touched a single organisation, then produced 22 hourly watchdog alerts.
 *
 * The only retry ladder in this codebase used to live inside
 * `batchExec` in src/services/demoReset.js — the job whose next attempt is 60
 * minutes away. That is the inverted cost: the cheapest job to lose was the
 * only one protected. This file is that ladder, extracted, so the nightly jobs
 * get it too and there is one implementation rather than two.
 *
 * What this deliberately does NOT do:
 *
 *  - It never swallows. Exhaust the attempts and the last error is rethrown, so
 *    the cron still fails, still reaches Sentry, and still trips the watchdog.
 *    A retry that hid the failure would be worse than no retry.
 *  - It never retries a deterministic error. A constraint violation or a typo
 *    in the SQL will fail identically in 250ms, 500ms and 1s; retrying one only
 *    burns cron budget (measured at ~1.75s per failing chunk in demoReset).
 *  - It does not rescue a *hang*. The 2026-08-21 failure sat on one query for
 *    33 seconds before throwing, by which point the badge job was already past
 *    its own 22s budget. Pass `deadlineMs` and the retry stops rather than
 *    stacking another 33s wait on top. Fast transients are what this recovers.
 */

/**
 * Transient signatures, each seen in production. Keep the comments: they are
 * the evidence that the pattern belongs here rather than a guess about D1.
 */
const TRANSIENT_PATTERNS = [
  /storage operation exceeded timeout/i, // badge cron, 2026-08-21 02:31 UTC
  /object to be reset/i, // same error, tail half
  /DB is overloaded/i, // 6 events, 2026-08-09/10
  /internal error; reference =/i, // metadata poller, 2026-07-16 (58 in a row)
  /Network connection lost/i, // documented in CLAUDE.md gotchas
  /reset because its code was updated/i, // deploy racing an in-flight query
];

/**
 * Deterministic signatures. Checked FIRST, because "constraint failed" inside a
 * D1_ERROR string would otherwise look transient by association.
 */
const DETERMINISTIC_PATTERNS = [
  /SQLITE_CONSTRAINT|constraint failed/i,
  /no such table|no such column|no such index/i,
  /syntax error|malformed/i,
  /too many SQL variables|exceeds limit of/i,
];

/**
 * Is this error worth trying again?
 *
 * Unrecognised errors return false. That is the safe default: an unknown error
 * retried three times is three times the damage if it was not transient, and
 * the watchdog already covers the case where we gave up too early.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isTransientD1Error(error) {
  const message = error?.message || String(error || '');
  if (DETERMINISTIC_PATTERNS.some((re) => re.test(message))) return false;
  return TRANSIENT_PATTERNS.some((re) => re.test(message));
}

export const D1_RETRY_ATTEMPTS = 3;
export const D1_RETRY_BASE_DELAY_MS = 250;

/**
 * Run a D1 operation, retrying transient failures with exponential backoff.
 *
 * @param {() => Promise<T>} fn - The operation. Called afresh on each attempt,
 *   so pass a thunk, not a promise. D1 prepared statements are immutable and
 *   safe to execute more than once.
 * @param {object} [options]
 * @param {string} [options.label] - Context for the log lines. Worth setting:
 *   without it a retry line names no query and tells you nothing at 3am.
 * @param {number} [options.attempts] - Total attempts including the first.
 * @param {number} [options.baseDelayMs] - First backoff; doubles each retry.
 * @param {number} [options.deadlineMs] - Absolute `Date.now()` value. No new
 *   attempt starts past it. Pass the cron's budget deadline so a slow D1 cannot
 *   turn a bounded retry into an unbounded one.
 * @returns {Promise<T>}
 * @template T
 */
export async function retryD1(fn, options = {}) {
  const {
    label = 'd1',
    attempts = D1_RETRY_ATTEMPTS,
    baseDelayMs = D1_RETRY_BASE_DELAY_MS,
    deadlineMs = null,
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isTransientD1Error(error)) throw error;
      if (attempt === attempts) break;

      const delay = baseDelayMs * 2 ** (attempt - 1);

      // Budget check AFTER the delay is known, so the log says what we skipped.
      if (deadlineMs !== null && Date.now() + delay >= deadlineMs) {
        console.warn(
          `[D1Retry] ${label}: transient failure on attempt ${attempt}, no budget left to retry (${error?.message})`
        );
        throw error;
      }

      console.warn(
        `[D1Retry] ${label}: transient failure on attempt ${attempt}/${attempts}, retrying in ${delay}ms (${error?.message})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Exhausted. Rethrow so the caller fails exactly as it would have without us.
  console.error(`[D1Retry] ${label}: gave up after ${attempts} attempts:`, lastError?.message);
  throw lastError;
}
