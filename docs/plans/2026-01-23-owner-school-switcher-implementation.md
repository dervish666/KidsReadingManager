# Owner School Switcher Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow owner users to switch between organizations and manage any school's data from a dropdown in the header.

**Architecture:** Add `X-Organization-Id` header support to backend middleware, store active organization in AppContext, and add owner-only dropdown in Header component.

**Tech Stack:** React 19, Hono (Cloudflare Workers), MUI components

---

### Task 1: Backend - Add Organization Override Support to Tenant Middleware

**Files:**
- Modify: `src/middleware/tenant.js:83-113`

**Step 1: Update tenantMiddleware to check for X-Organization-Id header**

Replace the `tenantMiddleware` function with this updated version:

```javascript
/**
 * Tenant Isolation Middleware
 * Ensures organization context is available and valid
 * Must be used after jwtAuthMiddleware
 *
 * For owners: Checks X-Organization-Id header to allow switching organizations
 *
 * @returns {Function} Hono middleware
 */
export function tenantMiddleware() {
  return async (c, next) => {
    const user = c.get('user');
    const userRole = c.get('userRole');

    if (!user?.org) {
      return c.json({ error: 'Organization context required' }, 403);
    }

    // Check for organization override (owners only)
    const overrideOrgId = c.req.header('X-Organization-Id');
    let targetOrgId = user.org;

    if (overrideOrgId && userRole === 'owner') {
      targetOrgId = overrideOrgId;
    }

    // Verify organization exists and is active
    const db = c.env.READING_MANAGER_DB;
    if (db) {
      try {
        const org = await db.prepare(
          'SELECT id, is_active FROM organizations WHERE id = ?'
        ).bind(targetOrgId).first();

        if (!org) {
          return c.json({ error: 'Organization not found' }, 404);
        }

        if (!org.is_active) {
          return c.json({ error: 'Organization is inactive' }, 403);
        }

        // Update the organizationId in context if owner is switching
        if (overrideOrgId && userRole === 'owner' && org) {
          c.set('organizationId', targetOrgId);
        }
      } catch (error) {
        console.error('Error verifying organization:', error);
        // Continue if table doesn't exist yet (migration not applied)
      }
    }

    return next();
  };
}
```

**Step 2: Test manually**

```bash
# Start the dev server
npm run dev

# Test that the header is ignored for non-owners (should return data from user's org)
curl -H "Authorization: Bearer <teacher_token>" -H "X-Organization-Id: other-org-id" http://localhost:8787/api/students

# Test that owner can switch (should return data from specified org)
curl -H "Authorization: Bearer <owner_token>" -H "X-Organization-Id: other-org-id" http://localhost:8787/api/students
```

**Step 3: Commit**

```bash
git add src/middleware/tenant.js
git commit -m "feat(auth): allow owners to override organization via X-Organization-Id header"
```

---

### Task 2: Frontend - Add Organization State to AppContext

**Files:**
- Modify: `src/contexts/AppContext.js`

**Step 1: Add state for available organizations and active organization**

After line 124 (after `genres` state), add:

```javascript
// Available organizations (for owners to switch between)
const [availableOrganizations, setAvailableOrganizations] = useState([]);
// Active organization ID (for owners switching between orgs)
const [activeOrganizationId, setActiveOrganizationId] = useState(null);
// Loading state for organization switching
const [switchingOrganization, setSwitchingOrganization] = useState(false);
```

**Step 2: Add function to fetch available organizations**

After the `resetPassword` function (around line 563), add:

```javascript
// Fetch available organizations (for owners)
const fetchAvailableOrganizations = useCallback(async () => {
  if (userRole !== 'owner') {
    setAvailableOrganizations([]);
    return;
  }

  try {
    const response = await fetchWithAuth(`${API_URL}/organization/all`);
    if (response.ok) {
      const data = await response.json();
      setAvailableOrganizations(data.organizations || []);
    }
  } catch (error) {
    console.error('Error fetching organizations:', error);
  }
}, [userRole, fetchWithAuth]);
```

**Step 3: Add switch organization function**

After `fetchAvailableOrganizations`, add:

```javascript
// Switch to a different organization (owners only)
const switchOrganization = useCallback(async (orgId) => {
  if (userRole !== 'owner') {
    console.warn('Only owners can switch organizations');
    return;
  }

  setSwitchingOrganization(true);
  setActiveOrganizationId(orgId);

  // Reset class filter when switching organizations
  setGlobalClassFilter('all');
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem('globalClassFilter', 'all');
    } catch {
      // ignore
    }
  }

  // Clear existing data
  setStudents([]);
  setClasses([]);
  setBooks([]);
  setGenres([]);
  setSettings({});

  // Reload data from server (fetchWithAuth will include the new org header)
  await reloadDataFromServer();
  setSwitchingOrganization(false);
}, [userRole, reloadDataFromServer]);
```

**Step 4: Update fetchWithAuth to include X-Organization-Id header**

In the `fetchWithAuth` function (around line 265), update the headers section:

Replace:
```javascript
const headers = {
  'Content-Type': 'application/json',
  ...(options.headers || {}),
};

if (currentToken) {
  headers['Authorization'] = `Bearer ${currentToken}`;
}
```

With:
```javascript
const headers = {
  'Content-Type': 'application/json',
  ...(options.headers || {}),
};

if (currentToken) {
  headers['Authorization'] = `Bearer ${currentToken}`;
}

// Include organization override header for owners switching orgs
if (activeOrganizationId && userRole === 'owner') {
  headers['X-Organization-Id'] = activeOrganizationId;
}
```

Also add `activeOrganizationId` and `userRole` to the dependency array of `fetchWithAuth`.

**Step 5: Fetch organizations after login for owners**

In the `useEffect` that handles initial load (around line 691), update to also fetch organizations:

Replace:
```javascript
useEffect(() => {
  if (authToken) {
    console.log('[Auth] Existing token found, loading data');
    reloadDataFromServer();
  } else {
    console.log('[Auth] No token, skipping initial data load');
    setLoading(false);
  }
}, [authToken, reloadDataFromServer]);
```

With:
```javascript
useEffect(() => {
  if (authToken) {
    console.log('[Auth] Existing token found, loading data');
    reloadDataFromServer();
  } else {
    console.log('[Auth] No token, skipping initial data load');
    setLoading(false);
  }
}, [authToken, reloadDataFromServer]);

// Fetch available organizations for owners after user is loaded
useEffect(() => {
  if (user && userRole === 'owner') {
    fetchAvailableOrganizations();
  }
}, [user, userRole, fetchAvailableOrganizations]);
```

**Step 6: Update the organization computed value to use activeOrganizationId**

Replace the organization computed value (around line 706):

```javascript
// Organization info - use active org if owner has switched, otherwise from user state
const organization = useMemo(() => {
  if (activeOrganizationId && userRole === 'owner') {
    const activeOrg = availableOrganizations.find(org => org.id === activeOrganizationId);
    if (activeOrg) {
      return {
        id: activeOrg.id,
        name: activeOrg.name,
        slug: activeOrg.slug,
      };
    }
  }

  return user ? {
    id: user.organizationId,
    name: user.organizationName,
    slug: user.organizationSlug,
  } : null;
}, [user, activeOrganizationId, availableOrganizations, userRole]);
```

**Step 7: Export new values in the provider**

Add to the `value` object (around line 1701):

```javascript
// Organization switching (owners)
availableOrganizations,
activeOrganizationId,
switchOrganization,
switchingOrganization,
fetchAvailableOrganizations,
```

**Step 8: Commit**

```bash
git add src/contexts/AppContext.js
git commit -m "feat(context): add organization switching state and functions for owners"
```

---

### Task 3: Frontend - Add School Selector to Header

**Files:**
- Modify: `src/components/Header.js`

**Step 1: Update imports**

Add `SchoolOutlined` icon to imports:

```javascript
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
```

**Step 2: Get organization switching values from context**

Update the destructuring from `useAppContext()`:

```javascript
const {
  classes,
  globalClassFilter,
  setGlobalClassFilter,
  isAuthenticated,
  logout,
  user,
  // Add these new values
  availableOrganizations,
  activeOrganizationId,
  switchOrganization,
  switchingOrganization,
  organization,
} = useAppContext();
```

**Step 3: Add state for dropdown**

After the `useAppContext()` call, add:

```javascript
// State for school selector dropdown
const [schoolAnchorEl, setSchoolAnchorEl] = useState(null);
const schoolMenuOpen = Boolean(schoolAnchorEl);

const handleSchoolMenuClick = (event) => {
  setSchoolAnchorEl(event.currentTarget);
};

const handleSchoolMenuClose = () => {
  setSchoolAnchorEl(null);
};

const handleSchoolSelect = (orgId) => {
  switchOrganization(orgId);
  handleSchoolMenuClose();
};
```

Also add the `useState` import at the top:

```javascript
import React, { useState } from 'react';
```

And add `Menu` and `CircularProgress` to MUI imports:

```javascript
import { AppBar, Toolbar, Typography, IconButton, Box, FormControl, Select, MenuItem, Button, Chip, Menu, CircularProgress } from '@mui/material';
```

**Step 4: Add school selector UI**

After the user info Box (around line 214, after the closing `</Box>}` of the user info section), add the school selector:

```javascript
{/* School Selector - Only for owners with multiple organizations */}
{user?.role === 'owner' && availableOrganizations.length > 1 && (
  <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
    <Chip
      icon={switchingOrganization ? (
        <CircularProgress size={14} sx={{ color: 'white' }} />
      ) : (
        <SchoolOutlined sx={{ fontSize: 16 }} />
      )}
      label={organization?.name || 'Select School'}
      onClick={handleSchoolMenuClick}
      sx={{
        backgroundColor: '#6B8E6B',
        color: 'white',
        fontWeight: 600,
        fontSize: '0.75rem',
        cursor: 'pointer',
        '&:hover': {
          backgroundColor: '#5A7D5A',
        },
        '& .MuiChip-icon': {
          color: 'white',
        },
      }}
    />
    <Menu
      anchorEl={schoolAnchorEl}
      open={schoolMenuOpen}
      onClose={handleSchoolMenuClose}
      anchorOrigin={{
        vertical: 'bottom',
        horizontal: 'right',
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
      PaperProps={{
        sx: {
          mt: 1,
          minWidth: 200,
          borderRadius: '10px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        },
      }}
    >
      {availableOrganizations.map((org) => (
        <MenuItem
          key={org.id}
          onClick={() => handleSchoolSelect(org.id)}
          selected={activeOrganizationId ? org.id === activeOrganizationId : org.id === organization?.id}
          sx={{
            fontFamily: '"DM Sans", sans-serif',
            fontWeight: 500,
            '&.Mui-selected': {
              backgroundColor: 'rgba(107, 142, 107, 0.15)',
            },
            '&.Mui-selected:hover': {
              backgroundColor: 'rgba(107, 142, 107, 0.25)',
            },
          }}
        >
          {org.name}
        </MenuItem>
      ))}
    </Menu>
  </Box>
)}
```

**Step 5: Test the UI**

```bash
npm run start:dev
```

1. Log in as an owner with multiple organizations
2. Verify the school chip appears in the header
3. Click the chip to open the dropdown
4. Select a different school
5. Verify data reloads and class filter resets to "All Classes"

**Step 6: Commit**

```bash
git add src/components/Header.js
git commit -m "feat(ui): add school selector dropdown in header for owners"
```

---

### Task 4: Final Testing and Cleanup

**Step 1: Full integration test**

1. Start the dev environment: `npm run start:dev`
2. Log in as owner account
3. Verify school selector appears (only if >1 organization exists)
4. Switch schools and verify:
   - Data refreshes correctly (students, classes change)
   - Class filter resets to "All Classes"
   - Loading indicator shows during switch
   - Current school name updates in chip
5. Test that non-owners don't see the selector
6. Test that API requests include X-Organization-Id header (check Network tab)

**Step 2: Commit final changes if any cleanup needed**

```bash
git status
# If any uncommitted changes:
git add -A
git commit -m "chore: final cleanup for school switcher feature"
```

---

## Summary

This implementation adds organization switching for owner users with:

1. **Backend**: Middleware checks `X-Organization-Id` header for owners
2. **Context**: State management for available orgs and active org, with automatic header injection
3. **UI**: Chip-style selector in header that shows current school and dropdown to switch

Total files modified: 3
- `src/middleware/tenant.js`
- `src/contexts/AppContext.js`
- `src/components/Header.js`
