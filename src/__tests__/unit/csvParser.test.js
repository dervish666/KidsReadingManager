import { describe, it, expect } from 'vitest';
import { parseCSV, detectColumnMapping, mapCSVToBooks } from '../../utils/csvParser.js';

describe('CSV Parser', () => {
  describe('parseCSV', () => {
    it('should parse simple CSV', () => {
      const csv = 'Title,Author\nThe BFG,Roald Dahl\nMatilda,Roald Dahl';
      const result = parseCSV(csv);

      expect(result.headers).toEqual(['Title', 'Author']);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual(['The BFG', 'Roald Dahl']);
    });

    it('should handle quoted fields with commas', () => {
      const csv = 'Title,Author\n"Hello, World",Author Name';
      const result = parseCSV(csv);

      expect(result.rows[0][0]).toBe('Hello, World');
    });

    it('should handle escaped quotes', () => {
      const csv = 'Title,Author\n"The ""Big"" Book",Author';
      const result = parseCSV(csv);

      expect(result.rows[0][0]).toBe('The "Big" Book');
    });
  });

  describe('detectColumnMapping', () => {
    it('should auto-detect standard column names', () => {
      const headers = ['Title', 'Author', 'Reading Level'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.title).toBe(0);
      expect(mapping.author).toBe(1);
      expect(mapping.readingLevel).toBe(2);
    });

    it('should handle variations in column names', () => {
      const headers = ['Book Title', 'Author Name', 'Level'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.title).toBe(0);
      expect(mapping.author).toBe(1);
      expect(mapping.readingLevel).toBe(2);
    });

    it('should return null for unmapped columns', () => {
      const headers = ['Title', 'Notes'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.title).toBe(0);
      expect(mapping.author).toBeNull();
      expect(mapping.readingLevel).toBeNull();
      expect(mapping.isbn).toBeNull();
    });

    it('should auto-detect ISBN column', () => {
      const headers = ['Title', 'Author', 'ISBN'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.title).toBe(0);
      expect(mapping.author).toBe(1);
      expect(mapping.isbn).toBe(2);
    });

    it('should detect ISBN-13 column variation', () => {
      const headers = ['Title', 'ISBN-13', 'Author'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.isbn).toBe(1);
    });

    it('should detect isbn13 column variation', () => {
      const headers = ['Title', 'isbn13', 'Author'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.isbn).toBe(1);
    });

    it('should detect ISBN-10 column variation', () => {
      const headers = ['ISBN-10', 'Title', 'Author'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.isbn).toBe(0);
    });
  });

  describe('mapCSVToBooks', () => {
    it('should convert CSV rows to book objects', () => {
      const rows = [
        ['The BFG', 'Roald Dahl', '3.0'],
        ['Matilda', 'Roald Dahl', '4.0']
      ];
      const mapping = { title: 0, author: 1, readingLevel: 2, isbn: null };

      const books = mapCSVToBooks(rows, mapping);

      expect(books).toHaveLength(2);
      expect(books[0]).toEqual({
        title: 'The BFG',
        author: 'Roald Dahl',
        readingLevel: '3.0',
        isbn: null
      });
    });

    it('should skip rows without title', () => {
      const rows = [
        ['The BFG', 'Roald Dahl'],
        ['', 'Some Author'],
        ['Matilda', 'Roald Dahl']
      ];
      const mapping = { title: 0, author: 1, readingLevel: null, isbn: null };

      const books = mapCSVToBooks(rows, mapping);
      expect(books).toHaveLength(2);
    });

    it('should include ISBN when mapped', () => {
      const rows = [
        ['The BFG', 'Roald Dahl', '3.0', '9780142410387'],
        ['Matilda', 'Roald Dahl', '4.0', '9780142410370']
      ];
      const mapping = { title: 0, author: 1, readingLevel: 2, isbn: 3 };

      const books = mapCSVToBooks(rows, mapping);

      expect(books).toHaveLength(2);
      expect(books[0]).toEqual({
        title: 'The BFG',
        author: 'Roald Dahl',
        readingLevel: '3.0',
        isbn: '9780142410387'
      });
      expect(books[1].isbn).toBe('9780142410370');
    });

    it('should set ISBN to null when not mapped', () => {
      const rows = [
        ['The BFG', 'Roald Dahl', '3.0']
      ];
      const mapping = { title: 0, author: 1, readingLevel: 2, isbn: null };

      const books = mapCSVToBooks(rows, mapping);

      expect(books[0].isbn).toBeNull();
    });

    it('should set ISBN to null when field is empty', () => {
      const rows = [
        ['The BFG', 'Roald Dahl', '3.0', '']
      ];
      const mapping = { title: 0, author: 1, readingLevel: 2, isbn: 3 };

      const books = mapCSVToBooks(rows, mapping);

      expect(books[0].isbn).toBeNull();
    });
  });
});
