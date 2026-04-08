import { test, expect } from '@playwright/test';
import { suppressWelcomeDialog } from './helpers.js';

// Mock student and book data for the session form
const mockStudents = [
  { id: 's1', name: 'Alice Johnson', classId: 'c1', readingLevelMin: 3.0, readingLevelMax: 5.0 },
  { id: 's2', name: 'Bob Smith', classId: 'c1', readingLevelMin: 2.0, readingLevelMax: 4.0 },
];

const mockClasses = [{ id: 'c1', name: 'Year 3 Oak', disabled: false }];

const mockBooks = [
  { id: 'b1', title: 'The Gruffalo', author: 'Julia Donaldson', readingLevel: 3.5 },
  { id: 'b2', title: 'Matilda', author: 'Roald Dahl', readingLevel: 4.0 },
];

/**
 * Intercept API responses to provide test data for the session form.
 */
async function mockSessionData(page) {
  await page.route('**/api/students**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockStudents),
      });
    }
    return route.continue();
  });

  await page.route('**/api/classes**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockClasses),
    }),
  );

  await page.route('**/api/books**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBooks),
      });
    }
    return route.continue();
  });
}

test.describe('School Reading - Session Form', () => {
  test.beforeEach(async ({ page }) => {
    await suppressWelcomeDialog(page);
    await mockSessionData(page);
    await page.goto('/');
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible({ timeout: 15_000 });

    // Navigate to School Reading tab
    await page.getByText('School Reading').click();
  });

  test('session form renders with student select', async ({ page }) => {
    // Student select should be present
    const studentSelect = page.locator('#student-select');
    await expect(studentSelect).toBeVisible({ timeout: 10_000 });
  });

  test('student dropdown shows available students', async ({ page }) => {
    const studentSelect = page.locator('#student-select');
    await expect(studentSelect).toBeVisible({ timeout: 10_000 });

    // Open the dropdown
    await studentSelect.click();

    // Should show our mock students
    await expect(page.getByRole('option', { name: /Alice Johnson/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole('option', { name: /Bob Smith/i })).toBeVisible();
  });

  test('selecting a student reveals book and assessment fields', async ({ page }) => {
    const studentSelect = page.locator('#student-select');
    await expect(studentSelect).toBeVisible({ timeout: 10_000 });

    // Select a student
    await studentSelect.click();
    await page.getByRole('option', { name: /Alice Johnson/i }).click();

    // Book autocomplete should now be visible
    await expect(page.getByLabel(/book/i)).toBeVisible({ timeout: 5_000 });

    // Save button should be visible
    await expect(page.getByRole('button', { name: /save reading session/i })).toBeVisible();
  });

  test('save button is enabled after selecting a student', async ({ page }) => {
    const studentSelect = page.locator('#student-select');
    await expect(studentSelect).toBeVisible({ timeout: 10_000 });

    // Select a student
    await studentSelect.click();
    await page.getByRole('option', { name: /Alice Johnson/i }).click();

    // Save button should be visible and enabled
    const saveBtn = page.getByRole('button', { name: /save reading session/i });
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeEnabled();
  });

  test('student dropdown is empty when no students exist', async ({ page }) => {
    // Override students to return empty
    await page.route('**/api/students**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      }),
    );

    // Reload to pick up new mock
    await page.reload();
    await page.getByText('School Reading').click();

    // Open the student dropdown
    const studentSelect = page.locator('#student-select');
    await expect(studentSelect).toBeVisible({ timeout: 10_000 });
    await studentSelect.click();

    // Should show the empty state message inside the dropdown
    await expect(
      page.getByText(/no.*students/i)
    ).toBeVisible({ timeout: 5_000 });
  });
});
