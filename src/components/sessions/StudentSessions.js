import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card,
  CardContent,
  Grid,
  Snackbar,
  Alert
} from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import { useAppContext } from '../../contexts/AppContext';

const StudentSessions = ({ open, onClose, student }) => {
  const {
    editReadingSession,
    deleteReadingSession,
    deleteStudent,
    classes, // Get classes
    updateStudentClassId // Get update function
  } = useAppContext();
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [editingSession, setEditingSession] = useState(null);
  const [deletingSession, setDeletingSession] = useState(null);
  const [deletingStudent, setDeletingStudent] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState(''); // State for class selection
  const [editDate, setEditDate] = useState('');
  const [editAssessment, setEditAssessment] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');

  // Update selectedClassId when student changes or dialog opens
  useEffect(() => {
    if (student) {
      setSelectedClassId(student.classId || 'unassigned');
    }
  }, [student, open]); // Re-run if student changes or dialog opens/closes

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'No date';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Format assessment for display
  const formatAssessment = (assessment) => {
    if (!assessment) return 'Not assessed';
    
    const formatted = assessment.replace('-', ' ');
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  };

  // Get color for assessment
  const getAssessmentColor = (assessment) => {
    switch (assessment) {
      case 'struggling':
        return 'error.main';
      case 'needs-help':
        return 'warning.main';
      case 'independent':
        return 'success.main';
      default:
        return 'text.primary';
    }
  };

  // Handle edit button click
  const handleEditClick = (session) => {
    setEditingSession(session);
    setEditDate(session.date);
    setEditAssessment(session.assessment);
    setEditNotes(session.notes || '');
  };

  // Handle delete button click
  const handleDeleteClick = (session) => {
    setDeletingSession(session);
  };

  // Handle edit save
  const handleEditSave = async () => {
    try {
      await editReadingSession(student.id, editingSession.id, {
        date: editDate,
        assessment: editAssessment,
        notes: editNotes
      });
      
      setSnackbarMessage('Session updated successfully');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      setEditingSession(null);
    } catch (error) {
      setSnackbarMessage(`Error updating session: ${error.message}`);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // Handle delete confirm
  const handleDeleteConfirm = async () => {
    try {
      await deleteReadingSession(student.id, deletingSession.id);
      
      setSnackbarMessage('Session deleted successfully');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      setDeletingSession(null);
    } catch (error) {
      setSnackbarMessage(`Error deleting session: ${error.message}`);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // Handle student delete click
  const handleStudentDeleteClick = () => {
    setDeletingStudent(true);
  };

  // Handle student delete confirm
  const handleStudentDeleteConfirm = async () => {
    try {
      await deleteStudent(student.id);
      
      setSnackbarMessage('Student deleted successfully');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      setDeletingStudent(false);
      onClose(); // Close the modal after successful deletion
    } catch (error) {
      setSnackbarMessage(`Error deleting student: ${error.message}`);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      setDeletingStudent(false);
    }
  };

  // Handle snackbar close
  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  // Handle class change
  const handleClassChange = async (event) => {
    const newClassId = event.target.value;
    setSelectedClassId(newClassId); // Update local state immediately
    try {
      await updateStudentClassId(student.id, newClassId);
      setSnackbarMessage('Student class updated successfully');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error) {
      setSnackbarMessage(`Error updating class: ${error.message}`);
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      // Optionally revert local state if needed, though AppContext handles backend failure revert
      // setSelectedClassId(student.classId || 'unassigned');
    }
  };

  // Sort sessions by date (newest first)
  const sortedSessions = student?.readingSessions
    ? [...student.readingSessions].sort((a, b) => new Date(b.date) - new Date(a.date))
    : [];

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        fullScreen={fullScreen}
        maxWidth={fullScreen ? 'xs' : 'md'}
      >
        <DialogTitle sx={{ m: 0, p: 2 }}> {/* Adjust padding */}
          <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1, sm: 0 } }}>
            {/* Left side: Name and Class Selector */}
            <Box display="flex" alignItems="center" gap={2} sx={{ width: '100%', justifyContent: 'flex-start' }}>
              <Typography variant="h6" component="div" sx={{ wordBreak: 'break-word' }}>
                {student?.name}
              </Typography>
              {/* Class Selector */}
              <FormControl size="small" sx={{ minWidth: 180, width: { xs: '100%', sm: 'auto' } }}>
                <InputLabel id="student-class-select-label">Class</InputLabel>
                <Select
                  labelId="student-class-select-label"
                  id="student-class-select"
                  value={selectedClassId}
                  label="Class"
                  onChange={handleClassChange}
                  disabled={!student} // Disable if no student data
                >
                  <MenuItem value="unassigned">
                    <em>Unassigned</em>
                  </MenuItem>
                  {classes.map((cls) => (
                    <MenuItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            {/* Right side: Delete and Close Buttons */}
            <Box display="flex" alignItems="center" gap={1} sx={{ mt: { xs: 1, sm: 0 } }}>
              <IconButton
                edge="end"
                color="error"
                onClick={handleStudentDeleteClick}
                aria-label="delete student"
                title="Delete Student"
              >
                <DeleteIcon />
              </IconButton>
              <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
                <CloseIcon />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ pb: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          {sortedSessions.length > 0 ? (
            <Grid container spacing={2}>
              {sortedSessions.map((session) => (
                <Grid size={12} key={session.id}>
                  <Card variant="outlined">
                    <CardContent>
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Box>
                          <Typography variant="subtitle1" gutterBottom>
                            {formatDate(session.date)}
                          </Typography>
                          <Typography 
                            variant="body1" 
                            color={getAssessmentColor(session.assessment)}
                            sx={{ fontWeight: 'medium', mb: 1 }}
                          >
                            {formatAssessment(session.assessment)}
                          </Typography>
                          {session.notes && (
                            <Typography variant="body2" color="text.secondary">
                              {session.notes}
                            </Typography>
                          )}
                        </Box>
                        <Box>
                          <IconButton
                            size="medium"
                            color="primary"
                            onClick={() => handleEditClick(session)}
                            aria-label="edit session"
                            sx={{ p: 1 }}
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            size="medium"
                            color="error"
                            onClick={() => handleDeleteClick(session)}
                            aria-label="delete session"
                            sx={{ p: 1 }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Typography variant="body1" color="text.secondary" align="center" sx={{ py: 4 }}>
              No reading sessions recorded for this student.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Session Dialog */}
      <Dialog open={!!editingSession} onClose={() => setEditingSession(null)} fullWidth maxWidth="sm" fullScreen={fullScreen}>
        <DialogTitle>Edit Reading Session</DialogTitle>
        <DialogContent sx={{ pb: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          <Box sx={{ pt: 1 }}>
            <TextField
              label="Date"
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              fullWidth
              margin="normal"
              InputLabelProps={{
                shrink: true,
              }}
            />
            
            <FormControl fullWidth margin="normal">
              <InputLabel id="edit-assessment-label">Assessment</InputLabel>
              <Select
                labelId="edit-assessment-label"
                value={editAssessment}
                label="Assessment"
                onChange={(e) => setEditAssessment(e.target.value)}
              >
                <MenuItem value="struggling">Struggling</MenuItem>
                <MenuItem value="needs-help">Needs Help</MenuItem>
                <MenuItem value="independent">Independent</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              label="Notes"
              multiline
              rows={3}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              fullWidth
              margin="normal"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
          <Button onClick={() => setEditingSession(null)}>Cancel</Button>
          <Button onClick={handleEditSave} variant="contained" color="primary">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Session Dialog */}
      <Dialog open={!!deletingSession} onClose={() => setDeletingSession(null)} fullWidth maxWidth="sm" fullScreen={fullScreen}>
        <DialogTitle>Delete Reading Session</DialogTitle>
        <DialogContent sx={{ pb: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          <Typography>
            Are you sure you want to delete this reading session from {formatDate(deletingSession?.date)}? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
          <Button onClick={() => setDeletingSession(null)}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Student Dialog */}
      <Dialog open={deletingStudent} onClose={() => setDeletingStudent(false)} fullWidth maxWidth="sm" fullScreen={fullScreen}>
        <DialogTitle>Delete Student</DialogTitle>
        <DialogContent sx={{ pb: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          <Typography>
            Are you sure you want to delete {student?.name}? This will also delete all their reading sessions and this action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
          <Button onClick={() => setDeletingStudent(false)}>Cancel</Button>
          <Button onClick={handleStudentDeleteConfirm} color="error">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbarSeverity} sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
};

export default StudentSessions;