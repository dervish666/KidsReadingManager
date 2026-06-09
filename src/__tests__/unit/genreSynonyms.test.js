import { describe, it, expect } from 'vitest';
import {
  canonicalGenre,
  CANONICAL_GENRES,
  GENRE_MERGES,
  GENRE_DROP,
} from '../../utils/genreSynonyms.js';

describe('canonicalGenre', () => {
  it('maps known synonyms onto the canonical name', () => {
    expect(canonicalGenre('Humor')).toBe('Humour');
    expect(canonicalGenre('Humorous stories')).toBe('Humour');
    expect(canonicalGenre('Comedy')).toBe('Humour');
    expect(canonicalGenre('Childrens')).toBe("Children's Fiction");
    expect(canonicalGenre('Juvenile Fiction')).toBe("Children's Fiction");
    expect(canonicalGenre('Science fiction')).toBe('Science Fiction');
    expect(canonicalGenre('Comics')).toBe('Graphic Novels');
    expect(canonicalGenre('Readers (Elementary)')).toBe('Early Readers');
    expect(canonicalGenre('Cats')).toBe('Animal Stories');
  });

  it('is case-insensitive and whitespace-tolerant', () => {
    expect(canonicalGenre('  science   FICTION ')).toBe('Science Fiction');
    expect(canonicalGenre('humor')).toBe('Humour');
  });

  it('returns the canonical name unchanged for canonical inputs', () => {
    expect(canonicalGenre('Fantasy')).toBe('Fantasy');
    expect(canonicalGenre('Pirates')).toBe('Pirates');
    expect(canonicalGenre('Non-Fiction')).toBe('Non-Fiction');
  });

  it('drops curated junk subject-headings', () => {
    for (const junk of [
      'Tom (Fictitious character : Blade)',
      'Women household employees',
      'Spain Civil War, 1936-1939',
      'Open Library Staff Picks',
      'Egypt',
      'Harry Potter',
    ]) {
      expect(canonicalGenre(junk)).toBeNull();
    }
  });

  it('passes through unknown genres unchanged (trimmed)', () => {
    expect(canonicalGenre('Some Brand New Genre')).toBe('Some Brand New Genre');
    expect(canonicalGenre('  Spaced  Out ')).toBe('Spaced Out');
  });

  it('returns null for empty / non-string input', () => {
    expect(canonicalGenre('')).toBeNull();
    expect(canonicalGenre('   ')).toBeNull();
    expect(canonicalGenre(null)).toBeNull();
    expect(canonicalGenre(42)).toBeNull();
  });
});

describe('taxonomy integrity', () => {
  it('produces a moderate-sized canonical set (~50-70)', () => {
    expect(CANONICAL_GENRES.length).toBeGreaterThanOrEqual(45);
    expect(CANONICAL_GENRES.length).toBeLessThanOrEqual(75);
  });

  it('has no synonym byte-identical to a canonical (case variants are fine)', () => {
    // A synonym like "Picture books" differing from canonical "Picture Books"
    // only by case is intentional (it's a rename target). An *exact* duplicate
    // would be a copy-paste mistake.
    const canon = new Set(CANONICAL_GENRES);
    for (const syns of Object.values(GENRE_MERGES)) {
      for (const s of syns) {
        expect(canon.has(s)).toBe(false);
      }
    }
  });

  it('resolves every merge synonym to its declared canonical', () => {
    for (const [canonical, syns] of Object.entries(GENRE_MERGES)) {
      for (const s of syns) {
        expect(canonicalGenre(s)).toBe(canonical);
      }
    }
  });

  it('has no overlap between merge sources and drops', () => {
    const dropLc = new Set(GENRE_DROP.map((n) => n.toLowerCase()));
    for (const syns of Object.values(GENRE_MERGES)) {
      for (const s of syns) {
        expect(dropLc.has(s.toLowerCase())).toBe(false);
      }
    }
  });

  it('every canonical resolves to itself', () => {
    for (const c of CANONICAL_GENRES) {
      expect(canonicalGenre(c)).toBe(c);
    }
  });
});
