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
    bytes.slice(0, 4), // time_low
    bytes.slice(4, 6), // time_mid
    bytes.slice(6, 8), // time_high_and_version
    bytes.slice(8, 10), // clock_seq_high_and_reserved + clock_seq_low
    bytes.slice(10, 16), // node
  ]
    .map((chunk) => Array.from(chunk, (byte) => byte.toString(16).padStart(2, '0')).join(''))
    .join('-');
}

/**
 * Get today's date in YYYY-MM-DD format, accounting for timezone.
 * On the frontend (browser), omit timezone to use the user's local timezone.
 * On the backend (Worker), pass the organisation's timezone.
 * @param {string} [timezone] - IANA timezone (e.g. 'Europe/London'). Omit for browser local.
 * @returns {string} - Today's date
 */
export function getTodayDate(timezone) {
  const opts = timezone ? { timeZone: timezone } : undefined;
  try {
    return new Date().toLocaleDateString('en-CA', opts);
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Compute the number of calendar days between two YYYY-MM-DD date strings.
 * Uses UTC parsing to avoid timezone/DST shifts in the arithmetic.
 */
function daysBetween(dateStrA, dateStrB) {
  const [ay, am, ad] = dateStrA.split('-').map(Number);
  const [by, bm, bd] = dateStrB.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

/**
 * Calculate reading status based on last read date and settings.
 * Compares calendar dates rather than raw timestamps to avoid DST drift.
 * @param {Object} student - Student object
 * @param {Object} settings - Reading status settings
 * @param {string} [timezone] - IANA timezone. Omit for browser local.
 * @returns {string} - Reading status: 'recentlyRead', 'needsAttention', or 'notRead'
 */
export function getReadingStatus(student, settings, timezone) {
  if (!student?.lastReadDate) return 'notRead';

  const todayStr = getTodayDate(timezone);
  const diffDays = daysBetween(todayStr, student.lastReadDate);

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
      if (!a.lastReadDate && !b.lastReadDate)
        return (a.totalSessionCount || 0) - (b.totalSessionCount || 0);
      if (!a.lastReadDate) return -1;
      if (!b.lastReadDate) return 1;
      const dateComparison = new Date(a.lastReadDate) - new Date(b.lastReadDate);
      if (dateComparison !== 0) return dateComparison;
      return (a.totalSessionCount || 0) - (b.totalSessionCount || 0);
    })
    .slice(0, count);
}

/**
 * Maps status values returned by AppContext's getReadingStatus()
 * ('never', 'recent', 'attention', 'overdue')
 * to theme.palette.status keys ('notRead', 'needsAttention', 'recentlyRead').
 */
export const STATUS_TO_PALETTE = {
  never: 'notRead',
  attention: 'needsAttention',
  overdue: 'notRead',
  recent: 'recentlyRead',
};

/**
 * Format assessment display label from stored value
 * @param {number|null|undefined} assessment - Assessment value (integer 1-10)
 * @returns {string|null} - Formatted display label (e.g. '7/10') or null
 */
export function formatAssessmentDisplay(assessment) {
  if (assessment === null || assessment === undefined) return null;
  if (typeof assessment === 'number' && assessment >= 1 && assessment <= 10) {
    return `${assessment}/10`;
  }
  return null;
}

/**
 * Parse genre IDs from a string value that may be JSON array or comma-separated
 * @param {string|null} value - Raw genre_ids value from database
 * @returns {Array<string>} - Array of genre ID strings
 */
export function parseGenreIds(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* not JSON, fall through */
  }
  return value
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
}

/**
 * Format a date string as a human-readable relative time (e.g., "3 hours ago")
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted relative time
 */
export function formatRelativeTime(dateString) {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSeconds < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 14) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  if (diffWeeks < 8) return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * CSV helper: escape a value and wrap in quotes if needed, then join with commas.
 * @param {Array} values - Array of values to format as a CSV row
 * @returns {string} - CSV-formatted row string
 */
export function csvRow(values) {
  return values
    .map((v) => {
      if (v === null || v === undefined) return '';
      const str = String(v);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
    .join(',');
}

/**
 * Generate URL-safe slug from a name string.
 * @param {string} name - The name to slugify
 * @returns {string} - URL-safe slug (max 50 chars)
 */
export function generateSlug(name) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  return slug || 'org';
}

/**
 * Generate a unique slug for an organization by checking D1 for collisions.
 * @param {object} db - D1 database binding
 * @param {string} name - The name to slugify
 * @returns {Promise<string>} - A unique slug
 * @throws {Error} If unable to generate a unique slug after 100 attempts
 */
export async function generateUniqueSlug(db, name) {
  const baseSlug = generateSlug(name);
  let finalSlug = baseSlug;
  let slugCounter = 1;
  while (slugCounter <= 100) {
    const existing = await db
      .prepare('SELECT id FROM organizations WHERE slug = ?')
      .bind(finalSlug)
      .first();
    if (!existing) return finalSlug;
    finalSlug = `${baseSlug}-${slugCounter++}`;
  }
  throw new Error('Unable to generate unique organization slug');
}

/**
 * Fetch with a timeout using AbortController.
 * If the request doesn't complete within timeoutMs, it is aborted and a timeout error is thrown.
 * @param {string} url - The URL to fetch
 * @param {object} options - Standard fetch options (method, headers, body, etc.)
 * @param {number} timeoutMs - Timeout in milliseconds (default 10000)
 * @returns {Promise<Response>} The fetch response
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url.split('?')[0]}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
