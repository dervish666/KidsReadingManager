# Privacy Policy

**Tally** (trading as Tally Reading)

**Effective date:** [TODO: Insert date policy takes effect]
**Last updated:** [TODO: Insert date of last revision]

> **DRAFT -- NOT YET LEGALLY REVIEWED**
>
> This document is an internal draft prepared to reflect the data processing
> activities of the Tally Reading platform. It must be reviewed and approved
> by a qualified data protection solicitor before publication. Do not publish
> or rely on this document until legal review is complete.

---

## 1. Who we are

Tally Reading ("Tally", "we", "us", "our") provides a cloud-based reading
management platform designed for UK primary schools. Schools use Tally to
track pupil reading progress, manage book libraries, and optionally generate
AI-powered book recommendations.

| Detail | Value |
|---|---|
| **Product name** | Tally (trading as Tally Reading) |
| **Website** | https://tallyreading.uk |
| **Company name** | [TODO: Insert registered company name] |
| **Company number** | [TODO: Insert Companies House number] |
| **Registered address** | [TODO: Insert registered office address] |
| **Data Protection Officer** | [TODO: Insert DPO name and contact details, or state that one has not been appointed and explain why] |
| **ICO registration number** | [TODO: Insert ICO registration number once obtained (fee: GBP 40 or GBP 60 depending on tier)] |

### Controller and processor roles

Under UK GDPR, each **school** that subscribes to Tally acts as the **data
controller** for the personal data of its pupils, staff, and other users.
Tally acts as a **data processor**, processing personal data on behalf of and
under the instructions of each school. This relationship is governed by a
separate Data Processing Agreement (DPA) between Tally and each subscribing
school.

Where Tally processes personal data for its own purposes (for example,
managing school administrator accounts, billing, and maintaining the security
of the platform), Tally acts as an independent data controller.

---

## 2. What personal data we collect

We collect and process different categories of personal data depending on
your relationship with Tally.

### 2.1 Pupil data (children)

Schools enter the following data about their pupils into the platform:

| Category | Data fields |
|---|---|
| **Identity** | First name, surname (or combined display name as entered by the school) |
| **Reading profile** | Minimum and maximum reading level (Accelerated Reader levels 1.0 to 13.0), age range |
| **Preferences** | Likes and dislikes (free-text lists), favourite genre preferences |
| **Reading sessions** | Date, duration, number of pages read, location (school or home), teacher assessment notes (free text), enjoyment rating (1 to 5), book read |
| **Progress data** | Current book, reading streak (current and longest), streak start date |
| **Teacher notes** | Free-text observations recorded by the teacher |
| **Class membership** | Assignment to one or more classes within the school |

**Important:** Tally does not knowingly collect pupil email addresses, dates
of birth, home addresses, or photographs. Schools are responsible for
ensuring that free-text fields (such as teacher notes, likes, and dislikes)
do not contain inappropriate or excessive personal data.

### 2.2 Staff user data (teachers, administrators)

| Category | Data fields |
|---|---|
| **Identity** | Full name |
| **Contact** | Email address |
| **Authentication** | Password (stored as a salted hash using PBKDF2 with 100,000 iterations; the plaintext password is never stored or logged) |
| **Role and organisation** | Assigned role (owner, admin, teacher, or read-only), school/organisation membership |
| **Activity** | Login timestamps, last-active timestamps |

### 2.3 Technical and security data

| Category | Data fields |
|---|---|
| **Audit logs** | IP address (derived from the `cf-connecting-ip` header provided by Cloudflare), user-agent string, action performed, entity affected, timestamp |
| **Rate-limiting records** | Hashed identifier, endpoint, timestamp (used to prevent brute-force attacks on authentication endpoints) |
| **Request logs** | Standard HTTP request metadata processed by Cloudflare in the course of delivering the service |

### 2.4 Data we do NOT collect

- We do not use analytics or tracking scripts (such as Google Analytics,
  Facebook Pixel, or similar).
- We do not serve advertising or share data with advertisers.
- We do not collect biometric data.
- We do not process special category data (as defined in Article 9 of
  UK GDPR) unless a school inadvertently enters such data into a free-text
  field.

---

## 3. Why we collect it (lawful basis)

UK GDPR requires that every processing activity has a lawful basis. The
table below sets out the lawful basis we rely on for each purpose.

| Purpose | Data used | Lawful basis | Notes |
|---|---|---|---|
| Providing the reading management service to schools | Pupil data, staff user data | **Article 6(1)(b) -- Contract** | Processing is necessary to perform the contract between Tally and the subscribing school. |
| User authentication and session management | Email, password hash, authentication tokens | **Article 6(1)(b) -- Contract** | Necessary to provide secure access to the service. |
| AI-powered book recommendations (optional) | Pupil reading level, preferences, likes/dislikes, books read, genre preferences | **Article 6(1)(b) -- Contract** with **Article 6(1)(a) -- Consent** as a secondary basis at the school level | Schools actively opt in by configuring their own AI API keys. Individual recommendations are triggered by teacher action. See Section 5.2 for details. |
| Audit logging and security monitoring | IP address, user-agent, action details | **Article 6(1)(f) -- Legitimate interests** | Our legitimate interest in maintaining the security and integrity of the platform and detecting unauthorised access. |
| Rate limiting on authentication endpoints | Hashed IP/identifier, timestamp | **Article 6(1)(f) -- Legitimate interests** | Our legitimate interest in preventing brute-force attacks. |
| Sending password-reset and welcome emails | Email address | **Article 6(1)(b) -- Contract** | Necessary to operate the account system. |
| Calculating and displaying reading streaks | Reading session dates | **Article 6(1)(b) -- Contract** | Core product feature for tracking reading progress. |
| Platform improvement and bug fixing | Aggregated, anonymised usage patterns | **Article 6(1)(f) -- Legitimate interests** | We do not use identifiable personal data for this purpose. |

Where we rely on legitimate interests (Article 6(1)(f)), we have conducted a
Legitimate Interests Assessment (LIA) and concluded that the processing is
necessary and proportionate, and that it does not override the rights and
freedoms of data subjects (including children).

[TODO: Ensure LIAs are documented and available for inspection.]

---

## 4. Children's data

Tally processes personal data relating to children (typically aged 4 to 11 in
UK primary schools). We take the following additional measures to protect
children's data:

1. **Data minimisation.** We collect only the data necessary to provide the
   reading management service. We do not collect children's email addresses,
   dates of birth, home addresses, photographs, or any direct contact
   information.

2. **No direct relationship with children.** Tally has no direct relationship
   with pupils. All pupil data is entered and managed by school staff
   (teachers and administrators). Children do not create accounts or log in to
   Tally.

3. **School as controller.** The school, as data controller, is responsible
   for ensuring that it has a lawful basis for processing pupil data (typically
   the public task basis under Article 6(1)(e) for maintained schools, or
   legitimate interests under Article 6(1)(f) for academies and independent
   schools) and for providing appropriate privacy information to parents and
   carers.

4. **No profiling or automated decision-making with legal effects.**
   AI-powered book recommendations are optional suggestions for teachers and
   do not constitute automated decision-making that produces legal effects or
   similarly significant effects on children (Article 22 of UK GDPR).

5. **No marketing to children.** We never use pupil data for marketing
   purposes.

6. **Enhanced security.** All pupil data is encrypted in transit (TLS) and
   access is restricted to authorised staff within the pupil's own school
   through organisational scoping and role-based access controls.

7. **Age-appropriate considerations.** We have designed the platform in
   accordance with the ICO's Age Appropriate Design Code (Children's Code)
   where applicable, recognising that children do not directly interact with
   the service.

[TODO: Review against all 15 standards in the ICO Children's Code and
document compliance or explain why each standard does not apply.]

---

## 5. Who we share data with

We share personal data only with the third parties set out below, and only to
the extent necessary for the stated purpose.

### 5.1 Infrastructure provider -- Cloudflare, Inc.

| Detail | Value |
|---|---|
| **Provider** | Cloudflare, Inc. (US-headquartered, with UK/EU data regions available) |
| **Services used** | Workers (serverless compute), D1 (SQL database), KV (key-value storage), R2 (object storage), CDN, DNS, email routing |
| **Data shared** | All data processed by the platform passes through Cloudflare infrastructure |
| **Safeguards** | Cloudflare is certified under ISO 27001 and SOC 2 Type II. For international transfer safeguards, see Section 6. |
| **Data region** | [TODO: Confirm whether Cloudflare Data Localisation Suite is enabled to restrict data processing to the UK/EU. If not, document the international transfer mechanism relied upon.] |

### 5.2 AI recommendation providers (optional, school-controlled)

| Detail | Value |
|---|---|
| **Providers** | Anthropic (Claude), OpenAI, Google (Gemini) -- at the school's choice |
| **Activation** | Schools must actively opt in by providing their own API key (BYOK model). The feature is disabled by default. |
| **Data shared** | Pupil reading level, favourite genres, likes/dislikes, list of books previously read (title, author, genre), and currently the pupil's first name. **Note:** Sending the pupil's name is flagged for removal in a future release. Once removed, no directly identifying pupil data will be shared with AI providers. |
| **Purpose** | Generating personalised book recommendations for the teacher to review |
| **Safeguards** | Each school controls whether to enable this feature and which provider to use. Schools provide their own API keys and are bound by their own agreements with the chosen AI provider. |

[TODO: Update this section once pupil name is removed from the AI prompt.
At that point, clarify that only pseudonymised reading profile data is sent.]

### 5.3 OpenLibrary (Internet Archive)

| Detail | Value |
|---|---|
| **Provider** | OpenLibrary / Internet Archive |
| **Data shared** | Book metadata only (ISBN, title, author). **No personal data is sent.** |
| **Purpose** | Looking up book cover images and supplementary book metadata (page count, publication year) |

### 5.4 Email provider

| Detail | Value |
|---|---|
| **Provider** | [TODO: Confirm provider -- Cloudflare Email Routing or Resend] |
| **Data shared** | Staff user email addresses and email content (password-reset links, welcome messages) |
| **Purpose** | Transactional emails only (password resets, account invitations). No marketing emails are sent. |

### 5.5 No other sharing

We do not sell personal data. We do not share personal data with
advertisers, data brokers, social media platforms, or any other third parties
beyond those listed above.

---

## 6. International data transfers

Tally's infrastructure is hosted on Cloudflare's global network. Cloudflare,
Inc. is headquartered in the United States. Where personal data is
transferred outside the United Kingdom, we rely on the following safeguards
as required by Articles 44 to 49 of UK GDPR:

| Transfer | Mechanism |
|---|---|
| **Cloudflare (US)** | [TODO: Confirm mechanism. Options include: (a) UK International Data Transfer Agreement (IDTA) incorporating Standard Contractual Clauses; (b) Cloudflare Data Localisation Suite restricting processing to UK/EU jurisdiction; (c) Cloudflare's own Binding Corporate Rules or approved code of conduct. Document the chosen mechanism and retain a copy of the signed IDTA/SCCs.] |
| **AI providers (US)** -- if enabled by the school | Schools that enable AI recommendations are responsible for ensuring that their use of the chosen AI provider complies with their own data transfer obligations. Tally facilitates the school's BYOK configuration but does not itself hold a contract with the AI provider on the school's behalf. |

[TODO: Conduct a Transfer Impact Assessment (TIA) for each international
transfer and document the supplementary measures relied upon. Retain copies
alongside this policy.]

---

## 7. How long we keep data (retention)

We retain personal data only for as long as necessary for the purpose for
which it was collected, or as required by law.

| Data category | Retention period | Rationale |
|---|---|---|
| **Pupil data** (reading sessions, preferences, progress) | Retained while the school's subscription is active. Deleted within [TODO: specify, e.g. 90 days] of subscription termination or upon school request. | Necessary to provide the service. Schools may request earlier deletion at any time. |
| **Staff user accounts** | Retained while the school's subscription is active. Soft-deleted (deactivated) upon account removal; hard-deleted within [TODO: specify] of subscription termination. | Necessary to provide access to the service. |
| **Audit logs** (IP addresses, user-agents, actions) | [TODO: Define retention period, e.g. 12 months, then automatically purged.] | Necessary for security monitoring and incident investigation. |
| **Rate-limiting records** | Automatically purged after 1 hour. | Short-lived records used solely for brute-force prevention. |
| **Authentication tokens** | Access tokens: 15 minutes. Refresh tokens: 7 days. Password-reset links: 1 hour. | Minimised to reduce risk of token theft. |
| **AI recommendation cache** | [TODO: Confirm TTL, e.g. 7 days in KV cache, then automatically expired.] | Temporary cache to avoid redundant API calls. |
| **Book cover image cache** | Cached in browser localStorage for 7 days. Cached in R2 object storage indefinitely (non-personal data: book cover images only). | Performance optimisation. No personal data is stored in the cover cache. |
| **Cloudflare request logs** | Managed by Cloudflare in accordance with their data processing terms. Typically retained for a limited period (see Cloudflare's privacy policy). | Infrastructure-level logging outside Tally's direct control. |

[TODO: Implement automated data deletion routines and document them.
Currently, there is no automated purge of audit logs or pupil data upon
subscription termination -- this must be built before launch.]

---

## 8. Your rights under UK GDPR

Under the UK General Data Protection Regulation and the Data Protection Act
2018, data subjects have the following rights. The method for exercising each
right depends on whether you are a school staff member or a parent/carer
acting on behalf of a pupil.

| Right | Description | How to exercise |
|---|---|---|
| **Right of access** (Article 15) | You have the right to obtain confirmation of whether we process your personal data and, if so, to receive a copy of that data. | Staff: contact [TODO: DPO/privacy contact email]. Parents/carers: contact your child's school, which will liaise with Tally if needed. |
| **Right to rectification** (Article 16) | You have the right to have inaccurate personal data corrected without undue delay. | Staff can update their own name and email in the platform. For pupil data, contact the school. |
| **Right to erasure** (Article 17) | You have the right to request deletion of your personal data in certain circumstances. | Staff: contact [TODO: DPO/privacy contact email]. Parents/carers: contact the school. Schools can delete pupil records directly within the platform. |
| **Right to restriction** (Article 18) | You have the right to request that we restrict processing of your personal data in certain circumstances. | Contact [TODO: DPO/privacy contact email] or the school. |
| **Right to data portability** (Article 20) | You have the right to receive your personal data in a structured, commonly used, and machine-readable format. | Schools can export pupil and reading data via CSV export from the platform. Staff can request their data by contacting [TODO: DPO/privacy contact email]. |
| **Right to object** (Article 21) | You have the right to object to processing based on legitimate interests. | Contact [TODO: DPO/privacy contact email]. We will cease processing unless we demonstrate compelling legitimate grounds. |
| **Rights related to automated decision-making** (Article 22) | You have the right not to be subject to decisions based solely on automated processing that produce legal or similarly significant effects. | AI book recommendations are advisory suggestions for teachers, not automated decisions. Teachers retain full discretion. |

### Exercising rights for children

Because Tally does not have a direct relationship with pupils, requests
concerning pupil data should be directed to the school in the first instance.
The school, as data controller, is responsible for responding to data subject
requests. Tally will assist the school in fulfilling such requests in
accordance with our Data Processing Agreement.

### Response times

We will respond to valid requests within one calendar month, as required by
UK GDPR. This period may be extended by two further months where requests are
complex or numerous, in which case we will inform you within the first month.

### Right to complain

If you are dissatisfied with how your personal data has been handled, you
have the right to lodge a complaint with the Information Commissioner's
Office (ICO):

- **Website:** https://ico.org.uk/make-a-complaint/
- **Telephone:** 0303 123 1113
- **Post:** Information Commissioner's Office, Wycliffe House, Water Lane,
  Wilmslow, Cheshire, SK9 5AF

---

## 9. Cookies and client-side storage

Tally does not use third-party cookies, advertising cookies, or analytics
cookies. We use only the following client-side storage mechanisms, all of
which are strictly necessary for the operation of the service.

### 9.1 Cookies

| Name | Type | Purpose | Duration | Scope |
|---|---|---|---|---|
| `refresh_token` | httpOnly, Secure (production), SameSite=Strict | Stores the refresh token for maintaining authenticated sessions. Not accessible to JavaScript. | 7 days | `Path=/api/auth` only |

### 9.2 localStorage

| Key | Purpose | Duration |
|---|---|---|
| `krm_auth_token` | Stores the short-lived JWT access token for API authentication. | 15 minutes (token TTL; cleared on logout) |
| `krm_user` | Stores non-sensitive user profile data (name, email, role, organisation name) for UI display. | Until logout |
| `krm_auth_mode` | Records whether the instance uses multi-tenant or legacy authentication. | Until logout |
| `bookCovers` | Caches book cover image URLs to reduce network requests to the cover proxy. | 7 days (entries expire individually) |

### 9.3 sessionStorage

| Key | Purpose | Duration |
|---|---|---|
| `globalClassFilter` | Remembers the currently selected class filter within the session. | Until the browser tab is closed |
| `recentlyAccessedStudents` | Tracks recently viewed students for quick navigation. | Until the browser tab is closed |
| `markedPriorityStudents` | Tracks students marked as priority within the current session. | Until the browser tab is closed |

All sessionStorage data is automatically cleared when the browser tab is
closed and is never transmitted to the server.

### 9.4 No consent banner required

Because we do not use any non-essential cookies or tracking technologies,
and all client-side storage listed above is strictly necessary for the
service to function, a cookie consent banner is not required under the
Privacy and Electronic Communications Regulations (PECR) 2003.

---

## 10. Data security

We implement appropriate technical and organisational measures to protect
personal data, including:

| Measure | Detail |
|---|---|
| **Encryption in transit** | All data transmitted between the user's browser and the Tally platform is encrypted using TLS (HTTPS). |
| **Password security** | Passwords are hashed using PBKDF2 with 100,000 iterations and a unique salt per account. Plaintext passwords are never stored or logged. |
| **Token security** | JWT access tokens have a 15-minute lifetime. Refresh tokens are stored in httpOnly cookies with Secure, SameSite=Strict, and Path-restricted attributes. |
| **Multi-tenant isolation** | All database queries are scoped to the requesting organisation. Pupils and staff from one school cannot access data belonging to another school. |
| **Role-based access control** | Four permission levels (owner, admin, teacher, read-only) restrict access to data and actions appropriate to each role. |
| **Audit logging** | Sensitive operations (user creation, modification, deletion, settings changes) are recorded in an audit log with timestamp, actor, action, and IP address. |
| **Rate limiting** | Authentication endpoints are rate-limited to mitigate brute-force and credential-stuffing attacks. |
| **Soft deletion** | User and organisation records are soft-deleted (deactivated) rather than immediately removed, preventing accidental data loss while supporting eventual hard deletion. |
| **Minimal client-side data** | Only essential data is stored in the browser. Sensitive tokens use httpOnly cookies inaccessible to JavaScript. |
| **Infrastructure security** | Hosted on Cloudflare's platform, which provides DDoS protection, Web Application Firewall (WAF), and is certified to ISO 27001, SOC 2 Type II, and PCI DSS. |

[TODO: Obtain Cyber Essentials certification and reference it here. Budget:
approximately GBP 320.]

[TODO: Document incident response procedures and data breach notification
process (Article 33: notify ICO within 72 hours; Article 34: notify data
subjects if high risk).]

---

## 11. Data Processing Agreement

Each subscribing school enters into a Data Processing Agreement (DPA) with
Tally, as required by Article 28 of UK GDPR. The DPA sets out:

- The subject matter and duration of processing
- The nature and purpose of processing
- The types of personal data processed
- The categories of data subjects
- The obligations and rights of the controller (school) and processor (Tally)
- Sub-processor approval and notification arrangements
- Data breach notification obligations
- Assistance with data subject rights requests
- Data deletion or return upon termination

[TODO: Draft and finalise the DPA as a separate document. Provide it to
schools as part of the onboarding process.]

---

## 12. Changes to this policy

We may update this privacy policy from time to time to reflect changes in our
practices, technology, legal requirements, or other factors. When we make
material changes:

1. We will update the "Last updated" date at the top of this policy.
2. We will notify subscribing schools by email at least 14 days before
   material changes take effect.
3. We will make the previous version available upon request.

We encourage you to review this policy periodically.

---

## 13. Contact us

If you have any questions about this privacy policy, your personal data, or
our data protection practices, please contact us:

| Channel | Detail |
|---|---|
| **Email** | [TODO: Insert privacy/DPO contact email, e.g. privacy@tallyreading.uk] |
| **Post** | [TODO: Insert postal address] |
| **Data Protection Officer** | [TODO: Insert DPO name and direct contact details, or confirm that a DPO has not been appointed because the conditions in Article 37 of UK GDPR are not met, and provide alternative contact details] |

For requests concerning pupil data, parents and carers should contact their
child's school in the first instance. The school may then contact Tally to
assist with the request.

---

## 14. Legal framework

This privacy policy is made under and governed by:

- The **UK General Data Protection Regulation** (UK GDPR), as retained in UK
  law by the European Union (Withdrawal) Act 2018 and amended by the Data
  Protection, Privacy and Electronic Communications (Amendments etc.) (EU
  Exit) Regulations 2019
- The **Data Protection Act 2018**
- The **Privacy and Electronic Communications Regulations 2003** (PECR)

References to "UK GDPR" throughout this policy mean the UK General Data
Protection Regulation as described above.

---

## Appendix: TODO items requiring action before publication

This section collates all outstanding items flagged with `[TODO]` throughout
this document. All items must be resolved before this policy is published.

| # | Section | Action required |
|---|---|---|
| 1 | 1 | Insert registered company name, Companies House number, and registered address |
| 2 | 1 | Appoint or document DPO (or document why one is not required under Article 37) |
| 3 | 1 | Complete ICO registration and insert registration number |
| 4 | 3 | Document Legitimate Interests Assessments (LIAs) for audit logging and rate limiting |
| 5 | 4 | Review against all 15 standards of the ICO Children's Code and document findings |
| 6 | 5.1 | Confirm whether Cloudflare Data Localisation Suite is enabled; document data residency |
| 7 | 5.2 | Remove pupil name from AI prompts; update this section once complete |
| 8 | 5.4 | Confirm email provider (Cloudflare Email Routing or Resend) |
| 9 | 6 | Confirm international transfer mechanism for Cloudflare (IDTA/SCCs/Data Localisation) |
| 10 | 6 | Conduct and document Transfer Impact Assessments (TIAs) for each international transfer |
| 11 | 7 | Define and insert specific retention periods for pupil data and audit logs |
| 12 | 7 | Implement automated data deletion routines (audit log purge, post-termination data deletion) |
| 13 | 8 | Insert DPO/privacy contact email in all rights-exercise instructions |
| 14 | 10 | Obtain Cyber Essentials certification |
| 15 | 10 | Document incident response and data breach notification procedures |
| 16 | 11 | Draft and finalise the Data Processing Agreement |
| 17 | 12 | Effective date and last-updated date to be set at time of publication |
| 18 | 13 | Insert all contact details |
| 19 | -- | Commission qualified legal review of the complete policy before publication |
