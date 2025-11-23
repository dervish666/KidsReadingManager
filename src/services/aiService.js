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
 */
async function callAnthropic(prompt, apiKey, model = 'claude-haiku-4-5', baseUrl = 'https://api.anthropic.com/v1') {
  // Use dynamic import for SDK to support Worker environment
  const { Anthropic } = await import('@anthropic-ai/sdk');
  
  const anthropic = new Anthropic({
    apiKey: apiKey,
    baseURL: baseUrl !== 'https://api.anthropic.com/v1' ? baseUrl : undefined
  });

  const response = await anthropic.messages.create({
    model: model,
    max_tokens: 1000,
    temperature: 0.7,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  return parseResponse(response.content[0].text);
}

/**
 * Call OpenAI API (ChatGPT)
 */
async function callOpenAI(prompt, apiKey, model = 'gpt-5-nano', baseUrl = 'https://api.openai.com/v1') {
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
 */
async function callGemini(prompt, apiKey, model = 'gemini-flash-latest', baseUrl = 'https://generativelanguage.googleapis.com/v1beta') {
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
    const errorData = await response.json();
    throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const content = data.candidates[0].content.parts[0].text;
  
  return parseResponse(content);
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