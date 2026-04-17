# Changelog

## [3.50.1] - 2026-04-17

### Fixed
- **Owner role guard no longer blocks unchanged-role owner edits** — the Edit User dialog echoed `role` in every PUT, which tripped the "Cannot change owner role" guard even when the field hadn't changed, blocking legitimate owner self-updates such as moving to a different school. The server now only runs the role-change guards when `role !== existingUser.role`, and the frontend only sends fields that actually changed. The Role dropdown is disabled for owner accounts in the dialog so the value can't drift, and failed PUTs now surface the real server error instead of pretending to succeed. Regression test added (`users.test.js`: "should allow other updates on owner when role echoed unchanged").

## [3.50.0] - 2026-04-17

### Changed
- **Book cover resolution moved entirely to the worker** — `BookCover` no longer depends on the client-side `BookCoverContext`/`useBookCover` hook (both deleted along with their tests). The component now renders `<img src="/api/covers/…">` directly, with an ISBN-first URL that falls through to a title+author search URL on image error, and finally to the gradient placeholder. All caching and provider fallback logic lives server-side. Removes 400+ lines of browser-state plumbing and eliminates a race where two components fetching the same book could double-populate localStorage.
- **Cloudflare Email Service as primary transactional provider** — `src/utils/email.js` now calls `env.EMAIL_SENDER.send({ from, to, subject, text, html })` using the plain-object API Cloudflare shipped in public beta on 2026-04-16. Resend is retained as a fallback that catches transient Cloudflare failures during the beta (a failed CF send logs the error and falls through to Resend; if both are unavailable the original CF error bubbles up instead of a generic "not configured" message). Drops ~50 lines of MIME construction, the `cloudflare:email` dynamic import, and the base64 body encoding. All five transactional flows (password reset, welcome, signup notification, support ticket, trial reminder) use the new unified `sendEmail` helper.

### Added
- **`/api/covers/search` endpoint** — new public route that resolves a cover from `title` + optional `author`. Normalises input (NFC → lowercase → trim → collapse whitespace), hashes for a stable R2 key, and chains OpenLibrary search → Google Books → Hardcover using the same provider adapters as metadata enrichment. Declared before `/:type/:key` so the literal "search" segment isn't interpreted as a cover type.
- **Google Books + Hardcover fallback for ISBN covers** — `/api/covers/isbn/{isbn}-M.jpg` no longer 404s the moment OpenLibrary has no record. On OpenLibrary miss it now consults the same Google Books and Hardcover providers we use for metadata enrichment, caches the winner in R2, and tags the serving source in logs for debuggability.
- **Differentiated cache headers for cover responses** — hits get `max-age=2592000` (30 days), misses get `max-age=3600` (1 hour). Previously every response used the 30-day header, so a book that was once unresolvable stayed cached-as-404 for a month even after metadata enrichment filled in its ISBN.
- **ISBN prop threaded through to `<BookCover>`** — `BookManager`, `ScanBookFlow`, `FullReadingView`, `SessionForm`, and `BookRecommendations` now pass `isbn` so the worker can serve the ISBN-keyed R2 entry directly instead of round-tripping through title/author search.
- **`src/__tests__/integration/covers.test.js`** — new suite covering both cover endpoints, the fallback chain order, cache-hit vs miss headers, and invalid input handling.

### Fixed
- **CF Email send failures no longer lose the user-facing error** — when only Cloudflare is configured and send fails, callers previously got `'Email service not configured'`; they now get the actual CF error message, which is what Sentry and support triage expected.
- **Prettier cleanup across nine test suites** — `BookManager`, `BookRecommendations`, `ClassAssignmentBanner`, `Login`, `StudentDetailDrawer`, `StudentInfoCard`, `StudentTable`, `StudentTimeline`, and `WelcomeDialog` test files had accumulated formatting drift; re-formatted to match `.prettierrc`. No behavioural changes.

## [3.49.0] - 2026-04-14

### Security
- **Google API key now sent via header, not URL query** — `fetchProviderModels` for Google Gemini was passing the key as `?key=…`, leaving it in proxy logs, browser history, and Referer headers. Switched to the `x-goog-api-key` header to match Anthropic/OpenAI handlers.
- **Plaintext fallback in `decryptSensitiveData` now logs a warning** — colon-less data is still returned as-is for backward compatibility, but each occurrence emits `console.warn` so Sentry surfaces fields that escaped encryption. Sets up a future fail-closed migration once production telemetry is clean.
- **Generic error message for failed book-import batches** — `confirmBatchImport` was forwarding raw D1 error text (UNIQUE constraint hints, table names) to authenticated clients. Now returns "Import batch failed. Please contact support." with the real error logged server-side only.
- **Defense-in-depth org scope on class soft-delete** — both UPDATE statements in `DELETE /api/classes/:id` now include `AND organization_id = ?`. The pre-existence check already blocked cross-org exploitation, but matching the defensive pattern used elsewhere costs nothing.

### Added
- **Per-org KV cache for tenant middleware** — new `src/utils/orgStatusCache.js` caches `(is_active, subscription_status)` in `READING_MANAGER_KV` with a 5-minute TTL. `tenantMiddleware` no longer hits D1 for the org-status lookup on every authenticated request. Stripe webhook handlers (`subscription.created/updated/deleted`, `invoice.paid/payment_failed`), `DELETE /api/organization/:id`, and `hardDeleteOrganization` all invalidate the cache so a missed event self-heals within five minutes.
- **Per-org sync lock for Wonde** — `runFullSync` accepts an optional KV binding via `options.kv` and acquires a `wondeSync:lock:${orgId}` key with a 10-minute TTL. Concurrent calls (cron + manual sync, or two webhook deliveries) for the same org skip cleanly with `status: 'skipped'` instead of racing through truncate/insert phases. Lock is released in `finally` and self-clears via TTL if the Worker dies.
- **Typed-DELETE confirmation for platform AI key removal** — `PlatformSettings.handleDeleteKey` now opens a Dialog requiring the user to type `DELETE` before the key is removed. Prevents misclick disasters where a single click would disable AI for every school relying on the platform key.
- **Badge-cron observability + 22s budget** — the 2:30 AM badge evaluation cron now logs per-org timing and bails out before the 30s Worker CPU limit. Remaining orgs defer to the next nightly run instead of silently truncating mid-evaluation. Final log line reports orgs processed, deferred, students touched, badges awarded, and total elapsed.
- **Focus restoration on `StudentDetailDrawer` close** — the drawer captures `document.activeElement` when opened and restores focus on close. Keyboard and screen-reader users no longer drop to `<body>`.
- **`QuickReadingView` book cell is keyboard-accessible** — the per-row "edit book" TableCell now has `role="button"`, `tabIndex={0}`, an `onKeyDown` handler for Enter/Space, an `aria-label` describing the action and current book, and a focus-visible ring. Previously a mouse-only target.
- **`AbortController` on the HomeReadingRegister class-sessions fetch** — the second useEffect was already wired up last cycle; the first one (the main register data fetch at `HomeReadingRegister.js:194-214`) was missed. Rapid class/date switches no longer race stale responses over fresher state.

### Fixed
- **Atomic organisation purge** — `hardDeleteOrganization` now executes its 26 cascade deletes plus the `data_rights_log` insert/cleanup and the anonymise UPDATE in a single `db.batch()`. Previously, a mid-purge D1 failure left the org tombstoned with partial data still resident — a GDPR failure mode. The function now throws on batch failure so callers can retry instead of falsely declaring the purge complete.
- **HomeReadingRegister silent refresh failures** — `refreshSessions` was catching `()=>{}`. After a save it'd leave the register stale with no signal. Now logs to Sentry-via-console and shows a warning Snackbar so volunteers know to retry.
- **Wonde `schoolApproved` silent fetchSchoolDetails failure** — escalated `console.warn` → `console.error` with the failing `school_id` so Sentry surfaces orgs that were created with null contact/address fields.
- **Stripe trial-ending email failure escalation** — same pattern; missed reminder emails now leave a Sentry-visible breadcrumb with the org and event IDs so ops can manually resend before the trial actually ends.

## [3.48.2] - 2026-04-14

### Changed
- **Hide class-assignment editor for Wonde-synced users** — the Edit button and empty-state prompt in User Management are now suppressed when the user has a `wonde_employee_id`. Their assignments are a pure reflection of `wonde_employee_classes` (rebuilt on every MyLogin login and nightly sync), so manual edits via the UI were wiped before they could be useful. Wonde users still see their assigned classes as read-only chips; empty-state copy now reads "Class assignments are synced from Wonde."

## [3.48.1] - 2026-04-14

### Changed
- **Month labels in Home Reading register** — Full view date headers now show a short month label ("Feb", "Mar", …) on the first column and at each month boundary, so long ranges like "Spring 2" are legible without hovering for a tooltip.

## [3.48.0] - 2026-04-14

### Added
- **Class assignments in User Management** — user detail dialog now shows each user's assigned classes (for all roles, including owner) and lets admins/owners edit them via multi-select. New `PUT /api/users/:id/classes` endpoint replaces assignments, validating every class belongs to the user's organization. Backed by the existing `class_assignments` table used at login. Wonde-synced users show a warning that the next sync will overwrite manual edits; manual schools (e.g. demo) persist.

### Fixed
- **Class auto-filter on login actually applied** — `pendingClassAutoFilter` was written to `sessionStorage.globalClassFilter` by DataContext but UIContext only read that key once at mount, so the teacher's class was never selected. Consumer moved into UIContext where it reacts to `classes` loading and updates React state via `updateGlobalClassFilter`. Email/password login also now sets `pendingClassAutoFilter`, matching SSO and demo flows.

## [3.47.1] - 2026-04-14

### Fixed
- **Nightly streak recalc no longer aborted by a single slow org** — wrapped each organization's block in `recalculateAllStreaks` in its own try/catch so a D1 timeout on one org's SELECT or batch UPDATE is recorded in the results and the cron continues with the remaining orgs (Sentry TALLY-READING-6). Also reduced per-batch work: session IN-clause chunks 50 → 25 and UPDATE batches 100 → 50.

### Changed
- Prettier cleanup across recent AI/org/settings changes — formatting only, no behaviour changes.

## [3.47.0] - 2026-04-13

### Added
- **AI toggle per school** — owner can enable/disable the AI add-on for any school directly from the school detail drawer, without requiring a Stripe webhook. Switch uses pessimistic updates with loading state.
- **Platform model selection** — Platform Settings now shows available models for the active AI provider with a dropdown to choose a default. Selected model is used for all schools on the platform key.

### Changed
- **AI resolution uses platform model** — when a school uses the owner-managed platform key, the AI service now uses the owner's selected model preference instead of falling back to provider defaults.

## [3.46.0] - 2026-04-13

### Added
- **Owner-managed AI keys** — new Platform tab in Settings for storing per-provider API keys (Anthropic, OpenAI, Google) with AES-GCM encryption. Schools with the AI add-on that haven't configured their own key automatically use the owner's platform key.
- **AI status in School Management** — school detail view and table now show whether each school uses its own AI key or the owner-managed platform key.

### Changed
- **AI key resolution** — recommendations now check platform keys before falling back to environment variables, with env vars kept as a transitional tertiary fallback.
- **Settings AI endpoint** — `GET /api/settings/ai` reports `keySource: 'platform'` when owner-managed keys are in use.

## [3.45.1] - 2026-04-13

### Fixed
- **Nightly badge evaluation failing** — badge engine queried `organization_id` on the `genres` table which doesn't have that column, causing every student's batch badge evaluation to silently fail at 2:30 AM UTC.

## [3.45.0] - 2026-04-12

### Added
- **3 new class goals** — Reading Days (distinct days the class has read), Active Readers (students who've read at least once this term), and Badges Earned (total badges across the class). Ordered for quick wins: readers and badges are achievable early, motivating the class before the harder goals kick in.
- **Granular garden progression** — garden now maps 7 states (0–6 goals completed) to progressive element visibility, so each goal completion visibly grows the garden rather than jumping between 4 stages.

### Changed
- **Stage calculation** — with 6 goals, garden stages now use broader bands (0–1 = seedling, 2–3 = sprout, 4–5 = bloom, 6 = full garden) instead of 1:1 mapping.
- **Goal ordering** — display and editor show quick-win goals first (Active Readers, Reading Days) before cumulative goals (Sessions, Badges, Genres, Books).

## [3.44.0] - 2026-04-12

### Changed
- **Watercolor garden header** — replaced hand-coded SVG garden with layered watercolor PNG illustrations generated via ComfyUI (DreamShaperXL Turbo + StorybookRedmond LoRA). Eight garden elements (wildflower, bush, sunflower patch, apple tree, butterfly, oak tree, robin) appear progressively as badges are earned.
- **Growing plant stages** — central plant evolves through four distinct watercolor images: tiny seedling, leafy sprout, pink bud, and full bloom, swapping at badge thresholds for a tangible sense of growth.
- **Dynamic ground and sky** — CSS gradient ground transitions from bare earth to lush grass, sky warms from cream to green as the garden fills.
- **CSS transitions** — all garden elements fade in with scale/opacity transitions for smooth reveals.

## [3.43.2] - 2026-04-11

### Changed
- **Watercolor icon set refresh** — regenerated all seven bottom navigation icons as a cohesive hand-painted watercolor set (Juggernaut-XL + StorybookRedmond LoRA via ComfyUI). New concepts: children reading together (Students), apple on book (School Reading), girl in hammock (Home Reading), notebook with bar chart (Stats), gift-wrapped book (Recommend), row of spines (Books), brass cog (Settings).
- **New settings icon** — replaces the flat MUI `SettingsIcon` fallback with a matching watercolor `icon-settings.png` so the full nav set shares one visual language.
- **Nav icon size** — bumped from 28px to 36px in `BottomNavigation` for better presence at tablet sizes.

## [3.43.1] - 2026-04-09

### Fixed
- **Tour re-triggering on every login** — race condition where the guided tour auto-started before completion status was fetched from the API, causing it to replay on every login
- **Abort controller leaks** — added `AbortController` cleanup to `useEffect` fetches in BookRecommendations, HomeReadingRegister, and SessionForm to prevent state updates on unmounted components
- **ClassGoalsEditor error handling** — added missing `catch` block and user-facing error alert for failed goal saves

### Security
- **Input validation hardening** — stricter validation across auth, student, book, and billing routes (audit follow-up)
- **Encryption key separation** — `ENCRYPTION_KEY` env var for AES-GCM operations, falling back to `JWT_SECRET`
- **Route parameter validation** — tighter checks on IDs, pagination, and query params across API routes

### Changed
- **Accessibility improvements** — added `aria-label` and `role` attributes to BookCoverPlaceholder, BadgeCelebration dialog, HomeReadingRegister status cells, BookAutocomplete scan button, and StudentList search clear button
- **Reduced motion support** — confetti animation in ClassGoalsDisplay respects `prefers-reduced-motion`
- **DataContext optimizations** — `updateStudent` and `updateStudentClassId` use functional state updates to avoid stale closure dependencies

## [3.43.0] - 2026-04-08

### Added
- **Collaborative class goals** — teachers set class-wide reading targets (sessions, genres explored, unique books) with auto-generated defaults based on class size. Goals track collectively across the class per half-term.
- **Classroom display mode** — fullscreen dark-theme projection view for interactive whiteboards with large progress bars, class garden illustration, and confetti celebrations when goals are reached. Auto-refreshes every 30 seconds.
- **Class garden evolution** — garden stage (seedling, sprout, bloom, full garden) progresses as goals are completed, reusing the existing GardenHeader component with new stage/label props.
- **Goal completion celebrations** — toast notifications with confetti when a reading session tips a class goal over its target, sequenced after badge celebrations.
- **E2E test suite overhaul** — 62 Playwright tests (up from 25). New test files for landing page, school reading, student detail, stats page, and comprehensive quick reading view coverage. Fixed 8 stale tests caused by WelcomeDialog blocking and UI changes.

### Changed
- **GardenHeader** — accepts optional `stage` and `label` props, allowing reuse for class goals alongside individual student badges.
- **Session API responses** — `POST` and `PUT` on sessions now return `completedGoals` array alongside existing `newBadges`.
- **Nightly cron** — 2:30 AM job now recalculates class goal progress (drift correction) after badge evaluation.

## [3.42.2] - 2026-04-08

### Security
- **Hardcover API auth** — requests now routed through `fetchWithAuth` instead of reading JWT directly from localStorage, centralising auth handling and token refresh
- **Password reset script** — email input validated against regex; SQL written to temp file instead of shell string interpolation to prevent injection

### Fixed
- **Timezone chart dates** — `ReadingTimelineChart` date range replaced `toISOString().split('T')[0]` with `toLocaleDateString('en-CA')` to prevent BST date shift
- **Version sync** — `APP_VERSION` in worker.js now matches package.json
- **Landing page performance** — `LandingPage` lazy-loaded via `React.lazy()` so screenshot assets are deferred until needed
- **README** — updated repo name, folder path, and dev server port (3001)

### Changed
- **Webhook tests** — mocked `fetchSchoolDetails` to eliminate live `api.wonde.com` DNS noise during test runs
- **Hardcover tests** — updated to use injectable mock fetch instead of `global.fetch` + localStorage

## [3.42.1] - 2026-04-08

### Security
- **Hono** updated to 4.12.12 — fixes cookie name bypass, IP matching, serveStatic middleware bypass, and path traversal in toSSG
- **Vite** updated to 7.3.2 — fixes arbitrary file read via WebSocket, `server.fs.deny` bypass, and path traversal in optimized deps
- **SQL LIKE escaping** — backslash characters now escaped before `%` and `_` wildcards in book recommendation and genre filter queries
- **GitHub Actions** — added explicit `permissions: contents: read` to restrict GITHUB_TOKEN scope

## [3.42.0] - 2026-04-08

### Added
- **Organization cascade hard delete** — `DELETE /api/organization/:id/purge` endpoint permanently deletes all org data across 26 tables in FK-safe order, then anonymises the org row as a tombstone; requires owner role and org name confirmation
- **Automated org purge in cron** — nightly 2 AM job now cascade-purges orgs inactive for 90+ days (replaces naive single-row delete that left orphaned data)
- **Legal hold** — `legal_hold` column on organizations prevents both automated and manual data purging
- **Achievements tab** — class-wide badge progress view with expandable per-student drill-down on the Stats page
- **Badge summary endpoint** — `GET /api/badges/summary` returns class-wide badge counts and per-student breakdowns
- **Badge indicators on student cards** — compact badge count chips displayed alongside streak badges

### Fixed
- **Audit log retention** — hard delete threshold corrected from 1 year to 2 years per GDPR retention policy

### Changed
- **GDPR retention policy** — updated to reflect org hard delete, audit log purge, and legal hold as implemented; fixed stale `reading_streaks` table reference

## [3.41.1] - 2026-04-07

### Added
- **AI model dropdown** — AI settings now shows a dropdown of available models; entering an API key and moving focus automatically fetches the live model list from the provider. Returns to the live list when revisiting settings with a saved key.

### Fixed
- **Anthropic 401 → logout** — Anthropic SDK's `AuthenticationError` (status 401) was propagating to the client, causing `fetchWithAuth` to clear auth state and log the user out; replaced SDK with direct `fetch` so errors surface as 500 without triggering logout
- **Gemini timeout** — AI recommendation requests using `gemini-2.5-flash` (a reasoning model) timed out after 10 s; timeout raised to 28 s (just under Cloudflare's 30 s subrequest cap)
- **Null model passed to providers** — when `model_preference` is `null` in the database, explicit `null` bypasses JS default parameters; providers now resolve the model at runtime with `model || 'default'`
- **Stale key when switching AI provider** — switching provider dropdown without entering a new key left the old key in the database (e.g. a Gemini key used for Anthropic requests); the backend now clears the stored key and disables AI when the provider changes without a new key being supplied

## [3.41.0] - 2026-04-07

### Added
- **Badge & achievement system** — 18 reading badges across 5 categories (Streak, Volume, Variety, Consistency, Milestone) with tier progression (Bronze/Silver/Gold/Platinum), garden-themed UI, celebration dialog on unlock, and near-miss progress bars
- **Single-book metadata enrichment** — "Get Details" in the book edit dialog now calls the server-side cascade engine (Hardcover → Google Books → OpenLibrary), stores covers in R2, and returns description/genres; no longer makes direct browser-to-provider API calls
- **Contact form on landing page** — replaces newsletter signup; submissions go to the support ticket system with `source: 'contact_form'`
- **AI add-on gating** — AI book recommendations are gated behind either an active AI add-on subscription or a user-supplied API key; fallback message shown when neither is configured

### Fixed
- **Hardcover proxy key lookup** — `/api/hardcover/graphql` now reads the API key from `metadata_config` (encrypted) instead of the legacy `org_settings.bookMetadata` row
- **Leaked API key in demo snapshot** — `demoSnapshot.js` had real Google Books and Hardcover API keys embedded; both scrubbed to empty strings
- **Demo snapshot export strips API keys** — `export-demo-snapshot.js` now redacts `googleBooksApiKey` and `hardcoverApiKey` from `org_settings` rows before writing the snapshot

### Security
- **API key exposure remediation** — Google Books and Hardcover keys were committed in `demoSnapshot.js` (commit `2dde6e0`); keys rotated, snapshot scrubbed, export script patched

### Changed
- **Stripe pricing** — base plan updated to £199/yr, AI add-on £49/yr

## [3.40.0] - 2026-04-07

### Added
- **Demo environment** — public "Try the demo" button on landing page with demo login, hourly data reset, capped AI recommendations (3/hr), and auto-class-select on login

### Fixed
- **Multi-day reading record cleanup** — changing a student's reading status (e.g. from "3 days" to "Absent") now correctly removes backfilled sessions on previous days; tagged with `[BACKFILL]` to avoid destroying independently recorded sessions

## [3.39.0] - 2026-04-04

### Added
- **Book enjoyment feedback on School Reading** — thumbs up/down buttons appear next to the notes icon when a book is selected; on save, the student's likes/dislikes are updated for AI recommendations

## [3.38.1] - 2026-04-04

### Fixed
- **Stats tiles clickability** — Students and Sessions tiles are now plain (non-clickable) since they can't navigate cross-page; only Avg/Student and Never Read show click affordance

## [3.38.0] - 2026-04-04

### Added
- **Most Liked / Least Liked book cards** on Stats overview — top 5 books ranked by student feedback count, aggregated from likes/dislikes across the organisation
- **Clickable stats tiles** — Avg/Student navigates to Reading Frequency tab, Never Read navigates to Needs Attention tab

### Fixed
- **Stats threshold mismatch** — backend stats defaulted to 3/7 day thresholds vs frontend 14/21; aligned to 14/21 so Overview and Needs Attention counts agree

### Removed
- **School/Home location toggle** on School Reading session form — sessions now always record as school
- **Sorting dropdown** on Students page — column headers already handle sorting

## [3.37.3] - 2026-04-04

### Fixed
- **Support ticket tile counts** — ticket list API now filters out tickets with unexpected statuses (e.g. `closed` from direct DB edits), so "All" count matches the sum of Open + In Progress + Resolved

## [3.37.2] - 2026-04-04

### Changed
- **AI recommendations use year group** — when a student has no reading level set, the recommendation prompt now includes their UK year group (from Wonde sync) to derive approximate age, giving the AI meaningful context instead of fully generic suggestions

## [3.37.1] - 2026-04-04

### Fixed
- **UTC date defaults** — replaced `toISOString().split('T')[0]` with timezone-aware date helpers across session creation, session editing, stats filtering, and organisation stats; prevents wrong-day writes around BST/DST transitions
- **Reading status drift** — `getReadingStatus()` in both helpers.js and UIContext now compares calendar date strings instead of raw timestamps, eliminating DST drift near midnight
- **Version drift** — `APP_VERSION` synced with package.json; stale `subscription_tier` reads/writes removed from auth, organisation, and row mapper code
- **Dialog heading hierarchy** — BookRecommendations preferences dialog no longer nests `<h6>` inside `<h2>`, fixing invalid HTML for screen readers

### Changed
- **Recommendation sampling** — replaced `ORDER BY RANDOM()` in D1 queries with two-phase ID sampling (fetch IDs, Fisher-Yates shuffle in JS, fetch full rows); eliminates full-table random sort as catalogue grows
- **MUI Grid v2 migration** — BookManager and BookEditDialog migrated from deprecated `item`/`xs`/`sm` props to Grid v2 `size` prop

## [3.37.0] - 2026-04-02

### Added
- **Book feedback on recommendations** — "Read it?" thumbs up/down on recommendation tiles lets teachers record student likes and dislikes, feeding into future AI suggestions
- **Student feedback endpoint** — dedicated `PUT /api/students/:id/feedback` for lightweight likes/dislikes updates without full student validation
- **Wonde school listing** — owner-only `GET /api/wonde/schools` shows all Wonde schools (approved, pending, declined) with connection status
- **Wonde sync-all** — `POST /api/wonde/sync-all` triggers full sync across all connected schools in one action
- **Wonde approve school** — `POST /api/wonde/approve/:wondeId` onboards a pending school from the admin panel
- **School table Wonde status** — school management table shows Wonde connection status with filter and sync-all button

### Fixed
- **Book rating 400 error** — thumbs up/down no longer sends full student object through reading level validation; uses dedicated feedback endpoint instead

## [3.36.1] - 2026-04-02

### Security
- **CSP for frontend** — added Content-Security-Policy header on static asset responses to limit XSS blast radius
- **AI inLibrary org-scoped** — recommendation "in library" checks now join `org_book_selections` so books from other orgs are not leaked across tenants
- **Book endpoint limits clamped** — paginated list and search endpoints now enforce 1–100 range on page sizes

### Fixed
- **Webhook slug collision** — Wonde `schoolApproved` webhook now checks slug uniqueness and auto-increments, preventing onboarding failures for same-named schools

## [3.36.0] - 2026-04-02

### Added
- **Cost endpoint rate limiting** — AI suggestions (10/min), metadata enrichment (5/min), Hardcover proxy (30/min) now rate-limited to prevent abuse of paid external APIs
- **Separate encryption key support** — new `ENCRYPTION_KEY` env var for AES-GCM encryption, decoupled from `JWT_SECRET` (backward compatible)
- **Stripe trial ending email** — `customer.subscription.trial_will_end` webhook now emails the school admin 3 days before trial expiry
- **Enrichment polling hook** — extracted `useEnrichmentPolling` shared hook from BookMetadataSettings and MetadataManagement, eliminating duplicate polling logic
- **Chart student limits** — ReadingFrequencyChart and DaysSinceReadingChart now show top 30 students by default with "Show all" toggle

### Security
- **SSO role elevation blocked** — MyLogin callback no longer auto-elevates user roles from IdP; demotions allowed, elevations require manual admin action
- **Hardcover GraphQL proxy hardened** — comments stripped before mutation/subscription check to prevent bypass
- **CORS null origin fix** — `null` returned explicitly instead of `undefined` for no-origin requests
- **Support ticket auth** — POST endpoint now uses `requireReadonly()` middleware instead of manual JWT check
- **Book import restricted to admin** — import preview/confirm endpoints upgraded from `requireTeacher()` to `requireAdmin()`
- **Audit log org-scoped** — GDPR export now filters audit entries by organization
- **Student ID removed from errors** — generic "Student not found" messages prevent ID enumeration
- **Tour ID validation** — max 50 chars, alphanumeric with hyphens enforced
- **Session book org check** — reading session creation now verifies book belongs to the student's organization

### Fixed
- **SSO callback token waste** — removed dead access token generation; frontend retry with backoff on refresh
- **SQLite bind limit** — AI suggestions and library search now chunk readBookIds in groups of 400
- **Wonde sync atomicity** — employee-class DELETE included in first INSERT batch for atomic execution
- **Registration slug race** — TOCTOU handled with retry on UNIQUE constraint violation, max 100 iterations
- **D1 batch success check** — removed misleading per-item check; D1 batches are all-or-nothing
- **Stats timezone** — week/day calculations now use org timezone from settings instead of UTC
- **CSV BOM handling** — UTF-8 BOM stripped before parsing Excel-generated CSVs
- **LIKE wildcard escaping** — `%` and `_` in book dislikes properly escaped
- **Metadata JSON.parse** — guarded with try/catch and default fallback provider chain
- **Term date overlap** — changed `<=` to `<` to allow back-to-back terms
- **Org search min length** — 2-character minimum enforced to prevent expensive single-char LIKE queries
- **Settings save state** — Save button disabled during save with "Saving..." label
- **SupportTicketManager errors** — all catch blocks now surface errors via dismissible Alert
- **DpaConsentModal ARIA** — added `role="alertdialog"` and `aria-describedby` for screen readers
- **SettingsPage lazy rendering** — tab components now mount on demand instead of all 8 eagerly on page load
- **Slug generation guard** — registration slug loop capped at 100 iterations
- **Token expiry comment** — documented D1/Worker clock skew defense-in-depth
- **OAuth state cleanup** — removed probabilistic `Math.random()` cleanup; cron is sufficient
- **Streak timezone warning** — invalid timezone fallback now logged
- **Batch student import dedup** — duplicate names within a single import batch now detected
- **User deactivation cleanup** — class_assignments now deleted on soft-delete
- **Email transfer encoding** — HTML part uses base64 instead of 7bit for safe non-ASCII handling

### Changed
- **LandingPage refs** — IntersectionObserver refs changed from array to Set for O(1) dedup
- **BookManager reading levels** — `getUniqueReadingLevels()` wrapped in useMemo
- **BookManager error display** — removed duplicate error Alert
- **BulkImport self-dedup** — names deduplicated before import
- **OpenLibrary subjects** — meta-subjects filtered out (Accessible book, Protected DAISY, etc.)
- **Hardcover catch blocks** — empty catches now log debug messages
- **Dead code removed** — `formatSuccessResponse`, `formatErrorResponse`, `updateLastReadDate`, `defaultProvider`, unused Login imports, dead `fetchOrganizations`, MUI v7 wrapper slot, unused Rsbuild define
- **uuid moved to devDependencies**, node-fetch added as devDependency
- **CLAUDE.md updated** — stale file refs fixed, `ENCRYPTION_KEY`/`SENTRY_DSN`/Stripe secrets documented

## [3.35.1] - 2026-04-01

### Security
- **Webhook secret moved to header** — Wonde webhook auth now uses `X-Webhook-Secret` header instead of URL query parameter, preventing secret leakage in logs and analytics
- **Custom request logger** — replaced Hono `logger()` with custom middleware that only logs pathname, stripping query parameters from log output
- **Password change max length** — added 128-character limit on password change endpoint, matching register and reset endpoints
- **Environment key disclosure removed** — email utility no longer logs environment variable names when no provider is configured
- **AI response log truncation** — raw AI response error logs now truncated to 200 characters to prevent sensitive data leakage
- **SELECT \* eliminated** — user update endpoint now uses explicit column list, no longer loading password hashes into memory
- **Genre mutations restricted to owner** — POST/PUT/DELETE genre operations now require owner role instead of admin, preventing cross-org genre pollution

### Fixed
- **Owner cross-org user lookup** — `GET /api/users/:id` now correctly bypasses organization filter for owner role, matching the PUT handler behaviour
- **Organization slug auto-increment** — org creation now auto-increments slug on collision instead of returning 409, matching registration behaviour
- **MyLogin logout null guard** — logout endpoint no longer crashes if D1 binding is unavailable

## [3.35.0] - 2026-04-01

### Added
- **Subscription access control (Phase 7)** — `subscriptionGate()` middleware gates API access based on billing status: `past_due` schools get read-only access, `cancelled` schools are fully blocked with a branded full-screen message, owner role always exempt
- **Subscription status endpoint** — `GET /api/billing/subscription-status` for all authenticated roles, enables proactive frontend detection of billing blocks
- **SubscriptionBlockedScreen** — role-aware blocked screen (admins see "Manage Billing" button, teachers see "contact your administrator")
- **PDF stats report** — "Download Report" button on Stats page generates a branded A4 PDF with summary metrics, activity breakdown, streaks, top readers, most read books, and needs-attention list
- **Composite index** — `wonde_employee_classes(organization_id, wonde_employee_id)` for faster teacher login queries
- **E2E tests** — 6 Playwright tests for subscription access control

### Fixed
- **Stripe status normalization** — webhook handler now normalises American spelling `canceled` to British `cancelled` for consistency
- **setTimeout memory leak** — StudentTable.js timer now cleaned up on unmount
- **Organization name missing for teachers** — auth responses now merge organization info into user state so `organization.name` is available for all roles
- **Accessibility** — focus-visible outlines on priority cards, colour contrast fixes on StreakBadge and Header version badge, aria-live region for recommendations loading, heading semantics in WelcomeDialog, aria-label on StreakBadge

### Changed
- **ReadingStats split** — extracted OverviewTab, NeedsAttentionTab, FrequencyTab, StreaksTab (1,284 → 391 lines)
- **BookManager split** — extracted BookEditDialog, BookExportMenu, bookImportUtils (1,349 → 807 lines)
- **HomeReadingRegister split** — extracted QuickReadingView, FullReadingView, MultipleCountDialog, homeReadingUtils (2,041 → 954 lines)

## [3.34.0] - 2026-03-31

### Added
- **Centralised metadata ownership** — owner-only metadata config, multi-provider cascade engine (OpenLibrary, Google Books, Hardcover), batch enrichment with job tracking
- **Background enrichment** — cron-triggered metadata enrichment at 4 AM UTC, processes up to 200 books per run with provider rate limiting
- **Owner metadata management UI** — provider configuration, global enrichment controls, job history panel
- **Simplified admin metadata view** — enrichment status display with Fill Missing button

### Fixed
- **DST clock-change bug in Home Reading Register** — multi-day session buttons (2/3/4/+) only recorded sessions for today and one previous day during BST; caused by `toISOString()` shifting dates when converting local midnight to UTC, and fetch range not covering backward days
- **Worker timeout during metadata enrichment** — batch processing now respects wall-clock safety limits
- **Enrichment polling auto-resume** — polling restarts when returning to the metadata page

## [3.33.5] - 2026-03-31

### Added
- **Quick view tour for Home Reading** — 3-step tour covering recent history columns, record reading buttons (✓/2/3/4/+/A/•), and the book selector; auto-starts when the Quick view loads with students
- Compass button now shows the tour matching the current view mode (Quick or Full)

## [3.33.4] - 2026-03-31

### Fixed
- **Home reading tour compass in Quick view** — clicking the compass now auto-switches to Full view before starting the tour, so the tour always works regardless of which view mode is active

## [3.33.3] - 2026-03-31

### Fixed
- **Tour system: prevent false completions** — `startTour` now verifies all step targets exist in the DOM before starting; tours no longer silently cycle through missing targets and mark themselves as permanently complete
- **Tour completion guard** — `TOUR_END` handler only marks a tour as complete if at least one tooltip was actually shown to the user
- **Tour version bump** — home-reading and recommendations tours bumped to v2 so users who had them wrongly marked complete at v1 will see them again

### Added
- **Tour reset endpoint** — `DELETE /api/tours/:tourId/complete` allows resetting a tour so it can be replayed

## [3.33.2] - 2026-03-31

### Fixed
- **Home reading tour not triggering** — tour targets only exist in full register view; tour now waits for full view mode before auto-starting

### Added
- **Recommendations tour** — 5-step guided tour covering student selection, profile bar, focus mode, library results, and AI suggestions; auto-starts on first use once results load
- **AI hint for unconfigured schools** — subtle banner shown after library results when no AI key is configured, letting teachers know the feature exists

## [3.33.1] - 2026-03-30

### Fixed
- **Login page SSO prominence** — MyLogin SSO button promoted to primary position above email/password when SSO is enabled; email/password fields demoted below divider with outlined Login button
- **Error messages** — removed internal Wonde IDs from school-not-found error; friendlier wording for `no_school` and `school_not_found` cases

## [3.33.0] - 2026-03-30

### Added
- **Role-based tab visibility** — teachers and readonly users now see 5 tabs (Students, School Reading, Home Reading, Stats, Recommend); Books and Settings hidden for non-admin roles
- **Welcome dialog** — one-time first-login dialog for teachers showing class name, student count, and feature overview; amber fallback variant when classes aren't linked yet
- **Class assignment banner** — persistent warning banner for teachers with no linked classes; dismissible per session, reappears until classes are assigned

### Changed
- **Bottom navigation** — refactored from hardcoded tabs to data-driven `visibleTabs` array filtered by user role
- **Header** — `currentTab` prop changed from numeric index to string label; removed `TAB_NAMES` constant

## [3.32.4] - 2026-03-29

### Changed
- **Landing page screenshots** — replaced all 6 screenshots with fresh captures from the live app (Learnalot School), now at iPad 4:3 aspect ratio (2048×1536 @2x retina)
- **Home reading messaging** — renamed "Class register" showcase to "Home reading" with headline "Save 10 minutes per class, every day"; replaced "Priority reading list" feature card with "Home reading without the hassle" emphasising time savings
- **Book count** — updated from "2,000+ books" to "2,400+ books" to reflect current library size

## [3.32.3] - 2026-03-27

### Changed
- **Home Reading Quick view layout** — reordered columns to History | Student | Buttons | Book; added 3 previous-day history columns on the left so teachers can see recent reading context at a glance
- **Recording buttons** — moved to right of student name for closer proximity; removed oversized sticky cell

### Added
- **Custom count button (+)** — restored the + button in Quick view for entering a custom number of reading sessions

### Fixed
- **BookRecommendations class filter** — prioritized students carousel now respects the global class filter

## [3.32.2] - 2026-03-27

### Fixed
- **Touch hover states** — StudentCard and PrioritizedStudentsList hover transforms now guarded with `@media (hover: hover) and (pointer: fine)` to prevent sticky states on iPads
- **Settings tab keys** — SettingsPage tabs use stable `tab.label` key instead of array index (prevents wrong tab after permission changes)
- **Dialog sizing** — DataManagement confirmation dialogs now properly constrained with `maxWidth="sm" fullWidth`
- **Stray prop** — removed empty `sx={{}}` on skip-to-content link

## [3.32.1] - 2026-03-27

### Changed
- **AppContext split** — decomposed the monolithic 1888-line `AppContext.js` into three domain-specific contexts:
  - `AuthContext` (744 lines) — auth tokens, user, login/logout, `fetchWithAuth`, permissions, org switching
  - `DataContext` (1078 lines) — students, classes, books, genres, settings, all CRUD operations
  - `UIContext` (243 lines) — class filter, priority list, reading status, tours
- **All 38 components** migrated from `useAppContext()` to domain-specific hooks (`useAuth()`, `useData()`, `useUI()`)
- **8 test files** updated with domain-specific mock patterns
- **Re-render reduction** — auth changes no longer re-render data consumers; filter changes no longer re-render auth consumers; data mutations no longer re-render settings consumers

## [3.32.0] - 2026-03-27

### Changed
- **WCAG text contrast** — darkened `text.secondary` from `#7A7A7A` to `#666666` (4.7:1 ratio on cream background, AA compliant)
- **Theme color normalization** — replaced 130+ hard-coded hex colors across 29 components with theme palette tokens; ReadingStats (48→0), SupportTicketManager (25→0), StudentDetailDrawer (15→0)
- **On-brand stats page** — remapped Tailwind-style blues/pinks/oranges to Cozy Bookshelf palette (sage, warm brown, muted teal)
- **MyLogin button** — replaced off-brand green (`#00D37F`) with sage green primary
- **Status chip consistency** — all restricted/error/warning chips now use `status.*` and `rgba()` tints instead of arbitrary hex
- **ErrorBoundary redesign** — branded card with reassuring copy, "Go to Home" button, and admin contact suggestion
- **Skip-to-content link** — now appears as a styled branded pill centered at top of viewport on focus

### Added
- **Semantic accent tokens** — `palette.accent.*` for streaks (`streak`, `streakLight`), awards (`gold`, `goldLight`), school/home locations, and muted placeholder text
- **Reduced motion support** — global `prefers-reduced-motion` override via `MuiCssBaseline`, plus specific overrides on `MuiCard`, `MuiButton`, `MuiBottomNavigationAction` hover/active transforms (WCAG 2.3.3)
- **Focus indicators** — visible `focus-visible` outline rings on TourTooltip buttons (Back, Skip, Next, Close)
- **Lazy loading** — `loading="lazy"` on BookCover images and landing page screenshots
- **Aria-labels** — contextual labels on UserManagement action buttons, Header school-switcher chip, TourTooltip close button, landing page footer logo

### Fixed
- **Heading hierarchy** — TermsOfService, PrivacyPolicy, CookiePolicy now use proper h1→h2→h3 sequence via `component` prop
- **Landing page keyboard access** — footer logo now has `role="button"`, `tabIndex`, `onKeyDown`, and `aria-label`
- **Landing page touch targets** — sign-in button increased to 44px minimum height
- **PrioritizedStudentsList performance** — filtering logic wrapped in `useMemo` to prevent re-computation on every render

## [3.31.0] - 2026-03-27

### Added
- **Live book search** — BookAutocomplete now searches OpenLibrary as you type (after 3+ characters), showing external results below local library matches with a "From OpenLibrary" separator
- **External search API** — new `GET /api/books/search-external` endpoint proxies OpenLibrary title search server-side with normalized results (title, author, ISBN, publication year)
- **Metadata pass-through** — selecting an external search result creates the book with author, ISBN, and publication year pre-populated, eliminating the need to fetch details later

## [3.30.0] - 2026-03-26

### Added
- **Quick Entry view** for Home Reading Register — per-row action buttons (read, 2/3/4 days, absent, no record, clear) next to each student name for fast daily recording without needing to select a student first
- **View toggle** — Quick/Full toggle switches between the streamlined single-date view and the existing multi-day register

## [3.29.0] - 2026-03-26

### Added
- **Per-page onboarding tours** — auto-show on first visit with 3-5 steps per page highlighting key UI elements (Students, Session Form, Home Reading Register, Reading Stats)
- **Tour completion tracking** — server-side per-user tracking via `user_tour_completions` table (migration 0041) so tours don't repeat across devices
- **Compass replay button** — floating `ExploreOutlined` icon (bottom-right) lets users replay page tours; pulses gently when tour unseen
- **Glassmorphism tour tooltip** — frosted glass tooltip with sage green accents, progress dots, Back/Next/Skip/Done controls with 48px touch targets
- **Tours API** — `GET /api/tours/status` and `POST /api/tours/:tourId/complete` for completion persistence with versioning support

### Changed
- **Priority reading cards** — smaller and more compact (4 columns, reduced padding, removed total sessions row, short date format)
- **Priority List tour target** — spotlight targets the header row instead of the entire container

### Fixed
- **Bulk Input / Add Student buttons** — now hidden on Wonde-connected schools (detected via `classes.some(cls => cls.wondeClassId)`)

## [3.28.0] - 2026-03-25

### Added
- **Unified student detail drawer** — replaces the two separate dialogs (sessions + profile) with a single slide-in drawer featuring a header bar with demographic chips, a preferences sidebar, and a compact session timeline
- **StudentTimeline** — vertical timeline view of reading sessions with click-to-expand, inline edit/delete, and colour-coded assessment pills
- **StudentReadView** — read-only sidebar showing favourite genres, liked/disliked books, and reading stats at a glance
- **StudentEditForm** — reusable edit form (name, class, reading level, genres, likes/dislikes, AI opt-out) used in both the drawer and book recommendations
- **calculateAge utility** — shared age calculation from date of birth for demographic display

### Changed
- **Student table** — removed Actions column; clicking a row now opens the detail drawer directly
- **Student card** — removed profile icon button; card click opens the detail drawer
- **Book recommendations** — preferences editing now uses the extracted StudentEditForm in a dialog

### Removed
- **StudentSessions dialog** — replaced by the drawer's session timeline panel
- **StudentProfile dialog** — replaced by the drawer's read-only view and edit mode
- **Delete student action** — removed as it's dangerous for Wonde-synced schools

## [3.27.0] - 2026-03-25

### Added
- **Student demographics from Wonde** — sync date of birth, gender, first language, and detailed EAL status (migration 0040)
- **Student profile demographics** — read-only "Student Details" section showing age, gender, first language, and EAL status on the student profile modal
- **AI recommendation context** — student age (calculated from DOB, not raw date for privacy), gender, first language, and EAL status included in recommendation prompts

### Fixed
- **School management filters** — selecting any filter then changing to another no longer gets stuck showing empty results. Fixed `hasErrors` filter (was treating all string values as truthy) and `syncStatus` value mismatch (`synced` → `recent`)

## [3.26.0] - 2026-03-25

### Added
- **School Management redesign** — replaced form+table layout with full-width data table and side drawer, supporting thousands of schools
- **Server-side pagination** on `GET /api/organization/all` — page, pageSize (max 100), search (name/town), source/billing/sync filters, column sorting, error aggregation
- **Student/class counts** — subqueries on organization listing for drawer display
- **Sync error detection** — last sync error surfaced from `wonde_sync_log` per organization
- **SchoolTable component** — searchable, filterable, sortable data table with skeleton loading, pagination controls, and error row highlighting
- **SchoolDrawer component** — read-only detail view (contact, address, billing, Wonde cards) with edit mode, deactivate dialog
- **SchoolReadView component** — read-only cards for school detail display in drawer
- **SchoolEditForm component** — edit/add form with sticky save bar and Wonde token field

### Changed
- **SchoolManagement.js** rewritten from 543-line monolith to container component orchestrating table + drawer
- **Error responses** in `users.js` and `organization.js` converted from inline `c.json({ error })` to centralized error constructors (`notFoundError`, `badRequestError`, `forbiddenError`)
- **Error handler** now includes backward-compatible `error` field alongside `message` in response

### Fixed
- **Stripe price IDs** — corrected to use production account (FvBYcaukPX) instead of sandbox
- **Billing setup error handling** — added try/catch around Stripe API calls
- **Owner org override** — uses `body.organizationId` instead of header which `fetchWithAuth` overwrites

## [3.25.2] - 2026-03-24

### Added
- **Wonde sync button** on school management table — triggers data sync and fetches school contact details (owner only, Wonde-connected schools)
- **Start Trial button** on school management table — provisions Stripe customer and 30-day trial for schools without a subscription
- **Billing status column** on school management table — shows subscription status chip per school
- **Owner-only sync endpoint** — `POST /api/wonde/sync/:orgId` syncs data and updates school contact fields from Wonde

## [3.25.1] - 2026-03-24

### Added
- **School contact/address fields** — contact email, billing email, phone, address (line 1, line 2, town, postcode) on organizations
- **Wonde auto-population** — school details fetched from Wonde API during `schoolApproved` webhook and stored on the organization
- **SchoolManagement form** — all contact and address fields viewable and editable by owner
- **Stripe customer address** — billing setup passes school address and phone to Stripe for UK invoice compliance
- **Email fallback chain** — billing email resolves: explicit → org billing_email → org contact_email → admin user email

## [3.25.0] - 2026-03-24

### Added
- **Stripe billing integration** — webhook endpoint for subscription lifecycle events with signature verification and event deduplication
- **Billing routes** — setup customer/subscription, billing status, Stripe Customer Portal redirect, plan change (monthly/termly/annual), owner billing overview
- **BillingBanner component** — shows trial countdown, overdue warnings, and cancellation alerts for admin+ users
- **BillingDashboard component** — owner-only tab on Settings page with filterable school billing table, AI add-on indicator, and Stripe dashboard links
- **AI add-on support** — £20/month add-on tracked as second subscription line item, synced via webhooks
- **Database migration (0038)** — billing columns on organizations, billing_events audit table with indexes

### Changed
- **Removed subscription tier UI** — legacy tier dropdown and display removed from SchoolManagement; column nulled in migration
- **Stripe price IDs** added to wrangler.toml environment variables

## [3.24.0] - 2026-03-22

### Security
- **MyLogin role synced on every login** — users demoted in MyLogin (e.g. admin → teacher) no longer retain elevated Tally privileges; role changes are logged
- **Refresh token reuse detection** — if a revoked token is presented (indicating theft), all tokens for that user are immediately revoked
- **Rate limiting fails closed** on auth endpoints when D1 is unavailable, preventing brute-force during outages
- **Auth middleware added** to `GET /settings`, `POST /settings`, `POST /settings/ai`, `GET /organization`, `GET /organization/stats`, `GET /organization/settings`, `GET /organization/ai-config`
- **Webhook response no longer leaks internal org ID** — returns `{ success: true }` only
- **GraphQL proxy rejects mutations/subscriptions** — only read-only queries forwarded to Hardcover API
- **HTML email URLs escaped** — `resetUrl` and `loginUrl` now use `escapeHtml()` in href attributes
- **SQL lockout duration parameterized** — no longer uses template literal in SQL query
- **Genre ID LIKE patterns escaped** — prevents wildcard injection via `%` and `_` characters
- **Ownership check fails closed** (503) instead of silently allowing requests on DB error
- **Deep prototype pollution check** — `validateSettings` now recursively checks nested objects
- **Max password length enforced** (128 chars) on register and reset-password to prevent PBKDF2 DoS
- **Server-generated IDs only** — `POST /students`, `/classes`, `/genres` no longer accept client-provided IDs

### Fixed
- **POST /books and /books/bulk now link to organization** — created books were invisible because `org_book_selections` records were missing
- **Book count scoped to organization** — `GET /books/count` now queries `org_book_selections` in multi-tenant mode
- **Session update includes `location` field** — PUT endpoint was omitting location from the UPDATE SQL
- **Session update recalculates `last_read_date`** — changing a session date now correctly updates the student's last read date
- **Class assignment batch limit** — `syncUserClassAssignments` now chunks >100 statements to respect D1 limit
- **Wonde employee-class DELETE atomicity** — DELETE runs standalone before INSERT batches, preventing partial data on failure
- **Recommendation cache key includes student ID** — two students with identical params no longer share cached results
- **`daysBetween` DST fix** — dates parsed as UTC to avoid off-by-one errors at timezone boundaries
- **`bookToRow` preserves falsy values** — `||` replaced with `??` so `pageCount: 0` is no longer silently converted to null
- **ISBN lookup timeout** — external OpenLibrary fetches now use `fetchWithTimeout` (5s) instead of potentially hanging
- **Wonde admin error handling** — `JWT_SECRET` guard and try/catch on decrypt with user-friendly error messages
- **Wonde admin status filters `is_active`** on organization query
- **UserManagement checks response status** — `handleRegister` no longer shows false success on API errors
- **Stale closure fixed** in UserManagement and SchoolManagement `useEffect` — `fetchWithAuth` dependency now tracked
- **SettingsPage tab indices fixed** — dynamic tab array eliminates broken content mapping for non-admin owners
- **HomeReadingRegister no longer mutates global class filter** — uses local `effectiveClassId`, removing confusing cross-tab side effect
- **QuickEntry snackbar shows correct severity** — errors now display as red, not green success
- **BookImportWizard resets state on re-open** — previous import data no longer persists across dialog sessions
- **CORS trailing slash** removed from workers.dev origin in `wrangler.toml`

### Changed
- **APP_VERSION and Sentry release synced** to actual package version (was stuck at 3.19.0)
- **Sentry tracesSampleRate reduced** from 1.0 to 0.1 in both worker and frontend
- **AI config deduplicated** — `PUT /organization/ai-config` now delegates to shared `upsertAiConfig()` in settings.js
- **Title matching extracted** to shared `src/utils/titleMatching.js` — OpenLibrary, Google Books, and Hardcover APIs all import from one module
- **N+1 streak recalculation eliminated** — bulk fetches all sessions in one query, batch-updates students in groups of 100
- **`uuid` dependency removed** — replaced with native `crypto.randomUUID()` in AppContext
- **ErrorBoundary reports to Sentry** via `Sentry.captureException()`
- **Redundant AbortController removed** from OpenLibrary availability check
- **Unicode-aware string normalization** — `normalizeString` now preserves accented characters
- **BookAutocomplete results capped at 100** to prevent jank with 18K+ books
- **StudentSessions uses O(1) book lookup** via `booksMap` instead of O(n) `.find()`
- **DaysSinceReadingChart memoized** — no longer recalculates on every render
- **BookCoverContext debounces localStorage writes** (2s) to avoid repeated serialization

## [3.23.3] - 2026-03-21

### Fixed
- **Home reading register markers visible again** — reverted marker filter on the shared class sessions endpoint which broke ABSENT/NO_RECORD display on the register grid; moved filtering to the timeline chart client-side instead

## [3.23.2] - 2026-03-21

### Fixed
- **Stats exclude ABSENT/NO_RECORD markers** — "Never Read" count, total sessions, home/school split, reading by day, weekly activity, and session frequency now correctly exclude absent and no-record markers from the home reading register
- **`last_read_date` not set by markers** — marking a student absent or no-record no longer sets their last read date; uses `MAX()` to avoid overwriting with backdated sessions
- **`totalSessionCount` excludes markers** — the per-student session count subquery now filters out ABSENT/NO_RECORD entries
- **Timeline chart excludes markers** — class sessions endpoint filters out marker entries
- **Recalculate streaks fixes `last_read_date`** — the "Update Streaks" button now also recalculates `last_read_date` from actual sessions, fixing existing data

## [3.23.1] - 2026-03-21

### Fixed
- **N+1 book API calls** — replaced paginated book loading (one request per page of 50) with a single minimal-fields request on page load, reducing payload by ~77% and eliminating the N+1 pattern flagged by Sentry
- **Lazy book detail loading** — BookManager and BookMetadataSettings fetch full book data only when visited; SessionForm fetches single book details on selection

### Added
- **GET /api/books/:id** — new endpoint to fetch full details for a single book
- **Minimal fields mode** — `GET /api/books?all=true&fields=minimal` returns only id/title/author for autocomplete use

## [3.23.0] - 2026-03-21

### Added
- **Assessment slider** — replaced three-button assessment selector (Needing Help / Moderate / Independent) with a 1–10 integer slider on the Reading and Quick Entry pages; assessment removed from home reading entries; database migrated from TEXT to INTEGER
- **Home reading backfill** — multiple-read buttons (2/3/4/+) now create individual sessions on consecutive previous days instead of a single COUNT marker, fixing streak calculation
- **Sentry error tracking** — integrated Sentry for production error monitoring

### Fixed
- **Backfill with markers** — when backfilling through days with ABSENT/NO_RECORD markers, markers keep display priority while sessions are recorded for streak calculation; catch-up count shows on the selected date

### Changed
- **Assessment data model** — assessment stored as INTEGER (1–10, nullable) instead of TEXT strings; DB migration 0037 converts existing data (struggling→2, needs-help→5, independent→9)

## [3.22.0] - 2026-03-19

### Added
- **Delete support tickets** — owner can delete tickets (and associated notes) via trash icon in ticket detail view, with confirmation dialog

### Removed
- **Support ticket rate limit** — removed rate limiting from support POST endpoint to simplify testing and usage

## [3.21.2] - 2026-03-19

### Fixed
- **Support ticket page context** — use active tab name (e.g. "Students", "Stats") instead of `window.location.pathname` which is always `/` in this SPA

## [3.21.1] - 2026-03-19

### Fixed
- **Support ticket rate limit** — rate limit was applied to all HTTP methods on `/api/support` (including owner GET to list tickets), now only applies to POST submissions

## [3.21.0] - 2026-03-19

### Added
- **Support ticket page context** — captures and stores the page URL the user was on when submitting a support ticket; shown in ticket detail view and notification emails

### Fixed
- **Needs attention filter** — ReadingStats now includes students with `never`, `overdue`, and `attention` statuses (was only matching `notRead` which doesn't exist)

## [3.20.1] - 2026-03-19

### Removed
- **Max students/teachers limits** — removed per-org student and teacher caps from backend, frontend, and API responses (charging per school, not per seat)
- **User creation limit check** — removed 403 enforcement that blocked user creation when org hit `max_teachers` ceiling
- **Org stats limit fields** — stats endpoint now returns flat counts instead of `{current, limit}` objects

## [3.20.0] - 2026-03-17

### Added
- **Design context system** — `.impeccable.md` and CLAUDE.md design principles for consistent UI decisions
- **Reduced motion support** — `prefers-reduced-motion` media queries across all animations (global CSS, landing page reveals, hover effects)
- **Keyboard focus indicators** — global `:focus-visible` ring in sage green for keyboard navigation
- **Landing page mobile nav** — Sign In button now visible on mobile (was hidden with desktop nav links)
- **Skeleton pulse keyframe** — shared `skeleton-pulse` animation in global CSS (was inline per-render)

### Fixed
- **Register touch targets** — table cells increased from 30–36px to 44–48px minimum; font sizes raised from 0.6rem to 0.7–0.85rem throughout
- **Design language consistency** — replaced purple neumorphic inputs (`#EFEBF5`/`#d9d4e3`) in SessionForm and StudentList with theme-standard warm cream (`#FAF8F3`)
- **SessionForm Save button** — replaced 4-layer neumorphic shadow with standard theme button; added `pointer-fine` hover guard
- **Snackbar colour** — changed from off-palette Tailwind emerald (`#10B981`) to theme sage (`#6B8E6B`)
- **Login dead Tailwind classes** — removed non-functional Tailwind `className` attributes (project doesn't use Tailwind)
- **Heading hierarchy** — BookManager now renders `h1` semantic heading
- **Landing page showcase** — floater repositioned below screenshot on tablet instead of hidden
- **Priority card hover** — added missing `@media (hover: hover) and (pointer: fine)` guard
- **Bottom nav duplicate height** — removed duplicate `height` property in theme
- **Landing page bookshelf** — added `aria-hidden="true"` to decorative element
- **Landing page text** — corrected "UK-hosted" to "EU-hosted" in two places

### Changed
- **Glassmorphism reduced** — `backdrop-filter: blur()` removed from 13 component instances; now only used on header and bottom nav (where scroll-behind is purposeful)
- **Background blobs removed** — decorative floating gradient blobs removed from App.js and Login.js (pure decoration, iPad performance concern)
- **Cards and papers opaque** — MUI Paper/Card defaults changed from translucent `rgba` to solid `#FFFEF9`

## [3.19.1] - 2026-03-16

### Security
- **undici vulnerability fix** — added npm override to force undici@7.24.4, resolving 6 high-severity CVEs (WebSocket overflow, HTTP smuggling, memory exhaustion, CRLF injection) in transitive dependency via miniflare/wrangler

## [3.19.0] - 2026-03-16

### Security
- **SQL LIMIT parameterized** — replaced sole string-interpolated LIMIT clause with parameterized bind in students sessions query
- **Session PUT validation** — added input validation (pagesRead, duration, date, notes, assessment, location) matching POST handler, plus audit logging
- **Password change complexity** — enforces uppercase + lowercase + number on password changes (matching registration/reset)
- **Google API key POST redaction** — POST /api/settings now redacts googleBooksApiKey (previously only GET did)
- **Hardcover proxy hardened** — removed client-supplied API key fallback; server key required
- **Deactivated org filtered** — GET /api/organization now filters is_active
- **auth/me checks is_active** — for both user and organization
- **Slug uniqueness includes soft-deleted orgs** — prevents collision on reactivation
- **Refresh token expiry checked in SQL** — added expires_at filter to refresh token lookup
- **CSP headers on frontend** — static assets now include X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS
- **Health endpoint reduced** — removed auth mode and environment details from public health response

### Fixed
- **DpaConsentModal crash** — "Decline and Log Out" button referenced non-existent `handleLogout` instead of `logout`, causing runtime crash
- **last_read_date now written** — session creation updates student's last_read_date; session deletion recalculates from remaining sessions
- **Status color mapping** — fixed mismatch between getReadingStatus return values and theme.palette.status keys across 5 components; all status indicators now show correct colors
- **rowToStudent yearGroup** — Wonde year_group data no longer silently dropped from API responses
- **SessionForm snackbar** — shows dynamic message instead of hardcoded "saved successfully" on all paths
- **Session PUT recalculates streak** — changing a session date now triggers streak recalculation
- **updateStudentStreak passes env** — KV cache for org streak settings now works (was receiving empty object)
- **Classes GET role guards** — added requireReadonly() to all three GET endpoints
- **Tenant isolation on classes/:id/students** — added organization_id filter for defense-in-depth
- **FTS5 alias consistency** — WHERE clauses now use table alias matching JOIN alias
- **Orphan book cleanup** — changed NOT IN to NOT EXISTS for better performance

### Changed
- **Cron routing** — streak/GDPR runs at 2 AM, Wonde sync at 3 AM (previously both ran everything twice)
- **Deploy includes migrations** — `npm run go` now runs DB migrations before deploying
- **Streak cron batched** — bulk-fetches sessions and batch-updates streaks instead of 2 queries per student
- **BookAutocomplete debounced** — 150ms debounce on 18,000+ book filter prevents keystroke lag
- **Chart components memoized** — useMemo on activeStudents in ReadingFrequencyChart, DaysSinceReadingChart, ReadingTimelineChart
- **ReadingStats optimized** — getNeedsAttentionStudents uses outer memoized activeStudents instead of re-filtering
- **books/bulk targeted lookups** — duplicate detection uses ISBN/FTS queries instead of loading all books
- **Import body limit raised** — CSV import endpoints allow 5MB (global limit remains 1MB)
- **prettyJSON removed** — eliminates 15-25% JSON response size overhead in production
- **Provider logging removed** — createProvider no longer logs on every request
- **MUI Grid v7 API** — standardized 4 components from legacy Grid item API to v7 size prop
- **formatRelativeTime deduplicated** — extracted to shared utility from 2 components
- **GitHub Actions updated** — checkout and setup-node actions updated from v3 to v4
- **Health version constant** — version at top of worker.js, updated to 3.19.0

### Added
- **Composite database indexes** — students(org_id, class_id, is_active) and wonde_sync_log(org_id, started_at)
- **STATUS_TO_PALETTE mapping** — shared constant mapping reading status values to theme palette keys
- **.env.example** — documents all required and optional environment variables

### Removed
- **ReadingPreferences.js** — dead code superseded by StudentProfile.js
- **VisualIndicators.js** — dead code replaced by server-side stats
- **deploy.sh** — outdated script (build-and-deploy.sh is canonical)
- **jsdom devDependency** — unused (tests use happy-dom)
- **Unused exports** — removed getProviderStatus, isGoogleBooksConfigured, resetAvailabilityCache, addBookOptimized from utils/data layer

## [3.18.4] - 2026-03-13

### Fixed
- **Book change updates existing session** — selecting a book on the home reading register now updates the already-recorded session for that date, not just the student's current book
- **Faster book saves** — reduced D1 database round-trips from 4 to 2 by combining existence and org-ownership checks into a single JOIN query and removing a redundant existence check in the provider

## [3.18.3] - 2026-03-13

### Fixed
- **Home reading register touch targets** — increased row padding and made entire row clickable (not just the name cell) for easier student selection on touch devices

## [3.18.2] - 2026-03-12

### Fixed
- **Edit book modal button sizing** — buttons no longer wrap to two lines on narrow screens; added nowrap and auto min-width for consistent single-line layout

## [3.18.1] - 2026-03-12

### Changed
- **Books Read replaces session history** — reading history panels on both school and home reading pages now group sessions by book, showing each book once with cover, author, session count, and last read date instead of listing every individual session

## [3.18.0] - 2026-03-12

### Added
- **Reading history on school reading page** — SessionForm shows selected student's recent sessions with book covers, dates, assessment chips, and notes in a horizontal scrollable strip; refreshes after each new session is saved

## [3.17.0] - 2026-03-11

### Added
- **Student reading history panel** — horizontal scrollable strip below the register table showing selected student's recent sessions with book covers, titles, dates, assessment chips, and notes

### Changed
- **Summary chips compacted** — totals section condensed from full Paper with heading to a single row of small chips

## [3.16.1] - 2026-03-11

### Changed
- **Home Reading Register compact table** — removed 800px max-height cap, reduced cell padding and font sizes so 35 students fit without internal scrolling on most screens

## [3.16.0] - 2026-03-11

### Changed
- **Session form iPad-optimized layout** — replaced two-column Grid with single-column Box stack, entire form fits on one iPad screen without scrolling
- **StudentInfoCard converted to inline chips** — pure presentational component with Chip elements (last read, streak, level) instead of card with API calls
- **Book metadata editing moved to Popover** — compact book display (cover + title + Change/Edit buttons) replaces large inline editing panel; metadata fields accessible via edit icon
- **Location selector upgraded** — RadioGroup replaced with ToggleButtonGroup, combined with horizontal AssessmentSelector on one row
- **Notes collapsed behind icon** — SessionNotes accessible via icon button + Popover instead of prominent inline area

### Removed
- **Previous Sessions section** — removed from session form (StudentInfoCard "Last read" info is sufficient)

## [3.15.0] - 2026-03-10

### Added
- **GET /api/students/sessions endpoint** — class-scoped session fetching with date range filtering, date validation, and student name mapping
- **GET /api/students/stats endpoint** — server-side stats aggregation (session counts, location distribution, weekly activity, reading-by-day, most read books, streak leaderboard) replacing 160-line frontend useMemo
- **Loading skeletons** — ReadingStats and HomeReadingRegister show loading indicators during on-demand data fetching

### Changed
- **Lazy-load student sessions** — GET /api/students no longer returns embedded `readingSessions` or `preferences` arrays; response includes `totalSessionCount` via SQL subquery (~50KB vs ~2MB+ at scale)
- **HomeReadingRegister fetches sessions on demand** — local state with class-scoped session fetch, `sessionsByStudent` O(1) lookup, auto-refresh after mutations
- **ReadingStats uses server-side aggregation** — fetches from /api/students/stats instead of computing all stats client-side
- **All session-dependent components migrated** — SessionForm, StudentProfile, BookRecommendations, StudentSessions, StudentInfoCard, chart components all fetch sessions on demand
- **AppContext session mutations simplified** — addReadingSession/editReadingSession/deleteReadingSession are now API-call-only with summary field updates (no optimistic readingSessions array manipulation)
- **StudentList/Card/Table use totalSessionCount** — replaced `readingSessions.length` references with server-provided count
- **getPrioritizedStudents uses totalSessionCount** — updated sorting tiebreaker from `readingSessions.length`

## [3.14.0] - 2026-03-10

### Added
- **Fetch timeouts on all external calls** — new `fetchWithTimeout` helper enforces timeouts on AI providers (10s), Wonde API (8s), metadata APIs (5s), covers (5s), and email (5s)
- **Server-side books pagination** — default GET /api/books now returns paginated response (50/page) with total count; frontend loads all pages in parallel on login
- **Composite database indexes** — migration 0034 adds indexes on `org_book_selections(organization_id, book_id)` and `classes(organization_id, name)` for faster JOINs and sorts
- **Audit log hard-delete** — daily cron now deletes audit entries older than 1 year (previously only anonymised at 90 days, never deleted)
- **Wonde pagination safety limit** — max 100 pages per API request to prevent runaway pagination

### Fixed
- **Streak cron timeout at ~8 schools** — replaced sequential per-student processing with concurrent batches of 10; org settings fetched once per org instead of per student
- **Wonde sync cron timeout at ~17 schools** — process orgs concurrently (batches of 5) via `Promise.allSettled` instead of sequentially
- **Import preview Worker OOM** — replaced `SELECT * FROM books` (entire 18k+ catalog) with batch ISBN lookup + FTS5 title search
- **GDPR hard-delete sequential bottleneck** — chunked into db.batch() calls of 33 records instead of one-at-a-time
- **Hardcover rate limit blocking all users** — replaced module-level boolean flag with time-based auto-expiring check

### Changed
- **Removed redundant JS streak recalculation** — GET /api/students now returns pre-calculated streak values from DB (populated by daily cron) instead of recalculating per request
- **O(1) book lookups in HomeReadingRegister** — replaced `books.find()` with `Map.get()` via useMemo
- **Shared activeStudents filter in ReadingStats** — extracted duplicated filtering into single useMemo shared by stats, session sort, and streak sort
- **Reduced metadata API delays** — OpenLibrary 500→100ms, Google Books 300→50ms, Hardcover 1000→200ms
- **Increased book cover cache** — MAX_CACHE_ENTRIES from 500 to 2000 (4× fewer OpenLibrary API calls)
- **Parallel class assignments in Wonde sync** — concurrent batches of 5 instead of sequential

## [3.13.0] - 2026-03-07

### Added
- **Quick multiple-read buttons** — replaced the "2+" button on the home reading register with individual 2, 3, 4 buttons for one-tap recording, plus a "+" button for custom counts
- **Term date presets on register** — Current Term, School Year, and individual term options in the date range dropdown (when term dates are configured)
- **Current Term / School Year stats filter** — new filter options on the stats page for quick term-based filtering

### Changed
- **Focus mode auto-refresh** — changing the focus mode on recommendations now immediately re-triggers the search with the new mode

## [3.12.0] - 2026-03-06

### Added
- **Term dates management** — new Settings UI for managing academic year term dates (6 half-terms) with date validation, overlap detection, and per-organization storage
- **Term dates API** — `GET /PUT /api/term-dates` endpoints with academic year filtering and admin-only write access
- **Half-term filter on stats** — dropdown on the stats page to filter reading data by half-term period
- **Recommendations empty state** — inline SVG book illustration with "Select a student" prompt when no student is selected
- **Priority student quick-picks** — clickable student cards on recommendations page showing students who need attention, with reading status color dots
- **AI suggestions banner** — contextual "Want personalised picks? Ask AI" banner appears below library results when AI is configured

### Changed
- **Recommendations auto-search** — selecting a student now immediately triggers library search (removed manual "Find in Library" button)
- **Recommendations loading skeleton** — pulse-animated placeholder cards replace the old spinner during search
- **Compact student profile bar** — replaced two-column profile layout with a horizontal bar and collapsible details section
- **Larger book covers** — increased cover images to 120×180px desktop / 100×150px mobile on recommendation cards
- **Pull-quote reasoning** — match reasons and AI reasoning now display with sage green left border accent
- **"In library" badge** — moved from inline chip to overlay on book cover image for AI results

### Fixed
- **Duplicate ISBN scan button** — removed duplicate barcode scanner button from HomeReadingRegister

## [3.11.0] - 2026-03-06

### Changed
- **Unified reading register** — consolidated the separate register table and reading history table into a single multi-day table, halving the scroll needed for 30-pupil classes
- **Multi-day date columns** — table now shows date columns for the selected range with color-coded status cells, clickable headers to change the recording date, and weekend tinting
- **Date range presets** — new dropdown to switch between This Week, Last Week, Last Month, or a custom date range
- **Daily totals footer** — summary row at the bottom of the table with per-day session totals and tooltip breakdown (read/multiple/absent/no record/not entered)
- **Status legend** — visual key below the summary chips explaining the color-coded status symbols

### Removed
- **Drag-and-drop student reordering** — removed broken feature and `@dnd-kit` dependency (core, sortable, utilities)
- **Current Book column** — removed from the table; book is now visible only in the input panel when a student is selected
- **ClassReadingHistoryTable component** — functionality absorbed into the unified register

## [3.10.7] - 2026-03-06

### Added
- **Support ticket management page** — owner-only "Support Tickets" tab in Settings with master-detail layout for viewing and managing user support requests
- **Ticket status management** — update ticket status (open, in-progress, resolved) with optimistic UI updates and rollback on failure
- **Internal notes** — add timestamped internal notes to tickets, displayed as a timeline with user attribution
- **Status filtering** — filter ticket list by status with live count badges (All/Open/In Progress/Resolved)
- **Mobile responsive** — full-width list on mobile with detail overlay and back button

### Backend
- `GET /api/support` — list all tickets with optional `?status=` filter, joins organization name (owner only)
- `GET /api/support/:id` — single ticket detail with notes array (owner only)
- `PATCH /api/support/:id` — update ticket status (owner only)
- `POST /api/support/:id/notes` — add internal note with atomic batch insert (owner only)

### Database
- Migration 0032: `support_ticket_notes` table with ticket FK and created_at index; `updated_at` column on `support_tickets`

## [3.10.5] - 2026-03-05

### Added
- **Terms of Service page** — draft ToS at `/terms`, covering accounts, data ownership, AI recommendations, Wonde integration, liability, and subscription terms
- **Cookie Policy page** — draft cookie policy at `/cookies`, documenting the single `refresh_token` cookie, browser storage usage, and explicit no-tracking statement
- **Legal page links** — Login page now shows Privacy Policy, Terms, and Cookies links; landing page footer includes Cookies link

### Documentation
- **docs/terms-of-service.md** — 14-section Terms of Service draft for legal review
- **docs/cookie-policy.md** — 9-section Cookie Policy draft for legal review

## [3.10.4] - 2026-03-04

### Security
- **Login query hardened** — SQL now filters `is_active = 1` for both user and organization, preventing login for deactivated accounts (C1)
- **Admin user listing** — added `is_active = 1` filter to prevent soft-deleted users appearing in admin panel (C2)
- **Constant-time comparison** — fixed timing leak in `constantTimeEqual` by padding shorter array instead of early return (S6)
- **Google Books API key redacted** — API key no longer sent to client; uses boolean flag pattern matching Hardcover (S7)
- **403 responses stripped** — removed role and required-role fields from forbidden responses to prevent information leakage (S1)
- **Body size limit** — added 1MB `bodyLimit` middleware on all `/api/*` routes (S2)
- **Password complexity** — registration and password reset now require uppercase, lowercase, and number (S8)
- **Org slug uniqueness** — slug check now filters `is_active = 1` to prevent conflicts with soft-deleted orgs (S5)
- **Pagination bounds** — audit log endpoint validates page/pageSize parameters (S4)
- **Prototype pollution** — `validateSettings` rejects `__proto__`, `constructor`, `prototype` keys (T3)

### Fixed
- **Cover KEY_PATTERN** — regex now accepts hyphenated ISBNs (B2)
- **Token refresh data reload** — added `hasLoadedData` ref to prevent full `reloadDataFromServer` on every 15-minute token refresh (P4)
- **Cookie duplication** — extracted `buildRefreshCookie`/`buildClearRefreshCookie` helpers in crypto.js, replacing 4 duplicate constructions across auth.js and mylogin.js (Q2)

### Changed
- **Login form accessibility** — changed `placeholder` to `label` on all TextFields (A1)
- **Header class filter** — added `aria-label="Filter by class"` (A2)
- **Home reading register** — added aria-labels to all status buttons and table cells (A3)
- **Theme status colours** — darkened for WCAG AA contrast compliance (A4)
- **Stats memoisation** — wrapped `calculateStats` in `useMemo` (P3)
- **Health endpoint** — updated version to 3.10.4, added DB connectivity check (D2/D3)
- **Storage type** — changed `STORAGE_TYPE` from `kv` to `d1` in wrangler.toml (D5)

### DevOps
- **CI runs tests** — added `npm test` step to GitHub Actions pipeline (C4)
- **Deploy script hardened** — replaced destructive `rm -rf node_modules` with `npm ci`, removed stale `REACT_APP_API_BASE_URL`, added migration step before deploy (D1/D7)

## [3.10.3] - 2026-03-04

### Fixed
- **Wonde sync: remove unused employees fetch** — `fetchAllEmployees` was called but never used; employee-class mappings already built from classes endpoint
- **Wonde sync: batch student deletions** — deactivation queries now batched via `db.batch()` instead of N+1 individual queries
- **Class assignments: batch INSERTs** — `syncUserClassAssignments` now uses `db.batch()` instead of individual INSERT loops
- **Employee-class atomicity** — DELETE + INSERT for `wonde_employee_classes` now execute in a single batch for atomicity
- **Cron sync null guard** — added `AND wonde_school_token IS NOT NULL` to prevent crashes on orgs without tokens
- **Webhook school name sanitisation** — sanitise and truncate `school_name` from external webhook payloads
- **MyLogin token_type validation** — verify `token_type` is `Bearer` after token exchange
- **OAuth state cleanup** — expired `oauth_state` rows now cleaned up in the daily GDPR cron job
- **Duplicate `parseCookies`** — removed copy from `mylogin.js`, now imports from `auth.js`

### Changed
- **Role guards in wondeAdmin** — replaced inline role checks with `requireAdmin()`/`requireOwner()` middleware
- **SSO button conditional** — MyLogin SSO button only shown when `ssoEnabled` is true from `/api/auth/mode`
- **Populate SEN/PP/EAL/FSM from Wonde** — student sync now extracts `sen_status`, `pupil_premium`, `eal_status`, `fsm` from Wonde `extended_details`
- **`rowToStudent` mapper** — added `senStatus`, `pupilPremium`, `ealStatus`, `fsm` fields
- **`fetchAllStudents` includes** — added `extended_details` to Wonde API include parameter

## [3.10.2] - 2026-03-04

### Added
- **Student search**: Text search field on the students page to filter by name (case-insensitive substring match) with clear button
- **Reading status filter**: Clickable chip filters (All / Needs Attention / Not Read / Recently Read) to quickly narrow down students by reading status

## [3.10.1] - 2026-03-04

### Added
- **Privacy policy page**: `/privacy` now renders the full GDPR privacy policy as a styled, standalone page (no login required). Fixes broken `/privacy` links in the DPA modal, login page, landing page, and settings page

## [3.10.0] - 2026-03-04

### Added
- **Class auto-assignment**: Teachers logging in via MyLogin SSO are automatically assigned to their Wonde-synced classes via the new `class_assignments` table (migration 0030)
- **Auto-filter on login**: Frontend automatically sets the class filter to the teacher's first assigned class (alphabetically) on fresh SSO login
- **Sync-time class refresh**: Wonde sync (overnight cron and manual sync) now refreshes `class_assignments` for all users with a `wonde_employee_id`
- **`assignedClassIds` in JWT**: Class assignment IDs included in JWT payload and token refresh responses, enabling frontend auto-filter without extra API calls
- **`syncUserClassAssignments` helper**: Shared utility (`src/utils/classAssignments.js`) used by both SSO login and Wonde sync to keep assignments current

### Fixed
- **Class assignments only for new users**: MyLogin callback previously only attempted class assignment for newly created users (and silently failed because the table didn't exist). Now runs for all teacher logins

## [3.9.0] - 2026-03-04

### Added
- **Enhanced User Management page**: Full-width table replacing side-by-side layout, with new Auth (SSO/Local) and Last Login (relative time) columns for visibility into Wonde/MyLogin users
- **User search and filter**: Client-side search by name/email and All/SSO/Local auth provider toggle
- **User detail dialog**: Shows full user profile including auth provider, Wonde Employee ID, and class assignments fetched from Wonde sync data
- **GET /api/users/:id/classes endpoint**: Returns Wonde-synced class assignments for a user by joining `wonde_employee_classes` with `classes`
- **Add User moved to dialog**: Form relocated from side panel to a dialog for cleaner layout

### Fixed
- **GET /api/users missing Wonde fields**: SQL queries now SELECT `auth_provider`, `mylogin_id`, and `wonde_employee_id` — the `rowToUser` mapper already handled them but the queries weren't fetching the columns
- **Stale routes.yaml entries**: Removed non-existent `deactivate`/`reactivate` routes, added actual `erase`, `reset-password`, `export`, and `classes` endpoints

## [3.8.1] - 2026-03-03

### Added
- **Wonde token UI in School Management**: Owners can now paste a Wonde school token directly in the edit-school form instead of using browser console commands. Token field only appears for Wonde-linked schools, shows "Token is set" when already configured, and encrypts at rest via the existing `POST /api/wonde/token` endpoint
- **`hasWondeToken` boolean in org API**: `rowToOrganization` now exposes a boolean flag so the frontend knows whether a token exists without leaking the encrypted value
- **`organizationId` parameter on token endpoint**: `POST /api/wonde/token` accepts an optional `organizationId` so owners can set tokens for any school, not just their current org context

## [3.8.0] - 2026-03-03

### Security
- **Owner org-switch DB verification (S-6)**: JWT `owner` role claim is now verified against the database before allowing organization switching via `X-Organization-Id`, closing a trust window where revoked owners could still switch orgs until JWT expiry
- **Env var validation at startup (E-1)**: Worker now returns 500 immediately if no auth method is configured, or if `MYLOGIN_CLIENT_ID` is set without `MYLOGIN_CLIENT_SECRET`
- **Rate limiting log level (S-4)**: Rate limit bypass on DB error now logs at `console.warn` instead of `console.error` for proper severity classification
- **Gemini API key documentation (S-2)**: Added inline comment documenting that Gemini's query-parameter API key is a known constraint with mitigation advice

### Fixed
- **Quick Entry save not awaited (U-1)**: `handleSave` is now async with `await` on `addReadingSession`. Errors show a failure Snackbar instead of silently dropping. Student only advances on success
- **Public paths diverging (Q-3)**: Extracted `PUBLIC_PATHS` to `src/utils/constants.js` as single source of truth — worker.js and tenant.js now import from the same array (also unified a `/api/logout` entry that only existed in worker.js)
- **Deprecated `onKeyPress` (A-9)**: Replaced with `onKeyDown` in ReadingPreferences and StudentProfile

### Added
- **Database indexes (P-5)**: Migration `0028_additional_indexes.sql` adds `idx_students_class_id`, `idx_reading_sessions_student_date`, and `idx_reading_sessions_org_date`
- **Book cover cache eviction (P-8)**: Cache now caps at 500 entries with LRU-style eviction by `fetchedAt` timestamp

### Accessibility
- **Color-only status indicators (A-1)**: Status dots in StudentCard now have `role="img"` + `aria-label`. StudentTable rows and QuickEntry cards include status name in their `aria-label`
- **IconButton aria-labels (A-3)**: Added explicit `aria-label` to all IconButtons across StudentCard, QuickEntry, SessionNotes, PrioritizedStudentsList, and ReadingPreferences
- **Landmark roles (A-4)**: AppBar renders as `<header>`, BottomNavigation wraps in `<nav aria-label="Main navigation">`
- **Login error announcements (A-5)**: Error messages now use `<Alert severity="error" role="alert">` for screen reader announcement
- **SessionNotes keyboard access (A-7)**: Collapsed notes box now has `role="button"`, `tabIndex={0}`, and `onKeyDown` for Enter/Space
- **StudentTable keyboard access (A-8)**: Clickable rows now have `tabIndex={0}`, `aria-label`, and `onKeyDown` for Enter/Space

### Performance
- **Wonde sync parallelization (P-6)**: `fetchAllStudents`, `fetchAllEmployees`, and `fetchDeletions` now run via `Promise.all` after classes are processed, reducing sync wall time

### Changed
- Cleaned debug `console.log` statements from email.js, googleBooksApi.js, openLibraryApi.js, hardcoverApi.js — converted "not provided" messages to `console.warn`, removed success noise
- Provider selection logging in `data/index.js` retained (intentional operational logging)

## [3.7.5] - 2026-03-02

### Fixed
- **Class `disabled` toggle not persisting**: The `disabled` column was missing from the `classes` table and the PUT route ignored it — toggle only worked via optimistic UI updates and was lost on page refresh. Added migration `0027_classes_disabled.sql` and updated PUT SQL to persist the value.

### Added
- **Wonde-aware ClassManager**: Auto-detects Wonde-connected schools (via `wondeClassId` on classes) and shows a read-only view with sync info banner instead of the manual Year 1-11 dropdown. Wonde mode hides Add/Edit/Delete controls since classes are managed by the school MIS.
- **Expandable student lists**: Click any class to expand and see its students with name and reading level range. Students fetched on-demand from `GET /api/classes/:id/students`.
- **Student count chips**: Each class now shows a student count badge in the class list.
- **Row mapper fields**: `rowToClass` now maps `disabled` and `wondeClassId` from D1 rows.

## [3.7.4] - 2026-03-02

### Fixed
- **Missing soft-delete filters**: Added `AND is_active = 1` to 7 queries across auth, users, and organization routes that could return deactivated records (registration email check, slug check, user create email check, GET user by ID, GET/PUT/DELETE organization by ID)
- **Incomplete student row mapping**: `GET /api/classes/:id/students` now uses centralized `rowToStudent()` mapper instead of inline mapping that missed `readingLevelMin`, `readingLevelMax`, `aiOptOut`, `processingRestricted`, and other newer fields
- **Student profile missing name**: `buildStudentReadingProfile()` now includes `name` in the returned student object
- **Silent AI config failure**: BookRecommendations now shows an info banner when AI configuration fails to load instead of silently swallowing the error

### Performance
- **Wonde sync N+1 elimination**: Replaced ~1,050 individual DB queries (per school sync) with batch-fetch + `db.batch()` upserts for classes, students, and employee-class mappings
- **O(1) book title lookups**: BookRecommendations now uses a `useMemo` Map for book lookups instead of O(n) `Array.find()` per reading session

### Changed
- Removed 5 debug `console.log` statements from d1Provider recommendation filtering
- Removed unused `refreshToken` state variable from AppContext (now httpOnly cookie)
- Extracted `parseGenreIds()` utility to `src/utils/helpers.js`, replacing duplicate logic in `books.js` and `studentProfile.js`

## [3.7.3] - 2026-03-02

### Security
- **Fixed OAuth2 CSRF state bypass**: The MyLogin SSO callback was conditionally skipping state validation when the `state` parameter was absent (intended for IDP-initiated flow). This allowed an attacker with a stolen authorization code to authenticate without CSRF protection. State is now always required and validated.
- **Removed debug logging of credentials and PII to D1**: Temporary debug logging in the MyLogin callback was writing OAuth client secret prefix, secret length, user names, emails, and full profile JSON to the `wonde_sync_log` D1 table under a hardcoded org ID. All `debugLog` calls and the function itself have been removed.
- **Removed debug console.log from App.js**: Removed SSO debug log that captured the full page URL on auth callback.

### Changed
- **MyLogin profile unwrapping**: Correctly unwraps user profile from MyLogin's `data` wrapper property
- **Token exchange compatibility**: Sends OAuth client credentials in both Basic auth header and request body for maximum provider compatibility
- **SSO error handling**: Frontend now displays user-friendly error messages for SSO failures (expired session, auth failure, school not found, etc.)
- **Auto-show login on SSO return**: Login page automatically displays when returning from SSO callback or error redirect
- **Static asset serving**: Simplified worker asset serving; SPA fallback handled by `not_found_handling` in wrangler.toml
- **Wrangler config**: Added `run_worker_first = ["/api/*"]` to ensure OAuth callbacks hit the Worker, not index.html

## [3.7.2] - 2026-02-27

### Changed
- **Custom tally mark logo**: Replaced Material-UI `MenuBookIcon` with a shared `TallyLogo` component (four vertical lines with diagonal fifth line) across Header, Login, and Landing Page
- Updated `book-icon.svg` favicon to match the new tally mark design

## [3.7.1] - 2026-02-27

### Fixed
- **Stale classes after school switch**: Owner switching schools saw the previous school's classes in the dropdown. Two causes: (1) `fetchWithAuth` captured `activeOrganizationId` via closure — by the time `reloadDataFromServer` ran, it still had the old org ID. Fixed with a ref (same pattern as `authTokenRef`). (2) Cache-Control header on `/api/classes` caused the browser to serve cached response from the previous org. Removed classes from cacheable endpoints (genres remain cached as they're global).

## [3.7.0] - 2026-02-27

### Performance
- **Frontend bundle splitting**: MUI, Emotion, and React split into separate cacheable chunks via Rsbuild cacheGroups (MUI 394KB, React 179KB)
- **Lazy-loaded tab components**: 6 of 7 tab panels loaded with React.lazy+Suspense, reducing initial JS from 312KB to 125KB (60% reduction)
- **Memoized AppContext**: Provider value wrapped in useMemo; React.memo added to StudentCard, StudentTable, BookCover
- **Parallelized data loading**: 5 sequential API fetches in reloadDataFromServer now use Promise.all
- **FTS5 full-text search**: Book search queries now use existing books_fts index with LIKE fallback
- **Intersection Observer for book covers**: Covers only fetch when within 200px of viewport
- **CSS content-visibility on StudentTable rows**: Browser skips rendering off-screen rows
- **Cached org streak settings**: KV cache with 1hr TTL replaces per-request DB queries
- **Cache-Control headers**: Genres and classes GET endpoints return `private, max-age=60, stale-while-revalidate=300`

### Added
- `src/utils/rowMappers.js` — centralized snake_case→camelCase mappers for all 6 entity types (book, student, class, user, organization, genre)
- `src/utils/routeHelpers.js` — shared helpers: `getDB`, `requireDB`, `isMultiTenantMode`, `safeJsonParse`, `requireStudent`
- `forbiddenError()` constructor in errorHandler.js for standardized 403 responses
- `generateTemporaryPassword()` moved to crypto.js as a shared utility
- Input validation: `validateGenre`, `validateClass`, `validateBook` in validation.js, wired into all POST/PUT routes
- Database migration 0026: performance indexes on rate_limits, audit_log, organizations, reading_sessions, classes

### Fixed
- **rowToUser missing columns**: Added `authProvider`, `myloginId`, `wondeEmployeeId` from migration 0024
- **users.js PUT owner path**: Added missing `is_active = 1` filter on user lookup
- **Library search genre_ids parsing**: Added `parseGenreIds()` helper that tries JSON.parse before comma-split fallback
- **Consistent error responses**: Permission denied errors in classes, genres, and students now use `throw forbiddenError()` instead of mixed inline patterns

### Improved
- Deduplicated 8 inline book row mappings in books.js → single `rowToBook` import
- Deduplicated 6 inline student existence checks in students.js → single `requireStudent()` call
- Removed 7 duplicate `getDB` and 4 duplicate `isMultiTenantMode` across route files
- Stabilized BookCoverContext callbacks with useRef to prevent cascade re-renders
- Pre-computed StudentTable derived data in single useMemo pass

## [3.6.3] - 2026-02-26

### Changed
- Renamed bottom navigation tabs for clarity: "Reading" → "School Reading", "Record" → "Home Reading"

## [3.6.2] - 2026-02-26

### Fixed
- **Session recording failure**: Applied GDPR migration (0025) to production D1 — the `processing_restricted` column query was failing silently, preventing all reading sessions from being saved
- **SessionForm error handling**: Made `handleSubmit` async and await the API result; form now shows an error message on failure instead of a misleading success snackbar
- **Duplicate books on barcode scan**: ISBN scan and lookup endpoints now normalize OpenLibrary author names ("Surname, First" to "First Surname") and check for title+author fuzzy matches before creating, preventing duplicate entries with reversed author names

### Added
- `normalizeAuthorDisplay` utility in `stringMatching.js` for converting "Lastname, Firstname" to "Firstname Lastname"

## [3.6.1] - 2026-02-26

### Security
- **Webhook authentication**: Added shared-secret authentication to the Wonde webhook endpoint (`POST /api/webhooks/wonde`) using `WONDE_WEBHOOK_SECRET` env var with constant-time comparison; previously the endpoint was completely unauthenticated
- **Wildcard auth bypass removed**: Removed `startsWith('/api/webhooks/')` from JWT and tenant middleware bypass conditions; only explicitly listed public paths are now bypassed
- **API key encryption at rest**: Hardcover and Google Books API keys in `bookMetadata` settings are now AES-GCM encrypted at rest (same pattern as AI provider keys); backward-compatible with existing plaintext values
- **Hardcover key redacted from API**: Hardcover API key is no longer returned in `GET /api/settings` responses; replaced with `hasHardcoverApiKey` boolean flag; backend proxy reads the encrypted key directly from DB

### Changed
- Hardcover GraphQL proxy now prefers the server-stored (encrypted) API key over client-supplied key
- `WONDE_WEBHOOK_SECRET` environment variable is now required for webhook processing (returns 503 if unconfigured)

## [3.6.0] - 2026-02-25

### Added — UK GDPR Compliance
- **Database migration (0025)**: Added `processing_restricted` and `ai_opt_out` columns to students, DPA consent columns to organizations, `data_rights_log` table for ICO-reportable request tracking, `wonde_erased_students` exclusion table
- **Student erasure endpoint** (`DELETE /api/students/:id/erase`): Hard-deletes student data (sessions, preferences, student record), anonymises audit log entries, adds Wonde-synced students to exclusion list to prevent re-creation
- **User erasure endpoint** (`DELETE /api/users/:id/erase`): Hard-deletes user data with cascade through tokens, anonymises audit log
- **Subject Access Request export** (`GET /api/students/:id/export`, `GET /api/users/:id/export`): JSON and CSV format downloads with full data portability (Article 15/20)
- **Processing restriction** (`PUT /api/students/:id/restrict`): Article 18 restriction flag that blocks session recording and AI recommendations; visual "Restricted" chip on student cards
- **AI opt-out toggle** (`PUT /api/students/:id/ai-opt-out`): Per-student AI recommendation opt-out with toggle in Student Profile settings
- **DPA consent recording**: Modal for admins/owners to accept the Data Processing Agreement on first login; consent tracked with version, timestamp, and accepting user
- **Privacy policy links**: Added to landing page footer, email signup form, login page, and settings page (Article 13 compliance)
- **90-day retention auto-deletion**: Scheduled handler now hard-deletes soft-deleted students, users, and inactive organizations after 90-day retention period
- **Wonde erased student exclusion**: Sync now checks `wonde_erased_students` table to prevent re-creating GDPR-erased students from Wonde data

### Improved
- **Audit logging coverage**: Added `auditLog()` middleware to 13 additional routes across students (CRUD, sessions, bulk import), classes (CRUD), settings (app + AI config), and books (import, clear library)
- **GDPR documentation**: Updated all 10 GDPR policy documents (privacy policy, DPA, DPIA, ROPA, data retention, subject rights, breach response, sub-processors, technical security, compliance checklist)

## [3.5.8] - 2026-02-24

### Updated
- **Landing page screenshots**: Replaced all 4 existing screenshots (students, reading session, register, recommendations) with fresh captures reflecting the updated frontend design
- **New landing page sections**: Added "Reading stats" and "Book library" screenshots and feature rows to the "See it in action" section, showcasing the statistics dashboard and book management pages

## [3.5.7] - 2026-02-24

### Fixed
- **Content cutoff behind bottom nav**: Main content container now properly accounts for the 80px fixed bottom navigation bar, preventing tables and lists from being clipped on all pages
- **iOS Safari viewport height**: Added `dvh` (dynamic viewport height) support with `vh` fallback, fixing content overflow caused by iOS Safari's dynamic address bar
- **Dialog overlap with bottom nav**: Student sessions dialog no longer extends behind the bottom navigation bar on tablet/desktop
- **Table height on different devices**: Register and reading history tables now use dynamic `clamp()` heights that adapt to viewport size instead of hardcoded pixel values

### Improved
- **iPad touch support**: Hover transforms on cards and buttons are now guarded with `@media (hover: hover)` to prevent stuck hover states on touch devices; added `:active` states for tactile feedback
- **Touch targets**: Drag handles and clear buttons in the reading register now meet Apple's 44x44px minimum touch target size
- **Responsive stats grid**: Summary cards on the Stats page now use a 2-column layout on narrow screens (iPad Mini portrait) instead of a cramped 4-column grid
- **Header layout at narrow widths**: Title no longer wraps to two lines; toolbar wraps cleanly with auth controls right-aligned on the second row
- **Safari compatibility**: Added `-webkit-backdrop-filter` prefix throughout for older Safari/WebKit support; added `-webkit-overflow-scrolling: touch` for smooth scrolling on older iPads

### Changed
- **User info moved to Settings page**: User name and role chip removed from the header bar (decluttering the nav) and relocated to the Settings & Data page title area

## [3.5.6] - 2026-02-24

### Added
- **Update Streaks button**: Manual streak recalculation button on the Streaks tab of the Stats page, allowing teachers to refresh streak data on-demand rather than waiting for the daily 2 AM cron job

## [3.5.5] - 2026-02-24

### Improved
- **Record Reading Session book details**: Book cover now displayed alongside author, reading level, age range and genres fields, saving vertical space

### Removed
- **"Add as new book" dropdown option**: Removed redundant option from book autocomplete that offered to create books already in the library; users can still create new books by pressing Enter or using the barcode scanner

## [3.5.4] - 2026-02-24

### Added
- **Wonde + MyLogin SSO integration**: Full school data sync via Wonde API (students, classes, teachers with SEN/PP/EAL/FSM indicators), MyLogin OAuth2 SSO login for school users, webhook-driven school onboarding, daily delta sync with on-demand trigger, encrypted Wonde school tokens (AES-GCM), lazy user creation on first SSO login
- **School Management Wonde status**: Source column showing Wonde-connected vs manual schools, last sync timestamp tooltip, delete warning for Wonde-managed schools

### Changed
- **Auth system**: Now supports three modes — MyLogin SSO (primary for schools), email/password JWT (owner/fallback), legacy shared password
- **Cron schedule**: Added 3:00 AM UTC daily Wonde delta sync alongside existing 2:00 AM streak recalculation

## [3.5.3] - 2026-02-24

### Added
- **School onboarding guide**: New `docs/school-onboarding-guide.md` with IT setup instructions (domain whitelisting, browser requirements), getting started walkthrough (accounts, teachers, classes, students), feature pointers, and troubleshooting table

## [3.5.2] - 2026-02-24

### Changed
- **Bulk metadata operations moved to Settings**: Fill Missing and Refresh All buttons relocated from Book Manager to Settings > Book Metadata, restricting access to admin and owner roles only; reduces accidental heavy API usage by teachers on large (2000+) book libraries

## [3.5.1] - 2026-02-24

### Fixed
- **Unified metadata fetch**: Fill Missing now makes 1-2 API calls per book instead of 3-5, reducing rate limit hits by 50-67% across all providers (OpenLibrary: 4→2, Google Books: 3→1, Hardcover: 5→2)
- **Clear Library feature**: Added bulk-remove all books from a school's library via Settings > Data Management (admin+), with confirmation dialog showing book count; reading sessions preserved via `ON DELETE SET NULL`
- **CSV import ISBN dedup**: Import no longer fails on duplicate ISBNs in CSV; first occurrence creates the book, subsequent same-ISBN entries link to existing
- **CSV import chunking**: Large imports (2000+ books) chunked into 200-book HTTP requests with progress bar to avoid Worker timeout
- **Fill Missing resume**: Processes all books (removed 50-book cap) and tracks attempted books in-session so restarts skip already-processed books
- **Author format dedup**: Import preview now handles "Last, First" vs "First Last" author formats via alphabetical word-sort normalization

## [3.5.0] - 2026-02-23

### Added
- **Batch processing controls**: Stop button (AbortController) to halt Fill Missing / Refresh All mid-batch; rate limit detection with adaptive delay for Hardcover API; configurable batch size (default 50) with resume capability; processing speed presets (Careful/Normal/Fast); auto-fallback to Open Library when rate limited
- **Per-book Fill Missing updates**: Books are updated immediately as metadata is fetched instead of waiting for the entire batch to complete, providing better visual feedback and resilience to interruption; live running counts shown in progress UI
- **Extended CSV import fields**: Book import now supports Description, Page Count, Publication Year, Series Name, and Series Number columns in addition to Title, Author, Reading Level, and ISBN; column auto-detection handles Accelerated Reader export format (BL, No.of Pages, etc.); improved pattern matching with exact-match-first for short patterns to prevent false positives

### Fixed
- **Fill Missing batch resilience**: Wrapped onBookResult callback in try/catch so callback errors don't kill the batch loop; removed mid-batch reloadDataFromServer that was disrupting async processing

## [3.4.1] - 2026-02-23

### Fixed
- **Hardcover editions query**: Changed `page_count` to `pages` in the GraphQL `BOOK_DETAILS_QUERY` to match Hardcover's actual schema, fixing "field 'page_count' not found in type: 'editions'" errors

## [3.4.0] - 2026-02-23

### Added: Hardcover API Integration

Hardcover (hardcover.app) added as a third metadata provider alongside OpenLibrary and Google Books, bringing rich series data and curated metadata to the book enrichment pipeline.

#### Hardcover Provider
- **Full metadata source**: Searches, author lookup, book details (with series!), genres, cover URLs, and all batch operations
- **GraphQL API**: Uses Hardcover's Hasura-based GraphQL endpoint with two-step lookup (search → detail fetch)
- **Series data**: Extracts series name and position number from Hardcover's `book_series` junction table
- **Title matching**: Same 3-signal fuzzy matching algorithm as OpenLibrary (substring coverage, word overlap, bigram Jaccard)
- **Rate limiting**: 1000ms delay between batch requests (60 req/min API limit)

#### Waterfall Fallback
- **Hardcover-first**: When Hardcover is selected, it's tried first for each lookup
- **Automatic fallback**: If Hardcover returns null or errors, silently falls back to OpenLibrary
- **Graceful degradation**: Missing API key throws clear error; Hardcover downtime doesn't block metadata enrichment

#### Series Fields in Metadata Pipeline
- **Fill Missing**: Now detects missing series data as a gap and populates `seriesName`/`seriesNumber` from Hardcover
- **Refresh All**: Shows series name and number in the diff review dialog with per-field checkboxes
- **All providers**: OpenLibrary and Google Books `getBookDetails` now return `seriesName: null, seriesNumber: null` for consistent shape

#### Settings UI
- **Provider dropdown**: Hardcover appears as third option alongside OpenLibrary and Google Books
- **API key field**: Conditional text field shown when Hardcover is selected
- **Validation**: Warning alert when Hardcover selected without API key configured

#### Tests
- 67 new tests for `hardcoverApi.js` (GraphQL client, availability caching, search, author lookup, book details with series, genres, cover URL, batch operations)
- 10 new tests for waterfall fallback in `bookMetadataApi.js`
- 2 new tests for series fields in BookManager Fill Missing/Refresh All
- Total: 1,496 tests passing (41 files)

#### Files Added
- `src/utils/hardcoverApi.js` — Hardcover GraphQL API provider (806 lines)
- `src/__tests__/unit/hardcoverApi.test.js` — Provider tests (1,780 lines)
- `docs/plans/2026-02-23-hardcover-integration-design.md` — Design document
- `docs/plans/2026-02-23-hardcover-integration-plan.md` — Implementation plan

#### Files Modified
- `src/utils/bookMetadataApi.js` — Third provider + waterfall + series fields
- `src/utils/openLibraryApi.js` — Added seriesName/seriesNumber to getBookDetails return
- `src/utils/googleBooksApi.js` — Added seriesName/seriesNumber to getBookDetails return
- `src/components/books/BookManager.js` — Series fields in fill/refresh flows
- `src/components/BookMetadataSettings.js` — Hardcover provider option + API key field
- `src/__tests__/unit/bookMetadataApiBatch.test.js` — Hardcover + waterfall + series tests
- `src/__tests__/components/BookManager.test.jsx` — Series field tests

#### Usage
1. Go to Settings → Book Metadata
2. Select "Hardcover" from the provider dropdown
3. Enter your Hardcover API key (from hardcover.app account settings)
4. Save settings
5. Use "Fill Missing" or "Refresh All" on the Books page — series data will now be populated

---

## [3.3.0] - 2026-02-20

### Added: Email Signup for Landing Page

- **Email signup endpoint**: New `POST /api/signup` public endpoint stores email signups in D1 `email_signups` table
- **Notification email**: Sends notification to `hello@tallyreading.uk` on each new signup using existing Resend/Cloudflare email provider chain
- **Duplicate handling**: `INSERT OR IGNORE` silently handles re-submissions; always returns success to avoid revealing whether email was already registered
- **Rate limiting**: 5 requests per minute per IP to prevent abuse
- **Frontend wiring**: Landing page "Keep me posted" form now POSTs to `/api/signup` with loading state, error display, and success message
- **D1 migration**: `0023_email_signups.sql` creates `email_signups` table with unique email constraint
- **Tests**: 10 new tests for `sendSignupNotificationEmail` covering all providers, XSS escaping, and content formatting (1,417 total tests passing)

#### Deployment Notes
```bash
npx wrangler d1 migrations apply reading-manager-db --remote
npm run go
```

## [3.2.1] - 2026-02-20

### Added: Landing Page Screenshots

- **App screenshots**: Added real screenshots to landing page — students view (hero), reading session, class register, and AI recommendations (feature rows + floating card)
- Replaced gradient placeholder elements with actual `<img>` tags

## [3.2.0] - 2026-02-20

### Added: Landing Page

- **Landing page**: New public-facing landing page shown to unauthenticated users, based on the tally-landing-v2 design
- **Sign In button**: Nav bar includes a Sign In button that navigates to the existing login screen
- **Back to landing**: Login screen now has a Back link to return to the landing page
- **Sections**: Hero with CTA, feature grid (6 cards), app-in-action showcase (3 feature rows), how-it-works steps, trust badges, email signup CTA, and footer
- **Scroll animations**: IntersectionObserver-powered reveal animations on scroll
- **Responsive**: Full mobile/tablet support with bookshelf edge decoration on desktop
- **Fraunces font**: Added serif display font for landing page headings

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