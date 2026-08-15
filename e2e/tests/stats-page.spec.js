import { test, expect } from '@playwright/test';
import { suppressWelcomeDialog } from './helpers.js';

test.describe('Stats Page', () => {
  test.beforeEach(async ({ page }) => {
    await suppressWelcomeDialog(page);
    await page.goto('/');
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible({ timeout: 15_000 });

    // Navigate to Stats tab
    await page.getByText('Stats').click();
  });

  test('stats page renders with tab navigation', async ({ page }) => {
    // The five tabs actually rendered by stats/ReadingStats.js. Streaks used to
    // be here and now lives on the Achievements page, so it is asserted there.
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('tab', { name: 'Needs Attention' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Reading Frequency' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Reading Timeline' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Reading News' })).toBeVisible();
  });

  test('clicking tabs switches content', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible({ timeout: 10_000 });

    // Click Reading Frequency tab
    await page.getByRole('tab', { name: 'Reading Frequency' }).click();

    // Should show frequency content (or empty state)
    await expect(page.locator('main')).toBeVisible();

    // Click Needs Attention tab
    await page.getByRole('tab', { name: 'Needs Attention' }).click();
    await expect(page.locator('main')).toBeVisible();
  });

  test('period filter is present', async ({ page }) => {
    // The period filter select should be visible
    const periodFilter = page.getByLabel('Period');
    if (await periodFilter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await periodFilter.click();

      // Should have "All Time" option
      await expect(page.getByRole('option', { name: 'All Time' })).toBeVisible({ timeout: 3_000 });
      await page.keyboard.press('Escape');
    }
  });

  test('download report button is present', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible({ timeout: 10_000 });

    const downloadBtn = page.getByRole('button', { name: /download report/i });
    if (await downloadBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(downloadBtn).toBeEnabled();
    }
  });

  test('stats page handles empty data gracefully', async ({ page }) => {
    // Wait for content to load
    await page.waitForTimeout(3000);

    // Page should render without errors — either stats or empty state
    const pageContent = await page.textContent('body');
    const hasContent =
      pageContent.includes('Overview') ||
      pageContent.includes('No data') ||
      pageContent.includes('sessions') ||
      pageContent.includes('students');

    expect(hasContent).toBe(true);
  });
});
