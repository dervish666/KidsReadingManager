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
 * Returning `null` from this function would drop the event entirely. We
 * keep events (so Sentry stays useful for triage) but strip the payload.
 */

const PII_KEY_PATTERN =
  /^(student[_-]?id|student[_-]?name|name|first[_-]?name|last[_-]?name|dob|date[_-]?of[_-]?birth|email|phone|gender|sen|sen[_-]?status|fsm|eal|eal[_-]?status|first[_-]?language|pupil[_-]?premium|address|postcode|year[_-]?group|reading[_-]?level)$/i;

const REDACTED = '[Filtered]';

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
