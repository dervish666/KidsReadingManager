import { Hono } from 'hono';

// Import data provider functions
import { createProvider } from '../data/index.js';

// Import KV service functions
import {
  getStudents,
  getClasses,
  getBooks
} from '../services/kvService.js';

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

  // Basic validation - only title is required
  if (!bookData.title) {
    throw badRequestError('Book must have a title');
  }

  const newBook = {
    id: bookData.id || crypto.randomUUID(),
    title: bookData.title,
    author: bookData.author || null,
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

  // Basic validation - only title is required
  if (!bookData.title) {
    throw badRequestError('Book must have a title');
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

/**
 * POST /api/books/bulk
 * Bulk import books with duplicate detection and KV optimization
 */
booksRouter.post('/bulk', async (c) => {
  const booksData = await c.req.json();

  // Validate input
  if (!Array.isArray(booksData) || booksData.length === 0) {
    throw badRequestError('Request must contain an array of books');
  }

  // Filter valid books and prepare them
  const validBooks = booksData
    .filter(book => book.title && book.title.trim())
    .map(book => ({
      id: crypto.randomUUID(),
      title: book.title.trim(),
      author: book.author || null,
      genreIds: book.genreIds || [],
      readingLevel: book.readingLevel || null,
      ageRange: book.ageRange || null,
      description: book.description || null
    }));

  if (validBooks.length === 0) {
    throw badRequestError('No valid books found in request');
  }

  // Get existing books for duplicate detection
  const provider = await createProvider(c.env);
  const existingBooks = await provider.getAllBooks();

  // Filter out duplicates
  const isDuplicate = (newBook, existingBooks) => {
    const normalizeTitle = (title) => title.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
    const normalizeAuthor = (author) => author ? author.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ') : '';

    const newTitle = normalizeTitle(newBook.title);
    const newAuthor = normalizeAuthor(newBook.author);

    return existingBooks.some(existing => {
      const existingTitle = normalizeTitle(existing.title);
      const existingAuthor = normalizeAuthor(existing.author);

      if (newTitle === existingTitle) {
        if (newAuthor && existingAuthor) {
          return newAuthor === existingAuthor;
        }
        return true; // Same title, consider duplicate
      }
      return false;
    });
  };

  const newBooks = validBooks.filter(book => !isDuplicate(book, existingBooks));
  const duplicateCount = validBooks.length - newBooks.length;

  // Use batch operation for efficiency (only 2 KV operations total)
  let savedBooks = [];
  if (newBooks.length > 0) {
    savedBooks = await provider.addBooksBatch(newBooks);
  }

  return c.json({
    imported: savedBooks.length,
    duplicates: duplicateCount,
    total: validBooks.length,
    books: savedBooks
  }, 201);
});

/**
 * GET /api/books/recommendations
 * Get AI-powered book recommendations for a student
 */
booksRouter.get('/recommendations', async (c) => {
  try {
    // Extract studentId from query parameters
    const { studentId } = c.req.query();

    if (!studentId) {
      return c.json({ error: 'studentId query parameter is required' }, 400);
    }

    // Get student data from KV service
    const students = await getStudents(c.env);
    console.log('Retrieved students:', students?.length || 0, 'total students');

    const student = students.find(s => s.id === studentId);

    if (!student) {
      console.log('Student not found, available student IDs:', students.map(s => s.id));
      return c.json({ error: `Student with ID ${studentId} not found` }, 404);
    }

    console.log('Found student:', student.name, 'with', student.readingSessions?.length || 0, 'reading sessions');

    // Get all books using data provider
    const provider = await createProvider(c.env);
    const allBooks = await provider.getAllBooks();
    console.log('Retrieved books:', allBooks?.length || 0, 'total books');
    if (allBooks?.length > 0) {
      console.log('First few books:', allBooks.slice(0, 3).map(b => `${b.title} by ${b.author}`));
    }

    // Get books the student has already read
    const readBookIds = student.readingSessions?.map(session => session.bookId).filter(Boolean) || [];
    console.log('Read book IDs:', readBookIds);

    const readBooks = allBooks.filter(book => readBookIds.includes(book.id));
    console.log('Found read books:', readBooks.length, readBooks.map(b => b.title));

    // Filter out books the student has already read
    const unreadBooks = allBooks.filter(book => !readBookIds.includes(book.id));
    console.log('Available unread books:', unreadBooks.length, unreadBooks.slice(0, 5).map(b => b.title));

    // Get Anthropic API key from environment
    const anthropicApiKey = c.env.ANTHROPIC_API_KEY;

    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY not found in environment variables');
      // Return fallback recommendations
      const fallbackRecommendations = [
        {
          title: "Charlotte's Web",
          author: "E.B. White",
          genre: "Fiction",
          ageRange: "8-12",
          reason: "Classic children's literature with themes of friendship and growing up"
        },
        {
          title: "The Secret Garden",
          author: "Frances Hodgson Burnett",
          genre: "Fiction",
          ageRange: "9-13",
          reason: "Beautiful story about healing, friendship, and the power of nature"
        },
        {
          title: "Harry Potter and the Sorcerer's Stone",
          author: "J.K. Rowling",
          genre: "Fantasy",
          ageRange: "9-12",
          reason: "Magical adventure that sparks imagination and creativity"
        }
      ];

      return c.json({ recommendations: fallbackRecommendations });
    }

    // Import Anthropic SDK dynamically (ESM compatibility)
    const { Anthropic } = await import('@anthropic-ai/sdk');

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });

    // Build prompt for Claude
    const studentProfile = {
      name: student.name,
      readingLevel: student.readingLevel || 'intermediate',
      preferences: student.preferences || {},
      booksRead: readBooks.slice(0, 10).map(book => ({
        title: book.title,
        author: book.author,
        genre: book.genreIds?.join(', ') || 'General Fiction',
        readingLevel: book.readingLevel || 'intermediate'
      }))
    };

    const availableBooks = unreadBooks.slice(0, 50).map(book => ({
      title: book.title,
      author: book.author,
      genre: book.genreIds?.join(', ') || 'General Fiction',
      readingLevel: book.readingLevel || 'intermediate',
      ageRange: book.ageRange || '8-12'
    }));

    let prompt;
    if (studentProfile.booksRead.length === 0 && availableBooks.length === 0) {
      // No books data available - provide general recommendations
      prompt = `You are an expert children's librarian with decades of experience in book recommendations for young readers.

STUDENT PROFILE:
- Name: ${studentProfile.name}
- Reading Level: ${studentProfile.readingLevel}
- Favorite Genres: ${studentProfile.preferences.favoriteGenreIds?.join(', ') || 'Not specified'}
- Likes: ${studentProfile.preferences.likes?.join(', ') || 'Not specified'}
- Dislikes: ${studentProfile.preferences.dislikes?.join(', ') || 'Not specified'}

TASK: Since there are no books currently in the library system, please recommend 3 excellent books that would be perfect for this student based on their profile and interests. For each recommendation, provide:

1. **Title and Author**: Well-known, high-quality children's books
2. **Genre**: Main genre category
3. **Age Range**: Appropriate age range for the student's reading level
4. **Reason**: A personalized explanation (2-3 sentences) of why this book would be a great choice for this specific student based on their profile and interests.

Format your response as a valid JSON array with exactly 3 objects, each containing: title, author, genre, ageRange, and reason.

Focus on age-appropriate, engaging books that match their reading level and interests.`;
    } else {
      // Normal case with books data
      prompt = `You are an expert children's librarian with decades of experience in book recommendations for young readers.

STUDENT PROFILE:
- Name: ${studentProfile.name}
- Reading Level: ${studentProfile.readingLevel}
- Favorite Genres: ${studentProfile.preferences.favoriteGenreIds?.join(', ') || 'Not specified'}
- Likes: ${studentProfile.preferences.likes?.join(', ') || 'Not specified'}
- Dislikes: ${studentProfile.preferences.dislikes?.join(', ') || 'Not specified'}

BOOKS ALREADY READ:
${studentProfile.booksRead.length > 0 ?
  studentProfile.booksRead.map(book => `- ${book.title} by ${book.author} (${book.genre})`).join('\n') :
  'No books recorded yet'}

AVAILABLE BOOKS TO RECOMMEND FROM:
${availableBooks.length > 0 ?
  availableBooks.map((book, index) => `${index + 1}. ${book.title} by ${book.author} (Genre: ${book.genre}, Age: ${book.ageRange}, Level: ${book.readingLevel})`).join('\n') :
  'No books currently available in the library system'}

TASK: Recommend exactly 3 books that would be perfect for this student. For each recommendation, provide:

1. **Title and Author**: ${availableBooks.length > 0 ? 'From the available books list' : 'Well-known, high-quality children\'s books'}
2. **Genre**: Main genre category
3. **Age Range**: Appropriate age range for the student's reading level
4. **Reason**: A personalized explanation (2-3 sentences) of why this book would be a great choice for this specific student based on their reading history, preferences, and interests.

Format your response as a valid JSON array with exactly 3 objects, each containing: title, author, genre, ageRange, and reason.

Ensure recommendations are age-appropriate and match the student's reading level and interests.${availableBooks.length > 0 ? ' Avoid books that are too similar to ones they\'ve already read.' : ''}`;
    }

    // Make API call to Claude
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const recommendationsText = response.content[0].text;

    // Parse the JSON response
    let recommendations;
    try {
      // Extract JSON from the response (Claude might include extra text)
      const jsonMatch = recommendationsText.match(/\[[\s\S]*\]/);
      const jsonText = jsonMatch ? jsonMatch[0] : recommendationsText;
      recommendations = JSON.parse(jsonText);

      // Validate the response format
      if (!Array.isArray(recommendations) || recommendations.length !== 3) {
        throw new Error('Invalid recommendations format');
      }

      // Ensure each recommendation has required fields
      recommendations = recommendations.map(rec => ({
        title: rec.title || 'Unknown Title',
        author: rec.author || 'Unknown Author',
        genre: rec.genre || 'Fiction',
        ageRange: rec.ageRange || '8-12',
        reason: rec.reason || 'Recommended based on reading preferences'
      }));

    } catch (parseError) {
      console.error('Failed to parse Claude response:', parseError);
      console.error('Raw response:', recommendationsText);

      // Return fallback recommendations
      const emergencyRecommendations = [
        {
          title: "Wonder",
          author: "R.J. Palacio",
          genre: "Fiction",
          ageRange: "8-12",
          reason: "Inspiring story about kindness and understanding differences, perfect for developing empathy and emotional intelligence"
        },
        {
          title: "The One and Only Ivan",
          author: "Katherine Applegate",
          genre: "Fiction",
          ageRange: "8-12",
          reason: "Heartwarming story about friendship and freedom told from an elephant's perspective"
        },
        {
          title: "Roald Dahl Collection",
          author: "Roald Dahl",
          genre: "Fiction",
          ageRange: "8-12",
          reason: "Imaginative and humorous stories that spark creativity and encourage a love of reading"
        }
      ];

      return c.json({ recommendations: emergencyRecommendations });
    }

    console.log(`Successfully generated ${recommendations.length} AI recommendations for student ${studentId}`);

    return c.json({ recommendations });

  } catch (error) {
    console.error('Error generating recommendations:', error);

    // Return basic fallback recommendations
    const fallbackRecommendations = [
      {
        title: "The Giving Tree",
        author: "Shel Silverstein",
        genre: "Fiction",
        ageRange: "5-10",
        reason: "A touching story about friendship and generosity that teaches valuable life lessons"
      },
      {
        title: "Where the Wild Things Are",
        author: "Maurice Sendak",
        genre: "Picture Book",
        ageRange: "4-8",
        reason: "A classic picture book that explores imagination and emotions through Max's adventure"
      },
      {
        title: "Green Eggs and Ham",
        author: "Dr. Seuss",
        genre: "Fiction",
        ageRange: "4-8",
        reason: "Fun rhyming story that encourages trying new things and expanding your horizons"
      }
    ];

    return c.json({ recommendations: fallbackRecommendations });
  }
});

export { booksRouter };