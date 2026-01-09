/**
 * Streak Calculator Utility
 * Calculates reading streaks from session data with configurable grace period
 */

/**
 * Get the date string (YYYY-MM-DD) for a given date, accounting for timezone
 * @param {Date|string} date - Date to convert
 * @param {string} timezone - Timezone string (e.g., 'UTC', 'Europe/London')
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function getDateString(date, timezone = 'UTC') {
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return d.toLocaleDateString('en-CA', { timeZone: timezone }); // en-CA gives YYYY-MM-DD format
  } catch {
    // Fallback if timezone is invalid
    return d.toISOString().split('T')[0];
  }
}

/**
 * Get unique reading dates from sessions, sorted in descending order (most recent first)
 * @param {Array} sessions - Array of reading session objects with 'date' property
 * @param {string} timezone - Timezone for date conversion
 * @returns {string[]} Array of unique date strings sorted descending
 */
export function getUniqueReadingDates(sessions, timezone = 'UTC') {
  if (!sessions || sessions.length === 0) return [];

  const dates = new Set();
  for (const session of sessions) {
    if (session.date) {
      dates.add(getDateString(session.date, timezone));
    }
  }

  return Array.from(dates).sort((a, b) => b.localeCompare(a)); // Descending
}

/**
 * Calculate the number of days between two date strings
 * @param {string} date1 - First date (YYYY-MM-DD)
 * @param {string} date2 - Second date (YYYY-MM-DD)
 * @returns {number} Number of days between dates (absolute value)
 */
export function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2 - d1);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate reading streak from sessions
 * @param {Array} sessions - Reading sessions (with 'date' property)
 * @param {Object} options - Configuration options
 * @param {number} options.gracePeriodDays - Days allowed between reads without breaking streak (default: 1)
 * @param {string} options.timezone - Timezone for date calculations (default: 'UTC')
 * @param {Date|string} options.referenceDate - Date to calculate streak from (default: today)
 * @returns {Object} { currentStreak, longestStreak, streakStartDate, lastReadDate }
 */
export function calculateStreak(sessions, options = {}) {
  const {
    gracePeriodDays = 1,
    timezone = 'UTC',
    referenceDate = new Date()
  } = options;

  // Default result for no sessions
  const defaultResult = {
    currentStreak: 0,
    longestStreak: 0,
    streakStartDate: null,
    lastReadDate: null
  };

  if (!sessions || sessions.length === 0) {
    return defaultResult;
  }

  // Get unique dates sorted descending (most recent first)
  const readingDates = getUniqueReadingDates(sessions, timezone);

  if (readingDates.length === 0) {
    return defaultResult;
  }

  const todayStr = getDateString(referenceDate, timezone);
  const lastReadDate = readingDates[0];

  // Check if the streak is still active
  // A streak is active if the last read was within (gracePeriodDays + 1) days from today
  const daysSinceLastRead = daysBetween(todayStr, lastReadDate);
  const maxGapFromToday = gracePeriodDays + 1; // +1 because today counts as day 0

  // Calculate current streak
  let currentStreak = 0;
  let streakStartDate = null;

  if (daysSinceLastRead <= maxGapFromToday) {
    // Streak is potentially active - count consecutive days
    currentStreak = 1;
    streakStartDate = lastReadDate;

    for (let i = 1; i < readingDates.length; i++) {
      const gap = daysBetween(readingDates[i - 1], readingDates[i]);

      // Allow gaps up to (gracePeriodDays + 1) days
      // e.g., if grace period is 1, allow up to 2 days gap (read Mon, skip Tue, read Wed = still streak)
      if (gap <= gracePeriodDays + 1) {
        currentStreak++;
        streakStartDate = readingDates[i];
      } else {
        break; // Streak broken
      }
    }
  }

  // Calculate longest streak (scan all dates)
  let longestStreak = 0;
  let tempStreak = 1;

  for (let i = 1; i < readingDates.length; i++) {
    const gap = daysBetween(readingDates[i - 1], readingDates[i]);

    if (gap <= gracePeriodDays + 1) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  // Current streak could be the longest
  longestStreak = Math.max(longestStreak, currentStreak);

  return {
    currentStreak,
    longestStreak,
    streakStartDate,
    lastReadDate
  };
}

/**
 * Check if adding a session on a given date would extend the streak
 * @param {Object} currentStreakData - Current streak data { currentStreak, lastReadDate }
 * @param {string} newSessionDate - Date of new session
 * @param {number} gracePeriodDays - Grace period configuration
 * @param {string} timezone - Timezone for calculations
 * @returns {boolean} True if this would extend/continue the streak
 */
export function wouldExtendStreak(currentStreakData, newSessionDate, gracePeriodDays = 1, timezone = 'UTC') {
  if (!currentStreakData.lastReadDate) {
    return true; // First session always starts a streak
  }

  const newDateStr = getDateString(newSessionDate, timezone);
  const lastDateStr = getDateString(currentStreakData.lastReadDate, timezone);

  // Same day doesn't extend (but doesn't break either)
  if (newDateStr === lastDateStr) {
    return false;
  }

  const gap = daysBetween(newDateStr, lastDateStr);
  return gap <= gracePeriodDays + 1;
}

export default {
  calculateStreak,
  getDateString,
  getUniqueReadingDates,
  daysBetween,
  wouldExtendStreak
};
