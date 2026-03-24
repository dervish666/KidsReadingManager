import React, { useState, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Grid,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Link as LinkIcon,
  LinkOff as LinkOffIcon,
  Sync as SyncIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';

const SchoolManagement = () => {
  const { fetchWithAuth } = useAppContext();
  const [schools, setSchools] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    contactEmail: '',
    billingEmail: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    town: '',
    postcode: '',
    wondeSchoolToken: '',
  });
  const [editingSchool, setEditingSchool] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [schoolToDelete, setSchoolToDelete] = useState(null);

  useEffect(() => {
    const loadSchools = async () => {
      try {
        const response = await fetchWithAuth('/api/organization/all');
        if (response && typeof response.json === 'function') {
          const data = await response.json();
          setSchools(data.organizations || []);
        } else {
          setSchools(response.organizations || []);
        }
      } catch (err) {
        console.error('Error fetching schools:', err);
        setError('Failed to load schools');
      }
    };
    loadSchools();
  }, [fetchWithAuth]);

  const fetchSchools = async () => {
    try {
      const response = await fetchWithAuth('/api/organization/all');

      if (response && typeof response.json === 'function') {
        const data = await response.json();
        setSchools(data.organizations || []);
      } else {
        setSchools(response.organizations || []);
      }
    } catch (err) {
      console.error('Error fetching schools:', err);
      setError('Failed to load schools');
    }
  };

  const validateForm = () => {
    if (!formData.name) {
      setError('School name is required');
      return false;
    }

    setError(null);
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      if (editingSchool) {
        // Update existing school
        await fetchWithAuth(`/api/organization/${editingSchool.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: formData.name,
            contactEmail: formData.contactEmail,
            billingEmail: formData.billingEmail,
            phone: formData.phone,
            addressLine1: formData.addressLine1,
            addressLine2: formData.addressLine2,
            town: formData.town,
            postcode: formData.postcode,
          }),
        });

        // Set Wonde token if provided and school has a wondeSchoolId
        if (formData.wondeSchoolToken.trim() && editingSchool.wondeSchoolId) {
          await fetchWithAuth('/api/wonde/token', {
            method: 'POST',
            body: JSON.stringify({
              schoolToken: formData.wondeSchoolToken.trim(),
              organizationId: editingSchool.id,
            }),
          });
        }

        setSuccess('School updated successfully');
      } else {
        // Create new school
        await fetchWithAuth('/api/organization/create', {
          method: 'POST',
          body: JSON.stringify({
            name: formData.name,
          }),
        });

        setSuccess('School created successfully');
      }

      resetForm();
      fetchSchools();
    } catch (err) {
      setError(err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (school) => {
    setEditingSchool(school);
    setFormData({
      name: school.name,
      contactEmail: school.contactEmail || '',
      billingEmail: school.billingEmail || '',
      phone: school.phone || '',
      addressLine1: school.addressLine1 || '',
      addressLine2: school.addressLine2 || '',
      town: school.town || '',
      postcode: school.postcode || '',
      wondeSchoolToken: '',
    });
    setError(null);
    setSuccess(null);
  };

  const handleDeleteSchool = async () => {
    if (!schoolToDelete) return;

    try {
      await fetchWithAuth(`/api/organization/${schoolToDelete.id}`, {
        method: 'DELETE',
      });

      setSuccess('School deactivated successfully');
      fetchSchools();
    } catch (err) {
      setError('Failed to delete school');
    } finally {
      setDeleteDialogOpen(false);
      setSchoolToDelete(null);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      contactEmail: '',
      billingEmail: '',
      phone: '',
      addressLine1: '',
      addressLine2: '',
      town: '',
      postcode: '',
      wondeSchoolToken: '',
    });
    setEditingSchool(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const openDeleteDialog = (school) => {
    setSchoolToDelete(school);
    setDeleteDialogOpen(true);
  };

  const handleWondeSync = async (school) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth(`/api/wonde/sync/${school.id}`, { method: 'POST' });
      const data = res && typeof res.json === 'function' ? await res.json() : res;
      if (data.success) {
        setSuccess(`Wonde sync completed for ${school.name}`);
        fetchSchools();
      } else {
        setError(data.error || 'Wonde sync failed');
      }
    } catch (err) {
      setError(err.message || 'Wonde sync failed');
    }
  };

  const handleStartTrial = async (school) => {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchWithAuth('/api/billing/setup', {
        method: 'POST',
        body: JSON.stringify({ plan: 'monthly', organizationId: school.id }),
      });
      const data = res && typeof res.json === 'function' ? await res.json() : res;
      if (data.status === 'trialing') {
        setSuccess(`Trial started for ${school.name} (${data.plan})`);
        fetchSchools();
      } else {
        setError(data.error || 'Failed to start trial');
      }
    } catch (err) {
      setError(err.message || 'Failed to start trial');
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        School Management
      </Typography>
      <Typography variant="body1" color="text.secondary" paragraph>
        Manage schools/organizations in the system. Only organization owners can access this page.
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

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {editingSchool ? 'Edit School' : 'Add New School'}
            </Typography>
            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="School Name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Contact Email"
                name="contactEmail"
                type="email"
                value={formData.contactEmail}
                onChange={handleInputChange}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Billing Email"
                name="billingEmail"
                type="email"
                value={formData.billingEmail}
                onChange={handleInputChange}
                margin="normal"
                helperText="Used for Stripe invoices. Falls back to contact email."
              />
              <TextField
                fullWidth
                label="Phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Address Line 1"
                name="addressLine1"
                value={formData.addressLine1}
                onChange={handleInputChange}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Address Line 2"
                name="addressLine2"
                value={formData.addressLine2}
                onChange={handleInputChange}
                margin="normal"
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  label="Town"
                  name="town"
                  value={formData.town}
                  onChange={handleInputChange}
                  margin="normal"
                  sx={{ flex: 2 }}
                />
                <TextField
                  label="Postcode"
                  name="postcode"
                  value={formData.postcode}
                  onChange={handleInputChange}
                  margin="normal"
                  sx={{ flex: 1 }}
                />
              </Box>
              {editingSchool?.wondeSchoolId && (
                <TextField
                  fullWidth
                  label="Wonde School Token"
                  name="wondeSchoolToken"
                  type="password"
                  value={formData.wondeSchoolToken}
                  onChange={handleInputChange}
                  margin="normal"
                  placeholder={editingSchool.hasWondeToken ? 'Token is set' : ''}
                  helperText="Paste from Wonde dashboard. Encrypted at rest."
                />
              )}
              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading}
                  startIcon={
                    loading ? (
                      <CircularProgress size={20} />
                    ) : editingSchool ? (
                      <EditIcon />
                    ) : (
                      <AddIcon />
                    )
                  }
                >
                  {loading ? 'Saving...' : editingSchool ? 'Update School' : 'Create School'}
                </Button>
                {editingSchool && (
                  <Button onClick={resetForm} variant="outlined" disabled={loading}>
                    Cancel
                  </Button>
                )}
              </Box>
            </form>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Existing Schools
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Source</TableCell>
                    <TableCell>Billing</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {schools.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                          No schools found. Create a new school to get started.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    schools.map((school) => (
                      <TableRow key={school.id}>
                        <TableCell>{school.name}</TableCell>
                        <TableCell>
                          {school.wondeSchoolId ? (
                            <Tooltip
                              title={
                                school.wondeLastSyncAt
                                  ? `Last synced: ${new Date(school.wondeLastSyncAt).toLocaleString()}`
                                  : 'Never synced'
                              }
                            >
                              <Chip
                                icon={<LinkIcon />}
                                label="Wonde"
                                size="small"
                                color="success"
                                variant="outlined"
                              />
                            </Tooltip>
                          ) : (
                            <Chip
                              icon={<LinkOffIcon />}
                              label="Manual"
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {school.subscriptionStatus && school.subscriptionStatus !== 'none' ? (
                            <Chip
                              label={school.subscriptionStatus}
                              size="small"
                              color={
                                school.subscriptionStatus === 'active' ? 'success'
                                : school.subscriptionStatus === 'trialing' ? 'info'
                                : school.subscriptionStatus === 'past_due' ? 'warning'
                                : school.subscriptionStatus === 'cancelled' ? 'error'
                                : 'default'
                              }
                            />
                          ) : (
                            <Tooltip title="Start 30-day free trial">
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<PlayArrowIcon />}
                                onClick={() => handleStartTrial(school)}
                                sx={{ textTransform: 'none' }}
                              >
                                Start Trial
                              </Button>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>
                          {school.wondeSchoolId && (
                            <Tooltip title="Sync from Wonde">
                              <IconButton
                                color="secondary"
                                onClick={() => handleWondeSync(school)}
                                size="small"
                                sx={{ mr: 1 }}
                              >
                                <SyncIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                          <IconButton
                            color="primary"
                            onClick={() => handleEdit(school)}
                            size="small"
                            sx={{ mr: 1 }}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            color="error"
                            onClick={() => openDeleteDialog(school)}
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to deactivate {schoolToDelete?.name}? This will deactivate the
            school but not delete associated data.
          </DialogContentText>
          {schoolToDelete?.wondeSchoolId && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              This school is managed by Wonde. It may be re-provisioned automatically if a new
              webhook is received. Consider revoking access in the Wonde dashboard first.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDeleteSchool} color="error">
            Deactivate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SchoolManagement;
