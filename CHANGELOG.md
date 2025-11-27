# Changelog

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