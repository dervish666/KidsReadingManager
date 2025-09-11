# Kids Reading Manager - Application Overview

## Purpose
This comprehensive application helps track reading sessions for students, manage reading preferences, and provide AI-powered book recommendations. It offers insights into reading frequency, identifies students who may need more attention, and personalizes the reading experience through intelligent book suggestions.

## Architecture (Current)
- **Frontend**: React single-page application with Material-UI components
- **Backend/API**: Node.js/Express server with enhanced endpoints
- **Data Persistence**: JSON file storage (`app_data.json`) with expanded data structures
- **AI Integration**: Anthropic Claude API for intelligent book recommendations
- **Deployment**: Supports both Docker containers and Cloudflare Workers deployment

## Key Features

### Core Reading Management
- **Student Management**: Add, edit, delete, and bulk import students with enhanced profiles
- **Reading Session Tracking**: Comprehensive session logging with:
  - Book information and author details
  - Reading assessments and progress notes
  - School vs. home reading environment tracking
  - Date and time tracking for detailed analytics
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
- **File**: `/config/app_data.json` (within the container, mapped to host's `./config/app_data.json`)
- **Format**: Enhanced JSON structure with expanded data models

### Enhanced Data Structures (`app_data.json`)

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
The application uses a bottom navigation bar with five main sections:
1. **Students** - Student management and profiles
2. **Reading** - Reading session entry and tracking
3. **Stats** - Analytics and reading statistics
4. **Recommendations** - AI-powered book recommendations
5. **Books** - Book database management and CRUD operations

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

#### Tracking Reading Sessions
1. Navigate to the Sessions section
2. Select student and reading environment (school/home)
3. Enter book information (with autocomplete support)
4. Add assessment level and notes
5. Save session for progress tracking

### Class Management
- **Class Creation**: Add classes with teacher assignments
- **Student Assignment**: Assign students to classes for organization
- **Class-based Filtering**: Filter students and recommendations by class
- **Teacher Management**: Track which teacher manages each class

### Book and Genre Management
- **Book Database**: Maintain comprehensive library of available books with full CRUD operations
- **Book Management Interface**: Dedicated page for adding, editing, updating, and deleting books
- **Genre System**: Categorize books for better recommendations
- **Autocomplete**: Smart book entry with existing database integration
- **Book Details**: Store title, author, reading level, and age range information

## API Integration

### AI Recommendations
The application integrates with Anthropic's Claude API to provide intelligent book recommendations:
- Analyzes student reading history and preferences
- Considers age-appropriate content
- Balances educational value with student interests
- Provides reasoning for each recommendation

### Environment Variables Required
- `ANTHROPIC_API_KEY`: Required for AI-powered recommendations

## Running the Application

### Local Development
1. Install dependencies: `npm install`
2. Set up environment variables (`.env` file)
3. Start the development server: `npm run start`
4. Access at `http://localhost:3000`

### Docker Deployment
1. Ensure Docker and Docker Compose are installed
2. Create a `./config` directory in the project root
3. Run `docker-compose up -d` from the project root
4. Access the application at `http://localhost:8080` (or as configured)

### Cloudflare Workers Deployment
1. Configure `wrangler.toml` with KV namespace
2. Set up environment variables in Cloudflare dashboard
3. Deploy using `wrangler deploy`
4. Access via your Cloudflare Workers domain