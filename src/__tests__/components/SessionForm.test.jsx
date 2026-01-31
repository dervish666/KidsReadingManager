import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { createContext, useContext } from 'react';

// Create a test context to mock AppContext
const TestAppContext = createContext();

// Mock the AppContext module
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => useContext(TestAppContext)
}));

// Mock the bookMetadataApi module
vi.mock('../../utils/bookMetadataApi', () => ({
  getBookDetails: vi.fn(),
  checkAvailability: vi.fn(),
  getProviderDisplayName: vi.fn(),
  validateProviderConfig: vi.fn()
}));

// Import after mocking
import SessionForm from '../../components/sessions/SessionForm';
import * as bookMetadataApi from '../../utils/bookMetadataApi';

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
      readingSessions: [
        {
          id: 'session-1',
          date: '2024-01-15',
          assessment: 'independent',
          notes: 'Great reading!',
          bookId: 'book-1',
          location: 'school'
        }
      ]
    },
    {
      id: 'student-2',
      name: 'Bob Jones',
      classId: 'class-1',
      readingSessions: []
    },
    {
      id: 'student-3',
      name: 'Charlie Brown',
      classId: 'class-2',
      readingSessions: []
    }
  ],
  books: [
    {
      id: 'book-1',
      title: 'The Cat in the Hat',
      author: 'Dr. Seuss',
      readingLevel: 'Blue',
      ageRange: '4-8',
      genreIds: ['genre-1']
    },
    {
      id: 'book-2',
      title: 'Charlotte\'s Web',
      author: 'E.B. White',
      readingLevel: 'Green',
      ageRange: '8-12',
      genreIds: ['genre-2']
    }
  ],
  classes: [
    { id: 'class-1', name: 'Class 1A', disabled: false },
    { id: 'class-2', name: 'Class 2B', disabled: false },
    { id: 'class-3', name: 'Disabled Class', disabled: true }
  ],
  genres: [
    { id: 'genre-1', name: 'Fiction' },
    { id: 'genre-2', name: 'Adventure' }
  ],
  recentlyAccessedStudents: ['student-1'],
  globalClassFilter: null,
  settings: {
    bookMetadata: {
      provider: 'openlibrary',
      googleBooksApiKey: null
    }
  },
  addReadingSession: vi.fn(),
  updateBook: vi.fn(),
  findOrCreateBook: vi.fn(),
  ...overrides
});

describe('SessionForm Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    bookMetadataApi.validateProviderConfig.mockReturnValue({ valid: true, error: null });
    bookMetadataApi.getProviderDisplayName.mockReturnValue('Open Library');
    bookMetadataApi.checkAvailability.mockResolvedValue(true);
    bookMetadataApi.getBookDetails.mockResolvedValue({ author: 'Test Author' });
  });

  describe('Initial Render', () => {
    it('should render the form with all required elements', () => {
      const context = createMockContext();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      expect(screen.getByText('Record Reading Session')).toBeInTheDocument();
      expect(screen.getByLabelText('Student')).toBeInTheDocument();
      // Date picker is now in header without a label - find by type
      expect(screen.getByDisplayValue(new Date().toISOString().split('T')[0])).toBeInTheDocument();
      expect(screen.getByText('Location')).toBeInTheDocument();
      expect(screen.getByText('Assessment:')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save reading session/i })).toBeInTheDocument();
    });

    it('should render with default date set to today', () => {
      const context = createMockContext();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const today = new Date().toISOString().split('T')[0];
      // Date picker is now in header without a label - find by display value
      const dateInput = screen.getByDisplayValue(today);
      expect(dateInput).toHaveValue(today);
    });

    it('should render with school as default location', () => {
      const context = createMockContext();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const schoolRadio = screen.getByLabelText('School');
      expect(schoolRadio).toBeChecked();
    });

    it('should handle empty students array gracefully', () => {
      const context = createMockContext({ students: [] });
      render(<SessionForm />, { wrapper: createWrapper(context) });

      // Form should still render without errors
      expect(screen.getByText('Record Reading Session')).toBeInTheDocument();
    });

    it('should handle empty books array gracefully', () => {
      const context = createMockContext({ books: [] });
      render(<SessionForm />, { wrapper: createWrapper(context) });

      // Form should still render without errors
      expect(screen.getByText('Record Reading Session')).toBeInTheDocument();
    });
  });

  describe('Student Selection', () => {
    it('should display students in dropdown', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      // Open the select dropdown
      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);

      // Check that students are displayed
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
      expect(screen.getByText('Charlie Brown')).toBeInTheDocument();
    });

    it('should mark recently accessed students with star', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);

      // Alice is in recentlyAccessedStudents and should have "Recent" text
      const aliceOption = screen.getByText('Alice Smith').closest('li');
      expect(within(aliceOption).getByText('Recent')).toBeInTheDocument();
    });

    it('should filter students based on globalClassFilter', async () => {
      const context = createMockContext({ globalClassFilter: 'class-1' });
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);

      // Should show Alice and Bob (class-1) but not Charlie (class-2)
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Jones')).toBeInTheDocument();
      expect(screen.queryByText('Charlie Brown')).not.toBeInTheDocument();
    });

    it('should exclude students from disabled classes', async () => {
      const context = createMockContext({
        students: [
          { id: 'student-1', name: 'Active Student', classId: 'class-1', readingSessions: [] },
          { id: 'student-disabled', name: 'Disabled Class Student', classId: 'class-3', readingSessions: [] }
        ]
      });
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);

      expect(screen.getByText('Active Student')).toBeInTheDocument();
      expect(screen.queryByText('Disabled Class Student')).not.toBeInTheDocument();
    });

    it('should show message when no students match filter', async () => {
      const context = createMockContext({
        globalClassFilter: 'nonexistent-class'
      });
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);

      expect(screen.getByText('No students found in this class')).toBeInTheDocument();
    });

    it('should allow selecting a student', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);
      await user.click(screen.getByText('Bob Jones'));

      // The select should now show Bob Jones as selected
      expect(studentSelect).toHaveTextContent('Bob Jones');
    });

    it('should display previous sessions after selecting student', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);
      await user.click(screen.getByText('Alice Smith'));

      // Previous sessions section should appear
      expect(screen.getByText(/previous sessions for alice smith/i)).toBeInTheDocument();
    });
  });

  describe('Date Picker', () => {
    it('should allow changing the date', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const today = new Date().toISOString().split('T')[0];
      // Date picker is now in header without a label - find by display value
      const dateInput = screen.getByDisplayValue(today);
      await user.clear(dateInput);
      await user.type(dateInput, '2024-06-15');

      expect(dateInput).toHaveValue('2024-06-15');
    });
  });

  describe('Location Selection', () => {
    it('should allow changing location to home', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const homeRadio = screen.getByLabelText('Home');
      await user.click(homeRadio);

      expect(homeRadio).toBeChecked();
      expect(screen.getByLabelText('School')).not.toBeChecked();
    });
  });

  describe('Assessment Selector', () => {
    it('should render all assessment options', () => {
      const context = createMockContext();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      expect(screen.getByRole('button', { name: /needing help/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /moderate help/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /independent/i })).toBeInTheDocument();
    });

    it('should allow selecting different assessments', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const needingHelpBtn = screen.getByRole('button', { name: /needing help/i });
      await user.click(needingHelpBtn);

      // Button should become contained variant (selected state)
      expect(needingHelpBtn).toHaveClass('MuiButton-contained');
    });
  });

  describe('Book Autocomplete', () => {
    it('should render book autocomplete', () => {
      const context = createMockContext();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      expect(screen.getByLabelText(/book/i)).toBeInTheDocument();
    });

    it('should show book details panel when a book is selected', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      // Find the book autocomplete and type
      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat in');

      // Wait for and select the book option
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      // Book details panel should appear
      expect(screen.getByText('Selected Book Details')).toBeInTheDocument();
      expect(screen.getByLabelText('Author')).toBeInTheDocument();
      expect(screen.getByLabelText('Reading Level')).toBeInTheDocument();
      expect(screen.getByLabelText('Age Range')).toBeInTheDocument();
    });

    it('should populate book details fields when book is selected', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');

      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      // Check that fields are populated with book data
      expect(screen.getByLabelText('Author')).toHaveValue('Dr. Seuss');
      expect(screen.getByLabelText('Reading Level')).toHaveValue('Blue');
      expect(screen.getByLabelText('Age Range')).toHaveValue('4-8');
    });
  });

  describe('Form Submission', () => {
    it('should show error when submitting without student selection', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const submitButton = screen.getByRole('button', { name: /save reading session/i });
      await user.click(submitButton);

      expect(screen.getByText('Please select a student')).toBeInTheDocument();
    });

    it('should call addReadingSession with correct data on submit', async () => {
      const mockAddReadingSession = vi.fn();
      const context = createMockContext({ addReadingSession: mockAddReadingSession });
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      // Select a student
      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);
      await user.click(screen.getByText('Bob Jones'));

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /save reading session/i });
      await user.click(submitButton);

      expect(mockAddReadingSession).toHaveBeenCalledWith('student-2', {
        date: expect.any(String),
        assessment: 'independent',
        notes: '',
        bookId: null,
        location: 'school'
      });
    });

    it('should include selected book in submission', async () => {
      const mockAddReadingSession = vi.fn();
      const context = createMockContext({ addReadingSession: mockAddReadingSession });
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      // Select a student
      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);
      await user.click(screen.getByText('Bob Jones'));

      // Select a book
      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /save reading session/i });
      await user.click(submitButton);

      expect(mockAddReadingSession).toHaveBeenCalledWith('student-2', {
        date: expect.any(String),
        assessment: 'independent',
        notes: '',
        bookId: 'book-1',
        location: 'school'
      });
    });

    it('should include home location in submission when selected', async () => {
      const mockAddReadingSession = vi.fn();
      const context = createMockContext({ addReadingSession: mockAddReadingSession });
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      // Select a student
      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);
      await user.click(screen.getByText('Bob Jones'));

      // Change location to home
      const homeRadio = screen.getByLabelText('Home');
      await user.click(homeRadio);

      // Submit the form
      const submitButton = screen.getByRole('button', { name: /save reading session/i });
      await user.click(submitButton);

      expect(mockAddReadingSession).toHaveBeenCalledWith('student-2', {
        date: expect.any(String),
        assessment: 'independent',
        notes: '',
        bookId: null,
        location: 'home'
      });
    });

    it('should reset form after successful submission', async () => {
      const mockAddReadingSession = vi.fn();
      const context = createMockContext({ addReadingSession: mockAddReadingSession });
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      // Select a student and submit
      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);
      await user.click(screen.getByText('Bob Jones'));

      const submitButton = screen.getByRole('button', { name: /save reading session/i });
      await user.click(submitButton);

      // Form should be reset (assessment back to independent)
      expect(screen.getByRole('button', { name: /independent/i })).toHaveClass('MuiButton-contained');
    });

    it('should show snackbar after successful submission', async () => {
      const mockAddReadingSession = vi.fn();
      const context = createMockContext({ addReadingSession: mockAddReadingSession });
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      // Select a student and submit
      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);
      await user.click(screen.getByText('Bob Jones'));

      const submitButton = screen.getByRole('button', { name: /save reading session/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Reading session saved successfully')).toBeInTheDocument();
      });
    });
  });

  describe('Get Book Details Button', () => {
    it('should show Get Details button when book is selected', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      expect(screen.getByRole('button', { name: /get details/i })).toBeInTheDocument();
    });

    it('should call bookMetadataApi.getBookDetails when clicked', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      const getDetailsButton = screen.getByRole('button', { name: /get details/i });
      await user.click(getDetailsButton);

      await waitFor(() => {
        expect(bookMetadataApi.getBookDetails).toHaveBeenCalledWith(
          'The Cat in the Hat',
          'Dr. Seuss',
          expect.objectContaining({
            bookMetadata: expect.any(Object)
          })
        );
      });
    });

    it('should show error when provider is unavailable', async () => {
      bookMetadataApi.checkAvailability.mockResolvedValue(false);

      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      const getDetailsButton = screen.getByRole('button', { name: /get details/i });
      await user.click(getDetailsButton);

      await waitFor(() => {
        expect(screen.getByText(/open library is currently unavailable/i)).toBeInTheDocument();
      });
    });

    it('should show error when provider config is invalid', async () => {
      bookMetadataApi.validateProviderConfig.mockReturnValue({
        valid: false,
        error: 'Google Books API key is required'
      });

      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      const getDetailsButton = screen.getByRole('button', { name: /get details/i });
      await user.click(getDetailsButton);

      await waitFor(() => {
        expect(screen.getByText('Google Books API key is required')).toBeInTheDocument();
      });
    });

    it('should show fetching state while loading details', async () => {
      // Make getBookDetails take time to resolve
      bookMetadataApi.getBookDetails.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ author: 'New Author' }), 100))
      );

      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      const getDetailsButton = screen.getByRole('button', { name: /get details/i });
      await user.click(getDetailsButton);

      expect(screen.getByRole('button', { name: /fetching/i })).toBeInTheDocument();
    });

    it('should handle getBookDetails error gracefully', async () => {
      bookMetadataApi.getBookDetails.mockRejectedValue(new Error('Network error'));

      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      const getDetailsButton = screen.getByRole('button', { name: /get details/i });
      await user.click(getDetailsButton);

      await waitFor(() => {
        expect(screen.getByText(/failed to fetch details: network error/i)).toBeInTheDocument();
      });
    });

    it('should handle case when no book details are found', async () => {
      bookMetadataApi.getBookDetails.mockResolvedValue(null);

      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      const getDetailsButton = screen.getByRole('button', { name: /get details/i });
      await user.click(getDetailsButton);

      await waitFor(() => {
        expect(screen.getByText(/no details found for this book on open library/i)).toBeInTheDocument();
      });
    });
  });

  describe('Update Book Button', () => {
    it('should show Update Book button when book is selected', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      expect(screen.getByRole('button', { name: /update book/i })).toBeInTheDocument();
    });

    it('should call updateBook from context when clicked', async () => {
      const mockUpdateBook = vi.fn().mockResolvedValue(true);
      const context = createMockContext({ updateBook: mockUpdateBook });
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      // Edit the author field
      const authorInput = screen.getByLabelText('Author');
      await user.clear(authorInput);
      await user.type(authorInput, 'Updated Author');

      const updateButton = screen.getByRole('button', { name: /update book/i });
      await user.click(updateButton);

      await waitFor(() => {
        expect(mockUpdateBook).toHaveBeenCalledWith('book-1', {
          author: 'Updated Author',
          readingLevel: 'Blue',
          ageRange: '4-8',
          genreIds: ['genre-1']
        });
      });
    });

    it('should handle updateBook failure', async () => {
      const mockUpdateBook = vi.fn().mockResolvedValue(false);
      const context = createMockContext({ updateBook: mockUpdateBook });
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      const updateButton = screen.getByRole('button', { name: /update book/i });
      await user.click(updateButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to update book')).toBeInTheDocument();
      });
    });

    it('should handle updateBook exception', async () => {
      const mockUpdateBook = vi.fn().mockRejectedValue(new Error('Database error'));
      const context = createMockContext({ updateBook: mockUpdateBook });
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      const updateButton = screen.getByRole('button', { name: /update book/i });
      await user.click(updateButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to update book')).toBeInTheDocument();
      });
    });

    it('should show error when trying to update without selecting a book', async () => {
      // This test verifies the button is not visible when no book is selected
      const context = createMockContext();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      // Update Book button should not be visible
      expect(screen.queryByRole('button', { name: /update book/i })).not.toBeInTheDocument();
    });

    it('should pass trimmed values to updateBook', async () => {
      const mockUpdateBook = vi.fn().mockResolvedValue(true);
      const context = createMockContext({ updateBook: mockUpdateBook });
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      // Edit the author field with whitespace
      const authorInput = screen.getByLabelText('Author');
      await user.clear(authorInput);
      await user.type(authorInput, '  Author With Spaces  ');

      const updateButton = screen.getByRole('button', { name: /update book/i });
      await user.click(updateButton);

      await waitFor(() => {
        expect(mockUpdateBook).toHaveBeenCalledWith('book-1', {
          author: 'Author With Spaces',
          readingLevel: 'Blue',
          ageRange: '4-8',
          genreIds: ['genre-1']
        });
      });
    });
  });

  describe('Reset Button', () => {
    it('should reset book details to original values', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      // Edit the author field
      const authorInput = screen.getByLabelText('Author');
      await user.clear(authorInput);
      await user.type(authorInput, 'Changed Author');

      expect(authorInput).toHaveValue('Changed Author');

      // Click reset button
      const resetButton = screen.getByRole('button', { name: /reset/i });
      await user.click(resetButton);

      // Should restore original value
      expect(authorInput).toHaveValue('Dr. Seuss');
    });
  });

  describe('Settings Integration', () => {
    it('should pass settings to validateProviderConfig', async () => {
      const context = createMockContext({
        settings: {
          bookMetadata: {
            provider: 'googlebooks',
            googleBooksApiKey: 'test-api-key'
          }
        }
      });
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      const getDetailsButton = screen.getByRole('button', { name: /get details/i });
      await user.click(getDetailsButton);

      await waitFor(() => {
        expect(bookMetadataApi.validateProviderConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            bookMetadata: {
              provider: 'googlebooks',
              googleBooksApiKey: 'test-api-key'
            }
          })
        );
      });
    });

    it('should handle undefined settings gracefully', async () => {
      const context = createMockContext({ settings: undefined });
      const user = userEvent.setup();

      // Should render without crashing
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      // validateProviderConfig should handle undefined settings
      const getDetailsButton = screen.getByRole('button', { name: /get details/i });
      await user.click(getDetailsButton);

      await waitFor(() => {
        expect(bookMetadataApi.validateProviderConfig).toHaveBeenCalledWith(undefined);
      });
    });
  });

  describe('Genre Selection', () => {
    it('should display genre selector in book details panel', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      const bookInput = screen.getByLabelText(/book/i);
      await user.type(bookInput, 'Cat');
      const option = await screen.findByText(/the cat in the hat/i);
      await user.click(option);

      expect(screen.getByLabelText('Genres')).toBeInTheDocument();
    });
  });

  describe('Previous Sessions Display', () => {
    it('should show previous sessions when student has them', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      // Select Alice who has previous sessions
      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);
      await user.click(screen.getByText('Alice Smith'));

      expect(screen.getByText(/previous sessions for alice smith/i)).toBeInTheDocument();
      // Check that the session shows the book title from the session
      expect(screen.getByText(/"the cat in the hat"/i)).toBeInTheDocument();
      // Check that session notes are displayed
      expect(screen.getByText(/great reading!/i)).toBeInTheDocument();
    });

    it('should show "no previous sessions" message for new students', async () => {
      const context = createMockContext();
      const user = userEvent.setup();
      render(<SessionForm />, { wrapper: createWrapper(context) });

      // Select Bob who has no sessions
      const studentSelect = screen.getByLabelText('Student');
      await user.click(studentSelect);
      await user.click(screen.getByText('Bob Jones'));

      expect(screen.getByText(/previous sessions for bob jones/i)).toBeInTheDocument();
      expect(screen.getByText('No previous reading sessions recorded.')).toBeInTheDocument();
    });
  });
});
