/**
 * Suppress all guided tours (WelcomeDialog, session form tour, etc.)
 * by intercepting the tour status API. Must be called BEFORE navigating.
 */
export async function suppressTours(page) {
  await page.route('**/api/tours/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { tourId: 'welcome', version: 1 },
        { tourId: 'session-form', version: 1 },
        { tourId: 'home-reading-quick', version: 1 },
        { tourId: 'home-reading-full', version: 1 },
        { tourId: 'stats', version: 1 },
        { tourId: 'recommendations', version: 1 },
      ]),
    }),
  );
}

/** @deprecated Use suppressTours instead */
export const suppressWelcomeDialog = suppressTours;

/**
 * Dismiss any modal dialogs that may block interaction.
 * Use as a fallback when suppressWelcomeDialog wasn't applied.
 */
export async function dismissDialogs(page) {
  // WelcomeDialog — shown to teachers after data loads
  const getStarted = page.getByRole('button', { name: /get started/i });
  if (await getStarted.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await getStarted.click();
    await page.locator('.MuiDialog-root').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  // DPA consent — shown to admins/owners who haven't accepted
  const acceptDpa = page.getByRole('button', { name: /accept/i });
  if (await acceptDpa.isVisible({ timeout: 1_000 }).catch(() => false)) {
    const checkbox = page.getByRole('checkbox');
    if (await checkbox.isVisible({ timeout: 500 }).catch(() => false)) {
      await checkbox.check();
    }
    await acceptDpa.click();
    await page.locator('.MuiDialog-root').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
}
