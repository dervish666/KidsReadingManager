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
    bulkImportStudents
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};