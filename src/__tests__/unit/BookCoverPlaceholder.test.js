import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import BookCoverPlaceholder from '../../components/BookCoverPlaceholder';

describe('BookCoverPlaceholder Component', () => {
  describe('Rendering', () => {
    it('should render with a book title', () => {
      render(<BookCoverPlaceholder title="The Cat in the Hat" />);

      expect(screen.getByText('The Cat in the Hat')).toBeInTheDocument();
    });

    it('should render the book icon with data-testid', () => {
      render(<BookCoverPlaceholder title="Test Book" />);

      const bookIcon = screen.getByTestId('book-icon');
      expect(bookIcon).toBeInTheDocument();
    });

    it('should render the placeholder background with data-testid', () => {
      render(<BookCoverPlaceholder title="Test Book" />);

      const placeholderBg = screen.getByTestId('placeholder-bg');
      expect(placeholderBg).toBeInTheDocument();
    });

    it('should render with default dimensions when not specified', () => {
      render(<BookCoverPlaceholder title="Test Book" />);

      const placeholderBg = screen.getByTestId('placeholder-bg');
      // Default width is 80, height is 120
      expect(placeholderBg).toHaveStyle({ width: '80px', height: '120px' });
    });

    it('should render with custom dimensions when specified', () => {
      render(<BookCoverPlaceholder title="Test Book" width={100} height={150} />);

      const placeholderBg = screen.getByTestId('placeholder-bg');
      expect(placeholderBg).toHaveStyle({ width: '100px', height: '150px' });
    });

    it('should truncate long titles', () => {
      const longTitle = 'This is a very long book title that should be truncated to fit within the placeholder component';
      render(<BookCoverPlaceholder title={longTitle} />);

      // The component should still contain the title (it will be truncated via CSS)
      const titleElement = screen.getByText(longTitle);
      expect(titleElement).toBeInTheDocument();
    });
  });

  describe('Color Generation', () => {
    it('should generate consistent color for the same title', () => {
      const { rerender } = render(<BookCoverPlaceholder title="Harry Potter" />);
      const firstRender = screen.getByTestId('placeholder-bg');
      const firstColor = firstRender.style.backgroundColor;

      rerender(<BookCoverPlaceholder title="Harry Potter" />);
      const secondRender = screen.getByTestId('placeholder-bg');
      const secondColor = secondRender.style.backgroundColor;

      expect(firstColor).toBe(secondColor);
    });

    it('should generate different colors for different titles', () => {
      const { rerender } = render(<BookCoverPlaceholder title="Harry Potter" />);
      const firstRender = screen.getByTestId('placeholder-bg');
      const firstColor = firstRender.style.backgroundColor;

      rerender(<BookCoverPlaceholder title="The Lord of the Rings" />);
      const secondRender = screen.getByTestId('placeholder-bg');
      const secondColor = secondRender.style.backgroundColor;

      // Colors should be different for different titles
      expect(firstColor).not.toBe(secondColor);
    });

    it('should generate a background color for any title', () => {
      render(<BookCoverPlaceholder title="Any Book Title" />);

      const placeholderBg = screen.getByTestId('placeholder-bg');
      // Should have a background color set
      expect(placeholderBg.style.backgroundColor).toBeTruthy();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty title gracefully', () => {
      render(<BookCoverPlaceholder title="" />);

      // Should still render the placeholder
      const placeholderBg = screen.getByTestId('placeholder-bg');
      expect(placeholderBg).toBeInTheDocument();

      // Should still render the book icon
      const bookIcon = screen.getByTestId('book-icon');
      expect(bookIcon).toBeInTheDocument();
    });

    it('should handle single character title', () => {
      render(<BookCoverPlaceholder title="A" />);

      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('should handle special characters in title', () => {
      const specialTitle = "Harry Potter & the Philosopher's Stone";
      render(<BookCoverPlaceholder title={specialTitle} />);

      expect(screen.getByText(specialTitle)).toBeInTheDocument();
    });
  });
});
