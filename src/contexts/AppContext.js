import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { v4 as uuidv4 } from 'uuid';

// Create context
const AppContext = createContext();

// API URL - relative path since frontend and API are served from the same origin
const API_URL = '/api';
const AUTH_STORAGE_KEY = 'krm_auth_token';

// Custom hook to use the app context
export const useAppContext = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  // State for students
  const [students, setStudents] = useState([]);
  // State for loading status
  const [loading, setLoading] = useState(true);
  // State for API errors
  const [apiError, setApiError] = useState(null);
  // Auth token (from localStorage if present)
  const [authToken, setAuthToken] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(AUTH_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  // State for preferred number of priority students to display
  const [priorityStudentCount, setPriorityStudentCount] = useState(8);
  // State for reading status durations (in days)
  const [readingStatusSettings, setReadingStatusSettings] = useState({
    recentlyReadDays: 14,
    needsAttentionDays: 21,
  });

  // State for classes
  const [classes, setClasses] = useState([]);
  // State for books
  const [books, setBooks] = useState([]);
  // State for genres
  const [genres, setGenres] = useState([]);
  // Recently accessed students (for quick access in dropdowns)
  const [recentlyAccessedStudents, setRecentlyAccessedStudents] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = window.sessionStorage.getItem('recentlyAccessedStudents');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Helper: fetch with auth header + 401 handling
  const fetchWithAuth = useCallback(
    async (url, options = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };

      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.removeItem(AUTH_STORAGE_KEY);
          }
        } catch {
          // ignore
        }
        setAuthToken(null);
        setApiError('Authentication required. Please log in.');
        throw new Error('Unauthorized');
      }

      return response;
    },
    [authToken]
  );

  // Login helper (with diagnostics)
  const login = useCallback(
    async (password) => {
      console.log('[Auth] login() called');
      setApiError(null);

      try {
        console.log('[Auth] Sending POST to /api/login');
        const response = await fetch(`${API_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });

        console.log('[Auth] /api/login response status:', response.status);

        if (!response.ok) {
          let errorText = '';
          try {
            errorText = await response.text();
          } catch {
            // ignore
          }
          console.error('[Auth] /api/login non-OK response body:', errorText);

          if (response.status === 401) {
            throw new Error('Invalid password');
          }
          throw new Error(`Login failed: ${response.status} ${response.statusText}`);
        }

        let data;
        try {
          data = await response.json();
        } catch (err) {
          console.error('[Auth] Failed to parse /api/login JSON:', err);
          throw new Error('Login failed: invalid JSON response');
        }

        console.log('[Auth] /api/login response JSON:', data);

        const token = data && data.token;
        if (!token) {
          console.error('[Auth] No token field in /api/login response');
          throw new Error('No token returned from server');
        }

        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(AUTH_STORAGE_KEY, token);
            console.log('[Auth] Stored token in localStorage');
          }
        } catch (storageErr) {
          console.warn('[Auth] Failed to store token in localStorage:', storageErr);
        }

        setAuthToken(token);
        setApiError(null);
        console.log('[Auth] login() success, authToken state updated');
      } catch (err) {
        console.error('[Auth] login() error:', err);
        setApiError(err.message || 'Login failed');
        throw err;
      }
    },
    []
  );

  // Logout helper
  const logout = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
    setAuthToken(null);
    setApiError(null);
  }, []);

  // Load data from API
  const reloadDataFromServer = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    console.log('[Data] Reloading data from server...');

    try {
      // Students
      const studentsResponse = await fetchWithAuth(`${API_URL}/students`);
      if (!studentsResponse.ok) {
        throw new Error(`API error fetching students: ${studentsResponse.status}`);
      }
      const studentsData = await studentsResponse.json();
      const studentsWithClassId = studentsData.map((student) => ({
        ...student,
        classId: student.classId !== undefined ? student.classId : null,
      }));
      setStudents(studentsWithClassId);

      // Classes
      try {
        const classesResponse = await fetchWithAuth(`${API_URL}/classes`);
        if (classesResponse.ok) {
          const classesData = await classesResponse.json();
          setClasses(classesData);
        } else {
          console.warn('[Data] API error fetching classes:', classesResponse.status);
          setClasses([]);
        }
      } catch (err) {
        console.error('[Data] Error fetching classes:', err);
        setClasses([]);
      }

      // Books
      try {
        const booksResponse = await fetchWithAuth(`${API_URL}/books`);
        if (booksResponse.ok) {
          const booksData = await booksResponse.json();
          setBooks(booksData);
        } else {
          console.warn('[Data] API error fetching books:', booksResponse.status);
          setBooks([]);
        }
      } catch (err) {
        console.error('[Data] Error fetching books:', err);
        setBooks([]);
      }

      // Genres
      try {
        const genresResponse = await fetchWithAuth(`${API_URL}/genres`);
        if (genresResponse.ok) {
          const genresData = await genresResponse.json();
          setGenres(genresData);
        } else {
          console.warn('[Data] API error fetching genres:', genresResponse.status);
          setGenres([]);
        }
      } catch (err) {
        console.error('[Data] Error fetching genres:', err);
        setGenres([]);
      }

      // Settings
      try {
        const settingsResponse = await fetchWithAuth(`${API_URL}/settings`);
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          if (settingsData.readingStatusSettings) {
            setReadingStatusSettings(settingsData.readingStatusSettings);
          }
        } else {
          console.warn('[Data] API error fetching settings:', settingsResponse.status);
        }
      } catch (err) {
        console.error('[Data] Error fetching settings:', err);
      }

      return { success: true };
    } catch (error) {
      console.error('[Data] Error reloading data:', error);
      if (error.message !== 'Unauthorized') {
        setApiError(error.message);
      }
      return { success: false, error: error.message };
    } finally {
      setLoading(false);
    }
  }, [fetchWithAuth]);

  // Initial load / auth-aware
  useEffect(() => {
    if (authToken) {
      console.log('[Auth] Existing token found, loading data');
      reloadDataFromServer();
    } else {
      console.log('[Auth] No token, skipping initial data load');
      setLoading(false);
    }
  }, [authToken, reloadDataFromServer]);

  // --- Derived auth state ---
  const isAuthenticated = !!authToken;

  // --- Student and session operations (unchanged, but use fetchWithAuth where appropriate) ---

  const addStudent = useCallback(
    async (name, classId = null) => {
      const newStudent = {
        id: uuidv4(),
        name,
        lastReadDate: null,
        readingSessions: [],
        classId,
      };

      const previousStudents = students;
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
        setStudents((prev) =>
          prev.map((s) => (s.id === newStudent.id ? savedStudent : s))
        );
        setApiError(null);
        return savedStudent;
      } catch (error) {
        console.error('Error adding student:', error);
        setApiError(error.message);
        setStudents(previousStudents);
        return null;
      }
    },
    [students, fetchWithAuth]
  );

  const bulkImportStudents = useCallback(
    async (names, classId = null) => {
      if (!Array.isArray(names) || names.length === 0) {
        console.error('Bulk import failed: No names provided');
        return [];
      }

      // Normalize classId - convert empty string to null
      const normalizedClassId = classId && classId.trim() !== '' ? classId : null;

      console.log('Bulk importing students:', { names, classId: normalizedClassId });

      const newStudents = names.map((name) => ({
        id: uuidv4(),
        name: name.trim(),
        classId: normalizedClassId,
        lastReadDate: null,
        readingSessions: [],
        likes: [],
        dislikes: [],
      }));

      console.log('Created student objects:', newStudents);

      const previousStudents = students;
      setStudents((prev) => [...prev, ...newStudents]);

      try {
        // Send all students in a single batch request
        const promises = newStudents.map((student) =>
          fetchWithAuth(`${API_URL}/students`, {
            method: 'POST',
            body: JSON.stringify(student),
          })
        );

        const responses = await Promise.all(promises);
        
        // Check if all responses are ok
        const allOk = responses.every((r) => r.ok);
        if (!allOk) {
          const failedResponses = responses.filter((r) => !r.ok);
          console.error('Some students failed to save:', failedResponses);
          throw new Error('Some students failed to save');
        }

        const savedStudents = await Promise.all(
          responses.map((r) => r.json().catch(() => null))
        );

        console.log('Saved students from server:', savedStudents);

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
        console.log('Bulk import completed successfully:', validSavedStudents.length, 'students');
        return validSavedStudents;
      } catch (error) {
        console.error('Error bulk importing students:', error);
        setApiError(error.message);
        setStudents(previousStudents);
        return [];
      }
    },
    [students, fetchWithAuth]
  );

  const updateStudentClassId = useCallback(
    async (studentId, classId) => {
      const student = students.find((s) => s.id === studentId);
      if (!student) {
        console.error('Update class failed: Student not found');
        return;
      }

      // Normalize classId - convert 'unassigned' string to null
      const normalizedClassId = classId === 'unassigned' || classId === '' ? null : classId;

      const updatedStudent = {
        ...student,
        classId: normalizedClassId,
      };

      const previousStudents = students;
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? updatedStudent : s))
      );

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
        console.error('Error updating student class:', error);
        setApiError(error.message);
        setStudents(previousStudents);
        throw error; // Re-throw so the component can handle it
      }
    },
    [students, fetchWithAuth]
  );

  const updateStudent = useCallback(
    async (id, updatedData) => {
      const currentStudent = students.find((student) => student.id === id);
      if (!currentStudent) {
        console.error('Update failed: Student not found');
        return;
      }
      const updatedStudent = { ...currentStudent, ...updatedData };

      const previousStudents = students;
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
        console.error('Error updating student:', error);
        setApiError(error.message);
        setStudents(previousStudents);
      }
    },
    [students, fetchWithAuth]
  );

  const deleteStudent = useCallback(
    async (id) => {
      const previousStudents = students;
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
        console.error('Error deleting student:', error);
        setApiError(error.message);
        setStudents(previousStudents);
      }
    },
    [students, fetchWithAuth]
  );

  // Book helpers
  const updateBook = useCallback(
    async (id, updatedFields) => {
      const existing = books.find((b) => b.id === id);
      if (!existing) {
        console.warn('updateBook: Book not found for id', id);
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
        console.error('Error updating book:', error);
        setApiError(error.message);
        setBooks(previousBooks);
        return null;
      }
    },
    [books, fetchWithAuth]
  );

  const updateBookField = useCallback(
    async (id, field, value) => {
      if (!id || !field) return null;
      return updateBook(id, { [field]: value || null });
    },
    [updateBook]
  );

  // Reading session helpers
  const addReadingSession = useCallback(
    async (studentId, sessionData) => {
      const date =
        sessionData.date || new Date().toISOString().split('T')[0];
      const newSession = {
        id: uuidv4(),
        date,
        assessment: sessionData.assessment,
        notes: sessionData.notes || '',
        bookId: sessionData.bookId || null,
        location: sessionData.location || 'school',
      };

      const student = students.find((s) => s.id === studentId);
      if (!student) {
        console.error('Add session failed: Student not found');
        return null;
      }

      const updatedReadingSessions = [newSession, ...student.readingSessions];
      let mostRecentDate = date;
      for (const session of updatedReadingSessions) {
        if (
          session.date &&
          new Date(session.date) > new Date(mostRecentDate)
        ) {
          mostRecentDate = session.date;
        }
      }
      const updatedStudent = {
        ...student,
        lastReadDate: mostRecentDate,
        readingSessions: updatedReadingSessions,
      };

      const previousStudents = students;
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? updatedStudent : s))
      );

      try {
        const response = await fetchWithAuth(`${API_URL}/students/${studentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedStudent),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        setApiError(null);
        return newSession;
      } catch (error) {
        console.error('Error adding reading session:', error);
        setApiError(error.message);
        setStudents(previousStudents);
        return null;
      }
    },
    [students, fetchWithAuth]
  );

  const editReadingSession = useCallback(
    async (studentId, sessionId, updatedSessionData) => {
      const student = students.find((s) => s.id === studentId);
      if (!student) {
        console.error('Edit session failed: Student not found');
        return;
      }

      const updatedReadingSessions = student.readingSessions.map((session) =>
        session.id === sessionId
          ? { ...session, ...updatedSessionData }
          : session
      );
      let mostRecentDate = null;
      for (const session of updatedReadingSessions) {
        if (
          session.date &&
          (!mostRecentDate ||
            new Date(session.date) > new Date(mostRecentDate))
        ) {
          mostRecentDate = session.date;
        }
      }
      const updatedStudent = {
        ...student,
        lastReadDate: mostRecentDate,
        readingSessions: updatedReadingSessions,
      };

      const previousStudents = students;
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? updatedStudent : s))
      );

      try {
        const response = await fetchWithAuth(`${API_URL}/students/${studentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedStudent),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        setApiError(null);
      } catch (error) {
        console.error('Error editing reading session:', error);
        setApiError(error.message);
        setStudents(previousStudents);
      }
    },
    [students, fetchWithAuth]
  );

  const deleteReadingSession = useCallback(
    async (studentId, sessionId) => {
      const student = students.find((s) => s.id === studentId);
      if (!student) {
        console.error('Delete session failed: Student not found');
        return;
      }

      const updatedReadingSessions = student.readingSessions.filter(
        (session) => session.id !== sessionId
      );
      let mostRecentDate = null;
      for (const session of updatedReadingSessions) {
        if (
          session.date &&
          (!mostRecentDate ||
            new Date(session.date) > new Date(mostRecentDate))
        ) {
          mostRecentDate = session.date;
        }
      }
      const updatedStudent = {
        ...student,
        lastReadDate: mostRecentDate,
        readingSessions: updatedReadingSessions,
      };

      const previousStudents = students;
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? updatedStudent : s))
      );

      try {
        const response = await fetchWithAuth(`${API_URL}/students/${studentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedStudent),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        setApiError(null);
      } catch (error) {
        console.error('Error deleting reading session:', error);
        setApiError(error.message);
        setStudents(previousStudents);
      }
    },
    [students, fetchWithAuth]
  );

  // Genre management
  const addGenre = useCallback(
    async (genreData) => {
      const newGenre = {
        id: uuidv4(),
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
        console.error('Error adding genre:', error);
        setApiError(error.message);
        setGenres(previousGenres);
        return null;
      }
    },
    [genres, fetchWithAuth]
  );

  // Helper: Get reading status for a student
  const getReadingStatus = useCallback(
    (student) => {
      if (!student || !student.lastReadDate) {
        return 'never';
      }

      const daysSinceLastRead = Math.floor(
        (new Date() - new Date(student.lastReadDate)) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceLastRead <= readingStatusSettings.recentlyReadDays) {
        return 'recent';
      } else if (daysSinceLastRead <= readingStatusSettings.needsAttentionDays) {
        return 'attention';
      } else {
        return 'overdue';
      }
    },
    [readingStatusSettings]
  );

  // Helper: Add student to recently accessed list
  const addRecentlyAccessedStudent = useCallback((studentId) => {
    setRecentlyAccessedStudents((prev) => {
      const updated = [studentId, ...prev.filter((id) => id !== studentId)].slice(0, 20);
      
      // Persist to sessionStorage
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem('recentlyAccessedStudents', JSON.stringify(updated));
        } catch (err) {
          console.warn('Failed to save recently accessed students:', err);
        }
      }
      
      return updated;
    });
  }, []);

  // Helper: Update priority student count
  const updatePriorityStudentCount = useCallback((count) => {
    setPriorityStudentCount(count);
  }, []);

  // Computed: Prioritized students (sorted by days since last read, descending)
  const prioritizedStudents = useMemo(() => {
    if (!Array.isArray(students)) return [];
    
    return [...students].sort((a, b) => {
      const aDate = a.lastReadDate ? new Date(a.lastReadDate) : new Date(0);
      const bDate = b.lastReadDate ? new Date(b.lastReadDate) : new Date(0);
      return aDate - bDate; // Oldest first (most in need of attention)
    });
  }, [students]);

  // Provider value
  const value = {
    students,
    classes,
    books,
    genres,
    loading,
    apiError,
    priorityStudentCount,
    setPriorityStudentCount,
    readingStatusSettings,
    setReadingStatusSettings,
    recentlyAccessedStudents,
    setRecentlyAccessedStudents,
    addStudent,
    bulkImportStudents,
    updateStudent,
    updateStudentClassId,
    deleteStudent,
    addReadingSession,
    editReadingSession,
    deleteReadingSession,
    updateBook,
    updateBookField,
    addGenre,
    isAuthenticated,
    login,
    logout,
    // Helper functions
    getReadingStatus,
    addRecentlyAccessedStudent,
    updatePriorityStudentCount,
    prioritizedStudents,
  };

  console.log('[AppContext] Provider value keys:', Object.keys(value));

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};