import { describe, it, expect } from 'vitest';
import { normalizeSubscriptionStatus } from '../../routes/stripeWebhook.js';

describe('normalizeSubscriptionStatus', () => {
  it('should convert "canceled" (American) to "cancelled" (British)', () => {
    expect(normalizeSubscriptionStatus('canceled')).toBe('cancelled');
  });

  it('should preserve "cancelled" unchanged', () => {
    expect(normalizeSubscriptionStatus('cancelled')).toBe('cancelled');
  });

  it('should pass through other statuses unchanged', () => {
    expect(normalizeSubscriptionStatus('active')).toBe('active');
    expect(normalizeSubscriptionStatus('trialing')).toBe('trialing');
    expect(normalizeSubscriptionStatus('past_due')).toBe('past_due');
  });
});
