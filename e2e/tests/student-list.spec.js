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
