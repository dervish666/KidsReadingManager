import { describe, it, expect } from 'vitest';
import {
  updateStudentBand,
  setStudentBaselineReads,
  getOrgBandSettings,
} from '../../routes/students/_shared.js';
import { academicYearStart } from '../../utils/readingBandEngine.js';
import { getDateString } from '../../utils/streakCalculator.js';

const currentYearStart = academicYearStart(getDateString(new Date(), 'UTC'));

// Minimal D1 mock: prepare().bind().{first,all,run}
function makeDb({ currentBand = 0, sessionNotes = [], baselineReads, baselineYearStart }) {
  const calls = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('SELECT current_band'))
                return {
                  current_band: currentBand,
                  baseline_reads: baselineReads,
                  baseline_year_start: baselineYearStart,
                };
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
    async batch() {
      return [{ results: [] }, { results: [] }];
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

  it('adds an in-year baseline to the session reads', async () => {
    const { db } = makeDb({
      currentBand: 0,
      sessionNotes: Array(5).fill('read'),
      baselineReads: 10,
      baselineYearStart: currentYearStart,
    });
    const result = await updateStudentBand(db, 'stu1', 'org1', env, { timezone: 'UTC' });
    expect(result.readsCount).toBe(15);
  });

  it('drops and clears a baseline from a previous academic year', async () => {
    const { db, calls } = makeDb({
      currentBand: 0,
      sessionNotes: Array(5).fill('read'),
      baselineReads: 10,
      baselineYearStart: '2000-09-01',
    });
    const result = await updateStudentBand(db, 'stu1', 'org1', env, { timezone: 'UTC' });
    expect(result.readsCount).toBe(5); // stale baseline ignored
    // The persisted UPDATE zeroes the stale baseline and nulls its year stamp.
    const update = calls.find((c) => c.sql.includes('UPDATE students SET band_reads_count'));
    expect(update.args).toContain(0); // baseline_reads reset
    expect(update.args).toContain(null); // baseline_year_start cleared
  });
});

describe('setStudentBaselineReads', () => {
  it('stamps the baseline and recomputes the band to include it', async () => {
    const { db, calls } = makeDb({
      currentBand: 0,
      sessionNotes: Array(3).fill('read'),
      baselineReads: 40,
      baselineYearStart: currentYearStart,
    });
    const result = await setStudentBaselineReads(db, 'stu1', 'org1', env, 40, { timezone: 'UTC' });
    expect(result.readsCount).toBe(43); // 3 sessions + 40 baseline
    expect(result.currentBand).toBe(2); // 43 / 20 = 2 (Red)
    expect(calls.some((c) => c.sql.includes('UPDATE students SET baseline_reads'))).toBe(true);
  });
});

describe('getOrgBandSettings bands', () => {
  const batchDb = (rows) => ({
    prepare: () => ({ bind: () => ({ first: async () => null }) }),
    batch: async () => rows,
  });

  it('returns the default band ladder when unset', async () => {
    const s = await getOrgBandSettings(
      batchDb([{ results: [] }, { results: [] }, { results: [] }]),
      'org1',
      {}
    );
    expect(s.readsPerBand).toBe(20);
    expect(Array.isArray(s.bands)).toBe(true);
    expect(s.bands).toHaveLength(16);
    expect(s.bands[0]).toEqual({ name: 'Lilac', color: '#C8A2C8' });
  });

  it('returns a custom band list when the `bands` setting is stored', async () => {
    const custom = [
      { name: 'Bronze', color: '#CD7F32' },
      { name: 'Silver', color: '#C0C0C0' },
      { name: 'Gold', color: '#FFD700' },
    ];
    const s = await getOrgBandSettings(
      batchDb([
        { results: [] },
        { results: [{ setting_value: JSON.stringify(custom) }] },
        { results: [] },
      ]),
      'org1',
      {}
    );
    expect(s.bands).toEqual(custom);
  });

  it('falls back to legacy colour-only `bandColors`, zipping ladder names', async () => {
    const colours = ['#111111', '#222222', '#333333'];
    const s = await getOrgBandSettings(
      batchDb([
        { results: [] },
        { results: [] },
        { results: [{ setting_value: JSON.stringify(colours) }] },
      ]),
      'org1',
      {}
    );
    expect(s.bands).toEqual([
      { name: 'Lilac', color: '#111111' },
      { name: 'Pink', color: '#222222' },
      { name: 'Red', color: '#333333' },
    ]);
  });
});
