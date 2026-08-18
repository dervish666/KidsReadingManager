import { describe, it, expect } from 'vitest';
import { hasActiveAI } from '../../utils/aiEntitlement.js';

/**
 * The gate that decides whether the UI offers an AI action. It must mirror
 * resolveAiConfig() in utils/aiProviderResolver.js — see that file for the
 * precedence rules these cases encode.
 */
describe('hasActiveAI', () => {
  describe("BYOK (keySource 'organization') — no add-on required", () => {
    it('is entitled with its own enabled key and no add-on', () => {
      expect(
        hasActiveAI({ keySource: 'organization', isEnabled: true, aiAddonActive: false })
      ).toBe(true);
    });

    it('is NOT entitled when the school has switched its own AI off', () => {
      // resolveAiConfig Path 1 requires is_enabled, so honouring the switch
      // matters: without it the UI offers a button the server refuses.
      expect(
        hasActiveAI({ keySource: 'organization', isEnabled: false, aiAddonActive: true })
      ).toBe(false);
    });
  });

  describe("platform key (keySource 'platform') — add-on required", () => {
    // This is the case that was broken in BookRecommendations.js: it treated
    // 'platform' as entitled unconditionally, so a school with no add-on saw a
    // green "AI: Claude" chip and an "Ask AI" button that returned 403.
    it('is NOT entitled without the add-on', () => {
      expect(hasActiveAI({ keySource: 'platform', isEnabled: true, aiAddonActive: false })).toBe(
        false
      );
    });

    it('is entitled with the add-on', () => {
      expect(hasActiveAI({ keySource: 'platform', isEnabled: true, aiAddonActive: true })).toBe(
        true
      );
    });
  });

  describe("env vars (keySource 'environment') — add-on required", () => {
    it('is NOT entitled without the add-on', () => {
      expect(hasActiveAI({ keySource: 'environment', isEnabled: true, aiAddonActive: false })).toBe(
        false
      );
    });

    it('is entitled with the add-on', () => {
      expect(hasActiveAI({ keySource: 'environment', isEnabled: true, aiAddonActive: true })).toBe(
        true
      );
    });
  });

  describe('nothing configured', () => {
    it("is not entitled for keySource 'none' even with the add-on", () => {
      expect(hasActiveAI({ keySource: 'none', aiAddonActive: true })).toBe(false);
    });

    it('is not entitled for an unrecognised keySource added later', () => {
      // Fails closed rather than open — a new source must opt in explicitly.
      expect(hasActiveAI({ keySource: 'something-new', aiAddonActive: true })).toBe(false);
    });

    it('handles null/undefined config without throwing', () => {
      expect(hasActiveAI(null)).toBe(false);
      expect(hasActiveAI(undefined)).toBe(false);
      expect(hasActiveAI({})).toBe(false);
    });

    it('handles the loadError shape the components set on a failed fetch', () => {
      expect(hasActiveAI({ loadError: true })).toBe(false);
    });
  });
});
