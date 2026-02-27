/**
 * Validation utilities for request data
 */

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
    return { isValid: false, errors: ['Reading level range requires both minimum and maximum values'] };
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
    errors
  };
}