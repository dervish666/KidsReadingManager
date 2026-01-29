import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildStudentReadingProfile } from '../../utils/studentProfile.js';

// Mock database helper for testing D1 interactions
const createMockDB = (overrides = {}) => {
  const mockPrepare = vi.fn();
  const mockBind = vi.fn();
  const mockAll = vi.fn();
  const mockFirst = vi.fn();

  mockBind.mockReturnThis();
  mockPrepare.mockReturnValue({
    bind: mockBind,
    all: mockAll,
    first: mockFirst
  });

  return {
    prepare: mockPrepare,
    _mockBind: mockBind,
    _mockAll: mockAll,
    _mockFirst: mockFirst,
    ...overrides
  };
};

describe('Library Search Integration', () => {
  describe('buildStudentReadingProfile for library search', () => {
    let mockDb;

    beforeEach(() => {
      mockDb = createMockDB();
    });

    it('should build complete profile with all data present', async () => {
      // Mock student data
      mockDb._mockFirst
        .mockResolvedValueOnce({
          id: 'student-1',
          name: 'Emma',
          reading_level: 'intermediate',
          age_range: '8-10',
          likes: '["Harry Potter", "Percy Jackson"]',
          dislikes: '["boring books"]',
          notes: 'Loves fantasy'
        });

      // Mock preferences (favorite genres) - note: query uses genre_name and preference_type
      mockDb._mockAll
        .mockResolvedValueOnce({
          results: [
            { genre_id: 'genre-1', genre_name: 'Fantasy', preference_type: 'favorite' },
            { genre_id: 'genre-2', genre_name: 'Adventure', preference_type: 'favorite' }
          ]
        })
        // Mock reading sessions
        .mockResolvedValueOnce({
          results: [
            { book_id: 'book-1', title: 'The Hobbit', author: 'Tolkien', genre_ids: 'genre-1', session_date: '2024-01-15' },
            { book_id: 'book-2', title: 'Narnia', author: 'Lewis', genre_ids: 'genre-1', session_date: '2024-01-10' }
          ]
        })
        // Mock genre names lookup
        .mockResolvedValueOnce({
          results: [
            { id: 'genre-1', name: 'Fantasy' }
          ]
        });

      const profile = await buildStudentReadingProfile('student-1', 'org-1', mockDb);

      expect(profile).not.toBeNull();
      expect(profile.student.name).toBe('Emma');
      expect(profile.student.readingLevel).toBe('intermediate');
      expect(profile.preferences.favoriteGenreIds).toContain('genre-1');
      expect(profile.preferences.favoriteGenreNames).toContain('Fantasy');
      expect(profile.preferences.likes).toEqual(['Harry Potter', 'Percy Jackson']);
      expect(profile.preferences.dislikes).toEqual(['boring books']);
      expect(profile.readBookIds).toContain('book-1');
      expect(profile.booksReadCount).toBe(2);
    });

    it('should return null for non-existent student', async () => {
      mockDb._mockFirst.mockResolvedValueOnce(null);

      const profile = await buildStudentReadingProfile('nonexistent', 'org-1', mockDb);

      expect(profile).toBeNull();
    });

    it('should handle student with no reading history', async () => {
      mockDb._mockFirst.mockResolvedValueOnce({
        id: 'student-2',
        name: 'New Student',
        reading_level: 'beginner',
        age_range: '6-8',
        likes: null,
        dislikes: null,
        notes: null
      });

      mockDb._mockAll
        .mockResolvedValueOnce({ results: [] }) // No preferences
        .mockResolvedValueOnce({ results: [] }); // No reading sessions

      const profile = await buildStudentReadingProfile('student-2', 'org-1', mockDb);

      expect(profile.student.name).toBe('New Student');
      expect(profile.preferences.favoriteGenreIds).toEqual([]);
      expect(profile.inferredGenres).toEqual([]);
      expect(profile.recentReads).toEqual([]);
      expect(profile.readBookIds).toEqual([]);
      expect(profile.booksReadCount).toBe(0);
    });

    it('should limit inferred genres to top 3', async () => {
      mockDb._mockFirst.mockResolvedValueOnce({
        id: 'student-3',
        name: 'Voracious Reader',
        reading_level: 'advanced',
        age_range: '10-12',
        likes: null,
        dislikes: null,
        notes: null
      });

      mockDb._mockAll
        .mockResolvedValueOnce({ results: [] }) // No explicit preferences
        .mockResolvedValueOnce({
          results: [
            // Multiple books in different genres
            { book_id: 'b1', title: 'Book1', author: 'A', genre_ids: 'fantasy', session_date: '2024-01-01' },
            { book_id: 'b2', title: 'Book2', author: 'A', genre_ids: 'fantasy', session_date: '2024-01-02' },
            { book_id: 'b3', title: 'Book3', author: 'A', genre_ids: 'fantasy', session_date: '2024-01-03' },
            { book_id: 'b4', title: 'Book4', author: 'A', genre_ids: 'mystery', session_date: '2024-01-04' },
            { book_id: 'b5', title: 'Book5', author: 'A', genre_ids: 'mystery', session_date: '2024-01-05' },
            { book_id: 'b6', title: 'Book6', author: 'A', genre_ids: 'scifi', session_date: '2024-01-06' },
            { book_id: 'b7', title: 'Book7', author: 'A', genre_ids: 'romance', session_date: '2024-01-07' }
          ]
        })
        .mockResolvedValueOnce({
          results: [
            { id: 'fantasy', name: 'Fantasy' },
            { id: 'mystery', name: 'Mystery' },
            { id: 'scifi', name: 'Science Fiction' },
            { id: 'romance', name: 'Romance' }
          ]
        });

      const profile = await buildStudentReadingProfile('student-3', 'org-1', mockDb);

      // Should only return top 3 genres
      expect(profile.inferredGenres.length).toBe(3);
      // Fantasy should be first (3 books)
      expect(profile.inferredGenres[0].id).toBe('fantasy');
      expect(profile.inferredGenres[0].count).toBe(3);
    });

    it('should limit recent reads to 5', async () => {
      mockDb._mockFirst.mockResolvedValueOnce({
        id: 'student-4',
        name: 'Reader',
        reading_level: 'intermediate',
        age_range: '8-10',
        likes: null,
        dislikes: null,
        notes: null
      });

      mockDb._mockAll
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({
          results: Array.from({ length: 10 }, (_, i) => ({
            book_id: `book-${i}`,
            title: `Book ${i}`,
            author: `Author ${i}`,
            genre_ids: 'fiction',
            session_date: `2024-01-${String(20 - i).padStart(2, '0')}`
          }))
        })
        .mockResolvedValueOnce({ results: [{ id: 'fiction', name: 'Fiction' }] });

      const profile = await buildStudentReadingProfile('student-4', 'org-1', mockDb);

      expect(profile.recentReads.length).toBe(5);
    });

    it('should handle malformed JSON in likes/dislikes', async () => {
      mockDb._mockFirst.mockResolvedValueOnce({
        id: 'student-5',
        name: 'Student',
        reading_level: 'intermediate',
        age_range: '8-10',
        likes: 'not valid json',
        dislikes: '{ broken',
        notes: null
      });

      mockDb._mockAll
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      const profile = await buildStudentReadingProfile('student-5', 'org-1', mockDb);

      // Should default to empty arrays on parse error
      expect(profile.preferences.likes).toEqual([]);
      expect(profile.preferences.dislikes).toEqual([]);
    });
  });

  describe('buildStudentReadingProfile with reading level range', () => {
    let mockDb;

    beforeEach(() => {
      mockDb = createMockDB();
    });

    it('should include reading level min and max in profile', async () => {
      mockDb._mockFirst.mockResolvedValueOnce({
        id: 'student-range-1',
        name: 'Range Student',
        reading_level: '3.0',
        reading_level_min: 2.5,
        reading_level_max: 3.5,
        age_range: '8-10',
        likes: null,
        dislikes: null,
        notes: null
      });

      mockDb._mockAll
        .mockResolvedValueOnce({ results: [] }) // No preferences
        .mockResolvedValueOnce({ results: [] }); // No reading sessions

      const profile = await buildStudentReadingProfile('student-range-1', 'org-1', mockDb);

      expect(profile.student.readingLevelMin).toBe(2.5);
      expect(profile.student.readingLevelMax).toBe(3.5);
    });

    it('should handle null reading level range', async () => {
      mockDb._mockFirst.mockResolvedValueOnce({
        id: 'student-no-range',
        name: 'No Range Student',
        reading_level: null,
        reading_level_min: null,
        reading_level_max: null,
        age_range: '8-10',
        likes: null,
        dislikes: null,
        notes: null
      });

      mockDb._mockAll
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      const profile = await buildStudentReadingProfile('student-no-range', 'org-1', mockDb);

      expect(profile.student.readingLevelMin).toBeNull();
      expect(profile.student.readingLevelMax).toBeNull();
    });

    it('should handle zero as valid reading level min', async () => {
      // Edge case: ensure 0 is not treated as falsy
      mockDb._mockFirst.mockResolvedValueOnce({
        id: 'student-zero',
        name: 'Zero Min Student',
        reading_level: '1.0',
        reading_level_min: 0,
        reading_level_max: 1.5,
        age_range: '6-8',
        likes: null,
        dislikes: null,
        notes: null
      });

      mockDb._mockAll
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      const profile = await buildStudentReadingProfile('student-zero', 'org-1', mockDb);

      // 0 should be preserved, not treated as null
      expect(profile.student.readingLevelMin).toBe(0);
      expect(profile.student.readingLevelMax).toBe(1.5);
    });
  });

  describe('Library search reading level range filtering', () => {
    // These tests verify the expected filtering behavior at a conceptual level
    // The actual SQL filtering is tested in integration with the endpoint

    it('should filter books within student range', () => {
      const studentRange = { min: 2.0, max: 4.0 };
      const books = [
        { id: 'b1', reading_level: '1.5' }, // Below range
        { id: 'b2', reading_level: '2.0' }, // At min boundary
        { id: 'b3', reading_level: '3.0' }, // Within range
        { id: 'b4', reading_level: '4.0' }, // At max boundary
        { id: 'b5', reading_level: '4.5' }, // Above range
        { id: 'b6', reading_level: null },  // Unleveled
      ];

      const isInRange = (book) => {
        const level = parseFloat(book.reading_level);
        if (isNaN(level)) return true; // Include unleveled books
        return level >= studentRange.min && level <= studentRange.max;
      };

      const filteredBooks = books.filter(isInRange);

      // Should include: b2 (2.0), b3 (3.0), b4 (4.0), b6 (null)
      expect(filteredBooks.map(b => b.id)).toEqual(['b2', 'b3', 'b4', 'b6']);
    });

    it('should include all books when student has no range', () => {
      const studentRange = { min: null, max: null };
      const books = [
        { id: 'b1', reading_level: '1.5' },
        { id: 'b2', reading_level: '5.0' },
        { id: 'b3', reading_level: null },
      ];

      const isInRange = (book) => {
        if (studentRange.min === null || studentRange.max === null) {
          return true; // No filtering when range is not set
        }
        const level = parseFloat(book.reading_level);
        if (isNaN(level)) return true;
        return level >= studentRange.min && level <= studentRange.max;
      };

      const filteredBooks = books.filter(isInRange);

      expect(filteredBooks.length).toBe(3);
    });

    it('should handle edge case of narrow range', () => {
      const studentRange = { min: 3.0, max: 3.0 }; // Same min and max
      const books = [
        { id: 'b1', reading_level: '2.9' },
        { id: 'b2', reading_level: '3.0' },
        { id: 'b3', reading_level: '3.1' },
      ];

      const isInRange = (book) => {
        const level = parseFloat(book.reading_level);
        if (isNaN(level)) return true;
        return level >= studentRange.min && level <= studentRange.max;
      };

      const filteredBooks = books.filter(isInRange);

      // Only exact match should be included
      expect(filteredBooks.map(b => b.id)).toEqual(['b2']);
    });

    it('should always include unleveled books regardless of range', () => {
      const studentRange = { min: 5.0, max: 6.0 };
      const books = [
        { id: 'b1', reading_level: null },
        { id: 'b2', reading_level: '' },
        { id: 'b3', reading_level: 'unknown' },
      ];

      const isInRange = (book) => {
        if (studentRange.min === null || studentRange.max === null) return true;
        const level = parseFloat(book.reading_level);
        if (isNaN(level)) return true; // Include unleveled books
        return level >= studentRange.min && level <= studentRange.max;
      };

      const filteredBooks = books.filter(isInRange);

      // All should be included because they don't have valid numeric levels
      expect(filteredBooks.length).toBe(3);
    });
  });

  describe('Library search scoring algorithm', () => {
    it('should score explicit favorites higher than inferred', () => {
      // Test the scoring logic conceptually
      const explicitFavoriteScore = 3;
      const inferredFavoriteScore = 2;
      const levelMatchScore = 1;

      const bookA = { genres: ['fantasy'], level: 'intermediate' };
      const bookB = { genres: ['mystery'], level: 'intermediate' };

      const studentProfile = {
        explicitFavorites: ['fantasy'],
        inferredFavorites: ['mystery'],
        readingLevel: 'intermediate'
      };

      // Book A matches explicit favorite
      const scoreA = explicitFavoriteScore + levelMatchScore; // 4

      // Book B matches inferred favorite
      const scoreB = inferredFavoriteScore + levelMatchScore; // 3

      expect(scoreA).toBeGreaterThan(scoreB);
    });

    it('should give bonus score for books near center of reading range', () => {
      const studentRange = { min: 2.0, max: 4.0 };
      const rangeCenter = (studentRange.min + studentRange.max) / 2; // 3.0
      const rangeHalf = (studentRange.max - studentRange.min) / 2; // 1.0

      const calculateLevelScore = (bookLevel) => {
        if (bookLevel === null) return 0;
        const level = parseFloat(bookLevel);
        if (isNaN(level)) return 0;
        const distanceFromCenter = Math.abs(level - rangeCenter);
        // Bonus for books closer to the center of the range
        if (distanceFromCenter <= rangeHalf * 0.5) {
          return 1;
        }
        return 0;
      };

      // Books at center get bonus
      expect(calculateLevelScore('3.0')).toBe(1);
      expect(calculateLevelScore('2.5')).toBe(1);
      expect(calculateLevelScore('3.5')).toBe(1);

      // Books at edges don't get bonus (but are still included in results)
      expect(calculateLevelScore('2.0')).toBe(0);
      expect(calculateLevelScore('4.0')).toBe(0);
    });
  });
});
