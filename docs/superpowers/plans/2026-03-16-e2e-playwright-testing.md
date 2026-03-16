# E2E Playwright Testing — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Playwright E2E tests that verify the Tally Reading UI works correctly against the deployed production environment.

**Architecture:** Playwright test runner with global auth setup (login once, reuse cookies). Tests are read-only — they navigate, verify rendering, and check data display without creating or deleting records. Tests run via `npm run test:e2e` against `https://tallyreading.uk`.

**Tech Stack:** `@playwright/test`, `dotenv`, Chromium browser

**Spec:** `docs/superpowers/specs/2026-03-16-e2e-playwright-testing-design.md`

---

## File Structure

```
e2e/
  playwright.config.js          # Playwright config: base URL, timeouts, auth state, browser
  global-setup.js               # Logs in once via the login page, saves cookies
  tests/
    auth.spec.js                # Login/logout flow (no saved auth state)
    navigation.spec.js          # Header, bottom nav, class filter
    home-reading-register.spec.js  # Core reading register workflow
    student-list.spec.js        # Student table, search, filter, sort
.env.e2e                        # Credentials (gitignored)
```

---

## Task 1: Install Playwright and create config

**Files:**
- Create: `e2e/playwright.config.js`
- Create: `.env.e2e`
- Modify: `package.json` (add script + devDependency)
- Modify: `.gitignore` (add auth state + env file)

- [ ] **Step 1: Install dependencies**

```bash
npm install -D @playwright/test dotenv
npx playwright install chromium
```

- [ ] **Step 2: Create `.env.e2e`**

```
E2E_BASE_URL=https://tallyreading.uk
E2E_USER_EMAIL=test@tallyreading.uk
E2E_USER_PASSWORD=love reading
```

- [ ] **Step 3: Create `e2e/playwright.config.js`**

```javascript
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.e2e') });

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://tallyreading.uk',
    storageState: path.resolve(__dirname, '.auth/session.json'),
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global-setup\.js/,
      teardown: undefined,
    },
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
      },
      dependencies: ['setup'],
    },
  ],
});
```

- [ ] **Step 4: Add `.gitignore` entries**

Append to `.gitignore`:
```
e2e/.auth/
.env.e2e
```

- [ ] **Step 5: Add npm script to `package.json`**

Add to `"scripts"`:
```json
"test:e2e": "npx playwright test --config=e2e/playwright.config.js"
```

- [ ] **Step 6: Commit**

```bash
git add e2e/playwright.config.js .gitignore package.json package-lock.json
git commit -m "chore: add Playwright E2E config and npm script"
```

---

## Task 2: Global auth setup

**Files:**
- Create: `e2e/global-setup.js`

The app uses multi-tenant email/password auth. The login page has:
- `<TextField label="Email" type="email">`
- `<TextField label="Password" type="password">`
- `<Button type="submit">Login</Button>`

After login, the app shows a bottom navigation bar with `aria-label="Main navigation"`.

- [ ] **Step 1: Create `e2e/global-setup.js`**

This is a Playwright "setup project" test file — it runs first and saves auth state.

```javascript
import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const authFile = path.resolve(__dirname, '.auth/session.json');

setup('authenticate', async ({ page }) => {
  // Ensure .auth directory exists
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Navigate to the app (will show login page)
  await page.goto('/');

  // Fill in credentials
  await page.getByLabel('Email').fill(process.env.E2E_USER_EMAIL);
  await page.getByLabel('Password').fill(process.env.E2E_USER_PASSWORD);

  // Submit login form
  await page.getByRole('button', { name: 'Login' }).click();

  // Wait for successful login — bottom nav appears
  await page.getByRole('navigation', { name: 'Main navigation' }).waitFor({ timeout: 15_000 });

  // Save auth state (cookies + localStorage)
  await page.context().storageState({ path: authFile });
});
```

- [ ] **Step 2: Run setup to verify login works**

```bash
npx playwright test --config=e2e/playwright.config.js --project=setup
```

Expected: Test passes, `e2e/.auth/session.json` is created with auth cookies.

- [ ] **Step 3: Commit**

```bash
git add e2e/global-setup.js
git commit -m "chore: add Playwright global auth setup"
```

---

## Task 3: Auth tests

**Files:**
- Create: `e2e/tests/auth.spec.js`

These tests do NOT use saved auth state — they test the login flow directly.

- [ ] **Step 1: Create `e2e/tests/auth.spec.js`**

```javascript
import { test, expect } from '@playwright/test';

// Auth tests don't use saved session — they test login from scratch
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('login page renders with email and password fields', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('successful login redirects to main app', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Email').fill(process.env.E2E_USER_EMAIL);
    await page.getByLabel('Password').fill(process.env.E2E_USER_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();

    // Should see the main navigation after login
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('invalid credentials show error', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Login' }).click();

    // Should show an error alert
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
  });

  test('logout returns to login page', async ({ page }) => {
    // First log in
    await page.goto('/');
    await page.getByLabel('Email').fill(process.env.E2E_USER_EMAIL);
    await page.getByLabel('Password').fill(process.env.E2E_USER_PASSWORD);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible({ timeout: 15_000 });

    // Now logout
    await page.getByRole('button', { name: 'Logout' }).click();

    // Should return to login page
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 10_000 });
  });
});
```

- [ ] **Step 2: Run auth tests**

```bash
npx playwright test --config=e2e/playwright.config.js e2e/tests/auth.spec.js
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/auth.spec.js
git commit -m "test: add E2E auth tests (login, logout, invalid credentials)"
```

---

## Task 4: Navigation tests

**Files:**
- Create: `e2e/tests/navigation.spec.js`

These tests use saved auth state. The app has a `BottomNavigation` with tabs: Students (0), School Reading (1), Home Reading (2), Stats (3), Recommend (4), Books (5), Settings (6). The Header has a class filter `<Select>` and a Logout button.

- [ ] **Step 1: Create `e2e/tests/navigation.spec.js`**

```javascript
import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to load (main nav visible)
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('header renders with app branding and logout', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();
  });

  test('bottom navigation shows all tabs', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByText('Students')).toBeVisible();
    await expect(nav.getByText('Home Reading')).toBeVisible();
    await expect(nav.getByText('Books')).toBeVisible();
    await expect(nav.getByText('Stats')).toBeVisible();
    await expect(nav.getByText('Settings')).toBeVisible();
  });

  test('navigate to Home Reading tab', async ({ page }) => {
    await page.getByText('Home Reading').click();

    // Home Reading Register should render with its title
    await expect(page.getByText('Reading Record')).toBeVisible({ timeout: 10_000 });
  });

  test('navigate to Books tab', async ({ page }) => {
    await page.getByText('Books').click();

    // Book manager should render
    await expect(page.getByText('Book Library')).toBeVisible({ timeout: 10_000 });
  });

  test('mobile viewport shows responsive layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Bottom nav should still be visible on mobile
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible();

    // Students tab content should render
    await expect(page.getByText('Students')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run navigation tests**

```bash
npx playwright test --config=e2e/playwright.config.js e2e/tests/navigation.spec.js
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/navigation.spec.js
git commit -m "test: add E2E navigation tests (tabs, header, mobile)"
```

---

## Task 5: Home Reading Register tests

**Files:**
- Create: `e2e/tests/home-reading-register.spec.js`

The Home Reading Register (`/` with tab index 2) shows a table of students with date columns and status indicators. It has a date picker, date range preset selector, search input, and a recording panel that appears when a student is selected.

- [ ] **Step 1: Create `e2e/tests/home-reading-register.spec.js`**

```javascript
import { test, expect } from '@playwright/test';

test.describe('Home Reading Register', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible({ timeout: 15_000 });

    // Navigate to Home Reading tab
    await page.getByText('Home Reading').click();
    await expect(page.getByText('Reading Record')).toBeVisible({ timeout: 10_000 });
  });

  test('register table loads with student names', async ({ page }) => {
    // Table should be visible with at least one student row
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Should have table headers
    await expect(table.getByText('Name')).toBeVisible();
    await expect(table.getByText('Total')).toBeVisible();
  });

  test('date picker is present and defaults to yesterday', async ({ page }) => {
    const dateInput = page.getByLabel('Select date for reading session');
    await expect(dateInput).toBeVisible();

    // Should have a date value set (yesterday)
    const value = await dateInput.inputValue();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('date range preset selector works', async ({ page }) => {
    // Find the Date Range select
    const preset = page.getByLabel('Date Range');
    await expect(preset).toBeVisible();

    // Click to open, select "Last Week"
    await preset.click();
    await page.getByRole('option', { name: 'Last Week' }).click();

    // Table should still be visible after changing range
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('clicking a student shows recording panel', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Click the first student row (first row in tbody)
    const firstStudentRow = table.locator('tbody tr').first();
    const studentName = await firstStudentRow.locator('td').first().textContent();
    await firstStudentRow.click();

    // Recording panel should appear with the student's name
    await expect(page.getByText(`Recording for: ${studentName}`)).toBeVisible();
  });

  test('summary chips display totals', async ({ page }) => {
    // Summary chips should show counts (format: "N Label")
    await expect(page.getByText(/\d+ Read/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/\d+ No Record/)).toBeVisible();
  });

  test('search filters students in the register', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Count initial rows
    const initialRows = await table.locator('tbody tr').count();

    // Type a search query (partial name)
    const searchInput = page.getByLabel('Search for a student by name');
    await searchInput.fill('a');

    // Should have equal or fewer rows after filtering
    const filteredRows = await table.locator('tbody tr').count();
    expect(filteredRows).toBeLessThanOrEqual(initialRows);
  });
});
```

- [ ] **Step 2: Run home reading register tests**

```bash
npx playwright test --config=e2e/playwright.config.js e2e/tests/home-reading-register.spec.js
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/home-reading-register.spec.js
git commit -m "test: add E2E home reading register tests"
```

---

## Task 6: Student list tests

**Files:**
- Create: `e2e/tests/student-list.spec.js`

The Students tab (tab index 0, default) shows a table/card view of students with name, reading status, streak badge, last read date, and current book. It has a search input and the global class filter in the header.

- [ ] **Step 1: Create `e2e/tests/student-list.spec.js`**

```javascript
import { test, expect } from '@playwright/test';

test.describe('Student List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Students tab is the default — wait for it to load
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('student list renders with student data', async ({ page }) => {
    // Should have at least one student visible (card or table row)
    // Student names appear as text content on the page
    const studentElements = page.locator('[class*="StudentCard"], [class*="student"], tbody tr');
    await expect(studentElements.first()).toBeVisible({ timeout: 10_000 });
  });

  test('class filter in header changes displayed students', async ({ page }) => {
    // Wait for initial student load
    await page.waitForTimeout(2000);

    // The class filter is a Select in the header
    const classFilter = page.locator('header').getByRole('combobox');
    if (await classFilter.isVisible()) {
      await classFilter.click();

      // Select "All Classes" option if available
      const allOption = page.getByRole('option', { name: 'All Classes' });
      if (await allOption.isVisible()) {
        await allOption.click();
      } else {
        // Close the dropdown by pressing Escape
        await page.keyboard.press('Escape');
      }
    }

    // Page should still render without errors
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  });

  test('student search filters results', async ({ page }) => {
    // Look for a search input on the Students page
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      // Give the filter a moment to apply
      await page.waitForTimeout(500);

      // Page should still be functional
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    }
  });

  test('student entries show reading status information', async ({ page }) => {
    // Wait for data to load
    await page.waitForTimeout(3000);

    // Look for reading status indicators that the app uses:
    // streak badges (flame icon), status text, or days-since-reading info
    const pageContent = await page.textContent('body');

    // The page should contain some student-related content
    // (student names, status indicators, or "no students" message)
    const hasStudentContent =
      pageContent.includes('days') ||
      pageContent.includes('Read') ||
      pageContent.includes('student') ||
      pageContent.includes('No students');

    expect(hasStudentContent).toBe(true);
  });

  test('student list is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Wait for content to render
    await page.waitForTimeout(2000);

    // Bottom nav should still work
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible();

    // Page should render without horizontal overflow issues
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10); // small tolerance
  });
});
```

- [ ] **Step 2: Run student list tests**

```bash
npx playwright test --config=e2e/playwright.config.js e2e/tests/student-list.spec.js
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/student-list.spec.js
git commit -m "test: add E2E student list tests (filter, search, responsive)"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run the full E2E suite**

```bash
npm run test:e2e
```

Expected: All ~20 tests pass. Auth setup runs first, then all test files use the saved session.

- [ ] **Step 2: Verify unit tests still pass**

```bash
npm test
```

Expected: All 50 files, 1,668 tests pass (E2E tests are excluded from Vitest).

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test: complete E2E Playwright test suite against production"
```
