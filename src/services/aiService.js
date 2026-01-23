/**
 * AI Service
 * Handles interactions with various AI providers for book recommendations
 */

/**
 * Generate book recommendations using the configured AI provider
 * @param {Object} params - Parameters for recommendation generation
 * @param {Object} params.studentProfile - Student profile data
 * @param {Array} params.availableBooks - List of available books to recommend from
 * @param {Object} params.config - AI configuration (provider, apiKey, etc.)
 * @returns {Promise<Array>} - List of recommended books
 */
export async function generateRecommendations({ studentProfile, availableBooks, config }) {
  const { provider = 'anthropic', apiKey, baseUrl, model } = config;

  if (!apiKey) {
    throw new Error('API key is required for AI recommendations');
  }

  const prompt = buildPrompt(studentProfile, availableBooks);

  switch (provider) {
    case 'anthropic':
      return await callAnthropic(prompt, apiKey, model, baseUrl);
    case 'openai':
      return await callOpenAI(prompt, apiKey, model, baseUrl);
    case 'gemini':
    case 'google':
      return await callGemini(prompt, apiKey, model, baseUrl);
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }
}

/**
 * Build the prompt for the AI model
 */
function buildPrompt(studentProfile, availableBooks) {
  const booksReadText = studentProfile.booksRead.length > 0
    ? studentProfile.booksRead.map(book => `- ${book.title} by ${book.author} (${book.genre})`).join('\n')
    : 'No books recorded yet';

  const availableBooksText = availableBooks.length > 0
    ? availableBooks.map((book, index) => `${index + 1}. ${book.title} by ${book.author} (Genre: ${book.genre}, Age: ${book.ageRange}, Level: ${book.readingLevel})`).join('\n')
    : 'No books currently available in the library system';

  const sourceInstruction = availableBooks.length > 0
    ? 'From the available books list above'
    : 'Well-known, high-quality children\'s books';

  const avoidDuplicatesInstruction = availableBooks.length > 0
    ? ' Avoid books that are too similar to ones they\'ve already read.'
    : '';

  return `You are an expert children's librarian with decades of experience in book recommendations for young readers.

STUDENT PROFILE:
- Name: ${studentProfile.name}
- Reading Level: ${studentProfile.readingLevel}
- Favorite Genres: ${studentProfile.preferences.favoriteGenreIds?.join(', ') || 'Not specified'}
- Likes: ${studentProfile.preferences.likes?.join(', ') || 'Not specified'}
- Dislikes: ${studentProfile.preferences.dislikes?.join(', ') || 'Not specified'}

BOOKS ALREADY READ:
${booksReadText}

AVAILABLE BOOKS TO RECOMMEND FROM:
${availableBooksText}

TASK: Recommend exactly 4 books that would be perfect for this student. For each recommendation, provide:

1. **Title and Author**: ${sourceInstruction}
2. **Genre**: Main genre category
3. **Age Range**: Appropriate age range for the student's reading level
4. **Reason**: A personalized explanation (2-3 sentences) of why this book would be a great choice for this specific student based on their reading history, preferences, and interests.

Format your response as a valid JSON array with exactly 4 objects, each containing: title, author, genre, ageRange, and reason.

Ensure recommendations are age-appropriate and match the student's reading level and interests.${avoidDuplicatesInstruction}`;
}

/**
 * Call Anthropic API (Claude)
 * @param {string} prompt - The prompt to send
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {string} baseUrl - Base URL for the API
 * @param {boolean} raw - If true, return raw text instead of parsed response
 */
async function callAnthropic(prompt, apiKey, model = 'claude-haiku-4-5', baseUrl = 'https://api.anthropic.com/v1', raw = false) {
  // Use dynamic import for SDK to support Worker environment
  const { Anthropic } = await import('@anthropic-ai/sdk');

  const anthropic = new Anthropic({
    apiKey: apiKey,
    baseURL: baseUrl !== 'https://api.anthropic.com/v1' ? baseUrl : undefined
  });

  const response = await anthropic.messages.create({
    model: model,
    max_tokens: raw ? 1500 : 1000,
    temperature: 0.7,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const text = response.content[0].text;
  return raw ? text : parseResponse(text);
}

/**
 * Call OpenAI API (ChatGPT)
 * @param {string} prompt - The prompt to send
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {string} baseUrl - Base URL for the API
 * @param {boolean} raw - If true, return raw text instead of parsed response
 */
async function callOpenAI(prompt, apiKey, model = 'gpt-5-nano', baseUrl = 'https://api.openai.com/v1', raw = false) {
  const url = `${baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that outputs JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  // Return raw text if requested
  if (raw) {
    return content;
  }

  // OpenAI might wrap the array in an object if json_object mode is used
  // We need to handle both direct array and object wrapper
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return normalizeRecommendations(parsed);
    if (parsed.recommendations && Array.isArray(parsed.recommendations)) return normalizeRecommendations(parsed.recommendations);
    if (parsed.books && Array.isArray(parsed.books)) return normalizeRecommendations(parsed.books);

    // If we can't find an array, try to parse again with looser constraints
    return parseResponse(content);
  } catch (e) {
    return parseResponse(content);
  }
}

/**
 * Call Google Gemini API
 * @param {string} prompt - The prompt to send
 * @param {string} apiKey - API key
 * @param {string} model - Model name
 * @param {string} baseUrl - Base URL for the API
 * @param {boolean} raw - If true, return raw text instead of parsed response
 */
async function callGemini(prompt, apiKey, model = 'gemini-flash-latest', baseUrl = 'https://generativelanguage.googleapis.com/v1beta', raw = false) {
  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt + "\n\nIMPORTANT: Output ONLY valid JSON array."
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Gemini API error response:', JSON.stringify(errorData));
    throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();

  // Handle various Gemini response structures
  if (!data.candidates || !data.candidates[0]) {
    console.error('Gemini unexpected response structure:', JSON.stringify(data));
    throw new Error('Gemini API returned unexpected response structure');
  }

  const candidate = data.candidates[0];

  // Check for blocked content or safety issues
  if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'BLOCKED') {
    console.error('Gemini content blocked:', candidate.finishReason);
    throw new Error('Gemini blocked the response due to safety settings');
  }

  const content = candidate.content?.parts?.[0]?.text;
  if (!content) {
    console.error('Gemini no content in response:', JSON.stringify(candidate));
    throw new Error('Gemini API returned empty content');
  }

  return raw ? content : parseResponse(content);
}

/**
 * Parse and validate AI response
 */
function parseResponse(text) {
  try {
    // Extract JSON from the response (in case of extra text)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const jsonText = jsonMatch ? jsonMatch[0] : text;
    const recommendations = JSON.parse(jsonText);
    
    return normalizeRecommendations(recommendations);
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    console.error('Raw response:', text);
    throw new Error('Invalid response format from AI provider');
  }
}

/**
 * Normalize recommendations to ensure consistent structure
 */
function normalizeRecommendations(recommendations) {
  if (!Array.isArray(recommendations)) {
    throw new Error('Recommendations must be an array');
  }

  return recommendations.slice(0, 4).map(rec => ({
    title: rec.title || 'Unknown Title',
    author: rec.author || 'Unknown Author',
    genre: rec.genre || 'Fiction',
    ageRange: rec.ageRange || '8-12',
    reason: rec.reason || 'Recommended based on reading preferences'
  }));
}

/**
 * Build prompt for broader AI suggestions (not constrained to library)
 * @param {Object} studentProfile - Profile from buildStudentReadingProfile
 * @returns {string} The prompt for the AI
 */
export function buildBroadSuggestionsPrompt(studentProfile) {
  const { student, preferences, inferredGenres, recentReads } = studentProfile;

  const favoriteGenresText = preferences.favoriteGenreNames.length > 0
    ? preferences.favoriteGenreNames.join(', ')
    : 'Not specified';

  const inferredGenresText = inferredGenres.length > 0
    ? inferredGenres.map(g => `${g.name} (read ${g.count} books)`).join(', ')
    : 'No reading history yet';

  const likedBooksText = preferences.likes.length > 0
    ? preferences.likes.join(', ')
    : 'None specified';

  const dislikedBooksText = preferences.dislikes.length > 0
    ? preferences.dislikes.join(', ')
    : 'None specified';

  const recentReadsText = recentReads.length > 0
    ? recentReads.map(b => `${b.title}${b.author ? ` by ${b.author}` : ''}`).join(', ')
    : 'No recent books';

  return `You are an expert children's librarian recommending books for a young reader.

STUDENT PROFILE:
- Name: ${student.name}
- Reading Level: ${student.readingLevel}
- Age Range: ${student.ageRange || 'Not specified'}

EXPLICIT PREFERENCES (teacher/parent provided):
- Favorite Genres: ${favoriteGenresText}
- Books They Liked: ${likedBooksText}
- Books They Disliked: ${dislikedBooksText}

READING PATTERNS (from history):
- Most-Read Genres: ${inferredGenresText}
- Recent Books: ${recentReadsText}

TASK: Recommend exactly 5 books that would be perfect for ${student.name}. These should be well-known, quality children's books that:
1. Match their reading level and interests
2. Are different from books they've already read
3. Avoid anything similar to books they disliked

For EACH recommendation, provide:
1. **title**: The book title
2. **author**: The author's name
3. **ageRange**: Appropriate age range (e.g., "8-10", "10-12")
4. **readingLevel**: One of: beginner, elementary, intermediate, advanced
5. **reason**: 2-3 sentences explaining why this specific book is perfect for ${student.name}, referencing their preferences and reading history
6. **whereToFind**: Where to get the book (e.g., "Available at most public libraries", "Popular on Amazon and in bookstores")

Format your response as a valid JSON array with exactly 5 objects.
Example format:
[
  {
    "title": "Book Title",
    "author": "Author Name",
    "ageRange": "8-10",
    "readingLevel": "intermediate",
    "reason": "This book is perfect because...",
    "whereToFind": "Available at..."
  }
]`;
}

/**
 * Normalize broad suggestions to ensure consistent structure
 */
function normalizeBroadSuggestions(suggestions) {
  if (!Array.isArray(suggestions)) {
    throw new Error('Suggestions must be an array');
  }

  return suggestions.slice(0, 5).map(rec => ({
    title: rec.title || 'Unknown Title',
    author: rec.author || 'Unknown Author',
    ageRange: rec.ageRange || '8-12',
    readingLevel: rec.readingLevel || 'intermediate',
    reason: rec.reason || 'Recommended based on reading preferences',
    whereToFind: rec.whereToFind || 'Available at most public libraries and bookstores'
  }));
}

/**
 * Parse AI response for broad suggestions
 */
function parseBroadSuggestionsResponse(text) {
  try {
    // Extract JSON from the response (in case of extra text)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const jsonText = jsonMatch ? jsonMatch[0] : text;
    const suggestions = JSON.parse(jsonText);

    return normalizeBroadSuggestions(suggestions);
  } catch (error) {
    console.error('Failed to parse AI broad suggestions response:', error);
    console.error('Raw response:', text);
    throw new Error('Invalid response format from AI provider');
  }
}

/**
 * Generate broad AI suggestions (not constrained to library)
 * @param {Object} studentProfile - Profile from buildStudentReadingProfile
 * @param {Object} config - AI configuration (provider, apiKey, model, baseUrl)
 * @returns {Promise<Array>} - List of suggested books
 */
export async function generateBroadSuggestions(studentProfile, config) {
  const { provider = 'anthropic', apiKey, baseUrl, model } = config;

  if (!apiKey) {
    throw new Error('API key is required for AI suggestions');
  }

  const prompt = buildBroadSuggestionsPrompt(studentProfile);

  let response;
  switch (provider) {
    case 'anthropic':
      response = await callAnthropic(prompt, apiKey, model, baseUrl, true);
      break;
    case 'openai':
      response = await callOpenAI(prompt, apiKey, model, baseUrl, true);
      break;
    case 'gemini':
    case 'google':
      response = await callGemini(prompt, apiKey, model, baseUrl, true);
      break;
    default:
      throw new Error(`Unsupported AI provider: ${provider}`);
  }

  return parseBroadSuggestionsResponse(response);
}

