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
  FormLabel,
  Chip
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import DownloadIcon from '@mui/icons-material/Download';
import { useAppContext } from '../../contexts/AppContext';
import AssessmentSelector from './AssessmentSelector';
import SessionNotes from './SessionNotes';
import BookAutocomplete from './BookAutocomplete';
import StudentInfoCard from './StudentInfoCard';
import {
  getBookDetails,
  checkAvailability,
  getProviderDisplayName,
  validateProviderConfig
} from '../../utils/bookMetadataApi';

const SessionForm = () => {
  const { students, addReadingSession, classes, recentlyAccessedStudents, books, globalClassFilter, settings, updateBook } = useAppContext();

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
  const [bookGenres, setBookGenres] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('school');
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  const handleBookChange = (book) => {
    const bookId = book ? book.id : '';
    setSelectedBookId(bookId);

    if (book) {
      setBookAuthor(book.author || '');
      setBookReadingLevel(book.readingLevel || '');
      setBookAgeRange(book.ageRange || '');
      setBookGenres(book.genreIds || []);
    } else {
      setBookAuthor('');
      setBookReadingLevel('');
      setBookAgeRange('');
      setBookGenres([]);
    }

    setIsCreatingBook(false);
  };

  const handleBookCreationStart = () => {
    setIsCreatingBook(true);
  };

  const handleGetBookDetails = async () => {
    // Get the current book title from the books array or use form values
    const currentBook = books.find(b => b.id === selectedBookId);
    const title = currentBook?.title || '';
    
    if (!title) {
      setSnackbarOpen(true);
      setError('Please select or create a book first');
      return;
    }

    // Validate provider configuration
    const configValidation = validateProviderConfig(settings);
    if (!configValidation.valid) {
      setSnackbarOpen(true);
      setError(configValidation.error);
      return;
    }

    setIsFetchingDetails(true);
    const providerName = getProviderDisplayName(settings);
    
    // Check provider availability first with a quick timeout
    const isAvailable = await checkAvailability(settings, 3000);
    if (!isAvailable) {
      setIsFetchingDetails(false);
      setSnackbarOpen(true);
      setError(`${providerName} is currently unavailable. Please try again later.`);
      return;
    }
    
    try {
      const author = bookAuthor || null;
      const details = await getBookDetails(title, author, settings);
      
      if (details) {
        // Update form fields with fetched details
        if (details.author) {
          setBookAuthor(details.author);
        }
        
        setSnackbarOpen(true);
        setError(''); // Clear any previous errors
      } else {
        setSnackbarOpen(true);
        setError(`No details found for this book on ${providerName}`);
      }
    } catch (err) {
      console.error('Error fetching book details:', err);
      setSnackbarOpen(true);
      setError(`Failed to fetch details: ${err.message}`);
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const handleUpdateBookWithDetails = async () => {
    if (!selectedBookId) {
      setSnackbarOpen(true);
      setError('Please select a book first');
      return;
    }

    try {
      // Use context's updateBook function which handles both API call and state update
      const result = await updateBook(selectedBookId, {
        author: bookAuthor.trim() || null,
        readingLevel: bookReadingLevel.trim() || null,
        ageRange: bookAgeRange.trim() || null,
        genreIds: bookGenres,
      });

      if (result) {
        setSnackbarOpen(true);
        setError('');
      } else {
        setSnackbarOpen(true);
        setError('Failed to update book');
      }
    } catch (err) {
      console.error('Failed to update book from SessionForm:', err);
      setSnackbarOpen(true);
      setError('Failed to update book');
    }
  };

  const handleStudentChange = (event) => {
    const studentId = event.target.value;
    setSelectedStudentId(studentId);
    setError('');

    // Pre-select the student's current book if they have one
    const student = students.find(s => s.id === studentId);
    if (student?.currentBookId) {
      const book = books.find(b => b.id === student.currentBookId);
      if (book) {
        handleBookChange(book);
      } else {
        // Book reference is stale - clear selection
        handleBookChange(null);
      }
    } else {
      // Clear book selection if student has no current book
      handleBookChange(null);
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
    setBookGenres([]);
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

  // Get available genres from context
  const { genres } = useAppContext();

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Typography variant="h4" component="h1" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#4A4A4A' }}>
          Record Reading Session
        </Typography>
        <TextField
          type="date"
          value={date}
          onChange={handleDateChange}
          size="small"
          InputProps={{
            sx: {
              borderRadius: 3,
              backgroundColor: '#EFEBF5',
              boxShadow: 'inset 2px 2px 4px #d9d4e3, inset -2px -2px 4px #ffffff',
              '& fieldset': { border: 'none' },
              '&.Mui-focused': { backgroundColor: '#ffffff', boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.2)' },
              minWidth: 150
            }
          }}
        />
      </Box>
      <Paper sx={{
          p: 4,
          pb: 'calc(env(safe-area-inset-bottom) + 24px)',
          background: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(20px)',
          borderRadius: 6,
          boxShadow: '16px 16px 32px rgba(139, 115, 85, 0.2), -10px -10px 24px rgba(255, 255, 255, 0.9), inset 6px 6px 12px rgba(107, 142, 107, 0.03), inset -6px -6px 12px rgba(255, 255, 255, 1)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
        }}>
          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 4 }}>
              {error}
            </Alert>
          )}
          
          <form onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              {/* Student Selection Row - Two Columns */}
              <Grid container item size={12} spacing={3}>
                {/* Left column: Student dropdown */}
                <Grid size={{ xs: 12, md: 6 }}>
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
                        '&.Mui-focused': { backgroundColor: '#ffffff', boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.2)' },
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
                                  <StarIcon sx={{ mr: 1, color: '#F59E0B', fontSize: '1rem' }} />
                                )}
                                <Typography variant="inherit" sx={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 500 }}>
                                  {student.name}
                                </Typography>
                                {isRecentlyAccessed && (
                                  <Typography variant="caption" sx={{ ml: 'auto', color: '#7A7A7A', fontStyle: 'italic' }}>
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

                {/* Right column: Student Info Card (only shown when student selected) */}
                <Grid size={{ xs: 12, md: 6 }}>
                  {selectedStudent && (
                    <StudentInfoCard student={selectedStudent} />
                  )}
                </Grid>
              </Grid>

              {/* Book and Location - Two Columns */}
              <Grid container item size={12} spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Box sx={{ mb: 1 }}>
                    {/* Book selection with autocomplete */}
                    <BookAutocomplete
                      value={books.find(book => book.id === selectedBookId) || null}
                      onChange={handleBookChange}
                      onBookCreated={handleBookChange}
                      onBookCreationStart={handleBookCreationStart}
                    />
                  </Box>
                  {/* Location Radio Buttons */}
                  <FormControl component="fieldset" sx={{
                    width: '100%',
                    p: 2,
                    borderRadius: 4,
                    border: '1px solid rgba(0,0,0,0.05)',
                    backgroundColor: 'rgba(255,255,255,0.3)'
                  }}>
                    <FormLabel component="legend" sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: '#4A4A4A', mb: 1 }}>Location</FormLabel>
                    <RadioGroup
                      aria-label="location"
                      value={selectedLocation}
                      onChange={handleLocationChange}
                      row
                    >
                      <FormControlLabel value="school" control={<Radio sx={{ color: '#6B8E6B', '&.Mui-checked': { color: '#6B8E6B' } }} />} label="School" />
                      <FormControlLabel value="home" control={<Radio sx={{ color: '#6B8E6B', '&.Mui-checked': { color: '#6B8E6B' } }} />} label="Home" />
                    </RadioGroup>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  {/* Editable selected book details with explicit Update button */}
                  {selectedBookId && (
                    <Box sx={{
                      p: 3,
                      borderRadius: 4,
                      backgroundColor: 'rgba(255,255,255,0.5)',
                      border: '1px solid rgba(255,255,255,0.6)',
                      boxShadow: 'inset 2px 2px 4px rgba(139, 115, 85, 0.1), inset -2px -2px 4px rgba(255, 255, 255, 0.8)',
                      height: '100%'
                    }}>
                      <Typography variant="subtitle2" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: '#4A4A4A' }}>
                        Selected Book Details
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid size={12}>
                          <TextField
                            label="Author"
                            value={bookAuthor}
                            onChange={(e) => setBookAuthor(e.target.value)}
                            fullWidth
                            size="small"
                            InputProps={{ sx: { borderRadius: 3, backgroundColor: '#fff' } }}
                          />
                        </Grid>
                        <Grid size={12}>
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
                        <Grid size={12}>
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
                        <Grid size={12}>
                          <FormControl fullWidth size="small">
                            <InputLabel id="genre-select-label">Genres</InputLabel>
                            <Select
                              labelId="genre-select-label"
                              multiple
                              value={bookGenres}
                              onChange={(e) => setBookGenres(e.target.value)}
                              label="Genres"
                              renderValue={(selected) => (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                  {selected.map((value) => {
                                    const genre = genres.find(g => g.id === value);
                                    return (
                                      <Chip
                                        key={value}
                                        label={genre?.name || value}
                                        size="small"
                                        sx={{ borderRadius: 1 }}
                                      />
                                    );
                                  })}
                                </Box>
                              )}
                              sx={{ borderRadius: 3, backgroundColor: '#fff' }}
                            >
                              {genres.map((genre) => (
                                <MenuItem key={genre.id} value={genre.id}>
                                  {genre.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>
                      </Grid>
                      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                        <Box>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => {
                              const current = books.find(b => b.id === selectedBookId);
                              setBookAuthor(current?.author || '');
                              setBookReadingLevel(current?.readingLevel || '');
                              setBookAgeRange(current?.ageRange || '');
                              setBookGenres(current?.genreIds || []);
                            }}
                            sx={{ borderRadius: 3, fontWeight: 600 }}
                          >
                            Reset
                          </Button>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={handleGetBookDetails}
                            disabled={isFetchingDetails}
                            startIcon={<DownloadIcon />}
                            sx={{ borderRadius: 3, fontWeight: 600 }}
                          >
                            {isFetchingDetails ? 'Fetching...' : 'Get Details'}
                          </Button>
                          <Button
                            variant="contained"
                            size="small"
                            color="primary"
                            onClick={handleUpdateBookWithDetails}
                            sx={{
                              borderRadius: 3,
                              fontWeight: 600,
                              background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
                              boxShadow: '4px 4px 8px rgba(107, 142, 107, 0.3)'
                            }}
                          >
                            Update Book
                          </Button>
                        </Box>
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontStyle: 'italic' }}>
                        Use "Get Details" to fetch author info from external APIs, then "Update Book" to save changes.
                      </Typography>
                    </Box>
                  )}
                </Grid>
              </Grid>

              {/* Assessment and Notes - Two Columns */}
              <Grid container item size={12} spacing={3}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="subtitle1" gutterBottom sx={{ mb: 1, fontFamily: '"Nunito", sans-serif', fontWeight: 700, color: '#4A4A4A' }}>
                    Assessment:
                  </Typography>
                  <AssessmentSelector
                    value={assessment}
                    onChange={handleAssessmentChange}
                    direction="column"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <SessionNotes
                    value={notes}
                    onChange={handleNotesChange}
                  />
                </Grid>
              </Grid>
              
              <Grid size={12}>
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
                    background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
                    boxShadow: '12px 12px 24px rgba(107, 142, 107, 0.3), -8px -8px 16px rgba(255, 255, 255, 0.4), inset 4px 4px 8px rgba(255, 255, 255, 0.4), inset -4px -4px 8px rgba(0, 0, 0, 0.1)',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    textTransform: 'none',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '16px 16px 32px rgba(107, 142, 107, 0.4), -10px -10px 20px rgba(255, 255, 255, 0.5)',
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
              <Typography variant="h5" gutterBottom sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: '#4A4A4A' }}>
                Previous Sessions for {selectedStudent.name}
              </Typography>
              
              {selectedStudent.readingSessions.length > 0 ? (
                <>
                  <Grid container spacing={2}>
                    {[...selectedStudent.readingSessions]
                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                      .slice(0, 3)
                      .map((session) => (
                        <Grid size={12} key={session.id}>
                          <Card
                            elevation={0}
                            sx={{
                              borderRadius: 4,
                              backgroundColor: 'rgba(255,255,255,0.5)',
                              border: '1px solid rgba(255,255,255,0.6)',
                              boxShadow: '4px 4px 10px rgba(139, 115, 85, 0.1)'
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
                              
                              <Typography variant="body1" sx={{ mt: 1, fontWeight: 700, color: '#4A4A4A' }}>
                                {session.assessment.charAt(0).toUpperCase() + session.assessment.slice(1)}
                              </Typography>

                              {/* Book Information */}
                              {session.bookId ? (
                                <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'rgba(255,255,255,0.6)', borderRadius: 3 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#6B8E6B' }}>
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
                                <Box sx={{ mt: 2, p: 1.5, bgcolor: '#F5F0E8', borderRadius: 3 }}>
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