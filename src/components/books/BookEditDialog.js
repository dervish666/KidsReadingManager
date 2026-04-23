import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import BookCover from '../BookCover';

const BookEditDialog = ({ book, onClose, onSave, genres }) => {
  const { fetchWithAuth } = useAuth();
  const { reloadDataFromServer } = useData();

  const [editBookTitle, setEditBookTitle] = useState('');
  const [editBookAuthor, setEditBookAuthor] = useState('');
  const [editBookReadingLevel, setEditBookReadingLevel] = useState('');
  const [editBookAgeRange, setEditBookAgeRange] = useState('');
  const [editBookDescription, setEditBookDescription] = useState('');
  const [editBookGenreIds, setEditBookGenreIds] = useState([]);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState(null);

  // Initialize edit fields when a new book is selected
  useEffect(() => {
    if (book) {
      setEditBookTitle(book.title || '');
      setEditBookAuthor(book.author || '');
      setEditBookReadingLevel(book.readingLevel || '');
      setEditBookAgeRange(book.ageRange || '');
      setEditBookDescription(book.description || '');
      setEditBookGenreIds(book.genreIds || []);
      setError('');
    }
  }, [book]);

  // Forward snackbar messages to parent whenever they change
  useEffect(() => {
    if (snackbar) {
      // snackbar is used internally only for the fetch details flow;
      // we forward it via onSave's sibling pattern below
    }
  }, [snackbar]);

  const handleFetchBookDetails = async () => {
    setIsFetchingDetails(true);
    try {
      const res = await fetchWithAuth(`/api/books/${book.id}/enrich`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch details');
      }

      const data = await res.json();
      const parts = [];

      if (data.description) {
        setEditBookDescription(data.description);
        parts.push('description');
      }

      if (data.coverStored) {
        parts.push('cover');
      }

      if (data.genres?.length > 0) {
        const genreNameToId = Object.fromEntries(genres.map((g) => [g.name.toLowerCase(), g.id]));
        const matchedIds = data.genres
          .map((name) => genreNameToId[name.toLowerCase()])
          .filter(Boolean);
        if (matchedIds.length > 0) {
          setEditBookGenreIds((prev) => [...new Set([...prev, ...matchedIds])]);
          parts.push('genres');
        }
      }

      setSnackbar({
        open: true,
        message: parts.length > 0 ? `Loaded ${parts.join(', ')}` : 'No new details found',
        severity: parts.length > 0 ? 'success' : 'warning',
      });
    } catch (err) {
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const handleUpdateBook = async (e) => {
    if (e) e.preventDefault();
    if (!book) return;
    if (!editBookTitle.trim()) {
      setError('Please enter a book title.');
      return;
    }

    setIsSaving(true);
    try {
      // Use authenticated helper for consistency with protected API
      const response = await fetchWithAuth(`/api/books/${book.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editBookTitle.trim(),
          author: editBookAuthor.trim() || null,
          readingLevel: editBookReadingLevel.trim() || null,
          ageRange: editBookAgeRange.trim() || null,
          description: editBookDescription.trim() || null,
          genreIds: editBookGenreIds,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      await reloadDataFromServer();
      setError('');
      onSave('Book updated successfully');
      onClose();
    } catch (error) {
      setError('Failed to update book');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditBookTitle('');
    setEditBookAuthor('');
    setEditBookReadingLevel('');
    setEditBookAgeRange('');
    setEditBookDescription('');
    setEditBookGenreIds([]);
    setError('');
    onClose();
  };

  return (
    <Dialog open={!!book} onClose={handleCancelEdit} fullWidth maxWidth="md">
      <DialogTitle>Edit Book</DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={handleUpdateBook} sx={{ mt: 1 }}>
          {/* Cover, Description, and Genres Row */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            {/* Cover Image */}
            <Box
              sx={{
                flexShrink: 0,
                width: 140,
                display: 'flex',
                alignItems: 'flex-start',
              }}
            >
              <BookCover
                title={editBookTitle}
                author={editBookAuthor}
                isbn={book?.isbn || null}
                width={140}
                height={190}
              />
            </Box>

            {/* Description beside cover */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <TextField
                label="Description"
                value={editBookDescription}
                onChange={(e) => setEditBookDescription(e.target.value)}
                fullWidth
                size="small"
                multiline
                rows={4}
                placeholder="Book description (can be fetched from OpenLibrary)"
              />
            </Box>

            {/* Genre Tags Section */}
            <Box
              sx={{
                flexShrink: 0,
                width: 200,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                Genres
              </Typography>
              <Box
                sx={{
                  flex: 1,
                  border: '1px solid',
                  borderColor: 'grey.300',
                  borderRadius: 1,
                  p: 1,
                  minHeight: 100,
                  maxHeight: 120,
                  overflowY: 'auto',
                  backgroundColor: 'grey.50',
                }}
              >
                {/* Display selected genre chips */}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                  {editBookGenreIds.map((genreId) => {
                    const genre = genres.find((g) => g.id === genreId);
                    return genre ? (
                      <Chip
                        key={genreId}
                        label={genre.name}
                        size="small"
                        onDelete={() =>
                          setEditBookGenreIds((prev) => prev.filter((id) => id !== genreId))
                        }
                        sx={{ height: 24 }}
                      />
                    ) : null;
                  })}
                  {editBookGenreIds.length === 0 && (
                    <Typography variant="caption" color="text.secondary">
                      No genres selected
                    </Typography>
                  )}
                </Box>
              </Box>
              {/* Genre selector dropdown */}
              <FormControl size="small" sx={{ mt: 1 }}>
                <InputLabel id="edit-genre-select-label">Add Genre</InputLabel>
                <Select
                  labelId="edit-genre-select-label"
                  value=""
                  label="Add Genre"
                  onChange={(e) => {
                    const genreId = e.target.value;
                    if (genreId && !editBookGenreIds.includes(genreId)) {
                      setEditBookGenreIds((prev) => [...prev, genreId]);
                    }
                  }}
                >
                  {genres
                    .filter((genre) => !editBookGenreIds.includes(genre.id))
                    .map((genre) => (
                      <MenuItem key={genre.id} value={genre.id}>
                        {genre.name}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Box>
          </Box>

          {/* Form Fields */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Book Title"
                value={editBookTitle}
                onChange={(e) => setEditBookTitle(e.target.value)}
                fullWidth
                size="small"
                required
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Author"
                value={editBookAuthor}
                onChange={(e) => setEditBookAuthor(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label="Reading Level"
                value={editBookReadingLevel}
                onChange={(e) => setEditBookReadingLevel(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label="Age Range"
                value={editBookAgeRange}
                onChange={(e) => setEditBookAgeRange(e.target.value)}
                fullWidth
                size="small"
                placeholder="e.g., 6-9"
              />
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          variant="outlined"
          startIcon={isFetchingDetails ? <CircularProgress size={20} /> : <InfoIcon />}
          onClick={handleFetchBookDetails}
          disabled={isFetchingDetails}
          size="small"
        >
          {isFetchingDetails ? 'Loading...' : 'Get Details'}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={handleCancelEdit}>Cancel</Button>
        <Button onClick={handleUpdateBook} variant="contained" color="primary" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BookEditDialog;
