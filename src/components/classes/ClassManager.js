import React, { useState, useMemo, useCallback } from 'react';
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
  ListItemButton,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Switch,
  FormControlLabel,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Collapse,
  Alert,
  CircularProgress
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SyncIcon from '@mui/icons-material/Sync';
import PeopleIcon from '@mui/icons-material/People';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';

// Year options for the dropdown (Year 1 to Year 11)
const YEAR_OPTIONS = Array.from({ length: 11 }, (_, i) => `Year ${i + 1}`);

const ClassManager = () => {
  const { fetchWithAuth } = useAuth();
  const { classes, addClass, updateClass, deleteClass } = useData();
  const [newClassName, setNewClassName] = useState('');
  const [newTeacherName, setNewTeacherName] = useState('');
  const [editingClass, setEditingClass] = useState(null);
  const [editClassName, setEditClassName] = useState('');
  const [editTeacherName, setEditTeacherName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState('');

  // Expandable student list state
  const [expandedClassId, setExpandedClassId] = useState(null);
  const [classStudents, setClassStudents] = useState({});
  const [loadingStudents, setLoadingStudents] = useState(null);

  // Detect Wonde-connected org by checking if any class has a wondeClassId
  const isWondeOrg = useMemo(() => classes.some(cls => cls.wondeClassId), [classes]);

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
    } catch (err) {
      console.error('Error toggling class disabled state:', err);
    }
  };

  const handleToggleExpand = useCallback(async (classId) => {
    if (expandedClassId === classId) {
      setExpandedClassId(null);
      return;
    }

    setExpandedClassId(classId);

    // Fetch students if not already cached
    if (!classStudents[classId]) {
      setLoadingStudents(classId);
      try {
        const response = await fetchWithAuth(`/api/classes/${classId}/students`);
        if (response.ok) {
          const students = await response.json();
          setClassStudents(prev => ({ ...prev, [classId]: students }));
        }
      } catch (err) {
        console.error('Error fetching class students:', err);
      } finally {
        setLoadingStudents(null);
      }
    }
  }, [expandedClassId, classStudents, fetchWithAuth]);

  const formatReadingLevel = (min, max) => {
    if (min == null && max == null) return null;
    if (min != null && max != null) return `${min}–${max}`;
    if (min != null) return `${min}+`;
    return `up to ${max}`;
  };

  // ── Shared: expandable student sub-list ──────────────────────────────────
  const renderStudentExpansion = (cls) => {
    const isExpanded = expandedClassId === cls.id;
    const students = classStudents[cls.id];
    const isLoading = loadingStudents === cls.id;

    return (
      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
        <Box sx={{ pl: 4, pr: 2, pb: 2, pt: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">Loading students...</Typography>
            </Box>
          ) : students && students.length > 0 ? (
            <List dense disablePadding>
              {students.map(student => (
                <ListItem key={student.id} disablePadding sx={{ py: 0.25 }}>
                  <ListItemText
                    primary={student.name}
                    secondary={formatReadingLevel(student.readingLevelMin, student.readingLevelMax)}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
              No students in this class.
            </Typography>
          )}
        </Box>
      </Collapse>
    );
  };

  // ── Wonde mode: read-only class list ─────────────────────────────────────
  const renderWondeClassList = () => (
    <>
      <Alert icon={<SyncIcon />} severity="info" sx={{ mb: 2 }}>
        Classes are synced from your school's MIS via Wonde. To add or rename classes, update them in your MIS and they will sync automatically.
      </Alert>

      {classes.length === 0 ? (
        <Typography variant="body2">No classes synced yet.</Typography>
      ) : (
        <List disablePadding>
          {classes.map((cls) => (
            <React.Fragment key={cls.id}>
              <ListItem
                disablePadding
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
                      sx={{ mr: 0 }}
                    />
                  </Box>
                }
              >
                <ListItemButton onClick={() => handleToggleExpand(cls.id)} sx={{ pr: 20 }}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {cls.name}
                        {cls.studentCount != null && (
                          <Chip
                            icon={<PeopleIcon />}
                            label={cls.studentCount}
                            size="small"
                            variant="outlined"
                            color="default"
                          />
                        )}
                        {cls.disabled && (
                          <Chip label="Disabled" size="small" color="error" variant="outlined" />
                        )}
                      </Box>
                    }
                    secondary={cls.teacherName ? String(cls.teacherName) : null}
                  />
                  {expandedClassId === cls.id ? <ExpandLessIcon color="action" /> : <ExpandMoreIcon color="action" />}
                </ListItemButton>
              </ListItem>
              {renderStudentExpansion(cls)}
            </React.Fragment>
          ))}
        </List>
      )}
    </>
  );

  // ── Manual mode: full CRUD class list ────────────────────────────────────
  const renderManualClassList = () => (
    <>
      <Box component="form" onSubmit={handleAddClass} sx={{ mt: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, sm: 5 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="new-class-year-label">Year Group</InputLabel>
              <Select
                labelId="new-class-year-label"
                id="new-class-year-select"
                value={newClassName}
                label="Year Group"
                onChange={(e) => setNewClassName(e.target.value)}
              >
                {YEAR_OPTIONS.map((year) => (
                  <MenuItem key={year} value={year}>
                    {year}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 5 }}>
            <TextField
              label="Teacher Name"
              value={newTeacherName}
              onChange={(e) => setNewTeacherName(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 2 }}>
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
            <Grid size={12}>
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
          <List disablePadding>
            {classes.map((cls) => (
              <React.Fragment key={cls.id}>
                <ListItem
                  disablePadding
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
                  <ListItemButton onClick={() => handleToggleExpand(cls.id)} sx={{ pr: 28 }}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {cls.name}
                          {cls.studentCount != null && (
                            <Chip
                              icon={<PeopleIcon />}
                              label={cls.studentCount}
                              size="small"
                              variant="outlined"
                              color="default"
                            />
                          )}
                          {cls.disabled && (
                            <Chip label="Disabled" size="small" color="error" variant="outlined" />
                          )}
                        </Box>
                      }
                      secondary={cls.teacherName ? String(cls.teacherName) : ''}
                    />
                    {expandedClassId === cls.id ? <ExpandLessIcon color="action" /> : <ExpandMoreIcon color="action" />}
                  </ListItemButton>
                </ListItem>
                {renderStudentExpansion(cls)}
              </React.Fragment>
            ))}
          </List>
        )}
      </Box>
    </>
  );

  return (
    <Paper sx={{ p: 3, mt: 3 }}>
      <Typography variant="h6" gutterBottom>
        Manage Classes
      </Typography>

      {isWondeOrg ? renderWondeClassList() : renderManualClassList()}

      {/* Edit Class Dialog (manual mode only) */}
      <Dialog open={!!editingClass} onClose={handleCancelEdit} fullWidth maxWidth="sm">
        <DialogTitle>Edit Class</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleUpdateClass} sx={{ mt: 1 }}>
            <Grid container spacing={2}>
              <Grid size={12}>
                <FormControl fullWidth size="small">
                  <InputLabel id="edit-class-year-label">Year Group</InputLabel>
                  <Select
                    labelId="edit-class-year-label"
                    id="edit-class-year-select"
                    value={editClassName}
                    label="Year Group"
                    onChange={(e) => setEditClassName(e.target.value)}
                  >
                    {YEAR_OPTIONS.map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={12}>
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

      {/* Delete Confirmation (manual mode only) */}
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
