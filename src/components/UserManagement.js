import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
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

const UserManagement = () => {
  const { fetchWithAuth, user } = useAppContext();
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'teacher',
    organizationId: '',
  });
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
  const [classesLoading, setClassesLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      const response = await fetchWithAuth('/api/organization/all');
      
      if (response && typeof response.json === 'function') {
        const data = await response.json();
        setOrganizations(data.organizations || []);
      } else {
        setOrganizations(response.organizations || []);
      }
    } catch (err) {
      // Don't show error to user - non-critical fetch
    }
  };

  const validateForm = () => {
    if (!formData.name || !formData.email || !formData.password || !formData.confirmPassword) {
      setError('All fields are required');
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return false;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return false;
    }

    if (!/\S+@\S+\.\S+/.test(formData.email)) {
      setError('Please enter a valid email address');
      return false;
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
      const data = await fetchWithAuth('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role
        }),
      });

      setSuccess('User registered successfully');
      setAddDialogOpen(false);
      setFormData({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'teacher'
      });
      
      // Refresh user list
      fetchUsers();
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
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
      case 'owner': return 'primary';
      case 'admin': return 'secondary';
      case 'teacher': return 'success';
      case 'readonly': return 'default';
      default: return 'default';
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
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

    setLoading(true);
    try {
      const updateData = {
        name: editFormData.name,
        role: editFormData.role,
      };

      // Only include organizationId if it changed and user is owner
      if (editFormData.organizationId !== userToEdit.organizationId) {
        updateData.organizationId = editFormData.organizationId;
      }

      await fetchWithAuth(`/api/users/${userToEdit.id}`, {
        method: 'PUT',
        body: JSON.stringify(updateData),
      });

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
    setEditFormData(prev => ({ ...prev, [name]: value }));
  };

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

      {/* Add User Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New User</DialogTitle>
        <DialogContent>
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

      {/* User Detail Dialog */}
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

      {/* Delete confirmation dialog */}
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

      {/* Edit user dialog */}
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
};

export default UserManagement;