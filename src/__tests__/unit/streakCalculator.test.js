import { describe, it, expect } from 'vitest';
import {
  calculateStreak,
  getDateString,
  getUniqueReadingDates,
  daysBetween,
  wouldExtendStreak
} from '../../utils/streakCalculator';

describe('streakCalculator', () => {
  describe('getDateString', () => {
    it('should convert date to YYYY-MM-DD format', () => {
      const date = new Date('2025-01-09T12:00:00Z');
      expect(getDateString(date, 'UTC')).toBe('2025-01-09');
    });

    it('should handle string dates', () => {
      expect(getDateString('2025-01-09', 'UTC')).toBe('2025-01-09');
    });
  });

  describe('daysBetween', () => {
    it('should calculate days between two dates', () => {
      expect(daysBetween('2025-01-01', '2025-01-05')).toBe(4);
      expect(daysBetween('2025-01-05', '2025-01-01')).toBe(4);
    });

    it('should return 0 for same day', () => {
      expect(daysBetween('2025-01-09', '2025-01-09')).toBe(0);
    });

    it('should handle consecutive days', () => {
      expect(daysBetween('2025-01-08', '2025-01-09')).toBe(1);
    });
  });

  describe('getUniqueReadingDates', () => {
    it('should return unique dates sorted descending', () => {
      const sessions = [
        { date: '2025-01-05' },
        { date: '2025-01-09' },
        { date: '2025-01-05' }, // Duplicate
        { date: '2025-01-07' }
      ];
      const result = getUniqueReadingDates(sessions, 'UTC');
      expect(result).toEqual(['2025-01-09', '2025-01-07', '2025-01-05']);
    });

    it('should return empty array for empty sessions', () => {
      expect(getUniqueReadingDates([], 'UTC')).toEqual([]);
      expect(getUniqueReadingDates(null, 'UTC')).toEqual([]);
    });
  });

  describe('calculateStreak', () => {
    // Use a fixed reference date for testing
    const referenceDate = new Date('2025-01-09');

    it('should return zeros for no sessions', () => {
      const result = calculateStreak([], { referenceDate });
      expect(result).toEqual({
        currentStreak: 0,
        longestStreak: 0,
        streakStartDate: null,
        lastReadDate: null
      });
    });

    it('should calculate streak for consecutive days', () => {
      const sessions = [
        { date: '2025-01-09' },
        { date: '2025-01-08' },
        { date: '2025-01-07' }
      ];
      const result = calculateStreak(sessions, { referenceDate, gracePeriodDays: 0 });
      expect(result.currentStreak).toBe(3);
      expect(result.longestStreak).toBe(3);
      expect(result.streakStartDate).toBe('2025-01-07');
      expect(result.lastReadDate).toBe('2025-01-09');
    });

    it('should handle grace period of 1 day', () => {
      // Read on 9th, skipped 8th, read on 7th - still a streak with 1-day grace
      const sessions = [
        { date: '2025-01-09' },
        { date: '2025-01-07' } // Skipped 8th
      ];
      const result = calculateStreak(sessions, { referenceDate, gracePeriodDays: 1 });
      expect(result.currentStreak).toBe(2);
    });

    it('should break streak when gap exceeds grace period', () => {
      // Read on 9th, then 6th - 3 day gap with 1-day grace should break
      const sessions = [
        { date: '2025-01-09' },
        { date: '2025-01-06' } // 3 day gap
      ];
      const result = calculateStreak(sessions, { referenceDate, gracePeriodDays: 1 });
      expect(result.currentStreak).toBe(1);
      expect(result.longestStreak).toBe(1);
    });

    it('should track longest streak separately from current', () => {
      // Had a 5-day streak in the past, but current is only 2
      const sessions = [
        { date: '2025-01-09' },
        { date: '2025-01-08' },
        // Gap
        { date: '2025-01-01' },
        { date: '2024-12-31' },
        { date: '2024-12-30' },
        { date: '2024-12-29' },
        { date: '2024-12-28' }
      ];
      const result = calculateStreak(sessions, { referenceDate, gracePeriodDays: 0 });
      expect(result.currentStreak).toBe(2);
      expect(result.longestStreak).toBe(5);
    });

    it('should handle multiple sessions on same day', () => {
      const sessions = [
        { date: '2025-01-09' },
        { date: '2025-01-09' }, // Same day
        { date: '2025-01-08' },
        { date: '2025-01-08' }  // Same day
      ];
      const result = calculateStreak(sessions, { referenceDate, gracePeriodDays: 0 });
      expect(result.currentStreak).toBe(2); // Only 2 unique days
    });

    it('should return 0 current streak if last read was too long ago', () => {
      // Last read was 5 days ago with 1-day grace period
      const sessions = [
        { date: '2025-01-04' } // 5 days before reference
      ];
      const result = calculateStreak(sessions, { referenceDate, gracePeriodDays: 1 });
      expect(result.currentStreak).toBe(0);
      expect(result.longestStreak).toBe(1);
      expect(result.lastReadDate).toBe('2025-01-04');
    });

    it('should handle reading today starting a new streak', () => {
      const sessions = [
        { date: '2025-01-09' } // Today
      ];
      const result = calculateStreak(sessions, { referenceDate, gracePeriodDays: 1 });
      expect(result.currentStreak).toBe(1);
    });

    it('should work with larger grace periods', () => {
      // Read on 9th, 5th, 1st - with 3-day grace period, all connect
      const sessions = [
        { date: '2025-01-09' },
        { date: '2025-01-05' }, // 4 day gap (within 3+1=4 grace)
        { date: '2025-01-01' }  // 4 day gap
      ];
      const result = calculateStreak(sessions, { referenceDate, gracePeriodDays: 3 });
      expect(result.currentStreak).toBe(3);
    });
  });

  describe('wouldExtendStreak', () => {
    it('should return true for first session', () => {
      const result = wouldExtendStreak(
        { currentStreak: 0, lastReadDate: null },
        '2025-01-09',
        1
      );
      expect(result).toBe(true);
    });

    it('should return false for same day', () => {
      const result = wouldExtendStreak(
        { currentStreak: 1, lastReadDate: '2025-01-09' },
        '2025-01-09',
        1
      );
      expect(result).toBe(false);
    });

    it('should return true for next day', () => {
      const result = wouldExtendStreak(
        { currentStreak: 1, lastReadDate: '2025-01-08' },
        '2025-01-09',
        1
      );
      expect(result).toBe(true);
    });

    it('should return true within grace period', () => {
      const result = wouldExtendStreak(
        { currentStreak: 1, lastReadDate: '2025-01-07' },
        '2025-01-09',
        1 // 1-day grace means 2-day gap is OK
      );
      expect(result).toBe(true);
    });

    it('should return false when exceeding grace period', () => {
      const result = wouldExtendStreak(
        { currentStreak: 1, lastReadDate: '2025-01-06' },
        '2025-01-09',
        1 // 3-day gap exceeds 1-day grace
      );
      expect(result).toBe(false);
    });
  });
});
