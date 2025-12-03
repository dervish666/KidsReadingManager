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
import BookAutocomplete from './BookAutocomplete';

const SessionForm = () => {
  const { students, addReadingSession, classes, recentlyAccessedStudents, books, fetchWithAuth, globalClassFilter } = useAppContext();

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
  const [assessment, setAssessment] = useState('independent');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [error, setError] = useState('');
  const [selectedBookId, setSelectedBookId] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookReadingLevel, setBookReadingLevel] = useState('');
  const [bookAgeRange, setBookAgeRange] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('school');
  const [isCreatingBook, setIsCreatingBook] = useState(false);

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

    setIsCreatingBook(false);
  };

  const handleBookCreationStart = () => {
    setIsCreatingBook(true);
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


  const handleLocationChange = (event) => {
    setSelectedLocation(event.target.value);
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
      bookId: selectedBookId || null,
      location: selectedLocation || 'school'
    });

    // Reset form
    setNotes('');
    setAssessment('independent');
    setSelectedBookId('');
    setBookAuthor('');
    setBookReadingLevel('');
    setBookAgeRange('');
    setSelectedLocation('school');
    setSnackbarOpen(true);
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  // Get IDs of disabled classes
  const disabledClassIds = classes.filter(cls => cls.disabled).map(cls => cls.id);

  // Filter students based on global class filter and disabled classes
  let filteredStudents = students.filter(student => {
    // First, filter by global class filter
    if (globalClassFilter && globalClassFilter !== 'all') {
      if (globalClassFilter === 'unassigned') {
        if (student.classId) return false;
      } else {
        if (student.classId !== globalClassFilter) return false;
      }
    }
    
    // Then, filter out students from disabled classes
    return !student.classId || !disabledClassIds.includes(student.classId);
  });

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
        <Typography variant="h4" component="h1" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#332F3A' }}>
          Record Reading Session
        </Typography>
      </Box>
      <Paper sx={{
          p: 4,
          pb: 'calc(env(safe-area-inset-bottom) + 24px)',
          background: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(20px)',
          borderRadius: 6,
          boxShadow: '16px 16px 32px rgba(160, 150, 180, 0.2), -10px -10px 24px rgba(255, 255, 255, 0.9), inset 6px 6px 12px rgba(139, 92, 246, 0.03), inset -6px -6px 12px rgba(255, 255, 255, 1)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
        }}>
          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 4 }}>
              {error}
            </Alert>
          )}
          
          <form onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              {/* Student Dropdown */}
              <Grid item xs={12} sx={{ mb: 1 }}>
                <FormControl fullWidth>
                  <InputLabel id="student-select-label" sx={{ fontFamily: '"DM Sans", sans-serif' }}>Student</InputLabel>
                  <Select
                    labelId="student-select-label"
                    id="student-select"
                    value={selectedStudentId}
                    label="Student"
                    onChange={handleStudentChange}
                    sx={{
                      borderRadius: 4,
                      backgroundColor: '#EFEBF5',
                      boxShadow: 'inset 4px 4px 8px #d9d4e3, inset -4px -4px 8px #ffffff',
                      '& fieldset': { border: 'none' },
                      '&.Mui-focused': { backgroundColor: '#ffffff', boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.2)' },
                    }}
                  >
                    {sortedStudents.length === 0 ? (
                        <MenuItem disabled>
                          <Typography variant="body2" color="text.secondary">
                            {globalClassFilter && globalClassFilter !== 'all' ? 'No students found in this class' : 'No active students available'}
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
                                    color: '#F59E0B',
                                    fontSize: '1rem'
                                  }}
                                />
                              )}
                              <Typography variant="inherit" sx={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 500 }}>
                                {student.name}
                              </Typography>
                              {isRecentlyAccessed && (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    ml: 'auto',
                                    color: '#635F69',
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
              
              <Grid item xs={12}>
                <TextField
                  label="Date"
                  type="date"
                  value={date}
                  onChange={handleDateChange}
                  fullWidth
                  InputLabelProps={{
                    shrink: true,
                    sx: { fontFamily: '"DM Sans", sans-serif' }
                  }}
                  InputProps={{
                    sx: {
                      borderRadius: 4,
                      backgroundColor: '#EFEBF5',
                      boxShadow: 'inset 4px 4px 8px #d9d4e3, inset -4px -4px 8px #ffffff',
                      '& fieldset': { border: 'none' },
                      '&.Mui-focused': { backgroundColor: '#ffffff', boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.2)' },
                      height: 56
                    }
                  }}
                />
              </Grid>

              <Grid item xs={12} sx={{ mb: 1 }}>
                {/* Book selection with autocomplete */}
                <BookAutocomplete
                  value={books.find(book => book.id === selectedBookId) || null}
                  onChange={handleBookChange}
                  onBookCreated={handleBookChange}
                  onBookCreationStart={handleBookCreationStart}
                />

                {/* Editable selected book details with explicit Update button */}
                {selectedBookId && (
                  <Box sx={{ 
                    mt: 3, 
                    p: 3, 
                    borderRadius: 4, 
                    backgroundColor: 'rgba(255,255,255,0.5)',
                    border: '1px solid rgba(255,255,255,0.6)',
                    boxShadow: 'inset 2px 2px 4px rgba(160, 150, 180, 0.1), inset -2px -2px 4px rgba(255, 255, 255, 0.8)'
                  }}>
                    <Typography variant="subtitle2" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: '#332F3A' }}>
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
                          InputProps={{ sx: { borderRadius: 3, backgroundColor: '#fff' } }}
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
                          InputProps={{ sx: { borderRadius: 3, backgroundColor: '#fff' } }}
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
                          InputProps={{ sx: { borderRadius: 3, backgroundColor: '#fff' } }}
                        />
                      </Grid>
                    </Grid>
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          const current = books.find(b => b.id === selectedBookId);
                          setBookAuthor(current?.author || '');
                          setBookReadingLevel(current?.readingLevel || '');
                          setBookAgeRange(current?.ageRange || '');
                        }}
                        sx={{ borderRadius: 3, fontWeight: 600 }}
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
                            const response = await fetchWithAuth(`/api/books/${selectedBookId}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(updated),
                            });

                            if (!response.ok) {
                              throw new Error(`API error: ${response.status}`);
                            }

                            const saved = await response.json().catch(() => updated);
                            const idx = books.findIndex(b => b.id === selectedBookId);
                            if (idx !== -1) {
                              books[idx] = saved;
                            }
                          } catch (err) {
                            console.error('Failed to update book from SessionForm:', err);
                          }
                        }}
                        sx={{ 
                          borderRadius: 3, 
                          fontWeight: 600,
                          background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)',
                          boxShadow: '4px 4px 8px rgba(139, 92, 246, 0.3)'
                        }}
                      >
                        Update Book
                      </Button>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontStyle: 'italic' }}>
                      Adjust these details and click "Update Book" to save them to the book record.
                    </Typography>
                  </Box>
                )}
              </Grid>

              <Grid item xs={12} sx={{ mb: 1 }}>
                <FormControl component="fieldset" sx={{ 
                  width: '100%', 
                  p: 2, 
                  borderRadius: 4, 
                  border: '1px solid rgba(0,0,0,0.05)',
                  backgroundColor: 'rgba(255,255,255,0.3)'
                }}>
                  <FormLabel component="legend" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: '#332F3A', mb: 1 }}>Location</FormLabel>
                  <RadioGroup
                    aria-label="location"
                    value={selectedLocation}
                    onChange={handleLocationChange}
                    row
                  >
                    <FormControlLabel value="school" control={<Radio sx={{ color: '#7C3AED', '&.Mui-checked': { color: '#7C3AED' } }} />} label="School" />
                    <FormControlLabel value="home" control={<Radio sx={{ color: '#7C3AED', '&.Mui-checked': { color: '#7C3AED' } }} />} label="Home" />
                  </RadioGroup>
                </FormControl>
              </Grid>

              <Grid item xs={12} sx={{ mb: 1 }}>
                <Typography variant="subtitle1" gutterBottom sx={{ mb: 1, fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: '#332F3A' }}>
                  Assessment:
                </Typography>
                <AssessmentSelector
                  value={assessment}
                  onChange={handleAssessmentChange}
                />
              </Grid>
              
              <Grid item xs={12} sx={{ mb: 3 }}>
                <SessionNotes
                  value={notes}
                  onChange={handleNotesChange}
                />
              </Grid>
              
              <Grid item xs={12}>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  fullWidth
                  size="large"
                  sx={{ 
                    mb: { xs: 2, sm: 0 },
                    height: 56,
                    borderRadius: 4,
                    background: 'linear-gradient(135deg, #A78BFA 0%, #7C3AED 100%)',
                    boxShadow: '12px 12px 24px rgba(139, 92, 246, 0.3), -8px -8px 16px rgba(255, 255, 255, 0.4), inset 4px 4px 8px rgba(255, 255, 255, 0.4), inset -4px -4px 8px rgba(0, 0, 0, 0.1)',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    textTransform: 'none',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '16px 16px 32px rgba(139, 92, 246, 0.4), -10px -10px 20px rgba(255, 255, 255, 0.5)',
                    },
                    '&:active': {
                      transform: 'scale(0.96)',
                    },
                  }}
                >
                  Save Reading Session
                </Button>
              </Grid>
            </Grid>
          </form>
          
          {selectedStudent && (
            <Box sx={{ mt: 6 }}>
              <Divider sx={{ mb: 4, borderColor: 'rgba(0,0,0,0.05)' }} />
              <Typography variant="h5" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#332F3A' }}>
                Previous Sessions for {selectedStudent.name}
              </Typography>
              
              {selectedStudent.readingSessions.length > 0 ? (
                <>
                  <Grid container spacing={2}>
                    {[...selectedStudent.readingSessions]
                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                      .slice(0, 3)
                      .map((session) => (
                        <Grid item xs={12} key={session.id}>
                          <Card 
                            elevation={0}
                            sx={{ 
                              borderRadius: 4,
                              backgroundColor: 'rgba(255,255,255,0.5)',
                              border: '1px solid rgba(255,255,255,0.6)',
                              boxShadow: '4px 4px 10px rgba(160, 150, 180, 0.1)'
                            }}
                          >
                            <CardContent>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
                                  {new Date(session.date).toLocaleDateString('en-GB', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric'
                                  })}
                                </Typography>
                                <Typography variant="caption" sx={{ 
                                  bgcolor: session.location === 'home' ? '#DBEAFE' : '#F3E8FF', 
                                  color: session.location === 'home' ? '#1E40AF' : '#6B21A8',
                                  px: 1, 
                                  py: 0.5, 
                                  borderRadius: 2,
                                  fontWeight: 700
                                }}>
                                  {session.location === 'school' ? 'School' : session.location === 'home' ? 'Home' : 'Unknown'}
                                </Typography>
                              </Box>
                              
                              <Typography variant="body1" sx={{ mt: 1, fontWeight: 700, color: '#332F3A' }}>
                                {session.assessment.charAt(0).toUpperCase() + session.assessment.slice(1)}
                              </Typography>

                              {/* Book Information */}
                              {session.bookId ? (
                                <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.6)', borderRadius: 3 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#7C3AED' }}>
                                    "{getBookInfo(session.bookId)?.title}"
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                                    by {getBookInfo(session.bookId)?.author}
                                  </Typography>
                                </Box>
                              ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                                  No book specified
                                </Typography>
                              )}

                              {/* Notes */}
                              {session.notes && (
                                <Box sx={{ mt: 2, p: 1.5, bgcolor: '#F4F1FA', borderRadius: 3 }}>
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
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic', textAlign: 'center' }}>
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
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        message="Reading session saved successfully"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        ContentProps={{
          sx: {
            borderRadius: 4,
            bgcolor: '#10B981',
            color: '#fff',
            fontWeight: 600,
            boxShadow: '0 10px 20px rgba(16, 185, 129, 0.3)'
          }
        }}
      />
    </Box>
  );
};

export default SessionForm;