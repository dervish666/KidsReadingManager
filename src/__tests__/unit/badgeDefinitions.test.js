import { describe, it, expect } from 'vitest';
import {
  BADGE_DEFINITIONS,
  getRealtimeBadges,
  getBatchBadges,
  resolveKeyStage,
} from '../../utils/badgeDefinitions.js';

describe('resolveKeyStage', () => {
  it('maps Reception to KS1', () => {
    expect(resolveKeyStage('Reception')).toBe('KS1');
  });
  it('maps Y1, Y2 to KS1', () => {
    expect(resolveKeyStage('Y1')).toBe('KS1');
    expect(resolveKeyStage('Y2')).toBe('KS1');
  });
  it('maps Y3, Y4 to LowerKS2', () => {
    expect(resolveKeyStage('Y3')).toBe('LowerKS2');
    expect(resolveKeyStage('Y4')).toBe('LowerKS2');
  });
  it('maps Y5, Y6 to UpperKS2', () => {
    expect(resolveKeyStage('Y5')).toBe('UpperKS2');
    expect(resolveKeyStage('Y6')).toBe('UpperKS2');
  });
  it('falls back to LowerKS2 for null', () => {
    expect(resolveKeyStage(null)).toBe('LowerKS2');
  });
  it('falls back to LowerKS2 for unrecognised value', () => {
    expect(resolveKeyStage('Year 3')).toBe('LowerKS2');
  });
});

describe('BADGE_DEFINITIONS', () => {
  it('has 18 badge definitions', () => {
    expect(BADGE_DEFINITIONS).toHaveLength(18);
  });

  it('every badge has required fields', () => {
    for (const badge of BADGE_DEFINITIONS) {
      expect(badge).toHaveProperty('id');
      expect(badge).toHaveProperty('name');
      expect(badge).toHaveProperty('tier');
      expect(badge).toHaveProperty('category');
      expect(badge).toHaveProperty('description');
      expect(badge).toHaveProperty('unlockMessage');
      expect(badge).toHaveProperty('icon');
      expect(badge).toHaveProperty('evaluate');
      expect(badge).toHaveProperty('progress');
      expect(typeof badge.evaluate).toBe('function');
      expect(typeof badge.progress).toBe('function');
    }
  });
});

describe('Bookworm badges — volume', () => {
  const bookwormBronze = () => BADGE_DEFINITIONS.find((b) => b.id === 'bookworm_bronze');

  it('evaluates true when KS1 student has 5 books', () => {
    const stats = { totalBooks: 5 };
    const context = { keyStage: 'KS1' };
    expect(bookwormBronze().evaluate(stats, context)).toBe(true);
  });

  it('evaluates false when KS1 student has 4 books', () => {
    const stats = { totalBooks: 4 };
    const context = { keyStage: 'KS1' };
    expect(bookwormBronze().evaluate(stats, context)).toBe(false);
  });

  it('uses LowerKS2 threshold (8) for that key stage', () => {
    const stats = { totalBooks: 7 };
    const context = { keyStage: 'LowerKS2' };
    expect(bookwormBronze().evaluate(stats, context)).toBe(false);
    expect(bookwormBronze().evaluate({ totalBooks: 8 }, context)).toBe(true);
  });

  it('reports correct progress', () => {
    const stats = { totalBooks: 3 };
    const context = { keyStage: 'KS1' };
    expect(bookwormBronze().progress(stats, context)).toEqual({ current: 3, target: 5 });
  });
});

describe('Steady Reader — consistency', () => {
  const steadyReader = () => BADGE_DEFINITIONS.find((b) => b.id === 'steady_reader');

  it('evaluates true when 3+ days read this week', () => {
    const stats = { daysReadThisWeek: 3 };
    expect(steadyReader().evaluate(stats, {})).toBe(true);
  });

  it('evaluates false when fewer than 3 days', () => {
    const stats = { daysReadThisWeek: 2 };
    expect(steadyReader().evaluate(stats, {})).toBe(false);
  });
});

describe('First Finish — milestone', () => {
  const firstFinish = () => BADGE_DEFINITIONS.find((b) => b.id === 'first_finish');

  it('evaluates true when at least 1 book', () => {
    const stats = { totalBooks: 1 };
    expect(firstFinish().evaluate(stats, {})).toBe(true);
  });

  it('evaluates false with 0 books', () => {
    const stats = { totalBooks: 0 };
    expect(firstFinish().evaluate(stats, {})).toBe(false);
  });
});

describe('Genre Explorer — exploration', () => {
  const genreExplorerBronze = () => BADGE_DEFINITIONS.find((b) => b.id === 'genre_explorer_bronze');

  it('evaluates true when 3+ genres', () => {
    const stats = { genresRead: ['a', 'b', 'c'] };
    expect(genreExplorerBronze().evaluate(stats, {})).toBe(true);
  });

  it('evaluates false when 2 genres', () => {
    const stats = { genresRead: ['a', 'b'] };
    expect(genreExplorerBronze().evaluate(stats, {})).toBe(false);
  });
});

describe('Fiction & Fact — exploration', () => {
  const fictionFact = () => BADGE_DEFINITIONS.find((b) => b.id === 'fiction_and_fact');

  it('evaluates true when both fiction and nonfiction read', () => {
    const stats = { fictionCount: 1, nonfictionCount: 1 };
    expect(fictionFact().evaluate(stats, {})).toBe(true);
  });

  it('evaluates false when only fiction read', () => {
    const stats = { fictionCount: 3, nonfictionCount: 0 };
    expect(fictionFact().evaluate(stats, {})).toBe(false);
  });
});

describe('getRealtimeBadges / getBatchBadges', () => {
  it('splits badges into real-time and batch categories', () => {
    const realtime = getRealtimeBadges();
    const batch = getBatchBadges();
    expect(realtime.length + batch.length).toBe(BADGE_DEFINITIONS.length);
    expect(batch.find((b) => b.id === 'monthly_marvel')).toBeDefined();
    expect(batch.find((b) => b.id === 'series_finisher')).toBeDefined();
    expect(batch.find((b) => b.id === 'bookworm_bonanza')).toBeDefined();
    expect(batch.find((b) => b.id === 'weekend_reader')).toBeDefined();
  });
});
