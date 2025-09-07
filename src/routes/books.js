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
  try {
    console.log('📚 POST /api/books - Starting book creation');
    
    const bookData = await c.req.json();
    console.log('📝 Received book data:', JSON.stringify(bookData, null, 2));

    // Basic validation
    if (!bookData.title || !bookData.author) {
      console.error('❌ Validation failed - missing title or author:', { title: bookData.title, author: bookData.author });
      throw badRequestError('Book must have title and author');
    }

    console.log('✅ Validation passed');

    const newBook = {
      id: bookData.id || crypto.randomUUID(),
      title: bookData.title,
      author: bookData.author,
      genreIds: bookData.genreIds || [],
      readingLevel: bookData.readingLevel || null,
      ageRange: bookData.ageRange || null,
      description: bookData.description || null
    };

    console.log('📖 Created book object:', JSON.stringify(newBook, null, 2));

    console.log('🔧 Creating provider with env:', { hasEnv: !!c.env, hasKV: !!(c.env?.READING_MANAGER_KV) });
    const provider = await createProvider(c.env);
    console.log('🔧 Provider created:', { provider: !!provider, methods: provider ? Object.keys(provider) : 'null' });

    if (!provider) {
      console.error('❌ Provider is null/undefined');
      throw new Error('Failed to create data provider');
    }

    console.log('💾 Calling provider.addBook...');
    const savedBook = await provider.addBook(newBook);
    console.log('✅ Book saved successfully:', JSON.stringify(savedBook, null, 2));
    
    return c.json(savedBook, 201);
  } catch (error) {
    console.error('❌ Error in POST /api/books:', error);
    console.error('❌ Error stack:', error.stack);
    throw error;
  }
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