/**
 * Starting-reads prompt — decides whether the Students page should offer the
 * "Starting Reads" roster (BaselineReadsDialog).
 *
 * The roster exists for a school (or a class) that has been keeping reading
 * records somewhere else and is switching to Tally partway through the year.
 * Once most children in view have a read logged for this academic year the
 * button is noise, so it hides itself. A seeded starting total counts as a
 * read this year (band_reads_count includes the baseline), so seeding a class
 * is what makes the button go away for that class.
 *
 * Pure: shared by the frontend and tests.
 */
import { academicYearStart } from './readingBandEngine.js';

/** Share of pupils in view with a read this year, below which the button shows. */
export const STARTING_READS_THRESHOLD = 0.5;

/**
 * Has this pupil any read counted for this academic year? Either the band
 * count was stamped for this year (sessions plus any seeded baseline), or a
 * session was logged on/after the year start. The second check matters when
 * the stored band is stale: the students list does not recompute bands, and a
 * restored demo snapshot carries none at all.
 */
export function hasReadThisYear(student, yearStart) {
  if (!student) return false;
  if (student.bandYearStart === yearStart && (Number(student.bandReadsCount) || 0) > 0) {
    return true;
  }
  return typeof student.lastReadDate === 'string' && student.lastReadDate >= yearStart;
}

/**
 * True when the school/class in view has little or no reading logged this
 * academic year: fewer than `threshold` of its active pupils have any read.
 * Empty roster → false (nothing to seed).
 */
export function needsStartingReads(
  students,
  { today = new Date(), threshold = STARTING_READS_THRESHOLD } = {}
) {
  const active = (students || []).filter((s) => s && s.isActive !== false);
  if (active.length === 0) return false;
  const yearStart = academicYearStart(today);
  const withReads = active.filter((s) => hasReadThisYear(s, yearStart)).length;
  return withReads / active.length < threshold;
}
