/**
 * CSV Parser utilities for book import
 */

/**
 * Parse CSV text into headers and rows
 */
export const parseCSV = (csvText) => {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 1) {
    throw new Error('CSV file is empty');
  }

  const headers = parseCSVLine(lines[0]);
  const rows = lines.slice(1).map(line => parseCSVLine(line)).filter(row => row.length > 0);

  return { headers, rows };
};

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
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
};

/**
 * Auto-detect column mapping from headers
 */
export const detectColumnMapping = (headers) => {
  const normalized = headers.map(h => h.toLowerCase().trim());

  const titlePatterns = ['title', 'book title', 'book name', 'name'];
  const authorPatterns = ['author', 'author name', 'writer', 'by'];
  const levelPatterns = ['reading level', 'level', 'reading_level', 'readinglevel', 'grade level'];
  const isbnPatterns = ['isbn', 'isbn13', 'isbn-13', 'isbn10', 'isbn-10'];

  const findIndex = (patterns) => {
    for (const pattern of patterns) {
      const idx = normalized.findIndex(h => h.includes(pattern) || pattern.includes(h));
      if (idx !== -1) return idx;
    }
    return null;
  };

  return {
    title: findIndex(titlePatterns),
    author: findIndex(authorPatterns),
    readingLevel: findIndex(levelPatterns),
    isbn: findIndex(isbnPatterns)
  };
};

/**
 * Convert CSV rows to book objects using column mapping
 */
export const mapCSVToBooks = (rows, mapping) => {
  return rows
    .map(row => {
      const title = mapping.title !== null ? row[mapping.title]?.trim() : null;
      if (!title) return null;

      return {
        title,
        author: mapping.author !== null ? row[mapping.author]?.trim() || null : null,
        readingLevel: mapping.readingLevel !== null ? row[mapping.readingLevel]?.trim() || null : null,
        isbn: mapping.isbn !== null ? row[mapping.isbn]?.trim() || null : null
      };
    })
    .filter(book => book !== null);
};
