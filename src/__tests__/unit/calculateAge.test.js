import { describe, it, expect, vi, afterEach } from 'vitest';
import { calculateAge } from '../../utils/calculateAge.js';

describe('calculateAge', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns age in years for a past date', () => {
    vi.setSystemTime(new Date('2026-03-25'));
    expect(calculateAge('2014-06-15')).toBe(11);
  });

  it('returns age correctly on birthday', () => {
    vi.setSystemTime(new Date('2026-03-25'));
    expect(calculateAge('2014-03-25')).toBe(12);
  });

  it('returns age correctly day before birthday', () => {
    vi.setSystemTime(new Date('2026-03-24'));
    expect(calculateAge('2014-03-25')).toBe(11);
  });

  it('returns null for null/undefined input', () => {
    expect(calculateAge(null)).toBeNull();
    expect(calculateAge(undefined)).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(calculateAge('not-a-date')).toBeNull();
  });
});
