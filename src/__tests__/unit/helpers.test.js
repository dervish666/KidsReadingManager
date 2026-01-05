import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateId,
  getTodayDate,
  getReadingStatus,
  sortStudentsByPriority,
  getPrioritizedStudents,
  updateLastReadDate,
  formatErrorResponse,
  formatSuccessResponse,
  formatAssessmentDisplay
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

  it('should return current date', () => {
    const expected = new Date().toISOString().split('T')[0];
    expect(getTodayDate()).toBe(expected);
  });
});

describe('getReadingStatus', () => {
  const defaultSettings = {
    readingStatusSettings: {
      recentlyReadDays: 3,
      needsAttentionDays: 7
    }
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
      { name: 'C', lastReadDate: '2024-01-10' }
    ];

    const sorted = sortStudentsByPriority(students);

    expect(sorted[0].name).toBe('B');
  });

  it('should sort students by oldest read date first', () => {
    const students = [
      { name: 'A', lastReadDate: '2024-01-15' },
      { name: 'B', lastReadDate: '2024-01-10' },
      { name: 'C', lastReadDate: '2024-01-20' }
    ];

    const sorted = sortStudentsByPriority(students);

    expect(sorted[0].name).toBe('B');
    expect(sorted[1].name).toBe('A');
    expect(sorted[2].name).toBe('C');
  });

  it('should not mutate original array', () => {
    const students = [
      { name: 'A', lastReadDate: '2024-01-15' },
      { name: 'B', lastReadDate: '2024-01-10' }
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
      { name: 'B', lastReadDate: null }
    ];

    const sorted = sortStudentsByPriority(students);
    expect(sorted).toHaveLength(2);
  });
});

describe('getPrioritizedStudents', () => {
  it('should return top N students by priority', () => {
    const students = [
      { name: 'A', lastReadDate: '2024-01-15', readingSessions: [] },
      { name: 'B', lastReadDate: '2024-01-10', readingSessions: [] },
      { name: 'C', lastReadDate: '2024-01-20', readingSessions: [] }
    ];

    const prioritized = getPrioritizedStudents(students, 2);

    expect(prioritized).toHaveLength(2);
    expect(prioritized[0].name).toBe('B');
    expect(prioritized[1].name).toBe('A');
  });

  it('should return all students if count exceeds length', () => {
    const students = [{ name: 'A', lastReadDate: null, readingSessions: [] }];

    const prioritized = getPrioritizedStudents(students, 5);

    expect(prioritized).toHaveLength(1);
  });

  it('should prioritize students without read date', () => {
    const students = [
      { name: 'A', lastReadDate: '2024-01-15', readingSessions: [] },
      { name: 'B', lastReadDate: null, readingSessions: [] }
    ];

    const prioritized = getPrioritizedStudents(students, 2);

    expect(prioritized[0].name).toBe('B');
  });

  it('should use session count as tiebreaker', () => {
    const students = [
      { name: 'A', lastReadDate: null, readingSessions: [1, 2, 3] },
      { name: 'B', lastReadDate: null, readingSessions: [1] }
    ];

    const prioritized = getPrioritizedStudents(students, 2);

    expect(prioritized[0].name).toBe('B'); // fewer sessions = higher priority
  });
});

describe('updateLastReadDate', () => {
  it('should return null lastReadDate when no sessions', () => {
    const student = { name: 'Test', readingSessions: [] };
    const updated = updateLastReadDate(student);

    expect(updated.lastReadDate).toBeNull();
  });

  it('should return null when readingSessions is undefined', () => {
    const student = { name: 'Test' };
    const updated = updateLastReadDate(student);

    expect(updated.lastReadDate).toBeNull();
  });

  it('should find most recent session date', () => {
    const student = {
      name: 'Test',
      readingSessions: [
        { date: '2024-01-10' },
        { date: '2024-01-20' },
        { date: '2024-01-15' }
      ]
    };

    const updated = updateLastReadDate(student);

    expect(updated.lastReadDate).toBe('2024-01-20');
  });

  it('should skip sessions without date', () => {
    const student = {
      name: 'Test',
      readingSessions: [
        { date: '2024-01-10' },
        { id: '1' }, // no date
        { date: '2024-01-05' }
      ]
    };

    const updated = updateLastReadDate(student);

    expect(updated.lastReadDate).toBe('2024-01-10');
  });

  it('should not mutate original student', () => {
    const student = {
      name: 'Test',
      readingSessions: [{ date: '2024-01-10' }]
    };

    const updated = updateLastReadDate(student);

    expect(updated).not.toBe(student);
    expect(student.lastReadDate).toBeUndefined();
  });
});

describe('formatErrorResponse', () => {
  it('should format error with default status', () => {
    const response = formatErrorResponse('Something went wrong');

    expect(response.status).toBe('error');
    expect(response.message).toBe('Something went wrong');
    expect(response.code).toBe(400);
  });

  it('should format error with custom status', () => {
    const response = formatErrorResponse('Not found', 404);

    expect(response.code).toBe(404);
  });
});

describe('formatSuccessResponse', () => {
  it('should format success with data and default message', () => {
    const data = { id: 1 };
    const response = formatSuccessResponse(data);

    expect(response.status).toBe('success');
    expect(response.message).toBe('Success');
    expect(response.data).toEqual({ id: 1 });
  });

  it('should format success with custom message', () => {
    const response = formatSuccessResponse({ id: 1 }, 'Created successfully');

    expect(response.message).toBe('Created successfully');
  });
});

describe('formatAssessmentDisplay', () => {
  it('should format struggling', () => {
    expect(formatAssessmentDisplay('struggling')).toBe('Needing Help');
  });

  it('should format needs_help', () => {
    expect(formatAssessmentDisplay('needs_help')).toBe('Moderate Help');
  });

  it('should format independent', () => {
    expect(formatAssessmentDisplay('independent')).toBe('Independent');
  });

  it('should return unknown assessments as-is', () => {
    expect(formatAssessmentDisplay('custom')).toBe('custom');
  });

  it('should handle undefined', () => {
    expect(formatAssessmentDisplay(undefined)).toBe(undefined);
  });
});
