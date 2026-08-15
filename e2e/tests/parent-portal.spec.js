import { test, expect, request as playwrightRequest } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const authFile = path.resolve(__dirname, '../.auth/session.json');
const baseURL = process.env.E2E_BASE_URL || 'https://tallyreading.uk';

/**
 * An API context that is actually authenticated as the teacher.
 *
 * Two traps here, both of which look like a broken login. `browser.newPage()`
 * opens a context with *default* options rather than the project's, so it
 * carries no saved session at all. And even with `storageState` loaded, the
 * app's JWT lives in localStorage and is attached by `fetchWithAuth` — an
 * `Authorization` header the browser never adds on its own — so a bare
 * `page.request` call sends cookies and nothing else, and every teacher-only
 * endpoint 401s. The token has to be lifted out of the saved state and sent
 * explicitly.
 */
async function teacherApi() {
  const state = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  const entry = state.origins
    ?.flatMap((o) => o.localStorage || [])
    .find((kv) => kv.name === 'krm_auth_token');
  if (!entry?.value) {
    throw new Error(`No krm_auth_token in ${authFile} — did global-setup run?`);
  }
  return playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: `Bearer ${entry.value}` },
  });
}

/**
 * Parent QR portal — the one surface that is phone-first by design.
 *
 * A teacher prints a QR code, it goes home in a book bag, and a parent scans it
 * on their own phone. Nobody logs in: the token in the URL *is* the auth. Until
 * this file existed the portal had no browser coverage at all, which meant the
 * only journey Tally asks a member of the public to complete was also the only
 * one never driven end to end.
 *
 * The token is generated at run time rather than hard-coded, for two reasons.
 * A checked-in token would be a live credential to a child's reading record in
 * a git repo; and `POST /generate/student/:id` *revokes any existing token for
 * that student*, so pointing this at a real pupil would silently break a
 * parent's working QR code. The authenticated E2E user belongs to Learnalot
 * School — a test organisation with no parent tokens in use — and tenant
 * isolation means this session cannot reach the orgs that do have live ones.
 * The token is revoked again in afterAll.
 *
 * Assertions deliberately avoid the child's name. The portal renders
 * "<FirstName>'s Reading", and asserting on it would bake a pupil's first name
 * into the repo for no extra confidence.
 */

const PHONE = { width: 390, height: 844 }; // iPhone 14 / 15 portrait

let token;
let tokenId;
let studentId;

test.beforeAll(async () => {
  const api = await teacherApi();

  const studentsRes = await api.get('/api/students');
  expect(studentsRes.ok(), 'could not list students as the E2E teacher').toBeTruthy();
  const students = await studentsRes.json();
  expect(students.length, 'E2E org has no students to generate a token for').toBeGreaterThan(0);
  studentId = students[0].id;

  const genRes = await api.post(`/api/parent/generate/student/${studentId}`);
  expect(genRes.ok(), 'could not generate a parent access token').toBeTruthy();
  ({ token, tokenId } = await genRes.json());
  expect(token, 'generate returned no token').toBeTruthy();

  await api.dispose();
});

test.afterAll(async () => {
  if (!tokenId) return;
  const api = await teacherApi();
  // Leave no live token behind — this one was only ever for the test.
  await api.delete(`/api/parent/tokens/${tokenId}`).catch(() => {});
  await api.dispose();
});

test.describe('Parent QR portal', () => {
  // The portal is public: no stored session, exactly as a parent arrives.
  test.use({ storageState: { cookies: [], origins: [] }, viewport: PHONE });

  test('opens from the token URL on a phone with no login', async ({ page }) => {
    await page.goto(`/parent/${token}`);

    await expect(page.getByRole('heading', { name: /'s Reading$/ })).toBeVisible({
      timeout: 15_000,
    });

    // Both tabs present, and no sign-in is ever demanded.
    await expect(page.getByRole('tab', { name: 'Reading' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Book Ideas' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toHaveCount(0);
  });

  test('does not overflow horizontally on a phone', async ({ page }) => {
    await page.goto(`/parent/${token}`);
    await expect(page.getByRole('heading', { name: /'s Reading$/ })).toBeVisible({
      timeout: 15_000,
    });

    // A parent scanning a QR code cannot zoom out of a broken layout, so a
    // page wider than the phone is a real defect rather than a cosmetic one.
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('offers the Read Today action', async ({ page }) => {
    await page.goto(`/parent/${token}`);

    // Logging a home read is the portal's only write, and the whole reason the
    // "read-only" wording in Help was corrected in v3.120.0.
    await expect(page.getByRole('button', { name: /read today/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('Book Ideas tab loads without an account', async ({ page }) => {
    await page.goto(`/parent/${token}`);
    await expect(page.getByRole('tab', { name: 'Book Ideas' })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('tab', { name: 'Book Ideas' }).click();

    // Lazy-loaded on first open. Content varies by school (AI snapshot and/or
    // live library matches, either possibly empty), so assert the tab actually
    // switched rather than pinning specific books.
    await expect(page.getByRole('tab', { name: 'Book Ideas' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  test('a bad token is refused with an explanation, not a blank page', async ({ page }) => {
    await page.goto('/parent/definitely-not-a-real-token');

    // A parent whose link has been regenerated needs to be told that, rather
    // than left looking at an empty screen wondering if the app is broken —
    // and told it in their words, not the API's ("access token").
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(alert).toContainText(/invalid or has expired/i);
    await expect(alert).not.toContainText(/token/i);
    await expect(page.getByRole('heading', { name: /'s Reading$/ })).toHaveCount(0);
  });

  test('a revoked token stops working immediately', async ({ page }) => {
    // Generate a second token for the same student, which revokes the first —
    // this is exactly what a teacher does when a link goes astray, and the
    // guarantee they are relying on.
    const api = await teacherApi();
    const res = await api.post(`/api/parent/generate/student/${studentId}`);
    expect(res.ok()).toBeTruthy();
    const { token: newToken, tokenId: newTokenId } = await res.json();

    await page.goto(`/parent/${token}`);
    await expect(page.getByRole('alert')).toContainText(/invalid or has expired/i, {
      timeout: 15_000,
    });

    // ...and the replacement works.
    await page.goto(`/parent/${newToken}`);
    await expect(page.getByRole('heading', { name: /'s Reading$/ })).toBeVisible({
      timeout: 15_000,
    });

    // Keep afterAll's cleanup pointed at whatever is currently live.
    token = newToken;
    tokenId = newTokenId;
    await api.dispose();
  });
});
