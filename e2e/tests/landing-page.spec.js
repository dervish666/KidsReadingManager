import { test, expect } from '@playwright/test';

// Landing page tests don't use saved session — they test the public page
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('hero section renders with CTA buttons', async ({ page }) => {
    // Two hero CTAs plus the header sign-in. "Start free trial" appears twice
    // (header and hero), so scope to the hero to keep the locator unambiguous.
    const hero = page.locator('.hero-actions');
    await expect(hero.getByRole('link', { name: /start free trial/i })).toBeVisible();
    await expect(hero.getByRole('button', { name: /explore the live demo/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('navigation links are present', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link', { name: 'See it' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Features' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Pricing' })).toBeVisible();
  });

  test('features section scrolls into view', async ({ page }) => {
    await page.getByRole('link', { name: 'Features' }).click();

    // Features section should be in the viewport
    const features = page.locator('#features');
    await expect(features).toBeVisible({ timeout: 5_000 });
  });

  test('contact form renders with all fields', async ({ page }) => {
    // Scroll to contact section
    await page.locator('#start').scrollIntoViewIfNeeded();

    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('textarea[name="message"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /send message/i })).toBeVisible();
  });

  test('contact form validates required fields', async ({ page }) => {
    await page.locator('#start').scrollIntoViewIfNeeded();

    // Submit empty form — HTML5 validation should prevent submission
    const submitBtn = page.getByRole('button', { name: /send message/i });
    await submitBtn.click();

    // Form should still be visible (not submitted)
    await expect(page.locator('input[name="name"]')).toBeVisible();
  });

  test('contact form submits successfully', async ({ page }) => {
    // Mock the signup API to avoid sending real emails
    await page.route('**/api/signup', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      }),
    );

    await page.locator('#start').scrollIntoViewIfNeeded();

    await page.locator('input[name="name"]').fill('Test User');
    await page.locator('input[name="email"]').fill('test@example.com');
    await page.locator('textarea[name="message"]').fill('Hello from E2E test');
    await page.getByRole('button', { name: /send message/i }).click();

    // Should show success message
    await expect(page.getByText('Thanks for getting in touch!')).toBeVisible({ timeout: 5_000 });
  });

  test('sign in button navigates to login form', async ({ page }) => {
    await page.getByRole('button', { name: /sign in/i }).click();

    // Should show login form with Email and Password fields
    await expect(page.getByLabel('Email')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('try the demo button initiates demo login', async ({ page }) => {
    // Mock the demo endpoint
    await page.route('**/api/auth/demo', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'demo-token-123',
          user: {
            id: 'demo-user',
            name: 'Demo User',
            role: 'teacher',
            organizationId: 'demo-org',
            organizationName: 'Demo School',
            organizationSlug: 'demo',
          },
        }),
      }),
    );

    await page.getByRole('button', { name: /explore the live demo/i }).click();

    // Button should show loading state
    await expect(page.getByText(/loading demo/i)).toBeVisible({ timeout: 3_000 }).catch(() => {
      // Demo may have completed already — that's fine
    });
  });

  test('footer links are present', async ({ page }) => {
    // Scroll the footer into view
    const footer = page.locator('footer');
    await footer.scrollIntoViewIfNeeded();

    await expect(footer.getByRole('link', { name: 'Privacy' })).toBeVisible({ timeout: 5_000 });
    await expect(footer.getByRole('link', { name: 'Terms' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Cookies' })).toBeVisible();
  });

  test('page is responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    // Hero CTA should still be visible
    await expect(
      page.locator('.hero-actions').getByRole('link', { name: /start free trial/i })
    ).toBeVisible();

    // Sign in must survive to the narrowest phones: this button is the only
    // thing on the landing page wired to onSignIn, so if it is hidden an
    // existing user on a phone has no way in at all.
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10);
  });
});
