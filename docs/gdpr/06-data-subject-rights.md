# Data Subject Rights Procedures

**Document Reference:** GDPR-06
**Status:** DRAFT
**Version:** 0.1
**Last Updated:** 2026-02-20
**Owner:** `[TODO: Data Protection Officer / Responsible Person]`
**Review Date:** `[TODO: Set annual review date]`

---

## 1. Purpose

This document describes how Tally Reading ("Tally") handles data subject rights requests under the UK General Data Protection Regulation (UK GDPR). As a data processor, Tally assists data controllers (schools) in fulfilling their obligations to data subjects.

### 1.1 Controller-Processor Relationship

- **Data Controllers:** Schools using Tally Reading to track student reading progress.
- **Data Processor:** Tally Reading (operated by `[TODO: Legal entity name]`), which processes personal data on behalf of schools.
- **Data Subjects:** Students (children aged 4-11), school staff (teachers, admins), and parents/carers.

Because students are children, their data rights are exercised by the school (as controller) acting on requests from parents/carers. Tally does not accept rights requests directly from parents or students -- all requests must come through the school.

### 1.2 Scope

This procedure covers all personal data processed by Tally Reading across its technical infrastructure:

- **D1 Database (Cloudflare):** All structured data (students, users, reading sessions, preferences, audit logs, classes, organisations)
- **KV Storage (Cloudflare):** AI recommendation cache (hashed keys, expires within 7 days)
- **R2 Storage (Cloudflare):** Cached book cover images (no personal data)
- **Application Logs:** Cloudflare Workers runtime logs (transient, not persisted beyond Cloudflare's standard retention)

---

## 2. Right of Access -- Subject Access Request (Article 15)

Data subjects have the right to obtain confirmation of whether their personal data is being processed and, if so, access to that data along with supplementary information.

### 2.1 Who Can Request

| Requester | Route | Notes |
|-----------|-------|-------|
| Parent/Carer (on behalf of child) | Via school (controller) | School verifies parental identity and forwards request to Tally |
| School staff member (own data) | Via school admin or directly to Tally support | Staff may request their own data directly |
| School admin (on behalf of organisation) | Via API or support channel | For any data subject within their organisation |

### 2.2 Request Channels

1. **Authenticated API request** from a school admin or owner (preferred)
2. **Email** to `[TODO: privacy@tallyreading.uk]` from a verified school contact
3. **Support portal** at `[TODO: support URL]`

### 2.3 Verification

Before processing any SAR, Tally verifies:

1. **Request origin:** Must come from an authenticated school admin/owner account, or from a verified school contact email address on file.
2. **Authority:** The requester must have admin or owner role within the relevant organisation, or be the data subject themselves (for staff data).
3. **Subject identification:** The school must provide sufficient detail to identify the data subject (student ID, name, or user email).

Tally does not verify the identity of parents/carers -- this is the school's responsibility as controller.

### 2.4 Technical Execution -- Student Data

Query the following D1 tables for the identified student:

```sql
-- Core student record
SELECT * FROM students WHERE id = ? AND organization_id = ?;

-- Reading sessions
SELECT rs.*, b.title AS book_title, b.author AS book_author
FROM reading_sessions rs
LEFT JOIN books b ON rs.book_id = b.id
WHERE rs.student_id = ?;

-- Genre preferences
SELECT sp.*, g.name AS genre_name
FROM student_preferences sp
LEFT JOIN genres g ON sp.genre_id = g.id
WHERE sp.student_id = ?;

-- Class membership
SELECT c.name AS class_name, c.year_group
FROM classes c
WHERE c.id = (SELECT class_id FROM students WHERE id = ?);
```

**Data included in response:**

| Category | Fields | Source Table |
|----------|--------|-------------|
| Identity | name, class, year group, age range | `students`, `classes` |
| Reading profile | reading level (min/max), current book, notes | `students` |
| Reading history | session dates, books read, duration, pages, assessment, rating, notes | `reading_sessions` |
| Preferences | genre likes and dislikes | `student_preferences` |
| Streaks | current streak, longest streak, streak start date | `students` |
| Metadata | created date, last read date, last updated | `students` |

**Data NOT included** (not personal data of the student):

- Book catalogue data (global, not personal)
- Organisation settings
- Other students' data

### 2.5 Technical Execution -- Staff Data

Query the following D1 tables for the identified user:

```sql
-- Core user record (excluding password_hash)
SELECT id, organization_id, email, name, role, is_active,
       last_login_at, created_at, updated_at
FROM users WHERE id = ? AND organization_id = ?;

-- Audit log entries (actions performed by this user)
SELECT * FROM audit_log WHERE user_id = ?;

-- Active refresh tokens (existence only, not token values)
SELECT id, created_at, expires_at, revoked_at
FROM refresh_tokens WHERE user_id = ?;

-- Login attempts
SELECT id, ip_address, success, created_at
FROM login_attempts WHERE email = ?;
```

**Data included in response:**

| Category | Fields | Source Table |
|----------|--------|-------------|
| Identity | name, email, role | `users` |
| Account | active status, created date, last login | `users` |
| Activity | audit log entries (actions, timestamps, IP addresses) | `audit_log` |
| Authentication | login attempt history (timestamps, success/failure, IP) | `login_attempts` |
| Sessions | refresh token metadata (created, expires, revoked -- not token values) | `refresh_tokens` |

### 2.6 Response Format

Data is provided in one of the following formats, as requested by the controller:

- **JSON** (default): Structured export with clear field labels and nested relationships
- **CSV**: Flat file(s) with one file per data category (student record, sessions, preferences)

### 2.7 Timeline

| Step | Deadline | Responsible |
|------|----------|-------------|
| Request received from controller | Day 0 | School (controller) |
| Tally acknowledges request | 1 business day | Tally |
| Tally provides data export to controller | 5 business days | Tally |
| Controller provides data to data subject | Within 1 calendar month of original request | School (controller) |

The 5-business-day internal SLA ensures the controller has adequate time to review and deliver the data within their 1-month statutory deadline.

### 2.8 Process Flow

```
Request received from school (controller)
        |
        v
Verify requester identity and authority
        |
        v
Identify data subject in Tally system
        |
        v
[Student or Staff?]
   |            |
   v            v
Query         Query
student       user
tables        tables
   |            |
   v            v
Compile data export (JSON/CSV)
        |
        v
Review export for completeness
        |
        v
Deliver to controller via secure channel
        |
        v
Log request in DSR register
        |
        v
Confirm completion to controller
```

---

## 3. Right to Rectification (Article 16)

Data subjects have the right to have inaccurate personal data corrected and incomplete data completed.

### 3.1 Self-Service Rectification

Most data can be corrected directly by the school through the Tally dashboard:

| Data Type | Who Can Edit | How |
|-----------|-------------|-----|
| Student name, class, notes, age range | Teacher, Admin, Owner | Student profile in dashboard |
| Student reading level range | Teacher, Admin, Owner | Student profile in dashboard |
| Reading session details | Teacher who recorded it, Admin, Owner | Session edit in dashboard |
| Genre preferences | Teacher, Admin, Owner | Student preferences in dashboard |
| Staff name | The user themselves, Admin, Owner | Account settings |
| Staff email | Admin, Owner | User management |

### 3.2 Support-Assisted Rectification

For data that cannot be modified through the UI:

1. School contacts Tally support with the correction required.
2. Tally verifies the request originates from an authorised school contact.
3. Tally makes the correction directly in the D1 database.
4. Tally confirms the correction to the school.

**Examples requiring support assistance:**

- Correcting historical audit log entries that contain inaccurate information
- Modifying data in edge cases where the UI does not permit the change
- Bulk corrections across multiple records

### 3.3 Technical Execution

```sql
-- Example: Correct a student's name
UPDATE students
SET name = ?, updated_at = datetime('now')
WHERE id = ? AND organization_id = ?;
```

All modifications are timestamped via the `updated_at` column. Audit logging captures who made the change, when, and what was changed.

### 3.4 Timeline

| Step | Deadline |
|------|----------|
| Self-service correction | Immediate |
| Support-assisted correction acknowledged | 1 business day |
| Support-assisted correction completed | 3 business days |

### 3.5 Process Flow

```
Rectification request received
        |
        v
[Can school self-serve?]
   |              |
   Yes            No
   |              |
   v              v
School edits   School contacts
via dashboard  Tally support
   |              |
   v              v
Change saved   Verify request
automatically  origin + authority
   |              |
   |              v
   |           Execute correction
   |           in D1 database
   |              |
   v              v
Audit log records the change
        |
        v
Confirm to controller
        |
        v
Log in DSR register
```

---

## 4. Right to Erasure -- Right to be Forgotten (Article 17)

Data subjects have the right to have their personal data erased in certain circumstances.

### 4.1 Current Implementation Status

> **IMPORTANT:** As of 2026-02-20, the Tally system uses **soft delete** (`is_active = 0`) for students and users. Soft-deleted records remain in the database. To comply with erasure requests, **hard delete** functionality must be implemented.
>
> `[TODO: Implement hard delete API endpoints for GDPR erasure. Track via issue/ticket reference.]`

### 4.2 Grounds for Erasure

Erasure is required when:

- The data is no longer necessary for its original purpose
- Consent is withdrawn (where consent was the lawful basis)
- The data subject objects and there are no overriding legitimate grounds
- The data was unlawfully processed
- Erasure is required to comply with a legal obligation

**Exceptions** (erasure may be refused):

- Legal obligation to retain the data (unlikely for reading progress data)
- Establishment, exercise, or defence of legal claims

### 4.3 Technical Execution -- Student Erasure

The following data must be permanently deleted (hard delete) for a student erasure request:

```sql
-- 1. Delete genre preferences
DELETE FROM student_preferences WHERE student_id = ?;

-- 2. Delete reading sessions
DELETE FROM reading_sessions WHERE student_id = ?;

-- 3. Delete the student record
DELETE FROM students WHERE id = ? AND organization_id = ?;
```

**Additional cleanup:**

| Data Store | Action | Notes |
|------------|--------|-------|
| `audit_log` | Anonymise entries referencing this student | Replace entity_id with `[REDACTED]` where entity_type = 'student' |
| KV recommendation cache | No selective purge possible | Cache entries expire automatically within 7 days. Cache keys are hashed and cannot be mapped back to individual students. |
| Cloudflare Workers logs | No action required | Transient runtime logs; not persisted beyond Cloudflare's standard retention period |

### 4.4 Technical Execution -- User (Staff) Erasure

```sql
-- 1. Delete refresh tokens
DELETE FROM refresh_tokens WHERE user_id = ?;

-- 2. Delete password reset tokens
DELETE FROM password_reset_tokens WHERE user_id = ?;

-- 3. Delete login attempts (by email)
DELETE FROM login_attempts WHERE email = ?;

-- 4. Anonymise audit log entries
UPDATE audit_log
SET user_id = NULL, details = '[REDACTED]'
WHERE user_id = ?;

-- 5. Unlink from recorded reading sessions (preserve session data for students)
UPDATE reading_sessions
SET recorded_by = NULL
WHERE recorded_by = ?;

-- 6. Unlink from classes (preserve class for remaining students)
UPDATE classes
SET teacher_id = NULL
WHERE teacher_id = ?;

-- 7. Delete the user record
DELETE FROM users WHERE id = ? AND organization_id = ?;
```

### 4.5 Known Limitations

| Limitation | Detail | Mitigation |
|------------|--------|------------|
| AI recommendation cache | KV cache uses hashed keys (student profile + reading level + genres). Individual entries cannot be identified or selectively purged. | Cache TTL is 7 days maximum. After expiry, no trace of the student remains in the cache. Document this in the DPA. |
| Audit log integrity | Deleting audit log entries may compromise the integrity of the audit trail. | Anonymise rather than delete: set `user_id = NULL` and replace identifiable details with `[REDACTED]`. |
| Soft delete migration | Current soft delete must be replaced with hard delete for erasure compliance. | `[TODO: Implement hard delete endpoints with appropriate authorisation checks.]` |
| Backup retention | `[TODO: Document Cloudflare D1 backup/snapshot retention period and erasure process.]` | Erasure is effective from the live database immediately; backups rotate out per Cloudflare's retention schedule. |

### 4.6 Timeline

| Step | Deadline |
|------|----------|
| Erasure request received from controller | Day 0 |
| Tally acknowledges request | 1 business day |
| Erasure executed | 10 business days |
| Confirmation sent to controller | Within 30 calendar days of original request |
| KV recommendation cache fully expired | Up to 7 days after erasure |

### 4.7 Process Flow

```
Erasure request received from school (controller)
        |
        v
Verify requester identity and authority
        |
        v
Assess validity (grounds for erasure, exceptions)
        |
        v
[Valid request?]
   |          |
   No         Yes
   |          |
   v          v
Inform      Identify all data
controller  for the data subject
with        across all tables
reasons          |
                 v
            Execute hard delete
            (per Section 4.3 or 4.4)
                 |
                 v
            Anonymise audit log entries
                 |
                 v
            Verify deletion is complete
                 |
                 v
            Log erasure in DSR register
                 |
                 v
            Confirm completion to controller
            (include note re: 7-day KV cache expiry)
```

---

## 5. Right to Restriction of Processing (Article 18)

Data subjects have the right to restrict the processing of their personal data in certain circumstances (e.g., while accuracy is being verified, or if processing is unlawful but the subject opposes erasure).

### 5.1 When Restriction Applies

- The accuracy of the data is contested (pending verification)
- Processing is unlawful but the subject opposes erasure
- Tally no longer needs the data but the subject needs it for legal claims
- The subject has objected to processing pending verification of legitimate grounds

### 5.2 Current Implementation Status

> **IMPORTANT:** The current schema does not include a dedicated restriction flag. The `is_active` column serves a different purpose (soft delete) and should not be repurposed for restriction.
>
> `[TODO: Add processing_restricted BOOLEAN DEFAULT 0 column to students and users tables. Create migration 0023_add_processing_restricted.sql.]`

### 5.3 Technical Approach

When restriction is implemented:

```sql
-- Restrict processing for a student
UPDATE students
SET processing_restricted = 1, updated_at = datetime('now')
WHERE id = ? AND organization_id = ?;

-- Restrict processing for a user
UPDATE users
SET processing_restricted = 1, updated_at = datetime('now')
WHERE id = ? AND organization_id = ?;
```

**Effect of restriction:**

- Data is retained in the database but excluded from all processing.
- Restricted students do not appear in class lists, reports, or AI recommendations.
- Restricted users cannot log in or perform any actions.
- Data is only accessible for the specific purpose agreed with the controller (e.g., legal claims).
- Application code must check `processing_restricted = 0` in all queries that process personal data.

### 5.4 Lifting Restriction

When the grounds for restriction no longer apply:

1. Controller notifies Tally that restriction should be lifted.
2. Tally sets `processing_restricted = 0`.
3. Data subject is informed by the controller before restriction is lifted.

### 5.5 Timeline

| Step | Deadline |
|------|----------|
| Restriction request received | Day 0 |
| Restriction applied | 2 business days |
| Confirmation sent to controller | 3 business days |

### 5.6 Process Flow

```
Restriction request received from controller
        |
        v
Verify requester identity and authority
        |
        v
Assess grounds for restriction
        |
        v
[Valid request?]
   |          |
   No         Yes
   |          |
   v          v
Inform      Set processing_restricted = 1
controller       |
with             v
reasons     Verify data is excluded
            from all processing
                 |
                 v
            Log in DSR register
                 |
                 v
            Confirm to controller
```

---

## 6. Right to Data Portability (Article 20)

Data subjects have the right to receive their personal data in a structured, commonly used, and machine-readable format, and to have that data transmitted to another controller.

### 6.1 Scope

Data portability applies to:

- Data provided by the data subject (or observed from their use of the service)
- Where processing is based on consent or contract
- Where processing is carried out by automated means

**In practice for Tally:** Student reading data, preferences, and profile information are all portable. Book catalogue data (global) is not personal data and is excluded.

### 6.2 Export Format

**JSON export** (primary format):

```json
{
  "exportDate": "2026-02-20T12:00:00Z",
  "exportVersion": "1.0",
  "dataSubject": {
    "type": "student",
    "id": "student-uuid",
    "name": "Student Name",
    "ageRange": "7-8",
    "readingLevelMin": 2.5,
    "readingLevelMax": 3.5,
    "currentStreak": 5,
    "longestStreak": 12,
    "className": "Year 3 Foxes",
    "yearGroup": "3",
    "notes": "..."
  },
  "readingSessions": [
    {
      "date": "2026-02-15",
      "bookTitle": "The Gruffalo",
      "bookAuthor": "Julia Donaldson",
      "bookIsbn": "9781509804757",
      "durationMinutes": 15,
      "pagesRead": 32,
      "assessment": "independent",
      "rating": 5,
      "notes": "Read with good expression"
    }
  ],
  "genrePreferences": {
    "likes": ["Fantasy", "Adventure"],
    "dislikes": ["Horror"]
  }
}
```

**CSV export** (alternative): One CSV file per data category with headers matching the JSON field names.

### 6.3 Technical Execution

```sql
-- Student record
SELECT s.*, c.name AS class_name, c.year_group
FROM students s
LEFT JOIN classes c ON s.class_id = c.id
WHERE s.id = ? AND s.organization_id = ?;

-- Reading sessions with book details
SELECT rs.session_date, rs.duration_minutes, rs.pages_read,
       rs.assessment, rs.rating, rs.notes,
       COALESCE(b.title, rs.book_title) AS book_title,
       b.author AS book_author, b.isbn
FROM reading_sessions rs
LEFT JOIN books b ON rs.book_id = b.id
WHERE rs.student_id = ?
ORDER BY rs.session_date DESC;

-- Genre preferences
SELECT g.name AS genre_name, sp.preference_type
FROM student_preferences sp
JOIN genres g ON sp.genre_id = g.id
WHERE sp.student_id = ?;
```

### 6.4 Transmission

When a school requests data to transfer to another system:

1. Tally generates the export in the requested format.
2. Export is delivered to the controller via secure channel (encrypted email, secure download link, or API response).
3. If the receiving system has an import API, Tally will assist with format compatibility where reasonable.

### 6.5 Timeline

| Step | Deadline |
|------|----------|
| Portability request received | Day 0 |
| Export generated and delivered | 5 business days |
| Within controller's statutory deadline | 1 calendar month |

### 6.6 Process Flow

```
Portability request received from controller
        |
        v
Verify requester identity and authority
        |
        v
Determine scope (which student/user, what data)
        |
        v
Determine format (JSON or CSV)
        |
        v
Execute queries, compile export
        |
        v
Review export for completeness
        |
        v
Deliver via secure channel
        |
        v
Log in DSR register
        |
        v
Confirm to controller
```

---

## 7. Right to Object (Article 21)

Data subjects have the right to object to processing of their personal data based on legitimate interests or for direct marketing purposes.

### 7.1 Applicability to Tally

| Processing Activity | Objection Applicable? | Notes |
|---------------------|----------------------|-------|
| Core reading tracking | No | Necessary for contract performance (school's subscription) |
| AI book recommendations | Yes | Based on profiling (reading level, preferences, history) |
| Audit logging | No | Necessary for legitimate interests (security, accountability) |
| Reading streak calculation | Potentially | Could be considered profiling; low impact |

### 7.2 AI Recommendations (Primary Objection Scenario)

AI-powered book recommendations analyse a student's reading level, genre preferences, and reading history to suggest books. This constitutes profiling under Article 4(4) of UK GDPR.

**How objection is handled:**

1. The school (controller) notifies Tally that a parent objects to AI profiling for a specific student.
2. Tally disables AI recommendations for that student.
3. The student can still use all other features of the platform.

**Technical implementation:**

- AI recommendations are already optional per school (controlled via organisation settings).
- Per-student opt-out: `[TODO: Add ai_recommendations_disabled BOOLEAN DEFAULT 0 to students table, or use student_preferences to record the objection.]`
- The recommendation engine in `src/routes/books.js` must check this flag before generating recommendations.

### 7.3 Timeline

| Step | Deadline |
|------|----------|
| Objection received from controller | Day 0 |
| AI recommendations disabled for subject | 2 business days |
| Confirmation to controller | 3 business days |

### 7.4 Process Flow

```
Objection received from controller
        |
        v
Verify requester identity and authority
        |
        v
Identify processing activity objected to
        |
        v
[Compelling legitimate grounds?]
   |              |
   Yes            No
   |              |
   v              v
Inform        Disable the
controller    specific processing
(with              |
justification)     v
              Confirm to controller
                   |
                   v
              Log in DSR register
```

---

## 8. Rights Related to Automated Decision-Making (Article 22)

Data subjects have the right not to be subject to a decision based solely on automated processing, including profiling, which produces legal effects or similarly significantly affects them.

### 8.1 Tally's Position

**Tally does not make automated decisions with legal or significant effects.**

The only automated processing in Tally is AI-powered book recommendations. These are:

- **Suggestions only:** Recommendations are presented to the teacher, who decides which books to assign. The AI never makes a final decision.
- **No legal effects:** Book recommendations have no legal consequences for the student.
- **No significant effects:** Recommendations do not determine educational outcomes, grades, class placement, or any other matter with significant effects on the child.
- **Human oversight:** A teacher always reviews and acts on (or ignores) the recommendation. The system provides options, not decisions.

### 8.2 Transparency

Schools and parents should be informed that:

1. AI recommendations are generated using the student's reading level range, genre preferences, and reading history.
2. Recommendations are produced by external AI providers (Anthropic, OpenAI, or Google, as configured by the school).
3. Student data sent to AI providers is limited to: reading level range, genre preferences, books already read, and focus mode (balanced/consolidation/challenge). No names or other identifying information are sent to AI providers.
4. Teachers always make the final book selection.

### 8.3 Process Flow

```
Request for information about automated decisions
        |
        v
Provide explanation of AI recommendation system
        |
        v
Confirm: no solely automated decisions
with legal/significant effects
        |
        v
Offer to disable AI recommendations
if parent objects (see Section 7)
        |
        v
Log in DSR register
```

---

## 9. DSR Register

All data subject rights requests must be logged in a central register, regardless of the right exercised or the outcome.

### 9.1 Register Template

| Field | Description |
|-------|-------------|
| Reference number | Unique identifier (e.g., DSR-2026-001) |
| Date received | Date Tally received the request |
| Requesting organisation | School name and organisation ID |
| Requester | Name and role of person making request |
| Data subject type | Student / Staff |
| Data subject identifier | Student ID or user email (redact after resolution) |
| Right exercised | Access / Rectification / Erasure / Restriction / Portability / Objection / Automated Decision |
| Description | Brief description of the request |
| Date acknowledged | Date Tally acknowledged the request |
| Date completed | Date the request was fulfilled |
| Outcome | Completed / Partially completed / Refused (with reason) |
| Notes | Any additional context, limitations, or follow-up actions |
| Handled by | Tally team member who processed the request |

### 9.2 Retention

DSR register entries are retained for **3 years** after the request is resolved, to demonstrate accountability to the ICO if required. After 3 years, entries are anonymised (data subject identifiers removed).

`[TODO: Determine storage location for DSR register -- spreadsheet, internal tool, or database table.]`

---

## 10. Response Templates

### 10.1 Acknowledgement Template

```
Subject: Data Subject Rights Request -- Acknowledged [DSR-XXXX-XXX]

Dear [School Contact],

We acknowledge receipt of your data subject rights request dated [DATE].

Request type: [Right exercised]
Data subject: [Student/Staff identifier as provided]
Reference: [DSR-XXXX-XXX]

We will process this request and respond within [X] business days.

If we require any additional information to locate or verify the data
subject, we will contact you promptly.

Regards,
[TODO: Name]
Tally Reading
[TODO: privacy@tallyreading.uk]
```

### 10.2 Completion Template

```
Subject: Data Subject Rights Request -- Completed [DSR-XXXX-XXX]

Dear [School Contact],

Your data subject rights request [DSR-XXXX-XXX] has been completed.

Request type: [Right exercised]
Action taken: [Description of what was done]
Date completed: [DATE]

[If access/portability: Data export is attached / available at secure link.]
[If erasure: All personal data has been permanently deleted from our
live systems. Cached data (AI recommendations) will expire within 7 days.]
[If restriction: Processing has been restricted. Data is retained but
excluded from all processing until you notify us to lift the restriction.]

If you have any questions, please contact us at [TODO: privacy@tallyreading.uk].

Regards,
[TODO: Name]
Tally Reading
```

---

## 11. Escalation

If Tally cannot fulfil a request within the stated timelines, or if there is a dispute about the validity of a request:

1. `[TODO: Incident Response Lead]` is notified within 1 business day of the delay.
2. The controller is informed of the delay and given a revised timeline.
3. If the dispute cannot be resolved, the controller is advised to contact the ICO.

**ICO Contact:**

- Website: ico.org.uk
- Telephone: 0303 123 1113
- Address: Information Commissioner's Office, Wycliffe House, Water Lane, Wilmslow, Cheshire SK9 5AF

---

## 12. Review and Updates

This document is reviewed:

- **Annually** as part of the GDPR compliance review cycle
- **After any data subject rights request** that reveals gaps in the process
- **After any system change** that affects how personal data is stored or processed (e.g., new database tables, new data stores)

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-02-20 | `[TODO]` | Initial draft |
