# User Management Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the User Management page to show Wonde/MyLogin SSO user data, auth provider, last login, class assignments, and add search/filter.

**Architecture:** Backend adds missing columns to the GET /api/users SQL query and a new GET /api/users/:id/classes endpoint. Frontend refactors UserManagement.js from side-by-side layout to full-width table with new columns, moves Add User form to a dialog, and adds a class assignment detail dialog.

**Tech Stack:** Hono (backend routes), React 19, Material-UI v7, Vitest

---

### Task 1: Backend — Add Wonde fields to GET /api/users query

**Files:**
- Modify: `src/routes/users.js:32-39` (owner query) and `src/routes/users.js:42-49` (admin query)

**Step 1: Update the owner query to include Wonde fields**

In `src/routes/users.js`, the owner query (line 32-39) currently selects:
```sql
SELECT u.id, u.organization_id, o.name as organization_name, u.email, u.name, u.role,
       u.is_active, u.last_login_at, u.created_at, u.updated_at
```

Change both the owner query (lines 32-39) and admin query (lines 42-49) to:
```sql
SELECT u.id, u.organization_id, o.name as organization_name, u.email, u.name, u.role,
       u.is_active, u.last_login_at, u.created_at, u.updated_at,
       u.auth_provider, u.mylogin_id, u.wonde_employee_id
```

**Step 2: Run existing tests to verify nothing breaks**

Run: `npx vitest run src/__tests__/integration/users.test.js`
Expected: All existing tests PASS (the rowToUser mapper already handles these fields with `|| null` fallback, so existing test assertions at lines 256-258 still hold).

**Step 3: Add test for SSO user fields in response**

Add a new test in `src/__tests__/integration/users.test.js` inside the `describe('Response format')` block:

```javascript
it('should include auth provider fields for SSO users', async () => {
  const { app } = createTestApp({
    userId: 'user-123',
    organizationId: 'org-456',
    userRole: ROLES.ADMIN
  }, {
    allResults: {
      results: [
        {
          id: 'user-sso',
          organization_id: 'org-456',
          organization_name: 'Test School',
          email: 'teacher@school.com',
          name: 'SSO Teacher',
          role: 'teacher',
          is_active: 1,
          last_login_at: '2024-03-01T09:00:00Z',
          created_at: '2024-02-01',
          updated_at: '2024-03-01',
          auth_provider: 'mylogin',
          mylogin_id: 'ml-12345',
          wonde_employee_id: 'A1234567890'
        }
      ],
      success: true
    }
  });

  const response = await makeRequest(app, 'GET', '/api/users');
  const data = await response.json();

  expect(data.users[0].authProvider).toBe('mylogin');
  expect(data.users[0].myloginId).toBe('ml-12345');
  expect(data.users[0].wondeEmployeeId).toBe('A1234567890');
});
```

**Step 4: Run tests to verify**

Run: `npx vitest run src/__tests__/integration/users.test.js`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/routes/users.js src/__tests__/integration/users.test.js
git commit -m "feat(users): include auth provider fields in GET /api/users response"
```

---

### Task 2: Backend — Add GET /api/users/:id/classes endpoint

**Files:**
- Modify: `src/routes/users.js` (add new route at bottom, before export)
- Test: `src/__tests__/integration/users.test.js`

**Step 1: Write failing tests for the new endpoint**

Add to `src/__tests__/integration/users.test.js`, a new top-level `describe('GET /api/users/:id/classes')` block:

```javascript
describe('GET /api/users/:id/classes', () => {
  it('should reject requests from teachers', async () => {
    const { app } = createTestApp({
      userId: 'user-123',
      organizationId: 'org-456',
      userRole: ROLES.TEACHER
    });

    const response = await makeRequest(app, 'GET', '/api/users/user-1/classes');
    expect(response.status).toBe(403);
  });

  it('should return Wonde class assignments for SSO user', async () => {
    const mockDB = createMockDB();
    // First call: check user exists (first)
    // Second call: fetch wonde_employee_classes joined with classes (all)
    let callCount = 0;
    mockDB._chain.first.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          id: 'user-1',
          organization_id: 'org-456',
          wonde_employee_id: 'A1234567890'
        });
      }
      return Promise.resolve(null);
    });
    mockDB._chain.all.mockResolvedValue({
      results: [
        { class_id: 'class-1', class_name: 'Year 3 Elm', source: 'wonde' },
        { class_id: 'class-2', class_name: 'Year 4 Oak', source: 'wonde' }
      ],
      success: true
    });

    const { app } = createTestApp({
      userId: 'admin-1',
      organizationId: 'org-456',
      userRole: ROLES.ADMIN
    }, mockDB);

    const response = await makeRequest(app, 'GET', '/api/users/user-1/classes');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.classes).toHaveLength(2);
    expect(data.classes[0]).toEqual({
      classId: 'class-1',
      className: 'Year 3 Elm',
      source: 'wonde'
    });
  });

  it('should return empty array for local user with no Wonde ID', async () => {
    const mockDB = createMockDB();
    mockDB._chain.first.mockResolvedValue({
      id: 'user-2',
      organization_id: 'org-456',
      wonde_employee_id: null
    });

    const { app } = createTestApp({
      userId: 'admin-1',
      organizationId: 'org-456',
      userRole: ROLES.ADMIN
    }, mockDB);

    const response = await makeRequest(app, 'GET', '/api/users/user-2/classes');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.classes).toEqual([]);
  });

  it('should return 404 for non-existent user', async () => {
    const mockDB = createMockDB();
    mockDB._chain.first.mockResolvedValue(null);

    const { app } = createTestApp({
      userId: 'admin-1',
      organizationId: 'org-456',
      userRole: ROLES.ADMIN
    }, mockDB);

    const response = await makeRequest(app, 'GET', '/api/users/nonexistent/classes');
    expect(response.status).toBe(404);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/integration/users.test.js --testNamePattern="GET /api/users/:id/classes"`
Expected: FAIL (route doesn't exist yet)

**Step 3: Implement the endpoint**

Add to `src/routes/users.js` before the closing exports, after the existing routes:

```javascript
/**
 * GET /api/users/:id/classes
 * Get class assignments for a user (from Wonde employee-class mapping)
 * Requires: admin role
 */
usersRouter.get('/:id/classes', requireAdmin(), async (c) => {
  try {
    const db = getDB(c.env);
    const organizationId = c.get('organizationId');
    const userRole = c.get('userRole');
    const targetUserId = c.req.param('id');

    // Fetch user - owners can see any user, admins only their org
    let user;
    if (userRole === ROLES.OWNER) {
      user = await db.prepare(
        'SELECT id, organization_id, wonde_employee_id FROM users WHERE id = ? AND is_active = 1'
      ).bind(targetUserId).first();
    } else {
      user = await db.prepare(
        'SELECT id, organization_id, wonde_employee_id FROM users WHERE id = ? AND organization_id = ? AND is_active = 1'
      ).bind(targetUserId, organizationId).first();
    }

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // If user has no Wonde employee ID, no class assignments to show
    if (!user.wonde_employee_id) {
      return c.json({ classes: [] });
    }

    // Fetch class assignments from wonde_employee_classes joined with classes
    const result = await db.prepare(`
      SELECT c.id as class_id, c.name as class_name, 'wonde' as source
      FROM wonde_employee_classes wec
      JOIN classes c ON c.wonde_class_id = wec.wonde_class_id AND c.organization_id = wec.organization_id
      WHERE wec.wonde_employee_id = ? AND wec.organization_id = ?
      ORDER BY c.name
    `).bind(user.wonde_employee_id, user.organization_id).all();

    const classes = (result.results || []).map(row => ({
      classId: row.class_id,
      className: row.class_name,
      source: row.source
    }));

    return c.json({ classes });

  } catch (error) {
    console.error('Get user classes error:', error);
    return c.json({ error: 'Failed to get user classes' }, 500);
  }
});
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/integration/users.test.js`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/routes/users.js src/__tests__/integration/users.test.js
git commit -m "feat(users): add GET /api/users/:id/classes endpoint for Wonde class assignments"
```

---

### Task 3: Frontend — Refactor UserManagement layout and add new columns

**Files:**
- Modify: `src/components/UserManagement.js`

This is the main frontend refactor. Changes:
1. Remove Grid side-by-side layout
2. Full-width table with new columns (Auth, Last Login)
3. Add search/filter bar
4. Move "Add New User" form to a dialog
5. Add "View Details" action button

**Step 1: Add new imports and helper functions**

At the top of `UserManagement.js`, update imports to add:
```javascript
import {
  // ...existing imports...
  Tooltip,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  PersonAdd as PersonAddIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Info as InfoIcon,
  Sync as SyncIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
```

Add a `formatRelativeTime` helper function inside the component (matching the project's existing pattern from StudentCard.js):
```javascript
const formatRelativeTime = (dateString) => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
```

**Step 2: Add new state variables**

Add after existing state declarations:
```javascript
const [searchQuery, setSearchQuery] = useState('');
const [authFilter, setAuthFilter] = useState('all');
const [addDialogOpen, setAddDialogOpen] = useState(false);
const [detailDialogOpen, setDetailDialogOpen] = useState(false);
const [detailUser, setDetailUser] = useState(null);
const [userClasses, setUserClasses] = useState([]);
const [classesLoading, setClassesLoading] = useState(false);
```

**Step 3: Add filtered users memo and detail fetch function**

```javascript
const filteredUsers = useMemo(() => {
  return users.filter(u => {
    const matchesSearch = !searchQuery ||
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAuth = authFilter === 'all' ||
      (authFilter === 'sso' && u.authProvider === 'mylogin') ||
      (authFilter === 'local' && (!u.authProvider || u.authProvider === 'local'));
    return matchesSearch && matchesAuth;
  });
}, [users, searchQuery, authFilter]);

const openDetailDialog = async (targetUser) => {
  setDetailUser(targetUser);
  setDetailDialogOpen(true);
  setUserClasses([]);

  if (targetUser.wondeEmployeeId) {
    setClassesLoading(true);
    try {
      const response = await fetchWithAuth(`/api/users/${targetUser.id}/classes`);
      const data = response && typeof response.json === 'function'
        ? await response.json()
        : response;
      setUserClasses(data.classes || []);
    } catch {
      // Non-critical — just show empty
    } finally {
      setClassesLoading(false);
    }
  }
};
```

Add `useMemo` to the React import at line 1.

**Step 4: Refactor the JSX layout**

Replace the entire return JSX. The new structure is:

```jsx
return (
  <Box>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
      <Typography variant="h4">User Management</Typography>
      <Button
        variant="contained"
        startIcon={<PersonAddIcon />}
        onClick={() => setAddDialogOpen(true)}
      >
        Add User
      </Button>
    </Box>
    <Typography variant="body1" color="text.secondary" paragraph>
      Manage users in your organization.
    </Typography>

    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

    {/* Search and filter bar */}
    <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
      <TextField
        size="small"
        placeholder="Search by name or email..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        sx={{ minWidth: 280 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
          ),
        }}
      />
      <ToggleButtonGroup
        size="small"
        value={authFilter}
        exclusive
        onChange={(e, val) => val && setAuthFilter(val)}
      >
        <ToggleButton value="all">All</ToggleButton>
        <ToggleButton value="sso">SSO</ToggleButton>
        <ToggleButton value="local">Local</ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
        {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
      </Typography>
    </Box>

    {/* Users table — full width */}
    <Paper>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>School</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Auth</TableCell>
              <TableCell>Last Login</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                    {users.length === 0 ? 'No users found.' : 'No users match your filters.'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.organizationName || 'N/A'}</TableCell>
                  <TableCell>
                    <Chip label={u.role} color={getRoleColor(u.role)} size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={u.authProvider === 'mylogin' ? <SyncIcon /> : <LockIcon />}
                      label={u.authProvider === 'mylogin' ? 'SSO' : 'Local'}
                      size="small"
                      variant="outlined"
                      color={u.authProvider === 'mylogin' ? 'info' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title={u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never logged in'}>
                      <Typography variant="body2">
                        {formatRelativeTime(u.lastLoginAt)}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Tooltip title="View details">
                      <IconButton size="small" onClick={() => openDetailDialog(u)} sx={{ mr: 0.5 }}>
                        <InfoIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit user">
                      <IconButton size="small" color="primary" onClick={() => openEditDialog(u)} sx={{ mr: 0.5 }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {u.role !== 'owner' && (
                      <Tooltip title="Delete user">
                        <IconButton size="small" color="error" onClick={() => openDeleteDialog(u)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>

    {/* Add User Dialog (form moved from side panel) */}
    <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Add New User</DialogTitle>
      <DialogContent>
        {/* Same form fields as before: name, email, password, confirmPassword, role, organizationId */}
        <TextField fullWidth label="Full Name" name="name" value={formData.name} onChange={handleInputChange} margin="normal" required />
        <TextField fullWidth label="Email Address" name="email" type="email" value={formData.email} onChange={handleInputChange} margin="normal" required />
        <TextField fullWidth label="Password" name="password" type="password" value={formData.password} onChange={handleInputChange} margin="normal" required helperText="At least 8 characters" />
        <TextField fullWidth label="Confirm Password" name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleInputChange} margin="normal" required />
        <FormControl fullWidth margin="normal">
          <InputLabel>Role</InputLabel>
          <Select name="role" value={formData.role} onChange={handleInputChange} label="Role">
            <MenuItem value="teacher">Teacher</MenuItem>
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="readonly">Read Only</MenuItem>
          </Select>
        </FormControl>
        {user?.role === 'owner' && organizations.length > 1 && (
          <FormControl fullWidth margin="normal">
            <InputLabel>School</InputLabel>
            <Select name="organizationId" value={formData.organizationId} onChange={handleInputChange} label="School">
              <MenuItem value=""><em>Select School</em></MenuItem>
              {organizations.map((org) => (
                <MenuItem key={org.id} value={org.id}>{org.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
        <Button onClick={handleRegister} variant="contained" disabled={loading} startIcon={loading ? <CircularProgress size={20} /> : <PersonAddIcon />}>
          {loading ? 'Creating...' : 'Create User'}
        </Button>
      </DialogActions>
    </Dialog>

    {/* User Detail Dialog (new) */}
    <Dialog open={detailDialogOpen} onClose={() => setDetailDialogOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>User Details</DialogTitle>
      <DialogContent>
        {detailUser && (
          <Box>
            <Typography variant="h6" gutterBottom>{detailUser.name}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
              <Typography variant="body2" color="text.secondary">Email</Typography>
              <Typography variant="body2">{detailUser.email}</Typography>

              <Typography variant="body2" color="text.secondary">Role</Typography>
              <Typography variant="body2"><Chip label={detailUser.role} color={getRoleColor(detailUser.role)} size="small" /></Typography>

              <Typography variant="body2" color="text.secondary">Auth Provider</Typography>
              <Typography variant="body2">
                <Chip
                  icon={detailUser.authProvider === 'mylogin' ? <SyncIcon /> : <LockIcon />}
                  label={detailUser.authProvider === 'mylogin' ? 'MyLogin SSO' : 'Local (email/password)'}
                  size="small"
                  variant="outlined"
                />
              </Typography>

              <Typography variant="body2" color="text.secondary">School</Typography>
              <Typography variant="body2">{detailUser.organizationName || 'N/A'}</Typography>

              <Typography variant="body2" color="text.secondary">Last Login</Typography>
              <Typography variant="body2">
                {detailUser.lastLoginAt ? new Date(detailUser.lastLoginAt).toLocaleString() : 'Never'}
              </Typography>

              {detailUser.wondeEmployeeId && (
                <>
                  <Typography variant="body2" color="text.secondary">Wonde Employee ID</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {detailUser.wondeEmployeeId}
                  </Typography>
                </>
              )}
            </Box>

            {/* Class Assignments */}
            <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
              Class Assignments
            </Typography>
            {classesLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : userClasses.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {userClasses.map((cls) => (
                  <Chip
                    key={cls.classId}
                    label={cls.className}
                    size="small"
                    variant="outlined"
                    color="primary"
                  />
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {detailUser.wondeEmployeeId
                  ? 'No class assignments found from Wonde sync.'
                  : 'Local user — class assignments are managed via Wonde sync.'}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDetailDialogOpen(false)}>Close</Button>
      </DialogActions>
    </Dialog>

    {/* Delete confirmation dialog (unchanged) */}
    <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
      <DialogTitle>Confirm Delete</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to delete {userToDelete?.name} ({userToDelete?.email})?
          This action cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
        <Button onClick={handleDeleteUser} color="error">Delete</Button>
      </DialogActions>
    </Dialog>

    {/* Edit user dialog (unchanged) */}
    <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Edit User</DialogTitle>
      <DialogContent>
        <form onSubmit={handleEditSubmit}>
          <TextField fullWidth label="Full Name" name="name" value={editFormData.name} onChange={handleEditInputChange} margin="normal" required />
          <TextField fullWidth label="Email Address" name="email" type="email" value={editFormData.email} onChange={handleEditInputChange} margin="normal" required disabled helperText="Email cannot be changed" />
          <FormControl fullWidth margin="normal">
            <InputLabel>Role</InputLabel>
            <Select name="role" value={editFormData.role} onChange={handleEditInputChange} label="Role">
              <MenuItem value="teacher">Teacher</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="readonly">Read Only</MenuItem>
            </Select>
          </FormControl>
          {user?.role === 'owner' && organizations.length > 1 && (
            <FormControl fullWidth margin="normal">
              <InputLabel>School</InputLabel>
              <Select name="organizationId" value={editFormData.organizationId} onChange={handleEditInputChange} label="School">
                {organizations.map((org) => (
                  <MenuItem key={org.id} value={org.id}>{org.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </form>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
        <Button onClick={handleEditSubmit} variant="contained" disabled={loading}>
          {loading ? 'Updating...' : 'Update User'}
        </Button>
      </DialogActions>
    </Dialog>
  </Box>
);
```

**Step 5: Update handleRegister to close the add dialog**

In the `handleRegister` function, add `setAddDialogOpen(false);` after the success state is set (around line 130).

**Step 6: Build and verify**

Run: `npm run build`
Expected: Build completes without errors.

**Step 7: Run all tests**

Run: `npm test`
Expected: All tests pass.

**Step 8: Commit**

```bash
git add src/components/UserManagement.js
git commit -m "feat(users): refactor UserManagement with full-width table, auth/login columns, search, detail dialog"
```

---

### Task 4: Update CLAUDE.md structure index

**Files:**
- Modify: `CLAUDE.md` (no structural changes needed since no files were added/removed)
- Modify: `.claude/structure/routes.yaml` (add new endpoint)

**Step 1: Update routes.yaml to document the new endpoint**

Add under the users section in `.claude/structure/routes.yaml`:
```yaml
  - GET /api/users/:id/classes   # Wonde class assignments for a user
```

**Step 2: Commit**

```bash
git add .claude/structure/routes.yaml
git commit -m "docs: add GET /api/users/:id/classes to structure index"
```

---

### Task 5: Final verification

**Step 1: Run the full test suite**

Run: `npm test`
Expected: All tests pass.

**Step 2: Build the frontend**

Run: `npm run build`
Expected: Build completes cleanly.

**Step 3: Manual smoke test**

Run: `npm run start:dev`

Verify:
1. User Management page shows full-width table with Auth and Last Login columns
2. Search bar filters users by name/email
3. SSO/Local toggle filters users correctly
4. "Add User" button opens dialog with same form
5. Info icon opens detail dialog showing user info and class assignments
6. Edit and Delete still work as before
