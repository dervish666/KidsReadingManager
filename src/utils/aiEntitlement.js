/**
 * Frontend AI entitlement gate — the single expression that decides whether to
 * offer a user an AI action.
 *
 * This exists because the expression was written out twice, by hand, and the
 * two copies disagreed. `ReadingStats.js` had it right; `BookRecommendations.js`
 * treated keySource 'platform' as entitled without checking the add-on, so a
 * school with no AI add-on saw a green "AI: Claude" chip and an "Ask AI" button
 * that returned 403. The defect was described in three places (a comment in the
 * correct file, and twice in CLAUDE.md) and fixed in one.
 *
 * It MUST mirror `resolveAiConfig()` in utils/aiProviderResolver.js, which is
 * the server-side authority:
 *
 *   Path 1  org_ai_config — BYOK. No add-on required (the school is spending
 *           its own tokens) but `is_enabled` must be set. This last clause is
 *           easy to miss: a school can save a key and then switch AI off, and
 *           the backend honours the switch.
 *   Path 2  organizations.ai_addon_active must be set, then the platform key
 *           (2a) or env vars (2b).
 *
 * Both are fed by `GET /api/settings/ai`, whose payload supplies `keySource`,
 * `isEnabled` and `aiAddonActive`.
 *
 * Note this gate governs *offering* the action only. It is a UI affordance, not
 * a security control — the server re-resolves entitlement on every AI request
 * and 403s regardless of what the client believed.
 */

/**
 * @param {Object|null|undefined} aiConfig - the payload from GET /api/settings/ai
 * @returns {boolean} true when an AI action should be offered
 */
export function hasActiveAI(aiConfig) {
  if (!aiConfig) return false;

  // Path 1 — the school's own key. Bypasses the add-on, honours the switch.
  if (aiConfig.keySource === 'organization') {
    return Boolean(aiConfig.isEnabled);
  }

  // Path 2 — Tally's key or env vars. Both are licensed by the paid add-on.
  if (aiConfig.keySource === 'platform' || aiConfig.keySource === 'environment') {
    return Boolean(aiConfig.aiAddonActive);
  }

  // keySource 'none' (or anything added later) — nothing configured.
  return false;
}
