# Technical and Organisational Security Measures

**Tally** (trading as Tally Reading)

**Last updated:** 24 June 2026

This document describes the technical and organisational measures Tally Reading
("Tally") implements to ensure a level of security appropriate to the risk of
processing personal data on behalf of subscribing schools, in accordance with
Article 32 of the UK GDPR. It forms the security schedule referenced by the
Data Processing Agreement between Tally and each school.

---

## 1. Authentication and Access Control

### 1.1 Password security

- Passwords are hashed using PBKDF2 (SHA-256, 100,000 iterations) with a random
  per-user salt and a 256-bit derived key. Plaintext passwords are never stored
  and cannot be recovered from the hash.
- Password and token comparisons use a constant-time algorithm to prevent timing
  attacks.

### 1.2 Token-based sessions

- Authentication uses JSON Web Tokens (JWTs). Access tokens are short-lived
  (15 minutes); refresh tokens are longer-lived (7 days) and are stored only as
  hashes.
- Refresh tokens are delivered in an `httpOnly`, `Secure`, `SameSite=Strict`
  cookie scoped to the authentication path, so they are not accessible to
  client-side JavaScript.
- Refresh tokens can be revoked, and expired or revoked tokens are removed
  automatically.

### 1.3 Single sign-on

- Schools may authenticate via MyLogin (OAuth2 Authorization Code flow). SSO
  users are issued the same short-lived tokens as password users.

### 1.4 Role-based access control

- Four roles (Owner, Admin, Teacher, Read-only) enforce least-privilege access.
  Every privileged action is checked against the user's role before it executes.

### 1.5 Key management

- Signing and encryption keys are stored as managed platform secrets, never in
  source code or the database.
- School-provided AI API keys are encrypted at rest using AES-256-GCM, with a key
  derived via HKDF-SHA-256.

---

## 2. Multi-Tenant Data Isolation

- Each school's data is logically isolated by an organisation identifier. All
  data queries are scoped to the authenticated user's organisation, enforced
  centrally in middleware before any request handler runs.
- The organisation is validated as existing and active on every request.
- Resource-ownership checks verify that a targeted record belongs to the
  requesting user's organisation.
- Only the Owner role can access more than one organisation, and such access is
  explicitly validated on each request.

---

## 3. Application Security

- **SQL injection:** all database access uses parameterised queries; any dynamic
  identifiers are validated against a fixed allow-list.
- **Input validation:** all incoming data (student records, settings, reading
  levels, bulk imports, ISBNs) is validated and type-checked before processing.
- **Error handling:** server errors are sanitised before they reach the client,
  returning a generic message so that internal details are never leaked.
- **Middleware chain:** every API request passes through request logging, CORS
  enforcement, security headers, error handling, authentication, organisation
  scoping and role checks, in that order, before reaching a route handler.

---

## 4. Transport and Browser Security

The following security headers are applied to responses:

| Header                            | Effect                                            |
| --------------------------------- | ------------------------------------------------- |
| `Strict-Transport-Security`       | Enforces HTTPS for one year, including subdomains |
| `X-Frame-Options: DENY`           | Prevents clickjacking via framing                 |
| `X-Content-Type-Options: nosniff` | Prevents MIME-type sniffing                       |
| `Referrer-Policy`                 | Limits referrer information leakage               |
| `Content-Security-Policy`         | Restricts resource loading; blocks framing        |
| `Cache-Control` / `Pragma`        | Prevents caching of sensitive responses           |

- **CORS:** cross-origin access is restricted to an explicit allow-list of
  permitted origins.
- **CSRF:** the `SameSite=Strict` refresh cookie and the Authorization-header
  bearer-token pattern protect against cross-site request forgery.

---

## 5. Rate Limiting

- Authentication endpoints are limited to 10 requests per minute per user or IP
  address; general API endpoints to 100 requests per minute. Exceeding the limit
  returns HTTP 429 with a retry-after value.

---

## 6. Audit Logging

- Sensitive operations (creating, updating and deleting organisations, users,
  settings and AI configuration) are recorded in an append-only audit log
  capturing the actor, action, affected entity, organisation, timestamp and
  request metadata.
- Audit logs are organisation-scoped and are never updated or deleted by
  application code. IP addresses and user-agent strings are automatically
  anonymised after 90 days, preserving the accountability trail while removing
  personal data.

---

## 7. Infrastructure Security

- Tally runs entirely on Cloudflare's serverless platform (Workers). Each request
  executes in an isolated context with no shared memory and no persistent
  filesystem, eliminating server-management, SSH and file-based attack surfaces.
  Runtime patching is managed by Cloudflare.
- **Data at rest:** all data stores (the D1 SQL database, KV, and R2 object
  storage) are encrypted at rest under Cloudflare-managed encryption. Database
  foreign-key constraints are enforced on every request.
- **DDoS protection** is provided by Cloudflare's global network as standard.
- **Sub-processor assurance:** Cloudflare holds ISO 27001, SOC 2 Type II and
  PCI DSS Level 1 certifications (current status at
  https://www.cloudflare.com/trust-hub/compliance-resources/).

---

## 8. Data Minimisation

- Directly identifying data is minimised wherever possible. In particular,
  student names are never sent to third-party AI providers — only pseudonymised
  reading-profile data (reading level, genre preferences and book history) is
  used to generate recommendations.

---

## 9. Client-Side Storage

- The short-lived access token is held in browser storage to support the
  single-page-application architecture; its exposure is mitigated by a 15-minute
  lifetime, a strict Content-Security-Policy and the absence of inline scripts.
  The refresh token is never accessible to JavaScript (httpOnly cookie).
- Only non-sensitive display data (name, email, role, school name) and UI
  preferences are stored client-side. No secrets are persisted in the browser.

---

## 10. Review Schedule

This document is reviewed at least annually (next review due February 2027),
after any significant architectural change or security incident, and on request
by a controller school or auditor.
