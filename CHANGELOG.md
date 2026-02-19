# Changelog

## [3.1.1] - 2026-02-19

### Enhanced: Metadata Fetch Now Populates ISBN, Page Count & Publication Year

- **OpenLibrary `getBookDetails`**: Now requests and returns `isbn` (ISBN-13 preferred), `pageCount` (from `number_of_pages_median`), and `publicationYear` (from `first_publish_year`)
- **Google Books `getBookDetails`**: Now extracts ISBN from `industryIdentifiers` (ISBN-13 preferred) and `publicationYear` from `publishedDate`
- **`batchFetchAllMetadata`**: Results now include `foundIsbn`, `foundPageCount`, `foundPublicationYear`
- **Fill Missing**: Now detects and fills missing ISBN, page count, and publication year alongside author/description/genres
- **Refresh All**: Diff review dialog now shows ISBN, Pages, and Year changes with proper field labels
- **Tests**: Updated batch metadata tests and BookManager tests for new fields

## [3.1.0] - 2026-02-19

### Added: ISBN Barcode Scanning & Book Metadata Redesign

#### ISBN Barcode Scanning
- **Camera-based ISBN scanning**: New BarcodeScanner component using html5-qrcode for EAN-13 barcode detection
- **ScanBookFlow**: Full scan-to-add workflow — scan barcode, preview book metadata from OpenLibrary, add to library
- **ISBN lookup API**: Two new endpoints — `GET /api/books/isbn/:isbn` (lookup) and `POST /api/books/scan` (confirm & add)
- **OpenLibrary integration**: ISBN lookup with KV caching (30-day success, 24-hour not-found)
- **ISBN validation**: Validates and normalizes ISBN-10 and ISBN-13 with check digit verification
- **Scanner integration**: Scan button added to BookManager toolbar, BookAutocomplete, and HomeReadingRegister
- **CSV import**: ISBN column auto-detection and ISBN-based deduplication during import
- **AddBookModal**: New fields for ISBN, page count, series name/number, and publication year

#### Book Metadata Fields
- **Database migration 0022**: Adds `isbn`, `page_count`, `series_name`, `series_number`, `publication_year` to books table
- **D1 provider**: Updated rowToBook/bookToRow mappings and all CRUD operations for new fields
- **API routes**: All book endpoints return and accept the new metadata fields

#### Fill Info Redesign
- **Fill Missing button**: One-click fills all gaps (author, description, genres) across the library in a single pass per book, auto-applies without review
- **Refresh All button**: Re-fetches metadata for every book, shows a diff-style review dialog with per-field checkboxes (old value vs new value) before applying
- **Unified batch API**: New `batchFetchAllMetadata()` function fetches author + description + genres in parallel per book via `Promise.allSettled`
- **Removed**: Old Fill Info dropdown menu with separate Authors/Descriptions/Genres options, 3 separate progress bars, 3 results dialogs, "Include Unknown authors" toggle
- **Net reduction**: BookManager.js reduced by ~460 lines (from 2241 to 1777)

#### Tests
- 74 new tests for ISBN features (validation, lookup, scanning, CSV import)
- 9 new tests for batchFetchAllMetadata
- 10 new tests for Fill Missing/Refresh All buttons
- Total: 1,407 tests passing (40 files)

#### Files Added
- `src/utils/isbn.js` — ISBN validation and normalization
- `src/utils/isbnLookup.js` — OpenLibrary ISBN lookup with KV caching
- `src/components/books/BarcodeScanner.js` — Camera barcode scanner modal
- `src/components/books/ScanBookFlow.js` — Scan-to-add orchestration
- `migrations/0022_add_book_metadata_fields.sql` — New book columns

#### Deployment Notes
```bash
# Run the new migration
npx wrangler d1 migrations apply reading-manager-db --local   # local
npx wrangler d1 migrations apply reading-manager-db --remote  # production

npm run go
```

---

## [3.0.0] - 2026-02-18

### Added: Cover Image Caching & AI Recommendation Caching

Major performance release adding edge caching for book covers (R2) and AI recommendations (KV), plus book covers throughout the library UI.

#### Cover Image Caching (R2)
- **Cover proxy route**: New `/api/covers/:type/:key` endpoint proxies OpenLibrary cover images through Cloudflare R2
- **Automatic caching**: First request fetches from OpenLibrary, stores in R2; subsequent requests served from R2
- **Supported types**: `id`, `olid`, `isbn`, `ia` (Internet Archive)
- **Placeholder detection**: Images under 1KB are treated as OpenLibrary placeholders and return 404
- **30-day browser cache**: `Cache-Control: public, max-age=2592000` reduces repeat requests
- **Fail-open design**: R2 errors fall through to origin fetch transparently

#### AI Recommendation Caching (KV)
- **Deterministic cache keys**: SHA-256 hash of student profile (reading level, genres, recent books, focus mode, provider)
- **7-day TTL**: Cached recommendations expire after one week
- **Skip cache option**: `?skipCache=true` query param forces fresh AI generation
- **Cached indicator**: UI shows chip when serving cached results with refresh button
- **Fail-open design**: KV errors silently fall through to fresh AI generation

#### Book Covers in Library
- **Book list thumbnails**: 40x56px cover images on every book in the library list
- **Edit modal covers**: Book cover displayed in edit dialog (replaces old "No cover" placeholder)
- **Consistent component**: Uses same `BookCover` component as recommendations page

#### Infrastructure
- **R2 bucket**: `book-covers` binding in wrangler.toml
- **KV namespace**: `RECOMMENDATIONS_CACHE` binding in wrangler.toml
- **Database migration**: `0021_add_cover_columns.sql` (cover metadata columns)

#### Tests
- **25 new cover proxy tests**: Input validation, R2 cache hits, origin fetch, error handling, R2 binding unavailable
- **16 new recommendation cache tests**: Key generation, cache hits/misses, fail-open behavior, TTL
- Total: 1,324 tests passing (37 files)

#### Files Added
- `src/routes/covers.js` - Cover proxy route with R2 caching
- `src/utils/recommendationCache.js` - KV-based recommendation cache utility
- `src/__tests__/integration/covers.test.js` - Cover proxy tests
- `src/__tests__/unit/recommendationCache.test.js` - Cache utility tests
- `migrations/0021_add_cover_columns.sql` - Cover metadata migration

#### Files Modified
- `src/worker.js` - Mount covers router, bypass auth for cover routes
- `src/routes/books.js` - Integrate recommendation cache into AI suggestions endpoint
- `src/components/BookRecommendations.js` - Cached indicator UI, refresh button
- `src/components/books/BookManager.js` - BookCover in list items and edit modal
- `src/hooks/useBookCover.js` - Route cover URLs through proxy
- `src/utils/openLibraryApi.js` - Route cover URLs through proxy
- `wrangler.toml` - R2 and KV bindings

#### Deployment Notes
```bash
# Run the cover columns migration
npx wrangler d1 migrations apply reading-manager-db --local   # local
npx wrangler d1 migrations apply reading-manager-db --remote  # production

# R2 bucket and KV namespace must be created in Cloudflare dashboard
# and bound in wrangler.toml before deploying
npm run go
```

---

## [2.9.3] - 2026-02-07

### Security & Audit Fixes

Deep codebase audit addressing 5 critical, 11 high-severity, and 4 performance issues. Full report in `docs/audit-2026-02-07.md`.

#### Critical Fixes
- **Foreign key enforcement**: PRAGMA foreign_keys = ON now executed per-request via middleware
- **IDOR cross-org user modification**: PUT /api/users/:id now filters by organization_id for non-owners
- **Global book mutation**: PUT/DELETE on books now checks org_book_selections membership; delete removes org link only
- **Data export blocked**: Legacy KV export/import endpoints disabled in multi-tenant mode
- **Token refresh race condition**: Concurrent refresh callers now share a single in-flight promise; authTokenRef eliminates stale closures

#### High-Severity Fixes
- **Password reset token invalidation**: Old tokens revoked before creating new ones
- **Book search/pagination org scoping**: All book query paths now use INNER JOIN org_book_selections
- **hasApiKey always false**: Fixed SQL query to use `(api_key_encrypted IS NOT NULL) as has_key`
- **rowToStudent JSON crash**: safeJsonParse prevents crash on malformed JSON in student records
- **Org deletion cascade**: Batch deactivates users and revokes refresh tokens on org soft-delete
- **Reading session validation**: Server-side validation for pages, duration, date, notes, assessment, location
- **Email HTML injection**: escapeHtml() applied to all user-controlled values in email templates
- **Login timing attack**: Dummy hashPassword() call for non-existent users
- **Optimistic update rollbacks**: Functional state updates prevent stale closure bugs in React state
- **Unbounded parallel requests**: bulkImportStudents batched to 5 concurrent requests

#### Performance
- **Composite indexes**: Migration 0020 adds indexes for (org_id, is_active) on students/users, (student_id, session_date) on reading_sessions, (org_id, is_available) on org_book_selections
- **Batch import confirm**: Book import uses db.batch() in chunks of 100 instead of sequential per-item queries
- **Batch organization stats**: 6 sequential COUNT queries consolidated into single db.batch() call
- **Default book list cap**: GET /api/books without pagination capped at 5,000 rows

#### Tests
- **93 new tests**: security-audit.test.js (50 tests), auth.test.js (43 tests)
- Total: 1,283 tests passing

#### Database
- **Migration 0020**: Composite indexes for common multi-column query patterns

#### Deployment Notes
```bash
# Run the new composite index migration
npx wrangler d1 migrations apply reading-manager-db --local   # local
npx wrangler d1 migrations apply reading-manager-db --remote  # production
```

---

## [2.9.2] - 2026-02-05

### Security & Quality Fixes

Comprehensive security hardening and performance improvements based on full codebase audit.

#### Security
- **Timing attack prevention**: All auth comparisons (HMAC signatures, passwords, refresh token hashes) now use constant-time comparison to prevent timing side-channel attacks
- **Refresh token exposure**: Removed refresh token from JSON response bodies in register, login, and refresh endpoints; now transmitted exclusively via httpOnly cookie
- **localStorage cleanup**: Removed refresh token storage from localStorage on the frontend
- **Password reset hardening**: Requires `APP_URL` environment variable for reset email links; no longer trusts `Origin`/`Host` request headers
- **Email enumeration prevention**: Registration endpoint returns generic error for duplicate emails instead of revealing whether an email is registered
- **5xx error sanitization**: Server errors no longer leak internal error messages to clients; returns generic "Internal Server Error" for 500+ status codes
- **Empty slug guard**: Organization slug generation now falls back to 'org' when names contain only special characters

#### Performance
- **N+1 query fix**: Students endpoint reduced from 2N+1 queries to 3 queries total using batch `IN()` fetches for reading sessions and preferences

#### Reliability
- **Error Boundary**: Added React Error Boundary component wrapping the entire app to prevent white-screen crashes
- **Batch error tracking**: D1 batch operations now report exactly how many items succeeded before a failure, aiding diagnosis of partial failures

#### Database
- **FTS5 fix**: Rebuilt full-text search as standalone table to fix incompatibility between `content_rowid='rowid'` and TEXT primary keys (migration 0019)

#### Deployment Notes
```bash
# Run the new FTS5 migration
npx wrangler d1 migrations apply reading-manager-db --local   # local
npx wrangler d1 migrations apply reading-manager-db --remote  # production

# Ensure APP_URL is set in Cloudflare dashboard for password reset emails
# e.g. APP_URL = "https://yourapp.example.com"
```

---

## [2.9.1] - 2026-02-05

### Security Fixes

- **JWT timing attack**: JWT signature verification now uses constant-time comparison (`constantTimeEqual`) instead of string equality, preventing potential timing side-channel attacks
- **Password reset bug**: Fixed field name mismatch between frontend (`newPassword`) and backend (`password`) that caused password reset to always fail with "Token and password required"

---

## [2.9.0] - 2026-01-29

### Added: Book Covers for Recommendations

Book recommendation tiles now display cover images fetched from OpenLibrary, with colorful generated placeholders as fallback.

#### Features
- **Cover Images**: Automatically fetches book covers from OpenLibrary API using ISBN, OCLC, or title/author search
- **Placeholder Covers**: Generates attractive gradient placeholders with book initials when no cover is found
- **Global Caching**: BookCoverContext provides app-wide cover caching with localStorage persistence
- **Graceful Degradation**: Seamlessly falls back to placeholders on network errors or missing covers

#### Components
- **BookCover**: Main component combining hook and placeholder logic
- **BookCoverPlaceholder**: Generates deterministic gradient backgrounds based on book title
- **BookCoverContext**: React context for global cover URL caching across components
- **useBookCover**: Hook for fetching covers with multi-strategy lookup (ISBN → OCLC → title search)

#### UI Changes
- Recommendation tiles now use horizontal layout with 80x120px cover on left
- Book descriptions displayed for library results (2-line truncation)
- Maintains all existing functionality (In Library chip, genres, match reasons)

#### Technical Details
- **OpenLibrary Integration**: Uses covers.openlibrary.org for cover images
- **Search Strategies**: Tries ISBN first, then OCLC number, then title/author search
- **Request Deduplication**: Prevents duplicate API calls for the same book
- **Cache Persistence**: Covers cached in localStorage with `book-cover-cache-` prefix
- **Deterministic Colors**: Placeholder gradients generated from title hash for consistency

#### Files Added
- `src/components/BookCover.js` - Main cover component
- `src/components/BookCoverPlaceholder.js` - Gradient placeholder generator
- `src/contexts/BookCoverContext.js` - Global caching context
- `src/hooks/useBookCover.js` - Cover fetching hook
- `src/__tests__/unit/BookCover.test.js` - Component tests
- `src/__tests__/unit/BookCoverContext.test.js` - Context tests
- `src/__tests__/unit/BookCoverPlaceholder.test.js` - Placeholder tests
- `src/__tests__/unit/useBookCover.test.js` - Hook tests

---

## [2.8.0] - 2026-01-23

### Improved: Responsive Layout for Recommendations and Stats Pages

Redesigned the Book Recommendations and Reading Stats pages to use CSS Grid for better responsiveness on different screen sizes, particularly iPad.

#### Book Recommendations Page
- **Simplified Layout**: Replaced two separate Paper tiles with a single container using CSS Grid
- **Compact Header**: Student name, class chip, reading level, and Edit Preferences button in a single row
- **Two-Column Content**: Books read list on left, profile details on right (stacks on mobile)
- **Cleaner Design**: Removed heavy MUI List components in favor of simple Box-based lists

#### Stats Overview Tab
- **Compact Summary Row**: Four key stats (Total Sessions, Students Read, Avg Sessions/Student, Days with Activity) in a fixed 4-column grid
- **Fluid Content Grid**: Main content cards use `auto-fit, minmax(280px, 1fr)` for optimal flow
- **Smaller Cards**: Reduced padding and font sizes for higher information density

#### Stats Streaks Tab
- **Consistent Summary Row**: Same 4-column compact layout for streak statistics
- **Two-Column Lists**: Active Streaks and Students Without Streaks side by side on larger screens
- **Simplified List Items**: Box components instead of MUI List for cleaner styling

#### Technical Changes
- Switched from MUI Grid to native CSS Grid for more control over responsive behavior
- Used `gridTemplateColumns` with responsive breakpoints (`xs`, `sm`)
- Reduced visual weight by removing nested Paper/Card components

---

## [2.7.0] - 2026-01-23

### Added: Owner School Switcher

Allows owner users to switch between organizations and manage any school's data without logging out.

#### Features
- **School Selector Dropdown**: New chip-style selector in the header (visible only to owners with multiple organizations)
- **Soft Context Switch**: Data refreshes without page reload when switching schools
- **Loading Indicator**: Shows spinner during organization switch
- **Automatic Filter Reset**: Class filter resets to "All Classes" when switching schools

#### UI/UX
- School name displayed as a green chip with school icon
- Dropdown menu lists all available organizations
- Current selection highlighted in the menu
- Positioned after user info chip, before logout button

#### Technical Details
- **Backend**: Tenant middleware checks `X-Organization-Id` header for owners to override organization context
- **Frontend**: AppContext manages available organizations and active organization state
- **API Requests**: Automatically include `X-Organization-Id` header when owner has switched orgs

#### Files Modified
- `src/middleware/tenant.js` - Added organization override support for owners
- `src/contexts/AppContext.js` - Added organization switching state and functions
- `src/components/Header.js` - Added school selector dropdown UI

---

## [2.6.0] - 2026-01-09

### Added: Reading Streaks

Track consecutive reading days for students with a configurable grace period. Streaks provide gamification to encourage regular reading habits.

#### Statistics Page Integration
- **Overview Tab**: New "Reading Streaks" summary card showing active streaks count, best current streak, and average streak
- **Streak Leaderboard**: Top 5 students with active streaks displayed on Overview tab
- **Dedicated Streaks Tab**: New tab with comprehensive streak statistics including:
  - Summary cards: Active Streaks, Best Current Streak, All-Time Record, Average Streak
  - Students with Active Streaks list (ranked with streak badges)
  - Students Without Active Streaks list (showing previous best streak if any)

#### Features
- **Streak Tracking**: Automatically calculates consecutive calendar days of reading for each student
- **Grace Period**: Configurable grace period (0-3 days) allows students to miss a day without breaking their streak
- **Visual Badge**: Fire emoji badge (🔥) displays current streak on student cards
- **Streak Details**: Student session dialog shows current streak, longest streak, and streak start date
- **Batch Recalculation**: Admin endpoint to recalculate all student streaks (useful after migration or data recovery)

#### Display
- **Student Cards**: StreakBadge appears next to reading preferences icon when streak > 0
- **Student Sessions Dialog**: Dedicated streak section with gradient background showing:
  - Current streak with animated badge
  - Best streak achieved (trophy icon)
  - Streak start date

#### Settings
- New "Reading Streak Settings" section in Settings page
- Grace period dropdown: No grace period (strict), 1 day (recommended), 2 days, 3 days
- Explanatory text updates dynamically based on selection

#### Technical Details
- **Database Migration**: `migrations/0016_reading_streaks.sql` adds `current_streak`, `longest_streak`, `streak_start_date` columns to students table
- **Streak Calculator**: New `src/utils/streakCalculator.js` with comprehensive logic for streak calculation
- **Automatic Updates**: Streaks recalculated automatically when reading sessions are created or deleted
- **Timezone Support**: Uses organization timezone setting for accurate day boundaries
- **API Endpoints**:
  - `GET /api/students/:id/streak` - Get streak details for a student
  - `POST /api/students/recalculate-streaks` - Recalculate all streaks (admin only)

#### New Files
- `migrations/0016_reading_streaks.sql`
- `src/utils/streakCalculator.js`
- `src/__tests__/unit/streakCalculator.test.js` (21 tests)
- `src/components/students/StreakBadge.js`

#### Modified Files
- `src/routes/students.js` - Streak calculation and endpoints
- `src/routes/settings.js` - Added `streakGracePeriodDays` to allowed keys
- `src/components/students/StudentCard.js` - StreakBadge display
- `src/components/sessions/StudentSessions.js` - Streak details section
- `src/components/Settings.js` - Grace period configuration UI

#### Deployment Notes
```bash
# Run the migration
npx wrangler d1 migrations apply reading-manager-db --local   # for local testing
npx wrangler d1 migrations apply reading-manager-db --remote  # for production

# Recalculate streaks for existing students (run in browser console while logged in as admin)
fetch('/api/students/recalculate-streaks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('krm_auth_token')}`
  }
}).then(r => r.json()).then(console.log);

# Deploy
npm run go
```

---

## [2.5.2] - 2026-01-08

### Added: School Reading Sessions Now Appear on Home Reading Register

Reading sessions recorded on the Reading Page (school sessions) are now included in the Home Reading Register count.

#### How It Works
- The Home Reading Register now displays a **combined count** of both home reading entries and school reading sessions for each day
- When you do a reading session with a student on the Reading Page, it will automatically show up on the Home Reading Register
- Example: If a student has 1 home read (✓) and you do a school reading session, it will show as "2" on the register
- Special statuses (Absent, No Record) still take priority if set for home reading

#### Behavior
- **Reading Page**: Records a single session (no change in behavior)
- **Home Reading Register**: Now shows combined count from both home and school sessions
- **Clear Entry**: Only clears home reading entries (preserves school sessions)
- **Record Reading**: Records home entries alongside existing school sessions

#### Technical Details
- Modified `getStudentReadingStatus()` in [HomeReadingRegister.js](src/components/sessions/HomeReadingRegister.js) to count both `location='home'` and `location='school'` sessions
- Updated [ClassReadingHistoryTable.js](src/components/sessions/ClassReadingHistoryTable.js) with the same logic
- No backend changes required - purely frontend display logic

---

## [2.5.1] - 2026-01-08

### Fixed: AI Settings Not Saving

This release fixes a bug where AI configuration (provider, API key, model) was not being saved to the database.

#### Problem
The `AISettings` component was attempting to save AI configuration via the generic `/api/settings` endpoint with an `ai` key. However, the backend only allows specific keys (`readingStatusSettings`, `timezone`, `academicYear`, etc.) and silently ignored the `ai` key. This meant AI settings appeared to save successfully but were never persisted.

#### Solution
Updated `AISettings.js` to use the dedicated `/api/settings/ai` endpoint which properly stores configuration in the `org_ai_config` table.

### Added: AI Provider Status Indicators

Added visual indicators showing which AI providers are configured and active:

- **AI Settings Page**: New "Provider Status" section with chips showing:
  - Which providers have API keys configured (green checkmark)
  - Which provider is currently active (filled primary color)
  - Source of the active key (organization settings vs environment variable)
  - Dropdown menu now shows checkmarks next to providers with keys

- **Book Recommendations Page**: New status chip in header showing:
  - Current active AI provider (e.g., "AI: Claude", "AI: Gemini")
  - Warning indicator when no AI is configured
  - Tooltip with model details

### Changed
- **AISettings Component**: Now calls `/api/settings/ai` endpoint directly instead of the generic settings endpoint
- **AI Config Loading**: Loads existing configuration from `/api/settings/ai` on component mount
- **Provider Mapping**: Handles `gemini` ↔ `google` naming between frontend and backend
- **User Feedback**: Shows an info alert when an API key is already configured
- **API Response**: `/api/settings/ai` now returns `availableProviders` object and `keySource` field

### Technical Details
- Backend checks both organization-level keys and environment-level keys
- Removed unused state variables and simplified component structure
- API key field shows placeholder when key exists (key is never returned from server for security)
- Proper error handling with user-friendly error messages

---

## [2.5.0] - 2026-01-07

### Database-Backed Current Book Tracking

This release replaces the inconsistent localStorage-based approach for tracking a student's current book with proper database storage.

#### Problem Solved
Previously, a student's "current book" was stored in localStorage on the browser and fell back to their most recent reading session. This caused several issues:
- **Device-specific**: A teacher using a different computer wouldn't see the current book
- **Inconsistent**: If a student finished a book, the fallback showed the wrong book
- **No persistence**: Clearing browser data lost all current book assignments

#### Solution
The current book is now stored directly in the `students` table and synced across all devices.

### Added
- **`current_book_id` Column**: New column on the `students` table with foreign key to `books`
- **New API Endpoint**: `PUT /api/students/:id/current-book` to update a student's current book
- **Auto-Update on Session**: When recording a reading session with a book, the student's current book is automatically updated
- **Context Function**: New `updateStudentCurrentBook()` function in AppContext for frontend use

### Changed
- **Student API Responses**: Now include `currentBookId`, `currentBookTitle`, and `currentBookAuthor` fields
- **HomeReadingRegister**: Uses database current book instead of localStorage
- **UI Text**: Updated to indicate book is "synced across devices" instead of "remembered for future entries"

### Removed
- **localStorage Dependency**: Removed `homeReadingStudentBooks` localStorage usage from HomeReadingRegister

### New Database Migration
- `migrations/0015_add_students_current_book.sql` - Adds `current_book_id` column and auto-populates from existing reading sessions

### Deployment Notes
```bash
# Run the migration
npx wrangler d1 migrations apply reading-manager-db --local   # for local testing
npx wrangler d1 migrations apply reading-manager-db --remote  # for production

# Deploy
npm run go
```

---

## [2.4.0] - 2026-01-07

### Security Hardening Release

This release implements comprehensive security improvements addressing authentication, data protection, and API security.

#### Critical Security Fixes
- **API Key Encryption**: API keys for AI providers (Anthropic, OpenAI, Google) are now encrypted using AES-GCM before storage in the database
  - Added `encryptSensitiveData()` and `decryptSensitiveData()` functions to crypto utilities
  - Backward compatible with existing plaintext keys (auto-decrypts legacy format)
  - Keys encrypted with HKDF-derived encryption key from JWT secret

- **SQL Injection Prevention**: Added whitelist validation for dynamic table names in `requireOrgOwnership()` middleware
  - Validates table names at middleware creation time
  - Throws error for any table not in the allowed list
  - Prevents potential SQL injection via parameter manipulation

#### Authentication Improvements
- **httpOnly Cookies**: Refresh tokens are now stored in httpOnly cookies instead of localStorage
  - Cookies set with `HttpOnly`, `Secure` (production), `SameSite=Strict` flags
  - Prevents XSS attacks from stealing refresh tokens
  - Backend reads from cookie first, falls back to request body for backward compatibility
  - Login, register, refresh, and logout endpoints all updated

- **Reduced Token TTL**: Access token lifetime reduced from 24 hours to 15 minutes
  - Limits window of opportunity for stolen tokens
  - Refresh tokens remain valid for 7 days for session persistence

- **Stronger Password Hashing**: Increased PBKDF2 iterations from 100,000 to 600,000
  - Meets OWASP 2024 recommendations for GPU-resistant hashing
  - Provides adequate protection against modern brute-force attacks

- **Account Lockout**: Implemented progressive account lockout after failed login attempts
  - 5 failed attempts triggers 15-minute lockout
  - Tracks attempts in D1 database for distributed consistency
  - Records IP address and user agent for security forensics
  - Auto-cleanup of old attempt records

#### API Security
- **CORS Whitelist**: Replaced permissive CORS with explicit origin whitelist
  - Origins configured via `ALLOWED_ORIGINS` environment variable
  - Development mode allows localhost origins
  - Production rejects requests from unknown origins

- **Security Headers**: Added comprehensive security headers middleware
  - `X-Frame-Options: DENY` - Prevents clickjacking
  - `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
  - `X-XSS-Protection: 1; mode=block` - XSS filter for legacy browsers
  - `Strict-Transport-Security` - Enforces HTTPS
  - `Referrer-Policy: strict-origin-when-cross-origin` - Controls referrer leakage
  - `Content-Security-Policy` - Restricts resource loading
  - `Cache-Control: no-store` on sensitive endpoints

- **Distributed Rate Limiting**: Replaced in-memory rate limiting with D1-based implementation
  - Works across all Cloudflare Worker instances
  - Auth endpoints limited to 10 requests/minute per IP
  - Graceful degradation if table doesn't exist
  - Automatic cleanup of old entries

#### Removed Sensitive Data Exposure
- **Token Logging Removed**: Removed all console.log statements that exposed sensitive tokens
  - Password reset tokens no longer logged even in development
  - Temporary passwords removed from API responses
  - Debug output no longer includes actual token values

### New Database Migrations
- `migrations/0013_login_attempts.sql` - Login attempts tracking for account lockout
- `migrations/0014_rate_limits.sql` - Rate limiting tracking table

### Changed
- `src/utils/crypto.js` - Added encryption functions, updated PBKDF2 iterations and token TTL
- `src/middleware/tenant.js` - Added table whitelist, D1-based rate limiting
- `src/routes/auth.js` - Added httpOnly cookies, account lockout, rate limiting
- `src/routes/settings.js` - API keys now encrypted before storage
- `src/routes/organization.js` - API keys now encrypted before storage
- `src/routes/books.js` - API keys decrypted when reading for AI recommendations
- `src/worker.js` - Added CORS whitelist and security headers middleware
- `src/contexts/AppContext.js` - Added `credentials: 'include'` for cookie support

### Deployment Notes
```bash
# Run new migrations
npx wrangler d1 migrations apply reading-manager-db --local
npx wrangler d1 migrations apply reading-manager-db --remote

# Optional: Set allowed origins for CORS
# In Cloudflare dashboard or wrangler.toml:
# ALLOWED_ORIGINS = "https://yourdomain.com,https://app.yourdomain.com"
```

## [2.3.3] - 2026-01-02

### Changed
- **Reading Preferences Modal**: Books the student has previously read now appear at the top of the likes/dislikes dropdowns
  - Priority books are sorted first, then remaining books alphabetically
  - Previously read books are labeled with "(previously read)" indicator
  - Makes it easier to select familiar books when setting student preferences

- **Reading Preferences Modal**: Modal now closes automatically after successfully saving preferences
  - Remains open on error so users can see the error message and retry

## [2.3.2] - 2025-12-30

### Added
- **"Get Details" Button in Reading Record**: New button in the book details pane that fetches author information from Google Books or OpenLibrary
  - Automatically populates the author field with metadata from the configured provider
  - Works for both existing books and newly created books
  - Shows loading state and provider availability checks
  - Integrated with the existing unified book metadata API

- **Genre Selector in Reading Record**: Added genre selection capability to the book details pane
  - Multi-select dropdown showing all available genres
  - Displays selected genres as chips with remove functionality
  - Genres are saved when updating the book record

- **Enhanced Book Autocomplete**: Always shows "Add new book" option when typing
  - Option appears at the bottom of the dropdown list regardless of existing matches
  - Streamlines adding books not yet in the library during reading sessions

### Changed
- **Reading Record Book Details Pane**: Enhanced with metadata retrieval workflow
  - Added "Get Details" button alongside "Update Book"
  - Improved button layout with proper spacing
  - Added genre selection field
  - Updated helper text to explain the metadata retrieval process

### Fixed
- **Form Reset**: Book genres now properly reset when clearing the form
- **Error Handling**: Improved validation and error messages for metadata fetching
- **State Management**: Ensures UI state updates correctly after metadata retrieval

## [2.3.1] - 2025-12-30

### Changed
- **Reading Record Form Layout**: Improved space utilization on the Record Reading Session page
  - **Student & Date**: Now arranged in a two-column layout on larger screens
  - **Book & Location**: Book autocomplete and location radio buttons are now side-by-side
  - **Book Details**: Selected book details (author, reading level, age range) appear in a separate column next to the book selection
  - **Assessment & Notes**: Assessment buttons now display vertically (stacked) in a dedicated column, with notes taking the adjacent column
  - All changes maintain responsive behavior - columns stack vertically on mobile devices

### Updated
- **AssessmentSelector Component**: Added `direction` prop to support vertical orientation
  - Accepts "row" (default) or "column" for button stacking
  - Adjusts border radius and spacing for vertical layout
  - Maintains consistent styling with the rest of the application

## [2.3.0] - 2025-12-29

### Added
- **User Editing**: Complete user editing workflow with modal dialog
  - Added Edit button (pencil icon) to each user row in the table
  - Responsive modal window with pre-populated form fields
  - Editable fields: name, role, and school (when multiple organizations exist)
  - Email field is read-only (cannot be changed)
  - Robust form validation and error handling
  - Cancel button to dismiss modal without saving
  - Save Changes button with loading state indicator
  - Asynchronous API call to update user details
  - Success/error notifications displayed to user
  - Reactive table updates without page refresh

- **Cross-Organization User Management**: Move users between schools
  - Enhanced PUT `/api/users/:id` endpoint to support organization changes
  - Owners can move users between any organizations
  - Validates target organization exists and has available capacity
  - Checks organization limits before moving users
  - Only owners can perform cross-organization user moves

- **School Management**: Complete CRUD interface for managing schools/organizations (Owner-only)
  - New [`SchoolManagement`](src/components/SchoolManagement.js) component with full management capabilities
  - Create new schools with configurable subscription tiers and limits
  - Edit existing school details (name, tier, max students, max teachers)
  - Deactivate schools (soft delete)
  - Visual table displaying all schools with tier badges and action buttons
  - Only visible to users with "owner" role
  - Added School Management tab to Settings page

- **School Name Management**: Enhanced user management with school name visibility
  - Added school name column to user management table
  - Users can now see which school each user belongs to
  - Added school dropdown selector when registering new users (displays when multiple organizations exist)
  - Backend API now includes organization name in user responses via JOIN with organizations table
  - New endpoint GET `/api/organization/all` to fetch all organizations for dropdown selection
  - School selection is only required when multiple organizations are present in the system

- **Organization API Endpoints**: New routes for school management
  - POST `/api/organization/create` - Create new organization (owner role required)
  - GET `/api/organization/:id` - Get specific organization by ID (owner role required)
  - PUT `/api/organization/:id` - Update organization details (owner role required)
  - DELETE `/api/organization/:id` - Deactivate organization (owner role required)

### Changed
- **User Listing**: Enhanced GET `/api/users` endpoint for owners
  - Owners now see users from ALL organizations in a single table
  - Admins continue to see only users from their own organization
  - Results are sorted by organization name, then by user name
  - Enables cross-organization user management for owners

- **User API Responses**: User objects now include `organizationName` field
  - Updated `rowToUser()` function in [`src/routes/users.js`](src/routes/users.js:26) to include organization name
  - Modified user queries to JOIN with organizations table for name retrieval
  - Enhanced user listing, retrieval, and update endpoints to include school information

- **Organization API**: Enhanced `/api/organization/all` endpoint to return complete organization objects
  - Now includes all organization fields (subscriptionTier, maxStudents, maxTeachers)
  - Uses `rowToOrganization()` mapper for consistent data structure

- **User Update Endpoint**: Enhanced PUT `/api/users/:id` to support organization changes
  - Added support for `organizationId` field in request body
  - Owners can move users between organizations
  - Validates target organization exists and has capacity
  - Enhanced to return user with updated organization name

## [2.2.0] - 2025-12-28

### Changed
- **User Registration**: Moved registration form from login page to hidden User Management tab in Settings
  - Registration is now only accessible to organization owners and admins via Settings > User Management
  - Removed registration tab from login page to streamline the login experience
  - Added comprehensive user management interface for creating, viewing, and managing users

### Added
- **User Management**: New dedicated User Management component for owner-only user registration
  - Create new users with roles (teacher, admin, readonly)
  - View all users in the organization with role badges
  - Delete/deactivate users (except owner)
  - Role-based access control ensuring only owners can create admin users
  - Clean, intuitive interface integrated into Settings page

- **Settings Enhancement**: Added User Management tab to Settings page
  - Tab only visible to users with owner or admin roles
  - Uses existing role-based permissions from AppContext
  - Seamlessly integrates with existing settings navigation

## [2.1.1] - 2025-12-27

### Fixed
- **Student Reading Preferences**: Fixed bug where student reading preferences (favorite genres, likes, dislikes) were not being saved in multi-tenant D1 mode
  - Added `fetchStudentPreferences()` helper to read from `student_preferences` table
  - Added `saveStudentPreferences()` helper to write favorite genre IDs to `student_preferences` table
  - Updated GET `/api/students` and GET `/api/students/:id` to include preferences in response
  - Updated PUT `/api/students/:id` to properly extract and save preferences from request body
  - Preferences now correctly persist across page reloads

## [2.1.0] - 2025-12-27

### Added
- **Google Books API Integration**: Added support for Google Books API as an alternative metadata provider
  - New `src/utils/googleBooksApi.js` module with full Google Books API integration
  - Supports fetching authors, descriptions, genres, and cover images
  - Automatic HTTPS conversion for cover URLs
  - Rate limiting with 300ms delays between batch requests

- **Unified Book Metadata API**: Created abstraction layer for switching between providers
  - New `src/utils/bookMetadataApi.js` module that routes to appropriate provider
  - Exports `METADATA_PROVIDERS` constants for provider selection
  - Provider validation ensures API key is configured before use
  - Dynamic provider display names in UI messages

- **Book Metadata Settings**: New settings tab for configuring metadata provider
  - Provider dropdown to select between OpenLibrary and Google Books
  - Google Books API key input field (shown conditionally)
  - Validation warning when Google Books selected without API key
  - Settings persist in organization settings

### Changed
- **BookManager**: Updated all metadata lookup functions to use unified API
  - `handleFetchBookDetails` now uses provider-agnostic API
  - `handleFillMissingAuthors` supports both providers
  - `handleFillMissingDescriptions` supports both providers
  - `handleFillMissingGenres` supports both providers
  - All functions validate provider configuration before operations

### Fixed
- **Settings Persistence**: Added `bookMetadata` to allowed settings keys in multi-tenant mode
  - Book metadata provider and API key settings now persist correctly after page reload
  - Fixed issue where settings were being filtered out by the backend validation

## [2.0.3] - 2025-12-27

### Improved
- **Edit Book Modal**: Redesigned layout with genre management
  - Shrunk description field from 7 rows to 4 rows for a more compact layout
  - Added genre tags section on the right side of the description
  - Users can now view, add, and remove genre tags directly in the edit modal
  - Genre selector dropdown shows available genres not yet assigned to the book
  - Genre chips display with delete buttons for easy removal

## [2.0.2] - 2025-12-27

### Improved
- **Fill Missing Genres Button**: Now also detects and updates books with unknown/invalid genre IDs
  - Previously only found books with no genres at all
  - Now includes books where genre IDs don't match any genre in the database (displayed as "Unknown")
  - Button renamed to "Fix Missing/Unknown Genres" for clarity
  - Helps fix genre mismatches that occurred during multi-tenant migration

## [2.0.1] - 2025-12-27

### Fixed
- **Reading Sessions Location**: Added missing `location` column to `reading_sessions` table
  - Sessions now properly store and return the `location` field ('school' or 'home')
  - Home Reading Register now correctly displays recorded sessions
  - Fixed issue where sessions were saved but not displayed due to missing location filter match
- **Backend Session Handling**: Updated POST `/api/students/:id/sessions` endpoint to include `location` in INSERT and response

## [2.0.0] - 2025-12-27

### Added - Multi-Tenant SaaS Architecture

This major release transforms Tally Reading from a single-user application into a multi-tenant SaaS platform with full organization isolation, user management, and role-based access control.

#### Database Foundation (Phase 1)
- **Organizations Table**: Multi-tenant foundation with unique slugs, settings, and subscription tiers
- **Users Table**: Full user management with email/password authentication, roles (owner, admin, teacher, readonly)
- **Refresh Tokens**: Secure token rotation for JWT authentication
- **Password Reset Tokens**: Self-service password recovery with expiration
- **Classes Table**: Organization-scoped classes with soft delete support
- **Students Table**: Organization-scoped students with reading preferences and soft delete
- **Reading Sessions Table**: Normalized session storage with automatic last_read_date triggers
- **Organization Book Selections**: Per-organization book catalog customization
- **Organization Settings**: Tenant-specific configuration and AI settings
- **Audit Log**: Comprehensive activity tracking for compliance
- **Genres Table**: Organization-scoped genres with default data seeding

#### Authentication System (Phase 2)
- **JWT Authentication**: Secure token-based auth using Web Crypto API (Workers-compatible)
- **PBKDF2 Password Hashing**: 100,000 iterations with random salt for secure password storage
- **Token Refresh**: Automatic access token refresh with 60-second buffer before expiration
- **Role-Based Access Control**: Hierarchical permissions (owner > admin > teacher > readonly)
- **Auth Routes**: Complete authentication endpoints
  - `POST /api/auth/register` - Organization and owner registration
  - `POST /api/auth/login` - Email/password authentication
  - `POST /api/auth/refresh` - Token refresh
  - `POST /api/auth/logout` - Session termination
  - `POST /api/auth/forgot-password` - Password reset initiation
  - `POST /api/auth/reset-password` - Password reset completion

#### API Updates (Phase 3)
- **Tenant Middleware**: Automatic organization context injection and isolation
- **User Management Routes**: Full CRUD for organization users with role management
- **Organization Routes**: Organization settings, AI configuration, and audit log access
- **Updated Routes**: All existing routes (students, classes, settings, genres) now support both legacy KV mode and multi-tenant D1 mode
- **Dual-Mode Operation**: Seamless backward compatibility with legacy single-user deployments

#### Frontend Updates (Phase 4)
- **Multi-Tenant Login**: Email/password authentication with registration support
- **AppContext Enhancements**:
  - New state: `authMode`, `refreshToken`, `user`
  - New functions: `loginWithEmail()`, `register()`, `forgotPassword()`, `resetPassword()`
  - Automatic token refresh on 401 responses
  - Derived state: `isMultiTenantMode`, `organization`, `userRole`
  - Permission helpers: `canManageUsers`, `canManageStudents`, `canManageClasses`, `canManageSettings`
- **Login Component**: Tabbed interface for login/register in multi-tenant mode

### New Files
- `migrations/0002_organizations_users.sql` - Organizations and users schema
- `migrations/0003_classes_students.sql` - Classes and students schema
- `migrations/0004_reading_sessions.sql` - Reading sessions schema
- `migrations/0005_org_book_selections.sql` - Book selections schema
- `migrations/0006_org_settings.sql` - Settings and audit log schema
- `migrations/0007_genres.sql` - Genres schema
- `src/utils/crypto.js` - JWT and password hashing utilities
- `src/middleware/tenant.js` - Multi-tenant middleware
- `src/routes/auth.js` - Authentication endpoints
- `src/routes/users.js` - User management endpoints
- `src/routes/organization.js` - Organization management endpoints

### Changed
- `src/worker.js` - Integrated new auth middleware and routes
- `src/routes/students.js` - Added multi-tenant D1 support
- `src/routes/classes.js` - Added multi-tenant D1 support
- `src/routes/settings.js` - Added multi-tenant D1 support
- `src/routes/genres.js` - Added multi-tenant D1 support
- `src/contexts/AppContext.js` - Added multi-tenant state and authentication
- `src/components/Login.js` - Added multi-tenant login/register UI

### Migration Notes
- **Backward Compatible**: Existing single-user deployments continue to work without changes
- **Multi-Tenant Activation**: Set `JWT_SECRET` environment variable to enable multi-tenant mode
- **Database Migrations**: Run `npx wrangler d1 migrations apply reading-manager-db --local` (or `--remote` for production)
- **First Organization**: Use the `/api/auth/register` endpoint to create the first organization and owner

## [0.35.0] - 2025-12-22

### Added
- **Book Search Box**: New search field in the Existing Books section
  - Searches by book title and author
  - Inline with filter dropdowns for easy access
  - Real-time filtering as you type

- **Level Range Filter**: New dropdown to filter books within a reading level range
  - Options: Exact, +0.5, +1.0, +1.5, +2.0, +2.5, +3.0, +4.0, +5.0
  - Only appears when a reading level is selected
  - Filters books from the selected level up to the range

### Changed
- **Reorganized Add Book Section**: New three-column horizontal layout
  - Add Book form now uses a compact 2-column grid (Title/Author, Level/Age Range)
  - Import/Export section positioned next to Add Book form
  - AI Fill Missing Data section on the right
  - All sections wrapped in Paper components for visual clarity

## [0.34.0] - 2025-12-18

### Added
- **Reading Level Filter**: New dropdown filter to filter books by reading level
  - Dynamically populated from unique reading levels in the book collection
  - Works in combination with the existing genre filter
  - Resets pagination when filter changes

- **Reading Level Chip Display**: Visual reading level indicator on book list items
  - Displayed as a filled primary-colored chip between author and genre
  - Compact styling consistent with other chips

### Changed
- **Reorganized AI Fill Buttons**: Consolidated all three "Fill Missing" buttons into a single grouped container
  - All buttons (Authors, Descriptions, Genres) now in one dashed-border box on the right
  - Cleaner layout with "AI Fill Missing Data" header
  - Maintains individual color coding for each button type
  - Author checkbox option remains accessible within the group

- **Updated Filter Messages**: "No books match" message now accounts for both genre and reading level filters

## [0.33.1] - 2025-12-13

### Changed
- **Book Recommendations UI**: Increased the width of book cover images by 50% (from 120px to 180px) to better match standard book aspect ratios.

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
- **Initial Release**: Initial release of Tally Reading.
- **Core Features**: Student management, Book tracking, Reading sessions, Class management.