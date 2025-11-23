# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.20.1 - 2025-11-23

### Fixed
- **Book Recommendations UI**: Fixed dropdown styling issue where selectors appeared collapsed before interaction
  - Added `minWidth: 200` to class and student selectors to ensure they are visible even when empty
- **Student Dropdown**: Added book count to student dropdown options
  - Shows the number of unique books read by each student in the selection list
  - Helps identify students with reading history at a glance

## 1.20.0 - 2025-11-23

### Changed
- **Navigation Structure**: Restructured application navigation for better usability
  - **Dedicated Settings Page**: Moved Settings and Data Management to a new top-level "Settings" page
  - **Stats Page Cleanup**: Removed administrative tools (Settings, Data Management) from the Stats page to focus purely on analytics
  - **Navigation Bar**: Added a new "Settings" tab to the bottom navigation bar

### Removed
- **JSON Editor**: Removed the deprecated and non-functional JSON Editor component

## 1.19.6 - 2025-11-23

### Fixed
- **Book Recommendations UI**: Fixed dropdown styling issue where selectors appeared collapsed before interaction
  - Removed restrictive `minWidth: '100%'` styling that caused layout issues
  - Relied on `fullWidth` property for proper responsive sizing
- **Student List Display**: Enhanced student name display to include session count
  - Added session count in parentheses next to student names in both list and card views
  - Provides immediate visibility of reading progress without needing to check separate columns

## 1.19.5 - 2025-11-22

### Fixed
- **Book Update Reliability**: Fixed issue where updating book authors would fail or overwrite existing data
  - **Safe Merge Logic**: Implemented safe merge strategy in `PUT /api/books/:id` endpoints for both Express (local) and Hono (Worker) backends
  - **ID Generation**: Added automatic UUID generation for new books in local development environment to match production behavior
  - **Data Integrity**: Ensures partial updates (like just changing an author) do not accidentally clear other fields like title or genre
- **Frontend Stability**: Fixed `TypeError` when applying author updates by exposing `fetchWithAuth` and `reloadDataFromServer` in AppContext

## 1.16.0 - 2025-09-14

### Added
- **OpenLibrary API Integration for Recommendations**: Enhanced book recommendations with cover images and descriptions from OpenLibrary.org
  - **OpenLibrary Book Details API**: Added functions to fetch book covers and descriptions from OpenLibrary ([`src/utils/openLibraryApi.js`](src/utils/openLibraryApi.js:170))
  - **Covers Integration**: Automatically fetches and displays book cover images for recommended books ([`src/components/BookRecommendations.js`](src/components/BookRecommendations.js:330))
  - **Descriptions Integration**: Fetches and displays book descriptions from OpenLibrary work records ([`src/components/BookRecommendations.js`](src/components/BookRecommendations.js:347))
  - **Enhanced Recommendation Tiles**: Made tiles larger and more comprehensive with covers, descriptions, and additional metadata ([`src/components/BookRecommendations.js`](src/components/BookRecommendations.js:331))
  - **Cover URL Construction**: Supports multiple cover sources (cover ID, IA identifier, OLID) with fallback handling
  - **Responsive Design**: Two-column layout on larger screens, single column on mobile devices
  - **Increased Recommendation Count**: Updated API to provide 4 recommendations instead of 3 for better variety
  - **Rating Limiting**: Respectful API usage with 200ms delays between requests to avoid overwhelming the service

### Enhanced
- **Book Recommendations UI**: Significantly improved user experience with visual book covers and detailed descriptions
  - **Card Media Integration**: Added Material-UI CardMedia for proper cover image display ([`src/components/BookRecommendations.js`](src/components/BookRecommendations.js:335))
  - **Flexible Card Layout**: Cards now use full height with proper flex layout for descriptions ([`src/components/BookRecommendations.js`](src/components/BookRecommendations.js:333))
  - **Additional Metadata**: Displays age range, reading level, and genre information in chips ([`src/components/BookRecommendations.js`](src/components/BookRecommendations.js:342))
  - **Reason Display**: Shows personalized recommendation reasons below book descriptions ([`src/components/BookRecommendations.js`](src/components/BookRecommendations.js:349))

### Technical Implementation
- **OpenLibrary API Utility**: Extended existing OpenLibrary integration with cover and description fetching capabilities
- **Async Enhancement Process**: Non-blocking enhancement of basic recommendations with OpenLibrary data ([`src/components/BookRecommendations.js`](src/components/BookRecommendations.js:102))
- **Error Handling**: Graceful handling of missing covers or descriptions with fallback display ([`src/components/BookRecommendations.js`](src/components/BookRecommendations.js:336))
- **Performance Optimization**: Efficient API calls with proper error recovery and user feedback ([`src/components/BookRecommendations.js`](src/components/BookRecommendations.js:307))

## 1.15.2 - 2025-09-14

### Fixed
- **Book Recommendations Data Provider Issue**: Fixed critical issue where book recommendations weren't working in KV storage mode due to incorrect data access pattern
  - **Data Provider Consistency**: Updated recommendations endpoint to use proper data provider pattern instead of direct KV service calls ([`src/routes/books.js`](src/routes/books.js:210))
  - **Storage Pattern Alignment**: Books are stored in separate KV key `'books'` via kvProvider, but recommendations was incorrectly using kvService which looks in main `app_data` structure
  - **Production Fix**: Resolves "Retrieved books: 0 total books" error in Cloudflare Workers production environment
  - **Architecture Compliance**: Ensures all book operations follow the established `createProvider(env)` pattern for dual architecture support

### Technical Implementation
- **Provider Pattern Enforcement**: Changed from `getBooks(c.env)` to `provider.getAllBooks()` for consistent data access
- **KV Storage Optimization**: Leverages existing separate `'books'` KV key structure for efficient book retrieval
- **Dual Architecture Support**: Maintains compatibility between JSON file storage (local) and KV storage (production)

## 1.15.1 - 2025-09-14

### Fixed
- **KV Storage Reading Sessions Display**: Fixed issue where books read by students weren't displaying in KV storage mode due to missing `bookId` field normalization
  - **Data Normalization**: Added automatic `bookId` field normalization in `getStudents` function to ensure reading sessions have consistent structure ([`src/services/kvService.js`](src/services/kvService.js:79))
  - **KV Compatibility**: Reading sessions now properly display books read regardless of whether `bookId` field was omitted during JSON serialization
  - **Dual Architecture Support**: Maintains consistent behavior between JSON and KV storage modes for book recommendations and reading history display
  - **Backward Compatibility**: Ensures existing KV data with missing fields is automatically normalized without requiring data migration

### Technical Implementation
- **Field Normalization**: Added automatic field population for reading sessions missing `bookId` property
- **Storage Abstraction**: Enhanced KV service to handle data inconsistencies from JSON serialization quirks
- **Production Reliability**: Fixes book recommendations functionality in Cloudflare Workers production environment

## 1.15.0 - 2025-09-12

### Fixed
- **Book Recommendations Endpoint Implementation**: Implemented the previously placeholder `/api/books/recommendations` endpoint in Cloudflare Worker production environment
  - **AI-Powered Recommendations**: Integrated Anthropic Claude API with comprehensive prompt engineering for children's librarian recommendations ([`src/routes/books.js`](src/routes/books.js:176))
  - **Student Profile Analysis**: Leverages student reading history, preferences, favorite genres, likes/dislikes for personalized recommendations
  - **Cloudflare Worker Compatibility**: Uses dynamic ESM imports and environment variable handling compatible with Workers runtime
  - **Robust Error Handling**: Includes fallback recommendations when AI service is unavailable or API key is missing
  - **Data Provider Integration**: Uses existing provider pattern for seamless JSON/KV storage abstraction ([`src/data/index.js`](src/data/index.js:18))
  - **Production Deployment**: Successfully deployed to Cloudflare Workers with proper environment variable configuration
  - **Dual Architecture Sync**: Maintains synchronization between Express server and Hono Worker routes as per project standards

### Technical Implementation
- **ESM Compatibility**: Implemented dynamic `import()` for Anthropic SDK to work in Cloudflare Workers environment
- **Environment Detection**: Proper handling of `ANTHROPIC_API_KEY` from Cloudflare secrets vs local environment variables
- **Fallback Strategy**: Graceful degradation to static recommendations when AI service is unavailable
- **Prompt Engineering**: Advanced Claude prompts that analyze student profiles and generate age-appropriate recommendations
- **Error Recovery**: Comprehensive error handling with multiple fallback levels for production reliability

## 1.14.3 - 2025-09-12

### Fixed
- **Stats Page Class Filtering**: Fixed issue where statistics included students from disabled classes
  - Modified ReadingStats component to filter out students from disabled classes in all calculations ([`src/components/stats/ReadingStats.js`](src/components/stats/ReadingStats.js:37,49,116,123,258))
  - Updated `calculateStats`, `getStudentsBySessionCount`, and `getNeedsAttentionStudents` functions to use active students only
  - Students not assigned to any class are still included in statistics

## 1.14.2 - 2025-09-11

### Fixed
- **Cloudflare KV Rate Limiting**: Resolved bulk import failures in Cloudflare Workers environment
  - **Batch Operations**: Implemented efficient batch operations for KV storage to avoid 1000-operation-per-request limit ([`src/data/kvProvider.js`](src/data/kvProvider.js:160))
  - **Bulk Import Endpoint**: Added `/api/books/bulk` endpoint for efficient mass book imports ([`src/routes/books.js`](src/routes/books.js:105))
  - **KV Optimization**: Reduced KV operations from 2-per-book to 2-total for entire import batch
  - **Synchronized Routes**: Added corresponding bulk endpoint to Express server for dual architecture support ([`server/index.js`](server/index.js:555))
  - **Enhanced Import Logic**: Updated BookManager to use bulk endpoint instead of individual book imports ([`src/components/books/BookManager.js`](src/components/books/BookManager.js:355))

### Technical Implementation
- **KV Efficiency**: Batch operations reduce KV calls from O(n) to O(1) for bulk operations
- **Rate Limit Compliance**: Ensures compliance with Cloudflare's 1000 KV operations per request limit
- **Dual Provider Support**: Both JSON and KV providers now support batch operations for consistency
- **Error Handling**: Enhanced error handling for bulk operations with detailed feedback

## 1.14.1 - 2025-09-11

### Added
- **Duplicate Detection for Book Import**: Enhanced import functionality to prevent duplicate books
  - **Smart Duplicate Detection**: Automatically identifies duplicate books based on normalized title and author matching ([`src/components/books/BookManager.js`](src/components/books/BookManager.js:503))
  - **Import Preview**: Enhanced confirmation dialog shows count of new books vs duplicates before importing
  - **Duplicate List Display**: Shows up to 10 duplicate books that will be skipped, with overflow indicator
  - **Detailed Import Feedback**: Post-import messages include counts for imported, skipped duplicates, and failed books
  - **Title Normalization**: Removes punctuation and normalizes whitespace for accurate duplicate detection
  - **Author Matching**: Considers both title and author when available for precise duplicate identification

### Enhanced
- **Book Import Dialog**: Significantly improved user experience with duplicate information
  - **Pre-Import Analysis**: Shows breakdown of new books vs duplicates before confirming import
  - **Visual Feedback**: Color-coded messages (green for new books, orange for duplicates)
  - **Scrollable Duplicate List**: Displays duplicate books in a scrollable container for easy review
  - **Smart Import Logic**: Automatically skips duplicates while importing only new books

## 1.14.0 - 2025-09-11

### Added
- **OpenLibrary API Integration**: Automatic author lookup functionality for books with missing authors
  - **OpenLibrary Search API**: Integration with OpenLibrary.org API for book and author data ([`src/utils/openLibraryApi.js`](src/utils/openLibraryApi.js))
  - **"Fill Missing Authors" Button**: One-click solution to find and fill missing author information ([`src/components/books/BookManager.js`](src/components/books/BookManager.js:594))
  - **Batch Processing**: Efficiently processes multiple books with missing authors in sequence
  - **Smart Title Matching**: Advanced algorithm to match book titles with OpenLibrary database using similarity scoring
  - **Progress Tracking**: Real-time progress indicator showing current book being processed
  - **Results Preview**: Dialog showing found authors before applying updates, allowing user review
  - **API Rate Limiting**: Respectful 500ms delay between API calls to avoid overwhelming the service
  - **Error Handling**: Comprehensive error handling with user-friendly feedback for API failures

- **Books List Pagination**: Enhanced book management for large collections
  - **Configurable Page Size**: Choose between 5, 10, 20, or 50 books per page ([`src/components/books/BookManager.js`](src/components/books/BookManager.js:675))
  - **Navigation Controls**: First, previous, next, and last page buttons with Material-UI Pagination component
  - **Item Count Display**: Shows current range (e.g., "Showing 1-10 of 45") for better user orientation
  - **Responsive Design**: Pagination controls adapt to different screen sizes
  - **State Persistence**: Maintains current page when adding, editing, or deleting books

### Enhanced
- **BookManager Component**: Significantly expanded functionality and user experience
  - **OpenLibrary Integration**: Added author lookup capabilities with progress tracking and results management
  - **Pagination System**: Complete pagination implementation for handling large book collections
  - **Improved UI Layout**: Better organization of controls with pagination and items-per-page selector
  - **Enhanced User Feedback**: Progress indicators, confirmation dialogs, and detailed status messages
  - **Performance Optimization**: Only renders visible books, improving performance with large datasets

### Technical Implementation
- **OpenLibrary API Utility**: Comprehensive API integration with search, matching, and batch processing capabilities
- **Title Similarity Algorithm**: Custom algorithm for matching book titles with fuzzy matching and word-based scoring
- **Pagination Logic**: Efficient client-side pagination with configurable page sizes and navigation
- **State Management**: Enhanced React state management for pagination, progress tracking, and results handling
- **Error Boundaries**: Robust error handling for API failures and network issues

## 1.13.0 - 2025-09-11

### Added
- **Book Import/Export Functionality**: Comprehensive data migration capabilities for book collections
  - **JSON Export**: Download entire book library as structured JSON file ([`src/components/books/BookManager.js`](src/components/books/BookManager.js:146))
  - **CSV Export**: Export books in CSV format with proper header validation ([`src/components/books/BookManager.js`](src/components/books/BookManager.js:173))
  - **JSON Import**: Import books from JSON files (both array format and object format with `books` property)
  - **CSV Import**: Parse and import CSV files with intelligent header detection ([`src/components/books/BookManager.js`](src/components/books/BookManager.js:251))
  - **File Validation**: Only accepts .json and .csv file formats with error handling for malformed files
  - **Duplicate Prevention**: Integrates with existing book creation logic to prevent duplicates
  - **Progress Tracking**: Real-time feedback showing import success and error counts
  - **Confirmation Dialogs**: User confirmation before importing to prevent accidental data replacement
  - **Smart CSV Parsing**: Handles quoted fields, escaped quotes, and special characters properly

### Enhanced
- **BookManager Component**: Expanded functionality with comprehensive import/export UI
  - Added dedicated Import/Export section with Material-UI buttons and icons
  - Integrated file picker with drag-and-drop support for uploads
  - Enhanced error handling and user feedback with snackbar notifications
  - Responsive button layout that works on all device sizes
  - Disabled export buttons when no books exist to prevent empty downloads

### Technical Implementation
- **Browser Download API**: Uses modern browser APIs for file generation and download
- **FileReader API**: Secure client-side file parsing for import operations
- **Robust CSV Parser**: Custom implementation with quote handling and escape character support
- **Error Recovery**: Graceful handling of malformed files with user-friendly error messages
- **Data Integrity**: Maintains existing book validation and duplicate checking during import

### Documentation
- Updated application overview to include import/export capabilities
- Enhanced book management documentation with data migration features

### Version
- Bumped package version to 1.13.0

## 1.11.0 - 2025-09-07

### Added
- **New Persistence Layer Architecture**: Implemented flexible data persistence layer supporting both JSON file storage and Cloudflare KV storage
  - Created modular data provider infrastructure in `src/data/` directory with abstraction layer for different storage backends
  - Implemented `jsonProvider.js` for local development using JSON file storage with CRUD operations for books ([`src/data/jsonProvider.js`](src/data/jsonProvider.js:40))
  - Implemented `kvProvider.js` for production Cloudflare Workers environment using KV namespace storage ([`src/data/kvProvider.js`](src/data/kvProvider.js:24))
  - Created dynamic provider selection system in `data/index.js` based on `STORAGE_TYPE` environment variable ([`src/data/index.js`](src/data/index.js:18))
  - Supports environment-based provider switching: `STORAGE_TYPE=json` for local development, `STORAGE_TYPE=kv` for production
  - Updated books API routes to use new data provider abstraction layer ([`src/routes/books.js`](src/routes/books.js:16))

### Enhanced
- **Environment Configuration**: Enhanced environment variable management for seamless development/production switching
  - Updated `wrangler.toml` with `STORAGE_TYPE = "kv"` for production deployments and `STORAGE_TYPE = "json"` for development environment
  - Configured `.env` file with `STORAGE_TYPE=json` for local Node.js development environment
  - Backward compatible with existing data files and patterns

### Architecture
- **Provider Pattern Implementation**: Introduced clean abstraction layer with unified interface across storage backends
- **Environment-Driven Configuration**: Eliminated hardcoded storage mechanisms in favor of environment-based configuration
- **Unified API Interface**: All storage providers implement same CRUD functions (`getAllBooks`, `getBookById`, `addBook`, `updateBook`, `deleteBook`)

### Version
- Bumped package version to 1.11.0

## 1.10.0 - 2025-09-07

### Added
- **Book Recommendations Frontend**: Implemented comprehensive user interface for AI-powered book recommendations
  - Created BookRecommendations component with intuitive student selection workflow ([`src/components/BookRecommendations.js`](src/components/BookRecommendations.js:1))
  - Added new "Recommendations" tab to bottom navigation with Star icon ([`src/App.js`](src/App.js:14,89,95))
  - Integrated with existing `/api/books/recommendations?studentId=` endpoint for fetching AI-powered recommendations ([`src/components/BookRecommendations.js`](src/components/BookRecommendations.js:106))
  - Features include:
    - Class filtering to narrow down student selection
    - Real-time display of student's reading history and book list
    - Session statistics and last read date information
    - One-click recommendation fetching with loading states
    - Responsive card-based display of recommended books with metadata (title, author, genre, reading level)
  - Integrated seamlessly with existing Material-UI design system and app architecture
  - Added error handling and user feedback for API failures
  - Supports both optional class filtering and direct student selection

### Added
- **Class Filtering in Reading Session Form**: Enhanced student selection workflow for better usability when managing large numbers of students
  - Added optional class filtering dropdown above the student selector in SessionForm ([`src/components/sessions/SessionForm.js`](src/components/sessions/SessionForm.js:172))
  - Includes teacher names in class dropdown options for easy identification
  - Automatically clears student selection when changing class filter
  - Displays "All Classes" option to show students from all classes
  - Shows appropriate empty states when no students match the selected class
  - Preserves recently accessed students behavior within filtered results
  - Maintains existing sorting functionality (recent students at top)
  - Only shows active (non-disabled) classes in the filter dropdown

### Enhanced
- **Navigation System**: Expanded app navigation to support new recommendations functionality
  - Updated BottomNavigation to accommodate 4 tabs with proper responsive design
  - Maintained consistent user experience across all navigation states

### Version
- Bumped package version to 1.10.0

## 1.9.0 - 2025-09-07

### Added
- **AI-Powered Book Recommendations**: Implemented intelligent book recommendation system using Anthropic Claude AI
  - Added `@anthropic-ai/sdk` and `dotenv` packages to package.json dependencies ([`package.json`](package.json:19,27))
  - Created `.env` file with secure storage of `ANTHROPIC_API_KEY` environment variable ([`.env`](.env:1))
  - Enhanced `/api/books/recommendations` endpoint with AI-driven recommendation logic using Claude Sonnet 4 ([`server/index.js`](server/index.js:21,549))
  - Implemented comprehensive prompt engineering for Claude AI to act as a children's librarian expert
  - Added intelligent student profile analysis including school year, reading preferences, favorite genres, likes, and dislikes
  - Integrated with existing data model: books, genres, students, and classes
  - Built robust error handling with fallback to basic recommendation algorithms if AI service is unavailable
  - Returns personalized recommendations with reasons for each book suggestion
  - Includes comprehensive metadata in API responses (student name, school year, preferred genres)

### Enhanced
- **Server Security and Architecture**: Improved backend security by implementing environment variable management
  - Added `dotenv` configuration loading at server startup ([`server/index.js`](server/index.js:2))
  - Secure API key management through environment variables instead of hardcoded values
  - Enhanced error handling and fallback mechanisms for production reliability

### Tech Stack
- **AI Integration**: Added Anthropic Claude 4 AI model integration for intelligent content generation
- **Environment Management**: Implemented proper environment variable handling for production deployments
- **API Enhancement**: Significant improvement to existing book recommendations endpoint with AI capabilities

### Version
- Bumped package version to 1.9.0

## 1.8.1 - 2025-09-07

### Changed
- **Assessment Labels Update**: Replaced negative assessment terminology with supportive language across charts and tooltips
  - Changed "Struggling" to "Needing Help" ([`src/components/sessions/AssessmentSelector.js`](src/components/sessions/AssessmentSelector.js:66), [`src/components/sessions/AssessmentSelector.js`](src/components/sessions/AssessmentSelector.js:71))
  - Changed "Needs Help" to "Moderate Help"
  - "Independent" label remains unchanged for positive reinforcement
  - Updated ReadingTimelineChart tooltips to use formatAssessmentDisplay function ([`src/components/stats/ReadingTimelineChart.js`](src/components/stats/ReadingTimelineChart.js:254))
  - Updated ReadingTimelineChart legend to use new labeling system ([`src/components/stats/ReadingTimelineChart.js`](src/components/stats/ReadingTimelineChart.js:286))
  - Added formatAssessmentDisplay utility function to helpers for consistent assessment display across components ([`src/utils/helpers.js`](src/utils/helpers.js:100))

### Enhanced
- **Consistent UI/UX**: All assessment displays now use supportive language to create a more positive educational environment
- Improved code maintainability by centralizing assessment label formatting in utility function

### Version
- Bumped package version to 1.8.1

## 1.8.0 - 2025-09-07

### Added
- **Reading Preferences Profile Frontend**: Implemented comprehensive reading preferences management system for students
  - Created ReadingPreferences dialog component with intuitive interface for managing student preferences ([`src/components/students/ReadingPreferences.js`](src/components/students/ReadingPreferences.js:1))
  - Added Psychology icon button to StudentCard header for quick access to preferences ([`src/components/students/StudentCard.js`](src/components/students/StudentCard.js:103))
  - Integrated ReadingPreferences dialog into StudentCard component with full Material-UI design consistency ([`src/components/students/StudentCard.js`](src/components/students/StudentCard.js:249))
  - Enhanced AppContext with genres state management and CRUD operations ([`src/contexts/AppContext.js`](src/contexts/AppContext.js:32,95,877))
  - Added fetchGenres function for retrieving available genres from API ([`src/contexts/AppContext.js`](src/contexts/AppContext.js:553))
  - Added addGenre function for creating new genres on-the-fly ([`src/contexts/AppContext.js`](src/contexts/AppContext.js:502))
  - Integrated genres data fetching into reloadDataFromServer for automatic loading at app start ([`src/contexts/AppContext.js`](src/contexts/AppContext.js:95))
  - Support for favorite genres with multi-select dropdown interface
  - Interactive likes and dislikes sections with chip-based input system
  - Real-time form validation and user feedback with snackbar notifications
  - Data persistence through existing student PUT endpoint with preferences field support

### Added
- **Backend Genres Integration**: Leveraged existing genres API endpoints for comprehensive genre management
  - Utilizes `/api/genres` GET endpoint for retrieving available genres ([`server/index.js`](server/index.js:470))
  - Leverages `/api/genres` POST endpoint for creating new genres during preference setup ([`server/index.js`](server/index.js:481))
  - Student preferences are automatically saved through existing `/api/students/:id` PUT endpoint ([`server/index.js`](server/index.js:134))
  - Full integration with existing data model that includes `preferences.favoriteGenreIds`, `preferences.likes`, and `preferences.dislikes` fields ([`cline_docs/new_data_model.md`](cline_docs/new_data_model.md:73))

### Changed
- Enhanced StudentCard component to include reading preferences access point
- Improved app context with comprehensive state management for genres and preferences
- Streamlined user workflow by providing direct access to reading preferences from student cards

### Enhanced
- **Reading Session Display**: Added comprehensive book and location information to session tiles
  - Session tiles now display book title and author when a book was specified ([`src/components/sessions/SessionForm.js`](src/components/sessions/SessionForm.js:295))
  - Enhanced StudentSessions dialog with book information display ([`src/components/sessions/StudentSessions.js`](src/components/sessions/StudentSessions.js:251))
  - Added location display (School/Home) in session tiles for better context ([`src/components/sessions/StudentSessions.js`](src/components/sessions/StudentSessions.js:270))
  - Improved session edit dialog with full book selection and location editing support ([`src/components/sessions/StudentSessions.js`](src/components/sessions/StudentSessions.js:315))
  - Enhanced notes formatting with dedicated highlighted notes section ([`src/components/sessions/StudentSessions.js`](src/components/sessions/StudentSessions.js:290))
  - Added "📍" emoji indicators for location display for better visual distinction

### Version
- Bumped package version to 1.8.0

## 1.7.0 - 2025-09-07

### Added
- **School and Home Reading Tracking Frontend**: Implemented user interface for tracking where and what reading sessions occur
- **Enhanced Book Selection with Autocomplete**: Replaced basic dropdown with intelligent autocomplete system
  - Created BookAutocomplete component with search and auto-creation capabilities ([`src/components/sessions/BookAutocomplete.js`](src/components/sessions/BookAutocomplete.js:1))
  - Added book creation functionality to AppContext with findOrCreateBook function ([`src/contexts/AppContext.js`](src/contexts/AppContext.js:504))
  - Users can type book titles and authors (using "@" separator) and press Enter to create new books automatically
  - Smart search filters existing books based on user input
  - Proper error handling and optimistic updates for book creation
  - Added location selection with radio buttons for "School" and "Home" options with default to "School" ([`src/components/sessions/SessionForm.js`](src/components/sessions/SessionForm.js:224))
  - Updated AppContext to include books state management and support for bookId and location in sessions ([`src/contexts/AppContext.js`](src/contexts/AppContext.js:30,770))
  - Enhanced addReadingSession function to handle bookId and location fields ([`src/contexts/AppContext.js`](src/contexts/AppContext.js:196))
  - Added form state management for book and location selections ([`src/components/sessions/SessionForm.js`](src/components/sessions/SessionForm.js:36))

### Changed
- Enhanced reading session form to capture comprehensive reading activity data
- Improved user workflow by integrating book and location tracking directly into reading session logging

### Version
- Bumped package version to 1.7.0

## 1.6.0 - 2025-09-07

### Added
- **Backend Data Model Updates**: Implemented enhanced data model to support school/home reading tracking, student preference profiles, and book recommendation system
  - Added `books` and `genres` top-level arrays to application data structure ([`server/index.js`](server/index.js:44))
  - Extended `students` with `preferences` object containing favorite genres, likes, and dislikes
  - Extended `readingSessions` with `bookId` and `location` fields for tracking reading sessions
  - Extended `classes` with `schoolYear` field
  - Updated `readData` function to initialize new data structures for backward compatibility ([`server/index.js`](server/index.js:70))
- **API Endpoints**: Created new REST API endpoints for books and genres management:
  - `GET /api/books` - Retrieve all books ([`server/index.js`](server/index.js:383))
  - `POST /api/books` - Create new book ([`server/index.js`](server/index.js:389))
  - `PUT /api/books/:id` - Update book by ID ([`server/index.js`](server/index.js:402))
  - `DELETE /api/books/:id` - Delete book by ID ([`server/index.js`](server/index.js:415))
  - Similar endpoints for genres: `GET /api/genres`, `POST /api/genres`, `PUT /api/genres/:id`, `DELETE /api/genres/:id` ([`server/index.js`](server/index.js:428))
- **Book Recommendations**: Added `GET /api/books/recommendations?studentId=` endpoint to recommend books based on student preferences and unread books ([`server/index.js`](server/index.js:475))

### Changed
- Updated data initialization to include new `books` and `genres` arrays ([`server/index.js`](server/index.js:44))
- Enhanced data reading and writing functions for new data structure compatibility
- Existing API endpoints now support new fields in request bodies

### Version
- Bumped package version to 1.6.0

## 1.5.0 - 2025-08-22

### Added
- **JSON Editor Tab**: Added a new tab on the stats page for direct editing of app_data.json file
  - Created new JsonEditor component with read/write functionality ([`src/components/stats/JsonEditor.js`](src/components/stats/JsonEditor.js:1))
  - Added server endpoint for saving JSON data ([`server/index.js`](server/index.js:197))
  - Integrated JSON editor as a new tab in the stats page navigation ([`src/components/stats/ReadingStats.js`](src/components/stats/ReadingStats.js:370))
  - Implemented JSON validation with real-time feedback and syntax error highlighting
  - Added confirmation dialog for save operations to prevent accidental data loss
  - Includes reload functionality and automatic page refresh after successful saves

### Fixed
- **Analytics API Errors**: Fixed missing analytics endpoints that were causing 404 errors
  - Added `/api/analytics/event` endpoint ([`server/index.js`](server/index.js:234))
  - Added `/api/analytics/track/page_view` endpoint ([`server/index.js`](server/index.js:240))

### Changed
- Enhanced stats page with new JSON editor functionality for advanced data management
- Improved server error handling and API robustness

### Version
- Bumped package version to 1.5.0

## 1.4.2 - 2025-08-22

### Added
- **Recently Accessed Students Feature**: Added recently accessed students to the top of the student dropdown in the standard reading form
  - Added state management for recently accessed students in AppContext ([`src/contexts/AppContext.js`](src/contexts/AppContext.js:29))
  - Modified PrioritizedStudentsList to track clicked students in recent list ([`src/components/students/PrioritizedStudentsList.js`](src/components/students/PrioritizedStudentsList.js:153))
  - Updated SessionForm dropdown to show recently accessed students at the top with star icons and "Recent" labels ([`src/components/sessions/SessionForm.js`](src/components/sessions/SessionForm.js:140))
  - Students clicked in priority list now appear at the top of the standard form dropdown for quick access

### Changed
- Enhanced user workflow by providing quick access to recently handled students
- Improved dropdown organization with visual distinction for recently accessed students

### Version
- Bumped package version to 1.4.2

## 1.4.1 - 2025-08-22

### Fixed
- **Class Persistence**: Fixed issue where disabled status reverted to active on page reload
  - Added missing `classes` array to data file structure ([`config/app_data.json`](config/app_data.json:1))
  - Enhanced server robustness by ensuring all required data structures are initialized ([`server/index.js`](server/index.js:65))
  - Classes and their disabled status now persist correctly across page reloads

### Version
- Bumped package version to 1.4.1

## 1.3.0 - 2025-08-22

### Added
- **Class Disable/Enable Feature**: Added ability to disable classes for end-of-year scenarios
  - Added `disabled` field to class data structure with default value of `false`
  - Added server-side API endpoints for class management ([`server/index.js`](server/index.js:208))
  - Enhanced ClassManager with toggle switches and status indicators ([`src/components/classes/ClassManager.js`](src/components/classes/ClassManager.js:1))
  - Updated AppContext to include disabled field in class creation ([`src/contexts/AppContext.js`](src/contexts/AppContext.js:342))
  - Updated prioritized students calculation to exclude students from disabled classes ([`src/contexts/AppContext.js`](src/contexts/AppContext.js:700))

### Changed
- **Student Filtering**: Modified all components to exclude students from disabled classes:
  - Student List with class filtering ([`src/components/students/StudentList.js`](src/components/students/StudentList.js:110))
  - Session Form student dropdown ([`src/components/sessions/SessionForm.js`](src/components/sessions/SessionForm.js:83))
  - Student Sessions class selector ([`src/components/sessions/StudentSessions.js`](src/components/sessions/StudentSessions.js:221))
  - All stats components ([`src/components/stats/ReadingFrequencyChart.js`](src/components/stats/ReadingFrequencyChart.js:13), [`src/components/stats/DaysSinceReadingChart.js`](src/components/stats/DaysSinceReadingChart.js:13), [`src/components/stats/ReadingTimelineChart.js`](src/components/stats/ReadingTimelineChart.js:16))

### Fixed
- Layout overflows on narrow viewports and small-chart column sampling

### Version
- Bumped package version to 1.3.0

## [1.1.0] - 2025-07-15

### Added
- **Delete Student Functionality**: Added ability to delete students directly from the Student Sessions modal
  - Added delete button to Student Sessions modal header for quick access
  - Implemented confirmation dialog to prevent accidental deletions
  - Modal automatically closes after successful deletion
  - Uses existing AppContext.deleteStudent function for consistency
  - Follows established patterns for destructive actions with proper user confirmation

### Changed
- Enhanced Student Sessions modal with additional management capabilities
- Improved user experience by providing direct access to student deletion from the sessions view

## [1.0.2] - Previous Release
- Initial Cloudflare Workers implementation
- Basic student management (add, edit)
- Reading session tracking
- Class management functionality
- Data import/export capabilities

## [1.0.0] - Initial Release
- Basic application structure
- Student and reading session management
- Core functionality implementation