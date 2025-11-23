/**
 * Validation utilities for request data
 */

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
        if (!session.assessment) {
          errors.push(`Session at index ${index} is missing an assessment`);
        }
      });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Validate settings data
 * @param {Object} settings - Settings data to validate
 * @returns {Object} - Validation result with isValid and errors
 */
export function validateSettings(settings) {
  const errors = [];
  
  // Check required fields
  if (!settings) {
    return { isValid: false, errors: ['Settings data is required'] };
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
  
  return {
    isValid: errors.length === 0,
    errors
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
    errors
  };
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
    errors
  };
}