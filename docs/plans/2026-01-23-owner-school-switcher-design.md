# Owner School Switcher Design

## Overview

Add a school selector to the header allowing owners to switch between organizations and manage any school's data without logging out.

## Requirements

- Dropdown visible only to users with `owner` role
- Located in header: right side, after user info chip, before logout button
- Shows current school as a prominent chip/badge
- Soft context switch: re-fetches all data without page reload
- Resets class filter to "All Classes" when switching schools

## UI Design

### Header Changes

School selector appears after user info, before logout:

```
[Logo] Kids Reading Manager    [Class Filter ▼]    v1.x    [User | Role]  [School Name ▼]  [Logout]
```

Components:
- School icon + dropdown showing all available schools
- Current school displayed as colored chip (green theme)
- Dropdown lists all active organizations
- Current selection highlighted in dropdown

### Visual States

- **Default:** School name chip visible, dropdown collapsed
- **Open:** Full list of schools, current one highlighted
- **Switching:** Brief loading indicator while data refreshes

## Data Architecture

### AppContext Additions

New state:
- `availableOrganizations` - Array of orgs (owners only)
- `activeOrganizationId` - Currently managed organization

New function:
```javascript
switchOrganization(orgId)
  1. Update activeOrganizationId
  2. Reset globalClassFilter to 'all'
  3. Clear cached data
  4. Re-fetch: students, classes, sessions, settings, etc.
```

### API Request Changes

- Add `X-Organization-Id` header to all API requests when owner has switched orgs
- Header only sent when activeOrganizationId differs from user's default org

## Backend Changes

### Middleware Update (tenant.js)

In tenant middleware, after authentication:

```javascript
// Check for organization override (owners only)
const overrideOrgId = c.req.header('X-Organization-Id');
if (overrideOrgId && userRole === 'owner') {
  // Validate org exists and is active
  const targetOrg = await db.prepare(
    'SELECT id FROM organizations WHERE id = ? AND is_active = 1'
  ).bind(overrideOrgId).first();

  if (targetOrg) {
    c.set('organizationId', overrideOrgId);
  }
}
```

Security: Non-owners sending this header have it silently ignored.

### Existing Endpoint Used

`GET /api/organization/all` already returns all orgs for owners - no new endpoints needed.

## Files to Modify

1. **src/contexts/AppContext.js**
   - Add `availableOrganizations` state
   - Add `activeOrganizationId` state
   - Add `switchOrganization()` function
   - Fetch orgs on login for owners
   - Include `X-Organization-Id` header in API calls

2. **src/components/Header.js**
   - Add school selector dropdown (owner-only)
   - Display current school as chip
   - Wire up to `switchOrganization()`

3. **src/middleware/tenant.js**
   - Check for `X-Organization-Id` header
   - Override organizationId for owners with valid target org

## Not Included

- Per-school class filter memory (resets to "All Classes")
- Color theming per school
- New database tables or migrations
- New API endpoints
