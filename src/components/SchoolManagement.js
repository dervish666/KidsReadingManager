import React, { useState, useEffect } from 'react';
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
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Grid,
} from '@mui/material';
import { 
  Delete as DeleteIcon, 
  Edit as EditIcon,
  School as SchoolIcon,
  Add as AddIcon
} from '@mui/icons-material';

const SchoolManagement = () => {
  const { fetchWithAuth } = useAppContext();
  const [schools, setSchools] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    subscriptionTier: 'free',
    maxStudents: 50,
    maxTeachers: 3,
  });
  const [editingSchool, setEditingSchool] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [schoolToDelete, setSchoolToDelete] = useState(null);

  useEffect(() => {
    fetchSchools();
  }, []);

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

    if (formData.maxStudents < 1) {
      setError('Max students must be at least 1');
      return false;
    }

    if (formData.maxTeachers < 1) {
      setError('Max teachers must be at least 1');
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
            subscriptionTier: formData.subscriptionTier,
            maxStudents: parseInt(formData.maxStudents),
            maxTeachers: parseInt(formData.maxTeachers)
          }),
        });

        setSuccess('School updated successfully');
      } else {
        // Create new school
        await fetchWithAuth('/api/organization/create', {
          method: 'POST',
          body: JSON.stringify({
            name: formData.name,
            subscriptionTier: formData.subscriptionTier,
            maxStudents: parseInt(formData.maxStudents),
            maxTeachers: parseInt(formData.maxTeachers)
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
      subscriptionTier: school.subscriptionTier,
      maxStudents: school.maxStudents,
      maxTeachers: school.maxTeachers,
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
      subscriptionTier: 'free',
      maxStudents: 50,
      maxTeachers: 3,
    });
    setEditingSchool(null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openDeleteDialog = (school) => {
    setSchoolToDelete(school);
    setDeleteDialogOpen(true);
  };

  const getTierColor = (tier) => {
    switch (tier) {
      case 'premium': return 'primary';
      case 'basic': return 'secondary';
      case 'free': return 'default';
      default: return 'default';
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
        <Grid item xs={12} md={4}>
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
              <FormControl fullWidth margin="normal">
                <InputLabel>Subscription Tier</InputLabel>
                <Select
                  name="subscriptionTier"
                  value={formData.subscriptionTier}
                  onChange={handleInputChange}
                  label="Subscription Tier"
                >
                  <MenuItem value="free">Free</MenuItem>
                  <MenuItem value="basic">Basic</MenuItem>
                  <MenuItem value="premium">Premium</MenuItem>
                </Select>
              </FormControl>
              <TextField
                fullWidth
                label="Max Students"
                name="maxStudents"
                type="number"
                value={formData.maxStudents}
                onChange={handleInputChange}
                margin="normal"
                required
                inputProps={{ min: 1 }}
              />
              <TextField
                fullWidth
                label="Max Teachers"
                name="maxTeachers"
                type="number"
                value={formData.maxTeachers}
                onChange={handleInputChange}
                margin="normal"
                required
                inputProps={{ min: 1 }}
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} /> : editingSchool ? <EditIcon /> : <AddIcon />}
                >
                  {loading ? 'Saving...' : editingSchool ? 'Update School' : 'Create School'}
                </Button>
                {editingSchool && (
                  <Button
                    onClick={resetForm}
                    variant="outlined"
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                )}
              </Box>
            </form>
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Existing Schools
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Tier</TableCell>
                    <TableCell>Max Students</TableCell>
                    <TableCell>Max Teachers</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {schools.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
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
                          <Box
                            component="span"
                            sx={{
                              textTransform: 'capitalize',
                              px: 1,
                              py: 0.5,
                              borderRadius: 1,
                              bgcolor: getTierColor(school.subscriptionTier) === 'primary' ? 'primary.light' : 
                                      getTierColor(school.subscriptionTier) === 'secondary' ? 'secondary.light' : 'grey.300',
                              color: getTierColor(school.subscriptionTier) === 'default' ? 'text.primary' : 'white',
                              fontSize: '0.875rem'
                            }}
                          >
                            {school.subscriptionTier}
                          </Box>
                        </TableCell>
                        <TableCell>{school.maxStudents}</TableCell>
                        <TableCell>{school.maxTeachers}</TableCell>
                        <TableCell>
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

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to deactivate {schoolToDelete?.name}?
            This will deactivate the school but not delete associated data.
          </DialogContentText>
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
