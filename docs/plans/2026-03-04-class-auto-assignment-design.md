# Class Auto-Assignment Design

**Date:** 2026-03-04
**Goal:** Auto-assign teachers to their Wonde-synced classes and auto-filter the UI to their class on login.

## Problem

The `class_assignments` table was never created (no migration exists). The MyLogin callback code that tries to populate it silently fails. Teachers logging in via SSO see "All Classes" and have to manually find their class. The Wonde employee-class data exists in `wonde_employee_classes` but is never linked to actual users.

## Design

### 1. Migration: Create `class_assignments` table

```sql
CREATE TABLE IF NOT EXISTS class_assignments (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(class_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_class_assignments_user ON class_assignments(user_id);
```

### 2. Fix MyLogin login — populate class_assignments for all logins

Currently `src/routes/mylogin.js` only assigns classes for **new** users (inside the `else` block for user creation). Move the class assignment logic to run for **all** SSO logins (new and existing), so assignments stay current. Replace old assignments with fresh ones from `wonde_employee_classes` on each login.

### 3. Sync-time class assignment refresh

After `wonde_employee_classes` is rebuilt in `src/services/wondeSync.js`, add a step: for each user in the org that has a `wonde_employee_id`, delete their existing `class_assignments` and re-create from the fresh `wonde_employee_classes` data. This ensures overnight sync and manual sync both update assignments.

### 4. Include assigned class IDs in JWT payload

In `src/routes/mylogin.js` and `src/routes/auth.js`, after looking up class assignments, include `assignedClassIds: [...]` in the JWT payload (via `createJWTPayload`). The frontend already stores the JWT payload as the `user` object.

Also add a `GET /api/users/me/classes` endpoint (or reuse the existing `GET /api/auth/me`) to fetch current class assignments — needed when assignments change via sync but the token hasn't been refreshed yet.

### 5. Frontend: auto-set globalClassFilter on login

In `src/contexts/AppContext.js`, when the user authenticates and `user.assignedClassIds` is available:
- If the user has assigned classes, look up the first one (by class name, alphabetically) and set `globalClassFilter` to that class ID
- If no assignments, default to 'all' as before
- Only auto-set on fresh login (not on page refresh with existing session)

## What's NOT Changing

- The `wonde_employee_classes` table and Wonde sync logic remain unchanged
- The class filter dropdown still shows all classes — teacher can always switch
- Admin/owner users are unaffected (no Wonde employee ID = no auto-filter)
- Local (non-SSO) users are unaffected
