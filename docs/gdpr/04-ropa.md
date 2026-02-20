# Records of Processing Activities (ROPA)

**DRAFT** -- Requires legal review before finalisation

| | |
|---|---|
| **Document Reference** | GDPR-04 |
| **Version** | 0.1 |
| **Status** | DRAFT |
| **Last Updated** | 2026-02-20 |
| **Next Review** | 2027-02-20 |
| **Owner** | [TODO: Data Protection Lead name] |

---

## 1. Introduction

This document constitutes the Records of Processing Activities maintained by Tally Reading in its capacity as a **data processor** under Article 30(2) of the UK GDPR.

Schools (data controllers) engage Tally Reading to process personal data of students and staff for the purpose of tracking and managing student reading progress. This register documents all categories of processing carried out on behalf of those controllers.

### 1.1 Processor Details

| | |
|---|---|
| **Processor Name** | [TODO: Legal entity name -- e.g., Tally Reading Ltd] |
| **Trading As** | Tally Reading |
| **Website** | https://tallyreading.uk |
| **ICO Registration Number** | [TODO: ICO registration number -- registration fee is GBP 40 or GBP 2,900 depending on tier] |
| **Data Protection Officer** | [TODO: DPO name, email, and phone number -- or state "Not required under Article 37" with justification] |
| **Contact for Data Subjects** | [TODO: privacy@tallyreading.uk or equivalent] |
| **Date of Register** | 2026-02-20 |

### 1.2 Controllers

Tally Reading processes data on behalf of multiple controllers (UK primary schools). Each school is a separate controller with its own data processing agreement. Controller details are maintained in the application's `organizations` table and in signed Data Processing Agreements filed separately.

---

## 2. Register of Processing Activities

### 2.1 Student Reading Tracking

| Field | Detail |
|---|---|
| **Processing Activity** | Student reading tracking |
| **Purpose** | Recording and monitoring student reading progress, sessions, levels, and preferences to support literacy development |
| **Data Subjects** | Students (children, typically aged 4--11) |
| **Categories of Personal Data** | Student name, reading level (AR levels 1.0--13.0), reading level range (min/max), reading session records (date, duration, pages read, assessment, rating, notes), genre preferences (likes/dislikes), current book, last read date, reading streaks, class assignment, age range, notes |
| **Lawful Basis (Controller's)** | Contract with parents/guardians and/or Public task (Education Act 2002, s.78 -- schools' duty to provide a balanced curriculum) |
| **Source of Data** | Teachers and school staff enter data via the application |
| **Recipients / Categories of Recipients** | Internal only -- accessible to authenticated users within the student's school (teachers, admins) |
| **Retention Period** | Duration of school's subscription plus 30 days. See Data Retention Policy (GDPR-05) for full schedule |
| **International Transfers** | No. Data stored in Cloudflare D1 database. [TODO: Confirm D1 region is EU/UK -- see Cloudflare Data Localisation Suite if required] |
| **Technical and Organisational Measures** | Organisation-scoped database queries (tenant isolation), role-based access control (teacher/admin/readonly), JWT authentication, HTTPS in transit, audit logging of sensitive operations |

### 2.2 User Account Management

| Field | Detail |
|---|---|
| **Processing Activity** | User account management |
| **Purpose** | Creating and managing teacher, admin, and readonly user accounts for application access |
| **Data Subjects** | School staff (teachers, administrators) |
| **Categories of Personal Data** | Full name, email address, password hash (PBKDF2, 100,000 iterations, 256-bit output), role (owner/admin/teacher/readonly), last login timestamp, account active status |
| **Lawful Basis (Controller's)** | Contract (employment/engagement with the school; necessary for staff to perform duties) |
| **Source of Data** | Self-registration or admin-created accounts |
| **Recipients / Categories of Recipients** | Internal only -- visible to admins within the same organisation |
| **Retention Period** | Duration of school's subscription plus 30 days. See Data Retention Policy (GDPR-05) |
| **International Transfers** | No |
| **Technical and Organisational Measures** | Passwords hashed with PBKDF2 (100,000 iterations, 128-bit salt), soft delete (is_active flag), role-based access control, organisation isolation |

### 2.3 Authentication and Security

| Field | Detail |
|---|---|
| **Processing Activity** | Authentication and security monitoring |
| **Purpose** | Verifying user identity, preventing unauthorised access, detecting brute-force attacks, maintaining security audit trail |
| **Data Subjects** | All users (teachers, administrators) and attempted users (failed logins) |
| **Categories of Personal Data** | Email address, password hash, IP address (via cf-connecting-ip/x-forwarded-for headers), user-agent string, login timestamps, success/failure status, refresh token hashes, password reset token hashes |
| **Lawful Basis (Controller's)** | Legitimate interests (security of the processing systems and data -- Recital 49 UK GDPR) |
| **Source of Data** | Automatically collected during authentication requests |
| **Recipients / Categories of Recipients** | Internal only -- accessible to system administrators for security investigation |
| **Retention Period** | Login attempts: see Data Retention Policy. Refresh tokens: 7 days from issuance (revocable). Password reset tokens: 24 hours. See GDPR-05 for full schedule |
| **International Transfers** | No |
| **Technical and Organisational Measures** | Rate limiting (D1-backed, per IP/endpoint), account lockout after repeated failures, tokens stored as hashes only (never plaintext), HTTPS enforcement, security headers (CSP, HSTS, X-Frame-Options) |

### 2.4 AI Book Recommendations

| Field | Detail |
|---|---|
| **Processing Activity** | AI-powered book recommendations |
| **Purpose** | Generating personalised book recommendations based on student reading profile to support reading development |
| **Data Subjects** | Students (children, typically aged 4--11) |
| **Categories of Personal Data** | Reading profile: reading level range, genre preferences, books previously read, focus mode (balanced/consolidation/challenge). **Note:** Student name is currently included in the AI prompt -- this is flagged for removal as it is not necessary for generating recommendations [TODO: Remove student name from AI prompts -- implement pseudonymisation] |
| **Lawful Basis (Controller's)** | Consent (school enables AI features via organisation settings; can be disabled per-school) |
| **Source of Data** | Derived from student reading tracking data (see 2.1) |
| **Recipients / Categories of Recipients** | Third-party AI provider, determined by school's configuration: Anthropic (US), OpenAI (US), or Google (US). Schools provide their own API keys (BYOK model) |
| **Retention Period** | Not retained by Tally Reading in persistent storage. Data is sent as a transient API call. Responses may be cached in Cloudflare KV (hashed input as key) for up to 7 days for performance/cost optimisation. AI providers' own retention policies apply -- see sub-processor register |
| **International Transfers** | **Yes -- to the United States.** Transfer mechanism: [TODO: Confirm transfer mechanism -- likely UK IDTA or EU-US Data Privacy Framework adequacy decision where applicable. Document in Transfer Impact Assessment] |
| **Technical and Organisational Measures** | School-controlled enablement (opt-in), BYOK API keys (encrypted at rest in D1), SQL pre-filtering limits data sent to AI (only ~100 randomised books from filtered set), no student identifiers necessary for recommendation quality [TODO: pseudonymise student data in prompts], KV cache uses hashed inputs (not reversible to student identity), HTTPS for API calls |

### 2.5 Book Cover Retrieval

| Field | Detail |
|---|---|
| **Processing Activity** | Book cover image retrieval and caching |
| **Purpose** | Displaying book cover images in the application interface |
| **Data Subjects** | N/A -- no personal data processed |
| **Categories of Personal Data** | ISBN, book title, author name (all non-personal bibliographic data) |
| **Lawful Basis (Controller's)** | N/A -- no personal data |
| **Source of Data** | Book catalog (global books table) |
| **Recipients / Categories of Recipients** | OpenLibrary (Internet Archive, US) for cover image lookup |
| **Retention Period** | Server-side cache (R2): 90 days recommended. Client-side cache (localStorage): 7 days |
| **International Transfers** | Yes -- to the United States (OpenLibrary servers). No personal data is transferred |
| **Technical and Organisational Measures** | No personal data included in requests. Cover images cached in Cloudflare R2 to minimise external requests. Placeholder images generated locally (deterministic gradient from title hash) when covers unavailable |

### 2.6 Email Communications

| Field | Detail |
|---|---|
| **Processing Activity** | Transactional email communications |
| **Purpose** | Sending password reset emails, account notifications, and system communications |
| **Data Subjects** | Users (teachers, administrators) |
| **Categories of Personal Data** | Email address, name |
| **Lawful Basis (Controller's)** | Contract (necessary for account management and security communications) |
| **Source of Data** | User account data (see 2.2) |
| **Recipients / Categories of Recipients** | Email delivery provider: Cloudflare Email Routing / [TODO: Confirm if Resend or other provider is also used -- check production configuration] |
| **Retention Period** | Transient -- emails are sent and not stored by Tally Reading. Provider retention policies apply |
| **International Transfers** | Depends on email provider. Cloudflare: [TODO: Confirm Cloudflare Email Routing data jurisdiction]. [TODO: Document all email sub-processors and their transfer mechanisms] |
| **Technical and Organisational Measures** | Emails sent only for legitimate system purposes (password reset, security alerts), sender address configured per deployment, no marketing emails sent |

### 2.7 Audit Logging

| Field | Detail |
|---|---|
| **Processing Activity** | Security and accountability audit logging |
| **Purpose** | Maintaining an audit trail of sensitive operations for security monitoring, incident investigation, and regulatory accountability |
| **Data Subjects** | Users (teachers, administrators) performing auditable actions |
| **Categories of Personal Data** | User ID, organisation ID, IP address, user-agent string, action performed (create/update/delete), entity type and ID affected, timestamp |
| **Lawful Basis (Controller's)** | Legitimate interests (security and accountability -- Article 5(2) accountability principle; Recital 49 network and information security) |
| **Source of Data** | Automatically generated by the application middleware on successful sensitive operations |
| **Recipients / Categories of Recipients** | Internal only -- accessible to organisation admins via the dashboard and system administrators for investigation |
| **Retention Period** | See Data Retention Policy (GDPR-05). Recommended: 2 years, with IP address and user-agent anonymised after 90 days |
| **International Transfers** | No |
| **Technical and Organisational Measures** | Logged asynchronously (does not block user requests on failure), stored in D1 with organisation scoping, indexed for efficient querying, access restricted to admin role and above |

### 2.8 Rate Limiting

| Field | Detail |
|---|---|
| **Processing Activity** | API rate limiting |
| **Purpose** | Preventing abuse and brute-force attacks on authentication endpoints |
| **Data Subjects** | Users and unauthenticated requesters |
| **Categories of Personal Data** | IP address or user identifier, API endpoint path, timestamp |
| **Lawful Basis (Controller's)** | Legitimate interests (security of the processing systems -- Recital 49) |
| **Source of Data** | Automatically captured from HTTP request metadata |
| **Recipients / Categories of Recipients** | Internal only -- not exposed to any user interface |
| **Retention Period** | 1 hour. See Data Retention Policy (GDPR-05) |
| **International Transfers** | No |
| **Technical and Organisational Measures** | Stored in D1 rate_limits table, automatically cleaned up, minimal data collected (IP/endpoint/timestamp only), no data linked to user accounts |

### 2.9 Reading Streak Calculation

| Field | Detail |
|---|---|
| **Processing Activity** | Automated reading streak calculation |
| **Purpose** | Computing consecutive reading day counts for student motivation and progress monitoring |
| **Data Subjects** | Students (children) |
| **Categories of Personal Data** | Session dates, streak counts (current streak, longest streak) |
| **Lawful Basis (Controller's)** | Contract (part of the reading tracking service provided to schools) |
| **Source of Data** | Derived from reading session records (see 2.1) |
| **Recipients / Categories of Recipients** | Internal only -- runs as automated cron job (daily at 02:00 UTC), results stored in D1 |
| **Retention Period** | Duration of school's subscription. Streak data deleted when student record is deleted |
| **International Transfers** | No |
| **Technical and Organisational Measures** | Automated scheduled worker, no external data transmission, organisation-scoped processing |

### 2.10 Book Search (Full-Text Search)

| Field | Detail |
|---|---|
| **Processing Activity** | Full-text search of book catalog |
| **Purpose** | Enabling users to search the global book catalog by title, author, and other bibliographic fields |
| **Data Subjects** | N/A -- no personal data processed |
| **Categories of Personal Data** | Search queries against the book catalog (non-personal bibliographic data only) |
| **Lawful Basis (Controller's)** | N/A -- no personal data |
| **Source of Data** | User-entered search terms |
| **Recipients / Categories of Recipients** | Internal only -- queries executed against D1 FTS5 virtual table |
| **Retention Period** | Not retained -- search queries are transient and not logged |
| **International Transfers** | No |
| **Technical and Organisational Measures** | FTS5 virtual table (books_fts) operates on non-personal book catalog data only. Search terms are not stored or logged |

---

## 3. Sub-Processors

Under Article 28(2) UK GDPR, the following sub-processors are engaged:

| Sub-Processor | Purpose | Data Processed | Location | Transfer Mechanism |
|---|---|---|---|---|
| Cloudflare, Inc. | Infrastructure: Workers (compute), D1 (database), KV (cache), R2 (object storage), CDN, Email Routing | All application data | [TODO: Confirm -- US/EU. Investigate Cloudflare Data Localisation Suite for UK/EU data residency] | [TODO: UK IDTA / SCCs / adequacy decision] |
| Anthropic | AI book recommendations (when selected by school) | Reading profile, student name* | United States | [TODO: UK IDTA or equivalent] |
| OpenAI | AI book recommendations (when selected by school) | Reading profile, student name* | United States | [TODO: UK IDTA or equivalent] |
| Google (Vertex AI / Gemini) | AI book recommendations (when selected by school) | Reading profile, student name* | United States | [TODO: UK IDTA or equivalent] |
| OpenLibrary (Internet Archive) | Book metadata and cover image lookup | ISBN, title, author (non-personal) | United States | N/A -- no personal data |
| [TODO: Email provider] | Transactional email delivery | Email address, name | [TODO: Confirm] | [TODO: Confirm] |

*Student name is currently included in AI prompts -- flagged for removal. See section 2.4.

---

## 4. International Transfers Summary

| Transfer | Destination | Personal Data? | Safeguard |
|---|---|---|---|
| AI recommendations | US (Anthropic/OpenAI/Google) | Yes (reading profile, student name*) | [TODO: UK IDTA / Transfer Impact Assessment required] |
| Book cover retrieval | US (OpenLibrary) | No | N/A |
| Email delivery | [TODO: Confirm] | Yes (email, name) | [TODO: Confirm] |
| Cloudflare infrastructure | [TODO: Confirm data residency] | Yes (all data) | [TODO: Evaluate Cloudflare Data Localisation Suite. UK IDTA / SCCs as appropriate] |

[TODO: Complete Transfer Impact Assessments for each US transfer involving personal data. Consider whether UK adequacy regulations for the US (if applicable) cover these transfers.]

---

## 5. Technical and Organisational Security Measures (Article 32)

The following measures are implemented to protect personal data:

### 5.1 Access Control
- Multi-tenant isolation: all database queries scoped by `organization_id`
- Role-based access control: owner, admin, teacher, readonly
- JWT authentication with short-lived access tokens (15 minutes) and refresh tokens (7 days)
- Password hashing: PBKDF2, 100,000 iterations, 128-bit random salt, 256-bit derived key

### 5.2 Data in Transit
- HTTPS enforced for all communications
- Security headers: Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options

### 5.3 Data at Rest
- Cloudflare D1 database with [TODO: Confirm encryption-at-rest status for D1]
- AI API keys encrypted before storage in D1
- Passwords and tokens stored as cryptographic hashes only

### 5.4 Monitoring and Logging
- Audit logging of sensitive operations (user CRUD, settings changes, organisation management)
- Login attempt tracking with IP and user-agent
- Rate limiting on authentication endpoints
- Cloudflare observability logs enabled

### 5.5 Data Minimisation
- Book search (FTS5) operates on non-personal catalog data only
- Rate limiting stores minimal data (IP, endpoint, timestamp)
- AI recommendations use pre-filtered subset (~100 books from SQL query) rather than full student history
- [TODO: Remove student name from AI recommendation prompts]

### 5.6 Availability and Resilience
- Cloudflare Workers: globally distributed, automatic failover
- D1 database: [TODO: Confirm backup and recovery procedures]
- Static assets served from Cloudflare CDN

---

## 6. Review and Maintenance

This register must be reviewed:

- **Annually** as a minimum (next review: 2027-02-20)
- When new processing activities are introduced
- When sub-processors are added or changed
- When there are significant changes to data flows or security measures
- Following any personal data breach

| Review Date | Reviewer | Changes Made |
|---|---|---|
| 2026-02-20 | [TODO: Name] | Initial draft created |

---

## 7. Outstanding Actions

| Item | Priority | Status |
|---|---|---|
| Remove student name from AI recommendation prompts | High | [TODO: Implement pseudonymisation] |
| Confirm Cloudflare D1 data residency and encryption | High | [TODO: Review Cloudflare documentation / Data Localisation Suite] |
| Complete Transfer Impact Assessments for US transfers | High | [TODO: TIA for Anthropic, OpenAI, Google, Cloudflare] |
| Confirm email sub-processor and transfer mechanism | Medium | [TODO: Document production email configuration] |
| Appoint DPO or document Article 37 exemption | Medium | [TODO: Legal assessment required] |
| Register with ICO | High | [TODO: Complete ICO registration -- GBP 40 Tier 1 fee] |
| Implement automated data retention cleanup jobs | High | [TODO: See Data Retention Policy GDPR-05] |
| Document D1 backup and disaster recovery procedures | Medium | [TODO: Cloudflare D1 backup documentation] |

---

*This document is maintained as part of Tally Reading's UK GDPR compliance programme. It should be read alongside the Data Processing Agreement (GDPR-01), Privacy Policy (GDPR-02), Data Protection Impact Assessment (GDPR-03), and Data Retention Policy (GDPR-05).*
