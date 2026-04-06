# Demo Environment Design

**Date**: 6 April 2026
**Status**: Approved

## Goal

Add a zero-signup demo to the landing page so prospective schools can experience Tally hands-on. The UX advantage (Quick Entry, one-tap recording, AI recommendations) only becomes apparent through use — screenshots can't sell "this feels faster".

## Design

### Demo Auth

- New public endpoint: `POST /api/auth/demo`
- Returns a standard Tally JWT: **teacher role**, locked to the Learnalot School org ID, **1-hour TTL**
- **No refresh token** — session is disposable. When the token expires, the existing `fetchWithAuth` 401 handler calls `refreshAccessToken()` which fails (no refresh cookie), then `clearAuthState()` fires. Include `authProvider: 'demo'` in the JWT payload so the logout redirect can send demo users to `/` (landing page) instead of `/login`
- `auth_provider` set to `'demo'` on the demo teacher user to distinguish from real users
- Added to `publicPaths` in both `tenant.js` and `worker.js`
- Rate limited: 10 requests/min per IP (reuse existing `authRateLimit` pattern)

### Demo User

- Dedicated "Demo Teacher" user record in the Learnalot org
- Teacher role — naturally hides admin-only tabs (Books, Settings) via existing role-based tab filtering
- Included in the data snapshot, recreated on every reset

### Frontend Entry Point

- "Try the demo" button on the landing page
- On click: `POST /api/auth/demo` → store token via `AuthContext` login flow → navigate to `/students`
- No interstitial screen — straight into the app
- Onboarding tours auto-start for first-time users (existing `useTour` behaviour — demo user has no tour completions)
- App behaves exactly as it would for a real teacher. No special demo UI mode

### Data Snapshot

- One-time export of all Learnalot org data from production D1:
  - `students`, `classes`, `class_assignments`, `reading_sessions`
  - `student_preferences`, `org_book_selections`, `org_settings`
  - `term_dates`, `support_tickets`, `support_ticket_notes`
  - `user_tour_completions` (empty — so tours auto-start)
  - `users` (the dedicated Demo Teacher record)
- **Not** included in the snapshot (persist across resets like the org row):
  - `organizations` — persists permanently, never deleted or recreated
  - `org_ai_config` — contains encrypted API key, must not be committed to repo
  - `books` — global catalog, not org-scoped
  - `genres` — global reference table, not org-scoped
- Wonde tables excluded: `wonde_sync_log`, `wonde_employee_classes` — Learnalot should have no Wonde credentials set, so daily Wonde sync will skip it
- Stored as a **JS module bundled with the worker** (not KV) — self-contained, no external dependency. Snapshot should be trimmed to a representative subset if it exceeds ~1MB (Cloudflare Workers have a 10MB compressed size limit)
- Static file committed to the repo. Re-export manually if Learnalot data changes meaningfully

### Reset Mechanism

- New cron expression `0 * * * *` in `wrangler.toml` — **runs hourly at minute 0**
- Process:
  1. Delete all org-scoped data for Learnalot org ID, in FK-safe order:
     - `support_ticket_notes` → `support_tickets`
     - `reading_sessions` → `student_preferences` → `class_assignments` → `students` → `classes`
     - `org_book_selections` → `org_settings` → `term_dates`
     - `refresh_tokens` → `password_reset_tokens` → `user_tour_completions` → `users` (demo teacher only)
     - `audit_log`
  2. Re-insert everything from the snapshot module
  3. Respect D1 batch limit (chunk into batches of 100 statements)
- **Never deleted**: `organizations` row, `org_ai_config`, `books`, `genres`, `billing_events`
- Other orgs' data is completely untouched — all operations scoped by `organization_id`

### Subscription Status

- Learnalot org must have a valid `subscription_status` (`active` or `trialing`) so the `subscriptionGate` middleware doesn't block demo users
- This is set on the org row (which persists across resets) — not part of the snapshot

### AI Recommendations

- Demo org gets a real AI API key configured in `org_ai_config` (persists across resets)
- **Hard cap: 3 recommendation requests per demo JWT** — enough to demo the feature with a couple of students
- Enforced server-side: use the existing `rate_limits` table with a per-user endpoint key (e.g. `ai-rec:{userId}`), counting against a max of 3 per hour. The hourly reset clears Learnalot rate_limits entries along with everything else
- At low traffic, worst-case cost is negligible (rate limit caps token creation at 10/min, 3 calls/token = 30 AI calls/min max)

### Support Tickets

- No special handling needed. Demo-submitted tickets carry the Learnalot `organization_id` and are identifiable. Hourly reset wipes `support_ticket_notes` and `support_tickets` for the Learnalot org

### Security

- Demo tokens cannot be refreshed — no refresh token issued
- 1-hour TTL limits exposure window
- Rate limiting on the demo endpoint prevents token farming
- Demo teacher is a real user row scoped to one org — no elevated permissions, no cross-tenant access
- All existing auth, tenant isolation, and role guards apply normally

## Out of Scope

- Per-session data isolation (v2 if concurrent demo traffic becomes a problem). In v1, simultaneous demo users share the same org data and may see each other's logged sessions — acceptable at low early traffic volumes
- Demo-specific UI chrome (banners, badges) — not needed for v1
- Parent portal demo
- Admin/owner demo experience

## Success Criteria

- Teacher lands on landing page → taps "Try the demo" → immediately in the app with realistic data
- Tours guide them through logging a session, checking stats, seeing AI recommendations
- Everything resets hourly, no maintenance burden
- Zero impact on other orgs' data
