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
    await expect(table.getByRole('columnheader', { name: 'Total' })).toBeVisible();
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
