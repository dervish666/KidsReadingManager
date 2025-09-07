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
  Grid,
  TextField,
  Alert,
  Snackbar,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  Input,
  Fab,
  Tooltip
} from '@mui/material';
import {
  Close as CloseIcon,
  Save as SaveIcon,
  Add as AddIcon,
  Favorite as FavoriteIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon
} from '@mui/icons-material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useAppContext } from '../../contexts/AppContext';

const ReadingPreferences = ({ open, onClose, student }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const {
    genres,
    fetchGenres,
    updateStudent,
    addGenre,
  } = useAppContext();

  // Local state for preferences being edited
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [likes, setLikes] = useState([]);
  const [dislikes, setDislikes] = useState([]);
  const [newLike, setNewLike] = useState('');
  const [newDislike, setNewDislike] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  const [saving, setSaving] = useState(false);

  // New genre dialog
  const [addGenreOpen, setAddGenreOpen] = useState(false);
  const [newGenreName, setNewGenreName] = useState('');

  // Initialize preferences when student or dialog changes
  useEffect(() => {
    if (student && open) {
      const preferences = student.preferences || {};
      setSelectedGenres(preferences.favoriteGenreIds || []);
      setLikes(preferences.likes || []);
      setDislikes(preferences.dislikes || []);
    }
  }, [student, open]);

  // Fetch genres when dialog opens
  useEffect(() => {
    if (open) {
      fetchGenres();
    }
  }, [open, fetchGenres]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const preferences = {
        favoriteGenreIds: selectedGenres,
        likes,
        dislikes
      };

      await updateStudent(student.id, {
        preferences,
        updatedAt: new Date().toISOString()
      });

      setSnackbarMessage('Reading preferences saved successfully!');
      setSnackbarSeverity('success');
      setSnackbarOpen(true);
    } catch (error) {
      console.error('Error saving preferences:', error);
      setSnackbarMessage('Failed to save preferences');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    // Reset to student preferences
    if (student) {
      const preferences = student.preferences || {};
      setSelectedGenres(preferences.favoriteGenreIds || []);
      setLikes(preferences.likes || []);
      setDislikes(preferences.dislikes || []);
    }
    setNewLike('');
    setNewDislike('');
    onClose();
  };

  const handleGenreChange = (event) => {
    setSelectedGenres(event.target.value);
  };

  const handleAddLike = () => {
    if (newLike.trim() && !likes.includes(newLike.trim())) {
      setLikes([...likes, newLike.trim()]);
      setNewLike('');
    }
  };

  const handleAddDislike = () => {
    if (newDislike.trim() && !dislikes.includes(newDislike.trim())) {
      setDislikes([...dislikes, newDislike.trim()]);
      setNewDislike('');
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

  const filteredGenres = genres.filter(genre => !genre.isPredefined);

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
              {student?.name} - Reading Preferences
            </Typography>
            <IconButton onClick={handleClose} size="large">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers sx={{ pb: 'calc(env(safe-area-inset-bottom) + 16px)' }}>
          {/* Favorite Genres */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <FavoriteIcon sx={{ mr: 1 }} />
              Favorite Genres
            </Typography>
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
              <TextField
                value={newLike}
                onChange={(e) => setNewLike(e.target.value)}
                placeholder="Add something they enjoy..."
                onKeyPress={(e) => e.key === 'Enter' && handleAddLike()}
                fullWidth
                size="small"
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
              <TextField
                value={newDislike}
                onChange={(e) => setNewDislike(e.target.value)}
                placeholder="Add something they avoid..."
                onKeyPress={(e) => e.key === 'Enter' && handleAddDislike()}
                fullWidth
                size="small"
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
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 'calc(env(safe-area-inset-bottom) + 8px)' }}>
          <Button onClick={handleClose} color="primary">
            Cancel
          </Button>
          <Button onClick={handleSave} variant="contained" color="primary" disabled={saving}>
            {saving ? 'Saving...' : <><SaveIcon sx={{ mr: 1 }} />Save Preferences</>}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Genre Dialog */}
      <Dialog open={addGenreOpen} onClose={() => setAddGenreOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Genre</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
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

export default ReadingPreferences;