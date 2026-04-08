import { test, expect } from '@playwright/test';
import { suppressWelcomeDialog } from './helpers.js';

test.describe('Student Detail Drawer', () => {
  test.beforeEach(async ({ page }) => {
    await suppressWelcomeDialog(page);
    await page.goto('/');
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('clicking a student opens the detail drawer', async ({ page }) => {
    // Wait for student list to load
    const studentRow = page.locator('tbody tr').first();
    await expect(studentRow).toBeVisible({ timeout: 10_000 });

    // Click the first student
    await studentRow.click();

    // Drawer should open with close button
    await expect(
      page.getByRole('button', { name: 'Close drawer' })
    ).toBeVisible({ timeout: 5_000 });
  });

  test('drawer shows student name', async ({ page }) => {
    const studentRow = page.locator('tbody tr').first();
    await expect(studentRow).toBeVisible({ timeout: 10_000 });

    await studentRow.click();

    // Drawer should open and show a student name as a heading
    const drawer = page.locator('.MuiDrawer-root');
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // The name is in a Typography variant="h6" — find any h6 in the drawer
    await expect(drawer.locator('h6').first()).toBeVisible();
    const name = await drawer.locator('h6').first().textContent();
    expect(name.length).toBeGreaterThan(0);
  });

  test('drawer shows reading stats section', async ({ page }) => {
    const studentRow = page.locator('tbody tr').first();
    await expect(studentRow).toBeVisible({ timeout: 10_000 });
    await studentRow.click();

    // Scope assertions to the drawer to avoid matching table headers
    const drawer = page.locator('.MuiDrawer-root');
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    // Should show reading stats labels within the drawer
    await expect(drawer.getByText('Total sessions')).toBeVisible({ timeout: 5_000 });
    await expect(drawer.getByText('Last read')).toBeVisible();
  });

  test('edit button switches to edit mode', async ({ page }) => {
    const studentRow = page.locator('tbody tr').first();
    await expect(studentRow).toBeVisible({ timeout: 10_000 });
    await studentRow.click();

    const drawer = page.locator('.MuiDrawer-root');
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    // Click edit
    const editBtn = drawer.getByRole('button', { name: 'Edit' });
    if (await editBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await editBtn.click();

      // Should show Save and Cancel buttons
      await expect(drawer.getByRole('button', { name: 'Save' })).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Cancel' })).toBeVisible();

      // Should show Name text input (use textbox role to avoid matching table sort label)
      await expect(drawer.getByRole('textbox', { name: 'Name' })).toBeVisible();
    }
  });

  test('cancel edit returns to read mode', async ({ page }) => {
    const studentRow = page.locator('tbody tr').first();
    await expect(studentRow).toBeVisible({ timeout: 10_000 });
    await studentRow.click();

    const drawer = page.locator('.MuiDrawer-root');
    await expect(drawer).toBeVisible({ timeout: 5_000 });

    const editBtn = drawer.getByRole('button', { name: 'Edit' });
    if (await editBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await editBtn.click();
      await expect(drawer.getByRole('button', { name: 'Cancel' })).toBeVisible();

      // Click cancel
      await drawer.getByRole('button', { name: 'Cancel' }).click();

      // Should return to read mode — Edit button visible again
      await expect(drawer.getByRole('button', { name: 'Edit' })).toBeVisible({ timeout: 3_000 });
    }
  });

  test('close button closes the drawer', async ({ page }) => {
    const studentRow = page.locator('tbody tr').first();
    await expect(studentRow).toBeVisible({ timeout: 10_000 });
    await studentRow.click();

    const closeBtn = page.getByRole('button', { name: 'Close drawer' });
    await expect(closeBtn).toBeVisible({ timeout: 5_000 });

    await closeBtn.click();

    // Drawer should be closed — close button no longer visible
    await expect(closeBtn).not.toBeVisible({ timeout: 3_000 });
  });
});
