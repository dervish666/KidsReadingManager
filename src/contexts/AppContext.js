import React, { createContext, useContext, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Create context
const AppContext = createContext();

// Custom hook to use the app context
export const useAppContext = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  // State for students
  const [students, setStudents] = useState([]);
  // State for loading status
  const [loading, setLoading] = useState(true);

  // Load data from localStorage on initial render
  useEffect(() => {
    const loadData = () => {
      try {
        const storedStudents = localStorage.getItem('reading-tracker-students');
        if (storedStudents) {
          setStudents(JSON.parse(storedStudents));
        }
      } catch (error) {
        console.error('Error loading data from localStorage:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Save students to localStorage whenever they change
  useEffect(() => {
    if (!loading) {
      localStorage.setItem('reading-tracker-students', JSON.stringify(students));
    }
  }, [students, loading]);

  // Add a new student
  const addStudent = (name) => {
    const newStudent = {
      id: uuidv4(),
      name,
      lastReadDate: null,
      readingSessions: []
    };
    
    setStudents(prevStudents => [...prevStudents, newStudent]);
    return newStudent;
  };

  // Update a student
  const updateStudent = (id, updatedData) => {
    setStudents(prevStudents => 
      prevStudents.map(student => 
        student.id === id ? { ...student, ...updatedData } : student
      )
    );
  };

  // Delete a student
  const deleteStudent = (id) => {
    setStudents(prevStudents => 
      prevStudents.filter(student => student.id !== id)
    );
  };

  // Add a reading session for a student
  const addReadingSession = (studentId, sessionData) => {
    const date = sessionData.date || new Date().toISOString().split('T')[0];
    const newSession = {
      id: uuidv4(),
      date,
      assessment: sessionData.assessment,
      notes: sessionData.notes || ''
    };

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
  const exportToJson = () => {
    // Create a JSON object with all student data
    const data = {
      students,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
    
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
  };

  // Save data to a global file in the app folder
  const saveGlobalData = async () => {
    try {
      // Check if the File System Access API is supported
      if ('showSaveFilePicker' in window) {
        // Create a JSON object with all student data
        const data = {
          students,
          exportDate: new Date().toISOString(),
          version: '1.0'
        };
        
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
        
        // Store the file handle in localStorage for future access
        try {
          // Request permission to use the file handle in the future
          if ((await fileHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
            localStorage.setItem('reading-tracker-global-file', JSON.stringify({
              saved: true,
              timestamp: new Date().toISOString()
            }));
          }
        } catch (err) {
          console.error('Error storing file handle:', err);
        }
        
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
      
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          
          // Validate the data structure
          if (!data.students || !Array.isArray(data.students)) {
            reject(new Error('Invalid data format: missing students array'));
            return;
          }
          
          // Update the students state
          setStudents(data.students);
          resolve(data.students.length);
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
          
          // Update the students state
          setStudents(data.students);
          
          // Store the file handle in localStorage for future access
          try {
            // Request permission to use the file handle in the future
            if ((await fileHandle.queryPermission({ mode: 'readwrite' })) === 'granted') {
              localStorage.setItem('reading-tracker-global-file', JSON.stringify({
                saved: true,
                timestamp: new Date().toISOString()
              }));
            }
          } catch (err) {
            console.error('Error storing file handle:', err);
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
      return {
        success: false,
        error: error.message || 'Unknown error occurred while loading global data'
      };
    }
  };

  // Bulk import students
  const bulkImportStudents = (names) => {
    const newStudents = names.map(name => ({
      id: uuidv4(),
      name: name.trim(),
      lastReadDate: null,
      readingSessions: []
    }));
    
    setStudents(prevStudents => [...prevStudents, ...newStudents]);
    return newStudents;
  };

  // Context value
  const value = {
    students,
    loading,
    addStudent,
    updateStudent,
    deleteStudent,
    addReadingSession,
    getStudentsByReadingPriority,
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