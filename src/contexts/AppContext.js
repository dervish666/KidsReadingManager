import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { v4 as uuidv4 } from 'uuid';

// Create context
const AppContext = createContext();

// API URL - relative path since frontend and API are served from the same origin
const API_URL = '/api';
const AUTH_STORAGE_KEY = 'krm_auth_token';
const REFRESH_TOKEN_KEY = 'krm_refresh_token';
const USER_STORAGE_KEY = 'krm_user';
const AUTH_MODE_KEY = 'krm_auth_mode';

// Custom hook to use the app context
export const useAppContext = () => useContext(AppContext);

// Helper to decode JWT payload (without verification - just for reading claims)
const decodeJwtPayload = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
};

// Check if token is expired (with 60 second buffer)
const isTokenExpired = (token) => {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return true;
  return Date.now() >= (payload.exp * 1000) - 60000;
};

export const AppProvider = ({ children }) => {
  // State for students
  const [students, setStudents] = useState([]);
  // State for loading status
  const [loading, setLoading] = useState(true);
  // State for API errors
  const [apiError, setApiError] = useState(null);
  
  // Track if server auth mode has been detected
  const [serverAuthModeDetected, setServerAuthModeDetected] = useState(false);
  
  // Multi-tenant auth state - initially null until detected from server
  const [authMode, setAuthMode] = useState(() => {
    if (typeof window === 'undefined') return 'legacy';
    try {
      return window.localStorage.getItem(AUTH_MODE_KEY) || 'legacy';
    } catch {
      return 'legacy';
    }
  });
  
  // Auth token (from localStorage if present)
  const [authToken, setAuthToken] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(AUTH_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  
  // Refresh token for multi-tenant mode
  const [refreshToken, setRefreshToken] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(REFRESH_TOKEN_KEY) || null;
    } catch {
      return null;
    }
  });
  
  // User info for multi-tenant mode
  const [user, setUser] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = window.localStorage.getItem(USER_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  
  // Track if token refresh is in progress
  const refreshingToken = useRef(false);

  // State for preferred number of priority students to display
  const [priorityStudentCount, setPriorityStudentCount] = useState(8);
  // State for reading status durations (in days)
  const [readingStatusSettings, setReadingStatusSettings] = useState({
    recentlyReadDays: 14,
    needsAttentionDays: 21,
  });

  // State for general settings (including AI)
  const [settings, setSettings] = useState({});

  // State for classes
  const [classes, setClasses] = useState([]);
  // Global class filter state (persisted in sessionStorage)
  const [globalClassFilter, setGlobalClassFilter] = useState(() => {
    if (typeof window === 'undefined') return 'all';
    try {
      return window.sessionStorage.getItem('globalClassFilter') || 'all';
    } catch {
      return 'all';
    }
  });
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

  // State for marked priority students (hidden from priority list)
  const [markedPriorityStudentIds, setMarkedPriorityStudentIds] = useState(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const storedIds = window.sessionStorage.getItem('markedPriorityStudents');
      return storedIds ? new Set(JSON.parse(storedIds)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Detect auth mode from server on startup
  useEffect(() => {
    const detectAuthMode = async () => {
      try {
        console.log('[Auth] Detecting server auth mode...');
        const response = await fetch(`${API_URL}/auth/mode`);
        if (response.ok) {
          const data = await response.json();
          console.log('[Auth] Server auth mode:', data.mode);
          
          // Update auth mode based on server response
          if (data.mode === 'multitenant') {
            setAuthMode('multitenant');
            try {
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(AUTH_MODE_KEY, 'multitenant');
              }
            } catch {
              // ignore
            }
          } else {
            // If server is in legacy mode but we have multitenant tokens, clear them
            if (authMode === 'multitenant' && !authToken) {
              setAuthMode('legacy');
              try {
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem(AUTH_MODE_KEY, 'legacy');
                }
              } catch {
                // ignore
              }
            }
          }
          setServerAuthModeDetected(true);
        } else {
          console.warn('[Auth] Failed to detect auth mode, using default');
          setServerAuthModeDetected(true);
        }
      } catch (err) {
        console.error('[Auth] Error detecting auth mode:', err);
        setServerAuthModeDetected(true);
      }
    };
    
    detectAuthMode();
  }, []); // Run once on mount

  // Token refresh function for multi-tenant mode
  const refreshAccessToken = useCallback(async () => {
    if (!refreshToken || refreshingToken.current) {
      return null;
    }
    
    refreshingToken.current = true;
    
    try {
      console.log('[Auth] Refreshing access token...');
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      
      if (!response.ok) {
        console.error('[Auth] Token refresh failed:', response.status);
        // Clear all auth state on refresh failure
        clearAuthState();
        return null;
      }
      
      const data = await response.json();
      const newToken = data.accessToken;
      
      if (newToken) {
        setAuthToken(newToken);
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(AUTH_STORAGE_KEY, newToken);
          }
        } catch {
          // ignore
        }
        console.log('[Auth] Token refreshed successfully');
        return newToken;
      }
      
      return null;
    } catch (err) {
      console.error('[Auth] Token refresh error:', err);
      clearAuthState();
      return null;
    } finally {
      refreshingToken.current = false;
    }
  }, [refreshToken]);
  
  // Clear all auth state
  const clearAuthState = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
        window.localStorage.removeItem(USER_STORAGE_KEY);
        window.localStorage.removeItem(AUTH_MODE_KEY);
      }
    } catch {
      // ignore
    }
    setAuthToken(null);
    setRefreshToken(null);
    setUser(null);
    setAuthMode('legacy');
  }, []);

  // Helper: fetch with auth header + 401 handling + token refresh
  const fetchWithAuth = useCallback(
    async (url, options = {}, retryCount = 0) => {
      let currentToken = authToken;
      
      // In multi-tenant mode, check if token needs refresh
      if (authMode === 'multitenant' && currentToken && isTokenExpired(currentToken)) {
        console.log('[Auth] Token expired, attempting refresh...');
        const newToken = await refreshAccessToken();
        if (newToken) {
          currentToken = newToken;
        } else {
          setApiError('Session expired. Please log in again.');
          throw new Error('Session expired');
        }
      }
      
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };

      if (currentToken) {
        headers['Authorization'] = `Bearer ${currentToken}`;
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        // In multi-tenant mode, try to refresh token once
        if (authMode === 'multitenant' && retryCount === 0 && refreshToken) {
          console.log('[Auth] Got 401, attempting token refresh...');
          const newToken = await refreshAccessToken();
          if (newToken) {
            return fetchWithAuth(url, options, retryCount + 1);
          }
        }
        
        clearAuthState();
        setApiError('Authentication required. Please log in.');
        throw new Error('Unauthorized');
      }

      return response;
    },
    [authToken, authMode, refreshToken, refreshAccessToken, clearAuthState]
  );

  // Legacy login helper (shared password)
  const login = useCallback(
    async (password) => {
      console.log('[Auth] login() called (legacy mode)');
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
            window.localStorage.setItem(AUTH_MODE_KEY, 'legacy');
            console.log('[Auth] Stored token in localStorage');
          }
        } catch (storageErr) {
          console.warn('[Auth] Failed to store token in localStorage:', storageErr);
        }

        setAuthToken(token);
        setAuthMode('legacy');
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
  
  // Multi-tenant login with email/password
  const loginWithEmail = useCallback(
    async (email, password) => {
      console.log('[Auth] loginWithEmail() called');
      setApiError(null);

      try {
        const response = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 401) {
            throw new Error(errorData.error || 'Invalid email or password');
          }
          throw new Error(errorData.error || `Login failed: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.accessToken) {
          throw new Error('No access token returned from server');
        }

        // Store tokens and user info
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(AUTH_STORAGE_KEY, data.accessToken);
            window.localStorage.setItem(AUTH_MODE_KEY, 'multitenant');
            if (data.refreshToken) {
              window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
            }
            if (data.user) {
              window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
            }
          }
        } catch (storageErr) {
          console.warn('[Auth] Failed to store auth data:', storageErr);
        }

        setAuthToken(data.accessToken);
        setRefreshToken(data.refreshToken || null);
        setUser(data.user || null);
        setAuthMode('multitenant');
        setApiError(null);
        
        console.log('[Auth] loginWithEmail() success');
        return data.user;
      } catch (err) {
        console.error('[Auth] loginWithEmail() error:', err);
        setApiError(err.message || 'Login failed');
        throw err;
      }
    },
    []
  );
  
  // Register new organization and user
  const register = useCallback(
    async (organizationName, userName, email, password) => {
      console.log('[Auth] register() called');
      setApiError(null);

      try {
        const response = await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationName,
            name: userName,
            email,
            password
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Registration failed: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.accessToken) {
          throw new Error('No access token returned from server');
        }

        // Store tokens and user info
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(AUTH_STORAGE_KEY, data.accessToken);
            window.localStorage.setItem(AUTH_MODE_KEY, 'multitenant');
            if (data.refreshToken) {
              window.localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
            }
            if (data.user) {
              window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
            }
          }
        } catch (storageErr) {
          console.warn('[Auth] Failed to store auth data:', storageErr);
        }

        setAuthToken(data.accessToken);
        setRefreshToken(data.refreshToken || null);
        setUser(data.user || null);
        setAuthMode('multitenant');
        setApiError(null);
        
        console.log('[Auth] register() success');
        return data.user;
      } catch (err) {
        console.error('[Auth] register() error:', err);
        setApiError(err.message || 'Registration failed');
        throw err;
      }
    },
    []
  );
  
  // Request password reset
  const forgotPassword = useCallback(
    async (email) => {
      console.log('[Auth] forgotPassword() called');
      setApiError(null);

      try {
        const response = await fetch(`${API_URL}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to send reset email');
        }

        return true;
      } catch (err) {
        console.error('[Auth] forgotPassword() error:', err);
        setApiError(err.message || 'Failed to send reset email');
        throw err;
      }
    },
    []
  );
  
  // Reset password with token
  const resetPassword = useCallback(
    async (token, newPassword) => {
      console.log('[Auth] resetPassword() called');
      setApiError(null);

      try {
        const response = await fetch(`${API_URL}/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, newPassword }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to reset password');
        }

        return true;
      } catch (err) {
        console.error('[Auth] resetPassword() error:', err);
        setApiError(err.message || 'Failed to reset password');
        throw err;
      }
    },
    []
  );

  // Logout helper
  const logout = useCallback(async () => {
    // In multi-tenant mode, call logout endpoint to invalidate refresh token
    if (authMode === 'multitenant' && refreshToken) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Ignore logout API errors
      }
    }
    
    clearAuthState();
    setApiError(null);
  }, [authMode, authToken, refreshToken, clearAuthState]);

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
          setSettings(settingsData);
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
  const isMultiTenantMode = authMode === 'multitenant';
  
  // Organization info from user state
  const organization = user ? {
    id: user.organizationId,
    name: user.organizationName,
    slug: user.organizationSlug,
  } : null;
  
  // User role for RBAC
  const userRole = user?.role || null;
  
  // Permission helpers
  const canManageUsers = userRole === 'owner' || userRole === 'admin';
  const canManageStudents = userRole !== 'readonly';
  const canManageClasses = userRole !== 'readonly';
  const canManageSettings = userRole === 'owner' || userRole === 'admin';

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

  // Add a new book
  const addBook = useCallback(
    async (title, author = null) => {
      const newBook = {
        id: uuidv4(),
        title,
        author,
        genreIds: [],
        readingLevel: null,
        ageRange: null,
        description: null,
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
        console.error('Error adding book:', error);
        setApiError(error.message);
        setBooks(previousBooks);
        return null;
      }
    },
    [books, fetchWithAuth]
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

  // Settings management
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
        console.error('Error updating settings:', error);
        setApiError(error.message);
        setSettings(previousSettings);
        // Revert derived state
        if (previousSettings.readingStatusSettings) {
          setReadingStatusSettings(previousSettings.readingStatusSettings);
        }
        throw error;
      }
    },
    [settings, fetchWithAuth]
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

  // Class management
  const addClass = useCallback(
    async (classData) => {
      const newClass = {
        id: uuidv4(),
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
        console.error('Error adding class:', error);
        setApiError(error.message);
        setClasses(previousClasses);
        return null;
      }
    },
    [classes, fetchWithAuth]
  );

  const updateClass = useCallback(
    async (id, updatedFields) => {
      const existing = classes.find((c) => c.id === id);
      if (!existing) {
        console.warn('updateClass: Class not found for id', id);
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
        console.error('Error updating class:', error);
        setApiError(error.message);
        setClasses(previousClasses);
        return null;
      }
    },
    [classes, fetchWithAuth]
  );

  const deleteClass = useCallback(
    async (id) => {
      // Optimistic update
      const previousClasses = classes;
      setClasses((prev) => prev.filter((c) => c.id !== id));

      // Also unassign students from this class
      const previousStudents = students;
      setStudents((prev) =>
        prev.map((s) => (s.classId === id ? { ...s, classId: null } : s))
      );

      try {
        const response = await fetchWithAuth(`${API_URL}/classes/${id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        setApiError(null);
      } catch (error) {
        console.error('Error deleting class:', error);
        setApiError(error.message);
        setClasses(previousClasses);
        setStudents(previousStudents);
      }
    },
    [classes, students, fetchWithAuth]
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

  // Helper: Mark student as priority handled
  const markStudentAsPriorityHandled = useCallback((studentId) => {
    setMarkedPriorityStudentIds((prev) => {
      const newSet = new Set(prev).add(studentId);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('markedPriorityStudents', JSON.stringify(Array.from(newSet)));
      }
      return newSet;
    });
    // Also add to recently accessed
    addRecentlyAccessedStudent(studentId);
  }, [addRecentlyAccessedStudent]);

  // Helper: Reset priority list
  const resetPriorityList = useCallback(() => {
    setMarkedPriorityStudentIds(new Set());
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('markedPriorityStudents');
    }
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

  // Data Export/Import
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
      a.download = `reading-manager-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      return true;
    } catch (error) {
      console.error('Export failed:', error);
      setApiError(error.message);
      throw error;
    }
  }, [fetchWithAuth]);

  const importFromJson = useCallback(async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const content = e.target.result;
          const data = JSON.parse(content);
          
          const response = await fetchWithAuth(`${API_URL}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
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
          console.error('Import failed:', error);
          setApiError(error.message);
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    });
  }, [fetchWithAuth, reloadDataFromServer]);

  // Update global class filter with persistence
  const updateGlobalClassFilter = useCallback((classId) => {
    setGlobalClassFilter(classId);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem('globalClassFilter', classId);
      } catch (err) {
        console.warn('Failed to save global class filter:', err);
      }
    }
  }, []);

  // Provider value
  const value = {
    students,
    classes,
    books,
    genres,
    loading,
    apiError,
    globalClassFilter,
    setGlobalClassFilter: updateGlobalClassFilter,
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
    addBook,
    updateBook,
    updateBookField,
    addClass,
    updateClass,
    deleteClass,
    addGenre,
    settings,
    updateSettings,
    isAuthenticated,
    login,
    logout,
    fetchWithAuth,
    reloadDataFromServer,
    exportToJson,
    importFromJson,
    // Helper functions
    getReadingStatus,
    addRecentlyAccessedStudent,
    updatePriorityStudentCount,
    prioritizedStudents,
    markedPriorityStudentIds,
    markStudentAsPriorityHandled,
    resetPriorityList,
    // Multi-tenant auth
    user,
    organization,
    userRole,
    authMode,
    serverAuthModeDetected,
    isMultiTenantMode,
    loginWithEmail,
    register,
    forgotPassword,
    resetPassword,
    // Permission helpers
    canManageUsers,
    canManageStudents,
    canManageClasses,
    canManageSettings,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};