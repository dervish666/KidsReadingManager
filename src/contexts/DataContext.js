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

  // Load data from API
  const reloadDataFromServer = useCallback(async () => {
    setLoading(true);
    setApiError(null);

    try {
      // Fetch all data in parallel for faster load
      const [studentsResponse, classesResponse, booksResponse, genresResponse, settingsResponse] =
        await Promise.all([
          fetchWithAuth(`${API_URL}/students`),
          fetchWithAuth(`${API_URL}/classes`).catch(() => null),
          fetchWithAuth(`${API_URL}/books?all=true&fields=minimal`).catch(() => null),
          fetchWithAuth(`${API_URL}/genres`).catch(() => null),
          fetchWithAuth(`${API_URL}/settings`).catch(() => null),
        ]);

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

      // Classes (optional)
      if (classesResponse?.ok) {
        const classesData = await classesResponse.json();
        setClasses(classesData);

        // After classes are loaded, check for pending auto-filter from SSO login
        // UIContext reads globalClassFilter from sessionStorage, so we write there
        try {
          const pending = window.sessionStorage.getItem('pendingClassAutoFilter');
          if (pending) {
            window.sessionStorage.removeItem('pendingClassAutoFilter');
            const assignedIds = JSON.parse(pending);
            // Find the first assigned class alphabetically by name
            const assignedClasses = classesData
              .filter((c) => assignedIds.includes(c.id))
              .sort((a, b) => a.name.localeCompare(b.name));
            if (assignedClasses.length > 0) {
              window.sessionStorage.setItem('globalClassFilter', assignedClasses[0].id);
            }
          }
        } catch {
          /* ignore */
        }
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
      if (error.message !== 'Unauthorized') {
        setApiError(error.message);
      }
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
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

  // --- Student operations ---

  const addStudent = useCallback(
    async (name, classId = null) => {
      const newStudent = {
        id: crypto.randomUUID(),
        name,
        lastReadDate: null,
        totalSessionCount: 0,
        classId,
      };

      setStudents((prev) => [...prev, newStudent]);

      try {
        const response = await fetchWithAuth(`${API_URL}/students`, {
          method: 'POST',
          body: JSON.stringify(newStudent),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const savedStudent = await response.json();
        setStudents((prev) => prev.map((s) => (s.id === newStudent.id ? savedStudent : s)));
        setApiError(null);
        return savedStudent;
      } catch (error) {
        setApiError(error.message);
        // Functional rollback: remove the optimistic student without clobbering concurrent changes
        setStudents((prev) => prev.filter((s) => s.id !== newStudent.id));
        return null;
      }
    },
    [fetchWithAuth, setApiError]
  );

  const bulkImportStudents = useCallback(
    async (names, classId = null) => {
      if (!Array.isArray(names) || names.length === 0) {
        return [];
      }

      // Normalize classId - convert empty string to null
      const normalizedClassId = classId && classId.trim() !== '' ? classId : null;

      const newStudents = names.map((name) => ({
        id: crypto.randomUUID(),
        name: name.trim(),
        classId: normalizedClassId,
        lastReadDate: null,
        totalSessionCount: 0,
        likes: [],
        dislikes: [],
      }));

      const newStudentIds = new Set(newStudents.map((s) => s.id));
      setStudents((prev) => [...prev, ...newStudents]);

      try {
        // Send students in batches of 5 to avoid overwhelming the server
        const BATCH_SIZE = 5;
        const allResponses = [];
        for (let i = 0; i < newStudents.length; i += BATCH_SIZE) {
          const batch = newStudents.slice(i, i + BATCH_SIZE);
          const batchResponses = await Promise.all(
            batch.map((student) =>
              fetchWithAuth(`${API_URL}/students`, {
                method: 'POST',
                body: JSON.stringify(student),
              })
            )
          );
          allResponses.push(...batchResponses);
        }

        // Check if all responses are ok
        const allOk = allResponses.every((r) => r.ok);
        if (!allOk) {
          throw new Error('Some students failed to save');
        }

        const savedStudents = await Promise.all(
          allResponses.map((r) => r.json().catch(() => null))
        );

        // Update with saved students (with any server-side modifications)
        const validSavedStudents = savedStudents.filter((s) => s && s.id);
        if (validSavedStudents.length > 0) {
          setStudents((prev) => {
            const updated = [...prev];
            validSavedStudents.forEach((saved) => {
              const index = updated.findIndex((s) => s.id === saved.id);
              if (index !== -1) {
                updated[index] = saved;
              }
            });
            return updated;
          });
        }

        setApiError(null);
        return validSavedStudents;
      } catch (error) {
        setApiError(error.message);
        // Functional rollback: remove optimistic students without clobbering concurrent changes
        setStudents((prev) => prev.filter((s) => !newStudentIds.has(s.id)));
        return [];
      }
    },
    [fetchWithAuth, setApiError]
  );

  const updateStudentClassId = useCallback(
    async (studentId, classId) => {
      const student = students.find((s) => s.id === studentId);
      if (!student) {
        return;
      }

      // Normalize classId - convert 'unassigned' string to null
      const normalizedClassId = classId === 'unassigned' || classId === '' ? null : classId;
      const previousClassId = student.classId;

      const updatedStudent = {
        ...student,
        classId: normalizedClassId,
      };

      setStudents((prev) => prev.map((s) => (s.id === studentId ? updatedStudent : s)));

      try {
        const response = await fetchWithAuth(`${API_URL}/students/${studentId}`, {
          method: 'PUT',
          body: JSON.stringify(updatedStudent),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        setApiError(null);
      } catch (error) {
        setApiError(error.message);
        // Functional rollback: restore just the classId without clobbering concurrent changes
        setStudents((prev) =>
          prev.map((s) => (s.id === studentId ? { ...s, classId: previousClassId } : s))
        );
        throw error; // Re-throw so the component can handle it
      }
    },
    [students, fetchWithAuth, setApiError]
  );

  const updateStudent = useCallback(
    async (id, updatedData) => {
      const currentStudent = students.find((student) => student.id === id);
      if (!currentStudent) {
        return;
      }
      const updatedStudent = { ...currentStudent, ...updatedData };
      const snapshotBeforeUpdate = { ...currentStudent };

      setStudents((prev) =>
        prev.map((student) => (student.id === id ? updatedStudent : student))
      );

      try {
        const response = await fetchWithAuth(`${API_URL}/students/${id}`, {
          method: 'PUT',
          body: JSON.stringify(updatedStudent),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        setApiError(null);
      } catch (error) {
        setApiError(error.message);
        // Functional rollback: restore only this student's data
        setStudents((prev) =>
          prev.map((s) => (s.id === id ? { ...s, ...snapshotBeforeUpdate } : s))
        );
      }
    },
    [students, fetchWithAuth, setApiError]
  );

  const deleteStudent = useCallback(
    async (id) => {
      // Capture the student being deleted for potential rollback
      const deletedStudent = students.find((s) => s.id === id);
      setStudents((prev) => prev.filter((student) => student.id !== id));

      try {
        const response = await fetchWithAuth(`${API_URL}/students/${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        setApiError(null);
      } catch (error) {
        setApiError(error.message);
        // Functional rollback: re-add the student without clobbering concurrent changes
        if (deletedStudent) {
          setStudents((prev) => [...prev, deletedStudent]);
        }
      }
    },
    [students, fetchWithAuth, setApiError]
  );

  const updateStudentCurrentBook = useCallback(
    async (studentId, bookId, bookTitle = null, bookAuthor = null) => {
      const student = students.find((s) => s.id === studentId);
      if (!student) {
        return null;
      }

      // Optimistic update
      const previousStudents = students;
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? {
                ...s,
                currentBookId: bookId,
                currentBookTitle: bookTitle,
                currentBookAuthor: bookAuthor,
              }
            : s
        )
      );

      try {
        const response = await fetchWithAuth(
          `${API_URL}/students/${studentId}/current-book`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookId }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `API error: ${response.status}`);
        }

        const result = await response.json();

        // Update with server response
        setStudents((prev) =>
          prev.map((s) =>
            s.id === studentId
              ? {
                  ...s,
                  currentBookId: result.currentBookId,
                  currentBookTitle: result.currentBookTitle,
                  currentBookAuthor: result.currentBookAuthor,
                }
              : s
          )
        );

        setApiError(null);
        return result;
      } catch (error) {
        setApiError(error.message);
        setStudents(previousStudents);
        return null;
      }
    },
    [students, fetchWithAuth, setApiError]
  );

  // --- Book operations ---

  const updateBook = useCallback(
    async (id, updatedFields) => {
      const existing = books.find((b) => b.id === id);
      if (!existing) {
        return null;
      }

      const updatedBook = {
        ...existing,
        ...updatedFields,
      };

      const previousBooks = books;
      setBooks((prev) => prev.map((b) => (b.id === id ? updatedBook : b)));

      try {
        const response = await fetchWithAuth(`${API_URL}/books/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedBook),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const saved = await response.json().catch(() => null);
        if (saved && saved.id) {
          setBooks((prev) => prev.map((b) => (b.id === id ? saved : b)));
          return saved;
        }

        return updatedBook;
      } catch (error) {
        setApiError(error.message);
        setBooks(previousBooks);
        return null;
      }
    },
    [books, fetchWithAuth, setApiError]
  );

  const updateBookField = useCallback(
    async (id, field, value) => {
      if (!id || !field) return null;
      return updateBook(id, { [field]: value || null });
    },
    [updateBook]
  );

  // Add a new book (metadata: optional object with isbn, pageCount, publicationYear, etc.)
  const addBook = useCallback(
    async (title, author = null, metadata = {}) => {
      const newBook = {
        id: crypto.randomUUID(),
        title,
        author,
        genreIds: [],
        readingLevel: null,
        ageRange: null,
        description: null,
        ...metadata,
      };

      // Optimistic update
      const previousBooks = books;
      setBooks((prev) => [...prev, newBook]);

      try {
        const response = await fetchWithAuth(`${API_URL}/books`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newBook),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const savedBook = await response.json();
        setBooks((prev) => prev.map((b) => (b.id === newBook.id ? savedBook : b)));
        setApiError(null);
        return savedBook;
      } catch (error) {
        setApiError(error.message);
        setBooks(previousBooks);
        return null;
      }
    },
    [books, fetchWithAuth, setApiError]
  );

  // Find an existing book by title (case-insensitive) or create a new one
  const findOrCreateBook = useCallback(
    async (title, author = null, metadata = {}) => {
      // First, try to find an existing book with the same title (case-insensitive)
      const normalizedTitle = title.trim().toLowerCase();
      const existingBook = books.find((book) => book.title.toLowerCase() === normalizedTitle);

      if (existingBook) {
        // If we found a book and author is provided but book doesn't have one, update it
        if (author && !existingBook.author) {
          const updatedBook = await updateBook(existingBook.id, { author });
          return updatedBook || existingBook;
        }
        return existingBook;
      }

      // No existing book found, create a new one with any metadata from external search
      return addBook(title, author, metadata);
    },
    [books, addBook, updateBook]
  );

  // Fetch full book details by ID (for on-demand loading when books are loaded minimally)
  const fetchBookDetails = useCallback(
    async (bookId) => {
      try {
        const response = await fetchWithAuth(`${API_URL}/books/${bookId}`);
        if (!response.ok) return null;
        const fullBook = await response.json();
        // Merge full details into the books array so subsequent lookups are instant
        setBooks((prev) => prev.map((b) => (b.id === bookId ? fullBook : b)));
        return fullBook;
      } catch {
        return null;
      }
    },
    [fetchWithAuth]
  );

  // --- Reading session operations ---

  const addReadingSession = useCallback(
    async (studentId, sessionData) => {
      const date = sessionData.date || new Date().toISOString().split('T')[0];
      const sessionPayload = {
        date,
        assessment: sessionData.assessment,
        notes: sessionData.notes || '',
        bookId: sessionData.bookId || null,
        bookTitle: sessionData.bookTitle || null,
        bookAuthor: sessionData.bookAuthor || null,
        pagesRead: sessionData.pagesRead || null,
        duration: sessionData.duration || null,
        location: sessionData.location || 'school',
      };

      try {
        const response = await fetchWithAuth(`${API_URL}/students/${studentId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionPayload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `API error: ${response.status}`);
        }

        const savedSession = await response.json();

        // Update student summary fields (lastReadDate, currentBook, totalSessionCount)
        // Skip for absent/no-record markers — they aren't real reading sessions
        const isMarker =
          sessionPayload.notes &&
          (sessionPayload.notes.includes('[ABSENT]') ||
            sessionPayload.notes.includes('[NO_RECORD]'));
        setStudents((prev) =>
          prev.map((s) => {
            if (s.id !== studentId) return s;
            if (isMarker) return s;
            const newLastRead =
              !s.lastReadDate || date > s.lastReadDate ? date : s.lastReadDate;
            return {
              ...s,
              lastReadDate: newLastRead,
              totalSessionCount: (s.totalSessionCount || 0) + 1,
              ...(sessionPayload.bookId && {
                currentBookId: sessionPayload.bookId,
                currentBookTitle: sessionPayload.bookTitle,
                currentBookAuthor: sessionPayload.bookAuthor,
              }),
            };
          })
        );

        setApiError(null);
        return savedSession;
      } catch (error) {
        setApiError(error.message);
        return null;
      }
    },
    [fetchWithAuth, setApiError]
  );

  const editReadingSession = useCallback(
    async (studentId, sessionId, updatedSessionData) => {
      const sessionPayload = {
        date: updatedSessionData.date,
        bookId: updatedSessionData.bookId || null,
        bookTitle: updatedSessionData.bookTitle || null,
        bookAuthor: updatedSessionData.bookAuthor || null,
        pagesRead: updatedSessionData.pagesRead || null,
        duration: updatedSessionData.duration || null,
        assessment: updatedSessionData.assessment || null,
        notes: updatedSessionData.notes || null,
      };

      try {
        const response = await fetchWithAuth(
          `${API_URL}/students/${studentId}/sessions/${sessionId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionPayload),
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        // Update student's current book info if the session has a book
        setStudents((prev) =>
          prev.map((s) => {
            if (s.id !== studentId) return s;
            return {
              ...s,
              ...(sessionPayload.bookId && {
                currentBookId: sessionPayload.bookId,
                currentBookTitle: sessionPayload.bookTitle,
                currentBookAuthor: sessionPayload.bookAuthor,
              }),
            };
          })
        );

        setApiError(null);
      } catch (error) {
        setApiError(error.message);
      }
    },
    [fetchWithAuth, setApiError]
  );

  const deleteReadingSession = useCallback(
    async (studentId, sessionId) => {
      try {
        const response = await fetchWithAuth(
          `${API_URL}/students/${studentId}/sessions/${sessionId}`,
          {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        // Decrement session count on student summary
        setStudents((prev) =>
          prev.map((s) => {
            if (s.id !== studentId) return s;
            return { ...s, totalSessionCount: Math.max(0, (s.totalSessionCount || 0) - 1) };
          })
        );

        setApiError(null);
        return true;
      } catch (error) {
        setApiError(error.message);
        return false;
      }
    },
    [fetchWithAuth, setApiError]
  );

  // --- Settings management ---

  const updateSettings = useCallback(
    async (newSettings) => {
      // Optimistic update
      const previousSettings = settings;
      setSettings(newSettings);

      // Also update derived state if needed
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

        // Update derived state from server response
        if (savedSettings.readingStatusSettings) {
          setReadingStatusSettings(savedSettings.readingStatusSettings);
        }

        setApiError(null);
        return savedSettings;
      } catch (error) {
        setApiError(error.message);
        setSettings(previousSettings);
        // Revert derived state
        if (previousSettings.readingStatusSettings) {
          setReadingStatusSettings(previousSettings.readingStatusSettings);
        }
        throw error;
      }
    },
    [settings, fetchWithAuth, setApiError]
  );

  // --- Genre management ---

  const addGenre = useCallback(
    async (genreData) => {
      const newGenre = {
        id: crypto.randomUUID(),
        name: genreData.name,
        isPredefined: false,
      };

      // Optimistic update
      const previousGenres = genres;
      setGenres((prev) => [...prev, newGenre]);

      try {
        const response = await fetchWithAuth(`${API_URL}/genres`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newGenre),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const savedGenre = await response.json();
        setGenres((prev) => prev.map((g) => (g.id === newGenre.id ? savedGenre : g)));
        setApiError(null);
        return savedGenre;
      } catch (error) {
        setApiError(error.message);
        setGenres(previousGenres);
        return null;
      }
    },
    [genres, fetchWithAuth, setApiError]
  );

  // --- Class management ---

  const addClass = useCallback(
    async (classData) => {
      const newClass = {
        id: crypto.randomUUID(),
        name: classData.name,
        teacherName: classData.teacherName || '',
        disabled: false,
      };

      // Optimistic update
      const previousClasses = classes;
      setClasses((prev) => [...prev, newClass]);

      try {
        const response = await fetchWithAuth(`${API_URL}/classes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newClass),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const savedClass = await response.json();
        setClasses((prev) => prev.map((c) => (c.id === newClass.id ? savedClass : c)));
        setApiError(null);
        return savedClass;
      } catch (error) {
        setApiError(error.message);
        setClasses(previousClasses);
        return null;
      }
    },
    [classes, fetchWithAuth, setApiError]
  );

  const updateClass = useCallback(
    async (id, updatedFields) => {
      const existing = classes.find((c) => c.id === id);
      if (!existing) {
        return null;
      }

      const updatedClass = {
        ...existing,
        ...updatedFields,
      };

      // Optimistic update
      const previousClasses = classes;
      setClasses((prev) => prev.map((c) => (c.id === id ? updatedClass : c)));

      try {
        const response = await fetchWithAuth(`${API_URL}/classes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedClass),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const savedClass = await response.json();
        setClasses((prev) => prev.map((c) => (c.id === id ? savedClass : c)));
        setApiError(null);
        return savedClass;
      } catch (error) {
        setApiError(error.message);
        setClasses(previousClasses);
        return null;
      }
    },
    [classes, fetchWithAuth, setApiError]
  );

  const deleteClass = useCallback(
    async (id) => {
      // Optimistic update
      const previousClasses = classes;
      setClasses((prev) => prev.filter((c) => c.id !== id));

      // Also unassign students from this class
      const previousStudents = students;
      setStudents((prev) => prev.map((s) => (s.classId === id ? { ...s, classId: null } : s)));

      try {
        const response = await fetchWithAuth(`${API_URL}/classes/${id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        setApiError(null);
      } catch (error) {
        setApiError(error.message);
        setClasses(previousClasses);
        setStudents(previousStudents);
      }
    },
    [classes, students, fetchWithAuth, setApiError]
  );

  // --- Data Export/Import ---

  const exportToJson = useCallback(async () => {
    try {
      const response = await fetchWithAuth(`${API_URL}/data`);
      if (!response.ok) {
        throw new Error(`Failed to fetch data for export: ${response.status}`);
      }

      const data = await response.json();

      // Create a blob and trigger download
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

            // Reload data to reflect changes
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
