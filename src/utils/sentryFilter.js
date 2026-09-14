/**
 * Sentry event scrubber.
 *
 * Tally is a children's-data product: protected characteristics (DOB,
 * gender, EAL/SEN/FSM/pupil-premium status) and student names cannot
 * casually leave the user's browser to a third-party telemetry vendor.
 *
 * `scrubSentryEvent` runs as Sentry's `beforeSend` / `beforeSendTransaction`
 * hook. It walks the outgoing event tree and redacts any string field whose
 * key looks PII-like, plus request bodies and breadcrumb payloads. Falls
 * back to "safe" rather than "permissive": we'd rather over-redact than
 * leak.
 *
 * Returning `null` from this function drops the event entirely. For real
 * users we keep events (so Sentry stays useful for triage) and strip only the
 * payload. Crawlers are the one exception, see `isCrawlerUserAgent` below.
 */

const PII_KEY_PATTERN =
  /^(student[_-]?id|student[_-]?name|name|first[_-]?name|last[_-]?name|dob|date[_-]?of[_-]?birth|email|phone|gender|sen|sen[_-]?status|fsm|eal|eal[_-]?status|first[_-]?language|pupil[_-]?premium|address|postcode|year[_-]?group|reading[_-]?level)$/i;

const REDACTED = '[Filtered]';

/**
 * Search-engine and social crawlers, which are not users and must not page us.
 *
 * The landing page is a lazy chunk, so a crawler that starts fetching the page
 * and then abandons it produces a genuine-looking "Loading CSS chunk 12
 * failed" against a URL that is live and serving 200. That is TALLY-READING-J
 * (13 Sep 2026): one event, one "user", browser `bingbot 2.0`, on the current
 * release, pointing at an asset that was fine. It read as a broken deploy
 * hitting real visitors and cost an afternoon to disprove.
 *
 * Matching on a bare /bot/ would also catch Cubot, a real Android handset a
 * teacher might be holding, so the token has to be followed by a delimiter or
 * end the string: `bingbot/2.0` and `AhrefsBot;` match, `CUBOT_NOTE_20` does
 * not. Sentry's own "Filter out known web crawlers" inbound filter covers the
 * same ground server-side and is worth having on as well. This is the half we
 * can see in the repo and test.
 */
const CRAWLER_UA_PATTERN =
  /(?:bot|crawler|spider|slurp)(?:[-/\s;)]|$)|facebookexternalhit|bytespider|headlesschrome|chrome-lighthouse/i;

export function isCrawlerUserAgent(userAgent) {
  if (typeof userAgent !== 'string' || userAgent.length === 0) return false;
  return CRAWLER_UA_PATTERN.test(userAgent);
}

function scrubObject(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 6) return REDACTED;

  if (Array.isArray(value)) {
    return value.map((item) => scrubObject(item, depth + 1));
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (PII_KEY_PATTERN.test(k)) {
        out[k] = REDACTED;
      } else {
        out[k] = scrubObject(v, depth + 1);
      }
    }
    return out;
  }

  return value;
}

export function scrubSentryEvent(event) {
  if (!event) return event;

  // Drop crawler traffic outright. A bot cannot be helped by us fixing its
  // error, and one bot event in an otherwise quiet stream reads as an incident.
  if (typeof navigator !== 'undefined' && isCrawlerUserAgent(navigator.userAgent)) {
    return null;
  }

  if (event.extra) event.extra = scrubObject(event.extra);
  if (event.contexts) event.contexts = scrubObject(event.contexts);
  if (event.tags) event.tags = scrubObject(event.tags);

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      data: b?.data ? scrubObject(b.data) : b?.data,
      message: typeof b?.message === 'string' ? b.message.slice(0, 200) : b?.message,
    }));
  }

  if (event.request) {
    if (event.request.data !== undefined) {
      event.request.data = scrubObject(event.request.data);
    }
    // URLs sometimes carry student IDs as path segments — we keep the URL
    // for debugging but the IDs themselves are opaque UUIDs, not PII.
  }

  if (event.user) {
    event.user = scrubObject(event.user);
  }

  return event;
}
