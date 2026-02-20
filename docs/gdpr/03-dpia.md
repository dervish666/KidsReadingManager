# Data Protection Impact Assessment (DPIA)

## Tally Reading -- Student Reading Progress Tracker

| Field | Value |
|---|---|
| **Document Status** | DRAFT -- Requires DPO and legal review before finalisation |
| **Version** | 0.1 |
| **Date** | 2026-02-20 |
| **Author** | [TODO: Name and role of person completing this DPIA] |
| **DPO Reviewer** | [TODO: DPO name or external DPO service] |
| **Next Review Date** | 2027-02-20 (annual) or on significant system change |
| **ICO Registration** | [TODO: ICO registration reference number] |

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [Description of Processing](#2-description-of-processing)
3. [Necessity and Proportionality Assessment](#3-necessity-and-proportionality-assessment)
4. [Risk Assessment](#4-risk-assessment)
5. [Mitigation Measures](#5-mitigation-measures)
6. [Residual Risk Assessment](#6-residual-risk-assessment)
7. [DPO Consultation and Sign-Off](#7-dpo-consultation-and-sign-off)
8. [Review Schedule](#8-review-schedule)
9. [Appendices](#9-appendices)

---

## 1. Purpose and Scope

### 1.1 Why This DPIA Is Required

This DPIA is required under UK GDPR Article 35 because the processing meets multiple criteria on the ICO's screening checklist:

- **Processing children's data at scale.** Tally Reading processes personal data of primary school pupils (typically ages 4-11) across potentially hundreds of schools and thousands of students per school.
- **Systematic monitoring.** The application systematically tracks reading behaviour over time: session frequency, duration, pages read, assessment outcomes, location (school/home), and reading streaks.
- **Automated profiling and decision-making.** AI-powered book recommendations use student profiles (name, reading level, genre preferences, reading history, likes/dislikes) to generate personalised suggestions. This constitutes automated profiling of children under Article 22.
- **Large-scale processing.** The multi-tenant SaaS architecture is designed to serve hundreds of schools simultaneously, each with potentially thousands of students.

### 1.2 Scope

This DPIA covers all personal data processing performed by the Tally Reading application, including:

- Student reading data collection and storage
- Staff account management and authentication
- AI-powered book recommendation generation
- Audit logging and security monitoring
- Data import/export operations
- Automated reading streak calculations (daily cron job)

### 1.3 Controller and Processor Relationship

| Role | Entity | Basis |
|---|---|---|
| **Data Controller** | Each subscribing school | The school determines the purposes and means of processing student data |
| **Data Processor** | Tally (operated by [TODO: legal entity name]) | Tally processes data on behalf of schools under a Data Processing Agreement |
| **Sub-Processors** | Cloudflare, Inc. (infrastructure); Anthropic / OpenAI / Google (AI, optional, BYOK) | See Section 2.5 |

---

## 2. Description of Processing

### 2.1 Purpose of Processing

Tally Reading enables UK primary schools to:

1. Track individual student reading sessions (what was read, when, for how long, assessment of reading ability)
2. Maintain reading level records (Accelerated Reader levels 1.0-13.0) to match students to appropriate books
3. Manage a school book library with per-school visibility controls
4. Generate AI-powered book recommendations based on student reading profiles (optional feature)
5. Monitor reading habits via streaks and session history to identify students who may need additional support
6. Provide class-wide home reading registers for quick daily data entry

### 2.2 Categories of Data Subjects

| Category | Typical Age | Estimated Scale |
|---|---|---|
| **Students** (primary data subjects) | 4-11 years | Thousands per school, hundreds of schools |
| **School staff** (teachers, admins) | Adults | 3-50 per school |

### 2.3 Categories of Personal Data

#### 2.3.1 Student Data

| Data Field | Example | Storage Location | Retention |
|---|---|---|---|
| Full name | "Emma Thompson" | D1 `students.name` | Until school requests deletion |
| Class assignment | "Year 3 - Oak" | D1 `students.class_id` (FK) | Until school requests deletion |
| Reading level (min/max) | AR 2.5 - 3.8 | D1 `students.reading_level_min`, `reading_level_max` | Until school requests deletion |
| Age range | "7-8" | D1 `students.age_range` | Until school requests deletion |
| Likes (free text) | '["dragons", "funny books"]' | D1 `students.likes` (JSON) | Until school requests deletion |
| Dislikes (free text) | '["scary stories"]' | D1 `students.dislikes` (JSON) | Until school requests deletion |
| Teacher notes (free text) | "Needs extra support with phonics" | D1 `students.notes` | Until school requests deletion |
| Reading session date | "2026-02-15" | D1 `reading_sessions.session_date` | Until school requests deletion |
| Session duration | 20 minutes | D1 `reading_sessions.duration_minutes` | Until school requests deletion |
| Pages read | 15 | D1 `reading_sessions.pages_read` | Until school requests deletion |
| Reading assessment | "independent" / "struggling" / "needs_help" | D1 `reading_sessions.assessment` | Until school requests deletion |
| Session location | "school" / "home" | D1 `reading_sessions.location` | Until school requests deletion |
| Session notes (free text) | "Read aloud confidently" | D1 `reading_sessions.notes` | Until school requests deletion |
| Session rating | 1-5 | D1 `reading_sessions.rating` | Until school requests deletion |
| Book preferences | Genre IDs (like/dislike) | D1 `student_preferences` | Until school requests deletion |
| Current book | Book ID reference | D1 `students.current_book_id` | Until school requests deletion |
| Reading streak | 12 days current, 28 days longest | D1 `students.current_streak`, `longest_streak` | Derived, recalculated daily |
| Last read date | "2026-02-14" | D1 `students.last_read_date` | Derived from sessions |

#### 2.3.2 Staff Data

| Data Field | Example | Storage Location | Retention |
|---|---|---|---|
| Full name | "Mrs. Davies" | D1 `users.name` | Until account deactivation + [TODO: retention period] |
| Email address | "j.davies@school.sch.uk" | D1 `users.email` | Until account deactivation + [TODO: retention period] |
| Password hash | PBKDF2 (100,000 iterations, SHA-256) | D1 `users.password_hash` | Until account deactivation |
| Role | "teacher" / "admin" / "owner" / "readonly" | D1 `users.role` | Until account deactivation |
| Last login timestamp | "2026-02-15T09:30:00Z" | D1 `users.last_login_at` | Until account deactivation |
| Account creation date | "2026-01-10T08:00:00Z" | D1 `users.created_at` | Until account deactivation |

#### 2.3.3 Security and Audit Data

| Data Field | Example | Storage Location | Retention |
|---|---|---|---|
| IP address | "203.0.113.42" | D1 `audit_log.ip_address`, `login_attempts.ip_address` | **No automatic expiry (risk -- see Section 4)** |
| User agent | "Mozilla/5.0 ..." | D1 `audit_log.user_agent`, `login_attempts.user_agent` | **No automatic expiry (risk -- see Section 4)** |
| Login attempt email | "j.davies@school.sch.uk" | D1 `login_attempts.email` | Cleaned after 24 hours (probabilistic -- see Section 4) |
| Audit log actions | "create student", "update session" | D1 `audit_log.action`, `entity_type` | **No automatic expiry (risk -- see Section 4)** |
| Refresh token hashes | SHA-256 hash | D1 `refresh_tokens.token_hash` | Revoked on logout/password change, **but rows persist (risk)** |
| Password reset token hashes | SHA-256 hash | D1 `password_reset_tokens.token_hash` | Marked as used, **but rows persist (risk)** |
| Rate limit records | IP/user + endpoint + timestamp | D1 `rate_limits` | 1% probabilistic cleanup of entries > 1 hour old |

### 2.4 Data Flows

#### 2.4.1 Standard Reading Data Flow

```
Teacher (browser)
    |
    | HTTPS (TLS 1.3, Cloudflare edge)
    v
Cloudflare Worker (src/worker.js)
    |
    | JWT validation (15-min access token)
    | Tenant isolation (organization_id scoping)
    | RBAC check (owner > admin > teacher > readonly)
    |
    v
Cloudflare D1 Database (SQLite)
    |
    | All queries scoped: WHERE organization_id = ?
    |
    v
Data stored in Cloudflare D1
(Region: [TODO: confirm EU/UK jurisdiction -- currently unspecified])
```

#### 2.4.2 AI Recommendation Flow (Optional, BYOK)

```
Teacher requests recommendations for a student
    |
    v
Worker builds student profile (src/utils/studentProfile.js):
    - Student name  <-- RISK: unnecessary for recommendations
    - Reading level (min/max)
    - Age range
    - Favourite genres
    - Likes/dislikes
    - Recent books read (titles + authors)
    - Inferred genre preferences
    |
    v
Profile sent to AI provider via prompt (src/services/aiService.js):
    - Anthropic API (api.anthropic.com)
    - OpenAI API (api.openai.com)
    - Google Gemini API (generativelanguage.googleapis.com)
    |
    | HTTPS to third-party API servers
    | Using school's own API key (BYOK model)
    | API key stored AES-GCM encrypted in D1
    |
    v
AI response: 4-5 book recommendations (title, author, reason)
    |
    v
Cached in Cloudflare KV (RECOMMENDATIONS_CACHE)
    - Key: hash of profile inputs (level, genres, focus mode)
    - TTL: 7 days
    - Does NOT cache student name
```

**Critical finding:** The AI prompt in `src/services/aiService.js` (lines 59, 344, 356) includes the student's name (`${studentProfile.name}` / `${student.name}`). This transmits a child's name to third-party AI providers (Anthropic, OpenAI, or Google) hosted outside the UK. This is unnecessary for generating book recommendations and should be removed. See Risk (b) in Section 4.

#### 2.4.3 Book Cover Flow

```
Browser requests book cover
    |
    v
Worker checks Cloudflare R2 bucket (cached covers)
    |-- Cache hit: serve from R2 via CDN edge
    |-- Cache miss: fetch from OpenLibrary (openlibrary.org)
        |
        v
        Store in R2, serve to browser
```

No personal data is transmitted in this flow. Lookups use book identifiers (ISBN, OpenLibrary ID) only.

#### 2.4.4 CSV Import Flow

```
Teacher uploads CSV file (school book list or student list)
    |
    v
Client-side parsing (browser JavaScript)
    |
    v
POST to /api/books/import/preview (deduplication check)
POST to /api/books/import/confirm (create/link books)
    |
    v
D1 database (scoped to organization)
```

### 2.5 Sub-Processors

| Sub-Processor | Purpose | Data Accessed | Location | Transfer Mechanism |
|---|---|---|---|---|
| **Cloudflare, Inc.** | Infrastructure: Workers compute, D1 database, KV storage, R2 object storage, CDN, DNS | All data | US-headquartered; edge nodes worldwide; D1 region [TODO: confirm if EU/UK location directive applied] | UK adequacy decision for US (UK Extension to EU-US Data Privacy Framework) [TODO: confirm Cloudflare's participation] |
| **Anthropic** (optional) | AI book recommendations | Student name, reading level, age range, genre preferences, likes/dislikes, recent books read | US (San Francisco) | BYOK model -- school's own API key. Data sent only when teacher explicitly requests AI recommendations. [TODO: confirm Anthropic's DPA/SCCs] |
| **OpenAI** (optional) | AI book recommendations | Same as Anthropic | US | BYOK model. Same conditions as Anthropic. [TODO: confirm OpenAI's DPA] |
| **Google** (optional) | AI book recommendations (Gemini) | Same as Anthropic | US | BYOK model. Same conditions as Anthropic. [TODO: confirm Google Cloud DPA] |
| **OpenLibrary** (Internet Archive) | Book metadata lookup (ISBN, title, author, cover images) | Book identifiers only (ISBN, title) -- no personal data | US | No personal data transferred |

### 2.6 Lawful Basis for Processing

| Processing Activity | Lawful Basis | Notes |
|---|---|---|
| Core reading tracking | **Article 6(1)(b) Contract** -- necessary for performance of contract between school and Tally | School subscribes to track reading progress; this is the core service |
| AI recommendations | **Article 6(1)(a) Consent** via school (controller) | Optional feature. School enables it and provides own API key. [TODO: Confirm with legal whether school consent is sufficient or whether parental consent is needed given children's data is sent to third parties] |
| Staff account management | **Article 6(1)(b) Contract** | Necessary for staff to access the service |
| Audit logging | **Article 6(1)(f) Legitimate interests** | Security monitoring, breach detection, accountability. Balanced against data subject rights -- see proportionality assessment in Section 3 |
| Login attempt tracking | **Article 6(1)(f) Legitimate interests** | Brute force protection. Time-limited (24h cleanup) |
| Reading streak calculation | **Article 6(1)(b) Contract** | Core motivational feature of the service |

**Note on children's data and consent:** Under UK GDPR, the age of digital consent is 13 (Privacy and Electronic Communications Regulations). As students are aged 4-11 and the controller is the school (not the child), parental consent is not directly required for the core service. The school processes data under its own lawful basis (public task under Article 6(1)(e) or legitimate interests). However, the school as controller must ensure parents are informed via its own privacy notice. [TODO: Legal review required to confirm this analysis, particularly for AI processing involving international data transfers.]

---

## 3. Necessity and Proportionality Assessment

This section evaluates each category of personal data against the principle of data minimisation (Article 5(1)(c): data shall be adequate, relevant, and limited to what is necessary).

### 3.1 Student Identification Data

| Field | Necessity | Proportionality Assessment | Less Intrusive Alternative? |
|---|---|---|---|
| **Student name** | **Necessary** for core functionality. Teachers must identify students by name to record reading sessions. | Proportionate. Without names, the system would be unusable. | Pseudonymised identifiers were considered but rejected -- teachers need to see real names to record sessions efficiently during class time. |
| **Class assignment** | **Necessary.** Enables teachers to filter students by class for efficient data entry (e.g., Home Reading Register is class-based). | Proportionate. Core organisational feature. | No less intrusive alternative. |

### 3.2 Reading Assessment Data

| Field | Necessity | Proportionality Assessment | Less Intrusive Alternative? |
|---|---|---|---|
| **Reading level (min/max)** | **Necessary.** Core functionality for matching books to student ability. AR levels 1.0-13.0 drive the recommendation engine and library search filtering. | Proportionate. This is the primary purpose of the application. | Broader bands (e.g., "beginner/intermediate/advanced") would reduce precision but also reduce the application's core value. Current approach uses industry-standard AR levels. |
| **Age range** | **Moderately necessary.** Used for age-appropriate book recommendations. | Could be less precise. A free-text field ("7-8") is more data than needed. | Could be derived from class/year group assignment rather than stored separately. **Recommendation: Consider removing this field and deriving age-appropriateness from year group.** |
| **Session date** | **Necessary.** Core tracking data. Enables trend analysis, streak calculation, and "last read" indicators. | Proportionate. | No alternative. |
| **Duration (minutes)** | **Moderately necessary.** Useful for understanding reading stamina but not essential. | Proportionate for educational tracking. | Could be made optional. Currently nullable in the database. |
| **Pages read** | **Moderately necessary.** Provides reading pace context. | Proportionate. | Could be made optional. Currently nullable. |
| **Assessment** | **Necessary.** "Struggling" / "needs_help" / "independent" indicators are core to identifying students who need support. | Proportionate. Standard educational practice. | Three-level scale is already minimal. |
| **Session location** | **Moderately necessary.** Distinguishes school reading from home reading, supporting the Home Reading Register feature. | Proportionate for its purpose. | Could be removed without losing core functionality. Useful for schools that run home reading programmes. |
| **Session rating** | **Optional.** Enjoyment rating (1-5). Not yet fully integrated in the UI. | Low necessity currently. | Feature is optional and does not need to be collected. |

### 3.3 Preference and Behavioural Data

| Field | Necessity | Proportionality Assessment | Less Intrusive Alternative? |
|---|---|---|---|
| **Likes (free text)** | **Optional.** Improves AI recommendation quality by understanding what engages the student. | Proportionate when AI features are enabled. Free text allows flexibility but is not validated. | Could be limited to predefined categories rather than free text to reduce risk of sensitive data entry. |
| **Dislikes (free text)** | **Optional.** Same as likes. | Same assessment. | Same recommendation. |
| **Genre preferences** | **Moderately necessary.** Structured preference data (genre IDs with like/dislike type) feeds both library search and AI recommendations. | Proportionate. Uses controlled vocabulary (genre list). | No less intrusive alternative for this structured data. |
| **Reading streaks** | **Derived data.** Calculated from session dates by a daily cron job (`streakCalculator.js`). Not directly entered. | Proportionate. Motivational feature using already-collected session dates. | Could be calculated on-demand rather than stored, but pre-calculation improves performance for dashboards. |
| **Current book** | **Necessary.** Persists which book a student is currently reading across sessions, supporting the Home Reading Register. | Proportionate. | No alternative. |

### 3.4 High-Risk Fields

| Field | Necessity | Risk Assessment | Recommendation |
|---|---|---|---|
| **Teacher notes (free text)** (`students.notes`, `reading_sessions.notes`) | Useful for educational context but **high risk**. Free text fields with no input validation or content guidance. | **Teachers may inadvertently record SEN status, medical conditions, behavioural issues, safeguarding concerns, or family circumstances.** This could constitute special category data under Article 9 without the school being aware. | **Recommendation:** (1) Provide clear guidance to schools that notes fields should only contain reading-related observations. (2) Include a tooltip/placeholder in the UI warning: "Reading observations only -- do not record medical, SEN, or safeguarding information here." (3) Document this in the DPA and school onboarding materials. |
| **Student name sent to AI** | **Unnecessary.** The student's name is included in AI prompts (`buildPrompt()` and `buildBroadSuggestionsPrompt()` in `aiService.js`) but is not required for generating book recommendations. | Student names are transmitted to third-party AI providers (Anthropic, OpenAI, Google) hosted in the US. This is a child's personally identifiable information leaving the Tally platform unnecessarily. | **Recommendation: Remove student name from AI prompts immediately.** Replace with a generic reference (e.g., "this student" or "the reader"). This is the single highest-priority remediation item in this DPIA. |

### 3.5 Staff Data Proportionality

| Field | Necessity | Assessment |
|---|---|---|
| **Name** | Necessary for identification within the school. | Proportionate. |
| **Email** | Necessary for authentication (login identifier), password reset. | Proportionate. |
| **Password hash** | Necessary for authentication. Stored as PBKDF2 hash (100,000 iterations, SHA-256, 128-bit salt). | Proportionate. Never stored in plaintext. |
| **Role** | Necessary for RBAC (4-tier: owner, admin, teacher, readonly). | Proportionate. |
| **Last login timestamp** | Useful for account management and security monitoring. | Proportionate. Could be moved to audit log only if minimisation is prioritised. |

---

## 4. Risk Assessment

### 4.1 Risk Scoring Methodology

Following ICO guidance, each risk is assessed on two dimensions:

- **Likelihood:** Remote (unlikely to occur) | Possible (could occur) | Probable (likely to occur)
- **Severity:** Minimal (inconvenience) | Significant (distress or financial loss) | Severe (physical or psychological harm) | Critical (danger to life or permanent harm)

**Overall risk** is derived from the combination:

| | Minimal | Significant | Severe | Critical |
|---|---|---|---|---|
| **Probable** | Medium | High | Very High | Very High |
| **Possible** | Low | Medium | High | Very High |
| **Remote** | Low | Low | Medium | High |

### 4.2 Risk Register

#### Risk (a): Unauthorised access to children's reading data (data breach)

| Dimension | Assessment |
|---|---|
| **Description** | An attacker gains access to the D1 database or API and exfiltrates student personal data (names, reading levels, reading history, teacher notes). |
| **Likelihood** | **Possible.** The application uses multiple security layers (JWT, RBAC, tenant isolation, rate limiting) but as a cloud-hosted SaaS, it is an attractive target. A compromised teacher credential or API vulnerability could expose an entire school's data. |
| **Severity** | **Significant.** Children's educational data including names, reading ability assessments ("struggling"), and potentially sensitive teacher notes. Could cause distress to families and reputational damage to schools. |
| **Overall Risk** | **Medium** |
| **Affected Data Subjects** | Students, potentially staff |

#### Risk (b): Student names transmitted to third-party AI providers

| Dimension | Assessment |
|---|---|
| **Description** | When AI recommendations are requested, the student's full name is included in the prompt sent to Anthropic, OpenAI, or Google API servers. These are US-based companies. The prompt text (in `aiService.js` lines 59 and 340-346) explicitly includes `Name: ${studentProfile.name}`. |
| **Likelihood** | **Probable.** This occurs every time a teacher requests AI recommendations for a student (unless cached). It is a design feature, not a bug. |
| **Severity** | **Significant.** A child's name combined with their reading level, age range, and reading preferences constitutes a meaningful personal profile being sent to a third party outside the UK without data minimisation. AI providers may log prompts for training or debugging purposes. |
| **Overall Risk** | **High** |
| **Affected Data Subjects** | Students |

#### Risk (c): Teacher notes containing sensitive/special category data

| Dimension | Assessment |
|---|---|
| **Description** | The `notes` fields on both the `students` table and `reading_sessions` table are free text with no validation or content guidance. Teachers may record SEN status, medical conditions (e.g., "dyslexic", "ADHD"), behavioural observations, safeguarding concerns, or family circumstances (e.g., "parents separating -- reading declined"). This would constitute special category data under Article 9 (health data) or even criminal offence data (safeguarding) being processed without explicit Article 9 safeguards. |
| **Likelihood** | **Probable.** In educational settings, teachers commonly annotate records with holistic observations about students. Without clear guidance, this will occur. |
| **Severity** | **Significant.** Inadvertent processing of Article 9 data without appropriate safeguards. If breached, this data is particularly sensitive for children. |
| **Overall Risk** | **High** |
| **Affected Data Subjects** | Students |

#### Risk (d): Soft-deleted data persisting in database (erasure failure)

| Dimension | Assessment |
|---|---|
| **Description** | The `organizations` and `users` tables use soft delete (`is_active = 0`) rather than hard delete. When a school requests erasure of a student or staff member under Article 17, the current system does not provide a mechanism for permanent data removal. Students use `is_active` soft delete. Reading sessions use hard `DELETE` (via `ON DELETE CASCADE` from students), but only if the student record itself is hard-deleted. |
| **Likelihood** | **Possible.** Erasure requests will occur, particularly when students leave a school or when a school cancels their subscription. |
| **Severity** | **Significant.** Failure to honour erasure requests is a direct UK GDPR Article 17 compliance failure. The ICO could take enforcement action. |
| **Overall Risk** | **Medium** |
| **Affected Data Subjects** | Students, staff |

#### Risk (e): IP addresses and user agents stored indefinitely in audit logs

| Dimension | Assessment |
|---|---|
| **Description** | The `audit_log` table stores IP addresses and user agents for every sensitive operation (create, update, delete). The `audit_log` table has no automatic expiry or cleanup mechanism. Over time, this builds a detailed record of staff access patterns, locations, and device usage. IP addresses are personal data under UK GDPR. |
| **Likelihood** | **Probable.** This is the current system behaviour -- every audited action writes a permanent record with IP and user agent. |
| **Severity** | **Minimal.** Staff IP addresses and user agents, while personal data, are lower sensitivity than student data. However, indefinite retention violates the storage limitation principle. |
| **Overall Risk** | **Medium** |
| **Affected Data Subjects** | Staff |

#### Risk (f): Login attempts table storing email and IP without guaranteed cleanup

| Dimension | Assessment |
|---|---|
| **Description** | The `login_attempts` table records email addresses, IP addresses, and user agents for every login attempt (successful or failed). Cleanup of records older than 24 hours occurs only probabilistically -- it is triggered as a fire-and-forget operation after successful logins, with no guaranteed scheduled cleanup. If no one logs in, old records persist indefinitely. Additionally, failed login attempts for non-existent email addresses are also recorded, potentially storing emails of individuals who are not users of the system. |
| **Likelihood** | **Possible.** The probabilistic cleanup (triggered only on successful login) means stale records will accumulate during school holidays or if a school stops using the service. |
| **Severity** | **Minimal.** Email + IP + user agent + timestamp for login attempts. Sensitive in aggregate but individually low impact. |
| **Overall Risk** | **Low** |
| **Affected Data Subjects** | Staff (and potentially non-users whose emails are attempted) |

#### Risk (g): Cross-tenant data leakage (multi-tenant architecture)

| Dimension | Assessment |
|---|---|
| **Description** | All schools share a single D1 database. Tenant isolation is enforced at the application layer via `organization_id` scoping in SQL queries (the `tenantMiddleware` injects `c.get('organizationId')` and routes add `WHERE organization_id = ?`). A missing `WHERE` clause, a SQL injection, or a middleware bypass could expose one school's data to another. The `owner` role can switch organisation context via the `X-Organization-Id` header, which is an intentional cross-tenant access path. |
| **Likelihood** | **Possible.** Application-layer tenant isolation is a well-understood but error-prone pattern. New endpoints or complex queries (especially those in `books.js` that bypass the data provider abstraction) could omit organisation scoping. The owner role's cross-tenant capability is a potential attack vector if an owner account is compromised. |
| **Severity** | **Severe.** One school viewing another school's student data would be a significant breach involving children's personal data. |
| **Overall Risk** | **High** |
| **Affected Data Subjects** | Students, staff across all affected schools |

#### Risk (h): Expired tokens persisting in database

| Dimension | Assessment |
|---|---|
| **Description** | The `refresh_tokens` and `password_reset_tokens` tables accumulate records over time. Revoked refresh tokens are marked (`revoked_at` timestamp) but never deleted. Used password reset tokens are marked (`used_at` timestamp) but never deleted. Expired tokens of both types are never cleaned up. This creates an ever-growing store of cryptographic material (SHA-256 hashes) linked to user IDs. |
| **Likelihood** | **Probable.** Every login creates a refresh token. Every password reset creates a reset token. Over months, thousands of stale records will accumulate per school. |
| **Severity** | **Minimal.** The tokens are hashed (SHA-256) and cannot be reversed. The linked user IDs are the only personally identifiable element. Risk is primarily a storage limitation principle violation rather than a practical security risk. |
| **Overall Risk** | **Low** |
| **Affected Data Subjects** | Staff |

#### Risk (i): Reading patterns revealing sensitive information about home life

| Dimension | Assessment |
|---|---|
| **Description** | Systematic tracking of reading sessions (especially with `location = 'home'`) over time can reveal patterns about a child's home environment. Extended absence of home reading sessions may correlate with family disruption, neglect, or instability. The `session_date` + `location` combination, combined with assessment data ("struggling"), could be used to make inferences about a child's welfare. Reading streaks highlight "gaps" that may correspond to difficult periods. |
| **Likelihood** | **Possible.** Teachers already make these inferences informally, but systematic digital tracking makes patterns more visible and permanent. |
| **Severity** | **Significant.** Inferences about a child's home life, particularly around neglect or family disruption, are highly sensitive. If this data were breached or shared inappropriately, it could cause significant harm. |
| **Overall Risk** | **Medium** |
| **Affected Data Subjects** | Students |

#### Risk (j): Cloudflare as US company hosting UK children's data

| Dimension | Assessment |
|---|---|
| **Description** | All application data (D1 database, KV storage, R2 bucket) is hosted on Cloudflare infrastructure. Cloudflare is a US-headquartered company. While Cloudflare offers EU/UK data residency options for some products, the current `wrangler.toml` configuration does not specify a D1 database location directive. Data may be stored in the US or routed through US infrastructure. This constitutes an international transfer of children's personal data. |
| **Likelihood** | **Probable.** Without explicit location configuration, Cloudflare may store D1 data outside the UK/EEA. |
| **Severity** | **Significant.** International transfer of children's data without adequate safeguards is a UK GDPR Chapter V compliance issue. Some schools and local authorities have policies restricting data storage to UK/EEA jurisdictions. |
| **Overall Risk** | **High** |
| **Affected Data Subjects** | Students, staff |

### 4.3 Risk Summary Table

| Risk ID | Risk Description | Likelihood | Severity | Overall Risk |
|---|---|---|---|---|
| (a) | Unauthorised access / data breach | Possible | Significant | **Medium** |
| (b) | Student names sent to AI third parties | Probable | Significant | **High** |
| (c) | Teacher notes containing SEN/sensitive data | Probable | Significant | **High** |
| (d) | Soft-deleted data preventing proper erasure | Possible | Significant | **Medium** |
| (e) | IP addresses stored indefinitely in audit logs | Probable | Minimal | **Medium** |
| (f) | Login attempts stored without guaranteed cleanup | Possible | Minimal | **Low** |
| (g) | Cross-tenant data leakage | Possible | Severe | **High** |
| (h) | Expired tokens persisting in database | Probable | Minimal | **Low** |
| (i) | Reading patterns revealing home life information | Possible | Significant | **Medium** |
| (j) | US-hosted infrastructure for UK children's data | Probable | Significant | **High** |

---

## 5. Mitigation Measures

### 5.1 Existing Controls

The following security and privacy controls are already implemented in the codebase:

#### Authentication and Access Control

| Control | Implementation | Relevant Code |
|---|---|---|
| Password hashing | PBKDF2, 100,000 iterations, SHA-256, 128-bit random salt | `src/utils/crypto.js` |
| Constant-time comparison | Used for both password verification and JWT signature verification to prevent timing attacks | `crypto.js:constantTimeEqual()` |
| Short-lived access tokens | 15-minute JWT expiry, requiring frequent refresh | `crypto.js:ACCESS_TOKEN_TTL` |
| Refresh token rotation | New refresh token issued on each refresh; old token revoked | `src/routes/auth.js` `/refresh` endpoint |
| Refresh token hashing | Refresh tokens stored as SHA-256 hashes; plaintext never persisted | `crypto.js:hashToken()` |
| httpOnly cookies | Refresh tokens sent as httpOnly, SameSite=Strict, Secure (in production), Path=/api/auth | `auth.js` cookie configuration |
| Account lockout | 5 failed login attempts triggers 15-minute lockout | `auth.js:isAccountLocked()` |
| Timing-attack-safe login | Dummy password hash performed on invalid email to prevent enumeration | `auth.js` line 313 |
| RBAC (4-tier) | owner > admin > teacher > readonly, enforced via middleware | `src/middleware/tenant.js:requireRole()` |

#### Data Protection

| Control | Implementation | Relevant Code |
|---|---|---|
| Tenant isolation | All queries scoped by `organization_id`; middleware injects org context | `tenant.js:tenantMiddleware()`, `scopeToOrganization()` |
| Organisation validation | Tenant middleware verifies org exists and `is_active = 1` before processing | `tenant.js:tenantMiddleware()` |
| Resource ownership checks | `requireOrgOwnership()` middleware validates resource belongs to user's org | `tenant.js:requireOrgOwnership()` |
| Table name whitelist | Dynamic table names in ownership checks validated against `ALLOWED_OWNERSHIP_TABLES` set | `tenant.js` |
| API key encryption | School AI API keys encrypted with AES-GCM using HKDF-derived key from JWT secret | `crypto.js:encryptSensitiveData()` |
| Foreign key enforcement | `PRAGMA foreign_keys = ON` set per-request for D1 | `worker.js` line 143 |

#### Network and Transport Security

| Control | Implementation | Relevant Code |
|---|---|---|
| HTTPS enforcement | HSTS header with 1-year max-age, includeSubDomains | `worker.js` security headers |
| CORS whitelist | Explicit origin whitelist from `ALLOWED_ORIGINS` env var; rejects unlisted origins | `worker.js` CORS configuration |
| Security headers | X-Frame-Options: DENY, X-Content-Type-Options: nosniff, X-XSS-Protection, CSP, Referrer-Policy | `worker.js` security headers middleware |
| Cache control | `no-store, no-cache, must-revalidate, private` on auth and user endpoints | `worker.js` line 108-111 |
| Rate limiting | 10 requests/minute on auth endpoints; 100 requests/minute general; D1-backed | `tenant.js:authRateLimit()`, `rateLimit()` |

#### Audit and Monitoring

| Control | Implementation | Relevant Code |
|---|---|---|
| Audit logging | Sensitive operations logged with user ID, action, entity type, IP, user agent | `tenant.js:auditLog()` |
| Error sanitisation | 5xx errors return generic messages; internal details not leaked to clients | `src/middleware/errorHandler.js` |
| Observability | Cloudflare Workers logs enabled | `wrangler.toml` `[observability.logs]` |

### 5.2 Recommended Additional Controls

The following controls are recommended to address the identified risks. They are ordered by priority.

#### PRIORITY 1 -- Must implement before general availability

| # | Recommendation | Addresses Risk | Effort | Detail |
|---|---|---|---|---|
| M1 | **Remove student names from AI prompts** | (b) | Low | In `src/services/aiService.js`, replace `${studentProfile.name}` / `${student.name}` with "this student" or "the reader" in both `buildPrompt()` (line 59) and `buildBroadSuggestionsPrompt()` (lines 344, 346, 356, 366). This is the single most impactful privacy improvement. |
| M2 | **Configure Cloudflare D1 location hint for EU/UK** | (j) | Low | Add `location_hint = "weur"` (Western Europe) to the D1 database configuration in `wrangler.toml`. While this is a hint rather than a guarantee, it demonstrates intent to keep data in the UK/EEA. [TODO: Investigate Cloudflare's D1 data residency guarantees and whether they meet UK GDPR requirements.] |
| M3 | **Implement hard delete capability for erasure requests** | (d) | Medium | Create an admin-only API endpoint (and UI) to permanently delete a student and all associated data (sessions, preferences, streaks). This must cascade to `reading_sessions`, `student_preferences`, and any audit log entries. Document the erasure process in the DPA. |
| M4 | **Add teacher guidance on notes fields** | (c) | Low | Add placeholder text to notes input fields: "Reading observations only. Do not record medical, SEN, behavioural, or safeguarding information." Include this guidance in school onboarding documentation and DPA. |
| M5 | **Document international transfers for AI processing** | (b), (j) | Low | Update the DPA and privacy notice to clearly disclose that when AI recommendations are enabled, student data (reading level, preferences, reading history) is sent to the school's chosen AI provider (Anthropic/OpenAI/Google) in the US. Schools must inform parents. |

#### PRIORITY 2 -- Should implement within 3 months of launch

| # | Recommendation | Addresses Risk | Effort | Detail |
|---|---|---|---|---|
| M6 | **Implement audit log retention policy** | (e) | Medium | Add a scheduled task (extend the existing daily cron in `worker.js`) to: (1) Hash IP addresses in audit log entries older than 30 days (replace raw IP with SHA-256 hash to retain correlation capability while removing PII). (2) Delete audit log entries older than 12 months. |
| M7 | **Implement guaranteed login_attempts cleanup** | (f) | Low | Add login_attempts cleanup to the daily cron job (`scheduled` handler in `worker.js`): `DELETE FROM login_attempts WHERE created_at < datetime('now', '-7 days')`. Remove the probabilistic cleanup from `recordLoginAttempt()`. |
| M8 | **Implement expired token cleanup** | (h) | Low | Add to the daily cron job: `DELETE FROM refresh_tokens WHERE (revoked_at IS NOT NULL AND revoked_at < datetime('now', '-30 days')) OR expires_at < datetime('now', '-30 days')` and `DELETE FROM password_reset_tokens WHERE (used_at IS NOT NULL AND used_at < datetime('now', '-7 days')) OR expires_at < datetime('now', '-7 days')`. |
| M9 | **Add tenant isolation integration tests** | (g) | Medium | Create a dedicated test suite that verifies every API endpoint correctly scopes queries by `organization_id`. Test with two organisations and verify that org A cannot access org B's students, sessions, books, or settings. Run as part of CI. |
| M10 | **Implement data retention automation** | (d) | Medium | Create a scheduled process that: (1) Identifies organisations inactive for > [TODO: retention period, e.g., 12 months]. (2) Notifies the school (email) of impending data deletion. (3) After a grace period, permanently deletes all organisation data. |

#### PRIORITY 3 -- Should implement within 6 months of launch

| # | Recommendation | Addresses Risk | Effort | Detail |
|---|---|---|---|---|
| M11 | **Add data export (portability) feature** | General GDPR compliance | Medium | Implement Article 20 data portability: allow schools to export all their data in a structured, machine-readable format (CSV/JSON). |
| M12 | **Implement rate limit record cleanup in cron** | (f) | Low | Move `rate_limits` cleanup from the 1% probabilistic trigger to the daily cron. `DELETE FROM rate_limits WHERE created_at < datetime('now', '-24 hours')`. |
| M13 | **Consider pseudonymisation for analytics** | (i) | High | If aggregate analytics features are added (e.g., school-wide reading trends), use pseudonymised student IDs rather than real identifiers. |
| M14 | **Restrict notes field length** | (c) | Low | Add a character limit (e.g., 500 characters) to notes fields to reduce the risk of extensive sensitive data entry. |
| M15 | **Audit the owner role cross-tenant access** | (g) | Low | Add dedicated audit log entries when an owner switches organisation context (log the `X-Organization-Id` header usage). Consider whether the owner role is necessary or whether a separate super-admin interface would be more appropriate. |

---

## 6. Residual Risk Assessment

After implementing the recommended mitigations, the following residual risks remain:

| Risk ID | Risk Description | Pre-Mitigation | Key Mitigations | Post-Mitigation | Residual Risk Justification |
|---|---|---|---|---|---|
| (a) | Unauthorised access / data breach | Medium | Existing controls (JWT, RBAC, tenant isolation, rate limiting, encryption) | **Low** | Standard cloud security posture. Residual risk accepted. Further reduction via Cyber Essentials certification and penetration testing. |
| (b) | Student names sent to AI | High | M1 (remove names from prompts), M5 (document transfers) | **Low** | After M1, no student PII is sent to AI providers. Only reading levels, preferences, and book titles are transmitted. |
| (c) | Teacher notes containing sensitive data | High | M4 (UI guidance), M14 (character limit), DPA guidance | **Medium** | Cannot fully prevent teachers from entering sensitive information in free text fields. Risk is mitigated through guidance but not eliminated. Schools (as controllers) must train staff. |
| (d) | Soft-deleted data / erasure failure | Medium | M3 (hard delete endpoint), M10 (retention automation) | **Low** | Erasure requests can be honoured. Automated retention ensures data is not kept indefinitely. |
| (e) | IP addresses in audit logs | Medium | M6 (hash after 30 days, delete after 12 months) | **Low** | IP addresses pseudonymised after 30 days; records deleted after 12 months. Compliant with storage limitation principle. |
| (f) | Login attempts without cleanup | Low | M7 (guaranteed daily cleanup) | **Low** | Deterministic 7-day retention via cron. |
| (g) | Cross-tenant data leakage | High | M9 (integration tests), M15 (audit owner access), existing middleware | **Medium** | Application-layer isolation inherently carries residual risk. Integration tests provide regression coverage. A database-per-tenant architecture would further reduce risk but is architecturally infeasible with D1. Regular security reviews recommended. |
| (h) | Expired tokens persisting | Low | M8 (daily cleanup) | **Low** | Stale tokens cleaned within 30 days. |
| (i) | Reading patterns revealing home life | Medium | M4 (notes guidance), school training, DPA provisions | **Low-Medium** | The reading pattern data is inherent to the service's purpose. Risk is managed through school awareness and data access controls. Cannot be fully eliminated without removing core functionality. |
| (j) | US-hosted infrastructure | High | M2 (D1 location hint), international transfer documentation, Cloudflare DPA | **Medium** | Cloudflare's D1 location hint provides best-effort UK/EEA storage. The UK Extension to the EU-US Data Privacy Framework provides a legal mechanism for transfers. [TODO: Verify Cloudflare's participation in this framework and obtain their DPA.] Residual risk exists because Cloudflare as a US company may be subject to US government data access requests (CLOUD Act). |

### 6.1 Overall Residual Risk Statement

After implementing Priority 1 and Priority 2 mitigations, the overall residual risk of this processing is assessed as **Medium**. The primary residual risks are:

1. **Cross-tenant isolation** (g) relies on application-layer controls that could be bypassed by coding errors. This is mitigated by integration testing and code review but cannot be fully eliminated.
2. **Teacher notes** (c) may contain special category data despite guidance. This is a human factor risk that technology cannot fully prevent.
3. **US infrastructure** (j) means Cloudflare could theoretically be compelled to disclose data under US law. This is mitigated by the legal transfer mechanism but represents a structural risk of using any US cloud provider.

These residual risks are considered acceptable given:
- The educational value of the processing for children's literacy development
- The existing and planned security controls
- The school's role as controller in managing teacher behaviour and parent communication
- [TODO: DPO to confirm acceptability of residual risk]

---

## 7. DPO Consultation and Sign-Off

### 7.1 DPO Review

[TODO: This section must be completed by the DPO or external DPO service before the DPIA is finalised.]

| Item | Status |
|---|---|
| DPO has reviewed the processing description | [TODO: Pending / Approved / Approved with conditions] |
| DPO has reviewed the risk assessment | [TODO] |
| DPO has reviewed the mitigation measures | [TODO] |
| DPO accepts the residual risk | [TODO] |
| DPO recommends consultation with the ICO under Article 36 | [TODO: Yes / No -- required if residual risk is "high" and cannot be mitigated] |

### 7.2 DPO Recommendations

[TODO: DPO to document any additional recommendations or conditions here.]

### 7.3 Sign-Off

| Role | Name | Date | Signature |
|---|---|---|---|
| DPIA Author | [TODO] | [TODO] | [TODO] |
| Data Protection Officer | [TODO] | [TODO] | [TODO] |
| Product Owner | [TODO] | [TODO] | [TODO] |
| Technical Lead | [TODO] | [TODO] | [TODO] |

---

## 8. Review Schedule

This DPIA must be reviewed:

1. **Annually** -- next review due by 2027-02-20.
2. **On significant system changes**, including but not limited to:
   - New categories of personal data collected
   - New data sharing or sub-processor arrangements
   - Changes to AI provider integration (e.g., new provider, sending additional data)
   - MIS integration (e.g., Bromcom, Wonde) adding pupil data synchronisation
   - Introduction of parent portal or direct student-facing features
   - Changes to data storage location or infrastructure provider
   - Changes to authentication mechanism (e.g., SSO integration)
   - Significant security incidents or near-misses
3. **On regulatory change** -- updates to UK GDPR, ICO guidance on children's data, or the Age Appropriate Design Code.

| Review # | Date | Reviewer | Changes Made | Next Review |
|---|---|---|---|---|
| 0 | 2026-02-20 | [TODO] | Initial DPIA (DRAFT) | 2027-02-20 |
| 1 | | | | |

---

## 9. Appendices

### Appendix A: Data Processing Agreement Requirements

The DPA between Tally and each subscribing school must include:

- [TODO: Ensure DPA (document 02) covers the following]
- Subject matter and duration of processing
- Nature and purpose of processing (as described in Section 2)
- Categories of data subjects and personal data (as described in Section 2.2-2.3)
- Controller's obligations and rights
- Processor's obligations under Article 28(3):
  - Process only on documented instructions from the controller
  - Ensure persons authorised to process have committed to confidentiality
  - Take all measures required under Article 32 (security)
  - Assist the controller in responding to data subject requests (access, erasure, portability)
  - Delete or return all personal data at the end of the service contract
  - Make available all information necessary to demonstrate compliance
  - Allow for and contribute to audits
- Sub-processor disclosure and approval mechanism (Cloudflare, AI providers)
- International transfer safeguards
- Breach notification obligations (without undue delay, within 72 hours)

### Appendix B: Database Tables Containing Personal Data

| Table | Personal Data Fields | Data Subjects | Soft/Hard Delete | Org-Scoped |
|---|---|---|---|---|
| `students` | name, age_range, reading_level, notes, likes, dislikes | Children | Soft (`is_active`) | Yes |
| `reading_sessions` | session_date, duration, pages, assessment, notes, rating, location | Children (indirectly) | Hard (CASCADE from students) | Via student FK |
| `student_preferences` | genre preferences (like/dislike) | Children (indirectly) | Hard (CASCADE from students) | Via student FK |
| `users` | name, email, password_hash, role, last_login_at | Staff | Soft (`is_active`) | Yes |
| `organizations` | name, slug | Schools | Soft (`is_active`) | N/A (is the scope) |
| `audit_log` | ip_address, user_agent, user_id | Staff | None (no delete) | Yes |
| `login_attempts` | email, ip_address, user_agent | Staff + non-users | Probabilistic 24h cleanup | No |
| `refresh_tokens` | user_id, token_hash | Staff | Soft (revoked_at) | Via user FK |
| `password_reset_tokens` | user_id, token_hash | Staff | Soft (used_at) | Via user FK |
| `rate_limits` | key (IP or user_id), endpoint | Staff | Probabilistic 1h cleanup | No |

### Appendix C: Relevant UK GDPR Articles

| Article | Relevance |
|---|---|
| Article 5 | Data processing principles (lawfulness, minimisation, storage limitation, integrity) |
| Article 6 | Lawful basis for processing |
| Article 9 | Special category data (risk from teacher notes) |
| Article 12-22 | Data subject rights (access, erasure, portability, objection to profiling) |
| Article 17 | Right to erasure (requires hard delete capability) |
| Article 22 | Automated individual decision-making and profiling (AI recommendations) |
| Article 25 | Data protection by design and default |
| Article 28 | Processor obligations (DPA requirements) |
| Article 32 | Security of processing |
| Article 33-34 | Breach notification (72 hours to ICO, without undue delay to data subjects) |
| Article 35 | DPIA requirement (this document) |
| Article 44-49 | International transfers (Cloudflare US, AI providers US) |
| Recital 38 | Children merit specific protection |

### Appendix D: ICO Children's Code (Age Appropriate Design Code) Considerations

The ICO's Age Appropriate Design Code applies to information society services likely to be accessed by children. While Tally is used by teachers (not directly by children), the following standards are relevant as the data concerns children:

| Standard | Assessment | Action |
|---|---|---|
| **Best interests of the child** | Reading tracking serves children's educational interests. | No action -- aligned. |
| **Data minimisation** | Student name is currently sent to AI providers unnecessarily. | M1 -- remove names from AI prompts. |
| **Default settings** | AI recommendations are off by default (school must configure API key). | No action -- already privacy-protective default. |
| **Transparency** | Schools (as controllers) must inform parents. Tally provides DPA and privacy information to support this. | Ensure school-facing documentation is clear. |
| **Profiling** | AI profiling for recommendations. Not used for detrimental purposes. | Document in DPA; ensure school can disable. |
| **Nudge techniques** | Reading streaks could be considered a nudge technique. However, the data is used by teachers, not shown directly to children. | [TODO: Assess if any child-facing features are planned.] |
| **Connected toys and devices** | Not applicable. | N/A |
| **Geolocation** | Not collected. | N/A |

---

*End of DPIA. This document is a DRAFT and must undergo DPO review, legal review, and sign-off before it is considered final. All items marked [TODO] must be completed before the DPIA can be approved.*
