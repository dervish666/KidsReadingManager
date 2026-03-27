# AppContext Split Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic 1888-line AppContext into three domain-specific contexts (Auth, Data, UI) with a backwards-compatible wrapper for incremental migration.

**Architecture:** Three nested context providers (Auth > Data > UI) with a thin AppContext wrapper that composes all three so existing consumers keep working unchanged. Each context owns its own state, effects, and API calls. `fetchWithAuth` lives in AuthContext and is consumed by the other two via `useAuth()`.

**Tech Stack:** React 19 contexts, plain JS (no TypeScript), Vitest for testing

**Spec:** `docs/superpowers/specs/2026-03-27-appcontext-split-design.md`

---

## Chunk 1: Create AuthContext and backwards-compatible wrapper

### Task 1: Create AuthContext.js

**Files:**
- Create: `src/contexts/AuthContext.js`

- [ ] **Step 1: Create AuthContext with all auth state and functions**

Create `src/contexts/AuthContext.js` by extracting the following from `src/contexts/AppContext.js`:

**Constants to move:** `API_URL`, `AUTH_STORAGE_KEY`, `USER_STORAGE_KEY`, `AUTH_MODE_KEY`

**Helper functions to move:** `decodeJwtPayload`, `isTokenExpired`

**State to move (lines in current AppContext):**
- `authToken` (line 66-73)
- `authMode` (line 56-63)
- `serverAuthModeDetected` (line 51)
- `ssoEnabled` (line 53)
- `user` (line 76-84)
- `apiError` (line 48) — shared: auth sets it, UI reads it. Auth owns it since login errors set it. Expose `setApiError` for Data/UI to call.
- `availableOrganizations` (line 126)
- `activeOrganizationId` (line 128)
- `switchingOrganization` (line 132)

**Refs to move:**
- `authTokenRef` (line 87-88)
- `refreshingToken` (line 91)
- `activeOrgIdRef` (line 129-130)

**Functions to move:**
- `clearAuthState` (lines 312-327)
- `refreshAccessToken` (lines 263-309)
- `fetchWithAuth` (lines 330-383) — needs `authMode`, `authTokenRef`, `refreshAccessToken`, `clearAuthState`, `user`, `activeOrgIdRef`, `setApiError`
- `login` (lines 386-434)
- `loginWithEmail` (lines 437-488)
- `register` (lines 491-544)
- `forgotPassword` (lines 547-570)
- `resetPassword` (lines 573-596)
- `fetchAvailableOrganizations` (lines 599-614)
- `logout` (lines 617-667)

**Effects to move:**
- Auth mode detection (lines 156-259) — `detectAuthMode` + SSO callback handling
- Fetch available organizations (lines 841-845) — triggered by `user` changes

**Derived values:**
- `isAuthenticated` = `!!authToken`
- `isMultiTenantMode` = `authMode === 'multitenant'`
- `userRole` = `user?.role || null`
- `organization` = useMemo from `user`, `activeOrganizationId`, `availableOrganizations` (lines 855-872)
- `canManageUsers` = `userRole === 'owner' || userRole === 'admin'`
- `canManageStudents` = `userRole !== 'readonly'`
- `canManageClasses` = `userRole !== 'readonly'`
- `canManageSettings` = `userRole === 'owner' || userRole === 'admin'`

**Provider value shape:**
```js
const value = useMemo(() => ({
  // State
  apiError, setApiError,
  user, authMode, serverAuthModeDetected, ssoEnabled,
  availableOrganizations, activeOrganizationId, switchingOrganization,
  // Functions
  login, logout, loginWithEmail, register, forgotPassword, resetPassword,
  fetchWithAuth, fetchAvailableOrganizations, switchOrganization,
  // Derived
  isAuthenticated, isMultiTenantMode, userRole, organization,
  canManageUsers, canManageStudents, canManageClasses, canManageSettings,
}), [/* all deps */]);
```

**Hook:**
```js
const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);
export const AuthProvider = ({ children }) => { /* ... */ };
```

**Note:** `switchOrganization` currently calls `reloadDataFromServer` — for now, accept the function via a callback ref that DataContext will set after mounting. Alternative: emit a custom event that DataContext listens to. Simplest approach: `switchOrganization` just updates org ID/state, and DataContext has a `useEffect` on `activeOrganizationId` that triggers reload.

Revised approach for `switchOrganization`:
```js
const switchOrganization = useCallback(async (orgId) => {
  if (user?.role !== 'owner') return;
  setSwitchingOrganization(true);
  activeOrgIdRef.current = orgId;
  setActiveOrganizationId(orgId);
  // DataContext watches activeOrganizationId and reloads automatically
  // setSwitchingOrganization(false) will be called by DataContext after reload
}, [user]);
```

DataContext will expose `setSwitchingOrganization` back to AuthContext via a callback, OR AuthContext exposes `setSwitchingOrganization` and DataContext calls it. Simplest: AuthContext exposes both `switchingOrganization` and `setSwitchingOrganization` in its value — DataContext calls `setSwitchingOrganization(false)` after reload completes.

- [ ] **Step 2: Verify AuthContext file compiles**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds (AuthContext not yet wired in)

- [ ] **Step 3: Commit**

```bash
git add src/contexts/AuthContext.js
git commit -m "feat: create AuthContext — extract auth state from AppContext"
```

---

### Task 2: Create DataContext.js

**Files:**
- Create: `src/contexts/DataContext.js`

- [ ] **Step 1: Create DataContext with all data state and CRUD functions**

Create `src/contexts/DataContext.js` extracting from `src/contexts/AppContext.js`:

**Dependencies:** Calls `useAuth()` to get `fetchWithAuth`, `setApiError`, `activeOrganizationId`, `setSwitchingOrganization`

**State to move:**
- `students` (line 44)
- `classes` (line 111)
- `books` (line 122)
- `genres` (line 124)
- `loading` (line 46) — data loading state
- `hasLoadedData` ref (line 94)

**Functions to move:**
- `reloadDataFromServer` (lines 670-756) — the big parallel fetch. Uses `fetchWithAuth` from auth. Sets `students`, `classes`, `books`, `genres`, `loading`. Also sets `settings`/`readingStatusSettings` — these will need to call into UI context. Simplest: return settings from the function and let the caller (UIContext or an effect) handle them.

Revised: `reloadDataFromServer` returns the full loaded data. It sets its own state (students/classes/books/genres) and returns `{ settings, readingStatusSettings }` so UIContext can update. Or simpler: it just loads everything itself including settings, and UIContext reads settings from DataContext. Actually — settings are UI domain. Let's keep it simple:

`reloadDataFromServer` fetches everything, sets students/classes/books/genres directly, and returns `{ settings }`. The initial-load effect in DataContext calls this and passes settings to UIContext via a shared setter.

Simpler still: DataContext loads students/classes/books/genres/settings all at once (as it does now). Settings state lives in UIContext but gets initialized from the data load. We solve this by having DataContext pass an `onDataLoaded` callback that UIContext provides.

**Simplest approach:** DataContext owns the initial data load. It fetches everything including settings. For settings, it calls `setSettings` and `setReadingStatusSettings` which UIContext exposes via a ref/callback. OR: DataContext stores raw settings in its own state, and UIContext reads them via `useData()`.

**Final decision:** DataContext fetches and stores `settings` temporarily, UIContext reads it from DataContext on mount and takes ownership. This avoids circular deps.

Actually, the cleanest: **DataContext includes `settings` in its scope** since it loads them from the server alongside other data. UIContext derives its reading-status logic from `settings` it gets via `useData()`. This means:
- `settings`, `readingStatusSettings` live in DataContext (they're loaded from server, updated via API)
- `updateSettings` lives in DataContext
- UIContext reads `readingStatusSettings` from DataContext for `getReadingStatus`

This is a refinement from the original spec but makes the data flow cleaner. Settings are data (fetched from API, persisted to API), not UI state.

**Revised state for DataContext:**
- `students`, `classes`, `books`, `genres` (data arrays)
- `settings`, `readingStatusSettings` (server-persisted config)
- `loading` (data loading flag)

**Functions to move:**
- Student CRUD: `addStudent` (882-918), `bulkImportStudents` (920-994), `updateStudent` (1038-1070), `updateStudentClassId` (996-1036), `updateStudentCurrentBook` (1097-1159), `deleteStudent` (1072-1095)
- Session CRUD: `addReadingSession` (1296-1354), `editReadingSession` (1356-1401), `deleteReadingSession` (1403-1431)
- Book CRUD: `addBook` (1213-1252), `findOrCreateBook` (1255-1276), `fetchBookDetails` (1279-1293), `updateBook` (1162-1202), `updateBookField` (1204-1210)
- Class CRUD: `addClass` (1517-1552), `updateClass` (1554-1592), `deleteClass` (1594-1623)
- Genre: `addGenre` (1480-1514)
- Settings: `updateSettings` (1434-1477)
- Utility: `reloadDataFromServer` (670-756), `exportToJson` (1703-1728), `importFromJson` (1730-1768)

**Effects to move:**
- Initial data load (lines 827-838) — triggered by `isAuthenticated` from auth
- Fetch tour status call removed from here (goes to UIContext)

**Auto-reload on org switch:**
```js
// Watch for org switch and reload data
const prevOrgRef = useRef(activeOrganizationId);
useEffect(() => {
  if (activeOrganizationId !== prevOrgRef.current) {
    prevOrgRef.current = activeOrganizationId;
    if (activeOrganizationId && isAuthenticated) {
      // Clear and reload
      setStudents([]);
      setClasses([]);
      setBooks([]);
      setGenres([]);
      setSettings({});
      reloadDataFromServer().finally(() => setSwitchingOrganization(false));
    }
  }
}, [activeOrganizationId, isAuthenticated, reloadDataFromServer, setSwitchingOrganization]);
```

**Provider value shape:**
```js
const value = useMemo(() => ({
  students, classes, books, genres, loading,
  settings, readingStatusSettings,
  addStudent, bulkImportStudents, updateStudent, updateStudentClassId,
  updateStudentCurrentBook, deleteStudent,
  addReadingSession, editReadingSession, deleteReadingSession,
  addBook, findOrCreateBook, fetchBookDetails, updateBook, updateBookField,
  addClass, updateClass, deleteClass,
  addGenre, updateSettings,
  reloadDataFromServer, exportToJson, importFromJson,
}), [/* all deps */]);
```

**Hook:**
```js
const DataContext = createContext();
export const useData = () => useContext(DataContext);
export const DataProvider = ({ children }) => { /* ... */ };
```

- [ ] **Step 2: Verify DataContext file compiles**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/contexts/DataContext.js
git commit -m "feat: create DataContext — extract data state and CRUD from AppContext"
```

---

### Task 3: Create UIContext.js

**Files:**
- Create: `src/contexts/UIContext.js`

- [ ] **Step 1: Create UIContext with UI/filter/priority state**

Create `src/contexts/UIContext.js` extracting from `src/contexts/AppContext.js`:

**Dependencies:** Calls `useAuth()` for `fetchWithAuth`, `apiError`. Calls `useData()` for `students`, `readingStatusSettings`.

**State to move:**
- `globalClassFilter` (line 113-120)
- `priorityStudentCount` (line 97)
- `recentlyAccessedStudents` (lines 134-142)
- `markedPriorityStudentIds` (lines 145-153)
- `completedTours` (line 108)

**Functions to move:**
- `updateGlobalClassFilter` (lines 1771-1780)
- `updatePriorityStudentCount` (lines 1687-1689)
- `getReadingStatus` (lines 1626-1645) — reads `readingStatusSettings` from DataContext
- `addRecentlyAccessedStudent` (lines 1648-1663)
- `markStudentAsPriorityHandled` (lines 1666-1676)
- `resetPriorityList` (lines 1679-1684)
- `markTourComplete` (lines 778-789) — calls `fetchWithAuth`
- `fetchTourStatus` (lines 759-773) — calls `fetchWithAuth`

**Derived:**
- `prioritizedStudents` (lines 1692-1700) — reads `students` from DataContext

**Effects to move:**
- Fetch tour status on auth (currently embedded in the initial load effect at line 832)

**Provider value shape:**
```js
const value = useMemo(() => ({
  globalClassFilter, setGlobalClassFilter: updateGlobalClassFilter,
  priorityStudentCount, updatePriorityStudentCount,
  recentlyAccessedStudents, addRecentlyAccessedStudent,
  markedPriorityStudentIds, markStudentAsPriorityHandled, resetPriorityList,
  completedTours, markTourComplete,
  getReadingStatus, prioritizedStudents,
}), [/* all deps */]);
```

**Hook:**
```js
const UIContext = createContext();
export const useUI = () => useContext(UIContext);
export const UIProvider = ({ children }) => { /* ... */ };
```

- [ ] **Step 2: Verify UIContext file compiles**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/contexts/UIContext.js
git commit -m "feat: create UIContext — extract UI/filter/priority state from AppContext"
```

---

### Task 4: Refactor AppContext into backwards-compatible wrapper

**Files:**
- Modify: `src/contexts/AppContext.js` (replace 1888 lines with ~40-line wrapper)
- Modify: `src/App.js` (update provider tree)

- [ ] **Step 1: Replace AppContext.js with thin wrapper**

Replace the entire contents of `src/contexts/AppContext.js` with:

```js
import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { DataProvider, useData } from './DataContext';
import { UIProvider, useUI } from './UIContext';

// Backwards-compatible wrapper — composes all three contexts into a single hook.
// Consumers can gradually migrate to useAuth/useData/useUI directly.
export const useAppContext = () => {
  const auth = useAuth();
  const data = useData();
  const ui = useUI();
  return { ...auth, ...data, ...ui };
};

// Composite provider — nests Auth > Data > UI
export const AppProvider = ({ children }) => (
  <AuthProvider>
    <DataProvider>
      <UIProvider>
        {children}
      </UIProvider>
    </DataProvider>
  </AuthProvider>
);
```

- [ ] **Step 2: Update App.js provider tree**

In `src/App.js`, the import stays the same (`import { AppProvider, useAppContext } from './contexts/AppContext'`). The `AppProvider` now internally nests the three providers, so no changes needed in App.js.

Verify that `BookCoverProvider` and `TourProvider` still wrap correctly inside the composite provider.

- [ ] **Step 3: Run build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run 2>&1 | tail -10`
Expected: All 1703 tests pass. Tests mock `useAppContext` which still exists and works identically.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AppContext.js src/App.js
git commit -m "refactor: replace AppContext with backwards-compatible wrapper over Auth/Data/UI contexts"
```

---

## Chunk 2: Migrate consumers to domain-specific hooks

### Task 5: Migrate auth-only consumers (9 files)

**Files to modify:**
- `src/components/Login.js`
- `src/components/DpaConsentModal.js`
- `src/components/BillingBanner.js`
- `src/components/BillingDashboard.js`
- `src/components/SupportModal.js`
- `src/components/SupportTicketManager.js`
- `src/components/UserManagement.js`
- `src/components/SchoolManagement.js`
- `src/components/AISettings.js`

- [ ] **Step 1: Update imports and hooks in each file**

For each file, change:
```js
// Before
import { useAppContext } from '../contexts/AppContext';
// ...
const { fetchWithAuth, user, ... } = useAppContext();

// After
import { useAuth } from '../contexts/AuthContext';
// ...
const { fetchWithAuth, user, ... } = useAuth();
```

**Login.js** destructures: `login, loginWithEmail, register, apiError, isMultiTenantMode, serverAuthModeDetected, ssoEnabled` — all auth.

**DpaConsentModal.js**: `fetchWithAuth, user, logout` — all auth.

**BillingBanner.js**: `fetchWithAuth, user` — all auth.

**BillingDashboard.js**: `fetchWithAuth` — auth only.

**SupportModal.js**: `user, fetchWithAuth` — auth only.

**SupportTicketManager.js**: `fetchWithAuth` — auth only.

**UserManagement.js**: `fetchWithAuth, user` — auth only.

**SchoolManagement.js**: `fetchWithAuth` — auth only.

**AISettings.js**: `fetchWithAuth` — auth only.

- [ ] **Step 2: Run tests**

Run: `npx vitest run 2>&1 | tail -10`
Expected: All tests pass. Tests that mock `useAppContext` still work for non-migrated components.

- [ ] **Step 3: Commit**

```bash
git add src/components/Login.js src/components/DpaConsentModal.js src/components/BillingBanner.js src/components/BillingDashboard.js src/components/SupportModal.js src/components/SupportTicketManager.js src/components/UserManagement.js src/components/SchoolManagement.js src/components/AISettings.js
git commit -m "refactor: migrate 9 auth-only consumers to useAuth()"
```

---

### Task 6: Migrate data+auth consumers (11 files)

**Files to modify:**
- `src/components/students/StudentDetailDrawer.js`
- `src/components/students/StudentTimeline.js`
- `src/components/students/StudentEditForm.js`
- `src/components/students/StudentReadView.js`
- `src/components/classes/ClassManager.js`
- `src/components/sessions/BookAutocomplete.js`
- `src/components/books/AddBookModal.js`
- `src/components/books/ScanBookFlow.js`
- `src/components/books/BookImportWizard.js`
- `src/components/students/BulkImport.js`
- `src/components/DataManagement.js`

- [ ] **Step 1: Update imports in each file**

Pattern for files needing both auth and data:
```js
import { useAuth } from '../../contexts/AuthContext';
import { useData } from '../../contexts/DataContext';
// ...
const { fetchWithAuth } = useAuth();
const { classes, updateStudent } = useData();
```

Files needing only data (no fetchWithAuth): `StudentReadView.js` (just `genres`), `BulkImport.js` (just `bulkImportStudents, students, classes`) — these use `useData()` only.

**DataManagement.js** also needs `canManageUsers, user` from auth and `books` from data — use both hooks.

- [ ] **Step 2: Run tests**

Run: `npx vitest run 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/students/StudentDetailDrawer.js src/components/students/StudentTimeline.js src/components/students/StudentEditForm.js src/components/students/StudentReadView.js src/components/classes/ClassManager.js src/components/sessions/BookAutocomplete.js src/components/books/AddBookModal.js src/components/books/ScanBookFlow.js src/components/books/BookImportWizard.js src/components/students/BulkImport.js src/components/DataManagement.js
git commit -m "refactor: migrate 11 data consumers to useData() + useAuth()"
```

---

### Task 7: Migrate UI consumers and mixed consumers (18 files)

**Files to modify:**
- `src/components/Settings.js`
- `src/components/SettingsPage.js`
- `src/components/tour/TourProvider.js`
- `src/components/BookMetadataSettings.js`
- `src/components/students/StudentList.js`
- `src/components/students/StudentCard.js`
- `src/components/students/StudentTable.js`
- `src/components/students/PrioritizedStudentsList.js`
- `src/components/stats/ReadingStats.js`
- `src/components/stats/DaysSinceReadingChart.js`
- `src/components/stats/ReadingTimelineChart.js`
- `src/components/stats/ReadingFrequencyChart.js`
- `src/components/Header.js`
- `src/App.js`
- `src/components/sessions/SessionForm.js`
- `src/components/sessions/HomeReadingRegister.js`
- `src/components/sessions/QuickEntry.js`
- `src/components/books/BookManager.js`
- `src/components/BookRecommendations.js`

- [ ] **Step 1: Update imports — UI-only consumers**

**Settings.js**: `useData()` for `readingStatusSettings, settings, updateSettings` + `useAuth()` for `fetchWithAuth, canManageSettings`

**SettingsPage.js**: `useAuth()` for `canManageUsers, user`

**TourProvider.js**: `useUI()` for `completedTours, markTourComplete`

**BookMetadataSettings.js**: `useData()` for `settings, updateSettings, loading, books, genres, reloadDataFromServer` + `useAuth()` for `fetchWithAuth, canManageUsers`

- [ ] **Step 2: Update imports — data+UI consumers**

**StudentList.js**: `useData()` for `students, loading, addStudent, classes` + `useUI()` for `globalClassFilter, getReadingStatus` + `useAuth()` for `user, apiError`

**StudentCard.js**: `useData()` for `classes` + `useUI()` for `getReadingStatus`

**StudentTable.js**: `useData()` for `classes` + `useUI()` for `getReadingStatus, markStudentAsPriorityHandled, markedPriorityStudentIds`

**PrioritizedStudentsList.js**: `useUI()` for `getReadingStatus` + rest from useData/useUI as needed

**Stats components** (ReadingStats, DaysSinceReadingChart, ReadingTimelineChart, ReadingFrequencyChart): `useData()` for `students, classes` + `useUI()` for `globalClassFilter` + `useAuth()` for `fetchWithAuth` where needed

- [ ] **Step 3: Update imports — triple-context consumers**

**Header.js**: `useAuth()` for auth/org, `useData()` for `classes`, `useUI()` for `globalClassFilter, setGlobalClassFilter`

**App.js**: `useAuth()` for `isAuthenticated`

**SessionForm.js**: `useAuth()` for `fetchWithAuth`, `useData()` for `students, books, genres, addReadingSession, updateBook, fetchBookDetails, settings`, `useUI()` for `globalClassFilter, recentlyAccessedStudents`

**HomeReadingRegister.js**: `useAuth()` for `fetchWithAuth`, `useData()` for `students, classes, books, addReadingSession, editReadingSession, deleteReadingSession, updateStudentCurrentBook`, `useUI()` for `globalClassFilter`

**QuickEntry.js**: `useData()` for `addReadingSession`, `useUI()` for `prioritizedStudents, getReadingStatus, priorityStudentCount, updatePriorityStudentCount`

**BookManager.js**: `useAuth()` for `fetchWithAuth`, `useData()` for `books, addBook, updateBook, genres, classes`, `useUI()` for `globalClassFilter, getReadingStatus`

**BookRecommendations.js**: `useAuth()` for `fetchWithAuth, apiError`, `useData()` for `students, classes, books, updateStudent`, `useUI()` for `globalClassFilter, prioritizedStudents, getReadingStatus, markStudentAsPriorityHandled`

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run 2>&1 | tail -10`
Expected: All 1703 tests pass.

- [ ] **Step 5: Run build**

Run: `npm run build 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/Settings.js src/components/SettingsPage.js src/components/tour/TourProvider.js src/components/BookMetadataSettings.js src/components/students/StudentList.js src/components/students/StudentCard.js src/components/students/StudentTable.js src/components/students/PrioritizedStudentsList.js src/components/stats/ReadingStats.js src/components/stats/DaysSinceReadingChart.js src/components/stats/ReadingTimelineChart.js src/components/stats/ReadingFrequencyChart.js src/components/Header.js src/App.js src/components/sessions/SessionForm.js src/components/sessions/HomeReadingRegister.js src/components/sessions/QuickEntry.js src/components/books/BookManager.js src/components/BookRecommendations.js
git commit -m "refactor: migrate 19 remaining consumers to domain-specific hooks"
```

---

## Chunk 3: Update tests and clean up

### Task 8: Update test mocks to use domain-specific hooks

**Files to modify:**
- `src/__tests__/components/BookManager.test.jsx`
- `src/__tests__/components/StudentDetailDrawer.test.jsx`
- `src/__tests__/components/SessionForm.test.jsx`
- `src/__tests__/components/StudentTimeline.test.jsx`
- `src/__tests__/components/Login.test.jsx`
- `src/__tests__/components/HomeReadingRegister.test.jsx`
- `src/__tests__/components/BookRecommendations.test.jsx`
- `src/__tests__/components/StudentTable.test.jsx`

- [ ] **Step 1: Update test mocks**

Tests currently mock `../../contexts/AppContext`. After migration, components import from specific contexts. Update mocks to match:

```js
// Before
vi.mock('../../contexts/AppContext', () => ({
  useAppContext: () => ({ fetchWithAuth, students, ... })
}));

// After — mock the specific context(s) the component imports
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ fetchWithAuth: mockFetchWithAuth })
}));
vi.mock('../../contexts/DataContext', () => ({
  useData: () => ({ students: mockStudents, ... })
}));
vi.mock('../../contexts/UIContext', () => ({
  useUI: () => ({ getReadingStatus: mockGetReadingStatus, ... })
}));
```

Each test file mocks only the contexts its component uses.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run 2>&1 | tail -10`
Expected: All 1703 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/
git commit -m "test: update test mocks for domain-specific context hooks"
```

---

### Task 9: Remove backwards-compatible wrapper

**Files:**
- Modify: `src/contexts/AppContext.js` — remove `useAppContext` export, keep only `AppProvider`

- [ ] **Step 1: Verify no remaining useAppContext imports**

Run: `grep -r "useAppContext" src/components/ src/App.js --include="*.js" --include="*.jsx" | grep -v node_modules | grep -v __tests__`

Expected: No results (all consumers migrated).

- [ ] **Step 2: Simplify AppContext.js**

Reduce to just the composite provider (no more `useAppContext` export):

```js
import React from 'react';
import { AuthProvider } from './AuthContext';
import { DataProvider } from './DataContext';
import { UIProvider } from './UIContext';

// Re-export hooks for convenience
export { useAuth } from './AuthContext';
export { useData } from './DataContext';
export { useUI } from './UIContext';

// Composite provider — nests Auth > Data > UI
export const AppProvider = ({ children }) => (
  <AuthProvider>
    <DataProvider>
      <UIProvider>
        {children}
      </UIProvider>
    </DataProvider>
  </AuthProvider>
);
```

- [ ] **Step 3: Verify no remaining useAppContext in tests**

Run: `grep -r "useAppContext" src/__tests__/ --include="*.jsx" --include="*.js"`

Expected: No results. If any remain, update them.

- [ ] **Step 4: Run full test suite + build**

Run: `npm run build 2>&1 | tail -5 && npx vitest run 2>&1 | tail -10`
Expected: Build succeeds, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AppContext.js
git commit -m "refactor: remove useAppContext wrapper — migration complete"
```

---

### Task 10: Update CLAUDE.md and structure files

**Files:**
- Modify: `CLAUDE.md` — update context section
- Modify: `.claude/structure/contexts-hooks.yaml` — update context descriptions

- [ ] **Step 1: Update CLAUDE.md**

In the **Frontend Architecture** section, update the State Management paragraph:

```markdown
**State Management**: Three domain-specific contexts replace the former single `AppContext`:
- `AuthContext` (`src/contexts/AuthContext.js`) — auth tokens, user, login/logout, fetchWithAuth, permissions, org switching
- `DataContext` (`src/contexts/DataContext.js`) — students, classes, books, genres, settings, all CRUD operations
- `UIContext` (`src/contexts/UIContext.js`) — class filter, priority list, reading status, tours

Hooks: `useAuth()`, `useData()`, `useUI()`. The composite `AppProvider` in `src/contexts/AppContext.js` nests all three.
```

- [ ] **Step 2: Update File Map**

Add to the file map:
```
src/contexts/AuthContext.js - Auth state, tokens, fetchWithAuth, login/logout, permissions
src/contexts/DataContext.js - Students, classes, books, genres, settings, CRUD operations
src/contexts/UIContext.js - Class filter, priority list, reading status, tours
src/contexts/AppContext.js - Composite provider, re-exports useAuth/useData/useUI
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md .claude/structure/contexts-hooks.yaml
git commit -m "docs: update CLAUDE.md for three-context architecture"
```
