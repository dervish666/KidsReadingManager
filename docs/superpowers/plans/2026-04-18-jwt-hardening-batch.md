# JWT / Auth Hardening Batch Implementation Plan (H10, M16, M18)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three pen-test auth hardening findings (H10 JWT `alg` assertion, M16 `iss`/`aud`/`jti` claims, M18 constant-work login timing) as v3.53.0.

**Architecture:** One branch (`security/jwt-hardening`) from `main` at v3.52.0. One commit per finding, TDD each time. Release commit bumps version + CHANGELOG at the end. No migration, no env var changes, no new files.

**Tech Stack:** Cloudflare Workers + Hono, Web Crypto API (PBKDF2 + HMAC-SHA256), Vitest + happy-dom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-18-jwt-hardening-batch-design.md`
**Source report:** `audit-plans/security-pentest-report-2026-04-17.md`

---

## File Structure

**Modified files (4):**
- `src/utils/crypto.js` — H10 header assertion in `verifyAccessToken`; M16 `JWT_ISSUER`/`JWT_AUDIENCE` constants + `iss`/`aud`/`jti` injection in `createAccessToken` + validation in `verifyAccessToken`; M18 `DUMMY_PASSWORD_HASH` export.
- `src/routes/auth.js` — M18 swap `hashPassword` → `verifyPassword(password, DUMMY_PASSWORD_HASH)` in the no-user branch of `/login`.
- `src/__tests__/unit/crypto.test.js` — extend existing file with H10 + M16 tests.
- `src/__tests__/integration/auth.test.js` — extend existing login test suite with M18 assertions + update the existing `hashPassword.mockResolvedValueOnce` mock that will no longer be called.
- `CHANGELOG.md` + `package.json` — v3.53.0 release notes + version bump.

**No new files.** `crypto.test.js` already exists; the spec's worry was it might not. Confirmed present at `src/__tests__/unit/crypto.test.js` with existing `JWT Tokens` → `createAccessToken` / `verifyAccessToken` describes, which is exactly where the new tests slot in.

**No migration.** No database or schema changes.

---

## Chunk 1: Setup + Three Fixes + Release

### Task 0: Branch setup

**Files:** git only

- [ ] **Step 1: Confirm clean tree on main**

Run: `git status`
Expected: `On branch main... nothing to commit, working tree clean`.

- [ ] **Step 2: Confirm main is at v3.52.0**

Run: `git log --oneline -3`
Expected top commit: `2b00867 security: highs batch H5/H6/H11 (v3.52.0) (#2)` or a later commit on main. If behind, `git pull` first.

Also sanity-check: `grep '"version"' package.json | head -1` → `"version": "3.52.0",`.

- [ ] **Step 3: Create and switch to the hardening branch**

Run: `git checkout -b security/jwt-hardening`

---

### Task 1: H10 — Assert JWT `alg` and `typ` in `verifyAccessToken`

**Files:**
- Modify: `src/utils/crypto.js` (in `verifyAccessToken`, around lines 176-216)
- Modify: `src/__tests__/unit/crypto.test.js` (extend the existing `describe('verifyAccessToken')` block at ~line 131)

- [ ] **Step 1: Add the failing H10 tests**

In `src/__tests__/unit/crypto.test.js`, inside the existing `describe('verifyAccessToken', ...)` block (around line 131), add these tests. You'll need a small helper to mint a token with a custom header — the existing `createAccessToken` always writes `{alg: 'HS256', typ: 'JWT'}`, so we craft manually. Place this helper function just above the new tests, inside the `describe('verifyAccessToken')` block:

```js
// Mint a token with a caller-supplied header so we can exercise the alg/typ
// guards. Mirrors createAccessToken's signature flow but lets the test override
// the header. Imports signHS256 indirectly via `crypto.subtle` since it's not
// exported — we compute an HMAC-SHA256 signature inline.
const mintTokenWithHeader = async (header, payload, secret) => {
  const encoder = new TextEncoder();
  const base64Url = (bytes) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const encodedHeader = base64Url(encoder.encode(JSON.stringify(header)));
  const encodedPayload = base64Url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${encodedHeader}.${encodedPayload}`)
  );
  const encodedSig = base64Url(sig);
  return `${encodedHeader}.${encodedPayload}.${encodedSig}`;
};

it('should reject token with alg: none', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await mintTokenWithHeader(
    { alg: 'none', typ: 'JWT' },
    { ...testPayload, iat: now, exp: now + 900 },
    testSecret
  );
  const result = await verifyAccessToken(token, testSecret);
  expect(result.valid).toBe(false);
  expect(result.error).toBe('Unsupported JWT algorithm');
});

it('should reject token with alg: RS256', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await mintTokenWithHeader(
    { alg: 'RS256', typ: 'JWT' },
    { ...testPayload, iat: now, exp: now + 900 },
    testSecret
  );
  const result = await verifyAccessToken(token, testSecret);
  expect(result.valid).toBe(false);
  expect(result.error).toBe('Unsupported JWT algorithm');
});

it('should reject token with typ: JWE', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await mintTokenWithHeader(
    { alg: 'HS256', typ: 'JWE' },
    { ...testPayload, iat: now, exp: now + 900 },
    testSecret
  );
  const result = await verifyAccessToken(token, testSecret);
  expect(result.valid).toBe(false);
  expect(result.error).toBe('Unsupported JWT type');
});

it('should accept token with alg: HS256 and no typ claim', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await mintTokenWithHeader(
    { alg: 'HS256' },
    { ...testPayload, iat: now, exp: now + 900 },
    testSecret
  );
  const result = await verifyAccessToken(token, testSecret);
  expect(result.valid).toBe(true);
});

it('should reject token with unparseable header', async () => {
  // Prefix the token with a header segment that is not valid base64url JSON
  const validToken = await createAccessToken(testPayload, testSecret);
  const parts = validToken.split('.');
  const mangledToken = `!!!not-base64!!!.${parts[1]}.${parts[2]}`;
  const result = await verifyAccessToken(mangledToken, testSecret);
  expect(result.valid).toBe(false);
  expect(result.error).toBe('Invalid token header');
});
```

**Important — happy-path iss/aud note:** these H10 tests mint tokens that lack `iss`/`aud`. Pre-M16 that's fine. **After Task 2 (M16) lands**, the "alg: HS256 and no typ" test would start failing because `verifyAccessToken` will reject missing `iss`/`aud`. We'll fix this in Task 2 Step 1 by updating `mintTokenWithHeader` to default `iss`/`aud`. No action needed now — flagged here so the Task 2 step isn't a surprise.

- [ ] **Step 2: Run tests — expect 4 of 5 FAIL**

Run: `npx vitest run src/__tests__/unit/crypto.test.js -t "verifyAccessToken"`
Expected: the "alg: HS256 and no typ" test **passes** (current code ignores the header), the other 4 new tests **fail** (current code doesn't inspect the header — it returns `valid: true` for forged tokens as long as the signature check happens to pass, which for `alg: none` and `alg: RS256` it will since we're signing HS256 in the mint helper, AND for the mangled header test it fails at a later step with a different error message than `'Invalid token header'`).

**What the failure actually proves:** for the `alg: none` / `alg: RS256` / `typ: JWE` cases, the current code returns `{ valid: true }` because the signature check uses HS256 regardless of header — so the assertions that expect `valid: false` with a specific error fail. The mangled-header test fails because the current code never decodes the header, so it either passes signature check (if the attacker still signed correctly) or fails with `'Invalid signature'` rather than `'Invalid token header'`.

- [ ] **Step 3: Apply the fix to `src/utils/crypto.js`**

In `verifyAccessToken` (around line 176), immediately after the `parts.length !== 3` check and the destructuring at line 183, insert the header assertion. The edit target:

```js
const [encodedHeader, encodedPayload, encodedSignature] = parts;

// Verify signature
```

Change to:

```js
const [encodedHeader, encodedPayload, encodedSignature] = parts;

// Parse and assert header algorithm + type before trusting anything else.
// Today the signature check implicitly forces HS256, but a future refactor
// that respects header.alg would reopen algorithm-confusion attacks.
let header;
try {
  header = JSON.parse(base64UrlDecode(encodedHeader));
} catch {
  return { valid: false, error: 'Invalid token header' };
}
if (header.alg !== JWT_ALGORITHM) {
  return { valid: false, error: 'Unsupported JWT algorithm' };
}
if (header.typ && header.typ !== 'JWT') {
  return { valid: false, error: 'Unsupported JWT type' };
}

// Verify signature
```

`JWT_ALGORITHM` is already defined at line 110. `base64UrlDecode` is already used at line 203 to decode the payload, so it's available in scope.

- [ ] **Step 4: Run tests — expect all 5 PASS**

Run: `npx vitest run src/__tests__/unit/crypto.test.js -t "verifyAccessToken"`
Expected: all pass.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: 1932+ tests pass, no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/utils/crypto.js src/__tests__/unit/crypto.test.js
git commit -m "$(cat <<'EOF'
fix: assert JWT alg and typ in verifyAccessToken (H10)

verifyAccessToken forced HS256 at the signature step but never inspected
header.alg, meaning a future refactor that reads the header to dispatch
an algorithm would reopen algorithm-confusion (alg: none, alg: RS256
public-key-as-HMAC-secret). Decode and assert header.alg === 'HS256'
and header.typ ∈ {undefined, 'JWT'} before trusting the signature path.

Pen-test report: audit-plans/security-pentest-report-2026-04-17.md
EOF
)"
```

---

### Task 2: M16 — Add `iss` / `aud` / `jti` to JWT payload and validate

**Files:**
- Modify: `src/utils/crypto.js` (add constants around line 110, inject claims in `createAccessToken`, validate in `verifyAccessToken`)
- Modify: `src/__tests__/unit/crypto.test.js` (extend both the `createAccessToken` and `verifyAccessToken` describes)

- [ ] **Step 1: Update the H10 `mintTokenWithHeader` helper to include `iss`/`aud` by default**

Before writing new tests, update the helper added in Task 1 to default `iss` and `aud` so pre-existing "happy path" tokens still pass the new validation. Inside `mintTokenWithHeader`, change the payload parameter usage. Find this line in the helper:

```js
const encodedPayload = base64Url(encoder.encode(JSON.stringify(payload)));
```

And update the helper signature + body to inject defaults:

```js
const mintTokenWithHeader = async (header, payload, secret) => {
  const payloadWithDefaults = {
    iss: 'tally-reading',
    aud: 'tally-reading-api',
    ...payload,
  };
  const encoder = new TextEncoder();
  // ... (rest of helper unchanged, but the encodedPayload line uses payloadWithDefaults)
  const encodedPayload = base64Url(encoder.encode(JSON.stringify(payloadWithDefaults)));
  // ...
};
```

This keeps the H10 tests green once M16's validation lands. Individual M16 tests can override by passing `iss: null` / `aud: 'wrong-audience'` explicitly (the `...payload` spread places the override *after* the defaults).

- [ ] **Step 2: Write the failing M16 tests**

Add these inside the `describe('createAccessToken', ...)` block (around line 102) and `describe('verifyAccessToken', ...)` block (around line 131) respectively:

```js
// Inside describe('createAccessToken', ...):

it('should include iss, aud, and jti claims in payload', async () => {
  const token = await createAccessToken(testPayload, testSecret);
  const result = await verifyAccessToken(token, testSecret);
  expect(result.valid).toBe(true);
  expect(result.payload.iss).toBe('tally-reading');
  expect(result.payload.aud).toBe('tally-reading-api');
  expect(result.payload.jti).toBeDefined();
  expect(typeof result.payload.jti).toBe('string');
  expect(result.payload.jti.length).toBeGreaterThan(0);
});

it('should generate a unique jti for each call', async () => {
  const token1 = await createAccessToken(testPayload, testSecret);
  const token2 = await createAccessToken(testPayload, testSecret);
  const r1 = await verifyAccessToken(token1, testSecret);
  const r2 = await verifyAccessToken(token2, testSecret);
  expect(r1.payload.jti).toBeDefined();
  expect(r2.payload.jti).toBeDefined();
  expect(r1.payload.jti).not.toBe(r2.payload.jti);
});
```

```js
// Inside describe('verifyAccessToken', ...):

it('should reject token with wrong iss claim', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await mintTokenWithHeader(
    { alg: 'HS256', typ: 'JWT' },
    { ...testPayload, iss: 'wrong-service', iat: now, exp: now + 900 },
    testSecret
  );
  const result = await verifyAccessToken(token, testSecret);
  expect(result.valid).toBe(false);
  expect(result.error).toBe('Invalid issuer');
});

it('should reject token with wrong aud claim', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await mintTokenWithHeader(
    { alg: 'HS256', typ: 'JWT' },
    { ...testPayload, aud: 'wrong-audience', iat: now, exp: now + 900 },
    testSecret
  );
  const result = await verifyAccessToken(token, testSecret);
  expect(result.valid).toBe(false);
  expect(result.error).toBe('Invalid audience');
});

it('should reject token with missing iss claim', async () => {
  // mintTokenWithHeader defaults iss but we explicitly strip it.
  // Build the payload without using the helper's defaults: pass iss: undefined
  // won't work (the spread keeps the default), so inline the mint.
  const now = Math.floor(Date.now() / 1000);
  const rawPayload = {
    ...testPayload,
    aud: 'tally-reading-api',
    iat: now,
    exp: now + 900,
    // no iss on purpose
  };
  const encoder = new TextEncoder();
  const base64Url = (bytes) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const encodedHeader = base64Url(
    encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  );
  const encodedPayload = base64Url(encoder.encode(JSON.stringify(rawPayload)));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(testSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${encodedHeader}.${encodedPayload}`)
  );
  const token = `${encodedHeader}.${encodedPayload}.${base64Url(sig)}`;

  const result = await verifyAccessToken(token, testSecret);
  expect(result.valid).toBe(false);
  expect(result.error).toBe('Invalid issuer');
});
```

Note on the "missing iss" test: we inline the mint flow because `mintTokenWithHeader`'s `{iss: default, ...payload}` spread always produces an `iss`. If you'd rather, extract the inline mint into a second helper `mintTokenRaw(header, payload, secret)` that *doesn't* apply defaults — either works.

- [ ] **Step 3: Run tests — expect all 5 FAIL**

Run: `npx vitest run src/__tests__/unit/crypto.test.js -t "iss\|aud\|jti"`
Expected: all 5 fail. The two `createAccessToken` tests fail because `iss`/`aud`/`jti` are not yet in the payload (undefined). The three `verifyAccessToken` tests fail because the code doesn't check `iss`/`aud` — they return `{valid: true}` for wrong/missing claims.

- [ ] **Step 4: Apply the fix to `src/utils/crypto.js`**

Add module-level constants immediately after the `REFRESH_TOKEN_TTL` definition (around line 115):

```js
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// SECURITY: Standard JWT registered claims for issuer and audience.
// These identify *us* as the issuer and *this API* as the intended recipient.
// Hard-coded (not env-driven) because they identify the service, not the deploy.
const JWT_ISSUER = 'tally-reading';
const JWT_AUDIENCE = 'tally-reading-api';
```

In `createAccessToken` (around line 124), update the `tokenPayload` construction. Find:

```js
const tokenPayload = {
  ...payload,
  iat: Math.floor(now / 1000),
  exp: Math.floor((now + expiresIn) / 1000),
};
```

Replace with:

```js
const tokenPayload = {
  ...payload,
  iss: JWT_ISSUER,
  aud: JWT_AUDIENCE,
  jti: crypto.randomUUID(),
  iat: Math.floor(now / 1000),
  exp: Math.floor((now + expiresIn) / 1000),
};
```

**Important:** `iss`/`aud`/`jti` are placed between the spread and `iat`/`exp`. This means even if a caller passes `iss` or `jti` in their payload (they shouldn't, but the API is loose), our values win. Don't flip the order.

In `verifyAccessToken` (around line 202, after the expiration check), add the issuer/audience validation. Find:

```js
// Check expiration
const now = Math.floor(Date.now() / 1000);
if (payload.exp && payload.exp < now) {
  return { valid: false, error: 'Token expired' };
}

return { valid: true, payload };
```

Replace with:

```js
// Check expiration
const now = Math.floor(Date.now() / 1000);
if (payload.exp && payload.exp < now) {
  return { valid: false, error: 'Token expired' };
}

// Validate registered claims. iss/aud must match this service exactly.
// Missing claims fail closed — they indicate a token minted by an older
// version or a different issuer.
if (payload.iss !== JWT_ISSUER) {
  return { valid: false, error: 'Invalid issuer' };
}
if (payload.aud !== JWT_AUDIENCE) {
  return { valid: false, error: 'Invalid audience' };
}

return { valid: true, payload };
```

- [ ] **Step 5: Run tests — expect all 5 PASS**

Run: `npx vitest run src/__tests__/unit/crypto.test.js -t "iss\|aud\|jti"`
Expected: all pass.

- [ ] **Step 6: Run the full crypto suite**

Run: `npx vitest run src/__tests__/unit/crypto.test.js`
Expected: every test in the file passes, including the H10 tests from Task 1 (now that `mintTokenWithHeader` defaults `iss`/`aud`). If the H10 "accept alg: HS256 with no typ" test fails here, re-check Step 1 — the helper's default injection is what keeps it green.

- [ ] **Step 7: Run full suite**

Run: `npm test`
Expected: all green. **Expect the integration tests to survive** — they use `createAccessToken` → `verifyAccessToken` round-trips, so the new claims flow through symmetrically. If a test fails with `'Invalid issuer'`, it means that test mints a token manually (not via `createAccessToken`); check `integration/auth.test.js` line ~1035 area and similar spots where raw `jwt.sign` might be used. **There should be none** — the repo uses `createAccessToken` everywhere. If there are, update those helpers to include `iss: 'tally-reading', aud: 'tally-reading-api'`.

- [ ] **Step 8: Commit**

```bash
git add src/utils/crypto.js src/__tests__/unit/crypto.test.js
git commit -m "$(cat <<'EOF'
fix: add iss/aud/jti to JWT payload and validate on verify (M16)

JWT access tokens omitted the standard registered claims. Without iss
and aud, a token minted for this API would silently validate against a
second service sharing the JWT secret (no cross-service replay
boundary). Without jti, selective revocation is impossible — rotating
JWT_SECRET is the only lever, which is blast-radius-everywhere.

Adds JWT_ISSUER='tally-reading' and JWT_AUDIENCE='tally-reading-api'
as module constants (hard-coded, not env-driven, because they identify
the service not the deploy). createAccessToken injects iss/aud and a
per-token jti (crypto.randomUUID) into the payload. verifyAccessToken
rejects tokens whose iss/aud don't match ours, or where the claims are
missing entirely (fail-closed).

No migration. In-flight v3.52.0 tokens (max 15 min old) silently fail
verify and trigger the client's existing refresh flow, which mints a
new compliant token — invisible to users.

jti revocation lookup deferred to a follow-up spec; the field exists
now so the revocation work doesn't require a second token rotation.

Pen-test report: audit-plans/security-pentest-report-2026-04-17.md
EOF
)"
```

---

### Task 3: M18 — Constant-work login path for unknown email

**Files:**
- Modify: `src/utils/crypto.js` — add `DUMMY_PASSWORD_HASH` export (near the password hashing section, around line 50)
- Modify: `src/routes/auth.js` — replace `hashPassword` call in the no-user branch of `/login` (around line 420)
- Modify: `src/__tests__/integration/auth.test.js` — add timing-parity tests to the login suite + update the existing `hashPassword.mockResolvedValueOnce` call that'll no longer fire

- [ ] **Step 1: Generate the dummy hash value locally**

The precomputed value must be a real PBKDF2 output with the current `PBKDF2_ITERATIONS = 100000`. Generate it once via a throwaway Node script:

```bash
node -e "
import('./src/utils/crypto.js').then(async ({ hashPassword }) => {
  const h = await hashPassword('dummy-password-for-timing-parity');
  console.log(h);
}).catch(e => { console.error(e); process.exit(1); });
" --input-type=module
```

If that fails with an ESM/CJS mismatch error, run this instead from the repo root with Vitest's node env (it has the Web Crypto API polyfill configured):

```bash
npx vitest run --reporter=verbose -t "hashPassword generates" 2>&1 | head -5
```

…then temporarily add a `console.log(await hashPassword('dummy-password-for-timing-parity'))` line to one of the existing `hashPassword` tests, re-run, copy the output, revert the test change.

Third option (simplest): inside the `describe('hashPassword')` block in `src/__tests__/unit/crypto.test.js`, add a one-off `it.only` test that logs the hash, run it, capture output, delete the test.

Capture the output (looks like `<22-char-base64>:<44-char-base64>`). Paste it into the next step.

- [ ] **Step 2: Add `DUMMY_PASSWORD_HASH` export to `src/utils/crypto.js`**

Immediately after the `hashPassword` function definition (around line 50), add:

```js
/**
 * Precomputed PBKDF2 hash of the fixed string 'dummy-password-for-timing-parity'.
 *
 * Used by the login handler to run verifyPassword on the no-user branch so the
 * compute path is identical to the user-found branch — closes the timing
 * oracle where hashPassword (random salt) vs verifyPassword (stored salt) had
 * subtly different code shapes.
 *
 * Hard-coded rather than computed at module init so Worker cold-starts don't
 * shift the baseline for the first request. Regenerate if PBKDF2_ITERATIONS
 * changes (see hashPassword, line ~22).
 */
export const DUMMY_PASSWORD_HASH = '<paste-generated-value-from-step-1-here>';
```

**Important:** replace the placeholder with the actual hash from Step 1. Do NOT commit the placeholder.

- [ ] **Step 3: Add the failing M18 tests**

In `src/__tests__/integration/auth.test.js`, inside the login `describe` block (find `describe('POST /api/auth/login - Account Lockout', ...)` at line 142 — create a new sibling `describe` for timing parity), add:

```js
describe('POST /api/auth/login - timing parity (M18)', () => {
  it('runs verifyPassword against DUMMY_PASSWORD_HASH when user does not exist', async () => {
    const { DUMMY_PASSWORD_HASH } = await import('../../utils/crypto.js');

    const mockDB = createMockDB((sql) => {
      if (sql.includes('login_attempts') && sql.includes('COUNT')) {
        return { count: 0 };
      }
      // User not found
      if (sql.includes('users u') && sql.includes('organizations o')) {
        return null;
      }
      return null;
    });

    verifyPassword.mockResolvedValueOnce({ valid: false, needsRehash: false });

    const app = createTestApp(mockDB);
    const response = await makeRequest(app, 'POST', '/api/auth/login', {
      email: 'nonexistent@example.com',
      password: 'somepassword',
    });

    expect(response.status).toBe(401);
    // Assert verifyPassword was called with the dummy hash, not hashPassword
    expect(verifyPassword).toHaveBeenCalledWith('somepassword', DUMMY_PASSWORD_HASH);
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('runs verifyPassword against the stored user hash when user exists', async () => {
    const mockDB = createMockDB((sql) => {
      if (sql.includes('login_attempts') && sql.includes('COUNT')) {
        return { count: 0 };
      }
      if (sql.includes('users u') && sql.includes('organizations o')) {
        return {
          id: 'user-123',
          email: 'test@example.com',
          password_hash: 'stored-salt:stored-hash',
          name: 'Test User',
          role: 'teacher',
          is_active: 1,
          organization_id: 'org-456',
          org_name: 'Test School',
          org_slug: 'test-school',
          org_active: 1,
        };
      }
      return null;
    });

    verifyPassword.mockResolvedValueOnce({ valid: false, needsRehash: false });

    const app = createTestApp(mockDB);
    const response = await makeRequest(app, 'POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'wrongpassword',
    });

    expect(response.status).toBe(401);
    // Assert verifyPassword was called with the user's stored hash
    expect(verifyPassword).toHaveBeenCalledWith('wrongpassword', 'stored-salt:stored-hash');
  });
});
```

- [ ] **Step 4: Update the existing "should record failed login attempts" test**

The test at auth.test.js:259 currently asserts `hashPassword.mockResolvedValueOnce('dummy-hash')` is set up (it's on line 271 in the current file). After the fix, the no-user branch calls `verifyPassword` instead. Change:

```js
hashPassword.mockResolvedValueOnce('dummy-hash');
```

to:

```js
verifyPassword.mockResolvedValueOnce({ valid: false, needsRehash: false });
```

**Do NOT delete the test.** It still asserts the `INSERT INTO login_attempts` side effect fires, which is orthogonal to the hash-vs-verify change. Only the mock setup line changes.

- [ ] **Step 5: Run tests — expect 2 M18 tests FAIL, "should record" PASS (after mock fix)**

Run: `npx vitest run src/__tests__/integration/auth.test.js -t "timing parity\|should record failed"`
Expected:
- "timing parity" tests: both fail. The first fails because the current handler calls `hashPassword`, not `verifyPassword` with the dummy. The second passes incidentally (it was already using verifyPassword for user-found case) but is still useful as a regression guard.
- "should record failed login attempts": passes (the Step 4 mock fix already makes it correct under the new handler; until the handler changes, it was calling the wrong mock anyway).

If "should record" fails here, that's the pre-fix handler still calling `hashPassword` which is now an unmocked import. That's expected — move to Step 6.

- [ ] **Step 6: Apply the fix to `src/routes/auth.js`**

Add `DUMMY_PASSWORD_HASH` to the imports at the top of `src/routes/auth.js` (around line 11):

```js
import {
  // ... existing imports ...
  verifyPassword,
  hashPassword,
  // ... other existing imports ...
  DUMMY_PASSWORD_HASH,
} from '../utils/crypto.js';
```

Check the actual import block to see where to insert — just append `DUMMY_PASSWORD_HASH` alongside the other named imports from `crypto.js`.

Then in the `/login` handler (around line 418), change the no-user branch:

```js
// BEFORE:
if (!user) {
  // Perform a dummy hash to prevent timing-based email enumeration
  await hashPassword(password);
  await recordLoginAttempt(db, email, ipAddress, userAgent, false);
  return c.json({ error: 'Invalid email or password' }, 401);
}

// AFTER:
if (!user) {
  // Timing parity (M18): run the same verify path as the user-found case
  // against a fixed dummy hash. The result is always invalid, but the
  // PBKDF2 compute shape matches exactly — closes the hashPassword vs
  // verifyPassword code-path delta that leaked email existence.
  await verifyPassword(password, DUMMY_PASSWORD_HASH);
  await recordLoginAttempt(db, email, ipAddress, userAgent, false);
  return c.json({ error: 'Invalid email or password' }, 401);
}
```

- [ ] **Step 7: Run tests — expect all 3 PASS**

Run: `npx vitest run src/__tests__/integration/auth.test.js -t "timing parity\|should record failed"`
Expected: all three pass.

- [ ] **Step 8: Run full suite**

Run: `npm test`
Expected: all green. **Check `hashPassword` isn't still expected to be called anywhere else** — grep: `grep -n "hashPassword.mockResolvedValueOnce\|hashPassword).toHaveBeenCalled" src/__tests__/`. If any other test still expects the login handler to call `hashPassword`, update it to expect `verifyPassword`. The `hashPassword` mock *should* still be imported and called for other flows (register, password reset, password rehash in login) — don't remove the import from the test file.

- [ ] **Step 9: Commit**

```bash
git add src/utils/crypto.js src/routes/auth.js src/__tests__/integration/auth.test.js
git commit -m "$(cat <<'EOF'
fix: constant-work login for unknown email (M18)

The login handler's no-user branch called hashPassword (random salt,
fresh PBKDF2), while the user-found branch called verifyPassword
(stored salt, split+decode PBKDF2). Same cost in theory, subtly
different code shape — 420–475ms delta measured at prod edge. Future
credential-stuffing campaigns patient enough to average across many
requests could distinguish "registered email, wrong password" from
"email doesn't exist".

Fix: precomputed DUMMY_PASSWORD_HASH (hashPassword output for a fixed
string with current iteration count). No-user branch now calls
verifyPassword(password, DUMMY_PASSWORD_HASH) — same function, same
PBKDF2 path, same salt-decode cost. Constant-time comparison at the
end returns false, handler returns 401.

recordLoginAttempt stays synchronous (pen-test suggested waitUntil;
declined — creates a race with the next request's rate-limit check,
and its 1-3ms cost is noise vs 100k-iteration PBKDF2).

Pen-test report: audit-plans/security-pentest-report-2026-04-17.md
EOF
)"
```

---

### Task 4: Release — v3.53.0

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump version**

Change `"version": "3.52.0"` to `"version": "3.53.0"` in `package.json`.

- [ ] **Step 2: Prepend changelog entry**

At the top of `CHANGELOG.md` (after the `# Changelog` line), insert:

```markdown
## [3.53.0] - 2026-04-18

### Security
- **JWT header now asserts `alg` and `typ` (H10)** — `verifyAccessToken` decodes the header and rejects any token whose `alg !== 'HS256'` or whose `typ` is present but not `'JWT'`. Today's signature check implicitly forced HS256, but a future refactor that read `header.alg` would reopen algorithm-confusion (`alg: none`, `alg: RS256` with public-key-as-HMAC-secret). One-line guard, no token invalidation.
- **JWT payload adds `iss` / `aud` / `jti` with validation (M16)** — tokens now carry `iss: 'tally-reading'`, `aud: 'tally-reading-api'`, and a per-token `jti` (crypto.randomUUID). `verifyAccessToken` rejects tokens whose `iss`/`aud` don't match ours, fail-closed on missing claims. `jti` is written but not yet consulted for revocation — that lookup + table lands in a follow-up. In-flight v3.52.0 tokens fail verify on first request after deploy and the client's existing refresh flow mints a new compliant token (invisible to users).
- **Login handler uses constant-work verify for unknown emails (M18)** — the no-user branch previously called `hashPassword(password)` while the user-found branch called `verifyPassword`. Same cost in theory but different code shapes — 420–475ms delta measured at prod edge. New `DUMMY_PASSWORD_HASH` export (precomputed PBKDF2 output) lets the no-user branch call `verifyPassword(password, DUMMY_PASSWORD_HASH)` so both paths run the identical PBKDF2 + base64-decode + constant-time-compare sequence. Result is always 401. `recordLoginAttempt` stays synchronous.

### Migrations
None.
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore: v3.53.0 — JWT hardening batch (H10, M16, M18)"
```

---

### Task 5: PR + merge

- [ ] **Step 1: Push**

Run: `git push -u origin security/jwt-hardening`

- [ ] **Step 2: Open PR**

Use `gh pr create`. Title: `security: JWT hardening batch H10/M16/M18 (v3.53.0)`. Body should reference the spec, the pen-test report, each finding ID. No migration section (this batch has none).

- [ ] **Step 3: Wait for CI green, then merge**

Check CI with `gh pr checks <PR-number> --watch`. If prettier flags any files (this is common — see the v3.52.0 PR's last-minute `style:` commit), run `npx prettier --write` on the flagged files and push a fix commit. No need to preemptively format — CI will catch it.

Merge with `gh pr merge <PR-number> --squash --delete-branch`.

- [ ] **Step 4: Reset local main**

```bash
git checkout main
git fetch origin
git reset --hard origin/main
```

This catches up to the squash-merged commit. Verify: `grep '"version"' package.json | head -1` → `"version": "3.53.0",`.

- [ ] **Step 5: Deploy (pause for user confirmation)**

Run: `npm run go`

**Note to executor:** Unlike H5/H6/H11 which had a migration, this batch has no D1 change. `npm run go` will: build → apply migrations (no-op, 0051 is already remote) → deploy Worker. Confirm with user before running — deploys are still production-affecting.

Expected output ends with `Deployed kids-reading-manager triggers` and a new `Current Version ID`.

- [ ] **Step 6: Post-deploy smoke test**

- **H10:** No easy live probe (would require minting a forged `alg: none` JWT with the prod secret, which we can't do without the secret). Unit test coverage is authoritative. Skip.
- **M16:** Trigger a silent-refresh scenario from an authenticated browser session. Open the app in a logged-in tab; wait for the next `fetchWithAuth` call (or force one by navigating). The first request after deploy should hit 401 (old token rejected for missing `iss`), the client auto-refreshes, subsequent requests succeed. Check browser Network tab — expect one `/api/auth/refresh` 200 and no visible user-facing error.
- **M18:** Optional: `curl -w "\n%{time_total}\n" -X POST https://tallyreading.uk/api/auth/login -H 'Content-Type: application/json' -d '{"email":"nonexistent@example.com","password":"wrong"}'` vs the same against a known-registered email with a wrong password. Times should be within ~50ms. Not load-bearing — unit tests cover the code path.

---

## Follow-ups (not in this PR)

- **`jti` revocation lookup** — needs a `revoked_tokens` table (or KV equivalent), verify-time check, UI for "log out everywhere".
- **H9** (login rate-limit IP+email layering) — Batch 4.
- **H12** register slug `ReferenceError` — dead-code while public registration is off.
- **H7** GraphQL proxy operation allowlist.
- **M13** password reset atomic token consume.
- **M14/M15** encryption hardening batch.
- **M17** contact/signup per-email throttle + Turnstile.
- **M19** MyLogin new-user role cap.
- **M20** rate-limit fail-closed list.
- **M21** `body.classId` tenant validation.
- `trialOrg` ReferenceError in `src/routes/stripeWebhook.js:217-223`.
- Remove `run_worker_first = ["/api/*"]`.
- `rateLimit` D1 replica-lag note from H8.
