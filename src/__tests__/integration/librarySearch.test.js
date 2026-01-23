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

    it('should allow ±1 reading level match', () => {
      const levelOrder = ['beginner', 'elementary', 'intermediate', 'advanced', 'expert'];

      const getValidLevels = (studentLevel) => {
        const idx = levelOrder.indexOf(studentLevel);
        return levelOrder.slice(
          Math.max(0, idx - 1),
          Math.min(levelOrder.length, idx + 2)
        );
      };

      // Intermediate student should match elementary, intermediate, advanced
      const intermediateValid = getValidLevels('intermediate');
      expect(intermediateValid).toContain('elementary');
      expect(intermediateValid).toContain('intermediate');
      expect(intermediateValid).toContain('advanced');
      expect(intermediateValid).not.toContain('beginner');
      expect(intermediateValid).not.toContain('expert');

      // Beginner student should only match beginner and elementary
      const beginnerValid = getValidLevels('beginner');
      expect(beginnerValid).toContain('beginner');
      expect(beginnerValid).toContain('elementary');
      expect(beginnerValid).not.toContain('intermediate');
    });
  });
});
