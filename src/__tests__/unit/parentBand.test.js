import { describe, it, expect } from 'vitest';
import { decideParentBandCelebration, enrichEarnedBadges } from '../../routes/parent.js';
import { DEFAULT_BAND_COLORS } from '../../utils/readingBandDefinitions.js';
import { BADGE_DEFINITIONS } from '../../utils/badgeDefinitions.js';

describe('decideParentBandCelebration', () => {
  it('adopts silently on first view (marker null)', () => {
    const r = decideParentBandCelebration(null, 3);
    expect(r.bandUp).toBeNull();
    expect(r.newSeen).toBe(3);
  });
  it('celebrates a climb and advances the marker', () => {
    const r = decideParentBandCelebration(2, 4);
    expect(r.bandUp).not.toBeNull();
    expect(r.bandUp.from.name).toBe('Red');
    expect(r.bandUp.to.name).toBe('Blue');
    expect(r.newSeen).toBe(4);
  });
  it('no celebration when band unchanged or lower', () => {
    expect(decideParentBandCelebration(4, 4).bandUp).toBeNull();
    expect(decideParentBandCelebration(4, 2).bandUp).toBeNull();
    expect(decideParentBandCelebration(4, 2).newSeen).toBe(4); // marker never decreases
  });
});

describe('decideParentBandCelebration palette', () => {
  it('colours the transition from the palette', () => {
    const palette = [...DEFAULT_BAND_COLORS];
    palette[4] = '#123456';
    const r = decideParentBandCelebration(2, 4, palette);
    expect(r.bandUp.to.color).toBe('#123456');
  });
});

describe('enrichEarnedBadges', () => {
  const def = BADGE_DEFINITIONS[0];

  it('joins earned rows to their definitions', () => {
    const rows = [{ badge_id: def.id, tier: def.tier, earned_at: '2026-06-10 12:00:00' }];
    expect(enrichEarnedBadges(rows)).toEqual([
      {
        badgeId: def.id,
        name: def.name,
        tier: def.tier,
        description: def.description,
        icon: def.icon,
        earnedAt: '2026-06-10 12:00:00',
      },
    ]);
  });

  it('drops rows whose badge id has no definition (retired badges)', () => {
    const rows = [
      { badge_id: 'retired_badge', tier: 'gold', earned_at: '2026-01-01' },
      { badge_id: def.id, tier: def.tier, earned_at: '2026-06-10' },
    ];
    expect(enrichEarnedBadges(rows)).toHaveLength(1);
  });

  it('falls back to the definition tier when the row has none', () => {
    const rows = [{ badge_id: def.id, tier: null, earned_at: '2026-06-10' }];
    expect(enrichEarnedBadges(rows)[0].tier).toBe(def.tier);
  });

  it('handles missing input', () => {
    expect(enrichEarnedBadges(null)).toEqual([]);
    expect(enrichEarnedBadges([])).toEqual([]);
  });
});
