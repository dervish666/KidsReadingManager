import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { BookCoverProvider } from '../../contexts/BookCoverContext';
import BookCover from '../../components/BookCover';
import { _clearPendingRequests } from '../../hooks/useBookCover';

// Wrapper component for providing context
const wrapper = ({ children }) => (
  <BookCoverProvider>{children}</BookCoverProvider>
);

const renderWithProvider = (ui) => {
  return render(ui, { wrapper });
};

describe('BookCover Component', () => {
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

  describe('Loading State', () => {
    it('should show placeholder while loading', async () => {
      // Mock fetch to never resolve during the test
      global.fetch = vi.fn(() => new Promise(() => {}));

      renderWithProvider(<BookCover title="Harry Potter" author="J.K. Rowling" />);

      // Should show the placeholder while loading
      const placeholder = screen.getByTestId('placeholder-bg');
      expect(placeholder).toBeInTheDocument();

      // Should show the book icon from placeholder
      const bookIcon = screen.getByTestId('book-icon');
      expect(bookIcon).toBeInTheDocument();
    });
  });

  describe('Cover Image Display', () => {
    it('should show cover image when found', async () => {
      // Mock successful OpenLibrary response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [{ cover_i: 12345678 }],
          }),
      });

      renderWithProvider(<BookCover title="Harry Potter" author="J.K. Rowling" />);

      // Wait for the cover image to appear
      await waitFor(() => {
        const img = screen.getByRole('img', { name: /cover of harry potter/i });
        expect(img).toBeInTheDocument();
      });

      // Verify the image has the correct src
      const img = screen.getByRole('img', { name: /cover of harry potter/i });
      expect(img).toHaveAttribute('src', 'https://covers.openlibrary.org/b/id/12345678-M.jpg');
    });

    it('should have correct alt text on cover image', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [{ cover_i: 99999 }],
          }),
      });

      renderWithProvider(<BookCover title="The Cat in the Hat" />);

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveAttribute('alt', 'Cover of The Cat in the Hat');
      });
    });
  });

  describe('No Cover Found', () => {
    it('should show placeholder when no cover found', async () => {
      // Mock OpenLibrary response with no results
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [],
          }),
      });

      renderWithProvider(<BookCover title="Unknown Book" author="Unknown Author" />);

      // Wait for fetch to complete
      await waitFor(() => {
        // After loading, should still show placeholder since no cover was found
        const placeholder = screen.getByTestId('placeholder-bg');
        expect(placeholder).toBeInTheDocument();
      });

      // Verify no image is shown
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
  });

  describe('Image Error Handling', () => {
    it('should hide broken image when image fails to load', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [{ cover_i: 12345 }],
          }),
      });

      renderWithProvider(<BookCover title="Test Book" />);

      // Wait for the cover image to appear
      await waitFor(() => {
        expect(screen.getByRole('img')).toBeInTheDocument();
      });

      const img = screen.getByRole('img');

      // Simulate image load error
      fireEvent.error(img);

      // Image should be hidden (not visible)
      expect(img).toHaveStyle({ display: 'none' });
    });
  });

  describe('Props and Dimensions', () => {
    it('should use default dimensions when not specified', async () => {
      global.fetch = vi.fn(() => new Promise(() => {}));

      renderWithProvider(<BookCover title="Test Book" />);

      const placeholder = screen.getByTestId('placeholder-bg');
      // Default width is 80, height is 120
      expect(placeholder).toHaveStyle({ width: '80px', height: '120px' });
    });

    it('should use custom dimensions when specified', async () => {
      global.fetch = vi.fn(() => new Promise(() => {}));

      renderWithProvider(<BookCover title="Test Book" width={100} height={150} />);

      const placeholder = screen.getByTestId('placeholder-bg');
      expect(placeholder).toHaveStyle({ width: '100px', height: '150px' });
    });

    it('should pass dimensions to cover image', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [{ cover_i: 11111 }],
          }),
      });

      renderWithProvider(<BookCover title="Test Book" width={100} height={150} />);

      await waitFor(() => {
        const img = screen.getByRole('img');
        expect(img).toHaveStyle({ width: '100px', height: '150px' });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing author prop gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            docs: [{ cover_i: 22222 }],
          }),
      });

      renderWithProvider(<BookCover title="Orphan Book" />);

      await waitFor(() => {
        expect(screen.getByRole('img')).toBeInTheDocument();
      });
    });

    it('should show placeholder when title is empty', async () => {
      global.fetch = vi.fn();

      renderWithProvider(<BookCover title="" />);

      // Should show placeholder
      const placeholder = screen.getByTestId('placeholder-bg');
      expect(placeholder).toBeInTheDocument();

      // Fetch should not be called
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
