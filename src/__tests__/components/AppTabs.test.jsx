import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
vi.mock('../../contexts/AppContext', () => ({
  AppProvider: ({ children }) => children,
}));
vi.mock('../../components/tour/TourProvider', () => ({
  __esModule: true,
  default: ({ children }) => children,
}));
vi.mock('../../components/sessions/SessionForm', () => ({
  __esModule: true,
  default: () => <div data-testid="session-form">Session Form</div>,
}));
vi.mock('../../components/sessions/HomeReadingRegister', () => ({
  __esModule: true,
  default: () => <div data-testid="home-reading">Home Reading</div>,
}));
vi.mock('../../components/stats/ReadingStats', () => ({
  __esModule: true,
  default: () => <div data-testid="reading-stats">Stats</div>,
}));
vi.mock('../../components/BookRecommendations', () => ({
  __esModule: true,
  default: () => <div data-testid="recommendations">Recommend</div>,
}));
vi.mock('../../components/books/BookManager', () => ({
  __esModule: true,
  default: () => <div data-testid="book-manager">Books</div>,
}));
vi.mock('../../components/SettingsPage', () => ({
  __esModule: true,
  default: () => <div data-testid="settings-page">Settings</div>,
}));
vi.mock('../../components/students/StudentList', () => ({
  __esModule: true,
  default: () => <div data-testid="student-list">Students</div>,
}));
vi.mock('../../components/Header', () => ({
  __esModule: true,
  default: () => <div data-testid="header">Header</div>,
}));
vi.mock('../../components/DpaConsentModal', () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock('../../components/BillingBanner', () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock('../../components/WelcomeDialog', () => ({
  __esModule: true,
  default: () => null,
}));
vi.mock('../../components/ClassAssignmentBanner', () => ({
  __esModule: true,
  default: () => null,
}));

import App from '../../App';

const defaultDataContext = {
  students: [],
  classes: [],
  books: [],
  genres: [],
  settings: {},
  loading: false,
  readingStatusSettings: { recentlyReadDays: 3, needsAttentionDays: 7 },
};

const defaultUIContext = {
  globalClassFilter: 'all',
  setGlobalClassFilter: vi.fn(),
  completedTours: {},
  markTourComplete: vi.fn(),
  prioritizedStudents: [],
  markedPriorityStudentIds: new Set(),
  markStudentAsPriorityHandled: vi.fn(),
  resetPriorityList: vi.fn(),
  priorityStudentCount: 8,
  getReadingStatus: vi.fn(),
  addRecentlyAccessedStudent: vi.fn(),
  recentlyAccessedStudents: [],
  updatePriorityStudentCount: vi.fn(),
};

const createAuthContext = (overrides = {}) => ({
  isAuthenticated: true,
  authToken: 'test-token',
  authMode: 'multitenant',
  serverAuthModeDetected: true,
  user: { name: 'Mrs Jones', role: 'teacher', assignedClassIds: ['c1'] },
  userRole: 'teacher',
  organization: { id: 'org1', name: 'Test School', slug: 'test' },
  apiError: null,
  setApiError: vi.fn(),
  ssoEnabled: false,
  isMultiTenantMode: true,
  canManageUsers: false,
  canManageStudents: true,
  canManageClasses: true,
  canManageSettings: false,
  availableOrganizations: [],
  activeOrganizationId: null,
  switchOrganization: vi.fn(),
  switchingOrganization: false,
  setSwitchingOrganization: vi.fn(),
  fetchAvailableOrganizations: vi.fn(),
  fetchWithAuth: vi.fn(),
  login: vi.fn(),
  loginWithEmail: vi.fn(),
  register: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  logout: vi.fn(),
  ...overrides,
});

const renderApp = (authOverrides = {}) => {
  const auth = createAuthContext(authOverrides);
  return render(
    <TestAuthContext.Provider value={auth}>
      <TestDataContext.Provider value={defaultDataContext}>
        <TestUIContext.Provider value={defaultUIContext}>
          <App />
        </TestUIContext.Provider>
      </TestDataContext.Provider>
    </TestAuthContext.Provider>
  );
};

describe('Role-Based Tab Visibility', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete window.location;
    window.location = { pathname: '/', search: '', href: '/' };
  });

  it('shows 5 tabs for teacher role (no Books or Settings)', async () => {
    renderApp({
      userRole: 'teacher',
      user: { name: 'Mrs Jones', role: 'teacher', assignedClassIds: ['c1'] },
    });
    await waitFor(() => {
      // "Students" appears in both the tab content and the nav label
      expect(screen.getAllByText('Students').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('School Reading')).toBeInTheDocument();
    expect(screen.getByText('Home Reading')).toBeInTheDocument();
    expect(screen.getByText('Stats')).toBeInTheDocument();
    expect(screen.getByText('Recommend')).toBeInTheDocument();
    expect(screen.queryByText('Books')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('shows 5 tabs for readonly role (no Books or Settings)', async () => {
    renderApp({
      userRole: 'readonly',
      user: { name: 'Reader', role: 'readonly', assignedClassIds: [] },
    });
    await waitFor(() => {
      expect(screen.getAllByText('Students').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('School Reading')).toBeInTheDocument();
    expect(screen.getByText('Home Reading')).toBeInTheDocument();
    expect(screen.getByText('Stats')).toBeInTheDocument();
    expect(screen.getByText('Recommend')).toBeInTheDocument();
    expect(screen.queryByText('Books')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('shows 7 tabs for admin role', async () => {
    renderApp({
      userRole: 'admin',
      user: { name: 'Admin', role: 'admin', assignedClassIds: [] },
      canManageUsers: true,
      canManageSettings: true,
    });
    await waitFor(() => {
      expect(screen.getAllByText('Students').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('shows 7 tabs for owner role', async () => {
    renderApp({
      userRole: 'owner',
      user: { name: 'Owner', role: 'owner', assignedClassIds: [] },
      canManageUsers: true,
      canManageSettings: true,
    });
    await waitFor(() => {
      expect(screen.getAllByText('Students').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
