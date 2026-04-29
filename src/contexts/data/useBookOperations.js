import { useCallback } from 'react';

const API_URL = '/api';

export function useBookOperations(fetchWithAuth, books, setBooks, setApiError) {
  const updateBook = useCallback(
    async (id, updatedFields) => {
      let previousBooks;
      let foundBook;
      setBooks((prev) => {
        previousBooks = prev;
        foundBook = prev.find((b) => b.id === id);
        if (!foundBook) return prev;
        return prev.map((b) => (b.id === id ? { ...foundBook, ...updatedFields } : b));
      });

      if (!foundBook) {
        return null;
      }

      const updatedBook = { ...foundBook, ...updatedFields };

      try {
        const response = await fetchWithAuth(`${API_URL}/books/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedBook),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const saved = await response.json().catch(() => null);
        if (saved && saved.id) {
          setBooks((prev) => prev.map((b) => (b.id === id ? saved : b)));
          return saved;
        }

        return updatedBook;
      } catch (error) {
        setApiError(error.message);
        setBooks(previousBooks);
        return null;
      }
    },
    [fetchWithAuth, setBooks, setApiError]
  );

  const updateBookField = useCallback(
    async (id, field, value) => {
      if (!id || !field) return null;
      return updateBook(id, { [field]: value || null });
    },
    [updateBook]
  );

  const addBook = useCallback(
    async (title, author = null, metadata = {}) => {
      const newBook = {
        id: crypto.randomUUID(),
        title,
        author,
        genreIds: [],
        readingLevel: null,
        ageRange: null,
        description: null,
        ...metadata,
      };

      const previousBooks = books;
      setBooks((prev) => [...prev, newBook]);

      try {
        const response = await fetchWithAuth(`${API_URL}/books`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newBook),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const savedBook = await response.json();
        setBooks((prev) => prev.map((b) => (b.id === newBook.id ? savedBook : b)));
        setApiError(null);
        return savedBook;
      } catch (error) {
        setApiError(error.message);
        setBooks(previousBooks);
        return null;
      }
    },
    [books, fetchWithAuth, setBooks, setApiError]
  );

  const findOrCreateBook = useCallback(
    async (title, author = null, metadata = {}) => {
      const normalizedTitle = title.trim().toLowerCase();
      const existingBook = books.find((book) => book.title.toLowerCase() === normalizedTitle);

      if (existingBook) {
        if (author && !existingBook.author) {
          const updatedBook = await updateBook(existingBook.id, { author });
          return updatedBook || existingBook;
        }
        return existingBook;
      }

      return addBook(title, author, metadata);
    },
    [books, addBook, updateBook]
  );

  const fetchBookDetails = useCallback(
    async (bookId) => {
      try {
        const response = await fetchWithAuth(`${API_URL}/books/${bookId}`);
        if (!response.ok) return null;
        const fullBook = await response.json();
        setBooks((prev) => prev.map((b) => (b.id === bookId ? fullBook : b)));
        return fullBook;
      } catch {
        return null;
      }
    },
    [fetchWithAuth, setBooks]
  );

  return {
    addBook,
    updateBook,
    updateBookField,
    findOrCreateBook,
    fetchBookDetails,
  };
}
