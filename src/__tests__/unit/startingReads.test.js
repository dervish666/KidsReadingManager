import { describe, it, expect } from 'vitest';
import { needsStartingReads, hasReadThisYear } from '../../utils/startingReads.js';
import { academicYearStart } from '../../utils/readingBandEngine.js';

const today = '2026-09-11';
const thisYear = academicYearStart(today); // 2026-09-01
const lastYear = academicYearStart('2026-03-01'); // 2025-09-01

const pupil = (over = {}) => ({ id: 'x', isActive: true, bandReadsCount: 0, ...over });

describe('hasReadThisYear', () => {
  it('is true when the band count was stamped for this year', () => {
    expect(hasReadThisYear(pupil({ bandReadsCount: 12, bandYearStart: thisYear }), thisYear)).toBe(
      true
    );
  });
  it("ignores last year's count that the list has not recomputed yet", () => {
    expect(hasReadThisYear(pupil({ bandReadsCount: 40, bandYearStart: lastYear }), thisYear)).toBe(
      false
    );
  });
  it('treats a missing stamp with no recent session as no reads', () => {
    expect(hasReadThisYear(pupil({ bandReadsCount: 40 }), thisYear)).toBe(false);
    expect(hasReadThisYear(null, thisYear)).toBe(false);
  });
  it('falls back to the last-read date when the band was never stamped (demo snapshot)', () => {
    expect(hasReadThisYear(pupil({ lastReadDate: '2026-09-09' }), thisYear)).toBe(true);
    expect(hasReadThisYear(pupil({ lastReadDate: '2026-07-16' }), thisYear)).toBe(false);
    expect(hasReadThisYear(pupil({ lastReadDate: null }), thisYear)).toBe(false);
  });
});

describe('needsStartingReads', () => {
  it('is false for an empty roster', () => {
    expect(needsStartingReads([], { today })).toBe(false);
  });

  it('is true for a school that has logged nothing this year', () => {
    const students = [pupil(), pupil(), pupil()];
    expect(needsStartingReads(students, { today })).toBe(true);
  });

  it('is true when most reads on file belong to last year', () => {
    const students = [
      pupil({ bandReadsCount: 30, bandYearStart: lastYear }),
      pupil({ bandReadsCount: 25, bandYearStart: lastYear }),
      pupil({ bandReadsCount: 1, bandYearStart: thisYear }),
    ];
    expect(needsStartingReads(students, { today })).toBe(true);
  });

  it('is false once at least half the pupils have a read this year', () => {
    const students = [
      pupil({ bandReadsCount: 1, bandYearStart: thisYear }),
      pupil({ bandReadsCount: 3, bandYearStart: thisYear }),
      pupil(),
      pupil(),
    ];
    expect(needsStartingReads(students, { today })).toBe(false);
  });

  it('counts a seeded starting total as a read, so seeding hides the button', () => {
    // Bulk baseline save stamps band_year_start and folds the baseline into
    // band_reads_count, so a seeded class looks like a class that has read.
    const students = [
      pupil({ bandReadsCount: 40, bandYearStart: thisYear, baselineReads: 40 }),
      pupil({ bandReadsCount: 22, bandYearStart: thisYear, baselineReads: 22 }),
      pupil(),
    ];
    expect(needsStartingReads(students, { today })).toBe(false);
  });

  it('ignores inactive pupils', () => {
    const students = [
      pupil({ bandReadsCount: 5, bandYearStart: thisYear }),
      pupil({ isActive: false }),
      pupil({ isActive: false }),
    ];
    expect(needsStartingReads(students, { today })).toBe(false);
  });

  it('honours a custom threshold', () => {
    const students = [pupil({ bandReadsCount: 1, bandYearStart: thisYear }), pupil(), pupil()];
    expect(needsStartingReads(students, { today, threshold: 0.25 })).toBe(false);
    expect(needsStartingReads(students, { today, threshold: 0.5 })).toBe(true);
  });
});
