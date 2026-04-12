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
} from '@mui/material';
import {
  Add as AddIcon,
  Favorite as FavoriteIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
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

  // Validation state
  const [nameError, setNameError] = useState(false);

  // UI state
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');

  // Add genre dialog
  const [addGenreOpen, setAddGenreOpen] = useState(false);
  const [newGenreName, setNewGenreName] = useState('');

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
