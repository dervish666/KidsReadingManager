# JWT / Auth Hardening Batch — Design (H10, M16, M18)

**Date:** 2026-04-18
**Source report:** `audit-plans/security-pentest-report-2026-04-17.md`
**Scope:** Three auth-layer findings from the pen-test that share a file surface (`src/utils/crypto.js` + `src/routes/auth.js`) and a test harness (`auth.test.js`). All latent-risk rather than actively exploitable today — the intent is to close the class of risk before it becomes exploitable via future refactor or credential-stuffing pressure.
**Target version:** v3.53.0
**Branch:** `security/jwt-hardening` from `main` at v3.52.0.

---

## Context

v3.52.0 closed the three exploitable Highs (H5, H6, H11). Next tier is auth primitives — the JWT verifier and the login timing surface. The pen-test rates these Medium/latent because today's code happens to force HS256 regardless of header, the issuer/audience claims aren't checked by anyone (so missing them breaks nothing), and the timing delta is small enough that nobody has demonstrated email enumeration at edge latency. All three bets go the wrong way as soon as the code changes shape: a future refactor that reads `header.alg`, a token shared with a second service, a credential-stuffing campaign patient enough to exploit a 50ms delta.

Packaged together because:
- **H10 + M16** both live in `verifyAccessToken` and `createAccessToken`. Changing one without the other means two PRs touching the same 100-line region with the same test harness.
- **M18** lives in the login handler but is JWT-adjacent (the handler is the only caller that creates a JWT for a user who may not exist). Same PR surface.

Explicitly **out of scope** for this batch:
- **`jti` revocation lookup** — M16 says "Validate on every verify". For now we include `jti` in the payload so the field exists, but the revocation table + verify-time lookup are a separate piece of work with its own cache/perf story.
- **H9** (per-email login rate limit) — conceptually adjacent to M18 but adds a D1 write to every login attempt. Saved for Batch 4.
- **Moving `recordLoginAttempt` to a post-response hook** — the pen-test offers this as a "consider" option for M18; we evaluate it below and decline for this PR (keeps the failed-login record visible to the 429 check for the next request in-flight).

---

## Fix-by-fix design

### H10 — Assert JWT `alg` and `typ` in `verifyAccessToken`

**Problem:** `src/utils/crypto.js:176-216` — `verifyAccessToken` splits the token into three parts and runs `signHS256` over the signature input. It never decodes or inspects `header.alg`. Today this is safe because the code path always assumes HS256. But:
- A future refactor that reads `header.alg` to pick an algorithm reopens algorithm-confusion (`alg: none`, `alg: RS256` with public-key-as-HMAC-secret).
- The verifier also doesn't check `header.typ`. Tokens with exotic `typ` values don't cause harm today but there's no reason to accept them.

**Fix:**
```js
// In verifyAccessToken, immediately after splitting parts:
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
```

Using `JWT_ALGORITHM` (already defined at line 110) rather than a string literal keeps the two sites in sync. `header.typ` is allowed to be absent (some issuers omit it) but must equal `'JWT'` when present — this is the one place we're slightly permissive, because our own `createAccessToken` always writes `typ: 'JWT'` so strict equality would pass all first-party tokens anyway. If we later want to tighten to "typ must be present" we can, but it's not where the risk is.

**Tests (extend `src/__tests__/unit/crypto.test.js` if it exists, otherwise add to `src/__tests__/integration/auth.test.js`):**
- Token with `header.alg: 'none'` — rejected with `valid: false, error: 'Unsupported JWT algorithm'`, no signature check attempted.
- Token with `header.alg: 'RS256'` — same.
- Token with `header.alg: 'HS256'` but `header.typ: 'JWE'` — rejected with `valid: false, error: 'Unsupported JWT type'`.
- Token with `header.alg: 'HS256'` and no `typ` — accepted (signature check proceeds, passes).
- Token with unparseable header base64 — rejected with `valid: false, error: 'Invalid token header'`.

**Rollout:** Zero-friction. Our own `createAccessToken` always writes `alg: 'HS256', typ: 'JWT'`, so every in-flight token already satisfies the guard. No token invalidation.

---

### M16 — Add `iss` / `aud` / `jti` to JWT payload and validate

**Problem:** `src/utils/crypto.js:300-314` (`createJWTPayload`) + `src/utils/crypto.js:124-145` (`createAccessToken`) omit the standard registered claims. Consequences:
- **No `iss`/`aud`:** if we ever add a second service (sidecar, mobile backend) sharing the JWT secret for any reason, tokens minted by one silently validate in the other. No cross-service replay boundary.
- **No `jti`:** no anchor for per-token revocation. When we do want to revoke (compromised device, user logout everywhere), we're forced to rotate `JWT_SECRET` — a blast-radius-everywhere tool.

**Fix:**

1. Introduce two env-derived constants resolved in `createJWTPayload`:
   - `JWT_ISSUER = 'tally-reading'` (hard-coded — identifies *us* as the issuer, not environment-dependent)
   - `JWT_AUDIENCE = 'tally-reading-api'` (hard-coded — identifies *which service* the token is for)

   Both live as module-level constants in `crypto.js`. No env vars — schools don't configure these, and varying them per-deploy breaks multi-Worker setups.

2. In `createAccessToken`, inject the three claims into the payload *before* signing, not into `createJWTPayload`:
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
   Reason for doing it here rather than in `createJWTPayload`: `jti` must be unique per-token, and `createJWTPayload` can legitimately be called to produce a reference payload for tests/comparisons. Keeping the per-token claims in `createAccessToken` avoids accidentally sharing a `jti` across two tokens (which would happen if a caller memoized the payload).

3. In `verifyAccessToken`, after the expiration check, add:
   ```js
   if (payload.iss !== JWT_ISSUER) {
     return { valid: false, error: 'Invalid issuer' };
   }
   if (payload.aud !== JWT_AUDIENCE) {
     return { valid: false, error: 'Invalid audience' };
   }
   ```
   No `jti` check in this PR — see "Out of scope" above.

**Rollout — the 15-minute grace problem:**

Tokens minted by v3.52.0 lack `iss`/`aud`. Once v3.53.0 deploys, those in-flight access tokens (max 15 min old) would all reject. Refresh tokens still work — the client's next `fetchWithAuth` 401 triggers an automatic refresh, which mints a new token that has the claims. So worst case: every active user gets one 401-then-refresh cycle in their first request after deploy, invisible to them.

No *real* downside, but we can avoid even that blip with a one-version grace:

- **v3.53.0:** `createAccessToken` writes `iss`/`aud`/`jti`. `verifyAccessToken` warns (via `console.warn`) if `iss` or `aud` are missing/wrong, but does **not** reject. Strict rejection lands in v3.54.0 after 15 min * N deploys' worth of confidence that new tokens are flowing.

Decision: **skip the grace window.** The refresh-token silent recovery makes it cosmetic, and two-PR-sequenced rollouts for a Medium are over-engineered. Ship strict rejection in v3.53.0. If we see refresh-storm symptoms in the deploy dashboard we already have `invalidateOrgStatus` wired for emergency rollback patterns.

**Tests:**
- `createAccessToken` output contains `iss`, `aud`, `jti` claims with the expected values.
- Each call to `createAccessToken` produces a different `jti` (assert two sequential calls produce distinct `jti`).
- `verifyAccessToken` rejects a token whose payload has `iss: 'wrong-service'` with `error: 'Invalid issuer'`.
- `verifyAccessToken` rejects a token whose payload has `aud: 'wrong-audience'` with `error: 'Invalid audience'`.
- `verifyAccessToken` rejects a token missing `iss` entirely (treated as `iss !== JWT_ISSUER`).
- Happy path: a token minted by `createAccessToken` verifies successfully via `verifyAccessToken`.

**Rollout:** No migration. No env vars. In-flight 15-min access tokens silently refreshed on next 401 (existing `fetchWithAuth` behaviour).

---

### M18 — Constant-work login path for unknown email

**Problem:** `src/routes/auth.js:418-430`. When the email doesn't exist:
1. `hashPassword(password)` (PBKDF2 derive, random salt)
2. `recordLoginAttempt(db, email, ipAddress, userAgent, false)` (D1 INSERT)
3. Return 401.

When the email exists, wrong password:
1. `verifyPassword(password, user.password_hash)` — splits the stored `salt:hash`, imports the salt, runs PBKDF2 derive with that salt, constant-time-compares.
2. `recordLoginAttempt(db, email, ipAddress, userAgent, false)` (D1 INSERT).
3. Return 401.

Compute cost difference:
- `hashPassword` generates a random salt (cheap) and runs one PBKDF2 derive.
- `verifyPassword` calls `verifyPasswordWithIterations` which runs one PBKDF2 derive on a salt parsed from base64 (negligible extra work).

In practice both should be ~identical (dominated by the 100k-iteration PBKDF2). The pen-test measured 420-475 ms wrong-password vs non-existent-email. At Cloudflare edge jitter of ±50 ms this is noise, but the delta is structural: `hashPassword` allocates a 16-byte random salt; `verifyPassword` decodes a stored base64 salt. Different code paths = different optimizer inlining = different microbenchmarks.

**Fix:** Use a precomputed dummy hash for the no-user branch so both branches run the same code path:

1. Add a module-level dummy hash in `crypto.js`:
   ```js
   // Precomputed PBKDF2 hash of the fixed string 'dummy-password-for-timing-parity'.
   // Used by the login handler to run verifyPassword on the no-user branch so the
   // compute path is identical to the user-found branch. The value is hard-coded
   // (not computed at module init) so Worker cold-starts don't shift the timing
   // baseline for the first request.
   export const DUMMY_PASSWORD_HASH = '<precomputed-base64-salt>:<precomputed-base64-hash>';
   ```

   The actual value is generated once locally by running `hashPassword('dummy-password-for-timing-parity')` and pasting the output. This MUST be regenerated if `PBKDF2_ITERATIONS` changes (the old-iteration-count path in `verifyPasswordWithIterations` would return `needsRehash: true` otherwise, which doesn't break anything but is untidy).

2. Replace the login handler's no-user branch:
   ```js
   // Before:
   if (!user) {
     await hashPassword(password);
     await recordLoginAttempt(db, email, ipAddress, userAgent, false);
     return c.json({ error: 'Invalid email or password' }, 401);
   }

   // After:
   if (!user) {
     // Timing parity: run the same verify path as user-found case against a fixed hash.
     // Result is always 'invalid' but the PBKDF2 compute cost and branch shape match.
     await verifyPassword(password, DUMMY_PASSWORD_HASH);
     await recordLoginAttempt(db, email, ipAddress, userAgent, false);
     return c.json({ error: 'Invalid email or password' }, 401);
   }
   ```

3. `recordLoginAttempt` position unchanged. The pen-test suggests moving it to a post-response hook (`c.executionCtx.waitUntil`), but:
   - The `authRateLimit` middleware checks `rate_limits` table at the *start* of the next request. Moving the write to `waitUntil` introduces a race where a rapid attacker sees N+1 attempts before the Nth is persisted.
   - The compute cost of the INSERT is ~1-3 ms — well below PBKDF2 noise.
   - So the timing oracle it allegedly leaks is swamped by the PBKDF2 work we've now made constant. Leave it synchronous.

**Tests (extend existing `src/__tests__/integration/auth.test.js` login suite):**
- Login with non-existent email: response is 401, `DUMMY_PASSWORD_HASH` was the verify target (assert via `verifyPassword` spy's first call args).
- Login with existent email + wrong password: response is 401, user's `password_hash` was the verify target.
- Login happy path still succeeds (regression).

**Rollout:** No migration. No env vars. The dummy hash is a module constant — no runtime cost.

---

## File structure

**Modified files (3):**
- `src/utils/crypto.js` — H10 header assertion in `verifyAccessToken`; M16 `JWT_ISSUER`/`JWT_AUDIENCE` constants, `iss`/`aud`/`jti` injection in `createAccessToken`, `iss`/`aud` validation in `verifyAccessToken`; M18 `DUMMY_PASSWORD_HASH` export.
- `src/routes/auth.js` — M18 swap `hashPassword` → `verifyPassword(password, DUMMY_PASSWORD_HASH)` in the no-user branch of the `/login` handler.
- `CHANGELOG.md` + `package.json` — v3.53.0 release notes + version bump (one commit at the end, as before).

**Test files (2):**
- `src/__tests__/integration/auth.test.js` — extend login suite with M18 timing-parity assertions.
- `src/__tests__/unit/crypto.test.js` — create if absent; H10 header-assertion tests + M16 claims tests. `crypto.js` is pure compute with no DB/env dependencies, so unit tests are the right level.

**New files (1):**
- `src/__tests__/unit/crypto.test.js` (if not already present — check before creating).

**No migrations.** No database changes.

---

## Tests (rollup)

- **H10:** 5 new unit tests in `crypto.test.js` covering `alg: none`, `alg: RS256`, `typ: JWE`, missing `typ`, malformed header.
- **M16:** 6 new unit tests in `crypto.test.js` covering claim presence, `jti` uniqueness, `iss`/`aud` mismatch rejection, missing `iss`, happy-path round-trip.
- **M18:** 3 new assertions in the existing `auth.test.js` login suite (no-user-verify-target, user-verify-target, happy-path-regression).

Full suite must still pass. Expect ~1946 tests after this batch (1932 + 14 new).

---

## Rollout plan

1. Branch from main at v3.52.0.
2. Three commits, one per finding, TDD each time.
3. One release commit (version + CHANGELOG).
4. Single PR, squash-merge.
5. `npm run go` — no migration, pure code deploy.
6. No pre-deploy safety check needed (no data mutation).
7. Post-deploy smoke:
   - Hit `/api/health` with a valid JWT minted by v3.52.0 (within 15 min of deploy) — expect 401, then the client's refresh-and-retry succeeds with a new v3.53.0 token.
   - Hit `/api/auth/login` with a non-existent email — expect 401 and a response time within ±50 ms of a wrong-password login (can eyeball in browser devtools; optional).

---

## Deferred to follow-up PRs

- **`jti` revocation lookup** — needs a `revoked_tokens` table (or KV equivalent), verify-time check, UI for "log out everywhere". Sized for its own spec.
- **H9 login rate-limit IP+email layering + Turnstile** — product decision on Turnstile, separate PR.
- **M17 contact/signup per-email throttle + Turnstile** — same Turnstile dependency.
- **Post-response `recordLoginAttempt`** — declined above; revisit if login latency becomes a real user complaint.
