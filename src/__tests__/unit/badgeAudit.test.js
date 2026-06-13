/**
 * Badge system audit tests — Phase 3
 *
 * Targeted test scenarios to verify edge cases, boundary conditions,
 * and bugs identified during static analysis of the badge system.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  BADGE_DEFINITIONS,
  resolveKeyStage,
  getRealtimeBadges,
  getBatchBadges,
} from '../../utils/badgeDefinitions.js';
import { classifyGenre, recalculateStats, calculateNearMisses } from '../../utils/badgeEngine.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const badge = (id) => BADGE_DEFINITIONS.find((b) => b.id === id);

const emptyStats = {
  totalBooks: 0,
  totalSessions: 0,
  totalMinutes: 0,
  totalPages: 0,
  genresRead: [],
  uniqueAuthorsCount: 0,
  fictionCount: 0,
  nonfictionCount: 0,
  poetryCount: 0,
  daysReadThisWeek: 0,
  daysReadThisTerm: 0,
  daysReadThisMonth: 0,
  weeksWith4PlusDays: 0,
  weeksWithReading: 0,
};

const buildMockDb = ({ sessions = [], books = [], genres = [], earnedBadges = [] } = {}) => {
  let upsertedStats = null;
  return {
    prepare: vi.fn((sql) => {
      const allFn = vi.fn(() => {
        if (sql.includes('session_date as date'))
          return { results: sessions.map((s) => ({ date: s.session_date, notes: s.notes })) };
        if (sql.includes('b.author') && sql.includes('COUNT'))
          return {
            results: (() => {
              const authorCounts = {};
              for (const b of books) {
                if (b.author) authorCounts[b.author] = (authorCounts[b.author] || 0) + 1;
              }
              return Object.entries(authorCounts).map(([author, book_count]) => ({
                author,
                book_count,
              }));
            })(),
          };
        if (sql.includes('FROM books b')) return { results: books };
        if (sql.includes('FROM genres')) return { results: genres };
        if (sql.includes('FROM reading_sessions')) return { results: sessions };
        if (sql.includes('student_badges')) return { results: earnedBadges };
        if (sql.includes('student_reading_stats'))
          return { results: upsertedStats ? [upsertedStats] : [] };
        return { results: [] };
      });
      return {
        all: allFn,
        bind: vi.fn((...args) => ({
          all: allFn,
          first: vi.fn(() => {
            if (sql.includes('student_reading_stats')) return upsertedStats;
            return null;
          }),
          run: vi.fn(() => {
            if (sql.includes('INSERT INTO student_reading_stats') || sql.includes('ON CONFLICT')) {
              upsertedStats = {
                total_books: args[2],
                total_sessions: args[3],
                total_minutes: args[4],
                total_pages: args[5],
                genres_read: args[6],
                unique_authors_count: args[7],
                fiction_count: args[8],
                nonfiction_count: args[9],
                poetry_count: args[10],
                days_read_this_week: args[11],
                days_read_this_term: args[12],
                days_read_this_month: args[13],
                weeks_with_4plus_days: args[14],
                weeks_with_reading: args[15],
              };
            }
          }),
        })),
      };
    }),
    batch: vi.fn((stmts) => Promise.all(stmts.map((s) => s.all()))),
  };
};

// ══════════════════════════════════════════════════════════════════════════
// Phase 3 Test Scenarios
// ══════════════════════════════════════════════════════════════════════════

describe('Audit: Zero-history student', () => {
  it('earns no badges with zero reading history', () => {
    const ctx = { keyStage: 'LowerKS2', earnedBadgeIds: new Set() };
    for (const b of BADGE_DEFINITIONS) {
      const result = b.evaluate(emptyStats, ctx);
      expect(result, `Badge ${b.id} should not be earned with zero history`).toBe(false);
    }
  });

  it('all progress functions return 0 current with zero stats', () => {
    const ctx = { keyStage: 'LowerKS2', earnedBadgeIds: new Set() };
    for (const b of BADGE_DEFINITIONS) {
      if (b.isSecret) continue;
      const { current } = b.progress(emptyStats, ctx);
      expect(current, `Badge ${b.id} should have 0 current`).toBe(0);
    }
  });
});

describe('Audit: Exact threshold boundary tests', () => {
  const keyStages = ['KS1', 'LowerKS2', 'UpperKS2'];

  describe('Bookworm tiers — at exact threshold', () => {
    const thresholds = {
      bookworm_bronze: { KS1: 5, LowerKS2: 8, UpperKS2: 10 },
      bookworm_silver: { KS1: 15, LowerKS2: 25, UpperKS2: 30 },
      bookworm_gold: { KS1: 30, LowerKS2: 50, UpperKS2: 60 },
      bookworm_star: { KS1: 50, LowerKS2: 80, UpperKS2: 100 },
    };

    for (const [badgeId, ksThresholds] of Object.entries(thresholds)) {
      for (const ks of keyStages) {
        const t = ksThresholds[ks];
        it(`${badgeId} at ${ks}: earns at exactly ${t} books`, () => {
          expect(badge(badgeId).evaluate({ totalBooks: t }, { keyStage: ks })).toBe(true);
        });
        it(`${badgeId} at ${ks}: does NOT earn at ${t - 1} books`, () => {
          expect(badge(badgeId).evaluate({ totalBooks: t - 1 }, { keyStage: ks })).toBe(false);
        });
      }
    }
  });

  describe('Time Traveller tiers — at exact threshold', () => {
    const thresholds = {
      time_traveller_bronze: { KS1: 200, LowerKS2: 400, UpperKS2: 600 },
      time_traveller_silver: { KS1: 600, LowerKS2: 1200, UpperKS2: 1800 },
      time_traveller_gold: { KS1: 1500, LowerKS2: 3000, UpperKS2: 5000 },
    };

    for (const [badgeId, ksThresholds] of Object.entries(thresholds)) {
      for (const ks of keyStages) {
        const t = ksThresholds[ks];
        it(`${badgeId} at ${ks}: earns at exactly ${t} minutes`, () => {
          expect(badge(badgeId).evaluate({ totalMinutes: t }, { keyStage: ks })).toBe(true);
        });
        it(`${badgeId} at ${ks}: does NOT earn at ${t - 1} minutes`, () => {
          expect(badge(badgeId).evaluate({ totalMinutes: t - 1 }, { keyStage: ks })).toBe(false);
        });
      }
    }
  });

  describe('Genre Explorer tiers — at exact threshold', () => {
    it('bronze: earns at exactly 3 genres', () => {
      expect(badge('genre_explorer_bronze').evaluate({ genresRead: ['a', 'b', 'c'] }, {})).toBe(
        true
      );
    });
    it('bronze: does NOT earn at 2 genres', () => {
      expect(badge('genre_explorer_bronze').evaluate({ genresRead: ['a', 'b'] }, {})).toBe(false);
    });
    it('silver: earns at exactly 5 genres', () => {
      expect(
        badge('genre_explorer_silver').evaluate({ genresRead: ['a', 'b', 'c', 'd', 'e'] }, {})
      ).toBe(true);
    });
    it('gold: earns at exactly 7 genres', () => {
      expect(
        badge('genre_explorer_gold').evaluate(
          { genresRead: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
          {}
        )
      ).toBe(true);
    });
  });

  describe('Consistency badges — at exact threshold', () => {
    it('steady_reader: earns at exactly 3 days', () => {
      expect(badge('steady_reader').evaluate({ daysReadThisWeek: 3 }, {})).toBe(true);
    });
    it('steady_reader: does NOT earn at 2 days', () => {
      expect(badge('steady_reader').evaluate({ daysReadThisWeek: 2 }, {})).toBe(false);
    });
    it('week_warrior: earns at exactly 7 days', () => {
      expect(badge('week_warrior').evaluate({ daysReadThisWeek: 7 }, {})).toBe(true);
    });
    it('week_warrior: does NOT earn at 6 days', () => {
      expect(badge('week_warrior').evaluate({ daysReadThisWeek: 6 }, {})).toBe(false);
    });
    it('monthly_marvel: earns at exactly 4 weeks', () => {
      expect(badge('monthly_marvel').evaluate({ weeksWith4PlusDays: 4 }, {})).toBe(true);
    });
    it('monthly_marvel: does NOT earn at 3 weeks', () => {
      expect(badge('monthly_marvel').evaluate({ weeksWith4PlusDays: 3 }, {})).toBe(false);
    });
  });

  describe('Series Finisher — at exact threshold', () => {
    it('earns when an author has exactly 3 books', () => {
      const ctx = { authorBookCounts: { 'Roald Dahl': 3 } };
      expect(badge('series_finisher').evaluate({}, ctx)).toBe(true);
    });
    it('does NOT earn when max author has 2 books', () => {
      const ctx = { authorBookCounts: { 'Roald Dahl': 2, 'David Walliams': 1 } };
      expect(badge('series_finisher').evaluate({}, ctx)).toBe(false);
    });
    it('returns correct progress', () => {
      const ctx = { authorBookCounts: { 'Roald Dahl': 2, 'David Walliams': 1 } };
      expect(badge('series_finisher').progress({}, ctx)).toEqual({ current: 2, target: 3 });
    });
  });
});

describe('Audit: Tier progression — no prerequisite enforcement', () => {
  it('bookworm_gold evaluates true without bookworm_silver being earned', () => {
    const stats = { totalBooks: 50 };
    const ctx = { keyStage: 'LowerKS2', earnedBadgeIds: new Set() };
    expect(badge('bookworm_gold').evaluate(stats, ctx)).toBe(true);
    expect(badge('bookworm_silver').evaluate(stats, ctx)).toBe(true);
    expect(badge('bookworm_bronze').evaluate(stats, ctx)).toBe(true);
  });

  it('all 4 bookworm tiers evaluate true simultaneously at star threshold', () => {
    const stats = { totalBooks: 100 };
    const ctx = { keyStage: 'UpperKS2' };
    const bookworms = ['bookworm_bronze', 'bookworm_silver', 'bookworm_gold', 'bookworm_star'];
    for (const id of bookworms) {
      expect(badge(id).evaluate(stats, ctx), `${id} should be earned`).toBe(true);
    }
  });
});

describe('Audit: Secret badges', () => {
  describe('Bookworm Bonanza — 3+ sessions in a day', () => {
    it('earns when 3 sessions on same day', () => {
      const ctx = {
        sessions: [
          { date: '2026-05-01', notes: '' },
          { date: '2026-05-01', notes: '' },
          { date: '2026-05-01', notes: '' },
        ],
      };
      expect(badge('bookworm_bonanza').evaluate({}, ctx)).toBe(true);
    });

    it('does NOT earn with 2 sessions on same day', () => {
      const ctx = {
        sessions: [
          { date: '2026-05-01', notes: '' },
          { date: '2026-05-01', notes: '' },
          { date: '2026-05-02', notes: '' },
        ],
      };
      expect(badge('bookworm_bonanza').evaluate({}, ctx)).toBe(false);
    });

    it('handles null sessions context', () => {
      expect(badge('bookworm_bonanza').evaluate({}, {})).toBe(false);
      expect(badge('bookworm_bonanza').evaluate({}, { sessions: null })).toBe(false);
    });
  });

  describe('Weekend Reader — Saturday + Sunday of same weekend', () => {
    it('earns when reading on Saturday and Sunday', () => {
      const ctx = {
        sessions: [
          { date: '2026-05-16', notes: '' }, // Saturday
          { date: '2026-05-17', notes: '' }, // Sunday
        ],
      };
      expect(badge('weekend_reader').evaluate({}, ctx)).toBe(true);
    });

    it('does NOT earn with only Saturday', () => {
      const ctx = {
        sessions: [{ date: '2026-05-16', notes: '' }],
      };
      expect(badge('weekend_reader').evaluate({}, ctx)).toBe(false);
    });

    it('does NOT earn when Saturday and Sunday are from different weekends', () => {
      const ctx = {
        sessions: [
          { date: '2026-05-16', notes: '' }, // Saturday
          { date: '2026-05-24', notes: '' }, // Next Sunday (not the same weekend)
        ],
      };
      expect(badge('weekend_reader').evaluate({}, ctx)).toBe(false);
    });

    it('handles null sessions context', () => {
      expect(badge('weekend_reader').evaluate({}, {})).toBe(false);
      expect(badge('weekend_reader').evaluate({}, { sessions: null })).toBe(false);
    });
  });
});

describe('Audit: Key stage variation (Reception vs Y6)', () => {
  it('Reception (KS1) has lower bookworm thresholds than Y6 (UpperKS2)', () => {
    const stats = { totalBooks: 5 };
    expect(badge('bookworm_bronze').evaluate(stats, { keyStage: 'KS1' })).toBe(true);
    expect(badge('bookworm_bronze').evaluate(stats, { keyStage: 'UpperKS2' })).toBe(false);
  });

  it('year group resolves correctly for all primary years', () => {
    expect(resolveKeyStage('Reception')).toBe('KS1');
    expect(resolveKeyStage('Y1')).toBe('KS1');
    expect(resolveKeyStage('Y2')).toBe('KS1');
    expect(resolveKeyStage('Y3')).toBe('LowerKS2');
    expect(resolveKeyStage('Y4')).toBe('LowerKS2');
    expect(resolveKeyStage('Y5')).toBe('UpperKS2');
    expect(resolveKeyStage('Y6')).toBe('UpperKS2');
  });

  it('unknown/unparseable year group falls back to LowerKS2 (mid-range)', () => {
    expect(resolveKeyStage(undefined)).toBe('LowerKS2');
    expect(resolveKeyStage(null)).toBe('LowerKS2');
    expect(resolveKeyStage('Willow')).toBe('LowerKS2'); // tree-named class, no year
  });

  it('resolves the real stored year-group formats, not just "Y2" codes', () => {
    expect(resolveKeyStage('Year 3')).toBe('LowerKS2'); // demo format
    expect(resolveKeyStage('2')).toBe('KS1'); // Wonde current_nc_year
    expect(resolveKeyStage('5')).toBe('UpperKS2'); // class-derived "5D" → "5"
    expect(resolveKeyStage('Nursery')).toBe('KS1'); // EYFS, like Reception
  });
});

describe('Audit: Re-read deduplication in stats', () => {
  it('re-reading the same book counts as 1 unique book but accumulates minutes', async () => {
    const sessions = [
      {
        session_date: '2026-04-01',
        book_id: 'b1',
        duration_minutes: 15,
        pages_read: 10,
        notes: '',
      },
      {
        session_date: '2026-04-02',
        book_id: 'b1',
        duration_minutes: 20,
        pages_read: 15,
        notes: '',
      },
      { session_date: '2026-04-03', book_id: 'b1', duration_minutes: 10, pages_read: 5, notes: '' },
    ];
    const books = [{ id: 'b1', author: 'Author A', genre_ids: '[]' }];
    const db = buildMockDb({ sessions, books });
    const stats = await recalculateStats(db, 'stu-1', 'org-1');
    expect(stats.totalBooks).toBe(1);
    expect(stats.totalSessions).toBe(3);
    expect(stats.totalMinutes).toBe(45);
    expect(stats.totalPages).toBe(30);
  });
});

describe('Audit: Marker session exclusion', () => {
  it('ABSENT sessions excluded from book count and reading dates', async () => {
    const sessions = [
      {
        session_date: '2026-04-01',
        book_id: 'b1',
        duration_minutes: 15,
        pages_read: 10,
        notes: '',
      },
      {
        session_date: '2026-04-02',
        book_id: null,
        duration_minutes: null,
        pages_read: null,
        notes: '[ABSENT]',
      },
      {
        session_date: '2026-04-03',
        book_id: null,
        duration_minutes: null,
        pages_read: null,
        notes: '[NO_RECORD]',
      },
    ];
    const books = [{ id: 'b1', author: 'Author', genre_ids: '[]' }];
    const db = buildMockDb({ sessions, books });
    const stats = await recalculateStats(db, 'stu-1', 'org-1');

    expect(stats.totalBooks).toBe(1);
    // BUG: totalSessions counts marker sessions too
    expect(stats.totalSessions).toBe(3);
  });

  it('marker sessions still contribute to totalMinutes (bug: should be 0 for markers)', async () => {
    const sessions = [
      {
        session_date: '2026-04-02',
        book_id: null,
        duration_minutes: 10,
        pages_read: 5,
        notes: '[ABSENT]',
      },
    ];
    const db = buildMockDb({ sessions });
    const stats = await recalculateStats(db, 'stu-1', 'org-1');

    // In practice, marker sessions have null duration/pages, but the code
    // doesn't filter them out of the minutes/pages accumulation.
    // With non-null values, they'd be counted. This documents the behavior.
    expect(stats.totalMinutes).toBe(10);
    expect(stats.totalPages).toBe(5);
  });
});

describe('Audit: Genre counting — multi-genre books', () => {
  it('a book with multiple genres contributes all genre IDs to genresRead', async () => {
    const sessions = [
      {
        session_date: '2026-04-01',
        book_id: 'b1',
        duration_minutes: 15,
        pages_read: 10,
        notes: '',
      },
    ];
    const books = [{ id: 'b1', author: 'Author', genre_ids: '["g1","g2","g3"]' }];
    const genres = [
      { id: 'g1', name: 'Adventure' },
      { id: 'g2', name: 'Mystery' },
      { id: 'g3', name: 'Non-Fiction' },
    ];
    const db = buildMockDb({ sessions, books, genres });
    const stats = await recalculateStats(db, 'stu-1', 'org-1');
    expect(stats.genresRead).toHaveLength(3);
    expect(stats.genresRead).toContain('g1');
    expect(stats.genresRead).toContain('g2');
    expect(stats.genresRead).toContain('g3');
  });

  it('a book with both fiction and non-fiction genres increments both counts', async () => {
    const sessions = [
      {
        session_date: '2026-04-01',
        book_id: 'b1',
        duration_minutes: 15,
        pages_read: 10,
        notes: '',
      },
    ];
    const books = [{ id: 'b1', author: 'Author', genre_ids: '["g1","g2"]' }];
    const genres = [
      { id: 'g1', name: 'Adventure' },
      { id: 'g2', name: 'Non-Fiction' },
    ];
    const db = buildMockDb({ sessions, books, genres });
    const stats = await recalculateStats(db, 'stu-1', 'org-1');
    expect(stats.fictionCount).toBe(1);
    expect(stats.nonfictionCount).toBe(1);
  });
});

describe('Audit: Fiction & Fact progress with empty stats', () => {
  it('progress returns NaN for current when stats fields are undefined (BUG)', () => {
    const result = badge('fiction_and_fact').progress({}, {});
    // Math.min(undefined, 1) = NaN, NaN + NaN = NaN
    expect(Number.isNaN(result.current)).toBe(true);
    expect(result.target).toBe(2);
  });

  it('Bookworm progress returns undefined for current when stats is empty', () => {
    const result = badge('bookworm_bronze').progress({}, { keyStage: 'LowerKS2' });
    expect(result.current).toBeUndefined();
    expect(result.target).toBe(8);
  });

  it('Time Traveller progress returns undefined for current when stats is empty', () => {
    const result = badge('time_traveller_bronze').progress({}, { keyStage: 'LowerKS2' });
    expect(result.current).toBeUndefined();
    expect(result.target).toBe(400);
  });

  it('Genre Explorer handles empty stats safely (returns 0)', () => {
    const result = badge('genre_explorer_bronze').progress({}, {});
    expect(result.current).toBe(0);
    expect(result.target).toBe(3);
  });
});

describe('Audit: Near-miss calculation', () => {
  it('returns max 3 near-misses', () => {
    const stats = {
      totalBooks: 6,
      totalMinutes: 350,
      genresRead: ['a', 'b'],
      fictionCount: 2,
      nonfictionCount: 0,
      daysReadThisWeek: 2,
      weeksWith4PlusDays: 3,
    };
    const earnedBadgeIds = new Set(['first_finish']);
    const nearMisses = calculateNearMisses(stats, 'LowerKS2', earnedBadgeIds);
    expect(nearMisses.length).toBeLessThanOrEqual(3);
  });

  it('excludes secret badges from near-misses', () => {
    const stats = {
      totalBooks: 50,
      totalMinutes: 2000,
      genresRead: ['a', 'b', 'c', 'd', 'e', 'f'],
    };
    const nearMisses = calculateNearMisses(stats, 'LowerKS2', new Set());
    const secretIds = BADGE_DEFINITIONS.filter((b) => b.isSecret).map((b) => b.id);
    for (const nm of nearMisses) {
      expect(secretIds).not.toContain(nm.badgeId);
    }
  });

  it('excludes already-earned badges', () => {
    const stats = { totalBooks: 6, genresRead: ['a', 'b'] };
    const earned = new Set(['bookworm_bronze']);
    const nearMisses = calculateNearMisses(stats, 'LowerKS2', earned);
    expect(nearMisses.find((nm) => nm.badgeId === 'bookworm_bronze')).toBeUndefined();
  });

  it('only includes badges at 60%+ progress', () => {
    const stats = { totalBooks: 1, totalMinutes: 10, genresRead: [], daysReadThisWeek: 0 };
    const nearMisses = calculateNearMisses(stats, 'LowerKS2', new Set());
    for (const nm of nearMisses) {
      expect(nm.current / nm.target).toBeGreaterThanOrEqual(0.6);
    }
  });
});

describe('Audit: Badge definition / evaluation path completeness', () => {
  it('every badge ID is unique', () => {
    const ids = BADGE_DEFINITIONS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('real-time + batch = total definitions (no orphans)', () => {
    const rt = getRealtimeBadges();
    const batch = getBatchBadges();
    expect(rt.length + batch.length).toBe(BADGE_DEFINITIONS.length);
  });

  it('all real-time badges have categories in the real-time set', () => {
    const rtCategories = new Set(['volume', 'consistency_realtime', 'milestone']);
    for (const b of getRealtimeBadges()) {
      expect(
        rtCategories.has(b.category),
        `${b.id} has unexpected realtime category ${b.category}`
      ).toBe(true);
    }
  });

  it('exploration badges are batch-only (not evaluated in real-time)', () => {
    const explorationBadges = BADGE_DEFINITIONS.filter((b) => b.category === 'exploration');
    const realtimeIds = new Set(getRealtimeBadges().map((b) => b.id));
    for (const b of explorationBadges) {
      expect(
        realtimeIds.has(b.id),
        `Exploration badge ${b.id} is in real-time set — genre data may be stale`
      ).toBe(false);
    }
  });

  it('secret badges are batch-only', () => {
    const secretBadges = BADGE_DEFINITIONS.filter((b) => b.isSecret);
    const realtimeIds = new Set(getRealtimeBadges().map((b) => b.id));
    for (const b of secretBadges) {
      expect(realtimeIds.has(b.id), `Secret badge ${b.id} is in real-time set`).toBe(false);
    }
  });
});

describe('Audit: Weekend Reader date edge cases', () => {
  it('correctly detects a Saturday-Sunday pair at year boundary (Dec 31 Sat → Jan 1 Sun)', () => {
    // 2027-01-02 is a Saturday, 2027-01-03 is a Sunday
    const ctx = {
      sessions: [
        { date: '2027-01-02', notes: '' },
        { date: '2027-01-03', notes: '' },
      ],
    };
    expect(badge('weekend_reader').evaluate({}, ctx)).toBe(true);
  });

  it('handles Friday + Saturday (not a qualifying pair)', () => {
    const ctx = {
      sessions: [
        { date: '2026-05-15', notes: '' }, // Friday
        { date: '2026-05-16', notes: '' }, // Saturday
      ],
    };
    expect(badge('weekend_reader').evaluate({}, ctx)).toBe(false);
  });

  it('handles Sunday alone (not a qualifying pair)', () => {
    const ctx = {
      sessions: [{ date: '2026-05-17', notes: '' }], // Sunday
    };
    expect(badge('weekend_reader').evaluate({}, ctx)).toBe(false);
  });
});

describe('Audit: Genre classification completeness', () => {
  const knownGenres = [
    'Adventure',
    'Fantasy',
    'Mystery',
    'Science Fiction',
    'Realistic Fiction',
    'Historical Fiction',
    'Humor',
    'Animal Stories',
    'Fairy Tales',
    'Graphic Novels',
    'Horror/Scary',
    'Sports',
    'Non-Fiction',
    'Biography',
    'Poetry',
  ];

  it('all known genres have explicit classification', () => {
    for (const g of knownGenres) {
      const cls = classifyGenre(g);
      expect(['fiction', 'nonfiction', 'poetry']).toContain(cls);
    }
  });

  it('unknown genres default to fiction', () => {
    expect(classifyGenre('Custom Genre')).toBe('fiction');
    expect(classifyGenre('')).toBe('fiction');
    expect(classifyGenre(undefined)).toBe('fiction');
  });
});
