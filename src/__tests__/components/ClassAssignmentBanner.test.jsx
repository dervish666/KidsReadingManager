import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { createContext, useContext } from 'react';

const TestAuthContext = createContext();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => useContext(TestAuthContext),
}));

import ClassAssignmentBanner from '../../components/ClassAssignmentBanner';

const createWrapper = (user) => ({ children }) => (
  <TestAuthContext.Provider value={{ user }}>
    {children}
  </TestAuthContext.Provider>
);

describe('ClassAssignmentBanner', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('shows banner for teacher with no assigned classes (empty array)', () => {
    render(<ClassAssignmentBanner />, {
      wrapper: createWrapper({ role: 'teacher', assignedClassIds: [] }),
    });
    expect(screen.getByText(/classes haven't been linked/i)).toBeInTheDocument();
  });

  it('shows banner for teacher with undefined assignedClassIds', () => {
    render(<ClassAssignmentBanner />, {
      wrapper: createWrapper({ role: 'teacher' }),
    });
    expect(screen.getByText(/classes haven't been linked/i)).toBeInTheDocument();
  });

  it('shows banner for teacher with null assignedClassIds', () => {
    render(<ClassAssignmentBanner />, {
      wrapper: createWrapper({ role: 'teacher', assignedClassIds: null }),
    });
    expect(screen.getByText(/classes haven't been linked/i)).toBeInTheDocument();
  });

  it('hides banner for teacher with assigned classes', () => {
    render(<ClassAssignmentBanner />, {
      wrapper: createWrapper({ role: 'teacher', assignedClassIds: ['c1'] }),
    });
    expect(screen.queryByText(/classes haven't been linked/i)).not.toBeInTheDocument();
  });

  it('hides banner for admin with no classes', () => {
    render(<ClassAssignmentBanner />, {
      wrapper: createWrapper({ role: 'admin', assignedClassIds: [] }),
    });
    expect(screen.queryByText(/classes haven't been linked/i)).not.toBeInTheDocument();
  });

  it('hides banner for owner with no classes', () => {
    render(<ClassAssignmentBanner />, {
      wrapper: createWrapper({ role: 'owner', assignedClassIds: [] }),
    });
    expect(screen.queryByText(/classes haven't been linked/i)).not.toBeInTheDocument();
  });

  it('can be dismissed and stays hidden for the session', () => {
    render(<ClassAssignmentBanner />, {
      wrapper: createWrapper({ role: 'teacher', assignedClassIds: [] }),
    });
    expect(screen.getByText(/classes haven't been linked/i)).toBeInTheDocument();
    const closeButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeButton);
    expect(screen.queryByText(/classes haven't been linked/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem('classAssignmentBannerDismissed')).toBe('true');
  });

  it('stays hidden when sessionStorage has dismissal flag', () => {
    sessionStorage.setItem('classAssignmentBannerDismissed', 'true');
    render(<ClassAssignmentBanner />, {
      wrapper: createWrapper({ role: 'teacher', assignedClassIds: [] }),
    });
    expect(screen.queryByText(/classes haven't been linked/i)).not.toBeInTheDocument();
  });

  it('unmounts when assignedClassIds transitions from empty to populated', () => {
    const { rerender } = render(<ClassAssignmentBanner />, {
      wrapper: createWrapper({ role: 'teacher', assignedClassIds: [] }),
    });
    expect(screen.getByText(/classes haven't been linked/i)).toBeInTheDocument();
    rerender(
      <TestAuthContext.Provider value={{ user: { role: 'teacher', assignedClassIds: ['c1'] } }}>
        <ClassAssignmentBanner />
      </TestAuthContext.Provider>
    );
    expect(screen.queryByText(/classes haven't been linked/i)).not.toBeInTheDocument();
  });
});
