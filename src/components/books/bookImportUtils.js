/**
 * Pure utility functions for book import CSV parsing and duplicate detection.
 * Extracted from BookManager.js — no React, no state.
 */

export const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
};

export const parseCSV = (csvText) => {
  const lines = csvText.split('\n').filter((line) => line.trim());
  if (lines.length < 2) throw new Error('CSV file must have at least a header row and one data row');

  const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
  const expectedHeaders = ['Title', 'Author', 'Reading Level', 'Age Range'];

  // Check if headers match expected format
  const headerMatches = expectedHeaders.every((expected) =>
    headers.some((header) => header.toLowerCase() === expected.toLowerCase())
  );

  if (!headerMatches) {
    throw new Error('CSV headers must include: Title, Author, Reading Level, Age Range');
  }

  const books = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length >= 4) {
      books.push({
        title: values[0]?.trim() || '',
        author: values[1]?.trim() || null,
        readingLevel: values[2]?.trim() || null,
        ageRange: values[3]?.trim() || null,
      });
    }
  }

  if (books.length === 0) throw new Error('No valid books found in CSV file');

  return books;
};

// Duplicate detection helper function
export const isDuplicateBook = (newBook, existingBooks) => {
  const normalizeTitle = (title) => {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  };

  const normalizeAuthor = (author) => {
    if (!author) return '';
    return author
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ');
  };

  const newTitle = normalizeTitle(newBook.title || '');
  const newAuthor = normalizeAuthor(newBook.author || '');

  return existingBooks.some((existingBook) => {
    const existingTitle = normalizeTitle(existingBook.title || '');
    const existingAuthor = normalizeAuthor(existingBook.author || '');

    // Check for exact title match
    if (newTitle === existingTitle) {
      // If both have authors, they must match
      if (newAuthor && existingAuthor) {
        return newAuthor === existingAuthor;
      }
      // If one has no author, consider it a duplicate (same title)
      return true;
    }
    return false;
  });
};
