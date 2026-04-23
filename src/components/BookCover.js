import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box } from '@mui/material';
import BookCoverPlaceholder from './BookCoverPlaceholder';

/**
 * Build the server-side title+author search URL. The worker resolves this
 * via OpenLibrary → Google Books → Hardcover and caches the winner in R2.
 */
const searchUrl = (title, author) => {
  const params = new URLSearchParams({ title });
  if (author) params.set('author', author);
  return `/api/covers/search?${params.toString()}`;
};

/**
 * BookCover - Displays a book cover image fetched through /api/covers, with
 * graceful fallback to a gradient placeholder.
 *
 * Resolution order:
 *   1. If `isbn` is provided, request /api/covers/isbn/{isbn}-M.jpg.
 *      (The worker serves from R2 first, then tries OpenLibrary → Google Books
 *      → Hardcover by ISBN.)
 *   2. If that 404s or we have no ISBN, fall back to /api/covers/search with
 *      title+author. (Worker tries OpenLibrary search → Google Books →
 *      Hardcover by title+author.)
 *   3. If that also fails, render the placeholder.
 *
 * Uses IntersectionObserver to defer fetching until the component is near-
 * visible, preventing hundreds of simultaneous requests in long lists.
 */
const BookCover = React.memo(({ title, author = null, isbn = null, width = 80, height = 120 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [triedSearchFallback, setTriedSearchFallback] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

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

  // Reset fallback/error state whenever the target book changes
  useEffect(() => {
    setTriedSearchFallback(false);
    setImageError(false);
    setRetryCount(0);
  }, [title, author, isbn]);

  // Auto-retry failed covers (e.g. after enrichment populates R2, or
  // provider recovers from a transient outage).  Max 2 retries, 30 s apart.
  useEffect(() => {
    if (!imageError || retryCount >= 2) return;
    const timer = setTimeout(() => {
      setTriedSearchFallback(false);
      setImageError(false);
      setRetryCount((c) => c + 1);
    }, 30_000);
    return () => clearTimeout(timer);
  }, [imageError, retryCount]);

  const handleImageError = useCallback(() => {
    // If we're currently showing the ISBN URL and we have a title to fall back
    // to, switch to the search URL. Otherwise, give up and show the placeholder.
    if (isbn && !triedSearchFallback && title) {
      setTriedSearchFallback(true);
    } else {
      setImageError(true);
    }
  }, [isbn, triedSearchFallback, title]);

  // Decide the current src based on ISBN availability and whether we've had
  // to fall back to the search URL already.
  let currentSrc = null;
  if (isVisible) {
    if (isbn && !triedSearchFallback) {
      currentSrc = `/api/covers/isbn/${encodeURIComponent(isbn)}-M.jpg`;
    } else if (title) {
      currentSrc = searchUrl(title, author);
    }
  }

  if (!currentSrc || imageError) {
    return (
      <Box ref={containerRef}>
        <BookCoverPlaceholder title={title} width={width} height={height} />
      </Box>
    );
  }

  return (
    <Box ref={containerRef} sx={{ position: 'relative', width, height }}>
      <Box
        component="img"
        // `key` forces a clean remount when the URL changes (ISBN → search),
        // so we don't briefly show a broken image between attempts.
        key={currentSrc}
        src={currentSrc}
        alt={`Cover of ${title}`}
        loading="lazy"
        onError={handleImageError}
        sx={{
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: 1,
          boxShadow: 1,
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </Box>
  );
});

export default BookCover;
