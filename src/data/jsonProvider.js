const fs = require('fs');
const path = require('path');

// For local development use a project-local config directory
const DATA_FILE = path.join(__dirname, '..', '..', 'config', 'app_data.json');

/**
 * JSON Provider for Book Data
 * Handles all book operations using local JSON file storage
 */

// Helper to read all data from JSON file
const readData = () => {
  try {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    const parsedData = JSON.parse(data);

    // Ensure books array exists
    if (!parsedData.books) parsedData.books = [];

    return parsedData;
  } catch (error) {
    console.error('Error reading data file:', error);
    return { books: [] };
  }
};

// Helper to write all data to JSON file
const writeData = (data) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing data file:', error);
    return false;
  }
};

/**
 * Get all books from JSON storage
 * @returns {Array} Array of book objects
 */
const getAllBooks = () => {
  const data = readData();
  return data.books || [];
};

/**
 * Get a specific book by ID
 * @param {string} id - Book ID to retrieve
 * @returns {Object|null} Book object or null if not found
 */
const getBookById = (id) => {
  const data = readData();
  return data.books.find(book => book.id === id) || null;
};

/**
 * Add a new book to JSON storage
 * @param {Object} book - Book object to add
 * @returns {Object} Added book object with any server modifications
 */
const addBook = (book) => {
  const data = readData();

  // Initialize books array if it doesn't exist
  if (!data.books) data.books = [];

  // Add the book
  data.books.push(book);

  // Write back to file
  if (writeData(data)) {
    return book;
  } else {
    throw new Error('Failed to save book');
  }
};

/**
 * Update an existing book
 * @param {string} id - Book ID to update
 * @param {Object} updatedBook - Updated book data
 * @returns {Object} Updated book object
 */
const updateBook = (id, updatedBook) => {
  const data = readData();

  // Initialize books array if it doesn't exist
  if (!data.books) data.books = [];

  const index = data.books.findIndex(book => book.id === id);

  if (index === -1) {
    throw new Error('Book not found');
  }

  // Preserve the id and update other fields
  data.books[index] = { ...updatedBook, id };

  if (writeData(data)) {
    return data.books[index];
  } else {
    throw new Error('Failed to update book');
  }
};

/**
 * Delete a book by ID
 * @param {string} id - Book ID to delete
 * @returns {Object} Deleted book object for reference
 */
const deleteBook = (id) => {
  const data = readData();

  // Initialize books array if it doesn't exist
  if (!data.books) data.books = [];

  const bookToDelete = data.books.find(book => book.id === id);
  const initialLength = data.books.length;

  data.books = data.books.filter(book => book.id !== id);

  if (data.books.length === initialLength) {
    throw new Error('Book not found');
  }

  if (writeData(data)) {
    return bookToDelete;
  } else {
    throw new Error('Failed to delete book');
  }
};

module.exports = {
  getAllBooks,
  getBookById,
  addBook,
  updateBook,
  deleteBook
};