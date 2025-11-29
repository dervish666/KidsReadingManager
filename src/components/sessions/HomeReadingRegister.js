import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  ButtonGroup,
  Chip,
  IconButton,
  Snackbar,
  Alert,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  InputAdornment,
  Collapse,
  useTheme,
  useMediaQuery
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import RemoveIcon from '@mui/icons-material/Remove';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useAppContext } from '../../contexts/AppContext';
import BookAutocomplete from './BookAutocomplete';

// Reading status types for home reading
const READING_STATUS = {
  READ: 'read',           // ✓ - Child read
  MULTIPLE: 'multiple',   // Number - Multiple reading sessions
  ABSENT: 'absent',       // A - Absent
  NO_RECORD: 'no_record', // • - No reading record received
  NONE: 'none'            // No entry yet
};

// Get yesterday's date in YYYY-MM-DD format
const getYesterday = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
};

// Format date for display
const formatDateDisplay = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
};

// Get the week number and day of week for a date
const getWeekInfo = (dateStr) => {
  const date = new Date(dateStr);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    dayName: dayNames[date.getDay()],
    dayOfWeek: date.getDay()
  };
};

const HomeReadingRegister = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const {
    students,
    classes,
    books,
    addReadingSession,
    deleteReadingSession,
    reloadDataFromServer,
    globalClassFilter,
    setGlobalClassFilter
  } = useAppContext();

  // State
  const [selectedDate, setSelectedDate] = useState(getYesterday());
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  const [multipleCountDialog, setMultipleCountDialog] = useState(false);
  const [multipleCount, setMultipleCount] = useState(2);
  const [showInputPanel, setShowInputPanel] = useState(true);
  
  // Book persistence - stores last book per student (in localStorage)
  const [studentBooks, setStudentBooks] = useState(() => {
    try {
      const stored = localStorage.getItem('homeReadingStudentBooks');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Save student books to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem('homeReadingStudentBooks', JSON.stringify(studentBooks));
    } catch (err) {
      console.warn('Failed to save student books to localStorage:', err);
    }
  }, [studentBooks]);

  // Get active classes (non-disabled)
  const activeClasses = useMemo(() => {
    return classes.filter(cls => !cls.disabled);
  }, [classes]);

  // Determine the effective class ID for this component
  // HomeReadingRegister requires a specific class, so we need to handle 'all' and 'unassigned'
  const effectiveClassId = useMemo(() => {
    // If a specific class is selected in global filter, use it
    if (globalClassFilter && globalClassFilter !== 'all' && globalClassFilter !== 'unassigned') {
      // Verify the class exists and is active
      const classExists = activeClasses.some(cls => cls.id === globalClassFilter);
      if (classExists) return globalClassFilter;
    }
    // Otherwise, default to first active class
    return activeClasses.length > 0 ? activeClasses[0].id : '';
  }, [globalClassFilter, activeClasses]);

  // Auto-select first class in global filter if 'all' or 'unassigned' is selected
  useEffect(() => {
    if ((globalClassFilter === 'all' || globalClassFilter === 'unassigned') && activeClasses.length > 0) {
      setGlobalClassFilter(activeClasses[0].id);
    }
  }, [globalClassFilter, activeClasses, setGlobalClassFilter]);

  // Get students for selected class
  const classStudents = useMemo(() => {
    if (!effectiveClassId) return [];
    return students
      .filter(s => s.classId === effectiveClassId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, effectiveClassId]);

  // Filter students by search query
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return classStudents;
    const query = searchQuery.toLowerCase();
    return classStudents.filter(s => s.name.toLowerCase().includes(query));
  }, [classStudents, searchQuery]);

  // Get reading status for a student on a specific date
  const getStudentReadingStatus = useCallback((student, date) => {
    const sessions = student.readingSessions.filter(
      s => s.date === date && s.location === 'home'
    );
    
    if (sessions.length === 0) return { status: READING_STATUS.NONE, count: 0, sessions: [] };
    
    // Check for absent marker (we'll use a special note or assessment)
    const absentSession = sessions.find(s => s.notes?.includes('[ABSENT]'));
    if (absentSession) return { status: READING_STATUS.ABSENT, count: 0, sessions };
    
    // Check for no record marker
    const noRecordSession = sessions.find(s => s.notes?.includes('[NO_RECORD]'));
    if (noRecordSession) return { status: READING_STATUS.NO_RECORD, count: 0, sessions };
    
    // Check for reading count stored in notes (format: [COUNT:N])
    const sessionWithCount = sessions.find(s => s.notes?.match(/\[COUNT:(\d+)\]/));
    if (sessionWithCount) {
      const match = sessionWithCount.notes.match(/\[COUNT:(\d+)\]/);
      const count = parseInt(match[1], 10);
      if (count > 1) {
        return { status: READING_STATUS.MULTIPLE, count, sessions };
      }
      return { status: READING_STATUS.READ, count: 1, sessions };
    }
    
    // Legacy: count actual sessions if no COUNT marker
    if (sessions.length === 1) return { status: READING_STATUS.READ, count: 1, sessions };
    return { status: READING_STATUS.MULTIPLE, count: sessions.length, sessions };
  }, []);

  // Get the last book a student was reading
  const getStudentLastBook = useCallback((studentId) => {
    // First check our persisted state
    if (studentBooks[studentId]) {
      const book = books.find(b => b.id === studentBooks[studentId]);
      if (book) return book;
    }
    
    // Fall back to their most recent session with a book
    const student = students.find(s => s.id === studentId);
    if (!student) return null;
    
    const sessionsWithBooks = student.readingSessions
      .filter(s => s.bookId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (sessionsWithBooks.length > 0) {
      return books.find(b => b.id === sessionsWithBooks[0].bookId) || null;
    }
    
    return null;
  }, [studentBooks, books, students]);

  // Calculate totals for the register
  const registerTotals = useMemo(() => {
    const totals = {
      totalStudents: classStudents.length,
      read: 0,
      multipleSessions: 0,
      absent: 0,
      noRecord: 0,
      notEntered: 0,
      totalSessions: 0
    };

    classStudents.forEach(student => {
      const { status, count } = getStudentReadingStatus(student, selectedDate);
      switch (status) {
        case READING_STATUS.READ:
          totals.read++;
          totals.totalSessions += 1;
          break;
        case READING_STATUS.MULTIPLE:
          totals.multipleSessions++;
          totals.totalSessions += count;
          break;
        case READING_STATUS.ABSENT:
          totals.absent++;
          // Don't add to totalSessions - student was absent, didn't read
          break;
        case READING_STATUS.NO_RECORD:
          totals.noRecord++;
          // Don't add to totalSessions - no reading record received
          break;
        default:
          totals.notEntered++;
      }
    });

    return totals;
  }, [classStudents, selectedDate, getStudentReadingStatus]);

  // Clear all sessions for a student on the selected date
  const handleClearEntry = async (student) => {
    if (!student) return;
    
    try {
      const { sessions } = getStudentReadingStatus(student, selectedDate);
      
      // Delete all sessions for this date
      for (const session of sessions) {
        await deleteReadingSession(student.id, session.id);
      }
      
      setSnackbarMessage(`Cleared entry for ${student.name}`);
      setSnackbarSeverity('info');
      setSnackbarOpen(true);
    } catch (error) {
      console.error('Error clearing entry:', error);
      setSnackbarMessage('Failed to clear entry');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // Handle recording a reading session
  const handleRecordReading = async (status, count = 1) => {
    if (!selectedStudent) return;

    try {
      // First, clear any existing sessions for this date (allows changing state)
      const { sessions: existingSessions } = getStudentReadingStatus(selectedStudent, selectedDate);
      for (const session of existingSessions) {
        await deleteReadingSession(selectedStudent.id, session.id);
      }
      
      const bookId = studentBooks[selectedStudent.id] || null;
      
      // Create a single session based on status
      if (status === READING_STATUS.ABSENT) {
        await addReadingSession(selectedStudent.id, {
          date: selectedDate,
          assessment: 'independent',
          notes: '[ABSENT] Student was absent',
          bookId: null,
          location: 'home'
        });
      } else if (status === READING_STATUS.NO_RECORD) {
        await addReadingSession(selectedStudent.id, {
          date: selectedDate,
          assessment: 'independent',
          notes: '[NO_RECORD] No reading record received',
          bookId: null,
          location: 'home'
        });
      } else {
        // Record a single session with count stored in notes
        // This avoids race conditions with multiple API calls
        await addReadingSession(selectedStudent.id, {
          date: selectedDate,
          assessment: 'independent',
          notes: count > 1 ? `[COUNT:${count}]` : '',
          bookId,
          location: 'home'
        });
      }

      setSnackbarMessage(`Recorded ${count > 1 ? count + ' sessions' : ''} for ${selectedStudent.name}`);
      setSnackbarSeverity('success');
      setSnackbarOpen(true);

      // Move to next student
      const currentIndex = filteredStudents.findIndex(s => s.id === selectedStudent.id);
      if (currentIndex < filteredStudents.length - 1) {
        setSelectedStudent(filteredStudents[currentIndex + 1]);
      } else {
        setSelectedStudent(null);
      }
    } catch (error) {
      console.error('Error recording reading:', error);
      setSnackbarMessage('Failed to record reading');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // Handle book change for selected student
  const handleBookChange = (book) => {
    if (!selectedStudent) return;
    
    setStudentBooks(prev => ({
      ...prev,
      [selectedStudent.id]: book?.id || null
    }));
  };

  // Handle multiple count dialog
  const handleMultipleClick = () => {
    setMultipleCountDialog(true);
  };

  const handleMultipleConfirm = () => {
    handleRecordReading(READING_STATUS.MULTIPLE, multipleCount);
    setMultipleCountDialog(false);
    setMultipleCount(2);
  };

  // Render status cell content
  const renderStatusCell = (student) => {
    const { status, count } = getStudentReadingStatus(student, selectedDate);
    
    const cellStyle = {
      cursor: 'pointer',
      textAlign: 'center',
      fontWeight: 'bold',
      fontSize: '1.2rem',
      padding: '8px 4px',
      minWidth: '40px',
      transition: 'background-color 0.2s',
      '&:hover': {
        backgroundColor: 'action.hover'
      }
    };

    const isSelected = selectedStudent?.id === student.id;
    
    switch (status) {
      case READING_STATUS.READ:
        return (
          <TableCell 
            sx={{ 
              ...cellStyle, 
              backgroundColor: isSelected ? 'primary.light' : 'success.light',
              color: 'success.dark'
            }}
            onClick={() => setSelectedStudent(student)}
          >
            ✓
          </TableCell>
        );
      case READING_STATUS.MULTIPLE:
        return (
          <TableCell 
            sx={{ 
              ...cellStyle, 
              backgroundColor: isSelected ? 'primary.light' : 'success.main',
              color: 'white'
            }}
            onClick={() => setSelectedStudent(student)}
          >
            {count}
          </TableCell>
        );
      case READING_STATUS.ABSENT:
        return (
          <TableCell 
            sx={{ 
              ...cellStyle, 
              backgroundColor: isSelected ? 'primary.light' : 'warning.light',
              color: 'warning.dark'
            }}
            onClick={() => setSelectedStudent(student)}
          >
            A
          </TableCell>
        );
      case READING_STATUS.NO_RECORD:
        return (
          <TableCell 
            sx={{ 
              ...cellStyle, 
              backgroundColor: isSelected ? 'primary.light' : 'grey.200',
              color: 'grey.600'
            }}
            onClick={() => setSelectedStudent(student)}
          >
            •
          </TableCell>
        );
      default:
        return (
          <TableCell 
            sx={{ 
              ...cellStyle, 
              backgroundColor: isSelected ? 'primary.light' : 'transparent',
              color: 'grey.400'
            }}
            onClick={() => setSelectedStudent(student)}
          >
            -
          </TableCell>
        );
    }
  };

  // Calculate student's total sessions for the current week/term
  // Excludes absent and no_record markers - only counts actual reading sessions
  // Respects [COUNT:N] markers for multiple sessions stored in a single record
  const getStudentTotalSessions = (student) => {
    let total = 0;
    student.readingSessions.forEach(s => {
      if (s.location !== 'home') return;
      if (s.notes?.includes('[ABSENT]') || s.notes?.includes('[NO_RECORD]')) return;
      
      // Check for count marker
      const countMatch = s.notes?.match(/\[COUNT:(\d+)\]/);
      if (countMatch) {
        total += parseInt(countMatch[1], 10);
      } else {
        total += 1;
      }
    });
    return total;
  };

  return (
    <Box>
      <Typography variant="h5" component="h1" gutterBottom>
        Reading Record
      </Typography>

      {/* Controls Section */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          gap: 2,
          alignItems: isMobile ? 'stretch' : 'center',
          flexWrap: 'wrap'
        }}>
          {/* Date Picker */}
          <TextField
            label="Date"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 150 }}
            size="small"
          />

          {/* Search */}
          <TextField
            placeholder="Search student..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="small"
            sx={{ minWidth: 150, flexGrow: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              )
            }}
          />

          {/* Date Display */}
          <Chip 
            label={formatDateDisplay(selectedDate)}
            color="primary"
            variant="outlined"
          />
        </Box>
      </Paper>

      {/* Input Panel - Collapsible on mobile */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            cursor: isMobile ? 'pointer' : 'default'
          }}
          onClick={() => isMobile && setShowInputPanel(!showInputPanel)}
        >
          <Typography variant="h6">
            {selectedStudent ? `Recording for: ${selectedStudent.name}` : 'Select a student from the register'}
          </Typography>
          {isMobile && (
            <IconButton size="small">
              {showInputPanel ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          )}
        </Box>

        <Collapse in={showInputPanel || !isMobile}>
          {selectedStudent ? (
            <Box sx={{ mt: 2 }}>
              {/* Book Selection */}
              <Box sx={{ mb: 2 }}>
                <BookAutocomplete
                  value={books.find(b => b.id === studentBooks[selectedStudent.id]) || getStudentLastBook(selectedStudent.id)}
                  onChange={handleBookChange}
                  label="Current Book"
                  placeholder="Select or search for book..."
                />
                <Typography variant="caption" color="text.secondary">
                  Book will be remembered for future entries
                </Typography>
              </Box>

              {/* Quick Input Buttons */}
              <Box sx={{ 
                display: 'flex', 
                gap: 1, 
                flexWrap: 'wrap',
                justifyContent: 'center'
              }}>
                <Tooltip title="Read (✓)">
                  <Button
                    variant="contained"
                    color="success"
                    size="large"
                    onClick={() => handleRecordReading(READING_STATUS.READ)}
                    sx={{ minWidth: 80, fontSize: '1.5rem', py: 1.5 }}
                  >
                    ✓
                  </Button>
                </Tooltip>

                <Tooltip title="Multiple Sessions">
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    onClick={handleMultipleClick}
                    sx={{ minWidth: 80, fontSize: '1.2rem', py: 1.5 }}
                  >
                    2+
                  </Button>
                </Tooltip>

                <Tooltip title="Absent (A)">
                  <Button
                    variant="contained"
                    color="warning"
                    size="large"
                    onClick={() => handleRecordReading(READING_STATUS.ABSENT)}
                    sx={{ minWidth: 80, fontSize: '1.5rem', py: 1.5 }}
                  >
                    A
                  </Button>
                </Tooltip>

                <Tooltip title="No Record (•)">
                  <Button
                    variant="outlined"
                    color="inherit"
                    size="large"
                    onClick={() => handleRecordReading(READING_STATUS.NO_RECORD)}
                    sx={{ minWidth: 80, fontSize: '1.5rem', py: 1.5 }}
                  >
                    •
                  </Button>
                </Tooltip>
              </Box>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
              Click on a student in the register below to record their reading
            </Typography>
          )}
        </Collapse>
      </Paper>

      {/* Register Table */}
      <Paper sx={{ mb: 2 }}>
        <TableContainer sx={{ maxHeight: isMobile ? 400 : 500 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center', minWidth: 50 }}>
                  {getWeekInfo(selectedDate).dayName}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center', minWidth: 40 }}>Clear</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center', minWidth: 60 }}>Total</TableCell>
                <TableCell sx={{ fontWeight: 'bold', minWidth: 150 }}>Current Book</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredStudents.map(student => {
                const lastBook = getStudentLastBook(student.id);
                const isSelected = selectedStudent?.id === student.id;
                const { status } = getStudentReadingStatus(student, selectedDate);
                const hasEntry = status !== READING_STATUS.NONE;
                
                return (
                  <TableRow
                    key={student.id}
                    hover
                    selected={isSelected}
                    sx={{
                      cursor: 'pointer',
                      '&.Mui-selected': {
                        backgroundColor: 'primary.light'
                      }
                    }}
                  >
                    <TableCell
                      onClick={() => setSelectedStudent(student)}
                      sx={{ fontWeight: isSelected ? 'bold' : 'normal' }}
                    >
                      {student.name}
                    </TableCell>
                    {renderStatusCell(student)}
                    <TableCell sx={{ textAlign: 'center', padding: '4px' }}>
                      {hasEntry && (
                        <Tooltip title="Clear entry">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClearEntry(student);
                            }}
                            sx={{
                              color: 'error.main',
                              '&:hover': { backgroundColor: 'error.light' }
                            }}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell
                      sx={{ textAlign: 'center', fontWeight: 'bold' }}
                      onClick={() => setSelectedStudent(student)}
                    >
                      {getStudentTotalSessions(student)}
                    </TableCell>
                    <TableCell
                      onClick={() => setSelectedStudent(student)}
                      sx={{
                        fontSize: '0.85rem',
                        color: lastBook ? 'text.primary' : 'text.secondary',
                        fontStyle: lastBook ? 'normal' : 'italic'
                      }}
                    >
                      {lastBook ? lastBook.title : 'No book set'}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredStudents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">
                      {searchQuery ? 'No students match your search' : 'No students in this class'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Totals Summary */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Summary for {formatDateDisplay(selectedDate)}
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: 2,
          justifyContent: 'center'
        }}>
          <Chip 
            label={`Total Students: ${registerTotals.totalStudents}`}
            variant="outlined"
          />
          <Chip 
            label={`Read: ${registerTotals.read}`}
            color="success"
            icon={<CheckIcon />}
          />
          <Chip 
            label={`Multiple: ${registerTotals.multipleSessions}`}
            color="primary"
          />
          <Chip 
            label={`Absent: ${registerTotals.absent}`}
            color="warning"
          />
          <Chip 
            label={`No Record: ${registerTotals.noRecord}`}
            color="default"
          />
          <Chip 
            label={`Not Entered: ${registerTotals.notEntered}`}
            variant="outlined"
            color="error"
          />
          <Chip 
            label={`Total Sessions: ${registerTotals.totalSessions}`}
            color="secondary"
            sx={{ fontWeight: 'bold' }}
          />
        </Box>
      </Paper>

      {/* Multiple Count Dialog */}
      <Dialog open={multipleCountDialog} onClose={() => setMultipleCountDialog(false)}>
        <DialogTitle>How many reading sessions?</DialogTitle>
        <DialogContent>
          <TextField
            type="number"
            value={multipleCount}
            onChange={(e) => setMultipleCount(Math.max(2, parseInt(e.target.value) || 2))}
            inputProps={{ min: 2, max: 10 }}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMultipleCountDialog(false)}>Cancel</Button>
          <Button onClick={handleMultipleConfirm} variant="contained" color="primary">
            Record {multipleCount} Sessions
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={() => setSnackbarOpen(false)}
      >
        <Alert 
          onClose={() => setSnackbarOpen(false)} 
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default HomeReadingRegister;