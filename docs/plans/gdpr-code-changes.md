# Tally Reading — GDPR Code Changes Implementation Plan

**Scratch IT LTD** | Prepared: 25 February 2026 | Ref: GDPR-CODE-PLAN-001

---

## Overview

This document details the code changes required to bring Tally Reading into full compliance with UK GDPR. Each section covers a discrete workstream with implementation steps, affected files, and priority. Items are ordered by GDPR risk — highest priority first.

The changes fall into a new database migration (0025), route-level endpoint additions, middleware enhancements, frontend UI updates, and scheduled task additions. Many already have partial implementations; this plan addresses the gaps.

| Metric | Value |
|--------|-------|
| Total workstreams | 9 |
| New migration file | migrations/0025_gdpr_compliance.sql |
| New route file | src/routes/dataRights.js |
| Estimated total effort | 5–7 development days |
| High priority items | 5 (must-have before schools go live) |
| Medium priority items | 3 |
| Low priority items | 1 |

---

## 1. Database Migration

Create `migrations/0025_gdpr_compliance.sql` to add all GDPR-related columns and tables in a single migration. This underpins every other workstream.

### Schema Changes

| Table | Column | Type | Purpose |
|-------|--------|------|---------|
| students | processing_restricted | INTEGER DEFAULT 0 | Article 18 restriction flag |
| students | ai_opt_out | INTEGER DEFAULT 0 | Per-student AI opt-out |
| organizations | consent_given_at | TEXT (datetime) | When school accepted DPA terms |
| organizations | consent_version | TEXT | Version of DPA accepted |
| organizations | consent_given_by | TEXT | User ID who accepted the DPA |
| data_rights_log | (new table) | See below | Audit trail for SAR / erasure requests |
| wonde_erased_students | (new table) | See below | Exclusion list for Wonde re-sync prevention |

### data_rights_log Table

Dedicated table for tracking data subject rights requests, separate from the general audit log. This gives you a clear, queryable record for ICO reporting if needed.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| organization_id | TEXT NOT NULL | Tenant scoping |
| request_type | TEXT NOT NULL | access \| erasure \| rectification \| restriction \| portability |
| subject_type | TEXT NOT NULL | student \| user |
| subject_id | TEXT NOT NULL | FK to students or users |
| requested_by | TEXT | User who initiated the request |
| status | TEXT DEFAULT 'pending' | pending \| in_progress \| completed \| rejected |
| completed_at | TEXT | When the request was fulfilled |
| notes | TEXT | Free-text notes on the request |
| created_at | TEXT DEFAULT now | Request timestamp |

### wonde_erased_students Table

Prevents Wonde sync from re-creating students that have been erased via GDPR Article 17 requests. When a student with a `wonde_student_id` is erased, their Wonde ID is recorded here so the sync skips them.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| organization_id | TEXT NOT NULL | Tenant scoping |
| wonde_student_id | TEXT NOT NULL | The Wonde ID to exclude from sync |
| erased_at | TEXT DEFAULT now | When the erasure was performed |

---

## 2. Hard Delete — Right to Erasure

| Task | Priority | Complexity | Key Files |
|------|----------|------------|-----------|
| Add DELETE /api/students/:id/erase endpoint | High | Medium | routes/students.js |
| Hard-delete reading_sessions for student | High | Low | routes/students.js |
| Hard-delete student_preferences | High | Low | routes/students.js |
| Hard-delete the student row itself | High | Low | routes/students.js |
| Add DELETE /api/users/:id/erase endpoint | High | Medium | routes/users.js |
| Revoke refresh tokens + hard-delete user | High | Low | routes/users.js |
| Log erasure in data_rights_log | High | Low | routes/students.js, users.js |
| Add confirmation step (require `{ "confirm": true }` in request body) | Medium | Low | routes/students.js, users.js |
| Add erased Wonde ID to exclusion list | High | Low | routes/students.js |

### Implementation Notes

The existing soft-delete endpoints (PUT is_active = 0) should remain for day-to-day use. The normal workflow for Wonde-synced schools is: school removes student from MIS → Wonde sync stops including them → student goes inactive in Tally → 90-day auto-purge cleans up. The /erase endpoints are specifically for urgent GDPR Article 17 requests (max 30-day response deadline) and perform irreversible hard deletion.

1. Guard the endpoint with `requireAdmin()` — only admins and owners should process erasure requests.
2. Require `{ "confirm": true }` in the request body (not a query parameter — cleaner for DELETE requests and avoids proxy/logging issues with query strings).
3. Delete in order: reading_sessions → student_preferences → students (respecting FK constraints).
4. Use a D1 `batch()` call (within the 100-statement limit) to make it atomic.
5. Write to data_rights_log with request_type = 'erasure' before performing the delete.
6. If the student has a `wonde_student_id`, insert it into `wonde_erased_students` so the next Wonde sync skips them. This handles the edge case where the school hasn't yet removed the student from their MIS.
7. Return a 200 with a summary of deleted record counts (not the deleted data itself).

**Important:** Audit log entries referencing the deleted student/user should be anonymised: replace `entity_id` with `'erased'` AND scrub the `details` JSON field to remove any PII (student name, etc.). The audit trail of the erasure action itself is preserved, but personal data within it is not.

---

## 3. Subject Access Request Export

| Task | Priority | Complexity | Key Files |
|------|----------|------------|-----------|
| Add GET /api/students/:id/export endpoint | High | Medium | routes/students.js |
| Include student profile data | High | Low | routes/students.js |
| Include all reading_sessions with book titles | High | Medium | routes/students.js |
| Include student_preferences (genres) | High | Low | routes/students.js |
| Include relevant audit_log entries | Medium | Low | routes/students.js |
| Return with Content-Disposition header | High | Low | routes/students.js |
| Support multiple formats via `?format=` query param | Medium | Low | routes/students.js |
| Add GET /api/users/:id/export for staff SAR | Medium | Medium | routes/users.js |
| Log SAR in data_rights_log | High | Low | routes/students.js, users.js |

### Implementation Notes

Article 15 requires providing all personal data held on a data subject in a commonly used, machine-readable format.

### Export formats

Support via `?format=json` (default), `?format=csv`:
- **JSON**: Full structured export, ideal for machine processing and portability
- **CSV**: Flattened tabular format, easier for schools to open in Excel and hand to parents

### Student export payload structure:

- **student:** name, class, year group, reading levels, SEN/PP/EAL/FSM flags, notes, created/updated dates
- **preferences:** array of genre preferences
- **reading_sessions:** array with date, book title, book author, assessment, notes, recorded_by
- **audit_trail:** array of audit log entries referencing this student
- **metadata:** export date, organization name, data controller identity

For CSV format, flatten into two sheets/sections: student profile (single row) and reading sessions (one row per session). Include metadata as a header comment.

**Access control:** `requireAdmin()` for student exports (schools process their own SARs). `requireOwner()` for user exports.

---

## 4. Processing Restriction Flag

| Task | Priority | Complexity | Key Files |
|------|----------|------------|-----------|
| Add processing_restricted column (migration) | High | Low | migrations/0025 |
| Add PUT /api/students/:id/restrict endpoint | High | Low | routes/students.js |
| Block session creation for restricted students | High | Medium | routes/students.js |
| Block AI recommendations for restricted students | High | Low | routes/books.js |
| Show visual indicator on restricted students | Medium | Medium | StudentCard.js, StudentList.js |
| Log restriction changes in data_rights_log | Medium | Low | routes/students.js |

### Implementation Notes

Article 18 gives data subjects the right to restrict processing. When restricted, you may store the data but must not process it further. In practice this means:

- The student still appears in class lists (storage is permitted)
- No new reading sessions can be recorded against them
- No AI recommendations generated for them
- Existing session data is preserved but excluded from statistics

**Check location:** Add the restriction check in the session creation handler in `routes/students.js` (POST /api/students/:id/sessions) and in the recommendations handler in `routes/books.js` (POST /api/books/recommendations).

---

## 5. Per-Student AI Opt-Out

| Task | Priority | Complexity | Key Files |
|------|----------|------------|-----------|
| Add ai_opt_out column (migration) | High | Low | migrations/0025 |
| Add toggle in StudentProfile component | High | Medium | StudentProfile.js |
| Check ai_opt_out before generating recommendations | High | Low | routes/books.js |
| Return clear message when opted out | Medium | Low | routes/books.js |
| Exclude opted-out students from batch operations | Medium | Low | services/aiService.js |

### Implementation Notes

This is distinct from processing_restricted. A student can have AI opt-out enabled while still having reading sessions recorded normally. Schools may want to use the reading tracker without AI features for specific students, for example where a parent objects to AI processing.

**UI placement:** Add a toggle switch in `src/components/students/StudentProfile.js` alongside existing student settings. Label it clearly: "AI Book Recommendations" with helper text explaining that disabling this prevents the student's reading data from being sent to AI providers.

**API check:** In `routes/books.js` at the recommendations endpoint (~line 408), after fetching the student profile, check if ai_opt_out is set. If so, return a 200 with an empty recommendations array and a message field explaining opt-out is active.

---

## 6. Audit Logging Expansion

| Task | Priority | Complexity | Key Files |
|------|----------|------------|-----------|
| Add auditLog() to student CRUD routes | Medium | Low | routes/students.js |
| Add auditLog() to session creation/deletion | Medium | Low | routes/students.js |
| Add auditLog() to class management routes | Low | Low | routes/classes.js |
| Add auditLog() to book import operations | Low | Low | routes/books.js |
| Add auditLog() to settings changes | Medium | Low | routes/settings.js, organization.js |
| Log data rights requests (SAR, erasure) | High | Low | routes/dataRights.js or inline |

### Implementation Notes

Currently, audit logging only covers user CRUD operations (create, update, delete in routes/users.js). Student operations, session recording, and settings changes are unlogged. For GDPR accountability (Article 5(2)), you need to demonstrate what data was accessed and changed.

**Pattern:** The existing `auditLog()` middleware in `src/middleware/tenant.js` works well. Just add it to the route definitions in the same way it's already used in routes/users.js. For example:

```javascript
studentsRouter.post('/', requireTeacher(), auditLog('create', 'student'), async (c) => { ... })
```

**Scope:** Focus on student and session routes first (High/Medium priority), as these involve children's personal data. Class and book operations are lower priority since they don't directly contain personal data.

---

## 7. Privacy Policy in App UI

| Task | Priority | Complexity | Key Files |
|------|----------|------------|-----------|
| Add privacy policy link to app footer/Header | Medium | Low | Header.js or App.js |
| Add privacy policy link to LandingPage footer | Medium | Low | LandingPage.js |
| Add privacy link before email signup form | Medium | Low | LandingPage.js |
| Add privacy/terms links to Login page | Medium | Low | Login.js |
| Host privacy policy at /privacy route | Medium | Medium | App.js, new component |

### Implementation Notes

UK GDPR Article 13 requires that privacy information is provided at the point of data collection. The landing page email signup and login page are the two primary collection points.

- **Landing page:** Add a footer section with links to Privacy Policy and Terms of Service. Add a note near the email signup: "By signing up, you agree to our Privacy Policy."
- **Login page:** Add a discrete link to the privacy policy below the login form.
- **Authenticated app:** Add a privacy policy link in the Settings page (SettingsPage.js) or as a persistent footer link.
- Consider serving the privacy policy as a React route (/privacy) that renders the content from docs/gdpr/01-privacy-policy.md, or simply link to a hosted version on your website.

---

## 8. Remaining Data Retention Items

The daily cron already handles token cleanup, login attempt purging, audit log IP anonymisation, and rate limit cleanup (added 25 Feb 2026). The remaining items are:

| Task | Priority | Complexity | Key Files |
|------|----------|------------|-----------|
| Auto hard-delete soft-deleted students after 90 days | Medium | Low | worker.js |
| Auto hard-delete soft-deleted users after 90 days | Medium | Low | worker.js |
| Auto hard-delete inactive orgs after 90 days | Medium | Low | worker.js |

### Implementation Notes

The 90-day auto-deletion of soft-deleted records is the most important item here. When a school removes a student or deactivates a user, the soft-deleted record currently sits in the database indefinitely. Add to the scheduled handler:

Delete students where is_active = 0 and updated_at < 90 days ago, cascading through reading_sessions and student_preferences. Same pattern for users (cascade through refresh_tokens). For organizations, check that no active users or students remain before deletion.

**Caution:** The cascading delete for students should follow the same deletion order as the /erase endpoint (sessions → preferences → student) to respect FK constraints within the D1 batch limit.

---

## 9. DPA Consent Recording

| Task | Priority | Complexity | Key Files |
|------|----------|------------|-----------|
| Add consent_given_by column (migration) | High | Low | migrations/0025 |
| Add POST /api/organization/dpa-consent endpoint | High | Low | routes/organization.js |
| Add GET /api/organization/dpa-consent endpoint | Medium | Low | routes/organization.js |
| Add DPA acceptance UI for admin on first login | High | Medium | New component or modal |
| Block data processing until DPA is accepted | Medium | Medium | middleware/tenant.js |

### Implementation Notes

The `consent_given_at`, `consent_version`, and `consent_given_by` columns on `organizations` need an actual mechanism to populate them. Without this, you have the schema but no proof of consent.

**Flow:**
1. When an admin user first accesses the app (or when DPA version changes), show a modal requiring them to review and accept the Data Processing Agreement.
2. The modal should display a summary of the DPA terms with a link to the full document, and a checkbox "I confirm I have authority to accept this agreement on behalf of my school."
3. On acceptance, POST to `/api/organization/dpa-consent` which records `consent_given_at`, `consent_version` (e.g. "1.0"), and `consent_given_by` (the user ID).
4. Guard with `requireAdmin()` — only admin or owner roles should accept the DPA.

**Enforcement:** Optionally, add a check in `tenantMiddleware()` that returns a 403 with a `dpa_required` flag if the organization has no consent recorded. The frontend can use this to redirect to the DPA acceptance flow. This ensures no data processing happens without a signed DPA on file.

---

## Recommended Implementation Order

Work through these in dependency order. The migration must come first as everything else relies on the new columns and table.

| Step | Workstream | Est. Effort | Depends On |
|------|-----------|-------------|------------|
| 1 | Database migration (0025) | 1 hour | Nothing |
| 2 | Hard delete / erasure endpoints | 3–4 hours | Migration |
| 3 | SAR export endpoints (JSON + CSV) | 4–5 hours | Migration |
| 4 | Processing restriction flag | 2–3 hours | Migration |
| 5 | AI opt-out | 2 hours | Migration |
| 6 | DPA consent recording | 3–4 hours | Migration |
| 7 | Audit logging expansion | 1–2 hours | Nothing |
| 8 | Privacy policy UI links | 1–2 hours | Nothing |
| 9 | Retention automation (soft-delete cleanup) | 1–2 hours | Steps 2–3 (same deletion logic) |

---

## Testing Guidance

Each workstream should include unit tests in `src/__tests__/unit/`. Key test scenarios:

- **Hard delete:** verify all related records are removed, verify audit log entry is created, verify it requires admin role
- **SAR export:** verify all data categories are included, verify tenant isolation (can't export another org's student), verify JSON structure
- **Processing restriction:** verify sessions can't be created, verify AI recommendations blocked, verify flag persists across requests
- **AI opt-out:** verify recommendations return empty when opted out, verify toggle updates the database
- **DPA consent:** verify consent is recorded with timestamp/version/user, verify non-admin roles are blocked, verify enforcement check works
- **Wonde exclusion:** verify erased Wonde student IDs are recorded, verify sync skips excluded IDs
- **Retention:** verify soft-deleted records are purged after 90 days, verify active records are untouched

---

## Complete File Reference

All files that will be created or modified:

| Action | File | Change |
|--------|------|--------|
| CREATE | migrations/0025_gdpr_compliance.sql | New columns + data_rights_log + wonde_erased_students tables |
| MODIFY | src/routes/students.js | Erase + export + restrict endpoints, Wonde exclusion on erase |
| MODIFY | src/routes/users.js | Erase + export endpoints |
| MODIFY | src/routes/books.js | AI opt-out + restriction checks |
| MODIFY | src/routes/organization.js | DPA consent endpoints + auditLog() middleware |
| MODIFY | src/worker.js | Retention cleanup in scheduled handler |
| MODIFY | src/services/wondeSync.js | Check wonde_erased_students exclusion list during sync |
| MODIFY | src/components/students/StudentProfile.js | AI opt-out toggle |
| MODIFY | src/components/students/StudentCard.js | Restriction visual indicator |
| CREATE | src/components/DpaConsentModal.js | DPA acceptance modal for admins |
| MODIFY | src/components/Header.js | Privacy policy link |
| MODIFY | src/components/LandingPage.js | Privacy policy footer + signup notice |
| MODIFY | src/components/Login.js | Privacy policy link |
| MODIFY | src/routes/classes.js | Add auditLog() middleware |
| MODIFY | src/routes/settings.js | Add auditLog() middleware |
