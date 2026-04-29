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
    editReadingSession,
    deleteReadingSession,
  };
}
