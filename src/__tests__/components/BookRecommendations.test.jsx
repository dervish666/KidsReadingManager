import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { createContext, useContext } from 'react';

// Create a test context to mock AppContext
const TestAppContext = createContext();

// Mock the AppContext module
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => useContext(TestAppContext)
}));

// Mock the StudentProfile component
vi.mock('../../components/students/StudentProfile', () => ({
  default: ({ open, onClose, student }) => (
    open ? (
      <div data-testid="student-profile-modal" role="dialog">
        <span>Student Profile: {student?.name}</span>
        <button onClick={onClose}>Close Profile</button>
      </div>
    ) : null
  )
}));

// Import after mocking
import BookRecommendations from '../../components/BookRecommendations';

// Mock AppContext provider wrapper
const createWrapper = (contextValue) => {
  return ({ children }) => (
    <TestAppContext.Provider value={contextValue}>
      {children}
    </TestAppContext.Provider>
  );
};

// Default mock context values
const createMockContext = (overrides = {}) => ({
  students: [
    {
      id: 'student-1',
      name: 'Alice Smith',
      classId: 'class-1',
      readingLevel: 2.5,
      readingSessions: [
        { id: 'session-1', bookId: 'book-1', date: '2024-06-01', assessment: 'independent' },
        { id: 'session-2', bookId: 'book-2', date: '2024-06-02', assessment: 'guided' }
      ],
      preferences: {
        favoriteGenreIds: ['genre-1'],
        likes: ['The Cat in the Hat', 'Green Eggs and Ham'],
        dislikes: ['Boring Book']
      }
    },
    {
      id: 'student-2',
      name: 'Bob Jones',
      classId: 'class-1',
      readingLevel: 3.0,
      readingSessions: [],
      preferences: {}
    },
    {
      id: 'student-3',
      name: 'Charlie Brown',
      classId: 'class-2',
      readingLevel: 4.0,
      readingSessions: [
        { id: 'session-3', bookId: 'book-3', date: '2024-06-03', assessment: 'independent' }
      ],
      preferences: {
        favoriteGenreIds: ['genre-2'],
        likes: [],
        dislikes: []
      }
    }
  ],
  classes: [
    { id: 'class-1', name: 'Class 1A' },
    { id: 'class-2', name: 'Class 2B' }
  ],
  books: [
    { id: 'book-1', title: 'The Cat in the Hat', author: 'Dr. Seuss' },
    { id: 'book-2', title: 'Charlotte\'s Web', author: 'E.B. White' },
    { id: 'book-3', title: 'Harry Potter', author: 'J.K. Rowling' }
  ],
  apiError: null,
  fetchWithAuth: vi.fn(),
  globalClassFilter: 'all',
  ...overrides
});

// Helper to create mock fetch responses
const createMockFetch = (responses = {}) => {
  return vi.fn().mockImplementation((url) => {
    // AI Config endpoint
    if (url === '/api/settings/ai') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(responses.aiConfig || {
          hasApiKey: true,
          keySource: 'settings',
          provider: 'anthropic',
          modelPreference: 'claude-3-sonnet'
        })
      });
    }

    // Library search endpoint
    if (url.startsWith('/api/books/library-search')) {
      return Promise.resolve({
        ok: responses.librarySearchOk !== false,
        json: () => Promise.resolve(responses.librarySearch || {
          studentProfile: {
            readingLevel: 2.5,
            favoriteGenres: ['Fiction', 'Adventure'],
            inferredGenres: ['Mystery']
          },
          books: [
            {
              id: 'rec-1',
              title: 'Recommended Book 1',
              author: 'Author One',
              readingLevel: '2.5',
              genres: ['Fiction'],
              matchReason: 'Matches reading level'
            },
            {
              id: 'rec-2',
              title: 'Recommended Book 2',
              author: 'Author Two',
              readingLevel: '3.0',
              genres: ['Adventure'],
              matchReason: 'Based on favorite genres'
            }
          ]
        })
      });
    }

    // AI suggestions endpoint
    if (url.startsWith('/api/books/ai-suggestions')) {
      return Promise.resolve({
        ok: responses.aiSuggestionsOk !== false,
        json: () => Promise.resolve(responses.aiSuggestions || {
          studentProfile: {
            readingLevel: 2.5,
            favoriteGenres: ['Fiction'],
            inferredGenres: []
          },
          suggestions: [
            {
              id: 'ai-1',
              title: 'AI Suggested Book 1',
              author: 'AI Author One',
              level: '2.5',
              reason: 'Based on reading history',
              inLibrary: true,
              whereToFind: 'Available at local library'
            },
            {
              id: 'ai-2',
              title: 'AI Suggested Book 2',
              author: 'AI Author Two',
              level: '3.0',
              reason: 'Popular among similar readers',
              inLibrary: false,
              whereToFind: 'Available online'
            }
          ]
        })
      });
    }

    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
  });
};

describe('BookRecommendations Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial Render', () => {
    it('should render the component with title and student selection', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Wait for initial async operations to complete
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/settings/ai');
      });

      expect(screen.getByText('Book Recommendations')).toBeInTheDocument();
      expect(screen.getByText('Select Student')).toBeInTheDocument();
      expect(screen.getByLabelText(/student/i)).toBeInTheDocument();
    });

    it('should render students from context in the dropdown', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Open the student dropdown
      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);

      // Check that all students are in the dropdown
      expect(screen.getByRole('option', { name: /Alice Smith \(2 books read\)/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Bob Jones \(0 books read\)/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Charlie Brown \(1 books read\)/i })).toBeInTheDocument();
    });

    it('should display API error from context when present', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({
        fetchWithAuth: mockFetch,
        apiError: 'Failed to load data from server'
      });
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Wait for initial async operations to complete
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/settings/ai');
      });

      expect(screen.getByText('Failed to load data from server')).toBeInTheDocument();
    });

    it('should load and display AI config status on mount', async () => {
      const mockFetch = createMockFetch({
        aiConfig: {
          hasApiKey: true,
          keySource: 'settings',
          provider: 'anthropic',
          modelPreference: 'claude-3-sonnet'
        }
      });
      const context = createMockContext({ fetchWithAuth: mockFetch });
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/settings/ai');
      });

      // Should display AI status chip
      await waitFor(() => {
        expect(screen.getByText(/AI: Claude/i)).toBeInTheDocument();
      });
    });

    it('should display AI not configured warning when no API key', async () => {
      const mockFetch = createMockFetch({
        aiConfig: {
          hasApiKey: false,
          keySource: null,
          provider: null
        }
      });
      const context = createMockContext({ fetchWithAuth: mockFetch });
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      await waitFor(() => {
        expect(screen.getByText(/AI: Not configured/i)).toBeInTheDocument();
      });
    });
  });

  describe('Student Selection Dropdown', () => {
    it('should have correct aria-describedby when students exist', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Wait for initial async operations to complete
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/settings/ai');
      });

      const studentSelect = screen.getByLabelText(/student/i);
      // When students exist, aria-describedby should not be set to no-students-helper
      expect(studentSelect).not.toHaveAttribute('aria-describedby', 'no-students-helper');
    });

    it('should be disabled when no students exist', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({
        fetchWithAuth: mockFetch,
        students: []
      });
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Wait for initial async operations to complete
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/settings/ai');
      });

      const studentSelect = screen.getByLabelText(/student/i);
      expect(studentSelect).toHaveAttribute('aria-disabled', 'true');
    });

    it('should update selected student when option is chosen', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);

      const aliceOption = screen.getByRole('option', { name: /Alice Smith/i });
      await user.click(aliceOption);

      // After selection, student info should be displayed
      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      });
    });
  });

  describe('Class Filter Integration', () => {
    it('should filter students by globalClassFilter', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({
        fetchWithAuth: mockFetch,
        globalClassFilter: 'class-1'
      });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);

      // Only class-1 students should be visible
      expect(screen.getByRole('option', { name: /Alice Smith/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Bob Jones/i })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: /Charlie Brown/i })).not.toBeInTheDocument();
    });

    it('should show all students when globalClassFilter is "all"', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({
        fetchWithAuth: mockFetch,
        globalClassFilter: 'all'
      });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);

      // All students should be visible
      expect(screen.getByRole('option', { name: /Alice Smith/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Bob Jones/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Charlie Brown/i })).toBeInTheDocument();
    });

    it('should filter unassigned students when globalClassFilter is "unassigned"', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({
        fetchWithAuth: mockFetch,
        globalClassFilter: 'unassigned',
        students: [
          { id: 'student-assigned', name: 'Assigned Student', classId: 'class-1', readingSessions: [] },
          { id: 'student-unassigned', name: 'Unassigned Student', classId: null, readingSessions: [] }
        ]
      });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);

      // Only unassigned student should be visible (plus the "Select a student" option)
      const options = screen.getAllByRole('option');
      const studentOptions = options.filter(opt => opt.textContent.includes('Student'));
      expect(studentOptions).toHaveLength(1);
      expect(screen.getByRole('option', { name: /Unassigned Student/i })).toBeInTheDocument();
    });
  });

  describe('Student Profile Display', () => {
    it('should display student info after selection', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Select Alice
      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Wait for profile to load and display
      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      });

      // Should display class chip
      expect(screen.getByText('Class 1A')).toBeInTheDocument();
    });

    it('should display books read by selected student', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText(/Books Read \(2\)/i)).toBeInTheDocument();
      });

      // Should display book titles - there may be multiple matches (one in books list, one in likes)
      await waitFor(() => {
        const bookTitleElements = screen.getAllByText(/The Cat in the Hat/);
        expect(bookTitleElements.length).toBeGreaterThan(0);
      });
    });

    it('should display "No books recorded yet" for student with no reading history', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Bob Jones/i }));

      await waitFor(() => {
        expect(screen.getByText('No books recorded yet')).toBeInTheDocument();
      });
    });

    it('should display favorite genres from student profile', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Wait for profile data to load
      await waitFor(() => {
        expect(screen.getByText('Favorites')).toBeInTheDocument();
      });

      // Should display favorite genres from API response
      await waitFor(() => {
        expect(screen.getByText('Fiction')).toBeInTheDocument();
      });
    });

    it('should display student likes when available', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText('Liked')).toBeInTheDocument();
      });

      // Should show likes from preferences - check for the text that includes the likes list
      await waitFor(() => {
        expect(screen.getByText(/The Cat in the Hat, Green Eggs and Ham/)).toBeInTheDocument();
      });
    });

    it('should display student dislikes when available', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText('Disliked')).toBeInTheDocument();
      });

      // Should show dislikes from preferences
      expect(screen.getByText(/Boring Book/)).toBeInTheDocument();
    });

    it('should show loading spinner while fetching profile', async () => {
      // Create a delayed fetch to catch the loading state
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url === '/api/settings/ai') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ hasApiKey: true, provider: 'anthropic' })
          });
        }
        if (url.startsWith('/api/books/library-search')) {
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: () => Promise.resolve({
                  studentProfile: { readingLevel: 2.5 },
                  books: []
                })
              });
            }, 100);
          });
        }
        return Promise.resolve({ ok: false });
      });

      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Loading spinner should appear
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  describe('Get Library Matches Button', () => {
    it('should show Find in Library button after student selection', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Select a student
      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });
    });

    it('should call library-search API when clicking Find in Library', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Select a student
      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Click Find in Library
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /find in library/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/books/library-search?studentId=student-1');
      });
    });

    it('should display library recommendations after successful search', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Select and search
      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /find in library/i }));

      // Should display recommendations
      await waitFor(() => {
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
        expect(screen.getByText('Recommended Book 2')).toBeInTheDocument();
      });

      // Should show "Books from Your Library" header
      expect(screen.getByText('Books from Your Library')).toBeInTheDocument();
    });

    it('should display match reason for library recommendations', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /find in library/i }));

      await waitFor(() => {
        expect(screen.getByText('Matches reading level')).toBeInTheDocument();
      });
    });
  });

  describe('Get AI Suggestions Button', () => {
    it('should show AI Suggestions button after student selection', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /ai suggestions/i })).toBeInTheDocument();
      });
    });

    it('should disable AI Suggestions button when AI is not configured', async () => {
      const mockFetch = createMockFetch({
        aiConfig: { hasApiKey: false, keySource: null, provider: null }
      });
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        const aiButton = screen.getByRole('button', { name: /ai suggestions/i });
        expect(aiButton).toBeDisabled();
      });
    });

    it('should call ai-suggestions API when clicking AI Suggestions', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Wait for AI to be configured
      await waitFor(() => {
        expect(screen.getByText(/AI: Claude/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ai suggestions/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/books/ai-suggestions?studentId=student-1');
      });
    });

    it('should display AI suggestions after successful request', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText(/AI: Claude/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ai suggestions/i }));

      await waitFor(() => {
        expect(screen.getByText('AI Suggested Book 1')).toBeInTheDocument();
        expect(screen.getByText('AI Suggested Book 2')).toBeInTheDocument();
      });

      // Should show "AI Suggestions" header (there will be multiple matches - button and header)
      const aiSuggestionsElements = screen.getAllByText(/AI Suggestions/);
      expect(aiSuggestionsElements.length).toBeGreaterThan(0);
    });

    it('should display "In your library" chip for AI suggestions that are in library', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText(/AI: Claude/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ai suggestions/i }));

      await waitFor(() => {
        expect(screen.getByText('In your library')).toBeInTheDocument();
      });
    });

    it('should display AI reasoning for suggestions', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText(/AI: Claude/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ai suggestions/i }));

      await waitFor(() => {
        expect(screen.getByText('Based on reading history')).toBeInTheDocument();
      });
    });

    it('should display whereToFind for AI suggestions', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText(/AI: Claude/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ai suggestions/i }));

      await waitFor(() => {
        expect(screen.getByText('Available at local library')).toBeInTheDocument();
      });
    });
  });

  describe('Recommendations List Display', () => {
    it('should display result count chip', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /find in library/i }));

      await waitFor(() => {
        expect(screen.getByText('2 results')).toBeInTheDocument();
      });
    });

    it('should display author for each recommendation', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /find in library/i }));

      await waitFor(() => {
        expect(screen.getByText('by Author One')).toBeInTheDocument();
        expect(screen.getByText('by Author Two')).toBeInTheDocument();
      });
    });

    it('should display reading level chip for recommendations', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /find in library/i }));

      await waitFor(() => {
        // Check for reading level chips
        const levelChips = screen.getAllByText(/2\.5|3\.0/);
        expect(levelChips.length).toBeGreaterThan(0);
      });
    });

    it('should display genres for library recommendations', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /find in library/i }));

      await waitFor(() => {
        // Check for genre chips in recommendation cards - there may be multiple Fiction/Adventure mentions
        const fictionChips = screen.getAllByText('Fiction');
        const adventureChips = screen.getAllByText('Adventure');
        expect(fictionChips.length).toBeGreaterThan(0);
        expect(adventureChips.length).toBeGreaterThan(0);
      });
    });

    it('should show instruction message when no recommendations yet', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText(/Click "Find in Library" to search your book collection/i)).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading state for library search button', async () => {
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url === '/api/settings/ai') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ hasApiKey: true, provider: 'anthropic' })
          });
        }
        if (url.startsWith('/api/books/library-search')) {
          // Delay to capture loading state
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: () => Promise.resolve({ studentProfile: {}, books: [] })
              });
            }, 500);
          });
        }
        return Promise.resolve({ ok: false });
      });

      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });

      // Click and check for loading state
      await user.click(screen.getByRole('button', { name: /find in library/i }));

      // Should show "Searching..." text
      expect(screen.getByText('Searching...')).toBeInTheDocument();
    });

    it('should show loading state for AI suggestions button', async () => {
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url === '/api/settings/ai') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ hasApiKey: true, provider: 'anthropic' })
          });
        }
        if (url.startsWith('/api/books/library-search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ studentProfile: {}, books: [] })
          });
        }
        if (url.startsWith('/api/books/ai-suggestions')) {
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: () => Promise.resolve({ studentProfile: {}, suggestions: [] })
              });
            }, 500);
          });
        }
        return Promise.resolve({ ok: false });
      });

      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Wait for AI config
      await waitFor(() => {
        expect(screen.getByText(/AI: Claude/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ai suggestions/i }));

      // Should show "Generating..." text
      expect(screen.getByText('Generating...')).toBeInTheDocument();
    });

    it('should disable both buttons during library loading', async () => {
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url === '/api/settings/ai') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ hasApiKey: true, provider: 'anthropic' })
          });
        }
        if (url.startsWith('/api/books/library-search')) {
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: () => Promise.resolve({ studentProfile: {}, books: [] })
              });
            }, 500);
          });
        }
        return Promise.resolve({ ok: false });
      });

      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText(/AI: Claude/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /find in library/i }));

      // Both buttons should be disabled during loading
      expect(screen.getByRole('button', { name: /searching/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /ai suggestions/i })).toBeDisabled();
    });
  });

  describe('Error Handling', () => {
    it('should display error when library search fails', async () => {
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url === '/api/settings/ai') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ hasApiKey: true, provider: 'anthropic' })
          });
        }
        if (url.startsWith('/api/books/library-search')) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'Library search failed', message: 'No books found matching criteria' })
          });
        }
        return Promise.resolve({ ok: false });
      });

      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /find in library/i }));

      await waitFor(() => {
        expect(screen.getByText('No books found matching criteria')).toBeInTheDocument();
      });
    });

    it('should display error when AI suggestions fail', async () => {
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url === '/api/settings/ai') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ hasApiKey: true, provider: 'anthropic' })
          });
        }
        if (url.startsWith('/api/books/library-search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ studentProfile: {}, books: [] })
          });
        }
        if (url.startsWith('/api/books/ai-suggestions')) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: 'AI error', message: 'AI service unavailable' })
          });
        }
        return Promise.resolve({ ok: false });
      });

      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText(/AI: Claude/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ai suggestions/i }));

      await waitFor(() => {
        expect(screen.getByText('AI service unavailable')).toBeInTheDocument();
      });
    });

    it('should handle network errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url === '/api/settings/ai') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ hasApiKey: true, provider: 'anthropic' })
          });
        }
        if (url.startsWith('/api/books/library-search')) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ ok: false });
      });

      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /find in library/i }));

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });

    it('should clear error when making a new request', async () => {
      let libraryRequestCount = 0;
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url === '/api/settings/ai') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ hasApiKey: true, provider: 'anthropic' })
          });
        }
        if (url.startsWith('/api/books/library-search')) {
          libraryRequestCount++;
          if (libraryRequestCount <= 2) {
            // First two requests fail (initial profile load + first button click)
            return Promise.resolve({
              ok: false,
              json: () => Promise.resolve({ message: 'First error' })
            });
          }
          // Third request succeeds (second button click)
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ studentProfile: {}, books: [] })
          });
        }
        return Promise.resolve({ ok: false });
      });

      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });

      // First button click - should show error
      await user.click(screen.getByRole('button', { name: /find in library/i }));
      await waitFor(() => {
        expect(screen.getByText('First error')).toBeInTheDocument();
      });

      // Second button click - error should be cleared during loading and success shows no error
      await user.click(screen.getByRole('button', { name: /find in library/i }));
      await waitFor(() => {
        expect(screen.queryByText('First error')).not.toBeInTheDocument();
      });
    });
  });

  describe('Edit Preferences Button', () => {
    it('should show Edit Preferences button after student selection', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit preferences/i })).toBeInTheDocument();
      });
    });

    it('should open StudentProfile modal when clicking Edit Preferences', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit preferences/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit preferences/i }));

      // Should show the mocked StudentProfile modal
      expect(screen.getByTestId('student-profile-modal')).toBeInTheDocument();
      expect(screen.getByText('Student Profile: Alice Smith')).toBeInTheDocument();
    });

    it('should refresh student profile when closing preferences modal', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Clear mock calls to track new ones
      mockFetch.mockClear();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit preferences/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /edit preferences/i }));

      // Close the modal
      await user.click(screen.getByText('Close Profile'));

      // Should have called library-search to refresh profile
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/books/library-search'));
      });
    });
  });

  describe('AI Provider Display', () => {
    it('should display Claude as provider name for anthropic', async () => {
      const mockFetch = createMockFetch({
        aiConfig: { hasApiKey: true, provider: 'anthropic' }
      });
      const context = createMockContext({ fetchWithAuth: mockFetch });
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      await waitFor(() => {
        expect(screen.getByText(/AI: Claude/i)).toBeInTheDocument();
      });
    });

    it('should display GPT as provider name for openai', async () => {
      const mockFetch = createMockFetch({
        aiConfig: { hasApiKey: true, provider: 'openai' }
      });
      const context = createMockContext({ fetchWithAuth: mockFetch });
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      await waitFor(() => {
        expect(screen.getByText(/AI: GPT/i)).toBeInTheDocument();
      });
    });

    it('should display Gemini as provider name for google', async () => {
      const mockFetch = createMockFetch({
        aiConfig: { hasApiKey: true, provider: 'google' }
      });
      const context = createMockContext({ fetchWithAuth: mockFetch });
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      await waitFor(() => {
        expect(screen.getByText(/AI: Gemini/i)).toBeInTheDocument();
      });
    });
  });

  describe('Selecting Different Students', () => {
    it('should clear recommendations when selecting a different student', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Select Alice and get recommendations
      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /find in library/i }));

      await waitFor(() => {
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      // Now select Bob
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Bob Jones/i }));

      // Recommendations should be cleared
      await waitFor(() => {
        expect(screen.queryByText('Recommended Book 1')).not.toBeInTheDocument();
      });
    });

    it('should clear books read when selecting a different student', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Select Alice (has books read)
      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText(/Books Read \(2\)/i)).toBeInTheDocument();
      });

      // Now select Bob (no books read)
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Bob Jones/i }));

      await waitFor(() => {
        expect(screen.getByText('No books recorded yet')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle students with undefined readingSessions', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({
        fetchWithAuth: mockFetch,
        students: [
          { id: 'student-1', name: 'No Sessions', classId: 'class-1', readingSessions: undefined }
        ]
      });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /No Sessions/i }));

      await waitFor(() => {
        expect(screen.getByText('No books recorded yet')).toBeInTheDocument();
      });
    });

    it('should handle book ID not found in books array', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({
        fetchWithAuth: mockFetch,
        students: [
          {
            id: 'student-1',
            name: 'Unknown Book Student',
            classId: 'class-1',
            readingSessions: [
              { id: 'session-1', bookId: 'non-existent-book', date: '2024-06-01' }
            ]
          }
        ]
      });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Unknown Book Student/i }));

      // Should show fallback text for unknown book
      await waitFor(() => {
        expect(screen.getByText(/Book non-existent-book/i)).toBeInTheDocument();
      });
    });

    it('should handle empty books array', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({
        fetchWithAuth: mockFetch,
        books: []
      });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Should render without crashing
      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      });
    });

    it('should handle null fetchWithAuth gracefully', () => {
      const context = createMockContext({ fetchWithAuth: null });

      // Should render without crashing
      render(<BookRecommendations />, { wrapper: createWrapper(context) });
      expect(screen.getByText('Book Recommendations')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible student select with label', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Wait for initial async operations to complete
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/settings/ai');
      });

      const studentSelect = screen.getByLabelText(/student/i);
      expect(studentSelect).toBeInTheDocument();
      expect(studentSelect).toHaveAttribute('id', 'student-select');
    });

    it('should have proper heading hierarchy', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Wait for initial async operations to complete
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/settings/ai');
      });

      // Typography with variant="h4" renders as h1 with component="h1"
      const mainHeading = screen.getByText('Book Recommendations');
      expect(mainHeading).toBeInTheDocument();
    });

    it('should have accessible error alerts', async () => {
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url === '/api/settings/ai') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ hasApiKey: true, provider: 'anthropic' })
          });
        }
        if (url.startsWith('/api/books/library-search')) {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ message: 'Test error message' })
          });
        }
        return Promise.resolve({ ok: false });
      });

      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /find in library/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /find in library/i }));

      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(alert).toHaveTextContent('Test error message');
      });
    });
  });
});
