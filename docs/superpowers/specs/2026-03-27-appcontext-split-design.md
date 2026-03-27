# AppContext Split — Design Spec

**Date:** 2026-03-27
**Status:** Approved
**Goal:** Split the monolithic AppContext (1887 lines, 48 consumers) into three domain-specific contexts to reduce unnecessary re-renders and improve maintainability.

## Problem

`AppContext.js` holds all application state in a single React context. Any state change — typing in a filter, adding a reading session, switching org — triggers re-renders in every component that calls `useAppContext()`. On older iPads (the primary device), this causes noticeable lag with large student lists.

The context value object has 60+ properties in its `useMemo` dependency array. When any dependency changes, the entire value is recreated.

## Solution: Three Domain Contexts

### 1. AuthContext (`src/contexts/AuthContext.js`, ~300 lines)

**State:**
- `authToken`, `authMode`, `serverAuthModeDetected`, `ssoEnabled`
- `user`, `organization`
- `availableOrganizations`, `activeOrganizationId`, `switchingOrganization`

**Functions:**
- `login`, `logout`, `loginWithEmail`, `register`, `forgotPassword`, `resetPassword`
- `fetchWithAuth` (token-aware fetch wrapper with auto-refresh)
- `fetchAvailableOrganizations`, `switchOrganization`

**Derived (useMemo):**
- `isAuthenticated` (from authToken)
- `userRole` (from user)
- `isMultiTenantMode` (from authMode)
- `canManageUsers`, `canManageStudents`, `canManageClasses`, `canManageSettings` (from userRole)

**Hook:** `useAuth()`

**Re-render trigger:** Login, logout, org switch only. `fetchWithAuth` is a stable `useCallback` — it won't cause consumer re-renders.

**Key implementation detail:** The token refresh logic (refresh promise dedup, 401 handling) stays here since it's tightly coupled to auth state. The `decodeJwtPayload` and `isTokenExpired` helpers move with it.

### 2. DataContext (`src/contexts/DataContext.js`, ~500 lines)

**Depends on:** `useAuth()` for `fetchWithAuth`

**State:**
- `students` (array)
- `classes` (array)
- `books` (array)
- `genres` (array)

**Functions:**
- Students: `addStudent`, `bulkImportStudents`, `updateStudent`, `updateStudentClassId`, `updateStudentCurrentBook`, `deleteStudent`
- Sessions: `addReadingSession`, `editReadingSession`, `deleteReadingSession`
- Books: `addBook`, `findOrCreateBook`, `fetchBookDetails`, `updateBook`, `updateBookField`
- Classes: `addClass`, `updateClass`, `deleteClass`
- Genres: `addGenre`
- Utility: `reloadDataFromServer`, `exportToJson`, `importFromJson`

**Hook:** `useData()`

**Re-render trigger:** When students/classes/books/genres arrays change (CRUD operations). This is the correct behavior — data-dependent components should re-render when data changes.

**Key implementation detail:** `DataProvider` calls `useAuth()` to get `fetchWithAuth`. The initial data load function (`loadAllData`) moves here, triggered by `isAuthenticated` from auth context.

### 3. UIContext (`src/contexts/UIContext.js`, ~400 lines)

**Depends on:** `useAuth()` for `fetchWithAuth`, `useData()` for `students`

**State:**
- `loading`, `apiError`
- `globalClassFilter`
- `settings`, `readingStatusSettings`
- `priorityStudentCount`
- `recentlyAccessedStudents`
- `markedPriorityStudentIds`
- `completedTours`

**Functions:**
- `updateSettings`
- `updateGlobalClassFilter` / `setGlobalClassFilter`
- `updatePriorityStudentCount`, `markStudentAsPriorityHandled`, `resetPriorityList`
- `getReadingStatus` (reads `readingStatusSettings` + student `lastReadDate`)
- `addRecentlyAccessedStudent`
- `markTourComplete`

**Derived (useMemo):**
- `prioritizedStudents` (computed from `students` via `useData()`, `readingStatusSettings`, priority count)

**Hook:** `useUI()`

**Re-render trigger:** Filter changes, settings updates, priority list changes. Isolated from auth and data CRUD.

## Provider Tree

```jsx
// src/App.js
<AuthProvider>
  <DataProvider>
    <UIProvider>
      <AppContent />
    </UIProvider>
  </DataProvider>
</AuthProvider>
```

Auth wraps everything (provides `fetchWithAuth`). Data wraps UI (UI needs `students` for derived values). Components sit inside all three.

## Migration Strategy

### Phase 1: Create contexts + backwards-compatible wrapper

Create the three new context files. Refactor `AppContext.js` into a thin wrapper:

```jsx
// src/contexts/AppContext.js (wrapper — temporary)
export const useAppContext = () => {
  const auth = useAuth();
  const data = useData();
  const ui = useUI();
  return { ...auth, ...data, ...ui };
};

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

This means every existing consumer keeps working with zero changes. The wrapper is less efficient (consumers still get all state) but it's safe.

### Phase 2: Migrate consumers incrementally

Replace `useAppContext()` with specific hooks in each component file:

| Consumer pattern | Hook(s) needed |
|-----------------|----------------|
| Auth-only (Login, UserManagement) | `useAuth()` |
| Data-only (ClassManager, StudentTimeline) | `useData()` + `useAuth()` for fetchWithAuth |
| UI-only (Settings, TourProvider) | `useUI()` + `useAuth()` for fetchWithAuth |
| Mixed (SessionForm, HomeReadingRegister) | `useAuth()` + `useData()` + `useUI()` |

Each component migration is a standalone change: swap the import, destructure from the right hook(s), verify tests pass.

### Phase 3: Remove wrapper

Once all 48 consumers (38 components + 10 test files) are migrated, delete the `useAppContext` wrapper export and the compatibility `AppProvider` wrapper. Clean `AppContext.js` down to just re-exports or delete it entirely.

## Consumer Migration Map

### Auth-only (useAuth)
- `Login.js` — login, loginWithEmail, register, apiError, isMultiTenantMode, serverAuthModeDetected, ssoEnabled
- `DpaConsentModal.js` — fetchWithAuth, user, logout
- `BillingBanner.js` — fetchWithAuth, user
- `BillingDashboard.js` — fetchWithAuth
- `SupportModal.js` — user, fetchWithAuth
- `SupportTicketManager.js` — fetchWithAuth
- `UserManagement.js` — fetchWithAuth, user
- `SchoolManagement.js` — fetchWithAuth
- `AISettings.js` — fetchWithAuth

### Data + Auth (useData + useAuth)
- `StudentDetailDrawer.js` — classes, fetchWithAuth, updateStudent
- `StudentTimeline.js` — books, editReadingSession, deleteReadingSession
- `StudentEditForm.js` — genres, classes, addGenre, fetchWithAuth
- `StudentReadView.js` — genres
- `ClassManager.js` — classes, addClass, updateClass, deleteClass, fetchWithAuth
- `BookAutocomplete.js` — books, findOrCreateBook, fetchWithAuth
- `AddBookModal.js` — findOrCreateBook, fetchWithAuth
- `ScanBookFlow.js` — fetchWithAuth, reloadDataFromServer
- `BookImportWizard.js` — fetchWithAuth, reloadDataFromServer
- `BulkImport.js` — bulkImportStudents, students, classes
- `DataManagement.js` — exportToJson, importFromJson, reloadDataFromServer, fetchWithAuth, canManageUsers, books, user

### UI + Auth (useUI + useAuth)
- `Settings.js` — readingStatusSettings, settings, updateSettings, fetchWithAuth, canManageSettings
- `SettingsPage.js` — canManageUsers, user
- `TourProvider.js` — completedTours, markTourComplete
- `BookMetadataSettings.js` — settings, updateSettings, loading, books, genres, fetchWithAuth, reloadDataFromServer, canManageUsers

### Data + UI (useData + useUI)
- `StudentList.js` — students, loading, apiError, addStudent, classes, globalClassFilter, getReadingStatus, user
- `StudentCard.js` — getReadingStatus, classes
- `StudentTable.js` — getReadingStatus, classes, markStudentAsPriorityHandled, markedPriorityStudentIds
- `PrioritizedStudentsList.js` — getReadingStatus (+ context destructuring for priority state)
- `ReadingStats.js` — students, classes, exportToJson, getReadingStatus, globalClassFilter, fetchWithAuth
- `DaysSinceReadingChart.js` — students, classes, globalClassFilter
- `ReadingTimelineChart.js` — students, classes, globalClassFilter, fetchWithAuth
- `ReadingFrequencyChart.js` — students, classes, globalClassFilter

### All three (useAuth + useData + useUI)
- `Header.js` — classes, globalClassFilter, setGlobalClassFilter, isAuthenticated, logout, user, availableOrganizations, activeOrganizationId, switchOrganization, switchingOrganization, organization
- `App.js` — isAuthenticated
- `SessionForm.js` — students, addReadingSession, classes, recentlyAccessedStudents, books, globalClassFilter, settings, updateBook, fetchBookDetails, genres, fetchWithAuth
- `HomeReadingRegister.js` — students, classes, books, addReadingSession, editReadingSession, deleteReadingSession, updateStudentCurrentBook, globalClassFilter, fetchWithAuth
- `QuickEntry.js` — prioritizedStudents, getReadingStatus, addReadingSession, priorityStudentCount, updatePriorityStudentCount
- `BookManager.js` — books, addBook, updateBook, genres, classes, globalClassFilter, getReadingStatus, fetchWithAuth
- `BookRecommendations.js` — students, classes, books, apiError, fetchWithAuth, globalClassFilter, prioritizedStudents, getReadingStatus, markStudentAsPriorityHandled, updateStudent

## Testing

- Each new context gets its own provider test verifying state and functions
- Existing component tests continue to pass via the wrapper during Phase 2
- Test helpers updated to wrap components in the appropriate providers
- The test setup file (`src/__tests__/setup.js`) provides a `renderWithProviders` helper

## Re-render Impact

| Scenario | Before (all 48 re-render) | After |
|----------|--------------------------|-------|
| Type in class filter | All 48 consumers | ~14 UI consumers |
| Add reading session | All 48 consumers | ~18 Data consumers |
| Login/logout | All 48 consumers | ~9 Auth consumers |
| Update settings | All 48 consumers | ~14 UI consumers |
| Switch org | All 48 consumers | ~9 Auth consumers (then Data reloads) |

## Files Changed

- **New:** `src/contexts/AuthContext.js`, `src/contexts/DataContext.js`, `src/contexts/UIContext.js`
- **Modified:** `src/contexts/AppContext.js` (becomes wrapper, then deleted)
- **Modified:** 38 component files (import changes)
- **Modified:** 10 test files (provider wrapping)
- **Modified:** `src/App.js` (provider tree)
