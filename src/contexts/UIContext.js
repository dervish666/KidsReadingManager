import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';

// Create context
const UIContext = createContext();

// Custom hook to use the UI context
export const useUI = () => useContext(UIContext);

export const UIProvider = ({ children }) => {
  const { fetchWithAuth, isAuthenticated } = useAuth();
  const { students, classes, readingStatusSettings } = useData();

  // Global class filter state (persisted in sessionStorage)
  const [globalClassFilter, setGlobalClassFilter] = useState(() => {
    if (typeof window === 'undefined') return 'all';
    try {
      return window.sessionStorage.getItem('globalClassFilter') || 'all';
    } catch {
      return 'all';
    }
  });

  // State for preferred number of priority students to display
  const [priorityStudentCount, setPriorityStudentCount] = useState(8);

  // State for completed guided tours
  const [completedTours, setCompletedTours] = useState({});
  const [toursLoaded, setToursLoaded] = useState(false);

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

  // Fetch tour completion status for the current user
  const fetchTourStatus = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/tours/status');
      if (response.ok) {
        const tours = await response.json();
        const tourMap = {};
        tours.forEach((t) => {
          tourMap[t.tourId] = t.version;
        });
        setCompletedTours(tourMap);
      }
    } catch (err) {
      console.error('Failed to fetch tour status:', err);
    } finally {
      setToursLoaded(true);
    }
  }, [fetchWithAuth]);

  // Mark a tour as complete for the current user.
  // Update state optimistically before the API call so that
  // auto-start hooks on other pages don't re-trigger the tour.
  const markTourComplete = useCallback(
    async (tourId, version) => {
      setCompletedTours((prev) => ({ ...prev, [tourId]: version }));
      try {
        await fetchWithAuth(`/api/tours/${tourId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version }),
        });
      } catch (err) {
        console.error('Failed to mark tour complete:', err);
      }
    },
    [fetchWithAuth]
  );

  // Fetch tour status when authenticated
  // Using a ref + effect to only run once when auth becomes true
  const hasFetchedTours = React.useRef(false);
  React.useEffect(() => {
    if (isAuthenticated && !hasFetchedTours.current) {
      hasFetchedTours.current = true;
      fetchTourStatus();
    } else if (!isAuthenticated) {
      hasFetchedTours.current = false;
      setToursLoaded(false);
      setCompletedTours({});
    }
  }, [isAuthenticated, fetchTourStatus]);

  // Update global class filter with persistence
  const updateGlobalClassFilter = useCallback((classId) => {
    setGlobalClassFilter(classId);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem('globalClassFilter', classId);
      } catch (err) {
        // Storage error is non-critical
      }
    }
  }, []);

  // Apply pending class auto-filter after classes load (fresh SSO/demo/email login).
  // This lives here (not DataContext) so globalClassFilter React state actually
  // updates — a sessionStorage write alone won't re-trigger UIContext's initial read.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!Array.isArray(classes) || classes.length === 0) return;

    let pending;
    try {
      pending = window.sessionStorage.getItem('pendingClassAutoFilter');
    } catch {
      return;
    }
    if (!pending) return;

    try {
      const assignedIds = JSON.parse(pending);
      const assignedClasses = classes
        .filter((c) => assignedIds.includes(c.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (assignedClasses.length > 0) {
        updateGlobalClassFilter(assignedClasses[0].id);
      }
      window.sessionStorage.removeItem('pendingClassAutoFilter');
    } catch {
      window.sessionStorage.removeItem('pendingClassAutoFilter');
    }
  }, [classes, updateGlobalClassFilter]);

  // Helper: Get reading status for a student.
  // Uses calendar-date comparison to avoid DST/timezone drift near midnight.
  const getReadingStatus = useCallback(
    (student) => {
      if (!student || !student.lastReadDate) {
        return 'never';
      }

      const todayStr = new Date().toLocaleDateString('en-CA');
      const [ty, tm, td] = todayStr.split('-').map(Number);
      const [ly, lm, ld] = student.lastReadDate.split('-').map(Number);
      const daysSinceLastRead = Math.round(
        (Date.UTC(ty, tm - 1, td) - Date.UTC(ly, lm - 1, ld)) / 86400000
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
          // Storage error is non-critical
        }
      }

      return updated;
    });
  }, []);

  // Helper: Mark student as priority handled
  const markStudentAsPriorityHandled = useCallback(
    (studentId) => {
      setMarkedPriorityStudentIds((prev) => {
        const newSet = new Set(prev).add(studentId);
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(
            'markedPriorityStudents',
            JSON.stringify(Array.from(newSet))
          );
        }
        return newSet;
      });
      // Also add to recently accessed
      addRecentlyAccessedStudent(studentId);
    },
    [addRecentlyAccessedStudent]
  );

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

  // Helper: Remove student from recently accessed list
  const removeRecentlyAccessedStudent = useCallback((studentId) => {
    setRecentlyAccessedStudents((prev) => {
      const updated = prev.filter((id) => id !== studentId);
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem('recentlyAccessedStudents', JSON.stringify(updated));
        } catch (err) {
          // Storage error is non-critical
        }
      }
      return updated;
    });
  }, []);

  // Provider value - memoized to prevent unnecessary re-renders
  const value = useMemo(
    () => ({
      globalClassFilter,
      setGlobalClassFilter: updateGlobalClassFilter,
      priorityStudentCount,
      setPriorityStudentCount,
      readingStatusSettings,
      recentlyAccessedStudents,
      setRecentlyAccessedStudents,
      // Helper functions
      getReadingStatus,
      addRecentlyAccessedStudent,
      removeRecentlyAccessedStudent,
      updatePriorityStudentCount,
      prioritizedStudents,
      markedPriorityStudentIds,
      markStudentAsPriorityHandled,
      resetPriorityList,
      // Tour state
      completedTours,
      toursLoaded,
      markTourComplete,
    }),
    [
      globalClassFilter,
      updateGlobalClassFilter,
      priorityStudentCount,
      readingStatusSettings,
      recentlyAccessedStudents,
      getReadingStatus,
      addRecentlyAccessedStudent,
      removeRecentlyAccessedStudent,
      updatePriorityStudentCount,
      prioritizedStudents,
      markedPriorityStudentIds,
      markStudentAsPriorityHandled,
      resetPriorityList,
      completedTours,
      toursLoaded,
      markTourComplete,
    ]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};
