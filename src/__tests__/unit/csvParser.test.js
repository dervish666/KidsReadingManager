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
      expect(mapping.description).toBeNull();
      expect(mapping.pageCount).toBeNull();
      expect(mapping.publicationYear).toBeNull();
      expect(mapping.seriesName).toBeNull();
      expect(mapping.seriesNumber).toBeNull();
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

    it('should detect description column', () => {
      const headers = ['Title', 'Author', 'Description'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.description).toBe(2);
    });

    it('should detect page count columns', () => {
      const headers = ['Title', 'No.of Pages', 'Author'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.pageCount).toBe(1);
    });

    it('should detect "Pages" column variation', () => {
      const headers = ['Title', 'Pages'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.pageCount).toBe(1);
    });

    it('should detect publication year columns', () => {
      const headers = ['Title', 'Year Published', 'Author'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.publicationYear).toBe(1);
    });

    it('should detect series name column', () => {
      const headers = ['Title', 'Series', 'Author'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.seriesName).toBe(1);
    });

    it('should detect series number column', () => {
      const headers = ['Title', 'Series Number', 'Author'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.seriesNumber).toBe(1);
    });

    it('should detect BL column as reading level', () => {
      const headers = ['Title', 'Author', 'BL', 'Pts'];
      const mapping = detectColumnMapping(headers);

      expect(mapping.readingLevel).toBe(2);
    });

    it('should detect all columns from typical Accelerated Reader CSV', () => {
      const headers = [
        'Title',
        'Author',
        'Quiz No',
        'Int. Lvl',
        'BL',
        'Pts',
        'Description',
        'No.of Pages',
        'Publisher',
        'Year Published',
        'ISBN',
        'F/NF',
      ];
      const mapping = detectColumnMapping(headers);

      expect(mapping.title).toBe(0);
      expect(mapping.author).toBe(1);
      expect(mapping.readingLevel).toBe(4);
      expect(mapping.description).toBe(6);
      expect(mapping.pageCount).toBe(7);
      expect(mapping.publicationYear).toBe(9);
      expect(mapping.isbn).toBe(10);
    });
  });

  describe('mapCSVToBooks', () => {
    it('should convert CSV rows to book objects', () => {
      const rows = [
        ['The BFG', 'Roald Dahl', '3.0'],
        ['Matilda', 'Roald Dahl', '4.0'],
      ];
      const mapping = {
        title: 0,
        author: 1,
        readingLevel: 2,
        isbn: null,
        description: null,
        pageCount: null,
        publicationYear: null,
        seriesName: null,
        seriesNumber: null,
      };

      const books = mapCSVToBooks(rows, mapping);

      expect(books).toHaveLength(2);
      expect(books[0]).toEqual({
        title: 'The BFG',
        author: 'Roald Dahl',
        readingLevel: '3.0',
        isbn: null,
        description: null,
        pageCount: null,
        publicationYear: null,
        seriesName: null,
        seriesNumber: null,
      });
    });

    it('should skip rows without title', () => {
      const rows = [
        ['The BFG', 'Roald Dahl'],
        ['', 'Some Author'],
        ['Matilda', 'Roald Dahl'],
      ];
      const mapping = {
        title: 0,
        author: 1,
        readingLevel: null,
        isbn: null,
        description: null,
        pageCount: null,
        publicationYear: null,
        seriesName: null,
        seriesNumber: null,
      };

      const books = mapCSVToBooks(rows, mapping);
      expect(books).toHaveLength(2);
    });

    it('should include ISBN when mapped', () => {
      const rows = [
        ['The BFG', 'Roald Dahl', '3.0', '9780142410387'],
        ['Matilda', 'Roald Dahl', '4.0', '9780142410370'],
      ];
      const mapping = {
        title: 0,
        author: 1,
        readingLevel: 2,
        isbn: 3,
        description: null,
        pageCount: null,
        publicationYear: null,
        seriesName: null,
        seriesNumber: null,
      };

      const books = mapCSVToBooks(rows, mapping);

      expect(books).toHaveLength(2);
      expect(books[0]).toEqual({
        title: 'The BFG',
        author: 'Roald Dahl',
        readingLevel: '3.0',
        isbn: '9780142410387',
        description: null,
        pageCount: null,
        publicationYear: null,
        seriesName: null,
        seriesNumber: null,
      });
      expect(books[1].isbn).toBe('9780142410370');
    });

    it('should set ISBN to null when not mapped', () => {
      const rows = [['The BFG', 'Roald Dahl', '3.0']];
      const mapping = {
        title: 0,
        author: 1,
        readingLevel: 2,
        isbn: null,
        description: null,
        pageCount: null,
        publicationYear: null,
        seriesName: null,
        seriesNumber: null,
      };

      const books = mapCSVToBooks(rows, mapping);

      expect(books[0].isbn).toBeNull();
    });

    it('should set ISBN to null when field is empty', () => {
      const rows = [['The BFG', 'Roald Dahl', '3.0', '']];
      const mapping = {
        title: 0,
        author: 1,
        readingLevel: 2,
        isbn: 3,
        description: null,
        pageCount: null,
        publicationYear: null,
        seriesName: null,
        seriesNumber: null,
      };

      const books = mapCSVToBooks(rows, mapping);

      expect(books[0].isbn).toBeNull();
    });

    it('should map additional metadata fields', () => {
      const rows = [
        [
          'The BFG',
          'Roald Dahl',
          '3.0',
          '9780142410387',
          'A friendly giant story',
          '208',
          '1982',
          'Giants',
          '1',
        ],
      ];
      const mapping = {
        title: 0,
        author: 1,
        readingLevel: 2,
        isbn: 3,
        description: 4,
        pageCount: 5,
        publicationYear: 6,
        seriesName: 7,
        seriesNumber: 8,
      };

      const books = mapCSVToBooks(rows, mapping);

      expect(books[0]).toEqual({
        title: 'The BFG',
        author: 'Roald Dahl',
        readingLevel: '3.0',
        isbn: '9780142410387',
        description: 'A friendly giant story',
        pageCount: '208',
        publicationYear: '1982',
        seriesName: 'Giants',
        seriesNumber: '1',
      });
    });

    it('should set unmapped metadata fields to null', () => {
      const rows = [['The BFG', 'Roald Dahl']];
      const mapping = {
        title: 0,
        author: 1,
        readingLevel: null,
        isbn: null,
        description: null,
        pageCount: null,
        publicationYear: null,
        seriesName: null,
        seriesNumber: null,
      };

      const books = mapCSVToBooks(rows, mapping);

      expect(books[0].description).toBeNull();
      expect(books[0].pageCount).toBeNull();
      expect(books[0].publicationYear).toBeNull();
      expect(books[0].seriesName).toBeNull();
      expect(books[0].seriesNumber).toBeNull();
    });
  });
});
