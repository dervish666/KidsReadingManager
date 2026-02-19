/**
 * Google Books API Integration
 * Provides functions to search for books and retrieve metadata
 * from the Google Books API
 */

const GOOGLE_BOOKS_BASE_URL = 'https://www.googleapis.com/books/v1';
const VOLUMES_API_URL = `${GOOGLE_BOOKS_BASE_URL}/volumes`;

// Cache for Google Books API availability status
let googleBooksAvailable = null;
let lastAvailabilityCheck = 0;
const AVAILABILITY_CHECK_INTERVAL = 60000; // Re-check every 60 seconds

/**
 * Check if Google Books API is available with a quick timeout
 * @param {string} apiKey - Google Books API key
 * @param {number} timeout - Timeout in milliseconds (default: 3000ms)
 * @returns {Promise<boolean>} True if Google Books API is reachable
 */
export async function checkGoogleBooksAvailability(apiKey, timeout = 3000) {
  const now = Date.now();
  
  // Return cached result if recent
  if (googleBooksAvailable !== null && (now - lastAvailabilityCheck) < AVAILABILITY_CHECK_INTERVAL) {
    return googleBooksAvailable;
  }
  
  if (!apiKey) {
    console.log('Google Books API key not provided');
    googleBooksAvailable = false;
    lastAvailabilityCheck = now;
    return false;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    // Use a simple search request to check availability
    const response = await fetch(`${VOLUMES_API_URL}?q=test&maxResults=1&key=${apiKey}`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    googleBooksAvailable = response.ok;
    lastAvailabilityCheck = now;
    
    console.log(`Google Books API availability check: ${googleBooksAvailable ? 'available' : 'unavailable'}`);
    return googleBooksAvailable;
  } catch (error) {
    console.log('Google Books API availability check failed:', error.message);
    googleBooksAvailable = false;
    lastAvailabilityCheck = now;
    return false;
  }
}

/**
 * Reset the availability cache (useful for retry scenarios)
 */
export function resetGoogleBooksAvailabilityCache() {
  googleBooksAvailable = null;
  lastAvailabilityCheck = 0;
}

/**
 * Get the current cached availability status without making a request
 * @returns {{available: boolean|null, lastCheck: number, stale: boolean}}
 */
export function getGoogleBooksStatus() {
  const now = Date.now();
  return {
    available: googleBooksAvailable,
    lastCheck: lastAvailabilityCheck,
    stale: (now - lastAvailabilityCheck) >= AVAILABILITY_CHECK_INTERVAL
  };
}

/**
 * Search for books by title using Google Books API
 * @param {string} title - The book title to search for
 * @param {string} apiKey - Google Books API key
 * @param {number} limit - Maximum number of results to return (default: 5)
 * @returns {Promise<Array>} Array of book results
 */
export async function searchBooksByTitle(title, apiKey, limit = 5) {
  if (!title || typeof title !== 'string') {
    throw new Error('Title is required and must be a string');
  }
  
  if (!apiKey) {
    throw new Error('Google Books API key is required');
  }

  try {
    const searchParams = new URLSearchParams({
      q: `intitle:${title.trim()}`,
      maxResults: Math.min(limit, 40).toString(), // Google Books max is 40
      key: apiKey
    });

    const response = await fetch(`${VOLUMES_API_URL}?${searchParams}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Google Books API error: ${response.status} ${response.statusText} - ${errorData.error?.message || ''}`);
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error searching Google Books:', error);
    throw error;
  }
}

/**
 * Search for books by title and author using Google Books API
 * @param {string} title - The book title to search for
 * @param {string} author - The author name (optional)
 * @param {string} apiKey - Google Books API key
 * @param {number} limit - Maximum number of results to return (default: 5)
 * @returns {Promise<Array>} Array of book results
 */
export async function searchBooks(title, author, apiKey, limit = 5) {
  if (!title || typeof title !== 'string') {
    throw new Error('Title is required and must be a string');
  }
  
  if (!apiKey) {
    throw new Error('Google Books API key is required');
  }

  try {
    let query = `intitle:${title.trim()}`;
    if (author && author.trim()) {
      query += `+inauthor:${author.trim()}`;
    }
    
    const searchParams = new URLSearchParams({
      q: query,
      maxResults: Math.min(limit, 40).toString(),
      key: apiKey
    });

    const response = await fetch(`${VOLUMES_API_URL}?${searchParams}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Google Books API error: ${response.status} ${response.statusText} - ${errorData.error?.message || ''}`);
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error('Error searching Google Books:', error);
    throw error;
  }
}

/**
 * Find the best author match for a book title
 * @param {string} title - The book title to search for
 * @param {string} apiKey - Google Books API key
 * @returns {Promise<string|null>} The best matching author name or null if not found
 */
export async function findAuthorForBook(title, apiKey) {
  try {
    const candidates = await findTopAuthorCandidatesForBook(title, apiKey, 1);
    return candidates.length > 0 ? candidates[0].name : null;
  } catch (error) {
    console.error(`Error finding author for "${title}":`, error);
    return null;
  }
}

/**
 * Find the top N author candidates for a given book title.
 * Returns objects with author name and metadata so the UI can present choices.
 *
 * @param {string} title - The book title to search for
 * @param {string} apiKey - Google Books API key
 * @param {number} [limit=3] - Max number of candidates to return
 * @returns {Promise<Array<{name: string, sourceTitle: string, similarity: number, coverUrl: string|null}>>}
 */
export async function findTopAuthorCandidatesForBook(title, apiKey, limit = 3) {
  const maxResults = Math.max(1, Math.min(limit, 10));

  try {
    const results = await searchBooksByTitle(title, apiKey, 10);

    if (!results || results.length === 0) {
      return [];
    }

    const normalizedSearchTitle = normalizeTitle(title);

    // Score results using similarity logic and filter to those with authors
    const scored = results
      .filter(r => r.volumeInfo?.authors && r.volumeInfo.authors.length > 0)
      .map(r => {
        const volumeInfo = r.volumeInfo;
        const normalizedResultTitle = normalizeTitle(volumeInfo.title || '');
        const similarity = calculateTitleSimilarity(normalizedSearchTitle, normalizedResultTitle);

        // Get cover URL from imageLinks
        let coverUrl = null;
        if (volumeInfo.imageLinks) {
          coverUrl = volumeInfo.imageLinks.thumbnail || volumeInfo.imageLinks.smallThumbnail || null;
          // Convert http to https for security
          if (coverUrl && coverUrl.startsWith('http:')) {
            coverUrl = coverUrl.replace('http:', 'https:');
          }
        }

        return {
          source: r,
          title: volumeInfo.title || '',
          authors: volumeInfo.authors,
          similarity,
          coverUrl
        };
      })
      .filter(entry => entry.similarity > 0.2); // keep loose but not random

    if (scored.length === 0) {
      return [];
    }

    // Sort best-first
    scored.sort((a, b) => b.similarity - a.similarity);

    // Build unique author candidates preserving order
    const seen = new Set();
    const candidates = [];

    for (const entry of scored) {
      for (const authorName of entry.authors) {
        const key = authorName.trim().toLowerCase();
        if (!key || seen.has(key)) continue;

        seen.add(key);
        candidates.push({
          name: authorName.trim(),
          sourceTitle: entry.title,
          similarity: entry.similarity,
          coverUrl: entry.coverUrl || null
        });

        if (candidates.length >= maxResults) {
          return candidates;
        }
      }
    }

    return candidates.slice(0, maxResults);
  } catch (error) {
    console.error(`Error finding author candidates for "${title}":`, error);
    return [];
  }
}

/**
 * Get book details including cover and description from Google Books
 * @param {string} title - The book title to search for
 * @param {string} author - The book's author (optional, improves matching)
 * @param {string} apiKey - Google Books API key
 * @returns {Promise<Object|null>} Book details or null if not found
 */
export async function getBookDetails(title, author, apiKey) {
  try {
    const results = await searchBooks(title, author, apiKey, 5);

    if (!results || results.length === 0) {
      return null;
    }

    // Find the best match
    const bestMatch = findBestTitleMatch(title, results);

    if (!bestMatch) {
      return null;
    }

    const volumeInfo = bestMatch.volumeInfo || {};
    
    // Get cover URL
    let coverUrl = null;
    if (volumeInfo.imageLinks) {
      coverUrl = volumeInfo.imageLinks.thumbnail || volumeInfo.imageLinks.smallThumbnail || null;
      // Convert http to https for security
      if (coverUrl && coverUrl.startsWith('http:')) {
        coverUrl = coverUrl.replace('http:', 'https:');
      }
    }

    // Get description and truncate if too long
    let description = volumeInfo.description || null;
    if (description && description.length > 500) {
      description = description.substring(0, 500) + '...';
    }

    // Extract ISBN-13 preferentially, fall back to ISBN-10
    const identifiers = volumeInfo.industryIdentifiers || [];
    const isbn13 = identifiers.find(i => i.type === 'ISBN_13');
    const isbn10 = identifiers.find(i => i.type === 'ISBN_10');
    const isbn = isbn13?.identifier || isbn10?.identifier || null;

    // Extract publication year from publishedDate (formats: "2005", "2005-03", "2005-03-15")
    const publishedDate = volumeInfo.publishedDate || null;
    const publicationYear = publishedDate ? parseInt(publishedDate.substring(0, 4), 10) || null : null;

    return {
      coverUrl,
      description,
      googleBooksId: bestMatch.id,
      previewLink: volumeInfo.previewLink || null,
      publishedDate,
      publisher: volumeInfo.publisher || null,
      pageCount: volumeInfo.pageCount || null,
      categories: volumeInfo.categories || [],
      averageRating: volumeInfo.averageRating || null,
      ratingsCount: volumeInfo.ratingsCount || null,
      isbn,
      publicationYear
    };
  } catch (error) {
    console.error('Error getting book details from Google Books:', error);
    throw error;
  }
}

/**
 * Find the best matching book result based on title similarity
 * @param {string} searchTitle - The original search title
 * @param {Array} results - Array of search results from Google Books
 * @returns {Object|null} The best matching result or null
 */
function findBestTitleMatch(searchTitle, results) {
  if (!results || results.length === 0) {
    return null;
  }

  const normalizedSearchTitle = normalizeTitle(searchTitle);
  
  // Score each result based on title similarity
  const scoredResults = results.map(result => {
    const volumeInfo = result.volumeInfo || {};
    const normalizedResultTitle = normalizeTitle(volumeInfo.title || '');
    const similarity = calculateTitleSimilarity(normalizedSearchTitle, normalizedResultTitle);
    
    return {
      ...result,
      similarity,
      hasAuthor: volumeInfo.authors && volumeInfo.authors.length > 0
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
 * Calculate similarity between two titles using a fuzzy strategy tuned for partial matches.
 * @param {string} title1
 * @param {string} title2
 * @returns {number} Similarity between 0 and 1
 */
function calculateTitleSimilarity(title1, title2) {
  if (!title1 || !title2) return 0;

  // Exact match
  if (title1 === title2) return 1;

  const words1 = title1.split(' ').filter(Boolean);
  const words2 = title2.split(' ').filter(Boolean);

  // Word overlap ratio
  const set2 = new Set(words2);
  let overlap = 0;
  for (const w of words1) {
    if (set2.has(w)) overlap++;
  }
  const wordScore = overlap / Math.max(words1.length, words2.length);

  // Substring coverage: shorter fully contained in longer -> strong signal
  const shorter = title1.length <= title2.length ? title1 : title2;
  const longer = title1.length > title2.length ? title1 : title2;
  const substringScore = longer.includes(shorter) ? shorter.length / longer.length : 0;

  // Character bigram Jaccard for extra fuzziness tolerance
  const bigrams = (s) => {
    const res = [];
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      if (bg.trim().length === 2) res.push(bg);
    }
    return res;
  };

  const b1 = bigrams(title1);
  const b2 = bigrams(title2);
  let charScore = 0;
  if (b1.length && b2.length) {
    const setB1 = new Set(b1);
    const setB2 = new Set(b2);
    let intersect = 0;
    for (const bg of setB1) {
      if (setB2.has(bg)) intersect++;
    }
    const union = setB1.size + setB2.size - intersect;
    charScore = union > 0 ? intersect / union : 0;
  }

  // Weighted combination; emphasize partial/substring coverage
  const combined =
    0.5 * substringScore +
    0.3 * wordScore +
    0.2 * charScore;

  return Math.max(0, Math.min(1, combined));
}

/**
 * Batch process multiple books to find missing authors
 * @param {Array} books - Array of book objects with title and author properties
 * @param {string} apiKey - Google Books API key
 * @param {Function} onProgress - Callback function called with progress updates
 * @returns {Promise<Array>} Array of results with original book and found author
 */
export async function batchFindMissingAuthors(books, apiKey, onProgress = null) {
  const results = [];

  // Treat missing authors AND placeholder "Unknown" (case-insensitive) as needing lookup
  const needsAuthor = (book) => {
    const author = (book.author || '').trim().toLowerCase();
    return !author || author === 'unknown';
  };

  const booksNeedingAuthors = books.filter(needsAuthor);

  if (booksNeedingAuthors.length === 0) {
    return [];
  }

  for (let i = 0; i < booksNeedingAuthors.length; i++) {
    const book = booksNeedingAuthors[i];

    try {
      // Small delay to be respectful to the API
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Use multi-candidate helper so UI can present choices
      const candidates = await findTopAuthorCandidatesForBook(book.title, apiKey, 3);
      const best = candidates[0] || null;
      const foundAuthor = best ? best.name : null;

      results.push({
        book,
        foundAuthor,
        candidates,
        success: !!foundAuthor
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingAuthors.length,
          book: book.title,
          foundAuthor,
          candidates,
          success: !!foundAuthor
        });
      }
    } catch (error) {
      console.error(`Error processing book "${book.title}":`, error);
      results.push({
        book,
        foundAuthor: null,
        candidates: [],
        success: false,
        error: error.message
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingAuthors.length,
          book: book.title,
          foundAuthor: null,
          candidates: [],
          success: false,
          error: error.message
        });
      }
    }
  }

  return results;
}

/**
 * Batch process multiple books to find missing descriptions
 * @param {Array} books - Array of book objects with title, author, and description properties
 * @param {string} apiKey - Google Books API key
 * @param {Function} onProgress - Callback function called with progress updates
 * @returns {Promise<Array>} Array of results with original book and found description
 */
export async function batchFindMissingDescriptions(books, apiKey, onProgress = null) {
  const results = [];

  // Filter books that need descriptions
  const needsDescription = (book) => {
    const description = (book.description || '').trim();
    return !description;
  };

  const booksNeedingDescriptions = books.filter(needsDescription);

  if (booksNeedingDescriptions.length === 0) {
    return [];
  }

  for (let i = 0; i < booksNeedingDescriptions.length; i++) {
    const book = booksNeedingDescriptions[i];

    try {
      // Small delay to be respectful to the API
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      const details = await getBookDetails(book.title, book.author || null, apiKey);
      const foundDescription = details?.description || null;

      results.push({
        book,
        foundDescription,
        coverUrl: details?.coverUrl || null,
        success: !!foundDescription
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingDescriptions.length,
          book: book.title,
          foundDescription,
          coverUrl: details?.coverUrl || null,
          success: !!foundDescription
        });
      }
    } catch (error) {
      console.error(`Error processing book "${book.title}":`, error);
      results.push({
        book,
        foundDescription: null,
        coverUrl: null,
        success: false,
        error: error.message
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingDescriptions.length,
          book: book.title,
          foundDescription: null,
          coverUrl: null,
          success: false,
          error: error.message
        });
      }
    }
  }

  return results;
}

/**
 * Find genre/category information for a book from Google Books
 * @param {string} title - The book title to search for
 * @param {string} author - The book's author (optional, improves matching)
 * @param {string} apiKey - Google Books API key
 * @returns {Promise<Array<string>|null>} Array of categories/genres or null if not found
 */
export async function findGenresForBook(title, author, apiKey) {
  try {
    const results = await searchBooks(title, author, apiKey, 5);

    if (!results || results.length === 0) {
      return null;
    }

    // Find the best match
    const bestMatch = findBestTitleMatch(title, results);

    if (!bestMatch || !bestMatch.volumeInfo?.categories || bestMatch.volumeInfo.categories.length === 0) {
      // Try to get categories from the first result if no best match
      const firstWithCategories = results.find(r => r.volumeInfo?.categories && r.volumeInfo.categories.length > 0);
      if (firstWithCategories) {
        return filterAndNormalizeGenres(firstWithCategories.volumeInfo.categories);
      }
      return null;
    }

    return filterAndNormalizeGenres(bestMatch.volumeInfo.categories);
  } catch (error) {
    console.error('Error finding genres for book:', error);
    return null;
  }
}

/**
 * Filter and normalize genre/category strings from Google Books
 * Google Books categories can be hierarchical (e.g., "Fiction / Fantasy / General")
 * @param {Array<string>} categories - Raw categories from Google Books
 * @returns {Array<string>} Filtered and normalized genres
 */
function filterAndNormalizeGenres(categories) {
  if (!categories || !Array.isArray(categories)) return [];

  // Common genre keywords to look for (case-insensitive)
  const genreKeywords = [
    'fiction', 'fantasy', 'science fiction', 'mystery', 'adventure',
    'romance', 'horror', 'thriller', 'historical', 'biography',
    'autobiography', 'non-fiction', 'nonfiction', 'poetry', 'drama',
    'comedy', 'humor', 'children', 'young adult', 'juvenile',
    'picture book', 'graphic novel', 'comic', 'fairy tale', 'folklore',
    'mythology', 'legend', 'animal', 'nature', 'science', 'history',
    'sports', 'school', 'family', 'friendship', 'magic', 'detective',
    'spy', 'war', 'action', 'suspense', 'paranormal', 'supernatural',
    'dystopian', 'utopian', 'realistic fiction', 'contemporary'
  ];

  const normalizedGenres = new Set();

  for (const category of categories) {
    // Google Books categories can be hierarchical like "Fiction / Fantasy / General"
    // Split by "/" and process each part
    const parts = category.split('/').map(p => p.trim().toLowerCase());
    
    for (const part of parts) {
      // Check if part matches or contains a genre keyword
      for (const keyword of genreKeywords) {
        if (part === keyword || part.includes(keyword)) {
          // Capitalize first letter of each word
          const normalized = keyword.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          normalizedGenres.add(normalized);
          break;
        }
      }
    }
  }

  // Return up to 5 genres
  return Array.from(normalizedGenres).slice(0, 5);
}

/**
 * Batch process multiple books to find missing genres
 * @param {Array} books - Array of book objects with title, author, and genreIds properties
 * @param {string} apiKey - Google Books API key
 * @param {Function} onProgress - Callback function called with progress updates
 * @returns {Promise<Array>} Array of results with original book and found genres
 */
export async function batchFindMissingGenres(books, apiKey, onProgress = null) {
  const results = [];

  // Filter books that need genres (empty or no genreIds)
  const needsGenres = (book) => {
    const genreIds = book.genreIds || [];
    return genreIds.length === 0;
  };

  const booksNeedingGenres = books.filter(needsGenres);

  if (booksNeedingGenres.length === 0) {
    return [];
  }

  for (let i = 0; i < booksNeedingGenres.length; i++) {
    const book = booksNeedingGenres[i];

    try {
      // Small delay to be respectful to the API
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      const foundGenres = await findGenresForBook(book.title, book.author || null, apiKey);

      results.push({
        book,
        foundGenres: foundGenres || [],
        success: foundGenres && foundGenres.length > 0
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingGenres.length,
          book: book.title,
          foundGenres: foundGenres || [],
          success: foundGenres && foundGenres.length > 0
        });
      }
    } catch (error) {
      console.error(`Error processing book "${book.title}":`, error);
      results.push({
        book,
        foundGenres: [],
        success: false,
        error: error.message
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingGenres.length,
          book: book.title,
          foundGenres: [],
          success: false,
          error: error.message
        });
      }
    }
  }

  return results;
}

/**
 * Get cover URL from book data
 * @param {Object} bookData - Book data from Google Books
 * @returns {string|null} Cover URL or null
 */
export function getCoverUrl(bookData) {
  if (!bookData) return null;

  // Try different cover sources in order of preference
  if (bookData.coverUrl) {
    return bookData.coverUrl;
  }

  if (bookData.volumeInfo?.imageLinks) {
    const imageLinks = bookData.volumeInfo.imageLinks;
    let url = imageLinks.thumbnail || imageLinks.smallThumbnail || null;
    // Convert http to https for security
    if (url && url.startsWith('http:')) {
      url = url.replace('http:', 'https:');
    }
    return url;
  }

  return null;
}
