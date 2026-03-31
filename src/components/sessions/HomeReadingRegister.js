import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  useTheme,
  useMediaQuery,
  ToggleButton,
  ToggleButtonGroup,
  ClickAwayListener,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { useTour } from '../tour/useTour';
import TourButton from '../tour/TourButton';
import BookAutocomplete from './BookAutocomplete';
import BookCover from '../BookCover';

// Reading status types for home reading
const READING_STATUS = {
  READ: 'read', // ✓ - Child read
  MULTIPLE: 'multiple', // Number - Multiple reading sessions
  ABSENT: 'absent', // A - Absent
  NO_RECORD: 'no_record', // • - No reading record received
  NONE: 'none', // No entry yet
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
    month: 'short',
  });
};

// Format assessment for display
const formatAssessment = (assessment) => {
  if (assessment === null || assessment === undefined) return null;
  if (typeof assessment === 'number') return `${assessment}/10`;
  return null;
};

const getAssessmentColor = (assessment) => {
  if (assessment === null || assessment === undefined) return 'default';
  if (typeof assessment === 'number') {
    if (assessment <= 3) return 'error';
    if (assessment <= 6) return 'warning';
    return 'success';
  }
  return 'default';
};

const DATE_PRESETS = {
  THIS_WEEK: 'this_week',
  LAST_WEEK: 'last_week',
  LAST_MONTH: 'last_month',
  CURRENT_TERM: 'current_term',
  SCHOOL_YEAR: 'school_year',
  CUSTOM: 'custom',
};

const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEndOfWeek = (date) => {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

const getStartOfMonth = (date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getEndOfMonth = (date) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(23, 59, 59, 999);
  return d;
};

const formatDateISO = (date) => {
  return date.toISOString().split('T')[0];
};

const formatDateHeader = (date) => {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    day: dayNames[date.getDay()],
    date: date.getDate(),
  };
};

const getDateRange = (start, end) => {
  const dates = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const HomeReadingRegister = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { fetchWithAuth } = useAuth();
  const {
    students,
    classes,
    books,
    addReadingSession,
    editReadingSession,
    deleteReadingSession,
    updateStudentCurrentBook,
  } = useData();
  const { globalClassFilter } = useUI();
  // O(1) book lookup by ID (avoids O(n) .find() per student)
  const booksMap = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  // Local session state — fetched on demand from the API
  const [classSessions, setClassSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // State
  const [selectedDate, setSelectedDate] = useState(getYesterday());
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('success');
  const [multipleCountDialog, setMultipleCountDialog] = useState(false);
  const [multipleCount, setMultipleCount] = useState(5);
  const [showInputPanel, setShowInputPanel] = useState(true);
  const [studentHistory, setStudentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [viewMode, setViewMode] = useState('quick');

  const [recordingStudents, setRecordingStudents] = useState(new Set());
  const [editingBookStudentId, setEditingBookStudentId] = useState(null);
  const [quickMultipleStudent, setQuickMultipleStudent] = useState(null);

  const [datePreset, setDatePreset] = useState(DATE_PRESETS.THIS_WEEK);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [termDates, setTermDates] = useState([]);

  useEffect(() => {
    const fetchTermDates = async () => {
      try {
        const res = await fetchWithAuth('/api/term-dates');
        if (res.ok) {
          const data = await res.json();
          setTermDates(data.terms || []);
        }
      } catch {
        // silently fail — term options just won't appear
      }
    };
    fetchTermDates();
  }, [fetchWithAuth]);

  const { startDate, endDate } = useMemo(() => {
    const today = new Date();
    switch (datePreset) {
      case DATE_PRESETS.THIS_WEEK:
        return { startDate: getStartOfWeek(today), endDate: getEndOfWeek(today) };
      case DATE_PRESETS.LAST_WEEK: {
        const lastWeek = new Date(today);
        lastWeek.setDate(lastWeek.getDate() - 7);
        return { startDate: getStartOfWeek(lastWeek), endDate: getEndOfWeek(lastWeek) };
      }
      case DATE_PRESETS.LAST_MONTH: {
        const lastMonth = new Date(today);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        return { startDate: getStartOfMonth(lastMonth), endDate: getEndOfMonth(lastMonth) };
      }
      case DATE_PRESETS.CURRENT_TERM: {
        const todayStr = today.toISOString().split('T')[0];
        const current = termDates.find((t) => t.startDate <= todayStr && t.endDate >= todayStr);
        if (current) {
          return { startDate: new Date(current.startDate), endDate: new Date(current.endDate) };
        }
        return { startDate: getStartOfWeek(today), endDate: getEndOfWeek(today) };
      }
      case DATE_PRESETS.SCHOOL_YEAR: {
        if (termDates.length > 0) {
          const starts = termDates.map((t) => t.startDate).sort();
          const ends = termDates.map((t) => t.endDate).sort();
          return { startDate: new Date(starts[0]), endDate: new Date(ends[ends.length - 1]) };
        }
        return { startDate: getStartOfWeek(today), endDate: getEndOfWeek(today) };
      }
      case DATE_PRESETS.CUSTOM:
        return {
          startDate: customStartDate ? new Date(customStartDate) : getStartOfWeek(today),
          endDate: customEndDate ? new Date(customEndDate) : getEndOfWeek(today),
        };
      default: {
        // Individual term preset (e.g. "term_1", "term_2")
        const termOrder = datePreset.startsWith('term_')
          ? parseInt(datePreset.split('_')[1])
          : null;
        if (termOrder) {
          const term = termDates.find((t) => t.termOrder === termOrder);
          if (term) {
            return { startDate: new Date(term.startDate), endDate: new Date(term.endDate) };
          }
        }
        return { startDate: getStartOfWeek(today), endDate: getEndOfWeek(today) };
      }
    }
  }, [datePreset, customStartDate, customEndDate, termDates]);

  const dates = useMemo(() => getDateRange(startDate, endDate), [startDate, endDate]);

  // ISO date strings for the date range (used by fetch and refreshSessions)
  const startDateISO = useMemo(() => formatDateISO(startDate), [startDate]);
  const endDateISO = useMemo(() => formatDateISO(endDate), [endDate]);

  // Ref to track if we've already auto-set the class filter (prevents infinite loop)
  // hasAutoSetClassFilter ref removed — no longer mutating global filter

  // Get active classes (non-disabled)
  const activeClasses = useMemo(() => {
    return classes.filter((cls) => !cls.disabled);
  }, [classes]);

  // Determine the effective class ID for this component
  // HomeReadingRegister requires a specific class, so we need to handle 'all' and 'unassigned'
  const effectiveClassId = useMemo(() => {
    // If a specific class is selected in global filter, use it
    if (globalClassFilter && globalClassFilter !== 'all' && globalClassFilter !== 'unassigned') {
      // Verify the class exists and is active
      const classExists = activeClasses.some((cls) => cls.id === globalClassFilter);
      if (classExists) return globalClassFilter;
    }
    // Otherwise, default to first active class
    return activeClasses.length > 0 ? activeClasses[0].id : '';
  }, [globalClassFilter, activeClasses]);

  // Note: HomeReadingRegister uses effectiveClassId (derived from globalClassFilter)
  // and does NOT mutate the global class filter. This avoids confusing side effects
  // when the user switches between tabs.

  // Fetch sessions for the selected class and date range
  useEffect(() => {
    if (!effectiveClassId) {
      setClassSessions([]);
      return;
    }
    if (!startDateISO || !endDateISO) return;

    setSessionsLoading(true);
    fetchWithAuth(
      `/api/students/sessions?classId=${effectiveClassId}&startDate=${startDateISO}&endDate=${endDateISO}`
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((sessions) => {
        setClassSessions(sessions);
        setSessionsLoading(false);
      })
      .catch(() => {
        setClassSessions([]);
        setSessionsLoading(false);
      });
  }, [effectiveClassId, startDateISO, endDateISO, fetchWithAuth]);

  // Refresh sessions after mutations (add/delete)
  const refreshSessions = useCallback(() => {
    if (!effectiveClassId) return;
    fetchWithAuth(
      `/api/students/sessions?classId=${effectiveClassId}&startDate=${startDateISO}&endDate=${endDateISO}`
    )
      .then((r) => (r.ok ? r.json() : []))
      .then(setClassSessions)
      .catch(() => {});
  }, [effectiveClassId, startDateISO, endDateISO, fetchWithAuth]);

  // Fetch selected student's full reading history
  useEffect(() => {
    if (!selectedStudent?.id) {
      setStudentHistory([]);
      return;
    }
    setHistoryLoading(true);
    fetchWithAuth(`/api/students/${selectedStudent.id}/sessions`)
      .then((r) => (r.ok ? r.json() : []))
      .then((sessions) => {
        // Filter out absent/no_record markers, sort newest first
        const real = sessions
          .filter(
            (s) =>
              !s.notes?.includes('[ABSENT]') &&
              !s.notes?.includes('[NO_RECORD]') &&
              !s.notes?.includes('[COUNT:')
          )
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        setStudentHistory(real);
        setHistoryLoading(false);
      })
      .catch(() => {
        setStudentHistory([]);
        setHistoryLoading(false);
      });
  }, [selectedStudent?.id, fetchWithAuth, historyRefresh]);

  // Build a sessions-by-student lookup for O(1) access
  const sessionsByStudent = useMemo(() => {
    const map = {};
    for (const s of classSessions) {
      if (!map[s.studentId]) map[s.studentId] = [];
      map[s.studentId].push(s);
    }
    return map;
  }, [classSessions]);

  // Get students for selected class, sorted alphabetically
  const classStudents = useMemo(() => {
    if (!effectiveClassId) return [];
    return students
      .filter((s) => s.classId === effectiveClassId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students, effectiveClassId]);

  // Filter students by search query
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return classStudents;
    const query = searchQuery.toLowerCase();
    return classStudents.filter((s) => s.name.toLowerCase().includes(query));
  }, [classStudents, searchQuery]);

  // Two tours: one for Quick view, one for Full view
  const quickTour = useTour('home-reading-quick', {
    ready: viewMode === 'quick' && filteredStudents.length > 0,
  });
  const fullTour = useTour('home-reading', { ready: viewMode === 'full' });

  // Show the tour matching the current view; compass always works
  const activeTour = viewMode === 'full' ? fullTour : quickTour;
  const homeTourButtonProps = {
    ...activeTour.tourButtonProps,
    shouldPulse: quickTour.tourButtonProps.shouldPulse || fullTour.tourButtonProps.shouldPulse,
  };

  // Previous 3 days relative to selectedDate (for Quick view history columns)
  const previousDays = useMemo(() => {
    if (!selectedDate) return [];
    const base = new Date(selectedDate + 'T12:00:00');
    if (isNaN(base.getTime())) return [];
    const days = [];
    for (let i = 3; i >= 1; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    return days;
  }, [selectedDate]);

  // Get reading status for a student on a specific date
  // Includes both home reading entries and school reading sessions in the count
  const getStudentReadingStatus = useCallback(
    (student, date) => {
      const studentSessions = sessionsByStudent[student.id] || [];

      // Get home reading entries (these have special markers like ABSENT, NO_RECORD, COUNT)
      const homeSessions = studentSessions.filter((s) => s.date === date && s.location === 'home');

      // Get school reading sessions (these are individual sessions from the Reading Page)
      const schoolSessions = studentSessions.filter(
        (s) => s.date === date && s.location === 'school'
      );

      // If no sessions at all, return NONE
      if (homeSessions.length === 0 && schoolSessions.length === 0) {
        return { status: READING_STATUS.NONE, count: 0, sessions: [] };
      }

      // Markers (ABSENT/NO_RECORD) always take display priority
      const absentSession = homeSessions.find((s) => s.notes?.includes('[ABSENT]'));
      if (absentSession) {
        return { status: READING_STATUS.ABSENT, count: 0, sessions: homeSessions };
      }

      const noRecordSession = homeSessions.find((s) => s.notes?.includes('[NO_RECORD]'));
      if (noRecordSession) {
        return { status: READING_STATUS.NO_RECORD, count: 0, sessions: homeSessions };
      }

      // Count actual sessions (home + school)
      const totalCount = homeSessions.length + schoolSessions.length;

      if (totalCount === 0) {
        return { status: READING_STATUS.NONE, count: 0, sessions: [] };
      } else if (totalCount === 1) {
        return {
          status: READING_STATUS.READ,
          count: 1,
          sessions: [...homeSessions, ...schoolSessions],
        };
      } else {
        return {
          status: READING_STATUS.MULTIPLE,
          count: totalCount,
          sessions: [...homeSessions, ...schoolSessions],
        };
      }
    },
    [sessionsByStudent]
  );

  const dailyTotals = useMemo(() => {
    return dates.map((date) => {
      const dateStr = formatDateISO(date);
      let read = 0,
        multiple = 0,
        absent = 0,
        noRecord = 0,
        notEntered = 0,
        totalSessions = 0;

      classStudents.forEach((student) => {
        const { status, count } = getStudentReadingStatus(student, dateStr);
        switch (status) {
          case READING_STATUS.READ:
            read++;
            totalSessions += 1;
            break;
          case READING_STATUS.MULTIPLE:
            multiple++;
            totalSessions += count;
            break;
          case READING_STATUS.ABSENT:
            absent++;
            break;
          case READING_STATUS.NO_RECORD:
            noRecord++;
            break;
          default:
            notEntered++;
        }
      });

      return { read, multiple, absent, noRecord, notEntered, totalSessions };
    });
  }, [dates, classStudents, getStudentReadingStatus]);

  // Get the current book a student is reading (from database)
  const getStudentLastBook = useCallback(
    (studentId) => {
      const student = students.find((s) => s.id === studentId);
      if (!student) return null;

      // Use the student's current book from the database
      if (student.currentBookId) {
        const book = booksMap.get(student.currentBookId);
        if (book) return book;
        // If we have a title but no matching book, return a minimal book object
        if (student.currentBookTitle) {
          return {
            id: student.currentBookId,
            title: student.currentBookTitle,
            author: student.currentBookAuthor || '',
          };
        }
      }

      return null;
    },
    [booksMap, students]
  );

  // Calculate totals for the register
  const registerTotals = useMemo(() => {
    const totals = {
      totalStudents: classStudents.length,
      read: 0,
      multipleSessions: 0,
      absent: 0,
      noRecord: 0,
      notEntered: 0,
      totalSessions: 0,
    };

    classStudents.forEach((student) => {
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

  // Clear home reading sessions for a student on the selected date
  // Note: This only clears home reading entries, not school reading sessions
  const handleClearEntry = async (student) => {
    if (!student) return;

    try {
      const studentSessions = sessionsByStudent[student.id] || [];
      // Only get home sessions to clear (preserve school reading sessions)
      const homeSessions = studentSessions.filter(
        (s) => s.date === selectedDate && s.location === 'home'
      );

      // Delete only home sessions for this date
      for (const session of homeSessions) {
        await deleteReadingSession(student.id, session.id);
      }

      refreshSessions();
      setHistoryRefresh((c) => c + 1);
      setSnackbarMessage(`Cleared home reading entry for ${student.name}`);
      setSnackbarSeverity('info');
      setSnackbarOpen(true);
    } catch (error) {
      setSnackbarMessage('Failed to clear entry');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // Handle quick record (per-student inline buttons, no selection needed)
  const handleQuickRecord = async (student, status, count = 1) => {
    if (recordingStudents.has(student.id)) return;

    setRecordingStudents((prev) => new Set(prev).add(student.id));
    try {
      const studentSessions = sessionsByStudent[student.id] || [];
      const existingHomeSessions = studentSessions.filter(
        (s) => s.date === selectedDate && s.location === 'home'
      );
      for (const session of existingHomeSessions) {
        await deleteReadingSession(student.id, session.id);
      }

      const bookId = student.currentBookId || null;

      if (status === READING_STATUS.ABSENT) {
        await addReadingSession(student.id, {
          date: selectedDate,
          assessment: null,
          notes: '[ABSENT] Student was absent',
          bookId: null,
          location: 'home',
        });
      } else if (status === READING_STATUS.NO_RECORD) {
        await addReadingSession(student.id, {
          date: selectedDate,
          assessment: null,
          notes: '[NO_RECORD] No reading record received',
          bookId: null,
          location: 'home',
        });
      } else {
        const allStudentSessions = sessionsByStudent[student.id] || [];
        for (let i = 0; i < count; i++) {
          const sessionDate = new Date(selectedDate);
          sessionDate.setDate(sessionDate.getDate() - i);
          const dateStr = sessionDate.toISOString().split('T')[0];

          const dayHasMarker =
            i > 0 &&
            allStudentSessions.some(
              (s) =>
                s.date === dateStr &&
                s.location === 'home' &&
                (s.notes?.includes('[ABSENT]') || s.notes?.includes('[NO_RECORD]'))
            );

          if (dayHasMarker) {
            await addReadingSession(student.id, {
              date: dateStr,
              assessment: null,
              notes: '',
              bookId,
              location: 'home',
            });
            await addReadingSession(student.id, {
              date: selectedDate,
              assessment: null,
              notes: '',
              bookId,
              location: 'home',
            });
          } else {
            await addReadingSession(student.id, {
              date: dateStr,
              assessment: null,
              notes: '',
              bookId,
              location: 'home',
            });
          }
        }
      }

      refreshSessions();
    } catch (error) {
      setSnackbarMessage('Failed to record reading');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    } finally {
      setRecordingStudents((prev) => {
        const next = new Set(prev);
        next.delete(student.id);
        return next;
      });
    }
  };

  // Handle recording a reading session
  const handleRecordReading = async (status, count = 1) => {
    if (!selectedStudent) return;

    try {
      // First, clear any existing HOME sessions for this date (allows changing state)
      // Note: We preserve school reading sessions - only clear home entries
      const studentSessions = sessionsByStudent[selectedStudent.id] || [];
      const existingHomeSessions = studentSessions.filter(
        (s) => s.date === selectedDate && s.location === 'home'
      );
      for (const session of existingHomeSessions) {
        await deleteReadingSession(selectedStudent.id, session.id);
      }

      // Get the student's current book from the database
      const bookId = selectedStudent.currentBookId || null;

      // Create a single session based on status
      if (status === READING_STATUS.ABSENT) {
        await addReadingSession(selectedStudent.id, {
          date: selectedDate,
          assessment: null,
          notes: '[ABSENT] Student was absent',
          bookId: null,
          location: 'home',
        });
      } else if (status === READING_STATUS.NO_RECORD) {
        await addReadingSession(selectedStudent.id, {
          date: selectedDate,
          assessment: null,
          notes: '[NO_RECORD] No reading record received',
          bookId: null,
          location: 'home',
        });
      } else {
        // Create individual sessions on consecutive days going backward.
        // If a previous day has an ABSENT or NO_RECORD marker, create that
        // session on the selected date instead (so the marker stays visible
        // and the selected date shows the catch-up count).
        // Sessions are also created on the actual day for streak calculation.
        const studentSessions = sessionsByStudent[selectedStudent.id] || [];

        for (let i = 0; i < count; i++) {
          const sessionDate = new Date(selectedDate);
          sessionDate.setDate(sessionDate.getDate() - i);
          const dateStr = sessionDate.toISOString().split('T')[0];

          // Check if this day has a marker
          const dayHasMarker =
            i > 0 &&
            studentSessions.some(
              (s) =>
                s.date === dateStr &&
                s.location === 'home' &&
                (s.notes?.includes('[ABSENT]') || s.notes?.includes('[NO_RECORD]'))
            );

          if (dayHasMarker) {
            // Create session on the actual day (for streak calculation)
            await addReadingSession(selectedStudent.id, {
              date: dateStr,
              assessment: null,
              notes: '',
              bookId,
              location: 'home',
            });
            // Also create session on the selected date (for display count)
            await addReadingSession(selectedStudent.id, {
              date: selectedDate,
              assessment: null,
              notes: '',
              bookId,
              location: 'home',
            });
          } else {
            // Normal day — create session on that day
            await addReadingSession(selectedStudent.id, {
              date: dateStr,
              assessment: null,
              notes: '',
              bookId,
              location: 'home',
            });
          }
        }
      }

      refreshSessions();
      setHistoryRefresh((c) => c + 1);
      setSnackbarMessage(
        `Recorded ${count > 1 ? count + ' days' : ''} for ${selectedStudent.name}`
      );
      setSnackbarSeverity('success');
      setSnackbarOpen(true);

      // Move to next student
      const currentIndex = filteredStudents.findIndex((s) => s.id === selectedStudent.id);
      if (currentIndex < filteredStudents.length - 1) {
        setSelectedStudent(filteredStudents[currentIndex + 1]);
      } else {
        setSelectedStudent(null);
      }
    } catch (error) {
      setSnackbarMessage('Failed to record reading');
      setSnackbarSeverity('error');
      setSnackbarOpen(true);
    }
  };

  // Handle book change for selected student
  const handleBookChange = (book) => {
    if (!selectedStudent) return;

    // Update the student's current book in the database
    updateStudentCurrentBook(
      selectedStudent.id,
      book?.id || null,
      book?.title || null,
      book?.author || null
    );

    // Also update any existing home session for the selected date
    const studentSessions = sessionsByStudent[selectedStudent.id] || [];
    const existingHomeSession = studentSessions.find(
      (s) => s.date === selectedDate && s.location === 'home'
    );
    if (existingHomeSession) {
      editReadingSession(selectedStudent.id, existingHomeSession.id, {
        ...existingHomeSession,
        bookId: book?.id || null,
        bookTitle: book?.title || null,
        bookAuthor: book?.author || null,
      });
    }
  };

  // Handle multiple count dialog
  const handleMultipleClick = () => {
    setMultipleCountDialog(true);
  };

  const handleMultipleConfirm = () => {
    if (quickMultipleStudent) {
      handleQuickRecord(quickMultipleStudent, READING_STATUS.MULTIPLE, multipleCount);
      setQuickMultipleStudent(null);
    } else {
      handleRecordReading(READING_STATUS.MULTIPLE, multipleCount);
    }
    setMultipleCountDialog(false);
    setMultipleCount(5);
  };

  const renderDateStatusCell = (student, date) => {
    const dateStr = formatDateISO(date);
    const { status, count } = getStudentReadingStatus(student, dateStr);
    const isSelectedDate = selectedDate === dateStr;
    const isSelected = selectedStudent?.id === student.id;

    const cellStyle = {
      cursor: 'pointer',
      textAlign: 'center',
      fontWeight: 'bold',
      fontSize: isMobile ? '0.85rem' : '0.9rem',
      padding: isMobile ? '10px 4px' : '8px 6px',
      minWidth: isMobile ? 44 : 48,
      minHeight: 44,
      transition: 'background-color 0.2s',
      outline: isSelectedDate ? '2px solid' : 'none',
      outlineColor: 'primary.main',
      outlineOffset: '-2px',
    };

    let bgColor = 'transparent';
    let color = 'grey.400';
    let content = '-';

    switch (status) {
      case READING_STATUS.READ:
        bgColor = 'success.light';
        color = 'success.dark';
        content = '✓';
        break;
      case READING_STATUS.MULTIPLE:
        bgColor = 'success.main';
        color = 'white';
        content = count;
        break;
      case READING_STATUS.ABSENT:
        bgColor = 'warning.light';
        color = 'warning.dark';
        content = 'A';
        break;
      case READING_STATUS.NO_RECORD:
        bgColor = 'grey.200';
        color = 'grey.600';
        content = '•';
        break;
      default:
        break;
    }

    if (isSelected && isSelectedDate) {
      bgColor = 'primary.light';
    }

    return (
      <TableCell
        key={dateStr}
        sx={{ ...cellStyle, backgroundColor: bgColor, color }}
        onClick={() => {
          setSelectedDate(dateStr);
          setSelectedStudent(student);
        }}
      >
        {content}
      </TableCell>
    );
  };

  const getStudentTotalInRange = useCallback(
    (student) => {
      let total = 0;
      const studentSessions = sessionsByStudent[student.id] || [];
      dates.forEach((date) => {
        const dateStr = formatDateISO(date);
        const { status, count } = getStudentReadingStatus(student, dateStr);
        if (status === READING_STATUS.READ) {
          total += 1;
        } else if (status === READING_STATUS.MULTIPLE) {
          total += count;
        } else if (status === READING_STATUS.ABSENT || status === READING_STATUS.NO_RECORD) {
          // Count any real read sessions hidden behind markers
          const readSessions = studentSessions.filter(
            (s) =>
              s.date === dateStr &&
              !s.notes?.includes('[ABSENT]') &&
              !s.notes?.includes('[NO_RECORD]')
          );
          total += readSessions.length;
        }
      });
      return total;
    },
    [dates, getStudentReadingStatus, sessionsByStudent]
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" component="h1">
          Reading Record
        </Typography>
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(e, v) => v && setViewMode(v)}
          size="small"
        >
          <ToggleButton value="quick">Quick</ToggleButton>
          <ToggleButton value="full">Full</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Quick Entry View */}
      {viewMode === 'quick' && (
        <>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              label="Date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={{ width: 180 }}
              inputProps={{ 'aria-label': 'Select date for reading session' }}
            />
            <TextField
              placeholder="Search student..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="small"
              sx={{ flex: 1, minWidth: 150 }}
              inputProps={{ 'aria-label': 'Search for a student by name' }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Typography variant="body2" color="text.secondary">
              {filteredStudents.length} students
            </Typography>
          </Box>

          <Paper sx={{ mb: 2, position: 'relative' }}>
            {sessionsLoading && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255, 255, 255, 0.7)',
                  zIndex: 10,
                }}
              >
                <CircularProgress size={40} />
              </Box>
            )}
            <TableContainer sx={{ maxHeight: 'calc(100vh - 260px)' }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {previousDays.map((date, i) => {
                      const { day, date: dayNum } = formatDateHeader(date);
                      return (
                        <TableCell
                          key={formatDateISO(date)}
                          {...(i === 0 ? { 'data-tour': 'quick-history' } : {})}
                          sx={{
                            fontWeight: 'bold',
                            textAlign: 'center',
                            padding: '4px',
                            minWidth: 40,
                            maxWidth: 48,
                          }}
                        >
                          <Typography
                            variant="caption"
                            display="block"
                            sx={{ fontSize: '0.7rem', lineHeight: 1.2, color: 'text.secondary' }}
                          >
                            {day}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 'bold', fontSize: '0.8rem' }}
                          >
                            {dayNum}
                          </Typography>
                        </TableCell>
                      );
                    })}
                    <TableCell sx={{ fontWeight: 'bold', padding: '6px 8px' }}>Student</TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 'bold',
                        padding: '6px 8px',
                      }}
                    >
                      Record Reading
                    </TableCell>
                    <TableCell sx={{ fontWeight: 'bold', padding: '6px 8px' }}>Book</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredStudents.map((student, studentIdx) => {
                    const { status, count } = getStudentReadingStatus(student, selectedDate);
                    const book = getStudentLastBook(student.id);
                    const isRecording = recordingStudents.has(student.id);
                    const hasEntry = status !== READING_STATUS.NONE;
                    const isFirstRow = studentIdx === 0;

                    const btnSx = { minWidth: 36, minHeight: 36, px: 0.5, borderRadius: 1.5 };
                    const numBtnSx = { ...btnSx, minWidth: 32, fontSize: '0.9rem' };

                    return (
                      <TableRow key={student.id} hover>
                        {previousDays.map((date) => {
                          const dateStr = formatDateISO(date);
                          const prevStatus = getStudentReadingStatus(student, dateStr);
                          let content = '-';
                          let cellColor = 'grey.400';
                          let bgColor = 'transparent';
                          switch (prevStatus.status) {
                            case READING_STATUS.READ:
                              content = '✓';
                              cellColor = 'success.dark';
                              bgColor = 'rgba(46, 125, 50, 0.1)';
                              break;
                            case READING_STATUS.MULTIPLE:
                              content = prevStatus.count;
                              cellColor = 'success.dark';
                              bgColor = 'rgba(46, 125, 50, 0.15)';
                              break;
                            case READING_STATUS.ABSENT:
                              content = 'A';
                              cellColor = 'warning.dark';
                              bgColor = 'rgba(237, 108, 2, 0.1)';
                              break;
                            case READING_STATUS.NO_RECORD:
                              content = '•';
                              cellColor = 'grey.500';
                              bgColor = 'grey.100';
                              break;
                            default:
                              break;
                          }
                          return (
                            <TableCell
                              key={dateStr}
                              sx={{
                                textAlign: 'center',
                                padding: '4px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                backgroundColor: bgColor,
                                color: cellColor,
                                minWidth: 36,
                                maxWidth: 44,
                              }}
                            >
                              {content}
                            </TableCell>
                          );
                        })}
                        <TableCell
                          sx={{
                            fontWeight: 500,
                            fontSize: '0.9rem',
                            whiteSpace: 'nowrap',
                            padding: '4px 8px',
                            borderRight: '1px solid',
                            borderRightColor: 'divider',
                          }}
                        >
                          {student.name}
                        </TableCell>
                        <TableCell
                          {...(isFirstRow ? { 'data-tour': 'quick-buttons' } : {})}
                          sx={{ padding: '4px 8px' }}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              gap: 0.5,
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                            }}
                          >
                            <Button
                              size="small"
                              variant={status === READING_STATUS.READ ? 'contained' : 'outlined'}
                              color="success"
                              disabled={isRecording}
                              onClick={() => handleQuickRecord(student, READING_STATUS.READ)}
                              sx={{ ...btnSx, fontSize: '1.1rem' }}
                              aria-label={`Mark ${student.name} as read`}
                            >
                              ✓
                            </Button>
                            {[2, 3, 4].map((n) => (
                              <Button
                                key={n}
                                size="small"
                                variant={
                                  status === READING_STATUS.MULTIPLE &&
                                  (n < 4 ? count === n : count >= 4)
                                    ? 'contained'
                                    : 'outlined'
                                }
                                color="primary"
                                disabled={isRecording}
                                onClick={() =>
                                  handleQuickRecord(student, READING_STATUS.MULTIPLE, n)
                                }
                                sx={numBtnSx}
                                aria-label={`Mark ${student.name} as read ${n} times`}
                              >
                                {n < 4
                                  ? n
                                  : status === READING_STATUS.MULTIPLE && count >= 4
                                    ? count
                                    : '4'}
                              </Button>
                            ))}
                            <Button
                              size="small"
                              variant="outlined"
                              color="primary"
                              disabled={isRecording}
                              onClick={() => {
                                setQuickMultipleStudent(student);
                                setMultipleCountDialog(true);
                              }}
                              sx={numBtnSx}
                              aria-label={`Custom reading count for ${student.name}`}
                            >
                              +
                            </Button>
                            <Button
                              size="small"
                              variant={status === READING_STATUS.ABSENT ? 'contained' : 'outlined'}
                              color="warning"
                              disabled={isRecording}
                              onClick={() => handleQuickRecord(student, READING_STATUS.ABSENT)}
                              sx={numBtnSx}
                              aria-label={`Mark ${student.name} as absent`}
                            >
                              A
                            </Button>
                            <Button
                              size="small"
                              variant={
                                status === READING_STATUS.NO_RECORD ? 'contained' : 'outlined'
                              }
                              disabled={isRecording}
                              onClick={() => handleQuickRecord(student, READING_STATUS.NO_RECORD)}
                              sx={{
                                ...numBtnSx,
                                color: status === READING_STATUS.NO_RECORD ? undefined : 'grey.500',
                              }}
                              aria-label={`Mark ${student.name} as no record`}
                            >
                              •
                            </Button>
                            {hasEntry && (
                              <IconButton
                                size="small"
                                disabled={isRecording}
                                onClick={() => handleClearEntry(student)}
                                sx={{ color: 'error.main', ml: 0.25 }}
                                aria-label={`Clear entry for ${student.name}`}
                              >
                                <CloseIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            )}
                            {isRecording && <CircularProgress size={16} sx={{ ml: 0.5 }} />}
                          </Box>
                        </TableCell>
                        <TableCell
                          {...(isFirstRow ? { 'data-tour': 'quick-book' } : {})}
                          onClick={() => setEditingBookStudentId(student.id)}
                          sx={{
                            color: book ? 'text.secondary' : 'text.disabled',
                            fontSize: '0.85rem',
                            minWidth: editingBookStudentId === student.id ? 250 : 120,
                            maxWidth: editingBookStudentId === student.id ? 350 : 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            padding: '4px 8px',
                            cursor: 'pointer',
                          }}
                        >
                          {editingBookStudentId === student.id ? (
                            <ClickAwayListener onClickAway={() => setEditingBookStudentId(null)}>
                              <Box onClick={(e) => e.stopPropagation()}>
                                <BookAutocomplete
                                  value={book}
                                  onChange={(newBook) => {
                                    updateStudentCurrentBook(
                                      student.id,
                                      newBook?.id || null,
                                      newBook?.title || null,
                                      newBook?.author || null
                                    );
                                    setEditingBookStudentId(null);
                                  }}
                                  label=""
                                  placeholder="Search for book..."
                                />
                              </Box>
                            </ClickAwayListener>
                          ) : (
                            book?.title || 'Tap to set book'
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredStudents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4 }}>
                        <Typography color="text.secondary">
                          {searchQuery
                            ? 'No students match your search'
                            : 'No students in this class'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      {/* Full Register View */}
      {viewMode === 'full' && (
        <>
          {/* Two-column layout for Recording and Date sections */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 2,
              mb: 2,
            }}
          >
            {/* Left Column - Input Panel (Recording for) */}
            <Paper sx={{ p: 2, flex: isMobile ? 'none' : 1 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: isMobile ? 'pointer' : 'default',
                }}
                onClick={() => isMobile && setShowInputPanel(!showInputPanel)}
              >
                <Typography variant="h6">
                  {selectedStudent
                    ? `Recording for: ${selectedStudent.name}`
                    : 'Select a student from the register'}
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
                        value={getStudentLastBook(selectedStudent.id)}
                        onChange={handleBookChange}
                        label="Current Book"
                        placeholder="Select or search for book..."
                      />
                      <Typography variant="caption" color="text.secondary">
                        Book will be saved and synced across devices
                      </Typography>
                    </Box>

                    {/* Quick Input Buttons */}
                    <Box
                      sx={{
                        display: 'flex',
                        gap: 1,
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                      }}
                    >
                      <Tooltip title="Read (✓)">
                        <Button
                          variant="contained"
                          color="success"
                          size="large"
                          aria-label="Mark as read"
                          onClick={() => handleRecordReading(READING_STATUS.READ)}
                          sx={{ minWidth: 80, fontSize: '1.5rem', py: 1.5 }}
                        >
                          ✓
                        </Button>
                      </Tooltip>

                      <Tooltip title="Read 2 times">
                        <Button
                          variant="contained"
                          color="primary"
                          size="large"
                          aria-label="Read 2 times"
                          onClick={() => handleRecordReading(READING_STATUS.MULTIPLE, 2)}
                          sx={{ minWidth: 50, fontSize: '1.2rem', py: 1.5 }}
                        >
                          2
                        </Button>
                      </Tooltip>

                      <Tooltip title="Read 3 times">
                        <Button
                          variant="contained"
                          color="primary"
                          size="large"
                          aria-label="Read 3 times"
                          onClick={() => handleRecordReading(READING_STATUS.MULTIPLE, 3)}
                          sx={{ minWidth: 50, fontSize: '1.2rem', py: 1.5 }}
                        >
                          3
                        </Button>
                      </Tooltip>

                      <Tooltip title="Read 4 times">
                        <Button
                          variant="contained"
                          color="primary"
                          size="large"
                          aria-label="Read 4 times"
                          onClick={() => handleRecordReading(READING_STATUS.MULTIPLE, 4)}
                          sx={{ minWidth: 50, fontSize: '1.2rem', py: 1.5 }}
                        >
                          4
                        </Button>
                      </Tooltip>

                      <Tooltip title="Custom number of sessions">
                        <Button
                          variant="contained"
                          color="primary"
                          size="large"
                          aria-label="Custom number of reading sessions"
                          onClick={handleMultipleClick}
                          sx={{ minWidth: 50, fontSize: '1.2rem', py: 1.5 }}
                        >
                          +
                        </Button>
                      </Tooltip>

                      <Tooltip title="Absent (A)">
                        <Button
                          variant="contained"
                          color="warning"
                          size="large"
                          aria-label="Mark as absent"
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
                          aria-label="No reading record"
                          onClick={() => handleRecordReading(READING_STATUS.NO_RECORD)}
                          sx={{ minWidth: 80, fontSize: '1.5rem', py: 1.5 }}
                        >
                          •
                        </Button>
                      </Tooltip>
                    </Box>
                  </Box>
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 2, textAlign: 'center' }}
                  >
                    Click on a student in the register below to record their reading
                  </Typography>
                )}
              </Collapse>
            </Paper>

            {/* Right Column - Date and Search Controls */}
            <Paper sx={{ p: 2, flex: isMobile ? 'none' : 1 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
                {/* Date Picker */}
                <TextField
                  label="Date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  inputProps={{ 'aria-label': 'Select date for reading session' }}
                />

                {/* Date Range Preset */}
                <FormControl data-tour="register-date-range" size="small" fullWidth>
                  <InputLabel id="date-preset-label">Date Range</InputLabel>
                  <Select
                    labelId="date-preset-label"
                    value={datePreset}
                    label="Date Range"
                    onChange={(e) => {
                      const newPreset = e.target.value;
                      setDatePreset(newPreset);
                      if (newPreset === DATE_PRESETS.CUSTOM) {
                        const today = new Date();
                        setCustomStartDate(formatDateISO(getStartOfWeek(today)));
                        setCustomEndDate(formatDateISO(getEndOfWeek(today)));
                      }
                    }}
                  >
                    <MenuItem value={DATE_PRESETS.THIS_WEEK}>This Week</MenuItem>
                    <MenuItem value={DATE_PRESETS.LAST_WEEK}>Last Week</MenuItem>
                    <MenuItem value={DATE_PRESETS.LAST_MONTH}>Last Month</MenuItem>
                    {termDates.length > 0 && (
                      <MenuItem value={DATE_PRESETS.CURRENT_TERM}>Current Term</MenuItem>
                    )}
                    {termDates.length > 0 && (
                      <MenuItem value={DATE_PRESETS.SCHOOL_YEAR}>School Year</MenuItem>
                    )}
                    {termDates.length > 0 &&
                      termDates.map((term) => (
                        <MenuItem key={term.termOrder} value={`term_${term.termOrder}`}>
                          {term.termName}
                        </MenuItem>
                      ))}
                    <MenuItem value={DATE_PRESETS.CUSTOM}>Custom</MenuItem>
                  </Select>
                </FormControl>

                {datePreset === DATE_PRESETS.CUSTOM && (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      label="Start"
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      size="small"
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label="End"
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      size="small"
                      sx={{ flex: 1 }}
                    />
                  </Box>
                )}

                {/* Search */}
                <TextField
                  placeholder="Search student..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  fullWidth
                  inputProps={{ 'aria-label': 'Search for a student by name' }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
            </Paper>
          </Box>

          {/* Register Table */}
          <Paper sx={{ mb: 2, position: 'relative' }}>
            {sessionsLoading && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255, 255, 255, 0.7)',
                  zIndex: 10,
                }}
              >
                <CircularProgress size={40} />
              </Box>
            )}
            <TableContainer
              data-tour="register-table"
              sx={{ maxHeight: { xs: 'calc(100vh - 340px)', sm: 'calc(100vh - 260px)' } }}
            >
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell
                      sx={{
                        fontWeight: 'bold',
                        minWidth: isMobile ? 100 : 140,
                        padding: isMobile ? '8px 6px' : '6px 8px',
                        position: 'sticky',
                        left: 0,
                        backgroundColor: 'background.paper',
                        zIndex: 3,
                      }}
                    >
                      Name
                    </TableCell>
                    {dates.map((date, index) => {
                      const { day, date: dayNum } = formatDateHeader(date);
                      const dateStr = formatDateISO(date);
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                      const isSelectedDate = selectedDate === dateStr;
                      return (
                        <TableCell
                          key={index}
                          sx={{
                            fontWeight: 'bold',
                            textAlign: 'center',
                            minWidth: isMobile ? 44 : 48,
                            padding: isMobile ? '8px 4px' : '6px 6px',
                            backgroundColor: isSelectedDate
                              ? 'primary.main'
                              : isWeekend
                                ? 'grey.100'
                                : 'background.paper',
                            color: isSelectedDate ? 'primary.contrastText' : 'text.primary',
                            cursor: 'pointer',
                            '@media (hover: hover) and (pointer: fine)': {
                              '&:hover': {
                                backgroundColor: isSelectedDate ? 'primary.dark' : 'action.hover',
                              },
                            },
                            transition: 'background-color 0.2s ease-in-out',
                          }}
                          onClick={() => setSelectedDate(dateStr)}
                        >
                          <Tooltip
                            title={date.toLocaleDateString('en-GB', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'short',
                            })}
                          >
                            <Box>
                              <Typography
                                variant="caption"
                                display="block"
                                sx={{ fontSize: isMobile ? '0.7rem' : '0.75rem' }}
                              >
                                {day}
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: 'bold',
                                  fontSize: isMobile ? '0.8rem' : '0.85rem',
                                }}
                              >
                                {dayNum}
                              </Typography>
                            </Box>
                          </Tooltip>
                        </TableCell>
                      );
                    })}
                    <TableCell
                      sx={{
                        fontWeight: 'bold',
                        textAlign: 'center',
                        minWidth: 44,
                        padding: isMobile ? '8px 4px' : '6px 6px',
                        backgroundColor: 'primary.light',
                        color: 'primary.contrastText',
                      }}
                    >
                      Total
                    </TableCell>
                    <TableCell
                      sx={{
                        fontWeight: 'bold',
                        textAlign: 'center',
                        minWidth: 44,
                        padding: isMobile ? '8px 4px' : '6px 6px',
                      }}
                    >
                      Clear
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredStudents.map((student) => {
                    const isSelected = selectedStudent?.id === student.id;
                    const { status } = getStudentReadingStatus(student, selectedDate);
                    const hasEntry = status !== READING_STATUS.NONE;

                    return (
                      <TableRow
                        key={student.id}
                        hover
                        selected={isSelected}
                        onClick={() => setSelectedStudent(student)}
                        sx={{
                          cursor: 'pointer',
                          '&.Mui-selected': { backgroundColor: 'primary.light' },
                        }}
                      >
                        <TableCell
                          sx={{
                            fontWeight: isSelected ? 'bold' : 500,
                            fontSize: isMobile ? '0.8rem' : '0.85rem',
                            padding: isMobile ? '10px 6px' : '8px 8px',
                            position: 'sticky',
                            left: 0,
                            backgroundColor: isSelected ? 'primary.light' : 'background.paper',
                            zIndex: 1,
                          }}
                        >
                          {student.name}
                        </TableCell>
                        {dates.map((date) => renderDateStatusCell(student, date))}
                        <TableCell
                          sx={{
                            textAlign: 'center',
                            fontWeight: 'bold',
                            backgroundColor: 'primary.light',
                            color: 'primary.contrastText',
                            fontSize: isMobile ? '0.85rem' : '0.9rem',
                            padding: isMobile ? '10px 4px' : '8px 6px',
                          }}
                        >
                          {getStudentTotalInRange(student)}
                        </TableCell>
                        <TableCell
                          sx={{ textAlign: 'center', padding: isMobile ? '6px 4px' : '4px 4px' }}
                        >
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
                                  minWidth: 36,
                                  minHeight: 36,
                                  padding: '4px',
                                  '@media (hover: hover) and (pointer: fine)': {
                                    '&:hover': { backgroundColor: 'error.light' },
                                  },
                                  '&:active': { backgroundColor: 'rgba(193, 126, 126, 0.2)' },
                                }}
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredStudents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={dates.length + 3} sx={{ textAlign: 'center', py: 4 }}>
                        <Typography color="text.secondary">
                          {searchQuery
                            ? 'No students match your search'
                            : 'No students in this class'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredStudents.length > 0 && (
                    <TableRow data-tour="register-totals" sx={{ backgroundColor: 'grey.50' }}>
                      <TableCell
                        sx={{
                          fontWeight: 'bold',
                          position: 'sticky',
                          left: 0,
                          backgroundColor: 'grey.50',
                          zIndex: 3,
                          borderTop: '2px solid',
                          borderColor: 'grey.300',
                          padding: isMobile ? '8px 6px' : '6px 8px',
                          fontSize: isMobile ? '0.8rem' : '0.85rem',
                        }}
                      >
                        Daily Totals
                      </TableCell>
                      {dailyTotals.map((totals, index) => {
                        const isWeekend =
                          dates[index].getDay() === 0 || dates[index].getDay() === 6;
                        return (
                          <TableCell
                            key={index}
                            sx={{
                              textAlign: 'center',
                              fontWeight: 'bold',
                              padding: isMobile ? '8px 4px' : '6px 6px',
                              backgroundColor: isWeekend ? 'grey.100' : 'grey.50',
                              borderTop: '2px solid',
                              borderColor: 'grey.300',
                              fontSize: isMobile ? '0.75rem' : '0.8rem',
                            }}
                          >
                            {totals.totalSessions > 0 && (
                              <Tooltip
                                title={`${totals.read} read, ${totals.multiple} multiple, ${totals.absent} absent, ${totals.noRecord} no record, ${totals.notEntered} not entered`}
                              >
                                <Box>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 'bold', color: 'success.main' }}
                                  >
                                    {totals.totalSessions}
                                  </Typography>
                                  {totals.read > 0 && (
                                    <Typography
                                      variant="caption"
                                      sx={{ color: 'success.dark', fontSize: '0.7rem' }}
                                    >
                                      {totals.read}✓
                                    </Typography>
                                  )}
                                  {totals.multiple > 0 && (
                                    <Typography
                                      variant="caption"
                                      sx={{ color: 'success.dark', fontSize: '0.7rem' }}
                                    >
                                      +{totals.multiple}
                                    </Typography>
                                  )}
                                </Box>
                              </Tooltip>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell
                        sx={{
                          textAlign: 'center',
                          fontWeight: 'bold',
                          backgroundColor: 'primary.light',
                          color: 'primary.contrastText',
                          borderTop: '2px solid',
                          borderColor: 'grey.300',
                          padding: isMobile ? '4px 2px' : '2px 4px',
                          fontSize: isMobile ? '0.8rem' : '0.85rem',
                        }}
                      >
                        {dailyTotals.reduce((sum, day) => sum + day.totalSessions, 0)}
                      </TableCell>
                      <TableCell
                        sx={{
                          borderTop: '2px solid',
                          borderColor: 'grey.300',
                          backgroundColor: 'grey.50',
                        }}
                      />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      {/* Summary chips + Legend — compact single row */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Chip
          label={`${registerTotals.read} Read`}
          color="success"
          size="small"
          icon={<CheckIcon />}
        />
        <Chip label={`${registerTotals.multipleSessions} Multiple`} color="primary" size="small" />
        <Chip label={`${registerTotals.absent} Absent`} color="warning" size="small" />
        <Chip label={`${registerTotals.noRecord} No Record`} size="small" />
        <Chip
          label={`${registerTotals.notEntered} Not Entered`}
          variant="outlined"
          color="error"
          size="small"
        />
        <Chip
          label={`${registerTotals.totalSessions} Total`}
          color="secondary"
          size="small"
          sx={{ fontWeight: 'bold' }}
        />
      </Box>

      {/* Student Books Read (full view only) */}
      {viewMode === 'full' && selectedStudent && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
            Books Read — {selectedStudent.name}
          </Typography>
          {historyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : studentHistory.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No reading sessions recorded yet
            </Typography>
          ) : (
            (() => {
              // Group sessions by bookId, ordered by most recent session
              const bookGroups = new Map();
              for (const session of studentHistory) {
                const key = session.bookId || `no-book-${session.id}`;
                if (!bookGroups.has(key)) {
                  bookGroups.set(key, { bookId: session.bookId, sessions: [] });
                }
                bookGroups.get(key).sessions.push(session);
              }
              const booksRead = [...bookGroups.values()]
                .filter((g) => g.bookId) // exclude sessions with no book
                .map((g) => ({
                  ...g,
                  lastDate: g.sessions[0].date, // already sorted newest-first
                  firstDate: g.sessions[g.sessions.length - 1].date,
                  count: g.sessions.length,
                }));
              if (booksRead.length === 0)
                return (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textAlign: 'center', py: 2 }}
                  >
                    No books recorded yet
                  </Typography>
                );
              return (
                <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
                  {booksRead.slice(0, 30).map((entry) => {
                    const book = booksMap.get(entry.bookId);
                    const lastDate = new Date(entry.lastDate);
                    const dateLabel = lastDate.toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    });
                    return (
                      <Box
                        key={entry.bookId}
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          minWidth: 90,
                          maxWidth: 90,
                          flexShrink: 0,
                        }}
                      >
                        <BookCover
                          title={book?.title || 'Unknown'}
                          author={book?.author}
                          width={70}
                          height={100}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            mt: 0.5,
                            fontWeight: 600,
                            textAlign: 'center',
                            lineHeight: 1.2,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            fontSize: '0.7rem',
                            width: '100%',
                          }}
                        >
                          {book?.title || 'Unknown'}
                        </Typography>
                        {book?.author && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontSize: '0.6rem', textAlign: 'center', lineHeight: 1.1 }}
                            noWrap
                          >
                            {book.author}
                          </Typography>
                        )}
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.6rem' }}
                        >
                          {entry.count} {entry.count === 1 ? 'session' : 'sessions'}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontSize: '0.6rem' }}
                        >
                          {dateLabel}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              );
            })()
          )}
        </Paper>
      )}

      {/* Multiple Days Dialog */}
      <Dialog open={multipleCountDialog} onClose={() => setMultipleCountDialog(false)}>
        <DialogTitle>How many days of reading?</DialogTitle>
        <DialogContent>
          <TextField
            type="number"
            value={multipleCount}
            onChange={(e) => setMultipleCount(Math.max(2, parseInt(e.target.value) || 5))}
            inputProps={{ min: 2, max: 14 }}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMultipleCountDialog(false)}>Cancel</Button>
          <Button onClick={handleMultipleConfirm} variant="contained" color="primary">
            Record {multipleCount} Days
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snackbarOpen} autoHideDuration={2000} onClose={() => setSnackbarOpen(false)}>
        <Alert
          onClose={() => setSnackbarOpen(false)}
          severity={snackbarSeverity}
          sx={{ width: '100%' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
      <TourButton {...homeTourButtonProps} />
    </Box>
  );
};

export default HomeReadingRegister;
