# Technical and Organisational Security Measures

**Tally** (trading as Tally Reading)

**Last updated:** 2026-02-20

> **DRAFT -- NOT YET LEGALLY REVIEWED**
>
> This document is an internal draft recording the technical and
> organisational security measures implemented in the Tally Reading
> platform. It is intended to satisfy the requirements of Article 32 of
> UK GDPR and to support the security schedule of the Data Processing
> Agreement between Tally and subscribing schools. This document must be
> reviewed by a qualified security professional and data protection
> solicitor before being relied upon or shared externally.

---

## 1. Purpose

This document describes the technical and organisational measures
implemented by Tally Reading ("Tally") to ensure a level of security
appropriate to the risk of processing personal data on behalf of
subscribing schools, in accordance with Article 32 of UK GDPR.

The measures documented here reflect the current state of the codebase
and infrastructure. Source file references are provided where applicable
to enable verification and audit.

---

## 2. Authentication and Access Control

### 2.1 Password Hashing

| Parameter | Value | Source |
|---|---|---|
| Algorithm | PBKDF2-SHA256 | `src/utils/crypto.js`, line 39 |
| Iterations | 100,000 | `src/utils/crypto.js`, line 13 (maximum supported by Cloudflare Workers runtime) |
| Salt | 128-bit (16 bytes) cryptographically random, unique per password | `src/utils/crypto.js`, line 14 |
| Hash output | 256-bit (32 bytes) | `src/utils/crypto.js`, line 15 |
| Storage format | `base64(salt):base64(hash)` | `src/utils/crypto.js`, line 49 |

Plaintext passwords are never stored, logged, or transmitted after the
initial hashing operation.

### 2.2 Constant-Time Comparison

All security-sensitive comparisons (password verification, token
verification, JWT signature verification) use constant-time comparison
functions to prevent timing attacks.

| Function | Purpose | Source |
|---|---|---|
| `constantTimeEqual()` | Byte-array comparison using XOR accumulation | `src/utils/crypto.js`, lines 298-306 |
| `constantTimeStringEqual()` | String comparison (converts to bytes, then delegates to `constantTimeEqual`) | `src/utils/crypto.js`, lines 314-317 |

### 2.3 JWT Access Tokens

| Parameter | Value | Source |
|---|---|---|
| Algorithm | HS256 (HMAC-SHA256) | `src/utils/crypto.js`, line 110 |
| Time-to-live | 15 minutes | `src/utils/crypto.js`, line 114 |
| Auto-refresh | Client refreshes 60 seconds before expiry | Frontend `fetchWithAuth()` in `src/contexts/AppContext.js` |
| Payload contents | User ID (`sub`), email, name, organisation ID (`org`), organisation slug, role | `src/utils/crypto.js`, lines 257-266 |
| Signature verification | Constant-time comparison | `src/utils/crypto.js`, line 192 |
| Expiration check | Server-side `exp` claim validation | `src/utils/crypto.js`, lines 200-202 |

### 2.4 Refresh Tokens

| Parameter | Value | Source |
|---|---|---|
| Token generation | 256-bit (32 bytes) cryptographically random | `src/utils/crypto.js`, line 155 |
| Time-to-live | 7 days | `src/utils/crypto.js`, line 115 |
| Storage | SHA-256 hash stored in D1 database; client receives plain token | `src/utils/crypto.js`, lines 158-159 |
| Delivery | httpOnly cookie | `src/routes/auth.js` |
| Cookie attributes | `Secure` (production), `SameSite=Strict`, `Path=/api/auth` | `src/routes/auth.js` |
| Verification | Hash comparison using `constantTimeStringEqual()` | `src/utils/crypto.js`, lines 218-221 |

### 2.5 Password Reset Tokens

| Parameter | Value |
|---|---|
| Expiry | 1 hour from generation |
| Storage | SHA-256 hashed before database storage |
| Usage | Single-use (deleted after successful reset) |

### 2.6 Role-Based Access Control (RBAC)

Tally implements a four-tier role hierarchy with middleware enforcement at
the route level.

| Role | Hierarchy Level | Capabilities |
|---|---|---|
| **Owner** | 4 (highest) | Full system access, manages all organisations, can switch between schools via `X-Organization-Id` header |
| **Admin** | 3 | Organisation-level management, creates/manages users and teachers, manages books and settings |
| **Teacher** | 2 | Manages students, classes, reading sessions, records book scans |
| **Readonly** | 1 (lowest) | View-only access to organisation data |

| Middleware | Purpose | Source |
|---|---|---|
| `requireOwner()` | Restricts to owner role | `src/middleware/tenant.js`, line 162 |
| `requireAdmin()` | Restricts to admin role or above | `src/middleware/tenant.js`, line 163 |
| `requireTeacher()` | Restricts to teacher role or above | `src/middleware/tenant.js`, line 164 |
| `requireReadonly()` | Restricts to readonly role or above | `src/middleware/tenant.js`, line 165 |
| `requireOrgOwnership()` | Verifies resource belongs to user's organisation | `src/middleware/tenant.js`, lines 189-227 |

Role checks use the `hasPermission()` function which compares numeric
hierarchy levels, ensuring that higher roles inherit the permissions of
lower roles (`src/utils/crypto.js`, lines 423-427).

---

## 3. Data Encryption

### 3.1 Encryption in Transit

| Measure | Detail |
|---|---|
| Protocol | TLS (HTTPS) enforced by Cloudflare for all client-server communication |
| HSTS | `Strict-Transport-Security: max-age=31536000; includeSubDomains` (`src/worker.js`, line 99) |
| Certificate management | Automatic via Cloudflare (Universal SSL) |

### 3.2 Encryption at Rest

| Data | Method | Detail |
|---|---|---|
| Passwords | PBKDF2-SHA256 (one-way hash) | See Section 2.1 |
| AI API keys (school-provided) | AES-256-GCM symmetric encryption | Key derived from `JWT_SECRET` via HKDF-SHA256 with static salt and info parameters. 96-bit random IV per encryption operation. (`src/utils/crypto.js`, lines 446-551) |
| Refresh tokens | SHA-256 hash | Only the hash is stored in the database (`src/utils/crypto.js`, lines 228-233) |
| D1 database | Cloudflare-managed encryption at rest | Managed by Cloudflare infrastructure |
| KV storage | Cloudflare-managed encryption at rest | Managed by Cloudflare infrastructure |
| R2 object storage | Cloudflare-managed encryption at rest | Managed by Cloudflare infrastructure (book cover images only, no personal data) |

### 3.3 Key Management

| Key | Derivation | Purpose |
|---|---|---|
| JWT signing key | `JWT_SECRET` environment variable (Cloudflare secret) | Signing and verifying JWT access tokens |
| AES-GCM encryption key | Derived from `JWT_SECRET` using HKDF-SHA256 with salt `krm-api-key-encryption-v1` and info `api-key-encryption` | Encrypting school-provided AI API keys at rest |

[TODO: Document key rotation procedure for JWT_SECRET. Rotation will
invalidate all active sessions and require re-encryption of stored API
keys.]

---

## 4. Multi-Tenant Data Isolation

### 4.1 Organisation Scoping

All database queries are scoped to the authenticated user's organisation
via the `tenantMiddleware()` function (`src/middleware/tenant.js`, lines
85-130).

| Control | Implementation | Source |
|---|---|---|
| Organisation ID injection | `c.set('organizationId', ...)` set by JWT auth middleware, verified by tenant middleware | `src/middleware/tenant.js`, lines 68-69, 86-129 |
| Query scoping | All data queries include `WHERE organization_id = ?` | Applied throughout `src/routes/*.js` and `src/data/d1Provider.js` |
| Organisation validation | Tenant middleware verifies the organisation exists and is active (`is_active = 1`) before allowing access | `src/middleware/tenant.js`, lines 106-114 |
| Owner org switching | Owner role can access other organisations via `X-Organization-Id` header; validated in tenant middleware | `src/middleware/tenant.js`, lines 95-100 |
| Resource ownership | `requireOrgOwnership()` middleware verifies the target resource belongs to the user's organisation | `src/middleware/tenant.js`, lines 189-227 |

### 4.2 SQL Injection Prevention

| Control | Detail |
|---|---|
| Parameterised queries | All D1 queries use `db.prepare(...).bind(...)` with parameterised placeholders |
| Table name whitelist | Dynamic table names in `requireOrgOwnership()` are validated against a static whitelist (`ALLOWED_OWNERSHIP_TABLES`) at middleware creation time | `src/middleware/tenant.js`, lines 169-179 |

### 4.3 Soft Delete Filtering

Organisations and users use soft deletion (`is_active` column). Queries
must explicitly filter `WHERE is_active = 1` to exclude deactivated
records. This is not automatic and is enforced by convention.

[TODO: Consider adding a database view or query wrapper that automatically
filters inactive records to reduce risk of accidental data leakage.]

---

## 5. Rate Limiting

### 5.1 Authentication Rate Limiting

| Parameter | Value | Source |
|---|---|---|
| Limit | 10 requests per 60 seconds per IP/user | `src/middleware/tenant.js`, line 365 |
| Scope | Authentication endpoints (`/api/auth/*`) | Applied via `authRateLimit()` middleware |
| Key | User ID (if authenticated) or `ip:<ip_address>` | `src/middleware/tenant.js`, lines 311-312 |
| Storage | D1 `rate_limits` table (distributed across all Worker instances) | `src/middleware/tenant.js`, lines 318-322 |
| Response | HTTP 429 with `retryAfter` value | `src/middleware/tenant.js`, lines 326-329 |

### 5.2 General API Rate Limiting

| Parameter | Value | Source |
|---|---|---|
| Limit | 100 requests per 60 seconds per IP/user | `src/middleware/tenant.js`, line 297 |
| Key | Same as auth rate limiting | Same |
| Cleanup | Probabilistic: 1% chance per request, deletes entries older than 1 hour | `src/middleware/tenant.js`, lines 341-345 |

### 5.3 Graceful Degradation

If the `rate_limits` table does not exist or a database error occurs, rate
limiting is bypassed and the request continues. This prevents rate
limiting infrastructure issues from causing service outages
(`src/middleware/tenant.js`, lines 347-351).

---

## 6. Security Headers

The following security headers are applied to all API responses via the
security headers middleware (`src/worker.js`, lines 85-112).

| Header | Value | Purpose |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforce HTTPS for 1 year, including subdomains |
| `X-Frame-Options` | `DENY` | Prevent clickjacking by prohibiting framing |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME type sniffing attacks |
| `X-XSS-Protection` | `1; mode=block` | Enable browser XSS filter (legacy browsers) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer information leakage |
| `Content-Security-Policy` | `default-src 'none'; frame-ancestors 'none'` | Restrict resource loading for API responses |
| `Cache-Control` | `no-store, no-cache, must-revalidate, private` | Prevent caching of sensitive responses (auth and user endpoints only) |
| `Pragma` | `no-cache` | Legacy cache prevention for auth and user endpoints |

---

## 7. Request Processing Security

### 7.1 Middleware Chain

All API requests pass through the following middleware chain in order
(`src/worker.js`):

1. `logger()` -- Request logging (Hono built-in)
2. `cors()` -- CORS origin whitelist enforcement
3. Security headers middleware -- Applies headers listed in Section 6
4. `errorHandler()` -- Catches and sanitises errors
5. Authentication middleware -- JWT or legacy, auto-detected
6. Foreign key enforcement -- `PRAGMA foreign_keys = ON` per request
7. `tenantMiddleware()` -- Organisation scoping and validation
8. Route-specific RBAC middleware -- `requireAdmin()`, `requireTeacher()`, etc.
9. Route handler

### 7.2 CORS Configuration

| Parameter | Value | Source |
|---|---|---|
| Origin policy | Explicit whitelist via `ALLOWED_ORIGINS` environment variable | `src/worker.js`, lines 44-82 |
| Allowed methods | GET, POST, PUT, DELETE, OPTIONS | `src/worker.js`, line 77 |
| Allowed headers | Content-Type, Authorization | `src/worker.js`, line 78 |
| Credentials | Allowed (for httpOnly cookie refresh token) | `src/worker.js`, line 81 |
| Max age | 86,400 seconds (24 hours) | `src/worker.js`, line 80 |
| Development mode | Allows localhost origins when `ENVIRONMENT=development` | `src/worker.js`, lines 50-54 |

Current allowed origins: `https://kids-reading-manager.brisflix.workers.dev/`, `https://reading.brisflix.com`, `https://tallyreading.uk` (`wrangler.toml`, line 44).

### 7.3 Error Sanitisation

5xx server errors are sanitised before being returned to the client. The
internal error message is replaced with a generic "Internal Server Error"
string to prevent leakage of internal implementation details
(`src/middleware/errorHandler.js`, lines 16-19; `src/worker.js`, lines
252-253).

### 7.4 Input Validation

Request data is validated using the validation utility module
(`src/utils/validation.js`), which includes:

- Reading level range validation (bounds checking, type coercion, min/max logic)
- Student data validation (required fields, type checking)
- Settings validation (AI configuration, reading status thresholds)
- Bulk import validation (array structure, per-record validation)
- ISBN validation and normalisation (`src/utils/isbn.js`)

---

## 8. Audit Logging

### 8.1 Audit Trail

Sensitive operations are recorded in the `audit_log` table in the D1
database via the `auditLog()` middleware wrapper
(`src/middleware/tenant.js`, lines 237-283).

| Field | Description |
|---|---|
| `id` | UUID (crypto.randomUUID) |
| `organization_id` | Organisation scope of the action |
| `user_id` | Authenticated user who performed the action |
| `action` | Action type (e.g., `create`, `update`, `delete`) |
| `entity_type` | Entity affected (e.g., `student`, `class`, `session`, `user`, `organization`, `settings`, `ai_config`) |
| `entity_id` | ID of the affected entity |
| `ip_address` | Client IP from `cf-connecting-ip` or `x-forwarded-for` header |
| `user_agent` | Client user-agent string |
| `created_at` | Timestamp (database default) |

### 8.2 Logged Events

The following categories of events are logged:

- Organisation creation, update, and deletion
- User creation, update, role changes, and deactivation
- Organisation settings changes
- AI configuration changes (provider, model selection)

### 8.3 Audit Log Integrity

- Audit log entries are append-only (INSERT only, no UPDATE or DELETE operations in application code)
- Logging failures do not cause request failures (wrapped in try/catch, `src/middleware/tenant.js`, lines 277-281)
- Audit logs are scoped to the organisation (`organization_id` column)

[TODO: Implement audit log retention policy. IP addresses and user-agent
strings should be anonymised or purged after 90 days to comply with data
minimisation. See Compliance Checklist item.]

---

## 9. Infrastructure Security

### 9.1 Serverless Architecture

| Property | Detail |
|---|---|
| Runtime | Cloudflare Workers (V8 isolates) |
| Isolation | Each request runs in an isolated V8 context; no shared memory between requests |
| Filesystem | No persistent filesystem; no file-based attack surface |
| Server management | None required (fully managed by Cloudflare) |
| SSH/remote access | Not applicable (no servers to access) |
| Patching | Runtime patches managed by Cloudflare |

### 9.2 Database Security

| Database | Security Properties |
|---|---|
| D1 (primary) | Managed SQLite; automatic backups; encryption at rest (Cloudflare-managed); foreign key constraints enforced per request (`PRAGMA foreign_keys = ON`, `src/worker.js`, lines 142-151) |
| KV (legacy) | Cloudflare-managed encryption at rest; used for legacy storage and recommendation caching |
| R2 (object storage) | Cloudflare-managed encryption at rest; used for book cover image caching only (no personal data) |

### 9.3 Cloudflare Certifications

Cloudflare holds the following security certifications (verify current
status at https://www.cloudflare.com/trust-hub/compliance-resources/):

- ISO 27001
- SOC 2 Type II
- PCI DSS Level 1
- HIPAA (not applicable to Tally but indicates security maturity)

### 9.4 DDoS Protection

DDoS mitigation is provided by Cloudflare's global network as a standard
feature of the Workers platform. No additional configuration is required.

---

## 10. Client-Side Security

### 10.1 Cookie Security

| Cookie | Attributes |
|---|---|
| `refresh_token` | `httpOnly` (not accessible to JavaScript), `Secure` (HTTPS only in production), `SameSite=Strict` (prevents CSRF), `Path=/api/auth` (restricted scope) |

### 10.2 Client-Side Storage

| Storage | Data | Risk Assessment |
|---|---|---|
| `localStorage: krm_auth_token` | JWT access token (15-minute TTL) | Industry-standard approach for SPA authentication. Less secure than httpOnly cookies but necessary for SPA architecture (Authorization header pattern). Mitigated by short TTL. |
| `localStorage: krm_user` | Non-sensitive user profile (name, email, role, org name) | Low risk -- display-only data, no secrets |
| `localStorage: bookCovers` | Book cover image URLs | No personal data |
| `sessionStorage` | Class filter, recent students, priority students | Cleared on tab close, never transmitted to server |

### 10.3 CSRF Protection

- Refresh token cookie: `SameSite=Strict` prevents cross-site request forgery
- API authentication: Bearer token in Authorization header (not automatically sent by browsers in cross-origin requests)
- CORS: Explicit origin whitelist prevents unauthorised cross-origin API access

---

## 11. Scheduled Tasks and Automated Processing

| Task | Schedule | Purpose | Data Accessed | Source |
|---|---|---|---|---|
| Streak recalculation | Daily at 02:00 UTC | Recalculate all student reading streaks across all organisations | Reading session dates (per student, per organisation) | `src/worker.js`, lines 309-335; `src/utils/streakCalculator.js` |

This is the only scheduled task. It accesses reading session dates to
calculate streak values and does not expose data externally.

---

## 12. Identified Security Gaps and Recommendations

The following gaps have been identified during this review. Each is
prioritised and tracked in the Compliance Checklist
(`docs/gdpr/10-compliance-checklist.md`).

### 12.1 Data Minimisation

| Gap | Risk | Recommendation | Priority |
|---|---|---|---|
| Student names sent to AI providers | Directly identifying personal data shared with third-party AI services in the US | Remove `studentProfile.name` and `student.name` from AI prompts in `src/services/aiService.js` (lines 59, 344, 356). Replace with a non-identifying label such as "this student". | Immediate |

### 12.2 Data Retention and Cleanup

| Gap | Risk | Recommendation | Priority |
|---|---|---|---|
| No hard delete capability for student data | Cannot fully comply with erasure requests (Article 17) | Implement hard delete endpoints for students and related reading sessions, preferences | Immediate |
| No hard delete for user data | Cannot fully erase user records on request | Implement hard delete for users and related auth tokens, login attempts, audit log references | Immediate |
| Audit logs retain IP addresses and user-agents indefinitely | Excessive data retention; IP addresses are personal data | Implement automated anonymisation (hash or truncate last octet) for audit log entries older than 90 days | High |
| Expired refresh tokens persist in database | Unnecessary data retention | Add daily cron job: `DELETE FROM refresh_tokens WHERE expires_at < datetime('now')` | High |
| Expired/used password reset tokens persist | Unnecessary data retention | Add daily cron job: `DELETE FROM password_reset_tokens WHERE expires_at < datetime('now') OR used_at IS NOT NULL` | High |
| Old login attempt records persist | Unnecessary data retention; contains IP addresses | Add daily cron job: `DELETE FROM login_attempts WHERE created_at < datetime('now', '-30 days')` | High |
| Rate limit cleanup is probabilistic (1% chance) | Old rate limit entries may accumulate | Add to daily cron job: `DELETE FROM rate_limits WHERE created_at < datetime('now', '-1 hour')` | Medium |
| R2 book cover cache has no expiry | Unbounded storage growth (no personal data, but operational concern) | Configure R2 lifecycle rules for 90-day expiry or implement cleanup job | Low |

### 12.3 Token Security

| Gap | Risk | Recommendation | Priority |
|---|---|---|---|
| JWT stored in localStorage | Vulnerable to XSS attacks (if XSS were present). Industry-standard tradeoff for SPA architecture. | Accept as known tradeoff. Mitigated by: CSP headers, short 15-minute TTL, no inline scripts in API responses. Future enhancement: consider BFF (Backend-for-Frontend) pattern to use httpOnly cookies for access tokens. | Low (accepted risk) |

### 12.4 Access Control

| Gap | Risk | Recommendation | Priority |
|---|---|---|---|
| No Right to Restriction mechanism | Cannot mark individual student records as "processing restricted" (Article 18) | Consider adding a `processing_restricted` boolean flag to the `students` table, enforced in middleware | Medium |
| No Subject Access Request export endpoint | Manual effort required to fulfil SARs | Implement `GET /api/admin/export/student/:id` and `GET /api/admin/export/user/:id` endpoints that return all data held about a data subject in machine-readable format | High |

### 12.5 Key Rotation

| Gap | Risk | Recommendation | Priority |
|---|---|---|---|
| No documented key rotation procedure for JWT_SECRET | If the secret is compromised, all sessions and encrypted API keys are affected | Document and test a key rotation procedure. Consider supporting dual-key verification during rotation window. | Medium |

---

## 13. Review Schedule

This document is reviewed:

- At least **annually** (next review due: [TODO: Insert date, e.g.
  February 2027])
- After any significant architectural change or security incident
- Upon request by a controller school or auditor

---

## Appendix: Source File Reference

| File | Purpose |
|---|---|
| `src/utils/crypto.js` | Password hashing (PBKDF2), JWT creation/verification, refresh token hashing, constant-time comparison, AES-GCM encryption for API keys, role hierarchy |
| `src/middleware/tenant.js` | JWT auth middleware, tenant isolation middleware, RBAC middleware (`requireOwner/Admin/Teacher/Readonly`), resource ownership verification, audit logging, rate limiting |
| `src/middleware/errorHandler.js` | Global error handler, error sanitisation for 5xx responses, error constructor helpers |
| `src/worker.js` | Hono app setup, middleware chain, CORS configuration, security headers, authentication strategy selection, scheduled task handler |
| `src/routes/auth.js` | Authentication endpoints (login, register, refresh, password reset), refresh token cookie handling |
| `src/services/aiService.js` | AI provider integration (Anthropic, OpenAI, Google Gemini), prompt construction (contains student name -- flagged for removal) |
| `src/utils/validation.js` | Input validation for students, settings, reading levels, bulk imports |
| `src/utils/isbn.js` | ISBN validation, normalisation, ISBN-10 to ISBN-13 conversion |
| `src/data/d1Provider.js` | D1 database operations, snake_case to camelCase conversion, organisation-scoped queries |
| `src/contexts/AppContext.js` | Frontend state management, `fetchWithAuth()` with auto-refresh, concurrent refresh handling |
| `wrangler.toml` | Cloudflare Worker configuration, bindings, routes, cron triggers, allowed origins |
