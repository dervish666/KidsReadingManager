# Subscription Access Control Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate app access based on Stripe subscription status — past_due schools get read-only, cancelled schools are fully blocked.

**Architecture:** A `subscriptionGate()` middleware in the existing tenant middleware chain reads `subscription_status` from the org (already queried by `tenantMiddleware`). Frontend detects blocks proactively via a new lightweight endpoint and reactively via 403 response codes in `fetchWithAuth`.

**Tech Stack:** Hono middleware (backend), React context + MUI components (frontend), Vitest (tests)

**Spec:** `docs/superpowers/specs/2026-03-31-subscription-access-control-design.md`

---

## Chunk 1: Backend — Middleware + Endpoint

### Task 1: Extend `tenantMiddleware` to stash subscription status

**Files:**
- Modify: `src/middleware/tenant.js:105-106` (org query)

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/unit/tenant-middleware.test.js`:

```js
describe('tenantMiddleware — subscription status', () => {
  it('should set subscriptionStatus from org record', async () => {
    const c = createMockContext({
      env: {
        JWT_SECRET: TEST_SECRET,
        READING_MANAGER_DB: {
          prepare: vi.fn(() => ({
            bind: vi.fn(() => ({
              first: vi.fn().mockResolvedValue({
                id: 'org-1',
                is_active: 1,
                subscription_status: 'active',
              }),
            })),
          })),
        },
      },
    });
    c.set('user', { org: 'org-1' });
    c.set('userRole', 'teacher');
    c.set('organizationId', 'org-1');

    const next = vi.fn().mockResolvedValue('next');
    const middleware = tenantMiddleware();
    await middleware(c, next);

    expect(c.set).toHaveBeenCalledWith('subscriptionStatus', 'active');
    expect(next).toHaveBeenCalled();
  });

  it('should default subscriptionStatus to none when NULL', async () => {
    const c = createMockContext({
      env: {
        JWT_SECRET: TEST_SECRET,
        READING_MANAGER_DB: {
          prepare: vi.fn(() => ({
            bind: vi.fn(() => ({
              first: vi.fn().mockResolvedValue({
                id: 'org-1',
                is_active: 1,
                subscription_status: null,
              }),
            })),
          })),
        },
      },
    });
    c.set('user', { org: 'org-1' });
    c.set('userRole', 'teacher');
    c.set('organizationId', 'org-1');

    const next = vi.fn().mockResolvedValue('next');
    const middleware = tenantMiddleware();
    await middleware(c, next);

    expect(c.set).toHaveBeenCalledWith('subscriptionStatus', 'none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/tenant-middleware.test.js --testNamePattern="subscription status"`
Expected: FAIL — `subscriptionStatus` is never set on context.

- [ ] **Step 3: Implement — extend org query and set context**

In `src/middleware/tenant.js`, change the org query at line 105-106 from:

```js
const org = await db.prepare(
  'SELECT id, is_active FROM organizations WHERE id = ?'
).bind(targetOrgId).first();
```

to:

```js
const org = await db.prepare(
  'SELECT id, is_active, subscription_status FROM organizations WHERE id = ?'
).bind(targetOrgId).first();
```

Then after the `is_active` check (after line 115), before the owner-switching block, add:

```js
c.set('subscriptionStatus', org.subscription_status || 'none');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/tenant-middleware.test.js --testNamePattern="subscription status"`
Expected: PASS

- [ ] **Step 5: Run full tenant middleware test suite**

Run: `npx vitest run src/__tests__/unit/tenant-middleware.test.js`
Expected: All tests pass (existing tests unaffected — they don't mock `subscription_status` but the column defaults to `none`).

- [ ] **Step 6: Commit**

```bash
git add src/middleware/tenant.js src/__tests__/unit/tenant-middleware.test.js
git commit -m "feat: stash subscriptionStatus in tenant middleware context"
```

---

### Task 2: Add `subscriptionGate()` middleware

**Files:**
- Modify: `src/middleware/tenant.js` (add new export)
- Create: `src/__tests__/unit/subscription-gate.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/unit/subscription-gate.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { subscriptionGate } from '../../middleware/tenant.js';

const createMockContext = (overrides = {}) => {
  const store = new Map();
  return {
    req: {
      url: 'http://localhost/api/students',
      method: 'GET',
      path: '/api/students',
      ...overrides.req,
    },
    json: vi.fn((data, status) => ({ data, status })),
    set: vi.fn((key, value) => store.set(key, value)),
    get: vi.fn((key) => {
      if (overrides.context && key in overrides.context) return overrides.context[key];
      return store.get(key);
    }),
  };
};

describe('subscriptionGate', () => {
  const gate = subscriptionGate();

  describe('owner bypass', () => {
    it('should pass for owner regardless of subscription status', async () => {
      const statuses = ['cancelled', 'past_due', 'canceled', 'unpaid', 'incomplete_expired'];
      for (const status of statuses) {
        const c = createMockContext({
          context: { userRole: 'owner', subscriptionStatus: status },
          req: { url: 'http://localhost/api/students', method: 'DELETE', path: '/api/students' },
        });
        const next = vi.fn().mockResolvedValue('next');
        await gate(c, next);
        expect(next).toHaveBeenCalled();
        expect(c.json).not.toHaveBeenCalled();
      }
    });
  });

  describe('exempt paths', () => {
    const exemptPaths = [
      ['/api/auth/login', 'POST'],
      ['/api/auth/refresh', 'POST'],
      ['/api/billing/status', 'GET'],
      ['/api/billing/portal', 'POST'],
      ['/api/billing/subscription-status', 'GET'],
    ];

    exemptPaths.forEach(([path, method]) => {
      it(`should pass for ${method} ${path} even when cancelled`, async () => {
        const c = createMockContext({
          context: { userRole: 'teacher', subscriptionStatus: 'cancelled' },
          req: { url: `http://localhost${path}`, method, path },
        });
        const next = vi.fn().mockResolvedValue('next');
        await gate(c, next);
        expect(next).toHaveBeenCalled();
      });
    });

    it('should pass for POST /api/support when cancelled', async () => {
      const c = createMockContext({
        context: { userRole: 'teacher', subscriptionStatus: 'cancelled' },
        req: { url: 'http://localhost/api/support', method: 'POST', path: '/api/support' },
      });
      const next = vi.fn().mockResolvedValue('next');
      await gate(c, next);
      expect(next).toHaveBeenCalled();
    });

    it('should NOT exempt GET /api/support when cancelled', async () => {
      const c = createMockContext({
        context: { userRole: 'teacher', subscriptionStatus: 'cancelled' },
        req: { url: 'http://localhost/api/support', method: 'GET', path: '/api/support' },
      });
      const next = vi.fn();
      await gate(c, next);
      expect(next).not.toHaveBeenCalled();
      expect(c.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'SUBSCRIPTION_CANCELLED' }),
        403,
      );
    });
  });

  describe('allowed statuses', () => {
    const allowed = [null, undefined, 'none', 'trialing', 'active'];
    allowed.forEach((status) => {
      it(`should pass for status "${status}"`, async () => {
        const c = createMockContext({
          context: { userRole: 'teacher', subscriptionStatus: status || 'none' },
          req: { url: 'http://localhost/api/students', method: 'POST', path: '/api/students' },
        });
        const next = vi.fn().mockResolvedValue('next');
        await gate(c, next);
        expect(next).toHaveBeenCalled();
      });
    });
  });

  describe('past_due — read-only mode', () => {
    it('should allow GET requests', async () => {
      const c = createMockContext({
        context: { userRole: 'teacher', subscriptionStatus: 'past_due' },
        req: { url: 'http://localhost/api/students', method: 'GET', path: '/api/students' },
      });
      const next = vi.fn().mockResolvedValue('next');
      await gate(c, next);
      expect(next).toHaveBeenCalled();
    });

    it('should allow HEAD requests', async () => {
      const c = createMockContext({
        context: { userRole: 'teacher', subscriptionStatus: 'past_due' },
        req: { url: 'http://localhost/api/students', method: 'HEAD', path: '/api/students' },
      });
      const next = vi.fn().mockResolvedValue('next');
      await gate(c, next);
      expect(next).toHaveBeenCalled();
    });

    const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    writeMethods.forEach((method) => {
      it(`should block ${method} requests with SUBSCRIPTION_PAST_DUE`, async () => {
        const c = createMockContext({
          context: { userRole: 'teacher', subscriptionStatus: 'past_due' },
          req: { url: 'http://localhost/api/students', method, path: '/api/students' },
        });
        const next = vi.fn();
        await gate(c, next);
        expect(next).not.toHaveBeenCalled();
        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'SUBSCRIPTION_PAST_DUE' }),
          403,
        );
      });
    });
  });

  describe('cancelled — fully blocked', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
    methods.forEach((method) => {
      it(`should block ${method} requests with SUBSCRIPTION_CANCELLED`, async () => {
        const c = createMockContext({
          context: { userRole: 'teacher', subscriptionStatus: 'cancelled' },
          req: { url: 'http://localhost/api/students', method, path: '/api/students' },
        });
        const next = vi.fn();
        await gate(c, next);
        expect(next).not.toHaveBeenCalled();
        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'SUBSCRIPTION_CANCELLED' }),
          403,
        );
      });
    });
  });

  describe('unknown Stripe statuses default to blocked', () => {
    const unknownStatuses = ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'];
    unknownStatuses.forEach((status) => {
      it(`should block for unknown status "${status}"`, async () => {
        const c = createMockContext({
          context: { userRole: 'teacher', subscriptionStatus: status },
          req: { url: 'http://localhost/api/students', method: 'GET', path: '/api/students' },
        });
        const next = vi.fn();
        await gate(c, next);
        expect(next).not.toHaveBeenCalled();
        expect(c.json).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'SUBSCRIPTION_CANCELLED' }),
          403,
        );
      });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/unit/subscription-gate.test.js`
Expected: FAIL — `subscriptionGate` is not exported from tenant.js

- [ ] **Step 3: Implement `subscriptionGate()`**

Add to `src/middleware/tenant.js` after the `tenantMiddleware` function (after line 129):

```js
// Paths exempt from subscription gating (separate from PUBLIC_PATHS which controls JWT auth)
const SUBSCRIPTION_EXEMPT_PREFIXES = ['/api/auth/', '/api/billing/'];

/**
 * Subscription Access Control Middleware
 * Gates app access based on organization subscription status.
 *
 * - Owner role: always exempt (godmode)
 * - Allowed statuses: none, trialing, active — full access
 * - past_due: read-only (GET/HEAD only)
 * - cancelled / unknown: fully blocked
 * - Exempt paths: auth, billing, support POST
 *
 * Must be used after tenantMiddleware (reads subscriptionStatus from context).
 */
export function subscriptionGate() {
  return async (c, next) => {
    // 1. Owner is always exempt
    if (c.get('userRole') === 'owner') return next();

    // 2. Check exempt paths
    const path = c.req.path;
    if (SUBSCRIPTION_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) return next();
    if (path === '/api/support' && c.req.method === 'POST') return next();

    // 3. Read status (set by tenantMiddleware)
    const status = c.get('subscriptionStatus') || 'none';

    // 4. Allowlist — these statuses get full access
    const ALLOWED = new Set(['none', 'trialing', 'active']);
    if (ALLOWED.has(status)) return next();

    // 5. past_due — read-only
    if (status === 'past_due') {
      if (c.req.method === 'GET' || c.req.method === 'HEAD') return next();
      return c.json(
        {
          error: 'Your subscription payment is overdue. The app is in read-only mode until payment is resolved.',
          code: 'SUBSCRIPTION_PAST_DUE',
        },
        403,
      );
    }

    // 6. cancelled or any unknown status — fully blocked
    return c.json(
      {
        error: 'Your subscription has been cancelled. Please contact support or reactivate via the billing portal.',
        code: 'SUBSCRIPTION_CANCELLED',
      },
      403,
    );
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/unit/subscription-gate.test.js`
Expected: All pass

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `npx vitest run src/__tests__/unit/tenant-middleware.test.js`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/middleware/tenant.js src/__tests__/unit/subscription-gate.test.js
git commit -m "feat: add subscriptionGate middleware for subscription access control"
```

---

### Task 3: Wire subscription gate into `worker.js`

**Files:**
- Modify: `src/worker.js:50` (import) and `src/worker.js:190-205` (after tenant middleware block)

- [ ] **Step 1: Add import**

In `src/worker.js` line 50, change:

```js
import { jwtAuthMiddleware, tenantMiddleware } from './middleware/tenant';
```

to:

```js
import { jwtAuthMiddleware, tenantMiddleware, subscriptionGate } from './middleware/tenant';
```

- [ ] **Step 2: Add middleware block**

After the tenant middleware block (after line 205 in `src/worker.js`), add:

```js
// Apply subscription access control (must be after tenant middleware sets subscriptionStatus)
app.use('/api/*', async (c, next) => {
  // Skip for public endpoints (they bypass auth entirely and never reach here with user context)
  const url = new URL(c.req.url);
  if (PUBLIC_PATHS.includes(url.pathname) || url.pathname.startsWith('/api/covers/')) {
    return next();
  }

  // Only apply if JWT auth is enabled and user is authenticated
  if (c.env.JWT_SECRET && c.get('user')) {
    return subscriptionGate()(c, next);
  }

  return next();
});
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/worker.js
git commit -m "feat: wire subscriptionGate into worker middleware chain"
```

---

### Task 4: Add `GET /api/billing/subscription-status` endpoint

**Files:**
- Modify: `src/routes/billing.js` (add new route)

- [ ] **Step 1: Write the failing test**

Add to a new file `src/__tests__/unit/billing-subscription-status.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { billingRouter } from '../../routes/billing.js';

describe('GET /api/billing/subscription-status', () => {
  it('should return subscription status for any authenticated user', async () => {
    const mockDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({
            subscription_status: 'trialing',
          }),
        })),
      })),
    };

    // Use Hono test client pattern
    const { Hono } = await import('hono');
    const app = new Hono();

    // Mock auth context
    app.use('*', async (c, next) => {
      c.set('organizationId', 'org-1');
      c.set('userRole', 'teacher');
      c.env = { READING_MANAGER_DB: mockDb };
      return next();
    });

    app.route('/api/billing', billingRouter);

    const res = await app.request('/api/billing/subscription-status');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('trialing');
  });

  it('should return none when subscription_status is NULL', async () => {
    const mockDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({
            subscription_status: null,
          }),
        })),
      })),
    };

    const { Hono } = await import('hono');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('organizationId', 'org-1');
      c.set('userRole', 'readonly');
      c.env = { READING_MANAGER_DB: mockDb };
      return next();
    });
    app.route('/api/billing', billingRouter);

    const res = await app.request('/api/billing/subscription-status');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/billing-subscription-status.test.js`
Expected: FAIL — 404 (route doesn't exist)

- [ ] **Step 3: Implement the endpoint**

Add to `src/routes/billing.js`, before the existing `billingRouter.get('/status', ...)` block:

```js
/**
 * GET /api/billing/subscription-status
 * Lightweight subscription status check for all authenticated users.
 * No role restriction — used by frontend to detect subscription blocks proactively.
 * Exempt from subscription gate (falls under /api/billing/* prefix).
 */
billingRouter.get('/subscription-status', async (c) => {
  const db = c.env.READING_MANAGER_DB;
  const organizationId = c.get('organizationId');

  const org = await db
    .prepare('SELECT subscription_status FROM organizations WHERE id = ?')
    .bind(organizationId)
    .first();

  return c.json({ status: org?.subscription_status || 'none' });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/billing-subscription-status.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/billing.js src/__tests__/unit/billing-subscription-status.test.js
git commit -m "feat: add lightweight subscription-status endpoint for all roles"
```

---

### Task 5: Normalize Stripe webhook status spelling

**Files:**
- Modify: `src/routes/stripeWebhook.js:112` (status normalization)

- [ ] **Step 1: Write the failing test**

Add to a new file `src/__tests__/unit/stripe-status-normalization.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { normalizeSubscriptionStatus } from '../../routes/stripeWebhook.js';

describe('normalizeSubscriptionStatus', () => {
  it('should convert "canceled" (American) to "cancelled" (British)', () => {
    expect(normalizeSubscriptionStatus('canceled')).toBe('cancelled');
  });

  it('should preserve "cancelled" unchanged', () => {
    expect(normalizeSubscriptionStatus('cancelled')).toBe('cancelled');
  });

  it('should pass through other statuses unchanged', () => {
    expect(normalizeSubscriptionStatus('active')).toBe('active');
    expect(normalizeSubscriptionStatus('trialing')).toBe('trialing');
    expect(normalizeSubscriptionStatus('past_due')).toBe('past_due');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/stripe-status-normalization.test.js`
Expected: FAIL — `normalizeSubscriptionStatus` is not exported

- [ ] **Step 3: Implement normalization**

In `src/routes/stripeWebhook.js`, add after the imports (around line 6):

```js
/**
 * Normalize Stripe subscription status to consistent British spelling.
 * Stripe uses 'canceled' (American); we store 'cancelled' (British).
 */
export function normalizeSubscriptionStatus(status) {
  if (status === 'canceled') return 'cancelled';
  return status;
}
```

Then at line 112 (inside the `subscription.created`/`subscription.updated` handler), change:

```js
const params = [
  obj.id,
  obj.status,
```

to:

```js
const params = [
  obj.id,
  normalizeSubscriptionStatus(obj.status),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/stripe-status-normalization.test.js`
Expected: PASS

- [ ] **Step 5: Run existing webhook tests**

Run: `npx vitest run src/__tests__/unit/webhooks.test.js`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/routes/stripeWebhook.js src/__tests__/unit/stripe-status-normalization.test.js
git commit -m "fix: normalize Stripe 'canceled' to 'cancelled' in webhook handler"
```

---

## Chunk 2: Frontend — Detection + Blocked UI

### Task 6: Add subscription block state to `AuthContext`

**Files:**
- Modify: `src/contexts/AuthContext.js`

- [ ] **Step 1: Add state and proactive fetch**

In `src/contexts/AuthContext.js`:

**a)** After the `switchingOrganization` state (around line 96), add:

```js
// Subscription block state: null (ok), 'past_due' (read-only), 'cancelled' (fully blocked)
const [subscriptionBlock, setSubscriptionBlock] = useState(null);
```

**b)** After the `fetchAvailableOrganizations` useEffect (around line 641), add a new effect to proactively fetch subscription status on auth load:

```js
// Proactively fetch subscription status on auth load (all roles except owner)
useEffect(() => {
  if (!authToken || !user || user.role === 'owner') {
    setSubscriptionBlock(null);
    return;
  }

  const checkSubscriptionStatus = async () => {
    try {
      const response = await fetchWithAuth(`${API_URL}/billing/subscription-status`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'cancelled' || data.status === 'canceled') {
          setSubscriptionBlock('cancelled');
        } else if (data.status === 'past_due') {
          setSubscriptionBlock('past_due');
        } else {
          setSubscriptionBlock(null);
        }
      }
    } catch {
      // Non-critical — reactive detection via fetchWithAuth is the fallback
    }
  };

  checkSubscriptionStatus();
}, [authToken, user, fetchWithAuth]);
```

**c)** In `fetchWithAuth` (around line 337, after the `return response;` line), add subscription block detection before returning:

```js
// Detect subscription blocks from 403 responses
if (response.status === 403) {
  try {
    const cloned = response.clone();
    const body = await cloned.json();
    if (body.code === 'SUBSCRIPTION_PAST_DUE') {
      setSubscriptionBlock('past_due');
    } else if (body.code === 'SUBSCRIPTION_CANCELLED') {
      setSubscriptionBlock('cancelled');
    }
  } catch {
    // Not a subscription error — ignore
  }
}

return response;
```

Remove the existing bare `return response;` that this replaces.

**d)** Add `isReadOnly` derived value (near the other derived values, around line 644):

```js
const isReadOnly = subscriptionBlock === 'past_due';
```

**e)** Add to the context value (in the `useMemo` around line 679):

Add `subscriptionBlock`, `isReadOnly` to both the value object and the dependency array.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/AuthContext.js
git commit -m "feat: add subscription block detection to AuthContext"
```

---

### Task 7: Create `SubscriptionBlockedScreen` component

**Files:**
- Create: `src/components/SubscriptionBlockedScreen.js`

- [ ] **Step 1: Write the component test**

Create `src/__tests__/unit/SubscriptionBlockedScreen.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ThemeProvider } from '@mui/material';
import theme from '../../styles/theme';

// Mock useAuth
const mockFetchWithAuth = vi.fn();
const mockLogout = vi.fn();
let mockUserRole = 'teacher';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    userRole: mockUserRole,
    fetchWithAuth: mockFetchWithAuth,
    logout: mockLogout,
  }),
}));

import SubscriptionBlockedScreen from '../../components/SubscriptionBlockedScreen';

const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('SubscriptionBlockedScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'teacher';
  });

  it('should show "contact your administrator" for teacher role', () => {
    renderWithTheme(<SubscriptionBlockedScreen />);
    expect(screen.getByText(/contact your school administrator/i)).toBeTruthy();
    expect(screen.queryByText(/manage billing/i)).toBeFalsy();
  });

  it('should show "Manage Billing" button for admin role', () => {
    mockUserRole = 'admin';
    renderWithTheme(<SubscriptionBlockedScreen />);
    expect(screen.getByText(/manage billing/i)).toBeTruthy();
  });

  it('should show logout button', () => {
    renderWithTheme(<SubscriptionBlockedScreen />);
    expect(screen.getByText(/log out/i)).toBeTruthy();
  });

  it('should call logout when Log Out is clicked', () => {
    renderWithTheme(<SubscriptionBlockedScreen />);
    fireEvent.click(screen.getByText(/log out/i));
    expect(mockLogout).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unit/SubscriptionBlockedScreen.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the component**

Create `src/components/SubscriptionBlockedScreen.js`:

```js
import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import TallyLogo from './TallyLogo';

export default function SubscriptionBlockedScreen() {
  const { userRole, fetchWithAuth, logout } = useAuth();
  const isAdmin = userRole === 'admin' || userRole === 'owner';

  const handleManageBilling = async () => {
    try {
      const res = await fetchWithAuth('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch {
      // Silently fail — user can retry
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        p: 3,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: 480,
          width: '100%',
          p: 5,
          borderRadius: '20px',
          textAlign: 'center',
          border: '1px solid rgba(139, 115, 85, 0.1)',
          boxShadow: '0 8px 32px rgba(139, 115, 85, 0.08)',
        }}
      >
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
          <TallyLogo size={56} />
        </Box>

        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>
          Subscription Cancelled
        </Typography>

        <Typography sx={{ mb: 4, color: 'text.secondary', lineHeight: 1.6 }}>
          {isAdmin
            ? 'Your school\'s subscription has ended. Reactivate via the billing portal to restore access.'
            : 'Your school\'s subscription has ended. Please contact your school administrator to restore access.'}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {isAdmin && (
            <Button
              variant="contained"
              onClick={handleManageBilling}
              sx={{ borderRadius: '12px', py: 1.2, textTransform: 'none', fontWeight: 600 }}
            >
              Manage Billing
            </Button>
          )}

          <Button
            variant="outlined"
            href="mailto:support@tallyreading.uk"
            sx={{ borderRadius: '12px', py: 1.2, textTransform: 'none', fontWeight: 600 }}
          >
            Contact Support
          </Button>

          <Button
            variant="text"
            onClick={logout}
            sx={{ borderRadius: '12px', py: 1, textTransform: 'none', color: 'text.secondary' }}
          >
            Log Out
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/SubscriptionBlockedScreen.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/SubscriptionBlockedScreen.js src/__tests__/unit/SubscriptionBlockedScreen.test.js
git commit -m "feat: add SubscriptionBlockedScreen component with role-aware content"
```

---

### Task 8: Wire `SubscriptionBlockedScreen` into `App.js`

**Files:**
- Modify: `src/App.js`

- [ ] **Step 1: Add import**

In `src/App.js`, add after the `BillingBanner` import (line 16):

```js
import SubscriptionBlockedScreen from './components/SubscriptionBlockedScreen';
```

- [ ] **Step 2: Add subscription block to AppContent**

In the `AppContent` function (line 96), destructure `subscriptionBlock` from `useAuth`:

```js
const { isAuthenticated, userRole, subscriptionBlock } = useAuth();
```

- [ ] **Step 3: Add gate after auth check**

After the `if (!isAuthenticated)` block (after line 219), add:

```js
if (subscriptionBlock === 'cancelled') {
  return <SubscriptionBlockedScreen />;
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.js
git commit -m "feat: gate cancelled subscriptions with SubscriptionBlockedScreen in App"
```

---

### Task 9: Final integration verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 2: Build for production**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Final commit and version bump**

Update `APP_VERSION` in `src/worker.js` (line 53) from `'3.25.2'` to the next version number based on current state.

```bash
git add src/worker.js
git commit -m "chore: bump APP_VERSION for subscription access control release"
```
