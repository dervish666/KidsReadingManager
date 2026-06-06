import { useCallback } from 'react';

const API_URL = '/api';

export function useSessionOperations(fetchWithAuth, setStudents, setApiError) {
  const addReadingSession = useCallback(
    async (studentId, sessionData) => {
      const date = sessionData.date || new Date().toLocaleDateString('en-CA');
      const sessionPayload = {
        date,
        assessment: sessionData.assessment,
        notes: sessionData.notes || '',
        bookId: sessionData.bookId || null,
        bookTitle: sessionData.bookTitle || null,
        bookAuthor: sessionData.bookAuthor || null,
        pagesRead: sessionData.pagesRead || null,
        duration: sessionData.duration || null,
        location: sessionData.location || 'school',
        readFluent: sessionData.readFluent ?? null,
        readExpressive: sessionData.readExpressive ?? null,
        readPhonics: sessionData.readPhonics ?? null,
        readCustom1: sessionData.readCustom1 ?? null,
        readCustom2: sessionData.readCustom2 ?? null,
        readCustom3: sessionData.readCustom3 ?? null,
      };

      try {
        const response = await fetchWithAuth(`${API_URL}/students/${studentId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sessionPayload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `API error: ${response.status}`);
        }

        const savedSession = await response.json();

        const isMarker =
          sessionPayload.notes &&
          (sessionPayload.notes.includes('[ABSENT]') ||
            sessionPayload.notes.includes('[NO_RECORD]'));
        setStudents((prev) =>
          prev.map((s) => {
            if (s.id !== studentId) return s;
            if (isMarker) return s;
            const newLastRead = !s.lastReadDate || date > s.lastReadDate ? date : s.lastReadDate;
            return {
              ...s,
              lastReadDate: newLastRead,
              totalSessionCount: (s.totalSessionCount || 0) + 1,
              currentBand: savedSession.currentBand ?? s.currentBand,
              bandReadsCount: savedSession.bandReadsCount ?? s.bandReadsCount,
              ...(sessionPayload.bookId && {
                currentBookId: sessionPayload.bookId,
                currentBookTitle: sessionPayload.bookTitle,
                currentBookAuthor: sessionPayload.bookAuthor,
              }),
            };
          })
        );

        setApiError(null);
        return savedSession;
      } catch (error) {
        setApiError(error.message);
        return null;
      }
    },
    [fetchWithAuth, setStudents, setApiError]
  );

  /**
   * Create several sessions for one student in a single request
   * (POST /sessions/bulk). Replaces sequential addReadingSession loops —
   * the server runs the side-effect chain once for the whole batch and
   * returns aggregate newBadges/completedGoals/bandUp.
   */
  const addReadingSessionsBulk = useCallback(
    async (studentId, sessionsData) => {
      const sessions = (sessionsData || []).map((sessionData) => ({
        date: sessionData.date || new Date().toLocaleDateString('en-CA'),
        assessment: sessionData.assessment,
        notes: sessionData.notes || '',
        bookId: sessionData.bookId || null,
        bookTitle: sessionData.bookTitle || null,
        bookAuthor: sessionData.bookAuthor || null,
        pagesRead: sessionData.pagesRead || null,
        duration: sessionData.duration || null,
        location: sessionData.location || 'school',
        readFluent: sessionData.readFluent ?? null,
        readExpressive: sessionData.readExpressive ?? null,
        readPhonics: sessionData.readPhonics ?? null,
        readCustom1: sessionData.readCustom1 ?? null,
        readCustom2: sessionData.readCustom2 ?? null,
        readCustom3: sessionData.readCustom3 ?? null,
      }));
      if (sessions.length === 0) return null;

      try {
        const response = await fetchWithAuth(`${API_URL}/students/${studentId}/sessions/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessions }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `API error: ${response.status}`);
        }

        const result = await response.json();

        const isMarker = (notes) =>
          notes && (notes.includes('[ABSENT]') || notes.includes('[NO_RECORD]'));
        const nonMarkers = sessions.filter((s) => !isMarker(s.notes));
        const maxDate = nonMarkers.map((s) => s.date).sort().pop() || null;
        const lastWithBook = [...sessions].reverse().find((s) => s.bookId);

        setStudents((prev) =>
          prev.map((s) => {
            if (s.id !== studentId) return s;
            if (nonMarkers.length === 0) return s;
            const newLastRead =
              maxDate && (!s.lastReadDate || maxDate > s.lastReadDate) ? maxDate : s.lastReadDate;
            return {
              ...s,
              lastReadDate: newLastRead,
              totalSessionCount: (s.totalSessionCount || 0) + nonMarkers.length,
              currentBand: result.currentBand ?? s.currentBand,
              bandReadsCount: result.bandReadsCount ?? s.bandReadsCount,
              ...(lastWithBook?.bookId && {
                currentBookId: lastWithBook.bookId,
                currentBookTitle: lastWithBook.bookTitle,
                currentBookAuthor: lastWithBook.bookAuthor,
              }),
            };
          })
        );

        setApiError(null);
        return result;
      } catch (error) {
        setApiError(error.message);
        return null;
      }
    },
    [fetchWithAuth, setStudents, setApiError]
  );

  const editReadingSession = useCallback(
    async (studentId, sessionId, updatedSessionData) => {
      const sessionPayload = {
        date: updatedSessionData.date,
        bookId: updatedSessionData.bookId || null,
        bookTitle: updatedSessionData.bookTitle || null,
        bookAuthor: updatedSessionData.bookAuthor || null,
        pagesRead: updatedSessionData.pagesRead || null,
        duration: updatedSessionData.duration || null,
        assessment: updatedSessionData.assessment || null,
        notes: updatedSessionData.notes || null,
        readFluent: updatedSessionData.readFluent ?? null,
        readExpressive: updatedSessionData.readExpressive ?? null,
        readPhonics: updatedSessionData.readPhonics ?? null,
        readCustom1: updatedSessionData.readCustom1 ?? null,
        readCustom2: updatedSessionData.readCustom2 ?? null,
        readCustom3: updatedSessionData.readCustom3 ?? null,
      };

      try {
        const response = await fetchWithAuth(
          `${API_URL}/students/${studentId}/sessions/${sessionId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sessionPayload),
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        setStudents((prev) =>
          prev.map((s) => {
            if (s.id !== studentId) return s;
            return {
              ...s,
              ...(sessionPayload.bookId && {
                currentBookId: sessionPayload.bookId,
                currentBookTitle: sessionPayload.bookTitle,
                currentBookAuthor: sessionPayload.bookAuthor,
              }),
            };
          })
        );

        setApiError(null);
      } catch (error) {
        setApiError(error.message);
      }
    },
    [fetchWithAuth, setStudents, setApiError]
  );

  const deleteReadingSession = useCallback(
    async (studentId, sessionId) => {
      try {
        const response = await fetchWithAuth(
          `${API_URL}/students/${studentId}/sessions/${sessionId}`,
          {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        setStudents((prev) =>
          prev.map((s) => {
            if (s.id !== studentId) return s;
            return { ...s, totalSessionCount: Math.max(0, (s.totalSessionCount || 0) - 1) };
          })
        );

        setApiError(null);
        return true;
      } catch (error) {
        setApiError(error.message);
        return false;
      }
    },
    [fetchWithAuth, setStudents, setApiError]
  );

  return {
    addReadingSession,
    addReadingSessionsBulk,
    editReadingSession,
    deleteReadingSession,
  };
}
