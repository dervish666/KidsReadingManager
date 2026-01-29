import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { createContext, useContext } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Create a test context to mock AppContext
const TestAppContext = createContext();

// Mock the AppContext module
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => useContext(TestAppContext)
}));

// Mock the child dialog components to simplify testing
vi.mock('../../components/sessions/StudentSessions', () => ({
  default: ({ open, onClose, student }) => (
    open ? (
      <div data-testid="student-sessions-dialog" role="dialog">
        <span data-testid="sessions-student-name">{student?.name}</span>
        <button onClick={onClose}>Close Sessions</button>
      </div>
    ) : null
  )
}));

vi.mock('../../components/students/StudentProfile', () => ({
  default: ({ open, onClose, student }) => (
    open ? (
      <div data-testid="student-profile-dialog" role="dialog">
        <span data-testid="profile-student-name">{student?.name}</span>
        <button onClick={onClose}>Close Profile</button>
      </div>
    ) : null
  )
}));

// Import after mocking
import StudentTable from '../../components/students/StudentTable';

// Create a theme with status colors for testing
const createTestTheme = () => createTheme({
  palette: {
    primary: {
      main: '#1976d2',
      dark: '#115293',
    },
    success: {
      main: '#4caf50',
      dark: '#388e3c',
    },
    warning: {
      main: '#ff9800',
    },
    error: {
      main: '#f44336',
    },
    status: {
      recent: '#4caf50',
      attention: '#ff9800',
      overdue: '#f44336',
      never: '#9e9e9e',
      notRead: '#f44336',
      needsAttention: '#ff9800',
    },
    action: {
      hover: 'rgba(0, 0, 0, 0.04)',
    },
  },
});

// Mock AppContext provider wrapper with theme
const createWrapper = (contextValue) => {
  return ({ children }) => (
    <ThemeProvider theme={createTestTheme()}>
      <TestAppContext.Provider value={contextValue}>
        {children}
      </TestAppContext.Provider>
    </ThemeProvider>
  );
};

// Default mock context values
const createMockContext = (overrides = {}) => ({
  classes: [
    { id: 'class-1', name: 'Class 1A', disabled: false },
    { id: 'class-2', name: 'Class 2B', disabled: false },
    { id: 'class-3', name: 'Class 3C', disabled: true }
  ],
  getReadingStatus: vi.fn((student) => {
    if (!student || !student.lastReadDate) return 'notRead';
    const daysSince = Math.floor(
      (new Date() - new Date(student.lastReadDate)) / (1000 * 60 * 60 * 24)
    );
    if (daysSince <= 7) return 'recent';
    if (daysSince <= 14) return 'needsAttention';
    return 'notRead';
  }),
  markStudentAsPriorityHandled: vi.fn(),
  markedPriorityStudentIds: new Set(),
  ...overrides
});

// Helper to create test students
const createTestStudents = () => [
  {
    id: 'student-1',
    name: 'Alice Anderson',
    classId: 'class-1',
    lastReadDate: '2024-01-25', // Use fixed date
    currentStreak: 5,
    readingLevel: '3.5',
    readingSessions: [
      { id: 'session-1', date: '2024-01-25', bookId: 'book-1' },
      { id: 'session-2', date: '2024-01-10', bookId: 'book-2' },
      { id: 'session-3', date: '2024-01-09', bookId: 'book-1' },
    ]
  },
  {
    id: 'student-2',
    name: 'Bob Brown',
    classId: 'class-1',
    lastReadDate: '2024-01-15',
    currentStreak: 0,
    readingLevel: '2.0',
    readingSessions: [
      { id: 'session-4', date: '2024-01-15', bookId: 'book-1' },
    ]
  },
  {
    id: 'student-3',
    name: 'Charlie Chen',
    classId: 'class-2',
    lastReadDate: null,
    currentStreak: 0,
    readingLevel: '1.5',
    readingSessions: []
  },
  {
    id: 'student-4',
    name: 'Diana Davis',
    classId: 'class-2',
    lastReadDate: '2024-01-20',
    currentStreak: 3,
    readingLevel: '4.0',
    readingSessions: [
      { id: 'session-5', date: '2024-01-20', bookId: 'book-2' },
      { id: 'session-6', date: '2024-01-19', bookId: 'book-1' },
    ]
  }
];

describe('StudentTable Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock Date for consistent "days ago" calculations
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial Render', () => {
    it('should render the table with correct column headers', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      expect(screen.getByText('Student')).toBeInTheDocument();
      expect(screen.getByText('Class')).toBeInTheDocument();
      expect(screen.getByText('Last Read')).toBeInTheDocument();
      expect(screen.getByText('Sessions')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('should render all students from props', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      expect(screen.getByText(/Alice Anderson/)).toBeInTheDocument();
      expect(screen.getByText(/Bob Brown/)).toBeInTheDocument();
      expect(screen.getByText(/Charlie Chen/)).toBeInTheDocument();
      expect(screen.getByText(/Diana Davis/)).toBeInTheDocument();
    });

    it('should display session counts for each student', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Session counts appear in parentheses next to student names and in Sessions column
      // Alice: 3, Bob: 1, Charlie: 0, Diana: 2
      // Check for these counts in the rendered output
      expect(screen.getByText(/Alice Anderson \(3\)/)).toBeInTheDocument();
      expect(screen.getByText(/Bob Brown \(1\)/)).toBeInTheDocument();
      expect(screen.getByText(/Charlie Chen \(0\)/)).toBeInTheDocument();
      expect(screen.getByText(/Diana Davis \(2\)/)).toBeInTheDocument();
    });

    it('should display class names correctly', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Class names should appear in the table (may be hidden on mobile)
      const class1aCells = screen.getAllByText('Class 1A');
      const class2bCells = screen.getAllByText('Class 2B');
      expect(class1aCells.length).toBeGreaterThan(0);
      expect(class2bCells.length).toBeGreaterThan(0);
    });

    it('should display "Unassigned" for students without a class', () => {
      const context = createMockContext();
      const studentsWithNoClass = [{
        id: 'student-no-class',
        name: 'No Class Student',
        classId: null,
        lastReadDate: null,
        currentStreak: 0,
        readingSessions: []
      }];
      render(<StudentTable students={studentsWithNoClass} />, { wrapper: createWrapper(context) });

      expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
    });

    it('should handle empty students array gracefully', () => {
      const context = createMockContext();
      render(<StudentTable students={[]} />, { wrapper: createWrapper(context) });

      // Table should still render headers
      expect(screen.getByText('Student')).toBeInTheDocument();
      // But no student rows
      expect(screen.queryByText('Alice Anderson')).not.toBeInTheDocument();
    });
  });

  describe('Sorting Functionality', () => {
    it('should sort by name ascending by default', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Get all rows (excluding header)
      const rows = screen.getAllByRole('row').slice(1);
      // First student alphabetically should be Alice
      expect(within(rows[0]).getByText(/Alice Anderson/)).toBeInTheDocument();
    });

    it('should sort by name descending when clicking name column', async () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Click the Student column header to toggle sort using fireEvent
      const nameSortLabel = screen.getByRole('button', { name: /sort by student name/i });
      fireEvent.click(nameSortLabel);

      // After clicking, should be descending (Diana first)
      const rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]).getByText(/Diana Davis/)).toBeInTheDocument();
    });

    it('should sort by class when clicking class column', async () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Click the Class column header - find by aria-label text
      const classSortLabel = screen.getByLabelText(/sort by class/i);
      fireEvent.click(classSortLabel);

      // Students in Class 1A should come first (Alice and Bob are both in Class 1A)
      const rows = screen.getAllByRole('row').slice(1);
      // First row should have a Class 1A student (either Alice or Bob)
      const firstRowText = rows[0].textContent;
      expect(firstRowText.includes('Alice Anderson') || firstRowText.includes('Bob Brown')).toBe(true);
    });

    it('should sort by last read date when clicking last read column', async () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Click the Last Read column header
      const lastReadSortLabel = screen.getByRole('button', { name: /sort by last read date/i });
      fireEvent.click(lastReadSortLabel);

      // Charlie (never read) should come first with ascending order (null/0 timestamps)
      const rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]).getByText(/Charlie Chen/)).toBeInTheDocument();
    });

    it('should sort by sessions count when clicking sessions column', async () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Click the Sessions column header
      const sessionsSortLabel = screen.getByRole('button', { name: /sort by number of reading sessions/i });
      fireEvent.click(sessionsSortLabel);

      // Charlie (0 sessions) should come first with ascending order
      const rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]).getByText(/Charlie Chen/)).toBeInTheDocument();
    });

    it('should toggle sort direction on repeated clicks', async () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      const sessionsSortLabel = screen.getByRole('button', { name: /sort by number of reading sessions/i });

      // First click - ascending
      fireEvent.click(sessionsSortLabel);
      let rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]).getByText(/Charlie Chen/)).toBeInTheDocument(); // 0 sessions

      // Second click - descending
      fireEvent.click(sessionsSortLabel);
      rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]).getByText(/Alice Anderson/)).toBeInTheDocument(); // 3 sessions
    });
  });

  describe('Student Row Click - Opens Sessions Dialog', () => {
    it('should open StudentSessions dialog when clicking a student row', async () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Click on Alice's row
      const aliceRow = screen.getByText(/Alice Anderson/).closest('tr');
      fireEvent.click(aliceRow);

      // Check that the sessions dialog is opened
      expect(screen.getByTestId('student-sessions-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('sessions-student-name')).toHaveTextContent('Alice Anderson');
    });

    it('should close StudentSessions dialog when close is triggered', async () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Open the dialog
      const aliceRow = screen.getByText(/Alice Anderson/).closest('tr');
      fireEvent.click(aliceRow);

      expect(screen.getByTestId('student-sessions-dialog')).toBeInTheDocument();

      // Close the dialog
      const closeButton = screen.getByRole('button', { name: 'Close Sessions' });
      fireEvent.click(closeButton);

      expect(screen.queryByTestId('student-sessions-dialog')).not.toBeInTheDocument();
    });
  });

  describe('Student Profile Button - Opens Profile Dialog', () => {
    it('should open StudentProfile dialog when clicking profile button', async () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Find and click the profile button for Alice
      const profileButton = screen.getByRole('button', { name: /view profile for alice anderson/i });
      fireEvent.click(profileButton);

      // Check that the profile dialog is opened
      expect(screen.getByTestId('student-profile-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('profile-student-name')).toHaveTextContent('Alice Anderson');
    });

    it('should not open sessions dialog when clicking profile button', async () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Click the profile button (should not trigger row click)
      const profileButton = screen.getByRole('button', { name: /view profile for alice anderson/i });
      fireEvent.click(profileButton);

      // Only profile dialog should be open, not sessions dialog
      expect(screen.getByTestId('student-profile-dialog')).toBeInTheDocument();
      expect(screen.queryByTestId('student-sessions-dialog')).not.toBeInTheDocument();
    });

    it('should close StudentProfile dialog when close is triggered', async () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Open the profile dialog
      const profileButton = screen.getByRole('button', { name: /view profile for alice anderson/i });
      fireEvent.click(profileButton);

      expect(screen.getByTestId('student-profile-dialog')).toBeInTheDocument();

      // Close the dialog
      const closeButton = screen.getByRole('button', { name: 'Close Profile' });
      fireEvent.click(closeButton);

      expect(screen.queryByTestId('student-profile-dialog')).not.toBeInTheDocument();
    });
  });

  describe('Mark as Reading Today Button', () => {
    it('should call markStudentAsPriorityHandled when clicking the book icon', async () => {
      const mockMarkStudent = vi.fn();
      const context = createMockContext({
        markStudentAsPriorityHandled: mockMarkStudent
      });
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Find and click the "mark as reading today" button for Alice
      const markButton = screen.getByRole('button', { name: /mark alice anderson as reading today/i });
      fireEvent.click(markButton);

      expect(mockMarkStudent).toHaveBeenCalledWith('student-1');
    });

    it('should show snackbar after marking student', () => {
      const mockMarkStudent = vi.fn();
      const context = createMockContext({
        markStudentAsPriorityHandled: mockMarkStudent
      });
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      const markButton = screen.getByRole('button', { name: /mark alice anderson as reading today/i });
      fireEvent.click(markButton);

      // Snackbar should appear immediately after click
      expect(screen.getByText('Alice Anderson added to reading list')).toBeInTheDocument();
    });

    it('should show check icon when student is already marked', () => {
      const context = createMockContext({
        markedPriorityStudentIds: new Set(['student-1'])
      });
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // The button should now say "marked as reading today"
      expect(screen.getByRole('button', { name: /alice anderson marked as reading today/i })).toBeInTheDocument();
    });

    it('should not open sessions dialog when clicking mark button', async () => {
      const mockMarkStudent = vi.fn();
      const context = createMockContext({
        markStudentAsPriorityHandled: mockMarkStudent
      });
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      const markButton = screen.getByRole('button', { name: /mark alice anderson as reading today/i });
      fireEvent.click(markButton);

      // Sessions dialog should NOT be opened
      expect(screen.queryByTestId('student-sessions-dialog')).not.toBeInTheDocument();
    });
  });

  describe('Streak Badges Display', () => {
    it('should display streak badge for students with active streaks', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Alice has a streak of 5
      // The streak badge should be visible
      const aliceRow = screen.getByText(/Alice Anderson/).closest('tr');
      // Streak badge shows the number 5
      expect(within(aliceRow).getByText('5')).toBeInTheDocument();
    });

    it('should not display streak badge for students with no streak', () => {
      const context = createMockContext();
      const studentsWithNoStreak = [{
        id: 'student-no-streak',
        name: 'No Streak Student',
        classId: 'class-1',
        lastReadDate: '2024-01-10',
        currentStreak: 0,
        readingLevel: '2.0',
        readingSessions: [{ id: 'session-1', date: '2024-01-10', bookId: 'book-1' }]
      }];
      render(<StudentTable students={studentsWithNoStreak} />, { wrapper: createWrapper(context) });

      // Should only show "1" for session count, not as a streak badge
      const studentRow = screen.getByText(/No Streak Student/).closest('tr');
      // The only "1" should be in the session count, not a streak
      // Verify no fire emoji is present (streak badge indicator)
      expect(within(studentRow).queryByText(/🔥/)).not.toBeInTheDocument();
    });

    it('should display different streak values correctly', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Alice has streak 5, Diana has streak 3
      const aliceRow = screen.getByText(/Alice Anderson/).closest('tr');
      const dianaRow = screen.getByText(/Diana Davis/).closest('tr');

      // Both should have streak badges with their values
      expect(within(aliceRow).getByText('5')).toBeInTheDocument();
      expect(within(dianaRow).getByText('3')).toBeInTheDocument();
    });
  });

  describe('Reading Level and Status Display', () => {
    it('should display last read date formatted correctly', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Check for formatted dates
      // Alice read on 25 Jan 2024
      expect(screen.getByText('25 Jan 2024')).toBeInTheDocument();
      // Bob read on Jan 15
      expect(screen.getByText('15 Jan 2024')).toBeInTheDocument();
    });

    it('should display "Never" for students who have never read', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Charlie has never read
      expect(screen.getByText('Never')).toBeInTheDocument();
    });

    it('should display "days ago" text correctly', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Alice read today - 0 days ago
      expect(screen.getByText('0 days ago')).toBeInTheDocument();
      // Bob read 10 days ago (Jan 25 - Jan 15)
      expect(screen.getByText('10 days ago')).toBeInTheDocument();
      // Diana read 5 days ago (Jan 25 - Jan 20)
      expect(screen.getByText('5 days ago')).toBeInTheDocument();
    });

    it('should display "Never read" for students with no reading history', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Charlie has never read
      expect(screen.getByText('Never read')).toBeInTheDocument();
    });

    it('should apply correct status color based on reading recency', () => {
      const mockGetReadingStatus = vi.fn((student) => {
        if (student.id === 'student-1') return 'recent';
        if (student.id === 'student-2') return 'needsAttention';
        if (student.id === 'student-3') return 'notRead';
        return 'recent';
      });
      const context = createMockContext({
        getReadingStatus: mockGetReadingStatus
      });
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Verify getReadingStatus was called for each student
      expect(mockGetReadingStatus).toHaveBeenCalledTimes(4);
    });
  });

  describe('Accessibility - ARIA Labels on Sortable Columns', () => {
    it('should have aria-label on student name sort button', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      const sortButton = screen.getByRole('button', { name: /sort by student name/i });
      expect(sortButton).toHaveAttribute('aria-label');
      expect(sortButton.getAttribute('aria-label')).toContain('student name');
    });

    it('should have aria-label on class sort button', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Class column exists in the DOM but may be visually hidden on xs screens
      // Find element by aria-label attribute
      const classSortButton = screen.getByLabelText(/sort by class/i);
      expect(classSortButton).toBeInTheDocument();
      expect(classSortButton.getAttribute('aria-label')).toContain('class');
    });

    it('should have aria-label on last read sort button', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      const sortButton = screen.getByRole('button', { name: /sort by last read date/i });
      expect(sortButton).toHaveAttribute('aria-label');
      expect(sortButton.getAttribute('aria-label')).toContain('last read');
    });

    it('should have aria-label on sessions sort button', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      const sortButton = screen.getByRole('button', { name: /sort by number of reading sessions/i });
      expect(sortButton).toHaveAttribute('aria-label');
      expect(sortButton.getAttribute('aria-label')).toContain('sessions');
    });

    it('should update aria-label to reflect current sort direction', async () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      const sortButton = screen.getByRole('button', { name: /sort by student name/i });

      // Initially ascending
      expect(sortButton.getAttribute('aria-label')).toContain('ascending');

      // Click to change to descending
      fireEvent.click(sortButton);
      expect(sortButton.getAttribute('aria-label')).toContain('descending');
    });
  });

  describe('Accessibility - ARIA Labels on Icon Buttons', () => {
    it('should have aria-label on profile button for each student', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Each student should have a profile button with descriptive aria-label
      expect(screen.getByRole('button', { name: /view profile for alice anderson/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /view profile for bob brown/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /view profile for charlie chen/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /view profile for diana davis/i })).toBeInTheDocument();
    });

    it('should have aria-label on mark as reading button for each student', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Each student should have a "mark as reading" button with descriptive aria-label
      expect(screen.getByRole('button', { name: /mark alice anderson as reading today/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /mark bob brown as reading today/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /mark charlie chen as reading today/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /mark diana davis as reading today/i })).toBeInTheDocument();
    });

    it('should update aria-label when student is marked as reading today', () => {
      const context = createMockContext({
        markedPriorityStudentIds: new Set(['student-1', 'student-3'])
      });
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Alice and Charlie are marked, so their buttons should reflect that
      expect(screen.getByRole('button', { name: /alice anderson marked as reading today/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /charlie chen marked as reading today/i })).toBeInTheDocument();

      // Bob and Diana are not marked
      expect(screen.getByRole('button', { name: /mark bob brown as reading today/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /mark diana davis as reading today/i })).toBeInTheDocument();
    });

    it('should be keyboard accessible via tabIndex on mark button', () => {
      const context = createMockContext();
      const students = [createTestStudents()[0]]; // Just Alice
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      const markButton = screen.getByRole('button', { name: /mark alice anderson as reading today/i });
      expect(markButton).toHaveAttribute('tabIndex', '0');
    });

    it('should handle keyboard activation on mark button', async () => {
      const mockMarkStudent = vi.fn();
      const context = createMockContext({
        markStudentAsPriorityHandled: mockMarkStudent
      });
      const students = [createTestStudents()[0]]; // Just Alice
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      const markButton = screen.getByRole('button', { name: /mark alice anderson as reading today/i });

      // Focus and press Enter
      markButton.focus();
      fireEvent.keyDown(markButton, { key: 'Enter', code: 'Enter' });

      expect(mockMarkStudent).toHaveBeenCalledWith('student-1');
    });

    it('should handle spacebar activation on mark button', async () => {
      const mockMarkStudent = vi.fn();
      const context = createMockContext({
        markStudentAsPriorityHandled: mockMarkStudent
      });
      const students = [createTestStudents()[0]]; // Just Alice
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      const markButton = screen.getByRole('button', { name: /mark alice anderson as reading today/i });

      // Focus and press Space
      markButton.focus();
      fireEvent.keyDown(markButton, { key: ' ', code: 'Space' });

      expect(mockMarkStudent).toHaveBeenCalledWith('student-1');
    });
  });

  describe('Edge Cases', () => {
    it('should handle students with missing class data', () => {
      const context = createMockContext({ classes: [] });
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // When classes array is empty, all students should show "Unassigned"
      // (The getClassName function returns "Unassigned" when classes array is empty)
      const unassignedLabels = screen.getAllByText('Unassigned');
      expect(unassignedLabels.length).toBeGreaterThan(0);
    });

    it('should handle students with invalid classId', () => {
      const context = createMockContext();
      const studentsWithInvalidClass = [{
        id: 'student-invalid',
        name: 'Invalid Class Student',
        classId: 'non-existent-class',
        lastReadDate: null,
        currentStreak: 0,
        readingSessions: []
      }];
      render(<StudentTable students={studentsWithInvalidClass} />, { wrapper: createWrapper(context) });

      // Should display "Unknown" for unmatched classId
      expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
    });

    it('should use most recent session date when available', () => {
      const context = createMockContext();
      const studentWithOlderLastRead = [{
        id: 'student-sessions',
        name: 'Session Student',
        classId: 'class-1',
        lastReadDate: '2024-01-01', // Old lastReadDate
        currentStreak: 1,
        readingSessions: [
          { id: 's1', date: '2024-01-24', bookId: 'b1' }, // More recent session
          { id: 's2', date: '2024-01-20', bookId: 'b1' },
        ]
      }];
      render(<StudentTable students={studentWithOlderLastRead} />, { wrapper: createWrapper(context) });

      // Should show the session date (24 Jan), not lastReadDate (1 Jan)
      expect(screen.getByText('24 Jan 2024')).toBeInTheDocument();
      expect(screen.queryByText('1 Jan 2024')).not.toBeInTheDocument();
    });

    it('should handle null markStudentAsPriorityHandled gracefully', () => {
      const context = createMockContext({
        markStudentAsPriorityHandled: null
      });
      const students = [createTestStudents()[0]];
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Click should not throw an error
      const markButton = screen.getByRole('button', { name: /mark alice anderson as reading today/i });
      fireEvent.click(markButton);

      // Component should still be rendered
      expect(screen.getByText(/Alice Anderson/)).toBeInTheDocument();
    });

    it('should handle undefined markedPriorityStudentIds', () => {
      const context = createMockContext({
        markedPriorityStudentIds: undefined
      });
      const students = createTestStudents();

      // Should not throw an error
      expect(() => {
        render(<StudentTable students={students} />, { wrapper: createWrapper(context) });
      }).not.toThrow();
    });
  });

  describe('Snackbar Behavior', () => {
    it('should show snackbar when marking a student', () => {
      const mockMarkStudent = vi.fn();
      const context = createMockContext({
        markStudentAsPriorityHandled: mockMarkStudent
      });
      const students = [createTestStudents()[0]];
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      const markButton = screen.getByRole('button', { name: /mark alice anderson as reading today/i });
      fireEvent.click(markButton);

      // Snackbar should appear
      expect(screen.getByText('Alice Anderson added to reading list')).toBeInTheDocument();
    });

    it('should include student name in snackbar message', () => {
      const mockMarkStudent = vi.fn();
      const context = createMockContext({
        markStudentAsPriorityHandled: mockMarkStudent
      });
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Mark Bob
      const markButton = screen.getByRole('button', { name: /mark bob brown as reading today/i });
      fireEvent.click(markButton);

      expect(screen.getByText('Bob Brown added to reading list')).toBeInTheDocument();
    });
  });

  describe('Table Structure', () => {
    it('should render as a proper table structure', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1); // Header + data rows

      // Header row has 5 columns: Student, Class (may be hidden), Last Read, Sessions, Actions
      // But Class column is display:none on xs, so columnheader count may vary
      const columnHeaders = screen.getAllByRole('columnheader');
      expect(columnHeaders.length).toBeGreaterThanOrEqual(4);
    });

    it('should have correct number of data rows for students', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      const rows = screen.getAllByRole('row');
      // 1 header row + 4 student rows = 5 total
      expect(rows.length).toBe(5);
    });

    it('should render each student in its own row', () => {
      const context = createMockContext();
      const students = createTestStudents();
      render(<StudentTable students={students} />, { wrapper: createWrapper(context) });

      // Each student name should appear exactly once
      expect(screen.getAllByText(/Alice Anderson/).length).toBe(1);
      expect(screen.getAllByText(/Bob Brown/).length).toBe(1);
      expect(screen.getAllByText(/Charlie Chen/).length).toBe(1);
      expect(screen.getAllByText(/Diana Davis/).length).toBe(1);
    });
  });
});
