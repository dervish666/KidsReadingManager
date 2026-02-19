import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography
} from '@mui/material';
import { useAppContext } from '../../contexts/AppContext';

const AddBookModal = ({ open, initialTitle = '', onClose, onBookCreated }) => {
  const { findOrCreateBook, fetchWithAuth } = useAppContext();
  const [title, setTitle] = useState(initialTitle || '');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [pageCount, setPageCount] = useState('');
  const [seriesName, setSeriesName] = useState('');
  const [seriesNumber, setSeriesNumber] = useState('');
  const [publicationYear, setPublicationYear] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset form when modal opens/closes or initialTitle changes
  useEffect(() => {
    if (open) {
      setTitle(initialTitle || '');
      setAuthor('');
      setIsbn('');
      setPageCount('');
      setSeriesName('');
      setSeriesNumber('');
      setPublicationYear('');
      setError('');
      setIsSubmitting(false);
    }
  }, [open, initialTitle]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a book title.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const book = await findOrCreateBook(title.trim(), author.trim() || null);

      if (!book || !book.id) {
        throw new Error('Book creation failed');
      }

      // If additional metadata was provided, update the book
      const hasMetadata = isbn.trim() || pageCount || seriesName.trim() || seriesNumber || publicationYear;
      if (hasMetadata) {
        const updateData = {};
        if (isbn.trim()) updateData.isbn = isbn.trim();
        if (pageCount) updateData.pageCount = parseInt(pageCount, 10);
        if (seriesName.trim()) updateData.seriesName = seriesName.trim();
        if (seriesNumber) updateData.seriesNumber = parseInt(seriesNumber, 10);
        if (publicationYear) updateData.publicationYear = parseInt(publicationYear, 10);

        await fetchWithAuth(`/api/books/${book.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
      }

      if (onBookCreated) {
        onBookCreated(book);
      }

      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error('Error creating book from AddBookModal:', err);
      setError('Failed to create book. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (!isSubmitting && onClose) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleCancel} fullWidth maxWidth="xs">
      <DialogTitle>Add New Book</DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
          <TextField
            label="Title"
            fullWidth
            margin="normal"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            disabled={isSubmitting}
          />
          <TextField
            label="Author (Optional)"
            fullWidth
            margin="normal"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            disabled={isSubmitting}
          />
          <TextField
            label="ISBN (Optional)"
            fullWidth
            margin="normal"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            disabled={isSubmitting}
            placeholder="e.g., 978-0-14-103614-4"
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="Pages"
              type="number"
              margin="normal"
              value={pageCount}
              onChange={(e) => setPageCount(e.target.value)}
              disabled={isSubmitting}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Year"
              type="number"
              margin="normal"
              value={publicationYear}
              onChange={(e) => setPublicationYear(e.target.value)}
              disabled={isSubmitting}
              sx={{ flex: 1 }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              label="Series Name"
              margin="normal"
              value={seriesName}
              onChange={(e) => setSeriesName(e.target.value)}
              disabled={isSubmitting}
              sx={{ flex: 2 }}
            />
            <TextField
              label="#"
              type="number"
              margin="normal"
              value={seriesNumber}
              onChange={(e) => setSeriesNumber(e.target.value)}
              disabled={isSubmitting}
              sx={{ flex: 1 }}
            />
          </Box>
          {error && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {error}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          type="submit"
          variant="contained"
          color="primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : 'Save Book'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddBookModal;