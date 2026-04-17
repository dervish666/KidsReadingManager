import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import StudentInfoCard from '../../components/sessions/StudentInfoCard';

describe('StudentInfoCard', () => {
  const mockStudent = {
    id: 'student-1',
    name: 'Alice',
    readingLevelMin: 12,
    readingLevelMax: 14,
    currentStreak: 5,
    lastReadDate: '2026-01-30',
    totalSessionCount: 3,
  };

  it('displays reading level range', () => {
    render(<StudentInfoCard student={mockStudent} />);
    expect(screen.getByText(/Level 12-14/)).toBeInTheDocument();
  });

  it('displays current streak', () => {
    render(<StudentInfoCard student={mockStudent} />);
    expect(screen.getByText(/5 days streak/)).toBeInTheDocument();
  });

  it('displays last read date', () => {
    render(<StudentInfoCard student={mockStudent} />);
    expect(screen.getByText(/Last read:/)).toBeInTheDocument();
  });

  it('shows empty state when no sessions and no reading level', () => {
    const newStudent = {
      ...mockStudent,
      currentStreak: 0,
      readingLevelMin: null,
      readingLevelMax: null,
      totalSessionCount: 0,
      lastReadDate: null,
    };
    render(<StudentInfoCard student={newStudent} />);
    expect(screen.getByText(/No reading history/)).toBeInTheDocument();
  });

  it('shows reading level when no sessions but level exists', () => {
    const studentWithLevel = {
      ...mockStudent,
      currentStreak: 0,
      totalSessionCount: 0,
      lastReadDate: null,
    };
    render(<StudentInfoCard student={studentWithLevel} />);
    expect(screen.getByText(/Level 12-14/)).toBeInTheDocument();
    expect(screen.queryByText(/No reading history/)).not.toBeInTheDocument();
  });

  it('handles missing reading level gracefully', () => {
    const studentNoLevel = { ...mockStudent, readingLevelMin: null, readingLevelMax: null };
    render(<StudentInfoCard student={studentNoLevel} />);
    expect(screen.queryByText(/Level/)).not.toBeInTheDocument();
  });

  it('has accessible region with student name', () => {
    render(<StudentInfoCard student={mockStudent} />);
    const region = screen.getByRole('region', { name: /Reading information for Alice/i });
    expect(region).toBeInTheDocument();
  });

  it('has accessible region in empty state', () => {
    const newStudent = {
      ...mockStudent,
      name: 'Bob',
      currentStreak: 0,
      readingLevelMin: null,
      readingLevelMax: null,
      totalSessionCount: 0,
      lastReadDate: null,
    };
    render(<StudentInfoCard student={newStudent} />);
    const region = screen.getByRole('region', { name: /Reading information for Bob/i });
    expect(region).toBeInTheDocument();
  });
});
