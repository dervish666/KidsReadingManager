import { describe, it, expect } from 'vitest';
import { rowToBadge, rowToReadingStats } from '../../utils/rowMappers.js';

describe('rowToBadge', () => {
  it('maps a D1 row to a badge object', () => {
    const row = {
      id: 'badge-1',
      student_id: 'stu-1',
      organization_id: 'org-1',
      badge_id: 'bookworm_bronze',
      tier: 'bronze',
      earned_at: '2026-04-07T10:00:00Z',
      notified: 0,
    };
    const result = rowToBadge(row);
    expect(result).toEqual({
      id: 'badge-1',
      studentId: 'stu-1',
      organizationId: 'org-1',
      badgeId: 'bookworm_bronze',
      tier: 'bronze',
      earnedAt: '2026-04-07T10:00:00Z',
      notified: false,
    });
  });

  it('returns null for null row', () => {
    expect(rowToBadge(null)).toBeNull();
  });
});

describe('rowToReadingStats', () => {
  it('maps a D1 row to a reading stats object', () => {
    const row = {
      student_id: 'stu-1',
      organization_id: 'org-1',
      total_books: 7,
      total_sessions: 12,
      total_minutes: 340,
      total_pages: 450,
      genres_read: '["genre-adventure","genre-poetry"]',
      unique_authors_count: 5,
      fiction_count: 6,
      nonfiction_count: 1,
      poetry_count: 0,
      days_read_this_week: 3,
      days_read_this_term: 20,
      days_read_this_month: 8,
      weeks_with_4plus_days: 2,
      weeks_with_reading: 5,
      updated_at: '2026-04-07T10:00:00Z',
    };
    const result = rowToReadingStats(row);
    expect(result).toEqual({
      studentId: 'stu-1',
      organizationId: 'org-1',
      totalBooks: 7,
      totalSessions: 12,
      totalMinutes: 340,
      totalPages: 450,
      genresRead: ['genre-adventure', 'genre-poetry'],
      uniqueAuthorsCount: 5,
      fictionCount: 6,
      nonfictionCount: 1,
      poetryCount: 0,
      daysReadThisWeek: 3,
      daysReadThisTerm: 20,
      daysReadThisMonth: 8,
      weeksWith4PlusDays: 2,
      weeksWithReading: 5,
      updatedAt: '2026-04-07T10:00:00Z',
    });
  });

  it('returns null for null row', () => {
    expect(rowToReadingStats(null)).toBeNull();
  });

  it('parses empty genres_read as empty array', () => {
    const row = {
      student_id: 'stu-1',
      organization_id: 'org-1',
      total_books: 0,
      total_sessions: 0,
      total_minutes: 0,
      total_pages: 0,
      genres_read: '[]',
      unique_authors_count: 0,
      fiction_count: 0,
      nonfiction_count: 0,
      poetry_count: 0,
      days_read_this_week: 0,
      days_read_this_term: 0,
      days_read_this_month: 0,
      weeks_with_4plus_days: 0,
      weeks_with_reading: 0,
      updated_at: null,
    };
    expect(rowToReadingStats(row).genresRead).toEqual([]);
  });
});
