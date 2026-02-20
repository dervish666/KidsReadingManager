# Data Breach Response Plan

**Document Reference:** GDPR-07
**Status:** DRAFT
**Version:** 0.1
**Last Updated:** 2026-02-20
**Owner:** `[TODO: Data Protection Officer / Responsible Person]`
**Review Date:** `[TODO: Set annual review date]`

---

## 1. Purpose and Scope

### 1.1 Purpose

This document establishes the procedure for detecting, assessing, containing, and reporting personal data breaches affecting Tally Reading. It ensures compliance with Articles 33 and 34 of the UK General Data Protection Regulation (UK GDPR) and fulfils Tally's obligations as a data processor to notify data controllers (schools) without undue delay.

### 1.2 Scope

This plan covers:

- All personal data processed by Tally Reading on behalf of schools (data controllers)
- All technical infrastructure: Cloudflare Workers, D1 database, KV storage, R2 storage
- All categories of breach: confidentiality, integrity, and availability
- Both confirmed and suspected breaches
- Data relating to children (ages 4-11), school staff, and any other data subjects

### 1.3 Definitions

| Term | Definition |
|------|------------|
| **Personal data breach** | A breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, personal data (Article 4(12) UK GDPR) |
| **Controller** | The school that uses Tally Reading and determines the purposes and means of processing student data |
| **Processor** | Tally Reading, which processes personal data on behalf of the school |
| **Data subject** | The individual whose data is affected (student, parent/carer, school staff) |
| **ICO** | Information Commissioner's Office, the UK's data protection supervisory authority |

---

## 2. Breach Categories

### 2.1 Confidentiality Breach

Unauthorised or accidental disclosure of, or access to, personal data.

**Examples specific to Tally:**

| Scenario | Severity | Data at Risk |
|----------|----------|-------------|
| Cross-tenant data leak (Organisation A sees Organisation B's students) | Critical | Student names, reading levels, session history |
| SQL injection exposing D1 database contents | Critical | All personal data |
| Stolen or compromised staff credentials | High | Organisation's student data, staff data |
| JWT secret compromise (all tokens become forgeable) | Critical | All personal data across all organisations |
| API endpoint missing `organization_id` filter | High | Student/user data from other organisations |
| Cloudflare Workers runtime log exposure | Medium | Request metadata, potentially email addresses |
| KV recommendation cache key enumeration | Low | Hashed reading profiles (no direct identifiers) |

### 2.2 Integrity Breach

Unauthorised or accidental alteration of personal data.

**Examples specific to Tally:**

| Scenario | Severity | Data at Risk |
|----------|----------|-------------|
| Unauthorised modification of student reading records | High | Reading session accuracy, assessment data |
| Database migration error corrupting student data | High | Any student/user fields affected |
| Malicious insider altering reading levels or assessments | High | Student reading profiles |
| D1 write conflict causing data inconsistency | Medium | Affected records |

### 2.3 Availability Breach

Accidental or deliberate loss of access to, or destruction of, personal data.

**Examples specific to Tally:**

| Scenario | Severity | Data at Risk |
|----------|----------|-------------|
| Cloudflare D1 database corruption or loss | Critical | All structured personal data |
| Cloudflare regional outage (extended) | Medium | Temporary loss of access to all data |
| Accidental deletion of student or session data (no backup) | High | Affected student records |
| Ransomware or destructive attack on infrastructure | Critical | All data |
| Failed migration permanently destroying records | High | Affected records |

### 2.4 Severity Classification

| Level | Description | Examples | Response Time |
|-------|-------------|----------|---------------|
| **Critical** | Multi-tenant breach, all data exposed, or children's data widely disclosed | JWT secret compromise, SQL injection, cross-tenant leak at scale | Immediate (within 1 hour) |
| **High** | Single organisation's data exposed, or significant data loss | Stolen credentials, database corruption, single-org data leak | Within 2 hours |
| **Medium** | Limited data exposure or temporary availability loss | Minor API misconfiguration, regional outage | Within 4 hours |
| **Low** | Minimal data involved, low risk to individuals | Cache metadata exposure, single failed login alert | Within 24 hours |

> **Note:** Any breach involving children's data is automatically elevated by one severity level due to the heightened vulnerability of the data subjects.

---

## 3. Response Team

### 3.1 Core Team

| Role | Name | Contact | Responsibilities |
|------|------|---------|-----------------|
| Incident Response Lead | `[TODO]` | `[TODO: phone + email]` | Overall coordination, decision-making, ICO liaison |
| Technical Lead | `[TODO]` | `[TODO: phone + email]` | Investigation, containment, technical remediation |
| Communications Lead | `[TODO]` | `[TODO: phone + email]` | School notifications, parent communication support, public statements |

### 3.2 Extended Support

| Role | Contact | When Engaged |
|------|---------|-------------|
| Legal counsel | `[TODO: firm name + contact]` | Any breach likely to be reported to ICO, or involving potential legal liability |
| Cloudflare support | Enterprise support ticket or community plan escalation | Infrastructure-level incidents, D1/KV data loss |
| ICO | 0303 123 1113 / ico.org.uk | When notification threshold is met (see Section 6) |

### 3.3 Contact Chain

```
Breach discovered by anyone
        |
        v
Notify Incident Response Lead immediately
(phone call if outside business hours)
        |
        v
Incident Response Lead assembles team
(Technical Lead + Communications Lead as needed)
        |
        v
[Severity Critical or High?]
   |              |
   Yes            No
   |              |
   v              v
Engage legal   Proceed with
counsel        standard response
immediately    process
```

---

## 4. Response Phases

### Phase 1: Detection and Reporting (0-1 hours)

#### 4.1 Detection Sources

| Source | What to Look For | Monitoring |
|--------|-----------------|------------|
| Cloudflare security alerts | DDoS, WAF triggers, unusual traffic patterns | `[TODO: Configure Cloudflare notifications]` |
| Audit log anomalies | Unusual login patterns, bulk data access, cross-org queries | `[TODO: Implement audit log monitoring/alerting]` |
| User/school reports | "I can see another school's data", "my account was accessed" | Support channels |
| Automated monitoring | Error rate spikes, unusual API response patterns | `[TODO: Configure Cloudflare Workers analytics alerts]` |
| Login attempt monitoring | Brute force patterns in `login_attempts` table | `[TODO: Implement alert on >10 failed attempts per email per hour]` |
| Code review/security audit | Vulnerability discovered in code | Regular security reviews |
| Third-party notification | Cloudflare notifies of infrastructure breach | Cloudflare status page + email notifications |

#### 4.2 Initial Report

Anyone who discovers or suspects a breach must immediately:

1. **Report** to the Incident Response Lead via `[TODO: incident@tallyreading.uk]` and phone call.
2. **Do not** attempt to investigate or fix the issue independently (to avoid destroying evidence).
3. **Record** the following initial details:

| Detail | Description |
|--------|-------------|
| Date and time of discovery | When you became aware |
| What was observed | Specific symptoms or evidence |
| Systems involved | Which components (API, database, specific endpoint) |
| Ongoing? | Is the breach still active? |
| Your contact details | For follow-up questions |

#### 4.3 Initial Assessment

The Incident Response Lead performs a rapid assessment:

- What type of breach (confidentiality / integrity / availability)?
- What data is potentially affected?
- How many data subjects are potentially affected?
- How many organisations are potentially affected?
- Is the breach ongoing?
- What is the initial severity classification?

---

### Phase 2: Containment (1-4 hours)

#### 4.4 Immediate Containment Actions

**The goal is to stop the breach from continuing or worsening, while preserving evidence.**

| Scenario | Containment Action | Technical Steps |
|----------|-------------------|-----------------|
| Compromised user credentials | Revoke all sessions for the user | `DELETE FROM refresh_tokens WHERE user_id = ?;` Mark `login_attempts` |
| Compromised JWT secret | Rotate JWT_SECRET, invalidate all tokens | Deploy new `JWT_SECRET` via Wrangler secrets; all existing tokens become invalid; all users must re-authenticate |
| Cross-tenant data leak (code defect) | Deploy hotfix to affected endpoint | `wrangler deploy` -- Cloudflare Workers deploy globally in seconds |
| SQL injection | Deploy input validation fix; review and patch affected endpoint | `wrangler deploy` with patched code |
| Suspicious API activity from IP | Block at Cloudflare WAF level | Cloudflare dashboard > WAF > Custom Rules, or API |
| Compromised admin account | Disable the account | `UPDATE users SET is_active = 0 WHERE id = ?;` + `DELETE FROM refresh_tokens WHERE user_id = ?;` |
| Database corruption | Halt writes if possible; engage Cloudflare support for D1 recovery | `[TODO: Document D1 point-in-time recovery process]` |

**Cloudflare Workers advantage:** Code changes deploy globally within seconds via `wrangler deploy`, enabling rapid containment of application-level vulnerabilities.

#### 4.5 Evidence Preservation

Before taking containment actions that may destroy evidence, export and preserve:

| Evidence | How to Preserve |
|----------|----------------|
| Audit log entries | `SELECT * FROM audit_log WHERE created_at > '[incident_start]' ORDER BY created_at;` -- export to secure file |
| Login attempts | `SELECT * FROM login_attempts WHERE created_at > '[incident_start]';` -- export to secure file |
| Cloudflare analytics | Export from Cloudflare dashboard > Workers > Analytics (request logs, error rates) |
| Cloudflare WAF logs | Export from Cloudflare dashboard > Security > Events |
| Application state | Screenshot or export relevant D1 query results before remediation |
| Worker deployment history | `wrangler deployments list` -- record recent deployments |

Store all evidence in `[TODO: secure evidence storage location]` with restricted access. Evidence must be timestamped and its integrity protected (e.g., checksums).

---

### Phase 3: Assessment (4-24 hours)

#### 4.6 Scope Determination

Determine the full extent of the breach:

**Which organisations are affected?**

```sql
-- Example: If a cross-tenant endpoint was exposed, determine which orgs
-- had data accessed during the breach window
SELECT DISTINCT organization_id, o.name
FROM audit_log al
JOIN organizations o ON al.organization_id = o.id
WHERE al.created_at BETWEEN '[breach_start]' AND '[breach_end]'
  AND al.action = '[suspicious_action]';
```

**Which data subjects are affected?**

```sql
-- Students in affected organisations
SELECT COUNT(*) AS student_count
FROM students
WHERE organization_id IN ([affected_org_ids])
  AND is_active = 1;

-- Users in affected organisations
SELECT COUNT(*) AS user_count
FROM users
WHERE organization_id IN ([affected_org_ids])
  AND is_active = 1;
```

**What categories of data were exposed?**

Document which of the following were compromised:

| Data Category | Tables | Contains |
|---------------|--------|----------|
| Student identity | `students` | Name, age range, class, notes |
| Student reading profile | `students` | Reading level range, current book, streaks |
| Reading history | `reading_sessions` | Dates, books, duration, assessment, rating, notes |
| Genre preferences | `student_preferences` | Likes and dislikes |
| Staff identity | `users` | Name, email, role |
| Staff credentials | `users` | Password hash (PBKDF2, 100k iterations -- not plaintext) |
| Authentication tokens | `refresh_tokens` | Token hashes (not plaintext tokens) |
| Login history | `login_attempts` | Email, IP address, user agent, timestamps |
| Audit trail | `audit_log` | Actions, IP addresses, user agents |

#### 4.7 Risk Assessment

Assess the risk to data subjects using the following factors:

| Factor | Assessment Questions |
|--------|---------------------|
| **Type of data** | Is it children's data? (Yes -- elevated risk.) Does it include special category data? (Reading data is not special category, but children's data warrants extra caution.) |
| **Volume** | How many students/users affected? Single school or multiple? |
| **Identifiability** | Can individuals be identified from the exposed data? (Student names + school = identifiable.) |
| **Severity of consequences** | What harm could result? (Embarrassment, discrimination, safeguarding concerns if student notes contain sensitive information.) |
| **Special characteristics** | Data subjects are children aged 4-11 -- automatically higher risk. |
| **Ease of exploitation** | How easily could the data be misused? Was it exposed to a targeted attacker or publicly? |
| **Containment status** | Has the breach been fully contained? Is there ongoing risk? |

**Risk rating:**

| Rating | Criteria | ICO Notification Required? | School Notification Required? |
|--------|----------|---------------------------|-------------------------------|
| **Unlikely to result in risk** | E.g., encrypted data lost, no key compromised | No | Yes (inform as courtesy) |
| **Risk to rights and freedoms** | E.g., student names + reading data exposed to unauthorised party | Yes (within 72 hours) | Yes (without undue delay) |
| **High risk to rights and freedoms** | E.g., student data publicly exposed, or notes containing sensitive info (SEN, safeguarding) leaked | Yes (within 72 hours) | Yes (without undue delay); schools must notify parents |

> **Default position for children's data:** Unless the breach can be demonstrated to pose no risk, err on the side of notification. Children's data carries an inherently lower threshold for what constitutes "risk to rights and freedoms."

---

### Phase 4: Notification (within 72 hours of becoming aware)

#### 4.8 Timeline

```
Breach         Become         Controller        ICO
occurs         aware          notification      notification
  |              |                |                |
  ?              T=0              T+24h max        T+72h max
                 |                                 |
                 |--- 72 hours -------------------|
```

The 72-hour clock starts when Tally becomes **aware** that a breach has occurred (not when the breach itself occurred). "Aware" means having a reasonable degree of certainty that a breach has taken place.

#### 4.9 Controller (School) Notification -- Required Without Undue Delay

As a data processor, Tally must notify affected controllers (schools) without undue delay after becoming aware of a breach (Article 33(2)).

**Target: Within 24 hours of becoming aware.**

**Notification content:**

| Item | Detail |
|------|--------|
| What happened | Clear, non-technical description of the breach |
| When it happened | Date/time of the breach and date/time of discovery |
| What data was affected | Categories of data (student names, reading records, etc.) |
| How many subjects affected | Number of students and/or staff at the school |
| What Tally has done | Containment and remediation actions taken |
| What the school should do | Recommended actions (e.g., advise staff to change passwords, review student data for tampering) |
| Whether the school needs to notify parents | Tally's assessment of whether the breach meets the "high risk" threshold for data subject notification under Article 34 |
| Contact details | Named contact at Tally for questions |

**Notification channels (in priority order):**

1. Phone call to the school's primary contact on file
2. Email to the school admin's registered email address
3. In-app notification (if the school can still access the system)

**Template:**

```
Subject: URGENT -- Data Breach Notification -- Tally Reading [REF-XXXX]

Dear [School Contact],

We are writing to notify you of a personal data breach affecting your
school's data held in Tally Reading.

WHAT HAPPENED
[Clear description of the breach]

WHEN
The breach [occurred/was discovered] on [DATE] at [TIME].
We became aware of it on [DATE] at [TIME].

WHAT DATA WAS AFFECTED
[List data categories: student names, reading session records, etc.]

WHO IS AFFECTED
Approximately [N] students and [N] staff members at [School Name]
are affected.

WHAT WE HAVE DONE
[List containment and remediation actions]

WHAT YOU SHOULD DO
[Recommended actions for the school]

NOTIFICATION TO PARENTS
Based on our assessment, this breach [does / may / does not] meet the
threshold for notifying data subjects (parents/carers) under Article 34
of UK GDPR. [If yes: We recommend you notify affected parents. We have
prepared a template communication below to assist you.]

We sincerely apologise for this incident and are committed to preventing
recurrence.

For questions, contact [TODO: Name] at [TODO: phone] or
[TODO: privacy@tallyreading.uk].

Reference: [REF-XXXX]

Regards,
[TODO: Name]
Incident Response Lead
Tally Reading
```

#### 4.10 ICO Notification (Article 33) -- Required Unless Risk Is Unlikely

If the breach is likely to result in a risk to the rights and freedoms of data subjects, the **controller** (school) must notify the ICO within 72 hours.

**Tally's role as processor:**

- Tally does not notify the ICO directly (this is the controller's obligation).
- Tally provides the school with all information needed to make the ICO report.
- If multiple schools are affected, Tally may notify the ICO on its own behalf as well, to demonstrate accountability.

**ICO notification channels:**

- Online: [ico.org.uk/for-organisations/report-a-breach/personal-data-breach/](https://ico.org.uk/for-organisations/report-a-breach/personal-data-breach/)
- Phone: 0303 123 1113 (Mon-Fri, 9am-5pm)
- Outside hours: Use online form

**Information required for ICO report (Article 33(3)):**

| Item | Source |
|------|--------|
| Nature of the breach | Phase 3 assessment |
| Categories and approximate number of data subjects | D1 query results from Phase 3 |
| Categories and approximate number of personal data records | D1 query results from Phase 3 |
| Name and contact details of DPO or other contact | `[TODO: DPO / contact details]` |
| Likely consequences of the breach | Phase 3 risk assessment |
| Measures taken or proposed to address the breach | Phase 2 containment + Phase 5 remediation |

If full details are not yet available within 72 hours, provide information in phases. The initial notification can be partial, with follow-up reports as the investigation progresses.

#### 4.11 Data Subject Notification (Article 34) -- High Risk Only

Notification of data subjects (parents/carers, staff) is the **controller's (school's) responsibility**, not Tally's.

**Tally's role:**

- Assess whether the "high risk" threshold is met.
- Advise the school on whether data subject notification is recommended.
- Provide a template communication for the school to send to parents.
- Provide specific details (which students, what data) so the school can notify accurately.

**High risk threshold -- lower bar for children's data:**

The ICO has stated that breaches involving children's data are more likely to meet the "high risk" threshold because children are less able to understand the risks and protect themselves. When in doubt, recommend notification.

**Template for schools to send to parents:**

```
Dear [Parent/Carer],

We are writing to inform you of a data security incident affecting
your child's reading records held in Tally Reading, a tool we use
to track reading progress.

WHAT HAPPENED
[School to describe in their own words, using information from Tally]

WHAT INFORMATION WAS INVOLVED
[E.g., your child's name, reading level, and reading session history]

WHAT WE ARE DOING
[Actions the school is taking]

WHAT YOU CAN DO
[Any recommended steps for parents]

We apologise for this incident. If you have questions, please
contact [School Contact Name] at [School Contact Details].

Yours sincerely,
[Head Teacher / Data Protection Contact]
[School Name]
```

---

### Phase 5: Recovery (24-72 hours)

#### 4.12 Recovery Actions

| Action | Detail |
|--------|--------|
| Verify containment | Confirm the breach vector is fully closed |
| Restore data integrity | If data was altered, restore from Cloudflare D1 backup or manual correction |
| Restore availability | If service was disrupted, confirm full functionality |
| Monitor for recurrence | Enhanced monitoring for 30 days post-incident |
| Credential rotation | If credentials were compromised: force password resets for affected users |
| Token invalidation | Clear `refresh_tokens` table for affected users/organisations |
| Security patching | Deploy any additional hardening measures identified during investigation |

#### 4.13 Verification Checklist

- [ ] Breach vector is confirmed closed
- [ ] All affected systems are operating normally
- [ ] Data integrity has been verified (spot-check affected records)
- [ ] Enhanced monitoring is in place
- [ ] All compromised credentials have been rotated
- [ ] Containment measures (e.g., IP blocks, disabled accounts) are reviewed and adjusted as appropriate

---

### Phase 6: Post-Incident Review (within 2 weeks)

#### 4.14 Review Meeting

Within 2 weeks of the breach being resolved, the Response Team conducts a post-incident review.

**Agenda:**

1. **Timeline reconstruction:** Minute-by-minute account of what happened, when, and what was done.
2. **Root cause analysis:** What was the underlying cause? Was it a code defect, configuration error, human error, or external attack?
3. **Detection effectiveness:** How was the breach detected? How quickly? Could it have been detected sooner?
4. **Response effectiveness:** Did the containment actions work? Were notifications timely?
5. **Lessons learned:** What should be done differently next time?
6. **Remediation actions:** What changes are needed to prevent recurrence?

#### 4.15 Remediation Actions

Document specific, actionable follow-up items:

| Action | Owner | Deadline | Status |
|--------|-------|----------|--------|
| `[Example: Add organization_id check to /api/xyz endpoint]` | Technical Lead | `[Date]` | `[Open/Done]` |
| `[Example: Implement automated cross-tenant testing]` | Technical Lead | `[Date]` | `[Open/Done]` |
| `[Example: Update incident response plan with new scenario]` | Incident Response Lead | `[Date]` | `[Open/Done]` |

#### 4.16 Update Security Measures

Based on the review, update as needed:

- This Data Breach Response Plan
- Data Subject Rights Procedures (Document GDPR-06)
- Security controls and monitoring
- Staff training materials
- Data Processing Agreement with schools
- Technical architecture or code

---

## 5. Breach Register

### 5.1 Purpose

Article 33(5) requires controllers to document all personal data breaches, including facts, effects, and remedial actions. As a processor, Tally maintains its own breach register for accountability.

All breaches are logged, including those assessed as not requiring ICO notification.

### 5.2 Register Template

| Field | Description |
|-------|-------------|
| **Breach reference** | Unique ID (e.g., BRE-2026-001) |
| **Date and time of breach** | When the breach occurred (if known) |
| **Date and time of discovery** | When Tally became aware |
| **Reported by** | Who reported and how |
| **Breach category** | Confidentiality / Integrity / Availability |
| **Severity** | Critical / High / Medium / Low |
| **Description** | What happened |
| **Root cause** | Underlying cause (if determined) |
| **Data categories affected** | Student identity, reading records, staff credentials, etc. |
| **Number of data subjects affected** | Count or estimate |
| **Organisations affected** | List of school names / org IDs |
| **Containment actions** | What was done to stop the breach |
| **Risk assessment outcome** | Risk unlikely / Risk / High risk |
| **ICO notified?** | Yes / No. If no, record the justification. |
| **ICO notification date** | Date of initial notification |
| **ICO reference** | Reference number from ICO (if applicable) |
| **Schools notified?** | Yes / No |
| **School notification dates** | Date(s) each school was notified |
| **Data subjects notified?** | Yes / No (school responsibility) |
| **Remediation actions** | List of follow-up actions |
| **Date resolved** | When the breach was fully resolved |
| **Post-incident review date** | Date of review meeting |
| **Lessons learned** | Summary of review findings |

### 5.3 Storage and Retention

- **Location:** `[TODO: Secure storage location -- encrypted document, internal database, or compliance tool]`
- **Access:** Restricted to Incident Response Lead, Technical Lead, and `[TODO: DPO]`
- **Retention:** Breach register entries are retained for a minimum of **5 years** from the date the breach was resolved, to support accountability obligations and potential regulatory inquiry
- **Format:** `[TODO: Spreadsheet / database / compliance tool]`

---

## 6. Decision Framework: When to Notify the ICO

```
Personal data breach confirmed
        |
        v
Is it likely to result in a risk to
the rights and freedoms of individuals?
        |
   +---------+---------+
   |                   |
   No                  Yes / Uncertain
   |                   |
   v                   v
Record in breach    Does it involve
register only.      children's data?
Do not notify ICO.       |
Document reasoning.  +---+---+
                     |       |
                     Yes     No
                     |       |
                     v       v
              Presume high   Standard
              risk. Notify   risk
              ICO within     assessment.
              72 hours.      Notify ICO if
                             risk likely.
                             72 hours.
```

**Key principle:** For breaches involving children's data (which is the majority of data processed by Tally), the default position is to notify the ICO unless it can be clearly demonstrated that risk to individuals is unlikely.

---

## 7. Tally-Specific Technical Considerations

### 7.1 Cloudflare Workers Architecture

| Feature | Breach Response Implication |
|---------|-----------------------------|
| Edge deployment (global) | Fixes deploy in seconds via `wrangler deploy` -- enables rapid containment |
| No persistent server | No server to compromise; attack surface is code + configuration |
| D1 database | Single source of truth for personal data; backup/recovery via Cloudflare |
| KV storage | AI recommendation cache only; no direct personal identifiers; 7-day TTL |
| R2 storage | Book covers only; no personal data |
| JWT authentication | Secret rotation invalidates all tokens globally; deploy new secret via `wrangler secret put JWT_SECRET` |

### 7.2 Multi-Tenant Isolation

The most likely breach scenario specific to Tally is a **cross-tenant data leak** -- where one school's data becomes visible to another school. This could occur through:

- Missing `WHERE organization_id = ?` clause in a database query
- Incorrect tenant context in middleware
- Direct D1 query in a route that bypasses the data provider's tenant scoping

**Detection:** Audit log monitoring for queries that return data from multiple organisations in a single request.

**Prevention:** Code review checklist item for all database queries. Automated testing with multi-tenant fixtures.

### 7.3 Authentication Compromise Scenarios

| Scenario | Detection | Containment |
|----------|-----------|-------------|
| Individual user password compromised | Unusual login location/time in `login_attempts` | Disable account, revoke tokens, force password reset |
| JWT_SECRET leaked | Forged tokens detected (claims don't match database) | `wrangler secret put JWT_SECRET` with new value; all users re-authenticate |
| Refresh token stolen | Token reuse from different IP/user agent | Revoke specific token; investigate scope |
| Brute force attack | High volume of failed `login_attempts` for one email | Existing rate limiting via `rate_limits` table; block IP at Cloudflare WAF |

### 7.4 Key D1 Tables for Breach Investigation

```sql
-- Recent audit log activity (first place to look)
SELECT * FROM audit_log
WHERE created_at > datetime('now', '-24 hours')
ORDER BY created_at DESC;

-- Failed login attempts (detect brute force)
SELECT email, COUNT(*) as attempts, MIN(created_at) as first, MAX(created_at) as last
FROM login_attempts
WHERE success = 0
  AND created_at > datetime('now', '-24 hours')
GROUP BY email
HAVING attempts > 5
ORDER BY attempts DESC;

-- Cross-tenant check (verify no data leakage)
-- Run for each affected endpoint/query
SELECT DISTINCT organization_id FROM [table]
WHERE [conditions matching the breached query];

-- Active sessions for a compromised user
SELECT * FROM refresh_tokens
WHERE user_id = ?
  AND revoked_at IS NULL
  AND expires_at > datetime('now');
```

---

## 8. Testing and Maintenance

### 8.1 Annual Tabletop Exercise

Conduct a simulated breach exercise at least once per year. Rotate through different breach scenarios:

| Year | Scenario |
|------|----------|
| Year 1 | Cross-tenant data leak (code defect) |
| Year 2 | Compromised admin credentials |
| Year 3 | Cloudflare infrastructure incident / database corruption |
| Year 4 | SQL injection attack |

**Exercise should test:**

- Detection and reporting speed
- Team communication and coordination
- Technical containment procedures
- School notification process
- ICO notification process (simulated)
- Evidence preservation

### 8.2 Notification Channel Testing

Test all notification channels quarterly:

- [ ] Incident email (`[TODO: incident@tallyreading.uk]`) reaches all team members
- [ ] Phone numbers for Response Team are current and reachable
- [ ] School contact details are up to date in the system
- [ ] ICO online reporting form is accessible and bookmarked

### 8.3 Plan Review Schedule

| Trigger | Action |
|---------|--------|
| Annual review | Full review and update of this plan |
| After any breach | Review and update based on lessons learned |
| After tabletop exercise | Review and update based on exercise findings |
| After significant system change | Review affected sections (e.g., new data store, new authentication method) |
| After ICO guidance update | Review for compliance with new guidance |

---

## 9. Reference Information

### 9.1 Key Contacts

| Contact | Details |
|---------|---------|
| ICO breach reporting (online) | ico.org.uk/for-organisations/report-a-breach/personal-data-breach/ |
| ICO helpline | 0303 123 1113 (Mon-Fri, 9am-5pm) |
| ICO postal address | Information Commissioner's Office, Wycliffe House, Water Lane, Wilmslow, Cheshire SK9 5AF |
| Cloudflare support | `[TODO: Support plan details and contact method]` |
| Legal counsel | `[TODO: Firm name, contact name, phone, email]` |
| Tally incident email | `[TODO: incident@tallyreading.uk]` |
| Tally privacy email | `[TODO: privacy@tallyreading.uk]` |

### 9.2 Related Documents

| Document | Reference |
|----------|-----------|
| Data Subject Rights Procedures | GDPR-06 |
| Data Processing Agreement | `[TODO: GDPR-XX]` |
| Privacy Policy | `[TODO: GDPR-XX]` |
| Data Protection Impact Assessment | `[TODO: GDPR-XX]` |
| Data Retention Policy | `[TODO: GDPR-XX]` |

### 9.3 Legal References

- UK GDPR Article 4(12) -- Definition of personal data breach
- UK GDPR Article 33 -- Notification of a personal data breach to the supervisory authority
- UK GDPR Article 34 -- Communication of a personal data breach to the data subject
- ICO Guidance: Personal data breaches (ico.org.uk)

---

## 10. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-02-20 | `[TODO]` | Initial draft |

**Next review date:** `[TODO: Set within 12 months]`
