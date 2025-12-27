# Kids Reading Manager — Multi-Tenant SaaS Scaling Plan

## Executive Summary

Transform the Kids Reading Manager from a single-user application into a multi-tenant SaaS platform serving multiple schools. Each school will have isolated data (students, classes, sessions, settings) while sharing a global book catalog that they can filter/select from.

---

## 1. Architecture Decisions

### 1.1 Tenancy Model: **Organization-Based Multi-Tenancy**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Isolation Level | Logical (shared database, tenant column) | Simpler to maintain than separate DBs per school; Cloudflare D1 handles this well |
| Tenant Identifier | `organization_id` UUID | Added to all tenant-scoped tables |
| Book Catalog | Global with per-org selection | Schools select which books from global catalog are available to their students |
| Deployment | Single Worker deployment | One codebase, one deployment, tenant routing via JWT claims |

### 1.2 Authentication Model: **JWT with Email/Password**

| Component | Current | Proposed |
|-----------|---------|----------|
| Identity | Shared password | Individual user accounts with email/password |
| Token | Custom base64 HMAC | Standard JWT with `organizationId` and `role` claims |
| Roles | None | `owner`, `admin`, `teacher`, `readonly` |
| Session | 12 hours | 24 hours with refresh token support |

### 1.3 Data Storage Migration

| Data Type | Current Storage | Proposed Storage | Reason |
|-----------|-----------------|------------------|--------|
| Books | D1 (shared) | D1 (shared, unchanged) | Already scalable |
| Genres | KV blob | D1 (shared) | Better querying |
| Students | KV blob | D1 (per-org) | SQL querying, isolation |
| Classes | KV blob | D1 (per-org) | SQL querying, isolation |
| Reading Sessions | Embedded in student | D1 (normalized table) | Enables analytics, reduces document size |
| Settings | KV blob | D1 (per-org) | Isolation |
| Organizations | N/A | D1 (new) | Tenant management |
| Users | N/A | D1 (new) | Authentication |

---

## 2. Database Schema Design

### 2.1 New Tables

```sql
-- Migration 0002: Organizations and Users
-- =========================================

-- Organizations (Schools)
CREATE TABLE organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,           -- URL-safe identifier: "lincoln-elementary"
    subscription_tier TEXT DEFAULT 'free', -- 'free', 'basic', 'premium'
    max_students INTEGER DEFAULT 50,      -- Tier-based limits
    max_teachers INTEGER DEFAULT 3,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_organizations_slug ON organizations(slug);

-- Users (Teachers/Admins)
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,          -- Using Web Crypto PBKDF2
    name TEXT NOT NULL,
    role TEXT DEFAULT 'teacher',          -- 'owner', 'admin', 'teacher', 'readonly'
    is_active INTEGER DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX idx_users_organization ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
```

### 2.2 Migrated Tables (from KV)

```sql
-- Migration 0003: Students and Classes
-- =====================================

CREATE TABLE classes (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    name TEXT NOT NULL,
    year_group TEXT,
    teacher_id TEXT,                      -- Optional: assign to specific teacher
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (teacher_id) REFERENCES users(id)
);

CREATE INDEX idx_classes_organization ON classes(organization_id);

CREATE TABLE students (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    class_id TEXT,
    name TEXT NOT NULL,
    reading_level TEXT,
    age_range TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

CREATE INDEX idx_students_organization ON students(organization_id);
CREATE INDEX idx_students_class ON students(class_id);
```

### 2.3 Normalized Reading Sessions

```sql
-- Migration 0004: Reading Sessions (normalized from embedded arrays)
-- ===================================================================

CREATE TABLE reading_sessions (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    book_id TEXT,                         -- References global books table
    session_date TEXT NOT NULL,           -- ISO date
    duration_minutes INTEGER,
    pages_read INTEGER,
    notes TEXT,
    rating INTEGER,                       -- 1-5 stars
    recorded_by TEXT,                     -- User who recorded this
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE SET NULL,
    FOREIGN KEY (recorded_by) REFERENCES users(id)
);

CREATE INDEX idx_sessions_student ON reading_sessions(student_id);
CREATE INDEX idx_sessions_date ON reading_sessions(session_date);
CREATE INDEX idx_sessions_book ON reading_sessions(book_id);

-- Student preferences (likes/dislikes - normalized from embedded arrays)
CREATE TABLE student_preferences (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    genre_id TEXT NOT NULL,
    preference_type TEXT NOT NULL,        -- 'like' or 'dislike'
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE,
    UNIQUE(student_id, genre_id)
);

CREATE INDEX idx_preferences_student ON student_preferences(student_id);
```

### 2.4 Book Selection (Per-Organization Filtering)

```sql
-- Migration 0005: Organization Book Selections
-- =============================================
-- Schools select which books from the global catalog are available to their students

CREATE TABLE org_book_selections (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    book_id TEXT NOT NULL,
    is_available INTEGER DEFAULT 1,       -- Can toggle without deleting
    added_by TEXT,                        -- User who added this book
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by) REFERENCES users(id),
    UNIQUE(organization_id, book_id)
);

CREATE INDEX idx_book_selections_org ON org_book_selections(organization_id);
CREATE INDEX idx_book_selections_book ON org_book_selections(book_id);
```

### 2.5 Organization Settings

```sql
-- Migration 0006: Organization Settings
-- ======================================

CREATE TABLE org_settings (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value TEXT,                   -- JSON or simple value
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    UNIQUE(organization_id, setting_key)
);

CREATE INDEX idx_settings_org ON org_settings(organization_id);

-- Migrate genres to D1 (currently in KV, should be shared globally)
CREATE TABLE genres (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);
```

---

## 3. Authentication System Design

### 3.1 JWT Token Structure

```javascript
// JWT Payload
{
  "sub": "user-uuid-here",           // User ID
  "email": "teacher@school.edu",
  "name": "Jane Smith",
  "org": "org-uuid-here",            // Organization ID
  "orgSlug": "lincoln-elementary",   // For display/routing
  "role": "teacher",                 // Permission level
  "iat": 1703721600,                 // Issued at
  "exp": 1703808000                  // Expires (24h)
}
```

### 3.2 Password Hashing (Cloudflare Workers Compatible)

Since `bcrypt` isn't available in Workers, use Web Crypto API:

```javascript
// Using PBKDF2 via Web Crypto API (Workers-compatible)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );

  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );

  // Store as: base64(salt):base64(hash)
  return `${btoa(String.fromCharCode(...salt))}:${btoa(String.fromCharCode(...new Uint8Array(hash)))}`;
}
```

### 3.3 Role-Based Access Control

| Role | Permissions |
|------|-------------|
| `owner` | Full access, can delete organization, manage billing |
| `admin` | Manage users, classes, students, all settings |
| `teacher` | Manage own classes, all students, record sessions |
| `readonly` | View-only access to students and reports |

---

## 4. API Changes

### 4.1 New Endpoints

```
Authentication:
  POST   /api/auth/register          # Create org + first user (owner)
  POST   /api/auth/login             # Email/password login
  POST   /api/auth/refresh           # Refresh JWT token
  POST   /api/auth/logout            # Invalidate token (optional)
  POST   /api/auth/forgot-password   # Password reset email
  POST   /api/auth/reset-password    # Complete password reset

Users (admin only):
  GET    /api/users                  # List org users
  POST   /api/users                  # Invite/create user
  PUT    /api/users/:id              # Update user
  DELETE /api/users/:id              # Deactivate user

Organization:
  GET    /api/organization           # Get current org details
  PUT    /api/organization           # Update org details
  GET    /api/organization/stats     # Usage stats (student count, etc.)

Book Selection:
  GET    /api/books/catalog          # Global catalog (paginated, searchable)
  GET    /api/books/selected         # Org's selected books
  POST   /api/books/selected         # Add book to org selection
  DELETE /api/books/selected/:bookId # Remove book from org selection
```

### 4.2 Modified Endpoints (Add Tenant Filtering)

All existing endpoints remain but are filtered by `organization_id`:

```
Students (filtered by org):
  GET    /api/students               # Only org's students
  POST   /api/students               # Auto-assigns organization_id
  PUT    /api/students/:id           # Only if belongs to org
  DELETE /api/students/:id           # Only if belongs to org

Classes (filtered by org):
  GET    /api/classes                # Only org's classes
  ...

Sessions (new normalized endpoint):
  GET    /api/students/:id/sessions  # Student's reading sessions
  POST   /api/students/:id/sessions  # Record new session
  PUT    /api/sessions/:id           # Update session
  DELETE /api/sessions/:id           # Delete session
```

### 4.3 Tenant Isolation Middleware

```javascript
// src/middleware/tenant.js
export function tenantMiddleware() {
  return async (c, next) => {
    const user = c.get('user'); // Set by JWT auth middleware

    if (!user?.org) {
      return c.json({ error: 'Organization context required' }, 403);
    }

    // Make org available to all route handlers
    c.set('organizationId', user.org);
    c.set('userId', user.sub);
    c.set('userRole', user.role);

    return next();
  };
}

// Usage in routes
studentsRouter.get('/', async (c) => {
  const orgId = c.get('organizationId');
  const students = await db.prepare(
    'SELECT * FROM students WHERE organization_id = ?'
  ).bind(orgId).all();
  return c.json(students.results);
});
```

---

## 5. Data Migration Strategy



### 5.1 Migration Approach: **Incremental with Dual-Write**

Rather than a big-bang migration, use an incremental approach:

1. **Phase A**: Create new D1 tables alongside existing KV
2. **Phase B**: Dual-write to both KV and D1 (writes go to both)
3. **Phase C**: Switch reads to D1, keep KV as backup
4. **Phase D**: Remove KV writes, deprecate KV
5. **Phase E**: Delete KV data after confirmation period

### 5.2 Current Data → New Structure Mapping

```javascript
// Current KV structure (app_data key)
{
  students: [
    {
      id: "...",
      name: "...",
      classId: "...",
      lastReadDate: "...",
      readingSessions: [           // Embedded - needs normalization
        { date: "...", bookId: "...", ... }
      ],
      likes: ["genre-1"],          // Embedded - needs normalization
      dislikes: ["genre-2"]
    }
  ],
  classes: [...],
  settings: {...},
  genres: [...]
}

// Migration script pseudocode
async function migrateToMultiTenant(env, sourceOrgId) {
  const kvData = await env.READING_MANAGER_KV.get('app_data', { type: 'json' });

  // 1. Create organization for existing data
  const org = { id: sourceOrgId, name: 'My School', slug: 'my-school' };
  await insertOrganization(env, org);

  // 2. Migrate classes with org_id
  for (const cls of kvData.classes) {
    await insertClass(env, { ...cls, organization_id: sourceOrgId });
  }

  // 3. Migrate students with org_id, extract sessions
  for (const student of kvData.students) {
    const { readingSessions, likes, dislikes, ...studentData } = student;

    // Insert student
    await insertStudent(env, { ...studentData, organization_id: sourceOrgId });

    // Normalize sessions to separate table
    for (const session of readingSessions || []) {
      await insertSession(env, {
        id: generateUUID(),
        student_id: student.id,
        ...session
      });
    }

    // Normalize preferences
    for (const genreId of likes || []) {
      await insertPreference(env, student.id, genreId, 'like');
    }
    for (const genreId of dislikes || []) {
      await insertPreference(env, student.id, genreId, 'dislike');
    }
  }

  // 4. Migrate genres to D1 (global)
  for (const genre of kvData.genres) {
    await insertGenre(env, genre);
  }

  // 5. Select all current books for this org
  const books = await getAllBooks(env);
  for (const book of books) {
    await insertBookSelection(env, sourceOrgId, book.id);
  }
}
```

---

## 6. Frontend Changes

### 6.1 Authentication Flow Updates

| Current | New |
|---------|-----|
| Single password field | Email + Password fields |
| Store token in localStorage | Same, but with user info |
| No user context | Display logged-in user, org name |
| No logout | Proper logout with token clear |

### 6.2 New UI Components Needed

1. **Login Page** - Email/password form, "Forgot password" link
2. **Registration Page** - Create school/organization + admin account
3. **User Management** (admin only) - Invite teachers, manage roles
4. **Book Selection UI** - Browse global catalog, add to school library
5. **Organization Settings** - School name, preferences
6. **User Profile** - Change password, update name

### 6.3 Context Updates

```javascript
// Updated AppContext structure
const [user, setUser] = useState({
  id: null,
  email: null,
  name: null,
  role: null,
  organizationId: null,
  organizationName: null
});

// Role-based UI rendering
const canManageUsers = user.role === 'owner' || user.role === 'admin';
const canEditStudents = user.role !== 'readonly';
```

---

## 7. Implementation Phases

### Phase 0: Preparation (1-2 weeks)
- [ ] Set up staging environment with separate D1/KV
- [ ] Add comprehensive test coverage for existing functionality
- [ ] Document all current API endpoints and contracts
- [ ] Set up automated D1 backups
- [ ] Add error monitoring (Sentry or similar)

### Phase 1: Database Foundation (2-3 weeks)
- [ ] Create migration framework for D1
- [ ] Add organizations table + seed with current data
- [ ] Add users table
- [ ] Migrate students table (with organization_id)
- [ ] Migrate classes table (with organization_id)
- [ ] Normalize reading_sessions to separate table
- [ ] Add org_book_selections table
- [ ] Migrate settings to D1
- [ ] Migrate genres to D1 (global)

### Phase 2: Authentication System (2 weeks)
- [ ] Implement JWT creation/validation using Web Crypto
- [ ] Implement PBKDF2 password hashing
- [ ] Create `/api/auth/login` endpoint
- [ ] Create `/api/auth/register` endpoint (org + user)
- [ ] Add tenant isolation middleware
- [ ] Update existing auth middleware to use JWT
- [ ] Add password reset flow (optional for MVP)

### Phase 3: API Updates (2-3 weeks)
- [ ] Create D1 providers for students, classes, sessions
- [ ] Update students routes with tenant filtering
- [ ] Update classes routes with tenant filtering
- [ ] Create sessions routes (new, normalized)
- [ ] Create users management routes
- [ ] Create book selection routes
- [ ] Update settings routes with tenant filtering
- [ ] Add organization routes

### Phase 4: Frontend Updates (2-3 weeks)
- [ ] Update login page with email/password
- [ ] Add registration page
- [ ] Update AppContext with user/org state
- [ ] Add role-based UI conditionals
- [ ] Create user management page
- [ ] Create book selection UI
- [ ] Update all API calls to use new endpoints
- [ ] Add organization settings page

### Phase 5: Testing & Launch (2-3 weeks)
- [ ] End-to-end testing of all flows
- [ ] Security review (auth, tenant isolation)
- [ ] Performance testing with multiple orgs
- [ ] Data migration dry-run with production data
- [ ] Beta launch with pilot school
- [ ] Gather feedback, iterate
- [ ] Production migration and launch

---

## 8. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Data loss during migration | Dual-write period, automated backups, rollback scripts |
| Tenant data leakage | Comprehensive tenant isolation tests, middleware on all routes |
| Breaking existing users | Maintain backward-compatible APIs during transition |
| Performance degradation | Add database indexes, implement query pagination |
| Auth token compromise | Short expiry, secure HTTP-only cookie option, rate limiting |

---

## 9. Future Considerations (Post-MVP)

- **Stripe Integration** - Subscription billing based on student count
- **Custom Subdomains** - `lincolnelem.readingmanager.app`
- **SSO Support** - Google Workspace / Microsoft 365 for schools
- **Parent Portal** - View-only access for parents
- **Analytics Dashboard** - School-wide reading trends
- **API Keys** - For integrations with school management systems
- **Audit Logging** - Track who changed what, when

---

## 10. Estimated Timeline

| Phase | Duration | Running Total |
|-------|----------|---------------|
| Phase 0: Preparation | 2 weeks | 2 weeks |
| Phase 1: Database | 3 weeks | 5 weeks |
| Phase 2: Authentication | 2 weeks | 7 weeks |
| Phase 3: API Updates | 3 weeks | 10 weeks |
| Phase 4: Frontend | 3 weeks | 13 weeks |
| Phase 5: Testing & Launch | 3 weeks | 16 weeks |

**Total: ~4 months** for full multi-tenant implementation

This can be parallelized (e.g., frontend work can start during API work) and shortened if you have help, but this conservative estimate accounts for testing and iteration.

---

## 11. Architecture Diagrams

### 11.1 Multi-Tenant Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GLOBAL RESOURCES                              │
│  ┌─────────────────────┐    ┌─────────────────────┐                 │
│  │   Books Catalog     │    │      Genres         │                 │
│  │   (D1 - Shared)     │    │   (D1 - Shared)     │                 │
│  └─────────────────────┘    └─────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ filter
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AUTHENTICATION LAYER                            │
│  ┌──────────┐    ┌──────────────────┐    ┌────────────────────┐     │
│  │   JWT    │───▶│  Auth Middleware │───▶│ Tenant Middleware  │     │
│  │  Token   │    │                  │    │                    │     │
│  └──────────┘    └──────────────────┘    └────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌─────────────────────────────────┐ ┌─────────────────────────────────┐
│        SCHOOL A (Tenant)        │ │        SCHOOL B (Tenant)        │
│  ┌───────────────────────────┐  │ │  ┌───────────────────────────┐  │
│  │      Organization         │  │ │  │      Organization         │  │
│  └───────────────────────────┘  │ │  └───────────────────────────┘  │
│  ┌─────────┐ ┌─────────┐        │ │  ┌─────────┐                    │
│  │Teacher 1│ │Teacher 2│        │ │  │Teacher 1│                    │
│  └─────────┘ └─────────┘        │ │  └─────────┘                    │
│  ┌─────────────────────────────┐│ │  ┌─────────────────────────────┐│
│  │ Students │ Classes │Sessions││ │  │ Students │ Classes │Sessions││
│  └─────────────────────────────┘│ │  └─────────────────────────────┘│
│  ┌─────────────────────────────┐│ │  ┌─────────────────────────────┐│
│  │  Book Selections │ Settings ││ │  │  Book Selections │ Settings ││
│  └─────────────────────────────┘│ │  └─────────────────────────────┘│
└─────────────────────────────────┘ └─────────────────────────────────┘
```

### 11.2 Entity Relationship Summary

```
organizations ──┬── users (1:many)
                ├── classes (1:many) ── students (1:many) ── reading_sessions (1:many)
                │                                         └── student_preferences (1:many)
                ├── org_settings (1:many)
                └── org_book_selections (1:many) ── books (many:1, global)
                                                 └── genres (many:many, global)
```

---

## 12. Quick Reference: File Changes Required

### Backend Files to Modify
- `src/middleware/auth.js` - Replace with JWT auth
- `src/middleware/tenant.js` - New file for tenant isolation
- `src/worker.js` - Add new middleware and routes
- `src/services/kvService.js` - Deprecate, replace with D1
- `src/data/d1Provider.js` - Add new entity providers
- `src/routes/students.js` - Add tenant filtering
- `src/routes/classes.js` - Add tenant filtering
- `src/routes/settings.js` - Add tenant filtering
- `src/routes/auth.js` - New file for auth endpoints
- `src/routes/users.js` - New file for user management
- `src/routes/organization.js` - New file for org management

### Frontend Files to Modify
- `src/contexts/AppContext.js` - Add user/org state
- `src/components/Login.js` - Email/password form
- `src/components/Header.js` - Show user/org info
- `src/components/Settings.js` - Add user management
- `src/components/books/` - Add book selection UI

### New Migration Files
- `migrations/0002_organizations_users.sql`
- `migrations/0003_classes_students.sql`
- `migrations/0004_reading_sessions.sql`
- `migrations/0005_org_book_selections.sql`
- `migrations/0006_org_settings.sql`
- `migrations/0007_genres.sql`

---

*Document created: December 2024*
*Last updated: December 2024*

