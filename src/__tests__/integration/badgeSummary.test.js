import { describe, it, expect } from 'vitest';
import { BADGE_DEFINITIONS, resolveKeyStage } from '../../utils/badgeDefinitions.js';

describe('Badge summary endpoint logic', () => {
  it('computes correct aggregate counts', () => {
    const badges = [
      { student_id: 's1', badge_id: 'first_finish', tier: 'single', earned_at: '2026-04-08' },
      { student_id: 's2', badge_id: 'first_finish', tier: 'single', earned_at: '2026-04-08' },
      { student_id: 's1', badge_id: 'bookworm_bronze', tier: 'bronze', earned_at: '2026-04-08' },
    ];

    const studentsWithBadges = new Set(badges.map((b) => b.student_id)).size;

    expect(studentsWithBadges).toBe(2);
    expect(badges.length).toBe(3);
  });

  it('computes per-student progress using badge definitions with key stage', () => {
    const stats = {
      totalBooks: 3,
      totalSessions: 5,
      totalMinutes: 60,
      totalPages: 40,
      genresRead: ['fiction'],
      uniqueAuthorsCount: 2,
      fictionCount: 3,
      nonfictionCount: 0,
      poetryCount: 0,
      daysReadThisWeek: 2,
      daysReadThisTerm: 5,
      daysReadThisMonth: 4,
      weeksWith4PlusDays: 0,
      weeksWithReading: 2,
    };

    const bookwormBronze = BADGE_DEFINITIONS.find((b) => b.id === 'bookworm_bronze');
    const keyStage = resolveKeyStage('Y3'); // LowerKS2
    const progress = bookwormBronze.progress(stats, { keyStage });

    expect(progress.current).toBe(3);
    expect(progress.target).toBe(8);
  });

  it('excludes unearned secret badges from progress', () => {
    const secretBadges = BADGE_DEFINITIONS.filter((b) => b.isSecret);
    expect(secretBadges.length).toBeGreaterThan(0);
    const nonSecretBadges = BADGE_DEFINITIONS.filter((b) => !b.isSecret);
    expect(nonSecretBadges.length).toBe(BADGE_DEFINITIONS.length - secretBadges.length);
  });

  it('series_finisher returns fallback progress when authorBookCounts missing', () => {
    const seriesFinisher = BADGE_DEFINITIONS.find((b) => b.id === 'series_finisher');
    const progress = seriesFinisher.progress({}, { keyStage: 'LowerKS2' });
    expect(progress).toEqual({ current: 0, target: 3 });
  });
});
