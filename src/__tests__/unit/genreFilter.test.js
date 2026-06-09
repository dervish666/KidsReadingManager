import { describe, it, expect } from 'vitest';
import { isJunkGenre, filterGenres } from '../../utils/genreFilter.js';

describe('isJunkGenre', () => {
  it('keeps normal genres', () => {
    for (const g of [
      'Fantasy',
      'Science Fiction',
      'Historical Fiction',
      'Picture books',
      'Humor',
    ]) {
      expect(isJunkGenre(g)).toBe(false);
    }
  });

  it('rejects the rreading-glasses "none" sentinel and placeholders', () => {
    for (const g of [
      'none',
      'None',
      'NONE',
      'n/a',
      'unknown',
      'general',
      'misc',
      'uncategorized',
    ]) {
      expect(isJunkGenre(g)).toBe(true);
    }
  });

  it('rejects empty / non-string values', () => {
    expect(isJunkGenre('')).toBe(true);
    expect(isJunkGenre('   ')).toBe(true);
    expect(isJunkGenre(null)).toBe(true);
    expect(isJunkGenre(undefined)).toBe(true);
    expect(isJunkGenre(42)).toBe(true);
  });

  it('rejects pure years and year ranges', () => {
    for (const g of ['1978', '1939-1945', '1960 - 1988', '1939–1945']) {
      expect(isJunkGenre(g)).toBe(true);
    }
  });

  it('rejects catalog subject-headings with embedded years', () => {
    expect(isJunkGenre('1939-1945 World War')).toBe(true);
    expect(isJunkGenre('World War, 1939-1945')).toBe(true);
  });

  it('rejects comma-delimited catalog headings', () => {
    for (const g of [
      'African americans, fiction',
      'Aeronautics, juvenile literature',
      'Great britain, biography',
      'Comic books, strips, etc.',
    ]) {
      expect(isJunkGenre(g)).toBe(true);
    }
  });

  it('rejects heading phrasings and over-long strings', () => {
    expect(isJunkGenre('Adventure and adventurers in fiction')).toBe(true);
    expect(isJunkGenre('Aeronautics juvenile literature')).toBe(true);
    expect(isJunkGenre('A'.repeat(41))).toBe(true);
  });
});

describe('filterGenres', () => {
  it('drops junk and keeps the good ones, preserving order', () => {
    const input = ['Fantasy', 'none', 'African americans, fiction', 'Adventure', '1978'];
    expect(filterGenres(input)).toEqual(['Fantasy', 'Adventure']);
  });

  it('de-duplicates case-insensitively and collapses whitespace', () => {
    expect(filterGenres(['Fantasy', 'fantasy', '  Science   Fiction '])).toEqual([
      'Fantasy',
      'Science Fiction',
    ]);
  });

  it('caps the number of genres', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Genre ${String.fromCharCode(65 + i)}`);
    expect(filterGenres(many, 8)).toHaveLength(8);
  });

  it('returns [] for non-arrays or all-junk input', () => {
    expect(filterGenres(null)).toEqual([]);
    expect(filterGenres('Fantasy')).toEqual([]);
    expect(filterGenres(['none', '', '1990'])).toEqual([]);
  });
});
