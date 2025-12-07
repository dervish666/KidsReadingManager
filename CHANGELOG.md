# Changelog

## [0.33.0] - 2025-12-07

### Added
- **Fill Missing Genres Button**: New OpenLibrary integration to automatically fetch genre/subject data for books
  - Batch lookup for books without assigned genres
  - Filters OpenLibrary subjects to common genre keywords (Fiction, Fantasy, Mystery, etc.)
  - Automatically creates new genres in the system when needed
  - Results dialog showing found genres with apply/cancel options
  - Progress indicator during lookup process

- **Genre Filter for Book List**: Filter books by genre in the book manager
  - Dropdown filter to show only books with a specific genre
  - Updated pagination to work with filtered results
  - Shows "X of Y" count when filter is active

- **Genre Display on Book List**: Visual genre indicators on book list items
  - Shows up to 3 genre chips per book
  - "+N" indicator for books with more than 3 genres
  - Warning color scheme to distinguish from author chips

### Changed
- **Reorganized Book Manager UI**: Consolidated OpenLibrary lookup buttons
  - All three lookup buttons (Authors, Descriptions, Genres) now in a consistent row
  - Each button has its own dashed border box with distinct color coding
  - Author lookup: secondary (purple), Description lookup: info (blue), Genre lookup: warning (orange)

## [0.32.0] - 2025-12-07

### Added
- **OpenLibrary Availability Check**: Quick connectivity test before attempting to fetch book covers
  - 3-second timeout for fast failure detection
  - Cached availability status (60-second refresh interval)
  - User-friendly status indicators and retry functionality

### Improved
- **Immediate Recommendations Display**: AI recommendations now show instantly
  - Book covers and descriptions load progressively in the background
  - Users see results immediately without waiting for OpenLibrary
  - Visual feedback with "Loading book covers..." chip indicator
  - "Covers unavailable" warning with retry button when OpenLibrary is down
  - Snackbar notification for OpenLibrary connectivity issues

### Changed
- **BookManager OpenLibrary Integration**: Added availability checks before batch operations
 - Fill Missing Authors now checks OpenLibrary availability before starting
 - Fill Missing Descriptions now checks OpenLibrary availability before starting
 - Individual book detail fetch in edit modal checks availability first
 - Shows clear error message when OpenLibrary is unavailable

### Fixed
- Eliminated long waits when OpenLibrary is unreachable
- Removed silent failures during book cover enhancement

## [0.31.0] - 2025-12-07

### Added
- **Smart Book Filtering for AI Recommendations**: Implemented intelligent pre-filtering for book recommendations to handle large book collections (18,000+) efficiently.
  - New `getFilteredBooksForRecommendations()` method in D1 provider that filters at the database level
  - Filters by reading level (±2 levels from student's level)
  - Filters by favorite genres when specified
  - Excludes already-read books at the SQL level
  - Uses randomization for variety in recommendations
  - Automatic fallback to relaxed filters if strict criteria return too few results

### Changed
- **Recommendation Endpoint Optimization**: Updated `/api/books/recommendations` to use smart filtering instead of loading all books into memory
  - Reduced memory usage from loading 18,000+ books to ~100 pre-filtered relevant books
  - Maintains the same 50-book limit for AI prompts but with much more relevant selections
  - Added detailed logging for debugging recommendation filtering

### Technical Details
- Reading level mapping: beginner(1), early(2), developing(3), intermediate(4), advanced(5), expert(6)
- SQL-level filtering with JSON genre matching using LIKE patterns
- Handles large exclusion lists (500+ already-read books) with JavaScript fallback
- KV provider fallback implementation for non-D1 environments

## [0.30.0] - 2025-12-04

### Added
- **Drag-and-Drop Student Reordering**: Users can now reorder students in the Reading Record table by dragging and dropping rows. Custom order is persisted per class in localStorage. A "Reset Order" button appears when a custom order is active, allowing users to return to alphabetical sorting. Drag handles appear on the left side of each row.

## [0.29.2] - 2025-12-03

### Fixed
- **Record Reading Session Layout**: Fixed broken layout on the Record Reading Session page where dropdowns were incorrectly sized and elements were cramped horizontally. Updated MUI Grid components from deprecated v5 syntax (`<Grid item xs={12}>`) to v7 syntax (`<Grid size={12}>`) for proper responsive layout.

## [0.29.0] - 2025-11-29

### Added
- **Fill Missing Descriptions**: Added a new "Fill Missing Descriptions" button on the Books page that batch-processes books without descriptions, fetching them from OpenLibrary. Shows progress during lookup and displays results in a dialog for review before applying.

### Changed
- **Books Page Layout Improvements**:
  - Reorganized Import/Export section into its own bordered box with Export JSON and Export CSV stacked vertically above Import Books
  - Moved "Fill Missing Authors" and new "Fill Missing Descriptions" buttons to the right side of the page in separate bordered boxes
  - Improved visual separation between import/export controls and AI-powered lookup features

## [0.28.0] - 2025-11-29

### Added
- **Book Details from OpenLibrary**: Added a "Get Details" button in the book edit modal that fetches book descriptions and cover images from OpenLibrary. Descriptions are saved to the database; covers are displayed but not stored.
- **Book Descriptions in Table**: Book descriptions now appear in the book list between the author chip and delete button, truncated with ellipsis for long text.

### Changed
- **Books Page UI Improvements**:
  - Moved the "Include 'Unknown' authors" checkbox into a dedicated box with the "Fill Missing Authors" button for better clarity
  - Removed the edit button from book rows - clicking anywhere on a book row now opens the edit modal
  - Expanded the edit modal to include a cover image display area and description field
  - Made the edit modal wider (md size) to accommodate the new two-column layout with cover image

## [0.27.2] - 2025-11-29

### Changed
- **Reading Record Layout**: Improved space utilization on the Reading Record page by arranging the "Recording for" section and "Date/Search" controls in a two-column layout on larger screens. On mobile, the sections stack vertically as before.

## [0.27.1] - 2025-11-29

### Changed
- **Header Navigation**: Removed the Recommendations link from the top navigation bar as it's redundant with the bottom navigation.
- **Version Display**: Improved version number visibility in the header with a semi-transparent background and white text for better readability against the purple gradient.

## [0.27.0] - 2025-11-29

### Added
- **Reading History Table**: Added a new table at the bottom of the Reading Record page that displays all reading sessions for the selected class within a configurable date range.
  - Date range presets: This Week, Last Week, Last Month, or Custom date range
  - Table shows dates as columns and students as rows
  - Visual indicators for reading status (✓ for read, number for multiple sessions, A for absent, • for no record, - for not entered)
  - Total column showing each student's reading count for the selected period
  - Responsive design with sticky headers and student name column
  - Legend explaining the status indicators

## [0.26.1] - 2025-11-29

### Fixed
- **Reading Record Totals**: Fixed incorrect totals calculation in the Home Reading Register. Absent and No Record entries no longer increment the total sessions count, as students marked with these statuses didn't actually read.
- **Student Total Sessions**: Fixed the "Total" column in the register table to exclude absent and no_record marker sessions. Only actual reading sessions are now counted in the student's total.
- **Summary Statistics**: The summary chips now correctly track and display absent and no_record counts separately without adding them to total sessions.
- **Multiple Sessions (2+ button)**: Fixed race condition when recording multiple reading sessions. Now stores the count in a single session record using `[COUNT:N]` marker instead of creating multiple records, which was causing data loss due to optimistic update conflicts.
- **Status Cell Display**: Fixed the status cell to correctly display the number of sessions when using the 2+ button (e.g., shows "3" instead of "✓" when 3 sessions are recorded).

## [0.26.0] - 2025-11-28

### Added
- **Global Class Filter**: Added a class filter dropdown to the top navigation bar that persists across all pages. Users can now set their class filter once and have it apply to Students, Reading, Record, Recommend, and Stats pages.

### Changed
- **StudentList**: Removed local class filter dropdown, now uses global filter from header.
- **SessionForm (Reading page)**: Removed local class filter dropdown, now uses global filter from header.
- **HomeReadingRegister (Record page)**: Removed local class filter dropdown, now uses global filter from header. When 'All Classes' or 'Unassigned' is selected, automatically switches to first available class.
- **BookRecommendations (Recommend page)**: Removed local class filter dropdown, now uses global filter from header.
- **ReadingStats (Stats page)**: Now respects global class filter for all statistics calculations, including session count sorting and needs attention lists.
- **ReadingFrequencyChart**: Now respects global class filter for frequency chart.
- **ReadingTimelineChart**: Now respects global class filter for timeline chart.
- **DaysSinceReadingChart**: Now respects global class filter for days since reading chart.

### Technical
- Added `globalClassFilter` and `setGlobalClassFilter` to AppContext with sessionStorage persistence.
- Header component now includes styled class filter dropdown.

## [0.25.3] - 2025-11-28

### Removed
- **Quick Entry Mode**: Removed the Quick Entry tab from the Record Reading Session page. The standard session form now displays directly without the mode toggle, providing a simpler and more consistent user experience.

## [0.25.2] - 2025-11-28

### Fixed
- **Student Class Assignment**: Fixed bug where students were not being assigned to their selected class when adding or importing. The backend API route was not including the `classId` field when creating new students, causing all students to be saved as "Unassigned" regardless of the class selected in the dropdown.

## [0.25.1] - 2025-11-28

### Changed
- **Class Name Field**: Changed the class name input from a free text field to a dropdown selector with Year 1 through Year 11 options. This allows inferring student age from the year group and ensures consistent class naming.

### Fixed
- **Class Management Functions**: Added missing `addClass`, `updateClass`, and `deleteClass` functions to AppContext. These functions were being called by ClassManager but were never implemented, causing "t is not a function" errors when adding or editing classes.

## [0.25.0] - 2025-11-28

### Added
- **Cloudflare D1 Database**: Migrated book storage from KV to D1 SQL database for improved scalability (supports 18,000+ books).
- **D1 Provider**: New `src/data/d1Provider.js` for SQL-based book operations with full CRUD support.
- **Full-Text Search**: Implemented FTS5 full-text search for efficient book title/author searching.
- **Pagination Support**: Added paginated book retrieval with `GET /api/books?page=1&limit=50` endpoint.
- **Book Search API**: New `GET /api/books/search?q=query` endpoint for searching books.
- **Book Count API**: New `GET /api/books/count` endpoint for total book count.
- **Bulk Import**: D1 provider supports batch operations (up to 100 statements per batch) for efficient bulk imports.

### Changed
- **Hybrid Storage Architecture**: Books now use D1 database while students, classes, settings, and genres remain in KV storage.
- **Provider Pattern**: Updated `src/data/index.js` to auto-detect D1 availability and use appropriate provider.
- **Book Routes**: Enhanced `src/routes/books.js` with search, pagination, and count endpoints.

### Technical
- **Database Schema**: Created `migrations/0001_create_books_table.sql` with indexes and FTS5 triggers.
- **D1 Binding**: Added `READING_MANAGER_DB` binding to `wrangler.toml`.

## [0.24.2] - 2025-11-27

### Fixed
- **Reading Record Page**: Fixed multiple bugs in the home reading register:
  - Added clear button (X) on each pupil's row to allow correcting/removing entries
  - Fixed 2+ button to correctly add the specified number of sessions even when the row had no previous entry
  - Fixed state change behavior - clicking any status button (✓, 2+, A, •) now properly replaces the previous state instead of adding to it
  - Absent (A) and No Record (•) entries no longer incorrectly increment the total sessions count

## [0.24.1] - 2025-11-27

### Removed
- **Docker Support**: Removed all Docker-related files (Dockerfile, docker-compose.yml, .dockerignore, nginx.conf) as the application now uses Cloudflare Workers exclusively.

### Documentation
- Updated all documentation to remove Docker references and reflect Cloudflare Workers as the sole deployment target.

## [0.24.0] - 2025-11-27

### Added
- **Reading Record Page**: New page for quickly recording home reading for entire classes, similar to a paper register.
  - Date picker defaulting to yesterday
  - Class selection with student list
  - Quick input buttons: ✓ (read), 2+ (multiple sessions), A (absent), • (no record)
  - Book selection with persistence (remembers last book per student via localStorage)
  - Session totals and summary statistics
  - Search filter to quickly find students
  - Mobile-responsive design with collapsible input panel
- **Navigation**: Added "Record" tab to bottom navigation for accessing the Reading Record page

### Changed
- **Session Data**: Home reading sessions now include `location: 'home'` field to distinguish from school reading
- **Status Markers**: Special notes markers (`[ABSENT]`, `[NO_RECORD]`) used to track non-reading statuses

## [0.23.5] - 2025-11-24

### Added
- **Student Table**: Clicking the student icon in the main student table now marks the student as "handled" in the priority list, mirroring the behavior of clicking the student tile in the priority list.

### Fixed
- **Authentication**: Audited and updated all internal API calls to use `fetchWithAuth` to ensure consistent authentication.
- **Components**: Updated `SessionForm` and `BookManager` to use authenticated fetch for book operations.

### Documentation
- **Architecture**: Updated documentation to reflect Cloudflare Workers as the primary deployment target.

## [0.23.3] - 2025-11-24

### Fixed
- **Authentication**: Fixed "unauthorized" error in book recommendations by ensuring the authentication token is included in the API request.

## [0.23.2] - 2025-11-23

### Changed
- **Architecture**: Removed legacy Express backend (`server/`) to focus exclusively on Cloudflare Workers architecture.
- **Development**: Updated `npm run start:dev` to run both the React frontend and Cloudflare Worker backend concurrently.
- **Proxy**: Updated frontend proxy configuration to point to the Cloudflare Worker development server (port 8787).

## [0.23.1] - 2025-11-23

### Fixed
- **Settings Persistence**: Fixed issue where AI model names were not persisting correctly when switching between providers.
- **Default Models**: Updated default AI models to `claude-haiku-4-5` (Anthropic), `gpt-5-nano` (OpenAI), and `gemini-flash-latest` (Google).

## [0.23.0] - 2025-11-23

### Changed
- **Security**: Removed hardcoded `ANTHROPIC_API_KEY` from `wrangler.toml` and backend code.
- **Configuration**: Enforced API key configuration via the Settings page for all AI providers.
- **Error Handling**: Improved fallback mechanism to gracefully handle missing API keys without triggering 401 errors.

## [0.22.0] - 2025-11-23

### Fixed
- **AI Key Persistence**: Fixed issue where API keys were not persisting correctly per provider. Keys are now stored in a `keys` object within settings.
- **Settings Update**: Fixed "t is not a function" error by implementing `updateSettings` in `AppContext`.
- **Worker Route**: Updated `src/routes/books.js` to correctly resolve API keys from settings in the Cloudflare Worker environment.

## [0.21.0] - 2025-11-23

### Added
- **Multi-Provider AI Support**: Added support for Anthropic (Claude), OpenAI (GPT), and Google (Gemini) for book recommendations.
- **AI Settings UI**: New "AI Integration" tab in Settings page to configure provider, API key, model, and base URL.
- **AI Service Abstraction**: Created `src/services/aiService.js` to handle multiple AI providers with a unified interface.
- **Settings Persistence**: AI configuration is now saved in the application settings (JSON/KV) rather than relying solely on environment variables.

### Changed
- **Recommendation Logic**: Updated backend (`server/index.js` and `src/routes/books.js`) to use the configured AI provider from settings.
- **Environment Variables**: `ANTHROPIC_API_KEY` is now optional and serves as a backward-compatible fallback if no provider is configured in the UI.
- **Documentation**: Updated `AGENTS.md` and `app_overview.md` to reflect the new AI configuration options.

## [0.20.1] - 2025-11-23

### Fixed
- **Cloudflare Worker Deployment**: Fixed `wrangler.toml` configuration to correctly map the `READING_MANAGER_KV` binding.
- **Environment Detection**: Improved detection of Cloudflare Worker environment to prevent "KV namespace not bound" errors.
- **Build Process**: Updated build scripts to ensure proper environment variable handling during deployment.

## [0.20.0] - 2025-11-23

### Added
- **Cloudflare Workers Support**: Full support for deploying the API to Cloudflare Workers.
- **KV Storage Provider**: Implemented `kvProvider.js` for data persistence using Cloudflare KV.
- **Dual Architecture**: Application now supports both local Express/JSON and Cloudflare/KV architectures.
- **Hono Framework**: Integrated Hono for lightweight, edge-compatible routing in the Worker environment.

### Changed
- **Data Layer Abstraction**: Refactored data access into a provider pattern (`src/data/index.js`) to switch between JSON and KV storage.
- **API Routes**: Migrated API routes to support both Express and Hono adapters.
- **UUID Generation**: Switched to `crypto.getRandomValues` for compatibility with Edge environments.

## [0.19.0] - 2025-11-22

### Added
- **AI-Powered Recommendations**: Integrated Anthropic Claude API for personalized book recommendations.
- **Recommendation UI**: New interface for viewing and requesting book suggestions for students.
- **Reading Analysis**: AI analyzes reading history, preferences, and age to suggest appropriate books.

### Changed
- **Student Profile**: Enhanced student data model to include detailed reading preferences and history for AI context.

## [0.18.0] - 2025-11-21

### Added
- **Reading Stats**: Comprehensive statistics dashboard for reading progress.
- **Visualizations**: Charts for reading frequency, books read over time, and genre distribution.

## [0.0.1] - 2025-11-20

### Added
- **Initial Release**: Initial release of Kids Reading Manager.
- **Core Features**: Student management, Book tracking, Reading sessions, Class management.