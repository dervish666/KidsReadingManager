# Encryption Hardening Batch Implementation Plan (M14, M15)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two pen-test encryption-layer findings (M14 fail-closed on plaintext reads, M15 warn when `ENCRYPTION_KEY` falls back to `JWT_SECRET` in production) as v3.54.0.

**Architecture:** One branch (`security/encryption-hardening`) from `main` at v3.53.0. One commit per finding, TDD. Release commit at the end. No new files, no migration. Includes a **post-deploy ops step** the user must run (`wrangler secret put ENCRYPTION_KEY`) to silence the M15 warning — this is the blast-radius-reduction work; actual key rotation is a follow-up spec.

**Tech Stack:** Cloudflare Workers + Hono, Web Crypto API (AES-GCM + HKDF), Vitest + happy-dom. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-18-encryption-hardening-batch-design.md`
**Source report:** `audit-plans/security-pentest-report-2026-04-17.md`

**Pre-flight check already done (2026-04-18):** production D1 was audited — zero plaintext rows across all three encrypted columns (`organizations.wonde_school_token`, `platform_ai_keys.api_key_encrypted`, `metadata_config.hardcover_api_key_encrypted`). Legacy `iv:ciphertext` format still decrypts correctly. Fail-closed is safe without a migration. If >24h elapses between this audit and the deploy, re-run the audit queries in the spec before shipping.

---

## File Structure

**Modified files (3):**
- `src/utils/crypto.js` — M14 replace plaintext-pass-through with throw in `decryptSensitiveData` (~line 633); M15 add module-scoped warn flag + production-conditional log in `getEncryptionSecret` (~line 583).
- `src/__tests__/unit/security-audit.test.js` — rewrite the "pass through legacy unencrypted" test as the fail-closed assertion; add legacy `iv:ciphertext` regression test; add a new `describe('getEncryptionSecret')` block; add `getEncryptionSecret` to imports.
- `CHANGELOG.md` + `package.json` — v3.54.0 release notes (including prominent post-deploy ops step) + version bump.

**No new files.** No migration. No env var requirement changes.

---

## Chunk 1: Setup + Two Fixes + Release

### Task 0: Branch setup

**Files:** git only

- [ ] **Step 1: Confirm clean tree on main at v3.53.0**

Run: `git status && git log --oneline -1 && grep '"version"' package.json | head -1`
Expected: `On branch main... nothing to commit, working tree clean`; top commit mentions v3.53.0 or is later; version string is `"version": "3.53.0",`. If behind, `git pull origin main` first.

- [ ] **Step 2: Re-run the production data audit (if >24h since plan written)**

The spec's "zero plaintext rows" finding is the load-bearing evidence for shipping M14 fail-closed without a migration. If this plan is being executed more than ~24 hours after the spec was written (2026-04-18), re-verify:

```bash
npx wrangler d1 execute reading-manager-db --remote --command "SELECT 'organizations.wonde_school_token' as col, SUM(CASE WHEN wonde_school_token NOT LIKE '%:%' THEN 1 ELSE 0 END) as plaintext_count FROM organizations WHERE wonde_school_token IS NOT NULL UNION ALL SELECT 'platform_ai_keys.api_key_encrypted', SUM(CASE WHEN api_key_encrypted NOT LIKE '%:%' THEN 1 ELSE 0 END) FROM platform_ai_keys WHERE api_key_encrypted IS NOT NULL UNION ALL SELECT 'metadata_config.hardcover_api_key_encrypted', SUM(CASE WHEN hardcover_api_key_encrypted NOT LIKE '%:%' THEN 1 ELSE 0 END) FROM metadata_config WHERE hardcover_api_key_encrypted IS NOT NULL"
```

Expected: every row has `plaintext_count = 0`. If ANY column reports >0, **stop and escalate to the human** — it means a write path produced plaintext since the audit, the fail-closed change would break reads for that row, and a migration is required before shipping.

- [ ] **Step 3: Create and switch to the hardening branch**

Run: `git checkout -b security/encryption-hardening`

---

### Task 1: M14 — Fail-closed on missing ciphertext separator

**Files:**
- Modify: `src/utils/crypto.js` (in `decryptSensitiveData`, ~lines 629-640)
- Modify: `src/__tests__/unit/security-audit.test.js` — rewrite the existing "legacy unencrypted" test (~lines 314-320), add legacy-format regression test

- [ ] **Step 1: Rewrite the existing pass-through test as the fail-closed test**

In `src/__tests__/unit/security-audit.test.js`, find the test at lines 314-320 (inside `describe('Encrypt/Decrypt Round-Trip', ...)`):

```js
it('should pass through legacy unencrypted data (no colon separator) unchanged', async () => {
  const legacyPlaintext = 'sk-old-api-key-without-encryption';
  const result = await decryptSensitiveData(legacyPlaintext, testSecret);
  expect(result).toBe(legacyPlaintext);
});
```

Replace with:

```js
it('should throw on colon-less input (fail-closed plaintext rejection, M14)', async () => {
  const plaintextLooking = 'sk-old-api-key-without-encryption';
  await expect(decryptSensitiveData(plaintextLooking, testSecret)).rejects.toThrow(
    'Invalid encrypted data format (no separator)'
  );
});
```

- [ ] **Step 2: Add the legacy-format regression test**

Immediately after the rewritten test above, add:

```js
it('still decrypts legacy iv:ciphertext format (no enc: prefix)', async () => {
  // Manually produce a legacy-format payload by encrypting with the current
  // path then stripping the 'enc:' prefix. This simulates rows written before
  // the v3.49.0 migration to the prefixed format — we must still be able to
  // read them after M14 tightens the no-separator guard.
  const encrypted = await encryptSensitiveData('legacy-token', testSecret);
  const legacyFormat = encrypted.replace(/^enc:/, '');
  const result = await decryptSensitiveData(legacyFormat, testSecret);
  expect(result).toBe('legacy-token');
});
```

- [ ] **Step 3: Run tests — expect 1 FAIL, 1 PASS**

Run: `npx vitest run src/__tests__/unit/security-audit.test.js -t "fail-closed plaintext rejection|legacy iv:ciphertext"`

Expected:
- "fail-closed plaintext rejection" **fails**: the current code returns the plaintext unchanged with a `console.warn`, it does not throw.
- "legacy iv:ciphertext format" **passes**: the existing code already handles this branch (splits `iv:ciphertext` when the `enc:` prefix is absent).

- [ ] **Step 4: Apply the fix to `src/utils/crypto.js`**

Find the block at `decryptSensitiveData` lines 633-640:

```js
if (!encryptedData.includes(':')) {
  // Flag plaintext reads so we can detect fields that escaped encryption.
  // Scheduled for fail-closed conversion once production telemetry is clean.
  console.warn(
    `[crypto] decryptSensitiveData plaintext fallback fired (length=${encryptedData.length})`
  );
  return encryptedData;
}
```

Replace with:

```js
if (!encryptedData.includes(':')) {
  // Hard-fail. A read without a separator means a write bug stored
  // plaintext in an encrypted column — we want that to surface as a
  // decrypt error, not silently leak unencrypted data through the read
  // path. Production audit at v3.54.0 confirmed zero plaintext rows
  // across all encrypted columns, so this is safe to ship without a
  // migration. If this fires post-deploy, investigate the write path
  // that produced the plaintext.
  throw new Error('Invalid encrypted data format (no separator)');
}
```

- [ ] **Step 5: Run tests — expect both PASS**

Run: `npx vitest run src/__tests__/unit/security-audit.test.js -t "fail-closed plaintext rejection|legacy iv:ciphertext"`
Expected: both pass.

- [ ] **Step 6: Run the full Encrypt/Decrypt Round-Trip suite**

Run: `npx vitest run src/__tests__/unit/security-audit.test.js -t "Encrypt/Decrypt Round-Trip"`
Expected: every test in the block passes. The "different secret" test at ~line 305 is the one most likely to regress if the error path shape changed — it should still `.rejects.toThrow()`.

- [ ] **Step 7: Run full suite**

Run: `npm test`
Expected: 1944+ tests pass, no regressions. **Watch for any test that exercised the plaintext fallback indirectly** — grep `src/__tests__` for `plaintext fallback` or mocked decrypt that returned strings without `:`. None expected (per code inspection of mocks).

- [ ] **Step 8: Commit**

```bash
git add src/utils/crypto.js src/__tests__/unit/security-audit.test.js
git commit -m "$(cat <<'EOF'
fix: fail-closed on plaintext reads in decryptSensitiveData (M14)

The legacy fallback returned colon-less input as plaintext with a warn
log — the warn shipped in v3.49.0 to surveil for plaintext rows that
escaped the encrypt path, on the plan of converting to fail-closed
once telemetry was clean. Production audit at v3.54.0 showed zero
plaintext rows across all three encrypted columns (wonde_school_token,
platform_ai_keys.api_key_encrypted, metadata_config.hardcover_api_key_encrypted),
so the fallback is removed: a read without a separator now throws.

If this fires post-deploy, a write path is storing plaintext in an
encrypted column. Callers already log decrypt errors via Sentry.

Legacy iv:ciphertext format (no enc: prefix) still decrypts — that
branch is unchanged, regression test added.

Pen-test report: audit-plans/security-pentest-report-2026-04-17.md
EOF
)"
```

---

### Task 2: M15 — Warn when `ENCRYPTION_KEY` absent in production

**Files:**
- Modify: `src/utils/crypto.js` (add module-scoped warn flag + update `getEncryptionSecret`, ~lines 583-585)
- Modify: `src/__tests__/unit/security-audit.test.js` — add `getEncryptionSecret` to imports, add a new describe block with three tests

- [ ] **Step 1: Add `getEncryptionSecret` to test imports**

In `src/__tests__/unit/security-audit.test.js`, line 10:

```js
// Before:
import { encryptSensitiveData, decryptSensitiveData } from '../../utils/crypto.js';

// After:
import {
  encryptSensitiveData,
  decryptSensitiveData,
  getEncryptionSecret,
} from '../../utils/crypto.js';
```

- [ ] **Step 2: Add the failing `getEncryptionSecret` tests**

Add a new describe block at the very end of the file (after the last existing describe — likely `Settings Prototype Pollution Guard` at line 457). Don't put it inside an existing describe:

```js
// ============================================================================
// getEncryptionSecret (M15)
// ============================================================================

describe('getEncryptionSecret', () => {
  it('prefers ENCRYPTION_KEY when set', () => {
    expect(getEncryptionSecret({ ENCRYPTION_KEY: 'dedicated', JWT_SECRET: 'jwt' })).toBe(
      'dedicated'
    );
  });

  it('falls back to JWT_SECRET when ENCRYPTION_KEY is absent', () => {
    expect(getEncryptionSecret({ JWT_SECRET: 'jwt' })).toBe('jwt');
  });

  it('falls back to JWT_SECRET when ENCRYPTION_KEY is empty string', () => {
    expect(getEncryptionSecret({ ENCRYPTION_KEY: '', JWT_SECRET: 'jwt' })).toBe('jwt');
  });
});
```

- [ ] **Step 3: Run tests — expect all 3 PASS**

Run: `npx vitest run src/__tests__/unit/security-audit.test.js -t "getEncryptionSecret"`
Expected: all three pass **before the code change** — the current implementation (`env.ENCRYPTION_KEY || env.JWT_SECRET`) already satisfies all three assertions. These tests are **regression guards** for the behaviour contract; they must continue to pass after the warn logic is added.

Note: these are not TDD failing-first tests. The warn itself isn't asserted by these tests (module-scoped state + `console.warn` is painful to assert cleanly and the behaviour is trivial — per the spec). They pin the decision matrix, not the logging.

- [ ] **Step 4: Apply the fix to `src/utils/crypto.js`**

Find at `src/utils/crypto.js` lines 583-585:

```js
export function getEncryptionSecret(env) {
  return env.ENCRYPTION_KEY || env.JWT_SECRET;
}
```

Replace with (and add the module-scoped flag **immediately above** the function):

```js
// Module-scoped flag: warn once per Worker instance, not per-call, so a
// busy handler doesn't spam logs. Reset on cold-start, which is the signal
// that the ENCRYPTION_KEY config is still missing.
let _encryptionKeyWarnLogged = false;

export function getEncryptionSecret(env) {
  if (!env.ENCRYPTION_KEY) {
    if (env.ENVIRONMENT === 'production' && !_encryptionKeyWarnLogged) {
      console.warn(
        '[crypto] ENCRYPTION_KEY not set — falling back to JWT_SECRET. ' +
          'Set a dedicated ENCRYPTION_KEY to limit blast radius of a ' +
          'JWT_SECRET leak. See CHANGELOG v3.54.0 for ops step.'
      );
      _encryptionKeyWarnLogged = true;
    }
    return env.JWT_SECRET;
  }
  return env.ENCRYPTION_KEY;
}
```

- [ ] **Step 5: Run tests — expect all 3 still PASS**

Run: `npx vitest run src/__tests__/unit/security-audit.test.js -t "getEncryptionSecret"`
Expected: all three pass. If "falls back to JWT_SECRET when ENCRYPTION_KEY is absent" fails with an `env.ENVIRONMENT` undefined error, the fix has a bug — the `env.ENVIRONMENT === 'production'` check should be tolerant of missing `ENVIRONMENT`. Re-read the Step 4 code and confirm it uses `===` not `!==`.

- [ ] **Step 6: Run full suite**

Run: `npm test`
Expected: all green. This change is near-zero blast radius — no existing caller's behaviour changes. If something does fail, it's likely because a test harness's mock env lacks `ENVIRONMENT` and the test's console output changed; the warn fires exactly once in the first test that triggers it, per-process.

- [ ] **Step 7: Prettier check**

Run: `npx prettier --check "src/**/*.js"`
Expected: clean. If anything flags, run `npx prettier --write` on the flagged file and re-check.

- [ ] **Step 8: Commit**

```bash
git add src/utils/crypto.js src/__tests__/unit/security-audit.test.js
git commit -m "$(cat <<'EOF'
fix: warn when ENCRYPTION_KEY falls back to JWT_SECRET in production (M15)

getEncryptionSecret silently returned env.JWT_SECRET when ENCRYPTION_KEY
was absent. Production currently runs on this fallback — every Wonde
token and AI API key in D1 is protected by the same secret that signs
JWTs, so a JWT_SECRET leak decrypts all encrypted data.

Log a warn once per cold-start when the fallback fires in production.
Fallback behaviour is preserved — removing it now would break existing
encrypted data that was written under JWT_SECRET. Ops step to silence
the warning: wrangler secret put ENCRYPTION_KEY (set to the current
JWT_SECRET value so nothing changes on the crypto side; true key
rotation is a follow-up spec).

Hard-fail enforcement is deferred to a follow-up PR that lands after
the ops step is confirmed done across all envs.

Pen-test report: audit-plans/security-pentest-report-2026-04-17.md
EOF
)"
```

---

### Task 3: Release — v3.54.0

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump version**

Change `"version": "3.53.0"` to `"version": "3.54.0"` in `package.json`.

- [ ] **Step 2: Prepend changelog entry**

At the top of `CHANGELOG.md` (after `# Changelog`), insert the block below. The ops step at the end is **load-bearing** — without it, production logs will surface the M15 warn every cold-start.

```markdown
## [3.54.0] - 2026-04-18

### Security
- **`decryptSensitiveData` fails closed on plaintext reads (M14)** — the legacy pass-through that returned colon-less input as plaintext (with a warn since v3.49.0) is removed. A read without a separator now throws. Production audit confirmed zero plaintext rows across all encrypted columns (`organizations.wonde_school_token`, `platform_ai_keys.api_key_encrypted`, `metadata_config.hardcover_api_key_encrypted`), so the change is safe without a migration. Legacy `iv:ciphertext` format (no `enc:` prefix) still decrypts — regression test added.
- **`getEncryptionSecret` warns when falling back to `JWT_SECRET` in production (M15)** — today's behaviour is `env.ENCRYPTION_KEY || env.JWT_SECRET` with no signal, and production is currently running on the fallback, so a JWT_SECRET leak decrypts every encrypted field. Adds a once-per-cold-start `console.warn` when the fallback fires in `env.ENVIRONMENT === 'production'`. Fallback behaviour is preserved for this release — removing it would break decrypts of existing data. True blast-radius reduction (key rotation via re-encryption migration) is a separate follow-up spec.

### Ops step (required after deploy)
Set `ENCRYPTION_KEY` to the current `JWT_SECRET` value to silence the M15 warning:
```bash
npx wrangler secret put ENCRYPTION_KEY
# Paste the current JWT_SECRET value when prompted
```
This leaves crypto behaviour unchanged (same key for signing and encryption) but sets up the follow-up key-rotation work, which will re-encrypt fields under a fresh `ENCRYPTION_KEY` distinct from `JWT_SECRET`.

### Migrations
None.
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore: v3.54.0 — encryption hardening batch (M14, M15)"
```

---

### Task 4: PR + merge + deploy + ops step

- [ ] **Step 1: Prettier check before push**

Run: `npx prettier --check "src/**/*.js"`
Expected: clean. Fix any flags via `npx prettier --write` and re-check before pushing.

- [ ] **Step 2: Push**

Run: `git push -u origin security/encryption-hardening`

- [ ] **Step 3: Open PR**

Use `gh pr create`. Title: `security: encryption hardening batch M14/M15 (v3.54.0)`. Body must reference the spec, the pen-test report, both finding IDs, and **prominently call out the post-merge ops step** (`wrangler secret put ENCRYPTION_KEY`) so a future reviewer sees the full picture.

Suggested body structure:

```markdown
## Summary

Two encryption-layer pen-test findings as v3.54.0.

- **M14** — `decryptSensitiveData` fails closed on plaintext reads. Production audit showed zero plaintext rows, so no migration needed.
- **M15** — `getEncryptionSecret` warns when falling back to `JWT_SECRET` in production. Behaviour preserved; follow-up PR will hard-fail once the ops step is done across all envs.

Spec: `docs/superpowers/specs/2026-04-18-encryption-hardening-batch-design.md`
Plan: `docs/superpowers/plans/2026-04-18-encryption-hardening-batch.md`
Source report: `audit-plans/security-pentest-report-2026-04-17.md`

## Required post-merge ops step

After deploy, set ENCRYPTION_KEY to silence the M15 warn:
```bash
npx wrangler secret put ENCRYPTION_KEY
# Paste the current JWT_SECRET value
```

## Test plan
- [x] `npm test` — all tests pass, no regressions
- [x] `npx vitest run src/__tests__/unit/security-audit.test.js -t "fail-closed plaintext rejection|legacy iv:ciphertext|getEncryptionSecret"` — all pass
- [x] `npx prettier --check` — clean
- [ ] Post-deploy: watch prod logs for the M15 warn firing (expected, once per cold-start)
- [ ] After ops step: M15 warn should stop firing (silenced by the new secret)

## Migrations
None.
```

- [ ] **Step 4: Wait for CI green, then merge**

Run: `gh pr checks <PR-number> --watch`

Known flake from the v3.53.0 PR: `BookRecommendations.test.jsx > "should show loading skeleton while fetching results"` intermittently fails in CI but passes locally. If it recurs, re-run via `gh run rerun <run-id> --failed` before escalating.

Merge with `gh pr merge <PR-number> --squash --delete-branch`.

**Known gotcha from the last two PRs:** the local `gh pr merge --squash` command may error with `fatal: Not possible to fast-forward, aborting.` even though the GitHub-side squash actually succeeded. If that happens, verify via `gh pr view <PR-number> --json state,mergedAt` — if `state: MERGED`, you're fine. Reset local main:

```bash
git checkout main
git fetch origin
git reset --hard origin/main
grep '"version"' package.json | head -1  # should show "version": "3.54.0",
```

- [ ] **Step 5: Tag v3.54.0**

Catching up with the tag convention (v3.50.0 was the last tagged release before v3.53.0 caught up).

```bash
git tag -a v3.54.0 -m "v3.54.0 — encryption hardening batch (M14, M15)"
git push --follow-tags
```

- [ ] **Step 6: Deploy (pause for user confirmation)**

Run: `npm run go`

**Pause and confirm with user before running.** `npm run go` will: build → apply migrations (no-op — this batch has none) → deploy Worker. No D1 changes. Expected output ends with `Deployed kids-reading-manager triggers` and a new `Current Version ID`.

- [ ] **Step 7: Post-deploy smoke**

- **M14**: If the deploy succeeded, the fail-closed path is live. No live probe — any exercise of the broken path would require seeding plaintext in D1, which we're explicitly trying to prevent. Unit test coverage is authoritative. Skip.
- **M15 pre-ops-step**: Verify the warn fires. Tail Cloudflare logs (`npx wrangler tail` in a separate terminal) and trigger any request that exercises `getEncryptionSecret` — e.g., hit `/api/metadata/status` (authenticated, does an AI-key decrypt). Expected: one `[crypto] ENCRYPTION_KEY not set — falling back to JWT_SECRET…` log line per cold-start.
- **M15 ops step**: retrieve the current JWT_SECRET value (1Password, `wrangler secret` isn't readable — user must know it or can temporarily `console.log` it from within a handler and deploy+revert, though that's a leak in logs and **not recommended**; better to look up from wherever secrets are originally recorded). Then:
  ```bash
  npx wrangler secret put ENCRYPTION_KEY
  # Paste the JWT_SECRET value when prompted
  ```
  No redeploy needed — secrets propagate to workers immediately. Trigger another decrypt and confirm the warn no longer fires.

- [ ] **Step 8: Session log**

Append a session-log entry to `~/vault/projects/Tally Reading.md`. Include:
- Version: v3.54.0
- What shipped: M14 fail-closed, M15 warn
- Ops step done: yes/no (write `JWT_SECRET === ENCRYPTION_KEY` if yes)
- Watch-out for follow-up: the true-rotation spec needs to support dual-read (try ENCRYPTION_KEY first, fall back to JWT_SECRET) during the migration window

---

## Follow-ups (not in this PR)

- **True key rotation spec** — separate design doc. Dual-read mode: try `ENCRYPTION_KEY` first, fall back to `JWT_SECRET` on decrypt failure. Migration job re-encrypts fields under the new key. Once all three columns are >95% re-encrypted, remove the `JWT_SECRET` fallback from `deriveEncryptionKey`.
- **Hard-fail on missing `ENCRYPTION_KEY` in prod** — after the ops step is known-done across all environments; `getEncryptionSecret` throws instead of warning.
- **H7** GraphQL proxy operation allowlist (Batch 4).
- **H9** login rate-limit IP+email layering + Turnstile (Batch 4).
- **M17** contact/signup per-email throttle + Turnstile (Batch 4).
- **M20** rate-limit middleware fail-closed list (Batch 4).
- **M13** password reset atomic token consume (Batch 5).
- **M19** MyLogin new-user role cap (Batch 5).
- **M21** `body.classId` tenant validation (Batch 3).
- `trialOrg` ReferenceError in `src/routes/stripeWebhook.js:217-223` (Batch 3).
- **H12** register slug `ReferenceError` — dead-code while public registration off (Batch 3).
- Remove `run_worker_first = ["/api/*"]`.
- `rateLimit` D1 replica-lag note from H8 smoke test.
