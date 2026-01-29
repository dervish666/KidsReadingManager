import { useState, useEffect, useRef } from 'react';
import { useBookCoverCache } from '../contexts/BookCoverContext';

/**
 * OpenLibrary cover size suffix for medium images
 */
const COVER_SIZE = 'M';

/**
 * Module-level tracking of in-flight fetch requests to prevent duplicates
 * across React Strict Mode re-renders
 */
const pendingRequests = new Map();

/**
 * Clear all pending requests - useful for testing
 * @internal
 */
export const _clearPendingRequests = () => {
  pendingRequests.clear();
};

/**
 * Build OpenLibrary Search API URL
 * @param {string} title - Book title
 * @param {string|null} author - Book author (optional)
 * @returns {string} The API URL
 */
const buildSearchUrl = (title, author) => {
  const params = new URLSearchParams({
    title: title,
    limit: '1',
    fields: 'cover_i',
  });

  if (author) {
    params.set('author', author);
  }

  return `https://openlibrary.org/search.json?${params.toString()}`;
};

/**
 * Convert OpenLibrary cover ID to cover URL
 * @param {number} coverId - The cover_i value from OpenLibrary
 * @returns {string} The cover image URL
 */
const buildCoverUrl = (coverId) => {
  return `https://covers.openlibrary.org/b/id/${coverId}-${COVER_SIZE}.jpg`;
};

/**
 * Special marker value to indicate we've checked and found no cover.
 * This distinguishes "not yet checked" (null) from "checked but no cover" (NO_COVER_MARKER).
 */
const NO_COVER_MARKER = '__NO_COVER__';

/**
 * Custom hook to fetch book covers from OpenLibrary with caching
 *
 * @param {string} title - Book title to search for
 * @param {string|null} author - Book author (optional)
 * @returns {{ coverUrl: string|null, isLoading: boolean, error: string|null }}
 */
export const useBookCover = (title, author = null) => {
  const { getCachedCover, setCachedCover, isCached } = useBookCoverCache();

  const [coverUrl, setCoverUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Track which request key this instance is subscribed to
  const subscribedKeyRef = useRef(null);

  useEffect(() => {
    // Skip if no title provided
    if (!title) {
      setCoverUrl(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Generate a key for this request
    const requestKey = `${title}|${author || ''}`.toLowerCase();

    // Check cache first
    if (isCached(title, author)) {
      const cached = getCachedCover(title, author);
      // Handle the special "no cover" marker
      if (cached === NO_COVER_MARKER) {
        setCoverUrl(null);
      } else {
        setCoverUrl(cached);
      }
      setIsLoading(false);
      setError(null);
      return;
    }

    // Track that this hook instance is subscribed to this request
    subscribedKeyRef.current = requestKey;
    let cancelled = false;

    // Check if there's already a pending request for this key
    if (pendingRequests.has(requestKey)) {
      // Subscribe to the existing request
      setIsLoading(true);
      pendingRequests.get(requestKey).subscribers.push({
        setCoverUrl,
        setIsLoading,
        setError,
        cancelled: () => cancelled,
      });
      return () => {
        cancelled = true;
      };
    }

    // Create a new pending request
    const subscribers = [
      {
        setCoverUrl,
        setIsLoading,
        setError,
        cancelled: () => cancelled,
      },
    ];
    pendingRequests.set(requestKey, { subscribers });

    // Not cached, need to fetch
    const fetchCover = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const url = buildSearchUrl(title, author);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Extract cover_i from first result
        const coverId = data.docs?.[0]?.cover_i;

        let resultUrl = null;
        if (coverId) {
          resultUrl = buildCoverUrl(coverId);
          setCachedCover(title, author, resultUrl);
        } else {
          // No cover found - cache the "no cover" result to avoid re-fetching
          setCachedCover(title, author, NO_COVER_MARKER);
        }

        // Notify all subscribers
        const pending = pendingRequests.get(requestKey);
        if (pending) {
          for (const sub of pending.subscribers) {
            if (!sub.cancelled()) {
              sub.setCoverUrl(resultUrl);
              sub.setIsLoading(false);
              sub.setError(null);
            }
          }
        }
      } catch (err) {
        const errorMessage = err.message || 'Failed to fetch cover';

        // Notify all subscribers of the error
        const pending = pendingRequests.get(requestKey);
        if (pending) {
          for (const sub of pending.subscribers) {
            if (!sub.cancelled()) {
              sub.setError(errorMessage);
              sub.setCoverUrl(null);
              sub.setIsLoading(false);
            }
          }
        }
      } finally {
        // Clean up the pending request
        pendingRequests.delete(requestKey);
      }
    };

    fetchCover();

    // Cleanup function
    return () => {
      cancelled = true;
    };
  }, [title, author, getCachedCover, setCachedCover, isCached]);

  return { coverUrl, isLoading, error };
};
