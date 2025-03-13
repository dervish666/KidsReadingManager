import React, { createContext, useContext, useState, useEffect } from 'react';
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

  // Load data from API on initial render
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const response = await fetch(`${API_URL}/students`);
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        const data = await response.json();
        console.log('Loaded students from API:', data);
        setStudents(data);
        setApiError(null);
      } catch (error) {
        console.error('Error fetching students:', error);
        setApiError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, []);

  // We don't need to save students on every change anymore
  // The API endpoints will handle that for individual operations

  // Add a new student
  const addStudent = async (name) => {
    const newStudent = {
      id: uuidv4(),
      name,
      lastReadDate: null,
      readingSessions: []
    };
    
    try {
      const response = await fetch(`${API_URL}/students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newStudent),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const savedStudent = await response.json();
      setStudents(prevStudents => [...prevStudents, savedStudent]);
      setApiError(null);
      return savedStudent;
    } catch (error) {
      console.error('Error adding student:', error);
      setApiError(error.message);
      // Still update the UI optimistically
      setStudents(prevStudents => [...prevStudents, newStudent]);
      return newStudent;
    }
  };

  // Update a student
  const updateStudent = async (id, updatedData) => {
    try {
      // Find the current student to merge with updates
      const currentStudent = students.find(student => student.id === id);
      if (!currentStudent) {
        throw new Error('Student not found');
      }
      
      const updatedStudent = { ...currentStudent, ...updatedData };
      
      const response = await fetch(`${API_URL}/students/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedStudent),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      // Update local state
      setStudents(prevStudents =>
        prevStudents.map(student =>
          student.id === id ? updatedStudent : student
        )
      );
      setApiError(null);
    } catch (error) {
      console.error('Error updating student:', error);
      setApiError(error.message);
      // Still update the UI optimistically
      setStudents(prevStudents =>
        prevStudents.map(student =>
          student.id === id ? { ...student, ...updatedData } : student
        )
      );
    }
  };

  // Delete a student
  const deleteStudent = async (id) => {
    try {
      const response = await fetch(`${API_URL}/students/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      // Update local state
      setStudents(prevStudents =>
        prevStudents.filter(student => student.id !== id)
      );
      setApiError(null);
    } catch (error) {
      console.error('Error deleting student:', error);
      setApiError(error.message);
      // Still update the UI optimistically
      setStudents(prevStudents =>
        prevStudents.filter(student => student.id !== id)
      );
    }
  };

  // Add a reading session for a student
  const addReadingSession = async (studentId, sessionData) => {
    const date = sessionData.date || new Date().toISOString().split('T')[0];
    const newSession = {
      id: uuidv4(),
      date,
      assessment: sessionData.assessment,
      notes: sessionData.notes || ''
    };

    try {
      // Find the current student
      const student = students.find(s => s.id === studentId);
      if (!student) {
        throw new Error('Student not found');
      }
      
      // Create updated student with new session
      const updatedStudent = {
        ...student,
        lastReadDate: date,
        readingSessions: [newSession, ...student.readingSessions]
      };
      
      // Update the student via API
      const response = await fetch(`${API_URL}/students/${studentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedStudent),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      // Update local state
      setStudents(prevStudents =>
        prevStudents.map(s => s.id === studentId ? updatedStudent : s)
      );
      setApiError(null);
    } catch (error) {
      console.error('Error adding reading session:', error);
      setApiError(error.message);
      // Still update the UI optimistically
      setStudents(prevStudents =>
        prevStudents.map(student => {
          if (student.id === studentId) {
            return {
              ...student,
              lastReadDate: date,
              readingSessions: [newSession, ...student.readingSessions]
            };
          }
          return student;
        })
      );
    }

    return newSession;
  };

  // Get students sorted by last reading date (oldest first)
  const getStudentsByReadingPriority = () => {
    return [...students].sort((a, b) => {
      // Students with no reading sessions come first
      if (!a.lastReadDate) return -1;
      if (!b.lastReadDate) return 1;
      
      // Otherwise sort by date (oldest first)
      return new Date(a.lastReadDate) - new Date(b.lastReadDate);
    });
  };

  // Get students prioritized by both last reading date and total sessions
  const getPrioritizedStudents = (count = priorityStudentCount) => {
    return [...students]
      .sort((a, b) => {
        // First priority: Students with no reading sessions
        if (!a.lastReadDate && !b.lastReadDate) {
          // If both have no sessions, sort by total sessions (ascending)
          return a.readingSessions.length - b.readingSessions.length;
        }
        if (!a.lastReadDate) return -1;
        if (!b.lastReadDate) return 1;
        
        // Second priority: Sort by date (oldest first)
        const dateComparison = new Date(a.lastReadDate) - new Date(b.lastReadDate);
        if (dateComparison !== 0) return dateComparison;
        
        // Third priority: If dates are equal, sort by total sessions (ascending)
        return a.readingSessions.length - b.readingSessions.length;
      })
      .slice(0, count); // Return only the requested number of students
  };

  // Update the priority student count
  const updatePriorityStudentCount = (count) => {
    setPriorityStudentCount(count);
  };

  // Get reading status for a student
  const getReadingStatus = (student) => {
    if (!student.lastReadDate) return 'notRead';
    
    const lastReadDate = new Date(student.lastReadDate);
    const today = new Date();
    const diffTime = Math.abs(today - lastReadDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 7) return 'recentlyRead';
    if (diffDays <= 14) return 'needsAttention';
    return 'notRead';
  };

  // Export data as CSV
  const exportToCsv = () => {
    // Create CSV header
    let csv = 'Student Name,Last Read Date,Total Sessions\n';
    
    // Add data for each student
    students.forEach(student => {
      const lastReadDate = student.lastReadDate || 'Never';
      const totalSessions = student.readingSessions.length;
      csv += `"${student.name}","${lastReadDate}",${totalSessions}\n`;
    });
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'reading-tracker-export.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export all data as JSON file
  const exportToJson = async () => {
    try {
      // Get the latest data from the API
      const response = await fetch(`${API_URL}/data`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Add export metadata
      data.exportDate = new Date().toISOString();
      data.version = '1.0';
      
      // Convert to JSON string
      const jsonString = JSON.stringify(data, null, 2);
      
      // Create download link
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'reading-tracker-data.json');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setApiError(null);
    } catch (error) {
      console.error('Error exporting data:', error);
      setApiError(error.message);
      
      // Fallback to using local state if API fails
      const data = {
        students,
        exportDate: new Date().toISOString(),
        version: '1.0'
      };
      
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'reading-tracker-data.json');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Save data to a global file in the app folder
  const saveGlobalData = async () => {
    try {
      // Get the latest data from the API
      const response = await fetch(`${API_URL}/data`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      data.exportDate = new Date().toISOString();
      data.version = '1.0';
      
      // Check if the File System Access API is supported
      if ('showSaveFilePicker' in window) {
        // Convert to JSON string
        const jsonString = JSON.stringify(data, null, 2);
        
        // Use the File System Access API to save to a specific location
        const options = {
          suggestedName: 'reading-tracker-global-data.json',
          types: [{
            description: 'JSON Files',
            accept: {'application/json': ['.json']},
          }],
        };
        
        const fileHandle = await window.showSaveFilePicker(options);
        const writable = await fileHandle.createWritable();
        await writable.write(jsonString);
        await writable.close();
        
        setApiError(null);
        return { success: true };
      } else {
        // Fallback for browsers that don't support the File System Access API
        exportToJson();
        return {
          success: true,
          fallback: true,
          message: 'Your browser does not support direct file system access. The data has been downloaded as a file instead.'
        };
      }
    } catch (error) {
      console.error('Error saving global data:', error);
      setApiError(error.message);
      return {
        success: false,
        error: error.message || 'Unknown error occurred while saving global data'
      };
    }
  };

  // Import data from JSON file
  const importFromJson = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          
          // Validate the data structure
          if (!data.students || !Array.isArray(data.students)) {
            reject(new Error('Invalid data format: missing students array'));
            return;
          }
          
          // Send data to API
          try {
            const response = await fetch(`${API_URL}/data`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(data),
            });
            
            if (!response.ok) {
              throw new Error(`API error: ${response.status}`);
            }
            
            // Update the students state
            setStudents(data.students);
            setApiError(null);
            resolve(data.students.length);
          } catch (apiError) {
            console.error('Error sending data to API:', apiError);
            setApiError(apiError.message);
            
            // Still update the local state
            setStudents(data.students);
            resolve(data.students.length);
          }
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    });
  };

  // Load data from a global file in the app folder
  const loadGlobalData = async () => {
    try {
      // Check if the File System Access API is supported
      if ('showOpenFilePicker' in window) {
        // Use the File System Access API to open a file
        const options = {
          types: [{
            description: 'JSON Files',
            accept: {'application/json': ['.json']},
          }],
          multiple: false
        };
        
        const [fileHandle] = await window.showOpenFilePicker(options);
        const file = await fileHandle.getFile();
        const contents = await file.text();
        
        try {
          const data = JSON.parse(contents);
          
          // Validate the data structure
          if (!data.students || !Array.isArray(data.students)) {
            return {
              success: false,
              error: 'Invalid data format: missing students array'
            };
          }
          
          // Send data to API
          try {
            const response = await fetch(`${API_URL}/data`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(data),
            });
            
            if (!response.ok) {
              throw new Error(`API error: ${response.status}`);
            }
            
            // Update the students state
            setStudents(data.students);
            setApiError(null);
          } catch (apiError) {
            console.error('Error sending data to API:', apiError);
            setApiError(apiError.message);
            
            // Still update the local state
            setStudents(data.students);
          }
          
          return {
            success: true,
            count: data.students.length
          };
        } catch (error) {
          return {
            success: false,
            error: `Failed to parse JSON: ${error.message}`
          };
        }
      } else {
        // Fallback for browsers that don't support the File System Access API
        return {
          success: false,
          error: 'Your browser does not support direct file system access. Please use the Import button to select a file manually.'
        };
      }
    } catch (error) {
      console.error('Error loading global data:', error);
      setApiError(error.message);
      return {
        success: false,
        error: error.message || 'Unknown error occurred while loading global data'
      };
    }
  };

  // Bulk import students
  const bulkImportStudents = async (names) => {
    const newStudents = names.map(name => ({
      id: uuidv4(),
      name: name.trim(),
      lastReadDate: null,
      readingSessions: []
    }));
    
    try {
      // Send bulk students to API
      const response = await fetch(`${API_URL}/students/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newStudents),
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      // Update local state
      setStudents(prevStudents => [...prevStudents, ...newStudents]);
      setApiError(null);
    } catch (error) {
      console.error('Error bulk importing students:', error);
      setApiError(error.message);
      
      // Still update the local state
      setStudents(prevStudents => [...prevStudents, ...newStudents]);
    }
    
    return newStudents;
  };

  // Context value
  const value = {
    students,
    loading,
    apiError,
    priorityStudentCount,
    addStudent,
    updateStudent,
    deleteStudent,
    addReadingSession,
    getStudentsByReadingPriority,
    getPrioritizedStudents,
    updatePriorityStudentCount,
    getReadingStatus,
    exportToCsv,
    exportToJson,
    importFromJson,
    saveGlobalData,
    loadGlobalData,
    bulkImportStudents
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};