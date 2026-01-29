import React, { useState, useEffect } from 'react';
import { Box } from '@mui/material';
import { useBookCover } from '../hooks/useBookCover';
import BookCoverPlaceholder from './BookCoverPlaceholder';

/**
 * BookCover - Displays a book cover image fetched from OpenLibrary, with fallback to placeholder
 *
 * Uses the useBookCover hook to fetch cover images from OpenLibrary API with caching.
 * Shows a placeholder while loading or when no cover is available.
 *
 * Props:
 * - title (string): The book title (required)
 * - author (string): The book author (optional)
 * - width (number): Width in pixels (default: 80)
 * - height (number): Height in pixels (default: 120)
 */
const BookCover = ({ title, author = null, width = 80, height = 120 }) => {
  const { coverUrl, isLoading } = useBookCover(title, author);
  const [imageError, setImageError] = useState(false);

  // Reset error state when title/author changes
  useEffect(() => {
    setImageError(false);
  }, [title, author]);

  // Handle image load error
  const handleImageError = () => {
    setImageError(true);
  };

  // If no cover URL available, show placeholder
  if (!coverUrl) {
    return (
      <BookCoverPlaceholder
        title={title}
        width={width}
        height={height}
      />
    );
  }

  // Show the cover image with error fallback
  return (
    <Box sx={{ position: 'relative', width, height }}>
      {imageError && (
        <BookCoverPlaceholder
          title={title}
          width={width}
          height={height}
        />
      )}
      <Box
        component="img"
        src={coverUrl}
        alt={`Cover of ${title}`}
        onError={handleImageError}
        sx={{
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: 1,
          boxShadow: 1,
          objectFit: 'cover',
          display: imageError ? 'none' : 'block',
        }}
      />
    </Box>
  );
};

export default BookCover;
