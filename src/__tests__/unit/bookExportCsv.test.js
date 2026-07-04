import { describe, it, expect } from 'vitest';
import { buildBooksCsv } from '../../components/books/BookExportMenu';
import { parseCSV, detectColumnMapping, mapCSVToBooks } from '../../utils/csvParser';
import { parseCSV as legacyParseCSV } from '../../components/books/bookImportUtils';

const fullBook = {
  title: 'The Minibeast Zoo',
  author: 'Roderick Hunt',
  readingLevel: '2.4',
  ageRange: '5-7',
  isbn: '9780198487890',
  description: 'A trip to the "bug" zoo.\nWith a second line.',
  pageCount: 32,
  publicationYear: 2011,
  seriesName: 'Oxford Reading Tree',
  seriesNumber: 4,
};

describe('buildBooksCsv', () => {
  it('exports all book fields with the full header row', () => {
    const csv = buildBooksCsv([fullBook]);
    expect(csv.split('\n')[0]).toBe(
      'Title,Author,Reading Level,Age Range,ISBN,Description,Pages,Publication Year,Series,Series Number'
    );
    expect(csv).toContain('9780198487890');
    expect(csv).toContain('Oxford Reading Tree');
  });

  it('escapes quotes and flattens newlines so rows stay intact', () => {
    const csv = buildBooksCsv([fullBook]);
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('""bug""');
    expect(csv).toContain('zoo. With a second line.');
  });

  it('renders missing fields as empty cells and coerces numbers', () => {
    const csv = buildBooksCsv([{ title: 'Bare Book' }]);
    expect(csv.split('\n')[1]).toBe('"Bare Book","","","","","","","","",""');
    expect(buildBooksCsv([fullBook])).toContain('"32"');
  });

  it('round-trips through the import wizard parser with every column auto-detected', () => {
    const csv = buildBooksCsv([fullBook]);
    const parsed = parseCSV(csv);
    const mapping = detectColumnMapping(parsed.headers);

    expect(mapping.title).not.toBeNull();
    expect(mapping.author).not.toBeNull();
    expect(mapping.readingLevel).not.toBeNull();
    expect(mapping.isbn).not.toBeNull();
    expect(mapping.description).not.toBeNull();
    expect(mapping.pageCount).not.toBeNull();
    expect(mapping.publicationYear).not.toBeNull();
    expect(mapping.seriesName).not.toBeNull();
    expect(mapping.seriesNumber).not.toBeNull();

    const [book] = mapCSVToBooks(parsed.rows, mapping);
    expect(book).toMatchObject({
      title: fullBook.title,
      author: fullBook.author,
      readingLevel: fullBook.readingLevel,
      isbn: fullBook.isbn,
      pageCount: '32',
      publicationYear: '2011',
      seriesName: fullBook.seriesName,
      seriesNumber: '4',
    });
  });

  // Audit cycle 16 SEC-H1: formula injection neutralised on export, guard
  // stripped again on import so titles round-trip unchanged.
  it('neutralises formula-injection titles and round-trips them', () => {
    const hostile = { title: '=HYPERLINK("http://evil.example","click")', author: '@author' };
    const csv = buildBooksCsv([hostile]);
    const dataRow = csv.split('\n')[1];
    expect(dataRow.startsWith(`"'=HYPERLINK`)).toBe(true);
    expect(dataRow).toContain(`"'@author"`);

    const parsed = parseCSV(csv);
    const mapping = detectColumnMapping(parsed.headers);
    const [book] = mapCSVToBooks(parsed.rows, mapping);
    expect(book.title).toBe(hostile.title);
    expect(book.author).toBe(hostile.author);
  });

  it('stays parseable by the legacy positional importer', () => {
    const books = legacyParseCSV(buildBooksCsv([fullBook]));
    expect(books).toEqual([
      { title: fullBook.title, author: fullBook.author, readingLevel: '2.4', ageRange: '5-7' },
    ]);
  });
});
