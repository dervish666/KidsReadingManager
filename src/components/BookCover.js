import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box } from '@mui/material';
import { useBookCover } from '../hooks/useBookCover';
import BookCoverPlaceholder from './BookCoverPlaceholder';

/**
 * BookCover - Displays a book cover image fetched from OpenLibrary, with fallback to placeholder
 *
 * Uses IntersectionObserver to defer cover fetching until the component is near-visible,
 * preventing hundreds of simultaneous OpenLibrary requests when rendering large lists.
 */
const BookCover = React.memo(({ title, author = null, width = 80, height = 120 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef(null);

  // Only fetch cover when element is near the viewport (200px margin)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // If IntersectionObserver isn't available, fetch immediately
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Only activate the hook when visible — passes null title to skip fetching
  const { coverUrl } = useBookCover(isVisible ? title : null, isVisible ? author : null);
  const [imageError, setImageError] = useState(false);

  // Reset error state when title/author changes
  useEffect(() => {
    setImageError(false);
  }, [title, author]);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  // If not visible yet or no cover URL, show placeholder
  if (!coverUrl) {
    return (
      <Box ref={containerRef}>
        <BookCoverPlaceholder title={title} width={width} height={height} />
      </Box>
    );
  }

  // Show the cover image with error fallback
  return (
    <Box ref={containerRef} sx={{ position: 'relative', width, height }}>
      {imageError && <BookCoverPlaceholder title={title} width={width} height={height} />}
      <Box
        component="img"
        src={coverUrl}
        alt={`Cover of ${title}`}
        loading="lazy"
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
});

export default BookCover;
