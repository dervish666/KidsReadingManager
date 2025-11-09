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
  const { findOrCreateBook } = useAppContext();
  const [title, setTitle] = useState(initialTitle || '');
  const [author, setAuthor] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset form when modal opens/closes or initialTitle changes
  useEffect(() => {
    if (open) {
      setTitle(initialTitle || '');
      setAuthor('');
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