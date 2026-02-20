# GDPR Compliance Checklist

**Tally** (trading as Tally Reading)

**Last updated:** 2026-02-20

> **DRAFT -- NOT YET LEGALLY REVIEWED**
>
> This document is an internal working checklist tracking the actions
> required to achieve and maintain UK GDPR compliance for the Tally
> Reading platform. It must be reviewed by a qualified data protection
> solicitor. Items marked as complete should be verified before relying
> on them.

---

## How to Use This Checklist

Items are grouped by priority and category. Each item includes:

- A checkbox (`[ ]` = not started, `[x]` = complete)
- A description of the action required
- Where applicable, specific file paths, URLs, or costs
- Cross-references to other GDPR documents in this folder

Work through sections in order of priority: IMMEDIATE items must be
completed before any school data is processed. CODE CHANGES should be
completed before launch. INFRASTRUCTURE and CONTRACTUAL items should run
in parallel.

---

## IMMEDIATE -- Before Launch / Before Processing School Data

These items are legal prerequisites. Do not process personal data from
schools until all items in this section are complete.

### Registration and Governance

- [ ] **Register with the ICO as a data processor.** Fee: GBP 40/year for
  organisations with fewer than 10 staff and turnover under GBP 632,000
  (Tier 1). Register at https://ico.org.uk/registration/. Record the
  registration number in all GDPR documents where `[TODO: ICO registration
  number]` appears.

- [ ] **Obtain company details for all GDPR document placeholders.** The
  following details appear as `[TODO]` markers across all documents in
  `docs/gdpr/`:
  - Registered company name (Companies House)
  - Companies House registration number
  - Registered office address
  - Trading name confirmation (Tally / Tally Reading)

- [ ] **Appoint a Data Protection Officer (DPO) or document why one is not
  required.** Under Article 37 of UK GDPR, a DPO is mandatory if core
  activities involve regular and systematic monitoring of data subjects on
  a large scale, or large-scale processing of special category data.
  Tally likely does not meet these thresholds as a small processor, but
  this must be documented. Even if not legally required, appointing a
  named privacy contact is recommended for school confidence. Document
  the decision and record the privacy contact in all GDPR documents.

- [ ] **Get legal review of Privacy Policy and DPA template.** Commission
  a qualified UK data protection solicitor to review:
  - `docs/gdpr/01-privacy-policy.md`
  - DPA template (once drafted)
  - This compliance checklist (for completeness)
  - All other documents in `docs/gdpr/`

### Application Integration

- [ ] **Add privacy policy link to the application login page.** The login
  form and registration form should include a visible link to the published
  privacy policy (e.g., "By logging in, you agree to our
  [Privacy Policy](https://tallyreading.uk/privacy)").

- [ ] **Add privacy policy link to the application footer.** All pages of
  the application should include a footer link to the privacy policy.

- [ ] **Implement cookie/storage consent mechanism (if required).** The
  current assessment (see `docs/gdpr/01-privacy-policy.md`, Section 9.4)
  concludes that all client-side storage is strictly necessary under PECR
  and no consent banner is required. Confirm this assessment with legal
  counsel. If analytics or non-essential tracking is added in future, a
  consent mechanism will be required.

---

## CODE CHANGES REQUIRED

These changes address identified gaps in the codebase. Each item includes
the relevant source file(s).

### Data Minimisation

- [ ] **Remove student names from AI recommendation prompts.** Currently,
  the student's name is included in prompts sent to AI providers
  (Anthropic, OpenAI, Google Gemini). This is unnecessary for generating
  recommendations and shares directly identifying personal data with
  third-party processors in the US.

  Files to change:
  - `src/services/aiService.js`, line 59: change `- Name: ${studentProfile.name}` to `- Student: [anonymised]` or remove entirely
  - `src/services/aiService.js`, line 344: change `- Name: ${student.name}` to `- Student: [anonymised]` or remove entirely
  - `src/services/aiService.js`, line 356: remove `${student.name}` from the task description (replace with "this student")
  - `src/services/aiService.js`, line 366: remove `${student.name}` from the reason instruction

  After deployment, update `docs/gdpr/08-sub-processor-register.md`
  (Section 3.2) to confirm that no directly identifying data is sent to
  AI providers.

### Right to Erasure (Article 17)

- [ ] **Implement hard delete for student data.** Currently, there is no
  mechanism to permanently delete a student and all associated records.
  Schools need this to comply with erasure requests from parents.

  Tables requiring cascading hard delete when a student is deleted:
  - `students` (the student record itself)
  - `reading_sessions` (all sessions for the student)
  - Student preferences / likes / dislikes (if stored in a separate table)
  - Any references in `audit_log` (anonymise the `entity_id` rather than
    deleting the audit trail)

  Implement as: `DELETE /api/admin/students/:id/permanent` (require admin
  role). Ensure D1 batch operations respect the 100-statement limit when
  deleting students with many sessions.

- [ ] **Implement hard delete for user data.** Currently, users are
  soft-deleted (`is_active = 0`). Schools and individual users may
  request permanent erasure.

  Tables requiring cleanup when a user is hard-deleted:
  - `users` (the user record)
  - `refresh_tokens` (all tokens for the user)
  - `password_reset_tokens` (all tokens for the user)
  - `login_attempts` (all attempts for the user's email/IP)
  - `audit_log` (anonymise `user_id` references rather than deleting
    the audit trail -- replace with a placeholder like `deleted-user`)

  Implement as: `DELETE /api/admin/users/:id/permanent` (require admin
  role).

### Data Subject Access Requests

- [ ] **Add data export endpoint for Subject Access Requests (SARs).**
  Schools (as controllers) may receive SARs from parents or staff and
  will need Tally (as processor) to provide a complete export of all
  data held about the data subject.

  Implement:
  - `GET /api/admin/export/student/:id` -- returns all data held about
    a student in JSON format: student record, all reading sessions,
    preferences, class memberships, any AI recommendation history
  - `GET /api/admin/export/user/:id` -- returns all data held about a
    user in JSON format: user record, login history, audit log entries
    (where the user is the actor), any sessions they recorded

  Require admin role. Return as JSON with a `Content-Disposition:
  attachment` header for download.

### Automated Cleanup Jobs

All cleanup jobs should be added to the existing scheduled handler in
`src/worker.js` (the daily cron trigger at 02:00 UTC, line 309).

- [ ] **Add automated cleanup for expired refresh tokens.**
  ```sql
  DELETE FROM refresh_tokens WHERE expires_at < datetime('now')
  ```
  Run daily. Log the count of deleted records.

- [ ] **Add automated cleanup for expired/used password reset tokens.**
  ```sql
  DELETE FROM password_reset_tokens
  WHERE expires_at < datetime('now') OR used_at IS NOT NULL
  ```
  Run daily. Log the count of deleted records.

- [ ] **Add automated cleanup for old login attempt records.**
  ```sql
  DELETE FROM login_attempts WHERE created_at < datetime('now', '-30 days')
  ```
  Run daily. Login attempts older than 30 days serve no security purpose
  and contain IP addresses (personal data).

- [ ] **Add IP address anonymisation for old audit log entries.**
  ```sql
  UPDATE audit_log
  SET ip_address = 'anonymised', user_agent = 'anonymised'
  WHERE created_at < datetime('now', '-90 days')
  AND ip_address != 'anonymised'
  ```
  Run daily. Preserves the audit trail (who did what) while removing
  personal data (IP address, user-agent) after the useful investigation
  window.

### Data Storage

- [ ] **Add R2 lifecycle rules for book cover cache.** Configure a 90-day
  expiry on the `book-covers` R2 bucket to prevent unbounded storage
  growth. While book covers are not personal data, this is good practice.
  Check Cloudflare dashboard for R2 object lifecycle configuration.

- [ ] **Ensure all D1 batch operations respect the 100-statement limit
  during bulk deletions.** When implementing hard delete for students
  with many reading sessions, chunk DELETE operations into batches of
  100 statements per `db.batch()` call. See the existing pattern in
  `src/routes/books.js` for reference.

### Right to Restriction (Article 18)

- [ ] **Consider adding a `processing_restricted` flag to the `students`
  table.** When a school or parent invokes the Right to Restriction,
  the student's data must be stored but not actively processed (e.g.,
  excluded from AI recommendations, excluded from streak calculations,
  read-only in the UI). A boolean column on the students table, enforced
  in query logic, would support this. Assess whether this is needed
  before launch or can be deferred.

---

## INFRASTRUCTURE

### Cloudflare Configuration

- [ ] **Configure Cloudflare D1 for EU/UK jurisdiction.** Check the
  Cloudflare dashboard for D1 database location settings. If available,
  configure the `reading-manager-db` database to use EU/UK jurisdiction.
  Document the result in `docs/gdpr/08-sub-processor-register.md`
  (Section 3.1).

- [ ] **Set up the Cloudflare DPA.** Download and review the Cloudflare
  Customer DPA from https://www.cloudflare.com/cloudflare-customer-dpa/.
  Sign and retain a copy. Record completion in
  `docs/gdpr/08-sub-processor-register.md`.

- [ ] **Review Cloudflare's current sub-processor list.** Available at
  https://www.cloudflare.com/cloudflare-sub-processors/. Document any
  sub-processors that process personal data on Tally's behalf (beyond
  Cloudflare itself).

- [ ] **Enable Cloudflare audit logs for Worker access.** Check whether
  your Cloudflare plan includes audit logs for Worker deployments and
  configuration changes. If available, enable them.

### Email Provider

- [ ] **Set up DPA with email provider.** If using Resend (instead of or
  in addition to Cloudflare Email Routing), obtain and sign Resend's DPA.
  Check https://resend.com/legal for current terms. If using Cloudflare
  Email Routing only, this is covered by the Cloudflare DPA.

---

## CONTRACTUAL

### Agreements and Templates

- [ ] **Finalise the DPA template with legal counsel.** The DPA governs
  the relationship between Tally (processor) and each school
  (controller). It must comply with Article 28 of UK GDPR and include:
  - Subject matter and duration of processing
  - Nature and purpose of processing
  - Types of personal data and categories of data subjects
  - Obligations and rights of controller and processor
  - Sub-processor approval and notification (30 days, right to object)
  - Data breach notification obligations (without undue delay)
  - Assistance with data subject rights
  - Data return or deletion upon termination
  - Audit rights

- [ ] **Create standard terms of service.** Separate from the DPA, these
  govern the commercial relationship (pricing, payment terms, liability,
  termination). The current pricing is GBP 100/month per school with a
  one-month free trial.

- [ ] **Document the school onboarding process for GDPR compliance.**
  Create a step-by-step internal process document covering:
  1. School signs up for free trial
  2. School receives and signs DPA (before entering any pupil data)
  3. School admin configures organisation settings
  4. School imports or enters pupil data
  5. School optionally configures AI features (with BYOK guidance)

- [ ] **Prepare a "Security and Compliance" one-pager for school
  procurement teams.** Many schools require a summary document for their
  governors or local authority procurement review. Include:
  - Data hosting location
  - Encryption standards
  - Access controls
  - Certifications (Cloudflare ISO 27001, SOC 2; Cyber Essentials if obtained)
  - DPA availability
  - ICO registration number
  - Sub-processor summary

- [ ] **If pursuing MIS integrations (Bromcom/Wonde): prepare additional
  DPA addendums for student data import.** Importing pupil data from a
  Management Information System introduces additional processing
  activities (syncing names, classes, demographics). The DPA should
  cover these activities, and the school must authorise the MIS
  integration.

---

## ONGOING COMPLIANCE

These items require recurring attention. Set calendar reminders.

### Annual Reviews

- [ ] **Set annual calendar reminder: review all GDPR documentation.**
  Review all documents in `docs/gdpr/` for accuracy against the current
  codebase and infrastructure. Update as needed. Next review due:
  [TODO: Insert date, e.g. February 2027].

- [ ] **Set annual calendar reminder: review and update DPIA.** If a Data
  Protection Impact Assessment has been conducted, review it annually
  or whenever processing activities change materially.

- [ ] **Set annual calendar reminder: breach response plan tabletop
  exercise.** Walk through a simulated data breach scenario to test the
  response process. Document findings and improvements.

- [ ] **Set annual calendar reminder: review sub-processor register.**
  Verify all sub-processors in `docs/gdpr/08-sub-processor-register.md`
  are current. Check for new Cloudflare sub-processors. Verify DPA
  status for each.

### Monitoring

- [ ] **Monitor ICO guidance updates for EdTech and children's data.**
  The ICO periodically issues guidance relevant to educational
  technology providers and processors of children's data. Subscribe to
  ICO updates at https://ico.org.uk/about-the-ico/media-centre/.

- [ ] **Keep the breach register up to date.** Maintain a register of all
  personal data breaches, including those that do not meet the threshold
  for ICO notification (Article 33(5)). Record: date discovered, nature
  of breach, data subjects affected, likely consequences, measures taken.

- [ ] **Review the ICO Age Appropriate Design Code (Children's Code) for
  applicability.** Although children do not directly interact with Tally,
  the platform processes their personal data. Review all 15 standards
  and document compliance or non-applicability for each.
  See: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/.

### Certification

- [ ] **Consider Cyber Essentials certification.** Cost: approximately
  GBP 320/year for self-assessment. Many UK schools require or prefer
  suppliers with Cyber Essentials certification. The serverless
  architecture simplifies compliance (no servers to patch, no network
  perimeter to manage). Apply at
  https://www.ncsc.gov.uk/cyberessentials/overview.

---

## NICE TO HAVE -- Future Enhancements

These items are not required for initial compliance but would strengthen
Tally's data protection posture and may become requirements as the
platform scales.

### Automation and Tooling

- [ ] **Implement automated data retention enforcement.** Build the
  cleanup jobs described in the CODE CHANGES section into a robust
  scheduled task framework with logging, error handling, and monitoring.

- [ ] **Add a GDPR-related admin dashboard.** Provide admin users with
  a view that includes:
  - Data subject request log (SARs received, status, response date)
  - Breach register (internal log of any incidents)
  - Consent status for AI features (which schools have opted in)
  - Data retention statistics (record counts, oldest records)

- [ ] **Implement consent management for AI features.** Currently,
  enabling AI is a school-level setting. Consider adding per-student
  opt-in/opt-out to give schools finer-grained control (e.g., a parent
  requests their child's data not be sent to AI providers).

- [ ] **Add data portability export in a standard format.** Currently,
  schools can export data via CSV. Consider supporting a standard
  educational data format (e.g., Common Education Data Standards, SIF UK)
  for interoperability with other school systems.

- [ ] **Implement automated breach detection.** Monitor audit logs for
  anomalous patterns that might indicate unauthorised access:
  - Multiple failed login attempts from the same IP
  - Access from unusual IP ranges or countries
  - Bulk data exports outside normal usage patterns
  - Rapid role escalation attempts

- [ ] **Consider ISO 27001 certification.** For larger school contracts
  and multi-academy trust procurement, ISO 27001 certification may be
  required or advantageous. This is a significant investment but
  demonstrates security maturity.

---

## Cross-Reference: GDPR Document Suite

| Document | File | Status |
|---|---|---|
| Privacy Policy | `docs/gdpr/01-privacy-policy.md` | Draft |
| Data Processing Agreement | [TODO: Create as `docs/gdpr/02-data-processing-agreement.md`] | Not started |
| Data Protection Impact Assessment | [TODO: Create as `docs/gdpr/03-dpia.md`] | Not started |
| Data Retention Policy | [TODO: Create as `docs/gdpr/04-data-retention-policy.md`] | Not started |
| Breach Response Plan | [TODO: Create as `docs/gdpr/05-breach-response-plan.md`] | Not started |
| Legitimate Interests Assessments | [TODO: Create as `docs/gdpr/06-legitimate-interests-assessments.md`] | Not started |
| Transfer Impact Assessment | [TODO: Create as `docs/gdpr/07-transfer-impact-assessment.md`] | Not started |
| Sub-Processor Register | `docs/gdpr/08-sub-processor-register.md` | Draft |
| Technical Security Measures | `docs/gdpr/09-technical-security-measures.md` | Draft |
| Compliance Checklist | `docs/gdpr/10-compliance-checklist.md` | Draft (this document) |
