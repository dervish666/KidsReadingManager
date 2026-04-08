import { test, expect } from '@playwright/test';
import { suppressWelcomeDialog } from './helpers.js';

test.describe('Quick Reading View', () => {
  test.beforeEach(async ({ page }) => {
    await suppressWelcomeDialog(page);
    await page.goto('/');
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible({ timeout: 15_000 });

    // Navigate to Home Reading tab (defaults to Quick view)
    await page.getByText('Home Reading').click();
    await expect(page.getByText('Reading Record')).toBeVisible({ timeout: 10_000 });
  });

  // --- Layout & Controls ---

  test('quick view is the default view', async ({ page }) => {
    const quickBtn = page.getByRole('button', { name: 'Quick' });
    await expect(quickBtn).toBeVisible();
    await expect(quickBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('date picker shows and has a valid date', async ({ page }) => {
    const datePicker = page.getByLabel('Select date for reading session');
    await expect(datePicker).toBeVisible();

    const value = await datePicker.inputValue();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('student count is displayed', async ({ page }) => {
    await expect(page.getByText(/\d+ students/)).toBeVisible({ timeout: 10_000 });
  });

  test('table has history day columns, student, record, and book headers', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Should have Student and Record Reading column headers
    await expect(table.getByText('Student')).toBeVisible();
    await expect(table.getByText('Record Reading')).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Book' })).toBeVisible();

    // Should have day-of-week history columns in the header
    const headers = table.locator('thead th');
    const headerCount = await headers.count();
    // At least: 3 history days + Student + Record Reading + Book = 6+
    expect(headerCount).toBeGreaterThanOrEqual(6);
  });

  // --- Search ---

  test('search filters students and updates count', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    const initialCount = await table.locator('tbody tr').count();
    expect(initialCount).toBeGreaterThan(0);

    // Search for a specific name
    const searchInput = page.getByLabel('Search for a student by name');
    await searchInput.fill('emma');

    // Wait for filter to apply
    await page.waitForTimeout(500);

    // Should filter down
    const filteredCount = await table.locator('tbody tr').count();
    expect(filteredCount).toBeLessThan(initialCount);
    expect(filteredCount).toBeGreaterThan(0);

    // Student count should update
    await expect(page.getByText(/\d+ students/)).toBeVisible();

    // Clear search restores all students
    await searchInput.clear();
    await page.waitForTimeout(500);
    const restoredCount = await table.locator('tbody tr').count();
    expect(restoredCount).toBe(initialCount);
  });

  test('search with no matches shows zero students', async ({ page }) => {
    const searchInput = page.getByLabel('Search for a student by name');
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    await searchInput.fill('zzzznoname');
    await page.waitForTimeout(500);

    // Should show 0 students in the count
    await expect(page.getByText('0 students')).toBeVisible();
  });

  // --- Recording Reading ---

  test('clicking read button marks student as read and shows clear button', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // Find the first student's read (✓) button
    const firstRow = table.locator('tbody tr').first();
    const readBtn = firstRow.getByRole('button', { name: /^mark .* as read$/i });
    await expect(readBtn).toBeVisible();

    // Click to record as read
    await readBtn.click();

    // Clear button (X) should appear in the row
    const clearBtn = firstRow.getByRole('button', { name: /clear/i });
    await expect(clearBtn).toBeVisible({ timeout: 3_000 });
  });

  test('clear button removes the reading entry', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    const firstRow = table.locator('tbody tr').first();
    const readBtn = firstRow.getByRole('button', { name: /^mark .* as read$/i });

    // Record a read
    await readBtn.click();
    const clearBtn = firstRow.getByRole('button', { name: /clear/i });
    await expect(clearBtn).toBeVisible({ timeout: 3_000 });

    // Clear it
    await clearBtn.click();

    // Clear button should disappear
    await expect(clearBtn).not.toBeVisible({ timeout: 3_000 });
  });

  // --- Summary Chips ---

  test('summary chips show register totals', async ({ page }) => {
    // Search for a single student to make chips visible (they sit below the table)
    const searchInput = page.getByLabel('Search for a student by name');
    await searchInput.fill('emma');
    await page.waitForTimeout(500);

    // Summary chips should be visible with status labels
    await expect(page.getByText(/\d+ Read/)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/\d+ Not Entered/)).toBeVisible();
    await expect(page.getByText(/\d+ Total/)).toBeVisible();
  });

  // --- View Switching ---

  test('switching to full view and back preserves state', async ({ page }) => {
    // Start in Quick
    await expect(page.getByRole('button', { name: 'Quick' })).toHaveAttribute('aria-pressed', 'true');

    // Switch to Full
    await page.getByRole('button', { name: 'Full' }).click();
    await expect(page.getByRole('button', { name: 'Full' })).toHaveAttribute('aria-pressed', 'true');

    // Full view shows Date Range selector
    await expect(page.getByLabel('Date Range')).toBeVisible({ timeout: 5_000 });

    // Switch back to Quick
    await page.getByRole('button', { name: 'Quick' }).click();
    await expect(page.getByRole('button', { name: 'Quick' })).toHaveAttribute('aria-pressed', 'true');

    // Quick view date picker should be back
    await expect(page.getByLabel('Select date for reading session')).toBeVisible();
  });

  // --- Book Column ---

  test('students show their current book or tap-to-set prompt', async ({ page }) => {
    const table = page.getByRole('table');
    await expect(table).toBeVisible({ timeout: 10_000 });

    // The book column should have either book titles or "Tap to set book"
    const pageText = await table.textContent();
    const hasBookContent =
      pageText.includes('Tap to set book') || pageText.includes('A '); // Most books start with "A"
    expect(hasBookContent).toBe(true);
  });

  // --- Date Interaction ---

  test('changing date reloads sessions for that date', async ({ page }) => {
    const datePicker = page.getByLabel('Select date for reading session');
    await expect(datePicker).toBeVisible();

    const originalDate = await datePicker.inputValue();

    // Change to a different date (2 days ago)
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const newDate = twoDaysAgo.toISOString().split('T')[0];
    await datePicker.fill(newDate);

    // Date should have changed
    const updatedDate = await datePicker.inputValue();
    expect(updatedDate).toBe(newDate);

    // Table should still be visible (no crash on date change)
    const table = page.getByRole('table');
    await expect(table).toBeVisible();

    // Restore original date
    await datePicker.fill(originalDate);
  });
});
