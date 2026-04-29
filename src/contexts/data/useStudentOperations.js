import { useCallback } from 'react';

const API_URL = '/api';

export function useStudentOperations(fetchWithAuth, setStudents, setApiError) {
  const addStudent = useCallback(
    async (name, classId = null) => {
      const newStudent = {
        id: crypto.randomUUID(),
        name,
        lastReadDate: null,
        totalSessionCount: 0,
        classId,
      };

      setStudents((prev) => [...prev, newStudent]);

      try {
        const response = await fetchWithAuth(`${API_URL}/students`, {
          method: 'POST',
          body: JSON.stringify(newStudent),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const savedStudent = await response.json();
        setStudents((prev) => prev.map((s) => (s.id === newStudent.id ? savedStudent : s)));
        setApiError(null);
        return savedStudent;
      } catch (error) {
        setApiError(error.message);
        setStudents((prev) => prev.filter((s) => s.id !== newStudent.id));
        return null;
      }
    },
    [fetchWithAuth, setStudents, setApiError]
  );

  const bulkImportStudents = useCallback(
    async (names, classId = null) => {
      if (!Array.isArray(names) || names.length === 0) {
        return [];
      }

      const normalizedClassId = classId && classId.trim() !== '' ? classId : null;

      const newStudents = names.map((name) => ({
        id: crypto.randomUUID(),
        name: name.trim(),
        classId: normalizedClassId,
        lastReadDate: null,
        totalSessionCount: 0,
        likes: [],
        dislikes: [],
      }));

      const newStudentIds = new Set(newStudents.map((s) => s.id));
      setStudents((prev) => [...prev, ...newStudents]);

      try {
        const BATCH_SIZE = 5;
        const allResponses = [];
        for (let i = 0; i < newStudents.length; i += BATCH_SIZE) {
          const batch = newStudents.slice(i, i + BATCH_SIZE);
          const batchResponses = await Promise.all(
            batch.map((student) =>
              fetchWithAuth(`${API_URL}/students`, {
                method: 'POST',
                body: JSON.stringify(student),
              })
            )
          );
          allResponses.push(...batchResponses);
        }

        const allOk = allResponses.every((r) => r.ok);
        if (!allOk) {
          throw new Error('Some students failed to save');
        }

        const savedStudents = await Promise.all(
          allResponses.map((r) => r.json().catch(() => null))
        );

        const validSavedStudents = savedStudents.filter((s) => s && s.id);
        if (validSavedStudents.length > 0) {
          setStudents((prev) => {
            const updated = [...prev];
            validSavedStudents.forEach((saved) => {
              const index = updated.findIndex((s) => s.id === saved.id);
              if (index !== -1) {
                updated[index] = saved;
              }
            });
            return updated;
          });
        }

        setApiError(null);
        return validSavedStudents;
      } catch (error) {
        setApiError(error.message);
        setStudents((prev) => prev.filter((s) => !newStudentIds.has(s.id)));
        return [];
      }
    },
    [fetchWithAuth, setStudents, setApiError]
  );

  const updateStudentClassId = useCallback(
    async (studentId, classId) => {
      const normalizedClassId = classId === 'unassigned' || classId === '' ? null : classId;

      let previousClassId;
      let foundStudent;
      setStudents((prev) => {
        const student = prev.find((s) => s.id === studentId);
        if (!student) {
          foundStudent = null;
          return prev;
        }
        foundStudent = student;
        previousClassId = student.classId;
        return prev.map((s) => (s.id === studentId ? { ...s, classId: normalizedClassId } : s));
      });

      if (!foundStudent) {
        return;
      }

      const updatedStudent = { ...foundStudent, classId: normalizedClassId };

      try {
        const response = await fetchWithAuth(`${API_URL}/students/${studentId}`, {
          method: 'PUT',
          body: JSON.stringify(updatedStudent),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        setApiError(null);
      } catch (error) {
        setApiError(error.message);
        setStudents((prev) =>
          prev.map((s) => (s.id === studentId ? { ...s, classId: previousClassId } : s))
        );
        throw error;
      }
    },
    [fetchWithAuth, setStudents, setApiError]
  );

  const updateStudent = useCallback(
    async (id, updatedData) => {
      let snapshotBeforeUpdate;
      let foundStudent;
      setStudents((prev) => {
        const currentStudent = prev.find((student) => student.id === id);
        if (!currentStudent) {
          foundStudent = null;
          return prev;
        }
        foundStudent = currentStudent;
        snapshotBeforeUpdate = { ...currentStudent };
        return prev.map((student) =>
          student.id === id ? { ...currentStudent, ...updatedData } : student
        );
      });

      if (!foundStudent) {
        return;
      }

      const updatedStudent = { ...foundStudent, ...updatedData };

      try {
        const response = await fetchWithAuth(`${API_URL}/students/${id}`, {
          method: 'PUT',
          body: JSON.stringify(updatedStudent),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        setApiError(null);
      } catch (error) {
        setApiError(error.message);
        setStudents((prev) =>
          prev.map((s) => (s.id === id ? { ...s, ...snapshotBeforeUpdate } : s))
        );
      }
    },
    [fetchWithAuth, setStudents, setApiError]
  );

  const deleteStudent = useCallback(
    async (id) => {
      let deletedStudent;
      setStudents((prev) => {
        deletedStudent = prev.find((s) => s.id === id);
        return prev.filter((student) => student.id !== id);
      });

      try {
        const response = await fetchWithAuth(`${API_URL}/students/${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        setApiError(null);
      } catch (error) {
        setApiError(error.message);
        if (deletedStudent) {
          setStudents((prev) => [...prev, deletedStudent]);
        }
      }
    },
    [fetchWithAuth, setStudents, setApiError]
  );

  const updateStudentCurrentBook = useCallback(
    async (studentId, bookId, bookTitle = null, bookAuthor = null) => {
      let previousStudents;
      let foundStudent;
      setStudents((prev) => {
        previousStudents = prev;
        foundStudent = prev.find((s) => s.id === studentId);
        if (!foundStudent) return prev;
        return prev.map((s) =>
          s.id === studentId
            ? {
                ...s,
                currentBookId: bookId,
                currentBookTitle: bookTitle,
                currentBookAuthor: bookAuthor,
              }
            : s
        );
      });

      if (!foundStudent) {
        return null;
      }

      try {
        const response = await fetchWithAuth(`${API_URL}/students/${studentId}/current-book`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookId }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `API error: ${response.status}`);
        }

        const result = await response.json();

        setStudents((prev) =>
          prev.map((s) =>
            s.id === studentId
              ? {
                  ...s,
                  currentBookId: result.currentBookId,
                  currentBookTitle: result.currentBookTitle,
                  currentBookAuthor: result.currentBookAuthor,
                }
              : s
          )
        );

        setApiError(null);
        return result;
      } catch (error) {
        setApiError(error.message);
        setStudents(previousStudents);
        return null;
      }
    },
    [fetchWithAuth, setStudents, setApiError]
  );

  return {
    addStudent,
    bulkImportStudents,
    updateStudent,
    updateStudentClassId,
    updateStudentCurrentBook,
    deleteStudent,
  };
}
