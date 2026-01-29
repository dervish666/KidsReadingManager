import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// Create context
const BookCoverContext = createContext(null);

// Constants
const STORAGE_KEY = 'bookCovers';
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Generate a normalized cache key from title and author
 * @param {string} title - Book title
 * @param {string|null} author - Book author (optional)
 * @returns {string} Normalized cache key in format "title|author"
 */
const getCacheKey = (title, author) => {
  const normalizedTitle = (title || '').toLowerCase();
  const normalizedAuthor = (author || '').toLowerCase();
  return `${normalizedTitle}|${normalizedAuthor}`;
};

/**
 * Load cache from localStorage, filtering out expired entries
 * @returns {Object} Cache object with valid entries
 */
const loadCacheFromStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {};
    }

    const parsed = JSON.parse(stored);
    const now = Date.now();
    const validCache = {};

    // Filter out expired entries
    for (const [key, entry] of Object.entries(parsed)) {
      if (entry && entry.fetchedAt && now - entry.fetchedAt < CACHE_EXPIRY_MS) {
        validCache[key] = entry;
      }
    }

    // If we removed any entries, persist the cleaned cache
    if (Object.keys(validCache).length !== Object.keys(parsed).length) {
      saveCacheToStorage(validCache);
    }

    return validCache;
  } catch (error) {
    // Handle malformed JSON or other localStorage errors gracefully
    return {};
  }
};

/**
 * Save cache to localStorage
 * @param {Object} cache - Cache object to persist
 */
const saveCacheToStorage = (cache) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (error) {
    // Handle localStorage errors gracefully (e.g., quota exceeded)
    // Silently fail - the cache will still work in memory
  }
};

/**
 * BookCoverProvider component that provides book cover caching functionality
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 */
export const BookCoverProvider = ({ children }) => {
  // Initialize cache from localStorage
  const [cache, setCache] = useState(() => loadCacheFromStorage());

  // Expire old entries on mount (already handled in loadCacheFromStorage)
  // This useEffect ensures the cleaned cache is persisted on mount
  useEffect(() => {
    // Re-load and clean cache on mount to ensure expiry is applied
    const cleanedCache = loadCacheFromStorage();
    setCache(cleanedCache);
  }, []);

  /**
   * Get cached cover URL for a book
   * @param {string} title - Book title
   * @param {string|null} author - Book author
   * @returns {string|null} Cover URL or null if not cached
   */
  const getCachedCover = useCallback(
    (title, author) => {
      const key = getCacheKey(title, author);
      const entry = cache[key];

      if (!entry) {
        return null;
      }

      // Double-check expiry at read time
      const now = Date.now();
      if (now - entry.fetchedAt >= CACHE_EXPIRY_MS) {
        return null;
      }

      return entry.coverUrl;
    },
    [cache]
  );

  /**
   * Cache a cover URL for a book
   * @param {string} title - Book title
   * @param {string|null} author - Book author
   * @param {string} coverUrl - Cover image URL
   */
  const setCachedCover = useCallback((title, author, coverUrl) => {
    const key = getCacheKey(title, author);
    const newEntry = {
      coverUrl,
      fetchedAt: Date.now(),
    };

    setCache((prevCache) => {
      const newCache = {
        ...prevCache,
        [key]: newEntry,
      };

      // Persist to localStorage
      saveCacheToStorage(newCache);

      return newCache;
    });
  }, []);

  /**
   * Check if a book's cover is cached
   * @param {string} title - Book title
   * @param {string|null} author - Book author
   * @returns {boolean} True if cached, false otherwise
   */
  const isCached = useCallback(
    (title, author) => {
      const key = getCacheKey(title, author);
      const entry = cache[key];

      if (!entry) {
        return false;
      }

      // Check if entry is expired
      const now = Date.now();
      if (now - entry.fetchedAt >= CACHE_EXPIRY_MS) {
        return false;
      }

      return true;
    },
    [cache]
  );

  const value = {
    getCachedCover,
    setCachedCover,
    isCached,
  };

  return (
    <BookCoverContext.Provider value={value}>
      {children}
    </BookCoverContext.Provider>
  );
};

/**
 * Custom hook to access book cover cache functions
 * @returns {{ getCachedCover: Function, setCachedCover: Function, isCached: Function }}
 * @throws {Error} If used outside of BookCoverProvider
 */
export const useBookCoverCache = () => {
  const context = useContext(BookCoverContext);

  if (context === null) {
    throw new Error('useBookCoverCache must be used within a BookCoverProvider');
  }

  return context;
};
