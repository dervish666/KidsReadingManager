import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  TableCell,
  Snackbar,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
import { useUI } from '../../contexts/UIContext';
import { useTour } from '../tour/useTour';
import TourButton from '../tour/TourButton';
import QuickReadingView from './QuickReadingView';
import FullReadingView from './FullReadingView';
import MultipleCountDialog from './MultipleCountDialog';
import {
  READING_STATUS,
  DATE_PRESETS,
  formatDateISO,
  getYesterday,
  getStartOfWeek,
  getEndOfWeek,
  getStartOfMonth,
  getEndOfMonth,
  getDateRange,
} from './homeReadingUtils';

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
        const todayStr = formatDateISO(today);
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
  // Extend the fetch start to cover quick-view history columns and multi-day
  // sessions that go backward from selectedDate (up to 14 days for the + button).
  const fetchStartDateISO = useMemo(() => {
    if (!selectedDate) return formatDateISO(startDate);
    const backDate = new Date(selectedDate + 'T12:00:00');
    backDate.setDate(backDate.getDate() - 14);
    const presetStart = formatDateISO(startDate);
    const backStr = formatDateISO(backDate);
    return backStr < presetStart ? backStr : presetStart;
  }, [startDate, selectedDate]);
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
    if (!fetchStartDateISO || !endDateISO) return;

    setSessionsLoading(true);
    fetchWithAuth(
      `/api/students/sessions?classId=${effectiveClassId}&startDate=${fetchStartDateISO}&endDate=${endDateISO}`
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
  }, [effectiveClassId, fetchStartDateISO, endDateISO, fetchWithAuth]);

  // Refresh sessions after mutations (add/delete)
  const refreshSessions = useCallback(() => {
    if (!effectiveClassId) return Promise.resolve();
    return fetchWithAuth(
      `/api/students/sessions?classId=${effectiveClassId}&startDate=${fetchStartDateISO}&endDate=${endDateISO}`
    )
      .then((r) => (r.ok ? r.json() : []))
      .then(setClassSessions)
      .catch(() => {});
  }, [effectiveClassId, fetchStartDateISO, endDateISO, fetchWithAuth]);

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
      // Delete home sessions on selectedDate
      const toDelete = studentSessions.filter(
        (s) => s.date === selectedDate && s.location === 'home'
      );
      // Also delete any backfill sessions on previous days created by multi-day recording
      const backfills = studentSessions.filter(
        (s) => s.date !== selectedDate && s.location === 'home' && s.notes?.includes('[BACKFILL]')
      );
      toDelete.push(...backfills);
      for (const session of toDelete) {
        await deleteReadingSession(student.id, session.id);
      }

      await refreshSessions();
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
      // Delete home sessions on selectedDate
      const toDelete = studentSessions.filter(
        (s) => s.date === selectedDate && s.location === 'home'
      );
      // Also delete any backfill sessions on previous days created by multi-day recording
      const backfills = studentSessions.filter(
        (s) => s.date !== selectedDate && s.location === 'home' && s.notes?.includes('[BACKFILL]')
      );
      toDelete.push(...backfills);
      for (const session of toDelete) {
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
          const sessionDate = new Date(selectedDate + 'T12:00:00');
          sessionDate.setDate(sessionDate.getDate() - i);
          const dateStr = formatDateISO(sessionDate);

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
              notes: i > 0 ? '[BACKFILL]' : '',
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
              notes: i > 0 ? '[BACKFILL]' : '',
              bookId,
              location: 'home',
            });
          }
        }
      }

      await refreshSessions();
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
      // Clear existing HOME sessions for this date and any backfill sessions
      const studentSessions = sessionsByStudent[selectedStudent.id] || [];
      const toDelete = studentSessions.filter(
        (s) => s.date === selectedDate && s.location === 'home'
      );
      // Also delete any backfill sessions on previous days created by multi-day recording
      const backfills = studentSessions.filter(
        (s) => s.date !== selectedDate && s.location === 'home' && s.notes?.includes('[BACKFILL]')
      );
      toDelete.push(...backfills);
      for (const session of toDelete) {
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
          const sessionDate = new Date(selectedDate + 'T12:00:00');
          sessionDate.setDate(sessionDate.getDate() - i);
          const dateStr = formatDateISO(sessionDate);

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
              notes: i > 0 ? '[BACKFILL]' : '',
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
              notes: i > 0 ? '[BACKFILL]' : '',
              bookId,
              location: 'home',
            });
          }
        }
      }

      await refreshSessions();
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
        <QuickReadingView
          selectedDate={selectedDate}
          onSelectedDateChange={setSelectedDate}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filteredStudents={filteredStudents}
          sessionsLoading={sessionsLoading}
          previousDays={previousDays}
          getStudentReadingStatus={getStudentReadingStatus}
          getStudentLastBook={getStudentLastBook}
          recordingStudents={recordingStudents}
          editingBookStudentId={editingBookStudentId}
          onEditBookStudent={setEditingBookStudentId}
          onQuickRecord={handleQuickRecord}
          onClearEntry={handleClearEntry}
          onQuickMultipleStudent={setQuickMultipleStudent}
          onMultipleCountDialogOpen={() => setMultipleCountDialog(true)}
          updateStudentCurrentBook={updateStudentCurrentBook}
        />
      )}

      {/* Full Register View */}
      {viewMode === 'full' && (
        <FullReadingView
          isMobile={isMobile}
          selectedDate={selectedDate}
          onSelectedDateChange={setSelectedDate}
          selectedStudent={selectedStudent}
          onSelectedStudentChange={setSelectedStudent}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          showInputPanel={showInputPanel}
          onShowInputPanelChange={setShowInputPanel}
          datePreset={datePreset}
          onDatePresetChange={setDatePreset}
          customStartDate={customStartDate}
          onCustomStartDateChange={setCustomStartDate}
          customEndDate={customEndDate}
          onCustomEndDateChange={setCustomEndDate}
          termDates={termDates}
          sessionsLoading={sessionsLoading}
          filteredStudents={filteredStudents}
          dates={dates}
          dailyTotals={dailyTotals}
          getStudentReadingStatus={getStudentReadingStatus}
          getStudentLastBook={getStudentLastBook}
          getStudentTotalInRange={getStudentTotalInRange}
          onRecordReading={handleRecordReading}
          onMultipleClick={handleMultipleClick}
          onBookChange={handleBookChange}
          onClearEntry={handleClearEntry}
          renderDateStatusCell={renderDateStatusCell}
          historyLoading={historyLoading}
          studentHistory={studentHistory}
          booksMap={booksMap}
        />
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

      {/* Multiple Days Dialog */}
      <MultipleCountDialog
        open={multipleCountDialog}
        onClose={() => setMultipleCountDialog(false)}
        onConfirm={handleMultipleConfirm}
        count={multipleCount}
        onCountChange={setMultipleCount}
      />

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
