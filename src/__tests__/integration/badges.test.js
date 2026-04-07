import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recalculateStats, evaluateRealTime, calculateNearMisses } from '../../utils/badgeEngine.js';
import { BADGE_DEFINITIONS, resolveKeyStage } from '../../utils/badgeDefinitions.js';

describe('Badge system integration', () => {
  // Test that the full flow works: recalculate stats → evaluate → near-misses
  it('awards First Finish badge when a student has their first book session', async () => {
    const sessions = [
      { session_date: '2026-04-01', book_id: 'b1', duration_minutes: 15, pages_read: 20, notes: '' },
    ];
    const books = [{ id: 'b1', author: 'Roald Dahl', genre_ids: '["genre-fiction"]' }];
    const genres = [{ id: 'genre-fiction', name: 'Realistic Fiction' }];

    let upsertedStats = null;
    let insertedBadges = [];
    const mockDb = {
      prepare: vi.fn((sql) => ({
        bind: vi.fn((...args) => ({
          all: vi.fn(() => {
            if (sql.includes('reading_sessions')) return { results: sessions };
            if (sql.includes('books b')) return { results: books };
            if (sql.includes('genres')) return { results: genres };
            if (sql.includes('student_badges')) return { results: [] };
            return { results: [] };
          }),
          first: vi.fn(() => {
            if (sql.includes('student_reading_stats')) return upsertedStats;
            return null;
          }),
          run: vi.fn(() => {
            if (sql.includes('INSERT INTO student_reading_stats') || sql.includes('ON CONFLICT')) {
              upsertedStats = {
                total_books: 1,
                total_sessions: 1,
                total_minutes: 15,
                total_pages: 20,
                genres_read: '["genre-fiction"]',
                unique_authors_count: 1,
                fiction_count: 1,
                nonfiction_count: 0,
                poetry_count: 0,
                days_read_this_week: 1,
                days_read_this_term: 1,
                days_read_this_month: 1,
                weeks_with_4plus_days: 0,
                weeks_with_reading: 1,
              };
            }
            if (sql.includes('INSERT INTO student_badges')) {
              insertedBadges.push(args);
            }
          }),
        })),
      })),
    };

    await recalculateStats(mockDb, 'stu-1', 'org-1');
    const newBadges = await evaluateRealTime(mockDb, 'stu-1', 'org-1', 'Y3');
    expect(newBadges.find((b) => b.id === 'first_finish')).toBeDefined();
  });

  it('calculates near-misses correctly', () => {
    const stats = {
      totalBooks: 6,
      totalMinutes: 100,
      totalPages: 80,
      genresRead: ['genre-adventure', 'genre-fantasy'],
      fictionCount: 5,
      nonfictionCount: 1,
      poetryCount: 0,
      daysReadThisWeek: 2,
      daysReadThisTerm: 10,
      daysReadThisMonth: 6,
      weeksWith4PlusDays: 0,
      weeksWithReading: 3,
    };
    const earnedBadgeIds = new Set(['first_finish', 'fiction_and_fact']);
    const nearMisses = calculateNearMisses(stats, 'Y4', earnedBadgeIds);
    // Should include bookworm_bronze (6/8 = 75% for LowerKS2) and genre_explorer_bronze (2/3 = 67%)
    expect(nearMisses.length).toBeGreaterThan(0);
    expect(nearMisses.length).toBeLessThanOrEqual(3);
  });
});
