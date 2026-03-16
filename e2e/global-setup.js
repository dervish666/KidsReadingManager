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

  // Navigate to the app (shows landing page first)
  await page.goto('/');

  // Click "Sign in" on the landing page to get to the login form
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for login form to appear
  await page.getByLabel('Email').waitFor({ timeout: 10_000 });

  // Fill in credentials
  await page.getByLabel('Email').fill(process.env.E2E_USER_EMAIL);
  await page.getByLabel('Password').fill(process.env.E2E_USER_PASSWORD);

  // Submit login form (exact: true to avoid matching "Sign in with MyLogin")
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  // Wait for successful login — bottom nav appears
  await page.getByRole('navigation', { name: 'Main navigation' }).waitFor({ timeout: 15_000 });

  // Save auth state (cookies + localStorage)
  await page.context().storageState({ path: authFile });
});
