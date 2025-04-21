import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Paper,
  Divider,
  Alert,
  Snackbar,
  ToggleButtonGroup,
  ToggleButton,
  Card,
  CardContent
} from '@mui/material';
import { useAppContext } from '../../contexts/AppContext';
import AssessmentSelector from './AssessmentSelector';
import SessionNotes from './SessionNotes';
import QuickEntry from './QuickEntry';

const SessionForm = () => {
  const { students, addReadingSession } = useAppContext();
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [assessment, setAssessment] = useState('independent');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [mode, setMode] = useState('standard');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [error, setError] = useState('');

  const handleStudentChange = (event) => {
    setSelectedStudentId(event.target.value);
    setError('');
  };

  const handleAssessmentChange = (newAssessment) => {
    setAssessment(newAssessment);
  };

  const handleNotesChange = (event) => {
    setNotes(event.target.value);
  };

  const handleDateChange = (event) => {
    setDate(event.target.value);
  };

  const handleModeChange = (event, newMode) => {
    if (newMode !== null) {
      setMode(newMode);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    
    if (!selectedStudentId) {
      setError('Please select a student');
      return;
    }
    
    addReadingSession(selectedStudentId, {
      date,
      assessment,
      notes
    });
    
    // Reset form
    setNotes('');
    setAssessment('independent');
    setSnackbarOpen(true);
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" component="h1" gutterBottom>
          Record Reading Session
        </Typography>
        
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={handleModeChange}
          aria-label="session mode"
          sx={{ mb: 3 }}
        >
          <ToggleButton value="standard" aria-label="standard mode">
            Standard
          </ToggleButton>
          <ToggleButton value="quick" aria-label="quick entry mode">
            Quick Entry
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {mode === 'standard' ? (
        <Paper sx={{ p: 3 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}
          
          <form onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              <Grid sx={{ mb: 3 }} size={12}> {/* Use item prop, xs={12} and add margin bottom */}
                <FormControl fullWidth>
                  <InputLabel id="student-select-label">Student</InputLabel>
                  <Select
                    labelId="student-select-label"
                    id="student-select"
                    value={selectedStudentId}
                    label="Student"
                    onChange={handleStudentChange}
                  >
                    {students.map((student) => (
                      <MenuItem key={student.id} value={student.id}>
                        {student.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid size={12}> {/* Use item prop and xs={12}, remove Box wrapper */}
                <TextField
                  label="Date"
                  type="date"
                  value={date}
                  onChange={handleDateChange}
                  fullWidth
                  InputLabelProps={{
                    shrink: true,
                  }}
                  sx={{
                    '& .MuiInputBase-root': {
                      height: 56 // Ensure consistent height
                    }
                  }}
                />
              </Grid>
              
              <Grid sx={{ mb: 3 }} size={12}> {/* Correct Grid item and add margin */}
                <Typography variant="subtitle1" gutterBottom sx={{ mb: 1 }}> {/* Add margin bottom to title */}
                  Assessment:
                </Typography>
                <AssessmentSelector
                  value={assessment}
                  onChange={handleAssessmentChange}
                />
              </Grid>
              
              <Grid sx={{ mb: 3 }} size={12}> {/* Correct Grid item and add margin */}
                <SessionNotes
                  value={notes}
                  onChange={handleNotesChange}
                />
              </Grid>
              
              <Grid size={12}> {/* Correct Grid item */}
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  fullWidth
                  size="large"
                >
                  Save Reading Session
                </Button>
              </Grid>
            </Grid>
          </form>
          
          {selectedStudent && (
            <Box sx={{ mt: 4 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Previous Sessions for {selectedStudent.name}
              </Typography>
              
              {selectedStudent.readingSessions.length > 0 ? (
                <>
                  <Grid container spacing={2}>
                    {[...selectedStudent.readingSessions]
                      .sort((a, b) => new Date(b.date) - new Date(a.date)) // Sort by date, newest first
                      .slice(0, 3)
                      .map((session) => (
                        <Grid size={12} key={session.id}>
                          <Card variant="outlined">
                            <CardContent>
                              <Typography variant="subtitle2" color="text.secondary">
                                {new Date(session.date).toLocaleDateString('en-GB', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                })}
                              </Typography>
                              <Typography variant="body2" sx={{ mt: 1 }}>
                                Assessment: {session.assessment.charAt(0).toUpperCase() + session.assessment.slice(1)}
                              </Typography>
                              {session.notes && (
                                <Typography variant="body2" sx={{ mt: 1 }}>
                                  Notes: {session.notes}
                                </Typography>
                              )}
                            </CardContent>
                          </Card>
                        </Grid>
                      ))
                    }
                  </Grid>
                  {selectedStudent.readingSessions.length > 3 && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic' }}>
                      Showing 3 most recent sessions of {selectedStudent.readingSessions.length} total sessions.
                    </Typography>
                  )}
                </>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No previous reading sessions recorded.
                </Typography>
              )}
            </Box>
          )}
        </Paper>
      ) : (
        <QuickEntry />
      )}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        message="Reading session saved successfully"
      />
    </Box>
  );
};

export default SessionForm;