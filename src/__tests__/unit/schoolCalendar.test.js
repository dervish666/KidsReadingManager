import { describe, it, expect } from 'vitest';
import {
  buildCalendarContext,
  describeCalendarStatus,
  formatLongDate,
} from '../../utils/schoolCalendar.js';

/**
 * The real Cheddar Grove Manual calendar, copied from production. Its 2025/26
 * year ends 17 July 2026 and no 2026/27 dates have been entered — which is the
 * exact state that produced the bad summary this module exists to prevent.
 */
const CHEDDAR_TERMS = [
  {
    academic_year: '2025/26',
    term_name: 'Autumn 1',
    start_date: '2025-09-02',
    end_date: '2025-10-24',
  },
  {
    academic_year: '2025/26',
    term_name: 'Autumn 2',
    start_date: '2025-11-03',
    end_date: '2025-12-19',
  },
  {
    academic_year: '2025/26',
    term_name: 'Spring 1',
    start_date: '2026-01-06',
    end_date: '2026-02-13',
  },
  {
    academic_year: '2025/26',
    term_name: 'Spring 2',
    start_date: '2026-02-23',
    end_date: '2026-04-02',
  },
  {
    academic_year: '2025/26',
    term_name: 'Summer 1',
    start_date: '2026-04-21',
    end_date: '2026-05-21',
  },
  {
    academic_year: '2025/26',
    term_name: 'Summer 2',
    start_date: '2026-06-01',
    end_date: '2026-07-17',
  },
];

describe('formatLongDate', () => {
  it('writes a date the way a head would read it', () => {
    expect(formatLongDate('2026-08-15')).toBe('Saturday 15 August 2026');
    expect(formatLongDate('2026-01-01')).toBe('Thursday 1 January 2026');
  });

  it('returns the input unchanged when it is not a date', () => {
    expect(formatLongDate('not-a-date')).toBe('not-a-date');
    expect(formatLongDate(null)).toBe('null');
  });
});

describe('buildCalendarContext — the summer holiday case', () => {
  // 15 August 2026: the day the first version reported a school-wide collapse.
  const cal = buildCalendarContext(CHEDDAR_TERMS, '2026-08-15');

  it('knows the school year has ended and no later dates exist', () => {
    expect(cal.status).toBe('after_last_known_term');
    expect(cal.currentTerm).toBeNull();
    expect(cal.nextTerm).toBeNull();
    expect(cal.previousTerm.name).toBe('Summer 2 2025/26');
    expect(cal.daysSinceTermEnded).toBe(29);
  });

  it('reports zero school days in the last fortnight', () => {
    expect(cal.schoolDaysInLast7).toBe(0);
    expect(cal.schoolDaysInLast14).toBe(0);
  });

  it('describes the position in words the model can quote', () => {
    const text = describeCalendarStatus(cal);
    expect(text).toContain('outside the school year');
    expect(text).toContain('Summer 2 2025/26');
    expect(text).toContain('Friday 17 July 2026');
    expect(text).toContain('29 days ago');
  });
});

describe('buildCalendarContext — term time', () => {
  const cal = buildCalendarContext(CHEDDAR_TERMS, '2026-06-17'); // a Wednesday in Summer 2

  it('identifies the current term', () => {
    expect(cal.status).toBe('in_term');
    expect(cal.currentTerm.name).toBe('Summer 2 2025/26');
  });

  it('counts a full fortnight of school days', () => {
    expect(cal.schoolDaysInLast7).toBe(5);
    expect(cal.schoolDaysInLast14).toBe(10);
  });
});

describe('buildCalendarContext — a half-term break', () => {
  // Between Spring 1 (ends 13 Feb) and Spring 2 (starts 23 Feb)
  const cal = buildCalendarContext(CHEDDAR_TERMS, '2026-02-18');

  it('sits between two terms and knows both', () => {
    expect(cal.status).toBe('break');
    expect(cal.previousTerm.name).toBe('Spring 1 2025/26');
    expect(cal.nextTerm.name).toBe('Spring 2 2025/26');
    expect(cal.daysSinceTermEnded).toBe(5);
    expect(cal.daysUntilTermStarts).toBe(5);
  });

  it('still counts the school days that fell before the break', () => {
    // Today is Wed 18 Feb. Term ran to Fri 13 Feb.
    // Last 14 days (5–18 Feb): Thu 5, Fri 6, Mon 9, Tue 10, Wed 11, Thu 12, Fri 13 = 7.
    // Last 7 days (12–18 Feb): Thu 12, Fri 13 = 2 — a short week, not a dead one.
    expect(cal.schoolDaysInLast14).toBe(7);
    expect(cal.schoolDaysInLast7).toBe(2);
  });
});

describe('buildCalendarContext — no term dates', () => {
  const cal = buildCalendarContext([], '2026-08-15');

  it('says it does not know rather than guessing term time', () => {
    expect(cal.hasTermDates).toBe(false);
    expect(cal.status).toBe('unknown');
    expect(describeCalendarStatus(cal)).toContain('has not entered its term dates');
  });

  it('still reports today', () => {
    expect(cal.today).toBe('2026-08-15');
    expect(cal.todayLong).toBe('Saturday 15 August 2026');
  });

  it('tolerates null and malformed input', () => {
    expect(() => buildCalendarContext(null, '2026-08-15')).not.toThrow();
    expect(() => buildCalendarContext([{}, null], '2026-08-15')).not.toThrow();
    expect(buildCalendarContext(undefined, '2026-08-15').status).toBe('unknown');
  });
});

describe('buildCalendarContext — before the calendar starts', () => {
  const cal = buildCalendarContext(CHEDDAR_TERMS, '2025-08-20');

  it('knows the first term has not begun', () => {
    expect(cal.status).toBe('before_first_known_term');
    expect(cal.nextTerm.name).toBe('Autumn 1 2025/26');
    expect(cal.daysUntilTermStarts).toBe(13);
    expect(cal.schoolDaysInLast14).toBe(0);
  });
});

describe('buildCalendarContext — ordering', () => {
  it('does not depend on the rows arriving sorted', () => {
    const shuffled = [...CHEDDAR_TERMS].reverse();
    const sorted = buildCalendarContext(CHEDDAR_TERMS, '2026-08-15');
    const unsorted = buildCalendarContext(shuffled, '2026-08-15');
    expect(unsorted).toEqual(sorted);
  });

  it('treats a term boundary day as inside the term', () => {
    expect(buildCalendarContext(CHEDDAR_TERMS, '2026-07-17').status).toBe('in_term');
    expect(buildCalendarContext(CHEDDAR_TERMS, '2026-07-18').status).toBe('after_last_known_term');
  });
});
