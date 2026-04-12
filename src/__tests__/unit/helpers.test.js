import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateId,
  getTodayDate,
  getReadingStatus,
  sortStudentsByPriority,
  getPrioritizedStudents,
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

describe('sortStudentsByPriority', () => {
  it('should sort students with null lastReadDate first', () => {
    const students = [
      { name: 'A', lastReadDate: '2024-01-15' },
      { name: 'B', lastReadDate: null },
      { name: 'C', lastReadDate: '2024-01-10' },
    ];

    const sorted = sortStudentsByPriority(students);

    expect(sorted[0].name).toBe('B');
  });

  it('should sort students by oldest read date first', () => {
    const students = [
      { name: 'A', lastReadDate: '2024-01-15' },
      { name: 'B', lastReadDate: '2024-01-10' },
      { name: 'C', lastReadDate: '2024-01-20' },
    ];

    const sorted = sortStudentsByPriority(students);

    expect(sorted[0].name).toBe('B');
    expect(sorted[1].name).toBe('A');
    expect(sorted[2].name).toBe('C');
  });

  it('should not mutate original array', () => {
    const students = [
      { name: 'A', lastReadDate: '2024-01-15' },
      { name: 'B', lastReadDate: '2024-01-10' },
    ];
    const originalFirst = students[0];

    sortStudentsByPriority(students);

    expect(students[0]).toBe(originalFirst);
  });

  it('should handle empty array', () => {
    const sorted = sortStudentsByPriority([]);
    expect(sorted).toEqual([]);
  });

  it('should handle all null dates', () => {
    const students = [
      { name: 'A', lastReadDate: null },
      { name: 'B', lastReadDate: null },
    ];

    const sorted = sortStudentsByPriority(students);
    expect(sorted).toHaveLength(2);
  });
});

describe('getPrioritizedStudents', () => {
  it('should return top N students by priority', () => {
    const students = [
      { name: 'A', lastReadDate: '2024-01-15', totalSessionCount: 0 },
      { name: 'B', lastReadDate: '2024-01-10', totalSessionCount: 0 },
      { name: 'C', lastReadDate: '2024-01-20', totalSessionCount: 0 },
    ];

    const prioritized = getPrioritizedStudents(students, 2);

    expect(prioritized).toHaveLength(2);
    expect(prioritized[0].name).toBe('B');
    expect(prioritized[1].name).toBe('A');
  });

  it('should return all students if count exceeds length', () => {
    const students = [{ name: 'A', lastReadDate: null, totalSessionCount: 0 }];

    const prioritized = getPrioritizedStudents(students, 5);

    expect(prioritized).toHaveLength(1);
  });

  it('should prioritize students without read date', () => {
    const students = [
      { name: 'A', lastReadDate: '2024-01-15', totalSessionCount: 0 },
      { name: 'B', lastReadDate: null, totalSessionCount: 0 },
    ];

    const prioritized = getPrioritizedStudents(students, 2);

    expect(prioritized[0].name).toBe('B');
  });

  it('should use session count as tiebreaker', () => {
    const students = [
      { name: 'A', lastReadDate: null, totalSessionCount: 3 },
      { name: 'B', lastReadDate: null, totalSessionCount: 1 },
    ];

    const prioritized = getPrioritizedStudents(students, 2);

    expect(prioritized[0].name).toBe('B'); // fewer sessions = higher priority
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
