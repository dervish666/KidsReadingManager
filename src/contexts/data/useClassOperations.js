import { useCallback } from 'react';

const API_URL = '/api';

export function useClassOperations(fetchWithAuth, setClasses, setStudents, setGenres, setApiError) {
  const addClass = useCallback(
    async (classData) => {
      const newClass = {
        id: crypto.randomUUID(),
        name: classData.name,
        teacherName: classData.teacherName || '',
        disabled: false,
      };

      let previousClasses;
      setClasses((prev) => {
        previousClasses = prev;
        return [...prev, newClass];
      });

      try {
        const response = await fetchWithAuth(`${API_URL}/classes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newClass),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const savedClass = await response.json();
        setClasses((prev) => prev.map((c) => (c.id === newClass.id ? savedClass : c)));
        setApiError(null);
        return savedClass;
      } catch (error) {
        setApiError(error.message);
        setClasses(previousClasses);
        return null;
      }
    },
    [fetchWithAuth, setClasses, setApiError]
  );

  const updateClass = useCallback(
    async (id, updatedFields) => {
      let previousClasses;
      let foundClass;
      setClasses((prev) => {
        previousClasses = prev;
        foundClass = prev.find((c) => c.id === id);
        if (!foundClass) return prev;
        return prev.map((c) => (c.id === id ? { ...foundClass, ...updatedFields } : c));
      });

      if (!foundClass) {
        return null;
      }

      const updatedClass = { ...foundClass, ...updatedFields };

      try {
        const response = await fetchWithAuth(`${API_URL}/classes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedClass),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const savedClass = await response.json();
        setClasses((prev) => prev.map((c) => (c.id === id ? savedClass : c)));
        setApiError(null);
        return savedClass;
      } catch (error) {
        setApiError(error.message);
        setClasses(previousClasses);
        return null;
      }
    },
    [fetchWithAuth, setClasses, setApiError]
  );

  const deleteClass = useCallback(
    async (id) => {
      let previousClasses;
      setClasses((prev) => {
        previousClasses = prev;
        return prev.filter((c) => c.id !== id);
      });

      let previousStudents;
      setStudents((prev) => {
        previousStudents = prev;
        return prev.map((s) => (s.classId === id ? { ...s, classId: null } : s));
      });

      try {
        const response = await fetchWithAuth(`${API_URL}/classes/${id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        setApiError(null);
      } catch (error) {
        setApiError(error.message);
        setClasses(previousClasses);
        setStudents(previousStudents);
      }
    },
    [fetchWithAuth, setClasses, setStudents, setApiError]
  );

  const addGenre = useCallback(
    async (genreData) => {
      const newGenre = {
        id: crypto.randomUUID(),
        name: genreData.name,
        isPredefined: false,
      };

      let previousGenres;
      setGenres((prev) => {
        previousGenres = prev;
        return [...prev, newGenre];
      });

      try {
        const response = await fetchWithAuth(`${API_URL}/genres`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newGenre),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const savedGenre = await response.json();
        setGenres((prev) => prev.map((g) => (g.id === newGenre.id ? savedGenre : g)));
        setApiError(null);
        return savedGenre;
      } catch (error) {
        setApiError(error.message);
        setGenres(previousGenres);
        return null;
      }
    },
    [fetchWithAuth, setGenres, setApiError]
  );

  return {
    addClass,
    updateClass,
    deleteClass,
    addGenre,
  };
}
