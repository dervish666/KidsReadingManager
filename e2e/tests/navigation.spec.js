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
    await expect(page.getByText('Manage Books')).toBeVisible({ timeout: 10_000 });
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
