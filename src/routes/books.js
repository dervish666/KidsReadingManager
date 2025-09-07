import { Hono } from 'hono';

// Import data provider functions
import { createProvider } from '../data/index.js';

// Import utilities
import { notFoundError, badRequestError } from '../middleware/errorHandler';

// Create router
const booksRouter = new Hono();

/**
 * GET /api/books
 * Get all books
 */
booksRouter.get('/', async (c) => {
  const provider = await createProvider(c.env);
  const books = await provider.getAllBooks();
  return c.json(books);
});

/**
 * POST /api/books
 * Add a new book
 */
booksRouter.post('/', async (c) => {
  const bookData = await c.req.json();

  // Basic validation
  if (!bookData.title || !bookData.author) {
    throw badRequestError('Book must have title and author');
  }

  const newBook = {
    id: bookData.id || crypto.randomUUID(),
    title: bookData.title,
    author: bookData.author,
    genreIds: bookData.genreIds || [],
    readingLevel: bookData.readingLevel || null,
    ageRange: bookData.ageRange || null,
    description: bookData.description || null
  };

  const provider = await createProvider(c.env);
  const savedBook = await provider.addBook(newBook);
  return c.json(savedBook, 201);
});

/**
 * PUT /api/books/:id
 * Update a book
 */
booksRouter.put('/:id', async (c) => {
  const { id } = c.req.param();
  const bookData = await c.req.json();

  // Basic validation
  if (!bookData.title || !bookData.author) {
    throw badRequestError('Book must have title and author');
  }

  // Check if book exists
  const provider = await createProvider(c.env);
  const existingBook = await provider.getBookById(id);
  if (!existingBook) {
    throw notFoundError(`Book with ID ${id} not found`);
  }

  // Update book
  const updatedBook = {
    ...existingBook,
    title: bookData.title,
    author: bookData.author,
    genreIds: bookData.genreIds || existingBook.genreIds || [],
    readingLevel: bookData.readingLevel,
    ageRange: bookData.ageRange,
    description: bookData.description,
    id // Ensure ID doesn't change
  };

  const updateProvider = await createProvider(c.env);
  const savedBook = await updateProvider.updateBook(id, updatedBook);
  return c.json(savedBook);
});

/**
 * DELETE /api/books/:id
 * Delete a book
 */
booksRouter.delete('/:id', async (c) => {
   const { id } = c.req.param();

   // Delete book
   const provider = await createProvider(c.env);
   const deletedBook = await provider.deleteBook(id);

   if (!deletedBook) {
     throw notFoundError(`Book with ID ${id} not found`);
   }

   return c.json({ message: 'Book deleted successfully' });
});

// Placeholder for book recommendations endpoint
booksRouter.get('/recommendations', async (c) => {
  return c.json({ message: 'Book recommendations endpoint - to be implemented' });
});

export { booksRouter };