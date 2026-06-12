import React, {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useMemo,
} from 'react';
import {
  Box,
  Typography,
  TextField,
  Alert,
  Snackbar,
  Chip,
  FormControl,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  Input,
  InputLabel,
  Switch,
  FormControlLabel,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import {
  Add as AddIcon,
  Favorite as FavoriteIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  MenuBook as MenuBookIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import BookAutocomplete from '../sessions/BookAutocomplete';
import ReadingLevelRangeInput from './ReadingLevelRangeInput';

/**
 * StudentEditForm — extracted form logic from StudentProfile.
 *
 * All form fields in a single scrollable column; no Save/Cancel buttons.
 * The parent controls save/cancel by calling formRef.current.save() / formRef.current.cancel().
 *
 * Props:
 *   student      {Object}   Full student record
 *   onSave       {Function} Called with validated form data object
 *   onCancel     {Function} Called after state is reset to original values
 */
const StudentEditForm = forwardRef(function StudentEditForm({ student, onSave, onCancel }, ref) {
  const { fetchWithAuth } = useAuth();
  const { genres, classes, addGenre } = useData();

  // Form state
  const [name, setName] = useState('');
  const [classId, setClassId] = useState('');
  const [readingLevelMin, setReadingLevelMin] = useState(null);
  const [readingLevelMax, setReadingLevelMax] = useState(null);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [likes, setLikes] = useState([]);
  const [dislikes, setDislikes] = useState([]);
  const [aiOptOut, setAiOptOut] = useState(false);
  const [baselineReads, setBaselineReads] = useState('');

  // Validation state
  const [nameError, setNameError] = useState(false);

  // UI state
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');

  // Add genre dialog
  const [addGenreOpen, setAddGenreOpen] = useState(false);
  const [newGenreName, setNewGenreName] = useState('');

  // Previously read books (deduped from the student's sessions, newest first)
  const [readBooks, setReadBooks] = useState([]);
  const [readBooksLoaded, setReadBooksLoaded] = useState(false);

  // Derive read book IDs from student sessions for priority ordering in autocomplete
  const priorityBookIds = useMemo(() => {
    const sessions = student?.readingSessions || [];
    return [...new Set(sessions.map((s) => s.bookId).filter(Boolean))];
  }, [student?.readingSessions]);

  // Helper: reset all form fields to the given student's values
  const resetToStudent = useCallback((s) => {
    if (!s) return;
    setName(s.name || '');
    setClassId(s.classId || '');
    setReadingLevelMin(s.readingLevelMin ?? null);
    setReadingLevelMax(s.readingLevelMax ?? null);
    setAiOptOut(Boolean(s.aiOptOut));
    setBaselineReads(s.baselineReads ? String(s.baselineReads) : '');
    const preferences = s.preferences || {};
    setSelectedGenres(preferences.favoriteGenreIds || []);
    setLikes(preferences.likes || []);
    setDislikes(preferences.dislikes || []);
    setNameError(false);
  }, []);

  // Initialize / re-initialize when student changes
  useEffect(() => {
    if (student) {
      resetToStudent(student);
    }
  }, [student, resetToStudent]);

  // Load the student's previously read books. The sessions endpoint resolves
  // book titles server-side (including manual titles) and returns newest
  // first, so the first occurrence of a title is its most recent read.
  useEffect(() => {
    if (!student?.id) {
      setReadBooks([]);
      setReadBooksLoaded(false);
      return undefined;
    }
    const controller = new AbortController();
    const loadReadBooks = async () => {
      try {
        const response = await fetchWithAuth(`/api/students/${student.id}/sessions`, {
          signal: controller.signal,
        });
        const sessions = response.ok ? await response.json() : [];
        const unique = new Map();
        for (const session of sessions) {
          const title = session.bookTitle;
          if (!title || unique.has(title)) continue;
          unique.set(title, {
            title,
            author: session.bookAuthor || null,
            lastRead: session.date,
          });
        }
        setReadBooks(Array.from(unique.values()));
        setReadBooksLoaded(true);
      } catch (error) {
        if (error.name === 'AbortError') return;
        setReadBooks([]);
        setReadBooksLoaded(true);
      }
    };
    loadReadBooks();
    return () => controller.abort();
  }, [student?.id, fetchWithAuth]);

  // Expose save() and cancel() to the parent via ref
  useImperativeHandle(
    ref,
    () => ({
      save() {
        if (!name.trim()) {
          setNameError(true);
          setSnackbarMessage('Student name is required');
          setSnackbarSeverity('error');
          setSnackbarOpen(true);
          return;
        }

        const formData = {
          name: name.trim(),
          classId: classId || null,
          readingLevelMin,
          readingLevelMax,
          baselineReads:
            baselineReads === '' ? 0 : Math.max(0, Math.floor(Number(baselineReads) || 0)),
          preferences: {
            favoriteGenreIds: selectedGenres,
            likes,
            dislikes,
          },
          updatedAt: new Date().toISOString(),
        };

        onSave(formData);
      },

      cancel() {
        resetToStudent(student);
        onCancel();
      },
    }),
    [
      name,
      classId,
      readingLevelMin,
      readingLevelMax,
      selectedGenres,
      likes,
      dislikes,
      baselineReads,
      student,
      onSave,
      onCancel,
      resetToStudent,
    ]
  );

  // AI opt-out toggle — calls the dedicated endpoint directly
  const handleAiOptOutToggle = async (event) => {
    const newValue = event.target.checked;
    setAiOptOut(newValue);
    try {
      const response = await fetchWithAuth(`/api/students/${student.id}/ai-opt-out`, {
        method: 'PUT',
        body: JSON.stringify({ optOut: newValue }),
      });
      if (!response.ok) throw new Error('Failed to update AI opt-out');
      setSnackbarMessage(newValue ? 'AI recommendations disabled' : 'AI recommendations enabled');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error) {
      // Revert on failure
      setAiOptOut(!newValue);
      setSnackbarMessage('Failed to update AI opt-out setting');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // Genre / likes / dislikes handlers
  const handleGenreChange = (event) => {
    setSelectedGenres(event.target.value);
  };

  const handleAddLike = (book) => {
    if (book && book.title) {
      const bookTitle = book.title;
      if (!likes.includes(bookTitle)) {
        setLikes([...likes, bookTitle]);
      }
    }
  };

  const handleAddDislike = (book) => {
    if (book && book.title) {
      const bookTitle = book.title;
      if (!dislikes.includes(bookTitle)) {
        setDislikes([...dislikes, bookTitle]);
      }
    }
  };

  const handleRemoveLike = (likeToRemove) => {
    setLikes(likes.filter((like) => like !== likeToRemove));
  };

  const handleRemoveDislike = (dislikeToRemove) => {
    setDislikes(dislikes.filter((dislike) => dislike !== dislikeToRemove));
  };

  // Thumb toggle on a previously read book — mutually exclusive with the
  // other thumb, and a second tap on the active thumb clears the rating.
  // Writes into the same likes/dislikes arrays the manual sections manage,
  // so the form's normal save path persists it.
  const handleReadBookRating = (title, rating) => {
    const inLikes = likes.includes(title);
    const inDislikes = dislikes.includes(title);
    if (rating === 'liked') {
      setLikes(inLikes ? likes.filter((t) => t !== title) : [...likes, title]);
      if (inDislikes) setDislikes(dislikes.filter((t) => t !== title));
    } else {
      setDislikes(inDislikes ? dislikes.filter((t) => t !== title) : [...dislikes, title]);
      if (inLikes) setLikes(likes.filter((t) => t !== title));
    }
  };

  const handleAddGenre = async () => {
    if (newGenreName.trim()) {
      try {
        await addGenre({ name: newGenreName.trim() });
        setNewGenreName('');
        setAddGenreOpen(false);
        setSnackbarMessage('Genre added successfully!');
        setSnackbarSeverity('success');
        setSnackbarOpen(true);
      } catch (error) {
        console.error('Error adding genre:', error);
        setSnackbarMessage('Failed to add genre');
        setSnackbarSeverity('error');
        setSnackbarOpen(true);
      }
    }
  };

  const filteredGenres = Array.isArray(genres) ? genres : [];
  const filteredClasses = Array.isArray(classes) ? classes : [];

  if (!student) {
    return <Typography>Loading...</Typography>;
  }

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* 1. Name */}
        <TextField
          label="Name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value.trim()) setNameError(false);
          }}
          fullWidth
          required
          error={nameError || !name.trim()}
          helperText={nameError || !name.trim() ? 'Name is required' : ''}
        />

        {/* 2. Class */}
        <FormControl fullWidth>
          <InputLabel id="student-edit-class-label">Class</InputLabel>
          <Select
            labelId="student-edit-class-label"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            label="Class"
          >
            <MenuItem value="">
              <em>Unassigned</em>
            </MenuItem>
            {filteredClasses.map((cls) => (
              <MenuItem key={cls.id} value={cls.id}>
                {cls.name}
                {cls.teacherName ? ` (${cls.teacherName})` : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* 3. Reading Level Range */}
        <Box>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Reading Level Range
          </Typography>
          <ReadingLevelRangeInput
            min={readingLevelMin}
            max={readingLevelMax}
            onChange={({ min, max }) => {
              setReadingLevelMin(min);
              setReadingLevelMax(max);
            }}
            disabled={false}
          />
        </Box>

        {/* 3b. Starting reads (mid-year onboarding) */}
        <TextField
          label="Starting reads this year"
          type="number"
          value={baselineReads}
          onChange={(e) => setBaselineReads(e.target.value)}
          fullWidth
          inputProps={{ min: 0, max: 100000, step: 1 }}
          helperText="Joining mid-year? Enter the reads this child had already logged elsewhere this academic year to set their starting Reading Band. Resets each September."
        />

        {/* 4. Favourite Genres */}
        <Box>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <FavoriteIcon sx={{ mr: 1 }} />
            Favourite Genres
          </Typography>
          {filteredGenres.length === 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              No genres available. Click &quot;Add New Genre&quot; to create one.
            </Alert>
          ) : (
            <FormControl fullWidth>
              <InputLabel id="student-edit-genre-label">Favourite Genres</InputLabel>
              <Select
                multiple
                labelId="student-edit-genre-label"
                value={selectedGenres}
                onChange={handleGenreChange}
                input={<Input />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((genreId) => {
                      const genre = genres.find((g) => g.id === genreId);
                      return genre ? <Chip key={genreId} label={genre.name} size="small" /> : null;
                    })}
                  </Box>
                )}
              >
                {filteredGenres.map((genre) => (
                  <MenuItem key={genre.id} value={genre.id}>
                    <Checkbox checked={selectedGenres.indexOf(genre.id) > -1} />
                    <ListItemText primary={genre.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Box sx={{ mt: 1 }}>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setAddGenreOpen(true)}
              variant="outlined"
            >
              Add New Genre
            </Button>
          </Box>
        </Box>

        {/* 4b. Previously read books — thumb ratings feed Likes/Dislikes */}
        <Box>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <MenuBookIcon sx={{ mr: 1 }} />
            Books They&apos;ve Read
            {readBooks.length > 0 && <Chip label={readBooks.length} size="small" sx={{ ml: 1 }} />}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Tap a thumb to record whether they enjoyed each book — this fills in the Likes and
            Dislikes below and feeds their recommendations.
          </Typography>
          {readBooks.length === 0 ? (
            <Typography variant="body2" color="text.secondary" fontStyle="italic">
              {readBooksLoaded ? 'No books recorded yet' : 'Loading reading history…'}
            </Typography>
          ) : (
            <Box
              sx={{
                maxHeight: 280,
                overflow: 'auto',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
              }}
            >
              {readBooks.map((book, index) => (
                <Box
                  key={book.title}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.5,
                    py: 0.75,
                    borderBottom: index < readBooks.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider',
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="body2" noWrap>
                      {book.title}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      noWrap
                      sx={{ display: 'block' }}
                    >
                      {book.author ? `${book.author} · ` : ''}
                      last read {new Date(book.lastRead).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <IconButton
                    onClick={() => handleReadBookRating(book.title, 'liked')}
                    aria-label={`Mark "${book.title}" as enjoyed`}
                    sx={{
                      color: likes.includes(book.title) ? 'success.main' : 'action.disabled',
                      '&:hover': { color: 'success.main' },
                    }}
                  >
                    <ThumbUpIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    onClick={() => handleReadBookRating(book.title, 'disliked')}
                    aria-label={`Mark "${book.title}" as not enjoyed`}
                    sx={{
                      color: dislikes.includes(book.title) ? 'error.main' : 'action.disabled',
                      '&:hover': { color: 'error.main' },
                    }}
                  >
                    <ThumbDownIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* 5. Likes */}
        <Box>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <ThumbUpIcon sx={{ mr: 1, color: 'success.main' }} />
            Likes
          </Typography>
          <Box sx={{ mb: 2 }}>
            <BookAutocomplete
              value={null}
              onChange={handleAddLike}
              label="Add a book they enjoy"
              placeholder="Type to search for books..."
              priorityBookIds={priorityBookIds}
            />
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {likes.map((like) => (
              <Chip
                key={like}
                label={like}
                onDelete={() => handleRemoveLike(like)}
                size="small"
                color="success"
              />
            ))}
          </Box>
        </Box>

        {/* 6. Dislikes */}
        <Box>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <ThumbDownIcon sx={{ mr: 1, color: 'error.main' }} />
            Dislikes
          </Typography>
          <Box sx={{ mb: 2 }}>
            <BookAutocomplete
              value={null}
              onChange={handleAddDislike}
              label="Add a book they avoid"
              placeholder="Type to search for books..."
              priorityBookIds={priorityBookIds}
            />
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {dislikes.map((dislike) => (
              <Chip
                key={dislike}
                label={dislike}
                onDelete={() => handleRemoveDislike(dislike)}
                size="small"
                color="error"
              />
            ))}
          </Box>
        </Box>

        {/* 7. AI Opt-Out */}
        <Box
          sx={{
            p: 2,
            borderRadius: '8px',
            backgroundColor: aiOptOut ? 'rgba(211, 47, 47, 0.04)' : 'rgba(46, 125, 50, 0.04)',
            border: '1px solid',
            borderColor: aiOptOut ? 'rgba(211, 47, 47, 0.2)' : 'rgba(46, 125, 50, 0.2)',
          }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={aiOptOut}
                onChange={handleAiOptOutToggle}
                color={aiOptOut ? 'error' : 'success'}
              />
            }
            label={
              <Box>
                <Typography variant="subtitle2">AI Book Recommendations</Typography>
                <Typography variant="caption" color="text.secondary">
                  {aiOptOut
                    ? "Disabled — this student's reading data will not be sent to AI providers."
                    : 'Enabled — AI will generate personalised book recommendations for this student.'}
                </Typography>
              </Box>
            }
            labelPlacement="start"
            sx={{ ml: 0, width: '100%', justifyContent: 'space-between' }}
          />
        </Box>
      </Box>

      {/* Add Genre Dialog */}
      <Dialog open={addGenreOpen} onClose={() => setAddGenreOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Genre</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Genre Name"
            value={newGenreName}
            onChange={(e) => setNewGenreName(e.target.value)}
            fullWidth
            onKeyDown={(e) => e.key === 'Enter' && handleAddGenre()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddGenreOpen(false)}>Cancel</Button>
          <Button onClick={handleAddGenre} variant="contained">
            Add Genre
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar feedback */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={4000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </>
  );
});

export default StudentEditForm;
