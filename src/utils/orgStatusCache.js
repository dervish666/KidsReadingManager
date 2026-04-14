/**
 * Organization status cache
 *
 * `tenantMiddleware` runs on every authenticated request and previously read
 * `(is_active, subscription_status)` from D1 each time. On a busy instance that
 * was a 15k-req/min D1 read-storm for data that changes rarely. This module
 * keeps a short-lived KV copy and invalidates whenever an update path touches
 * either field.
 *
 * Bindings: READING_MANAGER_KV (declared in wrangler.toml).
 * TTL: 5 minutes — short enough that a missed invalidation self-heals quickly,
 * long enough to absorb bursty traffic from a single org.
 */

const TTL_SECONDS = 300;
const keyFor = (orgId) => `org:status:${orgId}`;

/** @returns {Promise<null | { is_active: 0|1, subscription_status: string }>} */
export async function getCachedOrgStatus(env, orgId) {
  if (!env?.READING_MANAGER_KV || !orgId) return null;
  try {
    return await env.READING_MANAGER_KV.get(keyFor(orgId), 'json');
  } catch (err) {
    console.warn(`[orgStatusCache] get failed for ${orgId}: ${err.message}`);
    return null;
  }
}

export async function setCachedOrgStatus(env, orgId, status) {
  if (!env?.READING_MANAGER_KV || !orgId || !status) return;
  try {
    await env.READING_MANAGER_KV.put(keyFor(orgId), JSON.stringify(status), {
      expirationTtl: TTL_SECONDS,
    });
  } catch (err) {
    console.warn(`[orgStatusCache] put failed for ${orgId}: ${err.message}`);
  }
}

/** Call after any write that changes is_active or subscription_status for an org. */
export async function invalidateOrgStatus(env, orgId) {
  if (!env?.READING_MANAGER_KV || !orgId) return;
  try {
    await env.READING_MANAGER_KV.delete(keyFor(orgId));
  } catch (err) {
    console.warn(`[orgStatusCache] delete failed for ${orgId}: ${err.message}`);
  }
}
