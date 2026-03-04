# User Management Enhancement Design

**Date:** 2026-03-04
**Goal:** Enhance the User Management page to provide visibility into Wonde/MyLogin SSO users, their auth provider, login activity, and class assignments.

## Context

The current UserManagement component was built for basic local user CRUD. Since then, Wonde sync and MyLogin SSO were added, creating users with `auth_provider`, `mylogin_id`, and `wonde_employee_id` fields. The UI doesn't expose any of this data, making it hard to manage or troubleshoot SSO users.

## Design Decisions

- **Approach:** Enhanced full-width table (Approach A) rather than master-detail layout
- **Audience:** Owner + school admins
- **Scope:** Primarily visibility, with existing edit/delete actions retained
- **Class assignments:** Essential — shown via detail dialog, read-only (managed by Wonde sync)
- **Layout:** "Add User" form moves from side panel to dialog to free up table width

## Backend Changes

### 1. Update GET /api/users query

Add missing columns to the SELECT in `src/routes/users.js`:
- `u.auth_provider`
- `u.mylogin_id`
- `u.wonde_employee_id`
- `u.last_login_at`

The `rowToUser` mapper in `src/utils/rowMappers.js` already handles these fields — just need the SQL to fetch them.

### 2. New endpoint: GET /api/users/:id/classes

Returns class assignments for a user. For Wonde SSO users, queries `wonde_employee_classes` joined with `classes` table to resolve class names. Returns:

```json
{
  "classes": [
    { "classId": "...", "className": "Year 3 Elm", "source": "wonde" }
  ]
}
```

Requires admin role. Scoped to organization (owners can query any org's users).

## Frontend Changes

### UserManagement.js Refactor

**Layout:**
- Remove side-by-side Grid layout (form left, table right)
- Full-width table takes the whole page
- "Add User" button top-right of page, opens existing form in a dialog

**Table columns:**

| Column | Content |
|--------|---------|
| Name | Display name |
| Email | Email address |
| School | Organization name (owners see all) |
| Role | Chip: admin / teacher / readonly |
| Auth | Chip: "SSO" or "Local" based on `authProvider` field |
| Last Login | Relative time (e.g. "2 hours ago", "Never") |
| Actions | Edit, View Details, Delete |

**Search/filter bar:**
- Text input that filters by name or email (client-side filter)
- Auth provider filter: All / SSO / Local (client-side filter)

**Detail dialog (new):**
- Opens when clicking "View Details" action on a user row
- Shows: name, email, role, auth provider, last login, Wonde Employee ID
- Shows class assignments (fetched from GET /api/users/:id/classes)
- Read-only — class assignments managed by Wonde sync

**Existing dialogs preserved:**
- Edit User dialog (unchanged)
- Delete User confirmation dialog (unchanged)
- Add User dialog (moved from side panel to dialog, same form)

## What's NOT Changing

- No changes to MyLogin SSO flow
- No changes to Wonde sync logic
- No new database migrations
- No manual class assignment editing
- The create user flow still requires password (for local users only — SSO users are created automatically via MyLogin login)
