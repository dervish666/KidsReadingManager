# Encryption Hardening Batch — Design (M14, M15)

**Date:** 2026-04-18
**Source report:** `audit-plans/security-pentest-report-2026-04-17.md`
**Scope:** Two encryption-layer findings from the pen-test that both live in `src/utils/crypto.js`. Both are Medium — M14 is latent (defence against a future write bug slipping plaintext past `encryptSensitiveData`); M15 is a defence-in-depth gap (JWT secret and data-encryption secret share the same value, so one leak is two).
**Target version:** v3.54.0
**Branch:** `security/encryption-hardening` from `main` at v3.53.0.

---

## Context

`encryptSensitiveData` / `decryptSensitiveData` protect Wonde school tokens, AI provider keys (per-org and platform-level), and Hardcover / Google Books keys. Two leaks the pen-test found:

- **M14** — `decryptSensitiveData` treats colon-less input as plaintext and returns it unchanged (with a `console.warn` since v3.49.0). If any write bug ever stored a raw API key or token, reads would silently succeed with no AEAD — and we'd never notice until someone audited the DB.
- **M15** — `getEncryptionSecret` returns `env.ENCRYPTION_KEY || env.JWT_SECRET` with no warning. Production doesn't have `ENCRYPTION_KEY` set (confirmed via `wrangler secret list`), so every encrypted field is currently protected by the same secret that signs JWTs. A JWT_SECRET leak = forge tokens *and* decrypt every Wonde token / API key.

Both flagged as Medium because neither has an active exploit path — but both widen blast radius meaningfully if something else goes wrong.

---

## Production data audit (before designing fail-closed)

Before committing to fail-closed on plaintext reads, confirmed the actual state of every encrypted column:

| Table | Column | Total | `enc:` prefix | Legacy `iv:ciphertext` | Plaintext |
|---|---|---|---|---|---|
| `organizations` | `wonde_school_token` | 2 | 0 | 2 | 0 |
| `platform_ai_keys` | `api_key_encrypted` | 3 | 3 | 0 | 0 |
| `metadata_config` | `hardcover_api_key_encrypted` | 1 | 0 | 1 | 0 |

**Zero plaintext rows in production.** Legacy format (`iv:ciphertext` without `enc:` prefix) still decrypts correctly via the existing legacy branch — the fail-closed change only deletes the "no colons → return as-is" final fallback. No production data is affected.

This is the key de-risking step that makes fail-closed viable in a single PR rather than a two-cycle warn-then-reject rollout.

---

## Fix-by-fix design

### M14 — Fail-closed on missing ciphertext separator

**Problem:** `src/utils/crypto.js:633-640`. When `decryptSensitiveData` receives input with no `:`, it logs a warn and returns the input verbatim. The comment at the site says "Scheduled for fail-closed conversion once production telemetry is clean." Production telemetry is clean (per the audit above) and v3.49.0 has had ~4 days of warn-only surveillance without evidence of plaintext reads.

**Fix:**

Replace the plaintext branch:

```js
// Current (src/utils/crypto.js:633-640):
if (!encryptedData.includes(':')) {
  console.warn(
    `[crypto] decryptSensitiveData plaintext fallback fired (length=${encryptedData.length})`
  );
  return encryptedData;
}
```

With:

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

**Callers to watch:** 12 call sites across `worker.js`, `wondeAdmin.js`, `books.js`, `metadata.js`, `hardcover.js`, `settings.js`. All already catch errors from `decryptSensitiveData` (Sentry reports, 500-response fallbacks). The fail-closed change surfaces the problem rather than hiding it. No caller changes required.

**Tests:**

One existing test explicitly asserts the fallback: `src/__tests__/unit/security-audit.test.js:314-320`:
```js
it('should pass through legacy unencrypted data (no colon separator) unchanged', async () => {
  const legacyPlaintext = 'sk-old-api-key-without-encryption';
  const result = await decryptSensitiveData(legacyPlaintext, testSecret);
  expect(result).toBe(legacyPlaintext);
});
```

**Rewrite** (not delete — the test is still useful as a regression guard against re-introducing the fallback):
```js
it('should throw on colon-less input (fail-closed plaintext rejection, M14)', async () => {
  const plaintextLooking = 'sk-old-api-key-without-encryption';
  await expect(decryptSensitiveData(plaintextLooking, testSecret)).rejects.toThrow(
    'Invalid encrypted data format (no separator)'
  );
});
```

Add a second regression test confirming legacy `iv:ciphertext` format still reads:
```js
it('still decrypts legacy iv:ciphertext format (no enc: prefix)', async () => {
  // Manually produce a legacy-format payload by encrypting with current
  // path then stripping the 'enc:' prefix.
  const encrypted = await encryptSensitiveData('legacy-token', testSecret);
  const legacyFormat = encrypted.replace(/^enc:/, '');
  const result = await decryptSensitiveData(legacyFormat, testSecret);
  expect(result).toBe('legacy-token');
});
```

**Rollout:** No migration. No data changes. If the deploy somehow breaks a feature because a plaintext row slipped in between the audit and the deploy: rollback to v3.53.0 via `wrangler rollback`. No D1 state to revert.

---

### M15 — Warn when `ENCRYPTION_KEY` absent in production

**Problem:** `src/utils/crypto.js:583-585`:
```js
export function getEncryptionSecret(env) {
  return env.ENCRYPTION_KEY || env.JWT_SECRET;
}
```

The fallback is silent. Production currently runs on the fallback (confirmed via `wrangler secret list`), so JWT_SECRET is doing double duty.

**Fix:**

Log a warning when the fallback fires in production, once per Worker cold-start to avoid log spam. Keep the fallback — removing it now would break decrypts of existing data that was encrypted with `JWT_SECRET`.

```js
// Module-scoped flag: warn once per Worker instance, not per-call.
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

**Why warn-only, not hard-fail:** a hard-fail in `getEncryptionSecret` when `ENCRYPTION_KEY` is missing would break the first deploy that doesn't have the secret set. The whole point of this batch is to catch these gaps — making the code refuse to run until the secret is there is heavy-handed for a defence-in-depth finding. Warning is enough signal; the ops step (Step 2 below) silences it; a follow-up PR can hard-fail once the ops step is known-complete.

**Rollout — three steps, spread across two PRs + one ops action:**

1. **This PR (v3.54.0):** warn on fallback. No behaviour change. Merge, deploy, observe the warn firing in prod logs.
2. **Ops step (user action, not in PR):** set the secret to the current JWT_SECRET value so nothing changes on the crypto side, but the warning goes silent:
   ```bash
   # Get current JWT_SECRET value (user knows it or retrieves it from 1Password / wherever)
   # Then:
   npx wrangler secret put ENCRYPTION_KEY
   # Paste the current JWT_SECRET value when prompted
   ```
   At this point, prod has `ENCRYPTION_KEY === JWT_SECRET` — the fallback is dormant, existing encrypted data still decrypts, new encryptions use the same key. No blast-radius reduction *yet*.
3. **Follow-up PR (separate spec):** either (a) re-encryption migration to rotate `ENCRYPTION_KEY` to a fresh value distinct from `JWT_SECRET`, giving true blast-radius separation, or (b) hard-fail `getEncryptionSecret` if `ENCRYPTION_KEY` is missing in production. Both require the ops step to be done; neither is in scope for this batch.

**Tests:**

No unit test for the warning directly — module-scoped state plus `console.warn` is a pain to assert cleanly and the behaviour is trivial. Instead, extend the existing `getEncryptionSecret` test coverage (check `security-audit.test.js` — if it doesn't have one, add):

```js
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

These tests are behaviour-focused and don't depend on the warning firing.

---

## File structure

**Modified files (3):**
- `src/utils/crypto.js` — M14 throw instead of pass-through at ~line 633; M15 warn flag + production-conditional warn at ~line 583.
- `src/__tests__/unit/security-audit.test.js` — rewrite the "pass through legacy unencrypted" test as the fail-closed test; add legacy `iv:ciphertext` regression test; add `getEncryptionSecret` coverage if absent.
- `CHANGELOG.md` + `package.json` — v3.54.0 release notes (including **prominent ops step instruction for setting `ENCRYPTION_KEY`**) + version bump.

**No new files.** No migration. No env var requirement changes (the warn is just a signal; the fallback still works).

---

## Tests (rollup)

- M14: 1 rewritten test (fail-closed), 1 new legacy-format regression test.
- M15: 3 new `getEncryptionSecret` tests (prefer, fall back on missing, fall back on empty).
- Full suite must pass. Expect ~1949 tests (1944 + 5).

---

## Rollout plan

1. Branch from main at v3.53.0.
2. Two commits, one per finding, TDD each time.
3. One release commit (version + CHANGELOG, including ops step).
4. PR + squash merge.
5. `npm run go` — no migration.
6. **Post-deploy, the user does the ops step:** `wrangler secret put ENCRYPTION_KEY` with the current JWT_SECRET value. Warning goes silent from that point.
7. Separately file the follow-up spec for true key rotation (re-encryption migration to rotate `ENCRYPTION_KEY` to a fresh value).

---

## Risks / rollback

- **M14 fail-closed breaks a feature** because a plaintext row slipped in between audit and deploy. Mitigation: `wrangler rollback` (no D1 state to revert). Audit was done right before the PR; unless a writer misfires in that ~hour window, this is theoretical.
- **M15 warn spams logs** if a non-production env is misclassified. Mitigation: the `env.ENVIRONMENT === 'production'` guard. Dev and local won't see the warn.
- **User skips the ops step (Step 2).** Warning continues firing. Not a functional problem — the fallback still works. The follow-up PR hard-fails only if the ops step is done first; we don't accidentally ship the hard-fail before the secret is set.

---

## Deferred to follow-up PRs

- **True key rotation** — re-encryption migration with dual-read (try ENCRYPTION_KEY first, fall back to JWT_SECRET), write new value using ENCRYPTION_KEY. Gradual cutover. Separate spec.
- **Hard-fail on missing ENCRYPTION_KEY in prod** — after the ops step is confirmed done for all environments.
