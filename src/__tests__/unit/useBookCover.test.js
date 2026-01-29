import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { BookCoverProvider } from '../../contexts/BookCoverContext';
import { useBookCover, _clearPendingRequests } from '../../hooks/useBookCover';

// Wrapper component for providing context
const wrapper = ({ children }) => (
  <BookCoverProvider>{children}</BookCoverProvider>
);

describe('useBookCover', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset fetch mock before each test
    vi.resetAllMocks();
    // Clear any pending requests from previous tests
    _clearPendingRequests();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initial state', () => {
    it('should return loading state initially when fetching', async () => {
      // Mock fetch to never resolve during the test
      global.fetch = vi.fn(() => new Promise(() => {}));

      const { result } = renderHook(() => useBookCover('Harry Potter', 'J.K. Rowling'), {
        wrapper,
      });

      // Should be loading initially
      expect(result.current.isLoading).toBe(true);
      expect(result.current.coverUrl).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('fetching covers from OpenLibrary', () => {
    it('should fetch cover from OpenLibrary and return correct URL', async () => {
      // Mock successful OpenLibrary response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [{ cover_i: 12345678 }],
          }),
      });

      const { result } = renderHook(() => useBookCover('Harry Potter', 'J.K. Rowling'), {
        wrapper,
      });

      // Wait for the fetch to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should have the correct cover URL
      expect(result.current.coverUrl).toBe('https://covers.openlibrary.org/b/id/12345678-M.jpg');
      expect(result.current.error).toBeNull();

      // Verify fetch was called with correct URL (URLSearchParams uses + for spaces)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://openlibrary.org/search.json')
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('title=Harry+Potter')
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('author=J.K.+Rowling')
      );
    });

    it('should return null when no cover found (empty docs)', async () => {
      // Mock OpenLibrary response with no results
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [],
          }),
      });

      const { result } = renderHook(() => useBookCover('Unknown Book', 'Unknown Author'), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should have null cover URL
      expect(result.current.coverUrl).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should return null when doc has no cover_i field', async () => {
      // Mock OpenLibrary response with doc but no cover_i
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [{ title: 'Some Book', author_name: ['Some Author'] }],
          }),
      });

      const { result } = renderHook(() => useBookCover('Some Book', 'Some Author'), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.coverUrl).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should handle fetch without author parameter', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [{ cover_i: 99999 }],
          }),
      });

      const { result } = renderHook(() => useBookCover('Orphan Book'), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.coverUrl).toBe('https://covers.openlibrary.org/b/id/99999-M.jpg');

      // Verify fetch was called without author param (URLSearchParams uses + for spaces)
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('title=Orphan+Book')
      );
    });
  });

  describe('caching behavior', () => {
    it('should use cached value on subsequent calls (fetch only called once)', async () => {
      // Mock successful OpenLibrary response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [{ cover_i: 11111 }],
          }),
      });

      // First render - should fetch
      const { result, rerender } = renderHook(
        ({ title, author }) => useBookCover(title, author),
        {
          wrapper,
          initialProps: { title: 'Cached Book', author: 'Cached Author' },
        }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.coverUrl).toBe('https://covers.openlibrary.org/b/id/11111-M.jpg');
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Re-render with same title/author - should use cache
      rerender({ title: 'Cached Book', author: 'Cached Author' });

      // Should immediately have the cached value without loading
      expect(result.current.isLoading).toBe(false);
      expect(result.current.coverUrl).toBe('https://covers.openlibrary.org/b/id/11111-M.jpg');

      // Fetch should NOT have been called again
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should cache null result to avoid re-fetching failures', async () => {
      // Mock OpenLibrary response with no cover
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [],
          }),
      });

      // First render - should fetch and get null
      const { result, rerender } = renderHook(
        ({ title, author }) => useBookCover(title, author),
        {
          wrapper,
          initialProps: { title: 'No Cover Book', author: 'No Cover Author' },
        }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.coverUrl).toBeNull();
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Re-render with same title/author - should use cached null value
      rerender({ title: 'No Cover Book', author: 'No Cover Author' });

      // Should NOT be loading because result is cached (even though it's null)
      expect(result.current.isLoading).toBe(false);
      expect(result.current.coverUrl).toBeNull();

      // Fetch should NOT have been called again
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle fetch errors gracefully and set error state', async () => {
      // Mock fetch to throw an error
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useBookCover('Error Book', 'Error Author'), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.coverUrl).toBeNull();
      expect(result.current.error).toBe('Network error');
    });

    it('should handle non-OK response gracefully', async () => {
      // Mock fetch with non-OK response
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const { result } = renderHook(() => useBookCover('Server Error Book', 'Author'), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.coverUrl).toBeNull();
      expect(result.current.error).toBeTruthy();
    });
  });

  describe('edge cases', () => {
    it('should not fetch when title is empty', async () => {
      global.fetch = vi.fn();

      const { result } = renderHook(() => useBookCover('', 'Author'), {
        wrapper,
      });

      // Should not be loading because there's no title to search
      expect(result.current.isLoading).toBe(false);
      expect(result.current.coverUrl).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not fetch when title is null or undefined', async () => {
      global.fetch = vi.fn();

      const { result: result1 } = renderHook(() => useBookCover(null, 'Author'), {
        wrapper,
      });

      expect(result1.current.isLoading).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();

      const { result: result2 } = renderHook(() => useBookCover(undefined, 'Author'), {
        wrapper,
      });

      expect(result2.current.isLoading).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
