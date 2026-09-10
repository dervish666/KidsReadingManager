import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { formatRelativeTime } from '../utils/helpers';
import { usernameFromName, normaliseUsername, isValidUsername } from '../utils/username';
import {
  Box,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tooltip,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  Autocomplete,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  PersonAdd as PersonAddIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Info as InfoIcon,
  Sync as SyncIcon,
  Lock as LockIcon,
  ContentCopy as ContentCopyIcon,
  Badge as BadgeIcon,
  VpnKey as VpnKeyIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

const EMPTY_FORM = {
  name: '',
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
  role: 'teacher',
  organizationId: '',
};

const UserManagement = () => {
  const { fetchWithAuth, user, activeOrganizationId } = useAuth();
  const { classes } = useData();
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [formData, setFormData] = useState(EMPTY_FORM);
  // 'username' — manual account, no school email, signs in as firstname.lastname.
  // 'email'    — invitation emailed with a temporary password (the old flow).
  const [signInMethod, setSignInMethod] = useState('username');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [newClassValue, setNewClassValue] = useState([]);
  // Credentials for accounts created in this session. There is no inbox to send
  // them to, so this list is the only copy — it is deliberately not persisted.
  const [newCredentials, setNewCredentials] = useState([]);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    email: '',
    role: 'teacher',
    organizationId: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [authFilter, setAuthFilter] = useState('all');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailUser, setDetailUser] = useState(null);
  const [userClasses, setUserClasses] = useState([]);
  const [availableClasses, setAvailableClasses] = useState([]);
  const [isWondeUser, setIsWondeUser] = useState(false);
  const [classesLoading, setClassesLoading] = useState(false);
  const [editingClasses, setEditingClasses] = useState(false);
  const [classEditValue, setClassEditValue] = useState([]);
  const [savingClasses, setSavingClasses] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetchWithAuth('/api/users');
        if (response && typeof response.json === 'function') {
          const data = await response.json();
          setUsers(data.users || data || []);
        } else {
          setUsers(response.users || response || []);
        }
      } catch (err) {
        setError(err.message || 'Failed to load users');
      }

      try {
        const response = await fetchWithAuth('/api/organization/all');
        if (response && typeof response.json === 'function') {
          const data = await response.json();
          setOrganizations(data.organizations || []);
        } else {
          setOrganizations(response.organizations || []);
        }
      } catch {
        // Non-critical
      }
    };
    loadData();
  }, [fetchWithAuth]);

  // Class options are loaded for the org the admin is currently looking at, so
  // the picker is only honest when the new account lands in that same org.
  const creatingInCurrentOrg =
    !formData.organizationId ||
    formData.organizationId === (activeOrganizationId || user?.organizationId);

  // Suggested username, until the admin types their own.
  const suggestedUsername = useMemo(() => usernameFromName(formData.name), [formData.name]);
  const effectiveUsername = usernameEdited ? formData.username : suggestedUsername;

  const validateForm = () => {
    if (!formData.name) {
      setError('A full name is required');
      return false;
    }

    if (signInMethod === 'email') {
      if (!formData.email) {
        setError('An email address is required, or switch to a username');
        return false;
      }
      if (!/\S+@\S+\.\S+/.test(formData.email)) {
        setError('Please enter a valid email address');
        return false;
      }
    } else if (!isValidUsername(normaliseUsername(effectiveUsername))) {
      setError(
        'Enter a username of 3-40 letters, numbers, dots or hyphens (for example sarah.jones)'
      );
      return false;
    }

    // A password is optional — one is generated when this is left blank.
    if (formData.password) {
      if (formData.password.length < 8) {
        setError('Password must be at least 8 characters');
        return false;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        return false;
      }
    }

    // Organization is only required if there are multiple organizations
    if (organizations.length > 1 && !formData.organizationId) {
      setError('Please select a school');
      return false;
    }

    setError(null);
    return true;
  };

  const handleRegister = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: formData.name,
        role: formData.role,
        // Only send classes when the picker was showing the target school's
        // own classes — otherwise a leftover selection would name classes the
        // new account's organization does not own, and the server would 400.
        classIds: creatingInCurrentOrg ? newClassValue.map((cls) => cls.id) : [],
      };
      if (signInMethod === 'email') {
        payload.email = formData.email;
      } else {
        payload.username = normaliseUsername(effectiveUsername);
      }
      if (formData.password) payload.password = formData.password;
      if (formData.organizationId) payload.organizationId = formData.organizationId;

      const response = await fetchWithAuth('/api/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      // fetchWithAuth returns a Response object — check status
      let data = {};
      if (response && typeof response.json === 'function') {
        data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || `Registration failed (${response.status})`);
        }
      } else {
        data = response || {};
      }

      // A generated password comes back exactly once, for accounts with no
      // inbox. Hold it on screen until the admin dismisses it.
      if (data.temporaryPassword) {
        setNewCredentials((prev) => [
          ...prev,
          {
            id: data.user?.id,
            name: formData.name,
            username: data.user?.username || normaliseUsername(effectiveUsername),
            password: data.temporaryPassword,
          },
        ]);
        setSuccess(null);
      } else {
        setSuccess(data.message || 'User created successfully');
      }

      setAddDialogOpen(false);
      setFormData(EMPTY_FORM);
      setUsernameEdited(false);
      setNewClassValue([]);

      // Refresh user list
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text) => {
    navigator.clipboard?.writeText(text).catch(() => {
      /* clipboard blocked — the value is on screen to read anyway */
    });
  };

  const credentialsAsText = (list) =>
    list.map((cred) => `${cred.name}\t${cred.username}\t${cred.password}`).join('\n');

  const handleResetPassword = async (targetUser) => {
    setError(null);
    setResettingPassword(true);
    try {
      const response = await fetchWithAuth(`/api/users/${targetUser.id}/reset-password`, {
        method: 'POST',
      });
      let data = {};
      if (response && typeof response.json === 'function') {
        data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Reset failed (${response.status})`);
      } else {
        data = response || {};
      }

      if (data.temporaryPassword) {
        setNewCredentials((prev) => [
          ...prev,
          {
            id: targetUser.id,
            name: targetUser.name,
            username: data.username || targetUser.username,
            password: data.temporaryPassword,
          },
        ]);
        setDetailDialogOpen(false);
      } else {
        setSuccess(data.message || 'Password reset');
      }
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetchWithAuth('/api/users');

      // Check if response is a Response object (not yet parsed)
      if (response && typeof response.json === 'function') {
        const data = await response.json();
        setUsers(data.users || []);
      } else {
        // Already parsed JSON
        setUsers(response.users || []);
      }
    } catch (err) {
      setError('Failed to load users');
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      await fetchWithAuth(`/api/users/${userToDelete.id}`, {
        method: 'DELETE',
      });

      setSuccess('User deleted successfully');
      fetchUsers();
    } catch (err) {
      setError('Failed to delete user');
    } finally {
      setDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'owner':
        return 'primary';
      case 'admin':
        return 'secondary';
      case 'teacher':
        return 'success';
      case 'readonly':
        return 'default';
      default:
        return 'default';
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const openDeleteDialog = (user) => {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const openEditDialog = (user) => {
    setUserToEdit(user);
    setEditFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    });
    setEditDialogOpen(true);
    setError(null);
    setSuccess(null);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!userToEdit) return;

    // Only send fields that actually changed. The backend rejects role changes
    // on owner accounts, so echoing an unchanged role would block legitimate
    // updates (e.g. moving an owner to a different school).
    const updateData = {};
    if (editFormData.name !== userToEdit.name) {
      updateData.name = editFormData.name;
    }
    if (editFormData.role !== userToEdit.role) {
      updateData.role = editFormData.role;
    }
    if (editFormData.organizationId !== userToEdit.organizationId) {
      updateData.organizationId = editFormData.organizationId;
    }

    if (Object.keys(updateData).length === 0) {
      setEditDialogOpen(false);
      setUserToEdit(null);
      return;
    }

    setLoading(true);
    try {
      const response = await fetchWithAuth(`/api/users/${userToEdit.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Update failed (${response.status})`);
      }

      setSuccess('User updated successfully');
      setEditDialogOpen(false);
      setUserToEdit(null);
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEditInputChange = (e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        !searchQuery ||
        u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.username?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesAuth =
        authFilter === 'all' ||
        (authFilter === 'sso' && u.authProvider === 'mylogin') ||
        (authFilter === 'local' && (!u.authProvider || u.authProvider === 'local'));
      return matchesSearch && matchesAuth;
    });
  }, [users, searchQuery, authFilter]);

  const loadUserClasses = async (targetUser) => {
    setClassesLoading(true);
    try {
      const response = await fetchWithAuth(`/api/users/${targetUser.id}/classes`);
      const data =
        response && typeof response.json === 'function' ? await response.json() : response;
      setUserClasses(data.classes || []);
      setAvailableClasses(data.availableClasses || []);
      setIsWondeUser(Boolean(data.isWondeUser));
    } catch {
      setUserClasses([]);
      setAvailableClasses([]);
    } finally {
      setClassesLoading(false);
    }
  };

  const openDetailDialog = async (targetUser) => {
    setDetailUser(targetUser);
    setDetailDialogOpen(true);
    setUserClasses([]);
    setAvailableClasses([]);
    setIsWondeUser(false);
    setEditingClasses(false);

    await loadUserClasses(targetUser);
  };

  const startEditingClasses = () => {
    setClassEditValue(
      userClasses.map((c) => availableClasses.find((a) => a.classId === c.classId)).filter(Boolean)
    );
    setEditingClasses(true);
  };

  const cancelEditingClasses = () => {
    setEditingClasses(false);
    setClassEditValue([]);
  };

  const saveClassAssignments = async () => {
    if (!detailUser) return;
    setSavingClasses(true);
    setError(null);
    try {
      const response = await fetchWithAuth(`/api/users/${detailUser.id}/classes`, {
        method: 'PUT',
        body: JSON.stringify({ classIds: classEditValue.map((c) => c.classId) }),
      });
      if (response && typeof response.json === 'function' && !response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed (${response.status})`);
      }
      setSuccess('Class assignments updated');
      setEditingClasses(false);
      await loadUserClasses(detailUser);
    } catch (err) {
      setError(err.message || 'Failed to update class assignments');
    } finally {
      setSavingClasses(false);
    }
  };

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
        Manage users in your organisation.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      {newCredentials.length > 0 && (
        <Alert
          severity="warning"
          icon={<VpnKeyIcon />}
          sx={{ mb: 2 }}
          action={
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={() => copyText(credentialsAsText(newCredentials))}
              >
                Copy all
              </Button>
              <IconButton
                size="small"
                aria-label="Dismiss new sign-in details"
                onClick={() => setNewCredentials([])}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          }
        >
          <Typography variant="subtitle2" gutterBottom>
            New sign-in details — write these down now
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            These accounts have no email address, so this is the only time the password is shown.
            Closing this box loses it, and you would have to reset the password again.
          </Typography>
          <Box component="table" sx={{ borderSpacing: '0 4px', fontSize: '0.85rem' }}>
            <Box component="tbody">
              {newCredentials.map((cred, i) => (
                <Box component="tr" key={`${cred.id}-${i}`}>
                  <Box component="td" sx={{ pr: 2 }}>
                    {cred.name}
                  </Box>
                  <Box component="td" sx={{ pr: 2, fontFamily: 'monospace' }}>
                    {cred.username}
                  </Box>
                  <Box component="td" sx={{ pr: 1, fontFamily: 'monospace', fontWeight: 600 }}>
                    {cred.password}
                  </Box>
                  <Box component="td">
                    <IconButton
                      size="small"
                      aria-label={`Copy sign-in details for ${cred.name}`}
                      onClick={() => copyText(`${cred.username}\t${cred.password}`)}
                    >
                      <ContentCopyIcon fontSize="inherit" />
                    </IconButton>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Alert>
      )}

      {/* Search and filter bar */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search by name, email or username..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ minWidth: 280 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
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

      {/* Users table */}
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
                    <TableCell>
                      {u.email || (
                        <Box
                          component="span"
                          sx={{ fontFamily: 'monospace', display: 'flex', alignItems: 'center' }}
                        >
                          <BadgeIcon fontSize="inherit" sx={{ mr: 0.5, opacity: 0.6 }} />
                          {u.username || '—'}
                        </Box>
                      )}
                    </TableCell>
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
                      <Tooltip
                        title={
                          u.lastLoginAt
                            ? new Date(u.lastLoginAt).toLocaleString()
                            : 'Never logged in'
                        }
                      >
                        <Typography variant="body2">{formatRelativeTime(u.lastLoginAt)}</Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip title="View details">
                        <IconButton
                          size="small"
                          onClick={() => openDetailDialog(u)}
                          sx={{ mr: 0.5 }}
                          aria-label={`View details for ${u.name}`}
                        >
                          <InfoIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit user">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => openEditDialog(u)}
                          sx={{ mr: 0.5 }}
                          aria-label={`Edit ${u.name}`}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {u.id !== user.id && (user.role === 'owner' || u.role !== 'owner') && (
                        <Tooltip title="Delete user">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => openDeleteDialog(u)}
                            aria-label={`Delete ${u.name}`}
                          >
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

      {/* Add User Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Full Name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            margin="normal"
            required
          />

          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              How will they sign in?
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={signInMethod}
              onChange={(e, val) => val && setSignInMethod(val)}
            >
              <ToggleButton value="username">Username</ToggleButton>
              <ToggleButton value="email">Email invitation</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {signInMethod === 'username' ? (
            <TextField
              fullWidth
              label="Username"
              name="username"
              value={effectiveUsername}
              onChange={(e) => {
                setUsernameEdited(true);
                setFormData({ ...formData, username: e.target.value });
              }}
              margin="normal"
              required
              helperText="They sign in with this and a password. No email address needed. A number is added if it is already taken."
              InputProps={{ sx: { fontFamily: 'monospace' } }}
            />
          ) : (
            <TextField
              fullWidth
              label="Email Address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              margin="normal"
              required
              helperText="An invitation with their password is emailed here."
            />
          )}

          <TextField
            fullWidth
            label="Password"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleInputChange}
            margin="normal"
            helperText="Leave blank to generate one"
          />
          {formData.password && (
            <TextField
              fullWidth
              label="Confirm Password"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              margin="normal"
              required
            />
          )}
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
              <Select
                name="organizationId"
                value={formData.organizationId}
                onChange={handleInputChange}
                label="School"
              >
                <MenuItem value="">
                  <em>Select School</em>
                </MenuItem>
                {organizations.map((org) => (
                  <MenuItem key={org.id} value={org.id}>
                    {org.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {creatingInCurrentOrg ? (
            <Autocomplete
              multiple
              size="small"
              options={classes || []}
              value={newClassValue}
              onChange={(_, val) => setNewClassValue(val)}
              getOptionLabel={(opt) => opt.name || ''}
              isOptionEqualToValue={(opt, val) => opt.id === val.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Classes"
                  margin="normal"
                  placeholder="Select classes..."
                  helperText="Which classes this teacher looks after. Can be changed later."
                />
              )}
            />
          ) : (
            <Alert severity="info" sx={{ mt: 2 }}>
              Classes can be assigned after the account is created — open the new user and edit
              their class assignments. This list only shows the school you are currently viewing.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleRegister}
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : <PersonAddIcon />}
          >
            {loading ? 'Creating...' : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* User Detail Dialog */}
      <Dialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>User Details</DialogTitle>
        <DialogContent>
          {detailUser && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {detailUser.name}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Email
                </Typography>
                <Typography variant="body2">{detailUser.email || 'None'}</Typography>

                {detailUser.username && (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Username
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {detailUser.username}
                    </Typography>
                  </>
                )}

                <Typography variant="body2" color="text.secondary">
                  Role
                </Typography>
                <Typography variant="body2">
                  <Chip
                    label={detailUser.role}
                    color={getRoleColor(detailUser.role)}
                    size="small"
                  />
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  Auth Provider
                </Typography>
                <Typography variant="body2">
                  <Chip
                    icon={detailUser.authProvider === 'mylogin' ? <SyncIcon /> : <LockIcon />}
                    label={
                      detailUser.authProvider === 'mylogin'
                        ? 'MyLogin SSO'
                        : detailUser.username
                          ? 'Local (username/password)'
                          : 'Local (email/password)'
                    }
                    size="small"
                    variant="outlined"
                  />
                </Typography>

                <Typography variant="body2" color="text.secondary">
                  School
                </Typography>
                <Typography variant="body2">{detailUser.organizationName || 'N/A'}</Typography>

                <Typography variant="body2" color="text.secondary">
                  Last Login
                </Typography>
                <Typography variant="body2">
                  {detailUser.lastLoginAt
                    ? new Date(detailUser.lastLoginAt).toLocaleString()
                    : 'Never'}
                </Typography>

                {detailUser.wondeEmployeeId && (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Wonde Employee ID
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                    >
                      {detailUser.wondeEmployeeId}
                    </Typography>
                  </>
                )}
              </Box>

              {detailUser.authProvider !== 'mylogin' && (
                <Box sx={{ mt: 1, mb: 1 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<VpnKeyIcon />}
                    disabled={resettingPassword}
                    onClick={() => handleResetPassword(detailUser)}
                  >
                    {resettingPassword ? 'Resetting…' : 'Reset password'}
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {detailUser.email
                      ? 'The new password is emailed to them.'
                      : 'The new password is shown to you once — nowhere else.'}
                  </Typography>
                </Box>
              )}

              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mt: 2,
                }}
              >
                <Typography variant="subtitle2">Class Assignments</Typography>
                {!editingClasses && !classesLoading && !isWondeUser && (
                  <Button size="small" startIcon={<EditIcon />} onClick={startEditingClasses}>
                    Edit
                  </Button>
                )}
              </Box>
              {classesLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : editingClasses ? (
                <Box>
                  <Autocomplete
                    multiple
                    size="small"
                    options={availableClasses}
                    value={classEditValue}
                    onChange={(_, val) => setClassEditValue(val)}
                    getOptionLabel={(opt) => opt.className}
                    isOptionEqualToValue={(opt, val) => opt.classId === val.classId}
                    renderInput={(params) => (
                      <TextField {...params} placeholder="Select classes..." />
                    )}
                    sx={{ mt: 1 }}
                  />
                  {isWondeUser && (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      This is a Wonde-synced user. The next Wonde sync will overwrite manual changes
                      based on MIS data.
                    </Alert>
                  )}
                  <Box sx={{ display: 'flex', gap: 1, mt: 2, justifyContent: 'flex-end' }}>
                    <Button size="small" onClick={cancelEditingClasses} disabled={savingClasses}>
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={saveClassAssignments}
                      disabled={savingClasses}
                      startIcon={savingClasses ? <CircularProgress size={16} /> : null}
                    >
                      {savingClasses ? 'Saving...' : 'Save'}
                    </Button>
                  </Box>
                </Box>
              ) : userClasses.length > 0 ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
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
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {isWondeUser
                    ? 'No classes assigned. Class assignments are synced from Wonde.'
                    : 'No classes assigned. Click Edit to assign classes.'}
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete {userToDelete?.name} ({userToDelete?.email})? This
            action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteUser} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent>
          <form onSubmit={handleEditSubmit}>
            <TextField
              fullWidth
              label="Full Name"
              name="name"
              value={editFormData.name}
              onChange={handleEditInputChange}
              margin="normal"
              required
            />
            <TextField
              fullWidth
              label="Email Address"
              name="email"
              type="email"
              value={editFormData.email}
              onChange={handleEditInputChange}
              margin="normal"
              required
              disabled
              helperText="Email cannot be changed"
            />
            <FormControl fullWidth margin="normal">
              <InputLabel>Role</InputLabel>
              <Select
                name="role"
                value={editFormData.role}
                onChange={handleEditInputChange}
                label="Role"
                disabled={userToEdit?.role === 'owner'}
              >
                {userToEdit?.role === 'owner' && <MenuItem value="owner">Owner</MenuItem>}
                <MenuItem value="teacher">Teacher</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
                <MenuItem value="readonly">Read Only</MenuItem>
              </Select>
            </FormControl>
            {user?.role === 'owner' && organizations.length > 1 && (
              <FormControl fullWidth margin="normal">
                <InputLabel>School</InputLabel>
                <Select
                  name="organizationId"
                  value={editFormData.organizationId}
                  onChange={handleEditInputChange}
                  label="School"
                >
                  {organizations.map((org) => (
                    <MenuItem key={org.id} value={org.id}>
                      {org.name}
                    </MenuItem>
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
};

export default UserManagement;
