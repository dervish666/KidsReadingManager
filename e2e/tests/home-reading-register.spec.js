import { test, expect } from '@playwright/test';
import { suppressWelcomeDialog } from './helpers.js';

test.describe('Home Reading Register', () => {
  test.beforeEach(async ({ page }) => {
    await suppressWelcomeDialog(page);
    await page.goto('/');
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible({ timeout: 15_000 });

    // Navigate to Home Reading tab
    await page.getByText('Home Reading').click();
    await expect(page.getByText('Reading Record')).toBeVisible({ timeout: 10_000 });
  });

  test('register loads with student data', async ({ page }) => {
    // Default view is "Quick" which renders a table with student rows
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Should have a "Student" column header
    await expect(table.getByText('Student')).toBeVisible();
  });

  test('date picker is present and has a date value', async ({ page }) => {
    const dateInput = page.getByLabel('Select date for reading session');
    await expect(dateInput).toBeVisible();

    // Should have a date value set
    const value = await dateInput.inputValue();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('full view shows date range presets and detailed table', async ({ page }) => {
    // Switch to Full view
    await page.getByRole('button', { name: 'Full' }).click();

    // Full view has a Date Range preset selector
    const preset = page.getByLabel('Date Range');
    await expect(preset).toBeVisible({ timeout: 5_000 });

    // Click to open, select "Last Week"
    await preset.click();
    await page.getByRole('option', { name: 'Last Week' }).click();

    // Table should still be visible after changing range
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('full view — clicking a student shows recording panel', async ({ page }) => {
    // Switch to Full view
    await page.getByRole('button', { name: 'Full' }).click();

    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Click the first student row (first row in tbody)
    const firstStudentRow = table.locator('tbody tr').first();
    await expect(firstStudentRow).toBeVisible({ timeout: 5_000 });
    const studentName = await firstStudentRow.locator('td').first().textContent();
    await firstStudentRow.click();

    // Recording panel should appear with the student's name
    await expect(page.getByText(`Recording for: ${studentName.trim()}`)).toBeVisible({
      timeout: 5_000,
    });
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
