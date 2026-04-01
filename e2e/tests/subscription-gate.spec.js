import { test, expect } from '@playwright/test';

test.describe('Subscription Access Control', () => {
  test('subscription-status endpoint returns valid status', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }),
    ).toBeVisible({ timeout: 15_000 });

    // Call the subscription-status endpoint via the authenticated page context
    const response = await page.evaluate(async () => {
      const token = window.localStorage.getItem('krm_auth_token');
      const res = await fetch('/api/billing/subscription-status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: res.status, body: await res.json() };
    });

    expect(response.status).toBe(200);
    expect(['none', 'trialing', 'active', 'past_due', 'cancelled']).toContain(
      response.body.status,
    );
  });

  test('cancelled subscription shows blocked screen', async ({ page }) => {
    // Intercept the subscription-status endpoint to simulate a cancelled subscription
    await page.route('**/api/billing/subscription-status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'cancelled' }),
      }),
    );

    // Also intercept any non-billing API call to return subscription cancelled 403
    // (this triggers the reactive detection in fetchWithAuth)
    await page.route('**/api/students**', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Your subscription has been cancelled.',
          code: 'SUBSCRIPTION_CANCELLED',
        }),
      }),
    );

    await page.goto('/');

    // Should show the blocked screen instead of the main app
    await expect(page.getByText('Subscription Cancelled')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/subscription has ended/i)).toBeVisible();

    // Should show Contact Support and Log Out
    await expect(page.getByRole('link', { name: /contact support/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /log out/i })).toBeVisible();

    // Main navigation should NOT be visible
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }),
    ).not.toBeVisible();
  });

  test('cancelled subscription — log out works from blocked screen', async ({ page }) => {
    await page.route('**/api/billing/subscription-status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'cancelled' }),
      }),
    );

    await page.route('**/api/students**', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Cancelled', code: 'SUBSCRIPTION_CANCELLED' }),
      }),
    );

    await page.goto('/');
    await expect(page.getByText('Subscription Cancelled')).toBeVisible({ timeout: 15_000 });

    // Click Log Out
    await page.getByRole('button', { name: /log out/i }).click();

    // Should return to landing page or login
    await expect(
      page.getByRole('button', { name: /sign in/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('past_due subscription still shows the app (not blocked)', async ({ page }) => {
    // Intercept subscription-status to simulate past_due
    await page.route('**/api/billing/subscription-status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'past_due' }),
      }),
    );

    await page.goto('/');

    // Dismiss welcome dialog if it appears
    const getStarted = page.getByRole('button', { name: /get started/i });
    if (await getStarted.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await getStarted.click();
    }

    // Main navigation should still be visible (not fully blocked)
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }),
    ).toBeVisible({ timeout: 15_000 });

    // Should NOT show the cancelled blocked screen
    await expect(page.getByText('Subscription Cancelled')).not.toBeVisible();
  });

  test('active subscription shows normal app with no warnings', async ({ page }) => {
    // No route interception — use real endpoints
    await page.goto('/');

    // Main navigation should be visible
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }),
    ).toBeVisible({ timeout: 15_000 });

    // No blocked screen
    await expect(page.getByText('Subscription Cancelled')).not.toBeVisible();
  });
});
