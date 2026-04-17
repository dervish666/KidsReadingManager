import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import BookCover from '../../components/BookCover';

describe('BookCover Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    // Component shouldn't make any network calls itself; the browser loads
    // the image URL directly. Confirming global.fetch was never called keeps
    // us honest.
  });

  describe('Source URL selection', () => {
    it('uses the ISBN route when an ISBN is provided', () => {
      render(<BookCover title="Harry Potter" author="J.K. Rowling" isbn="9780747532699" />);
      const img = screen.getByRole('img', { name: /cover of harry potter/i });
      expect(img).toHaveAttribute('src', '/api/covers/isbn/9780747532699-M.jpg');
    });

    it('uses the search route when no ISBN is provided', () => {
      render(<BookCover title="Harry Potter" author="J.K. Rowling" />);
      const img = screen.getByRole('img', { name: /cover of harry potter/i });
      expect(img).toHaveAttribute(
        'src',
        '/api/covers/search?title=Harry+Potter&author=J.K.+Rowling'
      );
    });

    it('omits the author param when no author is provided', () => {
      render(<BookCover title="Orphan Book" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/api/covers/search?title=Orphan+Book');
    });

    it('URL-encodes special characters in title and author', () => {
      render(<BookCover title="A&B: The Book" author="Smith, John" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute(
        'src',
        '/api/covers/search?title=A%26B%3A+The+Book&author=Smith%2C+John'
      );
    });
  });

  describe('ISBN → search fallback on image error', () => {
    it('retries with the search URL when the ISBN image errors', async () => {
      render(<BookCover title="Test Book" author="Some Author" isbn="1234567890" />);
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', '/api/covers/isbn/1234567890-M.jpg');

      fireEvent.error(img);

      await waitFor(() => {
        const retried = screen.getByRole('img');
        expect(retried).toHaveAttribute(
          'src',
          '/api/covers/search?title=Test+Book&author=Some+Author'
        );
      });
    });

    it('shows the placeholder when both ISBN and search URLs error', async () => {
      render(<BookCover title="Test Book" isbn="1234567890" />);
      fireEvent.error(screen.getByRole('img'));

      // After the first error we should be on the search URL
      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute(
          'src',
          '/api/covers/search?title=Test+Book'
        );
      });

      // Trigger a second error — no further fallback available
      fireEvent.error(screen.getByRole('img'));

      await waitFor(() => {
        expect(screen.getByTestId('placeholder-bg')).toBeInTheDocument();
        expect(document.querySelector('img')).not.toBeInTheDocument();
      });
    });
  });

  describe('Placeholder behaviour', () => {
    it('shows the placeholder when image errors with no ISBN to fall back from', async () => {
      render(<BookCover title="Test Book" />);
      fireEvent.error(screen.getByRole('img'));

      await waitFor(() => {
        expect(screen.getByTestId('placeholder-bg')).toBeInTheDocument();
        expect(document.querySelector('img')).not.toBeInTheDocument();
      });
    });

    it('shows the placeholder when title is empty', () => {
      render(<BookCover title="" />);
      expect(screen.getByTestId('placeholder-bg')).toBeInTheDocument();
      expect(document.querySelector('img')).not.toBeInTheDocument();
    });
  });

  describe('Props and dimensions', () => {
    it('uses default dimensions when not specified', () => {
      render(<BookCover title="" />);
      const placeholder = screen.getByTestId('placeholder-bg');
      expect(placeholder).toHaveStyle({ width: '80px', height: '120px' });
    });

    it('uses custom dimensions when specified', () => {
      render(<BookCover title="" width={100} height={150} />);
      const placeholder = screen.getByTestId('placeholder-bg');
      expect(placeholder).toHaveStyle({ width: '100px', height: '150px' });
    });

    it('passes dimensions to the cover image', () => {
      render(<BookCover title="Test Book" width={100} height={150} />);
      const img = screen.getByRole('img');
      expect(img).toHaveStyle({ width: '100px', height: '150px' });
    });
  });

  describe('Edge cases', () => {
    it('does not make any client-side fetch call', () => {
      global.fetch = vi.fn();
      render(<BookCover title="Harry Potter" author="J.K. Rowling" />);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('resets fallback state when the book changes', async () => {
      const { rerender } = render(<BookCover title="Book A" isbn="1111111111" />);

      fireEvent.error(screen.getByRole('img'));
      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', '/api/covers/search?title=Book+A');
      });

      // Switch to a different book — fallback state should reset
      rerender(<BookCover title="Book B" isbn="2222222222" />);

      await waitFor(() => {
        expect(screen.getByRole('img')).toHaveAttribute('src', '/api/covers/isbn/2222222222-M.jpg');
      });
    });
  });
});
