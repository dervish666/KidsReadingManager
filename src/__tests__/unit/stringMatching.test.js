import { describe, it, expect } from 'vitest';
import { normalizeString, calculateSimilarity, isExactMatch, isFuzzyMatch } from '../../utils/stringMatching.js';

describe('stringMatching utilities', () => {
  describe('normalizeString', () => {
    it('should lowercase and trim', () => {
      expect(normalizeString('  The BFG  ')).toBe('the bfg');
    });

    it('should remove punctuation', () => {
      expect(normalizeString("The B.F.G.'s Adventure!")).toBe('the bfgs adventure');
    });

    it('should collapse whitespace', () => {
      expect(normalizeString('The   Big   Book')).toBe('the big book');
    });

    it('should handle empty/null input', () => {
      expect(normalizeString('')).toBe('');
      expect(normalizeString(null)).toBe('');
      expect(normalizeString(undefined)).toBe('');
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(calculateSimilarity('hello', 'hello')).toBe(1);
    });

    it('should return 0 for completely different strings', () => {
      expect(calculateSimilarity('abc', 'xyz')).toBeLessThan(0.5);
    });

    it('should return high similarity for similar strings', () => {
      expect(calculateSimilarity('the hobbit', 'the hobit')).toBeGreaterThan(0.85);
    });
  });

  describe('isExactMatch', () => {
    it('should match normalized strings', () => {
      expect(isExactMatch('The BFG', 'the bfg')).toBe(true);
      expect(isExactMatch('The B.F.G.', 'THE BFG')).toBe(true);
    });

    it('should not match different titles', () => {
      expect(isExactMatch('The BFG', 'The Hobbit')).toBe(false);
    });
  });

  describe('isFuzzyMatch', () => {
    it('should match similar title and author', () => {
      expect(isFuzzyMatch(
        { title: 'The Hobit', author: 'Tolkien' },
        { title: 'The Hobbit', author: 'J.R.R. Tolkien' }
      )).toBe(true);
    });

    it('should not match different books', () => {
      expect(isFuzzyMatch(
        { title: 'The BFG', author: 'Roald Dahl' },
        { title: 'The Hobbit', author: 'J.R.R. Tolkien' }
      )).toBe(false);
    });

    it('should match with missing author on one side', () => {
      expect(isFuzzyMatch(
        { title: 'The Hobbit', author: null },
        { title: 'The Hobbit', author: 'Tolkien' }
      )).toBe(true);
    });
  });
});
