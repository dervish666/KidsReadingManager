/**
 * CSV Parser utilities for book import
 */

/**
 * Parse CSV text into headers and rows
 */
export const parseCSV = (csvText) => {
  // Strip UTF-8 BOM if present (common in Excel-generated CSVs)
  const cleanText = csvText.replace(/^\uFEFF/, '');
  const lines = cleanText.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 1) {
    throw new Error('CSV file is empty');
  }

  const headers = parseCSVLine(lines[0]);
  const rows = lines
    .slice(1)
    .map((line) => parseCSVLine(line))
    .filter((row) => row.length > 0);

  return { headers, rows };
};

/**
 * Undo the formula-injection guard applied on export (sanitizeCsvCell in
 * helpers.js): a leading ' is only stripped when it shields a formula
 * trigger char, so genuine apostrophe-leading titles survive.
 */
const stripFormulaGuard = (value) => (/^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value);

/**
 * Parse a single CSV line, handling quotes and commas
 */
const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(stripFormulaGuard(current.trim()));
      current = '';
    } else {
      current += char;
    }
  }

  result.push(stripFormulaGuard(current.trim()));
  return result;
};

/**
 * Auto-detect column mapping from headers, with optional content sniffing.
 *
 * Pass the parsed data rows as the second argument to enable a fallback for
 * unknown header names: columns whose values look like ISBNs, years, AR-style
 * reading levels, or page counts are claimed by data shape when no header
 * matched. Library-software exports name columns unpredictably, but an ISBN
 * column is unmistakable from its values.
 */
export const detectColumnMapping = (headers, rows = []) => {
  const normalized = headers.map((h) => h.toLowerCase().trim());

  const titlePatterns = ['title', 'book title', 'book name', 'name'];
  // 'published by' is deliberately absent: it's a publisher column, and via
  // substring matching it also captured plain 'Published' (a year column).
  const authorPatterns = ['author', 'author name', 'writer', 'by'];
  const levelPatterns = [
    'reading level',
    'book level',
    'atos book level',
    'level',
    'reading_level',
    'readinglevel',
    'grade level',
    'bl',
  ];
  const isbnPatterns = ['isbn', 'isbn13', 'isbn-13', 'isbn10', 'isbn-10'];
  const descriptionPatterns = ['description', 'summary', 'synopsis', 'about'];
  const pageCountPatterns = [
    'pages',
    'page count',
    'page_count',
    'pagecount',
    'no.of pages',
    'no. of pages',
    'number of pages',
    'num pages',
  ];
  const yearPatterns = ['year published', 'publication year', 'pub year', 'year', 'published'];
  const seriesNamePatterns = ['series', 'series name', 'series_name'];
  const seriesNumberPatterns = [
    'series number',
    'series_number',
    'series no',
    'series #',
    'book number',
    'volume',
  ];

  const findIndex = (patterns, exclude) => {
    const usable = (h) => !exclude || !exclude.test(h);
    // First pass: exact match
    for (const pattern of patterns) {
      const idx = normalized.findIndex((h) => usable(h) && h === pattern);
      if (idx !== -1) return idx;
    }
    // Second pass: substring match (skip short patterns to avoid false positives like 'bl' matching 'publisher')
    for (const pattern of patterns) {
      if (pattern.length <= 2) continue;
      const idx = normalized.findIndex(
        (h) => usable(h) && (h.includes(pattern) || pattern.includes(h))
      );
      if (idx !== -1) return idx;
    }
    return null;
  };

  const mapping = {
    title: findIndex(titlePatterns),
    author: findIndex(authorPatterns),
    // AR exports carry both Book Level and Interest Level; bare 'level' must
    // never claim the interest column.
    readingLevel: findIndex(levelPatterns, /interest/),
    isbn: findIndex(isbnPatterns),
    description: findIndex(descriptionPatterns),
    pageCount: findIndex(pageCountPatterns),
    // 'publisher' contains 'published' — without the guard a Publisher column
    // is claimed as the year whenever no real year header exists.
    publicationYear: findIndex(yearPatterns, /publisher/),
    seriesName: findIndex(seriesNamePatterns),
    seriesNumber: findIndex(seriesNumberPatterns),
  };

  return sniffUnmappedColumns(mapping, headers, rows);
};

const SNIFF_SAMPLE_ROWS = 20;
const SNIFF_MATCH_RATIO = 0.8;

const isIsbnValue = (value) => {
  const digits = value.replace(/[-\s]/g, '');
  return /^(97[89]\d{10}|\d{9}[\dXx])$/.test(digits);
};
const isYearValue = (value) => /^(1[89]|20)\d{2}$/.test(value);
const isLevelValue = (value) => {
  if (!/^\d{1,2}\.\d$/.test(value)) return false;
  const level = Number(value);
  return level >= 0.1 && level <= 13.9;
};
const isPageCountValue = (value) =>
  /^\d{1,4}$/.test(value) && !isYearValue(value) && Number(value) >= 1 && Number(value) <= 3000;

/**
 * Claim still-unmapped fields by data shape. Checked in confidence order —
 * ISBNs are unambiguous, years and AR levels are strong, bare page-count
 * integers are the loosest. Each column can be claimed once; the mapping
 * step's manual dropdowns remain the override for anything sniffed wrong.
 */
const sniffUnmappedColumns = (mapping, headers, rows) => {
  if (!rows || rows.length === 0) return mapping;

  const sniffers = [
    ['isbn', isIsbnValue],
    ['publicationYear', isYearValue],
    ['readingLevel', isLevelValue],
    ['pageCount', isPageCountValue],
  ];
  const claimed = new Set(Object.values(mapping).filter((idx) => idx !== null));

  for (const [field, matches] of sniffers) {
    if (mapping[field] !== null) continue;
    for (let idx = 0; idx < headers.length; idx++) {
      if (claimed.has(idx)) continue;
      const samples = [];
      for (const row of rows) {
        if (samples.length >= SNIFF_SAMPLE_ROWS) break;
        const value = row[idx]?.trim();
        if (value) samples.push(value);
      }
      if (samples.length === 0) continue;
      const hits = samples.filter(matches).length;
      if (hits / samples.length >= SNIFF_MATCH_RATIO) {
        mapping[field] = idx;
        claimed.add(idx);
        break;
      }
    }
  }

  return mapping;
};

/**
 * Convert CSV rows to book objects using column mapping
 */
export const mapCSVToBooks = (rows, mapping) => {
  return rows
    .map((row) => {
      const title = mapping.title !== null ? row[mapping.title]?.trim() : null;
      if (!title) return null;

      const book = {
        title,
        author: mapping.author !== null ? row[mapping.author]?.trim() || null : null,
        readingLevel:
          mapping.readingLevel !== null ? row[mapping.readingLevel]?.trim() || null : null,
        isbn: mapping.isbn !== null ? row[mapping.isbn]?.trim() || null : null,
        description: mapping.description !== null ? row[mapping.description]?.trim() || null : null,
        pageCount: mapping.pageCount !== null ? row[mapping.pageCount]?.trim() || null : null,
        publicationYear:
          mapping.publicationYear !== null ? row[mapping.publicationYear]?.trim() || null : null,
        seriesName: mapping.seriesName !== null ? row[mapping.seriesName]?.trim() || null : null,
        seriesNumber:
          mapping.seriesNumber !== null ? row[mapping.seriesNumber]?.trim() || null : null,
      };

      return book;
    })
    .filter((book) => book !== null);
};
