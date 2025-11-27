# Kids Reading Manager - Application Overview

## Purpose
This comprehensive application helps track reading sessions for students, manage reading preferences, and provide AI-powered book recommendations. It offers insights into reading frequency, identifies students who may need more attention, and personalizes the reading experience through intelligent book suggestions.

## Architecture (Current)
- **Frontend**: React single-page application with Material-UI components
- **Backend/API**: Cloudflare Worker using Hono framework
- **Data Persistence**: Cloudflare KV Storage (`READING_MANAGER_KV`)
- **AI Integration**: Multi-provider support (Anthropic, OpenAI, Gemini) for intelligent book recommendations
- **Deployment**: Cloudflare Workers (Primary)

## Key Features

### Core Reading Management
- **Student Management**: Add, edit, delete, and bulk import students with enhanced profiles
- **Reading Session Tracking**: Comprehensive session logging with:
  - Book information and author details
  - Reading assessments and progress notes
  - School vs. home reading environment tracking
  - Date and time tracking for detailed analytics
- **Reading Record (Home Reading Register)**: Quick class-wide home reading entry:
  - Register-style grid view for efficient data entry
  - Quick status buttons: ✓ (read), 2+ (multiple), A (absent), • (no record)
  - Book persistence per student (remembers current book)
  - Session totals and daily summaries
  - Date picker defaulting to yesterday
- **Class Management**: Organize students into classes with teacher assignments
- **Data Visualization**: Advanced charts and statistics for reading patterns

### Enhanced Student Profiles
- **Reading Preferences**: Capture detailed student preferences including:
  - Favorite genres and topics
  - Reading likes and dislikes (free-text input)
  - Preferred reading formats (picture books, chapter books, etc.)
  - Interest areas for targeted recommendations
- **Reading Level Tracking**: Monitor and update student reading levels
- **Progress Analytics**: Track reading frequency and identify improvement areas

### AI-Powered Recommendations
- **Multi-Provider Support**: Configure Anthropic (Claude), OpenAI (GPT), or Google (Gemini)
- **Personalized Book Suggestions**: AI-generated recommendations based on:
  - Student's reading history and completed books
  - Genre preferences and stated interests
  - Age-appropriate content selection
  - Reading level and developmental stage
  - School year and class information
- **Intelligent Filtering**: Excludes already-read books and considers dislikes
- **Diverse Recommendations**: Balances student preferences with educational value

### Book and Genre Management
- **Book Database**: Maintain a comprehensive library of books with:
  - Title, author, and publication information
  - Genre classifications and reading levels
  - Age range recommendations
- **Genre System**: Flexible genre management for categorization
- **Book Autocomplete**: Smart book entry with existing database integration

### Data Management and Analytics
- **Import/Export**: Enhanced JSON and CSV support with new data structures
- **Settings Configuration**: Customizable reading status thresholds
- **Analytics Tracking**: Monitor application usage and reading patterns
- **JSON Editor**: Direct data editing capabilities for advanced users

## Data Storage
- **Primary**: Cloudflare KV (`READING_MANAGER_KV`)
- **Format**: JSON data stored in KV keys (e.g., `students`, `books`, `classes`)

### Data Structures

The application now uses a comprehensive data model:

```json
{
  "settings": {
    "readingStatusSettings": {
      "recentlyReadDays": 7,
      "needsAttentionDays": 14
    }
  },
  "students": [
    {
      "id": "student_UUID",
      "name": "Student Name",
      "classId": "class_UUID | null",
      "readingLevel": "Level designation",
      "lastReadDate": "ISO8601 Date",
      "preferences": {
        "favoriteGenreIds": ["genre_UUID_1", "genre_UUID_2"],
        "likes": ["adventure stories", "animals", "magic"],
        "dislikes": ["scary stories", "sad endings"],
        "readingFormats": ["picture books", "chapter books"]
      },
      "readingSessions": [
        {
          "id": "session_UUID",
          "date": "ISO8601 Date",
          "bookId": "book_UUID",
          "bookTitle": "Book Title",
          "author": "Author Name",
          "assessment": "Reading level assessment",
          "notes": "Session notes",
          "environment": "school | home"
        }
      ],
      "createdAt": "ISO8601 Timestamp",
      "updatedAt": "ISO8601 Timestamp"
    }
  ],
  "classes": [
    {
      "id": "class_UUID",
      "name": "Class Name",
      "teacherName": "Teacher's Name",
      "disabled": false,
      "createdAt": "ISO8601 Timestamp",
      "updatedAt": "ISO8601 Timestamp"
    }
  ],
  "books": [
    {
      "id": "book_UUID",
      "title": "Book Title",
      "author": "Author Name",
      "genreIds": ["genre_UUID_1", "genre_UUID_2"],
      "readingLevel": "Level designation",
      "ageRange": "Age range (e.g., 6-9)"
    }
  ],
  "genres": [
    {
      "id": "genre_UUID",
      "name": "Genre Name",
      "description": "Genre description"
    }
  ]
}
```

## User Interface Overview

### Navigation Structure
The application uses a bottom navigation bar with seven main sections:
1. **Students** - Student management and profiles
2. **Reading** - Individual reading session entry and tracking
3. **Record** - Quick class-wide home reading register
4. **Stats** - Analytics and reading statistics
5. **Recommend** - AI-powered book recommendations
6. **Books** - Book database management and CRUD operations
7. **Settings** - Application configuration and AI settings

### Key User Workflows

#### Setting Up Reading Preferences
1. Navigate to the Students section
2. Select a student and click "Edit Preferences"
3. Configure:
   - Favorite genres from available options
   - Reading likes (free-text interests)
   - Reading dislikes (content to avoid)
   - Preferred reading formats

#### Getting Book Recommendations
1. Navigate to the Recommendations section
2. Select a class (optional) to filter students
3. Choose a specific student
4. Review the student's reading history and preferences
5. Click "Get Recommendations" for AI-powered suggestions
6. View personalized book recommendations with:
   - Book title and author
   - Genre classification
   - Age range suitability
   - Specific recommendation reasoning

#### Tracking Reading Sessions (Individual)
1. Navigate to the Reading section
2. Select student and reading environment (school/home)
3. Enter book information (with autocomplete support)
4. Add assessment level and notes
5. Save session for progress tracking

#### Recording Home Reading (Class Register)
1. Navigate to the Record section
2. Select the date (defaults to yesterday)
3. Choose the class from the dropdown
4. Click on a student row to select them
5. Optionally set/change their current book (persists automatically)
6. Click the appropriate status button:
   - ✓ for read once
   - 2+ for multiple sessions (enter count)
   - A for absent
   - • for no reading record received
7. System automatically advances to next student
8. View totals in the summary section at the bottom

### Class Management
- **Class Creation**: Add classes with teacher assignments
- **Student Assignment**: Assign students to classes for organization
- **Class-based Filtering**: Filter students and recommendations by class
- **Teacher Management**: Track which teacher manages each class

### Book and Genre Management
- **Book Database**: Maintain comprehensive library of available books with full CRUD operations
- **Book Management Interface**: Dedicated page for adding, editing, updating, and deleting books
- **Import/Export Books**: Support for JSON and CSV file formats for bulk operations
- **Data Migration**: Easy transfer of book data between systems
- **Genre System**: Categorize books for better recommendations
- **Autocomplete**: Smart book entry with existing database integration
- **Book Details**: Store title, author, reading level, and age range information

## API Integration

### AI Recommendations
The application integrates with multiple AI providers (Anthropic, OpenAI, Gemini) to provide intelligent book recommendations:
- Configurable via Settings UI (Provider, API Key, Model)
- Analyzes student reading history and preferences
- Considers age-appropriate content
- Balances educational value with student interests
- Provides reasoning for each recommendation

## Running the Application

### Local Development
1. Install dependencies: `npm install`
2. Set up environment variables (`.env` file)
3. Start the development server: `npm run start`
4. Access at `http://localhost:3000`

### Cloudflare Workers Deployment
1. Configure `wrangler.toml` with KV namespace
2. Set up environment variables in Cloudflare dashboard
3. Deploy using `wrangler deploy`
4. Access via your Cloudflare Workers domain