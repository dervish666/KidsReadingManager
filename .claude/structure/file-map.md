# File Map

One line per source file: relative path - brief description. This is the full
per-file index. For a compact directory-level overview see the "Codebase
Structure Index" in `CLAUDE.md`; for export signatures and dependencies read the
relevant `.claude/structure/*.yaml`.

After adding, removing, or renaming source files or public classes/functions,
update this file and the relevant structure YAML (and the directory index in
`CLAUDE.md` if a whole directory is added or removed).

## Entry point

src/worker.js - Cloudflare Worker entry; middleware chain, route registration, scheduled tasks
src/App.js - Main React app component; layout, routing, auth gate
src/index.js - React app entry point
src/instrument.js - Sentry browser SDK initialization

## Backend Routes

src/routes/auth.js - Auth composition root; applies authRateLimit, mounts auth/_ sub-routers; re-exports parseCookies for mylogin.js
src/routes/auth/\_shared.js - Shared auth helpers: parseCookies, login lockout (isAccountLocked, recordLoginAttempt, clearFailedAttempts)
src/routes/auth/register.js - POST /demo (role-capped demo JWT), GET /mode (auth-mode discovery), POST /register (new org + owner)
src/routes/auth/session.js - POST /login (with lockout), POST /refresh (token rotation + reuse detection), POST /logout, GET /me
src/routes/auth/password.js - POST /forgot-password, POST /reset-password, PUT /password (authenticated change)
src/routes/mylogin.js - MyLogin OAuth2 SSO (login, callback, logout)
src/routes/students.js - Core student CRUD (list, get, create, update, soft-delete) + current-book / feedback mutators; mounts students/_ sub-routers; re-exports recalculateAllStreaks for the cron
src/routes/students/\_shared.js - Shared helpers: fetchStudentPreferences, saveStudentPreferences, getOrgStreakSettings (KV-cached), updateStudentStreak
src/routes/students/sessions.js - GET /sessions, GET/POST /:id/sessions, POST /:id/sessions/bulk (multi-day batch, side-effects run once), DELETE/PUT /:id/sessions/:sessionId — creates use the shared runSessionSideEffects chain
src/routes/students/stats.js - GET /stats — org rollup: counts, weekly activity, day-of-week, status distribution, streak leaderboard, most-liked books
src/routes/students/streak.js - GET /:id/streak, POST /recalculate-streaks; exports cron-time recalculateAllStreaks bulk-recalculator
src/routes/students/bulk.js - POST /bulk — CSV bulk import with name dedup and chunked batch insert
src/routes/students/gdpr.js - DELETE /:id/erase (Article 17), PUT /:id/restrict (Article 18), PUT /:id/ai-opt-out, GET /:id/export (Article 15 SAR JSON/CSV)
src/routes/books.js - Core book CRUD (list, search, count, get, create, update, delete, clear-library, enrich); mounts books/_ sub-routers
src/routes/books/recommendations.js - GET /library-search (DB-only scoring), GET /ai-suggestions (AI provider + cache + GDPR checks)
src/routes/books/isbn.js - GET /isbn/:isbn (D1 → OpenLibrary fallback), POST /scan (link/preview/create), GET /search-external (OpenLibrary typeahead)
src/routes/books/import.js - POST /bulk (dedup + batch insert), POST /import/preview (categorise matches), POST /import/confirm (batched D1 execute)
src/routes/books/duplicates.js - GET /duplicates (owner: ISBN + title/author dup clusters), POST /verify-isbns (owner: ISBN→title check via OpenLibrary), POST /merge (owner: atomic repoint-then-delete merge)
src/routes/classes.js - GET/POST/PUT/DELETE class management, GET/PUT class goals
src/routes/genres.js - GET/POST/PUT/DELETE genre management
src/routes/covers.js - GET book covers; R2 cache + OpenLibrary → Google Books → Hardcover fallback (ISBN via /:type/:key, title+author via /search)
src/routes/users.js - Core user CRUD (list, get, create, update, soft-delete) + password reset; mounts users/_ sub-routers
src/routes/users/gdpr.js - DELETE /:id/erase (Article 17 hard delete), GET /:id/export (Article 15 SAR JSON/CSV)
src/routes/users/classes.js - GET /:id/classes, PUT /:id/classes — class assignment management per user
src/routes/organization.js - Core org CRUD (list, get, create, update, soft-delete) + stats; mounts organization/_ sub-routers
src/routes/organization/settings.js - GET/PUT /settings, GET/PUT /ai-config — org settings and AI configuration
src/routes/organization/compliance.js - GET /audit-log, GET/POST /dpa-consent, DELETE /:id/purge (Article 17 erasure)
src/routes/settings.js - Settings entry router; mounts settings/_ sub-routers; re-exports upsertAiConfig for organization/settings.js
src/routes/settings/\_shared.js - Shared helper: fetchProviderModels (provider models API → [{id, name}] list)
src/routes/settings/org.js - GET/POST / — org settings CRUD (allowlisted keys, KV streak/band cache invalidation)
src/routes/settings/ai.js - GET/POST /ai, GET/POST /ai/models — org AI config; exports shared upsertAiConfig
src/routes/settings/platform-ai.js - GET/PUT /platform-ai, GET /platform-ai/models, DELETE /platform-ai/:provider — owner-only platform AI keys
src/routes/signup.js - POST email newsletter signup (rate limited)
src/routes/data.js - GET/POST legacy data export/import
src/routes/hardcover.js - POST Hardcover GraphQL API proxy
src/routes/webhooks.js - POST Wonde webhook handler (schoolApproved, accessRevoked)
src/routes/wondeAdmin.js - POST/GET manual Wonde sync and status
src/routes/support.js - Support ticket submission, listing, detail, status management, internal notes (owner management endpoints)
src/routes/termDates.js - GET/PUT term dates per organization and academic year
src/routes/tours.js - GET/POST tour completion tracking per user
src/routes/metadata.js - GET/PUT metadata config, GET status, GET/DELETE jobs, POST enrich
src/routes/badges.js - GET/POST badge collection, notify, and class-wide summary endpoints
src/routes/contact.js - POST landing page contact form enquiry (public, rate limited)
src/routes/billing.js - POST/GET Stripe billing setup, status, portal, plan changes
src/routes/stripeWebhook.js - POST Stripe webhook handler (signature verification, event dedup)
src/routes/parent.js - Parent portal API: public token-auth view/session/book-search + teacher token management (generate, list, revoke)

## Middleware

src/middleware/tenant.js - JWT auth, tenant isolation, role guards, audit logging, rate limiting
src/middleware/auth.js - Legacy password auth, token creation (deprecated)
src/middleware/errorHandler.js - Global error handler, error constructors

## Data Providers

src/data/index.js - D1-only books provider factory (throws without READING_MANAGER_DB binding)
src/data/d1Provider.js - D1 SQL implementation with FTS5 search
src/data/demoSnapshot.js - Learnalot demo data snapshot (auto-generated, used by demoReset)

## Services

src/services/aiService.js - AI recommendation generation (Anthropic/OpenAI/Google)
src/services/kvService.js - KV storage operations (legacy)
src/services/wondeSync.js - Wonde delta/full sync orchestration
src/services/metadataService.js - Cascade engine (enrichBook, processBatch) for multi-provider metadata enrichment
src/services/demoReset.js - Hourly demo environment reset (FK-safe delete + snapshot re-insert)
src/services/orgPurge.js - Cascade hard-delete all org data (26 tables FK-safe), anonymise org row
src/services/providers/openLibraryProvider.js - OpenLibrary server-side adapter (no API key)
src/services/providers/googleBooksProvider.js - Google Books server-side adapter (requires API key)
src/services/providers/hardcoverProvider.js - Hardcover GraphQL server-side adapter (requires API key, best series data)
src/services/providers/bookInfoProvider.js - BookInfo/rreading-glasses adapter (Readarr-compatible, configurable base URL, no key; strong genres+series)

## Utilities

src/utils/crypto.js - PBKDF2 hashing, JWT, AES-GCM encryption, role constants
src/utils/validation.js - Input validation (students, books, sessions, passwords, ranges, genres, classes)
src/utils/helpers.js - ID generation, reading status, student sorting, csvRow, slug generation, fetchWithTimeout
src/utils/calculateAge.js - Age calculation from date of birth
src/utils/email.js - Password reset/welcome/signup/support emails (multi-provider)
src/utils/streakCalculator.js - Reading streak calculation with grace period
src/utils/readingBandDefinitions.js - Reading band ladder (16 colour bands), default reads-per-band, band lookup
src/utils/readingBandEngine.js - Pure reading-band maths: read counting, band index, academic-year start, display payload + transition
src/utils/readingObservations.js - Per-session reading-observation slots (6 fixed cols) + per-org config resolver (labels/enabled), shared by worker + app
src/utils/studentProfile.js - Build student reading profile for AI context
src/utils/stringMatching.js - All string/title matching: Levenshtein similarity (import dedup, ~0.85) + fuzzy title similarity & findBestTitleMatch (metadata-provider ranking, ~0.3) + sanitizeForSearch (absorbed titleMatching.js)
src/utils/bookDedup.js - Pure dedup helpers (normalizeIsbn, clusterDuplicates union-find, suggestCanonical, computeBackfill) for the owner merge tool
src/utils/recommendationCache.js - KV caching for AI recommendations
src/utils/isbn.js - ISBN validation and normalization
src/utils/isbnLookup.js - OpenLibrary ISBN lookup with KV caching
src/utils/openLibraryApi.js - OpenLibrary API client for book metadata
src/utils/googleBooksApi.js - Google Books API client
src/utils/hardcoverApi.js - Hardcover GraphQL API client with rate limiting
src/utils/bookMetadataApi.js - Unified metadata API with provider abstraction
src/utils/csvParser.js - CSV parsing for book import
src/utils/classAssignments.js - Sync class_assignments from wonde_employee_classes for a user
src/utils/classGoalsEngine.js - Term resolution, auto-generation defaults, class goal progress recalculation
src/utils/genreFilter.js - Junk-genre filter chokepoint (isJunkGenre/filterGenres): drops catalog sentinels/years/comma-headings, then canonicalises via genreSynonyms; keeps the dropdown clean during enrichment
src/utils/genreSynonyms.js - Curated genre taxonomy: GENRE_MERGES (synonym→canonical), GENRE_DROP, CANONICAL_GENRES + canonicalGenre(); single source for filterGenres and the one-time merge script
src/utils/routeHelpers.js - Shared route helpers (getDB, requireDB, isMultiTenantMode, requireStudent)
src/utils/rowMappers.js - Centralized row-to-object mappers (rowToBook, rowToStudent, rowToClass, rowToUser, rowToOrganization, rowToGenre, rowToSupportTicket, rowToSupportNote, rowToTourCompletion, rowToBadge, rowToReadingStats, rowToClassGoal)
src/utils/constants.js - Shared constants (PUBLIC_PATHS for auth bypass)
src/utils/wondeApi.js - Wonde REST API client for school data sync
src/utils/badgeDefinitions.js - Badge definitions with evaluate/progress functions, key stage resolution
src/utils/gardenStages.js - Single source of truth for Reading Garden stage thresholds (STAGES, getStage, stageFromApiName, goalsToEffectiveBadgeCount, getAggregateGarden per-student scaling)
src/utils/badgeEngine.js - Stats calculation, real-time/batch evaluation, genre classification, near-miss calculation
src/utils/tickerEvents.js - Build + record intra-day celebration ticker events (band-ups, badge awards) for the header ticker
src/utils/stripe.js - Stripe client factory, price ID helpers, AI add-on detection
src/utils/statsExport.js - PDF/CSV stats report generation (jsPDF)
src/utils/orgStatusCache.js - KV cache for organization is_active + subscription_status (tenantMiddleware reads, Stripe webhook/org deactivate/purge invalidate)
src/utils/coverPlaceholders.js - Shared SHA-256 hash set + helpers for rejecting upstream "image not available" cover placeholders (used by covers.js route + metadataService.js)
src/utils/aiCostCap.js - Per-tenant monthly AI cost cap enforcement (org_ai_usage table)
src/utils/contentModeration.js - AI output content-moderation layer (age-appropriate filtering)
src/utils/d1Batch.js - D1 batch operation guard (chunks statements to respect 100-statement limit)
src/utils/sentryFilter.js - Sentry PII scrubbing filter for error reporting

## Contexts & Hooks

src/contexts/AuthContext.js - Auth tokens, user, fetchWithAuth, login/logout, permissions, org switching
src/contexts/DataContext.js - State declarations, server reload, org-switch effects, settings, data export/import; composes domain hooks
src/contexts/data/useStudentOperations.js - Student CRUD operations (add, bulk import, update, delete, current book)
src/contexts/data/useBookOperations.js - Book CRUD operations (add, update, find-or-create, fetch details)
src/contexts/data/useSessionOperations.js - Reading session operations (add, edit, delete)
src/contexts/data/useClassOperations.js - Class CRUD and genre add operations
src/contexts/UIContext.js - Class filter, priority list, reading status, tours
src/contexts/AppContext.js - Composite provider (nests Auth > Data > UI), re-exports hooks
src/hooks/useEnrichmentPolling.js - Polling hook for metadata enrichment job progress

## Frontend Components - Root

src/components/Header.js - App bar with nav, class filter, school switcher, Reading News ticker (news feed + polled /api/badges/ticker celebration events)
src/components/LandingPage.js - Marketing landing page with email signup
src/components/LandingPage.css - Landing page styles (scroll animations, floating blobs, responsive)
src/components/Login.js - Auth UI (legacy, email/password, MyLogin SSO)
src/components/ErrorBoundary.js - React error boundary wrapper
src/components/BookCover.js - Book cover image with placeholder fallback
src/components/BookCoverPlaceholder.js - Gradient placeholder from title hash
src/components/TallyLogo.js - Shared tally mark SVG logo (4 vertical + 1 diagonal line)
src/components/TermsOfService.js - Terms of Service standalone page
src/components/CookiePolicy.js - Cookie Policy standalone page
src/components/DpaConsentModal.js - DPA consent dialog for data processing agreement
src/components/PrivacyPolicy.js - Privacy Policy standalone page
src/components/BookRecommendations.js - AI recommendations with library search
src/components/SupportModal.js - Support contact form modal (subject, message, email notification)
src/components/SupportTicketManager.js - Owner-only support ticket list with detail panel, status management, internal notes
src/components/PlatformSettings.js - Owner-only platform AI key management (per-provider keys, active provider selection)
src/components/BookMetadataSettings.js - Simplified admin view: enrichment status + Fill Missing
src/components/MetadataManagement.js - Owner metadata config, global enrichment, job history
src/components/DuplicateBooks.js - Owner tool: review + merge duplicate books in the global catalogue (clusters, canonical pick)
src/components/Settings.js - Reading status thresholds and streak settings
src/components/SettingsPage.js - Settings hub with tabs
src/components/AISettings.js - AI provider configuration
src/components/UserManagement.js - User CRUD and role assignment
src/components/SchoolManagement.js - School management container (state, API calls, table+drawer orchestration)
src/components/DataManagement.js - Export/import and Wonde sync UI
src/components/BillingBanner.js - Subscription status banner (trial countdown, past-due warning)
src/components/BillingDashboard.js - Billing management dashboard for admins
src/components/SubscriptionBlockedScreen.js - Blocked state screen when subscription cancelled
src/components/AchievementsPage.js - Standalone achievements route (promoted to main nav)
src/components/Help.js - Public /help page
src/components/ClassAssignmentBanner.js - Class assignment notification for new teachers
src/components/WelcomeDialog.js - First-time user welcome dialog

## Frontend Components - Schools

src/components/schools/SchoolTable.js - School data table with search, filters, sorting, pagination
src/components/schools/SchoolDrawer.js - Side drawer wrapper (read/edit/add modes, deactivate dialog)
src/components/schools/SchoolReadView.js - Read-only school detail cards (contact, address, billing, wonde)
src/components/schools/SchoolEditForm.js - School edit form with save/cancel

## Frontend Components - Books

src/components/books/BookManager.js - Book library with search, add, import, export
src/components/books/BookImportWizard.js - CSV import with fuzzy matching
src/components/books/AddBookModal.js - Add single book dialog
src/components/books/BarcodeScanner.js - ISBN barcode scanner (html5-qrcode)
src/components/books/ScanBookFlow.js - Scan-to-add workflow orchestrator
src/components/books/BookEditDialog.js - Book editing dialog (title, author, ISBN, genre)
src/components/books/BookExportMenu.js - Book export menu (JSON/CSV download)
src/components/books/bookImportUtils.js - Import utility functions (column detection, dedup)

## Frontend Components - Classes

src/components/classes/ClassManager.js - Class CRUD with year groups

## Frontend Components - Tour

src/components/tour/TourProvider.js - Tour context provider with lazy-loaded react-joyride
src/components/tour/TourRunner.js - Extracted tour runner (step logic, callbacks, scroll)
src/components/tour/TourButton.js - Floating compass replay button (fixed bottom-right)
src/components/tour/TourTooltip.js - Glassmorphism custom tooltip for tour steps
src/components/tour/tourSteps.js - Tour step definitions per page (targets, titles, content)
src/components/tour/useTour.js - Hook for auto-start, ready guard, and button props

## Frontend Components - Students

src/components/students/StudentList.js - Student listing with filters and sorting
src/components/students/StudentCard.js - Student card with status and streak
src/components/students/StudentDetailDrawer.js - Student detail side drawer (read/edit modes)
src/components/students/StudentEditForm.js - Student edit form with save/cancel
src/components/students/StudentReadView.js - Read-only student detail cards
src/components/students/StudentTable.js - Tabular student view
src/components/students/StreakBadge.js - Flame icon streak counter
src/components/students/ReadingLevelRangeInput.js - Dual-slider for AR level range
src/components/students/PrioritizedStudentsList.js - Priority-ordered student list
src/components/students/StudentTimeline.js - Chronological reading session timeline for a student
src/components/students/BulkImport.js - CSV bulk student import
src/components/students/BaselineReadsDialog.js - Roster table to seed mid-year "starting reads" per class (seeds Reading Band baseline)
src/components/students/ReadingBandChip.js - Reading band chip + progress-to-next display (shared across student/parent surfaces)

## Frontend Components - Sessions

src/components/sessions/HomeReadingRegister.js - Unified reading register with multi-day history columns
src/components/sessions/homeReadingUtils.js - Reading status constants and helpers for home reading
src/components/sessions/MultipleCountDialog.js - Dialog for entering multiple reading session count
src/components/sessions/FullReadingView.js - Expanded reading session entry view (composes ReadingInputPanel, DateRangePanel, StudentBooksRead around the register table)
src/components/sessions/ReadingInputPanel.js - "Recording for" panel with book picker and quick status buttons (full view, left column)
src/components/sessions/DateRangePanel.js - Date picker, date range preset, custom dates, and student search (full view, right column)
src/components/sessions/StudentBooksRead.js - Selected student's books-read history strip with covers (full view)
src/components/sessions/QuickReadingView.js - Compact quick-entry reading view
src/components/sessions/SessionForm.js - Reading session form
src/components/sessions/QuickEntry.js - Fast session entry for priority students
src/components/sessions/BookAutocomplete.js - Book search autocomplete
src/components/sessions/AssessmentSelector.js - Assessment level radio group
src/components/sessions/ReadingObservationToggles.js - Optional "how did they read today?" toggle chips (fluent/expressive/phonics), shared by session form + timeline edit
src/components/sessions/SessionNotes.js - Session notes text area
src/components/sessions/StudentInfoCard.js - Student info during session entry

## Frontend Components - Badges

src/components/badges/BadgeIcon.js - Single badge circle with tier gradient and category icon
src/components/badges/GardenHeader.js - Layered watercolor PNG garden header; 8 elements appear progressively as badges are earned (seedling→sprout→bloom→full garden)
src/components/badges/BadgeCollection.js - Grid of earned badges + near-miss progress bars
src/components/badges/BadgeCelebration.js - Unlock celebration dialog shown after session save
src/components/badges/BandCelebration.js - Band-up celebration dialog (from→to band transition)
src/components/badges/BadgeIndicators.js - Mini badge count chip for StudentCard

## Frontend Components - Goals

src/components/goals/goalMetrics.js - Shared METRIC_CONFIG/METRIC_ORDER for the six class-goal metrics (labels, descriptions, icons, theme-palette bar colours)
src/components/goals/ClassGoalsEditor.js - Teacher modal for editing class goal targets
src/components/goals/ClassGoalsDisplay.js - Fullscreen classroom projection view with garden and confetti

## Frontend Components - Parent Portal

src/components/parent/ParentPortal.js - Mobile-first parent view: reading progress, streak, session history, garden, home session logging via token-auth
src/components/parent/QRCodeSheet.js - Printable 3×4 grid of QR code cards per class (teacher print view)
src/components/parent/ParentQRButton.js - Single-student QR dialog with print, copy link, regenerate actions

## Frontend Components - Stats

src/components/stats/ReadingStats.js - Stats dashboard with metrics and charts
src/components/stats/OverviewTab.js - Stats overview with summary cards and trend indicators
src/components/stats/FrequencyTab.js - Reading frequency analysis tab
src/components/stats/StreaksTab.js - Streak leaderboard and history tab
src/components/stats/NeedsAttentionTab.js - Students needing reading attention tab
src/components/stats/ReadingTimelineChart.js - Reading timeline line chart
src/components/stats/ReadingFrequencyChart.js - Reading frequency bar chart
src/components/stats/DaysSinceReadingChart.js - Days since reading indicator
src/components/stats/AchievementsTab.js - Achievements tab: class-wide badge progress with expandable per-student drill-down

## Frontend Components - News

src/components/news/ReadingNewsTicker.js - Reading News ticker (compact variant lives in the header); rotates today's celebration events + item/event headlines from /reading-news.json, opens the Reading News tab
src/components/news/ReadingNewsPage.js - Full Reading News newsletter (Stats-page tab): masthead, rotating "Reading roundup" card (one per load), "From your shelves" articles with most-read placement badges, "Dates for the diary" timeline with live countdowns
src/components/news/newsFormat.js - Shared date helpers for the news ticker/page (dateParts, shortDate, longDate, sortEvents, countdownLabel, ordinal)

## Styling

src/styles/theme.js - Material-UI theme configuration

## Scripts

scripts/build-and-deploy.sh - Full rebuild + deploy pipeline (supports production and dev args)
scripts/migration.js - Data migration from old format
scripts/reset-admin-password.js - Admin password reset utility
scripts/seed-local.js - Bootstrap local D1 with migrations and a dev owner account (dev@tallyreading.uk / password)
scripts/merge-genres.mjs - One-time genre synonym merge: collapses synonyms/drops junk per genreSynonyms.js, remaps books.genre_ids, marks canonical set predefined (dry-run by default, --execute to apply, --local/--remote)
scripts/reading-news-stats.mjs - Read-only aggregate of most-read books/authors across all schools from D1 (wrangler --remote --json); feeds the `reading-news` skill's weekly newsletter (--limit N, --local)
scripts/test-api.js - API endpoint smoke tests
scripts/export-demo-snapshot.js - Export Learnalot data from remote D1 into demoSnapshot.js
