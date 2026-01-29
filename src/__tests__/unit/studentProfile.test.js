import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildStudentReadingProfile } from '../../utils/studentProfile.js';

describe('buildStudentReadingProfile', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn()
    };
  });

  it('should return student with preferences and inferred genres', async () => {
    const studentId = 'student-123';
    const organizationId = 'org-456';

    // Mock student query
    const studentQuery = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({
        id: 'student-123',
        name: 'Emma',
        reading_level: 'intermediate',
        age_range: '8-10',
        likes: JSON.stringify(['The Hobbit']),
        dislikes: JSON.stringify(['Scary Stories']),
        notes: 'Loves adventure books'
      })
    };

    // Mock preferences query
    const preferencesQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({
        results: [
          { genre_id: 'genre-1', genre_name: 'Fantasy', preference_type: 'favorite' },
          { genre_id: 'genre-2', genre_name: 'Adventure', preference_type: 'favorite' }
        ]
      })
    };

    // Mock reading sessions query (for inferred genres)
    const sessionsQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({
        results: [
          { book_id: 'book-1', title: 'Book One', author: 'Author A', genre_ids: 'genre-1,genre-3', session_date: '2024-01-03' },
          { book_id: 'book-2', title: 'Book Two', author: 'Author B', genre_ids: 'genre-1', session_date: '2024-01-02' },
          { book_id: 'book-3', title: 'Book Three', author: 'Author C', genre_ids: 'genre-3', session_date: '2024-01-01' }
        ]
      })
    };

    // Mock genre names query
    const genreNamesQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({
        results: [
          { id: 'genre-1', name: 'Fantasy' },
          { id: 'genre-3', name: 'Mystery' }
        ]
      })
    };

    mockDb.prepare
      .mockReturnValueOnce(studentQuery)
      .mockReturnValueOnce(preferencesQuery)
      .mockReturnValueOnce(sessionsQuery)
      .mockReturnValueOnce(genreNamesQuery);

    const profile = await buildStudentReadingProfile(studentId, organizationId, mockDb);

    expect(profile.student.name).toBe('Emma');
    expect(profile.student.readingLevel).toBe('intermediate');
    expect(profile.student.ageRange).toBe('8-10');
    expect(profile.student.notes).toBe('Loves adventure books');
    expect(profile.preferences.favoriteGenreIds).toContain('genre-1');
    expect(profile.preferences.favoriteGenreIds).toContain('genre-2');
    expect(profile.preferences.favoriteGenreNames).toContain('Fantasy');
    expect(profile.preferences.favoriteGenreNames).toContain('Adventure');
    expect(profile.preferences.likes).toContain('The Hobbit');
    expect(profile.preferences.dislikes).toContain('Scary Stories');
    expect(profile.inferredGenres).toHaveLength(2); // Top genres from history
    expect(profile.inferredGenres[0].id).toBe('genre-1'); // Most frequent genre first
    expect(profile.inferredGenres[0].count).toBe(2);
    expect(profile.readBookIds).toHaveLength(3);
    expect(profile.booksReadCount).toBe(3);
    expect(profile.recentReads).toHaveLength(3);
    expect(profile.recentReads[0].title).toBe('Book One');
  });

  it('should return null if student not found', async () => {
    const studentQuery = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null)
    };

    mockDb.prepare.mockReturnValueOnce(studentQuery);

    const profile = await buildStudentReadingProfile('nonexistent', 'org-456', mockDb);

    expect(profile).toBeNull();
  });

  it('should handle student with no reading history', async () => {
    const studentQuery = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({
        id: 'student-new',
        name: 'New Student',
        reading_level: 'beginner',
        age_range: '6-8',
        likes: '[]',
        dislikes: '[]',
        notes: null
      })
    };

    const preferencesQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] })
    };

    const sessionsQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] })
    };

    mockDb.prepare
      .mockReturnValueOnce(studentQuery)
      .mockReturnValueOnce(preferencesQuery)
      .mockReturnValueOnce(sessionsQuery);

    const profile = await buildStudentReadingProfile('student-new', 'org-456', mockDb);

    expect(profile.student.name).toBe('New Student');
    expect(profile.student.readingLevel).toBe('beginner');
    expect(profile.inferredGenres).toHaveLength(0);
    expect(profile.readBookIds).toHaveLength(0);
    expect(profile.recentReads).toHaveLength(0);
    expect(profile.booksReadCount).toBe(0);
  });

  it('should return null reading level when not set (allows matching all levels)', async () => {
    const studentQuery = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({
        id: 'student-no-level',
        name: 'No Level Student',
        reading_level: null,
        age_range: null,
        likes: null,
        dislikes: null,
        notes: null
      })
    };

    const preferencesQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] })
    };

    const sessionsQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] })
    };

    mockDb.prepare
      .mockReturnValueOnce(studentQuery)
      .mockReturnValueOnce(preferencesQuery)
      .mockReturnValueOnce(sessionsQuery);

    const profile = await buildStudentReadingProfile('student-no-level', 'org-456', mockDb);

    // When reading level is null, library search will return books of all levels
    expect(profile.student.readingLevel).toBeNull();
    expect(profile.student.ageRange).toBeNull();
    expect(profile.preferences.likes).toEqual([]);
    expect(profile.preferences.dislikes).toEqual([]);
  });

  it('should only return top 3 inferred genres sorted by count', async () => {
    const studentQuery = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({
        id: 'student-avid',
        name: 'Avid Reader',
        reading_level: 'advanced',
        age_range: '10-12',
        likes: '[]',
        dislikes: '[]',
        notes: null
      })
    };

    const preferencesQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] })
    };

    // Reading history with 5 different genres
    const sessionsQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({
        results: [
          { book_id: 'book-1', title: 'Book 1', author: 'A1', genre_ids: 'genre-fantasy', session_date: '2024-01-10' },
          { book_id: 'book-2', title: 'Book 2', author: 'A2', genre_ids: 'genre-fantasy', session_date: '2024-01-09' },
          { book_id: 'book-3', title: 'Book 3', author: 'A3', genre_ids: 'genre-fantasy,genre-mystery', session_date: '2024-01-08' },
          { book_id: 'book-4', title: 'Book 4', author: 'A4', genre_ids: 'genre-mystery', session_date: '2024-01-07' },
          { book_id: 'book-5', title: 'Book 5', author: 'A5', genre_ids: 'genre-adventure', session_date: '2024-01-06' },
          { book_id: 'book-6', title: 'Book 6', author: 'A6', genre_ids: 'genre-scifi', session_date: '2024-01-05' },
          { book_id: 'book-7', title: 'Book 7', author: 'A7', genre_ids: 'genre-horror', session_date: '2024-01-04' }
        ]
      })
    };

    // Genre names query (will only be called for top 3)
    const genreNamesQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({
        results: [
          { id: 'genre-fantasy', name: 'Fantasy' },
          { id: 'genre-mystery', name: 'Mystery' },
          { id: 'genre-adventure', name: 'Adventure' }
        ]
      })
    };

    mockDb.prepare
      .mockReturnValueOnce(studentQuery)
      .mockReturnValueOnce(preferencesQuery)
      .mockReturnValueOnce(sessionsQuery)
      .mockReturnValueOnce(genreNamesQuery);

    const profile = await buildStudentReadingProfile('student-avid', 'org-456', mockDb);

    expect(profile.inferredGenres).toHaveLength(3);
    // Fantasy should be first (count: 3)
    expect(profile.inferredGenres[0].id).toBe('genre-fantasy');
    expect(profile.inferredGenres[0].count).toBe(3);
    // Mystery should be second (count: 2)
    expect(profile.inferredGenres[1].id).toBe('genre-mystery');
    expect(profile.inferredGenres[1].count).toBe(2);
    // Adventure, scifi, and horror all have count 1, but only one should appear
    expect(profile.inferredGenres[2].count).toBe(1);
  });

  it('should only return top 5 recent reads', async () => {
    const studentQuery = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({
        id: 'student-many-reads',
        name: 'Many Reads Student',
        reading_level: 'intermediate',
        age_range: '8-10',
        likes: '[]',
        dislikes: '[]',
        notes: null
      })
    };

    const preferencesQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] })
    };

    // 8 reading sessions
    const sessionsQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({
        results: [
          { book_id: 'book-1', title: 'Most Recent', author: 'Author 1', genre_ids: null, session_date: '2024-01-08' },
          { book_id: 'book-2', title: 'Second', author: 'Author 2', genre_ids: null, session_date: '2024-01-07' },
          { book_id: 'book-3', title: 'Third', author: 'Author 3', genre_ids: null, session_date: '2024-01-06' },
          { book_id: 'book-4', title: 'Fourth', author: 'Author 4', genre_ids: null, session_date: '2024-01-05' },
          { book_id: 'book-5', title: 'Fifth', author: 'Author 5', genre_ids: null, session_date: '2024-01-04' },
          { book_id: 'book-6', title: 'Sixth', author: 'Author 6', genre_ids: null, session_date: '2024-01-03' },
          { book_id: 'book-7', title: 'Seventh', author: 'Author 7', genre_ids: null, session_date: '2024-01-02' },
          { book_id: 'book-8', title: 'Eighth', author: 'Author 8', genre_ids: null, session_date: '2024-01-01' }
        ]
      })
    };

    mockDb.prepare
      .mockReturnValueOnce(studentQuery)
      .mockReturnValueOnce(preferencesQuery)
      .mockReturnValueOnce(sessionsQuery);
    // No genre names query needed since no genre_ids

    const profile = await buildStudentReadingProfile('student-many-reads', 'org-456', mockDb);

    expect(profile.recentReads).toHaveLength(5);
    expect(profile.recentReads[0].title).toBe('Most Recent');
    expect(profile.recentReads[4].title).toBe('Fifth');
    // All 8 books should still be in readBookIds
    expect(profile.readBookIds).toHaveLength(8);
    expect(profile.booksReadCount).toBe(8);
  });

  it('should filter out sessions without book_id from readBookIds', async () => {
    const studentQuery = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({
        id: 'student-mixed',
        name: 'Mixed Sessions Student',
        reading_level: 'intermediate',
        age_range: '8-10',
        likes: '[]',
        dislikes: '[]',
        notes: null
      })
    };

    const preferencesQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] })
    };

    // Some sessions with book_id, some without
    const sessionsQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({
        results: [
          { book_id: 'book-1', title: 'Book One', author: 'Author 1', genre_ids: null, session_date: '2024-01-03' },
          { book_id: null, title: 'Unknown Book', author: null, genre_ids: null, session_date: '2024-01-02' },
          { book_id: 'book-2', title: 'Book Two', author: 'Author 2', genre_ids: null, session_date: '2024-01-01' }
        ]
      })
    };

    mockDb.prepare
      .mockReturnValueOnce(studentQuery)
      .mockReturnValueOnce(preferencesQuery)
      .mockReturnValueOnce(sessionsQuery);

    const profile = await buildStudentReadingProfile('student-mixed', 'org-456', mockDb);

    // Only 2 valid book IDs
    expect(profile.readBookIds).toHaveLength(2);
    expect(profile.readBookIds).toContain('book-1');
    expect(profile.readBookIds).toContain('book-2');
    expect(profile.booksReadCount).toBe(2);
  });

  it('should filter out unknown genre IDs when genre lookup fails', async () => {
    const studentQuery = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({
        id: 'student-unknown-genre',
        name: 'Unknown Genre Student',
        reading_level: 'intermediate',
        age_range: '8-10',
        likes: '[]',
        dislikes: '[]',
        notes: null
      })
    };

    const preferencesQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] })
    };

    const sessionsQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({
        results: [
          { book_id: 'book-1', title: 'Book One', author: 'Author 1', genre_ids: 'unknown-genre-id', session_date: '2024-01-01' }
        ]
      })
    };

    // Genre lookup returns nothing (unknown genre)
    const genreNamesQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] })
    };

    mockDb.prepare
      .mockReturnValueOnce(studentQuery)
      .mockReturnValueOnce(preferencesQuery)
      .mockReturnValueOnce(sessionsQuery)
      .mockReturnValueOnce(genreNamesQuery);

    const profile = await buildStudentReadingProfile('student-unknown-genre', 'org-456', mockDb);

    // Unknown genre IDs should be filtered out entirely (not shown as raw IDs)
    expect(profile.inferredGenres).toHaveLength(0);
  });

  it('should handle empty database results gracefully', async () => {
    const studentQuery = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({
        id: 'student-empty',
        name: 'Empty Results Student',
        reading_level: 'intermediate',
        age_range: null,
        likes: null,
        dislikes: null,
        notes: null
      })
    };

    // Return undefined results instead of empty array
    const preferencesQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: undefined })
    };

    const sessionsQuery = {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: undefined })
    };

    mockDb.prepare
      .mockReturnValueOnce(studentQuery)
      .mockReturnValueOnce(preferencesQuery)
      .mockReturnValueOnce(sessionsQuery);

    const profile = await buildStudentReadingProfile('student-empty', 'org-456', mockDb);

    expect(profile).not.toBeNull();
    expect(profile.student.name).toBe('Empty Results Student');
    expect(profile.preferences.favoriteGenreIds).toEqual([]);
    expect(profile.preferences.favoriteGenreNames).toEqual([]);
    expect(profile.preferences.likes).toEqual([]);
    expect(profile.preferences.dislikes).toEqual([]);
    expect(profile.inferredGenres).toEqual([]);
    expect(profile.recentReads).toEqual([]);
    expect(profile.readBookIds).toEqual([]);
    expect(profile.booksReadCount).toBe(0);
  });
});
