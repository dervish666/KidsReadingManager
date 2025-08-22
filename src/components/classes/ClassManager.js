import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Switch,
  FormControlLabel,
  Chip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useAppContext } from '../../contexts/AppContext';

const ClassManager = () => {
  const { classes, addClass, updateClass, deleteClass } = useAppContext();
  const [newClassName, setNewClassName] = useState('');
  const [newTeacherName, setNewTeacherName] = useState('');
  const [editingClass, setEditingClass] = useState(null);
  const [editClassName, setEditClassName] = useState('');
  const [editTeacherName, setEditTeacherName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState('');

  const handleAddClass = (e) => {
    e.preventDefault();
    if (!newClassName.trim() || !newTeacherName.trim()) {
      setError('Please enter both class name and teacher name.');
      return;
    }
    addClass({ name: newClassName.trim(), teacherName: newTeacherName.trim() });
    setNewClassName('');
    setNewTeacherName('');
    setError('');
  };

  const handleEditClick = (cls) => {
    setEditingClass(cls);
    setEditClassName(cls.name || '');
    setEditTeacherName(cls.teacherName || '');
    setError('');
  };

  const handleUpdateClass = (e) => {
    e.preventDefault();
    if (!editingClass) return;
    if (!editClassName.trim() || !editTeacherName.trim()) {
      setError('Please enter both class name and teacher name.');
      return;
    }
    updateClass(editingClass.id, { name: editClassName.trim(), teacherName: editTeacherName.trim() });
    setEditingClass(null);
    setEditClassName('');
    setEditTeacherName('');
    setError('');
  };

  const handleDeleteClick = (cls) => {
    setConfirmDelete(cls);
  };

  const handleConfirmDelete = () => {
    if (!confirmDelete) return;
    deleteClass(confirmDelete.id);
    setConfirmDelete(null);
  };

  const handleCancelDelete = () => setConfirmDelete(null);

  const handleCancelEdit = () => {
    setEditingClass(null);
    setEditClassName('');
    setEditTeacherName('');
    setError('');
  };

  const handleToggleDisabled = async (cls) => {
    try {
      await updateClass(cls.id, { disabled: !cls.disabled });
    } catch (error) {
      console.error('Error toggling class disabled state:', error);
    }
  };
  return (
    <Paper sx={{ p: 3, mt: 3 }}>
      <Typography variant="h6" gutterBottom>
        Manage Classes
      </Typography>

      <Box component="form" onSubmit={handleAddClass} sx={{ mt: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={5}>
            <TextField
              label="Class Name (e.g., Year 3 Robins)"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>

          <Grid item xs={12} sm={5}>
            <TextField
              label="Teacher Name"
              value={newTeacherName}
              onChange={(e) => setNewTeacherName(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>

          <Grid item xs={12} sm={2}>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              startIcon={<SaveIcon />}
            >
              Add
            </Button>
          </Grid>

          {error && (
            <Grid item xs={12}>
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            </Grid>
          )}
        </Grid>
      </Box>

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Existing Classes
        </Typography>

        {classes.length === 0 ? (
          <Typography variant="body2">No classes created yet.</Typography>
        ) : (
          <List>
            {classes.map((cls) => (
              <ListItem
                key={cls.id}
                divider
                secondaryAction={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={!cls.disabled}
                          onChange={() => handleToggleDisabled(cls)}
                          size="small"
                          color="primary"
                        />
                      }
                      label={cls.disabled ? "Disabled" : "Active"}
                      sx={{ mr: 1 }}
                    />
                    <IconButton edge="end" aria-label="edit" onClick={() => handleEditClick(cls)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton edge="end" aria-label="delete" color="error" onClick={() => handleDeleteClick(cls)}>
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {cls.name}
                      <Chip
                        icon={cls.disabled ? <BlockIcon /> : <CheckCircleIcon />}
                        label={cls.disabled ? "Disabled" : "Active"}
                        color={cls.disabled ? "error" : "success"}
                        size="small"
                        variant="outlined"
                      />
                    </Box>
                  }
                  secondary={cls.teacherName ? String(cls.teacherName) : ''}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      {/* Edit Class Dialog */}
      <Dialog open={!!editingClass} onClose={handleCancelEdit} fullWidth maxWidth="sm">
        <DialogTitle>Edit Class</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleUpdateClass} sx={{ mt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  label="Class Name"
                  value={editClassName}
                  onChange={(e) => setEditClassName(e.target.value)}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Teacher Name"
                  value={editTeacherName}
                  onChange={(e) => setEditTeacherName(e.target.value)}
                  fullWidth
                  size="small"
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelEdit}>Cancel</Button>
          <Button onClick={handleUpdateClass} variant="contained" color="primary">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!confirmDelete} onClose={handleCancelDelete}>
        <DialogTitle>Delete Class</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the class "{confirmDelete?.name}"? This will unassign all students in this class.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default ClassManager;