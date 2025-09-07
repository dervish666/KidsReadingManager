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
  CardContent,
  RadioGroup,
  Radio,
  FormControlLabel,
  FormLabel
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import { useAppContext } from '../../contexts/AppContext';
import AssessmentSelector from './AssessmentSelector';
import SessionNotes from './SessionNotes';
import QuickEntry from './QuickEntry';
import BookAutocomplete from './BookAutocomplete';

const SessionForm = () => {
  const { students, addReadingSession, classes, recentlyAccessedStudents, books } = useAppContext(); // <-- ADDED books

  // Helper function to get book display info
  const getBookInfo = (bookId) => {
    if (!bookId) return null;
    const book = books.find(b => b.id === bookId);
    return book ? {
      title: book.title,
      author: book.author || 'Unknown Author'
    } : { title: 'Unknown Book', author: '' };
  };
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [assessment, setAssessment] = useState('independent');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [mode, setMode] = useState('standard');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [error, setError] = useState('');
  const [selectedBookId, setSelectedBookId] = useState(''); // <-- ADDED for book tracking
  const [selectedLocation, setSelectedLocation] = useState('school'); // <-- ADDED for location tracking

  const handleBookChange = (book) => {
    const bookId = book ? book.id : '';
    setSelectedBookId(bookId);
  };

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


  const handleLocationChange = (event) => { // <-- ADDED for location selection
    setSelectedLocation(event.target.value);
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
      notes,
      bookId: selectedBookId || null, // <-- ADDED for book tracking
      location: selectedLocation || 'school' // <-- ADDED for location tracking
    });

    // Reset form
    setNotes('');
    setAssessment('independent');
    setSelectedBookId(''); // <-- Reset book selection to empty string for consistency
    setSelectedLocation('school'); // <-- Reset location
    setSnackbarOpen(true);
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  // Get IDs of disabled classes
  const disabledClassIds = classes.filter(cls => cls.disabled).map(cls => cls.id);

  // Filter out students from disabled classes
  const activeStudents = students.filter(student => {
    return !student.classId || !disabledClassIds.includes(student.classId);
  });

  // Separate recently accessed students for display at top of dropdown
  const recentStudents = activeStudents.filter(student =>
    recentlyAccessedStudents.includes(student.id)
  );
  const otherStudents = activeStudents.filter(student =>
    !recentlyAccessedStudents.includes(student.id)
  );

  // Combine with recently accessed students at the top
  const sortedStudents = [...recentStudents, ...otherStudents];

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
          sx={{
            mb: 3,
            display: 'flex',
            width: '100%',
            '& .MuiToggleButton-root': { flex: 1, minWidth: 0 }
          }}
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
        <Paper sx={{ p: 3, pb: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
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
                    {sortedStudents.map((student) => {
                      const isRecentlyAccessed = recentlyAccessedStudents.includes(student.id);
                      return (
                        <MenuItem key={student.id} value={student.id}>
                          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                            {isRecentlyAccessed && (
                              <StarIcon
                                sx={{
                                  mr: 1,
                                  color: 'warning.main',
                                  fontSize: '1rem'
                                }}
                              />
                            )}
                            <Typography variant="inherit">
                              {student.name}
                            </Typography>
                            {isRecentlyAccessed && (
                              <Typography
                                variant="caption"
                                sx={{
                                  ml: 'auto',
                                  color: 'text.secondary',
                                  fontStyle: 'italic'
                                }}
                              >
                                Recent
                              </Typography>
                            )}
                          </Box>
                        </MenuItem>
                      );
                    })}
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

              <Grid size={12} sx={{ mb: 3 }}> {/* Book selection with autocomplete */}
                <BookAutocomplete
                  value={books.find(book => book.id === selectedBookId) || null}
                  onChange={handleBookChange}
                />
              </Grid>

              <Grid size={12} sx={{ mb: 3 }}> {/* ADDED - Location selection */}
                <FormControl component="fieldset">
                  <FormLabel component="legend">Location</FormLabel>
                  <RadioGroup
                    aria-label="location"
                    value={selectedLocation}
                    onChange={handleLocationChange}
                    row
                  >
                    <FormControlLabel value="school" control={<Radio />} label="School" />
                    <FormControlLabel value="home" control={<Radio />} label="Home" />
                  </RadioGroup>
                </FormControl>
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
                  sx={{ mb: { xs: 2, sm: 0 } }}
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
                              <Typography variant="body1" sx={{ mt: 1, fontWeight: 'medium' }}>
                                {session.assessment.charAt(0).toUpperCase() + session.assessment.slice(1)}
                              </Typography>

                              {/* Book Information */}
                              {session.bookId ? (
                                <Box sx={{ mt: 1 }}>
                                  <Typography variant="body2" color="primary.main" sx={{ fontWeight: 'medium' }}>
                                    "{getBookInfo(session.bookId)?.title}"
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                                    by {getBookInfo(session.bookId)?.author}
                                  </Typography>
                                </Box>
                              ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                  No book specified
                                </Typography>
                              )}

                              {/* Location */}
                              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontSize: '0.8rem' }}>
                                Location: {session.location === 'school' ? '🏫 School' : session.location === 'home' ? '🏠 Home' : 'Not specified'}
                              </Typography>

                              {/* Notes */}
                              {session.notes && (
                                <Box sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    <strong>Notes:</strong> {session.notes}
                                  </Typography>
                                </Box>
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