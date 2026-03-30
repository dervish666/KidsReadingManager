# Teacher Onboarding Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the first-time teacher login experience with role-based tab visibility, a welcome dialog, and a class assignment banner.

**Architecture:** Three independent frontend changes in `src/App.js` and two new components. No backend changes. Reuses the existing tour completion API for welcome dialog tracking. All state comes from existing context providers (AuthContext, DataContext, UIContext).

**Tech Stack:** React 19, MUI v7, Vitest + @testing-library/react

**Spec:** `docs/superpowers/specs/2026-03-30-teacher-onboarding-design.md`

---

## Chunk 1: Role-Based Tab Visibility

### Task 1: Role-based tab filtering tests

**Files:**
- Create: `src/__tests__/components/AppTabs.test.jsx`

- [ ] **Step 1: Write tests for role-based tab visibility**

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React, { createContext, useContext } from 'react';

// Create test contexts
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
vi.mock('../../contexts/BookCoverContext', () => ({
  BookCoverProvider: ({ children }) => children,
}));
vi.mock('../tour/TourProvider', () => ({
  __esModule: true,
  default: ({ children }) => children,
}));
// Mock lazy-loaded components to avoid loading full component trees
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

// Import after mocks
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
    // Mock window.location for standalone page checks
    delete window.location;
    window.location = { pathname: '/', search: '', href: '/' };
  });

  it('shows 5 tabs for teacher role (no Books or Settings)', async () => {
    renderApp({ userRole: 'teacher', user: { name: 'Mrs Jones', role: 'teacher', assignedClassIds: ['c1'] } });

    await waitFor(() => {
      expect(screen.getByText('Students')).toBeInTheDocument();
    });
    expect(screen.getByText('School Reading')).toBeInTheDocument();
    expect(screen.getByText('Home Reading')).toBeInTheDocument();
    expect(screen.getByText('Stats')).toBeInTheDocument();
    expect(screen.getByText('Recommend')).toBeInTheDocument();
    expect(screen.queryByText('Books')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('shows 5 tabs for readonly role (no Books or Settings)', async () => {
    renderApp({ userRole: 'readonly', user: { name: 'Reader', role: 'readonly', assignedClassIds: [] } });

    await waitFor(() => {
      expect(screen.getByText('Students')).toBeInTheDocument();
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
      expect(screen.getByText('Students')).toBeInTheDocument();
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
      expect(screen.getByText('Students')).toBeInTheDocument();
    });
    expect(screen.getByText('Books')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/components/AppTabs.test.jsx`
Expected: FAIL — App.js still renders all 7 tabs for all roles.

### Task 2: Implement role-based tab filtering in App.js

**Files:**
- Modify: `src/App.js`

- [ ] **Step 3: Refactor App.js to use a filtered visibleTabs array**

In `AppContent`, replace the hardcoded `BottomNavigation` actions and `renderTabContent` switch with a data-driven `visibleTabs` array. The key changes:

1. Add `useMemo` to the React import: `import React, { useState, Suspense, useMemo } from 'react';`
2. Read `userRole` from `useAuth()` (already imported).
3. Define `ALL_TABS` array with `{ key, label, icon, Component, adminOnly }` entries. **Store Component references, not JSX elements** — this avoids stale closures in memoized arrays.
4. Compute `visibleTabs` by filtering out `adminOnly` entries for teacher/readonly roles.
5. Clamp `currentTab` if it exceeds `visibleTabs.length - 1`.
6. Render via `React.createElement(visibleTabs[safeTab].Component)` inside `Suspense`.
7. Replace hardcoded `BottomNavigationAction` elements with `visibleTabs.map(...)`.

```jsx
// Add useMemo to React import at top of file:
import React, { useState, Suspense, useMemo } from 'react';

// In AppContent, after existing hooks:
const { isAuthenticated, userRole } = useAuth();

// Define all tabs — store Component references, not JSX elements.
// adminOnly tabs hidden for teacher/readonly.
const ALL_TABS = useMemo(() => [
  { key: 'students', label: 'Students', icon: iconStudents, Component: StudentList, adminOnly: false },
  { key: 'school-reading', label: 'School Reading', icon: iconReading, Component: SessionForm, adminOnly: false },
  { key: 'home-reading', label: 'Home Reading', icon: iconRecord, Component: HomeReadingRegister, adminOnly: false },
  { key: 'stats', label: 'Stats', icon: iconStats, Component: ReadingStats, adminOnly: false },
  { key: 'recommend', label: 'Recommend', icon: iconRecommend, Component: BookRecommendations, adminOnly: false },
  { key: 'books', label: 'Books', icon: iconBooks, Component: BookManager, adminOnly: true },
  { key: 'settings', label: 'Settings', icon: null, Component: SettingsPage, adminOnly: true },
], []);

const visibleTabs = useMemo(() => {
  const isAdmin = userRole === 'owner' || userRole === 'admin';
  return isAdmin ? ALL_TABS : ALL_TABS.filter(t => !t.adminOnly);
}, [ALL_TABS, userRole]);

// Clamp currentTab to valid range
const safeTab = currentTab >= visibleTabs.length ? 0 : currentTab;
const ActiveTab = visibleTabs[safeTab].Component;
```

Replace the `renderTabContent` function and its call site:
```jsx
// Remove the old renderTabContent switch — replace with:
<Suspense fallback={...}>
  <ActiveTab />
</Suspense>
```

Replace the hardcoded `BottomNavigationAction` elements:
```jsx
<BottomNavigation
  value={safeTab}
  onChange={(event, newValue) => setCurrentTab(newValue)}
  showLabels
  ...
>
  {visibleTabs.map((tab, index) => (
    <BottomNavigationAction
      key={tab.key}
      label={tab.label}
      icon={tab.icon ? (
        <NavIcon src={tab.icon} alt={tab.label} selected={safeTab === index} />
      ) : (
        <SettingsIcon />
      )}
    />
  ))}
</BottomNavigation>
```

**Header contract change:** Pass the tab label as a string instead of an index. In `App.js`:
```jsx
<Header currentTab={visibleTabs[safeTab]?.label || 'Students'} />
```

In `Header.js`, the `currentTab` prop is now a string label. Update the `SupportModal` usage:
```jsx
// Replace:
currentPage={TAB_NAMES[currentTab] || 'Unknown'}
// With:
currentPage={currentTab}
```

Remove the `TAB_NAMES` constant from `Header.js` since it's no longer used. No other code references `TAB_NAMES` (verify with grep before removing).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/components/AppTabs.test.jsx`
Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npm test`
Expected: All tests pass. Watch for failures in Header-related tests if any exist.

- [ ] **Step 6: Commit**

```bash
git add src/App.js src/components/Header.js src/__tests__/components/AppTabs.test.jsx
git commit -m "feat: role-based tab visibility — hide Books and Settings for teachers"
```

---

## Chunk 2: Class Assignment Banner

### Task 3: ClassAssignmentBanner tests

**Files:**
- Create: `src/__tests__/components/ClassAssignmentBanner.test.jsx`

- [ ] **Step 7: Write tests for ClassAssignmentBanner**

```jsx
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
```

- [ ] **Step 8: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/components/ClassAssignmentBanner.test.jsx`
Expected: FAIL — component doesn't exist yet.

### Task 4: Implement ClassAssignmentBanner

**Files:**
- Create: `src/components/ClassAssignmentBanner.js`

- [ ] **Step 9: Create ClassAssignmentBanner component**

```jsx
import { useState } from 'react';
import { Alert, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useAuth } from '../contexts/AuthContext';

const hasNoClasses = (user) =>
  !user?.assignedClassIds || user.assignedClassIds.length === 0;

export default function ClassAssignmentBanner() {
  const { user } = useAuth();

  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem('classAssignmentBannerDismissed') === 'true';
    } catch {
      return false;
    }
  });

  // Only show for teachers with no classes
  if (!user || user.role !== 'teacher' || !hasNoClasses(user) || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('classAssignmentBannerDismissed', 'true');
    } catch {
      // ignore
    }
  };

  return (
    <Alert
      severity="warning"
      sx={{ mb: 2 }}
      action={
        <IconButton
          aria-label="close"
          color="inherit"
          size="small"
          onClick={handleDismiss}
        >
          <CloseIcon fontSize="inherit" />
        </IconButton>
      }
    >
      Your classes haven&apos;t been linked yet — this usually resolves overnight, or ask your school
      administrator.
    </Alert>
  );
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/components/ClassAssignmentBanner.test.jsx`
Expected: PASS — all 8 tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/components/ClassAssignmentBanner.js src/__tests__/components/ClassAssignmentBanner.test.jsx
git commit -m "feat: class assignment banner for teachers with no linked classes"
```

---

## Chunk 3: Welcome Dialog

### Task 5: WelcomeDialog tests

**Files:**
- Create: `src/__tests__/components/WelcomeDialog.test.jsx`

- [ ] **Step 12: Write tests for WelcomeDialog**

```jsx
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

    // Year 3 Oak sorts before Year 4 Elm, so should be shown even though c2 is first in the array
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
```

- [ ] **Step 13: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/components/WelcomeDialog.test.jsx`
Expected: FAIL — component doesn't exist yet.

### Task 6: Implement WelcomeDialog

**Files:**
- Create: `src/components/WelcomeDialog.js`

- [ ] **Step 14: Create WelcomeDialog component**

Build the component following the approved mockup style. Key details:

- Use MUI `Dialog` with `maxWidth="xs"` and `fullWidth`.
- Read `user` from `useAuth()`, `classes`, `students`, `loading` from `useData()`, `completedTours`, `markTourComplete` from `useUI()`.
- Helper: `const hasClasses = user?.assignedClassIds?.length > 0`.
- Resolve first assigned class: sort assigned classes alphabetically by name, take first.
- Count students: `students.filter(s => s.classId === firstClass.id).length`.
- Multi-class text: if `assignedClassIds.length > 1`, show "(and N other/others)".
- Green card for happy path (background `rgba(107, 142, 107, 0.08)`, border `rgba(107, 142, 107, 0.2)`).
- Amber card for no-class (background `rgba(210, 160, 60, 0.08)`, border `rgba(210, 160, 60, 0.25)`).
- "Here's what you can do" bullets with emoji icons.
- "Get Started" button calls `markTourComplete('welcome', 1)` and sets local `open` state to false.
- Guard: return null if `loading`, or `completedTours.welcome`, or `!user`, or role is not `teacher`. (Readonly onboarding is a non-goal per spec.)

```jsx
import { useState, useMemo } from 'react';
import { Dialog, DialogContent, Box, Typography, Button } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';
import { useUI } from '../contexts/UIContext';
import TallyLogo from './TallyLogo';

const WELCOME_VERSION = 1;

export default function WelcomeDialog() {
  const { user } = useAuth();
  const { classes, students, loading } = useData();
  const { completedTours, markTourComplete } = useUI();
  const [open, setOpen] = useState(true);

  const hasClasses = user?.assignedClassIds?.length > 0;

  // Resolve assigned class info
  const classInfo = useMemo(() => {
    if (!hasClasses || !classes.length) return null;
    const assignedClasses = classes
      .filter((c) => user.assignedClassIds.includes(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!assignedClasses.length) return null;
    const first = assignedClasses[0];
    const studentCount = students.filter((s) => s.classId === first.id).length;
    const othersCount = assignedClasses.length - 1;
    return { name: first.name, studentCount, othersCount };
  }, [hasClasses, classes, students, user?.assignedClassIds]);

  // Don't show if: data loading, already completed, no user, or not a teacher
  // (Readonly onboarding is a non-goal per spec)
  if (loading || completedTours.welcome || !user || user.role !== 'teacher' || !open) {
    return null;
  }

  const handleGetStarted = () => {
    markTourComplete('welcome', WELCOME_VERSION);
    setOpen(false);
  };

  return (
    <Dialog open maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px', p: 0 } }}>
      <DialogContent sx={{ textAlign: 'center', p: { xs: 3, sm: 5 }, pt: { xs: 4, sm: 5 } }}>
        {/* Logo */}
        <Box
          sx={{
            background: 'linear-gradient(135deg, #8AAD8A, #6B8E6B)',
            width: 56,
            height: 56,
            borderRadius: '14px',
            mx: 'auto',
            mb: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(107, 142, 107, 0.35)',
          }}
        >
          <TallyLogo size={28} />
        </Box>

        <Typography
          variant="h5"
          sx={{ fontFamily: '"Nunito", sans-serif', fontWeight: 800, color: 'text.primary', mb: 0.5 }}
        >
          Welcome to Tally Reading!
        </Typography>

        <Typography sx={{ color: 'text.secondary', mb: 3 }}>
          Hello {user.name} — {hasClasses ? "you're all set up." : 'nearly there.'}
        </Typography>

        {/* Class info or warning card */}
        {hasClasses && classInfo ? (
          <Box
            sx={{
              background: 'rgba(107, 142, 107, 0.08)',
              border: '1px solid rgba(107, 142, 107, 0.2)',
              borderRadius: '12px',
              p: 2,
              mb: 3,
              textAlign: 'left',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography sx={{ fontSize: '1.2rem' }}>🏫</Typography>
              <Typography sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.95rem' }}>
                {classInfo.name}
              </Typography>
              {classInfo.othersCount > 0 && (
                <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
                  (and {classInfo.othersCount} other{classInfo.othersCount > 1 ? 's' : ''})
                </Typography>
              )}
              <Box
                sx={{
                  background: 'rgba(107, 142, 107, 0.15)',
                  color: 'primary.main',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  px: 1,
                  py: 0.25,
                  borderRadius: '6px',
                  ml: 'auto',
                }}
              >
                {classInfo.studentCount} student{classInfo.studentCount !== 1 ? 's' : ''}
              </Box>
            </Box>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
              Your class filter has been set automatically. You can change it any time from the header.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              background: 'rgba(210, 160, 60, 0.08)',
              border: '1px solid rgba(210, 160, 60, 0.25)',
              borderRadius: '12px',
              p: 2,
              mb: 3,
              textAlign: 'left',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography sx={{ fontSize: '1.2rem' }}>⚠️</Typography>
              <Typography sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.95rem' }}>
                No classes linked yet
              </Typography>
            </Box>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem', mb: 1 }}>
              Your classes haven&apos;t been connected to your account yet. This usually resolves
              automatically overnight, or your school administrator can set it up.
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>
              In the meantime, you can browse all students in the school.
            </Typography>
          </Box>
        )}

        {/* What you can do */}
        <Box sx={{ textAlign: 'left', mb: 3.5 }}>
          <Typography sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.85rem', mb: 1.5 }}>
            Here&apos;s what you can do:
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[
              ['📖', 'Record school and home reading sessions'],
              ['📊', 'Track progress with reading stats'],
              ['💡', 'Get personalised book recommendations'],
            ].map(([icon, text]) => (
              <Box key={text} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Typography sx={{ fontSize: '1rem' }}>{icon}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>{text}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* CTA */}
        <Button
          fullWidth
          variant="contained"
          size="large"
          onClick={handleGetStarted}
          sx={{
            height: 48,
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #8AAD8A, #6B8E6B)',
            boxShadow: '0 6px 20px rgba(107, 142, 107, 0.35)',
            fontSize: '1rem',
            fontWeight: 700,
            textTransform: 'none',
          }}
        >
          Get Started
        </Button>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 15: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/components/WelcomeDialog.test.jsx`
Expected: PASS — all 10 tests pass.

- [ ] **Step 16: Commit**

```bash
git add src/components/WelcomeDialog.js src/__tests__/components/WelcomeDialog.test.jsx
git commit -m "feat: welcome dialog for first-time teacher login"
```

---

## Chunk 4: Wire Up and Final Integration

### Task 7: Add new components to App.js

**Files:**
- Modify: `src/App.js`

- [ ] **Step 17: Import and render WelcomeDialog and ClassAssignmentBanner in AppContent**

Add imports at top of `src/App.js`:
```jsx
import WelcomeDialog from './components/WelcomeDialog';
import ClassAssignmentBanner from './components/ClassAssignmentBanner';
```

In `AppContent`, render them after `BillingBanner` (outside the `Container`, matching `BillingBanner`'s placement — both span full width above the content area):
```jsx
<BillingBanner />
<ClassAssignmentBanner />
<WelcomeDialog />
```

- [ ] **Step 18: Run full test suite**

Run: `npm test`
Expected: All tests pass (existing + new).

- [ ] **Step 19: Build to verify no compilation errors**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 20: Commit**

```bash
git add src/App.js
git commit -m "feat: wire up WelcomeDialog and ClassAssignmentBanner in App"
```

### Task 8: Manual verification

- [ ] **Step 21: Run dev server and verify visually**

Run: `npm run start:dev`

Verify:
1. Log in as owner — should see all 7 tabs
2. If possible, test with a teacher account (MyLogin SSO) — should see 5 tabs + welcome dialog
3. Verify welcome dialog dismisses and doesn't reappear on page refresh
4. Verify class assignment banner shows if teacher has no classes
5. Verify banner dismisses with X and stays hidden for the session

- [ ] **Step 22: Final commit with version bump if all looks good**

```bash
# Update version in package.json, then:
git add package.json package-lock.json
git commit -m "chore: bump version to v3.33.0"
```
