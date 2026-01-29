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
  Tabs,
  Tab,
} from '@mui/material';
import {
  Close as CloseIcon,
  Save as SaveIcon,
  Add as AddIcon,
  Favorite as FavoriteIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  Person as PersonIcon,
  Psychology as PsychologyIcon,
} from '@mui/icons-material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useAppContext } from '../../contexts/AppContext';
import BookAutocomplete from '../sessions/BookAutocomplete';
import ReadingLevelRangeInput from './ReadingLevelRangeInput';

const StudentProfile = ({ open, onClose, student }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const {
    genres,
    classes,
    updateStudent,
    addGenre,
  } = useAppContext();

  // Tab state
  const [activeTab, setActiveTab] = useState(0);

  // Student settings state
  const [name, setName] = useState('');
  const [classId, setClassId] = useState('');
  const [readingLevelMin, setReadingLevelMin] = useState(null);
  const [readingLevelMax, setReadingLevelMax] = useState(null);

  // Reading preferences state
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [likes, setLikes] = useState([]);
  const [dislikes, setDislikes] = useState([]);

  // UI state
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  const [saving, setSaving] = useState(false);

  // New genre dialog
  const [addGenreOpen, setAddGenreOpen] = useState(false);
  const [newGenreName, setNewGenreName] = useState('');

  // Get unique book IDs from student's reading sessions
  const studentReadBookIds = React.useMemo(() => {
    if (!student || !student.readingSessions) return [];
    const bookIds = student.readingSessions
      .map(session => session.bookId)
      .filter(Boolean);
    return [...new Set(bookIds)];
  }, [student]);

  // Initialize all fields when student or dialog changes
  useEffect(() => {
    if (student && open) {
      // Student settings
      setName(student.name || '');
      setClassId(student.classId || '');
      setReadingLevelMin(student.readingLevelMin ?? null);
      setReadingLevelMax(student.readingLevelMax ?? null);

      // Reading preferences
      const preferences = student.preferences || {};
      setSelectedGenres(preferences.favoriteGenreIds || []);
      setLikes(preferences.likes || []);
      setDislikes(preferences.dislikes || []);
    }
  }, [student, open]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setActiveTab(0);
      setName('');
      setClassId('');
      setReadingLevelMin(null);
      setReadingLevelMax(null);
      setSelectedGenres([]);
      setLikes([]);
      setDislikes([]);
    }
  }, [open]);

  const handleSave = async () => {
    // Validate name is required
    if (!name.trim()) {
      setSnackbarMessage('Student name is required');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
      return;
    }

    setSaving(true);
    try {
      const preferences = {
        favoriteGenreIds: selectedGenres,
        likes,
        dislikes
      };

      await updateStudent(student.id, {
        name: name.trim(),
        classId: classId || null,
        readingLevelMin,
        readingLevelMax,
        preferences,
        updatedAt: new Date().toISOString()
      });

      setSnackbarMessage('Student profile saved successfully!');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
      onClose();
    } catch (error) {
      console.error('Error saving profile:', error);
      setSnackbarMessage('Failed to save profile');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    // Reset to student data
    if (student) {
      setName(student.name || '');
      setClassId(student.classId || '');
      setReadingLevelMin(student.readingLevelMin ?? null);
      setReadingLevelMax(student.readingLevelMax ?? null);

      const preferences = student.preferences || {};
      setSelectedGenres(preferences.favoriteGenreIds || []);
      setLikes(preferences.likes || []);
      setDislikes(preferences.dislikes || []);
    }
    onClose();
  };

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
    setLikes(likes.filter(like => like !== likeToRemove));
  };

  const handleRemoveDislike = (dislikeToRemove) => {
    setDislikes(dislikes.filter(dislike => dislike !== dislikeToRemove));
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

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        fullScreen={fullScreen}
        maxWidth="md"
      >
        <DialogTitle sx={{ m: 0, p: 2 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              {student?.name || 'Student'}
            </Typography>
            <IconButton onClick={handleClose} size="large">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs
            value={activeTab}
            onChange={(e, newValue) => setActiveTab(newValue)}
            variant="fullWidth"
          >
            <Tab
              icon={<PersonIcon />}
              iconPosition="start"
              label="Student Settings"
              sx={{ minHeight: 48 }}
            />
            <Tab
              icon={<PsychologyIcon />}
              iconPosition="start"
              label="Reading Preferences"
              sx={{ minHeight: 48 }}
            />
          </Tabs>
        </Box>

        <DialogContent dividers sx={{ pb: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          {!student ? (
            <Typography>Loading...</Typography>
          ) : (
            <>
              {/* Student Settings Tab */}
              {activeTab === 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {/* Name */}
                  <TextField
                    label="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    fullWidth
                    required
                    error={!name.trim()}
                    helperText={!name.trim() ? 'Name is required' : ''}
                  />

                  {/* Class */}
                  <FormControl fullWidth>
                    <InputLabel id="class-select-label">Class</InputLabel>
                    <Select
                      labelId="class-select-label"
                      value={classId}
                      onChange={(e) => setClassId(e.target.value)}
                      label="Class"
                    >
                      <MenuItem value="">
                        <em>Unassigned</em>
                      </MenuItem>
                      {filteredClasses.map((cls) => (
                        <MenuItem key={cls.id} value={cls.id}>
                          {cls.name}{cls.teacherName ? ` (${cls.teacherName})` : ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Reading Level Range */}
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
                </Box>
              )}

              {/* Reading Preferences Tab */}
              {activeTab === 1 && (
                <>
                  {/* Favorite Genres */}
                  <Box sx={{ mb: 4 }}>
                    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                      <FavoriteIcon sx={{ mr: 1 }} />
                      Favorite Genres
                    </Typography>
                    {filteredGenres.length === 0 ? (
                      <Alert severity="info" sx={{ mb: 2 }}>
                        No genres available. Click "Add New Genre" to create one.
                      </Alert>
                    ) : (
                      <FormControl fullWidth>
                        <Select
                          multiple
                          value={selectedGenres}
                          onChange={handleGenreChange}
                          input={<Input />}
                          renderValue={(selected) => (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {selected.map((genreId) => {
                                const genre = genres.find(g => g.id === genreId);
                                return genre ? (
                                  <Chip key={genreId} label={genre.name} size="small" />
                                ) : null;
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

                  {/* Likes */}
                  <Box sx={{ mb: 4 }}>
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
                        priorityBookIds={studentReadBookIds}
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

                  {/* Dislikes */}
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
                        priorityBookIds={studentReadBookIds}
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
                </>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
          <Button onClick={handleClose} color="primary">
            Cancel
          </Button>
          <Button onClick={handleSave} variant="contained" color="primary" disabled={saving}>
            {saving ? 'Saving...' : <><SaveIcon sx={{ mr: 1 }} />Save</>}
          </Button>
        </DialogActions>
      </Dialog>

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
            onKeyPress={(e) => e.key === 'Enter' && handleAddGenre()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddGenreOpen(false)}>Cancel</Button>
          <Button onClick={handleAddGenre} variant="contained">Add Genre</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
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
};

export default StudentProfile;
