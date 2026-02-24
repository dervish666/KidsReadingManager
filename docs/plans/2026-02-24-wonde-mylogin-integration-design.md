# Wonde + MyLogin Integration Design

**Date**: 2026-02-24
**Status**: Approved

## Summary

Integrate Wonde data sync API and MyLogin OAuth2 SSO into Tally Reading. Schools are pre-provisioned via Wonde webhooks (students, classes, teachers imported from MIS). Teachers and students authenticate via MyLogin SSO, which issues standard Tally JWTs. Email/password login remains for owner account and as fallback.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Auth strategy | Coexist — MyLogin SSO primary for schools, email/password for owner/fallback |
| Onboarding | Pre-provision via `schoolApproved` webhook |
| Role mapping | MyLogin admin→Tally admin, employee→teacher, student→readonly |
| Sync frequency | Daily overnight delta sync + on-demand "Sync Now" button |
| Leaver policy | Soft-delete student (`is_active=0`), preserve reading data |
| Student data scope | Name, class, year group + SEN/PP/EAL/FSM indicators |
| Token storage | Wonde school tokens AES-GCM encrypted in D1 |
| User creation | Lazy — created on first MyLogin login, not pre-provisioned |
| Architecture | Webhook pre-provisions data, MyLogin login creates users by matching Wonde IDs |

## System Architecture

Three new subsystems integrate with the existing codebase:

1. **MyLogin OAuth Routes** (`/api/auth/mylogin/*`) — handle SSO login/callback/logout, issue Tally JWTs
2. **Wonde Sync Service** — webhook handler, API client, full/delta sync logic, cron trigger
3. **Database extensions** — new columns on existing tables + sync tracking table

Key principle: after MyLogin OAuth completes, the system issues a standard Tally JWT. The frontend auth flow (fetchWithAuth, token refresh) works identically for SSO and email/password users.

```
External Services:
  MyLogin (app.mylogin.com) ←→ OAuth2 authorize/token/user/logout
  Wonde API (api.wonde.com) ←→ schools/students/classes/employees

Internal Flow:
  Webhook → org creation → full Wonde sync → data ready
  MyLogin login → match Wonde ID → create user → issue Tally JWT
  Daily cron → delta sync (updated_after) → update D1 tables
```

## Database Schema Changes

### Migration: Add Wonde/MyLogin columns to existing tables

**`organizations` table** — 4 new columns:
- `wonde_school_id TEXT` — Wonde school ID (e.g. "A2032141745"), nullable
- `wonde_school_token TEXT` — AES-GCM encrypted school API token
- `wonde_last_sync_at TEXT` — ISO timestamp of last successful sync
- `mylogin_org_id TEXT` — MyLogin organisation ID

**`users` table** — 3 new columns:
- `mylogin_id TEXT UNIQUE` — MyLogin user ID, nullable for email/password users
- `wonde_employee_id TEXT` — Wonde employee ID for linking
- `auth_provider TEXT DEFAULT 'local'` — `'local'` or `'mylogin'`

**`students` table** — 6 new columns:
- `wonde_student_id TEXT` — Wonde student ID for sync matching
- `sen_status TEXT` — SEN status from Wonde extended_details
- `pupil_premium INTEGER DEFAULT 0` — Pupil Premium indicator
- `eal_status TEXT` — English as Additional Language status
- `fsm INTEGER DEFAULT 0` — Free School Meals indicator
- `year_group TEXT` — National Curriculum year (e.g. "6")

**`classes` table** — 1 new column:
- `wonde_class_id TEXT` — Wonde class ID for sync matching

### Migration: New tables

**`wonde_sync_log`** — tracks sync operations:
```sql
CREATE TABLE IF NOT EXISTS wonde_sync_log (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    sync_type TEXT NOT NULL,        -- 'full', 'delta', 'manual'
    status TEXT NOT NULL,           -- 'running', 'completed', 'failed'
    started_at TEXT NOT NULL,
    completed_at TEXT,
    students_created INTEGER DEFAULT 0,
    students_updated INTEGER DEFAULT 0,
    students_deactivated INTEGER DEFAULT 0,
    classes_created INTEGER DEFAULT 0,
    classes_updated INTEGER DEFAULT 0,
    employees_synced INTEGER DEFAULT 0,
    error_message TEXT,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
```

**`wonde_employee_classes`** — maps Wonde employees to classes (for teacher auto-assignment on first login):
```sql
CREATE TABLE IF NOT EXISTS wonde_employee_classes (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    wonde_employee_id TEXT NOT NULL,
    wonde_class_id TEXT NOT NULL,
    employee_name TEXT,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
```

## MyLogin OAuth2 Flow

### Endpoints

**`GET /api/auth/mylogin/login`** — Login initiation (public)
1. Generate random `state` parameter
2. Store state in KV with 5-min TTL (key: `oauth_state:{state}`)
3. Redirect to `https://app.mylogin.com/oauth/authorize?client_id={MYLOGIN_CLIENT_ID}&redirect_uri={MYLOGIN_REDIRECT_URI}&response_type=code&state={state}`

**`GET /api/auth/mylogin/callback?code=X&state=Y`** — OAuth callback (public)
1. Verify state against KV entry (CSRF protection), delete KV entry
2. Exchange code for token: POST `https://app.mylogin.com/oauth/token` with Basic Auth (`base64(client_id:client_secret)`), body: `{grant_type: 'authorization_code', code, redirect_uri}`
3. Fetch user profile: GET `https://app.mylogin.com/api/user` with `Authorization: Bearer {access_token}`
4. Extract user data: `id`, `first_name`, `last_name`, `email`, `type`, `service_providers.wonde.service_provider_id`, `organisation.wonde_id`
5. Match organization by `wonde_school_id = organisation.wonde_id` OR `mylogin_org_id = organisation.id`
   - Not found → redirect to frontend error page ("School not set up yet")
6. Match or create user by `mylogin_id`:
   - Existing: update name/email, set `last_login_at`
   - New: create with `auth_provider='mylogin'`, `role` mapped from `type`, `password_hash` = random placeholder, `wonde_employee_id` from service_providers
   - For new teachers: look up `wonde_employee_classes` to find and assign their classes
7. Issue Tally JWT (access token + refresh token), set refresh token httpOnly cookie
8. Redirect to `/?auth=callback`

**`POST /api/auth/mylogin/logout`** — Logout (authenticated)
1. Revoke Tally refresh token (same as existing logout)
2. Clear refresh token cookie
3. Return `{logoutUrl: 'https://app.mylogin.com/oauth/logout?client_id={MYLOGIN_CLIENT_ID}'}` — frontend redirects here

### Frontend Changes

**Login page** (`src/components/Login.js`):
- Add "Sign in with MyLogin" button below existing email/password form
- Button navigates to `/api/auth/mylogin/login` (full page navigation, not fetch)
- Use official MyLogin branded button assets (dark rounded variant)

**App.js**:
- On mount, check for `?auth=callback` query param
- If present: remove query param from URL, call `/api/auth/refresh` to complete SSO login
- This fetches the access token using the httpOnly refresh cookie set by the callback

**Logout** (`AppContext.js`):
- If `user.auth_provider === 'mylogin'`, POST to `/api/auth/mylogin/logout`
- Redirect to returned `logoutUrl` to clear MyLogin session
- If `auth_provider === 'local'`, use existing logout flow

### Environment Variables

- `MYLOGIN_CLIENT_ID` — OAuth client ID
- `MYLOGIN_CLIENT_SECRET` — OAuth client secret
- `MYLOGIN_REDIRECT_URI` — `https://tallyreading.uk/api/auth/mylogin/callback`

### New Public Paths

Add to `publicPaths` array in `jwtAuthMiddleware()`:
- `/api/auth/mylogin/login`
- `/api/auth/mylogin/callback`
- `/api/webhooks/wonde`

## Wonde Data Sync

### Webhook Handler

**`POST /api/webhooks/wonde`** — Public endpoint

**`schoolApproved` event**:
1. Validate payload has `payload_type`, `school_id`, `school_name`, `school_token`
2. Create organization: `name = school_name`, `wonde_school_id = school_id`, auto-generate slug
3. Encrypt school_token: `encryptSensitiveData(school_token, JWT_SECRET)`, store in `wonde_school_token`
4. Trigger full sync via `ctx.waitUntil(runFullSync(orgId, schoolToken, schoolId, db))`
5. Return 200

**`accessRevoked` / `accessDeclined` events**:
1. Find org by `wonde_school_id = payload.school_id`
2. Set `is_active = 0` (soft-delete organization)
3. Log reason from payload
4. Return 200

**`schoolMigration` event**:
1. Log the migration details for manual review
2. If `completed_at` is set, trigger a full re-sync
3. Return 200

### Wonde API Client

New file: `src/utils/wondeApi.js`

Functions:
- `wondeRequest(path, schoolToken, params)` — GET with Bearer auth, automatic pagination (follow `meta.pagination.next` until `more === false`)
- `fetchAllStudents(schoolToken, schoolId)` — `/schools/{id}/students?include=education_details,extended_details,classes,year&per_page=200`
- `fetchAllClasses(schoolToken, schoolId)` — `/schools/{id}/classes?include=students,employees&has_students=true&per_page=200`
- `fetchAllEmployees(schoolToken, schoolId)` — `/schools/{id}/employees?include=classes,employment_details&has_class=true&per_page=200`
- `fetchDeletions(schoolToken, schoolId, updatedAfter)` — `/schools/{id}/deletions?type=student&updated_after={date}`
- `fetchSchoolCounts(schoolToken, schoolId)` — `/schools/{id}/counts?include=students,classes,employees`

All functions return fully paginated arrays. Delta variants accept `updatedAfter` parameter.

### Sync Service

New file: `src/services/wondeSync.js`

**`runFullSync(orgId, schoolToken, wondeSchoolId, db)`**:
1. Create `wonde_sync_log` entry with `status='running'`
2. Fetch all classes → upsert `classes` table (match by `wonde_class_id`, create or update)
3. Fetch all students with includes → upsert `students` table:
   - Match by `wonde_student_id` or create new
   - Map: `forename + ' ' + surname` → `name`
   - `education_details.current_nc_year` → `year_group`
   - `extended_details.sen_status` → `sen_status`
   - `extended_details.premium_pupil_indicator` → `pupil_premium` (boolean → 0/1)
   - `extended_details.english_as_additional_language_status` → `eal_status`
   - `extended_details.free_school_meals` → `fsm` (boolean → 0/1)
   - Link to classes via student's `classes` include data
4. Fetch all employees with classes → populate `wonde_employee_classes` table
5. Fetch deletions → set `is_active = 0` on matching students
6. Update `organizations.wonde_last_sync_at`
7. Update sync log with counts and `status='completed'`
8. Respect D1 batch limit: chunk operations at 50 statements per `db.batch()` call

**`runDeltaSync(orgId, schoolToken, wondeSchoolId, db, lastSyncAt)`**:
- Same as full sync but all API calls include `?updated_after={lastSyncAt}`
- Only processes changed records
- Deletions checked with `updated_after` parameter

**`runManualSync(orgId, db, env)`**:
- Decrypt school token from org record
- Delegate to `runFullSync`
- Return sync log entry

### Data Mapping

Wonde field → Tally field:

| Wonde Source | Tally Target |
|--------------|-------------|
| `student.id` | `students.wonde_student_id` |
| `student.forename + ' ' + student.surname` | `students.name` |
| `student.education_details.current_nc_year` | `students.year_group` |
| `student.extended_details.sen_status` | `students.sen_status` |
| `student.extended_details.premium_pupil_indicator` | `students.pupil_premium` |
| `student.extended_details.english_as_additional_language_status` | `students.eal_status` |
| `student.extended_details.free_school_meals` | `students.fsm` |
| `student.classes[].id` | `students.class_id` (primary class) |
| `class.id` | `classes.wonde_class_id` |
| `class.name` | `classes.name` |
| `employee.id` | `wonde_employee_classes.wonde_employee_id` |
| `employee.forename + ' ' + employee.surname` | `wonde_employee_classes.employee_name` |

### Cron Trigger

Extend `wrangler.toml` cron triggers:
```toml
[triggers]
crons = ["0 2 * * *", "0 3 * * *"]  # 2AM streaks, 3AM Wonde sync
```

In `src/worker.js` scheduled handler:
- At 3 AM: query all orgs with `wonde_school_id IS NOT NULL AND is_active = 1`
- For each org: decrypt token, run `runDeltaSync`
- Log results to `wonde_sync_log`

### Admin Sync Endpoint

**`POST /api/wonde/sync`** — requires admin role
- Triggers manual full sync for the requesting user's organization
- Returns sync log entry with counts
- Rate limited: 1 sync per 10 minutes per org

## Error Handling & Edge Cases

**School not yet synced**: MyLogin login before webhook has fired → friendly error page: "Your school is being set up. Please try again in a few minutes."

**Sync failure**: Logged in `wonde_sync_log` with `status='failed'` and `error_message`. Daily cron retries. Manual "Sync Now" available for admins.

**Teacher not in Wonde employee list**: MyLogin login with valid organisation but no matching employee → still create user (they authenticated via MyLogin). No auto-assigned classes; admin assigns manually.

**Student login**: `type='student'` → `role='readonly'`. View-only access to own reading data. Matched to student record via `wonde.service_provider_id` → `wonde_student_id`.

**Duplicate prevention**: `mylogin_id UNIQUE` on users table. `wonde_student_id` used as dedup key for students during sync.

**Token lifecycle**: Wonde school tokens don't expire (revoked only via webhook). MyLogin access tokens (24h) used only during callback, not stored. Tally JWTs handle ongoing auth.

**Owner org switching**: Unchanged. Owner logs in with email/password, switches orgs via `X-Organization-Id` header. Works for Wonde-provisioned orgs.

**Wonde rate limiting**: Wonde API doesn't document explicit rate limits, but we add 100ms delay between paginated requests as a courtesy. Sync operations run sequentially per school.

**D1 batch limits**: All batch operations chunked at 50 statements per `db.batch()` call (conservative, under the 100-statement limit).

## New Files

| File | Purpose |
|------|---------|
| `src/routes/mylogin.js` | MyLogin OAuth routes (login, callback, logout) |
| `src/routes/webhooks.js` | Wonde webhook handler |
| `src/routes/wondeSync.js` | Manual sync endpoint |
| `src/utils/wondeApi.js` | Wonde API client with pagination |
| `src/services/wondeSync.js` | Sync orchestration (full, delta, manual) |
| `src/__tests__/unit/wondeApi.test.js` | Wonde API client tests |
| `src/__tests__/unit/wondeSync.test.js` | Sync service tests |
| `src/__tests__/unit/mylogin.test.js` | MyLogin OAuth flow tests |
| `src/__tests__/integration/wondeWebhook.test.js` | Webhook integration tests |
| `migrations/0024_wonde_mylogin_integration.sql` | Schema migration |

## Modified Files

| File | Changes |
|------|---------|
| `src/worker.js` | Mount new routes, extend cron handler for Wonde sync |
| `src/middleware/tenant.js` | Add new public paths to `jwtAuthMiddleware` |
| `src/components/Login.js` | Add MyLogin SSO button |
| `src/components/App.js` | Handle `?auth=callback` after OAuth redirect |
| `src/contexts/AppContext.js` | SSO-aware logout, store `auth_provider` in user state |
| `wrangler.toml` | Add 3AM cron, add env vars |

## Testing Strategy

1. **Unit tests**: `wondeApi.js` — pagination, error handling, data extraction
2. **Unit tests**: `wondeSync.js` — create/update/deactivate paths, batch chunking, delta sync
3. **Unit tests**: MyLogin OAuth — state verification, code exchange, user matching/creation, role mapping, JWT issuance
4. **Integration tests**: Webhook → sync → login full flow with mocked external APIs
5. **Manual testing**: Against Wonde test school (credentials TBD from Wonde)
6. **MyLogin dev testing**: Using test accounts at "Furlong School" in development mode
