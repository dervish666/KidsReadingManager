# Book Recommendations Redesign

## Problem

The current recommendations feature tries to do one thing: send book titles to an AI and get recommendations back. This has issues:

1. **Broken in multi-tenant mode** - Student lookup was using legacy KV storage
2. **Expensive and slow** - Sending large book lists to AI costs tokens and time
3. **Wrong tool for library matching** - A database query is more appropriate for "what should they read from our library"
4. **Missing explicit preferences** - Ignores the likes/dislikes/favorite genres teachers have entered

## Solution

Split into two distinct features:

- **"Find in Library"** - Fast database search, no AI
- **"AI Suggestions"** - Broader discovery with reasoning

## Feature 1: Find in Library

### Purpose
Answer: "What should this student read next from books we already have?"

### Algorithm

1. **Get student profile**
   - Reading level
   - Age range
   - Explicit favorite genres (`preferences.favoriteGenreIds`)
   - Explicit likes/dislikes (`preferences.likes`, `preferences.dislikes`)

2. **Analyze reading history**
   - Query `reading_sessions` for this student
   - Count books per genre to find top 3 inferred favorite genres
   - Get list of already-read book IDs

3. **Query books table**
   - Filter: reading level within ±1 of student's level
   - Filter: age range matches (if student has one set)
   - Exclude: already-read books
   - Exclude: books in student's dislikes list
   - Score: prioritize books matching explicit + inferred favorite genres

4. **Return top 10 matches** with match reasons

### API Endpoint

```
GET /api/books/library-search?studentId=xxx

Response:
{
  "books": [
    {
      "id": "uuid",
      "title": "The Hobbit",
      "author": "J.R.R. Tolkien",
      "readingLevel": "intermediate",
      "genres": ["Fantasy", "Adventure"],
      "matchReason": "Matches your favorite genre: Fantasy"
    }
  ],
  "studentProfile": {
    "name": "Emma",
    "readingLevel": "intermediate",
    "favoriteGenres": ["Fantasy", "Adventure"],
    "inferredGenres": ["Mystery"],
    "booksRead": 12
  }
}
```

### Performance
Pure SQL query, no external calls. Target: <100ms response time.


## Feature 2: AI Suggestions

### Purpose
Answer: "What books would help this student grow?" - for discovery and acquisition.

### Student Profile Sent to AI

1. **Basic info**: Name, reading level, age range
2. **Explicit preferences** (from student modal):
   - Favorite genres
   - Books they liked (titles)
   - Books they disliked (titles)
3. **Inferred preferences**: Top 3 genres from reading history with counts
4. **Recent reads**: Last 5 book titles
5. **Books to avoid**: Already in library + disliked books

### AI Prompt Asks For

5 book recommendations, each with:
- Title and author
- Appropriate age range and reading level
- Why it suits this student (2-3 sentences)
- Where to find it (e.g., "Widely available at public libraries")

### Post-Processing

After receiving AI response:
- Check each suggested title against the books table
- Flag any matches with "In your library" indicator

### API Endpoint

```
GET /api/books/ai-suggestions?studentId=xxx

Response:
{
  "suggestions": [
    {
      "title": "Percy Jackson: The Lightning Thief",
      "author": "Rick Riordan",
      "ageRange": "9-12",
      "readingLevel": "intermediate",
      "reason": "Emma loves Fantasy and Adventure. This series combines Greek mythology with modern adventure, similar to the fantasy books she's enjoyed.",
      "whereToFind": "Available at most public libraries and bookstores",
      "inLibrary": false
    }
  ],
  "studentProfile": {
    "name": "Emma",
    "readingLevel": "intermediate",
    "favoriteGenres": ["Fantasy", "Adventure"],
    "recentReads": ["The Hobbit", "Narnia"]
  }
}
```

### Fallback Behavior

- **No API key**: Return error with message directing to Settings
- **API failure**: Return error suggesting "Find in Library" as alternative
- **Minimal student profile**: AI works with what's available, notes limited history


## UI Changes

### Button Area

Below student selector, two buttons side by side:

```
[Find in Library]  [AI Suggestions]
```

- Both disabled until student selected
- Independent loading states (spinner in button)
- "AI Suggestions" shows tooltip if no API key configured

### Student Profile Summary

Collapsible section above results:

```
Based on: Level 3 reader | Loves: Adventure, Fantasy | Recent: The Hobbit, Narnia
```

Helps teachers understand what drove the recommendations and catch outdated profiles.

### Results Area

**Library results show:**
- Title, author, reading level
- Genre tags
- Match reason (e.g., "Matches favorite genre: Adventure")

**AI results show:**
- Title, author, reading level, age range
- Reasoning paragraph
- Where to find
- "In your library" badge if applicable


## Backend Changes

### New Files/Functions

**`src/utils/studentProfile.js`** - Shared helper:
```javascript
async function buildStudentReadingProfile(studentId, organizationId, db) {
  // Returns: { student, preferences, inferredGenres, recentReads, readBookIds }
}
```

### New Endpoints

1. `GET /api/books/library-search` - in `src/routes/books.js`
2. `GET /api/books/ai-suggestions` - in `src/routes/books.js`

### Removed

- `GET /api/books/recommendations` - replaced by the two new endpoints


## Error Handling

| Scenario | Library Search | AI Suggestions |
|----------|---------------|----------------|
| No matches | "No matching books. Try AI Suggestions." | N/A |
| No reading history | Use explicit preferences only | Note in prompt |
| No reading level | Show all levels, prompt to set one | Include in prompt |
| No API key | N/A | Tooltip + error message |
| API failure | N/A | "Try again or use Find in Library" |
| Student not found | 404 error | 404 error |


## Migration

1. Deploy new endpoints
2. Update frontend to use new endpoints
3. Remove old `/api/books/recommendations` endpoint
4. Remove fallback recommendation lists from backend
