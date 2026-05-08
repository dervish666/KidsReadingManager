import { describe, it, expect, vi } from 'vitest';
import {
  getCachedOrgStatus,
  setCachedOrgStatus,
  invalidateOrgStatus,
} from '../../utils/orgStatusCache.js';

const buildEnv = (kvOverrides = {}) => ({
  READING_MANAGER_KV: {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...kvOverrides,
  },
});

describe('orgStatusCache', () => {
  describe('setCachedOrgStatus', () => {
    it('uses a 60-second TTL — caps the deactivation race window', async () => {
      const env = buildEnv();
      await setCachedOrgStatus(env, 'org-1', { is_active: 1, subscription_status: 'active' });

      expect(env.READING_MANAGER_KV.put).toHaveBeenCalledOnce();
      const [, , options] = env.READING_MANAGER_KV.put.mock.calls[0];
      // 60s ceiling, not the previous 300s. If this test fails because the
      // TTL was raised, double-check the deactivation-window analysis in
      // orgStatusCache.js's header comment.
      expect(options).toEqual({ expirationTtl: 60 });
    });

    it('writes the JSON-stringified status under the per-org key', async () => {
      const env = buildEnv();
      await setCachedOrgStatus(env, 'org-1', { is_active: 1, subscription_status: 'active' });

      const [key, value] = env.READING_MANAGER_KV.put.mock.calls[0];
      expect(key).toBe('org:status:org-1');
      expect(JSON.parse(value)).toEqual({ is_active: 1, subscription_status: 'active' });
    });

    it('is a no-op without a KV binding or status', async () => {
      await setCachedOrgStatus(null, 'org-1', { is_active: 1 });
      await setCachedOrgStatus({}, 'org-1', { is_active: 1 });
      await setCachedOrgStatus(buildEnv(), null, { is_active: 1 });
      await setCachedOrgStatus(buildEnv(), 'org-1', null);
      // No throws above is the assertion
      expect(true).toBe(true);
    });

    it('swallows KV write errors so the request path never 5xxs', async () => {
      const env = buildEnv({ put: vi.fn().mockRejectedValue(new Error('KV write failed')) });
      await expect(setCachedOrgStatus(env, 'org-1', { is_active: 1 })).resolves.toBeUndefined();
    });
  });

  describe('getCachedOrgStatus', () => {
    it('returns the parsed JSON from the per-org key', async () => {
      const stored = { is_active: 1, subscription_status: 'trialing' };
      const env = buildEnv({ get: vi.fn().mockResolvedValue(stored) });

      const result = await getCachedOrgStatus(env, 'org-1');

      expect(env.READING_MANAGER_KV.get).toHaveBeenCalledWith('org:status:org-1', 'json');
      expect(result).toEqual(stored);
    });

    it('returns null on cache miss', async () => {
      const env = buildEnv({ get: vi.fn().mockResolvedValue(null) });
      expect(await getCachedOrgStatus(env, 'org-1')).toBeNull();
    });

    it('returns null on KV read error (fail-open)', async () => {
      const env = buildEnv({ get: vi.fn().mockRejectedValue(new Error('KV down')) });
      expect(await getCachedOrgStatus(env, 'org-1')).toBeNull();
    });

    it('is a no-op without a KV binding or orgId', async () => {
      expect(await getCachedOrgStatus(null, 'org-1')).toBeNull();
      expect(await getCachedOrgStatus({}, 'org-1')).toBeNull();
      expect(await getCachedOrgStatus(buildEnv(), null)).toBeNull();
    });
  });

  describe('invalidateOrgStatus', () => {
    it('deletes the per-org key from KV', async () => {
      const env = buildEnv();
      await invalidateOrgStatus(env, 'org-1');
      expect(env.READING_MANAGER_KV.delete).toHaveBeenCalledWith('org:status:org-1');
    });

    it('swallows KV delete errors (best-effort)', async () => {
      const env = buildEnv({ delete: vi.fn().mockRejectedValue(new Error('KV outage')) });
      await expect(invalidateOrgStatus(env, 'org-1')).resolves.toBeUndefined();
    });

    it('is a no-op without a KV binding or orgId', async () => {
      await invalidateOrgStatus(null, 'org-1');
      await invalidateOrgStatus(buildEnv(), null);
      // No throws above is the assertion
      expect(true).toBe(true);
    });
  });
});
