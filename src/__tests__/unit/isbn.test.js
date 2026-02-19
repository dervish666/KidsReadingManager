import { describe, it, expect } from 'vitest';
import { validateISBN, normalizeISBN, isbn10ToIsbn13 } from '../../utils/isbn.js';

describe('validateISBN', () => {
  describe('valid ISBN-13', () => {
    it('should accept a valid ISBN-13 (9780141036144 - 1984 by Orwell)', () => {
      expect(validateISBN('9780141036144')).toBe(true);
    });

    it('should accept a valid ISBN-13 with hyphens (978-0-14-103614-4)', () => {
      expect(validateISBN('978-0-14-103614-4')).toBe(true);
    });

    it('should accept a valid ISBN-13 with spaces', () => {
      expect(validateISBN('978 0 14 103614 4')).toBe(true);
    });

    it('should accept another valid ISBN-13 (9780451524935 - 1984 Signet edition)', () => {
      expect(validateISBN('9780451524935')).toBe(true);
    });

    it('should accept ISBN-13 starting with 979', () => {
      // 979-10-90636-07-1 (a French publisher prefix)
      expect(validateISBN('9791090636071')).toBe(true);
    });
  });

  describe('valid ISBN-10', () => {
    it('should accept a valid ISBN-10 (0141036141)', () => {
      expect(validateISBN('0141036141')).toBe(true);
    });

    it('should accept an ISBN-10 with X check digit (080442957X)', () => {
      expect(validateISBN('080442957X')).toBe(true);
    });

    it('should accept an ISBN-10 with lowercase x check digit', () => {
      expect(validateISBN('080442957x')).toBe(true);
    });

    it('should accept an ISBN-10 with hyphens', () => {
      expect(validateISBN('0-14-103614-1')).toBe(true);
    });

    it('should accept an ISBN-10 with spaces', () => {
      expect(validateISBN('0 14 103614 1')).toBe(true);
    });
  });

  describe('invalid ISBNs', () => {
    it('should reject an ISBN with a bad check digit (1234567890)', () => {
      expect(validateISBN('1234567890')).toBe(false);
    });

    it('should reject an ISBN-13 with a bad check digit', () => {
      expect(validateISBN('9780141036145')).toBe(false);
    });

    it('should reject null', () => {
      expect(validateISBN(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(validateISBN(undefined)).toBe(false);
    });

    it('should reject empty string', () => {
      expect(validateISBN('')).toBe(false);
    });

    it('should reject wrong length (too short)', () => {
      expect(validateISBN('12345')).toBe(false);
    });

    it('should reject wrong length (too long)', () => {
      expect(validateISBN('12345678901234')).toBe(false);
    });

    it('should reject wrong length (11 digits)', () => {
      expect(validateISBN('12345678901')).toBe(false);
    });

    it('should reject wrong length (12 digits)', () => {
      expect(validateISBN('123456789012')).toBe(false);
    });

    it('should reject non-numeric characters in ISBN-13', () => {
      expect(validateISBN('978014103614A')).toBe(false);
    });

    it('should reject non-numeric characters in ISBN-10 (except X in last position)', () => {
      expect(validateISBN('01410361X1')).toBe(false);
    });

    it('should reject a number type input', () => {
      expect(validateISBN(9780141036144)).toBe(false);
    });

    it('should reject whitespace-only string', () => {
      expect(validateISBN('   ')).toBe(false);
    });
  });
});

describe('isbn10ToIsbn13', () => {
  it('should convert ISBN-10 0141036141 to ISBN-13 9780141036144', () => {
    expect(isbn10ToIsbn13('0141036141')).toBe('9780141036144');
  });

  it('should convert ISBN-10 with X check digit (080442957X) to ISBN-13', () => {
    expect(isbn10ToIsbn13('080442957X')).toBe('9780804429573');
  });

  it('should convert ISBN-10 0451524934 to ISBN-13 9780451524935', () => {
    expect(isbn10ToIsbn13('0451524934')).toBe('9780451524935');
  });

  it('should return null for invalid ISBN-10', () => {
    expect(isbn10ToIsbn13('1234567890')).toBeNull();
  });

  it('should return null for null input', () => {
    expect(isbn10ToIsbn13(null)).toBeNull();
  });

  it('should return null for wrong length input', () => {
    expect(isbn10ToIsbn13('12345')).toBeNull();
  });

  it('should handle lowercase x check digit', () => {
    expect(isbn10ToIsbn13('080442957x')).toBe('9780804429573');
  });
});

describe('normalizeISBN', () => {
  describe('ISBN-13 normalization', () => {
    it('should return ISBN-13 unchanged if already normalized', () => {
      expect(normalizeISBN('9780141036144')).toBe('9780141036144');
    });

    it('should strip hyphens from ISBN-13', () => {
      expect(normalizeISBN('978-0-14-103614-4')).toBe('9780141036144');
    });

    it('should strip spaces from ISBN-13', () => {
      expect(normalizeISBN('978 0 14 103614 4')).toBe('9780141036144');
    });

    it('should strip mixed hyphens and spaces from ISBN-13', () => {
      expect(normalizeISBN('978-0 14-103614 4')).toBe('9780141036144');
    });
  });

  describe('ISBN-10 to ISBN-13 conversion', () => {
    it('should convert ISBN-10 to ISBN-13', () => {
      expect(normalizeISBN('0141036141')).toBe('9780141036144');
    });

    it('should convert ISBN-10 with hyphens to ISBN-13', () => {
      expect(normalizeISBN('0-14-103614-1')).toBe('9780141036144');
    });

    it('should convert ISBN-10 with X check digit to ISBN-13', () => {
      expect(normalizeISBN('080442957X')).toBe('9780804429573');
    });

    it('should convert ISBN-10 with lowercase x to ISBN-13', () => {
      expect(normalizeISBN('080442957x')).toBe('9780804429573');
    });
  });

  describe('invalid input', () => {
    it('should return null for invalid ISBN', () => {
      expect(normalizeISBN('1234567890')).toBeNull();
    });

    it('should return null for null input', () => {
      expect(normalizeISBN(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(normalizeISBN(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(normalizeISBN('')).toBeNull();
    });

    it('should return null for wrong length', () => {
      expect(normalizeISBN('12345')).toBeNull();
    });

    it('should return null for non-string input', () => {
      expect(normalizeISBN(9780141036144)).toBeNull();
    });
  });
});
