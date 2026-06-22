/**
 * Validation utilities for request data
 */

import { OBSERVATION_KEYS, MAX_OBSERVATION_LABEL } from './readingObservations';
import { MIN_BANDS, MAX_BANDS } from './readingBandDefinitions';

const MAX_BAND_NAME = 30;

/**
 * Validate password strength (8-128 chars, uppercase, lowercase, number).
 * @param {string} password - The password to validate
 * @returns {{ isValid: boolean, error: string }}
 */
export function validatePassword(password) {
  if (password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters' };
  }
  if (password.length > 128) {
    return { isValid: false, error: 'Password must be 128 characters or fewer' };
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      isValid: false,
      error:
        'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    };
  }
  return { isValid: true, error: '' };
}

/**
 * Validate reading session input fields (pagesRead, duration, date, notes, assessment,
 * location, and the six optional reading-observation slots in OBSERVATION_KEYS).
 * Mutates numeric fields to parsed values in the returned data object.
 * @param {Object} body - The request body to validate
 * @returns {{ isValid: boolean, error: string, data: Object }}
 */
export function validateSessionInput(body) {
  const data = { ...body };

  if (data.pagesRead !== undefined && data.pagesRead !== null) {
    const pages = Number(data.pagesRead);
    if (!Number.isFinite(pages) || pages < 0 || pages > 10000) {
      return { isValid: false, error: 'pagesRead must be a number between 0 and 10000', data };
    }
    data.pagesRead = pages;
  }
  if (data.duration !== undefined && data.duration !== null) {
    const dur = Number(data.duration);
    if (!Number.isFinite(dur) || dur < 0 || dur > 1440) {
      return {
        isValid: false,
        error: 'duration must be a number between 0 and 1440 minutes',
        data,
      };
    }
    data.duration = dur;
  }
  if (data.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || isNaN(Date.parse(data.date))) {
      return { isValid: false, error: 'date must be a valid YYYY-MM-DD format', data };
    }
  }
  if (data.notes && data.notes.length > 2000) {
    return { isValid: false, error: 'notes must be 2000 characters or fewer', data };
  }
  if (data.assessment !== null && data.assessment !== undefined && data.assessment !== '') {
    const assessmentNum = Number(data.assessment);
    if (!Number.isInteger(assessmentNum) || assessmentNum < 1 || assessmentNum > 10) {
      return { isValid: false, error: 'Assessment must be an integer between 1 and 10', data };
    }
    data.assessment = assessmentNum;
  } else {
    data.assessment = null;
  }
  const validLocations = [null, undefined, '', 'school', 'home', 'library', 'other'];
  if (data.location && !validLocations.includes(data.location)) {
    return { isValid: false, error: 'Invalid location value', data };
  }

  // Reading observations ("how did they read today?") — optional, independent
  // flags across the six configurable slots. Normalise provided values to 0/1;
  // leave absent ones as null so paths that don't capture them (home/parent)
  // don't overwrite with a false negative.
  for (const key of OBSERVATION_KEYS) {
    if (data[key] === undefined || data[key] === null || data[key] === '') {
      data[key] = null;
    } else {
      data[key] = data[key] ? 1 : 0;
    }
  }

  return { isValid: true, error: '', data };
}

/**
 * Validates reading level range (min and max values)
 * @param {number|string|null} min - Minimum reading level
 * @param {number|string|null} max - Maximum reading level
 * @returns {{isValid: boolean, errors?: string[], normalizedMin?: number, normalizedMax?: number}}
 */
export function validateReadingLevelRange(min, max) {
  // Both null/undefined is valid (not assessed)
  if ((min === null || min === undefined) && (max === null || max === undefined)) {
    return { isValid: true };
  }

  // If one is set, both must be set
  if ((min === null || min === undefined) !== (max === null || max === undefined)) {
    return {
      isValid: false,
      errors: ['Reading level range requires both minimum and maximum values'],
    };
  }

  // Convert to numbers and round to 1 decimal place
  const minNum = Math.round(parseFloat(min) * 10) / 10;
  const maxNum = Math.round(parseFloat(max) * 10) / 10;

  // Check for valid numbers
  if (isNaN(minNum) || isNaN(maxNum)) {
    return { isValid: false, errors: ['Reading level values must be valid numbers'] };
  }

  // Check range bounds (1.0 to 13.0)
  if (minNum < 1.0 || maxNum < 1.0) {
    return { isValid: false, errors: ['Reading level must be at least 1.0'] };
  }
  if (minNum > 13.0 || maxNum > 13.0) {
    return { isValid: false, errors: ['Reading level must not exceed 13.0'] };
  }

  // Check min <= max
  if (minNum > maxNum) {
    return { isValid: false, errors: ['Reading level minimum cannot be greater than maximum'] };
  }

  return { isValid: true, normalizedMin: minNum, normalizedMax: maxNum };
}

/**
 * Validate an assessment value (integer 1-10, or null/undefined)
 * @param {*} value - Assessment value to validate
 * @returns {boolean} - Whether the value is valid
 */
export function isValidAssessment(value) {
  if (value === null || value === undefined) return true;
  return Number.isInteger(value) && value >= 1 && value <= 10;
}

/**
 * Validate student data
 * @param {Object} student - Student data to validate
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateStudent(student) {
  const errors = [];

  // Check required fields
  if (!student) {
    return { isValid: false, errors: ['Student data is required'] };
  }

  // Validate name
  if (!student.name || typeof student.name !== 'string' || student.name.trim() === '') {
    errors.push('Student name is required');
  }

  // Validate ID if provided (for updates)
  if (student.id && typeof student.id !== 'string') {
    errors.push('Student ID must be a string');
  }

  // Validate lastReadDate if provided
  if (student.lastReadDate && typeof student.lastReadDate !== 'string') {
    errors.push('Last read date must be a string');
  }

  // Validate reading sessions if provided
  if (student.readingSessions) {
    if (!Array.isArray(student.readingSessions)) {
      errors.push('Reading sessions must be an array');
    } else {
      // Validate each session
      student.readingSessions.forEach((session, index) => {
        if (!session.id) {
          errors.push(`Session at index ${index} is missing an ID`);
        }
        if (!session.date) {
          errors.push(`Session at index ${index} is missing a date`);
        }
      });
    }
  }

  // Validate baseline reads (mid-year onboarding starting total) if provided
  if (student.baselineReads !== undefined && student.baselineReads !== null) {
    const br = Number(student.baselineReads);
    if (!Number.isInteger(br) || br < 0 || br > 100000) {
      errors.push('Starting reads must be a whole number between 0 and 100000');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate settings data
 * @param {Object} settings - Settings data to validate
 * @returns {Object} - Validation result with isValid and errors
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function validateSettings(settings) {
  const errors = [];

  // Check required fields
  if (!settings) {
    return { isValid: false, errors: ['Settings data is required'] };
  }

  // Reject prototype pollution keys (recursively check nested objects)
  const hasDangerousKeys = (obj) => {
    for (const [key, value] of Object.entries(obj)) {
      if (DANGEROUS_KEYS.has(key)) return key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const found = hasDangerousKeys(value);
        if (found) return found;
      }
    }
    return null;
  };
  const dangerousKey = hasDangerousKeys(settings);
  if (dangerousKey) {
    return { isValid: false, errors: [`Invalid settings key: ${dangerousKey}`] };
  }

  // Validate reading status settings if provided
  if (settings.readingStatusSettings) {
    const { recentlyReadDays, needsAttentionDays } = settings.readingStatusSettings;

    if (recentlyReadDays !== undefined) {
      if (typeof recentlyReadDays !== 'number' || recentlyReadDays < 1) {
        errors.push('Recently read days must be a positive number');
      }
    }

    if (needsAttentionDays !== undefined) {
      if (typeof needsAttentionDays !== 'number' || needsAttentionDays < 1) {
        errors.push('Needs attention days must be a positive number');
      }
    }

    // Ensure logical relationship between thresholds
    if (recentlyReadDays && needsAttentionDays && recentlyReadDays >= needsAttentionDays) {
      errors.push('Recently read days must be less than needs attention days');
    }
  }

  // Validate AI settings if provided
  if (settings.ai) {
    const { provider, apiKey, baseUrl, model } = settings.ai;

    if (provider && !['anthropic', 'openai', 'gemini'].includes(provider)) {
      errors.push('Invalid AI provider selected');
    }

    // API key is optional (might be set in env vars), but if provided should be a string
    if (apiKey && typeof apiKey !== 'string') {
      errors.push('API key must be a string');
    }

    if (baseUrl && typeof baseUrl !== 'string') {
      errors.push('Base URL must be a string');
    }

    if (model && typeof model !== 'string') {
      errors.push('Model name must be a string');
    }
  }

  // Validate reading band threshold if provided
  if (settings.readsPerBand !== undefined) {
    const rpb = settings.readsPerBand;
    if (!Number.isInteger(rpb) || rpb < 1 || rpb > 1000) {
      errors.push('Reads per band must be a whole number between 1 and 1000');
    }
  }

  // Validate reading-observation config if provided. An array of up to six
  // { key, label, enabled } slots; keys must be known observation keys.
  if (settings.readingObservations !== undefined) {
    const ro = settings.readingObservations;
    if (!Array.isArray(ro) || ro.length > OBSERVATION_KEYS.length) {
      errors.push(
        `Reading observations must be an array of up to ${OBSERVATION_KEYS.length} items`
      );
    } else {
      for (const item of ro) {
        if (!item || typeof item !== 'object' || !OBSERVATION_KEYS.includes(item.key)) {
          errors.push('Each reading observation must have a valid key');
          break;
        }
        if (item.label !== undefined && typeof item.label !== 'string') {
          errors.push('Reading observation labels must be text');
          break;
        }
        if (typeof item.label === 'string' && item.label.length > MAX_OBSERVATION_LABEL) {
          errors.push(
            `Reading observation labels must be ${MAX_OBSERVATION_LABEL} characters or fewer`
          );
          break;
        }
        if (item.enabled !== undefined && typeof item.enabled !== 'boolean') {
          errors.push('Reading observation enabled flag must be true or false');
          break;
        }
      }
    }
  }

  const HEX6 = /^#[0-9A-Fa-f]{6}$/;

  // Validate the band list if provided: per-org names + colours, MIN..MAX bands.
  if (settings.bands !== undefined) {
    const list = settings.bands;
    if (!Array.isArray(list) || list.length < MIN_BANDS || list.length > MAX_BANDS) {
      errors.push(`Reading bands must be a list of between ${MIN_BANDS} and ${MAX_BANDS} bands`);
    } else if (
      !list.every(
        (b) =>
          b &&
          typeof b === 'object' &&
          typeof b.name === 'string' &&
          b.name.trim().length > 0 &&
          b.name.trim().length <= MAX_BAND_NAME &&
          typeof b.color === 'string' &&
          HEX6.test(b.color)
      )
    ) {
      errors.push(
        `Each reading band needs a name (1–${MAX_BAND_NAME} characters) and a hex colour (#RRGGBB)`
      );
    }
  }

  // Legacy colour-only palette (pre-names): tolerate any in-bounds length.
  if (settings.bandColors !== undefined) {
    const list = settings.bandColors;
    if (
      !Array.isArray(list) ||
      list.length < MIN_BANDS ||
      list.length > MAX_BANDS ||
      !list.every((c) => typeof c === 'string' && HEX6.test(c))
    ) {
      errors.push(`Band colours must be ${MIN_BANDS}–${MAX_BANDS} hex colours (#RRGGBB)`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate bulk import data
 * @param {Array} students - Array of student data to validate
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateBulkImport(students) {
  const errors = [];

  // Check if data is an array
  if (!Array.isArray(students)) {
    return { isValid: false, errors: ['Bulk import data must be an array'] };
  }

  // Validate each student
  students.forEach((student, index) => {
    const validation = validateStudent(student);
    if (!validation.isValid) {
      errors.push(`Student at index ${index} is invalid: ${validation.errors.join(', ')}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate genre data
 * @param {Object} genre - Genre data to validate
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateGenre(genre) {
  const errors = [];

  if (!genre) {
    return { isValid: false, errors: ['Genre data is required'] };
  }

  if (!genre.name || typeof genre.name !== 'string' || genre.name.trim() === '') {
    errors.push('Genre name is required');
  } else if (genre.name.trim().length > 100) {
    errors.push('Genre name must be 100 characters or fewer');
  }

  if (genre.description !== undefined && genre.description !== null) {
    if (typeof genre.description !== 'string') {
      errors.push('Genre description must be a string');
    } else if (genre.description.length > 500) {
      errors.push('Genre description must be 500 characters or fewer');
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate class data
 * @param {Object} cls - Class data to validate
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateClass(cls) {
  const errors = [];

  if (!cls) {
    return { isValid: false, errors: ['Class data is required'] };
  }

  if (!cls.name || typeof cls.name !== 'string' || cls.name.trim() === '') {
    errors.push('Class name is required');
  } else if (cls.name.trim().length > 100) {
    errors.push('Class name must be 100 characters or fewer');
  }

  if (cls.teacherName !== undefined && cls.teacherName !== null) {
    if (typeof cls.teacherName !== 'string') {
      errors.push('Teacher name must be a string');
    } else if (cls.teacherName.length > 200) {
      errors.push('Teacher name must be 200 characters or fewer');
    }
  }

  if (cls.academicYear !== undefined && cls.academicYear !== null) {
    if (typeof cls.academicYear !== 'string') {
      errors.push('Academic year must be a string');
    } else if (!/^\d{4}(\/\d{4})?$/.test(cls.academicYear)) {
      errors.push('Academic year must be in format YYYY or YYYY/YYYY');
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate book data
 * @param {Object} book - Book data to validate
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateBook(book) {
  const errors = [];

  if (!book) {
    return { isValid: false, errors: ['Book data is required'] };
  }

  if (!book.title || typeof book.title !== 'string' || book.title.trim() === '') {
    errors.push('Book title is required');
  } else if (book.title.trim().length > 500) {
    errors.push('Book title must be 500 characters or fewer');
  }

  if (book.author !== undefined && book.author !== null) {
    if (typeof book.author !== 'string') {
      errors.push('Author must be a string');
    } else if (book.author.length > 500) {
      errors.push('Author must be 500 characters or fewer');
    }
  }

  if (book.readingLevel !== undefined && book.readingLevel !== null && book.readingLevel !== '') {
    if (typeof book.readingLevel !== 'string' && typeof book.readingLevel !== 'number') {
      errors.push('Reading level must be a string or number');
    }
  }

  if (book.isbn !== undefined && book.isbn !== null && book.isbn !== '') {
    if (typeof book.isbn !== 'string') {
      errors.push('ISBN must be a string');
    }
  }

  if (book.genreIds !== undefined && book.genreIds !== null) {
    if (!Array.isArray(book.genreIds)) {
      errors.push('Genre IDs must be an array');
    }
  }

  if (book.pageCount !== undefined && book.pageCount !== null) {
    const count = parseInt(book.pageCount, 10);
    if (isNaN(count) || count < 0) {
      errors.push('Page count must be a non-negative integer');
    }
  }

  return { isValid: errors.length === 0, errors };
}

/**
 * Validate complete data import
 * @param {Object} data - Complete data to validate
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateDataImport(data) {
  const errors = [];

  // Check required structure
  if (!data) {
    return { isValid: false, errors: ['Data is required'] };
  }

  // Validate students array
  if (!data.students || !Array.isArray(data.students)) {
    errors.push('Data must contain a students array');
  } else {
    // Validate each student
    data.students.forEach((student, index) => {
      const validation = validateStudent(student);
      if (!validation.isValid) {
        errors.push(`Student at index ${index} is invalid: ${validation.errors.join(', ')}`);
      }
    });
  }

  // Validate settings if provided
  if (data.settings) {
    const validation = validateSettings(data.settings);
    if (!validation.isValid) {
      errors.push(`Settings are invalid: ${validation.errors.join(', ')}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
