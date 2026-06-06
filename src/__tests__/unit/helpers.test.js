import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateId,
  getTodayDate,
  getReadingStatus,
  formatAssessmentDisplay,
} from '../../utils/helpers.js';

describe('generateId', () => {
  it('should generate a valid UUID v4 format', () => {
    const id = generateId();

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it('should generate unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('should have version 4 indicator in correct position', () => {
    const id = generateId();
    const parts = id.split('-');
    expect(parts[2][0]).toBe('4');
  });

  it('should have variant bits set correctly', () => {
    const id = generateId();
    const parts = id.split('-');
    const variantChar = parts[3][0].toLowerCase();
    expect(['8', '9', 'a', 'b']).toContain(variantChar);
  });
});

describe('getTodayDate', () => {
  it('should return date in YYYY-MM-DD format', () => {
    const date = getTodayDate();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('should return current date in local timezone', () => {
    const expected = new Date().toLocaleDateString('en-CA');
    expect(getTodayDate()).toBe(expected);
  });

  it('should respect explicit timezone', () => {
    const result = getTodayDate('UTC');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('getReadingStatus', () => {
  const defaultSettings = {
    readingStatusSettings: {
      recentlyReadDays: 3,
      needsAttentionDays: 7,
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return notRead when student has no lastReadDate', () => {
    const student = { name: 'Test' };
    expect(getReadingStatus(student, defaultSettings)).toBe('notRead');
  });

  it('should return notRead when student is null', () => {
    expect(getReadingStatus(null, defaultSettings)).toBe('notRead');
  });

  it('should return recentlyRead when read within threshold', () => {
    const student = { lastReadDate: '2024-06-13' }; // 2 days ago
    expect(getReadingStatus(student, defaultSettings)).toBe('recentlyRead');
  });

  it('should return recentlyRead when read today', () => {
    const student = { lastReadDate: '2024-06-15' }; // today
    expect(getReadingStatus(student, defaultSettings)).toBe('recentlyRead');
  });

  it('should return needsAttention when between thresholds', () => {
    const student = { lastReadDate: '2024-06-10' }; // 5 days ago
    expect(getReadingStatus(student, defaultSettings)).toBe('needsAttention');
  });

  it('should return notRead when beyond needsAttention threshold', () => {
    const student = { lastReadDate: '2024-06-01' }; // 14 days ago
    expect(getReadingStatus(student, defaultSettings)).toBe('notRead');
  });

  it('should handle edge case at recentlyRead boundary', () => {
    const student = { lastReadDate: '2024-06-12' }; // exactly 3 days ago
    expect(getReadingStatus(student, defaultSettings)).toBe('recentlyRead');
  });

  it('should handle edge case at needsAttention boundary', () => {
    const student = { lastReadDate: '2024-06-08' }; // exactly 7 days ago
    expect(getReadingStatus(student, defaultSettings)).toBe('needsAttention');
  });
});

describe('formatAssessmentDisplay', () => {
  it('should format integer assessment as N/10', () => {
    expect(formatAssessmentDisplay(7)).toBe('7/10');
  });
  it('should format min assessment', () => {
    expect(formatAssessmentDisplay(1)).toBe('1/10');
  });
  it('should format max assessment', () => {
    expect(formatAssessmentDisplay(10)).toBe('10/10');
  });
  it('should return null for null', () => {
    expect(formatAssessmentDisplay(null)).toBe(null);
  });
  it('should return null for undefined', () => {
    expect(formatAssessmentDisplay(undefined)).toBe(null);
  });
});
