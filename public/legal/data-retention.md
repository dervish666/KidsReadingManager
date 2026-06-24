# Data Retention Policy

**Tally** (trading as Tally Reading)

**Last updated:** 24 June 2026

---

## 1. Purpose and Scope

This policy defines how long Tally Reading ("Tally") retains personal data
processed on behalf of subscribing schools, and how that data is disposed of. It
gives effect to the UK GDPR storage-limitation principle (Article 5(1)(e)):
personal data is kept in identifiable form for no longer than is necessary for
the purposes for which it is processed.

Tally processes personal data only as a data processor, on the instructions of
school controllers. This policy covers data held in Tally's databases and caches
(Cloudflare D1, KV and R2) and transient processing by third-party services.

---

## 2. Retention Schedule

Unless a school instructs otherwise, or a legal obligation requires longer
retention, the following periods apply. **"Subscription duration + 90 days"**
means data is retained while the school's subscription is active and for a
90-day grace period afterwards (to allow renewal or data export), after which it
is permanently deleted.

| Data category                                    | What it includes                                                                          | Retention period                                                        | Disposal                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------- |
| Student records                                  | Name, reading level/range, class, notes, preferences, last-read date                      | Subscription duration + 90 days                                         | Permanent deletion              |
| Reading sessions & streaks                       | Session date, duration, pages, assessment, rating, notes, book reference; streak counters | Subscription duration + 90 days                                         | Deleted with the student record |
| Staff user accounts                              | Name, email, role, last-login timestamp                                                   | Subscription duration + 90 days                                         | Permanent deletion              |
| Password hashes                                  | PBKDF2 hash only (no plaintext)                                                           | Until the user account is deleted                                       | Deleted with the user record    |
| Refresh / password-reset tokens                  | Token hash, expiry, revocation/use timestamps                                             | Deleted on expiry, use or revocation                                    | Automated daily cleanup         |
| Login attempts                                   | Email, IP address, user-agent, outcome, timestamp                                         | 30 days                                                                 | Automated daily cleanup         |
| Audit logs                                       | Actor, organisation, action, entity, timestamp, IP/user-agent                             | IP & user-agent anonymised after 90 days; entries deleted after 2 years | Automated (two-phase)           |
| Rate-limit records                               | IP/user identifier, endpoint, timestamp                                                   | 1 hour                                                                  | Automated daily cleanup         |
| AI recommendation cache                          | Hashed reading-profile input mapped to AI response                                        | 7 days (automatic expiry)                                               | Platform TTL                    |
| Book-cover cache                                 | Cover images (no personal data)                                                           | Up to 90 days                                                           | Platform lifecycle / client TTL |
| Organisation settings, classes, AI configuration | School name, timezone, thresholds, class details, encrypted API keys                      | Subscription duration + 90 days                                         | Deleted with the organisation   |
| Book catalogue                                   | Title, author, ISBN, etc. (shared, non-personal)                                          | Indefinite (not personal data)                                          | n/a                             |

---

## 3. Disposal Methods

- **Permanent deletion (hard delete):** records are removed from the live
  database. Deleting a student or staff member cascades to all associated
  records. Tally also provides an organisation-level purge that permanently
  deletes all of a school's data across every related table and replaces the
  organisation record with an anonymised tombstone.
- **Anonymisation:** where an accountability record must be kept (for example,
  audit logs), identifying fields are irreversibly removed while non-identifying
  data is retained. Properly anonymised data is no longer personal data.
- **Automatic expiry:** caches and short-lived tokens expire automatically via
  platform mechanisms (database TTLs, object-storage lifecycle rules and browser
  storage expiry).

A nightly automated job applies these retention periods: it removes expired
tokens and old login-attempt, rate-limit and audit records, anonymises older
audit data, and permanently deletes organisations (and their data) that have
been inactive beyond the grace period. A legal-hold flag suspends all automated
deletion for an organisation where retention is legally required.

---

## 4. Controller Requests

Schools, as controllers, may at any time:

- request earlier deletion of their organisation's data, or of an individual
  student's data;
- request an export of their data before deletion;
- instruct Tally when a pupil leaves, so their data can be removed in line with
  the school's instructions.

Tally actions verified deletion requests promptly and, where deletion is
requested, confirms completion in writing. Cached recommendation data referencing
a deleted subject expires within 7 days.

---

## 5. Exceptions

Retention periods may be extended where required by law — for example, to comply
with a legal hold or regulatory investigation, to establish or defend legal
claims, or to meet safeguarding or financial record-keeping obligations.
Anonymised, aggregated statistics that cannot identify any individual may be
retained indefinitely.

---

## 6. Review

This policy is reviewed at least annually (next review due February 2027),
whenever a new category of data is introduced, on any sub-processor or legal
change, and following any data-protection incident.
