import { describe, it, expect } from 'vitest';
import { buildMultiDaySessions } from '../../components/sessions/homeReadingUtils.js';

/**
 * buildMultiDaySessions — the pure decision logic behind the register's
 * multi-day catch-up entry, sent to POST /sessions/bulk in one request.
 * The rules mirror the original per-day POST loop exactly (see JSDoc).
 */
describe('buildMultiDaySessions', () => {
  it('builds one session for a single day', () => {
    const sessions = buildMultiDaySessions('2026-06-04', 1, [], 'book-1');
    expect(sessions).toEqual([
      { date: '2026-06-04', assessment: null, notes: '', bookId: 'book-1', location: 'home' },
    ]);
  });

  it('builds consecutive backward days, [BACKFILL]-tagged except the anchor', () => {
    const sessions = buildMultiDaySessions('2026-06-04', 3, [], null);
    expect(sessions.map((s) => s.date)).toEqual(['2026-06-04', '2026-06-03', '2026-06-02']);
    expect(sessions.map((s) => s.notes)).toEqual(['', '[BACKFILL]', '[BACKFILL]']);
  });

  it('skips a previous day that already has a genuine reading record', () => {
    const existing = [{ date: '2026-06-03', location: 'school', notes: '' }];
    const sessions = buildMultiDaySessions('2026-06-04', 3, existing, null);
    expect(sessions.map((s) => s.date)).toEqual(['2026-06-04', '2026-06-02']);
  });

  it('does NOT skip a previous day holding only a stale [BACKFILL] session', () => {
    // Backfills are deleted by the caller before recreating, so they must
    // not block the day from being re-recorded.
    const existing = [{ date: '2026-06-03', location: 'home', notes: '[BACKFILL]' }];
    const sessions = buildMultiDaySessions('2026-06-04', 2, existing, null);
    expect(sessions.map((s) => s.date)).toEqual(['2026-06-04', '2026-06-03']);
  });

  it('keeps a marker day visible: backfill on the day PLUS a session on the anchor', () => {
    const existing = [{ date: '2026-06-03', location: 'home', notes: '[ABSENT] Student was absent' }];
    const sessions = buildMultiDaySessions('2026-06-04', 2, existing, 'book-1');
    expect(sessions).toEqual([
      { date: '2026-06-04', assessment: null, notes: '', bookId: 'book-1', location: 'home' },
      {
        date: '2026-06-03',
        assessment: null,
        notes: '[BACKFILL]',
        bookId: 'book-1',
        location: 'home',
      },
      { date: '2026-06-04', assessment: null, notes: '', bookId: 'book-1', location: 'home' },
    ]);
  });

  it('never skips the anchor date itself even when it already has sessions', () => {
    // Anchor-day home sessions are deleted by the caller before recreating
    const existing = [{ date: '2026-06-04', location: 'home', notes: '' }];
    const sessions = buildMultiDaySessions('2026-06-04', 1, existing, null);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].date).toBe('2026-06-04');
  });

  it('crosses month boundaries correctly', () => {
    const sessions = buildMultiDaySessions('2026-06-01', 2, [], null);
    expect(sessions.map((s) => s.date)).toEqual(['2026-06-01', '2026-05-31']);
  });
});
