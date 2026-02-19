# Tally Reading - Application Overview

## Purpose
This comprehensive application helps track reading sessions for students, manage reading preferences, and provide AI-powered book recommendations. It offers insights into reading frequency, identifies students who may need more attention, and personalizes the reading experience through intelligent book suggestions.

## Architecture (Current - v2.3.0)
- **Frontend**: React 19 single-page application with Material-UI v7 components
- **Backend/API**: Cloudflare Worker using Hono framework
- **Data Persistence**: 
  - **Cloudflare D1 Database** (`READING_MANAGER_DB`): Primary storage for books, organizations, users, classes, students, reading sessions, and settings
  - **Cloudflare KV Storage** (`READING_MANAGER_KV`): Legacy mode fallback for single-tenant deployments
- **Authentication**: JWT-based authentication with PBKDF2 password hashing (multi-tenant mode)
- **AI Integration**: Multi-provider support (Anthropic, OpenAI, Gemini) for intelligent book recommendations
- **Deployment**: Cloudflare Workers (Primary)

## Multi-Tenant SaaS Architecture (v2.0.0+)

### Organization Management
- **Multi-Organization Support**: Each organization (school) operates in complete isolation
- **Subscription Tiers**: Configurable limits for students and teachers per organization
- **School Management**: Owners can create, edit, and deactivate schools
- **Cross-Organization User Management**: Owners can move users between schools

### User Management & Authentication
- **Role-Based Access Control**: Hierarchical permissions system
  - **Owner**: Full system access, can manage all organizations and users
  - **Admin**: Organization-level management, can manage users within their organization
  - **Teacher**: Can manage students, classes, and reading sessions
  - **Readonly**: View-only access to data
- **JWT Authentication**: Secure token-based authentication using Web Crypto API
- **Token Refresh**: Automatic access token refresh with 60-second buffer
- **Password Security**: PBKDF2 hashing with 100,000 iterations and random salt

### Data Isolation
- **Tenant Middleware**: Automatic organization context injection
- **Scoped Queries**: All data queries are automatically scoped to the user's organization
- **Audit Logging**: Comprehensive activity tracking for compliance

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
  - Drag-and-drop student reordering
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
- **Smart Book Filtering** (v0.31.0): Optimized for large book collections (18,000+)
  - Database-level filtering by reading level (±2 levels from student's level)
  - Genre-based filtering using student's favorite genres
  - Excludes already-read books at SQL level for efficiency
  - Randomization for variety in recommendations
  - Automatic fallback to relaxed filters if strict criteria return too few results
  - Reduces memory usage from loading all books to ~100 pre-filtered relevant books
- **Intelligent Filtering**: Excludes already-read books and considers dislikes
- **Diverse Recommendations**: Balances student preferences with educational value

### Book and Genre Management
- **Book Database**: Maintain a comprehensive library of books with:
  - Title, author, and publication information
  - Genre classifications and reading levels
  - Age range recommendations
  - Book descriptions and cover images (via OpenLibrary/Google Books API)
- **Book Metadata Providers**: 
  - OpenLibrary API (default)
  - Google Books API (requires API key)
- **Genre System**: Flexible genre management for categorization
- **Book Autocomplete**: Smart book entry with existing database integration
- **Bulk Operations**: Fill missing authors, descriptions, and genres from external APIs

### User & Organization Management (v2.0.0+)
- **User Management**: Create, edit, and delete users within organizations
- **School Management**: Create and manage multiple schools/organizations (Owner-only)
- **Role Assignment**: Assign appropriate roles to users based on responsibilities
- **Cross-Organization Features**: Owners can view and manage users across all organizations

### Data Management and Analytics
- **Import/Export**: Enhanced JSON and CSV support with new data structures
- **Settings Configuration**: Customizable reading status thresholds
- **Analytics Tracking**: Monitor application usage and reading patterns
- **Global Class Filter**: Persistent class filter across all pages

## Data Storage

### Multi-Tenant Mode (D1 Database)
Primary storage using Cloudflare D1 SQL database with the following tables:
- `organizations` - Multi-tenant foundation with settings and subscription tiers
- `users` - User accounts with roles and authentication
- `refresh_tokens` - JWT refresh token storage
- `password_reset_tokens` - Password recovery tokens
- `classes` - Organization-scoped classes
- `students` - Organization-scoped students with preferences
- `student_preferences` - Student reading preferences (favorite genres)
- `reading_sessions` - Normalized session storage
- `books` - Book catalog with FTS5 full-text search
- `organization_book_selections` - Per-organization book customization
- `organization_settings` - Tenant-specific configuration
- `genres` - Organization-scoped genres
- `audit_log` - Activity tracking

### Legacy Mode (KV Storage)
For backward compatibility with single-tenant deployments:
- **Primary**: Cloudflare KV (`READING_MANAGER_KV`)
- **Format**: JSON data stored in KV keys (e.g., `students`, `books`, `classes`)

### Data Structures (Multi-Tenant)

```json
{
  "organization": {
    "id": "org_UUID",
    "name": "School Name",
    "slug": "school-slug",
    "subscriptionTier": "free|basic|premium",
    "maxStudents": 100,
    "maxTeachers": 10,
    "isActive": true
  },
  "user": {
    "id": "user_UUID",
    "email": "user@example.com",
    "name": "User Name",
    "role": "owner|admin|teacher|readonly",
    "organizationId": "org_UUID",
    "organizationName": "School Name"
  },
  "students": [
    {
      "id": "student_UUID",
      "name": "Student Name",
      "classId": "class_UUID | null",
      "readingLevel": "Level designation",
      "lastReadDate": "ISO8601 Date",
      "organizationId": "org_UUID",
      "createdBy": "user_UUID"
    }
  ],
  "classes": [
    {
      "id": "class_UUID",
      "name": "Year 1",
      "teacherName": "Teacher's Name",
      "organizationId": "org_UUID",
      "isActive": true
    }
  ],
  "books": [
    {
      "id": "book_UUID",
      "title": "Book Title",
      "author": "Author Name",
      "description": "Book description",
      "genreIds": ["genre_UUID_1", "genre_UUID_2"],
      "readingLevel": "Level designation",
      "ageRange": "Age range (e.g., 6-9)"
    }
  ],
  "readingSessions": [
    {
      "id": "session_UUID",
      "studentId": "student_UUID",
      "date": "ISO8601 Date",
      "bookId": "book_UUID",
      "bookTitle": "Book Title",
      "author": "Author Name",
      "assessment": "Reading level assessment",
      "notes": "Session notes",
      "location": "school | home"
    }
  ],
  "genres": [
    {
      "id": "genre_UUID",
      "name": "Genre Name",
      "description": "Genre description",
      "organizationId": "org_UUID",
      "isPredefined": true
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
7. **Settings** - Application configuration, AI settings, User Management, and School Management

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

#### Managing Users (Admin/Owner)
1. Navigate to Settings > User Management
2. View all users in the organization (or all organizations for owners)
3. Create new users with appropriate roles
4. Edit user details (name, role, school assignment)
5. Deactivate users as needed

#### Managing Schools (Owner Only)
1. Navigate to Settings > School Management
2. View all schools with subscription tier badges
3. Create new schools with configurable limits
4. Edit school details and subscription tiers
5. Deactivate schools (soft delete)

### Class Management
- **Class Creation**: Add classes with teacher assignments (Year 1-11 dropdown)
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
- **Book Details**: Store title, author, reading level, age range, description, and genres
- **AI Fill Features**: Automatically fetch missing authors, descriptions, and genres from external APIs

## API Integration

### Authentication API (Multi-Tenant Mode)
- `POST /api/auth/register` - Organization and owner registration
- `POST /api/auth/login` - Email/password authentication
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/logout` - Session termination
- `POST /api/auth/forgot-password` - Password reset initiation
- `POST /api/auth/reset-password` - Password reset completion

### User Management API
- `GET /api/users` - List users (scoped by role)
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user (including organization changes)
- `DELETE /api/users/:id` - Deactivate user

### Organization API
- `GET /api/organization` - Get current organization
- `GET /api/organization/all` - List all organizations (owner only)
- `POST /api/organization/create` - Create new organization
- `PUT /api/organization/:id` - Update organization
- `DELETE /api/organization/:id` - Deactivate organization

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
3. Apply D1 migrations: `npx wrangler d1 migrations apply reading-manager-db --local`
4. Start the development server: `npm run start:dev`
5. Access frontend at `http://localhost:3001`, worker at `http://localhost:8787`

### Cloudflare Workers Deployment
1. Configure `wrangler.toml` with KV namespace and D1 database
2. Apply D1 migrations: `npx wrangler d1 migrations apply reading-manager-db --remote`
3. Set up environment variables in Cloudflare dashboard (including `JWT_SECRET` for multi-tenant mode)
4. Deploy using `npm run deploy`
5. Access via your Cloudflare Workers domain

### Environment Variables
- `JWT_SECRET` - Required for multi-tenant mode authentication
- `ANTHROPIC_API_KEY` - Optional fallback for AI recommendations
- `READING_MANAGER_DB` - D1 database binding
- `READING_MANAGER_KV` - KV namespace binding (legacy mode)
