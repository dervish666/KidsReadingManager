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

// Mock the BookCover component
vi.mock('../../components/BookCover', () => ({
  default: ({ title, author, width, height }) => (
    <div
      data-testid="book-cover"
      data-title={title}
      data-author={author || ''}
      style={{ width: width || 80, height: height || 120 }}
    >
      Book Cover: {title}
    </div>
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
      totalSessionCount: 2,
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
      totalSessionCount: 0,
      preferences: {}
    },
    {
      id: 'student-3',
      name: 'Charlie Brown',
      classId: 'class-2',
      readingLevel: 4.0,
      totalSessionCount: 1,
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
  prioritizedStudents: [
    {
      id: 'student-1',
      name: 'Alice Smith',
      classId: 'class-1',
      totalSessionCount: 2,
      lastReadDate: '2024-06-01'
    },
    {
      id: 'student-2',
      name: 'Bob Jones',
      classId: 'class-1',
      totalSessionCount: 0,
      lastReadDate: null
    }
  ],
  getReadingStatus: vi.fn().mockReturnValue('attention'),
  markStudentAsPriorityHandled: vi.fn(),
  ...overrides
});

// Default session data for each student (used by fetchWithAuth mock)
const defaultStudentSessions = {
  'student-1': [
    { id: 'session-1', bookId: 'book-1', date: '2024-06-01', assessment: 8 },
    { id: 'session-2', bookId: 'book-2', date: '2024-06-02', assessment: 5 }
  ],
  'student-2': [],
  'student-3': [
    { id: 'session-3', bookId: 'book-3', date: '2024-06-03', assessment: 8 }
  ]
};

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

    // Student sessions endpoint
    const sessionMatch = url.match(/\/api\/students\/([^/]+)\/sessions/);
    if (sessionMatch) {
      const studentId = sessionMatch[1];
      const sessions = (responses.studentSessions || defaultStudentSessions)[studentId] || [];
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(sessions)
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

  describe('Empty State', () => {
    it('should display empty state illustration when no student selected', async () => {
      const mockContext = createMockContext({
        fetchWithAuth: createMockFetch()
      });
      render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

      await waitFor(() => {
        expect(screen.getByTestId('empty-state-illustration')).toBeInTheDocument();
        expect(screen.getByText(/select a student to find their next great read/i)).toBeInTheDocument();
      });
    });
  });

  describe('Priority Student Quick-Pick Cards', () => {
    it('should display priority student quick-pick cards when no student selected', async () => {
      const mockContext = createMockContext({
        fetchWithAuth: createMockFetch()
      });
      render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
        expect(screen.getByText('Bob Jones')).toBeInTheDocument();
      });
    });

    it('should select student and trigger library search when quick-pick card is clicked', async () => {
      const mockFetch = createMockFetch();
      const mockContext = createMockContext({
        fetchWithAuth: mockFetch
      });
      render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Alice Smith'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/books/library-search?studentId=student-1')
        );
      });
    });

    it('should hide quick-pick cards when no priority students exist', async () => {
      const mockContext = createMockContext({
        fetchWithAuth: createMockFetch(),
        prioritizedStudents: []
      });
      render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

      await waitFor(() => {
        expect(screen.queryByText('Priority Students')).not.toBeInTheDocument();
      });
    });
  });

  describe('Auto-Search on Selection', () => {
    it('should auto-trigger library search when student is selected from dropdown', async () => {
      const user = userEvent.setup();
      const mockFetch = createMockFetch();
      const mockContext = createMockContext({
        fetchWithAuth: mockFetch
      });
      render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

      await waitFor(() => {
        expect(screen.getByLabelText('Student')).toBeInTheDocument();
      });

      // Open dropdown and select student
      await user.click(screen.getByLabelText('Student'));
      await user.click(screen.getByText('Alice Smith (2 sessions)'));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/books/library-search?studentId=student-1')
        );
      });
    });

    it('should show loading skeleton while searching', async () => {
      const user = userEvent.setup();
      let resolveSearch;
      const mockFetch = vi.fn().mockImplementation((url) => {
        if (url === '/api/settings/ai') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ hasApiKey: true, provider: 'anthropic' })
          });
        }
        if (url.startsWith('/api/books/library-search')) {
          return new Promise((resolve) => {
            resolveSearch = resolve;
          });
        }
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
      });
      const mockContext = createMockContext({ fetchWithAuth: mockFetch });
      render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

      await waitFor(() => {
        expect(screen.getByLabelText('Student')).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText('Student'));
      await user.click(screen.getByText('Alice Smith (2 sessions)'));

      await waitFor(() => {
        expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
      });

      // Resolve the search
      resolveSearch({
        ok: true,
        json: () => Promise.resolve({
          studentProfile: { readingLevel: 2.5, favoriteGenres: [] },
          books: []
        })
      });

      await waitFor(() => {
        expect(screen.queryByTestId('loading-skeleton')).not.toBeInTheDocument();
      });
    });
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
      expect(screen.getByRole('option', { name: /Alice Smith \(2 sessions\)/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Bob Jones \(0 sessions\)/i })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Charlie Brown \(1 sessions\)/i })).toBeInTheDocument();
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
          { id: 'student-assigned', name: 'Assigned Student', classId: 'class-1', totalSessionCount: 0 },
          { id: 'student-unassigned', name: 'Unassigned Student', classId: null, totalSessionCount: 0 }
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
    it('should toggle reading history details on click', async () => {
      const user = userEvent.setup();
      const mockFetch = createMockFetch();
      const mockContext = createMockContext({ fetchWithAuth: mockFetch });
      render(<BookRecommendations />, { wrapper: createWrapper(mockContext) });

      await waitFor(() => expect(screen.getByLabelText('Student')).toBeInTheDocument());
      await user.click(screen.getByLabelText('Student'));
      await user.click(screen.getByText('Alice Smith (2 sessions)'));

      // Wait for results to load
      await waitFor(() => {
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      // Click toggle to expand
      fireEvent.click(screen.getByLabelText('Show reading history'));

      await waitFor(() => {
        expect(screen.getByText(/Books Read/)).toBeVisible();
      });
    });

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

    it('should display books read after expanding details', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Wait for results to load
      await waitFor(() => {
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      // Expand details
      fireEvent.click(screen.getByLabelText('Show reading history'));

      await waitFor(() => {
        expect(screen.getByText(/Books Read \(2\)/i)).toBeInTheDocument();
      });

      const bookTitleElements = screen.getAllByText(/The Cat in the Hat/);
      expect(bookTitleElements.length).toBeGreaterThan(0);
    });

    it('should display "No books recorded yet" after expanding details for student with no history', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Bob Jones/i }));

      // Wait for results to load
      await waitFor(() => {
        expect(screen.getByText('Bob Jones')).toBeInTheDocument();
      });

      // Expand details
      fireEvent.click(screen.getByLabelText('Show reading history'));

      await waitFor(() => {
        expect(screen.getByText('No books recorded yet')).toBeInTheDocument();
      });
    });

    it('should display favorite genres as chips on the compact bar', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Wait for auto-search to complete - genre chips appear on the bar
      await waitFor(() => {
        const fictionElements = screen.getAllByText('Fiction');
        expect(fictionElements.length).toBeGreaterThan(0);
      });
    });

    it('should display student likes after expanding details', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      // Expand details
      fireEvent.click(screen.getByLabelText('Show reading history'));

      await waitFor(() => {
        expect(screen.getByText('Liked')).toBeInTheDocument();
        expect(screen.getByText(/The Cat in the Hat, Green Eggs and Ham/)).toBeInTheDocument();
      });
    });

    it('should display student dislikes after expanding details', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      // Expand details
      fireEvent.click(screen.getByLabelText('Show reading history'));

      await waitFor(() => {
        expect(screen.getByText('Disliked')).toBeInTheDocument();
        expect(screen.getByText(/Boring Book/)).toBeInTheDocument();
      });
    });

    it('should show loading skeleton while fetching results', async () => {
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

      // Loading skeleton should appear
      await waitFor(() => {
        expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
      });
    });
  });

  describe('Library Search Results (auto-triggered)', () => {
    it('should call library-search API when selecting a student', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/books/library-search?studentId=student-1')
        );
      });
    });

    it('should display library recommendations after selecting a student', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
        expect(screen.getByText('Recommended Book 2')).toBeInTheDocument();
      });

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
        expect(screen.getByText('Matches reading level')).toBeInTheDocument();
      });
    });
  });

  describe('AI Suggestions Banner', () => {
    it('should show AI suggestion banner after library results load', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText(/want personalised picks/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /ask ai/i })).toBeInTheDocument();
      });
    });

    it('should not show AI banner when AI is not configured', async () => {
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
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });
      expect(screen.queryByText(/want personalised picks/i)).not.toBeInTheDocument();
    });

    it('should call ai-suggestions API when clicking Ask AI', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Wait for auto-search to complete
      await waitFor(() => {
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ask ai/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/books/ai-suggestions?studentId=student-1&focusMode=balanced');
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

      // Wait for auto-search to complete
      await waitFor(() => {
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ask ai/i }));

      await waitFor(() => {
        expect(screen.getByText('AI Suggested Book 1')).toBeInTheDocument();
        expect(screen.getByText('AI Suggested Book 2')).toBeInTheDocument();
      });

      const aiSuggestionsElements = screen.getAllByText(/AI Suggestions/);
      expect(aiSuggestionsElements.length).toBeGreaterThan(0);
    });

    it('should display "In library" chip for AI suggestions that are in library', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ask ai/i }));

      await waitFor(() => {
        expect(screen.getByText('In library')).toBeInTheDocument();
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
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ask ai/i }));

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
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ask ai/i }));

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
        const levelChips = screen.getAllByText(/2\.5|3\.0/);
        expect(levelChips.length).toBeGreaterThan(0);
      });
    });

    it('should render book covers at larger size', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        const covers = screen.getAllByTestId('book-cover');
        expect(covers.length).toBeGreaterThan(0);
        expect(covers[0]).toHaveStyle({ width: '120px', height: '180px' });
      });
    });

    it('should display match reason in pull-quote style', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText('Matches reading level')).toBeInTheDocument();
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
        const fictionChips = screen.getAllByText('Fiction');
        const adventureChips = screen.getAllByText('Adventure');
        expect(fictionChips.length).toBeGreaterThan(0);
        expect(adventureChips.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Loading States', () => {
    it('should show loading skeleton during library search', async () => {
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

      // Should show loading skeleton
      await waitFor(() => {
        expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
      });
    });

    it('should hide AI banner after clicking Ask AI', async () => {
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

      // Wait for auto-search to complete and banner to appear
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /ask ai/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ask ai/i }));

      // Banner should disappear as resultType switches to 'ai'
      await waitFor(() => {
        expect(screen.queryByText(/want personalised picks/i)).not.toBeInTheDocument();
      });
    });

    it('should not show AI banner during library loading', async () => {
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

      // AI banner should not be visible during loading
      await waitFor(() => {
        expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
      });
      expect(screen.queryByText(/want personalised picks/i)).not.toBeInTheDocument();
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

      // Auto-search triggers and fails
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

      // Wait for auto-search to complete
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /ask ai/i })).not.toBeDisabled();
      });

      await user.click(screen.getByRole('button', { name: /ask ai/i }));

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

      // Auto-search triggers and hits network error
      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });

    it('should clear error when selecting a new student', async () => {
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
          if (libraryRequestCount <= 1) {
            return Promise.resolve({
              ok: false,
              json: () => Promise.resolve({ message: 'First error' })
            });
          }
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

      // First auto-search fails
      await waitFor(() => {
        expect(screen.getByText('First error')).toBeInTheDocument();
      });

      // Select another student - error should be cleared
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Bob Jones/i }));

      await waitFor(() => {
        expect(screen.queryByText('First error')).not.toBeInTheDocument();
      });
    });
  });

  describe('Edit Preferences Button', () => {
    it('should show Edit Preferences icon button after student selection', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByLabelText('Edit preferences')).toBeInTheDocument();
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
        expect(screen.getByLabelText('Edit preferences')).toBeInTheDocument();
      });

      await user.click(screen.getByLabelText('Edit preferences'));

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

      // Wait for auto-search to complete
      await waitFor(() => {
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      // Clear mock calls to track new ones
      mockFetch.mockClear();

      await user.click(screen.getByLabelText('Edit preferences'));

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
    it('should show new results when selecting a different student', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Select Alice - auto-search loads results
      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      // Now select Bob — new auto-search triggers
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Bob Jones/i }));

      // Bob's results also load (same mock data)
      await waitFor(() => {
        expect(screen.getByText('Bob Jones')).toBeInTheDocument();
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
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      // Expand details to see books read
      fireEvent.click(screen.getByLabelText('Show reading history'));

      await waitFor(() => {
        expect(screen.getByText(/Books Read \(2\)/i)).toBeInTheDocument();
      });

      // Now select Bob (no books read) - details collapse
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Bob Jones/i }));

      await waitFor(() => {
        expect(screen.getByText('Bob Jones')).toBeInTheDocument();
      });

      // Expand details again
      fireEvent.click(screen.getByLabelText('Show reading history'));

      await waitFor(() => {
        expect(screen.getByText('No books recorded yet')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle students with no sessions', async () => {
      const mockFetch = createMockFetch({
        studentSessions: { 'student-1': [] }
      });
      const context = createMockContext({
        fetchWithAuth: mockFetch,
        students: [
          { id: 'student-1', name: 'No Sessions', classId: 'class-1', totalSessionCount: 0 }
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
      const mockFetch = createMockFetch({
        studentSessions: {
          'student-1': [
            { id: 'session-1', bookId: 'non-existent-book', date: '2024-06-01' }
          ]
        }
      });
      const context = createMockContext({
        fetchWithAuth: mockFetch,
        students: [
          {
            id: 'student-1',
            name: 'Unknown Book Student',
            classId: 'class-1',
            totalSessionCount: 1
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

  describe('Focus Mode', () => {
    it('should render focus mode dropdown after student selection', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      // Select a student
      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Focus mode dropdown should be visible
      await waitFor(() => {
        expect(screen.getByLabelText(/focus/i)).toBeInTheDocument();
      });
    });

    it('should default to balanced focus mode', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Check that balanced is selected
      await waitFor(() => {
        const focusSelect = screen.getByLabelText(/focus/i);
        expect(focusSelect).toHaveTextContent('Balanced');
      });
    });

    it('should allow changing focus mode to consolidation', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/focus/i)).toBeInTheDocument();
      });

      // Open and select consolidation
      const focusSelect = screen.getByLabelText(/focus/i);
      await user.click(focusSelect);
      await user.click(screen.getByRole('option', { name: /consolidation/i }));

      // Verify consolidation is selected
      await waitFor(() => {
        expect(screen.getByLabelText(/focus/i)).toHaveTextContent('Consolidation');
      });
    });

    it('should allow changing focus mode to challenge', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/focus/i)).toBeInTheDocument();
      });

      // Open and select challenge
      const focusSelect = screen.getByLabelText(/focus/i);
      await user.click(focusSelect);
      await user.click(screen.getByRole('option', { name: /challenge/i }));

      // Verify challenge is selected
      await waitFor(() => {
        expect(screen.getByLabelText(/focus/i)).toHaveTextContent('Challenge');
      });
    });

    it('should include focusMode in AI suggestions API call', async () => {
      const mockFetch = createMockFetch();
      const context = createMockContext({ fetchWithAuth: mockFetch });
      const user = userEvent.setup();
      render(<BookRecommendations />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText(/student/i);
      await user.click(studentSelect);
      await user.click(screen.getByRole('option', { name: /Alice Smith/i }));

      // Wait for auto-search to complete
      await waitFor(() => {
        expect(screen.getByText('Recommended Book 1')).toBeInTheDocument();
      });

      // Change to challenge mode
      const focusSelect = screen.getByLabelText(/focus/i);
      await user.click(focusSelect);
      await user.click(screen.getByRole('option', { name: /challenge/i }));

      // Click AI Suggestions
      await user.click(screen.getByRole('button', { name: /ask ai/i }));

      // Verify the API was called with focusMode
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/books/ai-suggestions?studentId=student-1&focusMode=challenge');
      });
    });

    it('should disable focus mode dropdown during loading', async () => {
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

      // Focus dropdown should be disabled during auto-search loading
      await waitFor(() => {
        const focusSelect = screen.getByLabelText(/focus/i);
        expect(focusSelect).toHaveAttribute('aria-disabled', 'true');
      });
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

      // Auto-search triggers and fails
      await waitFor(() => {
        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(alert).toHaveTextContent('Test error message');
      });
    });
  });
});
