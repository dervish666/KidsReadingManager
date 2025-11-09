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
    return book
      ? {
          title: book.title,
          author: book.author || '',
          readingLevel: book.readingLevel || '',
          ageRange: book.ageRange || ''
        }
      : {
          title: '',
          author: '',
          readingLevel: '',
          ageRange: ''
        };
  };
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState(''); // Added for class filtering
  const [assessment, setAssessment] = useState('independent');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [mode, setMode] = useState('standard');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [error, setError] = useState('');
  const [selectedBookId, setSelectedBookId] = useState(''); // <-- ADDED for book tracking
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookReadingLevel, setBookReadingLevel] = useState('');
  const [bookAgeRange, setBookAgeRange] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('school'); // <-- ADDED for location tracking
  const [isCreatingBook, setIsCreatingBook] = useState(false); // <-- ADDED to track book creation state

  const handleBookChange = (book) => {
    const bookId = book ? book.id : '';
    setSelectedBookId(bookId);

    if (book) {
      setBookAuthor(book.author || '');
      setBookReadingLevel(book.readingLevel || '');
      setBookAgeRange(book.ageRange || '');
    } else {
      setBookAuthor('');
      setBookReadingLevel('');
      setBookAgeRange('');
    }

    setIsCreatingBook(false); // Reset book creation state when book selection completes
  };

  const handleBookCreationStart = () => {
    setIsCreatingBook(true); // Set book creation state when book creation starts
  };

  const handleStudentChange = (event) => {
    setSelectedStudentId(event.target.value);
    setError('');
  };

  const handleClassChange = (event) => { // Added for class selection
    const newClassId = event.target.value;
    setSelectedClassId(newClassId);
    // Reset student selection when class changes
    if (selectedStudentId) {
      setSelectedStudentId('');
    }
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

    if (isCreatingBook) {
      setError('Please wait for book creation to complete');
      return;
    }

    addReadingSession(selectedStudentId, {
      date,
      assessment,
      notes,
      bookId: selectedBookId || null, // <-- ADDED for book tracking
      location: selectedLocation || 'school' // <-- ADDED for location tracking
      // Note: Book details (author/readingLevel/ageRange) are edited here for the selected book,
      // but persisted via BookManager / book APIs, not directly as part of the session.
    });

    // Reset form
    setNotes('');
    setAssessment('independent');
    setSelectedBookId(''); // <-- Reset book selection to empty string for consistency
    setBookAuthor('');
    setBookReadingLevel('');
    setBookAgeRange('');
    setSelectedLocation('school'); // <-- Reset location
    setSnackbarOpen(true);
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  // Get IDs of disabled classes
  const disabledClassIds = classes.filter(cls => cls.disabled).map(cls => cls.id);

  // Filter out students from disabled classes
  let filteredStudents = students.filter(student => {
    return !student.classId || !disabledClassIds.includes(student.classId);
  });

  // Additional filtering by selected class
  if (selectedClassId) {
    filteredStudents = filteredStudents.filter(student => student.classId === selectedClassId);
  }

  // Get active classes for the dropdown (only non-disabled classes)
  const activeClasses = classes.filter(cls => !cls.disabled);

  // Separate recently accessed students within the filtered list
  const recentStudents = filteredStudents.filter(student =>
    recentlyAccessedStudents.includes(student.id)
  );
  const otherStudents = filteredStudents.filter(student =>
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
              {/* Class Filter Dropdown */}
              <Grid sx={{ mb: 2 }} size={12}>
                <FormControl fullWidth>
                  <InputLabel id="class-filter-label">Filter by Class (Optional)</InputLabel>
                  <Select
                    labelId="class-filter-label"
                    id="class-filter"
                    value={selectedClassId}
                    label="Filter by Class (Optional)"
                    onChange={handleClassChange}
                  >
                    <MenuItem value="">
                      <em>All Classes</em>
                    </MenuItem>
                    {activeClasses.map((cls) => (
                      <MenuItem key={cls.id} value={cls.id}>
                        {cls.name} {cls.teacherName && `(${cls.teacherName})`}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Student Dropdown */}
              <Grid sx={{ mb: 3 }} size={12}>
                <FormControl fullWidth>
                  <InputLabel id="student-select-label">Student</InputLabel>
                  <Select
                    labelId="student-select-label"
                    id="student-select"
                    value={selectedStudentId}
                    label="Student"
                    onChange={handleStudentChange}
                  >
                    {sortedStudents.length === 0 ? (
                      <MenuItem disabled>
                        <Typography variant="body2" color="text.secondary">
                          {selectedClassId ? 'No students found in this class' : 'No active students available'}
                        </Typography>
                      </MenuItem>
                    ) : (
                      sortedStudents.map((student) => {
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
                      })
                    )}
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

              <Grid size={12} sx={{ mb: 3 }}>
                {/* Book selection with autocomplete */}
                <BookAutocomplete
                  value={books.find(book => book.id === selectedBookId) || null}
                  onChange={handleBookChange}
                  onBookCreated={handleBookChange}
                  onBookCreationStart={handleBookCreationStart}
                />

                {/* Editable selected book details with explicit Update button */}
                {selectedBookId && (
                  <Box sx={{ mt: 2, p: 2, borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Selected Book Details
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="Author"
                          value={bookAuthor}
                          onChange={(e) => setBookAuthor(e.target.value)}
                          fullWidth
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="Reading Level"
                          value={bookReadingLevel}
                          onChange={(e) => setBookReadingLevel(e.target.value)}
                          fullWidth
                          size="small"
                          placeholder="e.g. Blue, Level 4"
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <TextField
                          label="Age Range"
                          value={bookAgeRange}
                          onChange={(e) => setBookAgeRange(e.target.value)}
                          fullWidth
                          size="small"
                          placeholder="e.g. 6-8"
                        />
                      </Grid>
                    </Grid>
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          // Reset inline edits back to the current stored book values
                          const current = books.find(b => b.id === selectedBookId);
                          setBookAuthor(current?.author || '');
                          setBookReadingLevel(current?.readingLevel || '');
                          setBookAgeRange(current?.ageRange || '');
                        }}
                      >
                        Reset
                      </Button>
                      <Button
                        variant="contained"
                        size="small"
                        color="primary"
                        onClick={async () => {
                          const current = books.find(b => b.id === selectedBookId);
                          if (!current) return;

                          const updated = {
                            ...current,
                            author: bookAuthor.trim() || null,
                            readingLevel: bookReadingLevel.trim() || null,
                            ageRange: bookAgeRange.trim() || null,
                          };

                          try {
                            const response = await fetch(`/api/books/${selectedBookId}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(updated),
                            });

                            if (!response.ok) {
                              throw new Error(`API error: ${response.status}`);
                            }

                            // Refresh books via context helper if available
                            // Fallback: update local books array in place for immediate feedback
                            const saved = await response.json().catch(() => updated);
                            const idx = books.findIndex(b => b.id === selectedBookId);
                            if (idx !== -1) {
                              // Note: direct state setter is in AppContext; here we rely on reloadDataFromServer pattern.
                              // To avoid breaking architecture, we trigger a full reload through a lightweight call
                              // if you later expose reloadDataFromServer on context this can be wired directly.
                              books[idx] = saved;
                            }
                          } catch (err) {
                            console.error('Failed to update book from SessionForm:', err);
                          }
                        }}
                      >
                        Update Book
                      </Button>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                      Adjust these details and click "Update Book" to save them to the book record.
                    </Typography>
                  </Box>
                )}
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