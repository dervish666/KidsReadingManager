import { test, expect } from '@playwright/test';
import { suppressWelcomeDialog, dismissDialogs } from './helpers.js';

// Auth tests don't use saved session — they test login from scratch
test.use({ storageState: { cookies: [], origins: [] } });

// Helper: navigate to login form (landing page -> click Sign in)
async function goToLogin(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByLabel('Email').waitFor({ timeout: 10_000 });
}

test.describe('Authentication', () => {
  test('login page renders with email and password fields', async ({ page }) => {
    await goToLogin(page);

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login', exact: true })).toBeVisible();
  });

  test('successful login redirects to main app', async ({ page }) => {
    await suppressWelcomeDialog(page);
    await goToLogin(page);

    await page.getByLabel('Email').fill(process.env.E2E_USER_EMAIL);
    await page.getByLabel('Password').fill(process.env.E2E_USER_PASSWORD);
    await page.getByRole('button', { name: 'Login', exact: true }).click();

    // Should see the main navigation after login
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('invalid credentials show error', async ({ page }) => {
    await goToLogin(page);

    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Login', exact: true }).click();

    // Should show an error alert
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
  });

  test('logout returns to login page', async ({ page }) => {
    await suppressWelcomeDialog(page);
    await goToLogin(page);

    await page.getByLabel('Email').fill(process.env.E2E_USER_EMAIL);
    await page.getByLabel('Password').fill(process.env.E2E_USER_PASSWORD);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible({ timeout: 15_000 });

    // Dismiss any remaining dialogs (DPA consent, etc.)
    await dismissDialogs(page);

    // Now logout
    await page.getByRole('button', { name: 'Logout' }).click();

    // Should return to login form (shows Email field)
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 10_000 });
  });
});
