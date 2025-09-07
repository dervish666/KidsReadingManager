/**
 * Helper utilities for the application
 */

/**
 * Generate a UUID v4 using Web Crypto API (compatible with Cloudflare Workers)
 * @returns {string} UUID string
 */
export function generateId() {
  // Use Web Crypto API which is available in Cloudflare Workers
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  // Set version (4) and variant bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

  // Convert to UUID format
  return [
    bytes.slice(0, 4),  // time_low
    bytes.slice(4, 6),  // time_mid
    bytes.slice(6, 8),  // time_high_and_version
    bytes.slice(8, 10), // clock_seq_high_and_reserved + clock_seq_low
    bytes.slice(10, 16) // node
  ].map(chunk => Array.from(chunk, byte => byte.toString(16).padStart(2, '0')).join('')).join('-');
}

/**
 * Get today's date in ISO format (YYYY-MM-DD)
 * @returns {string} - Today's date
 */
export function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Calculate reading status based on last read date and settings
 * @param {Object} student - Student object
 * @param {Object} settings - Reading status settings
 * @returns {string} - Reading status: 'recentlyRead', 'needsAttention', or 'notRead'
 */
export function getReadingStatus(student, settings) {
  if (!student?.lastReadDate) return 'notRead';

  const lastReadDate = new Date(student.lastReadDate);
  const today = new Date();
  
  // Ensure dates are compared at the start of the day for consistency
  today.setHours(0, 0, 0, 0);
  lastReadDate.setHours(0, 0, 0, 0);

  const diffTime = today - lastReadDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= settings.readingStatusSettings.recentlyReadDays) return 'recentlyRead';
  if (diffDays <= settings.readingStatusSettings.needsAttentionDays) return 'needsAttention';
  return 'notRead';
}

/**
 * Sort students by reading priority
 * @param {Array} students - Array of students
 * @returns {Array} - Sorted array of students
 */
export function sortStudentsByPriority(students) {
  return [...students].sort((a, b) => {
    if (!a.lastReadDate) return -1;
    if (!b.lastReadDate) return 1;
    return new Date(a.lastReadDate) - new Date(b.lastReadDate);
  });
}

/**
 * Get prioritized students
 * @param {Array} students - Array of students
 * @param {number} count - Number of students to return
 * @returns {Array} - Array of prioritized students
 */
export function getPrioritizedStudents(students, count) {
  return [...students]
    .sort((a, b) => {
      if (!a.lastReadDate && !b.lastReadDate) return a.readingSessions.length - b.readingSessions.length;
      if (!a.lastReadDate) return -1;
      if (!b.lastReadDate) return 1;
      const dateComparison = new Date(a.lastReadDate) - new Date(b.lastReadDate);
      if (dateComparison !== 0) return dateComparison;
      return a.readingSessions.length - b.readingSessions.length;
    })
    .slice(0, count);
}

/**
 * Update the last read date for a student based on reading sessions
 * @param {Object} student - Student object
 * @returns {Object} - Updated student object
 */
export function updateLastReadDate(student) {
  if (!student.readingSessions || student.readingSessions.length === 0) {
    return { ...student, lastReadDate: null };
  }
  
  let mostRecentDate = null;
  for (const session of student.readingSessions) {
    if (session.date && (!mostRecentDate || new Date(session.date) > new Date(mostRecentDate))) {
      mostRecentDate = session.date;
    }
  }
  
  return { ...student, lastReadDate: mostRecentDate };
}

/**
 * Format error response
 * @param {string} message - Error message
 * @param {number} status - HTTP status code
 * @returns {Object} - Formatted error response
 */
export function formatErrorResponse(message, status = 400) {
  return {
    status: 'error',
    message,
    code: status
  };
}

/**
 * Format assessment display label from stored value
 * @param {string} assessment - Assessment value ('struggling', 'needs_help', 'independent')
 * @returns {string} - Formatted display label
 */
export function formatAssessmentDisplay(assessment) {
  switch (assessment) {
    case 'struggling':
      return 'Needing Help';
    case 'needs_help':
      return 'Moderate Help';
    case 'independent':
      return 'Independent';
    default:
      return assessment;
  }
}

/**
 * Format success response
 * @param {*} data - Response data
 * @param {string} message - Success message
 * @returns {Object} - Formatted success response
 */
export function formatSuccessResponse(data, message = 'Success') {
  return {
    status: 'success',
    message,
    data
  };
}