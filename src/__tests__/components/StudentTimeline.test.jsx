import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StudentTimeline from '../../components/students/StudentTimeline';

// Mock AppContext
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => ({
    books: [
      { id: 'book-1', title: 'The Hobbit', author: 'J.R.R. Tolkien' },
      { id: 'book-2', title: 'Percy Jackson', author: 'Rick Riordan' },
    ],
    editReadingSession: vi.fn(),
    deleteReadingSession: vi.fn(),
  }),
}));

const mockSessions = [
  { id: 's1', date: '2026-03-24', bookId: 'book-1', assessment: 7, location: 'school', notes: 'Good session' },
  { id: 's2', date: '2026-03-22', bookId: 'book-2', assessment: 4, location: 'home', notes: '' },
  { id: 's3', date: '2026-03-18', bookId: 'book-1', assessment: 2, location: 'school', notes: 'Struggled' },
];

describe('StudentTimeline', () => {
  it('renders loading state', () => {
    render(<StudentTimeline sessions={[]} loading={true} studentId="s1" onSessionChange={vi.fn()} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders empty state when no sessions', () => {
    render(<StudentTimeline sessions={[]} loading={false} studentId="s1" onSessionChange={vi.fn()} />);
    expect(screen.getByText(/no reading sessions/i)).toBeInTheDocument();
  });

  it('renders session rows with date, book title, and assessment', () => {
    render(<StudentTimeline sessions={mockSessions} loading={false} studentId="s1" onSessionChange={vi.fn()} />);
    // The Hobbit appears twice (sessions s1 and s3)
    expect(screen.getAllByText('The Hobbit')).toHaveLength(2);
    expect(screen.getByText('Percy Jackson')).toBeInTheDocument();
    expect(screen.getByText('7/10')).toBeInTheDocument();
    expect(screen.getByText('4/10')).toBeInTheDocument();
  });

  it('expands a session row on click to show details', () => {
    render(<StudentTimeline sessions={mockSessions} loading={false} studentId="s1" onSessionChange={vi.fn()} />);
    expect(screen.queryByText('Good session')).not.toBeInTheDocument();
    // Click the first "The Hobbit" (newest session)
    fireEvent.click(screen.getAllByText('The Hobbit')[0]);
    expect(screen.getByText('Good session')).toBeInTheDocument();
  });

  it('filters out absent/no_record sessions', () => {
    const sessionsWithAbsent = [
      ...mockSessions,
      { id: 's4', date: '2026-03-20', bookId: null, assessment: null, notes: '[ABSENT]', location: null },
    ];
    render(<StudentTimeline sessions={sessionsWithAbsent} loading={false} studentId="s1" onSessionChange={vi.fn()} />);
    expect(screen.getAllByText(/\/10/)).toHaveLength(3);
  });
});
