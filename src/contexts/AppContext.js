import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'; // Added useMemo, useCallback
import { v4 as uuidv4 } from 'uuid';

// Create context
const AppContext = createContext();

// API URL - relative path since frontend and API are served from the same origin
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
  // State for classes
  const [classes, setClasses] = useState([]); // <-- ADDED
  // State for recently accessed students (for quick access in dropdowns)
  const [recentlyAccessedStudents, setRecentlyAccessedStudents] = useState(() => {
    const stored = sessionStorage.getItem('recentlyAccessedStudents');
    return stored ? JSON.parse(stored) : [];
  });

  // Function to fetch/reload data from the server
  const reloadDataFromServer = useCallback(async () => {
    setLoading(true);
    setApiError(null); // Clear previous errors
    console.log('Reloading data from server...');
    try {
      // Fetch students
      const studentsResponse = await fetch(`${API_URL}/students`);
      if (!studentsResponse.ok) {
        throw new Error(`API error fetching students: ${studentsResponse.status}`);
      }
      const studentsData = await studentsResponse.json();
      console.log('Loaded students from API:', studentsData);
      // Ensure all students have a classId, default to null
      const studentsWithClassId = studentsData.map(student => ({
        ...student,
        classId: student.classId !== undefined ? student.classId : null
      }));
      setStudents(studentsWithClassId);

      // Fetch classes
      try {
        const classesResponse = await fetch(`${API_URL}/classes`); // <-- ADDED
        if (classesResponse.ok) { // <-- ADDED
          const classesData = await classesResponse.json(); // <-- ADDED
          console.log('Loaded classes from API:', classesData); // <-- ADDED
          setClasses(classesData); // <-- ADDED
        } else { // <-- ADDED
          console.warn(`API error fetching classes: ${classesResponse.status}`); // <-- ADDED
          // Don't throw error, maybe classes endpoint doesn't exist yet
          setClasses([]); // <-- ADDED: Reset classes if fetch fails
        } // <-- ADDED
      } catch (classesError) { // <-- ADDED
        console.error('Error fetching classes:', classesError); // <-- ADDED
        setClasses([]); // <-- ADDED: Reset classes on error
      } // <-- ADDED

      // Fetch settings
      try {
        const settingsResponse = await fetch(`${API_URL}/settings`);
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          if (settingsData.readingStatusSettings) {
            setReadingStatusSettings(settingsData.readingStatusSettings);
          }
        } else {
           console.warn(`API error fetching settings: ${settingsResponse.status}`);
        }
      } catch (settingsError) {
        console.error('Error fetching settings:', settingsError);
      }
      return { success: true }; // Indicate success
    } catch (error) {
      console.error('Error reloading data:', error);
      setApiError(error.message);
      return { success: false, error: error.message }; // Indicate failure
    } finally {
      setLoading(false);
    }
  }, []); // No dependencies needed as it fetches fresh data

  // Load data from API on initial render
  useEffect(() => {
    reloadDataFromServer();
  }, [reloadDataFromServer]); // Dependency ensures it runs once on mount

  // --- Memoized Functions ---

  const addStudent = useCallback(async (name, classId = null) => { // Accept classId
    const newStudent = {
      id: uuidv4(),
      name,
      lastReadDate: null,
      readingSessions: [],
      classId: classId // Use the passed classId
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

// --- Class Management Functions ---

  const addClass = useCallback(async (classData) => {
    const newClass = {
      id: uuidv4(),
      name: classData.name,
      teacherName: classData.teacherName || '',
      disabled: classData.disabled || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Optimistic UI update
    const previousClasses = classes;
    setClasses(prevClasses => [...prevClasses, newClass]);

    try {
      const response = await fetch(`${API_URL}/classes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newClass),
      });

      if (!response.ok) {
        throw new Error(`API error adding class: ${response.status}`);
      }

      const savedClass = await response.json();
      // Update the added class with data from server (if different)
      setClasses(prevClasses => prevClasses.map(c => c.id === newClass.id ? savedClass : c));
      setApiError(null);
      return savedClass;
    } catch (error) {
      console.error('Error adding class:', error);
      setApiError(error.message);
      // Revert optimistic update on error
      setClasses(previousClasses);
      return null; // Indicate failure
    }
  }, [classes]); // Dependency: classes (for revert)

  const updateClass = useCallback(async (id, updatedData) => {
    const currentClass = classes.find(c => c.id === id);
    if (!currentClass) {
      console.error('Update failed: Class not found');
      setApiError('Update failed: Class not found');
      return;
    }
    const updatedClass = {
      ...currentClass,
      ...updatedData,
      updatedAt: new Date().toISOString(), // Ensure updatedAt is updated
    };

    // Optimistic UI update
    const previousClasses = classes;
    setClasses(prevClasses =>
      prevClasses.map(c => (c.id === id ? updatedClass : c))
    );

    try {
      const response = await fetch(`${API_URL}/classes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedClass),
      });

      if (!response.ok) {
        throw new Error(`API error updating class: ${response.status}`);
      }
      setApiError(null);
    } catch (error) {
      console.error('Error updating class:', error);
      setApiError(error.message);
      // Revert optimistic update
      setClasses(previousClasses);
    }
  }, [classes]); // Dependency: classes (for revert)

  const deleteClass = useCallback(async (id) => {
     // Optimistic UI update
     const previousClasses = classes;
     const previousStudents = students; // Need to potentially update students too

     setClasses(prevClasses => prevClasses.filter(c => c.id !== id));
     // Unassign students from the deleted class
     setStudents(prevStudents =>
        prevStudents.map(student =>
            student.classId === id ? { ...student, classId: null } : student
        )
     );


    try {
      const response = await fetch(`${API_URL}/classes/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        // Special handling for 409 Conflict (e.g., class still has students on backend)
        if (response.status === 409) {
             const errorData = await response.json();
             throw new Error(errorData.message || `API error: ${response.status} - Class might not be empty.`);
        }
        throw new Error(`API error deleting class: ${response.status}`);
      }
      setApiError(null);
      // Note: Backend should handle unassigning students if necessary,
      // but we also do it optimistically. If backend fails, we revert.
    } catch (error) {
      console.error('Error deleting class:', error);
      setApiError(error.message);
      // Revert optimistic update for both classes and students
      setClasses(previousClasses);
      setStudents(previousStudents);
    }
  }, [classes, students]); // Dependencies: classes, students (for revert)

  const updateStudentClassId = useCallback(async (studentId, newClassId) => {
    const student = students.find(s => s.id === studentId);
    if (!student) {
        console.error('Update class assignment failed: Student not found');
        setApiError('Update class assignment failed: Student not found');
        return;
    }

    // Ensure newClassId is null or a valid class ID
    const targetClassId = newClassId === 'unassigned' || newClassId === '' ? null : newClassId;
    if (targetClassId !== null && !classes.some(c => c.id === targetClassId)) {
        console.error('Update class assignment failed: Target class not found');
        setApiError('Update class assignment failed: Target class not found');
        return;
    }

    const updatedStudent = { ...student, classId: targetClassId };

    // Optimistic UI update
    const previousStudents = students;
    setStudents(prevStudents =>
      prevStudents.map(s => (s.id === studentId ? updatedStudent : s))
    );

    try {
      // We use the existing updateStudent endpoint, just changing the classId
      const response = await fetch(`${API_URL}/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Send the whole updated student object
        body: JSON.stringify(updatedStudent),
      });

      if (!response.ok) {
        throw new Error(`API error updating student's class: ${response.status}`);
      }
      setApiError(null);
    } catch (error) {
      console.error("Error updating student's class:", error);
      setApiError(error.message);
      // Revert optimistic update
      setStudents(previousStudents);
    }
  }, [students, classes]); // Dependencies: students, classes (for finding student and valid classes)

  const updatePriorityStudentCount = useCallback((count) => {
    setPriorityStudentCount(count);
  }, []);

  // Function to add a student to recently accessed list
  const addRecentlyAccessedStudent = useCallback((studentId) => {
    setRecentlyAccessedStudents(prev => {
      const filtered = prev.filter(id => id !== studentId); // Remove if already exists
      const updated = [studentId, ...filtered].slice(0, 5); // Keep only 5 most recent, add to front
      sessionStorage.setItem('recentlyAccessedStudents', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Function to clear recently accessed students
  const clearRecentlyAccessedStudents = useCallback(() => {
    setRecentlyAccessedStudents([]);
    sessionStorage.removeItem('recentlyAccessedStudents');
  }, []);
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
      dataToExport = { students, classes, settings: { readingStatusSettings } }; // <-- ADDED classes
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
  }, [students, classes, readingStatusSettings]); // <-- ADDED classes dependency

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

          // Also import classes if available
          const importedClasses = data.classes; // <-- ADDED
          if (importedClasses && Array.isArray(importedClasses)) { // <-- ADDED
            setClasses(importedClasses); // <-- ADDED
          } else { // <-- ADDED
            // If classes are missing or invalid in import, reset local state
            setClasses([]); // <-- ADDED
          } // <-- ADDED

          // Also import settings if available
          const importedSettings = data.settings?.readingStatusSettings;

          // Optimistic update (local state first)
          setStudents(data.students); // Students already set above
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
  }, [classes]); // <-- ADDED classes dependency (needed for optimistic update/revert logic consistency)

  const bulkImportStudents = useCallback(async (names, classId = null) => {
    const newStudents = names.map(name => ({
      id: uuidv4(),
      name: name.trim(),
      lastReadDate: null,
      readingSessions: [],
      classId: classId // Add classId to each student
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

    // Get IDs of disabled classes
    const disabledClassIds = classes.filter(cls => cls.disabled).map(cls => cls.id);

    // Filter out students from disabled classes
    const activeStudents = students.filter(student => {
      return !student.classId || !disabledClassIds.includes(student.classId);
    });

    return [...activeStudents]
      .sort((a, b) => {
        if (!a.lastReadDate && !b.lastReadDate) return a.readingSessions.length - b.readingSessions.length;
        if (!a.lastReadDate) return -1;
        if (!b.lastReadDate) return 1;
        const dateComparison = new Date(a.lastReadDate) - new Date(b.lastReadDate);
        if (dateComparison !== 0) return dateComparison;
        return a.readingSessions.length - b.readingSessions.length;
      })
      .slice(0, priorityStudentCount);
  }, [students, classes, priorityStudentCount]); // Dependencies: students, classes, priorityStudentCount

  // --- Memoized Context Value ---

  // Define context value incrementally for diagnostics
  const contextValue = {};
  contextValue.students = students;
  contextValue.classes = classes;
  contextValue.loading = loading;
  contextValue.apiError = apiError;
  contextValue.priorityStudentCount = priorityStudentCount;
  contextValue.readingStatusSettings = readingStatusSettings;
  contextValue.studentsSortedByPriority = studentsSortedByPriority;
  contextValue.prioritizedStudents = prioritizedStudents;
  contextValue.reloadDataFromServer = reloadDataFromServer;
  contextValue.addStudent = addStudent;
  contextValue.updateStudent = updateStudent;
  contextValue.deleteStudent = deleteStudent;
  contextValue.addReadingSession = addReadingSession;
  contextValue.editReadingSession = editReadingSession;
  contextValue.deleteReadingSession = deleteReadingSession;
  contextValue.updatePriorityStudentCount = updatePriorityStudentCount;
  contextValue.updateReadingStatusSettings = updateReadingStatusSettings;
  contextValue.getReadingStatus = getReadingStatus;
  contextValue.exportToCsv = exportToCsv;
  contextValue.exportToJson = exportToJson;
  contextValue.importFromJson = importFromJson;
  contextValue.bulkImportStudents = bulkImportStudents;
  // Class Management
  contextValue.addClass = addClass;
  contextValue.updateClass = updateClass;
  contextValue.deleteClass = deleteClass;
  contextValue.updateStudentClassId = updateStudentClassId;
  // Recently accessed students for quick access in dropdowns
  contextValue.recentlyAccessedStudents = recentlyAccessedStudents;
  contextValue.addRecentlyAccessedStudent = addRecentlyAccessedStudent;
  contextValue.clearRecentlyAccessedStudents = clearRecentlyAccessedStudents;


  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};