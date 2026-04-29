/**
 * DataContext — central data store for the application.
 *
 * Domain-specific CRUD operations are extracted into focused hooks under
 * `src/contexts/data/` for readability. This file owns state declarations,
 * the server reload logic, org-switch effects, settings management, and
 * data export/import — then composes the domain hooks into a single
 * provider value.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { useAuth } from './AuthContext';
import { useStudentOperations } from './data/useStudentOperations';
import { useBookOperations } from './data/useBookOperations';
import { useSessionOperations } from './data/useSessionOperations';
import { useClassOperations } from './data/useClassOperations';

// Create context
const DataContext = createContext();

// API URL - relative path since frontend and API are served from the same origin
const API_URL = '/api';

// Custom hook to use the data context
export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
  const {
    fetchWithAuth,
    isAuthenticated,
    activeOrganizationId,
    setApiError,
    setSwitchingOrganization,
  } = useAuth();

  // State for students
  const [students, setStudents] = useState([]);
  // State for loading status
  const [loading, setLoading] = useState(true);
  // State for classes
  const [classes, setClasses] = useState([]);
  // State for books
  const [books, setBooks] = useState([]);
  // State for genres
  const [genres, setGenres] = useState([]);
  // State for general settings (including AI)
  const [settings, setSettings] = useState({});
  // State for reading status durations (in days)
  const [readingStatusSettings, setReadingStatusSettings] = useState({
    recentlyReadDays: 14,
    needsAttentionDays: 21,
  });

  // Track whether initial data load has happened (avoids full reload on token refresh)
  const hasLoadedData = useRef(false);

  // Track the previous activeOrganizationId to detect changes
  const prevActiveOrgId = useRef(activeOrganizationId);

  // Most-recent reload's AbortController. A new reload (org switch, manual
  // refresh) aborts the previous one so stale responses can't overwrite
  // fresher state — matches the pattern already used in HomeReadingRegister.
  const reloadControllerRef = useRef(null);

  // Load data from API
  const reloadDataFromServer = useCallback(async () => {
    // Cancel any in-flight reload first — important for rapid org switching
    // where parallel reloads would otherwise race on setState.
    if (reloadControllerRef.current) {
      reloadControllerRef.current.abort();
    }
    const controller = new AbortController();
    reloadControllerRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    setApiError(null);

    try {
      // Fetch all data in parallel for faster load
      const [studentsResponse, classesResponse, booksResponse, genresResponse, settingsResponse] =
        await Promise.all([
          fetchWithAuth(`${API_URL}/students`, { signal }),
          fetchWithAuth(`${API_URL}/classes`, { signal }).catch(() => null),
          // Cap the autocomplete payload. 5000 minimal rows ≈ 400 KB, which
          // is fine on tent-wifi iPads. Orgs larger than this lose the tail
          // of their catalog from local filtering but BookAutocomplete's
          // external search covers misses.
          fetchWithAuth(`${API_URL}/books?all=true&fields=minimal&limit=5000`, { signal }).catch(
            () => null
          ),
          fetchWithAuth(`${API_URL}/genres`, { signal }).catch(() => null),
          fetchWithAuth(`${API_URL}/settings`, { signal }).catch(() => null),
        ]);

      // If a newer reload superseded this one, drop everything.
      if (signal.aborted) {
        return { success: false, aborted: true };
      }

      // Students (required)
      if (!studentsResponse.ok) {
        throw new Error(`API error fetching students: ${studentsResponse.status}`);
      }
      const studentsData = await studentsResponse.json();
      const studentsWithClassId = studentsData.map((student) => ({
        ...student,
        classId: student.classId !== undefined ? student.classId : null,
      }));
      setStudents(studentsWithClassId);

      // Classes (optional) — pendingClassAutoFilter is consumed by UIContext
      // once classes are available, so React state updates correctly.
      if (classesResponse?.ok) {
        const classesData = await classesResponse.json();
        setClasses(classesData);
      } else {
        setClasses([]);
      }

      // Books (optional) — single request with all=true returns flat array
      if (booksResponse?.ok) {
        const booksData = await booksResponse.json();
        setBooks(Array.isArray(booksData) ? booksData : booksData.books || []);
      } else {
        setBooks([]);
      }

      // Genres (optional)
      if (genresResponse?.ok) {
        const genresData = await genresResponse.json();
        setGenres(genresData);
      } else {
        setGenres([]);
      }

      // Settings (optional)
      if (settingsResponse?.ok) {
        const settingsData = await settingsResponse.json();
        setSettings(settingsData);
        if (settingsData.readingStatusSettings) {
          setReadingStatusSettings(settingsData.readingStatusSettings);
        }
      }

      return { success: true };
    } catch (error) {
      // Aborted reloads are a normal signal, not an error to surface.
      if (error.name === 'AbortError' || signal.aborted) {
        return { success: false, aborted: true };
      }
      if (error.message !== 'Unauthorized') {
        setApiError(error.message);
      }
      return { success: false, error: error.message };
    } finally {
      // Only flip loading off if this controller is still the active one —
      // otherwise a superseded reload would prematurely clear the spinner.
      if (reloadControllerRef.current === controller) {
        reloadControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [fetchWithAuth, setApiError]);

  // Initial load / auth-aware — only reload all data on first auth, not on token refresh
  useEffect(() => {
    if (isAuthenticated) {
      if (!hasLoadedData.current) {
        hasLoadedData.current = true;
        reloadDataFromServer();
      }
    } else {
      hasLoadedData.current = false;
      setLoading(false);
    }
  }, [isAuthenticated, reloadDataFromServer]);

  // Auto-reload when activeOrganizationId changes (for org switching)
  useEffect(() => {
    // Skip on initial render or when org ID hasn't changed
    if (prevActiveOrgId.current === activeOrganizationId) {
      return;
    }
    prevActiveOrgId.current = activeOrganizationId;

    // Only reload if we have an org ID to switch to and are authenticated
    if (activeOrganizationId && isAuthenticated) {
      // Clear existing data
      setStudents([]);
      setClasses([]);
      setBooks([]);
      setGenres([]);
      setSettings({});

      reloadDataFromServer().finally(() => {
        setSwitchingOrganization(false);
      });
    }
  }, [activeOrganizationId, isAuthenticated, reloadDataFromServer, setSwitchingOrganization]);

  // --- Domain operation hooks ---

  const {
    addStudent,
    bulkImportStudents,
    updateStudent,
    updateStudentClassId,
    updateStudentCurrentBook,
    deleteStudent,
  } = useStudentOperations(fetchWithAuth, setStudents, setApiError);

  const { addBook, updateBook, updateBookField, findOrCreateBook, fetchBookDetails } =
    useBookOperations(fetchWithAuth, books, setBooks, setApiError);

  const { addReadingSession, editReadingSession, deleteReadingSession } = useSessionOperations(
    fetchWithAuth,
    setStudents,
    setApiError
  );

  const { addClass, updateClass, deleteClass, addGenre } = useClassOperations(
    fetchWithAuth,
    setClasses,
    setStudents,
    setGenres,
    setApiError
  );

  // --- Settings management ---

  const updateSettings = useCallback(
    async (newSettings) => {
      const previousSettings = settings;
      setSettings(newSettings);

      if (newSettings.readingStatusSettings) {
        setReadingStatusSettings(newSettings.readingStatusSettings);
      }

      try {
        const response = await fetchWithAuth(`${API_URL}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSettings),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const savedSettings = await response.json();
        setSettings(savedSettings);

        if (savedSettings.readingStatusSettings) {
          setReadingStatusSettings(savedSettings.readingStatusSettings);
        }

        setApiError(null);
        return savedSettings;
      } catch (error) {
        setApiError(error.message);
        setSettings(previousSettings);
        if (previousSettings.readingStatusSettings) {
          setReadingStatusSettings(previousSettings.readingStatusSettings);
        }
        throw error;
      }
    },
    [settings, fetchWithAuth, setApiError]
  );

  // --- Data Export/Import ---

  const exportToJson = useCallback(async () => {
    try {
      const response = await fetchWithAuth(`${API_URL}/data`);
      if (!response.ok) {
        throw new Error(`Failed to fetch data for export: ${response.status}`);
      }

      const data = await response.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tally-reading-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      return true;
    } catch (error) {
      setApiError(error.message);
      throw error;
    }
  }, [fetchWithAuth, setApiError]);

  const importFromJson = useCallback(
    async (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
          try {
            const content = e.target.result;
            const data = JSON.parse(content);

            const response = await fetchWithAuth(`${API_URL}/data`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error || `Import failed: ${response.status}`);
            }

            const result = await response.json();

            await reloadDataFromServer();

            resolve(result.count || 0);
          } catch (error) {
            setApiError(error.message);
            reject(error);
          }
        };

        reader.onerror = () => {
          reject(new Error('Failed to read file'));
        };

        reader.readAsText(file);
      });
    },
    [fetchWithAuth, reloadDataFromServer, setApiError]
  );

  // Provider value - memoized to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      students,
      classes,
      books,
      genres,
      loading,
      settings,
      readingStatusSettings,
      // Student CRUD
      addStudent,
      bulkImportStudents,
      updateStudent,
      updateStudentClassId,
      updateStudentCurrentBook,
      deleteStudent,
      // Session CRUD
      addReadingSession,
      editReadingSession,
      deleteReadingSession,
      // Book operations
      addBook,
      findOrCreateBook,
      fetchBookDetails,
      updateBook,
      updateBookField,
      // Class operations
      addClass,
      updateClass,
      deleteClass,
      // Genre operations
      addGenre,
      // Settings
      updateSettings,
      // Data operations
      reloadDataFromServer,
      exportToJson,
      importFromJson,
    }),
    [
      students,
      classes,
      books,
      genres,
      loading,
      settings,
      readingStatusSettings,
      addStudent,
      bulkImportStudents,
      updateStudent,
      updateStudentClassId,
      updateStudentCurrentBook,
      deleteStudent,
      addReadingSession,
      editReadingSession,
      deleteReadingSession,
      addBook,
      findOrCreateBook,
      fetchBookDetails,
      updateBook,
      updateBookField,
      addClass,
      updateClass,
      deleteClass,
      addGenre,
      updateSettings,
      reloadDataFromServer,
      exportToJson,
      importFromJson,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
