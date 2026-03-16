# E2E Testing with Playwright — Design Spec

## Purpose

Add browser-based end-to-end tests to Tally Reading using Playwright. Tests run against the deployed production environment (`tallyreading.uk`) and verify that the UI renders correctly, navigation works, and data displays as expected. All tests are read-only — no records are created, modified, or deleted.

## Architecture

- **Framework**: Playwright with its built-in test runner (`@playwright/test`)
- **Target**: `https://tallyreading.uk` (configurable via `.env.e2e`)
- **Browser**: Chromium only
- **Auth**: Email/password login (`test@tallyreading.uk`, teacher role at Cheddar Grove)
- **Auth reuse**: Global setup logs in once, saves cookies to `e2e/.auth/session.json`. All tests reuse the saved session except `auth.spec.js` which tests login itself.
- **Isolation from unit tests**: E2E tests run via `npm run test:e2e`, completely separate from `npm test` (Vitest)

## File Structure

```
e2e/
  playwright.config.js          # Base URL, browser, timeouts, auth state
  global-setup.js               # Login once, save session cookies
  .auth/                        # Gitignored — saved session state
    session.json
  tests/
    auth.spec.js                # Login/logout flow (~4 tests)
    navigation.spec.js          # Header, class filter, page nav (~5 tests)
    home-reading-register.spec.js  # Core daily workflow (~6 tests)
    student-list.spec.js        # Student table, search, filter (~5 tests)
```

## Credentials

Stored in `.env.e2e` at project root (gitignored):

```
E2E_BASE_URL=https://tallyreading.uk
E2E_USER_EMAIL=test@tallyreading.uk
E2E_USER_PASSWORD=love reading
```

Playwright config reads these via `dotenv`. No credentials in source code.

## Test Specifications

### auth.spec.js (~4 tests)

Does NOT use saved auth state — tests the login flow directly.

| Test | Asserts |
|------|---------|
| Login page renders | Email and password fields visible, login button present |
| Successful login | Enter credentials, submit, verify redirect to main app |
| Authenticated state | Header shows user context, navigation is available |
| Logout | Click logout, verify return to login page |

### navigation.spec.js (~5 tests)

Uses saved auth state (already logged in).

| Test | Asserts |
|------|---------|
| Header renders | App name, navigation links, class filter dropdown visible |
| Class filter works | Switch between classes, verify student list updates |
| Navigate to Reading Register | Click nav link, verify page title and register table |
| Navigate to Students | Click nav link, verify student list renders |
| Mobile viewport | Resize to 375px width, verify responsive layout and hamburger menu |

### home-reading-register.spec.js (~6 tests)

Uses saved auth state. Core daily teacher workflow.

| Test | Asserts |
|------|---------|
| Register loads | Table renders with student names for selected class |
| Date picker defaults | Date input value is yesterday's date |
| Date range presets | Change preset to Last Week, verify date columns update |
| Student selection | Click student row, verify recording panel appears with student name |
| Status indicators | Existing entries show correct symbols (✓, numbers, A, •) |
| Summary chips | Totals bar shows Read, Absent, No Record, Not Entered counts |

### student-list.spec.js (~5 tests)

Uses saved auth state.

| Test | Asserts |
|------|---------|
| Student table renders | Table with student names, status indicators, streak badges |
| Class filter | Select a different class, verify table updates with different students |
| Search filter | Type in search box, verify filtered results |
| Student details visible | Row shows last read date and current book title |
| Sort functionality | Click column header, verify order changes |

## Configuration

### playwright.config.js

- `baseURL`: from `E2E_BASE_URL` env var
- `timeout`: 30s per test
- `navigationTimeout`: 60s (Cloudflare cold starts)
- `retries`: 1 (handle network flakiness)
- `reporter`: `html` (generates browsable report)
- `projects`: single Chromium project with saved auth state
- `globalSetup`: `./global-setup.js`

### Timeouts rationale

Cloudflare Workers have cold start latency. The first request after a deploy or idle period can take several seconds. 30s test timeout and 60s navigation timeout accommodate this without being wasteful.

## npm Scripts

```json
{
  "test:e2e": "npx playwright test --config=e2e/playwright.config.js"
}
```

## Gitignore additions

```
e2e/.auth/
.env.e2e
```

## CI

Not integrated into GitHub Actions for now. Tests hit production and require credentials. Run manually after deploying:

```bash
npm run go && npm run test:e2e
```

## Test Philosophy

- **Read-only**: No mutations. Tests verify UI renders, navigation works, data displays correctly.
- **Structural assertions**: Assert on element roles, labels, and structure (e.g. "table has rows", "button is visible") rather than specific data values (e.g. "Alice Smith is in row 1"). This makes tests resilient to data changes.
- **No test data seeding**: Tests run against whatever data exists in production. Since this is a pre-launch environment with real-ish test data, this is sufficient.
- **Fast feedback**: Auth cookie reuse means only 1 login per suite run. ~20 tests should complete in under 60 seconds.

## Dependencies

```
npm install -D @playwright/test dotenv
npx playwright install chromium
```

## Future Extensions (out of scope)

- Add write tests (create session, add book) with cleanup
- CI integration with a staging environment and seeded test data
- Visual regression testing with Playwright screenshots
- MyLogin SSO flow testing
- Multi-role testing (admin, owner accounts)
