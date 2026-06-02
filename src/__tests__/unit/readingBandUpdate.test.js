import { describe, it, expect } from 'vitest';
import { updateStudentBand } from '../../routes/students/_shared.js';

// Minimal D1 mock: prepare().bind().{first,all,run}
function makeDb({ currentBand = 0, sessionNotes = [] }) {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('SELECT current_band')) return { current_band: currentBand };
              return null;
            },
            async all() {
              if (sql.includes('FROM reading_sessions')) {
                return { results: sessionNotes.map((notes) => ({ notes })) };
              }
              return { results: [] };
            },
            async run() {
              calls.push({ sql, args });
              return { success: true };
            },
          };
        },
      };
    },
  };
  return { db, calls };
}

const env = {};

describe('updateStudentBand', () => {
  it('computes band from in-year reads and returns bandUp on a climb', async () => {
    const { db, calls } = makeDb({ currentBand: 0, sessionNotes: Array(20).fill('read') });
    const result = await updateStudentBand(db, 'stu1', 'org1', env, { timezone: 'UTC' });
    expect(result.currentBand).toBe(1);
    expect(result.readsCount).toBe(20);
    expect(result.bandUp).not.toBeNull();
    expect(result.bandUp.to.name).toBe('Pink');
    expect(calls.some((c) => c.sql.includes('UPDATE students SET band_reads_count'))).toBe(true);
  });

  it('returns no bandUp when the band does not increase', async () => {
    const { db } = makeDb({ currentBand: 1, sessionNotes: Array(25).fill('read') });
    const result = await updateStudentBand(db, 'stu1', 'org1', env, { timezone: 'UTC' });
    expect(result.currentBand).toBe(1);
    expect(result.bandUp).toBeNull();
  });

  it('counts [COUNT:n] multiples and ignores absences', async () => {
    const { db } = makeDb({
      currentBand: 0,
      sessionNotes: ['read', '[COUNT:5]', '[ABSENT]', '[NO_RECORD]'],
    });
    const result = await updateStudentBand(db, 'stu1', 'org1', env, { timezone: 'UTC' });
    expect(result.readsCount).toBe(6);
  });
});
