/**
 * OpenLibrary API Integration
 * Provides functions to search for books and retrieve author information
 * from the OpenLibrary.org API
 */

const OPENLIBRARY_BASE_URL = 'https://openlibrary.org';
const SEARCH_API_URL = `${OPENLIBRARY_BASE_URL}/search.json`;
const COVERS_BASE_URL = 'https://covers.openlibrary.org/b';

// Cache for OpenLibrary availability status
let openLibraryAvailable = null;
let lastAvailabilityCheck = 0;
const AVAILABILITY_CHECK_INTERVAL = 60000; // Re-check every 60 seconds

/**
 * Check if OpenLibrary is available with a quick timeout
 * @param {number} timeout - Timeout in milliseconds (default: 3000ms)
 * @returns {Promise<boolean>} True if OpenLibrary is reachable
 */
export async function checkOpenLibraryAvailability(timeout = 3000) {
  const now = Date.now();
  
  // Return cached result if recent
  if (openLibraryAvailable !== null && (now - lastAvailabilityCheck) < AVAILABILITY_CHECK_INTERVAL) {
    return openLibraryAvailable;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    // Use a simple HEAD request to check availability
    const response = await fetch(`${OPENLIBRARY_BASE_URL}/search.json?q=test&limit=1`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'KidsReadingManager/1.0 (educational-app)'
      }
    });
    
    clearTimeout(timeoutId);
    
    openLibraryAvailable = response.ok;
    lastAvailabilityCheck = now;
    
    console.log(`OpenLibrary availability check: ${openLibraryAvailable ? 'available' : 'unavailable'}`);
    return openLibraryAvailable;
  } catch (error) {
    console.log('OpenLibrary availability check failed:', error.message);
    openLibraryAvailable = false;
    lastAvailabilityCheck = now;
    return false;
  }
}

/**
 * Reset the availability cache (useful for retry scenarios)
 */
export function resetOpenLibraryAvailabilityCache() {
  openLibraryAvailable = null;
  lastAvailabilityCheck = 0;
}

/**
 * Get the current cached availability status without making a request
 * @returns {{available: boolean|null, lastCheck: number, stale: boolean}}
 */
export function getOpenLibraryStatus() {
  const now = Date.now();
  return {
    available: openLibraryAvailable,
    lastCheck: lastAvailabilityCheck,
    stale: (now - lastAvailabilityCheck) >= AVAILABILITY_CHECK_INTERVAL
  };
}

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
 * NOTE: This legacy helper is preserved for backwards compatibility.
 * New code should prefer findTopAuthorCandidatesForBook for multiple-choice support.
 * @param {string} title - The book title to search for
 * @returns {Promise<string|null>} The best matching author name or null if not found
 */
export async function findAuthorForBook(title) {
  try {
    const candidates = await findTopAuthorCandidatesForBook(title, 1);
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
 * @param {number} [limit=3] - Max number of candidates to return
 * @returns {Promise<Array<{name: string, sourceTitle: string, similarity: number}>>}
 */
export async function findTopAuthorCandidatesForBook(title, limit = 3) {
  const maxResults = Math.max(1, Math.min(limit, 10));

  try {
    const results = await searchBooksByTitle(title, 10);

    if (!results || results.length === 0) {
      return [];
    }

    const normalizedSearchTitle = normalizeTitle(title);

    // Score results using existing similarity logic and filter to those with authors
    const scored = results
      .filter(r => Array.isArray(r.author_name) && r.author_name.length > 0)
      .map(r => {
        const normalizedResultTitle = normalizeTitle(r.title || '');
        const similarity = calculateTitleSimilarity(normalizedSearchTitle, normalizedResultTitle);

        // Open Library covers: https://covers.openlibrary.org/b/ID/KEY-SIZE.jpg
        // Prefer edition/cover_i if present.
        let coverUrl = null;
        if (r.cover_i) {
          coverUrl = `https://covers.openlibrary.org/b/id/${r.cover_i}-M.jpg`;
        } else if (r.isbn && r.isbn.length > 0) {
          coverUrl = `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(r.isbn[0])}-M.jpg`;
        }

        return {
          source: r,
          title: r.title || '',
          authors: r.author_name,
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
 * Calculate similarity between two titles using a fuzzy strategy tuned for partial matches.
 *
 * Goals:
 * - "Percy Jackson" vs "Percy Jackson and the Olympians" should be high.
 * - Obvious mismatches should remain low.
 *
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
 * @param {Function} onProgress - Callback function called with progress updates
 * @returns {Promise<Array>} Array of results with original book and found author
 */
export async function batchFindMissingAuthors(books, onProgress = null) {
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
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Use multi-candidate helper so UI can present choices
      const candidates = await findTopAuthorCandidatesForBook(book.title, 3);
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
 * Get book details including cover ID and description from OpenLibrary
 * @param {string} title - The book title to search for
 * @param {string} author - The book's author (optional, improves matching)
 * @returns {Promise<Object|null>} Book details or null if not found
 */
export async function getBookDetails(title, author = null) {
  try {
    const searchParams = new URLSearchParams({
      title: title.trim(),
      limit: '5'
    });

    if (author) {
      searchParams.set('author', author.trim());
    }

    const response = await fetch(`${SEARCH_API_URL}?${searchParams}`, {
      headers: {
        'User-Agent': 'KidsReadingManager/1.0 (educational-app)'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenLibrary API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const docs = data.docs || [];

    if (docs.length === 0) {
      return null;
    }

    // Find the best match
    const bestMatch = findBestTitleMatch(title, docs);

    if (!bestMatch) {
      return null;
    }

    // Get the work key for description
    const workKey = bestMatch.key;
    let description = null;

    if (workKey && workKey.startsWith('/works/')) {
      try {
        const workResponse = await fetch(`${OPENLIBRARY_BASE_URL}${workKey}.json`, {
          headers: {
            'User-Agent': 'KidsReadingManager/1.0 (educational-app)'
          }
        });

        if (workResponse.ok) {
          const workData = await workResponse.json();
          description = workData.description;

          // Handle different description formats
          if (typeof description === 'object' && description.value) {
            description = description.value;
          }

          // Truncate long descriptions
          if (description && description.length > 500) {
            description = description.substring(0, 500) + '...';
          }
        }
      } catch (error) {
        console.warn('Error fetching work description:', error);
      }
    }

    return {
      coverId: bestMatch.cover_i,
      coverUrl: bestMatch.cover_i ? `${COVERS_BASE_URL}/id/${bestMatch.cover_i}-M.jpg` : null,
      description,
      olid: bestMatch.key,
      ia: bestMatch.ia ? bestMatch.ia[0] : null
    };
  } catch (error) {
    console.error('Error getting book details:', error);
    throw error;
  }
}

/**
 * Batch process multiple books to find missing descriptions
 * @param {Array} books - Array of book objects with title, author, and description properties
 * @param {Function} onProgress - Callback function called with progress updates
 * @returns {Promise<Array>} Array of results with original book and found description
 */
export async function batchFindMissingDescriptions(books, onProgress = null) {
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
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const details = await getBookDetails(book.title, book.author || null);
      const foundDescription = details?.description || null;

      results.push({
        book,
        foundDescription,
        success: !!foundDescription
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingDescriptions.length,
          book: book.title,
          foundDescription,
          success: !!foundDescription
        });
      }
    } catch (error) {
      console.error(`Error processing book "${book.title}":`, error);
      results.push({
        book,
        foundDescription: null,
        success: false,
        error: error.message
      });

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: booksNeedingDescriptions.length,
          book: book.title,
          foundDescription: null,
          success: false,
          error: error.message
        });
      }
    }
  }

  return results;
}

/**
 * Find genre/subject information for a book from OpenLibrary
 * @param {string} title - The book title to search for
 * @param {string} author - The book's author (optional, improves matching)
 * @returns {Promise<Array<string>|null>} Array of subjects/genres or null if not found
 */
export async function findGenresForBook(title, author = null) {
  try {
    const searchParams = new URLSearchParams({
      title: title.trim(),
      limit: '5',
      fields: 'key,title,author_name,subject'
    });

    if (author) {
      searchParams.set('author', author.trim());
    }

    const response = await fetch(`${SEARCH_API_URL}?${searchParams}`, {
      headers: {
        'User-Agent': 'KidsReadingManager/1.0 (educational-app)'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenLibrary API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const docs = data.docs || [];

    if (docs.length === 0) {
      return null;
    }

    // Find the best match
    const bestMatch = findBestTitleMatch(title, docs);

    if (!bestMatch || !bestMatch.subject || bestMatch.subject.length === 0) {
      // Try to get subjects from the first result if no best match
      const firstWithSubjects = docs.find(doc => doc.subject && doc.subject.length > 0);
      if (firstWithSubjects) {
        return filterAndNormalizeGenres(firstWithSubjects.subject);
      }
      return null;
    }

    return filterAndNormalizeGenres(bestMatch.subject);
  } catch (error) {
    console.error('Error finding genres for book:', error);
    return null;
  }
}

/**
 * Filter and normalize genre/subject strings from OpenLibrary
 * OpenLibrary subjects can be very specific, so we filter to common genres
 * @param {Array<string>} subjects - Raw subjects from OpenLibrary
 * @returns {Array<string>} Filtered and normalized genres
 */
function filterAndNormalizeGenres(subjects) {
  if (!subjects || !Array.isArray(subjects)) return [];

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

  for (const subject of subjects.slice(0, 50)) { // Limit to first 50 subjects
    const lowerSubject = subject.toLowerCase();
    
    // Check if subject matches or contains a genre keyword
    for (const keyword of genreKeywords) {
      if (lowerSubject === keyword || lowerSubject.includes(keyword)) {
        // Capitalize first letter of each word
        const normalized = keyword.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        normalizedGenres.add(normalized);
        break;
      }
    }
  }

  // Return up to 5 genres
  return Array.from(normalizedGenres).slice(0, 5);
}

/**
 * Batch process multiple books to find missing genres
 * @param {Array} books - Array of book objects with title, author, and genreIds properties
 * @param {Function} onProgress - Callback function called with progress updates
 * @returns {Promise<Array>} Array of results with original book and found genres
 */
export async function batchFindMissingGenres(books, onProgress = null) {
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
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const foundGenres = await findGenresForBook(book.title, book.author || null);

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
 * @param {Object} bookData - Book data from OpenLibrary
 * @returns {string|null} Cover URL or null
 */
export function getCoverUrl(bookData) {
  if (!bookData) return null;

  // Try different cover sources in order of preference
  if (bookData.coverUrl) {
    return bookData.coverUrl;
  }

  if (bookData.coverId) {
    return `${COVERS_BASE_URL}/id/${bookData.coverId}-M.jpg`;
  }

  if (bookData.ia) {
    return `${COVERS_BASE_URL}/ia/${bookData.ia}-M.jpg`;
  }

  if (bookData.olid) {
    const olid = bookData.olid.replace('/works/', '').replace('/books/', '');
    return `${COVERS_BASE_URL}/olid/${olid}-M.jpg`;
  }

  return null;
}