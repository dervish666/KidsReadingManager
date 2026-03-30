# Teacher Onboarding Design

**Date**: 2026-03-30
**Status**: Approved

## Summary

Improve the first-time teacher login experience with three changes: role-based tab visibility (hide admin-only tabs), a welcome dialog on first login (with class assignment context), and a persistent banner when class assignments are missing.

## Goals

- Teachers see only the tabs they can use — no dead-end Settings or Books management
- First login orients the teacher: who they are, which class, what they can do
- Missing class assignments are surfaced clearly with warm, non-alarming messaging
- No new database tables or API endpoints — reuse existing infrastructure

## Non-Goals

- Login page SSO prominence (polish item, separate work)
- Cryptic Wonde error messages (polish item, separate work)
- Books tab read-only browse mode for teachers (future consideration)
- Admin or owner onboarding flows
- Readonly user onboarding

## Design

### 1. Role-Based Tab Visibility

The bottom nav in `App.js` currently shows all 7 tabs to all users. Teachers and readonly users should see 5 tabs.

**Tab visibility by role:**

| Tab | Owner | Admin | Teacher | Readonly |
|-----|-------|-------|---------|----------|
| Students | yes | yes | yes | yes |
| School Reading | yes | yes | yes | yes |
| Home Reading | yes | yes | yes | yes |
| Stats | yes | yes | yes | yes |
| Recommend | yes | yes | yes | yes |
| Books | yes | yes | no | no |
| Settings | yes | yes | no | no |

**Implementation:**

- In `AppContent` (`src/App.js`), build a `visibleTabs` array filtered by `userRole` from `useAuth()`.
- Each tab entry is an object: `{ key, label, icon, component }`.
- `BottomNavigation` maps over `visibleTabs` instead of hardcoded `BottomNavigationAction` elements.
- `renderTabContent` indexes into `visibleTabs[currentTab].component` instead of a switch statement.
- The lazy imports for `BookManager` and `SettingsPage` are kept — they just won't render for teachers/readonly.

**Edge cases:**

- If `currentTab` exceeds the filtered array length (e.g. teacher had tab 6 in state somehow), clamp to 0 (Students).
- No backend changes needed — the API already returns 403 for unauthorized actions. This is purely a frontend visibility change.
- Deep links or bookmarks to hidden tabs: not applicable since the app uses tab indices, not URL routing.

### 2. Welcome Dialog

A one-time dialog shown on a teacher's first login, providing context about their setup.

**Trigger:** Shown when the `welcome` tour has not been completed for the current user. Reuses the existing `user_tour_completions` table and tour tracking infrastructure — no new table needed.

**Timing:** Renders after `DataContext` has loaded (classes and students are available). Same lifecycle as existing guided tours. The dialog is rendered in `AppContent` alongside `DpaConsentModal` and `BillingBanner`.

**Two variants based on `user.assignedClassIds`:**

#### A — Classes Assigned (happy path)

- Greeting: "Welcome to Tally Reading!"
- Subtext: "Hello {name} — you're all set up."
- Green info card showing:
  - Class name (first assigned class, alphabetically)
  - Student count for that class
  - "Your class filter has been set automatically. You can change it any time from the header."
  - If multiple classes: show first class name + "(and N others)"
- "Here's what you can do" section with 3 bullets:
  - Record school and home reading sessions
  - Track progress with reading stats
  - Get personalised book recommendations
- "Get Started" button

#### B — No Classes Assigned (fallback)

- Greeting: "Welcome to Tally Reading!"
- Subtext: "Hello {name} — nearly there."
- Amber warning card:
  - "No classes linked yet"
  - "Your classes haven't been connected to your account yet. This usually resolves automatically overnight, or your school administrator can set it up."
  - "In the meantime, you can browse all students in the school."
- Same "Here's what you can do" section
- "Get Started" button

**On dismiss:** Clicking "Get Started" calls `markTourComplete('welcome', 1)` from `useUI()` and closes the dialog. The existing guided tours then fire as normal.

**Data sources — all from existing context:**

- `user.name` — from `useAuth()`
- `user.assignedClassIds` — from `useAuth()` (in JWT payload)
- `classes` — from `useData()` (to resolve class names)
- `students` — from `useData()` (to count students in the assigned class)

**New component:** `src/components/WelcomeDialog.js`

**Style:** Matches the existing app aesthetic — cream background, sage green accents, rounded corners, warm shadows. Follows the mockups approved during brainstorming (saved in `.superpowers/brainstorm/`).

### 3. Class Assignment Banner

A persistent banner for teachers with zero assigned classes, shown below the header on every visit until classes are assigned.

**Component:** `src/components/ClassAssignmentBanner.js`

**Condition:** Shows when `user.role === 'teacher'` and `user.assignedClassIds` is empty or missing.

**Content:** Single line, amber/warm tint: "Your classes haven't been linked yet — this usually resolves overnight, or ask your school administrator."

**Behaviour:**

- Dismissible via X button — stores dismissal in `sessionStorage` (key: `classAssignmentBannerDismissed`)
- Reappears on next login (sessionStorage clears between sessions)
- Disappears permanently once classes are assigned — the condition is reactive. If a token refresh returns populated `assignedClassIds`, the banner unmounts.
- Rendered in `AppContent` below `BillingBanner`

**No backend changes.** The `assignedClassIds` data is already in the JWT payload, refreshed on each login via `syncUserClassAssignments`.

## Files Changed

| File | Change |
|------|--------|
| `src/App.js` | Role-filtered `visibleTabs` array, render `WelcomeDialog` and `ClassAssignmentBanner` |
| `src/components/WelcomeDialog.js` | New component — first-login welcome dialog |
| `src/components/ClassAssignmentBanner.js` | New component — persistent no-class banner |
| `src/components/tour/tourSteps.js` | Add `welcome` tour entry (version 1, no steps — just used for completion tracking) |

## Files NOT Changed

- No backend route changes
- No database migrations
- No new API endpoints
- No changes to `AuthContext`, `DataContext`, or `UIContext`
- No changes to `mylogin.js` callback flow

## Testing

- Unit test: `WelcomeDialog` renders happy path when `assignedClassIds` is populated
- Unit test: `WelcomeDialog` renders no-class variant when `assignedClassIds` is empty
- Unit test: `WelcomeDialog` does not render when `welcome` tour is already completed
- Unit test: `ClassAssignmentBanner` shows for teachers with no classes
- Unit test: `ClassAssignmentBanner` hides for teachers with classes
- Unit test: `ClassAssignmentBanner` hides for admins/owners regardless
- Unit test: `ClassAssignmentBanner` respects sessionStorage dismissal
- Unit test: Bottom nav shows 5 tabs for teacher role
- Unit test: Bottom nav shows 7 tabs for admin/owner role
- Manual test: Full SSO login flow with a test teacher account
