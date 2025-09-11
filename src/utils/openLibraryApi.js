/**
 * OpenLibrary API Integration
 * Provides functions to search for books and retrieve author information
 * from the OpenLibrary.org API
 */

const OPENLIBRARY_BASE_URL = 'https://openlibrary.org';
const SEARCH_API_URL = `${OPENLIBRARY_BASE_URL}/search.json`;

/**
 * Search for books by title using OpenLibrary Search API
 * @param {string} title - The book title to search for
 * @param {number} limit - Maximum number of results to return (default: 5)
 * @returns {Promise<Array>} Array of book results
 */
export async function searchBooksByTitle(title, limit = 5) {
  if (!title || typeof title !== 'string') {
    throw new Error('Title is required and must be a string');
  }

  try {
    const searchParams = new URLSearchParams({
      title: title.trim(),
      limit: limit.toString(),
      fields: 'key,title,author_name,author_key,first_publish_year,isbn,publisher,language'
    });

    const response = await fetch(`${SEARCH_API_URL}?${searchParams}`, {
      headers: {
        'User-Agent': 'KidsReadingManager/1.0 (educational-app)'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenLibrary API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.docs || [];
  } catch (error) {
    console.error('Error searching OpenLibrary:', error);
    throw error;
  }
}

/**
 * Find the best author match for a book title
 * @param {string} title - The book title to search for
 * @returns {Promise<string|null>} The best matching author name or null if not found
 */
export async function findAuthorForBook(title) {
  try {
    const results = await searchBooksByTitle(title, 10);
    
    if (!results || results.length === 0) {
      return null;
    }

    // Find the best match based on title similarity and author availability
    const bestMatch = findBestTitleMatch(title, results);
    
    if (bestMatch && bestMatch.author_name && bestMatch.author_name.length > 0) {
      // Return the first author (primary author)
      return bestMatch.author_name[0];
    }

    return null;
  } catch (error) {
    console.error(`Error finding author for "${title}":`, error);
    return null;
  }
}

/**
 * Find the best matching book result based on title similarity
 * @param {string} searchTitle - The original search title
 * @param {Array} results - Array of search results from OpenLibrary
 * @returns {Object|null} The best matching result or null
 */
function findBestTitleMatch(searchTitle, results) {
  if (!results || results.length === 0) {
    return null;
  }

  const normalizedSearchTitle = normalizeTitle(searchTitle);
  
  // Score each result based on title similarity
  const scoredResults = results.map(result => {
    const normalizedResultTitle = normalizeTitle(result.title || '');
    const similarity = calculateTitleSimilarity(normalizedSearchTitle, normalizedResultTitle);
    
    return {
      ...result,
      similarity,
      hasAuthor: result.author_name && result.author_name.length > 0
    };
  });

  // Sort by similarity (descending) and prefer results with authors
  scoredResults.sort((a, b) => {
    // Prioritize results with authors
    if (a.hasAuthor && !b.hasAuthor) return -1;
    if (!a.hasAuthor && b.hasAuthor) return 1;
    
    // Then sort by similarity
    return b.similarity - a.similarity;
  });

  // Return the best match if similarity is above threshold
  const bestMatch = scoredResults[0];
  if (bestMatch && bestMatch.similarity > 0.3) {
    return bestMatch;
  }

  return null;
}

/**
 * Normalize a title for comparison
 * @param {string} title - The title to normalize
 * @returns {string} Normalized title
 */
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Calculate similarity between two titles using a simple word-based approach
 * @param {string} title1 - First title
 * @param {string} title2 - Second title
 * @returns {number} Similarity score between 0 and 1
 */
function calculateTitleSimilarity(title1, title2) {
  const words1 = title1.split(' ').filter(word => word.length > 2);
  const words2 = title2.split(' ').filter(word => word.length > 2);
  
  if (words1.length === 0 || words2.length === 0) {
    return 0;
  }

  // Check for exact match
  if (title1 === title2) {
    return 1;
  }

  // Check if one title contains the other
  if (title1.includes(title2) || title2.includes(title1)) {
    return 0.8;
  }

  // Count matching words
  let matchingWords = 0;
  for (const word1 of words1) {
    if (words2.some(word2 => word2.includes(word1) || word1.includes(word2))) {
      matchingWords++;
    }
  }

  // Calculate similarity as ratio of matching words
  const maxWords = Math.max(words1.length, words2.length);
  return matchingWords / maxWords;
}

/**
 * Batch process multiple books to find missing authors
 * @param {Array} books - Array of book objects with title and author properties
 * @param {Function} onProgress - Callback function called with progress updates
 * @returns {Promise<Array>} Array of results with original book and found author
 */
export async function batchFindMissingAuthors(books, onProgress = null) {
  const results = [];
  const booksWithoutAuthors = books.filter(book => !book.author || book.author.trim() === '');
  
  if (booksWithoutAuthors.length === 0) {
    return [];
  }

  for (let i = 0; i < booksWithoutAuthors.length; i++) {
    const book = booksWithoutAuthors[i];
    
    try {
      // Add a small delay to be respectful to the API
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const foundAuthor = await findAuthorForBook(book.title);
      
      results.push({
        book,
        foundAuthor,
        success: foundAuthor !== null
      });

      // Call progress callback if provided
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksWithoutAuthors.length,
          book: book.title,
          foundAuthor,
          success: foundAuthor !== null
        });
      }
    } catch (error) {
      console.error(`Error processing book "${book.title}":`, error);
      results.push({
        book,
        foundAuthor: null,
        success: false,
        error: error.message
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksWithoutAuthors.length,
          book: book.title,
          foundAuthor: null,
          success: false,
          error: error.message
        });
      }
    }
  }

  return results;
}