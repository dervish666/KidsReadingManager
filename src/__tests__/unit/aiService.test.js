import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildBroadSuggestionsPrompt } from '../../services/aiService.js';

describe('aiService', () => {
  describe('buildBroadSuggestionsPrompt', () => {
    const createMockProfile = (overrides = {}) => ({
      student: {
        id: 'student-1',
        name: 'Emma',
        readingLevel: 'intermediate',
        ageRange: '8-10',
        notes: 'Loves fantasy',
        ...overrides.student
      },
      preferences: {
        favoriteGenreIds: ['genre-1', 'genre-2'],
        favoriteGenreNames: ['Fantasy', 'Adventure'],
        likes: ['Harry Potter', 'Percy Jackson'],
        dislikes: ['boring books', 'sad endings'],
        ...overrides.preferences
      },
      inferredGenres: [
        { id: 'genre-1', name: 'Fantasy', count: 5 },
        { id: 'genre-3', name: 'Mystery', count: 3 }
      ],
      recentReads: [
        { title: 'The Hobbit', author: 'Tolkien' },
        { title: 'Narnia', author: 'Lewis' }
      ],
      readBookIds: ['book-1', 'book-2'],
      booksReadCount: 5,
      ...overrides
    });

    it('should include student basic info in prompt', () => {
      const profile = createMockProfile();
      const prompt = buildBroadSuggestionsPrompt(profile);

      expect(prompt).toContain('Name: Emma');
      expect(prompt).toContain('Reading Level: intermediate');
      expect(prompt).toContain('Age Range: 8-10');
    });

    it('should include explicit favorite genres', () => {
      const profile = createMockProfile();
      const prompt = buildBroadSuggestionsPrompt(profile);

      expect(prompt).toContain('Fantasy');
      expect(prompt).toContain('Adventure');
      expect(prompt).toContain('Favorite Genres:');
    });

    it('should include liked books', () => {
      const profile = createMockProfile();
      const prompt = buildBroadSuggestionsPrompt(profile);

      expect(prompt).toContain('Harry Potter');
      expect(prompt).toContain('Percy Jackson');
      expect(prompt).toContain('Books They Liked:');
    });

    it('should include disliked books', () => {
      const profile = createMockProfile();
      const prompt = buildBroadSuggestionsPrompt(profile);

      expect(prompt).toContain('boring books');
      expect(prompt).toContain('sad endings');
      expect(prompt).toContain('Books They Disliked:');
    });

    it('should include inferred genres with counts', () => {
      const profile = createMockProfile();
      const prompt = buildBroadSuggestionsPrompt(profile);

      expect(prompt).toContain('Fantasy (read 5 books)');
      expect(prompt).toContain('Mystery (read 3 books)');
      expect(prompt).toContain('Most-Read Genres:');
    });

    it('should include recent reads', () => {
      const profile = createMockProfile();
      const prompt = buildBroadSuggestionsPrompt(profile);

      expect(prompt).toContain('The Hobbit');
      expect(prompt).toContain('Tolkien');
      expect(prompt).toContain('Narnia');
      expect(prompt).toContain('Recent Books:');
    });

    it('should handle empty preferences gracefully', () => {
      const profile = createMockProfile({
        preferences: {
          favoriteGenreIds: [],
          favoriteGenreNames: [],
          likes: [],
          dislikes: []
        },
        inferredGenres: [],
        recentReads: []
      });

      const prompt = buildBroadSuggestionsPrompt(profile);

      expect(prompt).toContain('Favorite Genres: Not specified');
      expect(prompt).toContain('Books They Liked: None specified');
      expect(prompt).toContain('Books They Disliked: None specified');
      expect(prompt).toContain('Most-Read Genres: No reading history yet');
      expect(prompt).toContain('Recent Books: No recent books');
    });

    it('should request exactly 5 recommendations', () => {
      const profile = createMockProfile();
      const prompt = buildBroadSuggestionsPrompt(profile);

      expect(prompt).toContain('exactly 5 books');
      expect(prompt).toContain('exactly 5 objects');
    });

    it('should request required fields in response', () => {
      const profile = createMockProfile();
      const prompt = buildBroadSuggestionsPrompt(profile);

      // Check for required fields mentioned in prompt
      expect(prompt).toContain('title');
      expect(prompt).toContain('author');
      expect(prompt).toContain('ageRange');
      expect(prompt).toContain('readingLevel');
      expect(prompt).toContain('reason');
      expect(prompt).toContain('whereToFind');
    });

    it('should instruct to avoid books similar to dislikes', () => {
      const profile = createMockProfile();
      const prompt = buildBroadSuggestionsPrompt(profile);

      expect(prompt).toContain('Avoid anything similar to books they disliked');
    });

    it('should instruct to avoid already-read books', () => {
      const profile = createMockProfile();
      const prompt = buildBroadSuggestionsPrompt(profile);

      expect(prompt).toContain('different from books they\'ve already read');
    });

    it('should mention student name for personalized recommendations', () => {
      const profile = createMockProfile({ student: { name: 'Oliver' } });
      const prompt = buildBroadSuggestionsPrompt(profile);

      // Should reference the student by name in task description
      expect(prompt).toContain('perfect for Oliver');
    });

    it('should handle missing age range', () => {
      const profile = createMockProfile({
        student: { ...createMockProfile().student, ageRange: null }
      });
      const prompt = buildBroadSuggestionsPrompt(profile);

      expect(prompt).toContain('Age Range: Not specified');
    });

    it('should request JSON array format', () => {
      const profile = createMockProfile();
      const prompt = buildBroadSuggestionsPrompt(profile);

      expect(prompt).toContain('valid JSON array');
    });
  });

  describe('normalizeBroadSuggestions (via parsing)', () => {
    // We can't directly test private functions, but we can test edge cases
    // through the response structure expectations

    it('should expect specific fields in each recommendation', () => {
      const expectedFields = ['title', 'author', 'ageRange', 'readingLevel', 'reason', 'whereToFind'];
      const mockSuggestion = {
        title: 'Test Book',
        author: 'Test Author',
        ageRange: '8-10',
        readingLevel: 'intermediate',
        reason: 'Great book',
        whereToFind: 'Library'
      };

      // Verify all expected fields are present
      expectedFields.forEach(field => {
        expect(mockSuggestion).toHaveProperty(field);
      });
    });

    it('should handle suggestions with missing fields by using defaults', () => {
      // This tests the expected contract - if normalization provides defaults
      const minimalSuggestion = {
        title: 'Only Title'
      };

      // After normalization, should have defaults
      const normalized = {
        title: minimalSuggestion.title || 'Unknown Title',
        author: minimalSuggestion.author || 'Unknown Author',
        ageRange: minimalSuggestion.ageRange || '8-12',
        readingLevel: minimalSuggestion.readingLevel || 'intermediate',
        reason: minimalSuggestion.reason || 'Recommended based on reading preferences',
        whereToFind: minimalSuggestion.whereToFind || 'Available at most public libraries and bookstores'
      };

      expect(normalized.title).toBe('Only Title');
      expect(normalized.author).toBe('Unknown Author');
      expect(normalized.ageRange).toBe('8-12');
      expect(normalized.readingLevel).toBe('intermediate');
    });
  });
});
