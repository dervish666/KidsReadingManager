import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';

// Create context
const BookCoverContext = createContext(null);

// Constants
const STORAGE_KEY = 'bookCovers';
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const MAX_CACHE_ENTRIES = 2000;

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
 * Debounced save to localStorage — avoids repeated JSON.stringify on rapid updates.
 * Writes at most once every 2 seconds.
 */
let saveTimeout = null;
const saveCacheToStorage = (cache) => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (error) {
      // Handle localStorage errors gracefully (e.g., quota exceeded)
      // Silently fail - the cache will still work in memory
    }
  }, 2000);
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

  // Keep a ref to the latest cache so callbacks don't depend on the cache state
  // This prevents all useBookCover hooks from re-running when any cover is fetched
  const cacheRef = useRef(cache);
  cacheRef.current = cache;

  /**
   * Get cached cover URL for a book.
   * Stable reference — does not change when cache updates.
   */
  const getCachedCover = useCallback((title, author) => {
    const key = getCacheKey(title, author);
    const entry = cacheRef.current[key];

    if (!entry) {
      return null;
    }

    // Double-check expiry at read time
    const now = Date.now();
    if (now - entry.fetchedAt >= CACHE_EXPIRY_MS) {
      return null;
    }

    return entry.coverUrl;
  }, []);

  /**
   * Cache a cover URL for a book.
   * Stable reference — does not change when cache updates.
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

      // Evict oldest entries if cache exceeds max size
      const keys = Object.keys(newCache);
      if (keys.length > MAX_CACHE_ENTRIES) {
        const sorted = keys.sort(
          (a, b) => (newCache[a].fetchedAt || 0) - (newCache[b].fetchedAt || 0)
        );
        const toRemove = sorted.slice(0, keys.length - MAX_CACHE_ENTRIES);
        for (const k of toRemove) {
          delete newCache[k];
        }
      }

      // Persist to localStorage
      saveCacheToStorage(newCache);

      return newCache;
    });
  }, []);

  /**
   * Check if a book's cover is cached.
   * Stable reference — does not change when cache updates.
   */
  const isCached = useCallback((title, author) => {
    const key = getCacheKey(title, author);
    const entry = cacheRef.current[key];

    if (!entry) {
      return false;
    }

    // Check if entry is expired
    const now = Date.now();
    if (now - entry.fetchedAt >= CACHE_EXPIRY_MS) {
      return false;
    }

    return true;
  }, []);

  // Memoize the value to prevent unnecessary re-renders of consumers
  const value = useMemo(
    () => ({
      getCachedCover,
      setCachedCover,
      isCached,
    }),
    [getCachedCover, setCachedCover, isCached]
  );

  return <BookCoverContext.Provider value={value}>{children}</BookCoverContext.Provider>;
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
