import { describe, it, expect } from 'vitest';
import {
  validateStudent,
  validateSettings,
  validateBulkImport,
  validateDataImport,
  validateReadingLevelRange
} from '../../utils/validation.js';

describe('validateStudent', () => {
  describe('valid students', () => {
    it('should accept a valid student with just a name', () => {
      const result = validateStudent({ name: 'John Doe' });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept a valid student with all fields', () => {
      const result = validateStudent({
        id: '123',
        name: 'Jane Doe',
        lastReadDate: '2024-01-15',
        readingSessions: [
          { id: '1', date: '2024-01-15', assessment: 'independent' }
        ]
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept students with whitespace-padded names that are trimmed', () => {
      const result = validateStudent({ name: '  John Doe  ' });
      expect(result.isValid).toBe(true);
    });
  });

  describe('invalid students', () => {
    it('should reject null student data', () => {
      const result = validateStudent(null);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Student data is required');
    });

    it('should reject undefined student data', () => {
      const result = validateStudent(undefined);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Student data is required');
    });

    it('should reject student without name', () => {
      const result = validateStudent({});
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Student name is required');
    });

    it('should reject student with empty name', () => {
      const result = validateStudent({ name: '' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Student name is required');
    });

    it('should reject student with whitespace-only name', () => {
      const result = validateStudent({ name: '   ' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Student name is required');
    });

    it('should reject non-string name', () => {
      const result = validateStudent({ name: 123 });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Student name is required');
    });

    it('should reject non-string ID', () => {
      const result = validateStudent({ name: 'John', id: 123 });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Student ID must be a string');
    });

    it('should reject non-string lastReadDate', () => {
      const result = validateStudent({ name: 'John', lastReadDate: new Date() });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Last read date must be a string');
    });

    it('should reject non-array reading sessions', () => {
      const result = validateStudent({ name: 'John', readingSessions: 'not-an-array' });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Reading sessions must be an array');
    });
  });

  describe('reading session validation', () => {
    it('should reject sessions without ID', () => {
      const result = validateStudent({
        name: 'John',
        readingSessions: [{ date: '2024-01-15', assessment: 'independent' }]
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Session at index 0 is missing an ID');
    });

    it('should reject sessions without date', () => {
      const result = validateStudent({
        name: 'John',
        readingSessions: [{ id: '1', assessment: 'independent' }]
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Session at index 0 is missing a date');
    });

    it('should reject sessions without assessment', () => {
      const result = validateStudent({
        name: 'John',
        readingSessions: [{ id: '1', date: '2024-01-15' }]
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Session at index 0 is missing an assessment');
    });

    it('should report errors for multiple invalid sessions', () => {
      const result = validateStudent({
        name: 'John',
        readingSessions: [
          { id: '1', date: '2024-01-15' },
          { assessment: 'independent' }
        ]
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Session at index 0 is missing an assessment');
      expect(result.errors).toContain('Session at index 1 is missing an ID');
      expect(result.errors).toContain('Session at index 1 is missing a date');
    });
  });
});

describe('validateSettings', () => {
  describe('valid settings', () => {
    it('should accept empty settings object', () => {
      const result = validateSettings({});
      expect(result.isValid).toBe(true);
    });

    it('should accept valid reading status settings', () => {
      const result = validateSettings({
        readingStatusSettings: {
          recentlyReadDays: 3,
          needsAttentionDays: 7
        }
      });
      expect(result.isValid).toBe(true);
    });

    it('should accept valid AI settings', () => {
      const result = validateSettings({
        ai: {
          provider: 'anthropic',
          apiKey: 'test-key',
          baseUrl: 'https://api.example.com',
          model: 'claude-3'
        }
      });
      expect(result.isValid).toBe(true);
    });
  });

  describe('invalid settings', () => {
    it('should reject null settings', () => {
      const result = validateSettings(null);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Settings data is required');
    });

    it('should reject invalid AI provider', () => {
      const result = validateSettings({
        ai: { provider: 'invalid-provider' }
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid AI provider selected');
    });

    it('should reject non-string API key', () => {
      const result = validateSettings({
        ai: { provider: 'anthropic', apiKey: 123 }
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('API key must be a string');
    });

    it('should reject non-string base URL', () => {
      const result = validateSettings({
        ai: { provider: 'anthropic', baseUrl: 123 }
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Base URL must be a string');
    });

    it('should reject non-string model', () => {
      const result = validateSettings({
        ai: { provider: 'anthropic', model: 123 }
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Model name must be a string');
    });
  });

  describe('reading status settings validation', () => {
    it('should reject non-positive recentlyReadDays', () => {
      const result = validateSettings({
        readingStatusSettings: { recentlyReadDays: 0 }
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Recently read days must be a positive number');
    });

    it('should reject negative recentlyReadDays', () => {
      const result = validateSettings({
        readingStatusSettings: { recentlyReadDays: -1 }
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Recently read days must be a positive number');
    });

    it('should reject non-positive needsAttentionDays', () => {
      const result = validateSettings({
        readingStatusSettings: { needsAttentionDays: 0 }
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Needs attention days must be a positive number');
    });

    it('should reject recentlyReadDays >= needsAttentionDays', () => {
      const result = validateSettings({
        readingStatusSettings: {
          recentlyReadDays: 7,
          needsAttentionDays: 7
        }
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Recently read days must be less than needs attention days');
    });

    it('should reject when recentlyReadDays > needsAttentionDays', () => {
      const result = validateSettings({
        readingStatusSettings: {
          recentlyReadDays: 10,
          needsAttentionDays: 5
        }
      });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Recently read days must be less than needs attention days');
    });
  });
});

describe('validateBulkImport', () => {
  it('should accept valid array of students', () => {
    const result = validateBulkImport([
      { name: 'John Doe' },
      { name: 'Jane Doe' }
    ]);
    expect(result.isValid).toBe(true);
  });

  it('should accept empty array', () => {
    const result = validateBulkImport([]);
    expect(result.isValid).toBe(true);
  });

  it('should reject non-array input', () => {
    const result = validateBulkImport('not-an-array');
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Bulk import data must be an array');
  });

  it('should reject array with invalid students', () => {
    const result = validateBulkImport([
      { name: 'John Doe' },
      { id: '123' } // missing name
    ]);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Student at index 1 is invalid');
  });
});

describe('validateDataImport', () => {
  it('should accept valid data with students array', () => {
    const result = validateDataImport({
      students: [{ name: 'John Doe' }]
    });
    expect(result.isValid).toBe(true);
  });

  it('should accept valid data with settings', () => {
    const result = validateDataImport({
      students: [],
      settings: {
        readingStatusSettings: {
          recentlyReadDays: 3,
          needsAttentionDays: 7
        }
      }
    });
    expect(result.isValid).toBe(true);
  });

  it('should reject null data', () => {
    const result = validateDataImport(null);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Data is required');
  });

  it('should reject data without students array', () => {
    const result = validateDataImport({});
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Data must contain a students array');
  });

  it('should reject data with non-array students', () => {
    const result = validateDataImport({ students: 'not-array' });
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Data must contain a students array');
  });

  it('should validate nested settings', () => {
    const result = validateDataImport({
      students: [],
      settings: {
        readingStatusSettings: {
          recentlyReadDays: 10,
          needsAttentionDays: 5 // invalid: recently > needs attention
        }
      }
    });
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain('Settings are invalid');
  });
});

describe('validateReadingLevelRange', () => {
  it('should return valid for null min and max', () => {
    const result = validateReadingLevelRange(null, null);
    expect(result.isValid).toBe(true);
  });

  it('should return valid for undefined min and max', () => {
    const result = validateReadingLevelRange(undefined, undefined);
    expect(result.isValid).toBe(true);
  });

  it('should return valid for valid range', () => {
    const result = validateReadingLevelRange(5.2, 8.7);
    expect(result.isValid).toBe(true);
  });

  it('should return valid when min equals max', () => {
    const result = validateReadingLevelRange(6.0, 6.0);
    expect(result.isValid).toBe(true);
  });

  it('should return invalid when min > max', () => {
    const result = validateReadingLevelRange(8.0, 5.0);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('minimum');
  });

  it('should return invalid when min < 1.0', () => {
    const result = validateReadingLevelRange(0.5, 5.0);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('1.0');
  });

  it('should return invalid when max > 13.0', () => {
    const result = validateReadingLevelRange(5.0, 15.0);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('13.0');
  });

  it('should return invalid when only min is provided', () => {
    const result = validateReadingLevelRange(5.0, null);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('both');
  });

  it('should return invalid when only max is provided', () => {
    const result = validateReadingLevelRange(null, 8.0);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('both');
  });

  it('should handle string numbers by converting them', () => {
    const result = validateReadingLevelRange('5.2', '8.7');
    expect(result.isValid).toBe(true);
  });

  it('should round to one decimal place', () => {
    const result = validateReadingLevelRange(5.234, 8.789);
    expect(result.isValid).toBe(true);
    expect(result.normalizedMin).toBe(5.2);
    expect(result.normalizedMax).toBe(8.8);
  });
});
