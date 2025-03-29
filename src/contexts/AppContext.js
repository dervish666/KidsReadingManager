import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'; // Added useMemo, useCallback
import { v4 as uuidv4 } from 'uuid';

// Create context
const AppContext = createContext();

// API URL - will be proxied through nginx
const API_URL = '/api';

// Custom hook to use the app context
export const useAppContext = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  // State for students
  const [students, setStudents] = useState([]);
  // State for loading status
  const [loading, setLoading] = useState(true);
  // State for API errors
  const [apiError, setApiError] = useState(null);
  // State for preferred number of priority students to display
  const [priorityStudentCount, setPriorityStudentCount] = useState(8);
  // State for reading status durations (in days)
  const [readingStatusSettings, setReadingStatusSettings] = useState({
    recentlyReadDays: 14,
    needsAttentionDays: 21
  });

  // Load data from API on initial render
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true); // Ensure loading is true at the start
      try {
        // Fetch students
        const studentsResponse = await fetch(`${API_URL}/students`);
        if (!studentsResponse.ok) {
          throw new Error(`API error fetching students: ${studentsResponse.status}`);
        }
        const studentsData = await studentsResponse.json();
        console.log('Loaded students from API:', studentsData);
        setStudents(studentsData);

        // Fetch settings
        try {
          const settingsResponse = await fetch(`${API_URL}/settings`);
          if (settingsResponse.ok) {
            const settingsData = await settingsResponse.json();
            if (settingsData.readingStatusSettings) {
              setReadingStatusSettings(settingsData.readingStatusSettings);
            }
          } else {
             // Log non-OK response for settings, but don't throw error
             console.warn(`API error fetching settings: ${settingsResponse.status}`);
          }
        } catch (settingsError) {
          console.error('Error fetching settings:', settingsError);
          // Continue with default settings if there's an error
        }

        setApiError(null);
      } catch (error) {
        console.error('Error fetching data:', error);
        setApiError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); // Empty dependency array ensures this runs only once on mount

  // --- Memoized Functions ---

  const addStudent = useCallback(async (name) => {
    const newStudent = {
      id: uuidv4(),
      name,
      lastReadDate: null,
      readingSessions: []
    };

    // Optimistic UI update
    const previousStudents = students;
    setStudents(prevStudents => [...prevStudents, newStudent]);

    try {
      const response = await fetch(`${API_URL}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStudent),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const savedStudent = await response.json();
      // Update the added student with data from server (if different, e.g., _rev)
      setStudents(prevStudents => prevStudents.map(s => s.id === newStudent.id ? savedStudent : s));
      setApiError(null);
      return savedStudent;
    } catch (error) {
      console.error('Error adding student:', error);
      setApiError(error.message);
      // Revert optimistic update on error
      setStudents(previousStudents);
      return null; // Indicate failure
    }
  }, [students]); // Dependency: students (to get previous state for revert)

  const updateStudent = useCallback(async (id, updatedData) => {
    const currentStudent = students.find(student => student.id === id);
    if (!currentStudent) {
      console.error('Update failed: Student not found');
      return; // Or throw error
    }
    const updatedStudent = { ...currentStudent, ...updatedData };

    // Optimistic UI update
    const previousStudents = students;
    setStudents(prevStudents =>
      prevStudents.map(student =>
        student.id === id ? updatedStudent : student
      )
    );

    try {
      const response = await fetch(`${API_URL}/students/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedStudent),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      setApiError(null);
    } catch (error) {
      console.error('Error updating student:', error);
      setApiError(error.message);
      // Revert optimistic update
      setStudents(previousStudents);
    }
  }, [students]); // Dependency: students (to find current student and for revert)

  const deleteStudent = useCallback(async (id) => {
     // Optimistic UI update
     const previousStudents = students;
     setStudents(prevStudents => prevStudents.filter(student => student.id !== id));

    try {
      const response = await fetch(`${API_URL}/students/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      setApiError(null);
    } catch (error) {
      console.error('Error deleting student:', error);
      setApiError(error.message);
      // Revert optimistic update
      setStudents(previousStudents);
    }
  }, [students]); // Dependency: students (for revert)

  const addReadingSession = useCallback(async (studentId, sessionData) => {
    const date = sessionData.date || new Date().toISOString().split('T')[0];
    const newSession = {
      id: uuidv4(),
      date,
      assessment: sessionData.assessment,
      notes: sessionData.notes || ''
    };

    const student = students.find(s => s.id === studentId);
    if (!student) {
        console.error('Add session failed: Student not found');
        return null;
    }

    const updatedReadingSessions = [newSession, ...student.readingSessions];
    let mostRecentDate = date;
    for (const session of updatedReadingSessions) {
      if (session.date && new Date(session.date) > new Date(mostRecentDate)) {
        mostRecentDate = session.date;
      }
    }
    const updatedStudent = {
      ...student,
      lastReadDate: mostRecentDate,
      readingSessions: updatedReadingSessions
    };

    // Optimistic UI update
    const previousStudents = students;
    setStudents(prevStudents =>
      prevStudents.map(s => s.id === studentId ? updatedStudent : s)
    );

    try {
      const response = await fetch(`${API_URL}/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedStudent),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      setApiError(null);
      return newSession; // Return the added session on success
    } catch (error) {
      console.error('Error adding reading session:', error);
      setApiError(error.message);
      // Revert optimistic update
      setStudents(previousStudents);
      return null; // Indicate failure
    }
  }, [students]); // Dependency: students (to find student and for revert)

  const editReadingSession = useCallback(async (studentId, sessionId, updatedSessionData) => {
    const student = students.find(s => s.id === studentId);
    if (!student) {
        console.error('Edit session failed: Student not found');
        return;
    }

    const updatedReadingSessions = student.readingSessions.map(session =>
      session.id === sessionId ? { ...session, ...updatedSessionData } : session
    );
    let mostRecentDate = null;
    for (const session of updatedReadingSessions) {
      if (session.date && (!mostRecentDate || new Date(session.date) > new Date(mostRecentDate))) {
        mostRecentDate = session.date;
      }
    }
    const updatedStudent = {
      ...student,
      lastReadDate: mostRecentDate,
      readingSessions: updatedReadingSessions
    };

    // Optimistic UI update
    const previousStudents = students;
    setStudents(prevStudents =>
      prevStudents.map(s => s.id === studentId ? updatedStudent : s)
    );

    try {
      const response = await fetch(`${API_URL}/students/${studentId}`, {
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
      // Revert optimistic update
      setStudents(previousStudents);
    }
  }, [students]); // Dependency: students (to find student and for revert)

  const deleteReadingSession = useCallback(async (studentId, sessionId) => {
    const student = students.find(s => s.id === studentId);
     if (!student) {
        console.error('Delete session failed: Student not found');
        return;
    }

    const updatedReadingSessions = student.readingSessions.filter(
      session => session.id !== sessionId
    );
    let mostRecentDate = null;
    for (const session of updatedReadingSessions) {
      if (session.date && (!mostRecentDate || new Date(session.date) > new Date(mostRecentDate))) {
        mostRecentDate = session.date;
      }
    }
    const updatedStudent = {
      ...student,
      lastReadDate: mostRecentDate,
      readingSessions: updatedReadingSessions
    };

    // Optimistic UI update
    const previousStudents = students;
    setStudents(prevStudents =>
      prevStudents.map(s => s.id === studentId ? updatedStudent : s)
    );

    try {
      const response = await fetch(`${API_URL}/students/${studentId}`, {
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
      // Revert optimistic update
      setStudents(previousStudents);
    }
  }, [students]); // Dependency: students (to find student and for revert)

  const updatePriorityStudentCount = useCallback((count) => {
    setPriorityStudentCount(count);
  }, []); // No dependencies

  const updateReadingStatusSettings = useCallback(async (newSettings) => {
    // Optimistic update
    const previousSettings = readingStatusSettings;
    setReadingStatusSettings(newSettings);

    try {
      const response = await fetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readingStatusSettings: newSettings }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      setApiError(null);
    } catch (error) {
      console.error('Error updating settings:', error);
      setApiError(error.message);
      // Revert optimistic update
      setReadingStatusSettings(previousSettings);
    }
  }, [readingStatusSettings]); // Dependency: readingStatusSettings (for revert)

  const getReadingStatus = useCallback((student) => {
    if (!student?.lastReadDate) return 'notRead'; // Added optional chaining

    const lastReadDate = new Date(student.lastReadDate);
    const today = new Date();
    // Ensure dates are compared at the start of the day for consistency
    today.setHours(0, 0, 0, 0);
    lastReadDate.setHours(0, 0, 0, 0);

    const diffTime = today - lastReadDate; // No need for Math.abs if today is always >= lastReadDate for status calculation
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= readingStatusSettings.recentlyReadDays) return 'recentlyRead';
    if (diffDays <= readingStatusSettings.needsAttentionDays) return 'needsAttention';
    return 'notRead';
  }, [readingStatusSettings]); // Dependency: readingStatusSettings

  const exportToCsv = useCallback(() => {
    let csv = 'Student Name,Last Read Date,Total Sessions\n';
    students.forEach(student => {
      const lastReadDate = student.lastReadDate || 'Never';
      const totalSessions = student.readingSessions.length;
      csv += `"${student.name}","${lastReadDate}",${totalSessions}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'reading-tracker-export.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // Clean up object URL
  }, [students]); // Dependency: students

  const exportToJson = useCallback(async () => {
    let dataToExport;
    try {
      const response = await fetch(`${API_URL}/data`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      dataToExport = await response.json();
      setApiError(null);
    } catch (error) {
      console.error('Error exporting data from API, falling back to local state:', error);
      setApiError(error.message);
      // Fallback to using local state if API fails
      dataToExport = { students, settings: { readingStatusSettings } }; // Include settings in fallback
    }

    // Add export metadata
    dataToExport.exportDate = new Date().toISOString();
    dataToExport.version = '1.1'; // Increment version if format changes

    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'reading-tracker-data.json');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // Clean up object URL
  }, [students, readingStatusSettings]); // Dependency: students, readingStatusSettings (for fallback)

  const importFromJson = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (!data.students || !Array.isArray(data.students)) {
            reject(new Error('Invalid data format: missing students array'));
            return;
          }

          // Also import settings if available
          const importedSettings = data.settings?.readingStatusSettings;

          // Optimistic update (local state first)
          setStudents(data.students);
          if (importedSettings) {
              setReadingStatusSettings(importedSettings);
          }

          // Send data to API
          try {
            const response = await fetch(`${API_URL}/data`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data), // Send original data including settings
            });
            if (!response.ok) {
              throw new Error(`API error: ${response.status}`);
            }
            setApiError(null);
            resolve(data.students.length);
          } catch (apiError) {
            console.error('Error sending imported data to API:', apiError);
            setApiError(apiError.message);
            // Keep optimistic update even if API fails
            resolve(data.students.length);
          }
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }, []); // No dependencies needed if API handles state persistence primarily

  const saveGlobalData = useCallback(async () => {
    let dataToExport;
     try {
        const response = await fetch(`${API_URL}/data`);
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        dataToExport = await response.json();
        setApiError(null);
     } catch (error) {
        console.error('Error fetching data for global save, falling back to local state:', error);
        setApiError(error.message);
        dataToExport = { students, settings: { readingStatusSettings } };
     }

     dataToExport.exportDate = new Date().toISOString();
     dataToExport.version = '1.1';

    try {
      if ('showSaveFilePicker' in window) {
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const options = {
          suggestedName: 'reading-tracker-global-data.json',
          types: [{ description: 'JSON Files', accept: {'application/json': ['.json']} }],
        };
        const fileHandle = await window.showSaveFilePicker(options);
        const writable = await fileHandle.createWritable();
        await writable.write(jsonString);
        await writable.close();
        return { success: true };
      } else {
        // Fallback for browsers that don't support the API
        exportToJson(); // Reuse existing export logic
        return { success: true, fallback: true, message: 'Direct file save not supported. Data downloaded instead.' };
      }
    } catch (error) {
      // Handle user cancellation of save dialog gracefully
      if (error.name === 'AbortError') {
          console.log('User cancelled the save dialog.');
          return { success: false, error: 'Save cancelled by user.' };
      }
      console.error('Error saving global data:', error);
      setApiError(error.message);
      return { success: false, error: error.message || 'Unknown error saving global data' };
    }
  }, [students, readingStatusSettings, exportToJson]); // Dependencies for fallback and exportToJson

  const loadGlobalData = useCallback(async () => {
    if (!('showOpenFilePicker' in window)) {
      return { success: false, error: 'Direct file open not supported. Use Import button.' };
    }
    try {
      const options = {
        types: [{ description: 'JSON Files', accept: {'application/json': ['.json']} }],
        multiple: false
      };
      const [fileHandle] = await window.showOpenFilePicker(options);
      const file = await fileHandle.getFile();
      const contents = await file.text();

      try {
        const data = JSON.parse(contents);
        if (!data.students || !Array.isArray(data.students)) {
          return { success: false, error: 'Invalid data format: missing students array' };
        }

        const importedSettings = data.settings?.readingStatusSettings;

        // Optimistic update
        setStudents(data.students);
         if (importedSettings) {
            setReadingStatusSettings(importedSettings);
        }

        // Send data to API
        try {
          const response = await fetch(`${API_URL}/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          if (!response.ok) throw new Error(`API error: ${response.status}`);
          setApiError(null);
        } catch (apiError) {
          console.error('Error sending loaded global data to API:', apiError);
          setApiError(apiError.message);
          // Keep optimistic update
        }
        return { success: true, count: data.students.length };
      } catch (error) {
        return { success: false, error: `Failed to parse JSON: ${error.message}` };
      }
    } catch (error) {
       // Handle user cancellation of open dialog gracefully
       if (error.name === 'AbortError') {
           console.log('User cancelled the open dialog.');
           return { success: false, error: 'Open cancelled by user.' };
       }
      console.error('Error loading global data:', error);
      setApiError(error.message);
      return { success: false, error: error.message || 'Unknown error loading global data' };
    }
  }, []); // No dependencies needed if API handles state

  const bulkImportStudents = useCallback(async (names) => {
    const newStudents = names.map(name => ({
      id: uuidv4(),
      name: name.trim(),
      lastReadDate: null,
      readingSessions: []
    })).filter(s => s.name); // Filter out empty names

    if (newStudents.length === 0) return []; // Return early if no valid names

    // Optimistic update
    const previousStudents = students;
    setStudents(prevStudents => [...prevStudents, ...newStudents]);

    try {
      const response = await fetch(`${API_URL}/students/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStudents),
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      setApiError(null);
      // Potentially update local state with response if server modifies data
      // const savedStudents = await response.json();
      // setStudents(prev => [...prev.filter(s => !newStudents.some(ns => ns.id === s.id)), ...savedStudents]);
    } catch (error) {
      console.error('Error bulk importing students:', error);
      setApiError(error.message);
      // Revert optimistic update
      setStudents(previousStudents);
      return []; // Indicate failure
    }
    return newStudents;
  }, [students]); // Dependency: students (for revert)

  // --- Memoized Derived Data ---

  const studentsSortedByPriority = useMemo(() => {
    console.log("Recalculating studentsSortedByPriority"); // Add log for debugging
    return [...students].sort((a, b) => {
      if (!a.lastReadDate) return -1;
      if (!b.lastReadDate) return 1;
      return new Date(a.lastReadDate) - new Date(b.lastReadDate);
    });
  }, [students]); // Dependency: students

  const prioritizedStudents = useMemo(() => {
    console.log("Recalculating prioritizedStudents"); // Add log for debugging
    return [...students]
      .sort((a, b) => {
        if (!a.lastReadDate && !b.lastReadDate) return a.readingSessions.length - b.readingSessions.length;
        if (!a.lastReadDate) return -1;
        if (!b.lastReadDate) return 1;
        const dateComparison = new Date(a.lastReadDate) - new Date(b.lastReadDate);
        if (dateComparison !== 0) return dateComparison;
        return a.readingSessions.length - b.readingSessions.length;
      })
      .slice(0, priorityStudentCount);
  }, [students, priorityStudentCount]); // Dependencies: students, priorityStudentCount

  // --- Memoized Context Value ---

  const contextValue = useMemo(() => ({
    students,
    loading,
    apiError,
    priorityStudentCount,
    readingStatusSettings,
    studentsSortedByPriority, // Provide memoized list
    prioritizedStudents,      // Provide memoized list
    addStudent,
    updateStudent,
    deleteStudent,
    addReadingSession,
    editReadingSession,
    deleteReadingSession,
    updatePriorityStudentCount,
    updateReadingStatusSettings,
    getReadingStatus,
    exportToCsv,
    exportToJson,
    importFromJson,
    saveGlobalData,
    loadGlobalData,
    bulkImportStudents
    // Removed getStudentsByReadingPriority and getPrioritizedStudents functions
    // as we now provide the memoized lists directly.
  }), [
    students,
    loading,
    apiError,
    priorityStudentCount,
    readingStatusSettings,
    studentsSortedByPriority, // Add memoized list to dependencies
    prioritizedStudents,      // Add memoized list to dependencies
    addStudent,
    updateStudent,
    deleteStudent,
    addReadingSession,
    editReadingSession,
    deleteReadingSession,
    updatePriorityStudentCount,
    updateReadingStatusSettings,
    getReadingStatus,
    exportToCsv,
    exportToJson,
    importFromJson,
    saveGlobalData,
    loadGlobalData,
    bulkImportStudents
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};