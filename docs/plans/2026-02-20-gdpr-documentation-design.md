# GDPR Documentation Suite Design

**Date:** 2026-02-20
**Status:** Approved

## Context

Tally Reading is a multi-tenant SaaS application for tracking student reading progress in UK primary schools. It processes children's personal data (names, reading levels, preferences, session history) and shares some data with AI providers for book recommendations. Schools are data controllers; Tally is the data processor.

## Jurisdiction

Primary: UK GDPR (Data Protection Act 2018 + UK GDPR)
Secondary: Notes included for EU GDPR expansion

## Data Inventory Summary

### Data Subjects
- **Students (children):** name, reading level range, age range, likes/dislikes, notes, reading sessions, current book, streaks, preferences
- **Users (teachers/admins/owners):** name, email, password hash, role, login timestamps, organization

### External Data Recipients
- Cloudflare (hosting, D1 database, KV storage, R2 object storage, CDN)
- AI providers (Anthropic/OpenAI/Google) - via school BYOK, receives student name + reading profile
- OpenLibrary - book metadata and cover images (no personal data)
- Email provider (Resend/Cloudflare Email) - user email addresses for password resets

### Client-Side Storage
- localStorage: JWT access token, user object, book cover cache
- httpOnly cookie: refresh token (7-day, Secure, SameSite=Strict)
- sessionStorage: UI state (class filter, recent students, priority markers)

### Key GDPR Risks Identified
1. Student names sent to AI providers (unnecessary, should be removed)
2. Soft deletes only - no hard delete capability for erasure requests
3. Audit logs retain IP addresses/user-agents indefinitely
4. Login attempts table has no automatic cleanup
5. Student notes field could contain sensitive/SEN information
6. Expired refresh tokens and password reset tokens persist

## Documents to Create

```
docs/gdpr/
├── 01-privacy-policy.md              # Public-facing website content
├── 02-data-processing-agreement.md   # Contract template for schools
├── 03-dpia.md                        # Data Protection Impact Assessment
├── 04-ropa.md                        # Records of Processing Activities
├── 05-data-retention-policy.md       # Retention periods and cleanup
├── 06-data-subject-rights.md         # SAR/erasure/portability procedures
├── 07-data-breach-response-plan.md   # Incident response process
├── 08-sub-processor-register.md      # Third-party processor list
├── 09-technical-security-measures.md # Security controls documentation
└── 10-compliance-checklist.md        # Action items for the developer
```

## Approach

- All documents based on actual codebase analysis (not generic templates)
- UK GDPR terminology and ICO guidance throughout
- Placeholder markers `[TODO]` for items requiring human input (company details, DPO, legal review)
- Code change recommendations tracked in compliance checklist
- Documents are drafts requiring legal review before use

## Decisions

- **Controller/Processor model:** Schools = controllers, Tally = processor
- **Lawful basis:** Contract (school subscription) for core processing; Legitimate interests for security/audit; Consent for optional AI features
- **AI data sharing:** BYOK model, schools opt in, recommend removing student names from prompts
- **Retention:** Will propose specific periods per data category (currently no defined retention)
- **Children's data:** Schools responsible for lawful basis (typically public task for maintained schools, legitimate interests for academies/independent)
