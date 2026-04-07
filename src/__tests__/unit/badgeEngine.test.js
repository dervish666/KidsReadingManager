import { describe, it, expect, vi } from 'vitest';
import {
  classifyGenre,
  GENRE_CLASSIFICATION,
  recalculateStats,
} from '../../utils/badgeEngine.js';

describe('classifyGenre', () => {
  it('classifies Adventure as fiction', () => {
    expect(classifyGenre('Adventure')).toBe('fiction');
  });
  it('classifies Non-Fiction as nonfiction', () => {
    expect(classifyGenre('Non-Fiction')).toBe('nonfiction');
  });
  it('classifies Biography as nonfiction', () => {
    expect(classifyGenre('Biography')).toBe('nonfiction');
  });
  it('classifies Poetry as poetry', () => {
    expect(classifyGenre('Poetry')).toBe('poetry');
  });
  it('defaults unknown genres to fiction', () => {
    expect(classifyGenre('Custom School Genre')).toBe('fiction');
  });
});

describe('recalculateStats', () => {
  const mockDb = (sessions, books = [], genres = []) => {
    const results = { results: sessions };
    const bookResults = { results: books };
    const genreResults = { results: genres };
    let callIndex = 0;
    return {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          all: vi.fn(() => {
            callIndex++;
            if (callIndex === 1) return results; // sessions query
            if (callIndex === 2) return bookResults; // books query
            if (callIndex === 3) return genreResults; // genres query
            return { results: [] };
          }),
          run: vi.fn(),
        })),
      })),
      batch: vi.fn((stmts) => stmts.map(() => ({ success: true }))),
    };
  };

  it('returns zero stats for a student with no sessions', async () => {
    const db = mockDb([], [], []);
    const stats = await recalculateStats(db, 'stu-1', 'org-1');
    expect(stats.totalBooks).toBe(0);
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalMinutes).toBe(0);
  });

  it('counts distinct books correctly', async () => {
    const sessions = [
      { session_date: '2026-04-01', book_id: 'b1', duration_minutes: 15, pages_read: 10, notes: '' },
      { session_date: '2026-04-02', book_id: 'b1', duration_minutes: 20, pages_read: 15, notes: '' },
      { session_date: '2026-04-03', book_id: 'b2', duration_minutes: 10, pages_read: 5, notes: '' },
    ];
    const db = mockDb(sessions, [], []);
    const stats = await recalculateStats(db, 'stu-1', 'org-1');
    expect(stats.totalBooks).toBe(2);
    expect(stats.totalSessions).toBe(3);
    expect(stats.totalMinutes).toBe(45);
    expect(stats.totalPages).toBe(30);
  });

  it('excludes marker sessions from day counts', async () => {
    const sessions = [
      { session_date: '2026-04-01', book_id: 'b1', duration_minutes: 15, pages_read: 10, notes: '' },
      { session_date: '2026-04-02', book_id: null, duration_minutes: null, pages_read: null, notes: '[ABSENT]' },
    ];
    const db = mockDb(sessions, [], []);
    const stats = await recalculateStats(db, 'stu-1', 'org-1');
    // ABSENT session should not count as a reading day or a book
    expect(stats.totalBooks).toBe(1);
    expect(stats.totalSessions).toBe(2); // all sessions counted
  });
});
