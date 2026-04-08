import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Alert,
  Snackbar,
  Chip,
  Popover,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import NotesIcon from '@mui/icons-material/Notes';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { useTour } from '../tour/useTour';
import TourButton from '../tour/TourButton';
import BookCover from '../BookCover';
import AssessmentSelector from './AssessmentSelector';
import SessionNotes from './SessionNotes';
import BookAutocomplete from './BookAutocomplete';
import StudentInfoCard from './StudentInfoCard';
import BadgeCelebration from '../badges/BadgeCelebration';
import {
  getBookDetails,
  checkAvailability,
  getProviderDisplayName,
  validateProviderConfig,
} from '../../utils/bookMetadataApi';

const SessionForm = () => {
  const { fetchWithAuth } = useAuth();
  const {
    students,
    addReadingSession,
    classes,
    books,
    settings,
    updateBook,
    fetchBookDetails,
    genres,
  } = useData();
  const { globalClassFilter, recentlyAccessedStudents } = useUI();
  const { tourButtonProps } = useTour('session-form');

  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [assessment, setAssessment] = useState(null);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('Reading session saved successfully');
  const [error, setError] = useState('');
  const [selectedBookId, setSelectedBookId] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookReadingLevel, setBookReadingLevel] = useState('');
  const [bookAgeRange, setBookAgeRange] = useState('');
  const [bookGenres, setBookGenres] = useState([]);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [bookEditAnchor, setBookEditAnchor] = useState(null);
  const bookEditOpen = Boolean(bookEditAnchor);
  const [notesAnchor, setNotesAnchor] = useState(null);
  const notesOpen = Boolean(notesAnchor);
  const [bookEnjoyment, setBookEnjoyment] = useState(null); // null | 'liked' | 'disliked'
  const [celebrationBadges, setCelebrationBadges] = useState([]);
  const [pendingGoalCelebration, setPendingGoalCelebration] = useState(null);
  const [completedGoals, setCompletedGoals] = useState([]);

  // Student reading history
  const [studentHistory, setStudentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const booksMap = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  // If there are no badges to show first, display goal celebration immediately
  useEffect(() => {
    if (pendingGoalCelebration && (!celebrationBadges || celebrationBadges.length === 0)) {
      setCompletedGoals(pendingGoalCelebration);
      setPendingGoalCelebration(null);
    }
  }, [pendingGoalCelebration, celebrationBadges]);

  useEffect(() => {
    if (!selectedStudentId) {
      setStudentHistory([]);
      return;
    }
    setHistoryLoading(true);
    fetchWithAuth(`/api/students/${selectedStudentId}/sessions`)
      .then((r) => (r.ok ? r.json() : []))
      .then((sessions) => {
        const real = sessions
          .filter(
            (s) =>
              !s.notes?.includes('[ABSENT]') &&
              !s.notes?.includes('[NO_RECORD]') &&
              !s.notes?.includes('[COUNT:')
          )
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        setStudentHistory(real);
        setHistoryLoading(false);
      })
      .catch(() => {
        setStudentHistory([]);
        setHistoryLoading(false);
      });
  }, [selectedStudentId, fetchWithAuth, historyRefresh]);

  const handleBookChange = async (book) => {
    const bookId = book ? book.id : '';
    setSelectedBookId(bookId);
    setBookEnjoyment(null);

    if (book) {
      setBookAuthor(book.author || '');
      // Set fields from what we have immediately
      setBookReadingLevel(book.readingLevel || '');
      setBookAgeRange(book.ageRange || '');
      setBookGenres(book.genreIds || []);
      // If minimal book (no readingLevel field), fetch full details
      if (!('readingLevel' in book)) {
        const fullBook = await fetchBookDetails(book.id);
        if (fullBook) {
          setBookAuthor(fullBook.author || '');
          setBookReadingLevel(fullBook.readingLevel || '');
          setBookAgeRange(fullBook.ageRange || '');
          setBookGenres(fullBook.genreIds || []);
        }
      }
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
    const title = selectedBook?.title || '';

    if (!title) {
      setError('Please select or create a book first');
      return;
    }

    // Validate provider configuration
    const configValidation = validateProviderConfig(settings);
    if (!configValidation.valid) {
      setError(configValidation.error);
      return;
    }

    setIsFetchingDetails(true);
    const providerName = getProviderDisplayName(settings);

    // Check provider availability first with a quick timeout
    const isAvailable = await checkAvailability(settings, 3000);
    if (!isAvailable) {
      setIsFetchingDetails(false);
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

        setSnackbarMessage('Book details fetched successfully');
        setSnackbarOpen(true);
        setError(''); // Clear any previous errors
      } else {
        setError(`No details found for this book on ${providerName}`);
      }
    } catch (err) {
      console.error('Error fetching book details:', err);
      setError(`Failed to fetch details: ${err.message}`);
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const handleUpdateBookWithDetails = async () => {
    if (!selectedBookId) {
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
        setSnackbarMessage('Book updated successfully');
        setSnackbarOpen(true);
        setError('');
      } else {
        setError('Failed to update book');
      }
    } catch (err) {
      console.error('Failed to update book from SessionForm:', err);
      setError('Failed to update book');
    }
  };

  const handleStudentChange = (event) => {
    const studentId = event.target.value;
    setSelectedStudentId(studentId);
    setError('');

    // Pre-select the student's current book if they have one
    const student = students.find((s) => s.id === studentId);
    if (student?.currentBookId) {
      const book = books.find((b) => b.id === student.currentBookId);
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

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedStudentId) {
      setError('Please select a student');
      return;
    }

    if (assessment === null) {
      setError('Please set a reading assessment');
      return;
    }

    if (isCreatingBook) {
      setError('Please wait for book creation to complete');
      return;
    }

    const result = await addReadingSession(selectedStudentId, {
      date,
      assessment,
      notes,
      bookId: selectedBookId || null,
      location: 'school',
    });

    if (result) {
      if (result?.newBadges?.length > 0) {
        setCelebrationBadges(result.newBadges);
      }
      if (result.completedGoals?.length) {
        setPendingGoalCelebration(result.completedGoals);
      }

      // Save book enjoyment feedback (non-blocking)
      if (bookEnjoyment && selectedBook?.title) {
        const student = students.find((s) => s.id === selectedStudentId);
        if (student) {
          const currentLikes = student.likes || [];
          const currentDislikes = student.dislikes || [];
          const title = selectedBook.title;
          const newLikes =
            bookEnjoyment === 'liked'
              ? [...new Set([...currentLikes, title])]
              : currentLikes.filter((t) => t !== title);
          const newDislikes =
            bookEnjoyment === 'disliked'
              ? [...new Set([...currentDislikes, title])]
              : currentDislikes.filter((t) => t !== title);
          fetchWithAuth(`/api/students/${selectedStudentId}/feedback`, {
            method: 'PUT',
            body: JSON.stringify({ likes: newLikes, dislikes: newDislikes }),
          }).catch(() => {});
        }
      }

      // Reset form only on success
      setNotes('');
      setAssessment(null);
      setSelectedBookId('');
      setBookAuthor('');
      setBookReadingLevel('');
      setBookAgeRange('');
      setBookGenres([]);
      setBookEnjoyment(null);
      setError('');
      setSnackbarMessage('Reading session saved successfully');
      setSnackbarOpen(true);
      setHistoryRefresh((c) => c + 1);
    } else {
      setError('Failed to save reading session. Please try again.');
    }
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  // Get IDs of disabled classes
  const disabledClassIds = classes.filter((cls) => cls.disabled).map((cls) => cls.id);

  // Filter students based on global class filter and disabled classes
  let filteredStudents = students.filter((student) => {
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
  const recentStudents = filteredStudents.filter((student) =>
    recentlyAccessedStudents.includes(student.id)
  );
  const otherStudents = filteredStudents.filter(
    (student) => !recentlyAccessedStudents.includes(student.id)
  );

  // Combine with recently accessed students at the top
  const sortedStudents = [...recentStudents, ...otherStudents];

  const selectedStudent = students.find((s) => s.id === selectedStudentId);
  const selectedBook = books.find((b) => b.id === selectedBookId);

  return (
    <Box>
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: 'text.primary' }}
        >
          Record Reading Session
        </Typography>
        <TextField
          type="date"
          value={date}
          onChange={handleDateChange}
          size="small"
          inputProps={{ 'aria-label': 'Session date' }}
          InputProps={{
            sx: {
              borderRadius: '10px',
              backgroundColor: '#FAF8F3',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.03)',
              border: '1px solid rgba(139, 115, 85, 0.12)',
              '& fieldset': { border: 'none' },
              '&:hover': { border: '1px solid rgba(107, 142, 107, 0.3)' },
              '&.Mui-focused': {
                backgroundColor: '#ffffff',
                border: '1px solid rgba(107, 142, 107, 0.5)',
                boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.12)',
              },
              minWidth: 150,
            },
          }}
        />
      </Box>
      <Paper
        sx={{
          p: 3,
          pb: 'calc(env(safe-area-inset-bottom) + 24px)',
          borderRadius: '16px',
        }}
      >
        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 4 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {/* Row 1: Student dropdown + Info chips inline */}
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <FormControl data-tour="session-student-select" sx={{ flex: 1, minWidth: 200 }}>
                <InputLabel id="student-select-label" sx={{ fontFamily: '"DM Sans", sans-serif' }}>
                  Student
                </InputLabel>
                <Select
                  labelId="student-select-label"
                  id="student-select"
                  value={selectedStudentId}
                  label="Student"
                  onChange={handleStudentChange}
                  sx={{
                    borderRadius: '10px',
                    backgroundColor: '#FAF8F3',
                    boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.03)',
                    border: '1px solid rgba(139, 115, 85, 0.12)',
                    '& fieldset': { border: 'none' },
                    '&:hover': { border: '1px solid rgba(107, 142, 107, 0.3)' },
                    '&.Mui-focused': {
                      backgroundColor: '#ffffff',
                      border: '1px solid rgba(107, 142, 107, 0.5)',
                      boxShadow: '0 0 0 3px rgba(107, 142, 107, 0.12)',
                    },
                  }}
                >
                  {sortedStudents.length === 0 ? (
                    <MenuItem disabled>
                      <Typography variant="body2" color="text.secondary">
                        {globalClassFilter && globalClassFilter !== 'all'
                          ? 'No students found in this class'
                          : 'No active students available'}
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
                                sx={{ mr: 1, color: 'status.needsAttention', fontSize: '1rem' }}
                              />
                            )}
                            <Typography
                              variant="inherit"
                              sx={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 500 }}
                            >
                              {student.name}
                            </Typography>
                            {isRecentlyAccessed && (
                              <Typography
                                variant="caption"
                                sx={{ ml: 'auto', color: 'text.secondary', fontStyle: 'italic' }}
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
              {selectedStudent && <StudentInfoCard student={selectedStudent} />}
            </Box>

            {/* Row 2: Book (compact display or BookAutocomplete + Popover) */}
            <Box data-tour="session-book-select">
              {selectedBookId ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <BookCover
                    title={selectedBook?.title || ''}
                    author={bookAuthor || null}
                    width={40}
                    height={60}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body1"
                      noWrap
                      sx={{ fontWeight: 600, color: 'text.primary' }}
                    >
                      {selectedBook?.title || ''}
                    </Typography>
                    {bookAuthor && (
                      <Typography variant="body2" color="text.secondary" noWrap>
                        by {bookAuthor}
                      </Typography>
                    )}
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleBookChange(null)}
                    sx={{ borderRadius: 3, flexShrink: 0 }}
                  >
                    Change
                  </Button>
                  <IconButton
                    size="small"
                    onClick={(e) => setBookEditAnchor(e.currentTarget)}
                    aria-label="Edit book details"
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <Popover
                    open={bookEditOpen}
                    anchorEl={bookEditAnchor}
                    onClose={() => setBookEditAnchor(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    slotProps={{
                      paper: { sx: { p: 3, borderRadius: 4, maxWidth: 420, width: '90vw' } },
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      gutterBottom
                      sx={{
                        fontFamily: '"Nunito", sans-serif',
                        fontWeight: 700,
                        color: 'text.primary',
                      }}
                    >
                      Edit Book Details
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <TextField
                        label="Author"
                        value={bookAuthor}
                        onChange={(e) => setBookAuthor(e.target.value)}
                        fullWidth
                        size="small"
                        InputProps={{
                          sx: { borderRadius: 3, backgroundColor: 'background.paper' },
                        }}
                      />
                      <TextField
                        label="Reading Level"
                        value={bookReadingLevel}
                        onChange={(e) => setBookReadingLevel(e.target.value)}
                        fullWidth
                        size="small"
                        placeholder="e.g. Blue, Level 4"
                        InputProps={{
                          sx: { borderRadius: 3, backgroundColor: 'background.paper' },
                        }}
                      />
                      <TextField
                        label="Age Range"
                        value={bookAgeRange}
                        onChange={(e) => setBookAgeRange(e.target.value)}
                        fullWidth
                        size="small"
                        placeholder="e.g. 6-8"
                        InputProps={{
                          sx: { borderRadius: 3, backgroundColor: 'background.paper' },
                        }}
                      />
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
                                const genre = genres.find((g) => g.id === value);
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
                          sx={{ borderRadius: 3, backgroundColor: 'background.paper' }}
                        >
                          {genres.map((genre) => (
                            <MenuItem key={genre.id} value={genre.id}>
                              {genre.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>
                    <Box
                      sx={{
                        mt: 2,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          setBookAuthor(selectedBook?.author || '');
                          setBookReadingLevel(selectedBook?.readingLevel || '');
                          setBookAgeRange(selectedBook?.ageRange || '');
                          setBookGenres(selectedBook?.genreIds || []);
                        }}
                        sx={{
                          borderRadius: 3,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          minWidth: 'auto',
                        }}
                      >
                        Reset
                      </Button>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={handleGetBookDetails}
                          disabled={isFetchingDetails}
                          startIcon={<DownloadIcon />}
                          sx={{
                            borderRadius: 3,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            minWidth: 'auto',
                          }}
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
                            whiteSpace: 'nowrap',
                            minWidth: 'auto',
                            background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
                            boxShadow: '4px 4px 8px rgba(107, 142, 107, 0.3)',
                          }}
                        >
                          Update Book
                        </Button>
                      </Box>
                    </Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 1, display: 'block', fontStyle: 'italic' }}
                    >
                      Use "Get Details" to fetch author info from external APIs, then "Update Book"
                      to save changes.
                    </Typography>
                  </Popover>
                </Box>
              ) : (
                <BookAutocomplete
                  value={selectedBook || null}
                  onChange={handleBookChange}
                  onBookCreated={handleBookChange}
                  onBookCreationStart={handleBookCreationStart}
                />
              )}
            </Box>

            {/* Assessment */}
            <Box data-tour="session-assessment">
              <AssessmentSelector value={assessment} onChange={handleAssessmentChange} />
            </Box>

            {/* Notes + Enjoyment + Save button on same row */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Tooltip
                title={
                  notes
                    ? `Notes: ${notes.substring(0, 40)}${notes.length > 40 ? '...' : ''}`
                    : 'Add notes'
                }
              >
                <IconButton
                  onClick={(e) => setNotesAnchor(e.currentTarget)}
                  aria-label="Add notes"
                  sx={{
                    color: notes ? 'primary.main' : 'text.secondary',
                    border: (theme) =>
                      notes
                        ? `2px solid ${theme.palette.primary.main}`
                        : '1px solid rgba(0,0,0,0.12)',
                    borderRadius: 2,
                    px: 1.5,
                  }}
                >
                  <NotesIcon fontSize="small" />
                  {notes && (
                    <Typography
                      variant="caption"
                      sx={{ ml: 0.5, fontWeight: 600, color: 'primary.main' }}
                    >
                      Notes
                    </Typography>
                  )}
                </IconButton>
              </Tooltip>

              {/* Book enjoyment thumbs — only visible when a book is selected */}
              {selectedBookId && (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip title="Enjoying it">
                    <IconButton
                      onClick={() => setBookEnjoyment(bookEnjoyment === 'liked' ? null : 'liked')}
                      aria-label="Student is enjoying this book"
                      size="small"
                      sx={{
                        color: bookEnjoyment === 'liked' ? 'success.main' : 'text.secondary',
                        border:
                          bookEnjoyment === 'liked' ? '2px solid' : '1px solid rgba(0,0,0,0.12)',
                        borderColor: bookEnjoyment === 'liked' ? 'success.main' : undefined,
                        borderRadius: 2,
                        bgcolor: bookEnjoyment === 'liked' ? 'rgba(46, 125, 50, 0.08)' : undefined,
                      }}
                    >
                      <ThumbUpIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Not enjoying it">
                    <IconButton
                      onClick={() =>
                        setBookEnjoyment(bookEnjoyment === 'disliked' ? null : 'disliked')
                      }
                      aria-label="Student is not enjoying this book"
                      size="small"
                      sx={{
                        color: bookEnjoyment === 'disliked' ? 'warning.main' : 'text.secondary',
                        border:
                          bookEnjoyment === 'disliked' ? '2px solid' : '1px solid rgba(0,0,0,0.12)',
                        borderColor: bookEnjoyment === 'disliked' ? 'warning.main' : undefined,
                        borderRadius: 2,
                        bgcolor:
                          bookEnjoyment === 'disliked' ? 'rgba(237, 108, 2, 0.08)' : undefined,
                      }}
                    >
                      <ThumbDownIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}

              {/* Save button takes remaining space */}
              <Button
                data-tour="session-save"
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                size="large"
                sx={{
                  flex: 1,
                  height: 48,
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #8AAD8A 0%, #6B8E6B 100%)',
                  boxShadow: '0 4px 12px rgba(107, 142, 107, 0.2)',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  textTransform: 'none',
                  '@media (hover: hover) and (pointer: fine)': {
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 6px 20px rgba(107, 142, 107, 0.3)',
                    },
                  },
                  '&:active': {
                    transform: 'scale(0.97)',
                  },
                }}
              >
                Save Reading Session
              </Button>
            </Box>

            <Popover
              open={notesOpen}
              anchorEl={notesAnchor}
              onClose={() => setNotesAnchor(null)}
              anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
              transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
              slotProps={{ paper: { sx: { p: 2, borderRadius: 4, width: 350, maxWidth: '90vw' } } }}
            >
              <SessionNotes value={notes} onChange={handleNotesChange} defaultExpanded />
            </Popover>
          </Box>
        </form>
      </Paper>
      {/* Student Books Read */}
      {selectedStudentId && (
        <Paper
          sx={{
            mt: 2,
            p: 2,
            borderRadius: '12px',
          }}
        >
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              fontFamily: '"Nunito", sans-serif',
              color: 'text.primary',
              mb: 1.5,
            }}
          >
            Books Read — {selectedStudent?.name}
          </Typography>
          {historyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : studentHistory.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No reading sessions recorded yet
            </Typography>
          ) : (
            (() => {
              const bookGroups = new Map();
              for (const session of studentHistory) {
                const key = session.bookId || `no-book-${session.id}`;
                if (!bookGroups.has(key)) {
                  bookGroups.set(key, { bookId: session.bookId, sessions: [] });
                }
                bookGroups.get(key).sessions.push(session);
              }
              const booksRead = [...bookGroups.values()]
                .filter((g) => g.bookId)
                .map((g) => ({
                  ...g,
                  lastDate: g.sessions[0].date,
                  firstDate: g.sessions[g.sessions.length - 1].date,
                  count: g.sessions.length,
                }));
              if (booksRead.length === 0)
                return (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textAlign: 'center', py: 2 }}
                  >
                    No books recorded yet
                  </Typography>
                );
              return (
                <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
                  {booksRead.slice(0, 30).map((entry) => {
                    const book = booksMap.get(entry.bookId);
                    const lastDate = new Date(entry.lastDate);
                    const dateLabel = lastDate.toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    });
                    return (
                      <Box
                        key={entry.bookId}
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          minWidth: 90,
                          maxWidth: 90,
                          flexShrink: 0,
                        }}
                      >
                        <BookCover
                          title={book?.title || 'Unknown'}
                          author={book?.author}
                          width={70}
                          height={100}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            mt: 0.5,
                            fontWeight: 600,
                            textAlign: 'center',
                            lineHeight: 1.2,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            fontSize: '0.7rem',
                            width: '100%',
                          }}
                        >
                          {book?.title || 'Unknown'}
                        </Typography>
                        {book?.author && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontSize: '0.6rem', textAlign: 'center', lineHeight: 1.1 }}
                            noWrap
                          >
                            {book.author}
                          </Typography>
                        )}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.6rem' }}
                        >
                          {entry.count} {entry.count === 1 ? 'session' : 'sessions'}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.6rem' }}
                        >
                          {dateLabel}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              );
            })()
          )}
        </Paper>
      )}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={handleSnackbarClose}
        message={snackbarMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        ContentProps={{
          sx: {
            borderRadius: 4,
            bgcolor: 'primary.main',
            color: 'background.paper',
            fontWeight: 600,
            boxShadow: '0 8px 20px rgba(107, 142, 107, 0.3)',
          },
        }}
      />
      <BadgeCelebration
        badges={celebrationBadges}
        onClose={() => {
          setCelebrationBadges([]);
          if (pendingGoalCelebration) {
            setCompletedGoals(pendingGoalCelebration);
            setPendingGoalCelebration(null);
          }
        }}
      />
      <Snackbar
        open={completedGoals.length > 0}
        autoHideDuration={5000}
        onClose={() => setCompletedGoals([])}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={
          completedGoals[0]
            ? `Your class just hit ${completedGoals[0].target} ${completedGoals[0].metric}! 🎉`
            : ''
        }
      />
      <TourButton {...tourButtonProps} />
    </Box>
  );
};

export default SessionForm;
