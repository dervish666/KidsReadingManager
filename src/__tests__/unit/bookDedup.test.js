import { describe, it, expect } from 'vitest';
import {
  normalizeIsbn,
  bookSignatures,
  clusterDuplicates,
  suggestCanonical,
  computeBackfill,
} from '../../utils/bookDedup.js';

describe('normalizeIsbn', () => {
  it('strips formatting and lowercases the check digit', () => {
    expect(normalizeIsbn('978-0-14-031647-5')).toBe('9780140316475');
    expect(normalizeIsbn('0 19 953556 X')).toBe('019953556x');
  });

  it('returns empty string for missing ISBN', () => {
    expect(normalizeIsbn(null)).toBe('');
    expect(normalizeIsbn('')).toBe('');
  });
});

describe('bookSignatures', () => {
  it('builds null signatures when the axis is missing', () => {
    expect(bookSignatures({ title: '', author: '', isbn: '' })).toEqual({
      isbn: null,
      titleAuthor: null,
    });
  });

  it('normalises title + author into one key', () => {
    const a = bookSignatures({ title: 'The BFG', author: 'Roald Dahl' });
    const b = bookSignatures({ title: 'the  b.f.g', author: 'roald dahl!' });
    expect(a.titleAuthor).toBe(b.titleAuthor);
  });
});

describe('clusterDuplicates', () => {
  it('groups books that share a normalised ISBN despite formatting', () => {
    const books = [
      { id: 'a', title: 'The BFG', author: 'Roald Dahl', isbn: '978-0-14-031647-5' },
      { id: 'b', title: 'BFG', author: 'R. Dahl', isbn: '9780140316475' },
    ];
    const clusters = clusterDuplicates(books);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].map((x) => x.id).sort()).toEqual(['a', 'b']);
  });

  it('groups books that share a normalised title + author', () => {
    const books = [
      { id: 'a', title: 'Matilda', author: 'Roald Dahl' },
      { id: 'b', title: 'matilda ', author: 'ROALD DAHL' },
    ];
    expect(clusterDuplicates(books)).toHaveLength(1);
  });

  it('merges transitively across ISBN and title relations', () => {
    const books = [
      { id: 'a', title: 'The Hobbit', author: 'Tolkien', isbn: '111' },
      { id: 'b', title: 'Different Title', author: 'Someone', isbn: '111' }, // shares ISBN with a
      { id: 'c', title: 'different title', author: 'someone' }, // shares title+author with b
    ];
    const clusters = clusterDuplicates(books);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('excludes singletons and never groups empty signatures', () => {
    const books = [
      { id: 'a', title: 'Unique One', author: 'A', isbn: '1' },
      { id: 'b', title: '', author: '', isbn: '' },
      { id: 'c', title: '', author: '', isbn: '' },
    ];
    expect(clusterDuplicates(books)).toHaveLength(0);
  });
});

describe('suggestCanonical', () => {
  it('prefers the book with more complete metadata (ISBN-weighted)', () => {
    const cluster = [
      { id: 'sparse', title: 'X', created_at: '2024-01-01' },
      {
        id: 'rich',
        title: 'X',
        author: 'A',
        description: 'd',
        isbn: '123',
        created_at: '2024-06-01',
      },
    ];
    expect(suggestCanonical(cluster)).toBe('rich');
  });

  it('breaks completeness ties by reading-session count', () => {
    const cluster = [
      { id: 'few', title: 'X', isbn: '1', created_at: '2024-01-01' },
      { id: 'many', title: 'X', isbn: '2', created_at: '2024-01-02' },
    ];
    const counts = new Map([
      ['few', 2],
      ['many', 9],
    ]);
    expect(suggestCanonical(cluster, counts)).toBe('many');
  });

  it('falls back to the oldest record', () => {
    const cluster = [
      { id: 'new', title: 'X', isbn: '1', created_at: '2024-12-01' },
      { id: 'old', title: 'X', isbn: '2', created_at: '2024-01-01' },
    ];
    expect(suggestCanonical(cluster)).toBe('old');
  });
});

describe('computeBackfill', () => {
  it('fills only the survivor’s empty columns, first non-empty dup wins', () => {
    const canonical = { author: 'Dahl', description: '', isbn: null, page_count: null };
    const dups = [
      { author: 'Ignored', description: '', isbn: '', page_count: null },
      { author: 'Ignored', description: 'A great story', isbn: '123', page_count: 96 },
    ];
    expect(computeBackfill(canonical, dups)).toEqual({
      description: 'A great story',
      isbn: '123',
      page_count: 96,
    });
  });

  it('treats "unknown" author and "[]" genres as empty', () => {
    const canonical = { author: 'unknown', genre_ids: '[]' };
    const dups = [{ author: 'Julia Donaldson', genre_ids: '["g1"]' }];
    expect(computeBackfill(canonical, dups)).toEqual({
      author: 'Julia Donaldson',
      genre_ids: '["g1"]',
    });
  });

  it('returns nothing when the survivor is already complete', () => {
    const canonical = { author: 'A', description: 'd', isbn: '1' };
    const dups = [{ author: 'B', description: 'e', isbn: '2' }];
    expect(computeBackfill(canonical, dups)).toEqual({});
  });
});
