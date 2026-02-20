# Sub-Processor Register

**Tally** (trading as Tally Reading)

**Last updated:** 2026-02-20

> **DRAFT -- NOT YET LEGALLY REVIEWED**
>
> This document is an internal draft prepared to record the sub-processors
> engaged by Tally Reading in the delivery of its platform. It must be
> reviewed and approved by a qualified data protection solicitor before
> being relied upon or shared with controller schools. Do not treat this
> document as final until legal review is complete.

---

## 1. Purpose

This register records all sub-processors engaged by Tally Reading
("Tally", "we", "us") in connection with the processing of personal data
on behalf of subscribing schools (data controllers). It is maintained in
accordance with Article 28(2) of UK GDPR and the obligations set out in
the Data Processing Agreement (DPA) between Tally and each school.

Schools, as data controllers, have the right to be informed of all
sub-processors and to object to the appointment of new or replacement
sub-processors.

---

## 2. Definitions

| Term | Meaning |
|---|---|
| **Controller** | The subscribing school that determines the purposes and means of processing personal data |
| **Processor** | Tally Reading, which processes personal data on behalf of the controller school |
| **Sub-processor** | A third party engaged by Tally to carry out specific processing activities on behalf of the controller |
| **DPA** | Data Processing Agreement between Tally and a controller school |
| **BYOK** | Bring Your Own Key -- the school provides its own API key to enable an optional feature |
| **IDTA** | UK International Data Transfer Agreement |
| **SCCs** | Standard Contractual Clauses (EU) |

---

## 3. Sub-Processor Register

### 3.1 Core Sub-Processors

These sub-processors are engaged for all schools using the Tally platform.

| Sub-processor | Purpose | Data Processed | Location | DPA Status | Transfer Mechanism |
|---|---|---|---|---|---|
| **Cloudflare, Inc.** | Application hosting (Workers serverless compute), SQL database (D1), key-value storage (KV), object storage (R2), CDN and content delivery, DDoS protection, DNS, Email Routing | All personal data: student records (names, reading levels, preferences, reading sessions), staff user accounts (names, emails, hashed passwords), audit logs (IP addresses, user-agents, actions), authentication tokens (hashed), organisation settings, book catalogue data | Global edge network. D1 database can be configured for EU/UK jurisdiction. [TODO: Confirm D1 location setting in Cloudflare dashboard and document here.] | Cloudflare standard DPA (available at https://www.cloudflare.com/cloudflare-customer-dpa/). [TODO: Download, review, and countersign the Cloudflare DPA. Retain a signed copy.] | UK adequacy decision for EU transfers. UK IDTA / EU SCCs for US transfers. [TODO: Confirm specific transfer mechanism -- IDTA or Data Localisation Suite -- and retain signed documentation.] |

**Note on Cloudflare:** Cloudflare is the primary infrastructure provider.
All data processed by the Tally platform transits Cloudflare infrastructure.
Cloudflare holds ISO 27001, SOC 2 Type II, and PCI DSS certifications.
Cloudflare maintains its own sub-processor list at
https://www.cloudflare.com/cloudflare-sub-processors/.

### 3.2 Optional Sub-Processors (School-Controlled, BYOK)

These sub-processors are only engaged when a school actively opts in by
providing its own API key. The feature is disabled by default. Schools
that enable these services enter into their own contractual relationship
with the provider.

| Sub-processor | Purpose | Data Processed | Location | DPA Status | Transfer Mechanism |
|---|---|---|---|---|---|
| **Anthropic (Claude AI)** | AI-powered book recommendations (optional, BYOK) | Student reading profile: name*, reading level (AR min/max), genre preferences, likes/dislikes, list of books previously read (title, author, genre) | US | School's own DPA with Anthropic. Tally does not hold a direct contract with Anthropic -- the school's API key is used, making the school the contracting party. | School responsible as controller using their own API key. School must ensure its own international transfer compliance. |
| **OpenAI (ChatGPT)** | AI-powered book recommendations (alternative provider, optional, BYOK) | Same data as Anthropic (above) | US | School's own DPA with OpenAI. Same BYOK model as Anthropic. | School responsible as controller using their own API key. |
| **Google (Gemini)** | AI-powered book recommendations (alternative provider, optional, BYOK) | Same data as Anthropic (above) | US / Global | School's own DPA with Google. Same BYOK model as Anthropic. | School responsible as controller using their own API key. |

**\* Data minimisation concern -- student names:**

The AI recommendation prompt currently includes the student's name (see
`src/services/aiService.js`, lines 59 and 344). This is flagged for
removal. Once remediated, only pseudonymised reading profile data (reading
level, genre preferences, book history) will be sent to AI providers. No
directly identifying personal data will be shared.

[TODO: Remove student name from AI prompts (src/services/aiService.js).
Update this register once the change is deployed.]

### 3.3 Optional Sub-Processors (Transactional Email)

| Sub-processor | Purpose | Data Processed | Location | DPA Status | Transfer Mechanism |
|---|---|---|---|---|---|
| **Resend** (if used instead of Cloudflare Email Routing) | Transactional emails: password reset links, account welcome emails, account invitation emails | Staff user email address, staff user display name, email message content (password reset links, invitation URLs) | US | [TODO: Obtain Resend DPA. Check https://resend.com/legal for current data processing terms. Download, review, and countersign.] | UK IDTA / SCCs. [TODO: Confirm transfer mechanism and retain signed documentation.] |

**Note:** Tally currently uses Cloudflare Email Routing (covered under the
Cloudflare DPA above) for transactional email. Resend is listed as an
alternative provider that may be adopted. If Resend is adopted, a DPA must
be obtained before processing begins.

### 3.4 Third-Party Services (No Personal Data Processed)

The following services are used by Tally but do not process personal data
and therefore do not constitute sub-processors under UK GDPR. They are
listed here for transparency.

| Service | Purpose | Data Sent | Personal Data? |
|---|---|---|---|
| **OpenLibrary (Internet Archive)** | Book metadata and cover image retrieval | ISBN, book title, book author | No. Only book catalogue data is sent. No student, user, or school data is transmitted. |

---

## 4. Change Notification Procedure

### 4.1 Advance notice

In accordance with our Data Processing Agreement, Tally will provide
subscribing schools with at least **30 calendar days' written notice**
before engaging any new sub-processor or replacing an existing
sub-processor that processes personal data.

Notice will be provided by:

1. Email to the school's designated administrative contact (the email
   address associated with the admin or owner account); and
2. Update to this Sub-Processor Register, with the new entry clearly
   marked as "Pending -- effective [date]".

### 4.2 Content of notice

Each notification will include:

- The name of the proposed sub-processor
- The purpose of the processing
- The categories of personal data to be processed
- The location of processing
- The proposed effective date
- A summary of the data protection safeguards in place (DPA status,
  transfer mechanism, certifications)

### 4.3 Controller's right to object

Schools have the right to object to the appointment of a new or
replacement sub-processor within the 30-day notice period. Objections
must be submitted in writing to [TODO: Insert contact email, e.g.
privacy@tallyreading.uk].

Upon receiving a valid objection, Tally will:

1. Acknowledge the objection within 5 working days;
2. Engage with the school to understand and, where possible, address the
   concerns raised;
3. If the concerns cannot be resolved, either:
   (a) withdraw the proposed sub-processor appointment; or
   (b) offer the school the option to terminate the DPA and subscription
       without penalty, with data return or deletion as specified in the
       DPA.

### 4.4 Emergency changes

In exceptional circumstances where a sub-processor change is required
urgently (for example, to maintain the security or availability of the
service), Tally may implement the change with less than 30 days' notice.
In such cases, schools will be notified as soon as reasonably practicable
and will retain the right to object as described above.

---

## 5. Sub-Processor Due Diligence

Before engaging any new sub-processor, Tally will:

1. Assess the sub-processor's technical and organisational security
   measures;
2. Verify that the sub-processor can comply with the data protection
   obligations set out in our DPA with schools;
3. Ensure that an appropriate data processing agreement is in place with
   the sub-processor;
4. For international transfers, verify that an appropriate transfer
   mechanism is in place (UK IDTA, SCCs, or adequacy decision);
5. Document the due diligence assessment and retain it for audit purposes.

---

## 6. Review Schedule

This register is reviewed:

- At least **annually** (next review due: [TODO: Insert date, e.g.
  February 2027])
- Whenever a sub-processor is added, removed, or materially changed
- Upon request by a controller school

---

## Appendix: Outstanding Actions

| # | Action | Priority |
|---|---|---|
| 1 | Download and countersign Cloudflare DPA from cloudflare.com/cloudflare-customer-dpa | Immediate |
| 2 | Confirm D1 database location setting (EU/UK jurisdiction) in Cloudflare dashboard | Immediate |
| 3 | Confirm international transfer mechanism for Cloudflare (IDTA or Data Localisation Suite) | Immediate |
| 4 | Remove student name from AI recommendation prompts (src/services/aiService.js) | Immediate |
| 5 | Obtain Resend DPA (if Resend is adopted as email provider) | Before adoption |
| 6 | Insert privacy contact email address in Section 4.3 | Before launch |
| 7 | Set next annual review date in Section 6 | Before launch |
| 8 | Provide guidance to schools on obtaining their own DPAs with AI providers (Anthropic, OpenAI, Google) | Before AI feature is offered |
