import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { createContext, useContext } from 'react';

const TestAuthContext = createContext();
const TestDataContext = createContext();
const TestUIContext = createContext();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => useContext(TestAuthContext),
}));
vi.mock('../../contexts/DataContext', () => ({
  useData: () => useContext(TestDataContext),
}));
vi.mock('../../contexts/UIContext', () => ({
  useUI: () => useContext(TestUIContext),
}));

import WelcomeDialog from '../../components/WelcomeDialog';

const defaultData = {
  classes: [
    { id: 'c1', name: 'Year 3 Oak', disabled: false },
    { id: 'c2', name: 'Year 4 Elm', disabled: false },
  ],
  students: [
    { id: 's1', classId: 'c1' },
    { id: 's2', classId: 'c1' },
    { id: 's3', classId: 'c2' },
  ],
  loading: false,
};

const defaultUI = {
  completedTours: {},
  markTourComplete: vi.fn(),
};

const createWrapper = (auth, data = defaultData, ui = defaultUI) => ({ children }) => (
  <TestAuthContext.Provider value={auth}>
    <TestDataContext.Provider value={data}>
      <TestUIContext.Provider value={ui}>
        {children}
      </TestUIContext.Provider>
    </TestDataContext.Provider>
  </TestAuthContext.Provider>
);

describe('WelcomeDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders happy path when teacher has assigned classes', () => {
    const auth = { user: { name: 'Mrs Jones', role: 'teacher', assignedClassIds: ['c1'] } };
    render(<WelcomeDialog />, { wrapper: createWrapper(auth) });
    expect(screen.getByText('Welcome to Tally Reading!')).toBeInTheDocument();
    expect(screen.getByText(/you're all set up/i)).toBeInTheDocument();
    expect(screen.getByText('Year 3 Oak')).toBeInTheDocument();
    expect(screen.getByText(/2 students/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
  });

  it('shows multiple classes info when teacher has more than one class', () => {
    const auth = { user: { name: 'Mrs Jones', role: 'teacher', assignedClassIds: ['c1', 'c2'] } };
    render(<WelcomeDialog />, { wrapper: createWrapper(auth) });
    expect(screen.getByText('Year 3 Oak')).toBeInTheDocument();
    expect(screen.getByText(/and 1 other/i)).toBeInTheDocument();
  });

  it('renders no-class fallback when assignedClassIds is empty', () => {
    const auth = { user: { name: 'Mrs Jones', role: 'teacher', assignedClassIds: [] } };
    render(<WelcomeDialog />, { wrapper: createWrapper(auth) });
    expect(screen.getByText('Welcome to Tally Reading!')).toBeInTheDocument();
    expect(screen.getByText(/nearly there/i)).toBeInTheDocument();
    expect(screen.getByText(/classes haven't been connected/i)).toBeInTheDocument();
  });

  it('renders no-class fallback when assignedClassIds is undefined', () => {
    const auth = { user: { name: 'Mrs Jones', role: 'teacher' } };
    render(<WelcomeDialog />, { wrapper: createWrapper(auth) });
    expect(screen.getByText(/nearly there/i)).toBeInTheDocument();
  });

  it('does not render when welcome tour is already completed', () => {
    const auth = { user: { name: 'Mrs Jones', role: 'teacher', assignedClassIds: ['c1'] } };
    const ui = { completedTours: { welcome: 1 }, markTourComplete: vi.fn() };
    render(<WelcomeDialog />, { wrapper: createWrapper(auth, defaultData, ui) });
    expect(screen.queryByText('Welcome to Tally Reading!')).not.toBeInTheDocument();
  });

  it('does not render when data is still loading', () => {
    const auth = { user: { name: 'Mrs Jones', role: 'teacher', assignedClassIds: ['c1'] } };
    const data = { ...defaultData, loading: true };
    render(<WelcomeDialog />, { wrapper: createWrapper(auth, data) });
    expect(screen.queryByText('Welcome to Tally Reading!')).not.toBeInTheDocument();
  });

  it('does not render for admin users', () => {
    const auth = { user: { name: 'Admin', role: 'admin', assignedClassIds: [] } };
    render(<WelcomeDialog />, { wrapper: createWrapper(auth) });
    expect(screen.queryByText('Welcome to Tally Reading!')).not.toBeInTheDocument();
  });

  it('does not render for readonly users (readonly onboarding is a non-goal)', () => {
    const auth = { user: { name: 'Reader', role: 'readonly', assignedClassIds: [] } };
    render(<WelcomeDialog />, { wrapper: createWrapper(auth) });
    expect(screen.queryByText('Welcome to Tally Reading!')).not.toBeInTheDocument();
  });

  it('sorts classes alphabetically and shows first', () => {
    const auth = { user: { name: 'Mrs Jones', role: 'teacher', assignedClassIds: ['c2', 'c1'] } };
    render(<WelcomeDialog />, { wrapper: createWrapper(auth) });
    expect(screen.getByText('Year 3 Oak')).toBeInTheDocument();
  });

  it('calls markTourComplete on Get Started click', () => {
    const markTourComplete = vi.fn();
    const auth = { user: { name: 'Mrs Jones', role: 'teacher', assignedClassIds: ['c1'] } };
    const ui = { completedTours: {}, markTourComplete };
    render(<WelcomeDialog />, { wrapper: createWrapper(auth, defaultData, ui) });
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));
    expect(markTourComplete).toHaveBeenCalledWith('welcome', 1);
  });
});
