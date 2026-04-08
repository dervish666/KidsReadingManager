# Data Retention Policy

| | |
|---|---|
| **Document Reference** | GDPR-05 |
| **Version** | 0.1 |
| **Status** | DRAFT |
| **Last Updated** | 2026-02-20 |
| **Next Review** | 2027-02-20 |
| **Owner** | Sam Castillo (Director, Scratch IT LTD) |

---

## 1. Purpose and Scope

### 1.1 Purpose

This policy defines the retention periods for all categories of personal data processed by Tally Reading. It ensures compliance with the UK GDPR storage limitation principle (Article 5(1)(e)), which requires that personal data is:

> kept in a form which permits identification of data subjects for no longer than is necessary for the purposes for which the personal data are processed.

This policy exists to:

- Prevent indefinite retention of personal data beyond its useful life
- Ensure data is disposed of securely when no longer needed
- Provide clear, auditable rules for data lifecycle management
- Support data subject rights (erasure under Article 17)
- Reduce the attack surface by minimising stored personal data

### 1.2 Scope

This policy applies to all personal data processed by Tally Reading in its capacity as a data processor on behalf of school controllers. It covers data stored in:

- Cloudflare D1 database (primary data store)
- Cloudflare KV storage (caching and legacy storage)
- Cloudflare R2 object storage (book cover cache)
- Client-side storage (localStorage, sessionStorage)
- Transient processing (API calls to third-party services)

### 1.3 Relationship to Other Documents

This policy should be read alongside:

- Records of Processing Activities (GDPR-04) -- defines what data is processed and why
- Data Processing Agreement (GDPR-01) -- contractual obligations with school controllers
- Privacy Policy (GDPR-02) -- public-facing retention commitments
- Data Protection Impact Assessment (GDPR-03) -- risk analysis for high-risk processing

### 1.4 Definitions

| Term | Meaning |
|---|---|
| **Soft delete** | Record is marked as inactive (e.g., `is_active = 0`) but remains in the database. Can be restored. Still discoverable via direct database query |
| **Hard delete** | Record is permanently removed from the database. Irrecoverable |
| **Anonymisation** | Irreversible removal of identifying fields from a record, retaining non-identifying data for statistical purposes. Anonymised data is no longer personal data under GDPR |
| **Subscription duration** | The period during which a school has an active subscription to Tally Reading |
| **Grace period** | A period after subscription ends during which data is retained to allow for renewal or data export |

---

## 2. Retention Schedule

### 2.1 Current State vs Recommended Retention

The table below documents the retention periods for all data categories. Updated 2026-03-05 to reflect current implementation status.

| Data Category | Specific Data | Storage Location | Retention Period | Cleanup Method | Status | Justification |
|---|---|---|---|---|---|---|
| **Student records** | Name, reading level, reading level range, age range, class assignment, notes, preferences, last read date | D1 `students`, `student_preferences` | Subscription duration + 90 days, then hard delete | Automated daily job | Implemented (soft-deleted records auto hard-deleted after 90 days; individual hard delete via API) | Contract fulfilment. 90-day grace period allows school to renew or request data export |
| **Reading sessions** | Session date, duration, pages read, assessment, rating, notes, book reference, recorded-by user | D1 `reading_sessions` | Subscription duration + 90 days, then hard delete | Cascade-deleted with student records | Implemented | Contract fulfilment. Cascade-deleted with student records |
| **Reading streaks** | Current streak, longest streak, last read date, streak history | D1 `students` columns (`current_streak`, `longest_streak`, `streak_start_date`) | Subscription duration + 90 days, then hard delete | Cascade-deleted with student records | Implemented | Contract fulfilment. Derived from session data |
| **User accounts** | Name, email, role, last login timestamp, active status | D1 `users` | Subscription duration + 90 days, then hard delete | Automated daily job | Implemented (soft-deleted records auto hard-deleted after 90 days; individual hard delete via API) | Contract fulfilment |
| **Password hashes** | PBKDF2 hash (100k iterations, 128-bit salt, 256-bit key) | D1 `users.password_hash` | Until user account hard deletion | Deleted as part of user record | Implemented | Security. Cannot be reversed to plaintext |
| **Refresh tokens** | Token hash, user ID, expiry timestamp, revocation timestamp | D1 `refresh_tokens` | Deleted on expiry or revocation | Automated daily job | Implemented | Expired/revoked tokens serve no purpose |
| **Password reset tokens** | Token hash, user ID, expiry timestamp, used timestamp | D1 `password_reset_tokens` | Deleted on expiry or use | Automated daily job | Implemented | Expired/used tokens serve no purpose |
| **Login attempts** | Email, IP address, user-agent, success/failure, timestamp | D1 `login_attempts` | 30 days, then hard delete | Automated daily job | Implemented | Legitimate interests (security). 30-day window for investigating suspicious patterns |
| **Audit logs** | User ID, organisation ID, IP address, user-agent, action, entity type/ID, timestamp | D1 `audit_log` | Anonymise IP/user-agent after 90 days. Hard delete after 2 years | Automated daily job (two-phase) | Anonymisation: implemented. Hard delete at 2 years: **not yet implemented** | Accountability (Article 5(2)). 2-year period aligns with typical limitation periods |
| **Rate limit entries** | IP address or user identifier, endpoint, timestamp | D1 `rate_limits` | 1 hour, then hard delete | Automated daily job | Implemented | Technical necessity only |
| **Book cover cache (client)** | Cover images stored as data URLs | Browser localStorage | 7 days (TTL-based expiry) | Client-side TTL expiry | Implemented | Performance optimisation. Client-managed, not personal data |
| **Book cover cache (server)** | Cover images in R2 bucket | Cloudflare R2 `book-covers` | 90 days via R2 lifecycle rule | R2 object lifecycle rule | **Not yet configured** | Performance optimisation. Not personal data |
| **AI recommendation cache** | Hashed input (reading profile hash) mapped to AI response | Cloudflare KV `RECOMMENDATIONS_CACHE` | 7 days (KV TTL on write) | KV automatic expiry via `expirationTtl` | Implemented | Performance optimisation. Not directly identifiable (hashed key) |
| **Session storage (client)** | UI state: selected student ID, filters, view preferences | Browser sessionStorage | Browser session (cleared on tab close) | Auto-cleared by browser | Implemented | Functional necessity |
| **Organisation settings** | School name, timezone, reading status thresholds, AI provider config | D1 `org_settings`, `org_ai_config` | Subscription duration + 90 days, then hard delete | Cascade-deleted with organisation | Partially implemented (cascade with org hard delete not yet available) | Contract fulfilment |
| **AI API keys (encrypted)** | School-provided API keys, encrypted at rest | D1 `org_ai_config.api_key_encrypted` | Subscription duration + 90 days, then hard delete | Cascade-deleted with organisation | Partially implemented (cascade with org hard delete not yet available) | Contract fulfilment. Keys belong to the school |
| **Classes** | Class name, year group, teacher assignment | D1 `classes` | Subscription duration + 90 days, then hard delete | Cascade-deleted with organisation | Partially implemented (cascade with org hard delete not yet available) | Contract fulfilment |
| **Book catalog** | Title, author, ISBN, page count, series, publication year, genre, description, cover ID | D1 `books` (global), `org_book_selections` (per-org links) | Books: indefinite (non-personal, shared catalog). Org-book links: subscription duration + 90 days | Automated daily job for org links | Partially implemented (org link cleanup depends on org hard delete) | Books are non-personal bibliographic data |

### 2.2 Summary of Implementation Gaps

The following retention mechanisms have been implemented (via daily cron in `src/worker.js` and application code):

- ~~Refresh token cleanup~~ -- Expired/revoked tokens deleted daily
- ~~Password reset token cleanup~~ -- Expired/used tokens deleted daily
- ~~Login attempt cleanup~~ -- Entries older than 30 days deleted daily
- ~~Rate limit deterministic cleanup~~ -- Entries older than 1 hour deleted daily
- ~~Audit log anonymisation~~ -- IP/user-agent anonymised after 90 days daily
- ~~KV recommendation cache TTL~~ -- 7-day `expirationTtl` set on all cache writes
- ~~Individual hard delete~~ -- Students and users can be permanently erased via API with cascade deletion
- ~~Organisation-level hard delete~~ -- `DELETE /api/organization/:id/purge` cascade-deletes all 26 org-scoped tables, anonymises the org row as a tombstone. Requires owner role + org name confirmation. Also available via nightly cron (90 days after deactivation). See `src/services/orgPurge.js`
- ~~Audit log hard delete~~ -- Scheduled worker deletes audit log entries older than 2 years (`DELETE FROM audit_log WHERE created_at < datetime('now', '-730 days')`)
- ~~Legal hold mechanism~~ -- `legal_hold` column on organisations prevents both automated and manual purging

The following gaps remain:

| Gap | Current State | Required Implementation | Priority |
|---|---|---|---|
| Subscription expiry tracking | No subscription end date stored | Add `subscription_expires_at` column to `organizations` table | High |
| R2 cover cache lifecycle | No lifecycle rule configured | Configure R2 lifecycle rule: delete objects older than 90 days | Medium |
| Bulk data export | No multi-tenant export endpoint | API for controllers to export organisation data in CSV/JSON | Medium |
| Retention monitoring | No visibility into retention job status | Admin dashboard showing data volumes, oldest records, cleanup job status | Low |

---

## 3. Roles and Responsibilities

### 3.1 Data Protection Lead

[TODO: Assign Data Protection Lead]

- Maintains this policy and ensures annual review
- Monitors implementation of retention schedules
- Responds to data subject and controller requests for erasure
- Coordinates with development team on retention automation

### 3.2 Development Team

- Implements automated retention cleanup jobs
- Ensures new features include retention considerations at design stage
- Documents retention behaviour in code and database migrations
- Reports any data that lacks a defined retention period

### 3.3 School Controllers

- Responsible for determining the lawful basis for processing
- May request early deletion of their organisation's data at any time
- Should inform Tally Reading when a student leaves the school (so data can be purged in accordance with their instructions)
- Must inform data subjects (parents/guardians) of retention periods via their own privacy notices

---

## 4. Data Disposal Methods

### 4.1 Soft Delete

**What it is:** Setting `is_active = 0` on a record. The record remains in the database but is excluded from application queries by convention (all queries include `WHERE is_active = 1`).

**Current usage:** `organizations`, `users`, `students`, `classes`

**GDPR assessment:** Soft delete alone does **not** constitute erasure under Article 17. The data remains identifiable and recoverable. Soft delete is acceptable as an interim step (e.g., to allow undo or grace period) but must be followed by hard delete within the defined retention period.

**Risk:** If a query omits the `WHERE is_active = 1` filter, "deleted" records become visible. This is documented as a known gotcha in the project's development guidelines.

### 4.2 Hard Delete

**What it is:** Permanent removal of the record from the database via `DELETE` statement.

**Current usage:** `reading_sessions` (CASCADE from student delete)

**GDPR assessment:** Hard delete satisfies erasure requirements. D1 uses SQLite with auto-vacuum enabled in production (confirmed by Cloudflare engineering). `secure_delete` is not available, so freed pages are not zeroed — but all D1 storage is AES-256-GCM encrypted at rest. Deleted data remains recoverable via Time Travel for up to 30 days (paid plan), after which bookmarks expire and historical state is no longer accessible. For erasure documentation: logical deletion is immediate; physical byte overwrite timing is indeterminate; Time Travel recovery window is 30 days.

**Implementation note:** D1 batch operations are limited to 100 statements. Cascade deletions of large organisations must be chunked. See existing pattern in `src/routes/books.js`.

### 4.3 Anonymisation

**What it is:** Irreversibly replacing identifying fields with generic values (e.g., `'anonymised'`) while retaining the non-identifying structure of the record.

**Current usage:** Not currently implemented.

**Recommended usage:** Audit logs after 90 days (anonymise `ip_address` and `user_agent` fields while retaining `action`, `entity_type`, `entity_id`, and `created_at` for accountability).

**GDPR assessment:** Properly anonymised data is no longer personal data and falls outside the scope of GDPR. The anonymisation must be irreversible -- it must not be possible to re-identify the data subject by combining the remaining fields with other available data.

**Consideration for audit logs:** After anonymisation, audit log entries will still contain `user_id` and `organization_id`. These are internal UUIDs that identify individuals only in combination with the `users` table. Once the user account itself is hard-deleted (at subscription end + 90 days), the `user_id` in orphaned audit logs becomes a non-identifying reference to a deleted record. This two-phase approach (anonymise network data at 90 days, retain until user deletion renders IDs non-identifying, then hard delete at 2 years) provides a reasonable balance between accountability and minimisation.

### 4.4 Automatic Expiry

**What it is:** Data that expires automatically via platform mechanisms (KV TTL, R2 lifecycle rules, browser storage expiry).

**Current usage:** Client-side localStorage cache (7-day TTL), sessionStorage (browser session).

**Recommended usage:** KV recommendation cache (7-day TTL), R2 cover cache (90-day lifecycle rule).

**GDPR assessment:** Automatic expiry is the most reliable disposal method as it requires no application-level implementation after initial configuration. Preferred where platform support exists.

---

## 5. Data Subject and Controller Requests

### 5.1 Right to Erasure (Article 17)

When a school controller requests deletion of their data:

1. **Immediate soft delete:** Mark the organisation and all associated records as inactive
2. **Data export:** Provide data export if requested (within 30 days per Article 12(3))
3. **Hard delete:** Permanently delete all organisation data within 30 days of the request, or immediately if no export is needed
4. **Confirmation:** Provide written confirmation of deletion to the controller
5. **Sub-processors:** Notify relevant sub-processors (AI providers do not retain data from transient API calls; confirm with email provider)

When a school requests deletion of an individual student's data:

1. Hard delete the student record and all associated data (sessions, preferences, streaks)
2. This should cascade automatically via foreign key constraints
3. Confirm deletion to the school within 30 days

[TODO: Implement a controller-facing "delete my organisation" function and a "delete student" API endpoint that performs hard delete (not just soft delete).]

### 5.2 Right to Data Portability (Article 20)

Schools may request export of their data in a structured, machine-readable format. The application should support export of:

- Student records (CSV/JSON)
- Reading session history (CSV/JSON)
- Book catalog and selections (CSV/JSON)

[TODO: Implement bulk data export endpoint for controllers.]

---

## 6. Exceptions

### 6.1 Legal Holds

If Tally Reading receives a legal hold notice, litigation preservation request, or regulatory investigation order:

- Retention schedules are suspended for the data covered by the hold
- The Data Protection Lead must be notified immediately
- Affected data must be preserved regardless of normal retention periods
- Legal holds override automated deletion jobs (implementation: add a `legal_hold` flag to the organisation record that prevents automated cleanup)
- Legal holds must be reviewed quarterly and lifted as soon as the obligation ends

### 6.2 Regulatory Requirements

Data may be retained beyond standard periods if required by:

- UK law enforcement requests (Data Protection Act 2018, Schedule 2)
- ICO investigation or audit requirements
- Tax or financial record-keeping obligations (if applicable to billing data)
- Safeguarding obligations under the Children Act 1989/2004 (if Tally Reading becomes aware of safeguarding concerns through data it processes)

### 6.3 Anonymised Data for Analytics

Anonymised, aggregated data (e.g., total reading sessions per school per month, average reading levels by year group) may be retained indefinitely as it does not constitute personal data. Any analytics aggregation must be verified to ensure it cannot be re-identified, particularly for small cohorts (e.g., a class of 5 students where individual patterns may be distinguishable).

---

## 7. Review Schedule

This policy must be reviewed:

| Trigger | Action |
|---|---|
| **Annually** (next: 2027-02-20) | Full review of all retention periods, disposal methods, and implementation status |
| **New data category introduced** | Add to retention schedule before processing begins |
| **Sub-processor change** | Review whether sub-processor retention aligns with this policy |
| **Data breach** | Review whether retention periods contributed to the breach scope; adjust if necessary |
| **Legal/regulatory change** | Review affected retention periods (e.g., new UK data protection legislation) |
| **Controller request** | Review if the request reveals a gap in the policy |

### 7.1 Review History

| Review Date | Reviewer | Changes Made |
|---|---|---|
| 2026-02-20 | [TODO: Name] | Initial draft created. Documented current state and recommended retention periods. Identified 10 implementation gaps |

---

## 8. Implementation Roadmap

The following implementation work remains to bring the application into full compliance with this policy. Items are ordered by priority.

#### Completed

The following items have been implemented:

- **Daily cleanup scheduled worker** -- Cron trigger (02:00 UTC) runs retention cleanup: expired refresh tokens, expired password reset tokens, login attempts older than 30 days, rate limit entries older than 1 hour, expired OAuth states (`src/worker.js`)
- **KV TTL on recommendation cache writes** -- `expirationTtl: 604800` (7 days) set on all `RECOMMENDATIONS_CACHE.put()` calls (`src/utils/recommendationCache.js`)
- **Audit log anonymisation job** -- Scheduled worker anonymises IP/user-agent in audit logs older than 90 days (`src/worker.js`)
- **Hard delete for individual erasure requests** -- Students and users can be permanently deleted via API with cascade deletion of associated data and audit log anonymisation (`src/routes/students.js`, `src/routes/users.js`)
- **Auto hard-delete of soft-deleted records** -- Scheduled worker hard-deletes soft-deleted students, users, and empty organisations after 90-day retention period (`src/worker.js`)
- **Organisation-level cascade hard delete** -- `DELETE /api/organization/:id/purge` endpoint cascade-deletes all 26 org-scoped tables in FK-safe order, then anonymises the org row as a tombstone. Requires owner role + org name confirmation. Also runs automatically via nightly cron for orgs inactive 90+ days. Legal hold flag prevents purging. (`src/services/orgPurge.js`, `src/routes/organization.js`, `src/worker.js`)
- **Audit log hard delete job** -- Scheduled worker deletes audit log entries older than 2 years (`src/worker.js`)
- **Legal hold mechanism** -- `legal_hold` column on organisations table; checked by both manual purge endpoint and automated cron; prevents all data deletion when set (`migrations/0047_org_purge_columns.sql`)

#### Remaining

### Phase 1: Medium Priority

1. **Bulk data export endpoint** -- API for controllers to export their organisation's data in CSV/JSON (required for Article 20 data portability)

### Phase 2: Lower Priority

2. **Retention monitoring dashboard** -- Admin view showing data volumes, oldest records, and cleanup job status

---

*This document is maintained as part of Tally Reading's UK GDPR compliance programme. It should be read alongside the Records of Processing Activities (GDPR-04), Data Processing Agreement (GDPR-01), Privacy Policy (GDPR-02), and Data Protection Impact Assessment (GDPR-03).*
