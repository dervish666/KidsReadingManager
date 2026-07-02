import { describe, it, expect } from 'vitest';
import {
  decideParentBandCelebration,
  enrichEarnedBadges,
  shapeParentRecommendations,
} from '../../routes/parent.js';
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

describe('shapeParentRecommendations', () => {
  const oneRec = JSON.stringify([
    {
      title: 'The Iron Man',
      author: 'Ted Hughes',
      ageRange: '7-9',
      readingLevel: 'intermediate',
      reason: 'A perfect next step for a confident reader.',
      whereToFind: 'Available at most public libraries',
      synopsis: 'A giant metal man appears and a boy befriends him.',
      inLibrary: true,
    },
  ]);

  it('maps stored snapshot to the parent display shape (synopsis → description)', () => {
    const out = shapeParentRecommendations(oneRec, false);
    expect(out).toEqual([
      {
        title: 'The Iron Man',
        author: 'Ted Hughes',
        ageRange: '7-9',
        reason: 'A perfect next step for a confident reader.',
        whereToFind: 'Available at most public libraries',
        inLibrary: true,
        description: 'A giant metal man appears and a boy befriends him.',
      },
    ]);
    // readingLevel (raw AR / teacher-facing) and libraryBookId must not leak to parents
    expect(out[0]).not.toHaveProperty('readingLevel');
    expect(out[0]).not.toHaveProperty('libraryBookId');
  });

  it('returns [] when the student is opted out of AI', () => {
    expect(shapeParentRecommendations(oneRec, true)).toEqual([]);
    expect(shapeParentRecommendations(oneRec, 1)).toEqual([]);
  });

  it('returns [] for missing or corrupt snapshots', () => {
    expect(shapeParentRecommendations(null, false)).toEqual([]);
    expect(shapeParentRecommendations('', false)).toEqual([]);
    expect(shapeParentRecommendations('{not json', false)).toEqual([]);
    expect(shapeParentRecommendations('{"not":"an array"}', false)).toEqual([]);
  });

  it('drops entries without a title and defaults optional fields', () => {
    const raw = JSON.stringify([
      { author: 'Nobody' }, // no title → dropped
      { title: 'Just a Title' }, // minimal → defaults applied
    ]);
    const out = shapeParentRecommendations(raw, false);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      title: 'Just a Title',
      author: '',
      ageRange: null,
      reason: '',
      whereToFind: null,
      inLibrary: false,
      description: null,
    });
  });

  it('blanks a denylisted synopsis but keeps the rest of the card', () => {
    const raw = JSON.stringify([
      {
        title: 'The Iron Man',
        author: 'Ted Hughes',
        reason: 'A gentle classic.',
        synopsis: 'erotica for adults',
      },
    ]);
    const out = shapeParentRecommendations(raw, false);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('The Iron Man');
    expect(out[0].description).toBeNull();
  });

  it('re-moderates on read so a denylisted item never reaches a parent', () => {
    const raw = JSON.stringify([
      { title: 'The Iron Man', author: 'Ted Hughes', reason: 'A gentle classic.' },
      { title: 'Explicit Sex Guide', author: 'X', reason: 'erotica for adults' },
    ]);
    const out = shapeParentRecommendations(raw, false);
    expect(out.map((r) => r.title)).toEqual(['The Iron Man']);
  });
});
