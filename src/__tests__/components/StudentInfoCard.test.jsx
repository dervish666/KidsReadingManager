import React, { createContext, useContext } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create a test context to mock AppContext
const TestAppContext = createContext();

// Mock the AppContext module
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => useContext(TestAppContext)
}));

import StudentInfoCard from '../../components/sessions/StudentInfoCard';

const createWrapper = (contextValue) => {
  return ({ children }) => (
    <TestAppContext.Provider value={contextValue}>
      {children}
    </TestAppContext.Provider>
  );
};

// Helper: create a fetchWithAuth that returns sessions for any student/:id/sessions URL
const createMockFetchWithAuth = (sessions = []) => {
  return vi.fn().mockImplementation((url) => {
    if (url.includes('/sessions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(sessions)
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve([]) });
  });
};

describe('StudentInfoCard', () => {
  const mockSessions = [
    { id: 's1', date: '2026-01-30', bookId: 'b1', bookTitle: 'The BFG', assessment: 'independent' },
    { id: 's2', date: '2026-01-28', bookId: 'b2', bookTitle: "Charlotte's Web", assessment: 'independent' },
    { id: 's3', date: '2026-01-25', bookId: 'b3', bookTitle: 'Matilda', assessment: 'independent' },
  ];

  const mockStudent = {
    id: 'student-1',
    name: 'Alice',
    readingLevelMin: 12,
    readingLevelMax: 14,
    currentStreak: 5,
    lastReadDate: '2026-01-30',
    totalSessionCount: 3,
  };

  it('displays reading level range', async () => {
    const wrapper = createWrapper({ fetchWithAuth: createMockFetchWithAuth(mockSessions) });
    render(<StudentInfoCard student={mockStudent} />, { wrapper });
    expect(screen.getByText(/Level 12-14/)).toBeInTheDocument();
  });

  it('displays current streak', async () => {
    const wrapper = createWrapper({ fetchWithAuth: createMockFetchWithAuth(mockSessions) });
    render(<StudentInfoCard student={mockStudent} />, { wrapper });
    expect(screen.getByText(/5 days/)).toBeInTheDocument();
  });

  it('displays last read date', async () => {
    const wrapper = createWrapper({ fetchWithAuth: createMockFetchWithAuth(mockSessions) });
    render(<StudentInfoCard student={mockStudent} />, { wrapper });
    expect(screen.getByText(/Last read:/)).toBeInTheDocument();
  });

  it('displays recent book titles', async () => {
    const wrapper = createWrapper({ fetchWithAuth: createMockFetchWithAuth(mockSessions) });
    render(<StudentInfoCard student={mockStudent} />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('The BFG')).toBeInTheDocument();
      expect(screen.getByText("Charlotte's Web")).toBeInTheDocument();
    });
  });

  it('shows empty state when no sessions and no reading level', async () => {
    const newStudent = { ...mockStudent, currentStreak: 0, readingLevelMin: null, readingLevelMax: null, totalSessionCount: 0, lastReadDate: null };
    const wrapper = createWrapper({ fetchWithAuth: createMockFetchWithAuth([]) });
    render(<StudentInfoCard student={newStudent} />, { wrapper });
    expect(screen.getByText(/No reading history/)).toBeInTheDocument();
  });

  it('shows reading level when no sessions but level exists', async () => {
    const studentWithLevel = { ...mockStudent, currentStreak: 0, totalSessionCount: 0, lastReadDate: null };
    const wrapper = createWrapper({ fetchWithAuth: createMockFetchWithAuth([]) });
    render(<StudentInfoCard student={studentWithLevel} />, { wrapper });
    expect(screen.getByText(/Level 12-14/)).toBeInTheDocument();
    expect(screen.queryByText(/No reading history/)).not.toBeInTheDocument();
  });

  it('handles missing reading level gracefully', async () => {
    const studentNoLevel = { ...mockStudent, readingLevelMin: null, readingLevelMax: null };
    const wrapper = createWrapper({ fetchWithAuth: createMockFetchWithAuth(mockSessions) });
    render(<StudentInfoCard student={studentNoLevel} />, { wrapper });
    expect(screen.queryByText(/Level/)).not.toBeInTheDocument();
  });

  it('has accessible region with student name', async () => {
    const wrapper = createWrapper({ fetchWithAuth: createMockFetchWithAuth(mockSessions) });
    render(<StudentInfoCard student={mockStudent} />, { wrapper });
    const region = screen.getByRole('region', { name: /Reading information for Alice/i });
    expect(region).toBeInTheDocument();
  });

  it('has accessible region in empty state', async () => {
    const newStudent = { ...mockStudent, name: 'Bob', currentStreak: 0, readingLevelMin: null, readingLevelMax: null, totalSessionCount: 0, lastReadDate: null };
    const wrapper = createWrapper({ fetchWithAuth: createMockFetchWithAuth([]) });
    render(<StudentInfoCard student={newStudent} />, { wrapper });
    const region = screen.getByRole('region', { name: /Reading information for Bob/i });
    expect(region).toBeInTheDocument();
  });
});
