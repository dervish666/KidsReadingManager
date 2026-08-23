import { describe, it, expect, vi } from 'vitest';
import { retryD1, isTransientD1Error, D1_RETRY_ATTEMPTS } from '../../utils/d1Retry.js';

/** The real signature that killed the badge cron on 2026-08-21. */
const TRANSIENT = new Error(
  'D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset.'
);
const OVERLOADED = new Error('D1_ERROR: D1 DB is overloaded. Requests queued for too long.');
const CONSTRAINT = new Error('D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT');

/** Fails `failures` times, then returns 'ok'. Counts its own calls. */
function flaky(failures, error = TRANSIENT) {
  const fn = vi.fn(async () => {
    if (fn.mock.calls.length <= failures) throw error;
    return 'ok';
  });
  return fn;
}

describe('isTransientD1Error', () => {
  it('recognises the errors Cloudflare has actually thrown at us', () => {
    expect(isTransientD1Error(TRANSIENT)).toBe(true);
    expect(isTransientD1Error(OVERLOADED)).toBe(true);
    expect(isTransientD1Error(new Error('D1_ERROR: internal error; reference = abc123'))).toBe(
      true
    );
    expect(isTransientD1Error(new Error('Network connection lost'))).toBe(true);
  });

  it('does not treat a constraint violation as transient just because it says D1_ERROR', () => {
    // The whole point: this arrives wrapped in the same D1_ERROR prefix as a
    // genuine wobble, and retrying it burns cron budget for a guaranteed fail.
    expect(isTransientD1Error(CONSTRAINT)).toBe(false);
    expect(isTransientD1Error(new Error('D1_ERROR: no such column: reading_level_override'))).toBe(
      false
    );
  });

  it('defaults an unrecognised error to non-transient', () => {
    // Retrying an unknown error three times is three times the damage if it
    // turns out not to be transient. The watchdog covers giving up too early.
    expect(isTransientD1Error(new Error('something else entirely'))).toBe(false);
    expect(isTransientD1Error(undefined)).toBe(false);
  });
});

describe('retryD1', () => {
  it('returns the value without retrying when the call succeeds', async () => {
    const fn = flaky(0);
    await expect(retryD1(fn, { baseDelayMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recovers from a transient failure', async () => {
    const fn = flaky(1);
    await expect(retryD1(fn, { baseDelayMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up on a constraint error immediately rather than spending the ladder', async () => {
    const fn = flaky(99, CONSTRAINT);
    await expect(retryD1(fn, { baseDelayMs: 0 })).rejects.toThrow('constraint failed');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('rethrows after exhausting its attempts — a retry that hid the failure would be worse', async () => {
    // Load-bearing: the cron must still fail, still reach Sentry, and still
    // trip the watchdog once the retries are spent.
    const fn = flaky(99);
    await expect(retryD1(fn, { baseDelayMs: 0 })).rejects.toThrow('exceeded timeout');
    expect(fn).toHaveBeenCalledTimes(D1_RETRY_ATTEMPTS);
  });

  it('stops retrying once the cron budget is spent', async () => {
    // The 2026-08-21 failure hung for 33 seconds before throwing. Retrying it
    // would have stacked a second and third hang on a job with a 22s budget.
    const fn = flaky(99);
    await expect(retryD1(fn, { baseDelayMs: 0, deadlineMs: Date.now() - 1 })).rejects.toThrow(
      'exceeded timeout'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calls the thunk afresh each attempt rather than awaiting one promise twice', async () => {
    let started = 0;
    const fn = async () => {
      started++;
      if (started < 2) throw OVERLOADED;
      return started;
    };
    await expect(retryD1(fn, { baseDelayMs: 0 })).resolves.toBe(2);
  });
});
