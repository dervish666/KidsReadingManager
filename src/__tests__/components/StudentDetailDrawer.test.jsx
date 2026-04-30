// src/__tests__/components/StudentDetailDrawer.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import StudentDetailDrawer from '../../components/students/StudentDetailDrawer';

const mockFetchWithAuth = vi.fn();

// Mock AuthContext (StudentDetailDrawer uses useAuth for fetchWithAuth)
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    fetchWithAuth: mockFetchWithAuth,
  }),
}));

// Mock DataContext (StudentDetailDrawer uses useData for classes, updateStudent)
vi.mock('../../contexts/DataContext', () => ({
  useData: () => ({
    classes: [{ id: 'c1', name: '8A/Gg' }],
    updateStudent: vi.fn(),
  }),
}));

// Mock child components to simplify drawer tests
vi.mock('../../components/students/StudentReadView', () => ({
  default: ({ student }) => <div data-testid="student-read-view">{student?.name}</div>,
}));
vi.mock('../../components/students/StudentEditForm', () => ({
  default: React.forwardRef((_props, _ref) => <div data-testid="student-edit-form" />),
}));
vi.mock('../../components/students/StudentTimeline', () => ({
  default: ({ sessions, loading }) => (
    <div data-testid="student-timeline">
      {loading ? 'Loading...' : `${sessions?.length || 0} sessions`}
    </div>
  ),
}));
vi.mock('../../components/students/StreakBadge', () => ({
  default: ({ streak }) => <span data-testid="streak-badge">{streak}</span>,
}));

const mockStudent = {
  id: 's1',
  name: 'Aaron Orange',
  classId: 'c1',
  currentStreak: 5,
  dateOfBirth: '2014-06-15',
  gender: 'MALE',
};

const mockFullResponse = {
  id: 's1',
  name: 'Aaron Orange',
  classId: 'c1',
  dateOfBirth: '2014-06-15',
  gender: 'MALE',
  firstLanguage: 'English',
  ealDetailedStatus: 'Not applicable',
  currentStreak: 5,
  longestStreak: 12,
  lastReadDate: '2026-03-24',
  readingLevelMin: 3.2,
  readingLevelMax: 5.8,
  totalSessionCount: 14,
  preferences: { favoriteGenreIds: ['g1'], likes: ['The Hobbit'], dislikes: [] },
  readingSessions: [
    { id: 'sess1', date: '2026-03-24', bookId: 'b1', assessment: 7, location: 'school', notes: '' },
  ],
};

describe('StudentDetailDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithAuth.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockFullResponse),
    });
  });

  it('renders student name in header when open', async () => {
    render(<StudentDetailDrawer open={true} student={mockStudent} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Aaron Orange')).toBeInTheDocument();
    });
  });

  it('renders demographic chips after fetch', async () => {
    render(<StudentDetailDrawer open={true} student={mockStudent} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/years/)).toBeInTheDocument();
      expect(screen.getByText(/Male/i)).toBeInTheDocument();
    });
  });

  it('does not render content when closed', () => {
    render(<StudentDetailDrawer open={false} student={mockStudent} onClose={vi.fn()} />);
    expect(screen.queryByText('Aaron Orange')).not.toBeInTheDocument();
  });

  it('fetches full student data on open', async () => {
    render(<StudentDetailDrawer open={true} student={mockStudent} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/students/s1',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  it('shows error alert when fetch fails', async () => {
    mockFetchWithAuth.mockResolvedValue({ ok: false });
    render(<StudentDetailDrawer open={true} student={mockStudent} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/could not load/i)).toBeInTheDocument();
    });
  });
});
